/* eslint-disable react-hooks/refs */
"use no memo";
// Opted out of the React Compiler: gesture callbacks mutate refs every touch frame and a
// `tick` counter drives redraws, which is intentionally imperative for drawing performance.

import { Canvas, PaintStyle, Picture, Skia, createPicture, type SkCanvas } from '@shopify/react-native-skia';
import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useRef, useState } from 'react';
import { PixelRatio, Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector, type GestureTouchEvent } from 'react-native-gesture-handler';

import { Icon } from '@/components/ui';
import { colors } from '@/lib/theme';

import { compactPoints, randomSeed, uid, type BrushId, type Doc, type PlacedItem, type Stroke } from './model';
import { twoFingerPose, type Pt } from './itemGesture';
import { photoHalfSize } from './layers';
import { drawDoc, hitTest, measureText, renderItemsLayer, type RenderEnv } from './render';
import type { DrawingDocApi } from './useDrawingDoc';
import {
  IDENTITY,
  MAX_ZOOM,
  applyTwoFinger,
  clampView,
  flingStep,
  isZoomed,
  panBy,
  screenToDoc,
  startTwoFinger,
  visibleFraction,
  zoomAround,
  type Fling,
  type TwoFinger,
  type ViewT,
} from './viewport';

export type Tool = {
  brush: BrushId;
  color: string;
  size: number;
};

type Props = {
  api: DrawingDocApi;
  env: RenderEnv;
  tool: Tool;
  width: number;
  selectedId: string | null;
  /** Tapping a picture/text selects it; tapping it again or anywhere else lets go (null). */
  onSelect: (id: string | null) => void;
};

/** `frozen`: a two-finger gesture took over, so the one-finger drag stops moving it. */
type Drag = { id: string; start: PlacedItem; cur: PlacedItem; active: number; frozen?: boolean };
/** Two fingers on a picture or text: which item, its pose then, and where those fingers started. */
type ItemTwist = { start: PlacedItem; ids: [number, number]; a0: Pt; b0: Pt };
type Session = { t: TwoFinger; active: number; lastFocal: { x: number; y: number } };
/** One-finger panning that can re-anchor after a two-finger gesture hands back control. */
type OnePan = { start: ViewT; baseX: number; baseY: number; rebase: boolean };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const MIN_FLING = 150; // px/s
/** Gesture callbacks run on touch, not during render; kept out here so the compiler sees that. */
const clock = () => Date.now();

export function DrawingCanvas({ api, env, tool, width: w, selectedId, onSelect }: Props) {
  const { doc } = api;
  const h = w / doc.aspect;
  const pixelRatio = PixelRatio.get();

  const live = useRef<Stroke | null>(null);
  const drag = useRef<Drag | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const redraw = () => setTick((t) => t + 1);

  // ---- viewport ---------------------------------------------------------------
  // Live viewport (mutated during gestures/fling) + committed copy (drives cache resolution & UI).
  const viewRef = useRef<ViewT>(IDENTITY);
  const [view, setView] = useState<ViewT>(IDENTITY);
  const [handPan, setHandPan] = useState(false);
  const [sizeKey, setSizeKey] = useState(`${w}x${h}`);
  if (sizeKey !== `${w}x${h}`) {
    // Canvas shape changed (aspect/board): start un-zoomed.
    setSizeKey(`${w}x${h}`);
    viewRef.current = IDENTITY;
    setView(IDENTITY);
  }
  const zoomed = isZoomed(view);
  const panning = handPan && zoomed;

  const commitView = (v: ViewT) => {
    viewRef.current = clampView(v, w, h);
    setView(viewRef.current);
  };

  const flingRaf = useRef<number | null>(null);
  const cancelFling = () => {
    if (flingRaf.current === null) return;
    cancelAnimationFrame(flingRaf.current);
    flingRaf.current = null;
    setView(viewRef.current);
  };
  const startFling = (f: Fling) => {
    cancelFling();
    if (Math.hypot(f.vx, f.vy) < MIN_FLING || !isZoomed(viewRef.current)) {
      commitView(viewRef.current);
      return;
    }
    let fl = f;
    let last: number | null = null;
    const step = (now: number) => {
      const dt = last === null ? 1 / 60 : Math.min(0.05, (now - last) / 1000);
      last = now;
      const r = flingStep(viewRef.current, fl, dt, w, h);
      viewRef.current = r.view;
      fl = r.fling;
      redraw();
      if (r.done) {
        flingRaf.current = null;
        commitView(viewRef.current);
      } else flingRaf.current = requestAnimationFrame(step);
    };
    flingRaf.current = requestAnimationFrame(step);
  };
  useEffect(() => () => cancelFling(), []);

  // Two-finger session shared by pinch (scale) and two-finger pan (translation).
  const session = useRef<Session | null>(null);
  const sessionVelocity = useRef<Fling>({ vx: 0, vy: 0 });
  const onePan = useRef<OnePan | null>(null);

  const beginSession = (fx: number, fy: number) => {
    cancelFling();
    if (!session.current) {
      session.current = { t: startTwoFinger(viewRef.current, fx, fy), active: 0, lastFocal: { x: fx, y: fy } };
      sessionVelocity.current = { vx: 0, vy: 0 };
    }
    session.current.active++;
    if (onePan.current) onePan.current.rebase = true;
    return session.current;
  };
  const applySession = () => {
    if (!session.current) return;
    viewRef.current = applyTwoFinger(session.current.t, w, h);
    redraw();
  };
  const endSession = () => {
    const s = session.current;
    if (!s) return;
    s.active--;
    if (s.active > 0) return;
    session.current = null;
    if (onePan.current) onePan.current.rebase = true;
    startFling(sessionVelocity.current);
  };

  // Gesture objects are rebuilt on every render (each frame), so per-gesture state lives in refs.
  const pinchState = useRef({ started: false });
  const twist = useRef<ItemTwist | null>(null);
  const pan2State = useRef({ started: false });

  // True centroid of all fingers, from raw touch points. (Android's pan reports the leading
  // pointer's position, so we don't trust it for anchoring.)
  const touches = useRef(new Map<number, { x: number; y: number }>());
  // Defined before the touch handlers: callbacks passed to gestures by name capture
  // their surroundings where they're declared.
  const centroid = (fallbackX: number, fallbackY: number) => {
    const pts = [...touches.current.values()];
    if (pts.length < 2) return { x: fallbackX, y: fallbackY };
    return { x: pts.reduce((a, p) => a + p.x, 0) / pts.length, y: pts.reduce((a, p) => a + p.y, 0) / pts.length };
  };
  // Centroid when the second finger landed: anchoring here (rather than when the gesture
  // activates, after the touch slop) keeps the content glued from the first contact.
  const downCentroid = useRef<{ x: number; y: number } | null>(null);
  const trackTouches = (e: GestureTouchEvent) => {
    const had = touches.current.size;
    touches.current = new Map(e.allTouches.map((t) => [t.id, { x: t.x, y: t.y }]));
    if (had < 2 && touches.current.size >= 2 && !session.current) {
      downCentroid.current = centroid(0, 0);
      startTwist();
    }
    if (touches.current.size < 2) {
      downCentroid.current = null;
      endTwist();
    } else updateTwist();
  };
  const releaseTouches = (e: GestureTouchEvent) => {
    for (const t of e.changedTouches) touches.current.delete(t.id);
    if (touches.current.size < 2) {
      downCentroid.current = null;
      endTwist();
    }
  };

  // ---- two fingers while a picture/text is selected: it follows them (resize, rotate, move) ----
  // With nothing selected, two fingers zoom and pan the board instead.
  function startTwist() {
    const [[ia, a], [ib, b]] = [...touches.current.entries()];
    const id = drag.current?.id ?? selectedId;
    if (!id) return;
    cancelStroke();
    if (!beginDrag(id)) return;
    const d = drag.current!;
    d.frozen = true;
    twist.current = { start: { ...d.cur }, ids: [ia, ib], a0: a, b0: b };
  }
  function updateTwist() {
    const g = twist.current;
    const d = drag.current;
    const a = g && touches.current.get(g.ids[0]);
    const b = g && touches.current.get(g.ids[1]);
    if (!g || !d || !a || !b) return;
    const pose = twoFingerPose(g.start, g.a0, g.b0, a, b, viewRef.current.s * w, {
      maxX: 1,
      maxY: h / w,
      minSize: 0.02,
      maxSize: d.cur.t === 'photo' ? 1.5 : 1.2,
    });
    Object.assign(d.cur, pose);
    redraw();
  }
  function endTwist() {
    if (!twist.current) return;
    twist.current = null;
    endDrag();
  }
  /**
   * Point the session's translation at the current finger centroid. Once a finger lifts
   * (people rarely release both at once) the transform freezes instead of jumping.
   */
  const followCentroid = (s: Session, fx: number, fy: number) => {
    if (touches.current.size < 2) return;
    const c = centroid(fx, fy);
    s.t.dx = c.x - s.t.focal0.x;
    s.t.dy = c.y - s.t.focal0.y;
    s.lastFocal = c;
  };

  /** Pinch that zooms the board (unless two fingers have hold of an item). */
  const viewPinch = () => {
    const st = pinchState.current;
    return Gesture.Pinch()
      .runOnJS(true)
      .onStart((e) => {
        cancelStroke();
        if (twist.current) return;
        st.started = true;
        const c = downCentroid.current ?? centroid(e.focalX, e.focalY);
        beginSession(c.x, c.y);
      })
      .onUpdate((e) => {
        const s = session.current;
        if (!st.started || !s) return;
        s.t.scale = e.scale;
        followCentroid(s, e.focalX, e.focalY);
        applySession();
      })
      .onFinalize(() => {
        if (st.started) {
          st.started = false;
          endSession();
        }
      });
  };

  /** Two-finger drag pans (pinch alone won't activate without a scale change). */
  const viewPan2 = () => {
    const st = pan2State.current;
    return Gesture.Pan()
      .runOnJS(true)
      .minPointers(2)
      .averageTouches(true)
      .onTouchesDown(trackTouches)
      .onTouchesMove(trackTouches)
      .onTouchesUp(releaseTouches)
      .onTouchesCancelled(releaseTouches)
      .onStart((e) => {
        cancelStroke();
        if (drag.current || twist.current) return; // fingers are on an item
        const c = downCentroid.current ?? centroid(e.x, e.y);
        beginSession(c.x, c.y); // joins a pinch's session if one is already running
        st.started = true;
      })
      .onUpdate((e) => {
        const s = session.current;
        if (!st.started || !s) return;
        followCentroid(s, e.x, e.y);
        applySession();
      })
      .onEnd((e) => {
        if (st.started) sessionVelocity.current = { vx: e.velocityX, vy: e.velocityY };
      })
      .onFinalize(() => {
        if (!st.started) return;
        st.started = false;
        endSession();
      });
  };

  const onePanStart = () => {
    cancelFling();
    onePan.current = { start: viewRef.current, baseX: 0, baseY: 0, rebase: false };
  };
  const onePanUpdate = (tx: number, ty: number, pointers: number) => {
    const p = onePan.current;
    if (!p || session.current || pointers !== 1) return;
    if (p.rebase) {
      // A two-finger gesture just ended: continue from the current view without jumping.
      p.start = viewRef.current;
      p.baseX = tx;
      p.baseY = ty;
      p.rebase = false;
    }
    viewRef.current = panBy(p.start, tx - p.baseX, ty - p.baseY, w, h);
    redraw();
  };
  const onePanEnd = (vx: number, vy: number) => {
    if (!onePan.current) return;
    onePan.current = null;
    if (!session.current) startFling({ vx, vy });
  };

  const zoomBy = (factor: number) => {
    cancelFling();
    commitView(zoomAround(viewRef.current, factor, w / 2, h / 2, w, h));
    Haptics.selectionAsync().catch(() => {});
  };

  // ---- cached items layer & picture -------------------------------------------
  // Committed items are rasterized once per change (at the current zoom, capped for memory),
  // so each touch frame only draws the cached layer + the stroke in progress.
  const cacheScale = Math.min(pixelRatio * view.s, 4096 / Math.max(w, h));
  const itemsImage = useMemo(
    () => renderItemsLayer(doc, w, cacheScale, env, draggingId ? new Set([draggingId]) : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [doc.items, doc.board, doc.style, doc.aspect, w, cacheScale, env.typeface, env.images, draggingId],
  );

  const picture = useMemo(
    () =>
      createPicture(
        (c) => {
          const v = viewRef.current;
          c.save();
          c.translate(v.tx, v.ty);
          c.scale(v.s, v.s);
          drawDoc(c, doc, w, env, { itemsImage, live: drag.current?.cur ?? live.current });
          const sel = drag.current?.cur ?? doc.items.find((i) => i.id === selectedId);
          if (sel && sel.t !== 'stroke') drawSelection(c, sel, w, env, v.s);
          // Erasing: show how big the eraser is, under the finger.
          const l = live.current;
          if (l?.brush === 'eraser' && l.pts.length >= 2) drawReticle(c, l.pts[l.pts.length - 2] * w, l.pts[l.pts.length - 1] * w, (l.size * w) / 2, v.s);
          c.restore();
          if (isZoomed(v)) drawScrollIndicators(c, v, w, h);
        },
        { width: w, height: h },
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [itemsImage, tick, doc, env, w, h, selectedId, view],
  );

  /** Screen point (inside the canvas view) → normalized doc coordinates. */
  const toDoc = (x: number, y: number) => {
    const p = screenToDoc(viewRef.current, x, y);
    return [clamp(p.x, 0, w) / w, clamp(p.y, 0, h) / w] as const;
  };

  // ---- one finger -------------------------------------------------------------
  // Draws, except: on the selected item it drags that item, and a quick tap selects a
  // picture/text (or lets go of the selected one) instead of leaving a dot.
  function cancelStroke() {
    if (live.current) {
      live.current = null;
      redraw();
    }
  }

  /** The current one-finger press: where/when it started, and whether it's a tap so far. */
  const press = useRef<{ x: number; y: number; at: number; moved: boolean; multi: boolean; onItem: boolean } | null>(null);
  const TAP_SLOP = 10; // px
  const TAP_MS = 350;

  const drawPan = Gesture.Pan()
    .runOnJS(true)
    .minDistance(0)
    .onTouchesDown((e) => {
      cancelFling();
      if (e.numberOfTouches > 1) {
        cancelStroke();
        if (press.current) press.current.multi = true;
      }
    })
    .onBegin((e) => {
      if (session.current) return;
      const [x, y] = toDoc(e.x, e.y);
      const onItem = !!selectedId && hitTest(doc, x, y, w, env.typeface) === selectedId && beginDrag(selectedId);
      press.current = { x: e.x, y: e.y, at: clock(), moved: false, multi: false, onItem };
      if (onItem) return;
      live.current = {
        t: 'stroke',
        id: uid(),
        brush: tool.brush,
        color: tool.color,
        size: tool.brush === 'eraser' ? tool.size * 1.8 : tool.size,
        pts: [x, y],
        seed: randomSeed(),
      };
      redraw();
    })
    .onUpdate((e) => {
      const p = press.current;
      if (p && !p.moved && Math.hypot(e.x - p.x, e.y - p.y) > TAP_SLOP) p.moved = true;
      if (p?.onItem) {
        const d = drag.current;
        if (!d || d.frozen || session.current) return; // two fingers took over: don't jump back
        const sc = viewRef.current.s;
        d.cur.x = clamp(d.start.x + e.translationX / sc / w, 0, 1);
        d.cur.y = clamp(d.start.y + e.translationY / sc / w, 0, h / w);
        redraw();
        return;
      }
      if (!live.current || e.numberOfPointers > 1) return;
      const [x, y] = toDoc(e.x, e.y);
      live.current.pts.push(x, y);
      redraw();
    })
    .onFinalize(() => {
      const p = press.current;
      const s = live.current;
      press.current = null;
      live.current = null;
      const tap = !!p && !p.moved && !p.multi && clock() - p.at < TAP_MS;
      if (p?.onItem) {
        endDrag();
        if (tap) onSelect(null); // tapped the selected item again: done with it
      } else if (tap && p) {
        const [x, y] = toDoc(p.x, p.y);
        const hit = hitTest(doc, x, y, w, env.typeface);
        if (hit) {
          onSelect(hit);
          Haptics.selectionAsync().catch(() => {});
        } else if (selectedId) onSelect(null); // tapped away: done, and no stray dot
        else if (s) api.add({ ...s, pts: compactPoints(s.pts) });
      } else if (s) api.add({ ...s, pts: compactPoints(s.pts) });
      redraw();
    });

  // Hand tool: one finger pans instead of drawing.
  const handGesture = Gesture.Pan()
    .runOnJS(true)
    .onTouchesDown(() => cancelFling())
    .onStart(onePanStart)
    .onUpdate((e) => onePanUpdate(e.translationX, e.translationY, e.numberOfPointers))
    .onEnd((e) => onePanEnd(e.velocityX, e.velocityY))
    .onFinalize(() => {
      onePan.current = null;
    });

  // ---- dragging a selected item (one finger on it, or two fingers anywhere) ----
  function beginDrag(id: string | null) {
    if (!id) return false;
    if (drag.current) {
      drag.current.active++;
      return true;
    }
    const item = doc.items.find((i) => i.id === id);
    if (!item || item.t === 'stroke') return false;
    drag.current = { id, start: item, cur: { ...item }, active: 1 };
    setDraggingId(id);
    return true;
  }

  function endDrag() {
    const d = drag.current;
    if (!d) return;
    d.active--;
    if (d.active > 0) return;
    drag.current = null;
    const { x, y, size, rot } = d.cur;
    if (x !== d.start.x || y !== d.start.y || size !== d.start.size || rot !== d.start.rot) {
      api.update(d.id, { x, y, size, rot });
    }
    setDraggingId(null);
    redraw();
  }

  const gesture = Gesture.Simultaneous(panning ? handGesture : drawPan, viewPinch(), viewPan2());

  const zoomPct = Math.round(view.s * 100);

  return (
    <View style={{ width: w, height: h }}>
      <GestureDetector gesture={gesture}>
        <View style={{ width: w, height: h, borderRadius: 14, overflow: 'hidden' }} collapsable={false}>
          <Canvas style={{ width: w, height: h }}>
            <Picture picture={picture} />
          </Canvas>
        </View>
      </GestureDetector>
      {/* Zoom controls only while zoomed in; pinch is how you get there. */}
      {zoomed ? (
        <View style={styles.zoom} pointerEvents="box-none">
          <Pressable
            onPress={() => setHandPan((p) => !p)}
            style={[styles.zoomBtn, panning && styles.handActive]}
            accessibilityLabel={panning ? 'Stop panning, draw again' : 'Pan with one finger'}
            accessibilityState={{ selected: panning }}
          >
            <Icon name="pan_tool" size={16} color={panning ? colors.onAccent : '#FFFFFF'} />
          </Pressable>
          <Pressable onPress={() => zoomBy(1 / 1.5)} style={styles.zoomBtn} accessibilityLabel="Zoom out">
            <Icon name="remove" size={18} color="#FFFFFF" />
          </Pressable>
          <Pressable
            onPress={() => {
              cancelFling();
              commitView(IDENTITY);
            }}
            style={styles.zoomPct}
            accessibilityLabel="Reset zoom"
          >
            <Text style={styles.zoomPctText}>{zoomPct}%</Text>
          </Pressable>
          <Pressable onPress={() => zoomBy(1.5)} disabled={view.s >= MAX_ZOOM} style={styles.zoomBtn} accessibilityLabel="Zoom in">
            <View collapsable={false} style={{ opacity: view.s >= MAX_ZOOM ? 0.35 : 1 }}>
              <Icon name="add" size={18} color="#FFFFFF" />
            </View>
          </Pressable>
        </View>
      ) : null}
      {panning ? (
        <View style={styles.panBadge} pointerEvents="none">
          <Text style={styles.panBadgeText}>Panning · tap the hand to draw again</Text>
        </View>
      ) : null}
    </View>
  );
}

/** Thin scrollbars showing which part of the board is on screen. */
function drawScrollIndicators(c: SkCanvas, v: ViewT, w: number, h: number) {
  const f = visibleFraction(v, w, h);
  const p = Skia.Paint();
  p.setAntiAlias(true);
  p.setColor(Skia.Color('#FFFFFF99'));
  const t = 4;
  const m = 6;
  const trackW = w - m * 2 - t;
  const trackH = h - m * 2 - t;
  c.drawRRect(Skia.RRectXY(Skia.XYWHRect(m + f.x * trackW, h - m - t, Math.max(16, f.w * trackW), t), 2, 2), p);
  c.drawRRect(Skia.RRectXY(Skia.XYWHRect(w - m - t, m + f.y * trackH, t, Math.max(16, f.h * trackH)), 2, 2), p);
}

/** Eraser outline: white over dark, so it shows on light and dark boards alike. */
function drawReticle(c: SkCanvas, x: number, y: number, r: number, zoom: number) {
  const p = Skia.Paint();
  p.setAntiAlias(true);
  p.setStyle(PaintStyle.Stroke);
  p.setStrokeWidth(3 / zoom);
  p.setColor(Skia.Color('#00000066'));
  c.drawCircle(x, y, r, p);
  p.setStrokeWidth(1.5 / zoom);
  p.setColor(Skia.Color('#FFFFFFE6'));
  c.drawCircle(x, y, r, p);
}

function drawSelection(c: SkCanvas, item: PlacedItem, w: number, env: RenderEnv, zoom: number) {
  let hw: number;
  let hh: number;
  if (item.t === 'text') {
    const m = measureText(item, w, env.typeface);
    hw = m.width / 2 + 8;
    hh = m.height / 2 + 6;
  } else if (item.t === 'photo') {
    const half = photoHalfSize(item);
    hw = half.hw * w + 6;
    hh = half.hh * w + 6;
  } else {
    hw = hh = (item.size * w) / 2 + 6;
  }
  const p = Skia.Paint();
  p.setAntiAlias(true);
  p.setStyle(PaintStyle.Stroke);
  p.setStrokeWidth(1.5 / zoom);
  p.setColor(Skia.Color('#FFFFFFCC'));
  p.setPathEffect(Skia.PathEffect.MakeDash([6 / zoom, 5 / zoom], 0));
  c.save();
  c.translate(item.x * w, item.y * w);
  c.rotate(item.rot, 0, 0);
  const r = Skia.RRectXY(Skia.XYWHRect(-hw, -hh, hw * 2, hh * 2), 8, 8);
  c.drawRRect(r, p);
  p.setColor(Skia.Color('#00000066'));
  p.setPathEffect(Skia.PathEffect.MakeDash([6 / zoom, 5 / zoom], 6 / zoom));
  c.drawRRect(r, p);
  c.restore();
}

/** Static, non-interactive render of a doc (used for previews and replay). */
export function DocView({ doc, env, width, progress }: { doc: Doc; env: RenderEnv; width: number; progress?: number }) {
  const h = width / doc.aspect;
  const picture = useMemo(
    () => createPicture((c) => drawDoc(c, doc, width, env, { progress }), { width, height: h }),
    [doc, env, width, h, progress],
  );
  return (
    <Canvas style={{ width, height: h, borderRadius: 14 }}>
      <Picture picture={picture} />
    </Canvas>
  );
}

const styles = StyleSheet.create({
  zoom: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#000000AA',
    borderRadius: 16,
    paddingHorizontal: 2,
  },
  zoomBtn: { width: 32, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 14 },
  zoomPct: { paddingHorizontal: 4, height: 30, justifyContent: 'center' },
  zoomPctText: { color: '#FFFFFF', fontSize: 12, fontVariant: ['tabular-nums'] },
  handActive: { backgroundColor: colors.accent },
  panBadge: {
    position: 'absolute',
    bottom: 14,
    alignSelf: 'center',
    backgroundColor: '#000000AA',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  panBadgeText: { color: '#FFFFFF', fontSize: 12 },
});

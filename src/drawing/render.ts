import {
  BlendMode,
  BlurStyle,
  ClipOp,
  FillType,
  ImageFormat,
  PaintStyle,
  PathOp,
  Skia,
  StrokeCap,
  StrokeJoin,
  TileMode,
  matchFont,
  type SkCanvas,
  type SkFont,
  type SkImage,
  type SkPaint,
  type SkPath,
  type SkTypeface,
} from '@shopify/react-native-skia';

import { flattenStroke, jitterLine, passBreaks, splitPasses } from './chalk';
import { photoHalfSize } from './layers';
import {
  FRAMES,
  prng,
  resolveBoard,
  type BoardLook,
  type Doc,
  type FrameId,
  type Item,
  type PhotoItem,
  type StampId,
  type StampItem,
  type Stroke,
  type TextItem,
} from './model';

export type RenderEnv = {
  typeface: SkTypeface | null;
  /** Decoded image for doc.bgImagePath ("draw over"). */
  bgImage?: SkImage | null;
  /** Decoded pictures placed on the board, by PhotoItem.path. Missing ones draw as a placeholder. */
  images?: Record<string, SkImage>;
};

// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function mix(hex: string, toward: string, t: number): string {
  const a = hexToRgb(hex);
  const b = hexToRgb(toward);
  const c = a.map((v, i) => Math.round((v + (b[i] - v) * t) * 255));
  return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
}

function hsl(h: number, s: number, l: number): string {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return '#' + [f(0), f(8), f(4)].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
}

/**
 * Paint shader that fills with `color` but modulates alpha with fractal noise,
 * which is what gives chalk its grainy, broken texture. alpha = k * noise + c.
 */
function grain(paint: SkPaint, color: string, seed: number, freq: number, k: number, c: number) {
  const [r, g, b] = hexToRgb(color);
  paint.setShader(Skia.Shader.MakeFractalNoise(freq, freq, 2, seed % 1000, 0, 0));
  paint.setColorFilter(
    Skia.ColorFilter.MakeMatrix([
      0, 0, 0, 0, r,
      0, 0, 0, 0, g,
      0, 0, 0, 0, b,
      k, 0, 0, 0, c,
    ]),
  );
}

/** Grain frequency that keeps the texture the same size relative to the canvas width. */
const grainFreq = (w: number) => 330 / w;

function strokePaint(width: number): SkPaint {
  const p = Skia.Paint();
  p.setAntiAlias(true);
  p.setStyle(PaintStyle.Stroke);
  p.setStrokeWidth(width);
  p.setStrokeCap(StrokeCap.Round);
  p.setStrokeJoin(StrokeJoin.Round);
  return p;
}

function fillPaint(color: string, alpha = 1): SkPaint {
  const p = Skia.Paint();
  p.setAntiAlias(true);
  p.setColor(Skia.Color(color));
  p.setAlphaf(alpha);
  return p;
}

// ---------------------------------------------------------------------------
// Board
// ---------------------------------------------------------------------------

export function drawBoardBase(c: SkCanvas, look: BoardLook, w: number, h: number) {
  c.drawRect(Skia.XYWHRect(0, 0, w, h), fillPaint(look.base));

  // Soft chalk-dust smudges.
  const rnd = prng(7919);
  const smudge = look.dark ? '#FFFFFF' : '#000000';
  for (let i = 0; i < 6; i++) {
    const cx = rnd() * w;
    const cy = rnd() * h;
    const r = (0.25 + rnd() * 0.35) * w;
    const p = Skia.Paint();
    p.setShader(
      Skia.Shader.MakeRadialGradient(
        { x: cx, y: cy },
        r,
        [Skia.Color(smudge + (look.dark ? '10' : '08')), Skia.Color(smudge + '00')],
        null,
        TileMode.Clamp,
      ),
    );
    c.drawRect(Skia.XYWHRect(0, 0, w, h), p);
  }

  // Fine grain over the whole board.
  const g = Skia.Paint();
  grain(g, smudge, 11, grainFreq(w) * 1.4, look.dark ? 0.35 : 0.25, look.dark ? -0.12 : -0.1);
  c.drawRect(Skia.XYWHRect(0, 0, w, h), g);
}

export function drawBoardFrame(c: SkCanvas, frame: FrameId, w: number, h: number) {
  if (frame === 'none') return;
  const def = FRAMES.find((f) => f.id === frame) ?? FRAMES[0];
  const fw = w * 0.028;
  const base = fillPaint(def.color);
  const bars: [number, number, number, number, boolean][] = [
    [0, 0, w, fw, true],
    [0, h - fw, w, fw, true],
    [0, fw, fw, h - fw * 2, false],
    [w - fw, fw, fw, h - fw * 2, false],
  ];

  bars.forEach(([x, y, pw, ph, horizontal], i) => {
    const r = Skia.XYWHRect(x, y, pw, ph);
    c.drawRect(r, base);
    const f = grainFreq(w);
    const g = Skia.Paint();
    if (frame === 'wood' || frame === 'darkwood') {
      // Wood grain: noise stretched along each bar so the streaks follow the plank.
      g.setShader(Skia.Shader.MakeFractalNoise(horizontal ? f * 0.04 : f * 0.9, horizontal ? f * 0.9 : f * 0.04, 3, i + 1, 0, 0));
      g.setColorFilter(Skia.ColorFilter.MakeMatrix([0, 0, 0, 0, 0.18, 0, 0, 0, 0, 0.1, 0, 0, 0, 0, 0.04, 1.3, 0, 0, 0, -0.35]));
    } else if (frame === 'metal') {
      // Brushed aluminium: fine streaks plus a light sheen across the bar.
      g.setShader(Skia.Shader.MakeFractalNoise(horizontal ? f * 0.02 : f * 2, horizontal ? f * 2 : f * 0.02, 2, i + 1, 0, 0));
      g.setColorFilter(Skia.ColorFilter.MakeMatrix([0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0.6, 0, 0, 0, -0.2]));
      c.drawRect(r, g);
      const sheen = Skia.Paint();
      sheen.setShader(
        Skia.Shader.MakeLinearGradient(
          { x, y },
          horizontal ? { x, y: y + ph } : { x: x + pw, y },
          [Skia.Color('#FFFFFF55'), Skia.Color('#FFFFFF00'), Skia.Color('#00000033')],
          [0, 0.5, 1],
          TileMode.Clamp,
        ),
      );
      c.drawRect(r, sheen);
      return;
    } else {
      // Painted frames: just a faint texture so they don't look like flat plastic.
      grain(g, '#000000', i + 1, f * 1.2, 0.25, -0.08);
    }
    c.drawRect(r, g);
  });

  // Bevel highlight on the outer edge and a soft shadow cast onto the board.
  const edge = strokePaint(Math.max(1, fw * 0.12));
  edge.setColor(Skia.Color('#FFFFFF22'));
  c.drawRect(Skia.XYWHRect(fw * 0.06, fw * 0.06, w - fw * 0.12, h - fw * 0.12), edge);
  const shadow = strokePaint(fw * 0.5);
  shadow.setColor(Skia.Color('#00000040'));
  shadow.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, fw * 0.25, false));
  c.drawRect(Skia.XYWHRect(fw * 1.2, fw * 1.2, w - fw * 2.4, h - fw * 2.4), shadow);
}

// ---------------------------------------------------------------------------
// Strokes
// ---------------------------------------------------------------------------

/** Smooth path through points using midpoint quadratic curves. */
function buildPath(pts: number[], w: number, count: number): SkPath {
  const b = Skia.PathBuilder.Make();
  const n = Math.min(count, pts.length / 2);
  if (n === 0) return b.build();
  const X = (i: number) => pts[i * 2] * w;
  const Y = (i: number) => pts[i * 2 + 1] * w;
  b.moveTo(X(0), Y(0));
  if (n === 1) return b.lineTo(X(0) + 0.01, Y(0)).build();
  for (let i = 1; i < n - 1; i++) {
    b.quadTo(X(i), Y(i), (X(i) + X(i + 1)) / 2, (Y(i) + Y(i + 1)) / 2);
  }
  return b.lineTo(X(n - 1), Y(n - 1)).build();
}

/** Straight segments through flat [x, y, ...] pixel points. */
function polyline(pts: number[]): SkPath {
  const b = Skia.PathBuilder.Make();
  if (pts.length < 2) return b.build();
  b.moveTo(pts[0], pts[1]);
  if (pts.length === 2) return b.lineTo(pts[0] + 0.01, pts[1]).build();
  for (let i = 2; i < pts.length; i += 2) b.lineTo(pts[i], pts[i + 1]);
  return b.build();
}

export function drawStroke(c: SkCanvas, s: Stroke, w: number, darkBoard: boolean, frac = 1) {
  const total = s.pts.length / 2;
  const count = frac >= 1 ? total : Math.max(1, Math.ceil(total * frac));
  const W = s.size * w;

  switch (s.brush) {
    case 'chalk': {
      // Jitter anchored to the start of the stroke, so the line doesn't crawl while it's drawn
      // (see chalk.ts), and each pass back over itself drawn on its own so it builds up like a
      // second stroke would.
      const line = flattenStroke(s.pts, w, count);
      const segA = Math.max(2, W * 0.6);
      const segB = Math.max(1.5, W * 0.35);
      const breaks = passBreaks(line, segA, W * 0.6, W * 1.5);
      const passesA = splitPasses(jitterLine(line, segA, Math.max(0.5, W * 0.16), s.seed), segA, breaks);
      const passesB = splitPasses(jitterLine(line, segB, W * 0.22, s.seed + 1), segB, breaks);
      for (let i = 0; i < Math.max(passesA.length, passesB.length); i++) {
        if (passesA[i]) {
          const a = strokePaint(W);
          grain(a, s.color, s.seed + i * 7, grainFreq(w), darkBoard ? 2.6 : 2.2, darkBoard ? -0.55 : -0.35);
          c.drawPath(polyline(passesA[i]), a);
        }
        if (passesB[i]) {
          const b = strokePaint(W * 0.5);
          grain(b, s.color, s.seed + 1 + i * 7, grainFreq(w) * 1.3, 1.8, -0.4);
          c.drawPath(polyline(passesB[i]), b);
        }
      }
      break;
    }
    case 'pen': {
      const p = strokePaint(W);
      p.setColor(Skia.Color(s.color));
      c.drawPath(buildPath(s.pts, w, count), p);
      break;
    }
    case 'neon': {
      const path = buildPath(s.pts, w, count);
      const glow = strokePaint(W * 1.6);
      glow.setColor(Skia.Color(s.color));
      glow.setAlphaf(0.9);
      glow.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, Math.max(1, W * 0.7), false));
      c.drawPath(path, glow);
      const mid = strokePaint(W * 0.8);
      mid.setColor(Skia.Color(s.color));
      c.drawPath(path, mid);
      const core = strokePaint(W * 0.35);
      core.setColor(Skia.Color(mix(s.color, '#FFFFFF', 0.75)));
      c.drawPath(path, core);
      break;
    }
    case 'highlighter': {
      const p = strokePaint(W);
      p.setStrokeCap(StrokeCap.Butt);
      p.setColor(Skia.Color(s.color));
      p.setAlphaf(0.45);
      c.drawPath(buildPath(s.pts, w, count), p);
      break;
    }
    case 'spray': {
      const rnd = prng(s.seed);
      const dots = Skia.PathBuilder.Make();
      for (let i = 0; i < count; i++) {
        const x = s.pts[i * 2] * w;
        const y = s.pts[i * 2 + 1] * w;
        for (let k = 0; k < 9; k++) {
          const ang = rnd() * Math.PI * 2;
          const r = Math.sqrt(rnd()) * W * 1.1;
          dots.addCircle(x + Math.cos(ang) * r, y + Math.sin(ang) * r, W * (0.06 + rnd() * 0.1));
        }
      }
      c.drawPath(dots.build(), fillPaint(s.color, 0.85));
      break;
    }
    case 'rainbow': {
      const p = strokePaint(W);
      for (let i = 1; i < count; i++) {
        p.setColor(Skia.Color(hsl((s.seed + i * 7) % 360, 0.85, darkBoard ? 0.72 : 0.55)));
        c.drawLine(s.pts[(i - 1) * 2] * w, s.pts[(i - 1) * 2 + 1] * w, s.pts[i * 2] * w, s.pts[i * 2 + 1] * w, p);
      }
      if (count === 1) {
        c.drawCircle(s.pts[0] * w, s.pts[1] * w, W / 2, fillPaint(hsl(s.seed % 360, 0.85, 0.7)));
      }
      break;
    }
    case 'eraser': {
      const p = strokePaint(W);
      p.setBlendMode(BlendMode.Clear);
      c.drawPath(buildPath(s.pts, w, count), p);
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

/**
 * Native Skia rejects Font(undefined), and the hand font loads asynchronously,
 * so fall back to the system font for measuring until it's ready.
 */
export function fontFor(typeface: SkTypeface | null, size: number): SkFont {
  return typeface ? Skia.Font(typeface, size) : matchFont({ fontSize: size });
}

/** Advance width of a string (glyph widths work on native and CanvasKit alike). */
export function textWidth(font: SkFont, text: string): number {
  if (!text) return 0;
  return font.getGlyphWidths(font.getGlyphIDs(text)).reduce((a, b) => a + b, 0);
}

export function measureText(t: TextItem, w: number, typeface: SkTypeface | null) {
  const font = fontFor(typeface, t.size * w);
  const lines = t.text.split('\n');
  const lineH = t.size * w * 1.15;
  const widths = lines.map((l) => textWidth(font, l || ' '));
  return { font, lines, lineH, widths, width: Math.max(...widths), height: lineH * lines.length };
}

export function drawText(c: SkCanvas, t: TextItem, w: number, env: RenderEnv, darkBoard: boolean, frac = 1) {
  // Wait for the hand font rather than flashing text in the system font.
  if (!env.typeface) return;
  const m = measureText(t, w, env.typeface);
  const metrics = m.font.getMetrics();
  const visibleChars = frac >= 1 ? Infinity : Math.ceil(t.text.length * frac);
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  if (darkBoard) grain(paint, t.color, t.seed, grainFreq(w) * 1.2, 1.6, 0.05);
  else paint.setColor(Skia.Color(t.color));

  c.save();
  c.translate(t.x * w, t.y * w);
  c.rotate(t.rot, 0, 0);
  let shown = 0;
  m.lines.forEach((line, i) => {
    const remaining = visibleChars - shown;
    shown += line.length + 1;
    if (remaining <= 0) return;
    const text = remaining >= line.length ? line : line.slice(0, remaining);
    const x = -m.widths[i] / 2;
    const y = -m.height / 2 + i * m.lineH - metrics.ascent + (m.lineH - (metrics.descent - metrics.ascent)) / 2;
    c.drawText(text, x, y, paint, m.font);
  });
  c.restore();
}

// ---------------------------------------------------------------------------
// Stamps (24x24 unit shapes)
// ---------------------------------------------------------------------------

const stampCache = new Map<StampId, SkPath>();

function union(paths: (SkPath | null)[]): SkPath {
  let acc = paths[0] ?? Skia.PathBuilder.Make().build();
  for (const p of paths.slice(1)) {
    if (!p) continue;
    acc = Skia.Path.MakeFromOp(acc, p, PathOp.Union) ?? acc;
  }
  return acc;
}

const circle = (cx: number, cy: number, r: number) => Skia.PathBuilder.Make().addCircle(cx, cy, r).build();
const oval = (x: number, y: number, w: number, h: number) => Skia.PathBuilder.Make().addOval(Skia.XYWHRect(x, y, w, h)).build();
const svg = (d: string) => Skia.Path.MakeFromSVGString(d) ?? Skia.PathBuilder.Make().build();

export function stampPath(id: StampId): SkPath {
  const cached = stampCache.get(id);
  if (cached) return cached;
  let p: SkPath;
  switch (id) {
    case 'heart':
      p = svg('M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z');
      break;
    case 'star':
      p = svg('M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z');
      break;
    case 'sparkle':
      p = svg('M12 2C12.8 8 16 11.2 22 12C16 12.8 12.8 16 12 22C11.2 16 8 12.8 2 12C8 11.2 11.2 8 12 2Z');
      break;
    case 'moon':
      p = Skia.Path.MakeFromOp(circle(11, 12, 9), circle(16, 9, 7.5), PathOp.Difference) ?? circle(12, 12, 9);
      break;
    case 'sun': {
      const rays: SkPath[] = [circle(12, 12, 5)];
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        rays.push(circle(12 + Math.cos(a) * 8.5, 12 + Math.sin(a) * 8.5, 1.6));
      }
      p = union(rays);
      break;
    }
    case 'smile':
      p = Skia.PathBuilder.Make()
        .addCircle(12, 12, 10)
        .addCircle(8.5, 10, 1.5)
        .addCircle(15.5, 10, 1.5)
        .addPath(svg('M7 14.2c1.3 2.4 3 3.4 5 3.4s3.7-1 5-3.4c-1.6.9-3.2 1.3-5 1.3s-3.4-.4-5-1.3z'))
        .setFillType(FillType.EvenOdd)
        .build();
      break;
    case 'flower': {
      const petals: SkPath[] = [];
      for (let i = 0; i < 5; i++) {
        const a = (i * 2 * Math.PI) / 5 - Math.PI / 2;
        petals.push(circle(12 + Math.cos(a) * 5.5, 12 + Math.sin(a) * 5.5, 4.6));
      }
      p = Skia.PathBuilder.Make().addPath(union(petals)).addCircle(12, 12, 2.8).setFillType(FillType.EvenOdd).build();
      break;
    }
    case 'cloud':
      p = union([circle(8, 14, 4.5), circle(13, 10.5, 5.8), circle(18, 14.5, 3.8), oval(4, 13, 17.5, 5.5)]);
      break;
    case 'crown':
      p = svg('M3 19h18v2H3z M3 17L4.6 6.5 9.2 11 12 4l2.8 7 4.6-4.5L21 17z');
      break;
    case 'paw':
      p = union([oval(6.5, 12, 11, 9), oval(3, 7.5, 4, 5), oval(7.5, 3.5, 4, 5.2), oval(12.5, 3.5, 4, 5.2), oval(17, 7.5, 4, 5)]);
      break;
    case 'bolt':
      p = svg('M13 2L4 14h6l-1 8 9-12h-6l1-8z');
      break;
    case 'note':
      p = svg('M9 17.5a3 3 0 1 1-2-2.83V5.5l12-2.5v12a3 3 0 1 1-2-2.83V7.3L9 8.9z');
      break;
  }
  stampCache.set(id, p);
  return p;
}

export function drawStamp(c: SkCanvas, s: StampItem, w: number, darkBoard: boolean, frac = 1) {
  const sc = (s.size * w) / 24;
  const pop = frac >= 1 ? 1 : Math.min(1, frac * 1.2);
  const path = stampPath(s.shape);
  c.save();
  c.translate(s.x * w, s.y * w);
  c.rotate(s.rot, 0, 0);
  c.scale(sc * pop, sc * pop);
  c.translate(-12, -12);

  const fill = Skia.Paint();
  fill.setAntiAlias(true);
  if (darkBoard) grain(fill, s.color, s.seed, grainFreq(w) * sc * 1.2, 1.4, -0.25);
  else {
    fill.setColor(Skia.Color(s.color));
    fill.setAlphaf(0.55);
  }
  c.drawPath(path, fill);

  const outline = strokePaint(1.5);
  if (darkBoard) {
    outline.setPathEffect(Skia.PathEffect.MakeDiscrete(1.8, 0.3, s.seed));
    grain(outline, s.color, s.seed + 3, grainFreq(w) * sc, 2.4, -0.4);
  } else {
    outline.setColor(Skia.Color(s.color));
  }
  c.drawPath(path, outline);
  c.restore();
}

/** The heart stamp path spans x 2–22, y 3–21.35 of its 24-unit box: the square around it. */
const HEART_SQUARE = { x: 2, y: 2.175, side: 20, cx: 12, cy: 12.175 };

/**
 * A placed picture: plain by default, or cut to a shape (rounded / circle / heart; circle and
 * heart crop the middle of the photo), optionally with a thin white edge like a print.
 */
export function drawPhoto(c: SkCanvas, p: PhotoItem, w: number, env: RenderEnv, frac = 1) {
  const { hw, hh } = photoHalfSize(p);
  const W = hw * 2 * w;
  const H = hh * 2 * w;
  const shape = p.shape ?? 'plain';
  const alpha = Math.max(0, Math.min(1, frac));
  const img = env.images?.[p.path];
  c.save();
  c.translate(p.x * w, p.y * w);
  c.rotate(p.rot, 0, 0);

  // The heart is drawn in its path's own 24-unit space, scaled to the picture's size.
  let unit = 1;
  if (shape === 'heart') {
    unit = W / HEART_SQUARE.side;
    c.scale(unit, unit);
    c.translate(-HEART_SQUARE.cx, -HEART_SQUARE.cy);
  }
  const rect = shape === 'heart' ? Skia.XYWHRect(HEART_SQUARE.x, HEART_SQUARE.y, HEART_SQUARE.side, HEART_SQUARE.side) : Skia.XYWHRect(-W / 2, -H / 2, W, H);
  let outline: SkPath;
  if (shape === 'heart') outline = stampPath('heart');
  else {
    outline = Skia.Path.Make();
    if (shape === 'circle') outline.addOval(rect);
    else if (shape === 'rounded') outline.addRRect(Skia.RRectXY(rect, W * 0.06, W * 0.06));
    else outline.addRect(rect);
  }

  const fill = Skia.Paint();
  fill.setAntiAlias(true);
  if (img) {
    // Circle and heart show the middle square of the photo.
    const iw = img.width();
    const ih = img.height();
    const side = Math.min(iw, ih);
    const src = shape === 'circle' || shape === 'heart' ? Skia.XYWHRect((iw - side) / 2, (ih - side) / 2, side, side) : Skia.XYWHRect(0, 0, iw, ih);
    fill.setAlphaf(alpha);
    c.save();
    c.clipPath(outline, ClipOp.Intersect, true);
    c.drawImageRect(img, src, rect, fill);
    c.restore();
  } else {
    fill.setColor(Skia.Color('#FFFFFF'));
    fill.setAlphaf(0.2 * alpha);
    c.drawPath(outline, fill);
  }

  if (p.border) {
    const edge = Skia.Paint();
    edge.setAntiAlias(true);
    edge.setStyle(PaintStyle.Stroke);
    edge.setStrokeWidth(Math.max(1.5, W * 0.012) / unit);
    edge.setColor(Skia.Color('#FFFFFF'));
    edge.setAlphaf(0.9 * alpha);
    c.drawPath(outline, edge);
  }
  c.restore();
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export function drawItem(c: SkCanvas, item: Item, w: number, env: RenderEnv, darkBoard: boolean, frac = 1) {
  if (item.t === 'stroke') drawStroke(c, item, w, darkBoard, frac);
  else if (item.t === 'text') drawText(c, item, w, env, darkBoard, frac);
  else if (item.t === 'photo') drawPhoto(c, item, w, env, frac);
  else drawStamp(c, item, w, darkBoard, frac);
}

/** Relative "duration" of an item for replay. */
function itemWeight(item: Item): number {
  if (item.t === 'stroke') return Math.max(4, item.pts.length / 2);
  if (item.t === 'text') return 10 + item.text.length * 2;
  return 14;
}

export type DrawDocOptions = {
  /** 0..1 replay progress; undefined = fully drawn */
  progress?: number;
  /** Pre-rendered items layer (in pixels) to use instead of drawing every item. */
  itemsImage?: SkImage | null;
  /** Stroke currently being drawn. */
  live?: Item | null;
  /** Items to skip (e.g. the one being dragged, drawn separately). */
  skipIds?: Set<string>;
};

export function drawDoc(c: SkCanvas, doc: Doc, w: number, env: RenderEnv, opts: DrawDocOptions = {}) {
  const h = w / doc.aspect;
  const look = resolveBoard(doc);
  const dark = look.dark;

  drawBoardBase(c, look, w, h);
  if (env.bgImage) {
    const img = env.bgImage;
    c.drawImageRect(img, Skia.XYWHRect(0, 0, img.width(), img.height()), Skia.XYWHRect(0, 0, w, h), Skia.Paint());
  }

  c.saveLayer();
  if (opts.itemsImage) {
    const img = opts.itemsImage;
    c.drawImageRect(img, Skia.XYWHRect(0, 0, img.width(), img.height()), Skia.XYWHRect(0, 0, w, h), Skia.Paint());
  } else if (opts.progress !== undefined && opts.progress < 1) {
    const weights = doc.items.map(itemWeight);
    const total = weights.reduce((a, b) => a + b, 0);
    let budget = opts.progress * total;
    for (let i = 0; i < doc.items.length && budget > 0; i++) {
      const frac = Math.min(1, budget / weights[i]);
      drawItem(c, doc.items[i], w, env, dark, frac);
      budget -= weights[i];
    }
  } else {
    for (const item of doc.items) {
      if (opts.skipIds?.has(item.id)) continue;
      drawItem(c, item, w, env, dark);
    }
  }
  if (opts.live) drawItem(c, opts.live, w, env, dark);
  c.restore();

  // A "draw over" background already contains its own frame.
  if (!env.bgImage) drawBoardFrame(c, look.frame, w, h);
}

/** Render the items layer only (transparent background) for the live canvas cache. */
export function renderItemsLayer(doc: Doc, w: number, pixelRatio: number, env: RenderEnv, skipIds?: Set<string>): SkImage | null {
  const h = w / doc.aspect;
  const surface =
    Skia.Surface.MakeOffscreen(Math.round(w * pixelRatio), Math.round(h * pixelRatio)) ??
    Skia.Surface.Make(Math.round(w * pixelRatio), Math.round(h * pixelRatio));
  if (!surface) return null;
  const c = surface.getCanvas();
  c.scale(pixelRatio, pixelRatio);
  const dark = resolveBoard(doc).dark;
  for (const item of doc.items) {
    if (skipIds?.has(item.id)) continue;
    drawItem(c, item, w, env, dark);
  }
  surface.flush();
  const snap = surface.makeImageSnapshot();
  return snap.makeNonTextureImage() ?? snap;
}

/** Render the final image that goes to storage and onto everyone's widgets. */
export function exportDocImage(doc: Doc, env: RenderEnv, widthPx = 960): Uint8Array {
  const w = Math.round(doc.aspect >= 1 ? widthPx : widthPx * doc.aspect);
  const h = Math.round(w / doc.aspect);
  const surface = Skia.Surface.MakeOffscreen(w, h) ?? Skia.Surface.Make(w, h);
  if (!surface) throw new Error('Could not create drawing surface');
  drawDoc(surface.getCanvas(), doc, w, env);
  surface.flush();
  return surface.makeImageSnapshot().encodeToBytes(ImageFormat.JPEG, 88);
}

// ---------------------------------------------------------------------------
// Hit testing for move/scale of text & stamps
// ---------------------------------------------------------------------------

export function hitTest(doc: Doc, x: number, y: number, w: number, typeface: SkTypeface | null): string | null {
  for (let i = doc.items.length - 1; i >= 0; i--) {
    const it = doc.items[i];
    if (it.t === 'stroke') continue;
    let rx: number;
    let ry: number;
    if (it.t === 'text') {
      const m = measureText(it, w, typeface);
      rx = m.width / 2 / w + 0.02;
      ry = m.height / 2 / w + 0.02;
    } else if (it.t === 'photo') {
      const { hw, hh } = photoHalfSize(it);
      rx = hw + 0.01;
      ry = hh + 0.01;
    } else {
      rx = ry = it.size / 2 + 0.02;
    }
    // Undo rotation around the item center.
    const a = (-it.rot * Math.PI) / 180;
    const dx = x - it.x;
    const dy = y - it.y;
    const lx = dx * Math.cos(a) - dy * Math.sin(a);
    const ly = dx * Math.sin(a) + dy * Math.cos(a);
    if (Math.abs(lx) <= rx && Math.abs(ly) <= ry) return it.id;
  }
  return null;
}

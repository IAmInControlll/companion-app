/**
 * Canvas viewport maths (pure, unit-tested). A view maps doc space to screen space:
 *   screen = doc * s + (tx, ty)
 * where doc space is the unzoomed canvas in layout pixels (0..w, 0..h).
 */

export type ViewT = { s: number; tx: number; ty: number };

export const IDENTITY: ViewT = { s: 1, tx: 0, ty: 0 };
export const MAX_ZOOM = 6;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Keep zoom within [1, MAX_ZOOM] and never let the board leave the viewport. */
export function clampView(v: ViewT, w: number, h: number): ViewT {
  const s = clamp(v.s, 1, MAX_ZOOM);
  return { s, tx: clamp(v.tx, w - w * s, 0), ty: clamp(v.ty, h - h * s, 0) };
}

export function screenToDoc(v: ViewT, x: number, y: number) {
  return { x: (x - v.tx) / v.s, y: (y - v.ty) / v.s };
}

export function docToScreen(v: ViewT, x: number, y: number) {
  return { x: x * v.s + v.tx, y: y * v.s + v.ty };
}

/** Zoom by `factor` keeping the screen point (cx, cy) fixed. */
export function zoomAround(v: ViewT, factor: number, cx: number, cy: number, w: number, h: number): ViewT {
  const p = screenToDoc(v, cx, cy);
  const s = clamp(v.s * factor, 1, MAX_ZOOM);
  return clampView({ s, tx: cx - p.x * s, ty: cy - p.y * s }, w, h);
}

export function panBy(v: ViewT, dx: number, dy: number, w: number, h: number): ViewT {
  return clampView({ ...v, tx: v.tx + dx, ty: v.ty + dy }, w, h);
}

/**
 * A two-finger interaction combines pinch (scale) and drag (focal movement) into one
 * transform anchored on the doc point that was under the fingers when it started,
 * so the content stays glued to the fingers.
 */
export type TwoFinger = {
  v0: ViewT;
  /** Doc point under the initial focal point. */
  anchor: { x: number; y: number };
  focal0: { x: number; y: number };
  scale: number;
  dx: number;
  dy: number;
};

export function startTwoFinger(v0: ViewT, focalX: number, focalY: number): TwoFinger {
  return { v0, anchor: screenToDoc(v0, focalX, focalY), focal0: { x: focalX, y: focalY }, scale: 1, dx: 0, dy: 0 };
}

export function applyTwoFinger(t: TwoFinger, w: number, h: number): ViewT {
  const s = clamp(t.v0.s * t.scale, 1, MAX_ZOOM);
  const fx = t.focal0.x + t.dx;
  const fy = t.focal0.y + t.dy;
  return clampView({ s, tx: fx - t.anchor.x * s, ty: fy - t.anchor.y * s }, w, h);
}

/** Momentum after a flick. Velocities in px/s; dt in seconds. */
export type Fling = { vx: number; vy: number };
const FRICTION_PER_SEC = 0.0025; // fraction of velocity left after 1s
const MIN_SPEED = 25;

export function flingStep(v: ViewT, f: Fling, dt: number, w: number, h: number): { view: ViewT; fling: Fling; done: boolean } {
  const next = panBy(v, f.vx * dt, f.vy * dt, w, h);
  const decay = Math.pow(FRICTION_PER_SEC, dt);
  // Stop an axis that hit an edge instead of pushing against it.
  const vx = next.tx === v.tx + f.vx * dt ? f.vx * decay : 0;
  const vy = next.ty === v.ty + f.vy * dt ? f.vy * decay : 0;
  return { view: next, fling: { vx, vy }, done: Math.hypot(vx, vy) < MIN_SPEED };
}

export const isZoomed = (v: ViewT) => v.s > 1.001;

/** Visible doc rectangle, as fractions of the board (for position indicators). */
export function visibleFraction(v: ViewT, w: number, h: number) {
  return { x: -v.tx / (w * v.s), y: -v.ty / (h * v.s), w: 1 / v.s, h: 1 / v.s };
}

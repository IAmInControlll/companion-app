/**
 * Two fingers on a placed picture/text, Snapchat style: the item follows the fingers, so
 * spreading them resizes it, twisting rotates it and sliding moves it, all at once.
 * Pure, unit-tested.
 */
export type Pt = { x: number; y: number };
export type ItemPose = { x: number; y: number; size: number; rot: number };

/** Within this many degrees of upright / sideways, the angle clicks straight. */
export const SNAP_DEG = 4;

export function snapAngle(deg: number): number {
  const straight = Math.round(deg / 90) * 90;
  return Math.abs(deg - straight) <= SNAP_DEG ? straight + 0 : deg; // + 0 turns -0 into 0
}

/**
 * The item's pose now, given where the two fingers started (a0, b0) and where they are
 * (a, b), in screen pixels. `pxPerUnit` converts doc units (fractions of the board width)
 * to screen pixels; the centre is kept on the board (0..maxX, 0..maxY).
 */
export function twoFingerPose(
  start: ItemPose,
  a0: Pt,
  b0: Pt,
  a: Pt,
  b: Pt,
  pxPerUnit: number,
  limits: { maxX: number; maxY: number; minSize: number; maxSize: number },
): ItemPose {
  const dist0 = Math.hypot(b0.x - a0.x, b0.y - a0.y);
  const dist = Math.hypot(b.x - a.x, b.y - a.y);
  // Fingers that started almost on top of each other give a meaningless ratio: don't scale.
  const scale = dist0 > 8 ? dist / dist0 : 1;
  const turn = ((Math.atan2(b.y - a.y, b.x - a.x) - Math.atan2(b0.y - a0.y, b0.x - a0.x)) * 180) / Math.PI;
  const dx = ((a.x + b.x) / 2 - (a0.x + b0.x) / 2) / pxPerUnit;
  const dy = ((a.y + b.y) / 2 - (a0.y + b0.y) / 2) / pxPerUnit;
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  return {
    x: clamp(start.x + dx, 0, limits.maxX),
    y: clamp(start.y + dy, 0, limits.maxY),
    size: clamp(start.size * scale, limits.minSize, limits.maxSize),
    rot: snapAngle(start.rot + turn),
  };
}

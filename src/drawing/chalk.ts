/**
 * Chalk edge jitter (pure, unit-tested).
 *
 * Skia's discrete path effect spreads its jitter points evenly over the *whole* path
 * (spacing = length / round(length / segment)), so every point added to a stroke in progress
 * nudges all the jitter that came before it and the line "crawls" under your finger. Here the
 * jitter points sit at fixed distances from the start of the stroke, and each one's offset
 * depends only on the seed and its index, so what's already drawn never moves.
 */

/** Random in [-1, 1) for sample `k` of the stroke with this seed. */
function noise(seed: number, k: number): number {
  let t = (seed ^ Math.imul(k + 1, 0x9e3779b1)) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1;
}

const QUAD_STEPS = 6;

/**
 * The stroke's centre line as a polyline, in pixels: the same midpoint-quadratic curve the
 * renderer draws (moveTo P0, quadTo through each point to the next midpoint, lineTo the end).
 * Adding a point only changes the part after the last midpoint.
 */
export function flattenStroke(pts: number[], w: number, count: number): number[] {
  const n = Math.min(count, pts.length / 2);
  if (n === 0) return [];
  const X = (i: number) => pts[i * 2] * w;
  const Y = (i: number) => pts[i * 2 + 1] * w;
  const out = [X(0), Y(0)];
  if (n === 1) return out;
  let sx = X(0);
  let sy = Y(0);
  for (let i = 1; i < n - 1; i++) {
    const cx = X(i);
    const cy = Y(i);
    const ex = (X(i) + X(i + 1)) / 2;
    const ey = (Y(i) + Y(i + 1)) / 2;
    for (let s = 1; s <= QUAD_STEPS; s++) {
      const t = s / QUAD_STEPS;
      const u = 1 - t;
      out.push(u * u * sx + 2 * u * t * cx + t * t * ex, u * u * sy + 2 * u * t * cy + t * t * ey);
    }
    sx = ex;
    sy = ey;
  }
  out.push(X(n - 1), Y(n - 1));
  return out;
}

/**
 * Resample a polyline every `seg` pixels (measured from its start) and push each sample
 * sideways by up to `dev` pixels. Returns flat [x, y, ...]; the last point is the true end.
 */
export function jitterLine(line: number[], seg: number, dev: number, seed: number): number[] {
  const m = line.length / 2;
  if (m === 0) return [];
  if (m === 1) return [line[0], line[1]];
  const out: number[] = [];
  let k = 0;
  let next = 0; // arc length of the next sample
  let walked = 0; // arc length at the start of the current segment
  let nx = 0;
  let ny = -1;
  for (let i = 1; i < m; i++) {
    const ax = line[(i - 1) * 2];
    const ay = line[(i - 1) * 2 + 1];
    const dx = line[i * 2] - ax;
    const dy = line[i * 2 + 1] - ay;
    const len = Math.hypot(dx, dy);
    if (len === 0) continue;
    nx = -dy / len;
    ny = dx / len;
    while (next <= walked + len) {
      const t = (next - walked) / len;
      const r = noise(seed, k) * dev;
      out.push(ax + dx * t + nx * r, ay + dy * t + ny * r);
      k++;
      next = k * seg;
    }
    walked += len;
  }
  if (!out.length) out.push(line[0], line[1]);
  out.push(line[(m - 1) * 2], line[(m - 1) * 2 + 1]);
  return out;
}

/**
 * Where a stroke goes back over itself. A single path is filled once, so a scribble that doubles
 * back doesn't build up the way two separate strokes do. Walking the centre line every `seg`
 * pixels, a new "pass" starts whenever it comes within `radius` of ink the current pass already
 * laid down (ignoring the last `gap` pixels, which it's always next to). Returns the arc lengths
 * where passes start; empty for a stroke that never crosses itself. Only looks backwards, so
 * the answer for what's drawn doesn't change as the stroke grows.
 */
export function passBreaks(line: number[], seg: number, radius: number, gap: number): number[] {
  const samples = jitterLine(line, seg, 0, 0);
  const n = samples.length / 2 - 1; // the exact end isn't on the seg grid; skip it
  const skip = Math.ceil(gap / seg);
  const cell = Math.max(radius, 1e-6);
  const grid = new Map<string, number[]>();
  const pass: number[] = [];
  const breaks: number[] = [];
  let current = 0;
  const r2 = radius * radius;
  for (let k = 0; k < n; k++) {
    const x = samples[k * 2];
    const y = samples[k * 2 + 1];
    const gx = Math.floor(x / cell);
    const gy = Math.floor(y / cell);
    let hit = false;
    for (let i = -1; i <= 1 && !hit; i++) {
      for (let j = -1; j <= 1 && !hit; j++) {
        for (const o of grid.get(`${gx + i},${gy + j}`) ?? []) {
          if (o > k - skip || pass[o] !== current) continue;
          const dx = samples[o * 2] - x;
          const dy = samples[o * 2 + 1] - y;
          if (dx * dx + dy * dy <= r2) {
            hit = true;
            break;
          }
        }
      }
    }
    if (hit) {
      current++;
      breaks.push(k * seg);
    }
    pass.push(current);
    const key = `${gx},${gy}`;
    const list = grid.get(key);
    if (list) list.push(k);
    else grid.set(key, [k]);
  }
  return breaks;
}

/**
 * Cut jittered samples (from jitterLine with spacing `seg`) into passes at the given arc lengths.
 * Each pass starts on the previous one's last point, so the line stays continuous.
 */
export function splitPasses(samples: number[], seg: number, breaks: number[]): number[][] {
  const m = samples.length / 2;
  if (!breaks.length || m < 2) return [samples];
  const out: number[][] = [[]];
  let b = 0;
  for (let k = 0; k < m; k++) {
    // The last sample is the stroke's exact end: it belongs to the last pass.
    const at = k === m - 1 ? Infinity : k * seg;
    if (b < breaks.length && at >= breaks[b] && out[out.length - 1].length >= 2) {
      const prev = out[out.length - 1];
      out.push([prev[prev.length - 2], prev[prev.length - 1]]);
      while (b < breaks.length && at >= breaks[b]) b++;
    }
    out[out.length - 1].push(samples[k * 2], samples[k * 2 + 1]);
  }
  return out;
}

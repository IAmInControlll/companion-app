import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  IDENTITY,
  MAX_ZOOM,
  applyTwoFinger,
  clampView,
  docToScreen,
  flingStep,
  panBy,
  screenToDoc,
  startTwoFinger,
  visibleFraction,
  zoomAround,
  type ViewT,
} from './viewport.ts';

const W = 400;
const H = 300;
const near = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

test('screen/doc conversions are inverses', () => {
  const v: ViewT = { s: 2.5, tx: -120, ty: -40 };
  const d = screenToDoc(v, 123, 77);
  const s = docToScreen(v, d.x, d.y);
  near(s.x, 123);
  near(s.y, 77);
});

test('zoom keeps the point under the fingers fixed', () => {
  const v = zoomAround(IDENTITY, 2, 100, 80, W, H);
  assert.equal(v.s, 2);
  const p = docToScreen(v, 100, 80); // doc point that was under (100,80) at 1x
  near(p.x, 100);
  near(p.y, 80);
});

test('zoom is clamped to [1, MAX_ZOOM] and resets translation at 1x', () => {
  assert.equal(zoomAround(IDENTITY, 100, 0, 0, W, H).s, MAX_ZOOM);
  const back = zoomAround({ s: 3, tx: -500, ty: -300 }, 0.01, 200, 150, W, H);
  assert.deepEqual(back, IDENTITY);
});

test('the board never leaves the viewport', () => {
  const v = clampView({ s: 2, tx: 50, ty: -9999 }, W, H);
  assert.equal(v.tx, 0); // can't reveal space left of the board
  assert.equal(v.ty, H - H * 2); // can't scroll past the bottom
  assert.deepEqual(panBy(IDENTITY, 30, 30, W, H), IDENTITY); // no panning at 1x
});

test('two-finger drag pans by exactly the finger movement', () => {
  const v0: ViewT = { s: 2, tx: -200, ty: -150 };
  const t = startTwoFinger(v0, 200, 150);
  t.dx = 40;
  t.dy = -25;
  const v = applyTwoFinger(t, W, H);
  near(v.tx, -160);
  near(v.ty, -175);
  assert.equal(v.s, 2);
});

test('pinch + drag together keep the content glued to the fingers', () => {
  const v0: ViewT = { s: 1.5, tx: -50, ty: -30 };
  const t = startTwoFinger(v0, 180, 120);
  const anchor = screenToDoc(v0, 180, 120);
  t.scale = 1.6;
  t.dx = 15;
  t.dy = 10;
  const v = applyTwoFinger(t, W, H);
  const p = docToScreen(v, anchor.x, anchor.y);
  near(p.x, 195);
  near(p.y, 130);
});

test('fling decelerates, stops at edges, and finishes', () => {
  let v: ViewT = { s: 3, tx: -400, ty: -300 };
  let f = { vx: 2000, vy: 0 };
  let steps = 0;
  let done = false;
  while (!done && steps < 1000) {
    const r = flingStep(v, f, 1 / 60, W, H);
    assert.ok(Math.abs(r.fling.vx) <= Math.abs(f.vx)); // never speeds up
    v = r.view;
    f = r.fling;
    done = r.done;
    steps++;
  }
  assert.ok(done, 'fling should come to rest');
  assert.ok(v.tx <= 0 && v.tx >= W - W * 3, 'stays inside bounds');

  // Hitting the left edge kills horizontal velocity immediately.
  const r = flingStep({ s: 2, tx: -5, ty: -100 }, { vx: 3000, vy: 0 }, 1 / 60, W, H);
  assert.equal(r.view.tx, 0);
  assert.equal(r.fling.vx, 0);
  assert.ok(r.done);
});

test('visible fraction describes the viewport window', () => {
  const f = visibleFraction({ s: 2, tx: -200, ty: 0 }, W, H);
  near(f.x, 0.25);
  near(f.y, 0);
  near(f.w, 0.5);
  near(f.h, 0.5);
});

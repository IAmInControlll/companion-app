import assert from 'node:assert/strict';
import { test } from 'node:test';

import { snapAngle, twoFingerPose } from './itemGesture.ts';

const start = { x: 0.5, y: 0.5, size: 0.4, rot: 10 };
const limits = { maxX: 1, maxY: 1, minSize: 0.02, maxSize: 1.5 };
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`);

test('spreading the fingers scales by the distance ratio', () => {
  const p = twoFingerPose(start, { x: 100, y: 100 }, { x: 200, y: 100 }, { x: 50, y: 100 }, { x: 250, y: 100 }, 400, limits);
  near(p.size, 0.8);
  near(p.x, 0.5); // same midpoint: doesn't move
  near(p.rot, 10);
});

test('twisting rotates by the angle the fingers turned', () => {
  // A quarter turn clockwise around the midpoint (150, 100).
  const p = twoFingerPose(start, { x: 100, y: 100 }, { x: 200, y: 100 }, { x: 150, y: 50 }, { x: 150, y: 150 }, 400, limits);
  near(p.rot, 100);
  near(p.size, 0.4);
});

test('sliding both fingers moves the item in doc units', () => {
  const p = twoFingerPose(start, { x: 100, y: 100 }, { x: 200, y: 100 }, { x: 140, y: 120 }, { x: 240, y: 120 }, 400, limits);
  near(p.x, 0.6);
  near(p.y, 0.55);
});

test('size and position stay within limits', () => {
  const p = twoFingerPose(start, { x: 100, y: 100 }, { x: 200, y: 100 }, { x: 4000, y: 4000 }, { x: 4400, y: 4000 }, 400, limits);
  assert.equal(p.size, 1.5);
  assert.equal(p.x, 1);
  assert.equal(p.y, 1);
});

test('angles click straight near 0 / 90 / 180 / 270, not elsewhere', () => {
  assert.equal(snapAngle(3), 0);
  assert.equal(snapAngle(-2.5), 0);
  assert.equal(snapAngle(92), 90);
  assert.equal(snapAngle(178), 180);
  assert.equal(snapAngle(30), 30);
  assert.equal(snapAngle(85), 85);
});

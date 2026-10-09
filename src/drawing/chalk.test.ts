import assert from 'node:assert/strict';
import { test } from 'node:test';

import { flattenStroke, jitterLine, passBreaks, splitPasses } from './chalk.ts';

// A wiggly stroke in normalized coordinates (x, y pairs, as stored in a Stroke).
const pts: number[] = [];
for (let i = 0; i < 40; i++) pts.push(0.1 + i * 0.02, 0.5 + Math.sin(i / 3) * 0.1);
const W = 400;
const chalk = (count: number) => jitterLine(flattenStroke(pts, W, count), 4, 1.5, 1234);

test('what is already drawn stays put as the stroke grows', () => {
  const short = chalk(20);
  const long = chalk(40);
  // Everything except the live tail (the last couple of samples) is identical.
  const stable = short.length - 6;
  assert.ok(stable > 20);
  assert.deepEqual(long.slice(0, stable), short.slice(0, stable));
});

test('is deterministic for a given seed and differs between seeds', () => {
  const line = flattenStroke(pts, W, 40);
  assert.deepEqual(jitterLine(line, 4, 1.5, 7), jitterLine(line, 4, 1.5, 7));
  assert.notDeepEqual(jitterLine(line, 4, 1.5, 7), jitterLine(line, 4, 1.5, 8));
});

test('samples sit about one segment apart and within the deviation', () => {
  const line = flattenStroke([0, 0, 1, 0], 100, 2);
  const out = jitterLine(line, 10, 2, 99);
  assert.equal(out.length / 2, 12); // 0, 10, ... 100, plus the exact end
  for (let i = 0; i < out.length / 2 - 1; i++) {
    assert.ok(Math.abs(out[i * 2] - i * 10) < 1e-9);
    assert.ok(Math.abs(out[i * 2 + 1]) <= 2);
  }
  assert.deepEqual(out.slice(-2), [100, 0]);
});

test('handles a single tap and an empty stroke', () => {
  assert.deepEqual(jitterLine(flattenStroke([0.5, 0.5], 100, 1), 4, 1, 1), [50, 50]);
  assert.deepEqual(jitterLine(flattenStroke([], 100, 0), 4, 1, 1), []);
});

const across = (x0: number, x1: number, y: number, steps = 20) => Array.from({ length: steps + 1 }, (_, i) => [x0 + ((x1 - x0) * i) / steps, y]).flat();

test('a line that never crosses itself is a single pass', () => {
  const line = flattenStroke(pts, W, 40);
  assert.deepEqual(passBreaks(line, 4, 4, 10), []);
  const samples = jitterLine(line, 4, 1.5, 1);
  assert.deepEqual(splitPasses(samples, 4, []), [samples]);
});

test('each trip back over the same ink starts a new pass', () => {
  // Right, back left, then right again over the same spot.
  const scribble = [...across(0.1, 0.9, 0.5), ...across(0.9, 0.1, 0.5).slice(2), ...across(0.1, 0.9, 0.5).slice(2)];
  const line = flattenStroke(scribble, W, scribble.length / 2);
  const breaks = passBreaks(line, 4, 4, 10);
  assert.equal(breaks.length, 2);
  const passes = splitPasses(jitterLine(line, 4, 1, 3), 4, breaks);
  assert.equal(passes.length, 3);
  // Passes join up: each starts where the previous one ended.
  for (let i = 1; i < passes.length; i++) assert.deepEqual(passes[i].slice(0, 2), passes[i - 1].slice(-2));
});

test('pass breaks already found stay put as the stroke grows', () => {
  const scribble = [...across(0.1, 0.9, 0.5), ...across(0.9, 0.1, 0.5).slice(2), ...across(0.1, 0.9, 0.5).slice(2)];
  const half = passBreaks(flattenStroke(scribble, W, 50), 4, 4, 10);
  const full = passBreaks(flattenStroke(scribble, W, scribble.length / 2), 4, 4, 10);
  assert.deepEqual(full.slice(0, half.length), half);
});

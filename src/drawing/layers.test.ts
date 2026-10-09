import assert from 'node:assert/strict';
import { test } from 'node:test';

import { moveLayer } from './layers.ts';
import type { Item } from './model.ts';

const photo = (id: string, x: number, y: number): Item => ({ t: 'photo', id, path: 'p', x, y, size: 0.2, aspect: 1, rot: 0, seed: 1 });
const ids = (items: Item[]) => items.map((i) => i.id).join('');

// a, b and d overlap around the centre; c sits far away in a corner.
const items = [photo('a', 0.5, 0.5), photo('b', 0.55, 0.5), photo('c', 0.05, 0.05), photo('d', 0.5, 0.55)];

test('front and back go all the way', () => {
  assert.equal(ids(moveLayer(items, 'a', 'front')), 'bcda');
  assert.equal(ids(moveLayer(items, 'd', 'back')), 'dabc');
});

test('forward steps over the next overlapping item only', () => {
  assert.equal(ids(moveLayer(items, 'a', 'forward')), 'bacd');
  // b's next overlap is d (c is far away), so it jumps past both.
  assert.equal(ids(moveLayer(items, 'b', 'forward')), 'acdb');
});

test('backward steps under the previous overlapping item only', () => {
  // d's previous overlap is b, skipping the far-away c.
  assert.equal(ids(moveLayer(items, 'd', 'backward')), 'adbc');
});

test('nothing overlapping goes to the end; already there is a no-op', () => {
  assert.equal(ids(moveLayer(items, 'c', 'forward')), 'abdc');
  assert.equal(moveLayer(items, 'd', 'front'), items);
  assert.equal(moveLayer(items, 'a', 'backward'), items);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Activity } from './api';
import { groupActivity } from './timeline.ts';

const nudge = (id: string, at: string, actor: string, kind: 'miss_you' | 'hug' = 'miss_you'): Activity => ({ type: 'nudge', id, at, actor, kind });
const byDate = (iso: string) => iso.slice(0, 10);

test('collapses back-to-back identical nudges', () => {
  const days = groupActivity(
    [nudge('3', '2026-10-09T12:03:00Z', 'z'), nudge('2', '2026-10-09T12:02:00Z', 'z'), nudge('1', '2026-10-09T12:01:00Z', 'z')],
    byDate,
  );
  assert.equal(days.length, 1);
  assert.equal(days[0].data.length, 1);
  assert.equal(days[0].data[0].count, 3);
  assert.equal(days[0].data[0].at, '2026-10-09T12:03:00Z');
  assert.equal(days[0].data[0].firstAt, '2026-10-09T12:01:00Z');
});

test('keeps different people, kinds and interruptions apart', () => {
  const days = groupActivity(
    [
      nudge('5', '2026-10-09T12:05:00Z', 'z'),
      nudge('4', '2026-10-09T12:04:00Z', 'me'),
      nudge('3', '2026-10-09T12:03:00Z', 'z', 'hug'),
      { type: 'post', id: 'p', at: '2026-10-09T12:02:00Z', actor: 'z', kind: 'drawing' },
      nudge('1', '2026-10-09T12:01:00Z', 'z', 'hug'),
    ],
    byDate,
  );
  assert.deepEqual(
    days[0].data.map((e) => [e.id, e.count]),
    [
      ['5', 1],
      ['4', 1],
      ['3', 1],
      ['p', 1],
      ['1', 1],
    ],
  );
});

test('starts a new run on a new day', () => {
  const days = groupActivity([nudge('2', '2026-10-09T00:01:00Z', 'z'), nudge('1', '2026-10-08T23:59:00Z', 'z')], byDate);
  assert.deepEqual(
    days.map((d) => [d.title, d.data[0].count]),
    [
      ['2026-10-09', 1],
      ['2026-10-08', 1],
    ],
  );
});

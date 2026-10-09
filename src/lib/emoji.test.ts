import assert from 'node:assert/strict';
import { test } from 'node:test';

import { lastEmoji } from './emoji.ts';

test('finds single and composite emoji', () => {
  assert.equal(lastEmoji('😊'), '😊');
  assert.equal(lastEmoji('❤️‍🔥'), '❤️‍🔥');
  assert.equal(lastEmoji('👩🏽‍💻'), '👩🏽‍💻');
  assert.equal(lastEmoji('🇿🇦'), '🇿🇦');
  assert.equal(lastEmoji('☕'), '☕');
});

test('takes the newest one and ignores text', () => {
  assert.equal(lastEmoji('😊🥹'), '🥹');
  assert.equal(lastEmoji('hi 🫠 there'), '🫠');
  assert.equal(lastEmoji('hello'), null);
  assert.equal(lastEmoji(''), null);
});

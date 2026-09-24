import { test } from 'node:test';
import assert from 'node:assert';
import { pillLook, PILL_COLORS } from './pill.js';

test('a chosen look is used as chosen', () => {
  assert.deepStrictEqual(pillLook({ id: 'a', appearance: { shape: 'capsule', color: 'blue' } }),
    { shape: 'capsule', color: '#60a5fa', colorKey: 'blue' });
});

test('untouched, the shape follows the form and the colour is stable per medication', () => {
  assert.strictEqual(pillLook({ id: 'a', form: 'capsule' }).shape, 'capsule');
  assert.strictEqual(pillLook({ id: 'a', form: 'liquid' }).shape, 'drop');
  assert.strictEqual(pillLook({ id: 'a', form: 'tablet' }).shape, 'round');
  assert.deepStrictEqual(pillLook({ id: 'a' }), pillLook({ id: 'a' }));
  // Different medications land on different colours often enough to tell apart.
  const colors = new Set(['m1', 'm2', 'm3', 'm4', 'm5', 'm6'].map((id) => pillLook({ id }).colorKey));
  assert.ok(colors.size >= 3);
});

test('an unknown shape or colour falls back rather than drawing nothing', () => {
  const l = pillLook({ id: 'a', appearance: { shape: 'star', color: '#123456' } });
  assert.strictEqual(l.shape, 'round');
  assert.ok(PILL_COLORS.some((c) => c.hex === l.color));
});

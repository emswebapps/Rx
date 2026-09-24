import { test } from 'node:test';
import assert from 'node:assert';

import {
  checkInsDue, effectCurve, peakAndDrop, sideEffectCounts, CHECKIN_WINDOW_MS,
} from './effects.js';


const M = 60 * 1000;
const at = (d, h, m = 0) => new Date(2026, 8, d, h, m).getTime();
const IR = { id: 'ir', name: 'IR', onsetHours: 4, active: true };
const dose = (id, t) => ({ id, medId: 'ir', takenAt: t, status: 'taken' });

test('a check-in opens ninety minutes in, and again at wear-off', () => {
  const doses = [dose('d1', at(24, 8))];
  assert.deepStrictEqual(checkInsDue([IR], doses, [], at(24, 9)), []);
  assert.deepStrictEqual(checkInsDue([IR], doses, [], at(24, 9, 35)).map((c) => c.phase), ['working']);
  assert.deepStrictEqual(checkInsDue([IR], doses, [], at(24, 12, 10)).map((c) => c.phase), ['wearing']);
});

test('answered or stale check-ins go away', () => {
  const doses = [dose('d1', at(24, 8))];
  const answered = [{ doseId: 'd1', phase: 'working', at: at(24, 9, 40) }];
  assert.deepStrictEqual(checkInsDue([IR], doses, answered, at(24, 9, 45)), []);
  assert.deepStrictEqual(checkInsDue([IR], doses, [], at(24, 9, 30) + CHECKIN_WINDOW_MS + M), []);
});

test('skipped doses and doses with no medication ask nothing', () => {
  const doses = [{ id: 'x', medId: 'ir', takenAt: at(24, 8), status: 'skipped' }, { id: 'y', takenAt: at(24, 8) }];
  assert.deepStrictEqual(checkInsDue([IR], doses, [], at(24, 9, 35)), []);
});

test('the curve averages ratings by hours since the dose', () => {
  const doses = [dose('a', at(20, 8)), dose('b', at(21, 8))];
  const effects = [
    { doseId: 'a', medId: 'ir', at: at(20, 9, 30), focus: 4, mood: 4 },
    { doseId: 'b', medId: 'ir', at: at(21, 9, 40), focus: 5, mood: 3 },
    { medId: 'ir', at: at(21, 12, 10), focus: 2, mood: 2 }, // unpaired: nearest earlier dose
  ];
  const curve = effectCurve(effects, doses, 'ir');
  assert.deepStrictEqual(curve.map((b) => [b.hours, b.focus, b.n]), [[1.5, 4.5, 2], [4, 2, 1]]);
});

test('peak and drop need enough check-ins', () => {
  const curve = [
    { hours: 1, focus: 3, n: 2 }, { hours: 1.5, focus: 4.5, n: 2 },
    { hours: 3, focus: 4, n: 1 }, { hours: 4, focus: 3, n: 2 },
  ];
  assert.deepStrictEqual(peakAndDrop(curve), { peakHours: 1.75, peakFocus: 4.5, dropHours: 4.25, samples: 7 });
  assert.strictEqual(peakAndDrop(curve.slice(0, 2)), null);
});

test('side effects are counted, most common first', () => {
  const effects = [
    { at: at(24, 9), sideEffects: ['headache', 'jittery'] },
    { at: at(24, 12), sideEffects: ['headache'] },
    { at: at(1, 12), sideEffects: ['tired'] },
  ];
  const s = sideEffectCounts(effects, at(20, 0));
  assert.strictEqual(s.checkIns, 2);
  assert.deepStrictEqual(s.items.map((i) => [i.label, i.count]), [['Headache', 2], ['Jittery', 1]]);
});



import { test } from 'node:test';
import assert from 'node:assert';

import { onsetPrompt, doseTimings, timingByFood, formatMinutes, minutesAfter } from './onset.js';
import { markStep } from './routine.js';

const at = (d, h, m = 0) => new Date(2026, 8, d, h, m).getTime();
const IR = {
  id: 'ir', name: 'Adderall IR', onsetHours: 4,
  schedule: {
    days: [0, 1, 2, 3, 4, 5, 6],
    times: [
      { id: 't1', mode: 'clock', time: '08:00', routine: [
        { id: 'd', kind: 'dose' }, { id: 'bk', kind: 'meal', text: '2 eggs + Ready bar' }] },
    ],
  },
};

test('after a dose it asks when it kicked in, then when it dropped off', () => {
  const d = { id: 'a', medId: 'ir', takenAt: at(24, 8), status: 'taken' };
  assert.strictEqual(onsetPrompt([IR], [d], at(24, 7)), null, 'nothing before the dose');
  assert.strictEqual(onsetPrompt([IR], [d], at(24, 8, 20)).stage, 'kick');
  assert.strictEqual(onsetPrompt([IR], [{ ...d, kickedInAt: at(24, 8, 30) }], at(24, 9)).stage, 'drop');
  // Kick-in never tapped: after a few hours it moves on to the drop-off.
  assert.strictEqual(onsetPrompt([IR], [d], at(24, 11, 30)).stage, 'drop');
  assert.strictEqual(onsetPrompt([IR], [{ ...d, droppedAt: at(24, 12) }], at(24, 12, 5)), null);
  assert.strictEqual(onsetPrompt([IR], [d], at(24, 21)), null, 'not half a day later');
});

test('only the newest dose today is asked about; skips and yesterday are not', () => {
  const doses = [
    { id: 'y', medId: 'ir', takenAt: at(23, 20), status: 'taken' },
    { id: 'a', medId: 'ir', takenAt: at(24, 8), status: 'taken', kickedInAt: at(24, 8, 25) },
    { id: 'b', medId: 'ir', takenAt: at(24, 12), status: 'taken' },
    { id: 's', medId: 'ir', takenAt: at(24, 12, 30), status: 'skipped' },
  ];
  const p = onsetPrompt([IR], doses, at(24, 12, 40));
  assert.strictEqual(p.dose.id, 'b');
  assert.strictEqual(p.stage, 'kick');
  assert.strictEqual(p.med.name, 'Adderall IR');
  assert.strictEqual(onsetPrompt([IR], doses.slice(0, 1), at(24, 7)), null);
});

test('each timed dose is a row, with the meal eaten alongside it', () => {
  const runs = markStep([], at(24, 8), 'ir', 't1', 'bk', at(24, 8, 5));
  const doses = [
    { id: 'a', medId: 'ir', slotId: 't1', takenAt: at(24, 8), status: 'taken', kickedInAt: at(24, 8, 25), droppedAt: at(24, 11, 50) },
    { id: 'b', medId: 'ir', slotId: 't1', takenAt: at(23, 8), status: 'taken', kickedInAt: at(23, 8, 40), droppedAt: at(23, 9, 45) },
    { id: 'c', medId: 'ir', slotId: 't1', takenAt: at(22, 8), status: 'taken' },
  ];
  const rows = doseTimings([IR], doses, runs);
  assert.deepStrictEqual(rows.map((r) => [r.doseId, r.kickMin, r.dropMin, r.food, r.foodGapMin]), [
    ['a', 25, 230, '2 eggs + Ready bar', 5],
    ['b', 40, 105, null, null],
  ]);
});

test('grouped by meal, the middle value of each', () => {
  const rows = [
    { food: '2 eggs + Ready bar', kickMin: 20, dropMin: 220 },
    { food: '2 Eggs + Ready Bar', kickMin: 30, dropMin: 240 },
    { food: '2 eggs + ready bar', kickMin: 90, dropMin: null },
    { food: null, kickMin: 40, dropMin: 100 },
  ];
  assert.deepStrictEqual(timingByFood(rows), [
    { food: '2 eggs + Ready bar', n: 3, kickMin: 30, dropMin: 230 },
    { food: null, n: 1, kickMin: 40, dropMin: 100 },
  ]);
});

test('minutes, in words', () => {
  assert.strictEqual(formatMinutes(25), '25 min');
  assert.strictEqual(formatMinutes(230), '3h 50m');
  assert.strictEqual(formatMinutes(120), '2h');
  assert.strictEqual(formatMinutes(null), '—');
  assert.strictEqual(minutesAfter({ takenAt: at(24, 8) }, at(24, 7)), 0, 'never negative');
});

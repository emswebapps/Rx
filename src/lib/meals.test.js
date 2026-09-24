import { test } from 'node:test';
import assert from 'node:assert';

import { mealLog, focusByFood } from './meals.js';
import { markStep, markAte } from './routine.js';

const at = (d, h, m = 0) => new Date(2026, 8, d, h, m).getTime();
const IR = {
  id: 'ir', name: 'Adderall IR',
  schedule: {
    days: [0, 1, 2, 3, 4, 5, 6],
    times: [
      { id: 't1', mode: 'clock', time: '08:00', routine: [
        { id: 'm1', kind: 'meal', text: '2 eggs' }, { id: 'w', kind: 'wait', minutes: 15 }, { id: 'd', kind: 'dose' }] },
      { id: 't2', mode: 'clock', time: '12:00', routine: [
        { id: 'm2', kind: 'meal', text: 'Protein bar + string cheese' }, { id: 'd', kind: 'dose' }] },
    ],
  },
};

test('each meal checked off is a row, with the dose it went with', () => {
  let runs = markStep([], at(24, 12), 'ir', 't1', 'm1', at(24, 7, 45));
  runs = markStep(runs, at(24, 12), 'ir', 't2', 'm2', at(24, 11, 50));
  runs = markAte(runs, at(24, 12), 'ir', 't2', 'm2', 'Bagel');
  const doses = [
    { id: 'a', medId: 'ir', slotId: 't1', takenAt: at(24, 8, 0), status: 'taken' },
    { id: 'b', medId: 'ir', slotId: 't2', takenAt: at(24, 12, 5), status: 'taken' },
  ];
  const effects = [{ doseId: 'a', phase: 'working', focus: 5, at: at(24, 9, 30) }];
  const rows = mealLog([IR], doses, runs, effects);
  assert.deepStrictEqual(rows.map((r) => [r.food, r.changed, r.doseNumber, r.minutesBefore, r.focus]), [
    ['Bagel', true, 2, 15, null],
    ['2 eggs', false, 1, 15, 5],
  ]);
  assert.strictEqual(rows[0].planned, 'Protein bar + string cheese');
});

test('clearing the "something else" goes back to the plan', () => {
  let runs = markStep([], at(24, 12), 'ir', 't1', 'm1', at(24, 7, 45));
  runs = markAte(runs, at(24, 12), 'ir', 't1', 'm1', 'Toast');
  runs = markAte(runs, at(24, 12), 'ir', 't1', 'm1', '');
  assert.strictEqual(mealLog([IR], [], runs)[0].food, '2 eggs');
});

test('focus by food needs a couple of rated doses before it says anything', () => {
  const rows = [
    { food: '2 eggs', focus: 5 }, { food: '2 Eggs', focus: 4 },
    { food: 'Bagel', focus: 2 }, { food: 'Bagel', focus: 3 }, { food: 'Nothing', focus: 1 },
  ];
  assert.deepStrictEqual(focusByFood(rows), [
    { food: '2 eggs', n: 2, focus: 4.5 }, { food: 'Bagel', n: 2, focus: 2.5 },
  ]);
});

test('a meal logged with the dose shows up too, with its option', () => {
  const doses = [{ id: 'x', medId: 'ir', slotId: 't2', takenAt: at(24, 12), status: 'taken', meal: { name: 'Lunch', option: 'Half an avocado' } }];
  const rows = mealLog([IR], doses, []);
  assert.deepStrictEqual(rows.map((r) => [r.food, r.doseNumber, r.minutesBefore]), [['Lunch + Half an avocado', 2, 0]]);
});

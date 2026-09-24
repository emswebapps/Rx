import { test } from 'node:test';
import assert from 'node:assert';

import {
  mealsForDay, markMeal, unmarkMeal, findEaten, mergeMealPlan, describeTiming,
  dueMealTags, nextMealDue, mealTag, normalizePlanMeal,
} from './mealPlan.js';
import { markStep } from './routine.js';
import { nextUp } from './next.js';
import { expectedDosesOnDay } from './meds.js';
import { routinesForDay } from './routine.js';

const at = (h, m = 0) => new Date(2026, 8, 24, h, m).getTime();

// Two IR doses; breakfast is eaten right after the morning one, as a step in
// its routine.
const IR = {
  id: 'ir', name: 'Adderall IR', graceMinutes: 45, onsetHours: 4, durationHours: 3, spacing: 'clock',
  schedule: {
    days: [0, 1, 2, 3, 4, 5, 6],
    times: [
      { id: 't1', mode: 'clock', time: '08:00', routine: [
        { id: 'd', kind: 'dose' }, { id: 'bk', kind: 'meal', text: '2 eggs + Ready bar' }] },
      { id: 't2', mode: 'clock', time: '12:00' },
    ],
  },
};
const PLAN = {
  meals: [
    { id: 'lunch', name: 'Lunch', food: 'Ranch pouch + crackers + jerky', anchor: 'afterMeal', minutes: 210 },
    { id: 'dinner', name: 'Dinner', food: 'Ranch pouch + crackers + jerky', anchor: 'wearOff', minutes: 0 },
  ],
};
const dose1 = { id: 'a', medId: 'ir', slotId: 't1', takenAt: at(8), status: 'taken' };
const dose2 = { id: 'b', medId: 'ir', slotId: 't2', takenAt: at(12, 10), status: 'taken' };
const breakfast = markStep([], at(8), 'ir', 't1', 'bk', at(8, 5));

const day = (now, { doses = [dose1], runs = breakfast, eaten = [], plan = PLAN } = {}) => mealsForDay({
  plan, eaten, runs, meds: [IR], doses, kit: {}, dayTs: now, now,
});
const pick = (rows) => rows.map((r) => [r.id, r.state, r.dueAt, r.projected]);

test('before a dose or a meal, there is nothing to count from yet', () => {
  assert.deepStrictEqual(pick(day(at(6), { doses: [], runs: [] })), [
    ['lunch', 'waiting', null, false],
    ['dinner', 'waiting', null, false],
  ]);
});

test('lunch counts from breakfast; dinner is a projection while a dose is still to come', () => {
  assert.deepStrictEqual(pick(day(at(9))), [
    ['lunch', 'upcoming', at(11, 35), false],
    // The 12:00 dose, taken on time, wears off at 4:00.
    ['dinner', 'upcoming', at(16), true],
  ]);
});

test('with breakfast not ticked, lunch counts from the first dose', () => {
  assert.strictEqual(day(at(9), { runs: [] })[0].dueAt, at(11, 30));
});

test('a meal comes due, stays up for a couple of hours, then passes quietly', () => {
  assert.strictEqual(day(at(11, 40))[0].state, 'due');
  assert.strictEqual(day(at(13, 30))[0].state, 'due');
  assert.strictEqual(day(at(13, 40))[0].state, 'passed');
});

test('once the last dose is in, dinner is firm: when it wears off', () => {
  const rows = day(at(13), { doses: [dose1, dose2] });
  assert.deepStrictEqual(pick(rows)[1], ['dinner', 'upcoming', at(16, 10), false]);
  assert.strictEqual(day(at(16, 15), { doses: [dose1, dose2] })[1].state, 'due');
});

test('a projected dinner is never "due" — the dose it hangs off might move it', () => {
  // 4:05 PM, the second dose still not logged but not yet missed either.
  const late = { ...IR, graceMinutes: 600 };
  const rows = mealsForDay({ plan: PLAN, eaten: [], runs: breakfast, meds: [late], doses: [dose1], kit: {}, dayTs: at(16, 5), now: at(16, 5) });
  assert.strictEqual(rows[1].state, 'upcoming');
  assert.strictEqual(rows[1].projected, true);
});

test('eating, eating something else, skipping and undoing', () => {
  let eaten = markMeal([], at(12), 'lunch', { at: at(11, 50) });
  let rows = day(at(12), { eaten });
  assert.strictEqual(rows[0].state, 'eaten');
  assert.strictEqual(rows[0].eatenAt, at(11, 50));
  assert.strictEqual(rows[0].food, 'Ranch pouch + crackers + jerky');
  assert.strictEqual(rows[0].changed, false);

  eaten = markMeal(eaten, at(12), 'lunch', { at: at(11, 50), food: 'Turkey sandwich' });
  assert.strictEqual(eaten.length, 1, 'one entry per meal per day');
  rows = day(at(12), { eaten });
  assert.strictEqual(rows[0].food, 'Turkey sandwich');
  assert.strictEqual(rows[0].changed, true);

  eaten = markMeal(eaten, at(12), 'lunch', { skipped: true, at: at(12) });
  assert.strictEqual(day(at(12), { eaten })[0].state, 'skipped');
  assert.strictEqual(findEaten(eaten, at(12), 'lunch').food, undefined);

  eaten = unmarkMeal(eaten, at(12), 'lunch');
  assert.strictEqual(day(at(12), { eaten })[0].state, 'due');
});

test('"after I last ate" counts from an earlier meal on the list too', () => {
  const plan = { meals: [
    { id: 'snack', name: 'Snack', anchor: 'clock', time: '10:00' },
    { id: 'lunch', name: 'Lunch', anchor: 'afterMeal', minutes: 120 },
  ] };
  const eaten = markMeal([], at(10), 'snack', { at: at(10, 15) });
  const rows = day(at(10, 30), { plan, eaten });
  assert.deepStrictEqual(pick(rows), [
    ['snack', 'eaten', at(10), false],
    ['lunch', 'upcoming', at(12, 15), false],
  ]);
});

test('"after my first dose" and a set time', () => {
  const plan = { meals: [
    { id: 'b', name: 'Breakfast', anchor: 'firstDose', minutes: 0 },
    { id: 'c', name: 'Coffee', anchor: 'clock', time: '09:30' },
  ] };
  assert.deepStrictEqual(day(at(8, 30), { plan }).map((r) => r.dueAt), [at(8), at(9, 30)]);
});

test('the buzz is for a firm meal that has just come due, and only once it has', () => {
  const doses = [dose1, dose2];
  assert.deepStrictEqual(dueMealTags(day(at(11, 40), { doses: [dose1] }), at(11, 40)), [mealTag('2026-09-24', 'lunch')]);
  // An hour on, still up on Today but past the time worth a buzz.
  assert.deepStrictEqual(dueMealTags(day(at(12, 40), { doses }), at(12, 40)), []);
  assert.deepStrictEqual(dueMealTags(day(at(9)), at(9)), []);
  assert.strictEqual(nextMealDue(day(at(9))).id, 'lunch');
  // Dinner is still a projection until the last dose is in.
  const eaten = markMeal([], at(12), 'lunch', { at: at(11, 50) });
  assert.strictEqual(nextMealDue(day(at(12), { eaten })), null);
  assert.strictEqual(nextMealDue(day(at(13), { eaten, doses })).id, 'dinner');
});

test('a meal that has come due takes the top of Today', () => {
  const now = at(11, 40);
  const schedule = expectedDosesOnDay([IR], [dose1], now, now);
  const n = nextUp({ schedule, routines: routinesForDay(schedule, breakfast, now, now), meals: day(now), now });
  assert.strictEqual(n.kind, 'meal');
  assert.strictEqual(n.meal.id, 'lunch');
});

test('the plan cleans up what it is given', () => {
  assert.deepStrictEqual(mergeMealPlan(undefined), { meals: [] });
  const m = normalizePlanMeal({ anchor: 'nonsense', minutes: -30 }, 2);
  assert.deepStrictEqual([m.id, m.name, m.anchor, m.minutes], ['meal3', 'Meal 3', 'afterMeal', 0]);
});

test('timing in words', () => {
  assert.strictEqual(describeTiming(PLAN.meals[0]), '3h 30m after I last ate');
  assert.strictEqual(describeTiming(PLAN.meals[1]), 'When my last dose wears off');
  assert.strictEqual(describeTiming({ anchor: 'firstDose', minutes: 0 }), 'With my first dose');
  assert.strictEqual(describeTiming({ anchor: 'clock', time: '17:30' }), 'At 5:30 PM');
});

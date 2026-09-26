// Regenerates functions/fixtures/daily-cases.json — the recorded answers that
// src/lib/routine.js + water.js + mealPlan.js and functions/daily.js are BOTH
// asserted against: which routine wait has just run out, which water reminder
// is due, and which meal time has just come due, at every five minutes of one
// day.
//
// Same rule as the regimen fixture: run it deliberately, never to turn a red
// parity test green without reading why the answer moved.
//
//   TZ=America/New_York node scripts/make-daily-fixtures.mjs
import { writeFileSync } from 'node:fs';
import { expectedDosesToday } from '../src/lib/meds.js';
import { dueWaits, waitTag, markStep, dayKey } from '../src/lib/routine.js';
import { waterReminderTag } from '../src/lib/water.js';
import { mealsForDay, dueMealTags, markMeal } from '../src/lib/mealPlan.js';

const TZ = 'America/New_York';
if (process.env.TZ !== TZ) {
  console.error(`Run with TZ=${TZ}`);
  process.exit(1);
}
// 2026-09-24 is a Thursday in EDT (UTC-4).
const at = (h, m = 0) => Date.UTC(2026, 8, 24, h + 4, m);

const IR = {
  id: 'ir', name: 'Booster', kind: 'booster', graceMinutes: 45, onsetHours: 3, durationHours: 3,
  schedule: {
    times: [{
      id: 't1', mode: 'clock', time: '08:00', amount: 1,
      routine: [
        { id: 'eat', kind: 'task', text: 'Eat' },
        { id: 'w1', kind: 'wait', minutes: 30 },
        { id: 'take', kind: 'dose' },
        { id: 'w2', kind: 'wait', minutes: 20 },
        { id: 'water', kind: 'task', text: 'Full glass' },
      ],
    }],
    days: [0, 1, 2, 3, 4, 5, 6],
  },
  active: true,
};
const WATER = { enabled: true, everyMinutes: 45, goal: 3, until: '11:00' };

// Two doses, breakfast eaten just after the first as a step in its routine,
// and a plan hanging lunch and dinner off what happens.
const TWICE = {
  id: 'tw', name: 'Twice', kind: 'booster', graceMinutes: 45, onsetHours: 4, durationHours: 3, spacing: 'clock',
  schedule: {
    times: [
      { id: 't1', mode: 'clock', time: '08:00', amount: 1, routine: [
        { id: 'take', kind: 'dose' }, { id: 'bk', kind: 'meal', text: 'Breakfast' }] },
      { id: 't2', mode: 'clock', time: '12:00', amount: 1 },
    ],
    days: [0, 1, 2, 3, 4, 5, 6],
  },
  active: true,
};
const PLAN = {
  meals: [
    { id: 'snack', name: 'Snack', anchor: 'clock', time: '10:00' },
    { id: 'lunch', name: 'Lunch', anchor: 'afterMeal', minutes: 210 },
    { id: 'late', name: 'Late', anchor: 'firstDose', minutes: 600 },
    { id: 'dinner', name: 'Dinner', anchor: 'wearOff', minutes: 15 },
  ],
};

const scenarios = [
  {
    name: 'ate at 7:10, took it on time after the wait, glass at 9:00',
    meds: [IR],
    doses: [{ id: 'd1', medId: 'ir', slotId: 't1', takenAt: at(7, 42), status: 'taken' }],
    runs: markStep([], at(7, 10), 'ir', 't1', 'eat', at(7, 10)),
    water: [at(9)],
    kit: { water: WATER },
  },
  {
    name: 'ate at 7:10, nothing taken yet',
    meds: [IR],
    doses: [],
    runs: markStep([], at(7, 10), 'ir', 't1', 'eat', at(7, 10)),
    water: [],
    kit: { water: WATER },
  },
  {
    name: 'took it before the wait was up',
    meds: [IR],
    doses: [{ id: 'd1', medId: 'ir', slotId: 't1', takenAt: at(7, 20), status: 'taken' }],
    runs: markStep([], at(7, 10), 'ir', 't1', 'eat', at(7, 10)),
    water: [at(8), at(8, 30), at(9)],
    kit: { water: WATER },
  },
  {
    name: 'meal times: breakfast after the dose, snack skipped, second dose late',
    until: 19,
    live: true,
    meds: [TWICE],
    doses: [
      { id: 'd1', medId: 'tw', slotId: 't1', takenAt: at(8, 10), status: 'taken' },
      { id: 'd2', medId: 'tw', slotId: 't2', takenAt: at(12, 30), status: 'taken' },
    ],
    runs: markStep([], at(8), 'tw', 't1', 'bk', at(8, 20)),
    water: [],
    eaten: markMeal([], at(10), 'snack', { at: at(10), skipped: true }),
    kit: { mealPlan: PLAN },
  },
  {
    name: 'meal times: nothing logged at all',
    until: 19,
    live: true,
    meds: [TWICE],
    doses: [],
    runs: [],
    water: [],
    eaten: [],
    kit: { mealPlan: PLAN },
  },
];

const cases = [];
for (const s of scenarios) {
  for (let t = at(6); t <= at(s.until || 12); t += 5 * 60 * 1000) {
    // A `live` scenario only has what had happened by then: a dose logged at
    // 12:30 isn't there at 11. (The older ones were recorded with every dose
    // present all morning, and keep their answers.)
    const doses = s.live ? s.doses.filter((d) => d.takenAt <= t) : s.doses;
    const entries = expectedDosesToday(s.meds, doses, t);
    const waits = dueWaits(entries, s.runs, t, t).map((w) => waitTag(w.runId, w.stepId));
    const water = waterReminderTag(s.water, doses, s.kit.water, t, dayKey(t));
    const meals = dueMealTags(mealsForDay({
      plan: s.kit.mealPlan, eaten: s.eaten, runs: s.runs, meds: s.meds, doses, kit: s.kit, dayTs: t, now: t,
    }), t);
    cases.push({ scenario: s.name, now: t, waits, water, meals });
  }
}

writeFileSync(
  new URL('../functions/fixtures/daily-cases.json', import.meta.url),
  `${JSON.stringify({ tz: TZ, scenarios, cases }, null, 2)}\n`,
);
console.log(`wrote ${cases.length} cases`);

import { test } from 'node:test';
import assert from 'node:assert';

import { nextUp, groupSettled, formatUntil } from './next.js';
import { expectedDosesOnDay } from './meds.js';
import { routinesForDay, markStep } from './routine.js';

const at = (h, m = 0) => new Date(2026, 8, 24, h, m).getTime();
const IR = {
  id: 'ir', name: 'IR', graceMinutes: 45, onsetHours: 4, spacing: 'clock',
  schedule: {
    days: [0, 1, 2, 3, 4, 5, 6],
    times: [
      { id: 't1', mode: 'clock', time: '08:00', routine: [
        { id: 'm', kind: 'meal', text: '2 eggs' }, { id: 'w', kind: 'wait', minutes: 15 }, { id: 'd', kind: 'dose' }] },
      { id: 't2', mode: 'clock', time: '12:00' },
    ],
  },
};
const view = (now, runs = [], doses = [], window = null) => {
  const schedule = expectedDosesOnDay([IR], doses, now, now);
  return nextUp({ schedule, routines: routinesForDay(schedule, runs, now, now), window, now });
};

test('hours before, the next dose is what shows', () => {
  const n = view(at(5));
  assert.strictEqual(n.kind, 'dose');
  assert.strictEqual(n.at, at(8));
});

test('close to the dose, the routine’s first step takes over', () => {
  const n = view(at(7, 0));
  assert.strictEqual(n.kind, 'step');
  assert.strictEqual(n.step.text, '2 eggs');
});

test('a running wait beats everything', () => {
  const n = view(at(7, 40), markStep([], at(7), 'ir', 't1', 'm', at(7, 35)));
  assert.strictEqual(n.kind, 'wait');
  assert.strictEqual(n.endsAt, at(7, 50));
  assert.strictEqual(n.then.kind, 'dose');
});

test('after the last dose, the crash window is next, then done', () => {
  const doses = [
    { id: 'a', medId: 'ir', slotId: 't1', takenAt: at(8), status: 'taken' },
    { id: 'b', medId: 'ir', slotId: 't2', takenAt: at(12), status: 'taken' },
  ];
  const w = { start: at(16), end: at(19), provisional: false };
  assert.strictEqual(view(at(13), [], doses, w).kind, 'crash');
  assert.strictEqual(view(at(17), [], doses, w).kind, 'inCrash');
  assert.strictEqual(view(at(20), [], doses, w).kind, 'done');
});

test('a group folds away only when nothing in it is waiting on you', () => {
  assert.strictEqual(groupSettled([{ state: 'taken' }, { state: 'skipped' }]), true);
  assert.strictEqual(groupSettled([{ state: 'taken' }, { state: 'due' }]), false);
  assert.strictEqual(groupSettled([]), false);
});

test('short countdowns', () => {
  assert.strictEqual(formatUntil(45 * 1000), '45s');
  assert.strictEqual(formatUntil(14 * 60 * 1000), '14m');
  assert.strictEqual(formatUntil(125 * 60 * 1000), '2h 05m');
});

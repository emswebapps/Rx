import { test } from 'node:test';
import assert from 'node:assert';

import {
  routineSteps, stepsForSlot, routineState, markStep, markNotified, pruneRuns, findRun,
  routinesForDay, dueWaits, nextWaitEnd, routineDaySummary, dayKey, runId, formatCountdown,
  routinePreset,
} from './routine.js';
import { expectedDosesOnDay } from './meds.js';

const M = 60 * 1000;
const at = (h, m = 0) => new Date(2026, 8, 24, h, m, 0, 0).getTime();
const DAY = at(12);

const STEPS = [
  { id: 'eat', kind: 'task', text: '3 eggs' },
  { id: 'wait', kind: 'wait', minutes: 30 },
  { id: 'take', kind: 'dose' },
];

const IR = {
  id: 'ir', name: 'Adderall IR', form: 'tablet', graceMinutes: 45,
  schedule: { times: [{ id: 't1', mode: 'clock', time: '08:00', amount: 1, routine: STEPS }], days: [0, 1, 2, 3, 4, 5, 6] },
  active: true,
};

// ── cleaning up ─────────────────────────────────────────────────────────────

test('no routine is no routine', () => {
  assert.deepStrictEqual(routineSteps({}), []);
  assert.deepStrictEqual(routineSteps({ routine: [] }), []);
  assert.deepStrictEqual(routineSteps({ routine: [{ kind: 'dose' }] }), []);
});

test('a routine with no dose step gets one at the end', () => {
  const s = routineSteps({ routine: [{ id: 'a', kind: 'task', text: 'Eat' }] });
  assert.deepStrictEqual(s.map((x) => x.kind), ['task', 'dose']);
});

test('a wait at the top has nothing to start from and is dropped', () => {
  const s = routineSteps({ routine: [{ id: 'w', kind: 'wait', minutes: 10 }, { id: 'a', kind: 'task', text: 'Eat' }] });
  assert.deepStrictEqual(s.map((x) => x.kind), ['task', 'dose']);
});

test('two waits in a row are one longer wait, and a second dose step is dropped', () => {
  const s = routineSteps({
    routine: [
      { id: 'a', kind: 'task', text: 'Eat' },
      { id: 'w1', kind: 'wait', minutes: 10 },
      { id: 'w2', kind: 'wait', minutes: 20 },
      { id: 'd1', kind: 'dose' },
      { id: 'd2', kind: 'dose' },
    ],
  });
  assert.deepStrictEqual(s.map((x) => x.kind), ['task', 'wait', 'dose']);
  assert.strictEqual(s[1].minutes, 30);
});

test('the preset is eat, wait, take', () => {
  assert.deepStrictEqual(routinePreset(30).map((x) => x.kind), ['meal', 'wait', 'dose']);
  assert.strictEqual(routinePreset(45)[1].minutes, 45);
});

// ── walking it ──────────────────────────────────────────────────────────────

test('before anything, the first step is the one to do and the rest wait on it', () => {
  const r = routineState(routineSteps({ routine: STEPS }), null, null, at(7));
  assert.deepStrictEqual(r.steps.map((s) => s.state), ['active', 'locked', 'locked']);
  assert.strictEqual(r.current.id, 'eat');
});

test('the wait starts the moment the step before it is checked off', () => {
  const run = { done: { eat: at(7, 2) } };
  const r = routineState(routineSteps({ routine: STEPS }), run, null, at(7, 10));
  assert.deepStrictEqual(r.steps.map((s) => s.state), ['done', 'waiting', 'locked']);
  assert.strictEqual(r.steps[1].endsAt, at(7, 32));
  assert.strictEqual(r.waitingUntil, at(7, 32));
});

test('eating late moves the wait with it — the clock follows what happened', () => {
  const run = { done: { eat: at(8, 15) } };
  const r = routineState(routineSteps({ routine: STEPS }), run, null, at(8, 20));
  assert.strictEqual(r.steps[1].endsAt, at(8, 45));
});

test('once the wait is up the dose is the one to do', () => {
  const run = { done: { eat: at(7, 2) } };
  const r = routineState(routineSteps({ routine: STEPS }), run, null, at(7, 32));
  assert.deepStrictEqual(r.steps.map((s) => s.state), ['done', 'done', 'active']);
});

test('taken after the full wait, the routine was followed', () => {
  const run = { done: { eat: at(7, 2) } };
  const dose = { takenAt: at(7, 35), status: 'taken' };
  const r = routineState(routineSteps({ routine: STEPS }), run, dose, at(9));
  assert.ok(r.complete);
  assert.ok(r.followed);
});

test('taken before the wait was up, it is done but not followed', () => {
  const run = { done: { eat: at(7, 2) } };
  const dose = { takenAt: at(7, 15), status: 'taken' };
  const r = routineState(routineSteps({ routine: STEPS }), run, dose, at(7, 20));
  // The wait stops counting down: the thing it was waiting for has happened.
  assert.deepStrictEqual(r.steps.map((s) => s.state), ['done', 'done', 'done']);
  assert.strictEqual(r.waitingUntil, null);
  assert.ok(r.steps[2].early);
  assert.ok(r.complete);
  assert.ok(!r.followed);
});

test('taken without eating first, it is not followed', () => {
  const dose = { takenAt: at(7, 15), status: 'taken' };
  const r = routineState(routineSteps({ routine: STEPS }), null, dose, at(9));
  assert.ok(!r.complete);
  assert.ok(!r.followed);
});

test('a dose skipped on purpose marks the step skipped', () => {
  const r = routineState(routineSteps({ routine: STEPS }), null, { takenAt: at(8), status: 'skipped' }, at(9));
  assert.strictEqual(r.steps[2].state, 'skipped');
  assert.ok(r.skipped);
});

// ── the run log ─────────────────────────────────────────────────────────────

test('marking a step creates the day’s run, and unmarking takes it back', () => {
  let runs = markStep([], DAY, 'ir', 't1', 'eat', at(7, 2));
  assert.strictEqual(runs.length, 1);
  assert.strictEqual(runs[0].id, runId(DAY, 'ir', 't1'));
  assert.strictEqual(runs[0].day, dayKey(DAY));
  assert.strictEqual(findRun(runs, at(20), 'ir', 't1').done.eat, at(7, 2));

  runs = markStep(runs, DAY, 'ir', 't1', 'eat', null);
  assert.strictEqual(runs.length, 1);
  assert.deepStrictEqual(runs[0].done, {});
});

test('old runs are pruned', () => {
  const old = { id: 'x', day: '2026-07-01', done: {} };
  const recent = markStep([], DAY, 'ir', 't1', 'eat', at(7));
  assert.deepStrictEqual(pruneRuns([old, ...recent], DAY).map((r) => r.id), [recent[0].id]);
});

// ── on the day's schedule ───────────────────────────────────────────────────

test('stepsForSlot reads the routine off a medication’s time', () => {
  assert.strictEqual(stepsForSlot(IR, 't1').length, 3);
  assert.deepStrictEqual(stepsForSlot(IR, 'nope'), []);
});

test('routines hang off the day’s entries', () => {
  const entries = expectedDosesOnDay([IR], [], DAY, at(7));
  const r = routinesForDay(entries, [], DAY, at(7));
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].current.id, 'eat');
});

test('a wait that has just ended is due to buzz, once', () => {
  const runs = markStep([], DAY, 'ir', 't1', 'eat', at(7, 2));
  const entries = (now) => expectedDosesOnDay([IR], [], DAY, now);

  assert.deepStrictEqual(dueWaits(entries(at(7, 20)), runs, DAY, at(7, 20)), []);
  const due = dueWaits(entries(at(7, 33)), runs, DAY, at(7, 33));
  assert.strictEqual(due.length, 1);
  assert.strictEqual(due[0].stepId, 'wait');

  const notified = markNotified(runs, due[0].runId, 'wait', at(7, 33));
  assert.deepStrictEqual(dueWaits(entries(at(7, 34)), notified, DAY, at(7, 34)), []);
});

test('a wait that ended long ago is not worth a buzz', () => {
  const runs = markStep([], DAY, 'ir', 't1', 'eat', at(7, 2));
  assert.deepStrictEqual(dueWaits(expectedDosesOnDay([IR], [], DAY, at(9)), runs, DAY, at(9)), []);
});

test('nextWaitEnd is the countdown the app arms a timer for', () => {
  const runs = markStep([], DAY, 'ir', 't1', 'eat', at(7, 2));
  const w = nextWaitEnd(expectedDosesOnDay([IR], [], DAY, at(7, 10)), runs, DAY, at(7, 10));
  assert.strictEqual(w.endsAt, at(7, 32));
});

test('the day’s summary counts only routines whose dose has settled', () => {
  const runs = markStep([], DAY, 'ir', 't1', 'eat', at(7, 2));
  // Still ahead: nothing counts yet.
  assert.deepStrictEqual(
    routineDaySummary(expectedDosesOnDay([IR], [], DAY, at(7, 10)), runs, DAY, at(7, 10)),
    { applicable: 0, followed: 0 },
  );
  const doses = [{ id: 'd', medId: 'ir', slotId: 't1', takenAt: at(7, 40), status: 'taken' }];
  assert.deepStrictEqual(
    routineDaySummary(expectedDosesOnDay([IR], doses, DAY, at(10)), runs, DAY, at(10)),
    { applicable: 1, followed: 1 },
  );
  // A deliberate skip is excluded, not failed.
  const skipped = [{ id: 'd', medId: 'ir', slotId: 't1', takenAt: at(8), status: 'skipped' }];
  assert.deepStrictEqual(
    routineDaySummary(expectedDosesOnDay([IR], skipped, DAY, at(10)), [], DAY, at(10)),
    { applicable: 0, followed: 0 },
  );
});

test('countdowns read as minutes and seconds', () => {
  assert.strictEqual(formatCountdown(30 * M), '30:00');
  assert.strictEqual(formatCountdown(61 * 1000), '1:01');
  assert.strictEqual(formatCountdown(3725 * 1000), '1:02:05');
  assert.strictEqual(formatCountdown(-5), '0:00');
});

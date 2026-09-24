import { test } from 'node:test';
import assert from 'node:assert';

import {
  complianceForDay, complianceDays, complianceSummary, crashDaySummary, dayWindow, scoreWord, WEIGHTS,
} from './compliance.js';
import { markStep } from './routine.js';

const at = (d, h, m = 0) => new Date(2026, 8, d, h, m, 0, 0).getTime();

const IR = {
  id: 'ir', name: 'IR', graceMinutes: 45, onsetHours: 4, durationHours: 2,
  schedule: {
    times: [{
      id: 't1', mode: 'clock', time: '08:00', amount: 1,
      routine: [{ id: 'eat', kind: 'task', text: 'Eat' }, { id: 'w', kind: 'wait', minutes: 30 }, { id: 'd', kind: 'dose' }],
    }],
    days: [0, 1, 2, 3, 4, 5, 6],
  },
  active: true,
};
const PLAIN = { ...IR, schedule: { ...IR.schedule, times: [{ id: 't1', mode: 'clock', time: '08:00', amount: 1 }] } };

const taken = (d, h, m = 0) => ({ id: `d${d}${h}${m}`, medId: 'ir', slotId: 't1', takenAt: at(d, h, m), status: 'taken' });

test('a day with nothing set up has no score, rather than zero', () => {
  assert.strictEqual(complianceForDay({}, at(24, 12), at(24, 23)).score, null);
});

test('only the parts that apply are counted', () => {
  // A plain med, taken on time, water off, no crash logged but the window
  // hasn't passed yet: just the dose counts, and it's perfect.
  const r = complianceForDay({ meds: [PLAIN], doses: [taken(24, 8, 10)] }, at(24, 12), at(24, 12));
  assert.strictEqual(r.score, 100);
  assert.deepStrictEqual(r.parts.filter((p) => p.value != null).map((p) => p.key), ['doses']);
});

test('the routine counts when it was followed', () => {
  const runs = markStep([], at(24, 12), 'ir', 't1', 'eat', at(24, 7, 30));
  const r = complianceForDay({ meds: [IR], doses: [taken(24, 8, 5)], runs }, at(24, 12), at(24, 12));
  assert.strictEqual(r.parts.find((p) => p.key === 'routine').value, 1);
  assert.strictEqual(r.score, 100);
});

test('cutting the wait short costs the routine part', () => {
  const runs = markStep([], at(24, 12), 'ir', 't1', 'eat', at(24, 7, 50));
  const r = complianceForDay({ meds: [IR], doses: [taken(24, 8, 0)], runs }, at(24, 12), at(24, 12));
  assert.strictEqual(r.parts.find((p) => p.key === 'routine').value, 0);
  // 40 for doses at 1, 25 for routine at 0.
  assert.strictEqual(r.score, Math.round((100 * WEIGHTS.doses) / (WEIGHTS.doses + WEIGHTS.routine)));
});

test('a routine does not count against days before it was set up', () => {
  const since = {
    ...IR,
    schedule: { ...IR.schedule, times: [{ ...IR.schedule.times[0], routineSince: at(24, 7) }] },
  };
  const r = complianceForDay({ meds: [since], doses: [taken(23, 8, 5)] }, at(23, 12), at(23, 12));
  assert.strictEqual(r.parts.find((p) => p.key === 'routine').value, null);
});

test('a late dose is half a dose', () => {
  const r = complianceForDay({ meds: [PLAIN], doses: [taken(24, 10)] }, at(24, 12), at(24, 12));
  assert.strictEqual(r.parts[0].value, 0.5);
});

test('a skipped-on-purpose dose is not counted either way', () => {
  const doses = [{ ...taken(24, 8), status: 'skipped' }];
  assert.strictEqual(complianceForDay({ meds: [PLAIN], doses }, at(24, 12), at(24, 12)).score, null);
});

test('water on today waits for the cutoff or the goal before it counts', () => {
  const kit = { water: { enabled: true, goal: 4, everyMinutes: 60, until: '20:00' } };
  const data = { meds: [PLAIN], doses: [taken(24, 8)], kit, water: [at(24, 9), at(24, 10)] };
  assert.strictEqual(complianceForDay(data, at(24, 12), at(24, 12)).parts.find((p) => p.key === 'water').value, null);
  assert.strictEqual(complianceForDay(data, at(24, 12), at(24, 21)).parts.find((p) => p.key === 'water').value, 0.5);
  // A past day counts in full.
  const past = { ...data, water: [at(23, 9)] };
  assert.strictEqual(complianceForDay(past, at(23, 12), at(24, 12)).parts.find((p) => p.key === 'water').value, 0.25);
});

test('water does not count against days before it was switched on', () => {
  const kit = { water: { enabled: true, goal: 4, since: at(24, 7) } };
  assert.strictEqual(
    complianceForDay({ meds: [PLAIN], kit }, at(23, 12), at(24, 12)).parts.find((p) => p.key === 'water').value,
    null,
  );
});

test('the crash window comes from the day’s doses', () => {
  const w = dayWindow([IR], [taken(24, 8)], {}, at(24, 12));
  assert.strictEqual(w.start, at(24, 12));
  assert.strictEqual(w.end, at(24, 14));
  assert.strictEqual(dayWindow([IR], [], {}, at(24, 12)), null);
});

test('a check-in near the window counts; none, once it has passed, does not', () => {
  const doses = [taken(24, 8)];
  assert.strictEqual(crashDaySummary([IR], doses, {}, [], [], at(24, 12), at(24, 13)).applicable, false);
  assert.deepStrictEqual(
    { ...crashDaySummary([IR], doses, {}, [], [], at(24, 12), at(24, 16)), window: null },
    { applicable: true, used: false, window: null },
  );
  const behaviors = [{ at: at(24, 12, 30), signIds: [] }];
  assert.strictEqual(crashDaySummary([IR], doses, {}, [], behaviors, at(24, 12), at(24, 13)).used, true);
  const sessions = [{ startedAt: at(24, 11, 30) }];
  assert.strictEqual(crashDaySummary([IR], doses, {}, sessions, [], at(24, 12), at(24, 16)).used, true);
});

test('thirty days, and the summary over them', () => {
  const doses = [];
  const behaviors = [];
  for (let d = 1; d <= 24; d += 1) {
    doses.push(taken(d, 8, 5));
    behaviors.push({ at: at(d, 13), signIds: [] });
  }
  const days = complianceDays({ meds: [{ ...PLAIN, createdAt: at(1, 0) }], doses, behaviors }, { now: at(24, 12) });
  assert.strictEqual(days.length, 30);
  const s = complianceSummary(days);
  assert.strictEqual(s.today, 100);
  assert.strictEqual(s.week, 100);
  assert.strictEqual(s.goodRun, 24);
});

test('a bad day breaks the run of good ones', () => {
  const days = [{ score: 100 }, { score: 40 }, { score: 90 }, { score: 95 }];
  assert.strictEqual(complianceSummary(days).goodRun, 2);
  // Today, still low, doesn't break it yet.
  assert.strictEqual(complianceSummary([...days, { score: 20 }]).goodRun, 2);
});

test('the word under the number', () => {
  assert.strictEqual(scoreWord(95), 'Great');
  assert.strictEqual(scoreWord(80), 'Good');
  assert.strictEqual(scoreWord(65), 'Slipping');
  assert.strictEqual(scoreWord(10), 'Off track');
  assert.strictEqual(scoreWord(null), '');
});

test('a crash window that passed without a check-in costs its share', () => {
  const r = complianceForDay({ meds: [PLAIN], doses: [taken(23, 8, 5)] }, at(23, 12), at(24, 12));
  assert.strictEqual(r.score, Math.round((100 * WEIGHTS.doses) / (WEIGHTS.doses + WEIGHTS.crash)));
});

// The regimen maths.
//
// The parity fixture (regimen.parity.test.js) pins the headline behaviour
// against the scheduler's copy. This file covers the rest: the edges, the
// malformed input, and the promise that a dose logged before medications
// existed keeps working exactly as it did.

import { test } from 'node:test';
import assert from 'node:assert';

import {
  normalizeMed, activeMeds, atClock, parseISODate, takenDoses,
  expectedDosesToday, nextExpected, effectiveWindow, ruleMoments, dueRules,
  supplyStatus, supplyAfterDose, formatOffset, rulesForMed,
  newMed, withDoseCount,
  DEFAULT_GRACE_MINUTES, DEFAULT_MED,
} from './meds.js';

const H = 60 * 60 * 1000;
const M = 60 * 1000;
const DAY = new Date(2026, 7, 29, 12, 0, 0, 0).getTime();
const at = (h, m = 0) => new Date(2026, 7, 29, h, m, 0, 0).getTime();

const med = (over = {}) => ({ id: 'm', schedule: { mode: 'clock', time: '08:00' }, ...over });

// ── normalising ─────────────────────────────────────────────────────────────

test('a med saved before a field existed still reads correctly', () => {
  const m = normalizeMed({ id: 'x', name: 'Something' });
  assert.strictEqual(m.graceMinutes, DEFAULT_GRACE_MINUTES);
  assert.strictEqual(m.schedule.times.length, 1);
  assert.strictEqual(m.schedule.times[0].mode, 'clock');
  assert.strictEqual(m.schedule.times[0].amount, 1);
  assert.deepStrictEqual(m.schedule.days, [0, 1, 2, 3, 4, 5, 6]);
  assert.deepStrictEqual(m.rules, []);
  assert.strictEqual(m.active, true);
});

test('a one-dose-a-day med migrates into the multi-dose shape on read', () => {
  const m = normalizeMed({
    id: 'x',
    schedule: { mode: 'clock', time: '07:30', afterMedId: null, offsetHours: 6 },
    supply: { onHand: 30, perDose: 2 },
  });
  assert.strictEqual(m.schedule.times.length, 1);
  assert.strictEqual(m.schedule.times[0].time, '07:30');
  // perDose was the old home for "how many at once" — it has to survive, or a
  // two-tablet prescription silently starts counting down half as fast.
  assert.strictEqual(m.schedule.times[0].amount, 2);
});

test('an offset med migrates with its anchor and offset intact', () => {
  const m = normalizeMed({
    id: 'ir',
    schedule: { mode: 'offset', afterMedId: 'xr', offsetHours: 6 },
  });
  assert.strictEqual(m.schedule.times[0].mode, 'offset');
  assert.strictEqual(m.schedule.times[0].afterMedId, 'xr');
  assert.strictEqual(m.schedule.times[0].offsetHours, 6);
});

test('nonsense numbers fall back rather than propagating NaN', () => {
  const m = normalizeMed({ id: 'x', onsetHours: 'soon', durationHours: -3, graceMinutes: 'a while' });
  assert.strictEqual(m.onsetHours, 4);
  assert.strictEqual(m.durationHours, 5);
  assert.strictEqual(m.graceMinutes, DEFAULT_GRACE_MINUTES);
});

test('zero is a legitimate grace but not a legitimate onset', () => {
  assert.strictEqual(normalizeMed({ graceMinutes: 0 }).graceMinutes, 0);
  assert.strictEqual(normalizeMed({ onsetHours: 0 }).onsetHours, 4);
});

test('an archived med is not part of the regimen', () => {
  assert.deepStrictEqual(activeMeds([med({ active: false })]), []);
  assert.strictEqual(activeMeds([med(), null, undefined]).length, 1);
  assert.deepStrictEqual(activeMeds(undefined), []);
});

// ── clocks ──────────────────────────────────────────────────────────────────

test('a clock time resolves onto the day it is asked about', () => {
  assert.strictEqual(atClock(DAY, '08:00'), at(8));
  assert.strictEqual(atClock(DAY, '8:05'), at(8, 5));
  assert.strictEqual(atClock(DAY, '23:59'), at(23, 59));
});

test('an unusable clock time is null, not a wrong time', () => {
  for (const bad of ['', 'morning', '25:00', '08:60', null, undefined, '0800']) {
    assert.strictEqual(atClock(DAY, bad), null, `${bad} should not parse`);
  }
});

test('a refill date is local midnight, not UTC midnight', () => {
  assert.strictEqual(parseISODate('2026-09-04'), new Date(2026, 8, 4).getTime());
  assert.ok(Number.isNaN(parseISODate('nope')));
  assert.ok(Number.isNaN(parseISODate('')));
});

test('a dose marked skipped is not a dose', () => {
  const doses = [
    { id: 'a', takenAt: at(8), status: 'taken' },
    { id: 'b', takenAt: at(9), status: 'skipped' },
    { id: 'c', takenAt: at(10) },
  ];
  assert.deepStrictEqual(takenDoses(doses).map((d) => d.id), ['c', 'a']);
});

// ── what was due ────────────────────────────────────────────────────────────

test('a dose moves through upcoming, due and skipped', () => {
  const meds = [med({ graceMinutes: 45 })];
  const state = (t) => expectedDosesToday(meds, [], t)[0].state;
  assert.strictEqual(state(at(7, 59)), 'upcoming');
  assert.strictEqual(state(at(8)), 'due');
  assert.strictEqual(state(at(8, 45)), 'due');
  assert.strictEqual(state(at(8, 46)), 'skipped');
});

test('logging it at any point makes it taken', () => {
  const meds = [med()];
  const doses = [{ id: 'd', takenAt: at(11), medId: 'm', status: 'taken' }];
  assert.strictEqual(expectedDosesToday(meds, doses, at(12))[0].state, 'taken');
});

test('a dose logged yesterday does not count as today', () => {
  const yesterday = at(8) - 24 * H;
  const doses = [{ id: 'd', takenAt: yesterday, medId: 'm', status: 'taken' }];
  assert.strictEqual(expectedDosesToday([med()], doses, at(12))[0].state, 'skipped');
});

test('an offset med hangs off the anchor’s real time once it is logged', () => {
  const meds = [
    med({ id: 'xr', schedule: { mode: 'clock', time: '08:00' } }),
    med({ id: 'ir', schedule: { mode: 'offset', afterMedId: 'xr', offsetHours: 6 } }),
  ];
  // Nothing logged: falls back to the anchor's scheduled time.
  assert.strictEqual(expectedDosesToday(meds, [], at(9))[1].expectedAt, at(14));
  // Logged late: the booster is dragged late with it.
  const doses = [{ id: 'd', takenAt: at(10, 30), medId: 'xr', status: 'taken' }];
  assert.strictEqual(expectedDosesToday(meds, doses, at(12))[1].expectedAt, at(16, 30));
});

test('a broken offset chain resolves to unknown instead of a wrong time', () => {
  const orphan = med({ id: 'ir', schedule: { mode: 'offset', afterMedId: 'gone', offsetHours: 6 } });
  const e = expectedDosesToday([orphan], [], at(12))[0];
  assert.strictEqual(e.expectedAt, null);
  assert.strictEqual(e.state, 'unknown');
});

test('two meds pointing at each other terminate rather than hanging', () => {
  const meds = [
    med({ id: 'a', schedule: { mode: 'offset', afterMedId: 'b', offsetHours: 1 } }),
    med({ id: 'b', schedule: { mode: 'offset', afterMedId: 'a', offsetHours: 1 } }),
  ];
  const states = expectedDosesToday(meds, [], at(12)).map((e) => e.state);
  assert.deepStrictEqual(states, ['unknown', 'unknown']);
});

test('the next dose is the soonest one still ahead', () => {
  const meds = [
    med({ id: 'pm', schedule: { mode: 'clock', time: '14:00' } }),
    med({ id: 'am', schedule: { mode: 'clock', time: '08:00' } }),
  ];
  assert.strictEqual(nextExpected(meds, [], at(7)).medId, 'am');
  assert.strictEqual(nextExpected(meds, [], at(10)).medId, 'pm');
  assert.strictEqual(nextExpected(meds, [], at(23)), null);
});

// ── the window ──────────────────────────────────────────────────────────────

test('with nothing logged there is no window at all', () => {
  assert.strictEqual(effectiveWindow([med()], [], {}, at(12)), null);
  assert.strictEqual(effectiveWindow([], [], {}, at(12)), null);
});

test('a dose with no medId still uses the kit’s own numbers', () => {
  // The promise to everything logged before medications existed.
  const w = effectiveWindow([], [{ id: 'old', takenAt: at(8) }], { onsetHours: 4, durationHours: 5 }, at(12));
  assert.strictEqual(w.start, at(12));
  assert.strictEqual(w.end, at(17));
  assert.strictEqual(w.provisional, false);
});

test('the governing span is the one that ends last, not the one logged last', () => {
  const meds = [
    med({ id: 'long', onsetHours: 9, durationHours: 5 }),
    med({ id: 'short', onsetHours: 1, durationHours: 1, schedule: { mode: 'clock', time: '13:00' } }),
  ];
  const doses = [
    { id: 'd1', takenAt: at(8), medId: 'long', status: 'taken' },
    { id: 'd2', takenAt: at(13), medId: 'short', status: 'taken' }, // later dose, earlier end
  ];
  const w = effectiveWindow(meds, doses, {}, at(15));
  assert.strictEqual(w.doseId, 'd1');
  assert.strictEqual(w.start, at(17));
});

test('a still-expected dose only ever moves the window later', () => {
  const meds = [
    med({ id: 'long', onsetHours: 9, durationHours: 5 }),
    // A booster so short it would end before the long-acting one does.
    med({ id: 'tiny', onsetHours: 1, durationHours: 1, schedule: { mode: 'clock', time: '13:00' } }),
  ];
  const doses = [{ id: 'd1', takenAt: at(8), medId: 'long', status: 'taken' }];
  const w = effectiveWindow(meds, doses, {}, at(12));
  assert.strictEqual(w.provisional, false, 'a dose that cannot extend the window is not a reason to hedge');
});

test('a dose older than a day stops governing anything', () => {
  const doses = [{ id: 'old', takenAt: at(12) - 30 * H }];
  assert.strictEqual(effectiveWindow([], doses, { onsetHours: 4 }, at(12)), null);
});

// ── rules ───────────────────────────────────────────────────────────────────

const ruleMed = med({
  id: 'm',
  rules: [
    { id: 'eat', text: 'Eat first', offsetMinutes: -60 },
    { id: 'water', text: 'Water', offsetMinutes: 0 },
    { id: 'blank', text: '   ', offsetMinutes: 30 },
  ],
});

test('a blank rule is not a rule', () => {
  assert.deepStrictEqual(ruleMoments([ruleMed], [], at(9)).map((r) => r.ruleId), ['eat', 'water']);
  assert.deepStrictEqual(rulesForMed(ruleMed).map((r) => r.id), ['eat', 'water']);
});

test('a rule is due from its moment until the grace runs out', () => {
  const due = (t) => dueRules([ruleMed], [], t).map((r) => r.ruleId);
  assert.deepStrictEqual(due(at(6, 59)), []);
  assert.deepStrictEqual(due(at(7)), ['eat']);
  assert.deepStrictEqual(due(at(7, 59)), ['eat']);
  assert.deepStrictEqual(due(at(8, 1)), ['water']);
});

test('a before-the-dose rule stops being due once the dose is taken', () => {
  const doses = [{ id: 'd', takenAt: at(7, 30), medId: 'm', status: 'taken' }];
  assert.deepStrictEqual(dueRules([ruleMed], doses, at(7, 40)).map((r) => r.ruleId), []);
});

test('an after-the-dose rule still fires once the dose is taken', () => {
  const after = med({ id: 'm', rules: [{ id: 'nocoffee', text: 'No coffee', offsetMinutes: 240 }] });
  const doses = [{ id: 'd', takenAt: at(8), medId: 'm', status: 'taken' }];
  assert.deepStrictEqual(dueRules([after], doses, at(12, 5)).map((r) => r.ruleId), ['nocoffee']);
});

test('offsets read as words', () => {
  assert.strictEqual(formatOffset(-60), '1h before');
  assert.strictEqual(formatOffset(0), 'at the dose');
  assert.strictEqual(formatOffset(90), '1h 30m after');
  assert.strictEqual(formatOffset(-15), '15m before');
});

// ── supply ──────────────────────────────────────────────────────────────────

test('days left is doses left, and low is the threshold you set', () => {
  const s = supplyStatus(med({ supply: { onHand: 6, perDose: 1, lowDays: 7 } }), DAY);
  assert.strictEqual(s.tracked, true);
  assert.strictEqual(s.dosesLeft, 6);
  assert.strictEqual(s.daysLeft, 6);
  assert.strictEqual(s.low, true);
});

test('two pills a dose is half as many days', () => {
  const s = supplyStatus(med({ supply: { onHand: 7, perDose: 2, lowDays: 2 } }), DAY);
  assert.strictEqual(s.dosesLeft, 3);
  assert.strictEqual(s.low, false);
});

test('not counting pills is not the same as having none', () => {
  const s = supplyStatus(med({ supply: { onHand: null } }), DAY);
  assert.strictEqual(s.tracked, false);
  assert.strictEqual(s.low, false, 'an untracked supply must never read as low');
  assert.strictEqual(s.daysLeft, null);
});

test('an empty bottle is tracked, and low', () => {
  const s = supplyStatus(med({ supply: { onHand: 0, lowDays: 7 } }), DAY);
  assert.strictEqual(s.tracked, true);
  assert.strictEqual(s.dosesLeft, 0);
  assert.strictEqual(s.low, true);
});

test('the fill window opens on its date and not before', () => {
  const m = med({ supply: { onHand: 5, refillFrom: '2026-09-04' } });
  assert.strictEqual(supplyStatus(m, DAY).refillOpen, false);
  assert.strictEqual(supplyStatus(m, DAY).daysUntilRefill, 6);
  assert.strictEqual(supplyStatus(m, new Date(2026, 8, 4, 9).getTime()).refillOpen, true);
  assert.strictEqual(supplyStatus(m, new Date(2026, 8, 4, 9).getTime()).daysUntilRefill, 0);
});

test('logging a dose counts one out of the supply, and never past zero', () => {
  assert.strictEqual(supplyAfterDose(med({ supply: { onHand: 10, perDose: 2 } })).onHand, 8);
  assert.strictEqual(supplyAfterDose(med({ supply: { onHand: 1, perDose: 2 } })).onHand, 0);
  assert.strictEqual(supplyAfterDose(med({ supply: { onHand: null } })), null, 'nothing to count');
});

// ── Starting a new one ──────────────────────────────────────────────────────

test('a new medication does not share its schedule with the defaults', () => {
  const a = newMed();
  const b = newMed();
  assert.notEqual(a.schedule, DEFAULT_MED.schedule);
  assert.notEqual(a.schedule.times[0], DEFAULT_MED.schedule.times[0]);
  assert.notEqual(a.supply, b.supply);
  assert.notEqual(a.schedule.days, b.schedule.days);

  a.supply.onHand = 30;
  a.schedule.times[0].time = '06:00';
  assert.equal(DEFAULT_MED.supply.onHand, null);
  assert.equal(newMed().schedule.times[0].time, '08:00');
});

test('a new medication still takes overrides', () => {
  const m = newMed({ name: 'x', schedule: { days: [1, 2, 3] } });
  assert.equal(m.name, 'x');
  assert.deepEqual(m.schedule.days, [1, 2, 3]);
  assert.equal(m.schedule.times.length, 1, 'unspecified parts still come from the defaults');
});

test('asking for more doses a day adds rows without moving the ones already set', () => {
  const one = newMed().schedule;
  one.times[0].time = '07:15';
  const three = withDoseCount(one, 3);
  assert.equal(three.times.length, 3);
  assert.equal(three.times[0].time, '07:15', 'the morning stays where it was put');
  assert.equal(three.times[1].time, '13:00');
  assert.equal(three.times[2].time, '18:00');
  assert.equal(new Set(three.times.map((t) => t.id)).size, 3, 'ids stay unique');
});

test('asking for fewer drops from the end and never reaches zero', () => {
  const three = withDoseCount(newMed().schedule, 3);
  assert.equal(withDoseCount(three, 1).times.length, 1);
  assert.equal(withDoseCount(three, 1).times[0].id, three.times[0].id);
  assert.equal(withDoseCount(three, 0).times.length, 1, 'a med due never is an archive, not a schedule');
  assert.equal(withDoseCount(three, -5).times.length, 1);
});

test('the dose count is capped rather than producing an unusable form', () => {
  assert.equal(withDoseCount(newMed().schedule, 99).times.length, 4);
});

test('asking for the count it already has changes nothing', () => {
  const s = newMed().schedule;
  assert.equal(withDoseCount(s, 1), s);
});

test('a schedule grown to more doses is still a schedule the app can read', () => {
  const m = normalizeMed(newMed({ schedule: withDoseCount(newMed().schedule, 2) }));
  assert.equal(m.schedule.times.length, 2);
  assert.ok(m.schedule.times.every((t) => t.mode === 'clock' && t.amount === 1));
});

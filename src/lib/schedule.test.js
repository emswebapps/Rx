// The Medisafe-shaped parts of the model: more than one dose a day, days off,
// amounts, and a skip that is a decision rather than a lapse.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeMed, expectedDosesOnDay, expectedDosesToday, scheduledOnDay,
  unitsPerScheduledDay, unitsPerCalendarDay, supplyStatus, supplyAfterDose,
  matchEntriesToSlots, nextScheduledDay, formatAmount, effectiveWindow,
  startOfDay,
} from './meds.js';

const DAY = 24 * 60 * 60 * 1000;
// A Wednesday, mid-afternoon.
const WED_3PM = new Date(2026, 3, 15, 15, 0, 0, 0).getTime();
// Ten minutes into the afternoon dose's 45-minute grace, for the cases that
// need it still open rather than already gone.
const WED_210PM = new Date(2026, 3, 15, 14, 10, 0, 0).getTime();
const at = (dayOffset, h, m = 0) =>
  new Date(2026, 3, 15 - dayOffset, h, m, 0, 0).getTime();

const TWICE = {
  id: 'tw', name: 'Methylphenidate', form: 'tablet', graceMinutes: 45,
  schedule: {
    times: [
      { id: 'am', mode: 'clock', time: '08:00', amount: 1 },
      { id: 'pm', mode: 'clock', time: '14:00', amount: 2 },
    ],
    days: [0, 1, 2, 3, 4, 5, 6],
  },
  supply: { onHand: 30, lowDays: 7, refillFrom: '' },
  active: true,
};

const log = (id, medId, dayOffset, h, m = 0, extra = {}) =>
  ({ id, medId, takenAt: at(dayOffset, h, m), status: 'taken', ...extra });

// ── More than one dose a day ────────────────────────────────────────────────

test('a twice-daily med produces two rows, in time order', () => {
  const rows = expectedDosesToday([TWICE], [], WED_3PM);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.slotId), ['am', 'pm']);
  assert.deepEqual(rows.map((r) => r.amount), [1, 2]);
});

test('each slot is tracked separately — morning taken, afternoon still due', () => {
  const rows = expectedDosesToday([TWICE], [log('d1', 'tw', 0, 8, 5)], WED_210PM);
  assert.equal(rows.find((r) => r.slotId === 'am').state, 'taken');
  assert.equal(rows.find((r) => r.slotId === 'pm').state, 'due');
});

test('an afternoon dose past its grace is missed while the morning one stands', () => {
  const rows = expectedDosesToday([TWICE], [log('d1', 'tw', 0, 8, 5)], WED_3PM);
  assert.equal(rows.find((r) => r.slotId === 'am').state, 'taken');
  assert.equal(rows.find((r) => r.slotId === 'pm').state, 'skipped');
});

test('rows carry a key unique per slot, not per medication', () => {
  const rows = expectedDosesToday([TWICE], [], WED_3PM);
  assert.equal(new Set(rows.map((r) => r.key)).size, 2);
});

test('a dose logged with its slotId is filed against that slot', () => {
  const rows = expectedDosesToday(
    [TWICE], [log('d1', 'tw', 0, 13, 30, { slotId: 'pm' })], WED_3PM,
  );
  assert.equal(rows.find((r) => r.slotId === 'pm').state, 'taken');
  assert.equal(rows.find((r) => r.slotId === 'am').state, 'skipped');
});

test('a dose logged without a slotId goes to the nearest slot, not the first', () => {
  // 1:50 PM is far closer to the 2 PM slot than the 8 AM one. Filing it
  // first-come would report the afternoon dose as a very late morning one.
  const rows = expectedDosesToday([TWICE], [log('d1', 'tw', 0, 13, 50)], WED_3PM);
  assert.equal(rows.find((r) => r.slotId === 'pm').state, 'taken');
  assert.equal(rows.find((r) => r.slotId === 'am').state, 'skipped');
});

test('an extra dose beyond the scheduled slots is reported, not silently dropped', () => {
  const slots = [{ id: 'am', expectedAt: at(0, 8) }];
  const { bySlot, unmatched } = matchEntriesToSlots(slots, [
    log('d1', 'tw', 0, 8, 5), log('d2', 'tw', 0, 12),
  ]);
  assert.equal(bySlot.size, 1);
  assert.equal(unmatched.length, 1);
});

// ── Days off ────────────────────────────────────────────────────────────────

const WEEKDAYS = {
  ...TWICE,
  id: 'wd',
  schedule: { times: [{ id: 'am', mode: 'clock', time: '08:00', amount: 1 }], days: [1, 2, 3, 4, 5] },
};

test('a weekdays-only med is not due at the weekend', () => {
  assert.equal(scheduledOnDay(WEEKDAYS, WED_3PM), true);
  const sat = startOfDay(WED_3PM) + 3 * DAY; // Wed -> Sat
  assert.equal(new Date(sat).getDay(), 6);
  assert.equal(scheduledOnDay(WEEKDAYS, sat), false);
});

test('a day off produces no rows at all, so it cannot read as a miss', () => {
  const sat = startOfDay(WED_3PM) + 3 * DAY;
  assert.deepEqual(expectedDosesOnDay([WEEKDAYS], [], sat, WED_3PM + 7 * DAY), []);
});

test('nextScheduledDay skips the days off', () => {
  const sat = startOfDay(WED_3PM) + 3 * DAY;
  const next = nextScheduledDay(WEEKDAYS, sat);
  assert.equal(new Date(next).getDay(), 1, 'Monday');
});

test('an offset dose is not resolved on a day its anchor is not taken', () => {
  const booster = {
    id: 'b', name: 'Booster', graceMinutes: 45, active: true,
    schedule: { times: [{ id: 'x', mode: 'offset', afterMedId: 'wd', offsetHours: 6, amount: 1 }], days: [0, 1, 2, 3, 4, 5, 6] },
    supply: {},
  };
  const sat = startOfDay(WED_3PM) + 3 * DAY;
  const rows = expectedDosesOnDay([WEEKDAYS, booster], [], sat, WED_3PM + 7 * DAY);
  assert.equal(rows.length, 1, 'only the booster row exists');
  assert.equal(rows[0].state, 'unknown', 'its anchor is off that day, so it has no time');
});

// ── Skipping on purpose ─────────────────────────────────────────────────────

test('a deliberate skip is distinguished from a dose simply never logged', () => {
  const skipped = { id: 's1', medId: 'tw', takenAt: at(0, 8, 30), status: 'skipped', slotId: 'am' };
  const rows = expectedDosesToday([TWICE], [skipped], WED_210PM);
  assert.equal(rows.find((r) => r.slotId === 'am').state, 'skipped-on-purpose');
  assert.equal(rows.find((r) => r.slotId === 'pm').state, 'due');
});

test('a skipped dose stops the evening window being provisional', () => {
  const kit = { onsetHours: 4, durationHours: 5 };
  const taken = [log('d1', 'tw', 0, 8, 5)];

  const stillPending = effectiveWindow([TWICE], taken, kit, WED_210PM);
  assert.equal(stillPending.provisional, true, 'the 2 PM dose could still move it');

  const withSkip = effectiveWindow(
    [TWICE],
    [...taken, { id: 's', medId: 'tw', takenAt: at(0, 14, 1), status: 'skipped', slotId: 'pm' }],
    kit, WED_210PM,
  );
  assert.equal(withSkip.provisional, false, 'saying no settles it immediately');
});

// ── Amounts and supply ──────────────────────────────────────────────────────

test('units per day counts every dose, and scales for days off', () => {
  assert.equal(unitsPerScheduledDay(TWICE), 3);
  assert.equal(unitsPerCalendarDay(TWICE), 3);
  assert.equal(unitsPerScheduledDay(WEEKDAYS), 1);
  assert.equal(unitsPerCalendarDay(WEEKDAYS), 5 / 7);
});

test('days left reflects how fast the bottle actually empties', () => {
  // 30 tablets at 3 a day is 10 days, not 30.
  const s = supplyStatus(TWICE, WED_3PM);
  assert.equal(s.daysLeft, 10);
  assert.equal(s.perDay, 3);
});

test('a weekdays-only med stretches further than a daily one', () => {
  const s = supplyStatus({ ...WEEKDAYS, supply: { onHand: 10, lowDays: 7, refillFrom: '' } }, WED_3PM);
  assert.equal(s.perDay, 5 / 7);
  assert.equal(s.daysLeft, 14, 'ten weekday doses spans two calendar weeks');
});

test('logging a two-tablet dose counts two out of the bottle', () => {
  assert.equal(supplyAfterDose(TWICE, 2).onHand, 28);
  assert.equal(supplyAfterDose(TWICE, 1).onHand, 29);
});

test('a dose logged with no amount falls back to the first scheduled one', () => {
  assert.equal(supplyAfterDose(TWICE).onHand, 29);
});

test('formatAmount speaks the form, and gets the plural right', () => {
  assert.equal(formatAmount(1, 'tablet'), '1 tablet');
  assert.equal(formatAmount(2, 'tablet'), '2 tablets');
  assert.equal(formatAmount(1, 'capsule'), '1 capsule');
  assert.equal(formatAmount(5, 'liquid'), '5 mL');
});

test('a med with nothing counted reports no days left rather than zero', () => {
  const s = supplyStatus({ ...TWICE, supply: { onHand: null } }, WED_3PM);
  assert.equal(s.tracked, false);
  assert.equal(s.daysLeft, null);
  assert.equal(s.low, false);
});

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  adherenceForDay, adherenceDays, adherenceSummary, currentStreak, bestStreak,
  adherenceSentence, medsActiveOn, missesByMed, DAY_MS,
} from './adherence.js';
import { expectedDosesOnDay, startOfDay } from './meds.js';

// A fixed afternoon so "today" is unambiguous and the grace maths is readable.
const TODAY_2PM = new Date(2026, 3, 15, 14, 0, 0, 0).getTime();
const day = (offset) => startOfDay(TODAY_2PM) - offset * DAY_MS;
const at = (offset, h, m = 0) => new Date(2026, 3, 15 - offset, h, m, 0, 0).getTime();

const MORNING = {
  id: 'm1', name: 'Morning', schedule: { mode: 'clock', time: '08:00' }, graceMinutes: 45,
};

const dose = (medId, offset, h, m = 0) => ({
  id: `d-${medId}-${offset}-${h}`, medId, takenAt: at(offset, h, m), status: 'taken',
});

// ── The generalisation the whole file rests on ──────────────────────────────

test('a day already finished settles unlogged doses to skipped, not upcoming', () => {
  const entries = expectedDosesOnDay([MORNING], [], day(3), TODAY_2PM);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].state, 'skipped');
});

test('a dose still ahead today is upcoming, and a past-grace one today is skipped', () => {
  const evening = { id: 'm2', name: 'Evening', schedule: { mode: 'clock', time: '20:00' }, graceMinutes: 45 };
  const entries = expectedDosesOnDay([MORNING, evening], [], TODAY_2PM, TODAY_2PM);
  assert.equal(entries.find((e) => e.medId === 'm1').state, 'skipped');
  assert.equal(entries.find((e) => e.medId === 'm2').state, 'upcoming');
});

test('expectedDosesToday still resolves a clock med exactly as before', () => {
  const entries = expectedDosesOnDay([MORNING], [dose('m1', 0, 8, 10)], TODAY_2PM, TODAY_2PM);
  assert.equal(entries[0].state, 'taken');
  assert.equal(entries[0].late, false);
});

// ── Late is taken, but recorded ─────────────────────────────────────────────

test('a dose logged after the grace counts as taken, and is flagged late', () => {
  const d = adherenceForDay([MORNING], [dose('m1', 1, 11, 30)], day(1), TODAY_2PM);
  assert.equal(d.taken, 1);
  assert.equal(d.late, 1);
  assert.equal(d.onTime, 0);
  assert.equal(d.missed, 0);
});

test('a dose inside the grace is on time', () => {
  const d = adherenceForDay([MORNING], [dose('m1', 1, 8, 30)], day(1), TODAY_2PM);
  assert.equal(d.onTime, 1);
  assert.equal(d.late, 0);
});

test('a late day is still a clean day — late is not missed', () => {
  const days = [adherenceForDay([MORNING], [dose('m1', 1, 11, 30)], day(1), TODAY_2PM)];
  assert.equal(currentStreak(days), 1);
});

// ── Streaks ─────────────────────────────────────────────────────────────────

test('the streak survives a today whose dose has not come round yet', () => {
  const evening = { id: 'm2', name: 'Evening', schedule: { mode: 'clock', time: '20:00' }, graceMinutes: 45 };
  const doses = [dose('m2', 1, 20, 5), dose('m2', 2, 20, 5)];
  const days = adherenceDays([evening], doses, { days: 3, now: TODAY_2PM });

  // Today is incomplete (8 PM is still ahead of 2 PM) and must not reset it.
  assert.equal(days[days.length - 1].complete, false);
  assert.equal(currentStreak(days), 2);
});

test('a missed day breaks the streak', () => {
  const doses = [dose('m1', 1, 8, 5), dose('m1', 3, 8, 5)];
  const days = adherenceDays([MORNING], doses, { days: 4, now: TODAY_2PM });
  assert.equal(currentStreak(days), 0, 'today is already past its grace and unlogged');

  const withToday = adherenceDays([MORNING], [dose('m1', 0, 8, 5), ...doses], { days: 4, now: TODAY_2PM });
  assert.equal(currentStreak(withToday), 2, 'today and yesterday, then day 2 is missed');
});

test('a day with no meds expected is skipped rather than counted either way', () => {
  const recent = { ...MORNING, createdAt: at(1, 0, 1) };
  const days = adherenceDays([recent], [dose('m1', 0, 8, 5), dose('m1', 1, 8, 5)], { days: 5, now: TODAY_2PM });
  assert.equal(days[0].expected, 0, 'four days ago the med did not exist');
  assert.equal(currentStreak(days), 2);
});

test('bestStreak finds the longest clean run anywhere in the window', () => {
  const doses = [dose('m1', 1, 8, 5), dose('m1', 2, 8, 5), dose('m1', 3, 8, 5), dose('m1', 5, 8, 5)];
  const days = adherenceDays([MORNING], doses, { days: 7, now: TODAY_2PM });
  assert.equal(bestStreak(days), 3);
});

// ── Archived and not-yet-created meds ───────────────────────────────────────

test('an archived med does not inflate history for days it was not taken', () => {
  const archived = { ...MORNING, id: 'old', active: false, archivedAt: at(2, 12) };

  // It was active up to two days ago, so those days count and are missed.
  assert.equal(medsActiveOn([archived], day(4)).length, 1);
  assert.equal(medsActiveOn([archived], day(2)).length, 0, 'archived that day, no longer counted');
  assert.equal(medsActiveOn([archived], day(0)).length, 0);

  const days = adherenceDays([archived], [], { days: 5, now: TODAY_2PM });
  assert.equal(days[days.length - 1].expected, 0, 'today expects nothing from an archived med');
  assert.ok(days[0].missed > 0, 'the days it was active still count against it');
});

test('an archived med with no archive date is excluded rather than guessed at', () => {
  const archived = { ...MORNING, id: 'old', active: false };
  assert.equal(medsActiveOn([archived], day(4)).length, 0);
  const days = adherenceDays([archived], [], { days: 5, now: TODAY_2PM });
  assert.ok(days.every((d) => d.expected === 0));
  assert.equal(currentStreak(days), 0, 'no data is not a streak');
});

test('a med with no createdAt is treated as having always existed', () => {
  const days = adherenceDays([MORNING], [dose('m1', 1, 8, 5)], { days: 10, now: TODAY_2PM });
  assert.ok(days.every((d) => d.expected === 1));
});

// ── Summary ─────────────────────────────────────────────────────────────────

test('the on-time rate counts missed doses against it, not just late ones', () => {
  const doses = [dose('m1', 1, 8, 5), dose('m1', 2, 11, 30)];
  const days = adherenceDays([MORNING], doses, { days: 4, now: TODAY_2PM });
  const s = adherenceSummary(days);

  // Four days: today missed, 1 on time, 2 late, 3 missed.
  assert.equal(s.expected, 4);
  assert.equal(s.taken, 2);
  assert.equal(s.onTime, 1);
  assert.equal(s.late, 1);
  assert.equal(s.missed, 2);
  assert.equal(s.onTimeRate, 0.25);
});

test("today's pending doses are not counted as expected yet", () => {
  const evening = { id: 'm2', name: 'Evening', schedule: { mode: 'clock', time: '20:00' }, graceMinutes: 45 };
  const days = adherenceDays([evening], [dose('m2', 1, 20, 5)], { days: 2, now: TODAY_2PM });
  const s = adherenceSummary(days);
  assert.equal(s.expected, 1, 'only yesterday has resolved');
  assert.equal(s.onTimeRate, 1);
});

// ── The sentence ────────────────────────────────────────────────────────────

test('the home-screen sentence stays silent under a week of data', () => {
  const days = adherenceDays([MORNING], [dose('m1', 1, 8, 5)], { days: 3, now: TODAY_2PM });
  assert.equal(adherenceSentence(days), null);
});

test('the sentence leads with the streak once there is one', () => {
  const doses = Array.from({ length: 9 }, (_, i) => dose('m1', i, 8, 5));
  const days = adherenceDays([MORNING], doses, { days: 9, now: TODAY_2PM });
  assert.match(adherenceSentence(days), /9 days in a row/);
});

test('with no streak the sentence falls back to the last seven days', () => {
  const doses = Array.from({ length: 9 }, (_, i) => dose('m1', i, 8, 5)).filter((_, i) => i !== 0);
  const days = adherenceDays([MORNING], doses, { days: 9, now: TODAY_2PM });
  assert.match(adherenceSentence(days), /of the last 7 days/);
});

// ── Per-med breakdown ───────────────────────────────────────────────────────

test('missesByMed ranks the one that actually gets forgotten', () => {
  const booster = { id: 'm2', name: 'Booster', schedule: { mode: 'clock', time: '13:00' }, graceMinutes: 45 };
  const doses = [
    dose('m1', 1, 8, 5), dose('m1', 2, 8, 5), dose('m1', 3, 8, 5),
    dose('m2', 1, 13, 5),
  ];
  const days = adherenceDays([MORNING, booster], doses, { days: 4, now: TODAY_2PM });
  const ranked = missesByMed(days);
  assert.equal(ranked[0].medId, 'm2');
  assert.ok(ranked[0].missed > ranked[1].missed);
});

// ── Skipping on purpose, and days off ───────────────────────────────────────

test('a dose skipped on purpose is not counted against adherence', () => {
  const twice = {
    id: 'tw', graceMinutes: 45, active: true,
    schedule: {
      times: [
        { id: 'am', mode: 'clock', time: '08:00', amount: 1 },
        { id: 'pm', mode: 'clock', time: '13:00', amount: 1 },
      ],
      days: [0, 1, 2, 3, 4, 5, 6],
    },
    supply: {},
  };
  const doses = [
    { id: 'a', medId: 'tw', takenAt: at(1, 8, 5), status: 'taken', slotId: 'am' },
    { id: 'b', medId: 'tw', takenAt: at(1, 13, 2), status: 'skipped', slotId: 'pm' },
  ];
  const d = adherenceForDay([twice], doses, day(1), TODAY_2PM);

  assert.equal(d.expected, 1, 'only the dose actually expected of you');
  assert.equal(d.taken, 1);
  assert.equal(d.missed, 0);
  assert.equal(d.chosen, 1);
  assert.equal(currentStreak([d]), 1, 'choosing not to take one does not break a run');
});

test('a day the medication is not scheduled counts for nothing', () => {
  const weekdays = {
    id: 'wd', graceMinutes: 45, active: true,
    schedule: { times: [{ id: 'am', mode: 'clock', time: '08:00', amount: 1 }], days: [1, 2, 3, 4, 5] },
    supply: {},
  };
  const days = adherenceDays([weekdays], [], { days: 14, now: TODAY_2PM });
  const weekend = days.filter((d) => [0, 6].includes(new Date(d.dayTs).getDay()));
  assert.ok(weekend.length >= 2);
  assert.ok(weekend.every((d) => d.expected === 0), 'no weekend day is ever a miss');
});

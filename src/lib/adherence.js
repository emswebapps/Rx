// Did I actually take them?
//
// The dose log already knows. This turns it into the two or three sentences
// that are worth reading: how many days in a row went right, what share of
// doses landed on time, and which days didn't.
//
// Two things this file is careful about, because getting either wrong makes the
// number a lie:
//
//   1. There is no schedule history. A med is edited in place, so re-answering
//      "was Monday on time?" today uses *today's* schedule. Move a dose from
//      8 AM to 10 AM and last week's mornings quietly re-grade. Nothing here can
//      fix that without storing schedule versions; what it can do is keep the
//      lookback short (LOOKBACK_DAYS) and let the UI say plainly what the
//      numbers are computed against.
//
//   2. Archiving a med removes it from `activeMeds`, so its history would
//      vanish and every past day would look complete. Days before a med existed
//      are excluded via its `createdAt`, and archived meds are counted for the
//      days they were actually active when `archivedAt` records one — see
//      `medsActiveOn`. Neither is allowed to invent a day that went well.
//
// Pure and Firebase-free so `node --test` can run it.

import {
  activeMeds, normalizeMed, expectedDosesOnDay, startOfDay,
} from './meds.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Far enough back to show a pattern, near enough that the schedule still fits. */
export const LOOKBACK_DAYS = 30;

/**
 * The meds to hold a given day to.
 *
 * A med with no `createdAt` is assumed to have always existed — that's every med
 * saved before the field was added, and treating them as new instead would blank
 * out all the history those users already have.
 */
export function medsActiveOn(meds, dayTs) {
  const list = Array.isArray(meds) ? meds.filter(Boolean).map(normalizeMed) : [];
  const day = startOfDay(dayTs);
  return list.filter((m) => {
    const created = typeof m.createdAt === 'number' ? startOfDay(m.createdAt) : null;
    if (created != null && day < created) return false;
    // An archived med still counts for the days it was being taken. Without an
    // archive date there's no way to know which those were, so it counts only
    // while it's active — the conservative direction, since the alternative
    // credits days it may not have been on.
    if (m.active === false) {
      const archived = typeof m.archivedAt === 'number' ? startOfDay(m.archivedAt) : null;
      if (archived == null || day >= archived) return false;
    }
    return true;
  }).map((m) => ({ ...m, active: true }));
}

/**
 * One day's answer.
 *
 * `pending` is the honest state for a dose that simply hasn't come round yet —
 * today, and only today, has these. A day is `complete` when nothing is still
 * pending, which is what stops today from counting as a failure at 6 AM.
 */
export function adherenceForDay(meds, doses, dayTs, now = Date.now()) {
  const forDay = medsActiveOn(meds, dayTs);
  const entries = expectedDosesOnDay(forDay, doses, dayTs, now)
    .filter((e) => e.expectedAt != null || e.dose);

  const taken = entries.filter((e) => e.state === 'taken');
  const late = taken.filter((e) => e.late);
  const missed = entries.filter((e) => e.state === 'skipped');
  // A dose you decided not to take is not a dose you forgot. It is excluded
  // from `expected` entirely rather than counted either way — otherwise the
  // only way to keep an honest record is to lie about having taken something,
  // which is exactly the behaviour a compliance tool must not train.
  const chosen = entries.filter((e) => e.state === 'skipped-on-purpose');
  const pending = entries.filter((e) => e.state === 'upcoming' || e.state === 'due');

  return {
    dayTs: startOfDay(dayTs),
    expected: entries.length - chosen.length,
    taken: taken.length,
    onTime: taken.length - late.length,
    late: late.length,
    missed: missed.length,
    chosen: chosen.length,
    pending: pending.length,
    complete: pending.length === 0,
    entries,
  };
}

/**
 * The last `days` days, oldest first — the order a calendar strip reads in.
 *
 * Days before any med existed come back with `expected: 0` and are simply not
 * counted anywhere; an empty day is not a perfect day.
 */
export function adherenceDays(meds, doses, { days = LOOKBACK_DAYS, now = Date.now() } = {}) {
  const today = startOfDay(now);
  const out = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    out.push(adherenceForDay(meds, doses, today - i * DAY_MS, now));
  }
  return out;
}

/**
 * The headline numbers.
 *
 * `onTimeRate` is share of *expected* doses taken inside the grace, not share of
 * taken doses — a missed dose has to count against it, or the number goes up
 * when you skip one.
 */
export function adherenceSummary(days = []) {
  const counted = days.filter((d) => d.expected > 0);
  const expected = counted.reduce((n, d) => n + d.expected - d.pending, 0);
  const taken = counted.reduce((n, d) => n + d.taken, 0);
  const onTime = counted.reduce((n, d) => n + d.onTime, 0);
  const late = counted.reduce((n, d) => n + d.late, 0);
  const missed = counted.reduce((n, d) => n + d.missed, 0);

  const cleanDays = counted.filter((d) => d.complete && d.missed === 0 && d.expected > 0);

  return {
    days: counted.length,
    expected,
    taken,
    onTime,
    late,
    missed,
    takenRate: expected > 0 ? taken / expected : null,
    onTimeRate: expected > 0 ? onTime / expected : null,
    cleanDays: cleanDays.length,
  };
}

/**
 * Days in a row, counting back from today, with nothing missed.
 *
 * Today counts as unbroken while its doses are still ahead. A streak that resets
 * itself every morning at 00:01 — before there was any chance to take anything —
 * is worse than no streak at all, and this app is used by someone who will
 * notice.
 *
 * A day with no meds expected is skipped rather than treated as either a
 * success or a break: it carries no information.
 */
export function currentStreak(days = []) {
  let streak = 0;
  for (let i = days.length - 1; i >= 0; i -= 1) {
    const d = days[i];
    if (d.expected === 0) continue;
    if (d.missed > 0) break;
    // Today, still partly ahead: it hasn't earned a day yet, but it hasn't
    // broken anything either — keep walking back.
    if (!d.complete) continue;
    streak += 1;
  }
  return streak;
}

/** The longest run of clean days anywhere in the window. */
export function bestStreak(days = []) {
  let best = 0;
  let run = 0;
  for (const d of days) {
    if (d.expected === 0) continue;
    if (!d.complete) continue;
    if (d.missed > 0) { run = 0; continue; }
    run += 1;
    if (run > best) best = run;
  }
  return best;
}

/**
 * The one line for the home screen, or null when there isn't enough to say.
 *
 * Silence is the right answer under a week of data. "1 of 1 days on time" is
 * not encouraging, it's noise, and it makes the number look like it means less
 * than it does once there's real history behind it.
 */
export const MIN_DAYS_TO_SPEAK = 7;

export function adherenceSentence(days = []) {
  const complete = days.filter((d) => d.expected > 0 && d.complete);
  if (complete.length < MIN_DAYS_TO_SPEAK) return null;

  const streak = currentStreak(days);
  if (streak >= 3) {
    return `${streak} days in a row, nothing missed.`;
  }

  const recent = complete.slice(-7);
  const clean = recent.filter((d) => d.missed === 0).length;
  return `${clean} of the last ${recent.length} days, everything logged.`;
}

/** Which meds get missed most — only useful once there's something to compare. */
export function missesByMed(days = []) {
  const byMed = new Map();
  for (const d of days) {
    for (const e of d.entries) {
      const entry = byMed.get(e.medId) || { medId: e.medId, med: e.med, expected: 0, missed: 0, late: 0 };
      if (e.state === 'upcoming' || e.state === 'due') continue;
      if (e.state === 'skipped-on-purpose') continue;
      entry.expected += 1;
      if (e.state === 'skipped') entry.missed += 1;
      if (e.late) entry.late += 1;
      byMed.set(e.medId, entry);
    }
  }
  return [...byMed.values()].sort((a, b) => b.missed - a.missed || b.late - a.late);
}

export { DAY_MS };

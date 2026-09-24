// One number for "did I do it the way I meant to?"
//
// Adherence already answers whether the doses happened. Compliance answers the
// wider question the routine exists for: were they taken on time, was the
// routine around them followed, was the water drunk, and was the crash met
// with the protocol rather than ridden out alone.
//
// Each part is scored 0–1 and weighted. The rule that keeps the number honest
// is that a part that doesn't apply is left out and the rest are re-weighted.
// A routine that was never set up, water tracking that's off, a day with no
// crash window: none of them cost points, because a score that punishes you
// for not using a feature is measuring the app, not you. The same goes for
// anything still ahead today — a score that starts every morning at zero is
// just a clock.
//
// Pure and Firebase-free so `node --test` can run it.

import { adherenceForDay } from './adherence.js';
import {
  activeMeds, takenDoses, sameLocalDay, spanFor, startOfDay, atClock,
} from './meds.js';
import { routineDaySummary } from './routine.js';
import { mergeWater, waterDaySummary } from './water.js';

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

export const WEIGHTS = { doses: 40, routine: 25, water: 20, crash: 15 };

// How far either side of the predicted window a check-in still counts as
// meeting it. The prediction is a median, not a promise.
export const CRASH_SLACK_MS = 60 * MINUTE_MS;

export const COMPLIANCE_DAYS = 30;

/** A score this high or better is a good day, for the run of them. */
export const GOOD_DAY = 80;

/**
 * The window a day's doses produced — the span that ends last, the same rule
 * `effectiveWindow` uses — or null when nothing was taken that day.
 */
export function dayWindow(meds, doses, kit, dayTs) {
  const byId = new Map(activeMeds(meds).map((m) => [m.id, m]));
  const spans = takenDoses(doses)
    .filter((d) => sameLocalDay(d.takenAt, dayTs))
    .map((d) => spanFor(d, byId.get(d.medId), kit || {}));
  if (spans.length === 0) return null;
  return spans.reduce((a, b) => (b.end > a.end ? b : a));
}

/**
 * Did the protocol meet the crash?
 *
 * A session started, or a warning-sign check-in, anywhere near the window
 * counts. Until the window has passed an absence isn't a failure — it may not
 * have come yet.
 */
export function crashDaySummary(meds, doses, kit, sessions, behaviors, dayTs, now = Date.now()) {
  const w = dayWindow(meds, doses, kit, dayTs);
  if (!w) return { applicable: false, used: false, window: null };
  const lo = w.start - CRASH_SLACK_MS;
  const hi = w.end + CRASH_SLACK_MS;
  const inside = (t) => typeof t === 'number' && t >= lo && t <= hi;
  const used = (sessions || []).some((s) => s && inside(s.startedAt))
    || (behaviors || []).some((b) => b && inside(b.at));
  if (used) return { applicable: true, used: true, window: w };
  if (now < hi) return { applicable: false, used: false, window: w };
  return { applicable: true, used: false, window: w };
}

/**
 * Water counts from the day it was switched on (`since`), and on today only
 * once the goal is met or the cutoff has passed — before that the glasses are
 * still being drunk.
 */
function waterPart(log, cfg, dayTs, now) {
  const c = mergeWater(cfg);
  if (!c.enabled) return null;
  if (typeof c.since === 'number' && startOfDay(dayTs) < startOfDay(c.since)) return null;
  const s = waterDaySummary(log, c, dayTs);
  if (sameLocalDay(dayTs, now) && s.glasses < s.goal) {
    const cutoff = atClock(dayTs, c.until);
    if (cutoff == null || now < cutoff) return null;
  }
  return s;
}

/**
 * One day's score.
 *
 * `data` carries every slice the parts read: meds, doses, kit, sessions,
 * behaviors, runs (routine check-offs) and water (the glass log).
 */
export function complianceForDay(data, dayTs, now = Date.now()) {
  const {
    meds = [], doses = [], kit = {}, sessions = [], behaviors = [], runs = [], water = [],
  } = data || {};

  const adh = adherenceForDay(meds, doses, dayTs, now);
  const settled = adh.expected - adh.pending;
  const parts = [];

  // A late dose is half a dose on time: better than a miss, not as good as
  // the real thing. A deliberate skip is already out of `expected`.
  parts.push({
    key: 'doses',
    label: 'Doses on time',
    weight: WEIGHTS.doses,
    value: settled > 0 ? (adh.onTime + adh.late * 0.5) / settled : null,
    detail: settled > 0 ? `${adh.onTime} of ${settled} on time${adh.late ? `, ${adh.late} late` : ''}` : null,
  });

  const routine = routineDaySummary(adh.entries, runs, dayTs, now);
  parts.push({
    key: 'routine',
    label: 'Routine followed',
    weight: WEIGHTS.routine,
    value: routine.applicable > 0 ? routine.followed / routine.applicable : null,
    detail: routine.applicable > 0 ? `${routine.followed} of ${routine.applicable} followed` : null,
  });

  const w = waterPart(water, kit.water, dayTs, now);
  parts.push({
    key: 'water',
    label: 'Water goal',
    weight: WEIGHTS.water,
    value: w ? w.ratio : null,
    detail: w ? `${w.glasses} of ${w.goal} glasses` : null,
  });

  const crash = crashDaySummary(meds, doses, kit, sessions, behaviors, dayTs, now);
  parts.push({
    key: 'crash',
    label: 'Crash checked in',
    weight: WEIGHTS.crash,
    value: crash.applicable ? (crash.used ? 1 : 0) : null,
    detail: crash.applicable ? (crash.used ? 'Checked in' : 'No check-in') : null,
  });

  const counted = parts.filter((p) => p.value != null);
  const totalWeight = counted.reduce((n, p) => n + p.weight, 0);
  const score = totalWeight > 0
    ? Math.round((100 * counted.reduce((n, p) => n + p.weight * p.value, 0)) / totalWeight)
    : null;

  return { dayTs: startOfDay(dayTs), score, parts };
}

/** The last `days` days, oldest first. */
export function complianceDays(data, { days = COMPLIANCE_DAYS, now = Date.now() } = {}) {
  const today = startOfDay(now);
  const out = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    // Noon rather than midnight so a clock change can't land it on the
    // neighbouring day.
    out.push(complianceForDay(data, today - i * DAY_MS + 12 * 60 * MINUTE_MS, now));
  }
  return out;
}

function average(list) {
  const scored = list.filter((d) => d.score != null);
  if (scored.length === 0) return null;
  return Math.round(scored.reduce((n, d) => n + d.score, 0) / scored.length);
}

/**
 * The headline: today, the last week, the last month, and how many good days
 * in a row. Days with no score at all (nothing applied) are skipped by the
 * run, not counted as breaking it.
 */
export function complianceSummary(days = []) {
  const today = days.length ? days[days.length - 1] : null;
  let run = 0;
  for (let i = days.length - 1; i >= 0; i -= 1) {
    const d = days[i];
    if (d.score == null) continue;
    if (d.score < GOOD_DAY) {
      // Today can still come up; don't let a half-finished day break the run.
      if (i === days.length - 1) continue;
      break;
    }
    run += 1;
  }
  return {
    today: today ? today.score : null,
    week: average(days.slice(-7)),
    month: average(days),
    goodRun: run,
  };
}

/** "Great" / "Good" / "Slipping" / "Off track" — the word under the number. */
export function scoreWord(score) {
  if (score == null) return '';
  if (score >= 90) return 'Great';
  if (score >= GOOD_DAY) return 'Good';
  if (score >= 60) return 'Slipping';
  return 'Off track';
}

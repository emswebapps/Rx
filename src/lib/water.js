// Water.
//
// Stimulants make it easy to go a whole afternoon without drinking anything,
// and the crash that follows is worse for it. This counts glasses against a
// goal and says when the next one is due.
//
// The clock starts with the first dose of the day, not with waking up: before
// the medication there's nothing suppressing thirst, and a reminder at 6 AM
// for someone who dosed at 9 is just noise. It resets every time a glass is
// logged, and stops at the cutoff or once the goal is met.
//
// The goal, the interval and the cutoff are the user's numbers. Nothing here
// says how much anyone should drink.
//
// Pure and Firebase-free so `node --test` can run it. `functions/water.js` is
// the scheduler's CommonJS copy of `nextWaterDue`.

import { atClock, sameLocalDay, takenDoses } from './meds.js';

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

export const DEFAULT_WATER = {
  enabled: false,
  everyMinutes: 60,
  goal: 8,
  until: '20:00',
};

/** Glasses older than this are dropped from the log. */
export const WATER_KEEP_DAYS = 35;

function positive(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function mergeWater(saved = {}) {
  const s = saved || {};
  return {
    ...DEFAULT_WATER,
    ...s,
    enabled: s.enabled === true,
    everyMinutes: Math.round(positive(s.everyMinutes, DEFAULT_WATER.everyMinutes)),
    goal: Math.round(positive(s.goal, DEFAULT_WATER.goal)),
    until: /^\d{1,2}:\d{2}$/.test(String(s.until || '')) ? s.until : DEFAULT_WATER.until,
  };
}

/** The glasses logged on the local day containing `dayTs`, oldest first. */
export function glassesOnDay(log, dayTs) {
  if (!Array.isArray(log)) return [];
  return log
    .filter((t) => typeof t === 'number' && sameLocalDay(t, dayTs))
    .sort((a, b) => a - b);
}

/** The first dose actually taken that day, which is when the clock starts. */
export function firstDoseOnDay(doses, dayTs) {
  const today = takenDoses(doses).filter((d) => sameLocalDay(d.takenAt, dayTs));
  return today.length ? Math.min(...today.map((d) => d.takenAt)) : null;
}

/**
 * When the next glass is due, or null when there's nothing to remind about:
 * water tracking is off, nothing has been taken today, the goal is met, or
 * the next one would land after the cutoff.
 */
export function nextWaterDue(log, doses, cfg, now = Date.now()) {
  const c = mergeWater(cfg);
  if (!c.enabled) return null;
  const start = firstDoseOnDay(doses, now);
  if (start == null || start > now) return null;

  const glasses = glassesOnDay(log, now).filter((t) => t <= now);
  if (glasses.length >= c.goal) return null;

  const base = Math.max(start, glasses.length ? glasses[glasses.length - 1] : start);
  const due = base + c.everyMinutes * MINUTE_MS;
  const cutoff = atClock(now, c.until);
  if (cutoff != null && due > cutoff) return null;
  return due;
}

/**
 * The tag for the reminder that should be showing now, or null.
 *
 * One per missed interval: ignore the first and another comes one interval
 * later, and logging a glass moves every future one along. The client and the
 * scheduler build the same tag, so a buzz sent by one is never repeated by
 * the other.
 */
export function waterReminderTag(log, doses, cfg, now, dateKey) {
  const due = nextWaterDue(log, doses, cfg, now);
  if (due == null || now < due) return null;
  const c = mergeWater(cfg);
  const k = Math.floor((now - due) / (c.everyMinutes * MINUTE_MS));
  const count = glassesOnDay(log, now).filter((t) => t <= now).length;
  return `rx-water-${dateKey}-${count}-${k}`;
}

/** Add a glass at `at`, and drop anything older than the keep window. */
export function addGlass(log, at = Date.now()) {
  const list = Array.isArray(log) ? log.filter((t) => typeof t === 'number') : [];
  const oldest = at - WATER_KEEP_DAYS * DAY_MS;
  return [at, ...list.filter((t) => t >= oldest)];
}

/** Take back the most recent glass logged today — the undo for a mis-tap. */
export function removeLastGlass(log, now = Date.now()) {
  if (!Array.isArray(log)) return [];
  const today = glassesOnDay(log, now);
  if (today.length === 0) return log;
  const last = today[today.length - 1];
  const i = log.indexOf(last);
  return [...log.slice(0, i), ...log.slice(i + 1)];
}

/** How the day went against the goal, for the compliance score. */
export function waterDaySummary(log, cfg, dayTs) {
  const c = mergeWater(cfg);
  if (!c.enabled) return { applicable: false, glasses: 0, goal: c.goal, ratio: null };
  const glasses = glassesOnDay(log, dayTs).length;
  return { applicable: true, glasses, goal: c.goal, ratio: Math.min(1, glasses / c.goal) };
}

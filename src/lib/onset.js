// When it kicked in, and when it dropped off.
//
// The check-ins ask how a dose feels at two fixed moments. This asks for
// the two moments themselves: one tap when you feel it land and one when you
// feel it go. The minutes between taking it and each tap are the numbers
// that answer "did eating with it change anything?" Put the doses side by
// side by what was eaten with them, and your own mornings answer it.
//
// Both are stored on the dose itself, as `kickedInAt` and `droppedAt`, so
// they go wherever the dose goes: undo, export, backup.
//
// Nothing here says what a good number is. It counts minutes you tapped.
//
// Pure and Firebase-free so `node --test` can run it.

import { normalizeMed, takenDoses, sameLocalDay } from './meds.js';
import { mealLog } from './meals.js';

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

/** How long after a dose "It kicked in" is still offered. */
export const KICK_OPEN_MS = 3 * HOUR_MS;
/** How long after a dose "Dropping off" is still offered. */
export const DROP_OPEN_MS = 12 * HOUR_MS;

/**
 * What to ask about right now: the latest dose taken today, and which of the
 * two taps it's still waiting on. Null when there's nothing to ask.
 *
 * Only the newest dose is asked about — once the second one is in, how the
 * first one faded is already blurred into it.
 */
export function onsetPrompt(meds, doses, now = Date.now()) {
  const byId = new Map((meds || []).filter(Boolean).map((m) => [m.id, normalizeMed(m)]));
  const dose = takenDoses(doses).find((d) => d.takenAt <= now && sameLocalDay(d.takenAt, now)) || null;
  if (!dose) return null;
  const elapsed = now - dose.takenAt;
  const med = byId.get(dose.medId) || null;
  if (dose.droppedAt) return null;
  if (!dose.kickedInAt && elapsed <= KICK_OPEN_MS) return { dose, med, stage: 'kick' };
  if (elapsed <= DROP_OPEN_MS) return { dose, med, stage: 'drop' };
  return null;
}

/** Minutes from taking it to a tap, or null. */
export function minutesAfter(dose, at) {
  if (!dose || typeof at !== 'number' || typeof dose.takenAt !== 'number') return null;
  return Math.max(0, Math.round((at - dose.takenAt) / MINUTE_MS));
}

/**
 * One row per dose that has either tap, newest first, with what was eaten
 * alongside it: the meal step in that dose's routine, whichever side of the
 * dose it was on.
 */
export function doseTimings(meds, doses, runs) {
  const byId = new Map((meds || []).filter(Boolean).map((m) => [m.id, normalizeMed(m)]));
  const meals = mealLog(meds, doses, runs);
  const out = [];
  for (const d of takenDoses(doses)) {
    if (typeof d.kickedInAt !== 'number' && typeof d.droppedAt !== 'number') continue;
    const med = byId.get(d.medId) || null;
    // The meal ticked in this dose's own routine that day, if there was one.
    const meal = meals.find((r) => r.medId === d.medId && r.doseAt === d.takenAt) || null;
    out.push({
      doseId: d.id,
      medId: d.medId || null,
      medName: med ? med.name : '',
      takenAt: d.takenAt,
      kickMin: minutesAfter(d, d.kickedInAt),
      dropMin: minutesAfter(d, d.droppedAt),
      food: meal ? meal.food : null,
      foodGapMin: meal ? Math.round((meal.ateAt - d.takenAt) / MINUTE_MS) : null,
    });
  }
  return out;
}

function median(list) {
  if (list.length === 0) return null;
  const s = [...list].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

/**
 * The same doses grouped by what was eaten with them: the middle kick-in and
 * drop-off for each, so one odd morning doesn't swing it. Doses with no meal
 * logged are their own group — that's the comparison.
 */
export function timingByFood(rows) {
  const groups = new Map();
  for (const r of rows || []) {
    const key = r.food ? r.food.trim().toLowerCase() : '';
    const g = groups.get(key) || { food: r.food || null, kick: [], drop: [], n: 0 };
    g.n += 1;
    if (r.kickMin != null) g.kick.push(r.kickMin);
    if (r.dropMin != null) g.drop.push(r.dropMin);
    groups.set(key, g);
  }
  return [...groups.values()]
    .map((g) => ({ food: g.food, n: g.n, kickMin: median(g.kick), dropMin: median(g.drop) }))
    .sort((a, b) => b.n - a.n);
}

/** "25 min" / "3h 40m" */
export function formatMinutes(min) {
  if (min == null) return '—';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${String(m).padStart(2, '0')}m` : `${h}h`;
}

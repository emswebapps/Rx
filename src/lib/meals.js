// What was eaten before each dose.
//
// A stimulant taken on an empty stomach and one taken after two eggs are, in
// practice, two different medications. The routine already has you check the
// meal off; this reads those check-offs back as a log — what you had, when,
// how long before the dose, and (when you answered a check-in) how that dose
// went — so "does breakfast matter?" can be answered from your own mornings.
//
// Pure and Firebase-free so `node --test` can run it.

import { normalizeMed, takenDoses, sameLocalDay } from './meds.js';
import { routineSteps } from './routine.js';

const MINUTE_MS = 60 * 1000;

/**
 * One row per meal step checked off, newest first.
 *
 * `food` is what was actually eaten: the "ate something else" text when there
 * is one, the routine's own words otherwise. The dose is the one logged
 * against the same time slot that day, or failing that the first dose of that
 * medication taken after the meal.
 */
export function mealLog(meds, doses, runs, effects = []) {
  const byId = new Map((meds || []).filter(Boolean).map((m) => [m.id, normalizeMed(m)]));
  const taken = takenDoses(doses);
  const rows = [];

  for (const run of runs || []) {
    if (!run || !run.done) continue;
    const med = byId.get(run.medId);
    if (!med) continue;
    const slot = med.schedule.times.find((t) => t.id === run.slotId);
    const slotIndex = med.schedule.times.indexOf(slot);
    for (const step of routineSteps(slot)) {
      if (step.kind !== 'meal') continue;
      const ateAt = run.done[step.id];
      if (typeof ateAt !== 'number') continue;

      const sameDay = taken.filter((d) => d.medId === med.id && sameLocalDay(d.takenAt, ateAt));
      const dose = sameDay.find((d) => d.slotId === run.slotId)
        || sameDay.filter((d) => d.takenAt >= ateAt).sort((a, b) => a.takenAt - b.takenAt)[0]
        || null;
      const checkIn = dose
        ? (effects || []).find((e) => e && !e.dismissed && e.doseId === dose.id && e.phase === 'working')
        : null;
      const changed = Boolean(run.ate && run.ate[step.id]);

      rows.push({
        id: `${run.id}|${step.id}`,
        medId: med.id,
        medName: med.name,
        doseNumber: slotIndex + 1,
        planned: step.text,
        food: changed ? run.ate[step.id] : step.text,
        changed,
        ateAt,
        doseAt: dose ? dose.takenAt : null,
        minutesBefore: dose ? Math.round((dose.takenAt - ateAt) / MINUTE_MS) : null,
        focus: checkIn && checkIn.focus != null ? Number(checkIn.focus) : null,
      });
    }
  }
  return rows.sort((a, b) => b.ateAt - a.ateAt);
}

/**
 * Average "how's it working" focus by what was eaten, for foods with at least
 * `min` rated doses — the plain comparison, nothing inferred.
 */
export function focusByFood(rows, min = 2) {
  const groups = new Map();
  for (const r of rows || []) {
    if (r.focus == null) continue;
    const key = r.food.trim().toLowerCase();
    const g = groups.get(key) || { food: r.food, focus: [], };
    g.focus.push(r.focus);
    groups.set(key, g);
  }
  return [...groups.values()]
    .filter((g) => g.focus.length >= min)
    .map((g) => ({
      food: g.food,
      n: g.focus.length,
      focus: Math.round((g.focus.reduce((a, b) => a + b, 0) / g.focus.length) * 10) / 10,
    }))
    .sort((a, b) => b.focus - a.focus);
}

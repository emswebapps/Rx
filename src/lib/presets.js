// Setting up the Adderall IR routines in one tap.
//
// The routine that works is written down (README → "Eat → wait → take"):
// something to eat, fifteen minutes, the dose. For the IR it's one egg before
// the first dose and a Ready Clean bar before each later one. Typing that into
// three dose times by hand is exactly the kind of setup that doesn't get
// done, so Today offers it once — and only applies it on a tap.
//
// Pure and Firebase-free so `node --test` can run it.

import { normalizeMed } from './meds.js';

export const IR_PLAN = {
  first: '1 egg',
  later: 'Ready Clean Bar',
  waitMinutes: 15,
};

/** The medication this is for: an active Adderall with its doses not yet set up. */
export function irPresetTarget(meds) {
  const list = (meds || []).filter(Boolean).map(normalizeMed)
    .filter((m) => m.active !== false && /adderall/i.test(m.name || ''))
    // An XR taken once a day isn't this routine.
    .filter((m) => !/\bxr\b/i.test(m.name || ''));
  return list.find((m) => m.schedule.times.some((t) => !Array.isArray(t.routine) || t.routine.length === 0)) || null;
}

/**
 * The medication's dose times with the routine filled in: the first dose gets
 * the egg, every later one the bar, each eat → wait 15 → take. Times that
 * already have a routine are left exactly as they are.
 */
export function withIrRoutines(med, plan = IR_PLAN, now = Date.now()) {
  const m = normalizeMed(med);
  const stamp = now.toString(36);
  const times = m.schedule.times.map((t, i) => {
    if (Array.isArray(t.routine) && t.routine.length > 0) return t;
    return {
      ...t,
      routine: [
        { id: `s-eat-${t.id}-${stamp}`, kind: 'meal', text: i === 0 ? plan.first : plan.later },
        { id: `s-wait-${t.id}-${stamp}`, kind: 'wait', minutes: plan.waitMinutes },
        { id: `s-dose-${t.id}-${stamp}`, kind: 'dose' },
      ],
      routineSince: now,
    };
  });
  return { ...m.schedule, times };
}

/** "Dose 1 · 1 egg → 15 min → take" lines, for showing before it's applied. */
export function irPresetLines(med, plan = IR_PLAN) {
  const m = normalizeMed(med);
  return m.schedule.times.map((t, i) => ({
    label: `Dose ${i + 1}`,
    text: `${i === 0 ? plan.first : plan.later} → ${plan.waitMinutes} min → take`,
    already: Array.isArray(t.routine) && t.routine.length > 0,
  }));
}

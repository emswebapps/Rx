// The routine's waits, the water reminders and the meal times, for the
// scheduler.
//
// A CommonJS port of the parts of src/lib/routine.js, src/lib/water.js and
// src/lib/mealPlan.js the scheduler needs: which wait has just run out,
// whether a glass is due, and which meal has just come due.
// Held to the same answers as the client by functions/fixtures/daily-cases.json
// (asserted here by functions/test/daily.test.js and on the client by
// src/lib/daily.parity.test.js).
//
// As in regimen.js, every day and clock calculation is done in the user's own
// time zone, because this process runs in UTC.

const regimen = require('./regimen');

const MINUTE_MS = 60 * 1000;
const WAIT_NOTIFY_GRACE_MS = 30 * MINUTE_MS;
const DEFAULT_WATER = { enabled: false, everyMinutes: 60, goal: 8, until: '20:00' };

function positive(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// ── Routine ─────────────────────────────────────────────────────────────────

/** See routineSteps in src/lib/routine.js. */
function routineSteps(slot) {
  const raw = slot && Array.isArray(slot.routine) ? slot.routine.filter(Boolean) : [];
  if (raw.length === 0) return [];
  const out = [];
  let haveDose = false;
  raw.forEach((s, i) => {
    const id = s.id || `s${i + 1}`;
    if (s.kind === 'dose') {
      if (haveDose) return;
      haveDose = true;
      out.push({ id, kind: 'dose' });
    } else if (s.kind === 'wait') {
      if (out.length === 0) return;
      const minutes = positive(s.minutes, 30);
      const prev = out[out.length - 1];
      if (prev.kind === 'wait') { prev.minutes += minutes; return; }
      out.push({ id, kind: 'wait', minutes });
    } else {
      // A meal is a task to the waits; the meal times read it as a meal.
      out.push({ id, kind: s.kind === 'meal' ? 'meal' : 'task' });
    }
  });
  if (!haveDose) out.push({ id: 'dose', kind: 'dose' });
  return out.length > 1 ? out : [];
}

function runIdFor(dateKey, medId, slotId) {
  return `${dateKey}|${medId}|${slotId}`;
}

function waitTag(id, stepId) {
  return `rx-wait-${String(id).replace(/[^A-Za-z0-9-]/g, '_')}-${stepId}`;
}

/**
 * The waits that have just run out, as notification tags.
 *
 * Mirrors dueWaits in src/lib/routine.js: a wait counts from when the step
 * directly before it was done, fires only inside the half hour after it ends,
 * and not at all once the step after it has happened.
 */
function dueWaitTags(meds, doses, runs, now, tz) {
  const dateKey = regimen.tzParts(now, tz).date;
  const byId = new Map((Array.isArray(runs) ? runs : []).filter(Boolean).map((r) => [r.id, r]));
  const out = [];

  for (const e of regimen.expectedDosesToday(meds, doses, now, tz)) {
    const slot = e.med.schedule.times.find((t) => t.id === e.slotId);
    const steps = routineSteps(slot);
    if (steps.length === 0) continue;
    const id = runIdFor(dateKey, e.medId, e.slotId);
    const run = byId.get(id);
    const done = (run && run.done) || {};
    const dose = e.entry;

    const doneAt = (step) => {
      if (!step) return null;
      if (step.kind === 'dose') {
        return dose && dose.status !== 'skipped' && typeof dose.takenAt === 'number' ? dose.takenAt : null;
      }
      return typeof done[step.id] === 'number' ? done[step.id] : null;
    };

    // Walk in order so a wait's start is the finish of the step before it,
    // which may itself be a wait that has already run out.
    let prevDone = null;
    for (let i = 0; i < steps.length; i += 1) {
      const step = steps[i];
      if (step.kind !== 'wait') { prevDone = doneAt(step); continue; }
      if (prevDone == null) { prevDone = null; continue; }
      const endsAt = prevDone + step.minutes * MINUTE_MS;
      const next = doneAt(steps[i + 1]);
      prevDone = now >= endsAt ? endsAt : (next != null ? Math.min(next, endsAt) : null);
      if (next != null) continue;
      if (now < endsAt || now - endsAt > WAIT_NOTIFY_GRACE_MS) continue;
      if (run && run.notified && run.notified[step.id]) continue;
      out.push(waitTag(id, step.id));
    }
  }
  return out;
}

// ── Water ───────────────────────────────────────────────────────────────────

function mergeWater(saved) {
  const s = saved || {};
  return Object.assign({}, DEFAULT_WATER, s, {
    enabled: s.enabled === true,
    everyMinutes: Math.round(positive(s.everyMinutes, DEFAULT_WATER.everyMinutes)),
    goal: Math.round(positive(s.goal, DEFAULT_WATER.goal)),
    until: /^\d{1,2}:\d{2}$/.test(String(s.until || '')) ? s.until : DEFAULT_WATER.until,
  });
}

function glassesToday(log, now, tz) {
  if (!Array.isArray(log)) return [];
  return log
    .filter((t) => typeof t === 'number' && regimen.sameLocalDay(t, now, tz))
    .sort((a, b) => a - b);
}

/** See nextWaterDue in src/lib/water.js. */
function nextWaterDue(log, doses, cfg, now, tz) {
  const c = mergeWater(cfg);
  if (!c.enabled) return null;
  const today = regimen.takenDoses(doses).filter((d) => regimen.sameLocalDay(d.takenAt, now, tz));
  if (today.length === 0) return null;
  const start = Math.min(...today.map((d) => d.takenAt));
  if (start > now) return null;

  const glasses = glassesToday(log, now, tz).filter((t) => t <= now);
  if (glasses.length >= c.goal) return null;

  const base = Math.max(start, glasses.length ? glasses[glasses.length - 1] : start);
  const due = base + c.everyMinutes * MINUTE_MS;
  const cutoff = regimen.atClock(now, c.until, tz);
  if (cutoff != null && due > cutoff) return null;
  return due;
}

/** See waterReminderTag in src/lib/water.js. */
function waterReminderTag(log, doses, cfg, now, tz) {
  const due = nextWaterDue(log, doses, cfg, now, tz);
  if (due == null || now < due) return null;
  const c = mergeWater(cfg);
  const k = Math.floor((now - due) / (c.everyMinutes * MINUTE_MS));
  const dateKey = regimen.tzParts(now, tz).date;
  const count = glassesToday(log, now, tz).filter((t) => t <= now).length;
  return `rx-water-${dateKey}-${count}-${k}`;
}

// ── Meal times ──────────────────────────────────────────────────────────────

const MEAL_ANCHORS = ['afterMeal', 'firstDose', 'wearOff', 'clock'];
const MEAL_OPEN_MS = 2 * 60 * MINUTE_MS;
const MEAL_NOTIFY_GRACE_MS = 30 * MINUTE_MS;

/** See normalizePlanMeal in src/lib/mealPlan.js. */
function normalizePlanMeal(m, i) {
  const x = m || {};
  const anchor = MEAL_ANCHORS.includes(x.anchor) ? x.anchor : 'afterMeal';
  const n = Number(x.minutes);
  const minutes = Number.isFinite(n) ? n : (anchor === 'afterMeal' ? 210 : 0);
  return {
    id: x.id || `meal${i + 1}`,
    anchor,
    minutes: Math.max(0, Math.round(minutes)),
    time: /^\d{1,2}:\d{2}$/.test(String(x.time || '')) ? x.time : '12:00',
  };
}

function mealTag(dateKey, mealId) {
  return `rx-meal-${dateKey}-${String(mealId).replace(/[^A-Za-z0-9-]/g, '_')}`;
}

/**
 * The meals on the plan that have just come due, as notification tags.
 *
 * Mirrors mealsForDay + dueMealTags in src/lib/mealPlan.js: firm (not hanging
 * off a dose still to come), not eaten or skipped, and inside the half hour
 * after its time.
 */
function dueMealTags(kit, eaten, meds, doses, runs, now, tz) {
  const plan = (kit && kit.mealPlan) || {};
  const meals = (Array.isArray(plan.meals) ? plan.meals : []).filter(Boolean).map(normalizePlanMeal);
  if (meals.length === 0) return [];
  const dateKey = regimen.tzParts(now, tz).date;

  const today = regimen.takenDoses(doses).filter((d) => regimen.sameLocalDay(d.takenAt, now, tz));
  const firstDose = today.length ? Math.min(...today.map((d) => d.takenAt)) : null;

  // Routine meal steps ticked today — see mealLog in src/lib/meals.js.
  const byId = new Map((Array.isArray(meds) ? meds : []).filter(Boolean).map((m) => [m.id, regimen.normalizeMed(m)]));
  const routineMeals = [];
  for (const run of Array.isArray(runs) ? runs : []) {
    if (!run || !run.done) continue;
    const med = byId.get(run.medId);
    if (!med) continue;
    const slot = med.schedule.times.find((t) => t.id === run.slotId);
    for (const step of routineSteps(slot)) {
      const t = run.done[step.id];
      if (step.kind !== 'meal' || typeof t !== 'number') continue;
      if (regimen.sameLocalDay(t, now, tz)) routineMeals.push(t);
    }
  }

  const w = firstDose != null ? regimen.effectiveWindow(meds, doses, kit, now, tz) : null;
  const log = (Array.isArray(eaten) ? eaten : []).filter((e) => e && e.day === dateKey);
  const eatenAt = [];
  const out = [];

  for (const meal of meals) {
    const entry = log.find((e) => e.mealId === meal.id);
    let base = null;
    let projected = false;
    if (meal.anchor === 'clock') base = regimen.atClock(now, meal.time, tz);
    else if (meal.anchor === 'firstDose') base = firstDose;
    else if (meal.anchor === 'wearOff') {
      if (w) {
        projected = Boolean(w.provisional && w.wouldBecome);
        base = projected ? w.wouldBecome.start : w.start;
      }
    } else {
      const all = routineMeals.concat(eatenAt).filter((t) => t <= now);
      base = all.length ? Math.max(...all) : firstDose;
    }

    if (entry) {
      if (!entry.skipped) eatenAt.push(entry.at);
      continue;
    }
    if (base == null || projected) continue;
    const dueAt = base + meal.minutes * MINUTE_MS;
    if (now < dueAt || now - dueAt > MEAL_OPEN_MS || now - dueAt > MEAL_NOTIFY_GRACE_MS) continue;
    out.push(mealTag(dateKey, meal.id));
  }
  return out;
}

module.exports = {
  routineSteps, dueWaitTags, waitTag, mergeWater, nextWaterDue, waterReminderTag,
  dueMealTags, mealTag, WAIT_NOTIFY_GRACE_MS,
};

// Meals with their own time.
//
// A routine's meal is tied to a dose: eat, wait, take it. Some meals aren't:
// lunch three and a half hours after breakfast, to get ahead of the midday
// dip, or dinner as the last dose wears off. Those hang off what actually
// happened today rather than off the clock, the same way a routine's wait
// does, so a late breakfast moves lunch with it.
//
// A meal's time comes from one of four things:
//
//   'afterMeal' — N minutes after the last thing you ate today: a routine's
//                 meal step or an earlier meal on this list. Nothing eaten
//                 yet, it counts from the first dose instead.
//   'firstDose' — N minutes after the first dose taken today.
//   'wearOff'   — N minutes after the last dose of the day wears off: the
//                 start of the evening window. While a dose is still to come,
//                 that time is only a projection and says so.
//   'clock'     — a set time.
//
// What to eat, when, and how much protein is in it are all the user's own
// numbers. Nothing here suggests a food or a time.
//
// Pure and Firebase-free so `node --test` can run it. `functions/daily.js`
// has the scheduler's CommonJS copy of `dueMealTags`, held to the same
// fixture as the routine's waits.

import { atClock, sameLocalDay, effectiveWindow } from './meds.js';
import { firstDoseOnDay } from './water.js';
import { mealLog } from './meals.js';
import { dayKey } from './routine.js';

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

export const MEAL_ANCHORS = [
  { key: 'afterMeal', label: 'After I last ate' },
  { key: 'firstDose', label: 'After my first dose' },
  { key: 'wearOff', label: 'When my last dose wears off' },
  { key: 'clock', label: 'At a set time' },
];

/** How long a meal that's come due stays up front before it quietly passes. */
export const MEAL_OPEN_MS = 2 * 60 * MINUTE_MS;

/** How long after a meal comes due its buzz may still go out. */
export const MEAL_NOTIFY_GRACE_MS = 30 * MINUTE_MS;

/** Log entries older than this are dropped. */
export const EATEN_KEEP_DAYS = 120;

function number(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function normalizePlanMeal(m = {}, i = 0) {
  const anchor = MEAL_ANCHORS.some((a) => a.key === m.anchor) ? m.anchor : 'afterMeal';
  return {
    id: m.id || `meal${i + 1}`,
    name: String(m.name || '').trim() || `Meal ${i + 1}`,
    food: String(m.food || '').trim(),
    anchor,
    // Minutes after the anchor. Never before it — "before I last ate" isn't a
    // time anyone can be reminded at.
    minutes: Math.max(0, Math.round(number(m.minutes, anchor === 'afterMeal' ? 210 : 0))),
    time: /^\d{1,2}:\d{2}$/.test(String(m.time || '')) ? m.time : '12:00',
  };
}

/** The plan as saved on the kit, cleaned up. No meals is no plan. */
export function mergeMealPlan(saved) {
  const s = saved || {};
  const meals = (Array.isArray(s.meals) ? s.meals : []).filter(Boolean).map(normalizePlanMeal);
  return { meals };
}

/** "3h 30m after I last ate" — the timing, in words, for the setup list. */
export function describeTiming(meal) {
  const m = normalizePlanMeal(meal);
  const span = formatSpan(m.minutes);
  if (m.anchor === 'clock') {
    const [h, min] = m.time.split(':').map(Number);
    const suffix = h >= 12 ? 'PM' : 'AM';
    return `At ${h % 12 || 12}:${String(min).padStart(2, '0')} ${suffix}`;
  }
  if (m.anchor === 'firstDose') return m.minutes ? `${span} after my first dose` : 'With my first dose';
  if (m.anchor === 'wearOff') return m.minutes ? `${span} after my last dose wears off` : 'When my last dose wears off';
  return `${span || 'Right'} after I last ate`;
}

/** "3h 30m" / "45m" / "2h" — empty for zero. */
export function formatSpan(minutes) {
  const t = Math.max(0, Math.round(minutes || 0));
  if (t === 0) return '';
  const h = Math.floor(t / 60);
  const m = t % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${String(m).padStart(2, '0')}m` : `${h}h`;
}

// ── The log ─────────────────────────────────────────────────────────────────
// One entry per plan meal per day it was dealt with: eaten (with what, if it
// wasn't the plan) or skipped. `rxEaten`.

export function findEaten(log, dayTs, mealId) {
  const day = dayKey(dayTs);
  return (Array.isArray(log) ? log : []).find((e) => e && e.day === day && e.mealId === mealId) || null;
}

/**
 * A copy of `log` with this meal marked eaten at `at` (or skipped), replacing
 * whatever was there for it that day. `food` is only kept when it isn't the
 * plan's own words.
 */
export function markMeal(log, dayTs, mealId, { at = Date.now(), food = '', skipped = false } = {}) {
  const day = dayKey(dayTs);
  const oldest = dayKey(at - EATEN_KEEP_DAYS * DAY_MS);
  const rest = (Array.isArray(log) ? log : [])
    .filter((e) => e && !(e.day === day && e.mealId === mealId) && typeof e.day === 'string' && e.day >= oldest);
  const entry = { id: `${day}|${mealId}`, day, mealId, at };
  if (skipped) entry.skipped = true;
  const f = String(food || '').trim();
  if (f && !skipped) entry.food = f;
  return [entry, ...rest];
}

/** Take back an "ate it" or a skip. */
export function unmarkMeal(log, dayTs, mealId) {
  const day = dayKey(dayTs);
  return (Array.isArray(log) ? log : []).filter((e) => e && !(e.day === day && e.mealId === mealId));
}

// ── The day ─────────────────────────────────────────────────────────────────

/** When each routine meal step was ticked off on this day, oldest first. */
export function routineMealsOnDay(meds, doses, runs, dayTs) {
  return mealLog(meds, doses, runs)
    .filter((r) => sameLocalDay(r.ateAt, dayTs))
    .sort((a, b) => a.ateAt - b.ateAt);
}

/**
 * Every meal on the plan for today, in order, with when it's due and where it
 * stands.
 *
 * `state`:
 *   'eaten'    — ticked off (`eatenAt`, and `food` is what it really was)
 *   'skipped'  — deliberately not
 *   'due'      — its time has come, within the last couple of hours
 *   'upcoming' — later today (`projected` when it hangs off a dose not yet taken)
 *   'passed'   — came and went without a tap; nothing more is said about it
 *   'waiting'  — what it counts from hasn't happened yet (no dose, nothing
 *                eaten), so there's no time to give
 */
export function mealsForDay({ plan, eaten, runs, meds, doses, kit, dayTs, now = Date.now() }) {
  const { meals } = mergeMealPlan(plan);
  if (meals.length === 0) return [];
  const firstDose = firstDoseOnDay(doses, dayTs);
  const routineMeals = routineMealsOnDay(meds, doses, runs, dayTs).map((r) => r.ateAt);
  const window = firstDose != null && sameLocalDay(now, dayTs) ? effectiveWindow(meds, doses, kit, now) : null;

  const out = [];
  for (const meal of meals) {
    const log = findEaten(eaten, dayTs, meal.id);
    let base = null;
    let projected = false;

    if (meal.anchor === 'clock') {
      base = atClock(dayTs, meal.time);
    } else if (meal.anchor === 'firstDose') {
      base = firstDose;
    } else if (meal.anchor === 'wearOff') {
      if (window) {
        projected = Boolean(window.provisional && window.wouldBecome);
        base = projected ? window.wouldBecome.start : window.start;
      }
    } else {
      const earlier = out.filter((r) => r.state === 'eaten').map((r) => r.eatenAt);
      const all = [...routineMeals, ...earlier].filter((t) => t <= now);
      base = all.length ? Math.max(...all) : firstDose;
    }

    const dueAt = base == null ? null : base + meal.minutes * MINUTE_MS;
    let state;
    if (log && log.skipped) state = 'skipped';
    else if (log) state = 'eaten';
    else if (dueAt == null) state = 'waiting';
    else if (projected || now < dueAt) state = 'upcoming';
    else if (now - dueAt <= MEAL_OPEN_MS) state = 'due';
    else state = 'passed';

    out.push({
      meal,
      id: meal.id,
      dueAt,
      projected,
      state,
      eatenAt: log && !log.skipped ? log.at : null,
      food: (log && log.food) || meal.food,
      changed: Boolean(log && log.food && log.food !== meal.food),
    });
  }
  return out;
}

/** The tag a meal's buzz goes out under — the same from the app and the scheduler. */
export function mealTag(dateKey, mealId) {
  return `rx-meal-${dateKey}-${String(mealId).replace(/[^A-Za-z0-9-]/g, '_')}`;
}

/** Meals whose time has just come, as tags: due, not projected, not yet dealt with. */
export function dueMealTags(rows, now = Date.now(), grace = MEAL_NOTIFY_GRACE_MS) {
  return (rows || [])
    .filter((r) => r.state === 'due' && r.dueAt != null && now - r.dueAt <= grace)
    .map((r) => mealTag(dayKey(now), r.id));
}

/** The soonest meal still to come today that's firm enough to buzz for. */
export function nextMealDue(rows) {
  const firm = (rows || []).filter((r) => r.state === 'upcoming' && !r.projected && r.dueAt != null);
  return firm.length ? firm.reduce((a, b) => (b.dueAt < a.dueAt ? b : a)) : null;
}

// The routine around a dose.
//
// Some medication only works when it's taken the same way every time: eat
// first, wait half an hour, then take it. The rules in meds.js can remind you
// of that at fixed offsets from the clock, but they can't follow you — eat
// twenty minutes late and "30 minutes after eating" is now a different time.
//
// A routine is an ordered list of steps hung on one dose time. A wait starts
// the moment the step before it is checked off, so the clock follows what you
// actually did rather than what the schedule assumed. The dose itself is one
// of the steps, and checking it is logging the dose — there is one record of
// having taken something, not two.
//
// Every step's words and every wait's length were typed by the user. Nothing
// here suggests one.
//
// Pure and Firebase-free so `node --test` can run it. `functions/routine.js`
// is the scheduler's CommonJS copy of `dueWaits`, held to the same fixture.

import { normalizeMed, startOfDay } from './meds.js';

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/** How long after a wait ends its buzz may still go out. */
export const WAIT_NOTIFY_GRACE_MS = 30 * MINUTE_MS;

/** Runs older than this are dropped — well past what history looks back over. */
export const RUN_KEEP_DAYS = 35;

export const STEP_KINDS = [
  { key: 'task', label: 'Do something' },
  { key: 'meal', label: 'Eat' },
  { key: 'wait', label: 'Wait' },
  { key: 'dose', label: 'Take it' },
];

/**
 * The shape most stimulant routines take, one tap away in the editor. The
 * words are placeholders to type over, not advice about what to eat.
 */
export function routinePreset(minutes = 30, food = '') {
  const stamp = Date.now().toString(36);
  return [
    { id: `s-eat-${stamp}`, kind: 'meal', text: food },
    { id: `s-wait-${stamp}`, kind: 'wait', minutes },
    { id: `s-dose-${stamp}`, kind: 'dose' },
  ];
}

function positive(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * A slot's steps, cleaned up enough to walk.
 *
 * - Exactly one dose step: one is appended if the routine has none, and any
 *   extra is dropped, because the dose can only be taken once.
 * - A wait needs something before it to start from, so a wait at the very top
 *   is dropped rather than left waiting forever.
 * - Two waits in a row are one longer wait.
 *
 * An empty or missing routine returns []: that slot has no routine, and every
 * screen treats it exactly as it did before routines existed.
 */
export function routineSteps(slot) {
  const raw = Array.isArray(slot?.routine) ? slot.routine.filter(Boolean) : [];
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
      // A meal is a task that also remembers what was eaten — see markAte.
      const meal = s.kind === 'meal';
      out.push({ id, kind: meal ? 'meal' : 'task', text: String(s.text || '').trim() || (meal ? 'Eat' : 'Step') });
    }
  });
  if (!haveDose) out.push({ id: 'dose', kind: 'dose' });
  // A routine that is only the dose is no routine.
  return out.length > 1 ? out : [];
}

/** The steps for a medication's time slot, by id. */
export function stepsForSlot(med, slotId) {
  const m = normalizeMed(med);
  return routineSteps(m.schedule.times.find((t) => t.id === slotId));
}

/** "2026-09-24" for the local day containing `ts`. */
export function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function runId(dayTs, medId, slotId) {
  return `${dayKey(dayTs)}|${medId}|${slotId}`;
}

export function findRun(runs, dayTs, medId, slotId) {
  if (!Array.isArray(runs)) return null;
  const id = runId(dayTs, medId, slotId);
  return runs.find((r) => r && r.id === id) || null;
}

/**
 * Where a routine stands.
 *
 * Each step comes back with a `state`:
 *   'done'     — checked off (a wait is done when its time is up)
 *   'active'   — everything before it is finished; this is the one to do now
 *   'waiting'  — a wait that is counting down, with `endsAt`
 *   'locked'   — something before it isn't finished yet
 *   'skipped'  — the dose, deliberately not taken
 *
 * A wait counts from the moment the step directly before it was done, and
 * nothing else. Out-of-order taps are allowed — someone who ate and forgot to
 * tap it until after the dose should be able to say so — but a step done
 * before the wait ahead of it was up is marked `early`, and the routine does
 * not count as followed.
 *
 * `dose` is the logged dose entry for this slot, if any: a taken one supplies
 * the dose step's `doneAt`, a deliberately skipped one marks it skipped.
 */
export function routineState(steps, run, dose, now = Date.now()) {
  const done = (run && run.done) || {};
  // When a step was checked off, before any ordering is applied.
  const rawDoneAt = (step) => {
    if (!step) return null;
    if (step.kind === 'dose') {
      return dose && dose.status !== 'skipped' && typeof dose.takenAt === 'number' ? dose.takenAt : null;
    }
    return typeof done[step.id] === 'number' ? done[step.id] : null;
  };
  const out = [];
  let allBeforeDone = true;
  let waitingUntil = null;

  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i];
    const prev = out[i - 1] || null;
    let state;
    let doneAt = null;
    let endsAt = null;

    if (step.kind === 'wait') {
      if (prev && prev.doneAt != null) {
        endsAt = prev.doneAt + step.minutes * MINUTE_MS;
        const nextAt = rawDoneAt(steps[i + 1]);
        if (now >= endsAt) { state = 'done'; doneAt = endsAt; }
        // The step after it already happened: the wait was cut short, and is
        // over whatever the clock says. The next step carries the `early`.
        else if (nextAt != null) { state = 'done'; doneAt = Math.max(prev.doneAt, Math.min(nextAt, endsAt)); }
        else { state = 'waiting'; waitingUntil = endsAt; }
      } else {
        state = 'locked';
      }
    } else if (step.kind === 'dose') {
      if (dose && dose.status === 'skipped') state = 'skipped';
      else if (dose && typeof dose.takenAt === 'number') { state = 'done'; doneAt = dose.takenAt; }
      else state = allBeforeDone ? 'active' : 'locked';
    } else if (typeof done[step.id] === 'number') {
      state = 'done';
      doneAt = done[step.id];
    } else {
      state = allBeforeDone ? 'active' : 'locked';
    }

    // Done before the wait in front of it had run out.
    const early = Boolean(doneAt != null && step.kind !== 'wait'
      && prev && prev.kind === 'wait' && prev.endsAt != null && doneAt < prev.endsAt);

    const ate = step.kind === 'meal' && run && run.ate && run.ate[step.id] ? run.ate[step.id] : null;
    out.push({ ...step, state, doneAt, endsAt, early, ate });
    if (state !== 'done') allBeforeDone = false;
  }

  const complete = out.length > 0 && out.every((s) => s.state === 'done');
  const inOrder = out.every((s, i) => i === 0 || s.doneAt == null || out[i - 1].doneAt == null
    || s.doneAt >= out[i - 1].doneAt);
  const current = out.find((s) => s.state === 'active' || s.state === 'waiting') || null;

  return {
    steps: out,
    current,
    waitingUntil,
    complete,
    skipped: out.some((s) => s.state === 'skipped'),
    followed: complete && inOrder && !out.some((s) => s.early),
    doneCount: out.filter((s) => s.state === 'done').length,
  };
}

/** A copy of `runs` with one step marked done (or undone, when `at` is null). */
export function markStep(runs, dayTs, medId, slotId, stepId, at = Date.now()) {
  const list = Array.isArray(runs) ? runs.filter(Boolean) : [];
  const id = runId(dayTs, medId, slotId);
  const existing = list.find((r) => r.id === id);
  const doneMap = { ...((existing && existing.done) || {}) };
  if (at == null) delete doneMap[stepId];
  else doneMap[stepId] = at;
  const next = {
    ...(existing || { id, day: dayKey(dayTs), medId, slotId }),
    done: doneMap,
  };
  return existing ? list.map((r) => (r.id === id ? next : r)) : [next, ...list];
}

/**
 * What was actually eaten at a meal step, when it wasn't what the routine
 * says. Null clears it back to "as planned".
 */
export function markAte(runs, dayTs, medId, slotId, stepId, text) {
  const list = Array.isArray(runs) ? runs.filter(Boolean) : [];
  const id = runId(dayTs, medId, slotId);
  const existing = list.find((r) => r.id === id);
  const ate = { ...((existing && existing.ate) || {}) };
  const t = String(text || '').trim();
  if (t) ate[stepId] = t; else delete ate[stepId];
  const next = { ...(existing || { id, day: dayKey(dayTs), medId, slotId, done: {} }), ate };
  return existing ? list.map((r) => (r.id === id ? next : r)) : [next, ...list];
}

/** Record that the buzz for a wait has gone out, so it isn't sent twice. */
export function markNotified(runs, id, stepId, at = Date.now()) {
  if (!Array.isArray(runs)) return [];
  return runs.map((r) => (r && r.id === id
    ? { ...r, notified: { ...(r.notified || {}), [stepId]: at } }
    : r));
}

/** Drop runs older than `keepDays`, so the document doesn't grow for ever. */
export function pruneRuns(runs, now = Date.now(), keepDays = RUN_KEEP_DAYS) {
  if (!Array.isArray(runs)) return [];
  const oldest = dayKey(startOfDay(now) - keepDays * DAY_MS);
  return runs.filter((r) => r && typeof r.day === 'string' && r.day >= oldest);
}

/**
 * Every routine on the day's schedule, walked.
 *
 * `entries` is `expectedDosesOnDay` for that day — passed in rather than
 * recomputed, because every caller already has it.
 */
export function routinesForDay(entries, runs, dayTs, now = Date.now()) {
  const out = [];
  for (const e of entries || []) {
    const steps = stepsForSlot(e.med, e.slotId);
    if (steps.length === 0) continue;
    const run = findRun(runs, dayTs, e.medId, e.slotId);
    out.push({
      key: e.key, medId: e.medId, slotId: e.slotId, entry: e, run,
      ...routineState(steps, run, e.entry, now),
    });
  }
  return out;
}

/**
 * Waits whose time has just come up and haven't been announced.
 *
 * Only inside `WAIT_NOTIFY_GRACE_MS` of the end — a wait that ended while the
 * phone was off isn't worth a buzz an hour later, when the step after it has
 * probably happened anyway.
 */
export function dueWaits(entries, runs, dayTs, now = Date.now(), grace = WAIT_NOTIFY_GRACE_MS) {
  const out = [];
  for (const r of routinesForDay(entries, runs, dayTs, now)) {
    for (let i = 0; i < r.steps.length; i += 1) {
      const s = r.steps[i];
      if (s.kind !== 'wait' || s.endsAt == null) continue;
      if (now < s.endsAt || now - s.endsAt > grace) continue;
      if (r.run && r.run.notified && r.run.notified[s.id]) continue;
      // Already moved on: nothing to tell.
      const next = r.steps[i + 1];
      if (next && next.state === 'done') continue;
      out.push({ runId: runId(dayTs, r.medId, r.slotId), stepId: s.id, endsAt: s.endsAt, medId: r.medId, slotId: r.slotId });
    }
  }
  return out;
}

/**
 * The tag a wait's buzz goes out under. The app and the scheduler build the
 * same one, so whichever gets there first is the only one that sends.
 */
export function waitTag(id, stepId) {
  return `rx-wait-${String(id).replace(/[^A-Za-z0-9-]/g, '_')}-${stepId}`;
}

/** The soonest wait still counting down today, for the in-app timer. */
export function nextWaitEnd(entries, runs, dayTs, now = Date.now()) {
  let best = null;
  for (const r of routinesForDay(entries, runs, dayTs, now)) {
    for (const s of r.steps) {
      if (s.state !== 'waiting') continue;
      if (r.run && r.run.notified && r.run.notified[s.id]) continue;
      if (!best || s.endsAt < best.endsAt) {
        best = { runId: runId(dayTs, r.medId, r.slotId), stepId: s.id, endsAt: s.endsAt };
      }
    }
  }
  return best;
}

/**
 * How the routines went on one day, for the compliance score.
 *
 * Only routines whose dose has settled count: one still ahead isn't a failure
 * yet, and one whose dose was deliberately skipped is excluded the same way a
 * skipped dose is excluded from adherence. A dose missed outright is a routine
 * not followed.
 */
export function routineDaySummary(entries, runs, dayTs, now = Date.now()) {
  let applicable = 0;
  let followed = 0;
  for (const r of routinesForDay(entries, runs, dayTs, now)) {
    // A routine set up today can't have been followed last week.
    const slot = normalizeMed(r.entry.med).schedule.times.find((t) => t.id === r.slotId);
    if (slot && typeof slot.routineSince === 'number' && startOfDay(dayTs) < startOfDay(slot.routineSince)) continue;
    const st = r.entry.state;
    if (st === 'upcoming' || st === 'due' || st === 'unknown') continue;
    if (st === 'skipped-on-purpose') continue;
    applicable += 1;
    if (r.followed) followed += 1;
  }
  return { applicable, followed };
}

/** "12:04" / "1:02:30" — a countdown readout. */
export function formatCountdown(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h ? String(m).padStart(2, '0') : String(m);
  return `${h ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
}

// The routine's waits and the water reminders, for the scheduler.
//
// A CommonJS port of the parts of src/lib/routine.js and src/lib/water.js the
// scheduler needs: which wait has just run out, and whether a glass is due.
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
      out.push({ id, kind: 'task' });
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

module.exports = {
  routineSteps, dueWaitTags, waitTag, mergeWater, nextWaterDue, waterReminderTag,
  WAIT_NOTIFY_GRACE_MS,
};

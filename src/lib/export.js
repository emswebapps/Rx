// Your data, out of the app.
//
// Two shapes: spreadsheets anyone can open (one row per dose, one per
// check-in), and a full JSON backup of every Rx slice, exactly as stored.
// Nothing here is sent anywhere — the screen hands the text to the browser
// as a download.
//
// Pure so `node --test` can check the quoting, which is the part that goes
// wrong: a note with a comma or a quote in it must not split a row.

import { normalizeMed, expectedDosesOnDay, startOfDay } from './meds.js';
import { SIDE_EFFECTS } from './effects.js';
import { mealLog } from './meals.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** One CSV field, quoted when it has to be. */
export function csvField(value) {
  if (value == null) return '';
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCSV(header, rows) {
  return [header, ...rows].map((r) => r.map(csvField).join(',')).join('\r\n');
}

const pad = (n) => String(n).padStart(2, '0');
const date = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const time = (ts) => { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

/**
 * Every logged dose, oldest first. "On time" is judged against the schedule
 * as it is today — the same caveat History prints — and is left blank for
 * anything the schedule can't place.
 */
export function dosesCSV(meds, doses) {
  const byId = new Map((meds || []).filter(Boolean).map((m) => [m.id, normalizeMed(m)]));
  const list = (doses || []).filter((d) => d && typeof d.takenAt === 'number')
    .sort((a, b) => a.takenAt - b.takenAt);

  // Late flags, worked out once per day rather than once per dose.
  const late = new Map();
  for (const day of new Set(list.map((d) => startOfDay(d.takenAt)))) {
    for (const e of expectedDosesOnDay(meds, doses, day + DAY_MS / 2, Date.now())) {
      if (e.dose) late.set(e.dose.id, e.late ? 'late' : 'on time');
    }
  }

  return toCSV(
    ['date', 'time', 'medication', 'strength', 'amount', 'status', 'timing', 'logged from'],
    list.map((d) => {
      const m = byId.get(d.medId);
      return [
        date(d.takenAt), time(d.takenAt), m ? m.name : '', m ? m.strength : '',
        d.amount ?? '', d.status === 'skipped' ? 'skipped' : 'taken',
        d.status === 'skipped' ? '' : (late.get(d.id) || ''), d.source || 'app',
      ];
    }),
  );
}

/** Every effect check-in, oldest first. Dismissed prompts aren't check-ins. */
export function effectsCSV(meds, effects) {
  const names = new Map((meds || []).filter(Boolean).map((m) => [m.id, normalizeMed(m).name]));
  const labels = new Map(SIDE_EFFECTS.map((s) => [s.id, s.label]));
  return toCSV(
    ['date', 'time', 'medication', 'when', 'focus', 'mood', 'appetite', 'side effects', 'note'],
    (effects || []).filter((e) => e && typeof e.at === 'number' && !e.dismissed)
      .sort((a, b) => a.at - b.at)
      .map((e) => [
        date(e.at), time(e.at), names.get(e.medId) || '', e.phase || '',
        e.focus ?? '', e.mood ?? '', e.appetite ?? '',
        (e.sideEffects || []).map((id) => labels.get(id) || id).join('; '), e.note || '',
      ]),
  );
}

/** Every meal ticked off in a routine, oldest first. */
export function mealsCSV(meds, doses, runs, effects) {
  return toCSV(
    ['date', 'time', 'medication', 'dose', 'ate', 'planned', 'minutes before dose', 'focus'],
    mealLog(meds, doses, runs, effects).reverse().map((r) => [
      date(r.ateAt), time(r.ateAt), r.medName, r.doseNumber, r.food, r.planned,
      r.minutesBefore ?? '', r.focus ?? '',
    ]),
  );
}

/** Every Rx slice, as stored, with a stamp saying when and what. */
export function fullBackup(state, fields, now = Date.now()) {
  const out = { app: 'Rx', exportedAt: new Date(now).toISOString(), version: 1, data: {} };
  for (const f of fields) out.data[f] = state[f] ?? null;
  return JSON.stringify(out, null, 2);
}

/** "rx-doses-2026-09-24.csv" */
export function exportName(kind, ext, now = Date.now()) {
  return `rx-${kind}-${date(now)}.${ext}`;
}

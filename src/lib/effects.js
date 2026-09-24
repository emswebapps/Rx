// How it's actually working.
//
// The dose log says when something was taken; the crash sessions say when an
// evening went wrong. Neither says what the hours in between felt like — when
// focus actually arrived, when it went, and what it cost. A check-in is a few
// taps at the two moments that matter: once it should be working, and again
// as it should be wearing off. Enough of them and the app can draw the curve
// of your own medication, from your own ratings.
//
// Nothing here interprets a rating or suggests anything about a dose. It
// averages numbers you typed and says where they peaked and fell.
//
// Pure and Firebase-free so `node --test` can run it. The scheduler's copy of
// `checkInsDue` is the few lines in functions/index.js that build the
// `rx-effect-*` push.

import { normalizeMed, takenDoses } from './meds.js';
import { HOUR_MS } from './window.js';

const MINUTE_MS = 60 * 1000;

/** How long a check-in stays on Today before it quietly goes away. */
export const CHECKIN_WINDOW_MS = 60 * MINUTE_MS;

// The two prompts. "Working" is a fixed ninety minutes in; "wearing" is the
// medication's own wear-off hours, the same number the window starts from.
export const PHASES = [
  { key: 'working', label: 'How’s it working?' },
  { key: 'wearing', label: 'Wearing off?' },
];
export const WORKING_AFTER_MS = 90 * MINUTE_MS;

export const SCALES = [
  { key: 'focus', label: 'Focus', low: 'Scattered', high: 'Locked in' },
  { key: 'mood', label: 'Mood', low: 'Low', high: 'Good' },
  { key: 'appetite', label: 'Appetite', low: 'None', high: 'Normal' },
];

export const SIDE_EFFECTS = [
  { id: 'headache', label: 'Headache' },
  { id: 'jittery', label: 'Jittery' },
  { id: 'irritable', label: 'Irritable' },
  { id: 'heart', label: 'Heart racing' },
  { id: 'drymouth', label: 'Dry mouth' },
  { id: 'tired', label: 'Tired' },
  { id: 'anxious', label: 'Anxious' },
  { id: 'sleep', label: 'Trouble sleeping' },
];

/** Bin width for the curve. */
export const BIN_HOURS = 0.5;
export const MIN_CURVE_SAMPLES = 5;

function phaseOffset(phase, med) {
  return phase === 'working' ? WORKING_AFTER_MS : normalizeMed(med).onsetHours * HOUR_MS;
}

/**
 * The check-ins open right now: for each dose taken against a medication in
 * the last day, each phase whose moment has arrived within the last hour and
 * hasn't been answered. Newest first.
 */
export function checkInsDue(meds, doses, effects, now = Date.now()) {
  const byId = new Map((meds || []).filter(Boolean).map((m) => [m.id, m]));
  const answered = new Set((effects || []).filter(Boolean).map((e) => `${e.doseId}:${e.phase}`));
  const out = [];
  for (const d of takenDoses(doses)) {
    if (!d.medId || now - d.takenAt > 24 * HOUR_MS) continue;
    const med = byId.get(d.medId);
    if (!med || med.active === false) continue;
    for (const p of PHASES) {
      const at = d.takenAt + phaseOffset(p.key, med);
      if (now < at || now - at > CHECKIN_WINDOW_MS) continue;
      if (answered.has(`${d.id}:${p.key}`)) continue;
      out.push({ doseId: d.id, medId: d.medId, med: normalizeMed(med), phase: p.key, label: p.label, at });
    }
  }
  return out.sort((a, b) => b.at - a.at);
}

/** Hours between a check-in and the dose it's about, or null if unpaired. */
function hoursAfterDose(effect, doses, medId) {
  const taken = takenDoses(doses);
  let dose = effect.doseId ? taken.find((d) => d.id === effect.doseId) : null;
  // A check-in made from the dose sheet at an odd moment still belongs to the
  // most recent dose of that medication before it.
  if (!dose) {
    dose = taken
      .filter((d) => d.medId === (effect.medId || medId) && d.takenAt <= effect.at)
      .sort((a, b) => b.takenAt - a.takenAt)[0] || null;
  }
  if (!dose || (medId && dose.medId !== medId)) return null;
  const h = (effect.at - dose.takenAt) / HOUR_MS;
  return h >= 0 && h <= 12 ? h : null;
}

function rated(v) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 1 && n <= 5 ? n : null;
}

/**
 * Average focus and mood by hours since the dose, in half-hour bins, for one
 * medication. Bins with nothing in them are left out.
 */
export function effectCurve(effects, doses, medId) {
  const bins = new Map();
  for (const e of effects || []) {
    if (!e || typeof e.at !== 'number' || e.dismissed) continue;
    if (medId && e.medId && e.medId !== medId) continue;
    const h = hoursAfterDose(e, doses, medId);
    if (h == null) continue;
    const key = Math.floor(h / BIN_HOURS) * BIN_HOURS;
    const b = bins.get(key) || { hours: key, focus: [], mood: [], n: 0 };
    if (rated(e.focus) != null) b.focus.push(rated(e.focus));
    if (rated(e.mood) != null) b.mood.push(rated(e.mood));
    b.n += 1;
    bins.set(key, b);
  }
  const avg = (xs) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
  return [...bins.values()]
    .sort((a, b) => a.hours - b.hours)
    .map((b) => ({ hours: b.hours, focus: avg(b.focus), mood: avg(b.mood), n: b.n }));
}

/**
 * Where focus peaks, and when it has fallen a full point below that peak.
 * Null until there are enough check-ins to say anything — a curve drawn from
 * two afternoons would be worse than none.
 */
export function peakAndDrop(curve, minSamples = MIN_CURVE_SAMPLES) {
  const withFocus = (curve || []).filter((b) => b.focus != null);
  const total = withFocus.reduce((n, b) => n + b.n, 0);
  if (total < minSamples || withFocus.length < 2) return null;
  const peak = withFocus.reduce((a, b) => (b.focus > a.focus ? b : a));
  const drop = withFocus.find((b) => b.hours > peak.hours && b.focus <= peak.focus - 1) || null;
  return {
    peakHours: peak.hours + BIN_HOURS / 2,
    peakFocus: peak.focus,
    dropHours: drop ? drop.hours + BIN_HOURS / 2 : null,
    samples: total,
  };
}

/** How often each side effect was ticked since `sinceTs`, most common first. */
export function sideEffectCounts(effects, sinceTs = 0, custom = []) {
  const labels = new Map([...SIDE_EFFECTS, ...(custom || [])].map((s) => [s.id, s.label]));
  const counts = new Map();
  let checkIns = 0;
  for (const e of effects || []) {
    if (!e || typeof e.at !== 'number' || e.at < sinceTs || e.dismissed) continue;
    checkIns += 1;
    for (const id of new Set(e.sideEffects || [])) counts.set(id, (counts.get(id) || 0) + 1);
  }
  return {
    checkIns,
    items: [...counts.entries()]
      .map(([id, count]) => ({ id, label: labels.get(id) || id, count }))
      .sort((a, b) => b.count - a.count),
  };
}

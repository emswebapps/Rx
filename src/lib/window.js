// Predicting the window.
//
// The crash isn't a surprise — it's a schedule. Medication is taken at a known
// time, the hard hours start a fairly consistent stretch later, and they last
// a fairly consistent while. Logging the dose is enough to say when tonight is
// likely to get difficult, which is the difference between being warned and
// being ambushed.
//
// This module logs a time you entered and does arithmetic on it. It does not
// advise on medication in any form, and with an empty log it says nothing at
// all rather than guessing.
//
// Pure and Firebase-free so `node --test` can run it.

export const SOON_MS = 30 * 60 * 1000;        // how far ahead the heads-up fires
export const HOUR_MS = 60 * 60 * 1000;
export const PAIR_MAX_MS = 12 * HOUR_MS;      // furthest a crash can be attributed to a dose
export const LOOKBACK_MS = 24 * HOUR_MS;      // a dose older than this governs nothing
export const MIN_ONSET_SAMPLES = 5;

export const DEFAULT_ONSET_HOURS = 4;
export const DEFAULT_DURATION_HOURS = 5;

function positive(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * The dose that governs right now: the most recent one already taken, within
 * the last 24 hours.
 *
 * Deliberately not "today" — at 12:30 AM the dose that matters was taken
 * yesterday afternoon, and a calendar-day rule would blank the window out at
 * exactly the hour it's most likely to still be running.
 */
export function latestDose(doses, now = Date.now()) {
  if (!Array.isArray(doses)) return null;
  const eligible = doses
    .filter((d) => d && typeof d.takenAt === 'number' && d.takenAt <= now && now - d.takenAt <= LOOKBACK_MS)
    .sort((a, b) => b.takenAt - a.takenAt);
  return eligible[0] || null;
}

/**
 * Tonight's predicted window, or null when there's nothing logged to predict
 * from. Runs off the most recent dose: an immediate-release dose is often taken
 * more than once a day, and it's the last one that decides how the evening goes.
 */
export function predictWindow(doses, kit = {}, now = Date.now()) {
  const dose = latestDose(doses, now);
  if (!dose) return null;
  const onset = positive(kit.onsetHours, DEFAULT_ONSET_HOURS);
  const duration = positive(kit.durationHours, DEFAULT_DURATION_HOURS);
  const start = dose.takenAt + onset * HOUR_MS;
  return { start, end: start + duration * HOUR_MS, doseId: dose.id, takenAt: dose.takenAt };
}

export function windowState(w, now = Date.now()) {
  if (!w) return 'none';
  if (now >= w.end) return 'past';
  if (now >= w.start) return 'inside';
  if (now >= w.start - SOON_MS) return 'soon';
  return 'before';
}

/** How far through the window we are, 0–1. Used to place the "now" tick. */
export function windowProgress(w, now = Date.now()) {
  if (!w || w.end <= w.start) return 0;
  return Math.min(1, Math.max(0, (now - w.start) / (w.end - w.start)));
}

function median(nums) {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * The onset gap inferred from what actually happened, rather than from the
 * number typed into the kit.
 *
 * Pairs each session with the most recent dose taken before it, within 12
 * hours. Uses the median so one 2 AM outlier can't drag the estimate. Returns
 * null until there are enough pairs to mean anything — a confident number
 * drawn from two nights would be worse than no number.
 */
export function suggestedOnset(sessions, doses, minSamples = MIN_ONSET_SAMPLES) {
  if (!Array.isArray(sessions) || !Array.isArray(doses)) return null;
  const taken = doses
    .filter((d) => d && typeof d.takenAt === 'number')
    .sort((a, b) => a.takenAt - b.takenAt);
  if (taken.length === 0) return null;

  const gaps = [];
  for (const s of sessions) {
    if (!s || typeof s.startedAt !== 'number') continue;
    // The nearest dose at or before this session — never one taken afterwards.
    let best = null;
    for (const d of taken) {
      if (d.takenAt > s.startedAt) break;
      best = d;
    }
    if (!best) continue;
    const gap = s.startedAt - best.takenAt;
    if (gap > PAIR_MAX_MS) continue;
    gaps.push(gap);
  }

  if (gaps.length < minSamples) return null;
  const ms = median(gaps);
  return { hours: Math.round((ms / HOUR_MS) * 100) / 100, samples: gaps.length };
}

/** "4h 20m" — for showing an inferred onset back in words. */
export function formatHours(hours) {
  const total = Math.max(0, Math.round(hours * 60));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

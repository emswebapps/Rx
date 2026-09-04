// What shows up first.
//
// The warning signs already exist — they're the chips in Step 1, and the list
// you edit in My Kit. What's missing is *when*. A sign tagged at 4h after a
// dose and one tagged at 6h are telling you different things, and the one that
// reliably arrives earliest is the one worth learning to notice, because it's
// the only one that arrives while you can still do something about it.
//
// Two sources, one vocabulary: a standalone tap from the home screen, and the
// signs recorded inside a crash session. Both are the same sign ids, so they
// pool.
//
// The discipline here is copied deliberately from `suggestedOnset` in
// window.js: pair against the nearest dose at or before, take the median so one
// bad night can't move it, and say nothing at all until there's enough to mean
// something. A confident number drawn from two evenings would be worse than no
// number.
//
// Pure and Firebase-free so `node --test` can run it.

import { HOUR_MS, PAIR_MAX_MS } from './window.js';
import { takenDoses } from './meds.js';

export const MIN_SIGN_SAMPLES = 4;

function median(nums) {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Every moment a sign was tagged, from both places it can be tagged.
 *
 * A session contributes its signs at `startedAt` — the moment the person
 * decided this was a crash, which is when they were true.
 */
export function signEvents(behaviors = [], sessions = []) {
  const out = [];

  for (const b of Array.isArray(behaviors) ? behaviors : []) {
    if (!b || typeof b.at !== 'number') continue;
    for (const id of new Set(b.signIds || [])) {
      out.push({ signId: id, at: b.at, source: 'check' });
    }
  }

  for (const s of Array.isArray(sessions) ? sessions : []) {
    if (!s || typeof s.startedAt !== 'number') continue;
    for (const id of new Set(s.signs || [])) {
      out.push({ signId: id, at: s.startedAt, source: 'session' });
    }
  }

  return out.sort((a, b) => a.at - b.at);
}

/**
 * For each sign, how long after a dose it typically shows up.
 *
 * Returns earliest-first, so the top of the list is the earliest warning the
 * user actually has. Signs below the sample minimum are dropped rather than
 * shown with a shaky number.
 */
export function signTimings(behaviors, sessions, doses, signs = [], minSamples = MIN_SIGN_SAMPLES) {
  const taken = takenDoses(doses).slice().sort((a, b) => a.takenAt - b.takenAt);
  if (taken.length === 0) return [];

  const labels = new Map((Array.isArray(signs) ? signs : []).map((s) => [s.id, s.text]));
  const gaps = new Map();

  for (const ev of signEvents(behaviors, sessions)) {
    // The nearest dose at or before this moment — never one taken afterwards.
    let best = null;
    for (const d of taken) {
      if (d.takenAt > ev.at) break;
      best = d;
    }
    if (!best) continue;
    const gap = ev.at - best.takenAt;
    if (gap < 0 || gap > PAIR_MAX_MS) continue;
    if (!gaps.has(ev.signId)) gaps.set(ev.signId, []);
    gaps.get(ev.signId).push(gap);
  }

  const out = [];
  for (const [signId, list] of gaps) {
    if (list.length < minSamples) continue;
    out.push({
      signId,
      text: labels.get(signId) || signId,
      count: list.length,
      hours: Math.round((median(list) / HOUR_MS) * 100) / 100,
    });
  }

  return out.sort((a, b) => a.hours - b.hours || b.count - a.count);
}

/**
 * The single earliest reliable sign, or null when nothing has earned it. This
 * is the sentence worth putting in front of someone: not "you crash at 6",
 * but "the first thing you notice is usually this, about an hour before".
 */
export function earliestSign(timings) {
  return Array.isArray(timings) && timings.length > 0 ? timings[0] : null;
}

/** How many signs a standalone check recorded in the last `withinMs`. */
export function recentCheckCount(behaviors, now = Date.now(), withinMs = 24 * HOUR_MS) {
  if (!Array.isArray(behaviors)) return 0;
  return behaviors.filter(
    (b) => b && typeof b.at === 'number' && now - b.at <= withinMs && now - b.at >= 0,
  ).length;
}

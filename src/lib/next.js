// The one thing to look at right now.
//
// Today used to answer "what now?" by listing everything and leaving the
// reader to find it. With routines, check-ins, water and the evening window
// all on one screen, that stopped working for exactly the person this app is
// for. This picks a single answer, in order of urgency:
//
//   1. a wait that's counting down        → the countdown
//   2. a routine step that's up next      → that step, one tap to check off
//   3. the next dose due                  → how long until it
//   4. nothing left today, crash ahead    → how long until the window
//   5. nothing at all                     → done for the day
//
// Pure and Firebase-free so `node --test` can run it.

const MINUTE_MS = 60 * 1000;

// A routine only takes over the top of the screen once its dose is this close.
// Hours earlier, "eat 2 eggs" for the afternoon dose is noise.
export const ROUTINE_LEAD_MS = 90 * MINUTE_MS;

/**
 * `schedule` is expectedDosesOnDay for today; `routines` is routinesForDay
 * over it; `window` is effectiveWindow (or null).
 */
export function nextUp({ schedule = [], routines = [], window = null, now = Date.now() }) {
  // 1. A wait running anywhere wins — it's the only thing with a hard edge.
  for (const r of routines) {
    const i = r.steps.findIndex((s) => s.state === 'waiting');
    if (i < 0) continue;
    const after = r.steps[i + 1] || null;
    return {
      kind: 'wait', key: r.key, entry: r.entry, endsAt: r.steps[i].endsAt,
      minutes: r.steps[i].minutes, then: after, routine: r,
    };
  }

  const open = schedule
    .filter((e) => (e.state === 'due' || e.state === 'upcoming') && e.expectedAt != null)
    .sort((a, b) => a.expectedAt - b.expectedAt);

  // 2. The routine for the next dose, once it's close enough to start.
  for (const e of open) {
    const r = routines.find((x) => x.key === e.key);
    if (!r || !r.current || r.current.kind === 'dose') break;
    if (e.expectedAt - now > ROUTINE_LEAD_MS) break;
    return { kind: 'step', key: e.key, entry: e, step: r.current, routine: r };
  }

  // 3. The next dose.
  if (open.length) {
    const e = open[0];
    return { kind: 'dose', key: e.key, entry: e, at: e.expectedAt, due: e.state === 'due' };
  }

  // 4. Nothing left to take: the evening is the next thing coming.
  if (window && !window.provisional && now < window.start) {
    return { kind: 'crash', at: window.start, end: window.end };
  }
  if (window && now >= window.start && now < window.end) {
    return { kind: 'inCrash', end: window.end };
  }

  return { kind: 'done' };
}

/**
 * A dose-time group is finished once nothing in it is still waiting on you:
 * taken, skipped, or missed. On today those fold away so the screen shows
 * what's left rather than what's done.
 */
export function groupSettled(entries) {
  return entries.length > 0 && entries.every((e) => (
    e.state === 'taken' || e.state === 'skipped' || e.state === 'skipped-on-purpose'));
}

/** "2h 05m" / "14m" / "45s" — a short countdown for tiles and headings. */
export function formatUntil(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${String(m % 60).padStart(2, '0')}m`;
}

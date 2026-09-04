// The Crash Protocol state machine.
//
// Deliberately pure and Firebase-free so `node --test` can run it, and so the
// rules that matter — how long the timer has left, whether a session is still
// live after the app was closed — can be asserted without a browser.
//
// The one design rule encoded here: every step is skippable. A person in a
// crash who hits a wall they can't get past closes the app, and then the tool
// has done nothing at all.

export const STEPS = ['checkin', 'brake', 'facts', 'rate', 'tomorrow', 'move', 'close'];

export const STEP_META = {
  checkin:  { n: 1, title: 'What’s happening', skip: 'Skip this' },
  brake:    { n: 2, title: 'Tell him', skip: 'He’s not here' },
  facts:    { n: 3, title: 'Facts vs. story', skip: 'Not now' },
  rate:     { n: 4, title: 'How big is this', skip: 'Skip this' },
  tomorrow: { n: 5, title: 'The tomorrow test', skip: 'Skip this' },
  move:     { n: 6, title: 'Change something', skip: 'Skip this' },
  close:    { n: 7, title: 'Where are you now', skip: 'Finish later' },
};

// A session left open overnight isn't a crash any more, it's a forgotten tab.
export const STALE_AFTER_MS = 8 * 60 * 60 * 1000;

export const DEFAULT_TIMER_MINUTES = 30;

export function stepIndex(step) {
  const i = STEPS.indexOf(step);
  return i === -1 ? 0 : i;
}

export function nextStep(step) {
  const i = STEPS.indexOf(step);
  if (i === -1 || i >= STEPS.length - 1) return 'close';
  return STEPS[i + 1];
}

export function prevStep(step) {
  const i = STEPS.indexOf(step);
  if (i <= 0) return STEPS[0];
  return STEPS[i - 1];
}

export function isLastStep(step) {
  return step === STEPS[STEPS.length - 1];
}

// Every step can be skipped, on purpose. See the note at the top of the file.
export function isSkippable() {
  return true;
}

export function createSession(id, now = Date.now(), timerMinutes = DEFAULT_TIMER_MINUTES) {
  const minutes = Number(timerMinutes) > 0 ? Number(timerMinutes) : DEFAULT_TIMER_MINUTES;
  return {
    id,
    startedAt: now,
    endedAt: null,
    timerEndsAt: now + minutes * 60 * 1000,
    step: 'checkin',
    signs: [],
    feeling: null,
    intensity: null,
    intensityAfter: null,
    facts: [],
    stories: [],
    tomorrow: { sameIssue: null, sameWay: null },
    brakeSent: false,
    moves: [],
    outcome: null,
    outcomeNote: '',
  };
}

// Computed from an absolute timestamp rather than elapsed state, which is the
// whole reason closing the app to walk the dogs doesn't break the timer.
export function timerRemaining(session, now = Date.now()) {
  if (!session || !session.timerEndsAt) return 0;
  return Math.max(0, session.timerEndsAt - now);
}

export function isTimerDone(session, now = Date.now()) {
  return timerRemaining(session, now) === 0;
}

// Extending an expired timer has to extend from *now*, not from the stale end
// time — otherwise "give me 10 more minutes" at minute 45 grants zero seconds.
export function extendedEnd(session, extraMinutes, now = Date.now()) {
  const base = Math.max(session?.timerEndsAt || 0, now);
  return base + extraMinutes * 60 * 1000;
}

export function isStale(session, now = Date.now()) {
  if (!session) return false;
  return now - session.startedAt > STALE_AFTER_MS;
}

// The open session, if there is one worth resuming. Newest wins, since an
// older open session is almost always one that was abandoned.
export function activeSession(sessions, now = Date.now()) {
  if (!Array.isArray(sessions)) return null;
  const open = sessions
    .filter((s) => s && !s.endedAt && !isStale(s, now))
    .sort((a, b) => b.startedAt - a.startedAt);
  return open[0] || null;
}

// Sessions left open past the stale window, so they can be closed out rather
// than sitting in the list forever pretending to be live.
export function staleSessions(sessions, now = Date.now()) {
  if (!Array.isArray(sessions)) return [];
  return sessions.filter((s) => s && !s.endedAt && isStale(s, now));
}

// "18:42" — minutes and seconds, because at this point an hour is never in play.
export function formatRemaining(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Escrow releases at 9 AM the next morning — the "would I say this the same way
// tomorrow morning?" question, turned into a timestamp.
export function defaultReleaseAt(now = Date.now()) {
  const d = new Date(now);
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d.getTime();
}

export function isReleased(draft, now = Date.now()) {
  if (!draft) return false;
  return now >= draft.releaseAt;
}

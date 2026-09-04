import test from 'node:test';
import assert from 'node:assert/strict';
import {
  latestDose, predictWindow, windowState, windowProgress, suggestedOnset, formatHours,
  HOUR_MS, SOON_MS, MIN_ONSET_SAMPLES,
} from './window.js';

const T0 = new Date(2026, 0, 15, 14, 14).getTime(); // 2:14 PM
const dose = (id, at) => ({ id, takenAt: at });

test('with nothing logged there is no window, rather than a guess', () => {
  assert.equal(predictWindow([], {}, T0), null);
  assert.equal(predictWindow(undefined, {}, T0), null);
  assert.equal(latestDose([], T0), null);
});

test('a dose from days ago governs nothing', () => {
  const old = dose('old', T0 - 3 * 24 * HOUR_MS);
  assert.equal(latestDose([old], T0), null);
  assert.equal(predictWindow([old], {}, T0), null);
});

test('the window is onset hours after the dose, lasting duration hours', () => {
  const w = predictWindow([dose('d', T0)], { onsetHours: 4, durationHours: 5 }, T0);
  assert.equal(w.start, T0 + 4 * HOUR_MS);
  assert.equal(w.end, T0 + 9 * HOUR_MS);
  assert.equal(w.doseId, 'd');
});

test('defaults are used when the kit has nothing set', () => {
  const w = predictWindow([dose('d', T0)], {}, T0);
  assert.equal(w.start, T0 + 4 * HOUR_MS);
  assert.equal(w.end, T0 + 9 * HOUR_MS);
});

test('a nonsense onset falls back rather than producing a broken window', () => {
  const w = predictWindow([dose('d', T0)], { onsetHours: 0, durationHours: -3 }, T0);
  assert.equal(w.start, T0 + 4 * HOUR_MS);
  assert.equal(w.end, T0 + 9 * HOUR_MS);
});

test('a second dose the same day moves the window — the last one governs', () => {
  const first = dose('a', T0);
  const second = dose('b', T0 + 3 * HOUR_MS);
  const w = predictWindow([first, second], {}, T0 + 4 * HOUR_MS);
  assert.equal(w.doseId, 'b');
  assert.equal(w.start, second.takenAt + 4 * HOUR_MS);
});

test('a dose logged for later today is not treated as already taken', () => {
  const future = dose('later', T0 + 2 * HOUR_MS);
  assert.equal(latestDose([future], T0), null);
});

test('a late-evening window is still live before midnight', () => {
  const afternoon = new Date(2026, 0, 15, 15, 0).getTime();   // window 7pm–midnight
  const lateEvening = new Date(2026, 0, 15, 23, 30).getTime();
  const w = predictWindow([dose('d', afternoon)], {}, lateEvening);
  assert.equal(windowState(w, lateEvening), 'inside');
});

test('after midnight, yesterday’s dose is still the one being reported on', () => {
  const afternoon = new Date(2026, 0, 15, 15, 0).getTime();
  const pastMidnight = new Date(2026, 0, 16, 0, 30).getTime();
  const w = predictWindow([dose('d', afternoon)], {}, pastMidnight);
  // A calendar-day rule would return null here and blank the screen at exactly
  // the hour someone is most likely to be looking at it.
  assert.ok(w, 'the dose should still be found after midnight');
  assert.equal(w.doseId, 'd');
  assert.equal(windowState(w, pastMidnight), 'past');
});

test('windowState walks before → soon → inside → past', () => {
  const w = predictWindow([dose('d', T0)], { onsetHours: 4, durationHours: 5 }, T0);
  assert.equal(windowState(w, w.start - SOON_MS - 1000), 'before');
  assert.equal(windowState(w, w.start - SOON_MS), 'soon');
  assert.equal(windowState(w, w.start - 60_000), 'soon');
  assert.equal(windowState(w, w.start), 'inside');
  assert.equal(windowState(w, w.end - 1000), 'inside');
  assert.equal(windowState(w, w.end), 'past');
  assert.equal(windowState(null, T0), 'none');
});

test('progress is clamped either side of the window', () => {
  const w = predictWindow([dose('d', T0)], {}, T0);
  assert.equal(windowProgress(w, w.start - HOUR_MS), 0);
  assert.equal(windowProgress(w, w.start + (w.end - w.start) / 2), 0.5);
  assert.equal(windowProgress(w, w.end + HOUR_MS), 1);
});

// ── inferring the real onset ────────────────────────────────────────────────

const pair = (i, gapHours) => {
  const taken = T0 + i * 24 * HOUR_MS;
  return { d: dose(`d${i}`, taken), s: { id: `s${i}`, startedAt: taken + gapHours * HOUR_MS } };
};

test('no suggestion until there are enough nights to mean anything', () => {
  const ps = [0, 1, 2].map((i) => pair(i, 4));
  const out = suggestedOnset(ps.map((p) => p.s), ps.map((p) => p.d));
  assert.equal(out, null, `fewer than ${MIN_ONSET_SAMPLES} pairs should say nothing`);
});

test('the suggestion is the median gap, so one bad night cannot drag it', () => {
  const ps = [0, 1, 2, 3, 4].map((i) => pair(i, i === 4 ? 11 : 4.5));
  const out = suggestedOnset(ps.map((p) => p.s), ps.map((p) => p.d));
  assert.equal(out.samples, 5);
  assert.equal(out.hours, 4.5, 'the 11-hour outlier must not move the median');
});

test('a session with no dose before it is not counted', () => {
  const ps = [0, 1, 2, 3, 4].map((i) => pair(i, 4));
  const orphan = { id: 'orphan', startedAt: T0 - 30 * 24 * HOUR_MS };
  const out = suggestedOnset([...ps.map((p) => p.s), orphan], ps.map((p) => p.d));
  assert.equal(out.samples, 5);
});

test('a dose taken after a session is never paired backwards with it', () => {
  const session = { id: 's', startedAt: T0 };
  const after = dose('after', T0 + 2 * HOUR_MS);
  assert.equal(suggestedOnset([session], [after], 1), null);
});

test('a gap longer than the pairing window is dropped as unrelated', () => {
  const taken = T0;
  const session = { id: 's', startedAt: taken + 20 * HOUR_MS };
  assert.equal(suggestedOnset([session], [dose('d', taken)], 1), null);
});

test('the nearest earlier dose wins when several precede a session', () => {
  const early = dose('early', T0);
  const late = dose('late', T0 + 3 * HOUR_MS);
  const session = { id: 's', startedAt: T0 + 7 * HOUR_MS };
  const out = suggestedOnset([session], [early, late], 1);
  assert.equal(out.hours, 4, 'gap should be measured from the 3-hour-later dose');
});

test('suggestedOnset is safe on empty and undefined input', () => {
  assert.equal(suggestedOnset([], []), null);
  assert.equal(suggestedOnset(undefined, undefined), null);
});

test('formatHours reads the way a person would say it', () => {
  assert.equal(formatHours(4), '4h');
  assert.equal(formatHours(4.333), '4h 20m');
  assert.equal(formatHours(0.5), '30m');
});

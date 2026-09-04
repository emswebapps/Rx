import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STEPS, nextStep, prevStep, isLastStep, createSession, timerRemaining, isTimerDone,
  activeSession, staleSessions, isStale, formatRemaining, defaultReleaseAt, isReleased,
  STALE_AFTER_MS, extendedEnd,
} from './protocol.js';

test('nextStep walks the whole order and stops at close', () => {
  let step = STEPS[0];
  const seen = [step];
  for (let i = 0; i < 20 && !isLastStep(step); i++) {
    step = nextStep(step);
    seen.push(step);
  }
  assert.deepEqual(seen, STEPS);
  assert.equal(nextStep('close'), 'close');
});

test('prevStep never walks off the front', () => {
  assert.equal(prevStep('checkin'), 'checkin');
  assert.equal(prevStep('facts'), 'brake');
});

test('an unknown step falls back rather than throwing', () => {
  assert.equal(nextStep('nonsense'), 'close');
  assert.equal(prevStep('nonsense'), 'checkin');
});

test('the timer is computed from an absolute end time, so a reload cannot lose it', () => {
  const t0 = 1_700_000_000_000;
  const s = createSession('a', t0, 30);
  // Ten minutes later, whether or not the app stayed open in between.
  assert.equal(timerRemaining(s, t0 + 10 * 60_000), 20 * 60_000);
  assert.equal(isTimerDone(s, t0 + 10 * 60_000), false);
});

test('the timer clamps at zero instead of going negative', () => {
  const t0 = 1_700_000_000_000;
  const s = createSession('a', t0, 30);
  assert.equal(timerRemaining(s, t0 + 90 * 60_000), 0);
  assert.equal(isTimerDone(s, t0 + 90 * 60_000), true);
});

test('a bad timer length falls back to 30 minutes', () => {
  const t0 = 1_700_000_000_000;
  assert.equal(createSession('a', t0, 0).timerEndsAt, t0 + 30 * 60_000);
  assert.equal(createSession('a', t0, undefined).timerEndsAt, t0 + 30 * 60_000);
});

test('activeSession finds the open one and ignores finished ones', () => {
  const now = 1_700_000_000_000;
  const done = { id: 'done', startedAt: now - 60_000, endedAt: now - 1000 };
  const open = { id: 'open', startedAt: now - 60_000, endedAt: null };
  assert.equal(activeSession([done, open], now).id, 'open');
  assert.equal(activeSession([done], now), null);
  assert.equal(activeSession([], now), null);
  assert.equal(activeSession(undefined, now), null);
});

test('a session older than the stale window is not offered for resume', () => {
  const now = 1_700_000_000_000;
  const old = { id: 'old', startedAt: now - STALE_AFTER_MS - 1000, endedAt: null };
  assert.equal(isStale(old, now), true);
  assert.equal(activeSession([old], now), null);
  assert.deepEqual(staleSessions([old], now).map((s) => s.id), ['old']);
});

test('the newest open session wins', () => {
  const now = 1_700_000_000_000;
  const older = { id: 'older', startedAt: now - 60 * 60_000, endedAt: null };
  const newer = { id: 'newer', startedAt: now - 60_000, endedAt: null };
  assert.equal(activeSession([older, newer], now).id, 'newer');
});

test('formatRemaining reads as minutes and seconds', () => {
  assert.equal(formatRemaining(18 * 60_000 + 42_000), '18:42');
  assert.equal(formatRemaining(0), '0:00');
  assert.equal(formatRemaining(-5000), '0:00');
  assert.equal(formatRemaining(9000), '0:09');
});

test('escrow releases at 9am the next morning', () => {
  const evening = new Date(2026, 0, 15, 21, 30).getTime();
  const release = new Date(defaultReleaseAt(evening));
  assert.equal(release.getDate(), 16);
  assert.equal(release.getHours(), 9);
  assert.equal(release.getMinutes(), 0);
  assert.equal(isReleased({ releaseAt: release.getTime() }, evening), false);
  assert.equal(isReleased({ releaseAt: release.getTime() }, release.getTime() + 1), true);
});

test('extending an already-expired timer extends from now, not from the stale end', () => {
  const t0 = 1_700_000_000_000;
  const s = createSession('a', t0, 30);
  const late = t0 + 45 * 60_000; // 15 minutes past the end
  assert.equal(extendedEnd(s, 10, late), late + 10 * 60_000);
});

test('extending a running timer adds to the existing end', () => {
  const t0 = 1_700_000_000_000;
  const s = createSession('a', t0, 30);
  const mid = t0 + 10 * 60_000;
  assert.equal(extendedEnd(s, 10, mid), s.timerEndsAt + 10 * 60_000);
});

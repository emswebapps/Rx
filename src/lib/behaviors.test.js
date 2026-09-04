// What shows up first, and — more importantly — when the app should refuse to
// say.

import { test } from 'node:test';
import assert from 'node:assert';

import { signEvents, signTimings, earliestSign, recentCheckCount, MIN_SIGN_SAMPLES } from './behaviors.js';

const H = 60 * 60 * 1000;
const DAY = 24 * H;
const T0 = new Date(2026, 7, 20, 8, 0, 0, 0).getTime();

const SIGNS = [
  { id: 'rereading', text: 'I’m rereading texts' },
  { id: 'tone', text: 'I’m reading a lot into his tone' },
];

/** n days of: a dose at 08:00, then the sign tagged `hours` later. */
function nights(signId, hours, n, source = 'check') {
  const doses = [];
  const behaviors = [];
  const sessions = [];
  for (let i = 0; i < n; i += 1) {
    const dose = T0 + i * DAY;
    doses.push({ id: `d${i}`, takenAt: dose, medId: 'm', status: 'taken' });
    if (source === 'check') behaviors.push({ id: `b${i}`, at: dose + hours * H, signIds: [signId] });
    else sessions.push({ id: `s${i}`, startedAt: dose + hours * H, signs: [signId] });
  }
  return { doses, behaviors, sessions };
}

// ── pooling the two sources ─────────────────────────────────────────────────

test('a standalone tap and a session check-in are the same vocabulary', () => {
  const events = signEvents(
    [{ id: 'b', at: 200, signIds: ['tone'] }],
    [{ id: 's', startedAt: 100, signs: ['tone', 'rereading'] }],
  );
  assert.deepStrictEqual(events, [
    { signId: 'tone', at: 100, source: 'session' },
    { signId: 'rereading', at: 100, source: 'session' },
    { signId: 'tone', at: 200, source: 'check' },
  ]);
});

test('a sign tagged twice in one entry counts once', () => {
  const events = signEvents([{ id: 'b', at: 100, signIds: ['tone', 'tone'] }], []);
  assert.strictEqual(events.length, 1);
});

test('malformed rows are skipped rather than thrown on', () => {
  assert.deepStrictEqual(signEvents(undefined, undefined), []);
  assert.deepStrictEqual(signEvents([null, { at: 'soon', signIds: ['x'] }], [{ signs: ['y'] }]), []);
});

// ── the sample floor ────────────────────────────────────────────────────────

test('it says nothing at all until there is enough to mean something', () => {
  for (let n = 1; n < MIN_SIGN_SAMPLES; n += 1) {
    const { doses, behaviors } = nights('tone', 5, n);
    assert.deepStrictEqual(signTimings(behaviors, [], doses, SIGNS), [], `${n} nights is not a pattern`);
  }
  const { doses, behaviors } = nights('tone', 5, MIN_SIGN_SAMPLES);
  assert.strictEqual(signTimings(behaviors, [], doses, SIGNS).length, 1);
});

test('with no doses logged there is nothing to measure against', () => {
  const { behaviors } = nights('tone', 5, 10);
  assert.deepStrictEqual(signTimings(behaviors, [], [], SIGNS), []);
});

// ── the number itself ───────────────────────────────────────────────────────

test('the timing is the median, so one strange night cannot move it', () => {
  const { doses, behaviors } = nights('tone', 5, 6);
  // One 2 AM outlier, eleven hours out.
  behaviors.push({ id: 'odd', at: doses[0].takenAt + 11 * H, signIds: ['tone'] });
  const [row] = signTimings(behaviors, [], doses, SIGNS);
  assert.strictEqual(row.hours, 5, 'the median holds');
  assert.strictEqual(row.count, 7);
});

test('signs come back earliest first — the earliest is the useful one', () => {
  const early = nights('rereading', 3.5, 5);
  const late = nights('tone', 6, 5);
  const rows = signTimings(
    [...early.behaviors, ...late.behaviors], [], early.doses, SIGNS,
  );
  assert.deepStrictEqual(rows.map((r) => r.signId), ['rereading', 'tone']);
  assert.strictEqual(rows[0].hours, 3.5);
  assert.strictEqual(earliestSign(rows).signId, 'rereading');
});

test('the sign’s own words come back with it, and an unknown id survives', () => {
  const { doses, behaviors } = nights('deleted-sign', 4, 5);
  const [row] = signTimings(behaviors, [], doses, SIGNS);
  assert.strictEqual(row.text, 'deleted-sign', 'a deleted sign is not a crash');

  const named = nights('tone', 4, 5);
  assert.strictEqual(signTimings(named.behaviors, [], named.doses, SIGNS)[0].text, SIGNS[1].text);
});

test('sessions on their own are enough — nothing has to be logged separately', () => {
  const { doses, sessions } = nights('tone', 5, 5, 'session');
  const [row] = signTimings([], sessions, doses, SIGNS);
  assert.strictEqual(row.count, 5);
  assert.strictEqual(row.hours, 5);
});

// ── what does not get paired ────────────────────────────────────────────────

test('a sign tagged more than twelve hours after a dose is not about that dose', () => {
  const doses = [{ id: 'd', takenAt: T0, medId: 'm', status: 'taken' }];
  const behaviors = Array.from({ length: 6 }, (_, i) => ({
    id: `b${i}`, at: T0 + 13 * H + i, signIds: ['tone'],
  }));
  assert.deepStrictEqual(signTimings(behaviors, [], doses, SIGNS), []);
});

test('a sign tagged before any dose is not paired with a later one', () => {
  const doses = [{ id: 'd', takenAt: T0 + 5 * H, medId: 'm', status: 'taken' }];
  const behaviors = Array.from({ length: 6 }, (_, i) => ({
    id: `b${i}`, at: T0 + i, signIds: ['tone'],
  }));
  assert.deepStrictEqual(signTimings(behaviors, [], doses, SIGNS), []);
});

test('a skipped dose is not something a sign can be measured from', () => {
  const { behaviors, doses } = nights('tone', 5, 5);
  const skipped = doses.map((d) => ({ ...d, status: 'skipped' }));
  assert.deepStrictEqual(signTimings(behaviors, [], skipped, SIGNS), []);
});

// ── the home-screen counter ─────────────────────────────────────────────────

test('recent checks count the last day only', () => {
  const now = T0 + 10 * DAY;
  const behaviors = [
    { id: 'a', at: now - H, signIds: ['tone'] },
    { id: 'b', at: now - 2 * DAY, signIds: ['tone'] },
    { id: 'c', at: now + H, signIds: ['tone'] },
  ];
  assert.strictEqual(recentCheckCount(behaviors, now), 1);
  assert.strictEqual(recentCheckCount(undefined, now), 0);
});

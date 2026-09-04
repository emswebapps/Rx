// The other half of the contract. See the long note in
// src/rx/regimen.parity.test.js — this asserts the CommonJS port
// against the same recorded answers the client module is held to.
//
// Run with: npm test  (from the functions/ directory)
const assert = require('node:assert');
const { test } = require('node:test');
const path = require('node:path');

const {
  expectedDosesToday, effectiveWindow, dueRules, supplyStatus,
} = require('../regimen');

const fixture = require(path.join(__dirname, '../fixtures/regimen-cases.json'));
const TZ = fixture.tz;

const serializeExpected = (list) =>
  list.map((e) => ({
    medId: e.medId, slotId: e.slotId, amount: e.amount,
    expectedAt: e.expectedAt, state: e.state,
  }));

const serializeWindow = (w) => (w == null ? null : {
  start: w.start, end: w.end, doseId: w.doseId, medId: w.medId,
  provisional: w.provisional, pendingMedId: w.pendingMedId,
  pendingExpectedAt: w.pendingExpectedAt,
  wouldBecomeStart: w.wouldBecome ? w.wouldBecome.start : null,
  wouldBecomeEnd: w.wouldBecome ? w.wouldBecome.end : null,
});

const serializeRules = (list) =>
  list.map((r) => ({ medId: r.medId, ruleId: r.ruleId, at: r.at }));

const serializeSupply = (meds, now) =>
  meds.map((m) => {
    const s = supplyStatus(m, now, TZ);
    return {
      medId: m.id, tracked: s.tracked, dosesLeft: s.dosesLeft, daysLeft: s.daysLeft,
      perDay: s.perDay, low: s.low, refillOpen: s.refillOpen, daysUntilRefill: s.daysUntilRefill,
    };
  });

for (const c of fixture.cases) {
  test(`regimen.js matches the recorded answer: ${c.name}`, () => {
    assert.deepStrictEqual(
      serializeExpected(expectedDosesToday(c.meds, c.doses, c.now, TZ)),
      c.expect.expectedDoses,
      'expectedDosesToday',
    );
    assert.deepStrictEqual(
      serializeWindow(effectiveWindow(c.meds, c.doses, c.kit, c.now, TZ)),
      c.expect.window,
      'effectiveWindow',
    );
    assert.deepStrictEqual(
      serializeRules(dueRules(c.meds, c.doses, c.now, TZ)),
      c.expect.dueRules,
      'dueRules',
    );
    assert.deepStrictEqual(
      serializeSupply(c.meds, c.now),
      c.expect.supply,
      'supplyStatus',
    );
  });
}

// The scheduler runs in UTC and the user does not. This is the bug the port
// exists to avoid: an 8 AM dose must be 8 AM where they are, not where the
// container is.
test('a scheduled time is resolved in the user’s zone, not the server’s', () => {
  const meds = [{ id: 'm', schedule: { mode: 'clock', time: '08:00' }, active: true }];
  const noonUTC = Date.UTC(2026, 7, 29, 12, 0);

  const ny = expectedDosesToday(meds, [], noonUTC, 'America/New_York')[0];
  const la = expectedDosesToday(meds, [], noonUTC, 'America/Los_Angeles')[0];

  assert.strictEqual(ny.expectedAt, Date.UTC(2026, 7, 29, 12, 0)); // 08:00 EDT
  assert.strictEqual(la.expectedAt, Date.UTC(2026, 7, 29, 15, 0)); // 08:00 PDT
  assert.notStrictEqual(ny.expectedAt, la.expectedAt);
});

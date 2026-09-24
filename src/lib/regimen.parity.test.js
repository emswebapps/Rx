// Half of the contract that keeps the client and the scheduler agreeing about
// when your evening starts.
//
// The regimen maths exists twice — here as ESM, and in functions/crashRegimen.js
// as CommonJS — because the client is a Vite bundle and the scheduler is a
// CommonJS deployment that only ships its own directory. Neither can import the
// other. So instead of a comment asking the next person to keep them in step,
// both are asserted against one recorded set of answers:
//
//   functions/fixtures/regimen-cases.json
//
// If this file goes red, meds.js has drifted from those answers. Read the
// failing case before touching anything: either the change is wrong, or the
// fixture needs regenerating AND functions/crashRegimen.js needs the same edit.
// Regenerating the fixture to make this green, on its own, silently mistimes a
// push notification that someone is relying on.
//
//   TZ=America/New_York node scripts/make-regimen-fixtures.mjs
//
// The fixture was recorded in a fixed zone, so the test pins the same one — the
// clock maths here is local-time by design and would otherwise depend on
// whichever machine ran it.

import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  expectedDosesToday, effectiveWindow, dueRules, supplyStatus,
} from './meds.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(join(here, '../../functions/fixtures/regimen-cases.json'), 'utf8'),
);

process.env.TZ = fixture.tz;

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

const serializeSupply = (meds, now, doses) =>
  meds.map((m) => {
    const s = supplyStatus(m, now, doses);
    return {
      medId: m.id, tracked: s.tracked, dosesLeft: s.dosesLeft, daysLeft: s.daysLeft,
      perDay: s.perDay, low: s.low, refillOpen: s.refillOpen, daysUntilRefill: s.daysUntilRefill,
      runOutAt: s.runOutAt, coverDays: s.coverDays, gapDays: s.gapDays, shortBeforeRefill: s.shortBeforeRefill,
    };
  });

for (const c of fixture.cases) {
  test(`meds.js matches the recorded answer: ${c.name}`, () => {
    assert.deepStrictEqual(
      serializeExpected(expectedDosesToday(c.meds, c.doses, c.now)),
      c.expect.expectedDoses,
      'expectedDosesToday',
    );
    assert.deepStrictEqual(
      serializeWindow(effectiveWindow(c.meds, c.doses, c.kit, c.now)),
      c.expect.window,
      'effectiveWindow',
    );
    assert.deepStrictEqual(
      serializeRules(dueRules(c.meds, c.doses, c.now)),
      c.expect.dueRules,
      'dueRules',
    );
    assert.deepStrictEqual(
      serializeSupply(c.meds, c.now, c.doses),
      c.expect.supply,
      'supplyStatus',
    );
  });
}

test('the fixture actually covers the case this whole feature turns on', () => {
  const names = fixture.cases.map((c) => c.name).join('\n');
  assert.match(names, /booster grace has passed/, 'a skipped booster must be covered');
  assert.match(names, /booster taken/, 'a taken booster must be covered');
  assert.match(names, /logged late/, 'a late booster must be covered');
  assert.match(names, /twice-daily/, 'more than one dose a day must be covered');
  assert.match(names, /weekdays-only/, 'a scheduled day off must be covered');
  assert.match(names, /skipped on purpose/, 'a deliberate skip must be covered');
});

// The other half of the contract in src/lib/daily.parity.test.js: the
// scheduler's port of the routine waits and the water reminders, held to the
// same recorded answers as the app.
//
// Run with: npm test  (from the functions/ directory)
const assert = require('node:assert');
const { test } = require('node:test');
const path = require('node:path');

const { dueWaitTags, waterReminderTag } = require('../daily');

const fixture = require(path.join(__dirname, '../fixtures/daily-cases.json'));
const TZ = fixture.tz;
const byName = new Map(fixture.scenarios.map((s) => [s.name, s]));

test('routine waits and water reminders match the recorded answers', () => {
  for (const c of fixture.cases) {
    const s = byName.get(c.scenario);
    const waits = dueWaitTags(s.meds, s.doses, s.runs, c.now, TZ);
    const water = waterReminderTag(s.water, s.doses, s.kit.water, c.now, TZ);
    assert.deepStrictEqual({ waits, water }, { waits: c.waits, water: c.water }, `${c.scenario} @ ${new Date(c.now).toISOString()}`);
  }
});

test('the fixture actually exercises both kinds', () => {
  assert.ok(fixture.cases.some((c) => c.waits.length > 0));
  assert.ok(fixture.cases.some((c) => c.water));
  assert.ok(fixture.cases.some((c) => !c.water && c.waits.length === 0));
});

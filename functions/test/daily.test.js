// The other half of the contract in src/lib/daily.parity.test.js: the
// scheduler's port of the routine waits, the water reminders and the meal
// times, held to the
// same recorded answers as the app.
//
// Run with: npm test  (from the functions/ directory)
const assert = require('node:assert');
const { test } = require('node:test');
const path = require('node:path');

const { dueWaitTags, waterReminderTag, dueMealTags } = require('../daily');

const fixture = require(path.join(__dirname, '../fixtures/daily-cases.json'));
const TZ = fixture.tz;
const byName = new Map(fixture.scenarios.map((s) => [s.name, s]));

test('routine waits, water and meal times match the recorded answers', () => {
  for (const c of fixture.cases) {
    const s = byName.get(c.scenario);
    const doses = s.live ? s.doses.filter((d) => d.takenAt <= c.now) : s.doses;
    const waits = dueWaitTags(s.meds, doses, s.runs, c.now, TZ);
    const water = waterReminderTag(s.water, doses, s.kit.water, c.now, TZ);
    const meals = dueMealTags(s.kit, s.eaten, s.meds, doses, s.runs, c.now, TZ);
    assert.deepStrictEqual(
      { waits, water, meals },
      { waits: c.waits, water: c.water, meals: c.meals },
      `${c.scenario} @ ${new Date(c.now).toISOString()}`,
    );
  }
});

test('the fixture actually exercises every kind', () => {
  assert.ok(fixture.cases.some((c) => c.waits.length > 0));
  assert.ok(fixture.cases.some((c) => c.water));
  assert.ok(fixture.cases.some((c) => !c.water && c.waits.length === 0 && c.meals.length === 0));
  // Each anchor that can buzz: a set time, after eating, the first dose, wear-off.
  for (const id of ['snack', 'lunch', 'late', 'dinner']) {
    assert.ok(fixture.cases.some((c) => c.meals.some((t) => t.endsWith(`-${id}`))), id);
  }
});

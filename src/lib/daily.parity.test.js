// Half of the contract that keeps the app and the scheduler agreeing about
// when a routine's wait is up, when a glass of water is due and when a meal
// time has come — and so about
// the tag each buzz goes out under, which is what stops the same reminder
// arriving twice. The other half is functions/test/daily.test.js; both read
//
//   functions/fixtures/daily-cases.json
//
// Regenerate it only deliberately, after changing BOTH implementations:
//
//   TZ=America/New_York node scripts/make-daily-fixtures.mjs

import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { expectedDosesToday } from './meds.js';
import { dueWaits, waitTag, dayKey } from './routine.js';
import { waterReminderTag } from './water.js';
import { mealsForDay, dueMealTags } from './mealPlan.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(join(here, '../../functions/fixtures/daily-cases.json'), 'utf8'),
);

process.env.TZ = fixture.tz;

const byName = new Map(fixture.scenarios.map((s) => [s.name, s]));

test('routine waits, water and meal times match the recorded answers', () => {
  for (const c of fixture.cases) {
    const s = byName.get(c.scenario);
    const doses = s.live ? s.doses.filter((d) => d.takenAt <= c.now) : s.doses;
    const entries = expectedDosesToday(s.meds, doses, c.now);
    const waits = dueWaits(entries, s.runs, c.now, c.now).map((w) => waitTag(w.runId, w.stepId));
    const water = waterReminderTag(s.water, doses, s.kit.water, c.now, dayKey(c.now));
    const meals = dueMealTags(mealsForDay({
      plan: s.kit.mealPlan, eaten: s.eaten, runs: s.runs, meds: s.meds, doses, kit: s.kit, dayTs: c.now, now: c.now,
    }), c.now);
    assert.deepStrictEqual(
      { waits, water, meals },
      { waits: c.waits, water: c.water, meals: c.meals },
      `${c.scenario} @ ${new Date(c.now).toISOString()}`,
    );
  }
});

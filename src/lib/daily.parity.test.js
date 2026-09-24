// Half of the contract that keeps the app and the scheduler agreeing about
// when a routine's wait is up and when a glass of water is due — and so about
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

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(join(here, '../../functions/fixtures/daily-cases.json'), 'utf8'),
);

process.env.TZ = fixture.tz;

const byName = new Map(fixture.scenarios.map((s) => [s.name, s]));

test('routine waits and water reminders match the recorded answers', () => {
  for (const c of fixture.cases) {
    const s = byName.get(c.scenario);
    const entries = expectedDosesToday(s.meds, s.doses, c.now);
    const waits = dueWaits(entries, s.runs, c.now, c.now).map((w) => waitTag(w.runId, w.stepId));
    const water = waterReminderTag(s.water, s.doses, s.kit.water, c.now, dayKey(c.now));
    assert.deepStrictEqual({ waits, water }, { waits: c.waits, water: c.water }, `${c.scenario} @ ${new Date(c.now).toISOString()}`);
  }
});

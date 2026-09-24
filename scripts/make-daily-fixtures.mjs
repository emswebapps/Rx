// Regenerates functions/fixtures/daily-cases.json — the recorded answers that
// src/lib/routine.js + water.js and functions/daily.js are BOTH asserted
// against: which routine wait has just run out, and which water reminder is
// due, at every five minutes of one morning.
//
// Same rule as the regimen fixture: run it deliberately, never to turn a red
// parity test green without reading why the answer moved.
//
//   TZ=America/New_York node scripts/make-daily-fixtures.mjs
import { writeFileSync } from 'node:fs';
import { expectedDosesToday } from '../src/lib/meds.js';
import { dueWaits, waitTag, markStep, dayKey } from '../src/lib/routine.js';
import { waterReminderTag } from '../src/lib/water.js';

const TZ = 'America/New_York';
if (process.env.TZ !== TZ) {
  console.error(`Run with TZ=${TZ}`);
  process.exit(1);
}
// 2026-09-24 is a Thursday in EDT (UTC-4).
const at = (h, m = 0) => Date.UTC(2026, 8, 24, h + 4, m);

const IR = {
  id: 'ir', name: 'Booster', kind: 'booster', graceMinutes: 45, onsetHours: 3, durationHours: 3,
  schedule: {
    times: [{
      id: 't1', mode: 'clock', time: '08:00', amount: 1,
      routine: [
        { id: 'eat', kind: 'task', text: 'Eat' },
        { id: 'w1', kind: 'wait', minutes: 30 },
        { id: 'take', kind: 'dose' },
        { id: 'w2', kind: 'wait', minutes: 20 },
        { id: 'water', kind: 'task', text: 'Full glass' },
      ],
    }],
    days: [0, 1, 2, 3, 4, 5, 6],
  },
  active: true,
};
const WATER = { enabled: true, everyMinutes: 45, goal: 3, until: '11:00' };

const scenarios = [
  {
    name: 'ate at 7:10, took it on time after the wait, glass at 9:00',
    meds: [IR],
    doses: [{ id: 'd1', medId: 'ir', slotId: 't1', takenAt: at(7, 42), status: 'taken' }],
    runs: markStep([], at(7, 10), 'ir', 't1', 'eat', at(7, 10)),
    water: [at(9)],
    kit: { water: WATER },
  },
  {
    name: 'ate at 7:10, nothing taken yet',
    meds: [IR],
    doses: [],
    runs: markStep([], at(7, 10), 'ir', 't1', 'eat', at(7, 10)),
    water: [],
    kit: { water: WATER },
  },
  {
    name: 'took it before the wait was up',
    meds: [IR],
    doses: [{ id: 'd1', medId: 'ir', slotId: 't1', takenAt: at(7, 20), status: 'taken' }],
    runs: markStep([], at(7, 10), 'ir', 't1', 'eat', at(7, 10)),
    water: [at(8), at(8, 30), at(9)],
    kit: { water: WATER },
  },
];

const cases = [];
for (const s of scenarios) {
  for (let t = at(6); t <= at(12); t += 5 * 60 * 1000) {
    const entries = expectedDosesToday(s.meds, s.doses, t);
    const waits = dueWaits(entries, s.runs, t, t).map((w) => waitTag(w.runId, w.stepId));
    const water = waterReminderTag(s.water, s.doses, s.kit.water, t, dayKey(t));
    cases.push({ scenario: s.name, now: t, waits, water });
  }
}

writeFileSync(
  new URL('../functions/fixtures/daily-cases.json', import.meta.url),
  `${JSON.stringify({ tz: TZ, scenarios, cases }, null, 2)}\n`,
);
console.log(`wrote ${cases.length} cases`);

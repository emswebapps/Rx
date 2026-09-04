// Regenerates functions/fixtures/regimen-cases.json — the recorded answers that
// src/lib/meds.js and functions/regimen.js are BOTH asserted against.
//
// Run it deliberately, never to turn a red parity test green without reading why
// the answer moved. Both implementations have to be updated together; the tests
// exist precisely to stop one drifting from the other.
//
//   TZ=America/New_York node scripts/make-regimen-fixtures.mjs
//
// The zone is pinned because the client's clock maths is local-time by design.
import { writeFileSync } from 'node:fs';
import {
  expectedDosesToday, effectiveWindow, dueRules, supplyStatus,
} from '../src/lib/meds.js';

const TZ = 'America/New_York';
const H = 60 * 60 * 1000;
const M = 60 * 1000;
// 2026-08-29 is a Saturday in EDT (UTC-4).
const at = (h, m = 0) => Date.UTC(2026, 7, 29, h + 4, m); // local hour → UTC

const XR = {
  id: 'xr', name: 'Long-acting', strength: '20 mg', kind: 'long',
  schedule: { mode: 'clock', time: '08:00' },
  graceMinutes: 45, onsetHours: 9, durationHours: 5,
  supply: { onHand: 30, perDose: 1, lowDays: 7, refillFrom: '' },
  rules: [
    { id: 'r-eat', text: 'Eat first', offsetMinutes: -60 },
    { id: 'r-water', text: 'Water', offsetMinutes: 0 },
  ],
  active: true,
};
const IR = {
  id: 'ir', name: 'Booster', strength: '10 mg', kind: 'booster',
  schedule: { mode: 'offset', afterMedId: 'xr', offsetHours: 6 },
  graceMinutes: 45, onsetHours: 4, durationHours: 5,
  supply: { onHand: 4, perDose: 1, lowDays: 7, refillFrom: '2026-09-04' },
  rules: [{ id: 'r-nocoffee', text: 'No coffee after this', offsetMinutes: 120 }],
  active: true,
};
// A twice-a-day medication on weekdays only, with a two-tablet afternoon dose —
// the shape the old single-slot model could not express at all.
const TWICE = {
  id: 'tw', name: 'Twice daily', strength: '10 mg', kind: 'other', form: 'tablet',
  schedule: {
    times: [
      { id: 'am', mode: 'clock', time: '07:00', amount: 1 },
      { id: 'pm', mode: 'clock', time: '15:00', amount: 2 },
    ],
    days: [1, 2, 3, 4, 5],
  },
  graceMinutes: 30, onsetHours: 4, durationHours: 4,
  supply: { onHand: 30, lowDays: 7, refillFrom: '' },
  rules: [], active: true,
};

const KIT = { onsetHours: 4, durationHours: 5 };
const MEDS = [XR, IR];

const dXR = { id: 'd-xr', takenAt: at(8), medId: 'xr', status: 'taken' };
const dIR = { id: 'd-ir', takenAt: at(14), medId: 'ir', status: 'taken' };

const cases = [
  {
    name: 'nothing logged yet, mid-morning',
    now: at(9), meds: MEDS, doses: [], kit: KIT,
  },
  {
    name: 'long-acting taken, booster still ahead — window is provisional',
    now: at(10), meds: MEDS, doses: [dXR], kit: KIT,
  },
  {
    name: 'booster due, inside its grace — still provisional',
    now: at(14, 20), meds: MEDS, doses: [dXR], kit: KIT,
  },
  {
    name: 'booster grace has passed with nothing logged — window locks earlier',
    now: at(15), meds: MEDS, doses: [dXR], kit: KIT,
  },
  {
    name: 'booster taken — window moves later',
    now: at(15), meds: MEDS, doses: [dIR, dXR], kit: KIT,
  },
  {
    name: 'booster logged late, after the grace — window moves back out',
    now: at(16), meds: MEDS, doses: [{ ...dIR, takenAt: at(15, 30) }, dXR], kit: KIT,
  },
  {
    name: 'a late morning dose drags the offset booster late with it',
    now: at(12), meds: MEDS, doses: [{ ...dXR, takenAt: at(10, 30) }], kit: KIT,
  },
  {
    name: 'legacy dose with no medId falls back to the kit numbers',
    now: at(12), meds: [], doses: [{ id: 'legacy', takenAt: at(8) }], kit: KIT,
  },
  {
    name: 'a rule fires an hour before the dose',
    now: at(7, 5), meds: MEDS, doses: [], kit: KIT,
  },
  {
    name: 'an eat-first rule stops being due once the dose is taken',
    now: at(7, 5), meds: MEDS, doses: [{ ...dXR, takenAt: at(7) }], kit: KIT,
  },
  {
    name: 'an inactive med schedules nothing',
    now: at(10), meds: [XR, { ...IR, active: false }], doses: [dXR], kit: KIT,
  },
  {
    name: 'an offset med whose anchor was deleted resolves to unknown',
    now: at(10), meds: [{ ...IR }], doses: [], kit: KIT,
  },
  // ── The multi-dose model ──
  // 2026-08-29 is a Saturday, so the weekdays-only med schedules nothing at
  // all — the case that stops a deliberate day off reading as a missed dose.
  {
    name: 'a weekdays-only med schedules nothing on a Saturday',
    now: at(10), meds: [TWICE], doses: [], kit: KIT,
  },
  {
    name: 'a twice-daily med produces one row per time',
    now: at(10), meds: [{ ...TWICE, schedule: { ...TWICE.schedule, days: [0, 1, 2, 3, 4, 5, 6] } }],
    doses: [], kit: KIT,
  },
  {
    name: 'the morning slot taken leaves the afternoon one still ahead',
    now: at(10),
    meds: [{ ...TWICE, schedule: { ...TWICE.schedule, days: [0, 1, 2, 3, 4, 5, 6] } }],
    doses: [{ id: 'd-am', takenAt: at(7, 5), medId: 'tw', status: 'taken', slotId: 'am' }],
    kit: KIT,
  },
  {
    name: 'a dose skipped on purpose is neither taken nor missed',
    now: at(16),
    meds: [{ ...TWICE, schedule: { ...TWICE.schedule, days: [0, 1, 2, 3, 4, 5, 6] } }],
    doses: [
      { id: 'd-am', takenAt: at(7, 5), medId: 'tw', status: 'taken', slotId: 'am' },
      { id: 'd-pm', takenAt: at(15, 2), medId: 'tw', status: 'skipped', slotId: 'pm' },
    ],
    kit: KIT,
  },
  {
    name: 'an unslotted dose is filed against the nearest time, not the first',
    now: at(16),
    meds: [{ ...TWICE, schedule: { ...TWICE.schedule, days: [0, 1, 2, 3, 4, 5, 6] } }],
    doses: [{ id: 'd-x', takenAt: at(14, 50), medId: 'tw', status: 'taken' }],
    kit: KIT,
  },
];

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
    const s = supplyStatus(m, now);
    return {
      medId: m.id, tracked: s.tracked, dosesLeft: s.dosesLeft, daysLeft: s.daysLeft,
      perDay: s.perDay, low: s.low, refillOpen: s.refillOpen, daysUntilRefill: s.daysUntilRefill,
    };
  });

const out = {
  _comment: [
    'Recorded answers shared by two implementations of the same regimen maths:',
    'src/lib/meds.js (ESM, client) and functions/regimen.js (CJS, scheduler).',
    'Both are asserted against this file, so changing one without the other goes red.',
    'Regenerate deliberately, never to make a red test green without reading why.',
    'All timestamps are epoch ms; `tz` is the zone the expectations were recorded in.',
  ].join(' '),
  tz: TZ,
  cases: cases.map((c) => ({
    name: c.name,
    now: c.now,
    nowLocal: new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ, hour12: false, dateStyle: 'short', timeStyle: 'short',
    }).format(new Date(c.now)),
    meds: c.meds, doses: c.doses, kit: c.kit,
    expect: {
      expectedDoses: serializeExpected(expectedDosesToday(c.meds, c.doses, c.now)),
      window: serializeWindow(effectiveWindow(c.meds, c.doses, c.kit, c.now)),
      dueRules: serializeRules(dueRules(c.meds, c.doses, c.now)),
      supply: serializeSupply(c.meds, c.now),
    },
  })),
};

writeFileSync(
  new URL('../functions/fixtures/regimen-cases.json', import.meta.url),
  `${JSON.stringify(out, null, 2)}\n`,
);
console.log(`wrote ${out.cases.length} cases`);

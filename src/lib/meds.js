// The regimen: what you take, when you're meant to take it, and what that does
// to tonight.
//
// `window.js` answers "you took something at 3pm, when does it get hard?" from
// one number on the kit. That's enough when there's one dose a day. It isn't
// enough when a long-acting dose in the morning is followed by a smaller one in
// the afternoon, because then the evening lands in two different places
// depending on whether the second one happened. This module knows the
// difference, and knows it *before* the evening, which is the whole point.
//
// What it does NOT do, and must never do: advise. Every name, time, threshold
// and rule in here was typed in by the user. This file does arithmetic on their
// numbers and hands the result back. There is no default medication, no
// suggested dose and no opinion about either.
//
// Pure and Firebase-free so `node --test` can run it, and so the CommonJS port
// in functions/crashRegimen.js can be held to the same answers.

import {
  HOUR_MS, LOOKBACK_MS, DEFAULT_ONSET_HOURS, DEFAULT_DURATION_HOURS,
} from './window.js';

export const MINUTE_MS = 60 * 1000;
export const DEFAULT_GRACE_MINUTES = 45;
export const DEFAULT_LOW_DAYS = 7;

// How long after a rule's moment it still counts as "now". Past this it's not a
// reminder any more, it's a nag about something you already did or didn't.
export const RULE_GRACE_MS = 60 * MINUTE_MS;

// A schedule chain is user-built, so it can be user-broken. This bounds the
// resolution of `mode: 'offset'` meds pointing at each other.
const MAX_CHAIN_DEPTH = 8;

// Every day of the week, which is what an unconfigured medication means.
export const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];

export const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * How a dose is taken, and what one "unit" of it is called.
 *
 * `amount` is counted out of the supply, so a med taken two tablets at a time
 * empties its bottle twice as fast — the old model assumed one, which quietly
 * doubled how long a two-tablet prescription appeared to last.
 */
export const DOSE_FORMS = [
  { key: 'tablet', one: 'tablet', many: 'tablets' },
  { key: 'capsule', one: 'capsule', many: 'capsules' },
  { key: 'liquid', one: 'mL', many: 'mL' },
  { key: 'injection', one: 'injection', many: 'injections' },
  { key: 'patch', one: 'patch', many: 'patches' },
  { key: 'other', one: 'dose', many: 'doses' },
];

export const DEFAULT_TIME = {
  mode: 'clock',      // 'clock' | 'offset'
  time: '08:00',
  afterMedId: null,   // 'offset': hang off another medication's dose
  offsetHours: 6,
  amount: 1,          // how many units at this time
};

export const DEFAULT_MED = {
  name: '',
  strength: '',
  kind: 'long', // 'long' | 'booster' | 'other' — affects wording, never the maths
  form: 'tablet',
  // A medication can be due more than once a day. This is the change that made
  // the model match how people actually take things: an 8 AM and a 2 PM used to
  // have to be entered as two separate medications, which split their supply,
  // their history and their name.
  schedule: {
    times: [{ ...DEFAULT_TIME, id: 't1' }],
    days: EVERY_DAY,
  },
  graceMinutes: DEFAULT_GRACE_MINUTES,
  // Typed in from the label or the pharmacist, never filled in by the app.
  // Shown on the dose card; nothing is calculated from it.
  halfLifeHours: null,
  onsetHours: DEFAULT_ONSET_HOURS,
  durationHours: DEFAULT_DURATION_HOURS,
  supply: { onHand: null, lowDays: DEFAULT_LOW_DAYS, refillFrom: '', lastFilledAt: null },
  rules: [],
  active: true,
};

export const MED_KINDS = [
  { key: 'long', label: 'Long-acting' },
  { key: 'booster', label: 'Booster' },
  { key: 'other', label: 'Other' },
];

/**
 * A blank medication, safe to hand to a form and edit.
 *
 * `{ ...DEFAULT_MED }` is a *shallow* copy: the new object's `schedule`,
 * `supply` and `times[0]` are the module-level ones, shared by every medication
 * created that way. Nothing mutates them today — the editors all replace rather
 * than assign into — but one `med.supply.onHand = n` anywhere would silently
 * rewrite the default for the rest of the session, and every med made after it.
 * Cloning once, here, means that bug can't be written.
 */
export function newMed(over = {}) {
  return {
    ...DEFAULT_MED,
    ...over,
    schedule: {
      ...DEFAULT_MED.schedule,
      ...(over.schedule || {}),
      times: (over.schedule?.times || DEFAULT_MED.schedule.times).map((t) => ({ ...t })),
      days: [...(over.schedule?.days || DEFAULT_MED.schedule.days)],
    },
    supply: { ...DEFAULT_MED.supply, ...(over.supply || {}) },
    rules: (over.rules || []).map((r) => ({ ...r })),
  };
}

/**
 * Where an nth dose starts out on the clock.
 *
 * These are starting positions for a picker, not advice: the same kind of
 * default as `DEFAULT_TIME`'s own 08:00, chosen so that asking for three a day
 * doesn't produce three rows stacked on the same minute. Every one of them is
 * expected to be dragged to where the person actually takes it.
 */
const SPREAD = {
  1: ['08:00'],
  2: ['08:00', '14:00'],
  3: ['08:00', '13:00', '18:00'],
  4: ['08:00', '12:00', '16:00', '20:00'],
};

/**
 * Grow or shrink a schedule to `count` doses a day.
 *
 * Times already on the schedule are kept exactly as they are — someone who set
 * their morning to 07:15 and then adds an afternoon must not have the morning
 * moved back to 08:00 under them. Only the rows being added are positioned, and
 * shrinking drops from the end, which is the one the person just added.
 */
export function withDoseCount(schedule, count) {
  const times = schedule?.times || [];
  const n = Math.max(1, Math.min(4, Math.round(Number(count) || 1)));
  if (n === times.length) return schedule;
  if (n < times.length) return { ...schedule, times: times.slice(0, n) };

  const spread = SPREAD[n] || SPREAD[4];
  const grown = [...times];
  for (let i = times.length; i < n; i += 1) {
    grown.push({
      ...DEFAULT_TIME,
      id: `t${i + 1}-${Date.now().toString(36)}${i}`,
      time: spread[i] || DEFAULT_TIME.time,
    });
  }
  return { ...schedule, times: grown };
}

/** "2 tablets" / "1 capsule" / "5 mL" — an amount in the form's own words. */
export function formatAmount(amount, form = 'tablet') {
  const n = positive(amount, 1);
  const f = DOSE_FORMS.find((x) => x.key === form) || DOSE_FORMS[0];
  return `${n} ${n === 1 ? f.one : f.many}`;
}

function positive(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function nonNegative(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** null, undefined and '' mean "not counting pills" — not "no pills left". */
function countOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Merge a saved med over the defaults, the same way `mergeKit` does for the
 * kit: a med saved before a field existed still reads correctly afterwards.
 *
 * This also migrates the one-dose-a-day shape in place. A medication saved as
 * `schedule: { mode: 'clock', time: '08:00' }` becomes a single entry in
 * `schedule.times`, carrying its old `supply.perDose` across as that dose's
 * `amount`. Nothing is rewritten in storage — the migration happens on every
 * read, so an old document and a new one behave identically and there is no
 * moment where half the data is converted.
 */
export function normalizeMed(med = {}) {
  const raw = med.schedule || {};
  const supply = { ...DEFAULT_MED.supply, ...(med.supply || {}) };
  // The old shape had one dose per med, and the amount lived on the supply.
  const legacyAmount = positive(raw.amount ?? med.supply?.perDose, 1);

  let times;
  if (Array.isArray(raw.times) && raw.times.length > 0) {
    times = raw.times.map((t, i) => ({
      ...DEFAULT_TIME,
      ...t,
      id: t.id || `t${i + 1}`,
      amount: positive(t.amount, 1),
      offsetHours: positive(t.offsetHours, 6),
    }));
  } else {
    times = [{
      ...DEFAULT_TIME,
      id: 't1',
      mode: raw.mode === 'offset' ? 'offset' : 'clock',
      time: raw.time || DEFAULT_TIME.time,
      afterMedId: raw.afterMedId ?? null,
      offsetHours: positive(raw.offsetHours, 6),
      amount: legacyAmount,
    }];
  }

  const days = Array.isArray(raw.days) && raw.days.length > 0
    ? [...new Set(raw.days.map(Number).filter((d) => d >= 0 && d <= 6))].sort()
    : EVERY_DAY;

  return {
    ...DEFAULT_MED,
    ...med,
    form: med.form || DEFAULT_MED.form,
    schedule: { times, days: days.length ? days : EVERY_DAY },
    supply,
    graceMinutes: nonNegative(med.graceMinutes, DEFAULT_GRACE_MINUTES),
    onsetHours: positive(med.onsetHours, DEFAULT_ONSET_HOURS),
    durationHours: positive(med.durationHours, DEFAULT_DURATION_HOURS),
    halfLifeHours: positive(med.halfLifeHours, null),
    rules: Array.isArray(med.rules) ? med.rules : [],
  };
}

/** Is this medication meant to be taken on the day `dayTs` falls in? */
export function scheduledOnDay(med, dayTs) {
  const m = normalizeMed(med);
  return m.schedule.days.includes(new Date(dayTs).getDay());
}

/** Units taken across a full scheduled day — what supply burns through. */
export function unitsPerScheduledDay(med) {
  const m = normalizeMed(med);
  return m.schedule.times.reduce((n, t) => n + positive(t.amount, 1), 0);
}

/** Average units per calendar day, accounting for days off. */
export function unitsPerCalendarDay(med) {
  const m = normalizeMed(med);
  return unitsPerScheduledDay(m) * (m.schedule.days.length / 7);
}

export function activeMeds(meds) {
  if (!Array.isArray(meds)) return [];
  return meds.filter(Boolean).map(normalizeMed).filter((m) => m.active !== false);
}

// ── Clock helpers ───────────────────────────────────────────────────────────
// Everything here is in the device's local time, which is the time the user
// typed and the time they live in.

export function startOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function sameLocalDay(a, b) {
  return startOfDay(a) === startOfDay(b);
}

/** "08:00" on the local day containing `dayTs`. Null if the string is unusable. */
export function atClock(dayTs, time) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(time || '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  const d = new Date(dayTs);
  d.setHours(h, min, 0, 0);
  return d.getTime();
}

// ── Doses ───────────────────────────────────────────────────────────────────

/** Doses actually taken, newest first. A dose marked skipped is not a dose. */
export function takenDoses(doses) {
  if (!Array.isArray(doses)) return [];
  return doses
    .filter((d) => d && typeof d.takenAt === 'number' && d.status !== 'skipped')
    .sort((a, b) => b.takenAt - a.takenAt);
}

/** Every logged entry for this med that day, taken or deliberately skipped. */
export function entriesForMedOnDay(medId, doses, dayTs) {
  if (!Array.isArray(doses)) return [];
  return doses
    .filter((d) => d && typeof d.takenAt === 'number'
      && d.medId === medId && sameLocalDay(d.takenAt, dayTs))
    .sort((a, b) => a.takenAt - b.takenAt);
}

/** The dose logged for this med on the local day containing `dayTs`, if any. */
export function doseForMedOnDay(medId, doses, dayTs) {
  return takenDoses(doses).find(
    (d) => d.medId === medId && sameLocalDay(d.takenAt, dayTs),
  ) || null;
}

/**
 * Match logged entries to the slots they were meant to fill.
 *
 * A dose logged from a specific row carries `slotId` and needs no guessing. One
 * logged from a notification, from the plain one-tap row, or before slots
 * existed doesn't — so those are assigned to the nearest unclaimed slot by
 * time. Nearest rather than first-come: on a day where the afternoon dose is
 * logged before the morning one is remembered, first-come would file the
 * afternoon dose against the morning slot and report both as late.
 *
 * Returns a Map of slotId -> entry. Entries that match nothing (an extra dose
 * on a day with one slot) are returned separately rather than dropped.
 */
export function matchEntriesToSlots(slots, entries) {
  const bySlot = new Map();
  const unmatched = [];
  const remaining = [];

  for (const e of entries) {
    if (e.slotId && slots.some((s) => s.id === e.slotId) && !bySlot.has(e.slotId)) {
      bySlot.set(e.slotId, e);
    } else {
      remaining.push(e);
    }
  }

  for (const e of remaining) {
    const open = slots.filter((s) => !bySlot.has(s.id) && s.expectedAt != null);
    if (open.length === 0) { unmatched.push(e); continue; }
    const nearest = open.reduce((a, b) => (
      Math.abs(b.expectedAt - e.takenAt) < Math.abs(a.expectedAt - e.takenAt) ? b : a));
    bySlot.set(nearest.id, e);
  }

  return { bySlot, unmatched };
}

/**
 * When each med was due on the local day containing `dayTs`, and whether it
 * happened.
 *
 * `mode: 'clock'` reads straight off the wall clock. `mode: 'offset'` hangs off
 * another med: the anchor's *actual* logged time when there is one, so a late
 * morning dose pushes the booster late too, and the anchor's scheduled time as
 * a fallback so the row still says something before anything is logged.
 *
 * States: 'upcoming' (not yet), 'due' (now, or inside the grace), 'taken',
 * 'skipped' (past the grace with nothing logged), 'unknown' (an offset med
 * whose anchor can't be resolved — a broken chain, or a deleted anchor).
 *
 * The states are always resolved against `now`, never against `dayTs`, which is
 * what lets the same function answer for a past day: on a day that finished
 * hours ago every unlogged dose is already past its grace, so it settles to
 * 'skipped' with no separate code path. That is how the adherence history is
 * computed — see adherence.js.
 *
 * `late` is set when the dose *was* taken but after the grace ran out. It is
 * deliberately separate from `state`, which stays 'taken': for today's screen a
 * late dose is a taken dose and shouldn't nag. Only history draws the
 * distinction.
 */
export function expectedDosesOnDay(meds, doses, dayTs, now = Date.now()) {
  const list = activeMeds(meds);
  const byId = new Map(list.map((m) => [m.id, m]));

  // An offset time hangs off another medication's FIRST dose of the day — its
  // actual logged time when there is one, so a late morning drags the booster
  // late with it, and its scheduled time as a fallback so the row still says
  // something before anything is logged.
  const resolveTime = (med, time, depth) => {
    if (depth > MAX_CHAIN_DEPTH) return null;
    if (time.mode === 'offset') {
      const anchor = byId.get(time.afterMedId);
      if (!anchor || !scheduledOnDay(anchor, dayTs)) return null;
      const logged = entriesForMedOnDay(anchor.id, doses, dayTs)
        .find((d) => d.status !== 'skipped');
      const base = logged
        ? logged.takenAt
        : resolveTime(anchor, normalizeMed(anchor).schedule.times[0], depth + 1);
      if (base == null) return null;
      return base + positive(time.offsetHours, 6) * HOUR_MS;
    }
    return atClock(dayTs, time.time);
  };

  const out = [];
  for (const med of list) {
    // A day the medication isn't meant to be taken on produces no rows at all —
    // which is what makes a deliberate weekend off stop reading as two misses.
    if (!scheduledOnDay(med, dayTs)) continue;

    const slots = med.schedule.times.map((t) => ({
      ...t,
      expectedAt: resolveTime(med, t, 0),
    }));
    const { bySlot } = matchEntriesToSlots(slots, entriesForMedOnDay(med.id, doses, dayTs));

    for (const slot of slots) {
      const entry = bySlot.get(slot.id) || null;
      const dose = entry && entry.status !== 'skipped' ? entry : null;
      const skippedOnPurpose = Boolean(entry && entry.status === 'skipped');
      const expectedAt = slot.expectedAt;
      const graceEnds = expectedAt == null ? null : expectedAt + med.graceMinutes * MINUTE_MS;

      let state;
      if (dose) state = 'taken';
      else if (skippedOnPurpose) state = 'skipped-on-purpose';
      else if (expectedAt == null) state = 'unknown';
      else if (now < expectedAt) state = 'upcoming';
      else if (now <= graceEnds) state = 'due';
      else state = 'skipped';

      const late = Boolean(dose && graceEnds != null && dose.takenAt > graceEnds);

      out.push({
        med,
        medId: med.id,
        slotId: slot.id,
        // Unique per row, since one medication now produces several.
        key: `${med.id}:${slot.id}`,
        amount: positive(slot.amount, 1),
        expectedAt,
        graceEnds,
        dose,
        entry,
        state,
        late,
      });
    }
  }

  return out.sort((a, b) => (a.expectedAt ?? Infinity) - (b.expectedAt ?? Infinity));
}

/** Today's doses — `expectedDosesOnDay` for the day `now` falls in. */
export function expectedDosesToday(meds, doses, now = Date.now()) {
  return expectedDosesOnDay(meds, doses, now, now);
}

/** The next dose still to come today, for a one-line summary. */
export function nextExpected(meds, doses, now = Date.now()) {
  return expectedDosesToday(meds, doses, now)
    .filter((e) => (e.state === 'upcoming' || e.state === 'due') && e.expectedAt != null)
    .sort((a, b) => a.expectedAt - b.expectedAt)[0] || null;
}

/** The next day on or after `dayTs` this medication is actually due. */
export function nextScheduledDay(med, dayTs) {
  for (let i = 0; i < 7; i += 1) {
    const d = startOfDay(dayTs) + i * 24 * HOUR_MS;
    if (scheduledOnDay(med, d)) return d;
  }
  return null;
}

// ── The window ──────────────────────────────────────────────────────────────

/** The span a single logged dose is responsible for. */
export function spanFor(dose, med, kit) {
  const onset = positive(med?.onsetHours, positive(kit.onsetHours, DEFAULT_ONSET_HOURS));
  const duration = positive(med?.durationHours, positive(kit.durationHours, DEFAULT_DURATION_HOURS));
  const start = dose.takenAt + onset * HOUR_MS;
  return {
    start,
    end: start + duration * HOUR_MS,
    doseId: dose.id,
    takenAt: dose.takenAt,
    medId: dose.medId || null,
  };
}

/**
 * Tonight's window, read off the whole regimen rather than off one dose.
 *
 * The governing span is the one that ends last — the last thing still working.
 * A morning long-acting dose and an afternoon booster produce two spans, and
 * taking the booster is exactly what moves the evening later.
 *
 * The interesting case is the one that hasn't happened yet. While a booster is
 * still expected — not yet due, or inside its grace — the honest answer is "it
 * depends": the window is the long-acting one, marked `provisional`, with
 * `wouldBecome` carrying where it moves to if the booster gets logged. Once the
 * grace passes with nothing logged the booster is treated as skipped, the flag
 * clears, and the earlier window is the real one. Logging it late, at any
 * point, recomputes straight back out.
 *
 * A dose with no `medId` — anything logged before medications existed — falls
 * back to the kit's own onset and duration, so old rows keep working untouched.
 */
export function effectiveWindow(meds, doses, kit = {}, now = Date.now()) {
  const list = activeMeds(meds);
  const byId = new Map(list.map((m) => [m.id, m]));

  const spans = takenDoses(doses)
    .filter((d) => d.takenAt <= now && now - d.takenAt <= LOOKBACK_MS)
    .map((d) => spanFor(d, byId.get(d.medId), kit));

  if (spans.length === 0) return null;

  const governing = spans.reduce((a, b) => (b.end > a.end ? b : a));

  // A dose still expected today can only move the window later, never earlier.
  // A dose deliberately skipped is not still expected — that is the difference
  // an explicit skip buys: the evening stops being provisional the moment you
  // say you're not taking it, instead of waiting out the grace.
  let wouldBecome = null;
  let pending = null;
  for (const e of expectedDosesToday(meds, doses, now)) {
    if (e.state !== 'upcoming' && e.state !== 'due') continue;
    if (e.expectedAt == null) continue;
    const hypothetical = spanFor(
      { id: `pending-${e.key}`, takenAt: e.expectedAt, medId: e.medId },
      e.med,
      kit,
    );
    if (hypothetical.end <= governing.end) continue;
    if (!wouldBecome || hypothetical.end > wouldBecome.end) {
      wouldBecome = hypothetical;
      pending = e;
    }
  }

  return {
    ...governing,
    provisional: wouldBecome != null,
    wouldBecome,
    pendingMedId: pending ? pending.medId : null,
    pendingSlotId: pending ? pending.slotId : null,
    pendingExpectedAt: pending ? pending.expectedAt : null,
  };
}

/**
 * When this dose wears off: the time it was taken plus the medication's own
 * "hours until it wears off" — the same number the evening window starts
 * from. For a dose not taken yet it's where it would land if taken on time,
 * marked `projected`, so the card can say "if taken on time" rather than
 * implying it already happened. Null for a skip, or with no time to go on.
 */
export function wearOffFor(entry) {
  if (!entry || entry.state === 'skipped-on-purpose') return null;
  const onset = positive(entry.med?.onsetHours, DEFAULT_ONSET_HOURS) * HOUR_MS;
  if (entry.dose && typeof entry.dose.takenAt === 'number') {
    return { at: entry.dose.takenAt + onset, projected: false };
  }
  if (entry.state === 'skipped' || entry.expectedAt == null) return null;
  return { at: entry.expectedAt + onset, projected: true };
}

/** "10h" / "4.5h" — a half-life, as typed. */
export function formatHalfLife(hours) {
  const n = Number(hours);
  if (!Number.isFinite(n) || n <= 0) return null;
  return `${Math.round(n * 10) / 10}h`;
}

// ── Rules ───────────────────────────────────────────────────────────────────

/**
 * Every rule on the regimen, with the moment it applies to today.
 *
 * A negative `offsetMinutes` is before the dose ("eat first"), zero is at it,
 * positive is after. Rules attached to a dose whose time can't be resolved get
 * `at: null` and are simply not due.
 */
export function ruleMoments(meds, doses, now = Date.now()) {
  const out = [];
  for (const e of expectedDosesToday(meds, doses, now)) {
    for (const rule of e.med.rules || []) {
      if (!rule || !String(rule.text || '').trim()) continue;
      const offset = Number(rule.offsetMinutes);
      const at = e.expectedAt == null || !Number.isFinite(offset)
        ? null
        : e.expectedAt + offset * MINUTE_MS;
      out.push({
        medId: e.medId, med: e.med, rule, ruleId: rule.id,
        at, offsetMinutes: Number.isFinite(offset) ? offset : 0,
        doseState: e.state,
      });
    }
  }
  return out.sort((a, b) => (a.at ?? Infinity) - (b.at ?? Infinity));
}

/**
 * The rules whose moment has just arrived.
 *
 * A rule about what to do *before* a dose stops being due once the dose is
 * taken — telling you to eat first, after you've swallowed it, is worse than
 * saying nothing.
 */
export function dueRules(meds, doses, now = Date.now(), grace = RULE_GRACE_MS) {
  return ruleMoments(meds, doses, now).filter((r) => {
    if (r.at == null) return false;
    if (now < r.at || now - r.at > grace) return false;
    if (r.offsetMinutes < 0 && r.doseState === 'taken') return false;
    return true;
  });
}

/** The rules to show on a dose card that hasn't been logged yet. */
export function rulesForMed(med) {
  const m = normalizeMed(med);
  return (m.rules || [])
    .filter((r) => r && String(r.text || '').trim())
    .sort((a, b) => Number(a.offsetMinutes || 0) - Number(b.offsetMinutes || 0));
}

/** "1h before" / "at the dose" / "4h after" — an offset in words. */
export function formatOffset(minutes) {
  const n = Number(minutes) || 0;
  if (n === 0) return 'at the dose';
  const abs = Math.abs(n);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  const parts = [];
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  return `${parts.join(' ')} ${n < 0 ? 'before' : 'after'}`;
}

// ── Supply ──────────────────────────────────────────────────────────────────

/**
 * What's left, in days rather than pills, because days are the unit the
 * pharmacy conversation happens in.
 *
 * One scheduled dose per med per day is the model, so doses left and days left
 * are the same number. `refillFrom` is the date the fill window opens — for a
 * controlled substance that date is the constraint, not the pill count.
 */
export function supplyStatus(med, now = Date.now(), doses = null) {
  const m = normalizeMed(med);
  const s = m.supply || {};
  const onHand = countOrNull(s.onHand);
  // Units burned on an average calendar day: every scheduled dose's amount,
  // scaled by how many days a week it's actually taken. The old model assumed
  // one dose of one unit every day, which made a twice-daily two-tablet
  // prescription look like it would last four times as long as it does.
  const perDay = unitsPerCalendarDay(m);
  const lowDays = nonNegative(s.lowDays, DEFAULT_LOW_DAYS);
  const tracked = onHand != null;

  const parsed = parseISODate(s.refillFrom);
  const refillAt = Number.isFinite(parsed) ? parsed : null;
  const refillOpen = refillAt != null && now >= refillAt;
  const daysUntilRefill = refillAt == null
    ? null
    : Math.round((refillAt - startOfDay(now)) / (24 * HOUR_MS));

  if (!tracked) {
    return {
      tracked: false, onHand: null, perDay, form: m.form, dosesLeft: null, daysLeft: null,
      low: false, lowDays, refillFrom: s.refillFrom || '', refillAt, refillOpen, daysUntilRefill,
      runOutAt: null, coverDays: null, gapDays: 0, shortBeforeRefill: false,
    };
  }

  // Doses left counts whole doses at the smallest amount scheduled, so "3 left"
  // never promises a dose the bottle can't actually cover.
  const smallest = Math.min(...m.schedule.times.map((t) => positive(t.amount, 1)));
  const dosesLeft = Math.floor(onHand / smallest);
  const daysLeft = perDay > 0 ? Math.floor(onHand / perDay) : null;
  const gap = runOut(m, onHand, now, doses, refillAt);

  return {
    tracked: true, onHand, perDay, form: m.form, dosesLeft, daysLeft,
    low: daysLeft != null && daysLeft <= lowDays, lowDays,
    refillFrom: s.refillFrom || '', refillAt, refillOpen, daysUntilRefill,
    ...gap,
  };
}

/** The local midnight `n` days after the one containing `ts`, safe across a clock change. */
function addDays(ts, n) {
  const d = new Date(startOfDay(ts));
  d.setDate(d.getDate() + n);
  return d.getTime();
}

// Far enough to cover any real bottle; past this it "doesn't run out".
const RUN_OUT_HORIZON_DAYS = 400;

/**
 * The day the pills in hand stop covering the schedule, walked dose by dose
 * rather than averaged.
 *
 * The average in `daysLeft` is fine for a bar, but "will I make it to the
 * refill date?" is a yes-or-no question about a specific day, and the answer
 * turns on details an average smears: days off, a two-tablet afternoon, and
 * whether this morning's dose has already come out of the count. So this
 * counts forward from today, skipping days it isn't taken and today's doses
 * already logged (taken or skipped — `onHand` already reflects them), and
 * stops at the first dose the count can't cover.
 *
 * `runOutAt` is the local midnight of that day — the first day you'd be short.
 * `coverDays` is how many days away it is (0 = today). When the refill date
 * is later than that, `shortBeforeRefill` is set and `gapDays` counts the
 * scheduled days in between with nothing to take.
 */
function runOut(m, onHand, now, doses, refillAt) {
  const today = startOfDay(now);
  const loggedToday = Array.isArray(doses) ? entriesForMedOnDay(m.id, doses, now).length : 0;
  let remaining = onHand;
  let runOutAt = null;

  for (let i = 0; i < RUN_OUT_HORIZON_DAYS && runOutAt == null; i += 1) {
    const day = addDays(today, i);
    if (!scheduledOnDay(m, day)) continue;
    const slots = i === 0 ? m.schedule.times.slice(loggedToday) : m.schedule.times;
    for (const t of slots) {
      const amount = positive(t.amount, 1);
      if (remaining < amount) { runOutAt = day; break; }
      remaining -= amount;
    }
  }

  if (runOutAt == null) return { runOutAt: null, coverDays: null, gapDays: 0, shortBeforeRefill: false };

  const coverDays = Math.round((runOutAt - today) / (24 * HOUR_MS));
  let gapDays = 0;
  if (refillAt != null && runOutAt < refillAt) {
    for (let d = runOutAt; d < refillAt; d = addDays(d, 1)) {
      if (scheduledOnDay(m, d)) gapDays += 1;
    }
  }
  return { runOutAt, coverDays, gapDays, shortBeforeRefill: gapDays > 0 };
}

/** "2026-09-04" as a local midnight, rather than the UTC one `new Date()` gives. */
export function parseISODate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '').trim());
  if (!m) return NaN;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
}

/** The supply after one dose is logged, or null when nothing is being counted. */
export function supplyAfterDose(med, amount) {
  const m = normalizeMed(med);
  const onHand = countOrNull(m.supply.onHand);
  if (onHand == null) return null;
  // The amount for the slot being logged, falling back to the first scheduled
  // one — a dose logged from the plain row has no slot to read it from.
  const units = positive(amount, positive(m.schedule.times[0]?.amount, 1));
  return { ...m.supply, onHand: Math.max(0, onHand - units) };
}

/**
 * The supply after a logged dose is taken back, or null when nothing is being
 * counted — the inverse of `supplyAfterDose`, so an accidental "Take" undone a
 * second later leaves the pill count exactly where it was.
 */
export function supplyAfterUndo(med, amount) {
  const m = normalizeMed(med);
  const onHand = countOrNull(m.supply.onHand);
  if (onHand == null) return null;
  const units = positive(amount, positive(m.schedule.times[0]?.amount, 1));
  return { ...m.supply, onHand: onHand + units };
}

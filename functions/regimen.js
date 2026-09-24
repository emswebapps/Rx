// The regimen maths, for the scheduler.
//
// A CommonJS port of src/rx/meds.js. The split is structural rather
// than chosen: the client is ESM and this deployment is CommonJS, and only the
// functions/ directory is uploaded, so the client module cannot be required
// from here.
//
// The old inline mirror of `latestDose` in index.js carried a comment asking
// whoever touched it to keep the two in step by hand. That was survivable for
// one subtraction. It isn't survivable for this, so the two implementations are
// pinned to the same recorded answers instead:
//
//   functions/fixtures/regimen-cases.json   inputs + expected outputs
//   functions/test/crashRegimen.test.js     asserts THIS file matches them
//   src/rx/regimen.parity.test.js  asserts meds.js matches them
//
// Change one implementation without the other and one of those two tests goes
// red. Change the fixture and both do.
//
// One deliberate difference from the client: every day and clock calculation
// here is done in the user's configured time zone, not the server's. The client
// can use the device clock because the device is where the user is; this
// process runs in UTC and would otherwise schedule an 8 AM dose for 3 AM.

const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const LOOKBACK_MS = 24 * HOUR_MS;
const DEFAULT_ONSET_HOURS = 4;
const DEFAULT_DURATION_HOURS = 5;
const DEFAULT_GRACE_MINUTES = 45;
const DEFAULT_LOW_DAYS = 7;
const RULE_GRACE_MS = 60 * MINUTE_MS;
const MAX_CHAIN_DEPTH = 8;

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

// ── Time zone helpers ───────────────────────────────────────────────────────

function tzParts(ts, tz) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(ts)).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});
  return {
    year: Number(parts.year), month: Number(parts.month), day: Number(parts.day),
    hour: Number(parts.hour) % 24, minute: Number(parts.minute), second: Number(parts.second),
    date: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

function tzOffsetMs(ts, tz) {
  const p = tzParts(ts, tz);
  const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUTC - Math.floor(ts / 1000) * 1000;
}

/** The instant of a wall-clock time on a given local date. Two passes so an
 *  instant near a DST transition resolves to the right side of it. */
function wallClock(year, month, day, hour, minute, tz) {
  const naive = Date.UTC(year, month - 1, day, hour, minute, 0);
  let ts = naive - tzOffsetMs(naive, tz);
  ts = naive - tzOffsetMs(ts, tz);
  return ts;
}

function startOfDay(ts, tz) {
  const p = tzParts(ts, tz);
  return wallClock(p.year, p.month, p.day, 0, 0, tz);
}

function sameLocalDay(a, b, tz) {
  return tzParts(a, tz).date === tzParts(b, tz).date;
}

/** "08:00" on the local day containing `dayTs`. Null if unusable. */
function atClock(dayTs, time, tz) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(time || '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  const p = tzParts(dayTs, tz);
  return wallClock(p.year, p.month, p.day, h, min, tz);
}

/** "2026-09-04" as local midnight in `tz`. */
function parseISODate(iso, tz) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '').trim());
  if (!m) return NaN;
  return wallClock(Number(m[1]), Number(m[2]), Number(m[3]), 0, 0, tz);
}

// ── Meds ────────────────────────────────────────────────────────────────────

const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];
const DEFAULT_TIME = { mode: 'clock', time: '08:00', afterMedId: null, offsetHours: 6, amount: 1 };
const DEFAULT_SUPPLY = { onHand: null, lowDays: DEFAULT_LOW_DAYS, refillFrom: '', lastFilledAt: null };

/** See normalizeMed in src/lib/meds.js — including the legacy migration. */
function normalizeMed(med) {
  const m = med || {};
  const raw = m.schedule || {};
  const legacyAmount = positive(raw.amount != null ? raw.amount : (m.supply || {}).perDose, 1);

  let times;
  if (Array.isArray(raw.times) && raw.times.length > 0) {
    times = raw.times.map((t, i) => Object.assign({}, DEFAULT_TIME, t, {
      id: t.id || `t${i + 1}`,
      amount: positive(t.amount, 1),
      offsetHours: positive(t.offsetHours, 6),
    }));
  } else {
    times = [Object.assign({}, DEFAULT_TIME, {
      id: 't1',
      mode: raw.mode === 'offset' ? 'offset' : 'clock',
      time: raw.time || DEFAULT_TIME.time,
      afterMedId: raw.afterMedId != null ? raw.afterMedId : null,
      offsetHours: positive(raw.offsetHours, 6),
      amount: legacyAmount,
    })];
  }

  const days = Array.isArray(raw.days) && raw.days.length > 0
    ? [...new Set(raw.days.map(Number).filter((d) => d >= 0 && d <= 6))].sort()
    : EVERY_DAY;

  return {
    name: '', strength: '', kind: 'long', form: 'tablet', active: true,
    ...m,
    schedule: { times, days: days.length ? days : EVERY_DAY },
    supply: { ...DEFAULT_SUPPLY, ...(m.supply || {}) },
    graceMinutes: nonNegative(m.graceMinutes, DEFAULT_GRACE_MINUTES),
    onsetHours: positive(m.onsetHours, DEFAULT_ONSET_HOURS),
    durationHours: positive(m.durationHours, DEFAULT_DURATION_HOURS),
    rules: Array.isArray(m.rules) ? m.rules : [],
  };
}

/** Local day-of-week in the user's zone, not the server's. */
function localDayOfWeek(ts, tz) {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(new Date(ts));
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(name);
}

function scheduledOnDay(med, dayTs, tz) {
  return normalizeMed(med).schedule.days.includes(localDayOfWeek(dayTs, tz));
}

function unitsPerScheduledDay(med) {
  return normalizeMed(med).schedule.times.reduce((n, t) => n + positive(t.amount, 1), 0);
}

function unitsPerCalendarDay(med) {
  const m = normalizeMed(med);
  return unitsPerScheduledDay(m) * (m.schedule.days.length / 7);
}

function activeMeds(meds) {
  if (!Array.isArray(meds)) return [];
  return meds.filter(Boolean).map(normalizeMed).filter((m) => m.active !== false);
}

function takenDoses(doses) {
  if (!Array.isArray(doses)) return [];
  return doses
    .filter((d) => d && typeof d.takenAt === 'number' && d.status !== 'skipped')
    .sort((a, b) => b.takenAt - a.takenAt);
}

function doseForMedOnDay(medId, doses, dayTs, tz) {
  return takenDoses(doses).find(
    (d) => d.medId === medId && sameLocalDay(d.takenAt, dayTs, tz),
  ) || null;
}

function entriesForMedOnDay(medId, doses, dayTs, tz) {
  if (!Array.isArray(doses)) return [];
  return doses
    .filter((d) => d && typeof d.takenAt === 'number'
      && d.medId === medId && sameLocalDay(d.takenAt, dayTs, tz))
    .sort((a, b) => a.takenAt - b.takenAt);
}

/** See matchEntriesToSlots in src/lib/meds.js. */
function matchEntriesToSlots(slots, entries) {
  const bySlot = new Map();
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
    if (open.length === 0) continue;
    const nearest = open.reduce((a, b) => (
      Math.abs(b.expectedAt - e.takenAt) < Math.abs(a.expectedAt - e.takenAt) ? b : a));
    bySlot.set(nearest.id, e);
  }

  return bySlot;
}

/** See expectedDosesOnDay in src/lib/meds.js. */
function expectedDosesToday(meds, doses, now, tz) {
  const list = activeMeds(meds);
  const byId = new Map(list.map((m) => [m.id, m]));

  const resolveTime = (med, time, depth) => {
    if (depth > MAX_CHAIN_DEPTH) return null;
    if (time.mode === 'offset') {
      const anchor = byId.get(time.afterMedId);
      if (!anchor || !scheduledOnDay(anchor, now, tz)) return null;
      const logged = entriesForMedOnDay(anchor.id, doses, now, tz)
        .find((d) => d.status !== 'skipped');
      const base = logged
        ? logged.takenAt
        : resolveTime(anchor, normalizeMed(anchor).schedule.times[0], depth + 1);
      if (base == null) return null;
      return base + positive(time.offsetHours, 6) * HOUR_MS;
    }
    return atClock(now, time.time, tz);
  };

  const out = [];
  for (const med of list) {
    if (!scheduledOnDay(med, now, tz)) continue;

    const slots = med.schedule.times.map((t) => Object.assign({}, t, {
      expectedAt: resolveTime(med, t, 0),
    }));
    const bySlot = matchEntriesToSlots(slots, entriesForMedOnDay(med.id, doses, now, tz));

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

      out.push({
        med, medId: med.id, slotId: slot.id, key: `${med.id}:${slot.id}`,
        amount: positive(slot.amount, 1), expectedAt, graceEnds, dose, entry, state,
      });
    }
  }

  return out.sort((a, b) => (a.expectedAt == null ? Infinity : a.expectedAt)
    - (b.expectedAt == null ? Infinity : b.expectedAt));
}

function spanFor(dose, med, kit) {
  const onset = positive(med && med.onsetHours, positive(kit.onsetHours, DEFAULT_ONSET_HOURS));
  const duration = positive(med && med.durationHours, positive(kit.durationHours, DEFAULT_DURATION_HOURS));
  const start = dose.takenAt + onset * HOUR_MS;
  return {
    start, end: start + duration * HOUR_MS,
    doseId: dose.id, takenAt: dose.takenAt, medId: dose.medId || null,
  };
}

/** See effectiveWindow in src/rx/meds.js. */
function effectiveWindow(meds, doses, kit, now, tz) {
  const k = kit || {};
  const list = activeMeds(meds);
  const byId = new Map(list.map((m) => [m.id, m]));

  const spans = takenDoses(doses)
    .filter((d) => d.takenAt <= now && now - d.takenAt <= LOOKBACK_MS)
    .map((d) => spanFor(d, byId.get(d.medId), k));

  if (spans.length === 0) return null;

  const governing = spans.reduce((a, b) => (b.end > a.end ? b : a));

  let wouldBecome = null;
  let pending = null;
  for (const e of expectedDosesToday(meds, doses, now, tz)) {
    if (e.state !== 'upcoming' && e.state !== 'due') continue;
    if (e.expectedAt == null) continue;
    const hypothetical = spanFor(
      { id: `pending-${e.key}`, takenAt: e.expectedAt, medId: e.medId },
      e.med, k,
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

/** See ruleMoments in src/rx/meds.js. */
function ruleMoments(meds, doses, now, tz) {
  const out = [];
  for (const e of expectedDosesToday(meds, doses, now, tz)) {
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
  return out.sort((a, b) => (a.at == null ? Infinity : a.at) - (b.at == null ? Infinity : b.at));
}

/** See dueRules in src/rx/meds.js. */
function dueRules(meds, doses, now, tz, grace) {
  const g = typeof grace === 'number' ? grace : RULE_GRACE_MS;
  return ruleMoments(meds, doses, now, tz).filter((r) => {
    if (r.at == null) return false;
    if (now < r.at || now - r.at > g) return false;
    if (r.offsetMinutes < 0 && r.doseState === 'taken') return false;
    return true;
  });
}

/** See supplyStatus in src/rx/meds.js. */
function supplyStatus(med, now, tz) {
  const m = normalizeMed(med);
  const s = m.supply || {};
  const onHand = countOrNull(s.onHand);
  const perDay = unitsPerCalendarDay(m);
  const lowDays = nonNegative(s.lowDays, DEFAULT_LOW_DAYS);
  const tracked = onHand != null;

  const parsed = parseISODate(s.refillFrom, tz);
  const refillAt = Number.isFinite(parsed) ? parsed : null;
  const refillOpen = refillAt != null && now >= refillAt;
  const daysUntilRefill = refillAt == null
    ? null
    : Math.round((refillAt - startOfDay(now, tz)) / (24 * HOUR_MS));

  if (!tracked) {
    return {
      tracked: false, onHand: null, perDay, form: m.form, dosesLeft: null, daysLeft: null,
      low: false, lowDays, refillFrom: s.refillFrom || '', refillAt, refillOpen, daysUntilRefill,
    };
  }

  const smallest = Math.min(...m.schedule.times.map((t) => positive(t.amount, 1)));
  const dosesLeft = Math.floor(onHand / smallest);
  const daysLeft = perDay > 0 ? Math.floor(onHand / perDay) : null;
  return {
    tracked: true, onHand, perDay, form: m.form, dosesLeft, daysLeft,
    low: daysLeft != null && daysLeft <= lowDays, lowDays,
    refillFrom: s.refillFrom || '', refillAt, refillOpen, daysUntilRefill,
  };
}

module.exports = {
  scheduledOnDay,
  unitsPerScheduledDay,
  unitsPerCalendarDay,
  entriesForMedOnDay,
  matchEntriesToSlots,
  HOUR_MS, MINUTE_MS, LOOKBACK_MS, RULE_GRACE_MS,
  DEFAULT_ONSET_HOURS, DEFAULT_DURATION_HOURS, DEFAULT_GRACE_MINUTES, DEFAULT_LOW_DAYS,
  normalizeMed, activeMeds, takenDoses, doseForMedOnDay,
  startOfDay, sameLocalDay, atClock, parseISODate, tzParts,
  expectedDosesToday, effectiveWindow, ruleMoments, dueRules, supplyStatus,
};

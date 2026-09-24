// Unit tests for the Crash Protocol reminders: which of the two notifications
// is due, and — the one that really matters — that neither ever carries the
// user's own words.
// Run with: npm test  (from the functions/ directory)
const assert = require('node:assert');
const { test } = require('node:test');

process.env.GOOGLE_CLOUD_PROJECT = process.env.GOOGLE_CLOUD_PROJECT || 'test-project';
const { _internal } = require('../index');
const { collectCrashMessages, crashLatestDose, crashShouldWarnRefill, RX_APP_URL } = _internal;

const TZ = 'America/New_York';
const HOUR = 60 * 60 * 1000;
const NOW = new Date('2026-07-26T18:00:00Z').getTime();

const withDose = (takenAt, over = {}) => ({
  fcmToken: 'tok',
  crashKit: { onsetHours: 4, durationHours: 5, doseTracking: true },
  crashDoses: [{ id: 'd1', takenAt }],
  crashDrafts: [],
  notifPrefs: { crash: { timerEnd: true, windowHeadsUp: true, escrowOpened: true } },
  ...over,
});

const tags = (msgs) => msgs.map((m) => m.tag);

// ── the dose that governs ───────────────────────────────────────────────────

test('the most recent dose already taken is the one that governs', () => {
  const doses = [
    { id: 'early', takenAt: NOW - 6 * HOUR },
    { id: 'late', takenAt: NOW - 2 * HOUR },
    { id: 'future', takenAt: NOW + HOUR },
  ];
  assert.strictEqual(crashLatestDose(doses, NOW).id, 'late');
});

test('a dose older than a day governs nothing', () => {
  assert.strictEqual(crashLatestDose([{ id: 'a', takenAt: NOW - 30 * HOUR }], NOW), null);
  assert.strictEqual(crashLatestDose([], NOW), null);
  assert.strictEqual(crashLatestDose(undefined, NOW), null);
});

// ── window heads-up ─────────────────────────────────────────────────────────

test('fires in the half hour before the window opens', () => {
  // Dose 3h40m ago, onset 4h → the window opens in 20 minutes.
  const data = withDose(NOW - (3 * HOUR + 40 * 60 * 1000));
  assert.deepStrictEqual(tags(collectCrashMessages(data, {}, NOW, TZ)), ['crash-window-d1']);
});

test('does not fire while the window is still hours away', () => {
  const data = withDose(NOW - HOUR); // opens in 3 hours
  assert.deepStrictEqual(collectCrashMessages(data, {}, NOW, TZ), []);
});

test('the heads-up does not fire once the window is already open', () => {
  const data = withDose(NOW - 5 * HOUR, {
    notifPrefs: { crash: { windowHeadsUp: true, escrowOpened: true, crashNote: false } },
  });
  assert.deepStrictEqual(collectCrashMessages(data, {}, NOW, TZ), []);
});

test('the note fires as the window opens, and opens onto the anchors', () => {
  const data = withDose(NOW - 5 * HOUR); // opened an hour ago
  const msgs = collectCrashMessages(data, {}, NOW, TZ);
  assert.deepStrictEqual(tags(msgs), ['crash-note-2026-07-26']);
  assert.strictEqual(msgs[0].url, `${RX_APP_URL}anchors`);
});

test('the note does not fire once the window has passed', () => {
  const data = withDose(NOW - 10 * HOUR); // onset 4h + duration 5h, so long over
  assert.deepStrictEqual(collectCrashMessages(data, {}, NOW, TZ), []);
});

test('fires once and not again on the next tick', () => {
  const data = withDose(NOW - (3 * HOUR + 40 * 60 * 1000));
  const first = collectCrashMessages(data, {}, NOW, TZ);
  assert.strictEqual(first.length, 1);
  const sent = { [first[0].tag]: NOW };
  assert.deepStrictEqual(collectCrashMessages(data, sent, NOW + 15 * 60 * 1000, TZ), []);
});

test('respects the user turning the heads-up off', () => {
  const data = withDose(NOW - (3 * HOUR + 40 * 60 * 1000), {
    notifPrefs: { crash: { windowHeadsUp: false, escrowOpened: true } },
  });
  assert.deepStrictEqual(collectCrashMessages(data, {}, NOW, TZ), []);
});

test('respects dose tracking being switched off entirely', () => {
  const data = withDose(NOW - (3 * HOUR + 40 * 60 * 1000), {
    crashKit: { onsetHours: 4, doseTracking: false },
  });
  assert.deepStrictEqual(collectCrashMessages(data, {}, NOW, TZ), []);
});

test('a user who has never logged a dose gets nothing', () => {
  const data = withDose(NOW, { crashDoses: [] });
  assert.deepStrictEqual(collectCrashMessages(data, {}, NOW, TZ), []);
});

// ── escrow opened ───────────────────────────────────────────────────────────

const withDraft = (over = {}) => ({
  fcmToken: 'tok',
  crashKit: { doseTracking: false },
  crashDoses: [],
  crashDrafts: [{ id: 'x1', text: 'the giant text I nearly sent', status: 'held', releaseAt: NOW - HOUR }],
  notifPrefs: { crash: { windowHeadsUp: true, escrowOpened: true } },
  ...over,
});

test('fires once a held draft has passed its release time', () => {
  const msgs = collectCrashMessages(withDraft(), {}, NOW, TZ);
  assert.strictEqual(msgs.length, 1);
  assert.match(msgs[0].tag, /^crash-escrow-/);
});

test('does not fire before the release time', () => {
  const data = withDraft({
    crashDrafts: [{ id: 'x1', text: 'held', status: 'held', releaseAt: NOW + HOUR }],
  });
  assert.deepStrictEqual(collectCrashMessages(data, {}, NOW, TZ), []);
});

test('a draft already dealt with does not fire', () => {
  for (const status of ['sent', 'dropped']) {
    const data = withDraft({
      crashDrafts: [{ id: 'x1', text: 'held', status, releaseAt: NOW - HOUR }],
    });
    assert.deepStrictEqual(collectCrashMessages(data, {}, NOW, TZ), [], status);
  }
});

test('an ignored draft nudges the next morning and then stops nagging', () => {
  const data = withDraft({
    crashDrafts: [{ id: 'x1', text: 'held', status: 'held', releaseAt: NOW - 3 * 24 * HOUR }],
  });
  assert.deepStrictEqual(collectCrashMessages(data, {}, NOW, TZ), []);
});

test('several held drafts produce one nudge, not one each', () => {
  const data = withDraft({
    crashDrafts: [
      { id: 'a', text: 'one', status: 'held', releaseAt: NOW - HOUR },
      { id: 'b', text: 'two', status: 'held', releaseAt: NOW - HOUR },
    ],
  });
  const msgs = collectCrashMessages(data, {}, NOW, TZ);
  assert.strictEqual(msgs.length, 1);
  assert.match(msgs[0].body, /2 things/);
});

test('respects the user turning the escrow nudge off', () => {
  const data = withDraft({ notifPrefs: { crash: { escrowOpened: false } } });
  assert.deepStrictEqual(collectCrashMessages(data, {}, NOW, TZ), []);
});

// ── the guarantee ───────────────────────────────────────────────────────────

test('no notification ever contains the user’s own words', () => {
  const secret = 'he doesn’t care about me and I am going to say so';
  const data = {
    fcmToken: 'tok',
    crashKit: { onsetHours: 4, doseTracking: true },
    crashDoses: [{ id: 'd1', takenAt: NOW - (3 * HOUR + 40 * 60 * 1000) }],
    crashDrafts: [{ id: 'x1', text: secret, status: 'held', releaseAt: NOW - HOUR }],
    crashSessions: [{ id: 's1', stories: [{ id: 'st', text: secret }], outcomeNote: secret }],
    notifPrefs: { crash: { windowHeadsUp: true, escrowOpened: true } },
  };
  const msgs = collectCrashMessages(data, {}, NOW, TZ);
  assert.strictEqual(msgs.length, 2, 'both notifications should be due here');
  for (const m of msgs) {
    const blob = `${m.title} ${m.body}`;
    assert.ok(!blob.includes(secret), `${m.tag} leaked the draft text`);
    assert.ok(!blob.includes('doesn’t care'), `${m.tag} leaked a fragment`);
  }
});

test('missing prefs default to on rather than crashing', () => {
  const data = withDraft({ notifPrefs: undefined });
  assert.strictEqual(collectCrashMessages(data, {}, NOW, TZ).length, 1);
});

test('both notifications open the installed Reset app', () => {
  const data = {
    fcmToken: 'tok',
    crashKit: { onsetHours: 4, doseTracking: true },
    crashDoses: [{ id: 'd1', takenAt: NOW - (3 * HOUR + 40 * 60 * 1000) }],
    crashDrafts: [{ id: 'x1', text: 'held', status: 'held', releaseAt: NOW - HOUR }],
    notifPrefs: { crash: { windowHeadsUp: true, escrowOpened: true } },
  };
  const msgs = collectCrashMessages(data, {}, NOW, TZ);
  assert.strictEqual(msgs.length, 2);
  for (const m of msgs) {
    assert.strictEqual(m.url, RX_APP_URL);
    // Inside the standalone app's manifest scope, or the tap opens the finance
    // app in a browser tab instead of the installed one.
    assert.ok(m.url.startsWith('/Rx/'), m.tag);
  }
});

// ── The regimen: doses, rules, refills and the smart window ─────────────────
//
// The whole reason the medication list exists. NOW is 14:00 in New York, so a
// morning dose at 08:00 and a booster expected six hours later put "right now"
// exactly on the booster.

const MIN = 60 * 1000;
// 2026-07-26 is EDT (UTC-4).
const localAt = (h, m = 0) => new Date(Date.UTC(2026, 6, 26, h + 4, m)).getTime();

const XR = {
  id: 'xr', name: 'Adderall XR', strength: '20 mg', kind: 'long',
  schedule: { mode: 'clock', time: '08:00' },
  graceMinutes: 45, onsetHours: 9, durationHours: 5,
  supply: { onHand: 30, perDose: 1, lowDays: 7, refillFrom: '' },
  rules: [{ id: 'eat', text: 'Eat first — nothing too high in fat', offsetMinutes: -60 }],
  active: true,
};
const IR = {
  id: 'ir', name: 'Adderall IR', strength: '10 mg', kind: 'booster',
  schedule: { mode: 'offset', afterMedId: 'xr', offsetHours: 6 },
  graceMinutes: 45, onsetHours: 4, durationHours: 5,
  supply: { onHand: 30, perDose: 1, lowDays: 7, refillFrom: '' },
  rules: [], active: true,
};

const ALL_ON = {
  timerEnd: true, windowHeadsUp: true, escrowOpened: true, crashNote: true,
  doseDue: true, ruleReminders: true, refillLow: true,
};

const withRegimen = (over = {}) => ({
  fcmToken: 'tok',
  crashKit: { onsetHours: 4, durationHours: 5, doseTracking: true },
  crashMeds: [XR, IR],
  crashDoses: [{ id: 'd-xr', takenAt: localAt(8), medId: 'xr', status: 'taken' }],
  crashDrafts: [],
  notifPrefs: { crash: ALL_ON },
  ...over,
});

test('a dose that has come due says so, once', () => {
  const at = localAt(14, 10); // ten minutes into the booster's 45-minute grace
  const msgs = collectCrashMessages(withRegimen(), {}, at, TZ);
  assert.deepStrictEqual(tags(msgs), ['crash-dose-ir-t1-2026-07-26']);

  const sent = { 'crash-dose-ir-t1-2026-07-26': at };
  assert.deepStrictEqual(collectCrashMessages(withRegimen(), sent, at + 15 * MIN, TZ), []);
});

test('the late nudge stays silent unless it is switched on', () => {
  // 15:00 is past the booster's 14:00 + 45 minutes, so it counts as skipped.
  // With the default preferences that is the end of it.
  assert.deepStrictEqual(tags(collectCrashMessages(withRegimen(), {}, localAt(15), TZ)), []);
});

test('switched on, the late nudge fires once and only inside the hour after the grace', () => {
  const prefs = { crash: { ...ALL_ON, doseLate: true } };

  // Still inside the grace: the ordinary "due" nudge, not the late one.
  assert.deepStrictEqual(
    tags(collectCrashMessages(withRegimen({ notifPrefs: prefs }), {}, localAt(14, 10), TZ)),
    ['crash-dose-ir-t1-2026-07-26'],
  );

  // Grace ran out at 14:45; half an hour later it says so, once.
  const at = localAt(15, 15);
  const msgs = collectCrashMessages(withRegimen({ notifPrefs: prefs }), {}, at, TZ);
  assert.deepStrictEqual(tags(msgs), ['crash-late-ir-t1-2026-07-26']);

  const sent = { 'crash-late-ir-t1-2026-07-26': at };
  assert.deepStrictEqual(
    collectCrashMessages(withRegimen({ notifPrefs: prefs }), sent, at + 10 * MIN, TZ),
    [],
    'the dedupe map holds it to one a day',
  );
});

test('the late nudge gives up rather than following you into the evening', () => {
  const prefs = { crash: { ...ALL_ON, doseLate: true } };
  // Grace ended at 14:45. By 16:00 the window heads-up is the only thing due;
  // a buzz about the missed booster at this point is just a reminder that the
  // day went wrong.
  const msgs = collectCrashMessages(withRegimen({ notifPrefs: prefs }), {}, localAt(16, 40), TZ);
  assert.ok(!tags(msgs).some((t) => t.startsWith('crash-late-')), tags(msgs).join());
});

test('a dose past its grace goes quiet rather than nagging', () => {
  // 15:00 is well past 14:00 + 45 minutes. Nothing about the missed booster,
  // and — because it counts as skipped — the window is now real.
  const msgs = collectCrashMessages(withRegimen(), {}, localAt(15), TZ);
  assert.deepStrictEqual(tags(msgs), []);
  const headsUp = collectCrashMessages(withRegimen(), {}, localAt(16, 40), TZ);
  assert.deepStrictEqual(tags(headsUp), ['crash-window-d-xr']);
});

// ── the case this whole feature turns on ────────────────────────────────────

test('a skipped booster puts the window where the long-acting dose left it', () => {
  const data = withRegimen();
  // XR at 08:00, onset 9h → 17:00. Heads-up half an hour before.
  assert.deepStrictEqual(tags(collectCrashMessages(data, {}, localAt(16, 40), TZ)), ['crash-window-d-xr']);
  assert.deepStrictEqual(tags(collectCrashMessages(data, {}, localAt(17, 5), TZ)), ['crash-note-2026-07-26']);
});

test('a booster that was taken pushes the same two later, not earlier', () => {
  const data = withRegimen({
    crashDoses: [
      { id: 'd-ir', takenAt: localAt(14), medId: 'ir', status: 'taken' },
      { id: 'd-xr', takenAt: localAt(8), medId: 'xr', status: 'taken' },
    ],
  });
  // IR at 14:00, onset 4h → 18:00, an hour later than the XR-only answer.
  assert.deepStrictEqual(tags(collectCrashMessages(data, {}, localAt(16, 40), TZ)), []);
  assert.deepStrictEqual(tags(collectCrashMessages(data, {}, localAt(17, 40), TZ)), ['crash-window-d-ir']);
  assert.deepStrictEqual(tags(collectCrashMessages(data, {}, localAt(18, 5), TZ)), ['crash-note-2026-07-26']);
});

test('nothing fires about the window while a booster is still expected', () => {
  const data = withRegimen();
  // 13:50 — the booster is still ahead, so where the evening lands is genuinely
  // not known yet. A heads-up here would be a false alarm about the one thing
  // this feature is asking her to trust.
  assert.deepStrictEqual(tags(collectCrashMessages(data, {}, localAt(13, 50), TZ)), []);
});

test('a booster logged late moves the window back out', () => {
  const late = withRegimen({
    crashDoses: [
      { id: 'd-ir', takenAt: localAt(15, 30), medId: 'ir', status: 'taken' },
      { id: 'd-xr', takenAt: localAt(8), medId: 'xr', status: 'taken' },
    ],
  });
  // Logged past its grace, but logged: 15:30 + 4h → 19:30, not 17:00.
  assert.deepStrictEqual(tags(collectCrashMessages(late, {}, localAt(16, 40), TZ)), []);
  assert.deepStrictEqual(tags(collectCrashMessages(late, {}, localAt(19, 5), TZ)), ['crash-window-d-ir']);
});

// ── rules ───────────────────────────────────────────────────────────────────

test('a rule fires at its offset before the dose', () => {
  const data = withRegimen({ crashDoses: [] });
  assert.deepStrictEqual(tags(collectCrashMessages(data, {}, localAt(7, 5), TZ)), ['crash-rule-xr-eat-2026-07-26']);
});

test('an eat-first rule stops mattering once the dose is taken', () => {
  const data = withRegimen({
    crashDoses: [{ id: 'd-xr', takenAt: localAt(7), medId: 'xr', status: 'taken' }],
  });
  assert.deepStrictEqual(tags(collectCrashMessages(data, {}, localAt(7, 5), TZ)), []);
});

// ── refills ─────────────────────────────────────────────────────────────────

test('a refill speaks on the crossing day, then not again until it is nearly gone', () => {
  const days = (n) => ({ onHand: n, perDose: 1, lowDays: 7, refillFrom: '' });
  const warns = (n) => crashShouldWarnRefill({ tracked: true, low: n <= 7, daysLeft: n, lowDays: 7, refillOpen: false });
  assert.strictEqual(warns(8), false, 'above the threshold');
  assert.strictEqual(warns(7), true, 'the day it crosses');
  assert.strictEqual(warns(5), false, 'quiet in between');
  assert.strictEqual(warns(2), true, 'nearly gone');
  assert.strictEqual(warns(0), true, 'gone');

  const data = withRegimen({ crashMeds: [{ ...XR, supply: days(2) }, IR] });
  assert.deepStrictEqual(tags(collectCrashMessages(data, {}, localAt(11), TZ)), ['crash-refill-xr-2026-07-26']);
});

test('an untracked count still warns when the fill window opens', () => {
  const data = withRegimen({
    crashMeds: [{ ...XR, supply: { onHand: null, perDose: 1, lowDays: 7, refillFrom: '2026-07-26' } }, IR],
  });
  assert.deepStrictEqual(tags(collectCrashMessages(data, {}, localAt(11), TZ)), ['crash-refill-xr-2026-07-26']);
});

// ── the switches, and the line that must not move ───────────────────────────

test('each of the new notifications can be switched off on its own', () => {
  const off = (key, at, over = {}) => collectCrashMessages(
    withRegimen({ notifPrefs: { crash: { ...ALL_ON, [key]: false } }, ...over }), {}, at, TZ,
  );
  assert.deepStrictEqual(tags(off('doseDue', localAt(14, 10))), []);
  assert.deepStrictEqual(tags(off('ruleReminders', localAt(7, 5), { crashDoses: [] })), []);
  assert.deepStrictEqual(tags(off('crashNote', localAt(17, 5))), []);
  assert.deepStrictEqual(
    tags(off('refillLow', localAt(11), { crashMeds: [{ ...XR, supply: { onHand: 1, perDose: 1, lowDays: 7 } }, IR] })),
    [],
  );
});

test('switching dose tracking off silences every medication notification', () => {
  const data = withRegimen({ crashKit: { onsetHours: 4, doseTracking: false } });
  for (const at of [localAt(7, 5), localAt(11), localAt(14, 10), localAt(16, 40), localAt(17, 5)]) {
    assert.deepStrictEqual(tags(collectCrashMessages(data, {}, at, TZ)), [], `should be silent at ${at}`);
  }
});

test('no medication notification ever names the medication', () => {
  // Every user-authored string on the regimen, made distinctive so that any
  // notification interpolating one of them fails loudly here.
  const secrets = [
    'Adderall XR', 'Adderall IR', '20 mg', '10 mg',
    'Eat first — nothing too high in fat', 'Walgreens on Fifth',
    'Three scrambled eggs',
  ];
  // The morning routine and water, so their reminders are in the sweep too.
  const XR_ROUTINE = {
    ...XR,
    schedule: {
      times: [{
        id: 't1', mode: 'clock', time: '08:00',
        routine: [
          { id: 'eat', kind: 'task', text: 'Three scrambled eggs' },
          { id: 'w', kind: 'wait', minutes: 30 },
          { id: 'd', kind: 'dose' },
        ],
      }],
    },
  };
  const routineAndWater = {
    crashKit: {
      onsetHours: 4, durationHours: 5, doseTracking: true,
      water: { enabled: true, everyMinutes: 60, goal: 8, until: '20:00' },
    },
    rxRoutineRuns: [{ id: '2026-07-26|xr|t1', day: '2026-07-26', done: { eat: localAt(7, 10) } }],
  };
  const lowSupply = {
    crashMeds: [
      { ...XR_ROUTINE, supply: { onHand: 1, perDose: 1, lowDays: 7, refillFrom: '2026-07-26' }, note: 'Walgreens on Fifth' },
      // Two left and the fill date is days away: runs out before the refill.
      { ...IR, supply: { onHand: 2, perDose: 1, lowDays: 1, refillFrom: '2026-07-31' } },
    ],
    crashDrafts: [{ id: 'x1', text: 'the giant text I nearly sent', status: 'held', releaseAt: NOW - HOUR }],
  };

  // Two timelines rather than one, because a single fixed dose list can't be
  // true at every hour of a day: the morning-of state (nothing logged yet)
  // produces the rule and dose nudges, and the afternoon state produces the
  // window ones. Between them every message kind is generated.
  //
  // Every optional nudge is switched ON here, whatever its default. A message
  // kind that is off by default is exactly the one that would otherwise slip
  // past this sweep and ship unread.
  const everything = { crash: { ...ALL_ON, doseLate: true, routineWait: true, water: true } };
  const days = [
    withRegimen({ ...lowSupply, ...routineAndWater, crashDoses: [], notifPrefs: everything }),
    withRegimen({ ...lowSupply, ...routineAndWater, notifPrefs: everything }),
  ];

  // Sweep both, at every quarter hour, rather than trusting a single instant.
  const seen = new Set();
  for (const data of days) {
    for (let h = 0; h < 24; h += 1) {
      for (const m of [0, 15, 30, 45]) {
        for (const msg of collectCrashMessages(data, {}, localAt(h, m), TZ)) {
          seen.add(msg.tag.startsWith('rx-water-') ? 'rx-water'
            : msg.tag.startsWith('crash-short-') ? msg.tag.replace(/-ir-.*$/, '-ir')
              : msg.tag.replace(/-\d{4}-\d{2}-\d{2}$/, ''));
          const blob = `${msg.title} ${msg.body}`;
          for (const secret of secrets) {
            assert.ok(!blob.includes(secret), `${msg.tag} leaked ${JSON.stringify(secret)}`);
          }
        }
      }
    }
  }

  // If a future message kind is added and this list isn't, the sweep above
  // silently stops covering it — so assert what the two days actually produced.
  assert.deepStrictEqual([...seen].sort(), [
    'crash-dose-ir-t1', 'crash-dose-xr-t1', 'crash-escrow', 'crash-late-ir-t1',
    'crash-late-xr-t1', 'crash-note', 'crash-refill-xr', 'crash-rule-xr-eat',
    'crash-window-d-xr', 'rx-wait-2026-07-26_xr_t1-w', 'rx-water',
    'crash-short-ir', 'crash-short-soon-ir',
  ].sort());
});

// ── The routine's waits, and water ──────────────────────────────────────────

const ROUTINE_XR = {
  ...XR,
  schedule: {
    times: [{
      id: 't1', mode: 'clock', time: '08:00',
      routine: [
        { id: 'eat', kind: 'task', text: 'Eat' },
        { id: 'w', kind: 'wait', minutes: 30 },
        { id: 'd', kind: 'dose' },
      ],
    }],
  },
};
const WAIT_TAG = 'rx-wait-2026-07-26_xr_t1-w';
const ateAt = (h, m) => [{ id: '2026-07-26|xr|t1', day: '2026-07-26', done: { eat: localAt(h, m) } }];
const onlyNew = (msgs) => tags(msgs).filter((t) => t.startsWith('rx-'));

test('a routine wait buzzes when it runs out, counted from when the step before it was checked', () => {
  const data = withRegimen({ crashMeds: [ROUTINE_XR], crashDoses: [], rxRoutineRuns: ateAt(7, 10) });
  assert.deepStrictEqual(onlyNew(collectCrashMessages(data, {}, localAt(7, 35), TZ)), []);
  assert.deepStrictEqual(onlyNew(collectCrashMessages(data, {}, localAt(7, 40), TZ)), [WAIT_TAG]);
  const msg = collectCrashMessages(data, {}, localAt(7, 40), TZ).find((m) => m.tag === WAIT_TAG);
  assert.strictEqual(msg.title, 'Your wait is up');
  // Not again once sent, and not an hour later.
  assert.deepStrictEqual(onlyNew(collectCrashMessages(data, { [WAIT_TAG]: 1 }, localAt(7, 45), TZ)), []);
  assert.deepStrictEqual(onlyNew(collectCrashMessages(data, {}, localAt(8, 45), TZ)), []);
});

test('a wait the app already announced is not sent again', () => {
  const data = withRegimen({
    crashMeds: [ROUTINE_XR], crashDoses: [], rxRoutineRuns: ateAt(7, 10),
    rxClientSent: { [WAIT_TAG]: localAt(7, 40) },
  });
  assert.deepStrictEqual(onlyNew(collectCrashMessages(data, {}, localAt(7, 42), TZ)), []);
});

test('a wait cut short by taking the dose says nothing', () => {
  const data = withRegimen({
    crashMeds: [ROUTINE_XR], rxRoutineRuns: ateAt(7, 10),
    crashDoses: [{ id: 'd', takenAt: localAt(7, 30), medId: 'xr', slotId: 't1', status: 'taken' }],
  });
  assert.deepStrictEqual(onlyNew(collectCrashMessages(data, {}, localAt(7, 40), TZ)), []);
});

test('water is due an interval after the first dose, with a button to log it', () => {
  const data = withRegimen({
    crashKit: { doseTracking: true, water: { enabled: true, everyMinutes: 60, goal: 8, until: '20:00' } },
  });
  assert.deepStrictEqual(onlyNew(collectCrashMessages(data, {}, localAt(8, 55), TZ)), []);
  const msgs = collectCrashMessages(data, {}, localAt(9, 0), TZ).filter((m) => m.tag.startsWith('rx-water'));
  assert.deepStrictEqual(tags(msgs), ['rx-water-2026-07-26-0-0']);
  assert.deepStrictEqual(msgs[0].action, { kind: 'water' });
  assert.deepStrictEqual(msgs[0].actions, [{ action: 'drank', title: 'Drank one' }]);
  // Logging a glass moves the next one along.
  const drank = { ...data, rxWater: [localAt(9, 5)] };
  assert.deepStrictEqual(onlyNew(collectCrashMessages(drank, {}, localAt(9, 30), TZ)), []);
  assert.deepStrictEqual(onlyNew(collectCrashMessages(drank, {}, localAt(10, 5), TZ)), ['rx-water-2026-07-26-1-0']);
});

test('water stays quiet when it is off, switched off, or before any dose', () => {
  const on = { doseTracking: true, water: { enabled: true, everyMinutes: 60, goal: 8, until: '20:00' } };
  assert.deepStrictEqual(onlyNew(collectCrashMessages(withRegimen(), {}, localAt(10), TZ)), []);
  assert.deepStrictEqual(onlyNew(collectCrashMessages(
    withRegimen({ crashKit: on, notifPrefs: { crash: { ...ALL_ON, water: false } } }), {}, localAt(10), TZ,
  )), []);
  assert.deepStrictEqual(onlyNew(collectCrashMessages(
    withRegimen({ crashKit: on, crashDoses: [] }), {}, localAt(10), TZ,
  )), []);
});

test('the routine wait can be switched off on its own', () => {
  const data = withRegimen({
    crashMeds: [ROUTINE_XR], crashDoses: [], rxRoutineRuns: ateAt(7, 10),
    notifPrefs: { crash: { ...ALL_ON, routineWait: false } },
  });
  assert.deepStrictEqual(onlyNew(collectCrashMessages(data, {}, localAt(7, 40), TZ)), []);
});

// ── Running out before the refill date ──────────────────────────────────────

const SHORT = (onHand, refillFrom) => withRegimen({
  crashMeds: [{ ...XR, supply: { onHand, perDose: 1, lowDays: 1, refillFrom } }],
  crashDoses: [],
});
const shortTags = (msgs) => tags(msgs).filter((t) => t.startsWith('crash-short'));

test('says so as soon as the pills in hand won’t reach the refill date', () => {
  // 10 left, one a day from today: out on Aug 5. Refill Aug 10.
  const msgs = collectCrashMessages(SHORT(10, '2026-08-10'), {}, localAt(7), TZ);
  assert.deepStrictEqual(shortTags(msgs), ['crash-short-xr-2026-08-10-2026-08-05']);
  const m = msgs.find((x) => x.tag.startsWith('crash-short'));
  assert.strictEqual(m.url, `${RX_APP_URL}supply`);
  // Once, not every tick.
  assert.deepStrictEqual(shortTags(collectCrashMessages(SHORT(10, '2026-08-10'), { [m.tag]: 1 }, localAt(8), TZ)), []);
});

test('and again three days out if it still is', () => {
  assert.deepStrictEqual(shortTags(collectCrashMessages(SHORT(3, '2026-08-10'), {}, localAt(7), TZ)), [
    'crash-short-xr-2026-08-10-2026-07-29', 'crash-short-soon-xr-2026-08-10-2026-07-29',
  ]);
});

test('quiet when the supply reaches the refill date, or the pref is off', () => {
  assert.deepStrictEqual(shortTags(collectCrashMessages(SHORT(30, '2026-08-10'), {}, localAt(7), TZ)), []);
  const off = withRegimen({
    crashMeds: [{ ...XR, supply: { onHand: 3, perDose: 1, lowDays: 1, refillFrom: '2026-08-10' } }],
    crashDoses: [], notifPrefs: { crash: { ...ALL_ON, supplyGap: false } },
  });
  assert.deepStrictEqual(shortTags(collectCrashMessages(off, {}, localAt(7), TZ)), []);
});

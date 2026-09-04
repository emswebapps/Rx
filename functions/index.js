const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');
const regimen = require('./regimen');

admin.initializeApp();

const db = admin.firestore();
const messaging = admin.messaging();

// Where Rx is actually served: https://emswebapps.github.io/Rx/. Override with
// APP_ORIGIN at deploy time rather than editing this — a wrong value here
// silently breaks every notification icon and every tap.
const SITE_ORIGIN = process.env.APP_ORIGIN || 'https://emswebapps.github.io';
const SITE_BASE = `${SITE_ORIGIN}/Rx/`;
const ICON = `${SITE_BASE}icon-192.png`;
const DEFAULT_TZ = 'America/New_York';

// How long a "we already sent this" marker is kept before it is swept.
const SENT_KEY_TTL_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Send one push to a user, deleting the token if FCM says it's dead.
 * Returns false when the token is gone and further sends should be skipped.
 *
 * `actions` become the buttons on the notification itself — Take, Snooze, Skip.
 * The service worker handles the tap without ever opening the app, which is the
 * whole point: logging a dose should not cost a page load.
 */
async function sendPush(userPath, token, msg) {
  try {
    await messaging.send({
      token,
      notification: { title: msg.title, body: msg.body },
      data: {
        tag: msg.tag,
        url: msg.url || SITE_BASE_PATH,
        ...(msg.action ? { action: JSON.stringify(msg.action) } : {}),
      },
      webpush: {
        // fcmOptions.link has to be absolute — msg.url is a site-relative path,
        // so joining it is what makes the tap land anywhere at all.
        fcmOptions: { link: msg.url ? new URL(msg.url, SITE_ORIGIN).href : SITE_BASE },
        notification: {
          icon: ICON,
          badge: ICON,
          tag: msg.tag,
          requireInteraction: !!msg.requireInteraction,
          ...(msg.actions ? { actions: msg.actions } : {}),
        },
      },
    });
    return true;
  } catch (e) {
    if (e.code === 'messaging/registration-token-not-registered') {
      await db.doc(`${userPath}/data/app`).update({ fcmToken: admin.firestore.FieldValue.delete() });
      return false;
    }
    console.error('Push send failed:', e.message);
    return true;
  }
}

const SITE_BASE_PATH = '/Rx/';

/** The user's local date and minutes-past-midnight, in their own zone. */
function localDateAndMinutes(date, tz) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  }).formatToParts(date).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: (Number(parts.hour) % 24) * 60 + Number(parts.minute),
  };
}

// ── Reminders ───────────────────────────────────────────────────────────────
// Two notifications, both of which have to arrive with the app closed.
//
// Neither ever carries content. The user's crash notes, held drafts and
// sessions are the most private thing in this app, and a lock-screen preview is
// visible to whoever is holding the phone — including the person the note is
// about. These say only that there is something to look at.
//
// Push only, by design: there is deliberately no collectCrashEmails, and
// nothing crash-related is added to the daily digest.

// Every tap lands in Rx. Nothing here ever names a medication, a strength, a
// rule or a time: a lock-screen preview is visible to whoever is holding the
// phone, so a body is a fixed string — useless to a stranger, complete to the
// person who tapped it open. `reminders.test.js` holds that line.
const RX_APP_URL = SITE_BASE_PATH;

const CRASH_HOUR_MS = 60 * 60 * 1000;
const CRASH_HEADSUP_MS = 30 * 60 * 1000;
const CRASH_DOSE_LOOKBACK_MS = 24 * CRASH_HOUR_MS;
const CRASH_ESCROW_GRACE_MS = 24 * CRASH_HOUR_MS;
// How long after the grace runs out the late nudge may still fire. Bounded so
// a dose missed at 9 AM can't buzz at 8 PM, by which point saying anything is
// just a reminder that the day went wrong.
const CRASH_LATE_WINDOW_MS = CRASH_HOUR_MS;

// The buttons on a dose reminder. Kept to three because a notification only
// shows two on most Android builds and none on iOS — so the body has to stand
// on its own, and these are a shortcut rather than the only way through.
const DOSE_ACTIONS = [
  { action: 'take', title: 'Take' },
  { action: 'snooze', title: 'Snooze 15m' },
  { action: 'skip', title: 'Skip' },
];

function crashPositive(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// Mirrors latestDose/predictWindow in src/rx/window.js. The client is
// ESM and this file is CommonJS, so the arithmetic is repeated rather than
// shared — keep the two in step if the rule ever changes.
function crashLatestDose(doses, now) {
  if (!Array.isArray(doses)) return null;
  let best = null;
  for (const d of doses) {
    if (!d || typeof d.takenAt !== 'number') continue;
    if (d.takenAt > now || now - d.takenAt > CRASH_DOSE_LOOKBACK_MS) continue;
    if (!best || d.takenAt > best.takenAt) best = d;
  }
  return best;
}

/**
 * Should a low supply say so today?
 *
 * A reminder that fires every morning for a week stops being a reminder. This
 * speaks on the day the threshold is crossed, then goes quiet until it's nearly
 * gone, and again when the fill window opens on a supply that's already low —
 * the three moments where there is actually something to do.
 */
function crashShouldWarnRefill(status) {
  if (!status.tracked) return status.refillOpen;
  if (!status.low) return false;
  return status.daysLeft === status.lowDays || status.daysLeft <= 2 || status.refillOpen;
}

/**
 * Which crash notifications are due for this user right now.
 *
 * Pure, so the privacy guarantee above can be asserted in a test rather than
 * assumed. `sent` is the dedupe map kept on the user's notifState doc.
 *
 * Note what none of these bodies do: name a medication, a strength, a rule or a
 * time. A body here is a fixed string, chosen so that the notification is
 * useless to anyone reading the lock screen over her shoulder and complete to
 * the person who tapped it open. `crashReminders.test.js` holds that line.
 */
function collectCrashMessages(data, sent, now, tz) {
  const prefs = (data.notifPrefs && data.notifPrefs.crash) || {};
  const kit = data.crashKit || {};
  const meds = Array.isArray(data.crashMeds) ? data.crashMeds : [];
  const doses = Array.isArray(data.crashDoses) ? data.crashDoses : [];
  const today = localDateAndMinutes(new Date(now), tz).date;
  const tracking = kit.doseTracking !== false;
  const out = [];

  const push = (tag, title, body, url, extra) => {
    if (!sent[tag]) out.push({ tag, title, body, url: url || RX_APP_URL, ...extra });
  };

  // ── The window ──
  // Computed off the whole regimen, so a booster that was taken pushes the
  // evening later and a booster that was skipped leaves it where it was.
  //
  // While a dose is still expected, the window is `provisional` and BOTH of
  // these stay quiet. Warning her that the hard hours start at five, when
  // taking the two o'clock one would have moved them to six, is worse than
  // saying nothing — it's a false alarm about the exact thing she is trying to
  // learn to trust. Once the grace passes with nothing logged the window is
  // real and this fires against it; logging it late recomputes and this fires
  // against the later one instead.
  const w = tracking ? regimen.effectiveWindow(meds, doses, kit, now, tz) : null;

  if (w && !w.provisional) {
    if (prefs.windowHeadsUp !== false) {
      const tag = `crash-window-${w.doseId}`;
      // Only in the half hour before it opens — a late tick shouldn't fire a
      // warning about something already underway.
      if (now >= w.start - CRASH_HEADSUP_MS && now < w.start) {
        push(tag, 'Your window starts soon',
          'About half an hour. If there’s anything hard to say, now’s the better time.');
      }
    }

    // As it actually opens, and pointed at the anchors rather than the home
    // screen: the note is the thing that's hard to reach for at this exact
    // moment, so it should already be open. One a day, never a session start —
    // this says "read this", not "you are crashing".
    if (prefs.crashNote !== false) {
      const tag = `crash-note-${today}`;
      if (now >= w.start && now < w.end) {
        push(tag, 'You’re heading into it',
          'Tap to read your note before it lands.', `${RX_APP_URL}anchors`);
      }
    }
  }

  // ── A dose is due ──
  // Only inside its grace. Past that it counts as skipped, and the app has
  // nothing useful left to say about it — a second buzz would only be guilt.
  //
  // The three buttons are the point: Take logs it, Skip records that you chose
  // not to, and Snooze asks again in fifteen minutes. All three are handled by
  // the service worker without opening the app, because the cost of logging a
  // dose should be one tap from the lock screen and nothing more.
  //
  // `action` carries the ids the worker needs to write the entry. It is data
  // the user already owns, never a name — the visible body stays contentless.
  if (tracking && prefs.doseDue !== false) {
    for (const e of regimen.expectedDosesToday(meds, doses, now, tz)) {
      if (e.state !== 'due') continue;
      push(`crash-dose-${e.medId}-${e.slotId}-${today}`, 'Time for the next one',
        'Tap to log it.', undefined, {
          actions: DOSE_ACTIONS,
          action: { medId: e.medId, slotId: e.slotId, amount: e.amount },
        });
    }
  }

  // ── One from earlier still isn't logged ──
  // Off unless it is switched on. The reasoning above still holds — past the
  // grace there is nothing useful left to say, and a second buzz is mostly
  // guilt — so this exists because it was asked for, not because the app
  // thinks it is a good idea by default. It fires once per medication per day
  // and only inside the hour after the grace ran out; past that it goes quiet
  // rather than following you around the evening.
  if (tracking && prefs.doseLate === true) {
    for (const e of regimen.expectedDosesToday(meds, doses, now, tz)) {
      if (e.state !== 'skipped' || e.graceEnds == null) continue;
      if (now < e.graceEnds || now - e.graceEnds > CRASH_LATE_WINDOW_MS) continue;
      push(`crash-late-${e.medId}-${e.slotId}-${today}`, 'One from earlier',
        'Something on today’s list isn’t logged yet. Tap if you want to.', undefined, {
          actions: DOSE_ACTIONS,
          action: { medId: e.medId, slotId: e.slotId, amount: e.amount },
        });
    }
  }

  // ── A rule attached to a dose ──
  if (tracking && prefs.ruleReminders !== false) {
    for (const r of regimen.dueRules(meds, doses, now, tz)) {
      push(`crash-rule-${r.medId}-${r.ruleId}-${today}`, 'One of your rules',
        'Something you set for around this time. Tap to read it.');
    }
  }

  // ── Running low ──
  if (tracking && prefs.refillLow !== false) {
    for (const med of regimen.activeMeds(meds)) {
      const status = regimen.supplyStatus(med, now, tz);
      if (!crashShouldWarnRefill(status)) continue;
      push(`crash-refill-${med.id}-${today}`, 'Worth sorting this week',
        'One of your supplies needs attention. Tap to check.');
    }
  }

  // ── Something held overnight has opened ──
  if (prefs.escrowOpened !== false) {
    const drafts = Array.isArray(data.crashDrafts) ? data.crashDrafts : [];
    const ready = drafts.filter(
      (d) => d && d.status === 'held' && typeof d.releaseAt === 'number'
        && now >= d.releaseAt && now - d.releaseAt <= CRASH_ESCROW_GRACE_MS,
    );
    if (ready.length > 0) {
      // Keyed by local day so this is a single morning nudge, and bounded by
      // the grace window above so an ignored draft never becomes a nag.
      push(`crash-escrow-${today}`, 'It’s tomorrow now',
        ready.length === 1
          ? 'Something you held last night is open.'
          : `${ready.length} things you held are open.`);
    }
  }
  return out;
}

exports.crashReminders = onSchedule(
  { schedule: 'every 15 minutes', timeZone: DEFAULT_TZ },
  async () => {
    const now = Date.now();
    const userRefs = await db.collection('users').listDocuments();

    for (const userRef of userRefs) {
      try {
        const dataSnap = await db.doc(`${userRef.path}/data/app`).get();
        if (!dataSnap.exists) continue;

        const data = dataSnap.data();
        // Push only — someone with email alone gets nothing from this function.
        if (!data.fcmToken) continue;

        const stateRef = db.doc(`${userRef.path}/data/notifState`);
        const stateSnap = await stateRef.get();
        const stateData = stateSnap.exists ? stateSnap.data() : {};
        const sent = stateData.crashSent || {};

        const tz = (data.settings && data.settings.timeZone) || DEFAULT_TZ;
        const messages = collectCrashMessages(data, sent, now, tz);
        if (messages.length === 0) continue;

        const delivered = [];
        for (const msg of messages) {
          const alive = await sendPush(userRef.path, data.fcmToken, msg);
          if (!alive) break; // token revoked — leave the rest unmarked so they retry
          delivered.push(msg.tag);
        }

        if (delivered.length > 0) {
          const merged = { ...sent };
          for (const tag of delivered) merged[tag] = now;
          for (const [key, ts] of Object.entries(merged)) {
            if (now - ts > SENT_KEY_TTL_MS) delete merged[key];
          }
          await stateRef.set({ crashSent: merged }, { merge: true });
        }
      } catch (err) {
        console.error(`crashReminders: error for user ${userRef.id}:`, err.message);
      }
    }
  },
);


// Exported for unit tests only.
exports._internal = {
  collectCrashMessages, crashLatestDose, crashShouldWarnRefill, RX_APP_URL,
  localDateAndMinutes, regimen,
};

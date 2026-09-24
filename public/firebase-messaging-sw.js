importScripts('https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.5/firebase-messaging-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore-compat.js');

// The same Firebase project as the finance app: one login, one document, one
// set of dose history.
firebase.initializeApp({
  apiKey: 'AIzaSyA2oIL-WXWvzt1Ct256JF0_590CUpdXd_o',
  authDomain: 'billtracker-256ef.firebaseapp.com',
  projectId: 'billtracker-256ef',
  storageBucket: 'billtracker-256ef.firebasestorage.app',
  messagingSenderId: '1031129338488',
  appId: '1:1031129338488:web:836df1828ba619e674938d',
});

const messaging = firebase.messaging();
const APP_URL = '/Rx/';

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || payload.data?.title || 'Rx';
  const body = payload.notification?.body || payload.data?.body || '';
  // Actions arrive as JSON on the data payload rather than as a notification
  // field, because FCM's webpush block does not pass `actions` through on every
  // platform. Rebuilding them here means the buttons show wherever they can.
  let actions = [];
  try {
    const info = payload.data?.action ? JSON.parse(payload.data.action) : null;
    actions = !info ? [] : info.kind === 'water' ? WATER_ACTIONS : DOSE_ACTIONS;
  } catch { actions = []; }

  self.registration.showNotification(title, {
    body,
    icon: '/Rx/icon-192.png',
    badge: '/Rx/icon-192.png',
    tag: payload.data?.tag || 'rx-notification',
    renotify: true,
    // A routine's "wait is up" stays until it's dealt with.
    requireInteraction: payload.data?.pin === '1',
    vibrate: payload.data?.pin === '1' ? [250, 120, 250, 120, 250] : undefined,
    actions,
    data: payload.data,
  });
});

const DOSE_ACTIONS = [
  { action: 'take', title: 'Take' },
  { action: 'snooze', title: 'Snooze 15m' },
  { action: 'skip', title: 'Skip' },
];

const WATER_ACTIONS = [{ action: 'drank', title: 'Drank one' }];

const SNOOZE_MS = 15 * 60 * 1000;

/** Log a glass of water straight from the lock screen. */
async function logWaterFromNotification() {
  const uid = await currentUid();
  if (!uid) throw new Error('not signed in');
  const ref = firebase.firestore().doc(`users/${uid}/data/app`);
  const snap = await ref.get();
  const existing = snap.exists ? (snap.data().rxWater || []) : [];
  await ref.set({ rxWater: [Date.now(), ...existing] }, { merge: true });
}

/**
 * Log a dose straight from the lock screen.
 *
 * The point of these buttons is that taking a medication costs one tap and no
 * page load. That means writing to Firestore from the worker, which it can do
 * because the browser holds the signed-in user's IndexedDB auth state on this
 * origin — the same origin the app runs on.
 *
 * If anything about that fails the notification is NOT silently swallowed: the
 * app is opened on Today instead, so the dose can be logged by hand. A
 * medication tracker that quietly loses a "Take" is worse than one with no
 * buttons at all.
 */
async function logFromNotification(data, status) {
  const info = JSON.parse(data.action);
  const uid = await currentUid();
  if (!uid) throw new Error('not signed in');

  const db = firebase.firestore();
  const ref = db.doc(`users/${uid}/data/app`);
  const snap = await ref.get();
  const existing = snap.exists ? (snap.data().crashDoses || []) : [];

  const entry = {
    id: `n-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    takenAt: Date.now(),
    medId: info.medId || null,
    slotId: info.slotId || null,
    status,
    source: 'notification',
  };

  const patch = { crashDoses: [entry, ...existing] };

  // Taking one counts it out of the bottle, exactly as the in-app log does —
  // otherwise the pill count drifts every time the shortcut is used.
  if (status === 'taken' && info.medId) {
    const meds = snap.exists ? (snap.data().crashMeds || []) : [];
    const units = Number(info.amount) > 0 ? Number(info.amount) : 1;
    patch.crashMeds = meds.map((m) => {
      if (m.id !== info.medId) return m;
      const onHand = m.supply?.onHand;
      if (onHand === null || onHand === undefined || onHand === '') return m;
      return { ...m, supply: { ...m.supply, onHand: Math.max(0, Number(onHand) - units) } };
    });
  }

  await ref.set(patch, { merge: true });
}

/**
 * The signed-in user, read from the auth state the app already persisted.
 *
 * Auth persistence lives in IndexedDB on this origin, which the worker can
 * read — but "can" is doing some work there: it depends on the browser, and it
 * is not something to bet a dose log on. Hence the timeout, and hence every
 * caller falling back to opening the app rather than assuming success.
 */
function currentUid() {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    // Don't hang the notification event waiting on auth that may never arrive.
    setTimeout(() => finish(null), 3000);
    try {
      const unsub = firebase.auth().onAuthStateChanged((u) => {
        finish(u ? u.uid : null);
        // Guarded: onAuthStateChanged can fire before this assignment lands.
        if (typeof unsub === 'function') unsub();
      });
    } catch {
      finish(null);
    }
  });
}

function openApp(target) {
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
    for (const client of clientList) {
      if (client.url.includes('/Rx') && 'focus' in client) {
        if ('navigate' in client) client.navigate(target).catch(() => {});
        return client.focus();
      }
    }
    return self.clients.openWindow(target);
  });
}

self.addEventListener('notificationclick', (event) => {
  const data = event.notification.data || {};
  const target = data.url || APP_URL;
  event.notification.close();

  // Snooze re-shows the same notification later. It deliberately does not write
  // anything: a snoozed dose is neither taken nor skipped, it is simply not
  // answered yet, and the schedule still says it is due.
  if (event.action === 'snooze') {
    event.waitUntil((async () => {
      await new Promise((r) => setTimeout(r, SNOOZE_MS));
      await self.registration.showNotification('Still waiting on that one', {
        body: 'Tap to log it.',
        icon: '/Rx/icon-192.png',
        badge: '/Rx/icon-192.png',
        tag: data.tag ? `${data.tag}-snoozed` : 'rx-snoozed',
        actions: DOSE_ACTIONS,
        data,
      });
    })());
    return;
  }

  if (event.action === 'drank') {
    event.waitUntil(logWaterFromNotification().catch(() => openApp(target)));
    return;
  }

  if ((event.action === 'take' || event.action === 'skip') && data.action) {
    event.waitUntil(
      logFromNotification(data, event.action === 'take' ? 'taken' : 'skipped')
        // Never fail silently — fall back to opening the app so it can be
        // logged by hand.
        .catch(() => openApp(target)),
    );
    return;
  }

  event.waitUntil(openApp(target));
});

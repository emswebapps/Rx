import { messaging, FCM_VAPID_KEY } from '../firebase';

// The pure due-date maths lives in dueDates.js so it can be unit tested
// without pulling in Firebase. Re-exported here — this stays the import
// site the rest of the app already uses.
import { getToken, onMessage } from 'firebase/messaging';

const VAPID_KEY = FCM_VAPID_KEY;
const SW_PATH = '/Rx/firebase-messaging-sw.js';
// The messaging worker gets its own scope so it doesn't displace the PWA's
// service worker, which is registered at '/Rx/'. Two workers can't
// share one scope — the later registration would silently evict the earlier.
const SW_SCOPE = '/Rx/firebase-cloud-messaging-push-scope';

// A VAPID application server key is an uncompressed P-256 point (65 bytes),
// which is 87–88 base64url characters. Anything shorter can't produce a token,
// so we check up front and surface a clear reason instead of failing silently.
export function pushKeyConfigured() {
  return typeof VAPID_KEY === 'string' && VAPID_KEY.length >= 80;
}

export function notificationsSupported() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function notificationPermission() {
  if (!notificationsSupported()) return 'denied';
  return Notification.permission;
}

export async function requestNotificationPermission() {
  if (!notificationsSupported()) return 'denied';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  return Notification.requestPermission();
}

export function sendNotification(title, options = {}) {
  if (!notificationsSupported() || Notification.permission !== 'granted') return false;
  const opts = {
    icon: '/Rx/icon-192.png',
    badge: '/Rx/icon-192.png',
    data: { url: '/Rx/' },
    ...options,
  };
  // Android Chrome throws on `new Notification()` — notifications there must go
  // through the service worker. Prefer the service worker everywhere it exists
  // so phones behave the same as desktop, and fall back to the constructor.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistration()
      .then((reg) => {
        if (reg) return reg.showNotification(title, opts);
        throw new Error('no service worker registration');
      })
      .catch(() => { try { new Notification(title, opts); } catch { /* unsupported */ } });
    return true;
  }
  try {
    new Notification(title, opts);
    return true;
  } catch {
    return false;
  }
}

/**
 * Take down notifications with this tag, from every worker that might have
 * shown them — the app's own and the push worker, which live at different
 * scopes. Used to clear a pinned wait once the dose is taken, so the lock
 * screen never shows a timer for something already done.
 */
export async function closeNotifications(tag) {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    for (const reg of regs) {
      const list = await reg.getNotifications({ tag });
      for (const n of list) n.close();
    }
  } catch {
    // Nothing to close, or the browser won't say — either way nothing to do.
  }
}

// ── Shift notification scheduling ──────────────────────────────────────────

const shiftNotifTimers = {};

/**
 * Schedule a browser notification before a shift starts.
 * @param {object} shift - shift object with { id, date, startTime, notificationEnabled, notificationOffsetMinutes }
 * @param {object} job - job object with { name }
 */
/**
 * Cancel a scheduled shift notification timer.
 * @param {string} shiftId
 */
// ── To-do due dates and reminder lead times ────────────────────────────────

// ── Firebase Cloud Messaging (FCM) ──────────────────────────────────────────

/**
 * Register this browser with FCM and return the device token.
 * Call only after notification permission is granted.
 * Returns null if FCM is not supported in this browser.
 */
export async function registerFCMToken() {
  if (!pushKeyConfigured()) {
    console.warn('[push] VITE_FCM_VAPID_KEY is missing or invalid — background push is disabled.');
    return null;
  }
  try {
    const client = await messaging;
    if (!client) return null;
    const swReg = await navigator.serviceWorker.register(SW_PATH, { scope: SW_SCOPE });
    const token = await getToken(client, { vapidKey: VAPID_KEY, serviceWorkerRegistration: swReg });
    return token || null;
  } catch (err) {
    console.warn('[push] Could not register for background push:', err?.message || err);
    return null;
  }
}

/**
 * Listen for FCM messages while the app is in the foreground.
 * Returns an unsubscribe function.
 */
export async function onForegroundMessage(callback) {
  const client = await messaging;
  if (!client) return () => {};
  return onMessage(client, (payload) => {
    const { title, body, icon } = payload.notification || {};
    sendNotification(title || 'Finance Manager', {
      body: body || '',
      icon: icon || undefined,
      data: payload.data,
    });
    callback?.(payload);
  });
}

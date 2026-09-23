import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { storage, CLOUD_FIELDS } from '../utils/storage';
import { saveUserData, loadUserData, subscribeUserData, saveFCMToken } from '../utils/firestoreSync';
import { generateId } from '../utils/id';
import { createSession, defaultReleaseAt } from '../lib/protocol.js';
import { pruneSessions } from '../lib/stats.js';
import { normalizeMed, supplyAfterDose, supplyAfterUndo, newMed } from '../lib/meds.js';
import {
  registerFCMToken, onForegroundMessage, sendNotification, notificationPermission,
} from '../utils/notifications';

const AppContext = createContext(null);

/**
 * Everything Rx knows, and the two places it keeps it.
 *
 * localStorage is the cache that makes the app usable before the network
 * answers; Firestore is the source of truth. Writes go to both — localStorage
 * immediately, Firestore on a debounce — and a snapshot listener folds in
 * changes made on another device.
 *
 * This is a much smaller thing than the finance app's context it was extracted
 * from: nine slices instead of twenty-five, and no month selection, share links
 * or test mode. It writes only the fields Rx owns, with `{ merge: true }`, so
 * the two apps can share one document without either standing on the other.
 */

/**
 * Debounce Firestore writes so rapid changes don't spam the DB.
 *
 * Patches are MERGED across the window rather than replaced. Two writes to
 * different slices inside the same 1.5 seconds is not a rare case — logging a
 * dose also counts one out of that medication's supply, and closing a session
 * also resolves the drafts held under it — and with plain replace semantics the
 * earlier slice was silently dropped from the cloud copy while localStorage
 * kept it, which is the worst shape a sync bug can have: invisible on the
 * device that made the change.
 */
function useDebounce(fn, delay = 1500) {
  const timer = useRef(null);
  const pending = useRef(null);
  return useCallback((patch) => {
    pending.current = { ...(pending.current || {}), ...patch };
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const merged = pending.current;
      pending.current = null;
      fn(merged);
    }, delay);
  }, [fn, delay]);
}

export function AppProvider({ children, uid }) {
  const [settings, setSettingsState] = useState(() => storage.getSettings());
  const [notifPrefs, setNotifPrefsState] = useState(() => storage.getNotifPrefs());
  const [crashSessions, setSessions] = useState(() => storage.getSessions());
  const [crashDrafts, setDrafts] = useState(() => storage.getDrafts());
  const [crashAnchors, setAnchors] = useState(() => storage.getAnchors());
  const [crashKit, setKit] = useState(() => storage.getKit());
  const [crashDoses, setDoses] = useState(() => storage.getDoses());
  const [crashMeds, setMeds] = useState(() => storage.getMeds());
  const [crashBehaviors, setBehaviors] = useState(() => storage.getBehaviors());
  const [rxNotes, setNotes] = useState(() => storage.getNotes());
  const [fcmToken, setFcmToken] = useState(() => localStorage.getItem('bt_fcm_token') || null);
  const [cloudLoaded, setCloudLoaded] = useState(false);

  // Always-fresh values for the flush, which fires from an event handler that
  // closed over an older render.
  const stateRef = useRef({});
  stateRef.current = {
    settings, notifPrefs, crashSessions, crashDrafts, crashAnchors,
    crashKit, crashDoses, crashMeds, crashBehaviors, rxNotes,
  };

  const setters = useRef({
    settings: setSettingsState,
    notifPrefs: setNotifPrefsState,
    crashSessions: setSessions,
    crashDrafts: setDrafts,
    crashAnchors: setAnchors,
    crashKit: setKit,
    crashDoses: setDoses,
    crashMeds: setMeds,
    crashBehaviors: setBehaviors,
    rxNotes: setNotes,
  }).current;

  // ── Load, then keep listening ───────────────────────────────────────────

  const hydrate = useCallback((data) => {
    if (!data) return;
    for (const [field, [, write]] of Object.entries(CLOUD_FIELDS)) {
      if (data[field] === undefined) continue;
      const value = field === 'settings' || field === 'notifPrefs'
        ? { ...stateRef.current[field], ...data[field] }
        : data[field];
      setters[field](value);
      write(value);
    }
  }, [setters]);

  useEffect(() => {
    if (!uid) return undefined;
    setCloudLoaded(false);
    let live = true;
    loadUserData(uid).then((data) => {
      if (!live) return;
      hydrate(data);
      setCloudLoaded(true);
    });
    // Another device — or the finance app writing `settings` — should show up
    // here without a reload.
    const unsub = subscribeUserData(uid, (data) => { if (live) hydrate(data); });
    return () => { live = false; unsub(); };
  }, [uid, hydrate]);

  const saveCloud = useCallback((patch) => {
    if (!uid) return;
    saveUserData(uid, patch);
  }, [uid]);
  const debouncedSync = useDebounce(saveCloud);

  /** Write a slice to state, the cache and (eventually) the cloud. */
  const persist = useCallback((field, value) => {
    setters[field](value);
    CLOUD_FIELDS[field][1](value);
    debouncedSync({ [field]: value });
  }, [setters, debouncedSync]);

  /**
   * Skip the debounce.
   *
   * The protocol's last step and a one-tap dose log are both immediately
   * followed by the phone being put down, which is exactly the window the
   * 1.5-second debounce loses.
   */
  const flushCrashSync = useCallback(() => {
    if (!uid) return;
    const st = stateRef.current;
    saveUserData(uid, {
      crashSessions: st.crashSessions,
      crashDrafts: st.crashDrafts,
      crashAnchors: st.crashAnchors,
      crashDoses: st.crashDoses,
      crashBehaviors: st.crashBehaviors,
      rxNotes: st.rxNotes,
    });
  }, [uid]);

  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') flushCrashSync(); };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [flushCrashSync]);

  // ── Push ────────────────────────────────────────────────────────────────

  const enablePushNotifications = useCallback(async () => {
    const token = await registerFCMToken();
    if (!token) return false;
    setFcmToken(token);
    localStorage.setItem('bt_fcm_token', token);
    if (uid) await saveFCMToken(uid, token);
    return true;
  }, [uid]);

  useEffect(() => {
    if (notificationPermission() !== 'granted') return;
    onForegroundMessage((payload) => {
      const n = payload?.notification;
      if (n?.title) sendNotification(n.title, { body: n.body, tag: payload?.data?.tag });
    });
  }, []);

  // ── Settings and preferences ────────────────────────────────────────────

  const setSettings = useCallback((patch) => {
    persist('settings', { ...stateRef.current.settings, ...patch });
  }, [persist]);

  const persistNotifPrefs = useCallback((next) => persist('notifPrefs', next), [persist]);

  const updateCrashKit = useCallback((patch) => {
    persist('crashKit', { ...stateRef.current.crashKit, ...patch });
  }, [persist]);

  // ── Sessions ────────────────────────────────────────────────────────────

  const startCrashSession = useCallback(() => {
    const st = stateRef.current;
    const session = createSession(generateId(), Date.now(), st.crashKit.timerMinutes);
    // Old sessions are compacted rather than kept whole — see stats.js. All 25
    // slices of the shared document have to fit in one Firestore document.
    const closed = pruneSessions(st.crashSessions);
    persist('crashSessions', [session, ...closed]);
    return session;
  }, [persist]);

  const updateCrashSession = useCallback((id, patch) => {
    persist('crashSessions', stateRef.current.crashSessions.map(
      (s) => (s.id === id ? { ...s, ...patch } : s),
    ));
  }, [persist]);

  const endCrashSession = useCallback((id, patch = {}) => {
    persist('crashSessions', stateRef.current.crashSessions.map(
      (s) => (s.id === id ? { ...s, ...patch, endedAt: s.endedAt || Date.now() } : s),
    ));
  }, [persist]);

  const deleteCrashSession = useCallback((id) => {
    persist('crashSessions', stateRef.current.crashSessions.filter((s) => s.id !== id));
  }, [persist]);

  // ── Escrow ──────────────────────────────────────────────────────────────
  // Works with no session open on purpose — "I need to say this before I
  // forget" is the trap, so capturing has to be the fastest thing in the app.

  const addCrashDraft = useCallback((text, sessionId = null) => {
    const draft = {
      id: generateId(), text, createdAt: Date.now(),
      releaseAt: defaultReleaseAt(), sessionId, status: 'held',
    };
    persist('crashDrafts', [draft, ...stateRef.current.crashDrafts]);
    return draft;
  }, [persist]);

  const updateCrashDraft = useCallback((id, patch) => {
    persist('crashDrafts', stateRef.current.crashDrafts.map(
      (d) => (d.id === id ? { ...d, ...patch } : d),
    ));
  }, [persist]);

  const resolveCrashDraft = useCallback((id, status) => {
    persist('crashDrafts', stateRef.current.crashDrafts.map(
      (d) => (d.id === id ? { ...d, status, resolvedAt: Date.now() } : d),
    ));
  }, [persist]);

  const deleteCrashDraft = useCallback((id) => {
    persist('crashDrafts', stateRef.current.crashDrafts.filter((d) => d.id !== id));
  }, [persist]);

  // ── Anchors ─────────────────────────────────────────────────────────────

  const addCrashAnchor = useCallback((anchor) => {
    const next = { id: generateId(), createdAt: Date.now(), files: [], pinned: false, ...anchor };
    persist('crashAnchors', [next, ...stateRef.current.crashAnchors]);
    return next;
  }, [persist]);

  const updateCrashAnchor = useCallback((id, patch) => {
    persist('crashAnchors', stateRef.current.crashAnchors.map(
      (a) => (a.id === id ? { ...a, ...patch } : a),
    ));
  }, [persist]);

  // The caller deletes the Storage bytes first.
  const deleteCrashAnchor = useCallback((id) => {
    persist('crashAnchors', stateRef.current.crashAnchors.filter((a) => a.id !== id));
  }, [persist]);

  // ── Doses ───────────────────────────────────────────────────────────────
  // `medId` is optional throughout: a dose logged before medications existed,
  // or from the plain one-tap row, simply has none and falls back to the kit's
  // own onset and duration wherever the window is computed.

  const addCrashDose = useCallback((takenAt = Date.now(), medId = null, extra = {}) => {
    const dose = { id: generateId(), takenAt, medId, status: 'taken', ...extra };
    persist('crashDoses', [dose, ...stateRef.current.crashDoses]);
    return dose;
  }, [persist]);

  const updateCrashDose = useCallback((id, patch) => {
    persist('crashDoses', stateRef.current.crashDoses.map(
      (d) => (d.id === id ? { ...d, ...patch } : d),
    ));
  }, [persist]);

  const deleteCrashDose = useCallback((id) => {
    persist('crashDoses', stateRef.current.crashDoses.filter((d) => d.id !== id));
  }, [persist]);

  /**
   * Log a dose against a medication and count it out of the supply in the same
   * step, so the pill count can't drift away from the dose log.
   */
  const logCrashDose = useCallback((medId, takenAt = Date.now(), extra = {}) => {
    const st = stateRef.current;
    const dose = { id: generateId(), takenAt, medId: medId || null, status: 'taken', ...extra };
    persist('crashDoses', [dose, ...st.crashDoses]);

    const med = st.crashMeds.find((m) => m.id === medId);
    if (med) {
      const supply = supplyAfterDose(med, extra.amount);
      if (supply) {
        persist('crashMeds', st.crashMeds.map((m) => (m.id === medId ? { ...m, supply } : m)));
      }
    }
    return dose;
  }, [persist]);

  /**
   * Take back a dose or a skip logged by mistake.
   *
   * A taken dose gives its units back to the supply, so tapping "Take" on the
   * wrong row and undoing it leaves the pill count where it started.
   */
  const unlogCrashDose = useCallback((id) => {
    const st = stateRef.current;
    const dose = st.crashDoses.find((d) => d.id === id);
    if (!dose) return;
    persist('crashDoses', st.crashDoses.filter((d) => d.id !== id));

    if (dose.status === 'skipped') return;
    const med = st.crashMeds.find((m) => m.id === dose.medId);
    const supply = med ? supplyAfterUndo(med, dose.amount) : null;
    if (supply) {
      persist('crashMeds', st.crashMeds.map((m) => (m.id === med.id ? { ...m, supply } : m)));
    }
  }, [persist]);

  /**
   * Deliberately not taking one.
   *
   * A skip recorded as a choice is different from a dose that was simply never
   * logged, and the history has to be able to tell them apart — otherwise the
   * only way to keep a clean record is to lie about having taken something.
   */
  const skipCrashDose = useCallback((medId, at = Date.now(), extra = {}) => {
    const entry = {
      id: generateId(), takenAt: at, medId: medId || null, status: 'skipped', ...extra,
    };
    persist('crashDoses', [entry, ...stateRef.current.crashDoses]);
    return entry;
  }, [persist]);

  // ── Medications ─────────────────────────────────────────────────────────

  // `createdAt` is what stops the adherence history crediting the weeks before
  // this medication existed as weeks it was taken. A med saved before the field
  // was added has none, and is treated as having always existed — the only
  // reading that doesn't wipe out history people already have.
  const addCrashMed = useCallback((med = {}) => {
    // `newMed()` rather than a spread of DEFAULT_MED. The spread is shallow, so
    // a caller that passes no schedule or supply of its own — anything but the
    // add form, today — would store a medication whose `schedule` *is* the
    // module-level default object, shared with every other med made that way.
    // It also detaches the stored med from the form's draft, which the editor
    // goes on holding.
    const next = newMed({ createdAt: Date.now(), ...med, id: generateId() });
    persist('crashMeds', [...stateRef.current.crashMeds, next]);
    return next;
  }, [persist]);

  // Archiving is stamped for the same reason: without a date, the days a med
  // was genuinely being taken are indistinguishable from the days after it
  // stopped, and history has to fall back to not counting it at all.
  const updateCrashMed = useCallback((id, patch) => {
    persist('crashMeds', stateRef.current.crashMeds.map((m) => {
      if (m.id !== id) return m;
      const next = { ...m, ...patch };
      if (patch.active === false && m.active !== false) next.archivedAt = Date.now();
      if (patch.active === true && m.active === false) next.archivedAt = null;
      return next;
    }));
  }, [persist]);

  // Deleting a medication must not orphan a schedule that hangs off it, or the
  // meds pointing at it silently stop resolving a time at all.
  const deleteCrashMed = useCallback((id) => {
    persist('crashMeds', stateRef.current.crashMeds
      .filter((m) => m.id !== id)
      .map((m) => {
        const times = (m.schedule?.times || []).map((t) => (t.afterMedId === id
          ? { ...t, mode: 'clock', afterMedId: null }
          : t));
        return times.length ? { ...m, schedule: { ...m.schedule, times } } : m;
      }));
  }, [persist]);

  /** Refilling resets the count and clears the fill-window date it just met. */
  const refillCrashMed = useCallback((medId, onHand) => {
    const st = stateRef.current;
    const med = st.crashMeds.find((m) => m.id === medId);
    if (!med) return;
    const supply = {
      ...normalizeMed(med).supply,
      onHand: Number(onHand), refillFrom: '', lastFilledAt: Date.now(),
    };
    persist('crashMeds', st.crashMeds.map((m) => (m.id === medId ? { ...m, supply } : m)));
  }, [persist]);

  // ── What I've noticed ───────────────────────────────────────────────────
  // Free text about how a medication actually behaves. Kept out of the crash
  // slices deliberately: these are not crisis records, they are the standing
  // knowledge the crisis records are read against.

  const addRxNote = useCallback((note = {}) => {
    const next = {
      ...note, id: generateId(), createdAt: Date.now(), updatedAt: Date.now(),
    };
    persist('rxNotes', [next, ...stateRef.current.rxNotes]);
    return next;
  }, [persist]);

  const updateRxNote = useCallback((id, patch) => {
    persist('rxNotes', stateRef.current.rxNotes.map(
      (n) => (n.id === id ? { ...n, ...patch, updatedAt: Date.now() } : n),
    ));
  }, [persist]);

  const deleteRxNote = useCallback((id) => {
    persist('rxNotes', stateRef.current.rxNotes.filter((n) => n.id !== id));
  }, [persist]);

  const toggleRxNotePin = useCallback((id) => {
    persist('rxNotes', stateRef.current.rxNotes.map(
      (n) => (n.id === id ? { ...n, pinned: !n.pinned, updatedAt: Date.now() } : n),
    ));
  }, [persist]);

  // ── Warning-sign check-ins ──────────────────────────────────────────────

  const addCrashBehavior = useCallback((signIds, at = Date.now()) => {
    const ids = Array.isArray(signIds) ? signIds.filter(Boolean) : [];
    if (ids.length === 0) return null;
    const entry = { id: generateId(), at, signIds: ids, source: 'check' };
    persist('crashBehaviors', [entry, ...stateRef.current.crashBehaviors]);
    return entry;
  }, [persist]);

  const deleteCrashBehavior = useCallback((id) => {
    persist('crashBehaviors', stateRef.current.crashBehaviors.filter((b) => b.id !== id));
  }, [persist]);

  return (
    <AppContext.Provider value={{
      cloudLoaded,
      settings, setSettings,
      notifPrefs, persistNotifPrefs, fcmToken, enablePushNotifications,
      crashSessions, startCrashSession, updateCrashSession, endCrashSession, deleteCrashSession,
      crashDrafts, addCrashDraft, updateCrashDraft, resolveCrashDraft, deleteCrashDraft,
      crashAnchors, addCrashAnchor, updateCrashAnchor, deleteCrashAnchor,
      crashKit, updateCrashKit, flushCrashSync,
      crashDoses, addCrashDose, updateCrashDose, deleteCrashDose, logCrashDose, skipCrashDose, unlogCrashDose,
      crashMeds, addCrashMed, updateCrashMed, deleteCrashMed, refillCrashMed,
      crashBehaviors, addCrashBehavior, deleteCrashBehavior,
      rxNotes, addRxNote, updateRxNote, deleteRxNote, toggleRxNotePin,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}

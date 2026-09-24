// The localStorage cache.
//
// Firestore is the source of truth; this is what makes the app usable in the
// half-second before the cloud copy arrives, and on a phone with no signal.
//
// The keys keep their `bt_crash_*` names from when this lived inside the
// finance app. They are not pretty, but they are what is already written on
// every device this has ever run on — and because Rx is served from the same
// origin as the finance app, renaming them would strand the cache rather than
// migrate it. The Firestore field names match, and those are live data.

const KEYS = {
  SETTINGS: 'bt_settings',
  NOTIF_PREFS: 'bt_notif_prefs',
  SESSIONS: 'bt_crash_sessions',
  DRAFTS: 'bt_crash_drafts',
  ANCHORS: 'bt_crash_anchors',
  KIT: 'bt_crash_kit',
  DOSES: 'bt_crash_doses',
  MEDS: 'bt_crash_meds',
  BEHAVIORS: 'bt_crash_behaviors',
  // A new slice, so it gets a clean name rather than inheriting the `bt_crash_`
  // prefix the others are stuck with. Nothing is written under it yet, so there
  // is no live data to strand.
  NOTES: 'rx_notes',
  ROUTINE_RUNS: 'rx_routine_runs',
  WATER: 'rx_water',
  CLIENT_SENT: 'rx_client_sent',
};

function get(key) {
  try {
    const val = localStorage.getItem(key);
    return val ? JSON.parse(val) : null;
  } catch {
    return null;
  }
}

function set(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // A full or blocked store is not worth losing the session over — the write
    // to Firestore is the one that matters.
  }
}

// Only the settings Rx actually reads. The finance app keeps many more in the
// same key; merging over what's there means writing one from here never drops
// one of theirs.
const DEFAULT_SETTINGS = {
  theme: 'dark',
  timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York',
  spouseName: '',
};

export const storage = {
  getSettings: () => ({ ...DEFAULT_SETTINGS, ...(get(KEYS.SETTINGS) || {}) }),
  setSettings: (v) => set(KEYS.SETTINGS, { ...(get(KEYS.SETTINGS) || {}), ...v }),

  getNotifPrefs: () => {
    const saved = get(KEYS.NOTIF_PREFS) || {};
    return {
      ...saved,
      crash: {
        timerEnd: true, windowHeadsUp: true, escrowOpened: true, crashNote: true,
        doseDue: true, ruleReminders: true, refillLow: true,
        routineWait: true, water: true,
        // Off until asked for: a second buzz about a dose whose moment has
        // already passed is mostly guilt.
        doseLate: false,
        ...(saved.crash || {}),
      },
    };
  },
  setNotifPrefs: (v) => set(KEYS.NOTIF_PREFS, { ...(get(KEYS.NOTIF_PREFS) || {}), ...v }),

  getSessions: () => get(KEYS.SESSIONS) || [],
  setSessions: (v) => set(KEYS.SESSIONS, v),
  getDrafts: () => get(KEYS.DRAFTS) || [],
  setDrafts: (v) => set(KEYS.DRAFTS, v),
  getAnchors: () => get(KEYS.ANCHORS) || [],
  setAnchors: (v) => set(KEYS.ANCHORS, v),
  getKit: () => get(KEYS.KIT) || {},
  setKit: (v) => set(KEYS.KIT, v),
  getDoses: () => get(KEYS.DOSES) || [],
  setDoses: (v) => set(KEYS.DOSES, v),
  getMeds: () => get(KEYS.MEDS) || [],
  setMeds: (v) => set(KEYS.MEDS, v),
  getBehaviors: () => get(KEYS.BEHAVIORS) || [],
  setBehaviors: (v) => set(KEYS.BEHAVIORS, v),
  getNotes: () => get(KEYS.NOTES) || [],
  setNotes: (v) => set(KEYS.NOTES, v),
  getRoutineRuns: () => get(KEYS.ROUTINE_RUNS) || [],
  setRoutineRuns: (v) => set(KEYS.ROUTINE_RUNS, v),
  getWater: () => get(KEYS.WATER) || [],
  setWater: (v) => set(KEYS.WATER, v),
  getClientSent: () => get(KEYS.CLIENT_SENT) || {},
  setClientSent: (v) => set(KEYS.CLIENT_SENT, v),
};

// The Firestore field names, which are also the localStorage slices. One list,
// so the sync layer and the cache can't drift apart.
export const CLOUD_FIELDS = {
  settings: [storage.getSettings, storage.setSettings],
  notifPrefs: [storage.getNotifPrefs, storage.setNotifPrefs],
  crashSessions: [storage.getSessions, storage.setSessions],
  crashDrafts: [storage.getDrafts, storage.setDrafts],
  crashAnchors: [storage.getAnchors, storage.setAnchors],
  crashKit: [storage.getKit, storage.setKit],
  crashDoses: [storage.getDoses, storage.setDoses],
  crashMeds: [storage.getMeds, storage.setMeds],
  crashBehaviors: [storage.getBehaviors, storage.setBehaviors],
  rxNotes: [storage.getNotes, storage.setNotes],
  // Check-offs for the routine steps around a dose — see lib/routine.js.
  rxRoutineRuns: [storage.getRoutineRuns, storage.setRoutineRuns],
  // One timestamp per glass — see lib/water.js.
  rxWater: [storage.getWater, storage.setWater],
  // Reminders this device has already shown while open, by tag. The scheduler
  // reads it as "already sent", so a buzz the app fired on the second isn't
  // repeated by the next server tick.
  rxClientSent: [storage.getClientSent, storage.setClientSent],
};

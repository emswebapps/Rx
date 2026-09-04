// The kit: the things you decide once, while you're fine, so that none of them
// have to be decided while you're not.
//
// Deep-merged against these defaults on every read (same approach as
// getNotifPrefs in src/utils/storage.js), so adding a warning sign here shows
// up for a kit that was saved months ago.

export const DEFAULT_WARNING_SIGNS = [
  { id: 'irritating', text: 'Everything he says is landing wrong' },
  { id: 'meaning', text: 'I’m assigning meaning to small things' },
  { id: 'rejected', text: 'I feel rejected, ignored, or unloved' },
  { id: 'explaining', text: 'I want to keep explaining until he understands' },
  { id: 'rereading', text: 'I’m rereading texts or replaying conversations' },
  { id: 'urgent', text: 'This has to be resolved right now' },
  { id: 'absolutes', text: 'My thoughts are absolute — “always,” “never,” “this proves it”' },
  { id: 'tone', text: 'I’m reading a lot into his tone' },
  { id: 'beforeiforget', text: 'I need to say this before I forget' },
];

export const FEELINGS = [
  { key: 'angry', label: 'Angry', emoji: '🔥' },
  { key: 'rejected', label: 'Rejected', emoji: '💔' },
  { key: 'obsessing', label: 'Stuck on it', emoji: '🔁' },
  { key: 'sending', label: 'About to send a text', emoji: '📱' },
];

// `action` marks the options the app can actually do something about, rather
// than just remind you of.
export const DEFAULT_MENU = {
  angry: [
    { id: 'walk', emoji: '🚶', label: 'Walk around the block' },
    { id: 'shower', emoji: '🚿', label: 'Shower' },
    { id: 'headphones', emoji: '🎧', label: 'Headphones on' },
    { id: 'dogs', emoji: '🐕', label: 'Take the dogs out' },
    { id: 'cold', emoji: '🧊', label: 'Cold water on your face' },
    { id: 'game', emoji: '🎮', label: 'Video game' },
    { id: 'pushups', emoji: '💪', label: 'Push-ups' },
  ],
  rejected: [
    { id: 'anchors', emoji: '📸', label: 'Read your anchors', action: 'anchors' },
    { id: 'dogs', emoji: '🐕', label: 'Sit with the dogs' },
    { id: 'comfy', emoji: '🛋️', label: 'Sit somewhere comfortable' },
    { id: 'music', emoji: '🎧', label: 'Familiar music' },
    { id: 'food', emoji: '🍞', label: 'Make something to eat' },
  ],
  obsessing: [
    { id: 'facts', emoji: '📝', label: 'Do the facts/story list', action: 'facts' },
    { id: 'puzzle', emoji: '🧩', label: 'Puzzle or game' },
    { id: 'clean', emoji: '🧽', label: 'Clean something' },
    { id: 'show', emoji: '📺', label: 'Watch something stupid' },
  ],
  sending: [
    { id: 'escrow', emoji: '✍️', label: 'Write it here instead', action: 'escrow' },
    { id: 'brake', emoji: '💬', label: 'Send the short version instead', action: 'brake' },
    { id: 'walk', emoji: '🚶', label: 'Walk first, decide after' },
  ],
};

export const DEFAULT_CRASH_KIT = {
  partnerName: '',
  timerMinutes: 30,
  brakeVariantId: 'short',
  brakePhrase: '',
  notifyOnTimerEnd: true,
  warningSigns: DEFAULT_WARNING_SIGNS,
  menu: DEFAULT_MENU,
};

/**
 * Merge a saved kit over the defaults. Warning signs and menu entries are
 * merged by id so a customised label survives, while newly added defaults
 * still appear. A sign the user deleted stays deleted — that's what
 * `removedSigns` records.
 */
export function mergeKit(saved = {}) {
  const removed = new Set(saved.removedSigns || []);
  const savedSigns = Array.isArray(saved.warningSigns) ? saved.warningSigns : [];
  const byId = new Map(savedSigns.map((s) => [s.id, s]));

  const signs = DEFAULT_WARNING_SIGNS
    .filter((d) => !removed.has(d.id))
    .map((d) => byId.get(d.id) || d);
  // Anything the user added themselves isn't in the defaults, so append it.
  const extras = savedSigns.filter((s) => !DEFAULT_WARNING_SIGNS.some((d) => d.id === s.id));

  const menu = {};
  for (const key of Object.keys(DEFAULT_MENU)) {
    const savedList = saved.menu && Array.isArray(saved.menu[key]) ? saved.menu[key] : null;
    menu[key] = savedList && savedList.length ? savedList : DEFAULT_MENU[key];
  }

  return {
    ...DEFAULT_CRASH_KIT,
    ...saved,
    warningSigns: [...signs, ...extras],
    menu,
  };
}

/** Look up a menu option by id across every group. */
export function findMove(kit, id) {
  for (const group of Object.values(kit.menu || {})) {
    const hit = (group || []).find((o) => o.id === id);
    if (hit) return hit;
  }
  return null;
}

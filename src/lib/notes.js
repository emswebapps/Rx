// What I've noticed.
//
// The app can already say what was taken and when. It had nowhere to keep the
// other half — what the medication actually does, what it feels like when it
// wears off, what has to happen alongside it for it to work, and which mistakes
// have been made before and are worth not making again.
//
// That knowledge doesn't fit anywhere else in the model. Warning signs are
// short tags chosen from a list. Per-dose rules are one-liners pinned to a
// clock. Anchors are for reading mid-crisis. None of them is a place to write a
// paragraph and come back to it in six months, and a paragraph is the honest
// shape of most of what a person learns about their own medication.
//
// Pure and Firebase-free so `node --test` can run it.

/** The kinds of thing worth separating, because they get read at different moments. */
export const NOTE_KINDS = [
  { key: 'effect', label: 'How it affects me' },
  { key: 'timing', label: 'Food and timing' },
  { key: 'warning', label: 'Watch out for' },
  { key: 'other', label: 'Other' },
];

export const DEFAULT_NOTE = {
  text: '',
  kind: 'effect',
  medId: null,   // optional: tie an observation to one medication
  pinned: false,
  createdAt: null,
  updatedAt: null,
};

export function normalizeNote(note = {}) {
  return {
    ...DEFAULT_NOTE,
    ...note,
    text: String(note.text ?? ''),
    kind: NOTE_KINDS.some((k) => k.key === note.kind) ? note.kind : 'other',
    pinned: Boolean(note.pinned),
  };
}

/**
 * Pinned first, then newest.
 *
 * Pinning is the whole point of the ordering: a note is pinned because it is
 * the one that has to be in front of you at a bad moment, not because it is
 * recent. Within each group, newest wins — a later observation supersedes an
 * earlier one on the same subject more often than not.
 */
export function sortNotes(notes = []) {
  return [...(Array.isArray(notes) ? notes : [])]
    .filter(Boolean)
    .map(normalizeNote)
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
}

/** The ones that should be in front of you before you do something you'll regret. */
export function pinnedNotes(notes = []) {
  return sortNotes(notes).filter((n) => n.pinned && n.text.trim());
}

/** Everything written about one medication. */
export function notesForMed(notes = [], medId) {
  if (!medId) return [];
  return sortNotes(notes).filter((n) => n.medId === medId && n.text.trim());
}

export function notesOfKind(notes = [], kind) {
  return sortNotes(notes).filter((n) => n.kind === kind && n.text.trim());
}

/**
 * A one-line preview for a list.
 *
 * Cuts on a word boundary, because a note truncated mid-word reads as broken
 * rather than shortened.
 */
export function preview(text, max = 100) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** A note with nothing in it is not a note — don't persist or count one. */
export function isBlank(note) {
  return !String(note?.text ?? '').trim();
}

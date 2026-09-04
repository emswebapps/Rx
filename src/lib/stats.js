// The after-the-fact evidence.
//
// This is the quiet point of the whole feature. Mid-crash, "this will look
// different tomorrow" is unbelievable. It stops being unbelievable when it's
// your own record saying it happened eleven times out of fourteen.
//
// Pure and Firebase-free so it can be tested directly.

// Full session records kept in the app doc. Everything older is compacted,
// because all 25 slices of this app share one Firestore document and the
// history stats only ever need five fields per session anyway.
export const FULL_SESSION_CAP = 60;

export function compactSession(s) {
  return {
    id: s.id,
    startedAt: s.startedAt,
    intensity: s.intensity ?? null,
    intensityAfter: s.intensityAfter ?? null,
    outcome: s.outcome ?? null,
    compact: true,
  };
}

/**
 * Keeps the newest `cap` sessions whole and compacts the rest. Returns a new
 * array in the same newest-first order the UI reads.
 */
export function pruneSessions(sessions, cap = FULL_SESSION_CAP) {
  if (!Array.isArray(sessions)) return [];
  const sorted = [...sessions].sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
  return sorted.map((s, i) => {
    // Never compact the session currently being lived through, wherever it
    // happens to sort. Losing the facts column mid-crash would be the single
    // worst bug this feature could have.
    if (!s.endedAt) return s;
    return i < cap || s.compact ? s : compactSession(s);
  });
}

function mean(nums) {
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function round1(n) {
  return n == null ? null : Math.round(n * 10) / 10;
}

/**
 * Everything the history screen says, computed in one place.
 *
 * `settled` counts the times the crash resolved itself: either the session
 * closed with "it can go" or a draft that felt urgent enough to write down was
 * later let go. That ratio is the sentence worth reading at 9pm.
 */
export function summarize(sessions = [], drafts = []) {
  const list = Array.isArray(sessions) ? sessions.filter(Boolean) : [];
  const finished = list.filter((s) => s.endedAt);

  const before = list.map((s) => s.intensity).filter((n) => typeof n === 'number');
  const after = list.map((s) => s.intensityAfter).filter((n) => typeof n === 'number');

  // Only sessions that recorded both numbers can speak to the drop.
  const pairs = list.filter(
    (s) => typeof s.intensity === 'number' && typeof s.intensityAfter === 'number',
  );

  const rated = list.filter((s) => s.outcome);
  const letGo = rated.filter((s) => s.outcome === 'let-it-go');

  const draftList = Array.isArray(drafts) ? drafts.filter(Boolean) : [];
  const resolvedDrafts = draftList.filter((d) => d.status === 'sent' || d.status === 'dropped');
  const droppedDrafts = resolvedDrafts.filter((d) => d.status === 'dropped');

  return {
    total: list.length,
    finished: finished.length,
    avgBefore: round1(mean(before)),
    avgAfter: round1(mean(after)),
    avgDrop: pairs.length
      ? round1(mean(pairs.map((s) => s.intensity - s.intensityAfter)))
      : null,
    ratedCount: rated.length,
    letGoCount: letGo.length,
    draftsResolved: resolvedDrafts.length,
    draftsDropped: droppedDrafts.length,
    // The headline number: of the things that felt urgent enough to close out,
    // how many turned out not to need saying.
    settledCount: letGo.length + droppedDrafts.length,
    settledOf: rated.length + resolvedDrafts.length,
  };
}

/** The history sentence, or null when there isn't enough history to say anything. */
export function historySentence(summary) {
  if (!summary || summary.total === 0) return null;
  const parts = [];
  parts.push(
    summary.total === 1
      ? 'You’ve run this once.'
      : `You’ve run this ${summary.total} times.`,
  );
  if (summary.avgBefore != null && summary.avgAfter != null) {
    parts.push(`Your intensity goes from ${summary.avgBefore} down to ${summary.avgAfter}.`);
  }
  if (summary.settledOf > 0 && summary.settledCount > 0) {
    parts.push(
      `${summary.settledCount} of ${summary.settledOf} times, the thing that felt urgent didn’t need to be said the next day.`,
    );
  }
  return parts.join(' ');
}

// How many times a given option has to have been used before the app will say
// anything about it. Three nights is not proof, but it's enough to stop the
// tool making confident claims off a single good evening.
export const MIN_MOVE_USES = 3;

/**
 * Which options actually move the number, from the user's own record.
 *
 * Only sessions that recorded both ratings can speak to this. A session is
 * credited to every move logged in it — on a night with two, neither gets sole
 * credit, which is honest about what the data can and can't separate.
 */
export function rankMoves(sessions = [], minUses = MIN_MOVE_USES) {
  const list = Array.isArray(sessions) ? sessions.filter(Boolean) : [];
  const byMove = new Map();

  for (const s of list) {
    if (typeof s.intensity !== 'number' || typeof s.intensityAfter !== 'number') continue;
    const drop = s.intensity - s.intensityAfter;
    for (const id of new Set(s.moves || [])) {
      const entry = byMove.get(id) || { id, uses: 0, total: 0 };
      entry.uses += 1;
      entry.total += drop;
      byMove.set(id, entry);
    }
  }

  return [...byMove.values()]
    .filter((e) => e.uses >= minUses)
    .map((e) => ({ id: e.id, uses: e.uses, avgDrop: Math.round((e.total / e.uses) * 10) / 10 }))
    .sort((a, b) => b.avgDrop - a.avgDrop || b.uses - a.uses);
}

/** The single option that has helped most, or null when nothing has earned it. */
export function bestMove(sessions, minUses = MIN_MOVE_USES) {
  const ranked = rankMoves(sessions, minUses);
  return ranked.length > 0 && ranked[0].avgDrop > 0 ? ranked[0] : null;
}

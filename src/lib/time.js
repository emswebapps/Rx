// Wall-clock formatting, shared by every screen in Rx.
//
// This lived in crash/protocol.js when the protocol was the whole feature. It
// isn't any more: the dose rows, the schedule, the supply dates and the history
// grid all print times, and none of them should have to reach into the crash
// tool to do it.
//
// Pure and dependency-free, so `node --test` can run over anything that uses it.

/**
 * "8:42 PM" — the wall-clock time, which is easier to hold onto than a duration
 * when you're about to put the phone down.
 */
export function formatClock(ts) {
  const d = new Date(ts);
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const suffix = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${m} ${suffix}`;
}

/** "Mon 4" — a day label short enough for a grid cell. */
export function formatDayShort(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' });
}

/** "Monday, 4 May" — the heading over one day's detail. */
export function formatDayLong(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

/** "Today" / "Yesterday" / the date, for a row that needs to read at a glance. */
export function formatDayRelative(ts, now = Date.now()) {
  const day = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const diff = Math.round((day(now) - day(ts)) / (24 * 60 * 60 * 1000));
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return formatDayLong(ts);
}

/**
 * A collision-resistant enough id for a single-user app.
 *
 * `crypto.randomUUID` where it exists, and a timestamped random suffix where it
 * doesn't — the ids only ever have to be unique inside one person's document.
 */
export function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

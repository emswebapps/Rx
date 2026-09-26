// My meals: the ones you know work with your medication, and the ones you
// know don't.
//
// Every entry is yours. The app never marks a food safe or unsafe and never
// suggests one — it keeps the list you built (from your prescriber, your
// pharmacist, your own mornings) and puts it in front of you when you're
// choosing what to eat before a dose, which is exactly when looking it up
// again is the thing that doesn't happen.
//
// Pure and Firebase-free so `node --test` can run it.

export const MEAL_STATUS = [
  { key: 'ok', label: 'Works for me' },
  { key: 'avoid', label: 'Avoid' },
];

const key = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');

/** Grams of protein as typed — a positive number, or null for "not given". */
export function grams(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 10) / 10 : null;
}

export function normalizeMeal(m = {}) {
  return {
    id: m.id,
    name: String(m.name || '').trim(),
    status: m.status === 'avoid' ? 'avoid' : 'ok',
    note: String(m.note || ''),
    protein: grams(m.protein),
    createdAt: typeof m.createdAt === 'number' ? m.createdAt : null,
  };
}

/** The approved ones, A–Z — what the pickers offer. */
export function okMeals(list) {
  return (list || []).filter(Boolean).map(normalizeMeal)
    .filter((m) => m.name && m.status === 'ok')
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function avoidMeals(list) {
  return (list || []).filter(Boolean).map(normalizeMeal)
    .filter((m) => m.name && m.status === 'avoid')
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** The saved meal with this name, ignoring case and spacing, if any. */
export function findMeal(list, name) {
  const k = key(name);
  if (!k) return null;
  return (list || []).filter(Boolean).map(normalizeMeal).find((m) => key(m.name) === k) || null;
}

/**
 * Anything on the avoid list that appears in what was typed — "Bagel + OJ"
 * against an avoided "OJ". Word-boundary matching, so "egg" doesn't catch
 * "eggplant"; the list is the user's own words, so their words are what's
 * matched.
 */
export function avoidHits(list, text) {
  const t = ` ${key(text).replace(/[^a-z0-9 ]+/g, ' ')} `;
  if (!t.trim()) return [];
  return avoidMeals(list).filter((m) => {
    const k = key(m.name).replace(/[^a-z0-9 ]+/g, ' ').trim();
    return k && t.includes(` ${k} `);
  });
}

/** A copy of `list` with this meal added, or updated if the name exists. */
export function saveMeal(list, meal, id, now = Date.now()) {
  const m = normalizeMeal(meal);
  if (!m.name) return list || [];
  const existing = findMeal(list, m.name);
  if (existing) {
    return (list || []).map((x) => (x && x.id === existing.id ? { ...x, ...m, id: existing.id, createdAt: existing.createdAt } : x));
  }
  return [...(list || []), { ...m, id, createdAt: now }];
}

/**
 * The protein in something eaten, from the numbers on your own list, or null
 * when the list doesn't say.
 *
 * An exact name wins. Failing that, "StarKist Ranch pouch + crackers" is read
 * as its parts, and adds up only if every part is on the list with a number —
 * a total that quietly left one out would be a number you can't trust.
 */
export function proteinFor(list, food) {
  const whole = findMeal(list, food);
  if (whole) return whole.protein;
  const parts = String(food || '').split(/\s*[+,]\s*/).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  let total = 0;
  for (const p of parts) {
    const m = findMeal(list, p);
    if (!m || m.protein == null) return null;
    total += m.protein;
  }
  return Math.round(total * 10) / 10;
}

/**
 * A day's protein from what was eaten: the sum of what's known, and how many
 * meals had no number to add.
 */
export function proteinTotal(list, foods) {
  let grams = 0;
  let known = 0;
  let unknown = 0;
  for (const f of foods || []) {
    const g = proteinFor(list, f);
    if (g == null) unknown += 1;
    else { grams += g; known += 1; }
  }
  return { grams: Math.round(grams * 10) / 10, known, unknown };
}

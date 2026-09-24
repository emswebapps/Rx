// What each medication looks like: the shape and colour of its icon.
//
// Pure so `node --test` can check the defaults; the drawing lives in
// components/PillShape.jsx. Until a look is picked, the shape follows the form
// and the colour is chosen from the medication's id, so two untouched
// medications still don't look alike.

export const PILL_SHAPES = [
  { key: 'round', label: 'Round' },
  { key: 'oval', label: 'Oval' },
  { key: 'capsule', label: 'Capsule' },
  { key: 'softgel', label: 'Softgel' },
  { key: 'drop', label: 'Liquid' },
  { key: 'patch', label: 'Patch' },
];

export const PILL_COLORS = [
  { key: 'coral', hex: '#f07b6b' },
  { key: 'orange', hex: '#f59e0b' },
  { key: 'yellow', hex: '#facc15' },
  { key: 'green', hex: '#34d399' },
  { key: 'teal', hex: '#2dd4bf' },
  { key: 'blue', hex: '#60a5fa' },
  { key: 'purple', hex: '#a78bfa' },
  { key: 'pink', hex: '#f472b6' },
  { key: 'white', hex: '#f3f4f6' },
  { key: 'brown', hex: '#b45309' },
];

const FORM_SHAPE = { capsule: 'capsule', liquid: 'drop', patch: 'patch' };

function hash(s) {
  let h = 0;
  for (const c of String(s || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

/** The shape and colour to draw for a medication. */
export function pillLook(med) {
  const a = (med && med.appearance) || {};
  const shape = PILL_SHAPES.some((s) => s.key === a.shape) ? a.shape : (FORM_SHAPE[med?.form] || 'round');
  const color = PILL_COLORS.find((c) => c.key === a.color)
    || PILL_COLORS[hash(med?.id || med?.name) % PILL_COLORS.length];
  return { shape, color: color.hex, colorKey: color.key };
}


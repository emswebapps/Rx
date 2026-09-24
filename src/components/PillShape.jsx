/**
 * What a medication looks like on screen.
 *
 * A row of identical coral circles makes the eye read the name every time. A
 * blue capsule and a yellow oval can be told apart at a glance, which is the
 * whole job of an icon on a list you tick off half-awake. The look is chosen
 * on the medication page; until it is, the shape follows the form (a capsule
 * looks like a capsule) and the colour is picked from the medication's id, so
 * two untouched medications still don't look alike.
 */

import { PILL_COLORS } from '../lib/pill.js';

export { PILL_SHAPES, PILL_COLORS, pillLook } from '../lib/pill.js';

const SHADE = 'rgba(0,0,0,0.25)';
const LINE = 'rgba(0,0,0,0.18)';

/** One shape, drawn in a 44×44 box. `dy` offsets it for the drop shadow. */
function Shape({ shape, fill, dy = 0 }) {
  const t = dy ? `translate(0 ${dy})` : undefined;
  switch (shape) {
    case 'oval':
      return (
        <g transform={`${t || ''} rotate(-30 22 22)`}>
          <ellipse cx="22" cy="22" rx="19" ry="11.5" fill={fill} />
          {!dy && <line x1="9" y1="22" x2="35" y2="22" stroke={LINE} strokeWidth="1.5" strokeLinecap="round" />}
        </g>
      );
    case 'capsule':
      return (
        <g transform={`${t || ''} rotate(-35 22 22)`}>
          <path d="M22 14 H13 a8 8 0 0 0 0 16 H22 Z" fill={dy ? fill : fill} />
          <path d="M22 14 H31 a8 8 0 0 1 0 16 H22 Z" fill={dy ? fill : '#f9fafb'} />
          {!dy && <line x1="22" y1="14" x2="22" y2="30" stroke={LINE} strokeWidth="1" />}
        </g>
      );
    case 'softgel':
      return (
        <g transform={t}>
          <ellipse cx="22" cy="22" rx="17" ry="13" fill={fill} opacity={dy ? 1 : 0.92} />
          {!dy && <ellipse cx="16" cy="17" rx="5" ry="3" fill="rgba(255,255,255,0.45)" transform="rotate(-25 16 17)" />}
        </g>
      );
    case 'drop':
      return (
        <g transform={t}>
          <path d="M22 5 C22 5 9 19.5 9 27.5 a13 13 0 0 0 26 0 C35 19.5 22 5 22 5 Z" fill={fill} />
          {!dy && <path d="M16 27 a6 6 0 0 0 4 6" stroke="rgba(255,255,255,0.5)" strokeWidth="2" fill="none" strokeLinecap="round" />}
        </g>
      );
    case 'patch':
      return (
        <g transform={t}>
          <rect x="6" y="6" width="32" height="32" rx="8" fill={fill} />
          {!dy && <rect x="11" y="11" width="22" height="22" rx="5" fill="none" stroke={LINE} strokeWidth="1.5" strokeDasharray="3 2" />}
        </g>
      );
    default:
      return (
        <g transform={t}>
          <circle cx="22" cy="22" r="17" fill={fill} />
          {!dy && <line x1="14" y1="30" x2="30" y2="14" stroke={LINE} strokeWidth="1.5" strokeLinecap="round" />}
        </g>
      );
  }
}

/** The pill itself, no badge — for pickers and anywhere else that needs one. */
export function PillGlyph({ shape = 'round', color = PILL_COLORS[0].hex, size = 44, faded = false }) {
  return (
    <svg width={size} height={size} viewBox="0 0 44 44" aria-hidden="true" style={{ opacity: faded ? 0.45 : 1, flexShrink: 0 }}>
      <Shape shape={shape} fill={SHADE} dy={1.5} />
      <Shape shape={shape} fill={color} />
    </svg>
  );
}

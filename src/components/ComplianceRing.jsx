import { scoreWord } from '../lib/compliance.js';

/**
 * The compliance score as a ring. A plain SVG arc — no chart library on Today.
 */
export function Ring({ score, size = 64, stroke = 7 }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = score == null ? 0 : Math.max(0, Math.min(100, score)) / 100;
  const tone = score == null ? 'var(--border2)'
    : score >= 80 ? 'var(--positive)' : score >= 60 ? 'var(--warn)' : 'var(--danger)';
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img"
      aria-label={score == null ? 'No score yet' : `Compliance ${score} out of 100`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface2)" strokeWidth={stroke} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke={tone} strokeWidth={stroke}
        strokeLinecap="round" strokeDasharray={`${c * pct} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle"
        style={{ fontSize: size * 0.3, fontWeight: 800, fill: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
        {score == null ? '–' : score}
      </text>
    </svg>
  );
}

/** Today's score, the week's, and what went into today's. */
export default function ComplianceCard({ day, summary, onOpen }) {
  const counted = day ? day.parts.filter((p) => p.value != null) : [];
  return (
    <button
      onClick={onOpen}
      className="app-card"
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: '1rem', textAlign: 'left',
        cursor: 'pointer', padding: '0.875rem 1rem',
      }}
    >
      <Ring score={day ? day.score : null} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.06em', color: 'var(--muted)' }}>
          COMPLIANCE TODAY
        </p>
        <p style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text)', marginTop: '0.125rem' }}>
          {day && day.score != null ? scoreWord(day.score) : 'Nothing to score yet'}
          {summary.week != null && (
            <span style={{ fontWeight: 500, color: 'var(--subtle)' }}> · 7-day {summary.week}</span>
          )}
        </p>
        {counted.length > 0 && (
          <p style={{ fontSize: '0.8125rem', color: 'var(--subtle)', marginTop: '0.125rem', lineHeight: 1.4 }}>
            {counted.map((p) => p.detail).join(' · ')}
          </p>
        )}
      </div>
    </button>
  );
}

import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { useNow } from '../lib/useCountdown.js';
import { mergeKit } from '../lib/kit.js';
import { complianceDays, complianceSummary, scoreWord, WEIGHTS, GOOD_DAY } from '../lib/compliance.js';
import { formatDayLong, formatDayShort } from '../lib/time.js';
import { Ring } from '../components/ComplianceRing.jsx';

function tone(score) {
  if (score == null) return 'var(--surface2)';
  if (score >= GOOD_DAY) return 'var(--positive)';
  if (score >= 60) return 'var(--warn)';
  return 'var(--danger)';
}

/**
 * The compliance score over the last thirty days, and what went into each one.
 *
 * Every part is shown with its weight, so the number is never a black box: tap
 * a day and see exactly which part cost it. Parts that didn't apply that day
 * are listed as such rather than hidden, so it's clear they weren't counted
 * against you.
 */
export default function ComplianceHistory() {
  const {
    crashMeds, crashDoses, crashKit, crashSessions, crashBehaviors, rxRoutineRuns, rxWater,
  } = useApp();
  const now = useNow({ tick: 60_000 });
  const days = complianceDays({
    meds: crashMeds, doses: crashDoses, kit: mergeKit(crashKit), sessions: crashSessions,
    behaviors: crashBehaviors, runs: rxRoutineRuns, water: rxWater,
  }, { now });
  const summary = complianceSummary(days);
  const [picked, setPicked] = useState(null);
  const selected = days.find((d) => d.dayTs === picked) || days[days.length - 1];

  return (
    <div>
      <div className="app-card" style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', padding: '1.25rem' }}>
        <Ring score={summary.today} size={88} stroke={9} />
        <div style={{ flex: 1, display: 'grid', gap: '0.375rem' }}>
          <Row label="Last 7 days" value={summary.week} />
          <Row label="Last 30 days" value={summary.month} />
          <Row label={`Days in a row ≥ ${GOOD_DAY}`} value={summary.goodRun} plain />
        </div>
      </div>

      <h2 style={heading}>LAST 30 DAYS</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: '0.3125rem' }}>
        {days.map((d) => (
          <button
            key={d.dayTs}
            onClick={() => setPicked(d.dayTs)}
            aria-label={`${formatDayLong(d.dayTs)}: ${d.score == null ? 'nothing scored' : d.score}`}
            aria-pressed={selected && selected.dayTs === d.dayTs}
            style={{
              aspectRatio: '1', borderRadius: '0.375rem', cursor: 'pointer', padding: 0,
              backgroundColor: tone(d.score),
              border: selected && selected.dayTs === d.dayTs ? '2px solid var(--text)' : '2px solid transparent',
              fontSize: '0.625rem', fontWeight: 800, color: d.score == null ? 'var(--subtle)' : '#fff',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {d.score ?? ''}
          </button>
        ))}
      </div>

      {selected && (
        <div style={{ marginTop: '1.5rem' }}>
          <h2 style={heading}>
            {formatDayShort(selected.dayTs).toUpperCase()}
            {selected.score != null ? ` · ${selected.score} · ${scoreWord(selected.score).toUpperCase()}` : ''}
          </h2>
          <div style={{ display: 'grid', gap: '0.5rem' }}>
            {selected.parts.map((p) => (
              <div key={p.key} className="app-card" style={{ padding: '0.75rem 1rem' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                  <span style={{ flex: 1, fontSize: '0.9375rem', fontWeight: 700, color: p.value == null ? 'var(--subtle)' : 'var(--text)' }}>
                    {p.label}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--subtle)' }}>worth {WEIGHTS[p.key]}</span>
                </div>
                {p.value == null ? (
                  <p style={{ fontSize: '0.8125rem', color: 'var(--subtle)', marginTop: '0.25rem' }}>
                    Didn’t apply — not counted
                  </p>
                ) : (
                  <>
                    <div style={{ height: '0.375rem', borderRadius: '9999px', backgroundColor: 'var(--surface2)', marginTop: '0.5rem', overflow: 'hidden' }}>
                      <div style={{ width: `${Math.round(p.value * 100)}%`, height: '100%', backgroundColor: tone(p.value * 100) }} />
                    </div>
                    <p style={{ fontSize: '0.8125rem', color: 'var(--muted)', marginTop: '0.375rem' }}>{p.detail}</p>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <p style={{ fontSize: '0.75rem', color: 'var(--subtle)', lineHeight: 1.55, marginTop: '1.5rem' }}>
        Doses on time count {WEIGHTS.doses}, following the routine {WEIGHTS.routine}, the water
        goal {WEIGHTS.water}, and checking in around the crash {WEIGHTS.crash}. A late dose counts
        half; a dose you chose to skip isn’t counted at all. Anything still ahead today waits until
        it’s happened.
      </p>
    </div>
  );
}

function Row({ label, value, plain }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline' }}>
      <span style={{ flex: 1, fontSize: '0.8125rem', color: 'var(--muted)' }}>{label}</span>
      <span style={{
        fontSize: '1.125rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums',
        color: plain || value == null ? 'var(--text)' : tone(value),
      }}>
        {value ?? '–'}
      </span>
    </div>
  );
}

const heading = {
  fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.06em',
  color: 'var(--muted)', margin: '1.5rem 0 0.75rem',
};

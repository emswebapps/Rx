import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { useNow } from '../lib/useCountdown.js';
import {
  adherenceDays, adherenceSummary, currentStreak, bestStreak, missesByMed,
  LOOKBACK_DAYS,
} from '../lib/adherence.js';
import { formatClock, formatDayRelative } from '../lib/time.js';

/**
 * Have I actually been taking them?
 *
 * A grid rather than a chart. Thirty cells, one per day, is a shape you read in
 * a second and can point at in an appointment — and unlike the crash pattern
 * chart next door it doesn't need recharts to draw it.
 *
 * The honest caveat is printed at the bottom rather than hidden: medications are
 * edited in place, so re-grading last week uses this week's schedule. Changing a
 * dose time rewrites the past, and the person reading this should know that
 * before they trust a number in it.
 */

const CELL = {
  clean: { bg: 'var(--positive)', label: 'all taken' },
  late: { bg: 'var(--warn)', label: 'taken late' },
  missed: { bg: 'var(--danger)', label: 'missed' },
  pending: { bg: 'var(--surface2)', label: 'still to come' },
  empty: { bg: 'transparent', label: 'nothing scheduled' },
};

function cellKind(day) {
  if (day.expected === 0) return 'empty';
  if (day.missed > 0) return 'missed';
  if (!day.complete) return 'pending';
  if (day.late > 0) return 'late';
  return 'clean';
}

function Stat({ value, label, tone }) {
  return (
    <div style={{ flex: 1, textAlign: 'center' }}>
      <p style={{
        fontSize: '1.75rem', fontWeight: 800, letterSpacing: '-0.02em',
        color: tone || 'var(--text)', fontVariantNumeric: 'tabular-nums',
      }}>
        {value}
      </p>
      <p style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.04em' }}>
        {label}
      </p>
    </div>
  );
}

export default function DoseHistory() {
  const { crashMeds, crashDoses } = useApp();
  const now = useNow({ tick: 60_000, syncKey: `${crashMeds.length}:${crashDoses.length}` });
  const [openDay, setOpenDay] = useState(null);

  const days = adherenceDays(crashMeds, crashDoses, { now });
  const summary = adherenceSummary(days);
  const streak = currentStreak(days);
  const best = bestStreak(days);
  const ranked = missesByMed(days).filter((r) => r.missed > 0 || r.late > 0);

  if (summary.days === 0) {
    return (
      <p style={{ color: 'var(--subtle)', fontSize: '0.9375rem', lineHeight: 1.6, paddingTop: '1rem' }}>
        Once you’ve added a medication and logged a few days, this fills in with
        what actually happened — days on time, days missed, and how long your
        current run is.
      </p>
    );
  }

  const selected = openDay != null ? days.find((d) => d.dayTs === openDay) : null;

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.75rem' }}>
        <Stat value={streak} label="DAY RUN" tone={streak > 0 ? 'var(--positive-text)' : undefined} />
        <Stat
          value={summary.onTimeRate == null ? '—' : `${Math.round(summary.onTimeRate * 100)}%`}
          label="ON TIME"
        />
        <Stat value={summary.missed} label="MISSED" tone={summary.missed > 0 ? 'var(--warn)' : undefined} />
      </div>

      {/* ── The grid ── */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: '0.3125rem',
        marginBottom: '0.875rem',
      }}>
        {days.map((day) => {
          const kind = cellKind(day);
          const on = openDay === day.dayTs;
          return (
            <button
              key={day.dayTs}
              onClick={() => setOpenDay(on ? null : day.dayTs)}
              aria-label={`${formatDayRelative(day.dayTs, now)} — ${CELL[kind].label}`}
              style={{
                aspectRatio: '1', borderRadius: '0.375rem', cursor: 'pointer', padding: 0,
                backgroundColor: CELL[kind].bg,
                border: on ? '2px solid var(--text)'
                  : kind === 'empty' ? '1px dashed var(--border)' : '1px solid transparent',
                opacity: kind === 'pending' ? 0.7 : 1,
              }}
            />
          );
        })}
      </div>

      <div style={{
        display: 'flex', gap: '0.875rem', flexWrap: 'wrap', marginBottom: '1.5rem',
        fontSize: '0.6875rem', color: 'var(--muted)', fontWeight: 600,
      }}>
        {['clean', 'late', 'missed'].map((k) => (
          <span key={k} style={{ display: 'flex', alignItems: 'center', gap: '0.3125rem' }}>
            <span style={{
              width: '0.625rem', height: '0.625rem', borderRadius: '0.1875rem',
              backgroundColor: CELL[k].bg, display: 'inline-block',
            }} />
            {CELL[k].label}
          </span>
        ))}
      </div>

      {/* ── One day, opened ── */}
      {selected && (
        <div className="app-card" style={{ padding: '1rem', marginBottom: '1.5rem' }}>
          <p style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--text)', marginBottom: '0.625rem' }}>
            {formatDayRelative(selected.dayTs, now)}
          </p>
          {selected.expected === 0 ? (
            <p style={{ fontSize: '0.8125rem', color: 'var(--subtle)' }}>Nothing was scheduled.</p>
          ) : (
            <div style={{ display: 'grid', gap: '0.5rem' }}>
              {selected.entries.map((e) => (
                <div key={e.medId} style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                  <span style={{ flex: 1, fontSize: '0.875rem', color: 'var(--text)', fontWeight: 600 }}>
                    {e.med.name || 'Untitled'}
                  </span>
                  <span style={{
                    fontSize: '0.8125rem', fontWeight: 700,
                    color: e.state === 'taken' ? (e.late ? 'var(--warn)' : 'var(--positive-text)')
                      : e.state === 'skipped' ? 'var(--danger)' : 'var(--subtle)',
                  }}>
                    {e.state === 'taken' ? `${formatClock(e.dose.takenAt)}${e.late ? ' · late' : ''}`
                      : e.state === 'skipped' ? 'Not logged'
                      : 'Still to come'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Which one gets forgotten ── */}
      {ranked.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <h2 style={{
            fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.06em',
            color: 'var(--muted)', marginBottom: '0.75rem',
          }}>
            THE ONES THAT SLIP
          </h2>
          <div style={{ display: 'grid', gap: '0.5rem' }}>
            {ranked.map((r) => (
              <div key={r.medId} style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                <span style={{ flex: 1, fontSize: '0.875rem', color: 'var(--text)', fontWeight: 600 }}>
                  {r.med.name || 'Untitled'}
                </span>
                <span style={{ fontSize: '0.8125rem', color: 'var(--subtle)', fontWeight: 600 }}>
                  {r.missed > 0 && `${r.missed} missed`}
                  {r.missed > 0 && r.late > 0 && ' · '}
                  {r.late > 0 && `${r.late} late`}
                  {` of ${r.expected}`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {best > streak && (
        <p style={{ fontSize: '0.8125rem', color: 'var(--subtle)', marginBottom: '1rem' }}>
          Your best run in this stretch was {best} days.
        </p>
      )}

      <p style={{ fontSize: '0.75rem', color: 'var(--subtle)', lineHeight: 1.5 }}>
        The last {LOOKBACK_DAYS} days, worked out against the schedule you have
        set <em>now</em> — there’s no record of what it used to be, so changing a
        dose time re-reads the past as well as the future.
      </p>
    </div>
  );
}

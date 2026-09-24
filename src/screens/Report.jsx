import { useState } from 'react';
import { Printer } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useBack } from '../lib/useBack.js';
import { mergeKit } from '../lib/kit.js';
import {
  activeMeds, formatAmount, doseSpacing, countMismatches, formatCountDiff, formatHalfLife, DAY_LABELS,
} from '../lib/meds.js';
import { adherenceDays, adherenceSummary, currentStreak } from '../lib/adherence.js';
import { complianceDays, complianceSummary } from '../lib/compliance.js';
import { suggestedOnsetForMed, formatHours } from '../lib/window.js';
import { effectCurve, peakAndDrop, sideEffectCounts } from '../lib/effects.js';
import { signTimings } from '../lib/behaviors.js';
import { notesForMed, pinnedNotes } from '../lib/notes.js';
import { mealLog } from '../lib/meals.js';
import { formatClock, formatDayLong } from '../lib/time.js';
import { ViewHeader, pageStyle } from '../components/medsUi.jsx';

const DAY_MS = 24 * 60 * 60 * 1000;
const pct = (x) => (x == null ? '–' : `${Math.round(x * 100)}%`);

/**
 * One page for an appointment: what's prescribed, whether it's being taken,
 * how it actually behaves, and what it costs — over the last thirty days, in
 * the user's own numbers and words.
 *
 * Built to be printed or saved as a PDF from the browser's print dialogue;
 * the nav and the buttons don't print. Crash-session details are the most
 * private thing in the app, so they're left out unless switched on.
 */
export default function Report() {
  const app = useApp();
  const { crashMeds, crashDoses, crashSessions, crashBehaviors, rxEffects, rxNotes, rxRoutineRuns, rxWater } = app;
  const back = useBack('/setup');
  const kit = mergeKit(app.crashKit);
  const [showCrash, setShowCrash] = useState(false);
  const now = Date.now();
  const since = now - 30 * DAY_MS;

  const meds = activeMeds(crashMeds);
  const days = adherenceDays(crashMeds, crashDoses, { now });
  const adh = adherenceSummary(days);
  const skipped = days.reduce((n, d) => n + d.chosen, 0);
  const comp = complianceSummary(complianceDays({
    meds: crashMeds, doses: crashDoses, kit, sessions: crashSessions,
    behaviors: crashBehaviors, runs: rxRoutineRuns, water: rxWater,
  }, { now }));
  const sides = sideEffectCounts(rxEffects, since);
  const sessions = crashSessions.filter((s) => s && s.startedAt >= since);
  const signs = signTimings(crashBehaviors, crashSessions, crashDoses, kit.warningSigns).slice(0, 4);
  const pinned = pinnedNotes(rxNotes).filter((n) => n.text.trim());

  return (
    <div className="app-page report" style={pageStyle}>
      <div className="no-print">
        <ViewHeader title="Doctor visit report" onBack={back} />
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
          <button onClick={() => window.print()} className="app-btn-primary" style={{ flex: 1 }}>
            <Printer size={16} style={{ verticalAlign: '-3px', marginRight: '0.375rem' }} />
            Print / Save as PDF
          </button>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', color: 'var(--muted)', marginBottom: '1.5rem' }}>
          <input type="checkbox" checked={showCrash} onChange={(e) => setShowCrash(e.target.checked)} style={{ accentColor: 'var(--accent)' }} />
          Include crash sessions and warning signs (private — off by default)
        </label>
      </div>

      <header style={{ marginBottom: '1.25rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text)' }}>Medication summary</h1>
        <p style={{ fontSize: '0.875rem', color: 'var(--muted)' }}>
          {formatDayLong(since)} – {formatDayLong(now)} · self-recorded in Rx
        </p>
      </header>

      <Section title="Medications">
        {meds.length === 0 ? <p style={body}>None listed.</p> : meds.map((m) => {
          const learned = suggestedOnsetForMed(crashSessions, crashDoses, m.id);
          const shape = peakAndDrop(effectCurve(rxEffects, crashDoses, m.id));
          const miss = countMismatches(m).filter((c) => c.at >= since);
          const days7 = m.schedule.days.length === 7 ? 'every day' : m.schedule.days.map((d) => DAY_LABELS[d]).join(', ');
          return (
            <div key={m.id} style={{ marginBottom: '1rem', breakInside: 'avoid' }}>
              <p style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text)' }}>
                {m.name || 'Untitled'}{m.strength ? ` ${m.strength}` : ''}
              </p>
              <ul style={list}>
                <li>
                  {m.schedule.times.map((t) => `${formatAmount(t.amount, m.form)} ${t.mode === 'clock' ? `at ${t.time}` : `${t.offsetHours}h after another`}`).join(', ')}
                  {' · '}{days7}
                  {doseSpacing(m) === 'wearOff' && m.schedule.times.length > 1 ? ' · later doses taken as the previous wears off' : ''}
                </li>
                {formatHalfLife(m.halfLifeHours) && <li>Half-life (as entered): {formatHalfLife(m.halfLifeHours)}</li>}
                <li>
                  Wears off: {formatHours(m.onsetHours)} after a dose (my setting)
                  {learned ? `; crashes started ~${formatHours(learned.hours)} after (${learned.samples} sessions)` : ''}
                  {shape ? `; focus peaks ~${formatHours(shape.peakHours)}${shape.dropHours != null ? `, drops by ~${formatHours(shape.dropHours)}` : ''} (${shape.samples} check-ins)` : ''}
                </li>
                {miss.length > 0 && (
                  <li>Pill counts that didn’t match: {miss.map((c) => `${formatCountDiff(c.diff)} (${new Date(c.at).toLocaleDateString()})`).join(', ')}</li>
                )}
                {(() => {
                  const meals = mealLog(crashMeds, crashDoses, rxRoutineRuns, rxEffects)
                    .filter((r) => r.medId === m.id && r.ateAt >= since);
                  if (meals.length === 0) return null;
                  const counts = new Map();
                  for (const r of meals) counts.set(r.food, (counts.get(r.food) || 0) + 1);
                  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
                  return <li>Eaten before doses: {top.map(([f, n]) => `${f} (${n}×)`).join(', ')}</li>;
                })()}
                {notesForMed(rxNotes, m.id).slice(0, 4).map((n) => <li key={n.id}>Note: {n.text}</li>)}
              </ul>
            </div>
          );
        })}
      </Section>

      <Section title="Taking it — last 30 days">
        <Grid items={[
          ['Doses taken', adh.expected ? `${adh.taken} of ${adh.expected}` : '–'],
          ['On time', pct(adh.onTimeRate)],
          ['Late', adh.late],
          ['Missed', adh.missed],
          ['Skipped on purpose', skipped],
          ['Current run', `${currentStreak(days)} days`],
          ['Compliance (30 days)', comp.month ?? '–'],
          ['Compliance (7 days)', comp.week ?? '–'],
        ]} />
      </Section>

      <Section title="Side effects — from check-ins">
        {sides.items.length === 0 ? (
          <p style={body}>{sides.checkIns ? `None reported in ${sides.checkIns} check-ins.` : 'No check-ins recorded.'}</p>
        ) : (
          <ul style={list}>
            {sides.items.map((s) => <li key={s.id}>{s.label}: {s.count} of {sides.checkIns} check-ins</li>)}
          </ul>
        )}
      </Section>

      {showCrash && (
        <Section title="When it wears off (crash sessions)">
          <ul style={list}>
            <li>{sessions.length} sessions in the last 30 days
              {sessions.length > 0 ? `, usually starting around ${formatClock(medianTime(sessions))}` : ''}.</li>
            {signs.map((s) => <li key={s.signId}>First sign “{s.text}” ~{formatHours(s.hours)} after a dose ({s.count}×)</li>)}
          </ul>
        </Section>
      )}

      {pinned.length > 0 && (
        <Section title="Things I want to mention">
          <ul style={list}>{pinned.slice(0, 6).map((n) => <li key={n.id}>{n.text}</li>)}</ul>
        </Section>
      )}

      <p style={{ fontSize: '0.75rem', color: 'var(--subtle)', lineHeight: 1.5, marginTop: '1.5rem' }}>
        Everything here was logged by me in a personal tracking app; timings are my own settings and
        observations, not measurements. Adherence is judged against my current schedule.
      </p>
    </div>
  );
}

/** Time of day most sessions start at — the median clock time, not the date. */
function medianTime(sessions) {
  const mins = sessions.map((s) => { const d = new Date(s.startedAt); return d.getHours() * 60 + d.getMinutes(); }).sort((a, b) => a - b);
  const m = mins[Math.floor(mins.length / 2)];
  const d = new Date();
  d.setHours(Math.floor(m / 60), m % 60, 0, 0);
  return d.getTime();
}

function Section({ title, children }) {
  return (
    <section style={{ marginBottom: '1.5rem', breakInside: 'avoid' }}>
      <h2 style={{
        fontSize: '0.8125rem', fontWeight: 800, letterSpacing: '0.06em', color: 'var(--muted)',
        textTransform: 'uppercase', borderBottom: '1px solid var(--border)', paddingBottom: '0.375rem', marginBottom: '0.625rem',
      }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Grid({ items }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem 1rem' }}>
      {items.map(([label, value]) => (
        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', fontSize: '0.875rem' }}>
          <span style={{ color: 'var(--muted)' }}>{label}</span>
          <strong style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{value}</strong>
        </div>
      ))}
    </div>
  );
}

const body = { fontSize: '0.875rem', color: 'var(--muted)' };
const list = { margin: '0.25rem 0 0 1.125rem', padding: 0, fontSize: '0.875rem', color: 'var(--text)', lineHeight: 1.55, listStyle: 'disc' };

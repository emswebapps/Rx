import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { activeMeds } from '../lib/meds.js';
import { effectCurve, peakAndDrop, sideEffectCounts, SIDE_EFFECTS, MIN_CURVE_SAMPLES } from '../lib/effects.js';
import { formatHours } from '../lib/window.js';
import { formatClock, formatDayRelative } from '../lib/time.js';
import { Segmented } from '../components/medsUi.jsx';
import { mealLog, focusByFood } from '../lib/meals.js';
import { doseTimings, timingByFood, formatMinutes } from '../lib/onset.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Your own effect curve: average focus and mood by hours since the dose, from
 * your check-ins. Plain divs, for the same reason as the crash chart next
 * door — CSS variables don't reach SVG fills, and recharts isn't worth its
 * weight for one row of bars.
 */
export default function EffectsHistory() {
  const { crashMeds, crashDoses, rxEffects, deleteEffect, rxRoutineRuns } = useApp();
  const meds = activeMeds(crashMeds);
  const [medId, setMedId] = useState(meds[0]?.id || null);
  const med = meds.find((m) => m.id === medId) || meds[0] || null;

  if (!med) {
    return <p style={{ color: 'var(--subtle)', fontSize: '0.9375rem' }}>Add a medication to start checking in.</p>;
  }

  const curve = effectCurve(rxEffects, crashDoses, med.id);
  const shape = peakAndDrop(curve);
  const sides = sideEffectCounts(rxEffects.filter((e) => !e.medId || e.medId === med.id), Date.now() - 30 * DAY_MS);
  const recent = rxEffects.filter((e) => !e.dismissed && (!e.medId || e.medId === med.id)).slice(0, 12);
  const samples = curve.reduce((n, b) => n + b.n, 0);
  const maxHours = Math.max(8, ...curve.map((b) => b.hours + 0.5));
  const bins = Array.from({ length: maxHours * 2 }, (_, i) => curve.find((b) => b.hours === i / 2) || { hours: i / 2, focus: null, mood: null, n: 0 });

  return (
    <div>
      {meds.length > 1 && (
        <Segmented
          options={meds.map((m) => ({ key: m.id, label: m.name || 'Untitled' }))}
          value={med.id}
          onChange={setMedId}
          style={{ marginBottom: '1.25rem' }}
        />
      )}

      <div className="app-card" style={{ padding: '1rem' }}>
        <p style={heading}>FOCUS BY HOURS AFTER THE DOSE</p>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: '6rem' }}>
          {bins.map((b) => (
            <div key={b.hours} style={{ flex: 1, height: '100%', display: 'flex', alignItems: 'flex-end' }}>
              <div
                title={b.focus == null ? `${b.hours}h — no check-ins` : `${b.hours}h — focus ${b.focus} (${b.n})`}
                style={{
                  width: '100%', borderRadius: '2px',
                  height: b.focus == null ? '2px' : `${(b.focus / 5) * 100}%`,
                  backgroundColor: b.focus == null ? 'var(--border)'
                    : shape && b.hours + 0.25 === shape.peakHours ? 'var(--accent)' : 'var(--accent-soft)',
                }}
              />
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '2px', marginTop: '0.375rem' }}>
          {bins.map((b) => (
            <div key={b.hours} style={{ flex: 1, textAlign: 'center', fontSize: '0.5625rem', color: 'var(--subtle)' }}>
              {Number.isInteger(b.hours) && b.hours % 2 === 0 ? `${b.hours}h` : ''}
            </div>
          ))}
        </div>
        <p style={{ fontSize: '0.875rem', color: 'var(--muted)', lineHeight: 1.5, marginTop: '0.75rem' }}>
          {shape ? (
            <>
              Peaks about <strong style={{ color: 'var(--text)' }}>{formatHours(shape.peakHours)}</strong> after you take it
              {shape.dropHours != null && (
                <>, and focus drops by about <strong style={{ color: 'var(--text)' }}>{formatHours(shape.dropHours)}</strong></>
              )}
              . From {shape.samples} check-ins.
            </>
          ) : `${samples} of ${MIN_CURVE_SAMPLES} check-ins so far — the curve fills in as you answer the ones on Today.`}
        </p>
        {shape?.dropHours != null && Math.abs(shape.dropHours - med.onsetHours) >= 0.5 && (
          <p style={{ fontSize: '0.8125rem', color: 'var(--accent-text)', lineHeight: 1.5, marginTop: '0.375rem' }}>
            Your medication page says it wears off at {formatHours(med.onsetHours)}. Your check-ins say closer to {formatHours(shape.dropHours)}.
          </p>
        )}
      </div>

      <OnsetSection rows={doseTimings(crashMeds, crashDoses, rxRoutineRuns).filter((r) => r.medId === med.id)} />

      <MealsSection rows={mealLog(crashMeds, crashDoses, rxRoutineRuns, rxEffects).filter((r) => r.medId === med.id)} />

      <p style={{ ...heading, marginTop: '1.5rem' }}>SIDE EFFECTS · LAST 30 DAYS</p>
      {sides.items.length === 0 ? (
        <p style={{ fontSize: '0.875rem', color: 'var(--subtle)' }}>None ticked in {sides.checkIns} check-ins.</p>
      ) : (
        <div style={{ display: 'grid', gap: '0.375rem' }}>
          {sides.items.map((s) => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
              <span style={{ width: '7.5rem', fontSize: '0.875rem', color: 'var(--text)' }}>{s.label}</span>
              <div style={{ flex: 1, height: '0.5rem', borderRadius: '9999px', backgroundColor: 'var(--surface2)', overflow: 'hidden' }}>
                <div style={{ width: `${(s.count / sides.checkIns) * 100}%`, height: '100%', backgroundColor: 'var(--warn)' }} />
              </div>
              <span style={{ fontSize: '0.8125rem', color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
                {s.count}/{sides.checkIns}
              </span>
            </div>
          ))}
        </div>
      )}

      {recent.length > 0 && (
        <>
          <p style={{ ...heading, marginTop: '1.5rem' }}>RECENT CHECK-INS</p>
          <div style={{ display: 'grid', gap: '0.375rem' }}>
            {recent.map((e) => (
              <div key={e.id} className="app-card" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.625rem 0.875rem' }}>
                <span style={{ flex: 1, fontSize: '0.8125rem', color: 'var(--text)', lineHeight: 1.4 }}>
                  <strong>{formatDayRelative(e.at)} {formatClock(e.at)}</strong>
                  {' · '}
                  {[e.focus && `focus ${e.focus}`, e.mood && `mood ${e.mood}`, e.appetite && `appetite ${e.appetite}`]
                    .filter(Boolean).join(', ')}
                  {(e.sideEffects || []).length > 0 && (
                    <span style={{ color: 'var(--warn)' }}>
                      {' · '}{e.sideEffects.map((id) => SIDE_EFFECTS.find((s) => s.id === id)?.label || id).join(', ')}
                    </span>
                  )}
                </span>
                <button onClick={() => deleteEffect(e.id)} aria-label="Delete this check-in" style={{
                  background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: '0.25rem',
                }}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * When each dose kicked in and dropped off, from the two taps on Today, and
 * the same side by side by what was eaten with it. Middle values, so one odd
 * morning doesn't swing the comparison.
 */
function OnsetSection({ rows }) {
  const byFood = timingByFood(rows);
  return (
    <>
      <p style={{ ...heading, marginTop: '1.5rem' }}>KICKED IN · DROPPED OFF</p>
      {rows.length === 0 ? (
        <p style={{ fontSize: '0.875rem', color: 'var(--subtle)', lineHeight: 1.5 }}>
          After a dose, Today asks “Felt it kick in?” and then “Feel it dropping off?”. One tap each, at the
          moment you feel it, and the minutes show up here.
        </p>
      ) : (
        <>
          <div className="app-card" style={{ padding: '0.75rem 1rem', marginBottom: '0.625rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.75rem', color: 'var(--muted)', marginBottom: '0.25rem' }}>
              <span style={{ flex: 1 }}>Eaten with the dose</span>
              <span style={{ width: '4.5rem', textAlign: 'right' }}>Kicked in</span>
              <span style={{ width: '4.5rem', textAlign: 'right' }}>Dropped off</span>
            </div>
            {byFood.map((f) => (
              <div key={f.food || 'none'} style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', fontSize: '0.875rem', padding: '0.125rem 0' }}>
                <span style={{ flex: 1, minWidth: 0, color: f.food ? 'var(--text)' : 'var(--subtle)' }}>
                  {f.food || 'No meal logged'}
                  <span style={{ color: 'var(--subtle)', fontSize: '0.75rem' }}> · {f.n} {f.n === 1 ? 'dose' : 'doses'}</span>
                </span>
                <strong style={{ width: '4.5rem', textAlign: 'right', color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{formatMinutes(f.kickMin)}</strong>
                <strong style={{ width: '4.5rem', textAlign: 'right', color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{formatMinutes(f.dropMin)}</strong>
              </div>
            ))}
            <p style={{ fontSize: '0.75rem', color: 'var(--subtle)', marginTop: '0.375rem' }}>
              Both counted from when you took it. Middle value where there’s more than one.
            </p>
          </div>
          <div style={{ display: 'grid', gap: '0.375rem' }}>
            {rows.slice(0, 14).map((r) => (
              <div key={r.doseId} className="app-card" style={{ padding: '0.625rem 0.875rem' }}>
                <p style={{ fontSize: '0.875rem', color: 'var(--text)', fontWeight: 600 }}>
                  {r.kickMin != null ? `Kicked in after ${formatMinutes(r.kickMin)}` : 'Kick-in not tapped'}
                  {r.dropMin != null ? ` · dropped off at ${formatMinutes(r.dropMin)}` : ''}
                </p>
                <p style={{ fontSize: '0.75rem', color: 'var(--subtle)', marginTop: '0.125rem' }}>
                  {formatDayRelative(r.takenAt)} · taken {formatClock(r.takenAt)}
                  {r.food ? ` · ${r.food}` : ' · no meal logged'}
                  {r.foodGapMin != null && r.food ? ` (${r.foodGapMin >= 0 ? `${r.foodGapMin} min after` : `${-r.foodGapMin} min before`})` : ''}
                </p>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

/**
 * What you ate before this medication, and — where there's a check-in to go
 * on — how focused that dose left you. Just your own numbers side by side.
 */
function MealsSection({ rows }) {
  const byFood = focusByFood(rows);
  if (rows.length === 0) {
    return (
      <>
        <p style={{ ...heading, marginTop: '1.5rem' }}>MEALS WITH DOSES</p>
        <p style={{ fontSize: '0.875rem', color: 'var(--subtle)', lineHeight: 1.5 }}>
          Add a meal step to this medication’s routine (Meds → the dose time → Routine) and each one you tick off shows up here.
        </p>
      </>
    );
  }
  return (
    <>
      <p style={{ ...heading, marginTop: '1.5rem' }}>MEALS WITH DOSES</p>
      {byFood.length > 0 && (
        <div className="app-card" style={{ padding: '0.75rem 1rem', marginBottom: '0.625rem' }}>
          <p style={{ fontSize: '0.8125rem', color: 'var(--muted)', marginBottom: '0.375rem' }}>Average focus after each meal</p>
          {byFood.map((f) => (
            <div key={f.food} style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', fontSize: '0.875rem', padding: '0.125rem 0' }}>
              <span style={{ flex: 1, color: 'var(--text)' }}>{f.food}</span>
              <strong style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{f.focus}</strong>
              <span style={{ color: 'var(--subtle)', fontSize: '0.75rem' }}>/5 · {f.n} doses</span>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'grid', gap: '0.375rem' }}>
        {rows.slice(0, 14).map((r) => (
          <div key={r.id} className="app-card" style={{ padding: '0.625rem 0.875rem' }}>
            <p style={{ fontSize: '0.875rem', color: 'var(--text)', fontWeight: 600 }}>
              {r.food}
              {r.changed && <span style={{ color: 'var(--subtle)', fontWeight: 400 }}> (instead of {r.planned})</span>}
            </p>
            <p style={{ fontSize: '0.75rem', color: 'var(--subtle)', marginTop: '0.125rem' }}>
              {formatDayRelative(r.ateAt)} {formatClock(r.ateAt)} · dose {r.doseNumber}
              {r.minutesBefore == null ? ' · no dose logged'
                : r.minutesBefore >= 0 ? ` taken ${r.minutesBefore} min later`
                  : ` taken ${-r.minutesBefore} min before`}
              {r.focus != null ? ` · focus ${r.focus}/5` : ''}
            </p>
          </div>
        ))}
      </div>
    </>
  );
}

const heading = {
  fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.06em', color: 'var(--muted)', marginBottom: '0.75rem',
};

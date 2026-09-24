import { useState } from 'react';
import { Check, Hourglass, Pill as PillGlyph, Lock, Utensils } from 'lucide-react';
import { useNow } from '../lib/useCountdown.js';
import { formatClock } from '../lib/time.js';
import { routineState, formatCountdown } from '../lib/routine.js';
import MealChips, { AvoidWarning } from './MealChips.jsx';
import { useApp } from '../context/AppContext';
import { findMeal, avoidHits } from '../lib/mealLibrary.js';

/**
 * The routine around one dose, on Today.
 *
 * Steps read top to bottom in the order they're done, so the same morning
 * looks the same every morning. The one to do now is picked out; a wait that
 * is counting down is the biggest thing on the card, because "how long until
 * I can take it" is the only question while it's running.
 *
 * Checking a task is one tap and undoing it is another. The dose step is the
 * dose card's own Take — tapping it goes through the same path, so there is
 * one record of having taken something.
 */
export default function RoutineCard({ routine, when, onToggleStep, onTake, onOpenDose, onAte }) {
  const waiting = routine.steps.some((s) => s.state === 'waiting');
  // A second-by-second clock only while a wait is actually running.
  const now = useNow({ tick: 1000, active: waiting && when === 'today' });
  const live = waiting && when === 'today'
    ? routineState(routine.steps, routine.run, routine.entry.entry, now)
    : routine;
  const readOnly = when !== 'today';
  const doneCount = live.steps.filter((s) => s.state === 'done').length;

  return (
    <div
      className="app-card"
      style={{ padding: '0.5rem 0.875rem', borderColor: live.current ? 'var(--accent-soft)' : undefined }}
    >
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.125rem' }}>
        <p style={{ flex: 1, fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.06em', color: 'var(--muted)' }}>
          ROUTINE
        </p>
        <p style={{
          fontSize: '0.75rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums',
          color: live.complete ? (live.followed ? 'var(--positive-text)' : 'var(--warn)') : 'var(--subtle)',
        }}>
          {live.complete
            ? (live.followed ? 'Followed exactly' : 'Done, not quite in order')
            : `${doneCount} of ${live.steps.length}`}
        </p>
      </div>

      <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 0 }}>
        {live.steps.map((step, i) => (
          <Step
            key={step.id}
            step={step}
            last={i === live.steps.length - 1}
            now={now}
            readOnly={readOnly}
            medName={routine.entry.med.name}
            onToggle={() => onToggleStep(step.id, step.state === 'done' ? null : Date.now())}
            onAte={onAte ? (text) => onAte(step.id, text) : null}
            onTake={onTake}
            onOpenDose={onOpenDose}
          />
        ))}
      </ol>
    </div>
  );
}

function Marker({ step }) {
  const done = step.state === 'done';
  const current = step.state === 'active' || step.state === 'waiting';
  const Icon = step.kind === 'wait' ? Hourglass : step.kind === 'dose' ? PillGlyph : step.kind === 'meal' ? Utensils : null;
  return (
    <span style={{
      width: '1.375rem', height: '1.375rem', borderRadius: '9999px', flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      backgroundColor: done ? 'var(--positive)' : current ? 'var(--accent)' : 'transparent',
      border: done || current ? 'none' : '2px solid var(--border2)',
      color: done || current ? '#fff' : 'var(--subtle)',
    }}>
      {done ? <Check size={13} strokeWidth={3} /> : Icon ? <Icon size={11} strokeWidth={2.5} /> : null}
    </span>
  );
}

function Step({ step, now, readOnly, medName, onToggle, onTake, onOpenDose, onAte }) {
  const done = step.state === 'done';
  const locked = step.state === 'locked';
  const faded = locked ? 0.55 : 1;

  if (step.kind === 'wait') {
    const running = step.state === 'waiting';
    return (
      <li style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.25rem 0', opacity: faded }}>
        <Marker step={step} />
        <div style={{ flex: 1, minWidth: 0 }}>
          {running ? (
            <>
              <p
                aria-live="polite"
                style={{
                  // The big countdown lives at the top of Today; this is the
                  // same clock, in its place in the routine.
                  fontSize: '1.25rem', fontWeight: 800, lineHeight: 1.1, color: 'var(--accent-text)',
                  fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em',
                }}
              >
                {formatCountdown(step.endsAt - now)}
              </p>
              <p style={{ fontSize: '0.8125rem', color: 'var(--subtle)', marginTop: '0.125rem' }}>
                Wait {step.minutes} min · ends {formatClock(step.endsAt)} · we’ll buzz you
              </p>
            </>
          ) : (
            <p style={{ fontSize: '0.875rem', fontWeight: 600, color: done ? 'var(--subtle)' : 'var(--text)' }}>
              {!done ? `Wait ${step.minutes} min`
                : step.endsAt != null && step.doneAt < step.endsAt
                  ? `Wait cut short — ${Math.max(0, Math.round((step.endsAt - step.doneAt) / 60000))} min left on it`
                  : `Waited ${step.minutes} min`}
            </p>
          )}
        </div>
      </li>
    );
  }

  if (step.kind === 'dose') {
    const skipped = step.state === 'skipped';
    return (
      <li style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.25rem 0', opacity: skipped ? 0.55 : 1 }}>
        <Marker step={step} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            fontSize: '0.875rem', fontWeight: 700,
            color: done ? 'var(--subtle)' : 'var(--text)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            Take {medName || 'it'}
          </p>
          {done && (
            <p style={{ fontSize: '0.8125rem', color: step.early ? 'var(--warn)' : 'var(--subtle)' }}>
              {formatClock(step.doneAt)}{step.early ? ' · before the wait was up' : ''}
            </p>
          )}
          {skipped && <p style={{ fontSize: '0.8125rem', color: 'var(--subtle)' }}>Skipped</p>}
        </div>
        {!readOnly && !done && !skipped && (
          step.state === 'active' ? (
            <button
              onClick={onTake}
              className="app-btn-primary"
              style={{ padding: '0.5rem 1.125rem', fontSize: '0.9375rem' }}
            >
              Take now
            </button>
          ) : (
            <button
              onClick={onOpenDose}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.3125rem',
                padding: '0.5rem 0.75rem', borderRadius: '9999px', cursor: 'pointer',
                background: 'var(--surface2)', border: '1px solid var(--border)',
                fontSize: '0.8125rem', fontWeight: 600, color: 'var(--muted)',
              }}
            >
              <Lock size={13} /> Not yet
            </button>
          )
        )}
      </li>
    );
  }

  if (step.kind === 'meal') {
    return <MealStep step={step} readOnly={readOnly} faded={faded} onToggle={onToggle} onAte={onAte} />;
  }

  // A task.
  return (
    <li>
      <button
        onClick={readOnly ? undefined : onToggle}
        disabled={readOnly}
        aria-pressed={done}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: '0.75rem',
          padding: '0.25rem 0', background: 'none', border: 'none', textAlign: 'left',
          cursor: readOnly ? 'default' : 'pointer', opacity: faded,
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <Marker step={step} />
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{
            display: 'block', fontSize: '0.875rem', fontWeight: 600,
            color: done ? 'var(--subtle)' : 'var(--text)',
            textDecoration: done ? 'line-through' : 'none',
          }}>
            {step.text}
          </span>
          {done && (
            <span style={{ display: 'block', fontSize: '0.8125rem', color: step.early ? 'var(--warn)' : 'var(--subtle)' }}>
              {formatClock(step.doneAt)}{step.early ? ' · before the wait was up' : ''}
            </span>
          )}
        </span>
        {!readOnly && !done && step.state === 'active' && (
          <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--accent-text)' }}>Tap when done</span>
        )}
      </button>
    </li>
  );
}

/**
 * A meal: one tap says "ate it, as planned". If it wasn't what the routine
 * says — a bagel instead of two eggs — "Had something else?" records what it
 * actually was, because that's the difference worth seeing later.
 */
function MealStep({ step, readOnly, faded, onToggle, onAte }) {
  const done = step.state === 'done';
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(step.ate || '');
  const save = (value = text) => { onAte?.(value); setEditing(false); };
  const { rxMeals, saveRxMeal } = useApp();
  const eaten = done ? (step.ate || step.text) : step.text;
  // Offer to approve what was eaten — but never something with an avoided
  // item in it; that would put it on the "works for me" list by accident.
  const unsaved = done && step.ate && !findMeal(rxMeals, step.ate) && avoidHits(rxMeals, step.ate).length === 0;

  return (
    <li>
      <button
        onClick={readOnly ? undefined : onToggle}
        disabled={readOnly}
        aria-pressed={done}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: '0.75rem',
          padding: '0.25rem 0', background: 'none', border: 'none', textAlign: 'left',
          cursor: readOnly ? 'default' : 'pointer', opacity: faded,
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <Marker step={step} />
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{
            display: 'block', fontSize: '0.875rem', fontWeight: 600,
            color: done ? 'var(--subtle)' : 'var(--text)',
          }}>
            {done && step.ate ? step.ate : step.text}
          </span>
          {done && (
            <span style={{ display: 'block', fontSize: '0.8125rem', color: step.early ? 'var(--warn)' : 'var(--subtle)' }}>
              Ate at {formatClock(step.doneAt)}
              {step.ate ? ` · instead of ${step.text}` : ''}
              {step.early ? ' · before the wait was up' : ''}
            </span>
          )}
        </span>
        {!readOnly && !done && step.state === 'active' && (
          <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--accent-text)' }}>Tap when eaten</span>
        )}
      </button>

      <div style={{ marginLeft: '2.125rem' }}><AvoidWarning text={eaten} /></div>

      {done && !readOnly && onAte && (editing ? (
        <div style={{ margin: '0.25rem 0 0.25rem 2.125rem' }}>
          <MealChips selected={text} onPick={(name) => save(name)} max={8} />
        </div>
      ) : null)}

      {done && !readOnly && onAte && (editing ? (
        <div style={{ display: 'flex', gap: '0.375rem', margin: '0.125rem 0 0.25rem 2.125rem' }}>
          <input
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
            placeholder="What did you have?"
            className="app-input"
            style={{ flex: 1, minWidth: 0, padding: '0.4375rem 0.625rem', fontSize: '0.875rem' }}
          />
          <button onClick={() => save()} className="app-btn-primary" style={{ width: 'auto', flex: 'none', padding: '0.4375rem 0.875rem', fontSize: '0.8125rem' }}>
            Save
          </button>
        </div>
      ) : (
        <button
          onClick={() => { setText(step.ate || ''); setEditing(true); }}
          style={{
            margin: '0 0 0.25rem 2.125rem', padding: 0, background: 'none', border: 'none', cursor: 'pointer',
            fontSize: '0.8125rem', fontWeight: 700, color: 'var(--accent-text)',
          }}
        >
          {step.ate ? 'Change what I had' : 'Had something else?'}
        </button>
      ))}

      {unsaved && !editing && !readOnly && (
        <button
          onClick={() => saveRxMeal({ name: step.ate, status: 'ok' })}
          style={{
            margin: '0 0 0.25rem 2.125rem', padding: 0, background: 'none', border: 'none', cursor: 'pointer',
            fontSize: '0.8125rem', fontWeight: 700, color: 'var(--muted)', display: 'block',
          }}
        >
          + Save “{step.ate}” to my meals
        </button>
      )}
    </li>
  );
}


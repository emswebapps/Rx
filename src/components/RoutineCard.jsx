import { Check, Hourglass, Pill, Utensils, ChevronRight } from 'lucide-react';
import { useNow } from '../lib/useCountdown.js';
import { formatClock } from '../lib/time.js';
import { routineState, formatCountdown } from '../lib/routine.js';
import { AvoidWarning } from './MealChips.jsx';

/**
 * The routine around one dose, as one line: food → wait → take.
 *
 * The top of Today is where the routine is actually worked through — pick
 * what you're eating, watch the countdown, take it. This is the record beside
 * the dose: what's done, what's left, at a glance. Tapping the food undoes or
 * redoes it; tapping the dose opens it.
 */
export default function RoutineCard({ routine, when, onToggleStep, onOpenDose }) {
  const waiting = routine.steps.some((s) => s.state === 'waiting');
  const now = useNow({ tick: 1000, active: waiting && when === 'today' });
  const live = waiting && when === 'today'
    ? routineState(routine.steps, routine.run, routine.entry.entry, now)
    : routine;
  const readOnly = when !== 'today';
  const early = live.steps.some((s) => s.early);
  const meals = live.steps.filter((s) => s.kind === 'meal').map((s) => s.ate || s.text).join(' ');

  return (
    <div className="app-card" style={{ padding: '0.5rem 0.625rem' }}>
      <ol style={{
        listStyle: 'none', margin: 0, padding: 0,
        display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.25rem',
      }}>
        {live.steps.map((step, i) => (
          <li key={step.id} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', minWidth: 0 }}>
            {i > 0 && <ChevronRight size={14} style={{ color: 'var(--subtle)', flexShrink: 0 }} />}
            <Pip
              step={step}
              now={now}
              readOnly={readOnly}
              onClick={
                step.kind === 'dose' ? onOpenDose
                  : step.kind === 'wait' ? undefined
                    : () => onToggleStep(step.id, step.state === 'done' ? null : Date.now())
              }
            />
          </li>
        ))}
      </ol>
      {early && (
        <p style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--warn)', marginTop: '0.25rem' }}>
          Taken before the wait was up
        </p>
      )}
      <AvoidWarning text={meals} />
    </div>
  );
}

/** One step as a pill: icon, a few words, and its state in colour. */
function Pip({ step, now, readOnly, onClick }) {
  const done = step.state === 'done';
  const active = step.state === 'active' || step.state === 'waiting';
  const Icon = done ? Check : step.kind === 'wait' ? Hourglass : step.kind === 'dose' ? Pill : Utensils;

  let text;
  if (step.kind === 'wait') {
    text = step.state === 'waiting' ? formatCountdown(step.endsAt - now) : `${step.minutes}m`;
  } else if (step.kind === 'dose') {
    text = done ? formatClock(step.doneAt) : step.state === 'skipped' ? 'Skipped' : 'Take';
  } else {
    text = done && step.ate ? step.ate : step.text;
  }

  const style = {
    display: 'flex', alignItems: 'center', gap: '0.3125rem', minWidth: 0, maxWidth: '100%',
    padding: '0.3125rem 0.625rem', borderRadius: '9999px',
    fontSize: '0.8125rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums',
    backgroundColor: active ? 'var(--accent-soft)' : 'var(--surface2)',
    border: `1px solid ${active ? 'var(--accent)' : 'transparent'}`,
    color: done ? 'var(--positive-text)' : active ? 'var(--accent-text)' : 'var(--muted)',
    cursor: onClick && !readOnly ? 'pointer' : 'default',
  };
  const inner = (
    <>
      <Icon size={13} strokeWidth={2.5} style={{ flexShrink: 0 }} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{text}</span>
    </>
  );

  if (!onClick || readOnly) return <span style={style}>{inner}</span>;
  return (
    <button
      onClick={onClick}
      aria-pressed={step.kind === 'dose' ? undefined : done}
      aria-label={step.kind === 'dose' ? 'Open the dose' : `${text}${done ? ', done — tap to undo' : ''}`}
      style={style}
    >
      {inner}
    </button>
  );
}

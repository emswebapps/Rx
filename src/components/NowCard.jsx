import { Check, Hourglass, Utensils, Pill, LifeBuoy, PartyPopper } from 'lucide-react';
import { useNow } from '../lib/useCountdown.js';
import { formatClock } from '../lib/time.js';
import { expectedDosesOnDay, effectiveWindow } from '../lib/meds.js';
import { routinesForDay, formatCountdown } from '../lib/routine.js';
import { nextUp, formatUntil } from '../lib/next.js';
import { okMeals } from '../lib/mealLibrary.js';

/**
 * The top of Today: one thing, with its clock.
 *
 * It recomputes every second from the raw data rather than taking Today's
 * minute-old view, so a wait that runs out flips straight to "take it now"
 * instead of sitting at 0:00 for the rest of the minute.
 */
export default function NowCard({ meds, doses, runs, kit, savedMeals = [], onStep, onOpenDose, onCrash, onCheckIn }) {
  const now = useNow({ tick: 1000 });
  const schedule = expectedDosesOnDay(meds, doses, now, now);
  const routines = routinesForDay(schedule, runs, now, now);
  const next = nextUp({ schedule, routines, window: effectiveWindow(meds, doses, kit, now), now });
  const name = (e) => e?.med?.name || 'your dose';

  if (next.kind === 'wait') {
    const left = next.endsAt - now;
    const total = next.minutes * 60 * 1000;
    return (
      <Shell tone="accent" label={`WAITING · then ${next.then?.kind === 'dose' ? `take ${name(next.entry)}` : (next.then?.text || 'next step')}`} Icon={Hourglass}>
        <Big>{formatCountdown(left)}</Big>
        <Sub>Ends {formatClock(next.endsAt)} · your phone will buzz</Sub>
        <Bar pct={1 - left / total} />
      </Shell>
    );
  }

  if (next.kind === 'step' && next.step.kind === 'meal') {
    // Picking what you're eating IS checking the meal off: one tap records
    // the food and starts the wait. The routine's own meal comes first.
    const planned = next.step.text;
    const options = [planned, ...okMeals(savedMeals).map((m) => m.name)
      .filter((n) => n.toLowerCase() !== planned.toLowerCase())].slice(0, 6);
    const waits = next.routine.steps[next.routine.steps.indexOf(next.step) + 1]?.kind === 'wait';
    return (
      <Shell
        tone="accent"
        label={next.afterDose ? `AFTER YOUR ${name(next.entry).toUpperCase()}` : `EAT FIRST · ${name(next.entry)} at ${formatClock(next.entry.expectedAt)}`}
        Icon={Utensils}
      >
        <p style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--text)', marginTop: '0.375rem' }}>
          {waits ? 'Tap what you’re eating — the timer starts' : 'Tap what you ate'}
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.375rem', marginTop: '0.5rem' }}>
          {options.map((food, i) => (
            <button
              key={food}
              onClick={() => onStep(next.entry, next.step.id, i === 0 ? null : food)}
              style={{
                padding: '0.625rem 0.5rem', borderRadius: '0.75rem', cursor: 'pointer',
                backgroundColor: i === 0 ? 'var(--accent)' : 'var(--surface)',
                border: `1px solid ${i === 0 ? 'var(--accent)' : 'var(--border)'}`,
                color: i === 0 ? '#fff' : 'var(--text)', fontSize: '0.875rem', fontWeight: 700, lineHeight: 1.25,
              }}
            >
              {food}
            </button>
          ))}
        </div>
      </Shell>
    );
  }

  if (next.kind === 'step') {
    const meal = next.step.kind === 'meal';
    return (
      <Shell
        tone="accent"
        label={next.afterDose ? `AFTER YOUR ${name(next.entry).toUpperCase()}` : `UP NEXT · ${name(next.entry)} at ${formatClock(next.entry.expectedAt)}`}
        Icon={meal ? Utensils : Check}
      >
        <Big small>{next.step.text}</Big>
        <Action onClick={() => onStep(next.entry, next.step.id)}>
          <Check size={18} strokeWidth={3} /> {meal ? (next.afterDose || next.routine.steps[next.routine.steps.indexOf(next.step) + 1]?.kind !== 'wait' ? 'Ate it' : 'Ate it — start the timer') : 'Done'}
        </Action>
      </Shell>
    );
  }

  if (next.kind === 'dose') {
    const left = next.at - now;
    const soon = next.due || left <= 15 * 60 * 1000;
    return (
      <Shell tone={soon ? 'accent' : 'plain'} label={`NEXT DOSE · ${name(next.entry)}`} Icon={Pill}>
        {/* Hours away isn't urgent, so it isn't shouted. */}
        <Big small={!soon}>{next.due ? 'Due now' : `in ${formatUntil(left)}`}</Big>
        <Sub>{formatClock(next.at)}</Sub>
        {soon && (
          <Action onClick={() => onOpenDose(next.entry.key)}>
            <Check size={18} strokeWidth={3} /> Take it
          </Action>
        )}
      </Shell>
    );
  }

  if (next.kind === 'crash') {
    return (
      <Shell tone="plain" label="CRASH WINDOW" Icon={LifeBuoy}>
        <Big>in {formatUntil(next.at - now)}</Big>
        <Sub>About {formatClock(next.at)} – {formatClock(next.end)}. No more doses today.</Sub>
      </Shell>
    );
  }

  if (next.kind === 'inCrash') {
    return (
      <Shell tone="warn" label="YOU’RE IN YOUR WINDOW" Icon={LifeBuoy}>
        <Big small>Until about {formatClock(next.end)}</Big>
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
          <Action onClick={onCheckIn} secondary inline>I’m OK — check in</Action>
          <Action onClick={onCrash} inline>I’m crashing</Action>
        </div>
      </Shell>
    );
  }

  return (
    <Shell tone="plain" label="TODAY" Icon={PartyPopper}>
      {/* "All done" would be a lie on a day with misses; this is just true. */}
      <Big small>Nothing left for today</Big>
    </Shell>
  );
}

const TONES = {
  accent: { bg: 'var(--accent-soft)', border: 'var(--accent)', label: 'var(--accent-text)' },
  warn: { bg: 'var(--surface)', border: 'var(--warn)', label: 'var(--warn)' },
  plain: { bg: 'var(--surface)', border: 'var(--border)', label: 'var(--muted)' },
};

function Shell({ tone, label, Icon, children }) {
  const t = TONES[tone];
  return (
    <section
      aria-live="polite"
      style={{
        borderRadius: '1rem', padding: '0.75rem 0.875rem 0.875rem',
        backgroundColor: t.bg, border: `1px solid ${t.border}`,
      }}
    >
      <p style={{
        display: 'flex', alignItems: 'center', gap: '0.375rem',
        fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.06em', color: t.label,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        <Icon size={14} style={{ flexShrink: 0 }} /> {label}
      </p>
      {children}
    </section>
  );
}

function Big({ children, small }) {
  return (
    <p style={{
      fontSize: small ? '1.25rem' : '2.25rem', fontWeight: 800, lineHeight: 1.1,
      color: 'var(--text)', marginTop: '0.25rem', letterSpacing: '-0.02em',
      fontVariantNumeric: 'tabular-nums',
    }}>
      {children}
    </p>
  );
}

function Sub({ children }) {
  return <p style={{ fontSize: '0.8125rem', color: 'var(--muted)', marginTop: '0.125rem' }}>{children}</p>;
}

function Bar({ pct }) {
  const p = Math.max(0, Math.min(1, pct));
  return (
    <div style={{ height: '0.3125rem', borderRadius: '9999px', backgroundColor: 'var(--surface2)', marginTop: '0.5rem', overflow: 'hidden' }}>
      <div style={{ width: `${p * 100}%`, height: '100%', backgroundColor: 'var(--accent)', transition: 'width 1s linear' }} />
    </div>
  );
}

function Action({ onClick, children, secondary, inline }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: inline ? 1 : undefined, width: inline ? undefined : '100%',
        marginTop: inline ? 0 : '0.625rem', padding: '0.625rem 1rem', borderRadius: '0.75rem',
        cursor: 'pointer', border: secondary ? '1px solid var(--border)' : 'none',
        backgroundColor: secondary ? 'var(--surface2)' : 'var(--accent)',
        color: secondary ? 'var(--text)' : '#fff', fontSize: '0.9375rem', fontWeight: 800,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
      }}
    >
      {children}
    </button>
  );
}

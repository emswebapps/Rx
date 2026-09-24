import { Check, Hourglass, Utensils, Pill, LifeBuoy, PartyPopper } from 'lucide-react';
import { useNow } from '../lib/useCountdown.js';
import { formatClock } from '../lib/time.js';
import { expectedDosesOnDay, effectiveWindow } from '../lib/meds.js';
import { routinesForDay, formatCountdown } from '../lib/routine.js';
import { nextUp, formatUntil } from '../lib/next.js';

/**
 * The top of Today: one thing, with its clock.
 *
 * It recomputes every second from the raw data rather than taking Today's
 * minute-old view, so a wait that runs out flips straight to "take it now"
 * instead of sitting at 0:00 for the rest of the minute.
 */
export default function NowCard({ meds, doses, runs, kit, onStep, onOpenDose, onCrash, onCheckIn }) {
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

  if (next.kind === 'step') {
    const meal = next.step.kind === 'meal';
    return (
      <Shell tone="accent" label={`UP NEXT · ${name(next.entry)} at ${formatClock(next.entry.expectedAt)}`} Icon={meal ? Utensils : Check}>
        <Big small>{next.step.text}</Big>
        <Action onClick={() => onStep(next.entry, next.step.id)}>
          <Check size={18} strokeWidth={3} /> {meal ? 'Ate it — start the timer' : 'Done'}
        </Action>
      </Shell>
    );
  }

  if (next.kind === 'dose') {
    const left = next.at - now;
    const soon = next.due || left <= 15 * 60 * 1000;
    return (
      <Shell tone={soon ? 'accent' : 'plain'} label={`NEXT DOSE · ${name(next.entry)}`} Icon={Pill}>
        <Big>{next.due ? 'Due now' : `in ${formatUntil(left)}`}</Big>
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
      <Big small>All done for today</Big>
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
        borderRadius: '1.25rem', padding: '1rem 1.125rem 1.125rem',
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
      fontSize: small ? '1.625rem' : '2.75rem', fontWeight: 800, lineHeight: 1.1,
      color: 'var(--text)', marginTop: '0.375rem', letterSpacing: '-0.02em',
      fontVariantNumeric: 'tabular-nums',
    }}>
      {children}
    </p>
  );
}

function Sub({ children }) {
  return <p style={{ fontSize: '0.9375rem', color: 'var(--muted)', marginTop: '0.25rem' }}>{children}</p>;
}

function Bar({ pct }) {
  const p = Math.max(0, Math.min(1, pct));
  return (
    <div style={{ height: '0.375rem', borderRadius: '9999px', backgroundColor: 'var(--surface2)', marginTop: '0.75rem', overflow: 'hidden' }}>
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
        marginTop: inline ? 0 : '0.875rem', padding: '0.8125rem 1rem', borderRadius: '0.875rem',
        cursor: 'pointer', border: secondary ? '1px solid var(--border)' : 'none',
        backgroundColor: secondary ? 'var(--surface2)' : 'var(--accent)',
        color: secondary ? 'var(--text)' : '#fff', fontSize: '1rem', fontWeight: 800,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
      }}
    >
      {children}
    </button>
  );
}

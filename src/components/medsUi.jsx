// The small pieces the medication screens share.
//
// Split out so MedsView and MedEditor can't drift on how a back header, a
// section heading or a supply bar looks, and so neither file has to carry the
// styling twice.

import { ArrowLeft } from 'lucide-react';
import { formatAmount } from '../lib/meds.js';

/**
 * Every full-page screen in Rx.
 *
 * `.app-page` supplies the bottom clearance for the fixed nav, but an inline
 * `padding` shorthand overrides `padding-bottom` outright — which is exactly
 * how the Save button on the medication page ended up underneath the tab bar.
 * Longhand here, so the two can't fight.
 */
export const pageStyle = {
  paddingTop: '1.25rem',
  paddingLeft: '1.25rem',
  paddingRight: '1.25rem',
  paddingBottom: '7rem',
};

export const sectionStyle = { marginBottom: '2rem' };

export const headingStyle = {
  fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.06em',
  color: 'var(--muted)', marginBottom: '0.75rem',
};

/** The back-arrow header every sub-view of the crash feature opens with. */
export function ViewHeader({ title, onBack, action }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '0.75rem',
      paddingTop: '1rem', marginBottom: '1.5rem',
    }}>
      <button onClick={onBack} aria-label="Back" style={{
        width: '2.25rem', height: '2.25rem', borderRadius: '9999px', border: 'none', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backgroundColor: 'var(--surface2)', color: 'var(--muted)', flexShrink: 0,
      }}>
        <ArrowLeft size={17} />
      </button>
      <h1 style={{
        flex: 1, fontSize: '1.375rem', fontWeight: 800,
        color: 'var(--text)', letterSpacing: '-0.02em',
      }}>
        {title}
      </h1>
      {action}
    </div>
  );
}

/** A row of mutually exclusive choices — the same shape as the timer picker. */
export function Segmented({ options, value, onChange, style }) {
  return (
    <div style={{ display: 'flex', gap: '0.5rem', ...style }}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <button
            key={o.key}
            onClick={() => onChange(o.key)}
            style={{
              flex: 1, padding: '0.75rem 0.5rem', borderRadius: '0.75rem', cursor: 'pointer',
              fontSize: '0.875rem', fontWeight: 700,
              color: on ? '#fff' : 'var(--text)',
              backgroundColor: on ? 'var(--accent)' : 'var(--surface2)',
              border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * How much is left, as a bar and a sentence.
 *
 * Deliberately says nothing at all when nothing is being counted. An empty bar
 * would read as "you're out", which is the one wrong answer here.
 */
/** "Tue, Sep 30" — the day a supply runs out. */
export function formatRunOut(ts) {
  return new Date(ts).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

/**
 * The line that answers "when do I run out, and will I make it to the refill?"
 *
 * Counted dose by dose from what's physically in hand (see `runOut` in
 * meds.js). When the bottle empties before the fill date it says so in red,
 * with the number of days you'd go without — the one supply fact that needs
 * acting on now, while there's still time to call the pharmacy or the doctor.
 */
export function RunOutLine({ status }) {
  if (!status.tracked || status.runOutAt == null) return null;
  const when = status.coverDays === 0 ? 'today'
    : status.coverDays === 1 ? 'tomorrow'
      : `${formatRunOut(status.runOutAt)} · in ${status.coverDays} days`;

  if (!status.shortBeforeRefill) {
    return (
      <p style={{ fontSize: '0.8125rem', color: 'var(--subtle)', marginTop: '0.375rem' }}>
        Runs out <strong style={{ color: 'var(--text)' }}>{when}</strong>
        {status.refillAt != null && !status.refillOpen ? ' — after your refill date, so you’re covered.' : ''}
      </p>
    );
  }

  return (
    <div style={{
      marginTop: '0.625rem', padding: '0.75rem', borderRadius: '0.75rem',
      backgroundColor: 'var(--danger-soft)', border: '1px solid var(--danger)',
    }}>
      <p style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--danger)', lineHeight: 1.4 }}>
        Runs out {when} — before you can refill
      </p>
      <p style={{ fontSize: '0.8125rem', color: 'var(--text)', lineHeight: 1.45, marginTop: '0.25rem' }}>
        Refill opens {formatRunOut(status.refillAt)}. That’s {status.gapDays} scheduled{' '}
        {status.gapDays === 1 ? 'day' : 'days'} without it unless something changes — worth calling
        the pharmacy or your prescriber now.
      </p>
    </div>
  );
}

export function SupplyBar({ status }) {
  if (!status.tracked) {
    if (!status.refillAt) return null;
    return (
      <p style={{ fontSize: '0.8125rem', color: status.refillOpen ? 'var(--accent-text)' : 'var(--subtle)', fontWeight: status.refillOpen ? 600 : 400 }}>
        {status.refillOpen ? 'You can refill this now.' : `Can refill in ${status.daysUntilRefill} days.`}
      </p>
    );
  }

  // Full bar at a month, which is what a fill usually is. Past that it just
  // stays full rather than making the scale meaningless.
  const pct = Math.min(100, (status.daysLeft / 30) * 100);
  const tone = status.low ? 'var(--warn)' : 'var(--positive)';

  return (
    <div>
      <div style={{
        height: '0.375rem', borderRadius: '9999px', overflow: 'hidden',
        backgroundColor: 'var(--surface2)', marginBottom: '0.4375rem',
      }}>
        <div style={{ width: `${Math.max(2, pct)}%`, height: '100%', backgroundColor: tone }} />
      </div>
      <p style={{
        fontSize: '0.8125rem', lineHeight: 1.4,
        color: status.low ? 'var(--warn)' : 'var(--subtle)',
        fontWeight: status.low ? 600 : 400,
      }}>
        {status.onHand === 0
          ? 'None left.'
          : `${formatAmount(status.onHand, status.form)} left — about ${status.daysLeft} ${status.daysLeft === 1 ? 'day' : 'days'}.`}
        {status.refillAt != null && (
          status.refillOpen
            ? ' You can refill now.'
            : ` Can refill in ${status.daysUntilRefill} ${status.daysUntilRefill === 1 ? 'day' : 'days'}.`
        )}
      </p>
    </div>
  );
}

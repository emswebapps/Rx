import { useCountdown } from '../../lib/useCountdown.js';
import { timerRemaining, formatRemaining } from '../../lib/protocol.js';
import { formatClock } from '../../lib/time.js';

export default function CountdownPill({ session, onExtend }) {
  const now = useCountdown(session?.timerEndsAt);
  if (!session?.timerEndsAt) return null;
  const left = timerRemaining(session, now);
  const done = left === 0;

  return (
    <button
      onClick={onExtend}
      title={done ? 'Add 10 minutes' : `Come back at ${formatClock(session.timerEndsAt)}`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '0.375rem',
        padding: '0.4375rem 0.75rem', borderRadius: '9999px',
        fontSize: '0.875rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums',
        cursor: 'pointer',
        color: done ? 'var(--positive-text)' : 'var(--accent-text)',
        backgroundColor: done ? 'var(--positive-soft)' : 'var(--accent-soft)',
        border: `1px solid ${done ? 'var(--positive)' : 'var(--accent)'}`,
      }}
    >
      {done ? 'Time’s up' : formatRemaining(left)}
    </button>
  );
}

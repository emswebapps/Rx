import { Zap, TrendingDown, Undo2 } from 'lucide-react';
import { formatClock } from '../lib/time.js';
import { formatUntil } from '../lib/next.js';
import { minutesAfter, formatMinutes } from '../lib/onset.js';

/**
 * One line under the top card after a dose: "It kicked in" while you're
 * waiting for it, then "Dropping off" once it has. Each is a single tap at
 * the moment you feel it; the minutes since the dose are what History
 * compares.
 *
 * `prompt` is onsetPrompt.
 */
export default function OnsetRow({ prompt, now, onKick, onDrop, onUndoKick }) {
  if (!prompt) return null;
  const { dose, med, stage } = prompt;
  const name = med?.name || 'Your dose';
  const kickMin = minutesAfter(dose, dose.kickedInAt);

  return (
    <div style={{
      marginTop: '0.75rem', padding: '0.625rem 0.75rem 0.625rem 1rem', borderRadius: '0.875rem',
      backgroundColor: 'var(--surface)', border: '1px solid var(--border)',
      display: 'flex', alignItems: 'center', gap: '0.5rem',
    }}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: '0.9375rem', fontWeight: 700, color: 'var(--text)' }}>
          {stage === 'kick' ? 'Felt it kick in?' : 'Feel it dropping off?'}
        </span>
        <span style={{ display: 'block', fontSize: '0.8125rem', color: 'var(--subtle)' }}>
          {name} · taken {formatClock(dose.takenAt)}, {formatUntil(now - dose.takenAt)} ago
          {kickMin != null && ` · kicked in after ${formatMinutes(kickMin)}`}
          {kickMin != null && onUndoKick && (
            <button onClick={onUndoKick} aria-label="Undo kicked in" style={{
              marginLeft: '0.375rem', background: 'none', border: 'none', padding: 0, cursor: 'pointer',
              color: 'var(--accent-text)', verticalAlign: 'middle',
            }}>
              <Undo2 size={13} />
            </button>
          )}
        </span>
      </span>
      <button
        onClick={stage === 'kick' ? onKick : onDrop}
        className="app-btn-primary"
        style={{
          width: 'auto', flex: 'none', padding: '0.5rem 0.75rem', fontSize: '0.875rem',
          display: 'flex', alignItems: 'center', gap: '0.3125rem',
        }}
      >
        {stage === 'kick' ? <Zap size={15} /> : <TrendingDown size={15} />}
        {stage === 'kick' ? 'Kicked in' : 'Dropping off'}
      </button>
    </div>
  );
}

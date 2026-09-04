import { FEELINGS } from '../../../lib/kit.js';
import { BigButton } from '../../../components/stepUi.jsx';
import { formatClock } from '../../../lib/time.js';
import { bestMove } from '../../../lib/stats.js';
import { useApp } from '../../../context/AppContext';

/**
 * Round 4, placed after the cognitive rounds on purpose. Distraction on its own
 * has already been tried and fails the moment the stimulation drops — but by
 * this point the thought has been written down as an interpretation, so what
 * comes back comes back to a brain that already sorted it.
 */
export default function StepMove({ session, kit, onPatch, onOpenAnchors, onOpenPark, onGoTo }) {
  const { crashSessions } = useApp();
  const feeling = session.feeling;
  const moves = session.moves || [];
  // Earned from her own record, not a guess. Tile order deliberately stays
  // fixed — a menu that reshuffles under a dysregulated thumb is worse than
  // one that doesn't.
  const best = bestMove(crashSessions.filter((s) => s.id !== session.id));

  if (!feeling) {
    return (
      <>
        <p style={{ color: 'var(--muted)', fontSize: '1rem', lineHeight: 1.5, marginBottom: '1.25rem' }}>
          What is it mostly, right now?
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
          {FEELINGS.map((f) => (
            <BigButton key={f.key} tone="quiet" onClick={() => onPatch({ feeling: f.key })} style={{ minHeight: '5rem' }}>
              <span style={{ fontSize: '1.5rem', display: 'block', marginBottom: '0.25rem' }}>{f.emoji}</span>
              {f.label}
            </BigButton>
          ))}
        </div>
      </>
    );
  }

  const options = kit.menu[feeling] || [];
  const picked = moves[moves.length - 1];

  const choose = (opt) => {
    onPatch({ moves: [...moves, opt.id], movedAt: Date.now() });
    if (opt.action === 'anchors') onOpenAnchors();
    if (opt.action === 'escrow') onOpenPark();
    if (opt.action === 'facts') onGoTo('facts');
    if (opt.action === 'brake') onGoTo('brake');
  };

  return (
    <>
      <p style={{ color: 'var(--muted)', fontSize: '1rem', lineHeight: 1.5, marginBottom: '1.25rem' }}>
        Don’t decide what would help — it’s already decided. Just pick one and go.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
        {options.map((o) => (
          <BigButton
            key={o.id}
            tone={picked === o.id ? 'accent' : 'quiet'}
            onClick={() => choose(o)}
            style={{ minHeight: '5.5rem', fontSize: '0.9375rem', position: 'relative' }}
          >
            <span style={{ fontSize: '1.625rem', display: 'block', marginBottom: '0.375rem' }}>{o.emoji}</span>
            {o.label}
            {best && best.id === o.id && (
              <span style={{
                display: 'block', marginTop: '0.3125rem',
                fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.02em',
                color: picked === o.id ? 'rgba(255,255,255,0.85)' : 'var(--positive-text)',
              }}>
                usually helps you most
              </span>
            )}
          </BigButton>
        ))}
      </div>

      <button
        onClick={() => onPatch({ feeling: null })}
        style={{
          width: '100%', marginTop: '0.875rem', padding: '0.75rem', background: 'none',
          border: 'none', color: 'var(--subtle)', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer',
        }}
      >
        It’s something else
      </button>

      {picked && (
        <div style={{
          marginTop: '1.25rem', padding: '1.25rem', borderRadius: '1rem',
          backgroundColor: 'var(--accent-soft)', border: '1px solid var(--accent)',
        }}>
          <p style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--accent-text)', lineHeight: 1.4 }}>
            Go. The timer keeps running.
          </p>
          {session.timerEndsAt && (
            <p style={{ fontSize: '1rem', color: 'var(--accent-text)', marginTop: '0.5rem', lineHeight: 1.45 }}>
              Come back at {formatClock(session.timerEndsAt)}. Nothing needs to be solved before then.
            </p>
          )}
        </div>
      )}
    </>
  );
}

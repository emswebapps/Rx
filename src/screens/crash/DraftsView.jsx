import { useState } from 'react';
import { ArrowLeft, Copy, Check } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useNow } from '../../lib/useCountdown.js';
import { isReleased } from '../../lib/protocol.js';
import { formatClock } from '../../lib/time.js';
import { pageStyle } from '../../components/medsUi.jsx';

/**
 * Escrow. Held things get no send button at all until morning — the whole
 * point is that the decision is deferred, and a button sitting there is an
 * invitation to un-defer it.
 */
export default function DraftsView({ onBack }) {
  const { crashDrafts, resolveCrashDraft, deleteCrashDraft } = useApp();
  const now = useNow({ tick: 30_000 });
  const [copied, setCopied] = useState(null);

  const held = crashDrafts.filter((d) => d.status === 'held');
  const ready = held.filter((d) => isReleased(d, now));
  const waiting = held.filter((d) => !isReleased(d, now));

  const copy = (d) => {
    navigator.clipboard.writeText(d.text).then(() => {
      setCopied(d.id);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  const Card = ({ d, released }) => (
    <div className="app-card" style={{ padding: '1rem' }}>
      <p style={{
        fontSize: '0.6875rem', fontWeight: 800, letterSpacing: '0.06em',
        color: released ? 'var(--positive-text)' : 'var(--warn)', marginBottom: '0.5rem',
      }}>
        {released ? 'READY WHEN YOU ARE' : 'DO NOT SEND UNTIL TOMORROW'}
      </p>
      <p style={{ fontSize: '0.9375rem', color: 'var(--text)', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
        {d.text}
      </p>
      <p style={{ fontSize: '0.75rem', color: 'var(--subtle)', marginTop: '0.75rem' }}>
        Written {new Date(d.createdAt).toLocaleDateString()} at {formatClock(d.createdAt)}
        {!released && ` · opens ${formatClock(d.releaseAt)} tomorrow`}
      </p>

      {released && (
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.875rem', flexWrap: 'wrap' }}>
          <button
            onClick={() => resolveCrashDraft(d.id, 'dropped')}
            style={{
              flex: 1, minWidth: '7rem', padding: '0.6875rem', borderRadius: '0.75rem', cursor: 'pointer',
              border: '1px solid var(--border)', backgroundColor: 'var(--surface2)',
              color: 'var(--text)', fontSize: '0.875rem', fontWeight: 700,
            }}
          >
            I don’t need this
          </button>
          <button
            onClick={() => resolveCrashDraft(d.id, 'sent')}
            style={{
              flex: 1, minWidth: '7rem', padding: '0.6875rem', borderRadius: '0.75rem', cursor: 'pointer',
              border: '1px solid var(--border)', backgroundColor: 'var(--surface2)',
              color: 'var(--text)', fontSize: '0.875rem', fontWeight: 700,
            }}
          >
            It still matters
          </button>
          <button
            onClick={() => copy(d)}
            aria-label="Copy"
            style={{
              width: '2.75rem', borderRadius: '0.75rem', cursor: 'pointer',
              border: '1px solid var(--border)', backgroundColor: 'var(--surface2)',
              color: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            {copied === d.id ? <Check size={16} /> : <Copy size={16} />}
          </button>
        </div>
      )}

      {!released && (
        <button
          onClick={() => deleteCrashDraft(d.id)}
          style={{
            background: 'none', border: 'none', color: 'var(--subtle)',
            fontSize: '0.8125rem', fontWeight: 700, cursor: 'pointer', padding: '0.5rem 0 0',
          }}
        >
          Delete it
        </button>
      )}
    </div>
  );

  return (
    <div className="app-page" style={pageStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', paddingTop: '1rem', marginBottom: '1.25rem' }}>
        <button onClick={onBack} aria-label="Back" style={{
          width: '2.25rem', height: '2.25rem', borderRadius: '9999px', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backgroundColor: 'var(--surface2)', color: 'var(--muted)',
        }}>
          <ArrowLeft size={17} />
        </button>
        <h1 style={{ fontSize: '1.375rem', fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.02em' }}>
          Held
        </h1>
      </div>

      {held.length === 0 && (
        <p style={{ color: 'var(--subtle)', fontSize: '0.9375rem', textAlign: 'center', padding: '2rem 1rem', lineHeight: 1.5 }}>
          Nothing waiting. Everything you wrote down got dealt with.
        </p>
      )}

      {ready.length > 0 && (
        <>
          <h2 style={{ fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.06em', color: 'var(--muted)', margin: '0 0 0.75rem' }}>
            IT’S TOMORROW NOW
          </h2>
          <div style={{ display: 'grid', gap: '0.875rem', marginBottom: '1.75rem' }}>
            {ready.map((d) => <Card key={d.id} d={d} released />)}
          </div>
        </>
      )}

      {waiting.length > 0 && (
        <>
          <h2 style={{ fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.06em', color: 'var(--muted)', margin: '0 0 0.75rem' }}>
            STILL HELD
          </h2>
          <div style={{ display: 'grid', gap: '0.875rem' }}>
            {waiting.map((d) => <Card key={d.id} d={d} released={false} />)}
          </div>
        </>
      )}
    </div>
  );
}

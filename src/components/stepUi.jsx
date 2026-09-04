import { X } from 'lucide-react';
import { STEP_META, STEPS } from '../lib/protocol.js';

// Shared chrome for the protocol. Every step screen is the same shape: a thin
// header you can always escape from, a body, and a primary action pinned at
// thumb height so it never depends on where the content ended up.

export function BigButton({ children, onClick, tone = 'accent', style, ...rest }) {
  const bg =
    tone === 'accent' ? 'var(--accent)'
      : tone === 'positive' ? 'var(--positive)'
        : 'var(--surface2)';
  const color =
    tone === 'accent' ? '#fff'
      : tone === 'positive' ? '#fff'
        : 'var(--text)';
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', minHeight: '3.5rem', padding: '1rem 1.25rem',
        borderRadius: '1rem', border: tone === 'quiet' ? '1px solid var(--border)' : 'none',
        backgroundColor: bg, color, fontSize: '1.0625rem', fontWeight: 700,
        cursor: 'pointer', lineHeight: 1.3, textAlign: 'center',
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  );
}

export function SkipButton({ step, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', padding: '0.875rem', marginTop: '0.5rem',
        background: 'none', border: 'none', color: 'var(--subtle)',
        fontSize: '0.9375rem', fontWeight: 600, cursor: 'pointer',
      }}
    >
      {STEP_META[step]?.skip || 'Skip this'}
    </button>
  );
}

export function Chip({ selected, children, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', textAlign: 'left', padding: '0.9375rem 1rem',
        borderRadius: '0.875rem', cursor: 'pointer',
        fontSize: '1rem', fontWeight: selected ? 700 : 500, lineHeight: 1.35,
        color: selected ? 'var(--accent-text)' : 'var(--text)',
        backgroundColor: selected ? 'var(--accent-soft)' : 'var(--surface)',
        border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
      }}
    >
      {children}
    </button>
  );
}

/**
 * 0–10 as eleven tap targets rather than a slider. A slider needs fine motor
 * control and a steady hand, which is exactly what isn't available here.
 */
export function ScalePicker({ value, onChange }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '0.5rem' }}>
      {Array.from({ length: 11 }, (_, n) => {
        const on = value === n;
        return (
          <button
            key={n}
            onClick={() => onChange(n)}
            style={{
              aspectRatio: '1', borderRadius: '0.75rem', cursor: 'pointer',
              fontSize: '1.0625rem', fontWeight: 700,
              color: on ? '#fff' : 'var(--muted)',
              backgroundColor: on ? 'var(--accent)' : 'var(--surface2)',
              border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
            }}
          >
            {n}
          </button>
        );
      })}
    </div>
  );
}

export function StepFrame({ step, onClose, timer, children, footer }) {
  const meta = STEP_META[step] || {};
  return (
    // Fixed overlay rather than a page: during a round the nav bar would both
    // cover this screen's primary action and invite navigating away mid-crash.
    // The header's X is the intended exit, and it leaves the session resumable.
    <div style={{
      position: 'fixed', inset: 0, zIndex: 55,
      display: 'flex', flexDirection: 'column',
      backgroundColor: 'var(--bg)',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.75rem',
        padding: '0.875rem 1rem',
        paddingTop: 'max(0.875rem, env(safe-area-inset-top, 0px))',
        flexShrink: 0,
      }}>
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            width: '2.25rem', height: '2.25rem', borderRadius: '9999px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            backgroundColor: 'var(--surface2)', border: 'none',
            color: 'var(--muted)', cursor: 'pointer', flexShrink: 0,
          }}
        >
          <X size={17} />
        </button>
        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--subtle)', letterSpacing: '0.04em' }}>
          {meta.n} OF {STEPS.length}
        </span>
        <div style={{ marginLeft: 'auto' }}>{timer}</div>
      </div>

      {/* Bottom padding clears the floating capture button, which otherwise
          sits on top of the last line of every step. */}
      <div style={{ flex: 1, padding: '0.5rem 1.25rem 5rem', overflowY: 'auto' }}>
        <h1 style={{
          fontSize: '1.5rem', fontWeight: 800, color: 'var(--text)',
          letterSpacing: '-0.02em', marginBottom: '1.25rem', lineHeight: 1.2,
        }}>
          {meta.title}
        </h1>
        {children}
      </div>

      <div style={{
        flexShrink: 0, padding: '0.875rem 1.25rem',
        paddingBottom: 'max(0.875rem, env(safe-area-inset-bottom, 0px))',
        borderTop: '1px solid var(--border)', backgroundColor: 'var(--surface)',
      }}>
        {footer}
      </div>
    </div>
  );
}

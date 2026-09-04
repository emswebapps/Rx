import { X } from 'lucide-react';
import { useEffect } from 'react';

/**
 * The app's only dialog. `footer` is optional: pass it and the node is pinned
 * below the scrolling body, so a form's primary action can't scroll out of
 * reach on a phone. Callers that don't pass one render exactly as before.
 */
export default function Modal({ title, onClose, children, footer }) {
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 70,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1rem',
      }}
    >
      {/* backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}
      />

      {/* centered card */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: '26rem',
          maxHeight: 'calc(100svh - 2rem)',
          backgroundColor: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: '1.25rem',
          boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '1.125rem 1.25rem',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          <h2 style={{ fontSize: '1.0625rem', fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.01em' }}>{title}</h2>
          <button
            onClick={onClose}
            style={{
              width: '2rem', height: '2rem', borderRadius: '9999px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--muted)', backgroundColor: 'var(--surface2)',
              border: 'none', cursor: 'pointer', flexShrink: 0,
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* scrollable content */}
        <div style={{
          overflowY: 'auto',
          flex: 1,
          padding: '1.25rem',
          // With a pinned footer the safe area is the footer's problem, and the
          // extra bottom padding here would just be dead space above it.
          paddingBottom: footer ? '1.25rem' : 'max(1.25rem, env(safe-area-inset-bottom, 0px))',
        }}>
          {children}
        </div>

        {/* pinned footer */}
        {footer && (
          <div style={{
            flexShrink: 0,
            padding: '0.875rem 1.25rem',
            paddingBottom: 'max(0.875rem, env(safe-area-inset-bottom, 0px))',
            borderTop: '1px solid var(--border)',
            backgroundColor: 'var(--surface)',
          }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

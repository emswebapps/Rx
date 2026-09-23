import { useEffect } from 'react';

/**
 * A panel that rises from the bottom edge, for the few actions that belong to
 * one thing on screen — what to do with a dose you've just tapped.
 *
 * Bottom rather than centred because that is where the thumb already is: the
 * card was tapped with it, and Take is the next thing it presses.
 */
export default function Sheet({ onClose, children, label }) {
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      style={{ position: 'fixed', inset: 0, zIndex: 70, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
    >
      <div
        onClick={onClose}
        style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', animation: 'rx-fade 0.15s ease-out' }}
      />
      <div
        style={{
          position: 'relative', width: '100%', maxWidth: '640px',
          maxHeight: 'calc(100svh - 3rem)', overflowY: 'auto',
          backgroundColor: 'var(--surface)',
          borderTopLeftRadius: '1.5rem', borderTopRightRadius: '1.5rem',
          padding: '0.625rem 1.25rem',
          paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom, 0px))',
          boxShadow: '0 -12px 40px rgba(0,0,0,0.4)',
          animation: 'rx-rise 0.2s ease-out',
        }}
      >
        <div style={{
          width: '2.5rem', height: '0.3125rem', borderRadius: '9999px',
          backgroundColor: 'var(--border2)', margin: '0 auto 1rem',
        }} />
        {children}
      </div>
      <style>{`
        @keyframes rx-fade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes rx-rise { from { transform: translateY(100%) } to { transform: translateY(0) } }
      `}</style>
    </div>
  );
}

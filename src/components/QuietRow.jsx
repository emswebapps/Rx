/**
 * A row that is available without asking to be noticed.
 *
 * Shared by the home screen and the crash screen so the two can't drift on what
 * a secondary destination looks like. `tone: 'accent'` is for the one row that
 * still has to be findable in two seconds — the crash entry on the home screen.
 */
export default function QuietRow({ Icon, label, detail, onClick, tone = 'quiet' }) {
  const accent = tone === 'accent';
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: '0.875rem',
        padding: '1rem', borderRadius: '0.875rem', cursor: 'pointer', textAlign: 'left',
        backgroundColor: accent ? 'var(--accent-soft)' : 'var(--surface)',
        border: `1px solid ${accent ? 'var(--accent)' : 'var(--border)'}`,
      }}
    >
      <Icon size={19} style={{ color: accent ? 'var(--accent-text)' : 'var(--muted)', flexShrink: 0 }} />
      <span style={{
        flex: 1, fontSize: '0.9375rem', fontWeight: accent ? 700 : 600,
        color: accent ? 'var(--accent-text)' : 'var(--text)',
      }}>
        {label}
      </span>
      {detail != null && (
        <span style={{
          fontSize: '0.8125rem', fontWeight: 700,
          color: accent ? 'var(--accent-text)' : 'var(--subtle)',
        }}>
          {detail}
        </span>
      )}
    </button>
  );
}

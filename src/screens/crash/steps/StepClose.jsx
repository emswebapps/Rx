import { useApp } from '../../../context/AppContext';
import { ScalePicker, BigButton } from '../../../components/stepUi.jsx';
import { summarize, historySentence } from '../../../lib/stats.js';

const OUTCOMES = [
  { key: 'let-it-go', label: 'It settled' },
  { key: 'still-matters', label: 'I still want to talk about it — calmly' },
  { key: 'talked', label: 'We already talked about it' },
];

export default function StepClose({ session, onPatch }) {
  const { crashSessions, crashDrafts, resolveCrashDraft } = useApp();
  const mine = crashDrafts.filter((d) => d.sessionId === session.id && d.status === 'held');

  // Only shown once there's enough history to say something true and useful.
  // A thin number here would read as discouraging, so show nothing instead.
  const past = crashSessions.filter((s) => s.id !== session.id && s.endedAt);
  const summary = summarize(past, crashDrafts);
  const sentence = past.length >= 3 ? historySentence(summary) : null;

  return (
    <>
      <p style={{ color: 'var(--muted)', fontSize: '1rem', lineHeight: 1.5, marginBottom: '1.25rem' }}>
        How loud is it now?
      </p>
      <ScalePicker value={session.intensityAfter} onChange={(n) => onPatch({ intensityAfter: n })} />

      {session.intensity != null && session.intensityAfter != null && session.intensityAfter < session.intensity && (
        <p style={{ color: 'var(--positive-text)', fontSize: '1rem', fontWeight: 700, marginTop: '1rem', lineHeight: 1.45 }}>
          {session.intensity} → {session.intensityAfter}. That’s the crash leaving, not the problem changing.
        </p>
      )}

      <h2 style={{ fontSize: '1.0625rem', fontWeight: 800, color: 'var(--text)', margin: '1.75rem 0 0.75rem' }}>
        Does it still need talking about?
      </h2>
      <div style={{ display: 'grid', gap: '0.5rem' }}>
        {OUTCOMES.map((o) => (
          <BigButton
            key={o.key}
            tone={session.outcome === o.key ? 'accent' : 'quiet'}
            onClick={() => onPatch({ outcome: o.key })}
            style={{ fontSize: '1rem' }}
          >
            {o.label}
          </BigButton>
        ))}
      </div>

      {session.outcome === 'still-matters' && (
        <p style={{ color: 'var(--subtle)', fontSize: '0.9375rem', lineHeight: 1.5, marginTop: '1rem' }}>
          Good — that’s a real answer, not a failed one. You have your notes; bring those.
        </p>
      )}

      {mine.length > 0 && (
        <>
          <h2 style={{ fontSize: '1.0625rem', fontWeight: 800, color: 'var(--text)', margin: '1.75rem 0 0.75rem' }}>
            What you held back
          </h2>
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            {mine.map((d) => (
              <div key={d.id} className="app-card" style={{ padding: '1rem' }}>
                <p style={{ fontSize: '0.9375rem', color: 'var(--text)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                  {d.text}
                </p>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.875rem' }}>
                  <button
                    onClick={() => resolveCrashDraft(d.id, 'dropped')}
                    style={{
                      flex: 1, padding: '0.625rem', borderRadius: '0.75rem', cursor: 'pointer',
                      border: '1px solid var(--border)', backgroundColor: 'var(--surface2)',
                      color: 'var(--text)', fontSize: '0.875rem', fontWeight: 700,
                    }}
                  >
                    Let it go
                  </button>
                  <button
                    onClick={() => resolveCrashDraft(d.id, 'sent')}
                    style={{
                      flex: 1, padding: '0.625rem', borderRadius: '0.75rem', cursor: 'pointer',
                      border: '1px solid var(--border)', backgroundColor: 'var(--surface2)',
                      color: 'var(--text)', fontSize: '0.875rem', fontWeight: 700,
                    }}
                  >
                    Still matters
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {sentence && (
        <div style={{
          marginTop: '1.75rem', padding: '1rem', borderRadius: '1rem',
          backgroundColor: 'var(--surface)', border: '1px solid var(--border)',
        }}>
          <p style={{ fontSize: '0.9375rem', color: 'var(--muted)', lineHeight: 1.55 }}>{sentence}</p>
        </div>
      )}

      <textarea
        value={session.outcomeNote || ''}
        onChange={(e) => onPatch({ outcomeNote: e.target.value })}
        rows={2}
        placeholder="Anything worth remembering (optional)"
        className="app-input"
        style={{ width: '100%', resize: 'vertical', marginTop: '1.25rem', fontSize: '0.9375rem' }}
      />
    </>
  );
}

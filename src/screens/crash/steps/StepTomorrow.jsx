import { useState } from 'react';
import { useApp } from '../../../context/AppContext';

const CHOICES = [
  { key: 'yes', label: 'Yes' },
  { key: 'no', label: 'No' },
  { key: 'unsure', label: 'Not sure' },
];

function Question({ text, value, onChange }) {
  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <p style={{ fontSize: '1.0625rem', color: 'var(--text)', lineHeight: 1.45, marginBottom: '0.75rem', fontWeight: 600 }}>
        {text}
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
        {CHOICES.map((c) => {
          const on = value === c.key;
          return (
            <button
              key={c.key}
              onClick={() => onChange(c.key)}
              style={{
                padding: '0.875rem 0.5rem', borderRadius: '0.875rem', cursor: 'pointer',
                fontSize: '0.9375rem', fontWeight: 700,
                color: on ? '#fff' : 'var(--text)',
                backgroundColor: on ? 'var(--accent)' : 'var(--surface2)',
                border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
              }}
            >
              {c.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function StepTomorrow({ session, onPatch }) {
  const { addCrashDraft } = useApp();
  const tomorrow = session.tomorrow || { sameIssue: null, sameWay: null };
  const [draft, setDraft] = useState('');
  const [held, setHeld] = useState(false);

  const answered = tomorrow.sameIssue != null || tomorrow.sameWay != null;
  const wobbly = [tomorrow.sameIssue, tomorrow.sameWay].some((v) => v === 'no' || v === 'unsure');

  const hold = () => {
    if (!draft.trim()) return;
    addCrashDraft(draft.trim(), session.id);
    setDraft('');
    setHeld(true);
  };

  return (
    <>
      <Question
        text="If you felt completely normal right now, would you still think this needed to be discussed?"
        value={tomorrow.sameIssue}
        onChange={(v) => onPatch({ tomorrow: { ...tomorrow, sameIssue: v } })}
      />
      <Question
        text="Would you say it the same way tomorrow morning?"
        value={tomorrow.sameWay}
        onChange={(v) => onPatch({ tomorrow: { ...tomorrow, sameWay: v } })}
      />

      {answered && wobbly && (
        <div style={{
          backgroundColor: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: '1rem', padding: '1rem', marginTop: '0.5rem',
        }}>
          <p style={{ fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.06em', color: 'var(--warn)', marginBottom: '0.5rem' }}>
            DO NOT SEND UNTIL TOMORROW
          </p>
          <p style={{ fontSize: '0.9375rem', color: 'var(--muted)', lineHeight: 1.45, marginBottom: '0.75rem' }}>
            Then don’t send it — write it here instead. This isn’t dropped, it’s held.
          </p>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={5}
            placeholder="Everything you were about to say."
            className="app-input"
            style={{ width: '100%', resize: 'vertical', lineHeight: 1.5 }}
          />
          <button
            onClick={hold}
            style={{
              width: '100%', marginTop: '0.75rem', padding: '0.875rem',
              borderRadius: '0.875rem', border: 'none', cursor: 'pointer',
              backgroundColor: 'var(--accent)', color: '#fff', fontSize: '0.9375rem', fontWeight: 700,
            }}
          >
            Hold it until tomorrow
          </button>
          {held && (
            <p style={{ color: 'var(--positive-text)', fontSize: '0.875rem', fontWeight: 600, marginTop: '0.75rem' }}>
              Held. It’ll be waiting in the morning.
            </p>
          )}
        </div>
      )}

      {answered && !wobbly && (
        <p style={{ color: 'var(--subtle)', fontSize: '0.9375rem', lineHeight: 1.5 }}>
          Then it’s probably real. It’ll still be real in half an hour, and you’ll say it better then.
        </p>
      )}
    </>
  );
}

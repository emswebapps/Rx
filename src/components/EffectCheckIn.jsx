import { useState } from 'react';
import { X } from 'lucide-react';
import { SCALES, SIDE_EFFECTS } from '../lib/effects.js';

/**
 * A few taps about how the dose is working.
 *
 * Every row is optional; Save with only focus rated is a perfectly good
 * check-in. "Not now" dismisses it for this dose and phase without recording
 * anything, so the card doesn't hang around nagging.
 */
export default function EffectCheckIn({ title, subtitle, onSave, onDismiss }) {
  const [values, setValues] = useState({});
  const [side, setSide] = useState([]);
  const toggle = (id) => setSide((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const any = Object.keys(values).length > 0 || side.length > 0;

  return (
    <div className="app-card" style={{ padding: '1rem', borderColor: 'var(--accent)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text)' }}>{title}</p>
          {subtitle && <p style={{ fontSize: '0.8125rem', color: 'var(--subtle)', marginTop: '0.125rem' }}>{subtitle}</p>}
        </div>
        {onDismiss && (
          <button onClick={onDismiss} aria-label="Not now" style={{
            background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: '0.25rem',
          }}>
            <X size={18} />
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gap: '0.625rem' }}>
        {SCALES.map((s) => (
          <div key={s.key}>
            <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: '0.25rem' }}>
              <span style={{ flex: 1, fontSize: '0.8125rem', fontWeight: 700, color: 'var(--muted)' }}>{s.label}</span>
              <span style={{ fontSize: '0.6875rem', color: 'var(--subtle)' }}>{s.low} → {s.high}</span>
            </div>
            <div style={{ display: 'flex', gap: '0.375rem' }} role="radiogroup" aria-label={s.label}>
              {[1, 2, 3, 4, 5].map((n) => {
                const on = values[s.key] === n;
                return (
                  <button
                    key={n}
                    role="radio"
                    aria-checked={on}
                    onClick={() => setValues((v) => ({ ...v, [s.key]: on ? undefined : n }))}
                    style={{
                      flex: 1, height: '2.5rem', borderRadius: '0.625rem', cursor: 'pointer',
                      backgroundColor: on ? 'var(--accent)' : 'var(--surface2)',
                      border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
                      color: on ? '#fff' : 'var(--text)', fontSize: '1rem', fontWeight: 800,
                    }}
                  >
                    {n}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <p style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--muted)', margin: '0.75rem 0 0.375rem' }}>
        Anything else?
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
        {SIDE_EFFECTS.map((s) => {
          const on = side.includes(s.id);
          return (
            <button
              key={s.id}
              onClick={() => toggle(s.id)}
              aria-pressed={on}
              style={{
                padding: '0.375rem 0.625rem', borderRadius: '9999px', cursor: 'pointer',
                backgroundColor: on ? 'var(--accent-soft)' : 'var(--surface2)',
                border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
                color: on ? 'var(--accent-text)' : 'var(--text)', fontSize: '0.8125rem', fontWeight: 600,
              }}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      <button
        onClick={() => onSave({
          ...Object.fromEntries(Object.entries(values).filter(([, v]) => v != null)),
          sideEffects: side,
        })}
        disabled={!any}
        className="app-btn-primary"
        style={{ width: '100%', marginTop: '0.875rem', opacity: any ? 1 : 0.5 }}
      >
        Save check-in
      </button>
    </div>
  );
}

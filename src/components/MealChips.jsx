import { useNavigate } from 'react-router-dom';
import { Check, AlertTriangle } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { okMeals, avoidHits } from '../lib/mealLibrary.js';

/**
 * Your approved meals as one-tap chips — for filling in a routine's meal or
 * saying what you actually had. Empty list, and it offers to start one.
 */
export default function MealChips({ onPick, selected = '', max = 12 }) {
  const { rxMeals } = useApp();
  const navigate = useNavigate();
  const meals = okMeals(rxMeals).slice(0, max);
  const sel = String(selected || '').trim().toLowerCase();

  if (meals.length === 0) {
    return (
      <button onClick={() => navigate('/meals')} style={link}>
        + Save meals that work for you, then pick them here
      </button>
    );
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3125rem', alignItems: 'center' }}>
      {meals.map((m) => {
        const on = m.name.toLowerCase() === sel;
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => onPick(m.name)}
            title={m.note || undefined}
            aria-pressed={on}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.25rem',
              padding: '0.3125rem 0.625rem', borderRadius: '9999px', cursor: 'pointer',
              backgroundColor: on ? 'var(--accent-soft)' : 'var(--surface2)',
              border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
              color: on ? 'var(--accent-text)' : 'var(--text)', fontSize: '0.8125rem', fontWeight: 600,
            }}
          >
            {on && <Check size={12} strokeWidth={3} />}
            {m.name}
          </button>
        );
      })}
      <button onClick={() => navigate('/meals')} style={link}>Edit list</button>
    </div>
  );
}

/** "OJ is on your avoid list" — shown under anything typed or logged. */
export function AvoidWarning({ text }) {
  const { rxMeals } = useApp();
  const hits = avoidHits(rxMeals, text);
  if (hits.length === 0) return null;
  return (
    <p style={{
      display: 'flex', gap: '0.375rem', alignItems: 'flex-start',
      fontSize: '0.8125rem', fontWeight: 700, color: 'var(--danger)', lineHeight: 1.4, marginTop: '0.25rem',
    }}>
      <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: '0.125rem' }} />
      <span>
        {hits.map((h) => h.name).join(', ')} {hits.length === 1 ? 'is' : 'are'} on your avoid list
        {hits[0].note ? ` — ${hits[0].note}` : ''}
      </span>
    </p>
  );
}

const link = {
  background: 'none', border: 'none', padding: '0.25rem 0.125rem', cursor: 'pointer',
  fontSize: '0.8125rem', fontWeight: 700, color: 'var(--accent-text)',
};

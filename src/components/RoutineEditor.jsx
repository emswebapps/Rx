import { Plus, X, ChevronUp, ChevronDown, Hourglass, Pill, ListChecks, Utensils } from 'lucide-react';
import { routinePreset } from '../lib/routine.js';

/**
 * The steps around one dose time, in the order they're done.
 *
 * The dose is a step like the others so it can sit anywhere — after eating and
 * a wait, or before a "drink a full glass" that should follow it. There is
 * always exactly one; it can be moved but not removed, because a routine
 * around a dose with no dose in it is just a to-do list.
 */
export default function RoutineEditor({ routine, onChange }) {
  const steps = Array.isArray(routine) ? routine : [];
  const stamp = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

  if (steps.length === 0) {
    return (
      <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button onClick={() => onChange(routinePreset(15))} style={chip(true)}>
          <ListChecks size={14} /> Meal → wait 15 min → take
        </button>
        <button onClick={() => onChange(routinePreset(30))} style={chip(true)}>
          <ListChecks size={14} /> Meal → wait 30 min → take
        </button>
        <button
          onClick={() => onChange([{ id: `s-${stamp()}`, kind: 'meal', text: '' }, { id: `s-${stamp()}`, kind: 'dose' }])}
          style={chip(true)}
        >
          <Utensils size={14} /> Meal → take
        </button>
        <button
          onClick={() => onChange([{ id: `s-${stamp()}`, kind: 'task', text: '' }, { id: `s-${stamp()}`, kind: 'dose' }])}
          style={chip(false)}
        >
          <Plus size={14} /> Build a routine
        </button>
      </div>
    );
  }

  const update = (id, patch) => onChange(steps.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const remove = (id) => {
    const next = steps.filter((s) => s.id !== id);
    onChange(next.some((s) => s.kind !== 'dose') ? next : []);
  };
  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= steps.length) return;
    const next = [...steps];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  // New steps go in just before the dose — "one more thing first" is the
  // common edit.
  const insert = (step) => {
    const at = steps.findIndex((s) => s.kind === 'dose');
    const next = [...steps];
    next.splice(at < 0 ? next.length : at, 0, step);
    onChange(next);
  };

  return (
    <div style={{ marginTop: '0.875rem' }}>
      <p style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--muted)', letterSpacing: '0.04em', marginBottom: '0.375rem' }}>
        ROUTINE
      </p>
      <p style={{ fontSize: '0.75rem', color: 'var(--subtle)', lineHeight: 1.45, marginBottom: '0.5rem' }}>
        Shown on Today in this order. A wait starts when you check off the step above it.
      </p>
      <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.375rem' }}>
        {steps.map((s, i) => (
          <li key={s.id} style={{
            display: 'flex', alignItems: 'center', gap: '0.375rem',
            padding: '0.375rem 0.375rem 0.375rem 0.625rem', borderRadius: '0.625rem',
            backgroundColor: 'var(--surface)', border: '1px solid var(--border)',
          }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--subtle)', width: '1rem' }}>{i + 1}</span>
            {s.kind === 'dose' ? (
              <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.875rem', fontWeight: 700, color: 'var(--text)' }}>
                <Pill size={14} style={{ color: 'var(--accent-text)' }} /> Take the dose
              </span>
            ) : s.kind === 'wait' ? (
              <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.875rem', color: 'var(--text)' }}>
                <Hourglass size={14} style={{ color: 'var(--accent-text)' }} /> Wait
                <input
                  type="number" min="1" step="1" inputMode="numeric"
                  value={s.minutes ?? ''}
                  onChange={(e) => update(s.id, { minutes: e.target.value === '' ? '' : Number(e.target.value) })}
                  className="app-input"
                  style={{ width: '4.25rem', padding: '0.375rem 0.5rem' }}
                  aria-label="Minutes to wait"
                />
                min
              </span>
            ) : s.kind === 'meal' ? (
              <span style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                <Utensils size={14} style={{ color: 'var(--accent-text)', flexShrink: 0 }} />
                <input
                  value={s.text || ''}
                  onChange={(e) => update(s.id, { text: e.target.value })}
                  placeholder="What you eat — e.g. 2 eggs"
                  className="app-input"
                  style={{ flex: 1, minWidth: 0, padding: '0.375rem 0.5rem' }}
                  aria-label={`Meal, step ${i + 1}`}
                />
              </span>
            ) : (
              <input
                value={s.text || ''}
                onChange={(e) => update(s.id, { text: e.target.value })}
                placeholder="Something to do"
                className="app-input"
                style={{ flex: 1, minWidth: 0, padding: '0.375rem 0.5rem' }}
                aria-label={`Step ${i + 1}`}
              />
            )}
            <IconBtn label="Move up" onClick={() => move(i, -1)} disabled={i === 0}><ChevronUp size={15} /></IconBtn>
            <IconBtn label="Move down" onClick={() => move(i, 1)} disabled={i === steps.length - 1}><ChevronDown size={15} /></IconBtn>
            {s.kind !== 'dose' && (
              <IconBtn label="Remove step" onClick={() => remove(s.id)}><X size={15} /></IconBtn>
            )}
          </li>
        ))}
      </ol>
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
        <button onClick={() => insert({ id: `s-${stamp()}`, kind: 'meal', text: '' })} style={chip(false)}>
          <Utensils size={14} /> Meal
        </button>
        <button onClick={() => insert({ id: `s-${stamp()}`, kind: 'task', text: '' })} style={chip(false)}>
          <Plus size={14} /> Step
        </button>
        <button onClick={() => insert({ id: `s-${stamp()}`, kind: 'wait', minutes: 30 })} style={chip(false)}>
          <Hourglass size={14} /> Wait
        </button>
        <button onClick={() => onChange([])} style={{ ...chip(false), color: 'var(--muted)' }}>
          Remove routine
        </button>
      </div>
    </div>
  );
}

function IconBtn({ label, onClick, disabled, children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      style={{
        background: 'none', border: 'none', padding: '0.25rem', flexShrink: 0,
        cursor: disabled ? 'default' : 'pointer', color: 'var(--muted)', opacity: disabled ? 0.3 : 1,
      }}
    >
      {children}
    </button>
  );
}

function chip(primary) {
  return {
    display: 'flex', alignItems: 'center', gap: '0.375rem',
    padding: '0.5rem 0.75rem', borderRadius: '0.625rem', cursor: 'pointer',
    backgroundColor: primary ? 'var(--accent-soft)' : 'var(--surface)',
    border: `1px solid ${primary ? 'var(--accent)' : 'var(--border)'}`,
    color: primary ? 'var(--accent-text)' : 'var(--text)',
    fontSize: '0.8125rem', fontWeight: 700,
  };
}

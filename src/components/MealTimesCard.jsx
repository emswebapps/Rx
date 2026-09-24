import { useState } from 'react';
import { Check, Utensils, Undo2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatClock } from '../lib/time.js';
import { formatUntil } from '../lib/next.js';
import { describeTiming } from '../lib/mealPlan.js';
import { proteinFor, proteinTotal } from '../lib/mealLibrary.js';
import MealChips, { AvoidWarning } from './MealChips.jsx';

/**
 * Today's meals: the ones on your meal times, each with its time and one tap
 * to say it's eaten, and the day's protein from everything eaten so far —
 * those plus the meals in your dose routines.
 *
 * `rows` is mealsForDay; `routineMeals` is routineMealsOnDay.
 */
export default function MealTimesCard({ rows, routineMeals, now, onAte, onSkip, onUndo }) {
  const { rxMeals } = useApp();
  const [open, setOpen] = useState(null);

  const eatenFoods = [
    ...routineMeals.map((r) => r.food),
    ...rows.filter((r) => r.state === 'eaten').map((r) => r.food),
  ];
  const protein = proteinTotal(rxMeals, eatenFoods);
  const anyProtein = rxMeals.some((m) => m && Number(m.protein) > 0);
  if (rows.length === 0 && !(anyProtein && eatenFoods.length)) return null;

  return (
    <section className="app-card" style={{ marginTop: '1rem', padding: '0.75rem 0.875rem' }}>
      <p style={{
        display: 'flex', alignItems: 'center', gap: '0.375rem',
        fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.06em', color: 'var(--muted)',
      }}>
        <Utensils size={14} /> <span style={{ flex: 1 }}>MEALS</span>
        {anyProtein && (
          <span style={{ color: 'var(--text)', letterSpacing: 0, fontSize: '0.8125rem', fontVariantNumeric: 'tabular-nums' }}>
            {protein.grams} g protein
            {protein.unknown > 0 && (
              <span style={{ color: 'var(--subtle)', fontWeight: 600 }}> · {protein.unknown} not counted</span>
            )}
          </span>
        )}
      </p>

      {routineMeals.length > 0 && (
        <div style={{ marginTop: '0.375rem' }}>
          {routineMeals.map((r) => (
            <Row
              key={r.id}
              done
              title={r.food}
              detail={`With ${r.medName || 'your dose'} · ${formatClock(r.ateAt)}`}
              protein={proteinFor(rxMeals, r.food)}
            />
          ))}
        </div>
      )}

      {rows.map((r) => {
        const done = r.state === 'eaten';
        const when = r.state === 'eaten' ? `Ate at ${formatClock(r.eatenAt)}${r.changed ? ` · instead of ${r.meal.food || 'the plan'}` : ''}`
          : r.state === 'skipped' ? 'Skipped'
            : r.state === 'waiting' ? describeTiming(r.meal)
              : r.state === 'due' ? `Now · was due ${formatClock(r.dueAt)}`
                : r.state === 'passed' ? `Was due ${formatClock(r.dueAt)}`
                  : `${r.projected ? 'About ' : ''}${formatClock(r.dueAt)} · in ${formatUntil(r.dueAt - now)}${r.projected ? ' if your next dose is on time' : ''}`;
        const expanded = open === r.id;
        return (
          <div key={r.id} style={{ borderTop: '1px solid var(--border)', marginTop: '0.375rem', paddingTop: '0.375rem' }}>
            <Row
              done={done}
              faded={r.state === 'skipped' || r.state === 'passed'}
              accent={r.state === 'due'}
              title={r.meal.name}
              sub={r.food}
              detail={when}
              protein={r.food ? proteinFor(rxMeals, r.food) : null}
              onClick={() => setOpen(expanded ? null : r.id)}
              action={!done && r.state !== 'skipped' ? (
                <button
                  onClick={(e) => { e.stopPropagation(); onAte(r.id); }}
                  className="app-btn-primary"
                  style={{ width: 'auto', flex: 'none', padding: '0.375rem 0.75rem', fontSize: '0.8125rem' }}
                >
                  Ate it
                </button>
              ) : null}
            />
            <div style={{ marginLeft: '1.75rem' }}><AvoidWarning text={r.food} /></div>
            {expanded && (
              <Expanded row={r} onAte={onAte} onSkip={onSkip} onUndo={onUndo} close={() => setOpen(null)} />
            )}
          </div>
        );
      })}
    </section>
  );
}

function Row({ done, faded, accent, title, sub, detail, protein, onClick, action }) {
  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter') onClick(); } : undefined}
      style={{
        display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0.25rem 0',
        cursor: onClick ? 'pointer' : 'default', opacity: faded ? 0.6 : 1,
      }}
    >
      <span style={{
        width: '1.125rem', height: '1.125rem', borderRadius: '9999px', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backgroundColor: done ? 'var(--positive)' : 'transparent',
        border: done ? 'none' : `2px solid ${accent ? 'var(--accent)' : 'var(--border)'}`,
        color: '#fff',
      }}>
        {done && <Check size={12} strokeWidth={3} />}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{
          display: 'block', fontSize: '0.875rem', fontWeight: 700,
          color: done ? 'var(--subtle)' : 'var(--text)',
        }}>
          {title}
        </span>
        {sub && (
          <span style={{ display: 'block', fontSize: '0.8125rem', color: done ? 'var(--subtle)' : 'var(--text)', lineHeight: 1.35 }}>
            {sub}
          </span>
        )}
        <span style={{ display: 'block', fontSize: '0.8125rem', color: accent ? 'var(--accent-text)' : 'var(--subtle)', fontWeight: accent ? 700 : 400 }}>
          {detail}
          {protein != null && <span style={{ color: 'var(--muted)' }}> · {protein} g</span>}
        </span>
      </span>
      {action}
    </div>
  );
}

/** Something else, skip, or take it back. */
function Expanded({ row, onAte, onSkip, onUndo, close }) {
  const [text, setText] = useState(row.changed ? row.food : '');
  const settled = row.state === 'eaten' || row.state === 'skipped';
  const save = (value) => { if (String(value || '').trim()) { onAte(row.id, value); close(); } };
  return (
    <div style={{ margin: '0.25rem 0 0.375rem 1.75rem', display: 'grid', gap: '0.375rem' }}>
      <p style={{ fontSize: '0.8125rem', color: 'var(--subtle)' }}>Had something else?</p>
      <MealChips selected={text} onPick={(name) => save(name)} max={8} />
      <div style={{ display: 'flex', gap: '0.375rem' }}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') save(text); }}
          placeholder="What did you have?"
          className="app-input"
          style={{ flex: 1, minWidth: 0, padding: '0.4375rem 0.625rem', fontSize: '0.875rem' }}
        />
        <button onClick={() => save(text)} className="app-btn-primary" style={{ width: 'auto', flex: 'none', padding: '0.4375rem 0.875rem', fontSize: '0.8125rem' }}>
          Save
        </button>
      </div>
      <div style={{ display: 'flex', gap: '1rem' }}>
        {!settled && (
          <button onClick={() => { onSkip(row.id); close(); }} style={link}>Skip this one today</button>
        )}
        {settled && (
          <button onClick={() => { onUndo(row.id); close(); }} style={{ ...link, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <Undo2 size={13} /> {row.state === 'skipped' ? 'Undo skip' : 'Not eaten yet'}
          </button>
        )}
      </div>
    </div>
  );
}

const link = {
  background: 'none', border: 'none', padding: 0, cursor: 'pointer',
  fontSize: '0.8125rem', fontWeight: 700, color: 'var(--accent-text)',
};

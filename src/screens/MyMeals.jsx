import { useState } from 'react';
import { Check, Ban, Trash2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useBack } from '../lib/useBack.js';
import { okMeals, avoidMeals, MEAL_STATUS } from '../lib/mealLibrary.js';
import { ViewHeader, Segmented, pageStyle } from '../components/medsUi.jsx';
import { mealLog } from '../lib/meals.js';

/**
 * My meals: what works with my medication, and what to avoid.
 *
 * The list is yours — built from what your prescriber or pharmacist told you
 * and what your own mornings showed. Rx doesn't mark anything safe or unsafe;
 * it just keeps your answers where you'll see them when you're choosing.
 */
export default function MyMeals() {
  const { rxMeals, saveRxMeal, deleteRxMeal, crashMeds, crashDoses, rxRoutineRuns, rxEffects } = useApp();
  const back = useBack('/setup');
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [status, setStatus] = useState('ok');
  const [editing, setEditing] = useState(null);

  const ok = okMeals(rxMeals);
  const avoid = avoidMeals(rxMeals);
  const known = new Set(rxMeals.map((m) => String(m.name || '').trim().toLowerCase()));
  // Meals you've actually eaten before a dose that aren't on either list —
  // one tap to approve.
  const eaten = [...new Set(mealLog(crashMeds, crashDoses, rxRoutineRuns, rxEffects).map((r) => r.food.trim()))]
    .filter((f) => f && !known.has(f.toLowerCase()))
    .slice(0, 8);

  // The four that work, one tap to add while the list is empty. The protein
  // figures are rough label numbers, there so the choices can be compared.
  const STARTERS = [
    { name: '1 egg', note: 'Before dose 1' },
    { name: 'Ready Clean Bar', note: 'Before doses 2 and 3' },
    { name: 'Banana + 2 tbsp peanut butter', note: '~9 g protein' },
    { name: 'Snack', note: 'Anything with some protein' },
  ];
  const starters = STARTERS.filter((m) => !known.has(m.name.toLowerCase()));

  const add = () => {
    if (!name.trim()) return;
    saveRxMeal({ name, note, status });
    setName(''); setNote('');
  };

  return (
    <div className="app-page" style={pageStyle}>
      <ViewHeader title="My meals" onBack={back} />
      <p style={{ fontSize: '0.875rem', color: 'var(--subtle)', lineHeight: 1.5, marginBottom: '1rem' }}>
        Meals you know work with your dose, and ones to avoid. You decide what goes here — ask your
        prescriber or pharmacist if you’re not sure about a food.
      </p>

      {rxMeals.length === 0 && (
        <div className="app-card" style={{ padding: '0.875rem', marginBottom: '0.75rem', borderColor: 'var(--accent)' }}>
          <p style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--text)', marginBottom: '0.5rem' }}>Start with your usual meals</p>
          <ul style={{ margin: '0 0 0.625rem 1rem', padding: 0, fontSize: '0.875rem', color: 'var(--muted)', lineHeight: 1.6 }}>
            {starters.map((m) => <li key={m.name}>{m.name} <span style={{ color: 'var(--subtle)' }}>· {m.note}</span></li>)}
          </ul>
          <button onClick={() => saveRxMeal(starters.map((m) => ({ ...m, status: 'ok' })))} className="app-btn-primary">
            Add all of these
          </button>
        </div>
      )}

      <div className="app-card" style={{ padding: '0.875rem', display: 'grid', gap: '0.5rem' }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
          placeholder="Meal — e.g. 2 eggs + toast"
          className="app-input"
          aria-label="Meal name"
        />
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note (optional) — e.g. high protein, no juice"
          className="app-input"
          aria-label="Note"
        />
        <Segmented options={MEAL_STATUS} value={status} onChange={setStatus} />
        <button onClick={add} disabled={!name.trim()} className="app-btn-primary" style={{ opacity: name.trim() ? 1 : 0.5 }}>
          Save meal
        </button>
      </div>

      {eaten.length > 0 && (
        <>
          <h2 style={heading}>EATEN BEFORE A DOSE — NOT ON A LIST YET</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
            {eaten.map((f) => (
              <button key={f} onClick={() => saveRxMeal({ name: f, status: 'ok' })} style={chip}>
                <Check size={13} /> {f}
              </button>
            ))}
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--subtle)', marginTop: '0.375rem' }}>Tap to add to “Works for me”.</p>
        </>
      )}

      <List title={`WORKS FOR ME · ${ok.length}`} items={ok} Icon={Check} tone="var(--positive-text)"
        editing={editing} setEditing={setEditing} onSave={saveRxMeal} onDelete={deleteRxMeal}
        empty="Nothing yet. Add the meals you usually eat before a dose." />
      <List title={`AVOID · ${avoid.length}`} items={avoid} Icon={Ban} tone="var(--danger)"
        editing={editing} setEditing={setEditing} onSave={saveRxMeal} onDelete={deleteRxMeal}
        empty="Nothing here. If you log one of these, Rx will point it out." />
    </div>
  );
}

function List({ title, items, Icon, tone, editing, setEditing, onSave, onDelete, empty }) {
  return (
    <>
      <h2 style={heading}>{title}</h2>
      {items.length === 0 ? (
        <p style={{ fontSize: '0.875rem', color: 'var(--subtle)' }}>{empty}</p>
      ) : (
        <div style={{ display: 'grid', gap: '0.375rem' }}>
          {items.map((m) => (editing === m.id ? (
            <EditRow key={m.id} meal={m} onDone={(patch) => { if (patch) onSave({ ...m, ...patch }); setEditing(null); }} onDelete={() => onDelete(m.id)} />
          ) : (
            <button key={m.id} onClick={() => setEditing(m.id)} className="app-card" style={{
              display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0.625rem 0.875rem',
              textAlign: 'left', cursor: 'pointer', width: '100%',
            }}>
              <Icon size={16} style={{ color: tone, flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: '0.9375rem', fontWeight: 700, color: 'var(--text)' }}>{m.name}</span>
                {m.note && <span style={{ display: 'block', fontSize: '0.8125rem', color: 'var(--subtle)' }}>{m.note}</span>}
              </span>
            </button>
          )))}
        </div>
      )}
    </>
  );
}

function EditRow({ meal, onDone, onDelete }) {
  const [note, setNote] = useState(meal.note);
  const [status, setStatus] = useState(meal.status);
  return (
    <div className="app-card" style={{ padding: '0.75rem', display: 'grid', gap: '0.5rem' }}>
      <p style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--text)' }}>{meal.name}</p>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note" className="app-input" />
      <Segmented options={MEAL_STATUS} value={status} onChange={setStatus} />
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button onClick={() => onDone({ note, status })} className="app-btn-primary" style={{ flex: 1 }}>Save</button>
        <button onClick={() => onDone(null)} style={{ ...chip, padding: '0 1rem' }}>Cancel</button>
        <button onClick={onDelete} aria-label="Delete meal" style={{ ...chip, padding: '0 0.75rem', color: 'var(--danger)' }}>
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
}

const heading = {
  fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.06em', color: 'var(--muted)', margin: '1.25rem 0 0.5rem',
};
const chip = {
  display: 'flex', alignItems: 'center', gap: '0.3125rem', padding: '0.4375rem 0.75rem', borderRadius: '9999px',
  cursor: 'pointer', backgroundColor: 'var(--surface2)', border: '1px solid var(--border)',
  color: 'var(--text)', fontSize: '0.8125rem', fontWeight: 700,
};

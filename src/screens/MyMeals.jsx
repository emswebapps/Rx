import { useState } from 'react';
import { Check, Ban, Trash2, Clock, Plus, ChevronRight } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useBack } from '../lib/useBack.js';
import { okMeals, avoidMeals, MEAL_STATUS, grams } from '../lib/mealLibrary.js';
import { mergeMealPlan, normalizePlanMeal, describeTiming, MEAL_ANCHORS } from '../lib/mealPlan.js';
import { mergeKit } from '../lib/kit.js';
import { generateId } from '../utils/id';
import { ViewHeader, Segmented, pageStyle } from '../components/medsUi.jsx';
import MealChips from '../components/MealChips.jsx';
import { mealLog } from '../lib/meals.js';

/**
 * My meals: when I eat, what works with my medication, and what to avoid.
 *
 * The list is yours — built from what your prescriber or pharmacist told you
 * and what your own mornings showed. Rx doesn't mark anything safe or unsafe;
 * it just keeps your answers where you'll see them when you're choosing.
 */
export default function MyMeals() {
  const {
    rxMeals, saveRxMeal, deleteRxMeal, crashMeds, crashDoses, rxRoutineRuns, rxEffects,
    crashKit, updateCrashKit,
  } = useApp();
  const back = useBack('/setup');
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [protein, setProtein] = useState('');
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

  const add = () => {
    if (!name.trim()) return;
    saveRxMeal({ name, note, status, protein: status === 'ok' ? protein : null });
    setName(''); setNote(''); setProtein('');
  };

  const plan = mergeMealPlan(mergeKit(crashKit).mealPlan);
  const savePlan = (meals) => updateCrashKit({ mealPlan: { meals } });

  return (
    <div className="app-page" style={pageStyle}>
      <ViewHeader title="My meals" onBack={back} />
      <p style={{ fontSize: '0.875rem', color: 'var(--subtle)', lineHeight: 1.5, marginBottom: '1rem' }}>
        When you eat, meals you know work with your dose, and ones to avoid. You decide what goes
        here — ask your prescriber or pharmacist if you’re not sure about a food.
      </p>

      <MealTimes
        meals={plan.meals}
        editing={editing}
        setEditing={setEditing}
        onSave={(meal) => savePlan(plan.meals.some((m) => m.id === meal.id)
          ? plan.meals.map((m) => (m.id === meal.id ? meal : m))
          : [...plan.meals, meal])}
        onDelete={(id) => savePlan(plan.meals.filter((m) => m.id !== id))}
      />

      <h2 style={heading}>SAVE A MEAL</h2>
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
        {status === 'ok' && <ProteinInput value={protein} onChange={setProtein} />}
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

/**
 * Meals with their own time: lunch a few hours after breakfast, dinner as
 * the last dose wears off. Each shows on Today with its time and buzzes when
 * it comes due.
 */
function MealTimes({ meals, editing, setEditing, onSave, onDelete }) {
  const [draft, setDraft] = useState(null);
  const startNew = () => {
    setEditing(null);
    setDraft(normalizePlanMeal({ id: generateId(), name: '', anchor: 'afterMeal', minutes: 210 }, meals.length));
  };

  return (
    <>
      <h2 style={{ ...heading, marginTop: 0 }}>MEAL TIMES · {meals.length}</h2>
      <p style={{ fontSize: '0.8125rem', color: 'var(--subtle)', lineHeight: 1.5, marginBottom: '0.5rem' }}>
        Meals that aren’t part of a dose routine. Each one is timed from what actually happened today,
        so a late breakfast moves lunch with it.
      </p>
      <div style={{ display: 'grid', gap: '0.375rem' }}>
        {meals.map((m) => (editing === `plan-${m.id}` ? (
          <PlanMealEditor
            key={m.id}
            meal={m}
            onDone={(next) => { if (next) onSave(next); setEditing(null); }}
            onDelete={() => { onDelete(m.id); setEditing(null); }}
          />
        ) : (
          <button key={m.id} onClick={() => { setDraft(null); setEditing(`plan-${m.id}`); }} className="app-card" style={{
            display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0.625rem 0.875rem',
            textAlign: 'left', cursor: 'pointer', width: '100%',
          }}>
            <Clock size={16} style={{ color: 'var(--accent-text)', flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: '0.9375rem', fontWeight: 700, color: 'var(--text)' }}>
                {m.name}{m.food ? <span style={{ fontWeight: 400, color: 'var(--subtle)' }}> · {m.food}</span> : null}
              </span>
              <span style={{ display: 'block', fontSize: '0.8125rem', color: 'var(--subtle)' }}>{describeTiming(m)}</span>
            </span>
            <ChevronRight size={16} style={{ color: 'var(--muted)' }} />
          </button>
        )))}
        {draft ? (
          <PlanMealEditor
            meal={draft}
            isNew
            onDone={(next) => { if (next) onSave(next); setDraft(null); }}
          />
        ) : (
          <button onClick={startNew} style={{ ...chip, justifyContent: 'center', borderRadius: '0.75rem', padding: '0.625rem' }}>
            <Plus size={15} /> Add a meal time
          </button>
        )}
      </div>
    </>
  );
}

function PlanMealEditor({ meal, isNew, onDone, onDelete }) {
  const [m, setM] = useState(meal);
  // Hours as typed, so "3.5" can be half-typed without snapping back.
  const [hours, setHours] = useState(String(Math.round((meal.minutes / 60) * 100) / 100));
  const set = (patch) => setM((x) => ({ ...x, ...patch }));
  const save = () => {
    const h = Number(hours);
    onDone(normalizePlanMeal({
      ...m,
      name: m.name.trim() || 'Meal',
      minutes: Number.isFinite(h) && h >= 0 ? Math.round(h * 60) : m.minutes,
    }));
  };

  return (
    <div className="app-card" style={{ padding: '0.75rem', display: 'grid', gap: '0.5rem' }}>
      <input
        autoFocus={isNew}
        value={m.name}
        onChange={(e) => set({ name: e.target.value })}
        placeholder="Name — e.g. Lunch"
        className="app-input"
        aria-label="Meal time name"
      />
      <input
        value={m.food}
        onChange={(e) => set({ food: e.target.value })}
        placeholder="What you plan to eat (optional)"
        className="app-input"
        aria-label="What you plan to eat"
      />
      <MealChips selected={m.food} onPick={(food) => set({ food })} max={8} />

      <p style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--muted)', marginTop: '0.25rem' }}>When</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.375rem' }}>
        {MEAL_ANCHORS.map((a) => (
          <button
            key={a.key}
            onClick={() => set({ anchor: a.key })}
            aria-pressed={m.anchor === a.key}
            style={{
              padding: '0.5rem', borderRadius: '0.625rem', cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 700,
              color: m.anchor === a.key ? '#fff' : 'var(--text)',
              backgroundColor: m.anchor === a.key ? 'var(--accent)' : 'var(--surface2)',
              border: `1px solid ${m.anchor === a.key ? 'var(--accent)' : 'var(--border)'}`,
            }}
          >
            {a.label}
          </button>
        ))}
      </div>

      {m.anchor === 'clock' ? (
        <input
          type="time"
          value={m.time}
          onChange={(e) => set({ time: e.target.value })}
          className="app-input"
          aria-label="Time"
        />
      ) : (
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', color: 'var(--text)' }}>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.25"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            className="app-input"
            style={{ width: '5.5rem' }}
            aria-label="Hours after"
          />
          hours after{m.anchor === 'afterMeal' ? ' I last ate' : m.anchor === 'firstDose' ? ' my first dose' : ' it wears off'}
        </label>
      )}
      <p style={{ fontSize: '0.75rem', color: 'var(--subtle)', lineHeight: 1.5 }}>
        {m.anchor === 'afterMeal' && 'Counts from the last meal you ticked today — a routine’s meal or one of these. Nothing eaten yet, it counts from your first dose.'}
        {m.anchor === 'firstDose' && 'Counts from the first dose you log today. 0 means with it.'}
        {m.anchor === 'wearOff' && 'Counts from when your last dose of the day wears off — the start of your evening window. Until that dose is in, Today shows it as an estimate and it doesn’t buzz.'}
        {m.anchor === 'clock' && 'The same time every day.'}
      </p>

      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button onClick={save} className="app-btn-primary" style={{ flex: 1 }}>{isNew ? 'Add' : 'Save'}</button>
        <button onClick={() => onDone(null)} style={{ ...chip, padding: '0 1rem' }}>Cancel</button>
        {onDelete && (
          <button onClick={onDelete} aria-label="Delete meal time" style={{ ...chip, padding: '0 0.75rem', color: 'var(--danger)' }}>
            <Trash2 size={16} />
          </button>
        )}
      </div>
    </div>
  );
}

function ProteinInput({ value, onChange }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', color: 'var(--subtle)' }}>
      <input
        type="number"
        inputMode="decimal"
        min="0"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder="—"
        className="app-input"
        style={{ width: '5.5rem' }}
        aria-label="Grams of protein"
      />
      g protein (optional)
    </label>
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
              {m.protein != null && (
                <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
                  {m.protein} g
                </span>
              )}
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
  const [protein, setProtein] = useState(meal.protein == null ? '' : String(meal.protein));
  return (
    <div className="app-card" style={{ padding: '0.75rem', display: 'grid', gap: '0.5rem' }}>
      <p style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--text)' }}>{meal.name}</p>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note" className="app-input" />
      {status === 'ok' && <ProteinInput value={protein} onChange={setProtein} />}
      <Segmented options={MEAL_STATUS} value={status} onChange={setStatus} />
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button onClick={() => onDone({ note, status, protein: grams(protein) })} className="app-btn-primary" style={{ flex: 1 }}>Save</button>
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

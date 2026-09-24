import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, X, Trash2, ChevronDown, ChevronRight, Check } from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  normalizeMed, supplyStatus, formatOffset, MED_KINDS, newMed, withDoseCount,
  DOSE_FORMS, DAY_LABELS, EVERY_DAY, DEFAULT_TIME, formatAmount, doseSpacing,
} from '../lib/meds.js';
import { headingStyle, Segmented, SupplyBar, RunOutLine, ViewHeader, pageStyle } from '../components/medsUi.jsx';
import { useBack } from '../lib/useBack.js';
import { notesForMed, preview } from '../lib/notes.js';
import { formatHours } from '../lib/window.js';
import RoutineEditor from '../components/RoutineEditor.jsx';
import { formatClock } from '../lib/time.js';

const OFFSET_CHOICES = [-120, -60, -30, -15, 0, 30, 60, 120, 240];

/**
 * One medication, on a page of its own.
 *
 * Two things this fixes about the modal it replaces.
 *
 * The first is the add flow. The old one called `addCrashMed({ name: '' })` the
 * moment you tapped +, so a medication existed before you had typed anything and
 * backing out left "Untitled" in the list for good. A new med is now held in
 * local state and written once, on Save; cancelling leaves nothing behind.
 * Editing an existing med keeps saving on every keystroke — that behaviour is
 * right for a screen opened on the way to somewhere else, and it can't orphan
 * anything, because the med is already there.
 *
 * The second is the order. What you need to add a medication and start logging
 * it is its name, its time, and how many you have. Everything the crash protocol
 * wants from it — the window arithmetic, the per-dose rules — is real, and is
 * now behind a disclosure instead of between you and the supply fields.
 */
export default function MedPage() {
  const { id } = useParams();
  const isNew = id === undefined;
  return isNew ? <NewMed /> : <EditMed id={id} />;
}

// ── Adding ──────────────────────────────────────────────────────────────────

function NewMed() {
  const { addCrashMed, crashMeds } = useApp();
  const navigate = useNavigate();
  const back = useBack('/meds');
  // `newMed()` rather than a spread of DEFAULT_MED: the spread is shallow, and
  // this draft's schedule and supply get edited in place by the form.
  const [draft, setDraft] = useState(() => newMed({ id: 'draft' }));
  const [justSaved, setJustSaved] = useState('');

  const named = String(draft.name || '').trim().length > 0;

  const commit = () => {
    const { id: _drop, ...rest } = draft;
    return addCrashMed({ ...rest, name: rest.name.trim() });
  };

  const save = () => {
    if (!named) return;
    commit();
    navigate('/meds', { replace: true });
  };

  // Setting up for the first time means typing in several at once, and going
  // back out to the list and in again for each is most of the friction in it.
  // This keeps the days and the dose count — almost always shared across a
  // regimen — and clears the parts that never are.
  const saveAndAnother = () => {
    if (!named) return;
    const saved = commit();
    setJustSaved(saved.name);
    setDraft(newMed({
      id: 'draft',
      schedule: {
        days: [...draft.schedule.days],
        // The clock positions carry — a second medication taken with the first
        // is the common case. The amount does not: how many of *this* one to
        // take has nothing to do with how many of the last one, and a number
        // filled in on a medication's behalf is the one thing this app doesn't
        // do. An offset row can't carry either, since it points at a med the
        // new one may not follow.
        times: draft.schedule.times.map((t) => ({
          ...DEFAULT_TIME,
          id: t.id,
          time: t.mode === 'clock' ? t.time : DEFAULT_TIME.time,
        })),
      },
      graceMinutes: draft.graceMinutes,
    }));
    window.scrollTo({ top: 0 });
  };

  return (
    <MedForm
      med={draft}
      title="Add a medication"
      onBack={back}
      set={(patch) => setDraft((d) => ({ ...d, ...patch }))}
      banner={justSaved ? (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem',
          padding: '0.75rem 0.875rem', borderRadius: '0.75rem',
          backgroundColor: 'var(--positive-soft)', border: '1px solid var(--positive)',
        }}>
          <Check size={15} style={{ color: 'var(--positive-text)', flexShrink: 0 }} />
          <span style={{ flex: 1, fontSize: '0.8125rem', fontWeight: 700, color: 'var(--positive-text)' }}>
            {justSaved} saved. Here’s a blank one.
          </span>
        </div>
      ) : null}
      footer={(
        <div style={{ marginTop: '1.5rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={back}
              style={{
                flex: 1, padding: '0.875rem', borderRadius: '0.75rem', cursor: 'pointer',
                backgroundColor: 'var(--surface2)', color: 'var(--text)',
                border: '1px solid var(--border)', fontSize: '0.9375rem', fontWeight: 700,
              }}
            >
              {crashMeds.length || justSaved ? 'Done' : 'Cancel'}
            </button>
            <button
              onClick={save}
              disabled={!named}
              className="app-btn-primary"
              style={{ flex: 2, opacity: named ? 1 : 0.5 }}
            >
              Save
            </button>
          </div>
          <button
            onClick={saveAndAnother}
            disabled={!named}
            style={{
              width: '100%', marginTop: '0.5rem', padding: '0.75rem', borderRadius: '0.75rem',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.375rem',
              backgroundColor: 'transparent', border: 'none',
              color: 'var(--accent-text)', fontSize: '0.875rem', fontWeight: 700,
              cursor: named ? 'pointer' : 'default', opacity: named ? 1 : 0.4,
            }}
          >
            <Plus size={15} /> Save and add another
          </button>
        </div>
      )}
      hint={named ? null : 'Give it a name and you can save. Nothing else here is required.'}
    />
  );
}

// ── Editing ─────────────────────────────────────────────────────────────────

function EditMed({ id }) {
  const { crashMeds, updateCrashMed, deleteCrashMed, refillCrashMed, rxNotes } = useApp();
  const navigate = useNavigate();
  const back = useBack('/meds');
  const raw = crashMeds.find((m) => m.id === id);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [refilling, setRefilling] = useState('');

  if (!raw) {
    return (
      <div className="app-page" style={pageStyle}>
        <ViewHeader title="Not found" onBack={back} />
        <p style={{ color: 'var(--subtle)', fontSize: '0.9375rem' }}>
          That medication isn’t on your list any more.
        </p>
      </div>
    );
  }

  const med = normalizeMed(raw);

  return (
    <MedForm
      med={med}
      title={med.name || 'Untitled'}
      onBack={back}
      set={(patch) => updateCrashMed(med.id, patch)}
      refill={{
        value: refilling,
        onChange: setRefilling,
        onSubmit: () => { refillCrashMed(med.id, Number(refilling)); setRefilling(''); },
      }}
      notes={notesForMed(rxNotes, med.id)}
      onOpenNotes={() => navigate('/notes')}
      footer={(
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1.25rem', marginTop: '1.5rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', marginBottom: '1rem' }}>
            <input
              type="checkbox"
              checked={med.active !== false}
              onChange={(e) => updateCrashMed(med.id, { active: e.target.checked })}
              style={{ width: '1.125rem', height: '1.125rem', flexShrink: 0 }}
            />
            <span style={{ fontSize: '0.875rem', color: 'var(--text)', fontWeight: 600 }}>
              Still taking this
            </span>
          </label>

          {confirmDelete ? (
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={() => { deleteCrashMed(med.id); navigate('/meds', { replace: true }); }}
                style={{
                  flex: 1, padding: '0.75rem', borderRadius: '0.75rem', cursor: 'pointer',
                  backgroundColor: 'var(--danger)', color: '#fff', border: 'none',
                  fontSize: '0.875rem', fontWeight: 700,
                }}
              >
                Delete for good
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                style={{
                  flex: 1, padding: '0.75rem', borderRadius: '0.75rem', cursor: 'pointer',
                  backgroundColor: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)',
                  fontSize: '0.875rem', fontWeight: 700,
                }}
              >
                Keep it
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.375rem',
                background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                color: 'var(--muted)', fontSize: '0.8125rem', fontWeight: 600,
              }}
            >
              <Trash2 size={14} /> Remove this medication
            </button>
          )}
          <p style={{ fontSize: '0.75rem', color: 'var(--subtle)', lineHeight: 1.5, marginTop: '0.625rem' }}>
            Unticking keeps the history. Deleting removes it from the list for
            good; doses you already logged stay where they are.
          </p>
        </div>
      )}
    />
  );
}

// ── The form itself ─────────────────────────────────────────────────────────

function MedForm({ med, title, onBack, set, footer, refill, hint, notes, onOpenNotes, banner }) {
  const { crashMeds, crashDoses } = useApp();
  const [advanced, setAdvanced] = useState(false);

  const setSchedule = (patch) => set({ schedule: { ...med.schedule, ...patch } });
  const setTime = (id, patch) => setSchedule({
    times: med.schedule.times.map((t) => (t.id === id ? { ...t, ...patch } : t)),
  });
  const addTime = () => setSchedule({
    times: [...med.schedule.times, { ...DEFAULT_TIME, id: `t${Date.now()}`, time: '20:00' }],
  });
  const removeTime = (id) => setSchedule({
    times: med.schedule.times.filter((t) => t.id !== id),
  });
  const setSupply = (patch) => set({ supply: { ...med.supply, ...patch } });
  const numberOrBlank = (v) => (v === '' ? null : Number(v));

  // A med can hang off any other med, but never off itself — that's a chain
  // with no beginning, and the resolver would just give up and say "unknown".
  const anchors = crashMeds.filter((m) => m.id !== med.id && m.active !== false);
  const status = supplyStatus(med, Date.now(), crashDoses);

  const addRule = () => set({
    rules: [...(med.rules || []), { id: `r-${Date.now()}`, text: '', offsetMinutes: -60 }],
  });
  const setRule = (id, patch) => set({
    rules: med.rules.map((r) => (r.id === id ? { ...r, ...patch } : r)),
  });
  const removeRule = (id) => set({ rules: med.rules.filter((r) => r.id !== id) });

  return (
    <div className="app-page" style={pageStyle}>
      <ViewHeader title={title} onBack={onBack} />

      {banner}

      {/* ── What it is ── */}
      <div style={{ marginBottom: '1.75rem' }}>
        <label className="app-label">Name</label>
        <input
          value={med.name}
          onChange={(e) => set({ name: e.target.value })}
          placeholder="Whatever you call it"
          className="app-input"
          style={{ width: '100%', marginBottom: '0.75rem' }}
          autoFocus={!med.name}
        />

        <label className="app-label">Strength</label>
        <input
          value={med.strength}
          onChange={(e) => set({ strength: e.target.value })}
          placeholder="Optional — 20 mg"
          className="app-input"
          style={{ width: '100%', marginBottom: '0.75rem' }}
        />

        <label className="app-label">Form</label>
        <select
          value={med.form}
          onChange={(e) => set({ form: e.target.value })}
          className="app-input"
          style={{ width: '100%' }}
        >
          {DOSE_FORMS.map((f) => (
            <option key={f.key} value={f.key}>
              {f.one[0].toUpperCase() + f.one.slice(1)}
            </option>
          ))}
        </select>

        <label className="app-label" style={{ marginTop: '0.75rem' }}>Half-life (hours)</label>
        <input
          type="number" min="0.5" step="0.5" inputMode="decimal"
          value={med.halfLifeHours ?? ''}
          onChange={(e) => set({ halfLifeHours: e.target.value === '' ? null : Number(e.target.value) })}
          placeholder="Optional — from the label or pharmacist"
          className="app-input"
          style={{ width: '100%' }}
        />
      </div>

      {/* ── When ── */}
      <div style={{ marginBottom: '1.75rem' }}>
        <h2 style={headingStyle}>WHEN</h2>

        {/* How many times a day, before the times themselves.
            This only adds and removes rows — it is the shape of the schedule,
            not a suggestion about it, in the same way DEFAULT_TIME's 08:00 is a
            place for the picker to start rather than a recommendation. Without
            it, setting up a twice-daily medication means finding "Add another
            time" underneath the first row, which is the step people miss and
            then enter the same medication twice to work around. */}
        <label className="app-label">How many times a day</label>
        <Segmented
          options={[1, 2, 3, 4].map((n) => ({ key: n, label: String(n) }))}
          value={med.schedule.times.length}
          onChange={(n) => set({ schedule: withDoseCount(med.schedule, n) })}
          style={{ marginBottom: '0.875rem' }}
        />

        <div style={{ display: 'grid', gap: '0.625rem' }}>
          {med.schedule.times.map((time, i) => (
            <TimeRow
              key={time.id}
              time={time}
              index={i}
              form={med.form}
              anchors={anchors}
              canRemove={med.schedule.times.length > 1}
              onChange={(patch) => setTime(time.id, patch)}
              onRemove={() => removeTime(time.id)}
            />
          ))}
        </div>

        <button
          onClick={addTime}
          style={{
            display: 'flex', alignItems: 'center', gap: '0.375rem', marginTop: '0.625rem',
            padding: '0.625rem 0.875rem', borderRadius: '0.75rem', cursor: 'pointer',
            backgroundColor: 'var(--surface2)', border: '1px solid var(--border)',
            color: 'var(--text)', fontSize: '0.875rem', fontWeight: 700,
          }}
        >
          <Plus size={15} /> Add another time
        </button>

        {med.schedule.times.length > 1 && (
          <div style={{ marginTop: '1rem' }}>
            <label className="app-label">Later doses</label>
            <Segmented
              options={[
                { key: 'clock', label: 'At their set times' },
                { key: 'wearOff', label: 'When the last wears off' },
              ]}
              value={doseSpacing(med)}
              onChange={(spacing) => set({ spacing })}
            />
            <p style={{ fontSize: '0.75rem', color: 'var(--subtle)', lineHeight: 1.5, marginTop: '0.5rem' }}>
              {doseSpacing(med) === 'wearOff'
                ? `Each dose after the first is due ${med.onsetHours}h after you actually took the one before — take it at 8:16 and the next is ${formatClock(new Date(2026, 0, 5, 8, 16).getTime() + Number(med.onsetHours) * 3600000)}. The first dose keeps its set time.`
                : 'Each dose is due at the time set above, whenever the one before was taken.'}
            </p>
          </div>
        )}

        <label className="app-label" style={{ marginTop: '1.25rem' }}>Which days</label>
        <DayPicker
          days={med.schedule.days}
          onChange={(days) => setSchedule({ days })}
        />

        <label className="app-label" style={{ marginTop: '1rem' }}>
          How long past a time before it counts as missed
        </label>
        <Segmented
          options={[0, 15, 45, 90].map((n) => ({ key: n, label: n === 0 ? 'Straight away' : `${n} min` }))}
          value={med.graceMinutes}
          onChange={(graceMinutes) => set({ graceMinutes })}
        />
      </div>

      {/* ── What's left ── */}
      <div style={{ marginBottom: '1.75rem' }}>
        <h2 style={headingStyle}>WHAT’S LEFT</h2>
        {/* On hand gets the full width. Three number fields across a phone left
            it about six characters wide, which truncated its own placeholder
            to "Not cc" — and that placeholder is the only thing that says
            leaving it empty means "not counting" rather than "none left". */}
        <div style={{ marginBottom: '0.875rem' }}>
          <label className="app-label">On hand</label>
          <input
            type="number" min="0" inputMode="numeric"
            value={med.supply.onHand ?? ''}
            onChange={(e) => setSupply({ onHand: numberOrBlank(e.target.value) })}
            placeholder="Not counting"
            className="app-input" style={{ width: '100%' }}
          />
          <p style={{ fontSize: '0.75rem', color: 'var(--subtle)', lineHeight: 1.5, marginTop: '0.375rem' }}>
            Optional. Left empty, Rx tracks the doses but not the bottle.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.875rem' }}>
          <div style={{ flex: 1 }}>
            <label className="app-label">Warn under (days left)</label>
            <input
              type="number" min="0" step="1"
              value={med.supply.lowDays}
              onChange={(e) => setSupply({ lowDays: Number(e.target.value) })}
              className="app-input" style={{ width: '100%' }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label className="app-label">Can refill from</label>
            <input
              type="date"
              value={med.supply.refillFrom || ''}
              onChange={(e) => setSupply({ refillFrom: e.target.value })}
              className="app-input" style={{ width: '100%' }}
            />
          </div>
        </div>

        <SupplyBar status={status} />
        <RunOutLine status={status} />

        {refill && (
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.875rem' }}>
            <input
              type="number" min="0" inputMode="numeric"
              value={refill.value}
              onChange={(e) => refill.onChange(e.target.value)}
              placeholder="Filled — how many?"
              className="app-input" style={{ flex: 1 }}
            />
            <button
              onClick={refill.onSubmit}
              disabled={refill.value === '' || Number.isNaN(Number(refill.value))}
              className="app-btn-primary"
              style={{ opacity: refill.value === '' ? 0.5 : 1, flexShrink: 0 }}
            >
              Refilled
            </button>
          </div>
        )}
      </div>

      {/* ── What I've noticed about this one ── */}
      {notes && notes.length > 0 && (
        <div style={{ marginBottom: '1.75rem' }}>
          <h2 style={headingStyle}>WHAT I’VE NOTICED</h2>
          <div style={{ display: 'grid', gap: '0.5rem' }}>
            {notes.map((n) => (
              <button
                key={n.id}
                onClick={onOpenNotes}
                className="app-card"
                style={{ padding: '0.875rem', textAlign: 'left', cursor: 'pointer', width: '100%' }}
              >
                <p style={{ fontSize: '0.875rem', color: 'var(--text)', lineHeight: 1.55 }}>
                  {preview(n.text, 160)}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Advanced ── */}
      <button
        onClick={() => setAdvanced((v) => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: '0.5rem',
          padding: '0.875rem 0', background: 'none', border: 'none', cursor: 'pointer',
          borderTop: '1px solid var(--border)', textAlign: 'left',
        }}
      >
        {advanced ? <ChevronDown size={16} style={{ color: 'var(--muted)' }} />
          : <ChevronRight size={16} style={{ color: 'var(--muted)' }} />}
        <span style={{ flex: 1, fontSize: '0.875rem', fontWeight: 700, color: 'var(--text)' }}>
          Rules and crash timing
        </span>
        <span style={{ fontSize: '0.75rem', color: 'var(--subtle)' }}>
          {(med.rules || []).length ? `${med.rules.length} rule${med.rules.length > 1 ? 's' : ''}` : 'Optional'}
        </span>
      </button>

      {advanced && (
        <div style={{ paddingTop: '0.5rem' }}>
          <div style={{ marginBottom: '1.75rem' }}>
            <h2 style={headingStyle}>KIND</h2>
            <Segmented
              options={MED_KINDS}
              value={med.kind}
              onChange={(kind) => set({ kind })}
            />
          </div>

          <div style={{ marginBottom: '1.75rem' }}>
            <h2 style={headingStyle}>MY RULES FOR THIS ONE</h2>
            <p style={{ fontSize: '0.8125rem', color: 'var(--subtle)', lineHeight: 1.5, marginBottom: '0.75rem' }}>
              In your words. These show up when you go to log the dose, and buzz
              at the time you set.
            </p>

            <div style={{ display: 'grid', gap: '0.625rem' }}>
              {(med.rules || []).map((rule) => (
                <div key={rule.id} style={{
                  padding: '0.75rem', borderRadius: '0.75rem',
                  backgroundColor: 'var(--surface2)', border: '1px solid var(--border)',
                }}>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                    <input
                      value={rule.text}
                      onChange={(e) => setRule(rule.id, { text: e.target.value })}
                      placeholder="Eat first — nothing too high in fat"
                      className="app-input"
                      style={{ flex: 1 }}
                    />
                    <button
                      onClick={() => removeRule(rule.id)}
                      aria-label="Remove this rule"
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer', padding: '0.5rem',
                        color: 'var(--muted)', flexShrink: 0,
                      }}
                    >
                      <X size={15} />
                    </button>
                  </div>
                  <select
                    value={rule.offsetMinutes}
                    onChange={(e) => setRule(rule.id, { offsetMinutes: Number(e.target.value) })}
                    className="app-input"
                    style={{ width: '100%', marginTop: '0.5rem', fontSize: '0.8125rem' }}
                  >
                    {OFFSET_CHOICES.map((n) => (
                      <option key={n} value={n}>{formatOffset(n)}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <button
              onClick={addRule}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.375rem', marginTop: '0.625rem',
                padding: '0.625rem 0.875rem', borderRadius: '0.75rem', cursor: 'pointer',
                backgroundColor: 'var(--surface2)', border: '1px solid var(--border)',
                color: 'var(--text)', fontSize: '0.875rem', fontWeight: 700,
              }}
            >
              <Plus size={15} /> Add a rule
            </button>
          </div>

          <div style={{ marginBottom: '1.75rem' }}>
            <h2 style={headingStyle}>WHAT IT DOES TO YOUR EVENING</h2>
            <p style={{ fontSize: '0.8125rem', color: 'var(--subtle)', lineHeight: 1.5, marginBottom: '0.75rem' }}>
              Your own numbers, not anyone else’s. Once there’s enough history,
              <strong style={{ color: 'var(--text)' }}> History </strong>
              will tell you what they actually are.
            </p>
            <Segmented
              options={[
                { key: 'manual', label: 'My number' },
                { key: 'learned', label: 'Learn it from my crashes' },
              ]}
              value={med.onsetSource === 'learned' ? 'learned' : 'manual'}
              onChange={(onsetSource) => set({ onsetSource })}
              style={{ marginBottom: '0.75rem' }}
            />
            {med.onsetSource === 'learned' && (
              <p style={{ fontSize: '0.75rem', color: 'var(--subtle)', lineHeight: 1.5, marginBottom: '0.75rem' }}>
                {med.learnedSamples
                  ? `Set from ${med.learnedSamples} crashes that followed this one: about ${formatHours(med.onsetHours)} after you take it. It keeps updating as you log more.`
                  : 'Uses your number below until five crash sessions have followed this medication, then sets it from when they actually started.'}
              </p>
            )}
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <div style={{ flex: 1 }}>
                <label className="app-label">Hours until it wears off</label>
                <input
                  type="number" min="0.5" step="0.5"
                  value={med.onsetHours}
                  onChange={(e) => set({ onsetHours: Number(e.target.value) })}
                  disabled={med.onsetSource === 'learned' && Boolean(med.learnedSamples)}
                  className="app-input" style={{ width: '100%' }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label className="app-label">Hours it then lasts</label>
                <input
                  type="number" min="0.5" step="0.5"
                  value={med.durationHours}
                  onChange={(e) => set({ durationHours: Number(e.target.value) })}
                  className="app-input" style={{ width: '100%' }}
                />
              </div>
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--subtle)', lineHeight: 1.5, marginTop: '0.625rem' }}>
              Until the grace above runs out, the app holds off on saying when
              your window starts — because taking this would move it.
            </p>
          </div>
        </div>
      )}

      {hint && (
        <p style={{ fontSize: '0.8125rem', color: 'var(--subtle)', marginTop: '1.25rem' }}>{hint}</p>
      )}

      {footer}
    </div>
  );
}

/**
 * One scheduled time.
 *
 * A medication can have several, which is the change that made this model match
 * how people actually take things. Each carries its own amount, because a
 * one-tablet morning and a two-tablet afternoon is ordinary and the supply
 * maths has to know the difference.
 */
function TimeRow({ time, index, form, anchors, canRemove, onChange, onRemove }) {
  return (
    <div style={{
      padding: '0.875rem', borderRadius: '0.875rem',
      backgroundColor: 'var(--surface2)', border: '1px solid var(--border)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.625rem' }}>
        <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--muted)', letterSpacing: '0.04em' }}>
          {`DOSE ${index + 1}`}
        </span>
        <div style={{ flex: 1 }} />
        {canRemove && (
          <button
            onClick={onRemove}
            aria-label={`Remove dose ${index + 1}`}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem',
              color: 'var(--muted)',
            }}
          >
            <X size={15} />
          </button>
        )}
      </div>

      <Segmented
        options={[
          { key: 'clock', label: 'At a time' },
          { key: 'offset', label: 'After another' },
        ]}
        value={time.mode}
        onChange={(mode) => onChange({ mode })}
        style={{ marginBottom: '0.625rem' }}
      />

      {time.mode === 'clock' ? (
        <input
          type="time"
          value={time.time || ''}
          onChange={(e) => onChange({ time: e.target.value })}
          className="app-input"
          style={{ width: '100%' }}
        />
      ) : anchors.length === 0 ? (
        <p style={{ fontSize: '0.8125rem', color: 'var(--warn)', lineHeight: 1.5 }}>
          There’s nothing else to hang this off yet. Add the earlier one first,
          or give this a time of its own.
        </p>
      ) : (
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <select
            value={time.afterMedId || ''}
            onChange={(e) => onChange({ afterMedId: e.target.value })}
            className="app-input"
            style={{ flex: 1 }}
          >
            <option value="">Pick one…</option>
            {anchors.map((a) => (
              <option key={a.id} value={a.id}>{a.name || 'Untitled'}</option>
            ))}
          </select>
          <input
            type="number" min="0.5" step="0.5"
            value={time.offsetHours}
            onChange={(e) => onChange({ offsetHours: Number(e.target.value) })}
            className="app-input"
            style={{ width: '5rem' }}
            aria-label="Hours after"
          />
          <span style={{ alignSelf: 'center', fontSize: '0.875rem', color: 'var(--muted)' }}>h after</span>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.625rem' }}>
        <label className="app-label" style={{ margin: 0 }}>Take</label>
        <input
          type="number" min="0.5" step="0.5" inputMode="decimal"
          value={time.amount}
          onChange={(e) => onChange({ amount: Number(e.target.value) || 1 })}
          className="app-input"
          style={{ width: '4.5rem' }}
          aria-label="How many"
        />
        <span style={{ fontSize: '0.875rem', color: 'var(--subtle)' }}>
          {formatAmount(time.amount, form).replace(/^[\d.]+\s/, '')}
        </span>
      </div>

      <RoutineEditor
        routine={time.routine}
        // Stamped when first set up, so the days before don't count as a
        // routine not followed.
        onChange={(routine) => onChange({
          routine,
          routineSince: routine.length ? (time.routineSince || Date.now()) : null,
        })}
      />
    </div>
  );
}

/**
 * Which days it's taken.
 *
 * A deliberate day off is not a missed dose. Without this, a weekend drug
 * holiday reads as two misses and resets a streak that was never broken — the
 * fastest way to make an adherence number worth ignoring.
 */
function DayPicker({ days, onChange }) {
  const toggle = (d) => {
    const next = days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort();
    // Every day off means the medication is never due, which is not a schedule
    // — it's an archive. Refuse the empty set rather than silently producing a
    // medication that can never be logged.
    if (next.length === 0) return;
    onChange(next);
  };

  const everyDay = days.length === 7;

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.25rem' }}>
        {DAY_LABELS.map((label, d) => {
          const on = days.includes(d);
          return (
            <button
              key={d}
              onClick={() => toggle(d)}
              aria-pressed={on}
              style={{
                flex: 1, padding: '0.625rem 0', borderRadius: '0.625rem', cursor: 'pointer',
                fontSize: '0.75rem', fontWeight: 700,
                color: on ? '#fff' : 'var(--muted)',
                backgroundColor: on ? 'var(--accent)' : 'var(--surface2)',
                border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
              }}
            >
              {label[0]}
            </button>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
        {!everyDay && (
          <button
            onClick={() => onChange(EVERY_DAY)}
            style={{
              background: 'none', border: 'none', padding: 0, cursor: 'pointer',
              fontSize: '0.75rem', fontWeight: 600, color: 'var(--accent-text)',
            }}
          >
            Every day
          </button>
        )}
        {days.length !== 5 || !days.every((d) => d >= 1 && d <= 5) ? (
          <button
            onClick={() => onChange([1, 2, 3, 4, 5])}
            style={{
              background: 'none', border: 'none', padding: 0, cursor: 'pointer',
              fontSize: '0.75rem', fontWeight: 600, color: 'var(--accent-text)',
            }}
          >
            Weekdays only
          </button>
        ) : null}
      </div>
    </div>
  );
}

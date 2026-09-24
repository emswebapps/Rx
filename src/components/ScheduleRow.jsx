import { useState } from 'react';
import { Check, Clock, AlertTriangle, X, SkipForward, Info, Undo2, NotebookPen } from 'lucide-react';
import Modal from './Modal';
import Sheet from './Sheet';
import { PillGlyph, pillLook } from './PillShape.jsx';
import { formatClock } from '../lib/time.js';
import {
  rulesForMed, supplyStatus, formatOffset, formatAmount, wearOffFor, formatHalfLife,
} from '../lib/meds.js';

/**
 * One dose on Today: a pill, a name, and how much to take.
 *
 * The card itself is the button. Tapping it opens the sheet with Take and Skip,
 * which keeps the list calm enough to read at a glance — the time headings and
 * the pill's badge already say what's done and what isn't.
 */

/** "20 mg, take 1 tablet" — the whole instruction on one line. */
export function doseInstruction(med, amount) {
  const take = `take ${formatAmount(amount, med.form)}`;
  return med.strength ? `${med.strength}, ${take}` : take.charAt(0).toUpperCase() + take.slice(1);
}

const STATUS = {
  taken: { color: 'var(--positive-text)' },
  due: { color: 'var(--accent-text)', text: 'Due now' },
  skipped: { color: 'var(--danger)', text: 'Missed' },
  'skipped-on-purpose': { color: 'var(--muted)', text: 'Skipped' },
  unknown: { color: 'var(--muted)', text: 'No time set' },
  upcoming: { color: 'var(--subtle)', text: null },
};

function statusText(entry) {
  if (entry.state === 'taken' && entry.dose) return `Taken at ${formatClock(entry.dose.takenAt)}`;
  return STATUS[entry.state]?.text ?? null;
}

/** The medication's own pill (see PillShape.jsx), badged with how the dose went. */
export function PillIcon({ state, size = 44, med }) {
  const look = pillLook(med);
  const badge = state === 'taken' ? { bg: 'var(--positive)', Icon: Check }
    : state === 'skipped' ? { bg: 'var(--danger)', Icon: X }
    : state === 'skipped-on-purpose' ? { bg: 'var(--subtle)', Icon: SkipForward }
    : null;
  const faded = state === 'skipped-on-purpose';

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <PillGlyph shape={look.shape} color={look.color} size={size} faded={faded} />
      {badge && (
        <span style={{
          position: 'absolute', right: -3, bottom: -3,
          width: size * 0.42, height: size * 0.42, borderRadius: '9999px',
          backgroundColor: badge.bg, border: '2px solid var(--surface)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
        }}>
          <badge.Icon size={size * 0.24} strokeWidth={3} />
        </span>
      )}
    </div>
  );
}

/**
 * The card on Today: the pill, a thin rule, the name, and the instruction.
 * Nothing else on its face — how it went is the badge on the pill, and the
 * details (when it wears off, the half-life, notes) are in the sheet that
 * opens on tap. A list you read half-awake should be this plain.
 */
export default function ScheduleRow({ entry, onOpen, now = Date.now() }) {
  const { med, state, amount } = entry;
  const supply = supplyStatus(med, now);
  const status = statusText(entry);
  const tone = STATUS[state] || STATUS.unknown;
  // Only the states that ask for something get words; the rest is the badge.
  const loud = state === 'due' || state === 'skipped';

  return (
    <button
      onClick={() => onOpen(entry)}
      aria-label={`${med.name || 'Untitled'}${status ? `, ${status}` : ''}`}
      style={{
        width: '100%', textAlign: 'left', cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: '1rem',
        padding: '1rem 1.125rem', borderRadius: '1rem',
        backgroundColor: 'var(--surface)',
        border: `1px solid ${state === 'due' ? 'var(--accent)' : 'var(--surface)'}`,
        boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <PillIcon state={state} med={med} size={40} />
      <div style={{ width: 1, alignSelf: 'stretch', backgroundColor: 'var(--border2)', margin: '0.125rem 0' }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          fontSize: '1.125rem', fontWeight: 700, color: 'var(--text)', lineHeight: 1.25,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          opacity: state === 'skipped-on-purpose' ? 0.6 : 1,
        }}>
          {med.name || 'Untitled'}
        </p>
        <p style={{ fontSize: '0.9375rem', color: 'var(--subtle)', marginTop: '0.1875rem', lineHeight: 1.35 }}>
          {doseInstruction(med, amount)}
        </p>
        {loud && (
          <p style={{ fontSize: '0.8125rem', fontWeight: 700, color: tone.color, marginTop: '0.1875rem' }}>
            {status}
          </p>
        )}
        {supply.low && supply.tracked && state !== 'taken' && (
          <p style={{
            display: 'flex', alignItems: 'center', gap: '0.3125rem', marginTop: '0.25rem',
            fontSize: '0.8125rem', color: 'var(--warn)', fontWeight: 600,
          }}>
            <AlertTriangle size={13} style={{ flexShrink: 0 }} />
            {supply.dosesLeft === 0 ? 'None left' : `${supply.dosesLeft} days left`}
            {supply.refillOpen ? ' — refill now' : ''}
          </p>
        )}
      </div>
    </button>
  );
}

/**
 * Everything written down about one medication, one tap from its dose: the
 * rules pinned to the dose ("eat 30 min before") and the notes tied to it in
 * What I've noticed. Read-only here — writing happens where it always has, and
 * "Add a note" lands straight in a fresh one already tied to this medication.
 */
export function MedNotesSheet({ med, notes, onClose, onAdd, onOpenNote, onEditRules }) {
  const rules = rulesForMed(med);
  return (
    <Sheet onClose={onClose} label={`Notes for ${med.name || 'this medication'}`}>
      <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text)', marginBottom: '1rem' }}>
        {med.name || 'Untitled'} — my notes
      </h2>

      {rules.length > 0 && (
        <div style={{ marginBottom: '1rem' }}>
          <p style={sheetHeading}>RULES FOR THIS DOSE</p>
          <div style={{ display: 'grid', gap: '0.375rem' }}>
            {rules.map((r) => (
              <p key={r.id} style={{ fontSize: '0.9375rem', color: 'var(--muted)', lineHeight: 1.45 }}>
                <strong style={{ color: 'var(--text)' }}>{formatOffset(r.offsetMinutes)}</strong> — {r.text}
              </p>
            ))}
          </div>
        </div>
      )}

      <p style={sheetHeading}>WHAT I’VE NOTICED</p>
      {notes.length === 0 ? (
        <p style={{ fontSize: '0.875rem', color: 'var(--subtle)', lineHeight: 1.5 }}>
          Nothing written about this one yet.
        </p>
      ) : (
        <div style={{ display: 'grid', gap: '0.5rem', maxHeight: '45vh', overflowY: 'auto' }}>
          {notes.map((n) => (
            <button
              key={n.id}
              onClick={() => onOpenNote(n)}
              style={{
                textAlign: 'left', padding: '0.75rem', borderRadius: '0.75rem', cursor: 'pointer',
                backgroundColor: 'var(--surface2)', border: '1px solid var(--border)',
                fontSize: '0.9375rem', color: 'var(--text)', lineHeight: 1.45, whiteSpace: 'pre-wrap',
              }}
            >
              {n.text}
            </button>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.25rem' }}>
        <button onClick={onAdd} className="app-btn-primary" style={{ flex: 1 }}>Add a note</button>
        <button
          onClick={onEditRules}
          style={{
            flex: 1, padding: '0.75rem', borderRadius: '0.75rem', cursor: 'pointer',
            backgroundColor: 'var(--surface2)', border: '1px solid var(--border)',
            color: 'var(--text)', fontSize: '0.875rem', fontWeight: 700,
          }}
        >
          Edit rules
        </button>
      </div>
    </Sheet>
  );
}

const sheetHeading = {
  fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.06em', color: 'var(--muted)', marginBottom: '0.5rem',
};

/**
 * What you can do with one dose.
 *
 * `when` says which day the sheet is for. A day still to come can't be logged —
 * there is nothing to record yet — so it offers only the medication itself.
 */
export function DoseSheet({ entry, when, routineNote, onClose, onTake, onSkip, onUndo, onChangeTime, onOpenMed, onCheckIn, onNotes, noteCount = 0 }) {
  const { med, state, expectedAt, amount, dose, entry: logged } = entry;
  const rules = rulesForMed(med);
  const status = statusText(entry);
  const tone = STATUS[state] || STATUS.unknown;
  const future = when === 'future';
  const settled = state === 'taken' || state === 'skipped-on-purpose';
  // Take asks when, rather than stamping the moment the button was pressed —
  // the dose was often swallowed a few minutes before the phone came out, and
  // with "next dose when this wears off" that difference moves the whole day.
  const [picking, setPicking] = useState(false);

  return (
    <Sheet onClose={onClose} label={med.name || 'Dose'}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
        <PillIcon state={state} size={52} med={med} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ fontSize: '1.375rem', fontWeight: 800, color: 'var(--text)', lineHeight: 1.2 }}>
            {med.name || 'Untitled'}
          </h2>
          <p style={{ fontSize: '1rem', color: 'var(--subtle)', marginTop: '0.25rem' }}>
            {doseInstruction(med, amount)}
          </p>
        </div>
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 0',
        borderTop: '1px solid var(--border)', borderBottom: rules.length ? 'none' : '1px solid var(--border)',
        fontSize: '0.9375rem', color: 'var(--muted)',
      }}>
        <Clock size={16} style={{ flexShrink: 0 }} />
        <span style={{ flex: 1 }}>
          {expectedAt != null ? `Scheduled for ${formatClock(expectedAt)}` : 'No time set'}
        </span>
        {status && <span style={{ fontWeight: 700, color: tone.color }}>{status}</span>}
      </div>

      {/* The small print that used to sit on the card: when it wears off, and
          the half-life as entered. */}
      {(() => {
        const wear = wearOffFor(entry);
        const halfLife = formatHalfLife(med.halfLifeHours);
        const facts = [
          wear && (wear.projected
            ? `Wears off ~${formatClock(wear.at)} if taken on time`
            : `${wear.at <= Date.now() ? 'Wore' : 'Wears'} off ${formatClock(wear.at)}`),
          halfLife && `Half-life ${halfLife}`,
        ].filter(Boolean);
        return facts.length ? (
          <p style={{ fontSize: '0.875rem', color: 'var(--muted)', padding: '0.5rem 0', fontVariantNumeric: 'tabular-nums' }}>
            {facts.join(' · ')}
          </p>
        ) : null;
      })()}

      {rules.length > 0 && (
        <div style={{ display: 'grid', gap: '0.375rem', padding: '0.75rem 0', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
          {rules.map((r) => (
            <p key={r.id} style={{ fontSize: '0.875rem', color: 'var(--muted)', lineHeight: 1.45 }}>
              <strong style={{ color: 'var(--text)' }}>{formatOffset(r.offsetMinutes)}</strong> — {r.text}
            </p>
          ))}
        </div>
      )}

      {routineNote && !future && state !== 'taken' && (
        <p style={{
          display: 'flex', gap: '0.5rem', alignItems: 'flex-start',
          fontSize: '0.875rem', lineHeight: 1.45, color: 'var(--warn)', fontWeight: 600,
          padding: '0.75rem', marginTop: '0.75rem', borderRadius: '0.75rem',
          border: '1px solid var(--warn)',
        }}>
          <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '0.125rem' }} />
          {routineNote}
        </p>
      )}

      {future ? (
        <p style={{ fontSize: '0.875rem', color: 'var(--subtle)', textAlign: 'center', margin: '1.25rem 0 0.25rem' }}>
          You can log this on the day.
        </p>
      ) : null}

      {picking ? (
        <TakeTimePicker
          today={when === 'today'}
          fallback={expectedAt}
          onCancel={() => setPicking(false)}
          onConfirm={(at) => onTake(entry, at)}
        />
      ) : (
      <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: '1.5rem' }}>
        {!future && !settled && (
          <RoundAction Icon={SkipForward} label="Skip" onClick={() => onSkip(entry)} />
        )}
        {!future && !settled && (
          <RoundAction Icon={Check} label="Take" primary onClick={() => setPicking(true)} />
        )}
        {state === 'taken' && dose && (
          <RoundAction Icon={Clock} label="Change time" onClick={() => onChangeTime(dose)} />
        )}
        {settled && logged && (
          <RoundAction Icon={Undo2} label={state === 'taken' ? 'Not taken' : 'Undo skip'} onClick={() => onUndo(logged)} />
        )}
        {onNotes && (
          <RoundAction Icon={NotebookPen} label={noteCount ? `Notes (${noteCount})` : 'Notes'} onClick={() => onNotes(med)} />
        )}
        <RoundAction Icon={Info} label="Medication" onClick={() => onOpenMed(med.id)} />
      </div>
      )}

      {!picking && onCheckIn && state === 'taken' && (
        <button
          onClick={() => onCheckIn(med.id)}
          style={{
            display: 'block', margin: '1.25rem auto 0', background: 'none', border: 'none', cursor: 'pointer',
            fontSize: '0.9375rem', fontWeight: 700, color: 'var(--accent-text)',
          }}
        >
          How’s it working? Check in
        </button>
      )}
    </Sheet>
  );
}

const pad2 = (n) => String(n).padStart(2, '0');
const hhmm = (ts) => { const d = new Date(ts); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };

/**
 * "What time did you take it?" — now, a few minutes ago, or any time.
 *
 * On today it starts at now; on a past day at the time it was due, since the
 * point there is filling in a day already gone. A time later than now on
 * today means this morning, not tonight — the same rule as TimeEditor.
 */
function TakeTimePicker({ today, fallback, onCancel, onConfirm }) {
  const start = today ? Date.now() : (fallback ?? Date.now());
  const [value, setValue] = useState(hhmm(start));

  const resolve = () => {
    const [h, m] = value.split(':').map(Number);
    const d = new Date(start);
    if (!Number.isNaN(h) && !Number.isNaN(m)) d.setHours(h, m, 0, 0);
    if (today && d.getTime() > Date.now()) d.setDate(d.getDate() - 1);
    return d.getTime();
  };
  const ago = (min) => setValue(hhmm(Date.now() - min * 60 * 1000));

  return (
    <div style={{ marginTop: '1.25rem' }}>
      <p style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text)', marginBottom: '0.625rem' }}>
        What time did you take it?
      </p>
      <input
        type="time"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="app-input"
        style={{ width: '100%', fontSize: '1.375rem', fontWeight: 700, textAlign: 'center' }}
        aria-label="Time taken"
      />
      {today && (
        <div style={{ display: 'flex', gap: '0.375rem', marginTop: '0.625rem' }}>
          {[['Now', 0], ['5 min ago', 5], ['15 min ago', 15], ['30 min ago', 30]].map(([label, min]) => (
            <button
              key={label}
              onClick={() => ago(min)}
              style={{
                flex: 1, padding: '0.5rem 0.25rem', borderRadius: '0.625rem', cursor: 'pointer',
                backgroundColor: value === hhmm(Date.now() - min * 60 * 1000) ? 'var(--accent-soft)' : 'var(--surface2)',
                border: '1px solid var(--border)', color: 'var(--text)', fontSize: '0.8125rem', fontWeight: 700,
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
        <button
          onClick={onCancel}
          style={{
            padding: '0.875rem 1.125rem', borderRadius: '0.75rem', cursor: 'pointer',
            backgroundColor: 'var(--surface2)', border: '1px solid var(--border)',
            color: 'var(--text)', fontSize: '0.9375rem', fontWeight: 700,
          }}
        >
          Back
        </button>
        <button onClick={() => onConfirm(resolve())} className="app-btn-primary" style={{ flex: 1, fontSize: '1rem' }}>
          <Check size={17} style={{ verticalAlign: '-3px', marginRight: '0.375rem' }} />
          Log it
        </button>
      </div>
    </div>
  );
}

function RoundAction({ Icon, label, onClick, primary = false }) {
  const size = primary ? '4.25rem' : '3.5rem';
  return (
    <button
      onClick={onClick}
      style={{
        background: 'none', border: 'none', cursor: 'pointer', padding: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem',
        minWidth: '4.5rem', WebkitTapHighlightColor: 'transparent',
      }}
    >
      <span style={{
        width: size, height: size, borderRadius: '9999px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backgroundColor: primary ? 'var(--accent)' : 'var(--surface2)',
        color: primary ? '#fff' : 'var(--text)',
      }}>
        <Icon size={primary ? 30 : 22} strokeWidth={primary ? 2.75 : 2} />
      </span>
      <span style={{ fontSize: '0.875rem', fontWeight: 600, color: primary ? 'var(--accent-text)' : 'var(--muted)' }}>
        {label}
      </span>
    </button>
  );
}

/** For when you remember at 3 PM that you actually took them at 8. */
export function TimeEditor({ dose, onSave, onClose }) {
  const d = new Date(dose.takenAt);
  const pad = (n) => String(n).padStart(2, '0');
  const [value, setValue] = useState(`${pad(d.getHours())}:${pad(d.getMinutes())}`);

  const save = () => {
    const [h, m] = value.split(':').map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) { onClose(); return; }
    const next = new Date(dose.takenAt);
    next.setHours(h, m, 0, 0);
    // You only ever correct this after the fact, so a time that lands in the
    // future means the morning just gone — not tonight. Without this, editing
    // a 1 AM entry to "8:00" pushes it forward and the dose disappears from the
    // row, which reads as though the edit deleted it.
    if (next.getTime() > Date.now()) next.setDate(next.getDate() - 1);
    onSave(next.getTime());
  };

  return (
    <Modal
      title="What time?"
      onClose={onClose}
      footer={<button onClick={save} className="app-btn-primary" style={{ width: '100%' }}>Save</button>}
    >
      <input
        type="time"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="app-input"
        style={{ width: '100%', fontSize: '1.125rem' }}
      />
    </Modal>
  );
}

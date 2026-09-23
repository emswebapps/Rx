import { useState } from 'react';
import { Check, Clock, AlertTriangle, X, SkipForward, Info, Undo2 } from 'lucide-react';
import Modal from './Modal';
import Sheet from './Sheet';
import { formatClock } from '../lib/time.js';
import { rulesForMed, supplyStatus, formatOffset, formatAmount } from '../lib/meds.js';

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

/** A round tablet with a score line, badged with how the dose went. */
export function PillIcon({ state, size = 44 }) {
  const badge = state === 'taken' ? { bg: 'var(--positive)', Icon: Check }
    : state === 'skipped' ? { bg: 'var(--danger)', Icon: X }
    : state === 'skipped-on-purpose' ? { bg: 'var(--subtle)', Icon: SkipForward }
    : null;
  const faded = state === 'skipped-on-purpose';

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox="0 0 44 44" aria-hidden="true" style={{ opacity: faded ? 0.45 : 1 }}>
        <circle cx="22" cy="23.5" r="17" fill="rgba(0,0,0,0.25)" />
        <circle cx="22" cy="22" r="17" fill="var(--pill)" />
        <line x1="14" y1="30" x2="30" y2="14" stroke="rgba(0,0,0,0.18)" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
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

export default function ScheduleRow({ entry, onOpen, now = Date.now() }) {
  const { med, state, amount } = entry;
  const supply = supplyStatus(med, now);
  const status = statusText(entry);
  const tone = STATUS[state] || STATUS.unknown;

  return (
    <button
      onClick={() => onOpen(entry)}
      aria-label={`${med.name || 'Untitled'}${status ? `, ${status}` : ''}`}
      style={{
        width: '100%', textAlign: 'left', cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: '1rem',
        padding: '1.125rem 1.25rem', borderRadius: '1rem',
        backgroundColor: 'var(--surface)',
        border: `1px solid ${state === 'due' ? 'var(--accent)' : 'var(--surface)'}`,
        boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <PillIcon state={state} />
      <div style={{ width: 1, alignSelf: 'stretch', backgroundColor: 'var(--border2)', margin: '0.25rem 0' }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          fontSize: '1.1875rem', fontWeight: 700, color: 'var(--text)', lineHeight: 1.25,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          opacity: state === 'skipped-on-purpose' ? 0.6 : 1,
        }}>
          {med.name || 'Untitled'}
        </p>
        <p style={{ fontSize: '1rem', color: 'var(--subtle)', marginTop: '0.25rem', lineHeight: 1.35 }}>
          {doseInstruction(med, amount)}
        </p>
        {status && (
          <p style={{ fontSize: '0.875rem', fontWeight: 600, color: tone.color, marginTop: '0.25rem' }}>
            {status}
          </p>
        )}
        {supply.low && supply.tracked && state !== 'taken' && (
          <p style={{
            display: 'flex', alignItems: 'center', gap: '0.3125rem', marginTop: '0.375rem',
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
 * What you can do with one dose.
 *
 * `when` says which day the sheet is for. A day still to come can't be logged —
 * there is nothing to record yet — so it offers only the medication itself.
 */
export function DoseSheet({ entry, when, onClose, onTake, onSkip, onUndo, onChangeTime, onOpenMed }) {
  const { med, state, expectedAt, amount, dose, entry: logged } = entry;
  const rules = rulesForMed(med);
  const status = statusText(entry);
  const tone = STATUS[state] || STATUS.unknown;
  const future = when === 'future';
  const settled = state === 'taken' || state === 'skipped-on-purpose';

  return (
    <Sheet onClose={onClose} label={med.name || 'Dose'}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
        <PillIcon state={state} size={52} />
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

      {rules.length > 0 && (
        <div style={{ display: 'grid', gap: '0.375rem', padding: '0.75rem 0', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
          {rules.map((r) => (
            <p key={r.id} style={{ fontSize: '0.875rem', color: 'var(--muted)', lineHeight: 1.45 }}>
              <strong style={{ color: 'var(--text)' }}>{formatOffset(r.offsetMinutes)}</strong> — {r.text}
            </p>
          ))}
        </div>
      )}

      {future ? (
        <p style={{ fontSize: '0.875rem', color: 'var(--subtle)', textAlign: 'center', margin: '1.25rem 0 0.25rem' }}>
          You can log this on the day.
        </p>
      ) : null}

      <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: '1.5rem' }}>
        {!future && !settled && (
          <RoundAction Icon={SkipForward} label="Skip" onClick={() => onSkip(entry)} />
        )}
        {!future && !settled && (
          <RoundAction Icon={Check} label="Take" primary onClick={() => onTake(entry)} />
        )}
        {state === 'taken' && dose && (
          <RoundAction Icon={Clock} label="Change time" onClick={() => onChangeTime(dose)} />
        )}
        {settled && logged && (
          <RoundAction Icon={Undo2} label={state === 'taken' ? 'Not taken' : 'Undo skip'} onClick={() => onUndo(logged)} />
        )}
        <RoundAction Icon={Info} label="Medication" onClick={() => onOpenMed(med.id)} />
      </div>
    </Sheet>
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

import { useState } from 'react';
import { Check, Clock, AlertTriangle, Ban } from 'lucide-react';
import Modal from './Modal';
import { formatClock } from '../lib/time.js';
import { rulesForMed, supplyStatus, formatOffset, formatAmount } from '../lib/meds.js';

/**
 * One medication's row on Today.
 *
 * This is the thing the app is for. It says what it is, whether it's been
 * taken, and gives you one button to say that it has — and it does that
 * without a chart, a modal or a second tap.
 *
 * Lifted out of DoseRow.jsx, where it was a helper inside a card that led with
 * the crash window. The row is the point now; the window is context underneath.
 */

const ROW_STATE = {
  taken: { color: 'var(--positive-text)', action: null },
  due: { color: 'var(--accent-text)', action: 'Log' },
  upcoming: { color: 'var(--subtle)', action: 'Log' },
  skipped: { color: 'var(--muted)', action: 'Log' },
  'skipped-on-purpose': { color: 'var(--muted)', action: null },
  unknown: { color: 'var(--muted)', action: 'Log' },
};

export default function ScheduleRow({ entry, onLog, onSkip, onEdit, now = Date.now() }) {
  const { med, state, expectedAt, dose, amount } = entry;
  const tone = ROW_STATE[state] || ROW_STATE.unknown;
  const rules = rulesForMed(med);
  const supply = supplyStatus(med, now);
  // The rules only matter up to the moment it's swallowed.
  const showRules = state !== 'taken' && rules.length > 0;

  return (
    <div className="app-card" style={{
      padding: '1rem',
      border: `1px solid ${state === 'due' ? 'var(--accent)' : 'var(--border)'}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* The name gets the line to itself. Sharing it with the strength
              wrapped "Methylphenidate · 10 mg" mid-unit on a narrow phone,
              which is the one place a dose row must never be ambiguous. */}
          <p style={{
            fontSize: '0.9375rem', fontWeight: 700, color: 'var(--text)', lineHeight: 1.3,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {med.name || 'Untitled'}
          </p>
          <button
            onClick={() => onEdit && onEdit(med.id)}
            style={{
              background: 'none', border: 'none', padding: 0, cursor: 'pointer',
              fontSize: '0.8125rem', fontWeight: 600, color: tone.color, textAlign: 'left',
              lineHeight: 1.35,
            }}
          >
            {/* Amount first: on a row with two buttons this is the line with
                room, and "2 tablets at 1:00 PM" is the whole instruction. */}
            {[med.strength, formatAmount(amount, med.form)].filter(Boolean).join(' · ')}
            {' · '}
            {state === 'taken' && dose ? `taken ${formatClock(dose.takenAt)}`
              : state === 'due' ? `due now${expectedAt != null ? `, ${formatClock(expectedAt)}` : ''}`
              : state === 'skipped-on-purpose' ? `skipped, was ${formatClock(expectedAt)}`
              : state === 'skipped' ? `not logged, was ${formatClock(expectedAt)}`
              : state === 'unknown' ? 'no time set'
              : formatClock(expectedAt)}
          </button>
        </div>

        {state === 'taken' ? (
          <Check size={19} style={{ color: 'var(--positive)', flexShrink: 0 }} />
        ) : state === 'skipped-on-purpose' ? (
          <Ban size={17} style={{ color: 'var(--muted)', flexShrink: 0 }} />
        ) : (
          <div style={{ display: 'flex', gap: '0.375rem', flexShrink: 0 }}>
            {/* Skipping on purpose has to be as easy as taking, or the only way
                to keep an honest record is to lie about having taken it. */}
            {onSkip && (
              <button
                onClick={() => onSkip(entry)}
                aria-label={`Skip ${med.name || 'this dose'}`}
                style={{
                  padding: '0.4375rem 0.625rem', borderRadius: '0.625rem', cursor: 'pointer',
                  backgroundColor: 'transparent', border: '1px solid var(--border)',
                  color: 'var(--muted)', fontSize: '0.8125rem', fontWeight: 700,
                }}
              >
                Skip
              </button>
            )}
            <button
              onClick={() => onLog(entry)}
              style={{
                padding: '0.4375rem 0.875rem', borderRadius: '0.625rem', cursor: 'pointer',
                backgroundColor: state === 'due' ? 'var(--accent)' : 'var(--surface2)',
                border: `1px solid ${state === 'due' ? 'var(--accent)' : 'var(--border)'}`,
                color: state === 'due' ? '#fff' : 'var(--text)',
                fontSize: '0.8125rem', fontWeight: 700,
              }}
            >
              {tone.action}
            </button>
          </div>
        )}
      </div>

      {supply.low && supply.tracked && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.375rem', marginTop: '0.625rem',
          fontSize: '0.75rem', color: 'var(--warn)', fontWeight: 600,
        }}>
          <AlertTriangle size={12} style={{ flexShrink: 0 }} />
          <span>
            {supply.dosesLeft === 0 ? 'None left' : `${supply.dosesLeft} days left`}
            {supply.refillOpen ? ' — you can refill now' : ''}
          </span>
        </div>
      )}

      {showRules && (
        <div style={{ marginTop: '0.625rem', display: 'grid', gap: '0.25rem' }}>
          {rules.map((r) => (
            <div key={r.id} style={{
              display: 'flex', alignItems: 'flex-start', gap: '0.375rem',
              fontSize: '0.75rem', color: 'var(--muted)', lineHeight: 1.45,
            }}>
              <Clock size={11} style={{ flexShrink: 0, marginTop: '0.1875rem' }} />
              <span><strong style={{ color: 'var(--subtle)' }}>{formatOffset(r.offsetMinutes)}</strong> — {r.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
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

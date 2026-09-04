import { useState } from 'react';
import Modal from '../../components/Modal';
import { useApp } from '../../context/AppContext';
import { mergeKit } from '../../lib/kit.js';
import { Chip } from '../../components/stepUi.jsx';
import { signTimings, earliestSign } from '../../lib/behaviors.js';
import { formatHours } from '../../lib/window.js';

/**
 * The check-in that isn't a crash.
 *
 * The protocol asks the same question, but only once you already know the
 * answer. This is for the hour before that: tap what's true, nothing else
 * happens. No timer starts, no message is drafted, nothing is sent. It exists
 * purely so the record has the *early* evenings in it as well as the loud ones
 * — which is the only way "this usually starts around now" can ever be said.
 */
export default function BehaviorCheck({ onClose }) {
  const {
    crashKit, crashBehaviors, crashSessions, crashDoses, addCrashBehavior,
  } = useApp();
  const kit = mergeKit(crashKit);
  const [picked, setPicked] = useState([]);
  const [saved, setSaved] = useState(false);

  const toggle = (id) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const save = () => {
    if (picked.length === 0) { onClose(); return; }
    addCrashBehavior(picked);
    setSaved(true);
    setTimeout(onClose, 1600);
  };

  // Only shown after saving, and only once it's earned: mid-tap it would read
  // as the app telling her what she's about to feel.
  const earliest = saved
    ? earliestSign(signTimings(crashBehaviors, crashSessions, crashDoses, kit.warningSigns))
    : null;

  return (
    <Modal
      title={saved ? 'Noted' : 'How am I doing?'}
      onClose={onClose}
      footer={saved ? null : (
        <button
          onClick={save}
          disabled={picked.length === 0}
          style={{
            width: '100%', padding: '1rem', borderRadius: '0.875rem', border: 'none',
            backgroundColor: picked.length ? 'var(--accent)' : 'var(--surface2)',
            color: picked.length ? '#fff' : 'var(--muted)',
            fontSize: '1rem', fontWeight: 700,
            cursor: picked.length ? 'pointer' : 'default',
          }}
        >
          {picked.length ? 'Note it' : 'Nothing right now'}
        </button>
      )}
    >
      {saved ? (
        <div style={{ padding: '0.5rem 0' }}>
          <p style={{ color: 'var(--text)', fontSize: '1rem', lineHeight: 1.5 }}>
            Written down. Nothing happens now — that was the whole thing.
          </p>
          {earliest && (
            <p style={{ color: 'var(--subtle)', fontSize: '0.875rem', lineHeight: 1.5, marginTop: '0.875rem' }}>
              For what it’s worth: “{earliest.text}” usually shows up about{' '}
              <strong style={{ color: 'var(--text)' }}>{formatHours(earliest.hours)}</strong>{' '}
              after your dose, across {earliest.count} times.
            </p>
          )}
        </div>
      ) : (
        <>
          <p style={{ color: 'var(--muted)', fontSize: '0.9375rem', lineHeight: 1.5, marginBottom: '1rem' }}>
            Tap whatever’s true right now. This doesn’t start anything — it just
            goes in the record, so the pattern has the quiet evenings in it too.
          </p>
          <div style={{ display: 'grid', gap: '0.5rem' }}>
            {kit.warningSigns.map((s) => (
              <Chip key={s.id} selected={picked.includes(s.id)} onClick={() => toggle(s.id)}>
                {s.text}
              </Chip>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}

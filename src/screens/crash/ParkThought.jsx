import { useState, useRef, useEffect } from 'react';
import Modal from '../../components/Modal';
import { useApp } from '../../context/AppContext';

/**
 * The fast capture. "I need to say this before I forget" is the trap the whole
 * protocol is built around, so this is deliberately one field and one button —
 * no title, no tags, no category. Every extra field is another chance to
 * re-engage with the content, and re-engaging is the thing being defused.
 */
export default function ParkThought({ sessionId = null, onClose }) {
  const { addCrashDraft } = useApp();
  const [text, setText] = useState('');
  const [saved, setSaved] = useState(false);
  const ref = useRef(null);

  useEffect(() => { ref.current?.focus(); }, []);

  const save = () => {
    if (!text.trim()) { onClose(); return; }
    addCrashDraft(text.trim(), sessionId);
    setSaved(true);
    setTimeout(onClose, 1400);
  };

  return (
    <Modal
      title={saved ? 'Saved' : 'Get it out'}
      onClose={onClose}
      footer={saved ? null : (
        <button
          onClick={save}
          style={{
            width: '100%', padding: '1rem', borderRadius: '0.875rem', border: 'none',
            backgroundColor: 'var(--accent)', color: '#fff',
            fontSize: '1rem', fontWeight: 700, cursor: 'pointer',
          }}
        >
          Hold it until tomorrow
        </button>
      )}
    >
      {saved ? (
        <p style={{ color: 'var(--text)', fontSize: '1rem', lineHeight: 1.5, padding: '0.5rem 0' }}>
          It’s written down. It’ll be here tomorrow — you don’t have to keep holding it.
        </p>
      ) : (
        <>
          <textarea
            ref={ref}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={7}
            placeholder="All of it. Nobody sees this."
            className="app-input"
            style={{ width: '100%', resize: 'vertical', lineHeight: 1.5 }}
          />
          <p style={{ color: 'var(--subtle)', fontSize: '0.8125rem', marginTop: '0.75rem', lineHeight: 1.45 }}>
            This isn’t dropped. It’s held, with a date on it.
          </p>
        </>
      )}
    </Modal>
  );
}

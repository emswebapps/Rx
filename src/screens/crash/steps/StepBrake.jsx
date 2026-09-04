import { useState } from 'react';
import { Copy, Share2, MessageSquare, Check } from 'lucide-react';
import { BRAKE_VARIANTS, buildBrakeMessage, smsHref, toneWarnings } from '../../../lib/message.js';

/**
 * The message to him. Placed this early on purpose: if he's in the room, this
 * is the most useful thing that can happen in the first minute. Every variant
 * promises a return — a timeout without one is stonewalling, which lands worse
 * than the argument would have.
 */
export default function StepBrake({ session, kit, partnerName, onPatch }) {
  const [variantId, setVariantId] = useState(kit.brakeVariantId || 'short');
  // Seeded once. The phrase agreed on in setup wins if there is one — that's
  // the whole value of having agreed on it. Switching variants below replaces
  // the text explicitly, so an edit in progress is never overwritten by a
  // re-render.
  const [text, setText] = useState(() => buildBrakeMessage(kit, kit.brakeVariantId, partnerName));
  const [copied, setCopied] = useState(false);

  const pickVariant = (id) => {
    setVariantId(id);
    setText(buildBrakeMessage({ ...kit, brakePhrase: '' }, id, partnerName));
  };

  const warnings = toneWarnings(text);
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const mark = (method) => onPatch({ brakeSent: true, brakeMethod: method });

  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      mark('copy');
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const share = () => {
    navigator.share({ text }).then(() => mark('share')).catch(() => {});
  };

  const btn = {
    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4375rem',
    padding: '0.875rem', borderRadius: '0.875rem', border: '1px solid var(--border)',
    backgroundColor: 'var(--surface2)', color: 'var(--text)',
    fontSize: '0.9375rem', fontWeight: 700, cursor: 'pointer', textDecoration: 'none',
  };

  return (
    <>
      <p style={{ color: 'var(--muted)', fontSize: '1rem', lineHeight: 1.5, marginBottom: '1rem' }}>
        Not “I’m not talking to you.” Just enough that he knows what’s happening and that you’re coming back.
      </p>

      <div style={{ display: 'flex', gap: '0.375rem', overflowX: 'auto', paddingBottom: '0.75rem' }}>
        {BRAKE_VARIANTS.map((v) => (
          <button
            key={v.id}
            onClick={() => pickVariant(v.id)}
            style={{
              flexShrink: 0, padding: '0.4375rem 0.75rem', borderRadius: '9999px',
              fontSize: '0.8125rem', fontWeight: 700, cursor: 'pointer',
              color: variantId === v.id ? 'var(--accent-text)' : 'var(--muted)',
              backgroundColor: variantId === v.id ? 'var(--accent-soft)' : 'var(--surface2)',
              border: `1px solid ${variantId === v.id ? 'var(--accent)' : 'var(--border)'}`,
            }}
          >
            {v.label}
          </button>
        ))}
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        className="app-input"
        style={{ width: '100%', resize: 'vertical', fontSize: '1rem', lineHeight: 1.5 }}
      />

      {warnings.length > 0 && (
        <div style={{ marginTop: '0.75rem', display: 'grid', gap: '0.375rem' }}>
          {warnings.map((w, i) => (
            <p key={i} style={{
              fontSize: '0.8125rem', lineHeight: 1.45, margin: 0,
              color: w.level === 'warn' ? 'var(--warn)' : 'var(--subtle)',
            }}>
              {w.message}
            </p>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
        {canShare && (
          <button onClick={share} style={btn}><Share2 size={16} />Send</button>
        )}
        <a href={smsHref(text)} onClick={() => mark('sms')} style={btn}><MessageSquare size={16} />Text</a>
        <button onClick={copy} style={btn}>
          {copied ? <Check size={16} /> : <Copy size={16} />}{copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      {session.brakeSent && (
        <p style={{ color: 'var(--positive-text)', fontSize: '0.875rem', fontWeight: 600, marginTop: '1rem' }}>
          Sent. That’s the hard part done.
        </p>
      )}
    </>
  );
}

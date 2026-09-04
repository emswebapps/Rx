import { ScalePicker, BigButton } from '../../../components/stepUi.jsx';

export default function StepRate({ session, onPatch, onAdvance }) {
  const n = session.intensity;
  // "an 8", not "a 8" — the sentence is the whole point of this screen, so it
  // has to read like a person wrote it.
  const article = n === 8 ? 'an' : 'a';

  if (n == null) {
    return (
      <>
        <p style={{ color: 'var(--muted)', fontSize: '1rem', lineHeight: 1.5, marginBottom: '1.25rem' }}>
          How loud is this right now?
        </p>
        <ScalePicker value={n} onChange={(v) => onPatch({ intensity: v })} />
      </>
    );
  }

  return (
    <>
      <p style={{ fontSize: '1.25rem', color: 'var(--text)', lineHeight: 1.45, fontWeight: 600, marginBottom: '1.5rem' }}>
        Right now this is {article} <strong style={{ color: 'var(--accent-text)' }}>{n}</strong>.
        Do you want to make {article} {n}-out-of-10 decision about your marriage?
      </p>

      <div style={{ display: 'grid', gap: '0.625rem' }}>
        <BigButton
          onClick={() => { onPatch({ wantsDecisionNow: false }); onAdvance(); }}
        >
          No — it can wait
        </BigButton>
        <BigButton
          tone="quiet"
          onClick={() => { onPatch({ wantsDecisionNow: true }); onAdvance(); }}
        >
          This one’s actually urgent
        </BigButton>
      </div>

      {session.wantsDecisionNow === false && (
        <p style={{ color: 'var(--subtle)', fontSize: '0.9375rem', lineHeight: 1.5, marginTop: '1.25rem' }}>
          Then it’s suspended — not because it doesn’t matter, but because the volume is
          wrong right now.
        </p>
      )}
      {session.wantsDecisionNow === true && (
        <p style={{ color: 'var(--subtle)', fontSize: '0.9375rem', lineHeight: 1.5, marginTop: '1.25rem' }}>
          Okay. Then let’s make sure it comes out the way you mean it — write it down, let the
          timer run out, and have the conversation with your notes in hand.
        </p>
      )}
    </>
  );
}

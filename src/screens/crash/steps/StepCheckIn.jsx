import { Chip, ScalePicker, BigButton } from '../../../components/stepUi.jsx';
import { FEELINGS } from '../../../lib/kit.js';

export default function StepCheckIn({ session, kit, onPatch }) {
  const signs = session.signs || [];
  const toggle = (id) =>
    onPatch({ signs: signs.includes(id) ? signs.filter((s) => s !== id) : [...signs, id] });

  return (
    <>
      <p style={{ color: 'var(--muted)', fontSize: '1rem', lineHeight: 1.5, marginBottom: '1rem' }}>
        Tap whatever’s true. No score, no verdict — this is just so you can see it written down.
      </p>

      <div style={{ display: 'grid', gap: '0.5rem' }}>
        {kit.warningSigns.map((s) => (
          <Chip key={s.id} selected={signs.includes(s.id)} onClick={() => toggle(s.id)}>
            {s.text}
          </Chip>
        ))}
      </div>

      <h2 style={{ fontSize: '1.0625rem', fontWeight: 800, color: 'var(--text)', margin: '1.75rem 0 0.75rem' }}>
        How does it feel right now?
      </h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
        {FEELINGS.map((f) => (
          <BigButton
            key={f.key}
            tone={session.feeling === f.key ? 'accent' : 'quiet'}
            onClick={() => onPatch({ feeling: f.key })}
            style={{ fontSize: '0.9375rem', minHeight: '4rem' }}
          >
            <span style={{ fontSize: '1.375rem', display: 'block', marginBottom: '0.25rem' }}>{f.emoji}</span>
            {f.label}
          </BigButton>
        ))}
      </div>

      <h2 style={{ fontSize: '1.0625rem', fontWeight: 800, color: 'var(--text)', margin: '1.75rem 0 0.75rem' }}>
        How loud is it? 0–10
      </h2>
      <ScalePicker value={session.intensity} onChange={(n) => onPatch({ intensity: n })} />
    </>
  );
}

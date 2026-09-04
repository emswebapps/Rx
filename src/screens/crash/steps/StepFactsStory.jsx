import { useState } from 'react';
import { Plus, X } from 'lucide-react';

/**
 * The labeling exercise. There is deliberately no "what's the evidence against
 * this?" field — the point is to sort, not to argue. An app that tries to
 * disprove the second column is an app that's taking his side, and that is the
 * fastest way to make this whole thing unusable.
 */
function Column({ title, hint, items, placeholder, accent, onAdd, onRemove }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    if (!draft.trim()) return;
    onAdd(draft.trim());
    setDraft('');
  };

  return (
    <div style={{
      backgroundColor: 'var(--surface)', borderRadius: '1rem',
      border: `1px solid ${accent ? 'var(--accent)' : 'var(--border)'}`,
      padding: '1rem', marginBottom: '1rem',
    }}>
      <h2 style={{
        fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.06em',
        color: accent ? 'var(--accent-text)' : 'var(--muted)', marginBottom: '0.25rem',
      }}>
        {title}
      </h2>
      <p style={{ fontSize: '0.8125rem', color: 'var(--subtle)', marginBottom: '0.875rem', lineHeight: 1.4 }}>
        {hint}
      </p>

      <div style={{ display: 'grid', gap: '0.5rem', marginBottom: '0.75rem' }}>
        {items.map((it) => (
          <div key={it.id} style={{
            display: 'flex', alignItems: 'flex-start', gap: '0.5rem',
            padding: '0.6875rem 0.75rem', borderRadius: '0.75rem',
            backgroundColor: 'var(--surface2)',
          }}>
            <span style={{ flex: 1, fontSize: '0.9375rem', color: 'var(--text)', lineHeight: 1.4 }}>
              {it.text}
            </span>
            <button
              onClick={() => onRemove(it.id)}
              aria-label="Remove"
              style={{ background: 'none', border: 'none', color: 'var(--subtle)', cursor: 'pointer', padding: 0 }}
            >
              <X size={15} />
            </button>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
          placeholder={placeholder}
          className="app-input"
          style={{ flex: 1, fontSize: '0.9375rem' }}
        />
        <button
          onClick={add}
          aria-label="Add"
          style={{
            width: '2.75rem', borderRadius: '0.75rem', border: 'none', cursor: 'pointer',
            backgroundColor: 'var(--surface2)', color: 'var(--text)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}
        >
          <Plus size={18} />
        </button>
      </div>
    </div>
  );
}

export default function StepFactsStory({ session, onPatch }) {
  const facts = session.facts || [];
  const stories = session.stories || [];
  const id = () => Math.random().toString(36).slice(2);

  return (
    <>
      <Column
        title="WHAT I KNOW"
        hint="Only what a camera would have caught."
        items={facts}
        placeholder="He walked into the other room"
        accent
        onAdd={(text) => onPatch({ facts: [...facts, { id: id(), text }] })}
        onRemove={(x) => onPatch({ facts: facts.filter((f) => f.id !== x) })}
      />
      <Column
        title="WHAT MY BRAIN IS TELLING ME"
        hint="Not wrong. Just not evidence."
        items={stories}
        placeholder="He doesn’t want to talk to me"
        onAdd={(text) => onPatch({ stories: [...stories, { id: id(), text }] })}
        onRemove={(x) => onPatch({ stories: stories.filter((f) => f.id !== x) })}
      />
      <p style={{ color: 'var(--subtle)', fontSize: '0.875rem', lineHeight: 1.5 }}>
        You’re not trying to talk yourself out of the second list. You’re just putting it
        on the right side of the line.
      </p>
    </>
  );
}

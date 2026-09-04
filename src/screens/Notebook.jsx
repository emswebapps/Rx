import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Pin, PinOff, Trash2, NotebookPen } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { normalizeMed } from '../lib/meds.js';
import { sortNotes, NOTE_KINDS, isBlank } from '../lib/notes.js';
import { formatDayLong } from '../lib/time.js';
import { ViewHeader, Segmented, pageStyle, headingStyle } from '../components/medsUi.jsx';

/**
 * What I've noticed.
 *
 * The dose log says what happened. This says what it means — how the medication
 * behaves, what it feels like when it wears off, what has to happen alongside
 * it, and which decisions made in that state turned out badly.
 *
 * None of it is advice and none of it is generated. Every word here was typed
 * by the person reading it; the app holds it, dates it, and puts the pinned
 * ones where they will actually be seen.
 */
export default function Notebook() {
  const { rxNotes, crashMeds, addRxNote, updateRxNote, deleteRxNote, toggleRxNotePin } = useApp();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [openId, setOpenId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const filter = params.get('kind');
  const all = sortNotes(rxNotes);
  const notes = filter ? all.filter((n) => n.kind === filter) : all;
  const medName = (id) => {
    const m = crashMeds.find((x) => x.id === id);
    return m ? (normalizeMed(m).name || 'Untitled') : null;
  };

  const add = () => {
    const created = addRxNote({ text: '', kind: filter || 'effect' });
    setOpenId(created.id);
  };

  // A note left empty was never a note. Clearing it up on the way out means an
  // abandoned "+" doesn't leave a blank row on the list forever.
  const close = (note) => {
    if (isBlank(note)) deleteRxNote(note.id);
    setOpenId(null);
  };

  return (
    <div className="app-page" style={pageStyle}>
      <ViewHeader
        title="What I’ve noticed"
        action={(
          <button onClick={add} aria-label="Add a note" style={{
            width: '2.25rem', height: '2.25rem', borderRadius: '9999px', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            backgroundColor: 'var(--accent)', color: '#fff', flexShrink: 0,
          }}>
            <Plus size={18} />
          </button>
        )}
      />

      <Segmented
        options={[{ key: '', label: 'All' }, ...NOTE_KINDS.map((k) => ({ key: k.key, label: k.label.split(' ')[0] }))]}
        value={filter || ''}
        onChange={(k) => setParams(k ? { kind: k } : {}, { replace: true })}
        style={{ marginBottom: '1.5rem' }}
      />

      {notes.length === 0 ? (
        <div style={{ paddingTop: '1.5rem', textAlign: 'center' }}>
          <NotebookPen size={30} style={{ color: 'var(--muted)', marginBottom: '1rem' }} />
          <p style={{ color: 'var(--subtle)', fontSize: '0.9375rem', lineHeight: 1.6, marginBottom: '1.5rem' }}>
            The dose log says what happened. This is for what it means — how a
            medication actually behaves, what it feels like as it wears off, what
            has to happen alongside it, and anything you’d want in front of you
            before making a decision in that state.
          </p>
          <button onClick={add} className="app-btn-primary" style={{ width: '100%' }}>
            Write one
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          {notes.map((note) => (
            <div
              key={note.id}
              className="app-card"
              style={{
                padding: '1rem',
                border: `1px solid ${note.pinned ? 'var(--accent)' : 'var(--border)'}`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <span style={{ ...headingStyle, marginBottom: 0, flex: 1 }}>
                  {(NOTE_KINDS.find((k) => k.key === note.kind) || {}).label?.toUpperCase()}
                  {note.medId && medName(note.medId) ? ` · ${medName(note.medId)}` : ''}
                </span>
                <button
                  onClick={() => toggleRxNotePin(note.id)}
                  aria-label={note.pinned ? 'Unpin this note' : 'Pin this note'}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem',
                    color: note.pinned ? 'var(--accent-text)' : 'var(--muted)',
                  }}
                >
                  {note.pinned ? <Pin size={15} /> : <PinOff size={15} />}
                </button>
              </div>

              {openId === note.id ? (
                <>
                  <textarea
                    value={note.text}
                    onChange={(e) => updateRxNote(note.id, { text: e.target.value })}
                    rows={7}
                    autoFocus
                    placeholder="In your own words."
                    className="app-input"
                    style={{ width: '100%', resize: 'vertical', lineHeight: 1.55, marginBottom: '0.625rem' }}
                  />

                  <label className="app-label">What kind</label>
                  <select
                    value={note.kind}
                    onChange={(e) => updateRxNote(note.id, { kind: e.target.value })}
                    className="app-input"
                    style={{ width: '100%', marginBottom: '0.625rem' }}
                  >
                    {NOTE_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
                  </select>

                  <label className="app-label">About a medication</label>
                  <select
                    value={note.medId || ''}
                    onChange={(e) => updateRxNote(note.id, { medId: e.target.value || null })}
                    className="app-input"
                    style={{ width: '100%', marginBottom: '0.75rem' }}
                  >
                    <option value="">Not about one in particular</option>
                    {crashMeds.map((m) => (
                      <option key={m.id} value={m.id}>{normalizeMed(m).name || 'Untitled'}</option>
                    ))}
                  </select>

                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button onClick={() => close(note)} className="app-btn-primary" style={{ flex: 1 }}>
                      Done
                    </button>
                    {confirmDelete === note.id ? (
                      <button
                        onClick={() => { deleteRxNote(note.id); setConfirmDelete(null); setOpenId(null); }}
                        style={{
                          padding: '0.75rem 1rem', borderRadius: '0.75rem', cursor: 'pointer',
                          backgroundColor: 'var(--danger)', color: '#fff', border: 'none',
                          fontSize: '0.875rem', fontWeight: 700,
                        }}
                      >
                        Delete
                      </button>
                    ) : (
                      <button
                        onClick={() => setConfirmDelete(note.id)}
                        aria-label="Delete this note"
                        style={{
                          padding: '0.75rem', borderRadius: '0.75rem', cursor: 'pointer',
                          backgroundColor: 'var(--surface2)', color: 'var(--muted)',
                          border: '1px solid var(--border)',
                        }}
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <button
                  onClick={() => { setOpenId(note.id); setConfirmDelete(null); }}
                  style={{
                    width: '100%', background: 'none', border: 'none', padding: 0,
                    cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <p style={{
                    fontSize: '0.9375rem', color: 'var(--text)', lineHeight: 1.6,
                    whiteSpace: 'pre-wrap',
                  }}>
                    {note.text}
                  </p>
                  {note.createdAt && (
                    <p style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '0.5rem' }}>
                      {formatDayLong(note.createdAt)}
                    </p>
                  )}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <p style={{ fontSize: '0.75rem', color: 'var(--subtle)', lineHeight: 1.5, marginTop: '1.5rem' }}>
        Pinned notes show up on the crash screen, which is the moment they’re
        least likely to be remembered and most likely to matter.
      </p>
    </div>
  );
}

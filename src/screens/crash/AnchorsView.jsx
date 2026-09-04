import { useState } from 'react';
import { ArrowLeft, Plus, Trash2, Pin } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { deleteFile } from '../../utils/storageUtils';
import PhotoUpload from '../../components/PhotoUpload';
import ImageLightbox from '../../components/ImageLightbox';
import Modal from '../../components/Modal';
import ConfirmDialog from '../../components/ConfirmDialog';
import { pageStyle } from '../../components/medsUi.jsx';

/**
 * The private locker. When the crash is telling you he doesn't care and you
 * genuinely cannot retrieve a single counter-example, this is where the
 * counter-examples live — in your own handwriting, saved on a good day.
 */
export default function AnchorsView({ onBack }) {
  const { user } = useAuth();
  const { crashAnchors, addCrashAnchor, updateCrashAnchor, deleteCrashAnchor } = useApp();
  const [editing, setEditing] = useState(null);
  const [lightbox, setLightbox] = useState(null);
  const [confirming, setConfirming] = useState(null);

  const sorted = [...crashAnchors].sort(
    (a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.createdAt - a.createdAt,
  );

  const remove = async (anchor) => {
    setConfirming(null);
    // Bytes first, then the record — same order DocumentVault uses, so a failed
    // delete never leaves a card pointing at a file that's already gone.
    for (const f of anchor.files || []) {
      try { await deleteFile(f.url); } catch { /* already gone */ }
    }
    deleteCrashAnchor(anchor.id);
    setEditing(null);
  };

  return (
    <div className="app-page" style={pageStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', paddingTop: '1rem', marginBottom: '1.25rem' }}>
        <button onClick={onBack} aria-label="Back" style={{
          width: '2.25rem', height: '2.25rem', borderRadius: '9999px', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backgroundColor: 'var(--surface2)', color: 'var(--muted)',
        }}>
          <ArrowLeft size={17} />
        </button>
        <h1 style={{ fontSize: '1.375rem', fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.02em' }}>
          Anchors
        </h1>
      </div>

      <p style={{ color: 'var(--subtle)', fontSize: '0.9375rem', lineHeight: 1.5, marginBottom: '1.25rem' }}>
        Things worth keeping for the nights you can’t remember any of them. Screenshots,
        photos, things he’s said. Only you can see this.
      </p>

      <button
        onClick={() => setEditing({ title: '', text: '', files: [] })}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
          padding: '1rem', borderRadius: '0.875rem', cursor: 'pointer', marginBottom: '1.25rem',
          backgroundColor: 'var(--accent-soft)', border: '1px solid var(--accent)',
          color: 'var(--accent-text)', fontSize: '0.9375rem', fontWeight: 700,
        }}
      >
        <Plus size={17} /> Add something
      </button>

      {sorted.length === 0 && (
        <p style={{ color: 'var(--subtle)', fontSize: '0.9375rem', textAlign: 'center', padding: '2rem 1rem', lineHeight: 1.5 }}>
          Nothing here yet. The best time to fill this is a day you feel fine.
        </p>
      )}

      <div style={{ display: 'grid', gap: '0.875rem' }}>
        {sorted.map((a) => (
          <div key={a.id} className="app-card" style={{ padding: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                {a.title && (
                  <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text)', marginBottom: '0.25rem' }}>
                    {a.title}
                  </h2>
                )}
                {a.text && (
                  <p style={{ fontSize: '0.9375rem', color: 'var(--muted)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                    {a.text}
                  </p>
                )}
              </div>
              <button
                onClick={() => updateCrashAnchor(a.id, { pinned: !a.pinned })}
                aria-label={a.pinned ? 'Unpin' : 'Pin'}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem',
                  color: a.pinned ? 'var(--accent-text)' : 'var(--subtle)',
                }}
              >
                <Pin size={16} fill={a.pinned ? 'currentColor' : 'none'} />
              </button>
            </div>

            {(a.files || []).length > 0 && (
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.875rem' }}>
                {a.files.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setLightbox({ anchor: a, startId: f.id })}
                    style={{
                      width: '4.5rem', height: '4.5rem', borderRadius: '0.625rem', overflow: 'hidden',
                      border: '1px solid var(--border)', padding: 0, cursor: 'pointer',
                      backgroundColor: 'var(--surface2)',
                    }}
                  >
                    <img src={f.url} alt={f.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </button>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.875rem' }}>
              <button
                onClick={() => setEditing(a)}
                style={{ background: 'none', border: 'none', color: 'var(--accent-text)', fontSize: '0.875rem', fontWeight: 700, cursor: 'pointer', padding: 0 }}
              >
                Edit
              </button>
              <button
                onClick={() => setConfirming(a)}
                style={{ background: 'none', border: 'none', color: 'var(--subtle)', fontSize: '0.875rem', fontWeight: 700, cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: '0.25rem' }}
              >
                <Trash2 size={14} /> Remove
              </button>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <AnchorForm
          anchor={editing}
          uid={user?.uid}
          onSave={(data) => {
            if (editing.id) updateCrashAnchor(editing.id, data);
            else addCrashAnchor(data);
            setEditing(null);
          }}
          onAttach={(files) => {
            if (editing.id) updateCrashAnchor(editing.id, { files });
            else setEditing((e) => ({ ...e, files }));
          }}
          onClose={() => setEditing(null)}
        />
      )}

      {lightbox && (
        <ImageLightbox
          attachments={lightbox.anchor.files}
          startId={lightbox.startId}
          title={lightbox.anchor.title || 'Anchor'}
          onClose={() => setLightbox(null)}
        />
      )}

      {confirming && (
        <ConfirmDialog
          title="Remove this?"
          message="It’ll be gone for good, along with anything attached to it."
          confirmLabel="Remove"
          onConfirm={() => remove(confirming)}
          onCancel={() => setConfirming(null)}
        />
      )}
    </div>
  );
}

function AnchorForm({ anchor, uid, onSave, onAttach, onClose }) {
  const [title, setTitle] = useState(anchor.title || '');
  const [text, setText] = useState(anchor.text || '');
  const [files, setFiles] = useState(anchor.files || []);

  // A new anchor needs an id before it can own a Storage folder, so it gets one
  // up front rather than after save.
  const [draftId] = useState(anchor.id || `new-${Math.random().toString(36).slice(2)}`);

  return (
    <Modal
      title={anchor.id ? 'Edit anchor' : 'Add an anchor'}
      onClose={onClose}
      footer={
        <button
          onClick={() => onSave({ title: title.trim(), text: text.trim(), files })}
          className="app-btn-primary"
          style={{ width: '100%' }}
        >
          Save
        </button>
      }
    >
      <label className="app-label">What is it?</label>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="The thing he said in the car"
        className="app-input"
        style={{ width: '100%', marginBottom: '1rem' }}
      />

      <label className="app-label">Why it matters</label>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        placeholder="Write it for the version of you who won't be able to remember this."
        className="app-input"
        style={{ width: '100%', resize: 'vertical', marginBottom: '1rem', lineHeight: 1.5 }}
      />

      <label className="app-label">Photos &amp; screenshots</label>
      <PhotoUpload
        storagePath={`users/${uid}/crash/${draftId}`}
        attachments={files}
        onChange={(next) => { setFiles(next); onAttach(next); }}
      />
    </Modal>
  );
}

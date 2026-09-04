import { useRef, useState } from 'react';
import { Camera, ImagePlus, X, FileText, AlertCircle } from 'lucide-react';
import { uploadFile, deleteFile, fileCategory } from '../utils/storageUtils';

/**
 * A grid of photo attachments with an add button — for receipts, screenshots and
 * anything else you'd want to look at rather than download.
 *
 * Uploads land in Firebase Storage straight away and `onChange` is called with
 * the whole new array, so the parent can save it without waiting for a form
 * submit. That keeps a half-finished edit from stranding a file with nothing
 * pointing at it.
 *
 * Props:
 *   storagePath  — Storage base path, e.g. "users/uid/todos/itemId"
 *   attachments  — current array of {id,name,url,type,size,uploadedAt}
 *   onChange     — called with the next array after an add or a remove
 *   onOpen       — called with an attachment when its tile is tapped
 *   accept       — file input accept string
 */
export default function PhotoUpload({
  storagePath,
  attachments = [],
  onChange,
  onOpen,
  accept = 'image/*,.pdf',
}) {
  const [busy, setBusy] = useState(null); // { done, total, pct }
  const [error, setError] = useState('');
  const [removing, setRemoving] = useState(null);
  const libraryRef = useRef();
  const cameraRef = useRef();

  const handleFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;
    setError('');
    const added = [];
    try {
      for (let i = 0; i < files.length; i++) {
        setBusy({ done: i, total: files.length, pct: 0 });
        // Sequential on purpose: phone uploads over cellular do better one at a
        // time, and the progress bar stays honest.
        const att = await uploadFile(storagePath, files[i], (pct) =>
          setBusy({ done: i, total: files.length, pct })
        );
        added.push(att);
      }
    } catch (err) {
      setError(err.message || 'Upload failed');
    } finally {
      if (added.length > 0) onChange?.([...attachments, ...added]);
      setBusy(null);
      if (libraryRef.current) libraryRef.current.value = '';
      if (cameraRef.current) cameraRef.current.value = '';
    }
  };

  const handleRemove = async (att) => {
    setRemoving(att.id);
    // Drop it from the list either way — a file that's already gone shouldn't
    // leave a broken tile behind.
    try { await deleteFile(att.url); } catch { /* already gone */ }
    onChange?.(attachments.filter((a) => a.id !== att.id));
    setRemoving(null);
  };

  const TILE = {
    position: 'relative', width: '4.75rem', height: '4.75rem', flexShrink: 0,
    borderRadius: '0.75rem', overflow: 'hidden', border: '1px solid var(--border)',
    backgroundColor: 'var(--surface2)', cursor: 'pointer',
  };

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        {attachments.map((att) => {
          const isImage = fileCategory(att.type) === 'image';
          return (
            <div key={att.id} style={{ ...TILE, opacity: removing === att.id ? 0.4 : 1 }}>
              <div
                onClick={() => onOpen?.(att)}
                title={att.name}
                style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                {isImage ? (
                  <img src={att.url} alt={att.name} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ textAlign: 'center', padding: '0.25rem' }}>
                    <FileText size={20} style={{ color: 'var(--muted)' }} />
                    <p style={{ fontSize: '0.5625rem', color: 'var(--subtle)', marginTop: '0.125rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '4rem' }}>{att.name}</p>
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => handleRemove(att)}
                disabled={removing === att.id}
                title="Remove"
                style={{
                  position: 'absolute', top: '0.1875rem', right: '0.1875rem',
                  width: '1.25rem', height: '1.25rem', borderRadius: '9999px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  backgroundColor: 'rgba(0,0,0,0.6)', color: '#fff',
                  border: 'none', cursor: 'pointer', padding: 0,
                }}
              >
                <X size={12} />
              </button>
            </div>
          );
        })}

        {busy ? (
          <div style={{ ...TILE, cursor: 'default', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.3125rem' }}>
            <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--muted)' }}>
              {busy.pct}%
            </span>
            <div style={{ width: '70%', height: '0.25rem', backgroundColor: 'var(--border)', borderRadius: '9999px', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${busy.pct}%`, backgroundColor: 'var(--accent)', transition: 'width 0.15s' }} />
            </div>
            {busy.total > 1 && (
              <span style={{ fontSize: '0.625rem', color: 'var(--subtle)' }}>{busy.done + 1} of {busy.total}</span>
            )}
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={() => libraryRef.current?.click()}
              title="Choose photos"
              style={{ ...TILE, border: '2px dashed var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.1875rem', backgroundColor: 'transparent' }}
            >
              <ImagePlus size={18} style={{ color: 'var(--accent-text)' }} />
              <span style={{ fontSize: '0.625rem', fontWeight: 600, color: 'var(--muted)' }}>Choose</span>
            </button>
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              title="Take a photo"
              style={{ ...TILE, border: '2px dashed var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.1875rem', backgroundColor: 'transparent' }}
            >
              <Camera size={18} style={{ color: 'var(--accent-text)' }} />
              <span style={{ fontSize: '0.625rem', fontWeight: 600, color: 'var(--muted)' }}>Camera</span>
            </button>
          </>
        )}
      </div>

      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.625rem', backgroundColor: 'rgba(244,63,94,0.08)', border: '1px solid var(--danger)', borderRadius: '0.625rem', padding: '0.5rem 0.75rem' }}>
          <AlertCircle size={14} style={{ color: 'var(--danger)', flexShrink: 0 }} />
          <p style={{ fontSize: '0.8125rem', color: 'var(--danger)' }}>{error}</p>
        </div>
      )}

      <input ref={libraryRef} type="file" accept={accept} multiple onChange={(e) => handleFiles(e.target.files)} style={{ display: 'none' }} />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={(e) => handleFiles(e.target.files)} style={{ display: 'none' }} />
    </div>
  );
}

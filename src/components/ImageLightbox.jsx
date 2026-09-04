import { useEffect, useState } from 'react';
import { X, ChevronLeft, ChevronRight, ExternalLink, FileText } from 'lucide-react';
import { fileCategory } from '../utils/storageUtils';

/**
 * Full-screen viewer for an item's attachments — tap a receipt on a task and
 * read it without leaving the app or hunting through Files.
 *
 * Props:
 *   attachments — array of {id,name,url,type}
 *   startId     — attachment to open on (defaults to the first)
 *   title       — shown above the image, usually the task name
 *   onClose     — called on backdrop tap, the X button, or Escape
 */
export default function ImageLightbox({ attachments = [], startId, title, onClose }) {
  const startIndex = Math.max(0, attachments.findIndex((a) => a.id === startId));
  const [index, setIndex] = useState(startIndex);

  const count = attachments.length;
  const current = attachments[index];

  const step = (delta) => setIndex((i) => (i + delta + count) % count);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
      if (count > 1 && e.key === 'ArrowRight') step(1);
      if (count > 1 && e.key === 'ArrowLeft') step(-1);
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [count, onClose]);

  if (!current) return null;

  const isImage = fileCategory(current.type) === 'image';

  const ARROW = {
    position: 'absolute', top: '50%', transform: 'translateY(-50%)',
    width: '2.75rem', height: '2.75rem', borderRadius: '9999px',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)', color: '#fff',
    border: 'none', cursor: 'pointer', zIndex: 2,
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 90, backgroundColor: 'rgba(0,0,0,0.94)', backdropFilter: 'blur(6px)', display: 'flex', flexDirection: 'column' }}>
      {/* header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.75rem',
        padding: 'max(0.875rem, env(safe-area-inset-top, 0px)) 1rem 0.875rem',
        flexShrink: 0,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {title && <p style={{ fontSize: '0.9375rem', fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</p>}
          <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.55)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {current.name}{count > 1 ? ` · ${index + 1} of ${count}` : ''}
          </p>
        </div>
        <a
          href={current.url}
          target="_blank"
          rel="noopener noreferrer"
          title="Open full size"
          style={{ width: '2.25rem', height: '2.25rem', borderRadius: '9999px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)', color: '#fff', flexShrink: 0 }}
        >
          <ExternalLink size={16} />
        </a>
        <button
          onClick={onClose}
          title="Close"
          style={{ width: '2.25rem', height: '2.25rem', borderRadius: '9999px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)', color: '#fff', border: 'none', cursor: 'pointer', flexShrink: 0 }}
        >
          <X size={18} />
        </button>
      </div>

      {/* stage — tapping the empty space closes, same as the backdrop elsewhere */}
      <div
        onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
        style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 1rem 1rem' }}
      >
        {isImage ? (
          <img
            src={current.url}
            alt={current.name}
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: '0.75rem' }}
          />
        ) : (
          <a
            href={current.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ textAlign: 'center', color: '#fff', textDecoration: 'none' }}
          >
            <FileText size={44} style={{ opacity: 0.6, margin: '0 auto 0.75rem', display: 'block' }} />
            <p style={{ fontSize: '0.9375rem', fontWeight: 600 }}>{current.name}</p>
            <p style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.55)', marginTop: '0.25rem' }}>Tap to open</p>
          </a>
        )}

        {count > 1 && (
          <>
            <button onClick={() => step(-1)} title="Previous" style={{ ...ARROW, left: '0.5rem' }}><ChevronLeft size={20} /></button>
            <button onClick={() => step(1)} title="Next" style={{ ...ARROW, right: '0.5rem' }}><ChevronRight size={20} /></button>
          </>
        )}
      </div>

      {/* filmstrip */}
      {count > 1 && (
        <div style={{
          display: 'flex', gap: '0.5rem', overflowX: 'auto',
          padding: '0 1rem max(1rem, env(safe-area-inset-bottom, 0px))',
          flexShrink: 0,
        }}>
          {attachments.map((att, i) => (
            <button
              key={att.id}
              onClick={() => setIndex(i)}
              style={{
                width: '3.25rem', height: '3.25rem', flexShrink: 0, padding: 0,
                borderRadius: '0.5rem', overflow: 'hidden', cursor: 'pointer',
                border: `2px solid ${i === index ? '#fff' : 'transparent'}`,
                backgroundColor: 'rgba(255,255,255,0.08)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                opacity: i === index ? 1 : 0.55,
              }}
            >
              {fileCategory(att.type) === 'image'
                ? <img src={att.url} alt={att.name} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <FileText size={16} style={{ color: '#fff' }} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

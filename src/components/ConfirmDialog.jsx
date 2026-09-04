import { AlertTriangle } from 'lucide-react';
import Modal from './Modal';

export default function ConfirmDialog({ title = 'Delete?', message, confirmLabel = 'Delete', onConfirm, onCancel }) {
  return (
    <Modal title={title} onClose={onCancel}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
          <AlertTriangle size={20} style={{ color: 'var(--danger)', flexShrink: 0, marginTop: '0.125rem' }} />
          <p style={{ fontSize: '0.9375rem', color: 'var(--text)', lineHeight: 1.5, margin: 0 }}>{message}</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button type="button" onClick={onCancel} className="app-btn-secondary" style={{ flex: 1 }}>Cancel</button>
          <button
            type="button"
            onClick={onConfirm}
            style={{ flex: 1, backgroundColor: 'var(--danger)', color: '#fff', border: 'none', borderRadius: '0.75rem', padding: '0.75rem', fontWeight: 700, fontSize: '0.9375rem', cursor: 'pointer' }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// src/components/recycle/RecycleBinModal.tsx

import { useEffect } from 'react';
import { useRecycleBin } from '../../hooks/useRecycleBin';

interface Props { open: boolean; onClose: () => void; onRestored: () => void; }

export default function RecycleBinModal({ open, onClose, onRestored }: Props) {
  const { items, loading, error, fetch, restore, purge } = useRecycleBin();

  useEffect(() => { if (open) fetch('risk'); }, [open]);

  if (!open) return null;

  async function handleRestore(binId: string) {
    const ok = await restore(binId);
    if (ok) onRestored();
  }

  return (
    <div className="modal-backdrop show" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-hd">
          <h3 className="modal-title">Recycle Bin</h3>
          <button className="x" onClick={onClose}>✕</button>
        </div>
        <div className="modal-bd">
          {error && <div className="auth-error" style={{ marginBottom: 12 }}>{error}</div>}
          {loading && <p style={{ textAlign: 'center', color: 'var(--muted)', padding: 20 }}>Loading...</p>}
          {!loading && items.length === 0 && (
            <p style={{ textAlign: 'center', color: 'var(--muted)', padding: 20 }}>Recycle bin is empty.</p>
          )}
          {!loading && items.map(item => (
            <div key={item.bin_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
              <div>
                <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', margin: 0 }}>{item.item_id} — {item.summary}</p>
                <p style={{ fontSize: 12, color: 'var(--muted)', margin: '2px 0 0' }}>
                  Deleted by {item.deleted_by} · {item.days_left}d remaining
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <button className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }}
                  onClick={() => handleRestore(item.bin_id)}>Restore</button>
                <button className="btn" style={{ fontSize: 12, padding: '4px 10px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }}
                  onClick={() => purge(item.bin_id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
        <div className="modal-ft">
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
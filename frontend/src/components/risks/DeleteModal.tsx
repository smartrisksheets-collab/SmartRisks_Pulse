// src/components/risks/DeleteModal.tsx

interface Props {
  open:     boolean;
  riskId:   string | null;
  desc:     string | null;
  loading:  boolean;
  onConfirm: () => void;
  onClose:   () => void;
}

export default function DeleteModal({ open, riskId, desc, loading, onConfirm, onClose }: Props) {
  if (!open || !riskId) return null;

  return (
    <div className="modal-backdrop show" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 520 }}>
        <div className="modal-hd">
          <h3 className="modal-title">Delete Risk</h3>
          <button className="x" onClick={onClose}>✕</button>
        </div>
        <div className="modal-bd">
          <p className="muted small" style={{ marginBottom: 14 }}>
            This risk will be moved to the recycle bin. You can restore it from there.
          </p>
          <div className="modal-grid">
            <div className="field col-12">
              <label>Risk ID</label>
              <input value={riskId} readOnly />
            </div>
            <div className="field col-12">
              <label>Description</label>
              <textarea value={desc ?? '—'} readOnly style={{ minHeight: 80 }} />
            </div>
          </div>
        </div>
        <div className="modal-ft">
          <button className="btn btn-secondary" onClick={onClose} disabled={loading}>Cancel</button>
          <button className="btn btn-danger" onClick={onConfirm} disabled={loading}>
            {loading && <span className="spinner" />}
            Delete Risk
          </button>
        </div>
      </div>
    </div>
  );
}
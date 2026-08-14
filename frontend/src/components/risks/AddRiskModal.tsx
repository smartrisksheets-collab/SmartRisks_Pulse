// src/components/risks/AddRiskModal.tsx

import { useState } from 'react';
import RiskForm from './RiskForm';
import type { Risk, RiskCreate } from '../../types/risk';
import { useFeedbackStore } from '../../store/feedbackStore';

interface Props {
  open:     boolean;
  onClose:  () => void;
  onSubmit: (payload: RiskCreate) => Promise<Risk | null>;
}

export default function AddRiskModal({ open, onClose, onSubmit }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  if (!open) return null;

  async function handleSubmit(values: RiskCreate) {
    setLoading(true);
    setError(null);
    try {
      const risk = await onSubmit(values);
      if (risk) {
        useFeedbackStore.getState().trigger('add_risk', 'How was adding your first risk?');
        onClose();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create risk');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-backdrop show" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-hd">
          <h3 className="modal-title">Add Risk</h3>
          <button className="x" onClick={onClose}>✕</button>
        </div>
        <RiskForm submitLabel="Add Risk" loading={loading} error={error}
          onSubmit={handleSubmit} onCancel={onClose} />
      </div>
    </div>
  );
}
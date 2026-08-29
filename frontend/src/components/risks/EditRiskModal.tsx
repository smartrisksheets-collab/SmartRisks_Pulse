// src/components/risks/EditRiskModal.tsx

import { useState } from 'react';
import RiskForm, { type RiskFormValues } from './RiskForm';
import type { Risk, RiskCreate } from '../../types/risk';

interface Props {
  open:     boolean;
  risk:     Risk | null;
  onClose:  () => void;
  onSubmit: (id: string, payload: Partial<RiskCreate>) => Promise<Risk | null>;
}

export default function EditRiskModal({ open, risk, onClose, onSubmit }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  if (!open || !risk) return null;

  const initial: Partial<RiskFormValues> = {
    category:             risk.category ?? '',
    description:          risk.description ?? '',
    owner:                risk.owner ?? '',
    primary_impact:       risk.primary_impact ?? '',
    logged_at:            risk.logged_at ?? '',
    likelihood:           risk.likelihood ?? 3,
    impact_score:         risk.impact_score ?? 3,
    treatment:            risk.treatment ?? 'Mitigate',
    controls:             risk.controls ?? '',
    control_effectiveness: risk.control_effectiveness ?? 0,
    mitigation_plan:      risk.mitigation_plan ?? '',
    comments:             risk.comments ?? '',
    owner_email:          risk.owner_email ?? '',
    target_date:          risk.target_date ?? '',
    mitigation_status:        risk.mitigation_status        ?? 'Open',
    root_cause:               risk.root_cause               ?? '',
    financial_exposure:       risk.financial_exposure        ?? '',
    linked_decision:          risk.linked_decision           ?? '',
    control_last_tested:      risk.control_last_tested       ?? '',
    control_assertion_source: risk.control_assertion_source  ?? 'Self-assessed',
  };

  async function handleSubmit(values: RiskCreate) {
    if (!risk) return;
    setLoading(true);
    setError(null);
    try {
      const updated = await onSubmit(risk.id, values);
      if (updated) onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update risk');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-backdrop show" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-tall">
        <div className="modal-hd">
          <h3 className="modal-title">Edit Risk <span style={{ color: '#01b88e' }}>{risk.id}</span></h3>
          <button className="x" onClick={onClose}>✕</button>
        </div>
        <RiskForm key={risk.id} editId={risk.id} initial={initial} submitLabel="Save Changes"
          loading={loading} error={error} onSubmit={handleSubmit} onCancel={onClose} />
      </div>
    </div>
  );
}
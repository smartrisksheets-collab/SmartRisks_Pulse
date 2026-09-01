// src/components/risks/RiskDetailModal.tsx

import { useState } from 'react';
import type { Risk } from '../../types/risk';
import { useCanDo } from '../../utils/permissions';

interface Props {
  open:              boolean;
  risk:              Risk | null;
  onClose:           () => void;
  onEdit:            () => void;
  onDelete:          () => void;
  onLinkDecision?:   (decision: string) => Promise<void>;
}

function decisionDays(loggedAt: string | null | undefined): number {
  if (!loggedAt) return 0;
  return Math.floor((Date.now() - new Date(loggedAt).getTime()) / 86_400_000);
}

function levelBadgeClass(index: number | null): string {
  const map: Record<number, string> = { 5: 'extreme', 4: 'vhigh', 3: 'high', 2: 'med', 1: 'low' };
  return map[index ?? 1] ?? 'low';
}

function GridField({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="sr-detail-field">
      <div className="sr-detail-label">{label}</div>
      <div className="sr-detail-value">{value ?? '—'}</div>
    </div>
  );
}

export default function RiskDetailModal({ open, risk, onClose, onEdit, onDelete, onLinkDecision }: Props) {
  const canManage = useCanDo('manage_risks');
  const [decisionText, setDecisionText] = useState('');
  const [linkSaving,   setLinkSaving]   = useState(false);


  if (!open || !risk) return null;

  return (
    <div className="modal-backdrop show" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 780, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>

        <div className="modal-hd">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h3 className="modal-title">{risk.description}</h3>
            <span className={`badge ${levelBadgeClass(risk.level_index)}`}>{risk.level ?? '—'}</span>
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
              background: '#dbeafe', color: '#1d4ed8',
            }}>Internal</span>
          </div>
          <button className="x" onClick={onClose}>✕</button>
        </div>

        <div className="modal-bd" style={{ overflowY: 'auto', flex: 1 }}>

          {/* Decision warning — shown when no linked decision */}
          {!risk.linked_decision && (
            <div className="decision-warn-box">
              <div className="decision-warn-box-label">
                Linked decision <span style={{ fontWeight: 400, fontStyle: 'italic', textTransform: 'none' }}>optional</span>
              </div>
              {onLinkDecision && canManage && (
                <div className="field" style={{ marginBottom: 0 }}>
                  <input
                    value={decisionText}
                    onChange={e => setDecisionText(e.target.value)}
                    placeholder="Which upcoming decision does this risk affect?"
                  />
                </div>
              )}
              {onLinkDecision && canManage && decisionText.trim() && (
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ marginTop: 8, padding: '6px 14px', fontSize: 12 }}
                  disabled={linkSaving}
                  onClick={async () => {
                    setLinkSaving(true);
                    try { await onLinkDecision(decisionText.trim()); }
                    finally { setLinkSaving(false); }
                  }}
                >
                  {linkSaving ? 'Saving…' : 'Link decision'}
                </button>
              )}
              <div className="decision-warn-box-msg">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#b9762a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
                <p>No decision linked for {decisionDays(risk.logged_at)} days, flagged as undecided.</p>
              </div>
            </div>
          )}

          {/* Two-column field grid */}
          <div className="sr-detail-grid">
            <GridField label="Category"          value={risk.category} />
            <GridField label="Dept/Risk Owner"   value={risk.owner} />
            <GridField label="Date Logged"       value={risk.logged_at} />
            <GridField label="Last Reviewed"     value={risk.last_reviewed_at?.slice(0, 10)} />
            <GridField label="Likelihood"        value={risk.likelihood} />
            <GridField label="Impact"            value={risk.impact_score} />
            <GridField label="Severity"          value={risk.severity} />
            <GridField label="Treatment"         value={risk.treatment} />
            <GridField label="Residual"          value={risk.residual != null ? Math.round(risk.residual) : null} />
            <GridField label="Freshness"         value={risk.freshness} />
            <GridField label="Controls"          value={risk.controls} />
            <GridField label="Control Eff."      value={risk.control_effectiveness != null ? `${risk.control_effectiveness}` : null} />
            <GridField label="Last Tested"       value={risk.control_last_tested} />
            <GridField label="Assertion Source"  value={risk.control_assertion_source} />
            <GridField label="Financial Exposure" value={risk.financial_exposure} />
            {risk.linked_decision && (
              <GridField label="Linked Decision" value={risk.linked_decision} />
            )}
          </div>

          {/* Description */}
          <div className="sr-detail-section">
            <div className="sr-detail-label">Description</div>
            <div className="sr-detail-value" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
              {risk.description ?? '—'}
            </div>
          </div>

          {/* Optional fields */}
          {risk.primary_impact && (
            <div className="sr-detail-section">
              <div className="sr-detail-label">Primary Impact</div>
              <div className="sr-detail-value">{risk.primary_impact}</div>
            </div>
          )}

          {risk.mitigation_plan && (
            <div className="sr-detail-section">
              <div className="sr-detail-label">Mitigation Plan</div>
              <div className="sr-detail-value">{risk.mitigation_plan}</div>
            </div>
          )}

          {/* AI Insights */}
          {risk.ai_insight && (
            <div className="sr-detail-section">
              <div className="sr-detail-label">AI Insights</div>
              <div className="sr-detail-value" style={{ whiteSpace: 'pre-line', lineHeight: 1.6 }}>
                {risk.ai_insight}
              </div>
            </div>
          )}

          {/* Comments */}
          {risk.comments && (
            <div className="sr-detail-section">
              <div className="sr-detail-label">Comments</div>
              <div className="sr-detail-value">{risk.comments}</div>
            </div>
          )}

        </div>

        <div className="modal-ft" style={{ justifyContent: 'space-between' }}>
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
          {canManage && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn btn-secondary"
                style={{ color: '#dc2626', borderColor: '#fecaca' }}
                onClick={onDelete}
              >
                Delete
              </button>
              <button className="btn btn-navy" onClick={onEdit}>Edit Risk</button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
// src/components/incidents/IncidentDetailDrawer.tsx

import { useState, useCallback } from 'react';
import { X, Sparkles } from 'lucide-react';
import { useCanDo } from '../../utils/permissions';
import { useAuditLog } from '../../hooks/useAudit';
import { useIncidentSeverity } from '../../hooks/useIncidentSeverity';
import type { Incident, IncidentUpdate } from '../../types/incident';
import * as incidentsApi from '../../services/incidents';

interface Props {
  incident:  Incident;
  members:   { name: string; email: string }[];
  onClose:   () => void;
  onSaved:   (updated: Incident) => void;
  onDeleted: () => void;
}

const REVIEW_STATUSES = ['Triaged', 'Investigating', 'Pending Evidence', 'Remediating', 'Validated'];
const STATUSES = ['New', 'Open', 'In Progress', 'Under Review', 'Resolved', 'Closed'];


export default function IncidentDetailDrawer({ incident, members, onClose, onSaved, onDeleted }: Props) {
  const { config: sevConfig } = useIncidentSeverity();
  const sevBadgeColor = sevConfig.data?.levels.find(
    l => l.label === incident.severity
  )?.color ?? '#64748b';

  const canReview = useCanDo('review_resolve');
  const canAI     = useCanDo('generate_ai');
  const [status, setStatus]             = useState(incident.status ?? 'New');
  const [assignedTo, setAssignedTo]     = useState(incident.assigned_to ?? '');
  const [reviewStatus, setReviewStatus] = useState(incident.review_status ?? '');
  const [riskImpacted, setRiskImpacted] = useState(incident.risk_impacted ?? 'No');
  const [resolution, setResolution]     = useState(incident.resolution_summary ?? '');
  const [aiImpact, setAiImpact]         = useState(incident.ai_impact ?? '');
  const [aiActions, setAiActions]       = useState(incident.ai_actions ?? '');
  const [aiLoading, setAiLoading]       = useState(false);
  const [saving, setSaving]             = useState(false);
  const [deleting, setDeleting]         = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [drawerError,       setDrawerError]       = useState<string | null>(null);
  const [financialImpact,   setFinancialImpact]   = useState(String(incident.financial_impact ?? ''));
  const [impactConfidence,  setImpactConfidence]  = useState(incident.impact_confidence ?? 'Unknown');
  const [controlOutcome,    setControlOutcome]    = useState(incident.control_outcome ?? '');

  const { data: auditData } = useAuditLog({ module: 'Incident', page_size: 50 });
  const incidentAudit = (auditData?.data ?? [])
    .filter(e => e.record_id === incident.id)
    .slice(0, 8);

  const showError = useCallback((msg: string) => {
    setDrawerError(msg);
    setTimeout(() => setDrawerError(null), 5000);
  }, []);

  const ownerOptions = members.map(m => m.name || m.email);

  async function handleSave() {
    setSaving(true);
    try {
      const patch: IncidentUpdate = {
        status,
        assigned_to:       assignedTo,
        review_status:     reviewStatus,
        risk_impacted:     riskImpacted,
        resolution_summary: resolution,
        financial_impact:  financialImpact  || undefined,
        impact_confidence: impactConfidence || undefined,
        control_outcome:   controlOutcome   || undefined,
      };
      const updated = await incidentsApi.updateIncident(incident.id, patch);
      onSaved(updated);
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleMarkResolved() {
    setSaving(true);
    try {
      const patch: IncidentUpdate = {
        status:            'Resolved',
        assigned_to:       assignedTo,
        review_status:     reviewStatus,
        risk_impacted:     riskImpacted,
        resolution_summary: resolution,
        financial_impact:  financialImpact  || undefined,
        impact_confidence: impactConfidence || undefined,
        control_outcome:   controlOutcome   || undefined,
      };
      const updated = await incidentsApi.updateIncident(incident.id, patch);
      onSaved(updated);
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Failed to mark resolved');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setDeleting(true);
    try {
      await incidentsApi.deleteIncident(incident.id);
      onDeleted();
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Delete failed');
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  async function handleGenerateAI() {
    setAiLoading(true);
    try {
      const [impact, actions] = await Promise.all([
        incidentsApi.generateAIImpact(incident.id, true),
        incidentsApi.generateAIActions(incident.id, true),
      ]);
      setAiImpact(impact.text);
      setAiActions(actions.text);
    } catch (e) {
      showError(e instanceof Error ? e.message : 'AI generation failed');
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <>
      <div className="srs-backdrop" onClick={onClose} />
      <aside className="srs-drawer open" aria-label="Incident Detail">

        {/* Header */}
        <div className="srs-drawer-hd">
          <div className="srs-title-row">
            <span className="srs-incident-id">{incident.id}</span>
            <button className="srs-icon-btn" onClick={onClose} type="button"><X size={18} /></button>
          </div>
          <div className="srs-badges-row">
            <span className="srs-badge" style={{ borderColor: sevBadgeColor, color: sevBadgeColor }}>
              {incident.severity ?? 'Medium'}
            </span>
            <div className="srs-field-inline">
              <label className="srs-label-mini" htmlFor="drw-status">Status</label>
              <select id="drw-status" className="srs-select" value={status} onChange={e => setStatus(e.target.value)}>
                {STATUSES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="srs-drawer-bd">

          {/* Incident Details */}
          <section className="srs-card">
            <div className="srs-card-hd">Incident Details</div>
            <div className="srs-grid">
              <div><div className="srs-k">Category</div><div className="srs-v">{incident.category ?? '—'}</div></div>
              <div><div className="srs-k">Reported By</div><div className="srs-v">{incident.reported_by ?? '—'}</div></div>
              <div><div className="srs-k">Date Logged</div><div className="srs-v">{incident.reported_at ?? '—'}</div></div>
              <div><div className="srs-k">Affected Asset</div><div className="srs-v">{incident.affected_asset ?? '—'}</div></div>
              <div><div className="srs-k">Time of Incident</div><div className="srs-v">{incident.incident_dt ?? '—'}</div></div>
              <div><div className="srs-k">Actions Taken</div><div className="srs-v">{incident.immediate_actions ?? '—'}</div></div>
            </div>
          </section>

          {/* Description */}
          <section className="srs-card">
            <div className="srs-card-hd">Description</div>
            <div className="srs-text">{incident.description ?? '—'}</div>
          </section>

          {/* Review Actions */}
          {canReview && (
          <section className="srs-card">
            <div className="srs-card-hd">Review Actions</div>
            <div className="srs-row2" style={{ marginBottom: 12 }}>
              <div>
                <label className="srs-label" htmlFor="drw-owner">Assign Owner</label>
                <select id="drw-owner" className="srs-select" style={{ width: '100%' }} value={assignedTo} onChange={e => setAssignedTo(e.target.value)}>
                  <option value="">Select Owner</option>
                  {ownerOptions.map(o => <option key={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <label className="srs-label" htmlFor="drw-review-status">Review Status</label>
                <select id="drw-review-status" className="srs-select" style={{ width: '100%' }} value={reviewStatus} onChange={e => setReviewStatus(e.target.value)}>
                  <option value="">Select Status</option>
                  {REVIEW_STATUSES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label className="srs-label">Risk Impacted?</label>
              <div className="srs-seg">
                {['Yes', 'No'].map(v => (
                  <button key={v} type="button" className={`srs-seg-btn${riskImpacted === v ? ' active' : ''}`} onClick={() => setRiskImpacted(v)}>{v}</button>
                ))}
              </div>
            </div>
            <div className="srs-row2" style={{ marginBottom: 12 }}>
              <div>
                <label className="srs-label" htmlFor="drw-fin-impact">Financial Impact</label>
                <input
                  id="drw-fin-impact"
                  type="number"
                  min={0}
                  className="srs-select"
                  style={{ width: '100%' }}
                  placeholder="0"
                  value={financialImpact}
                  onChange={e => setFinancialImpact(e.target.value)}
                />
              </div>
              <div>
                <label className="srs-label" htmlFor="drw-confidence">Impact Confidence</label>
                <select
                  id="drw-confidence"
                  className="srs-select"
                  style={{ width: '100%' }}
                  value={impactConfidence}
                  onChange={e => setImpactConfidence(e.target.value)}
                >
                  {['Unknown', 'Estimated', 'Confirmed'].map(o => <option key={o}>{o}</option>)}
                </select>
              </div>
            </div>
            {incident.linked_risk_id && (
              <div style={{ marginBottom: 12 }}>
                <label className="srs-label">Linked Risk</label>
                <div className="srs-v" style={{ marginTop: 4 }}>{incident.linked_risk_id}</div>
                {incident.linked_control && (
                  <div className="srs-v" style={{ marginTop: 2, fontSize: 12 }}>
                    Control: {incident.linked_control}
                  </div>
                )}
                <div style={{ marginTop: 8 }}>
                  <label className="srs-label" htmlFor="drw-outcome">Control Outcome</label>
                  <select
                    id="drw-outcome"
                    className="srs-select"
                    style={{ width: '100%' }}
                    value={controlOutcome}
                    onChange={e => setControlOutcome(e.target.value)}
                  >
                    <option value="">— Select outcome —</option>
                    {['Control failed', 'Control partially worked', 'Control was bypassed',
                      'Control was not applicable', 'No control existed'].map(o => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
            <div>
              <label className="srs-label" htmlFor="drw-resolution">Resolution Summary</label>
              <textarea id="drw-resolution" className="srs-textarea" rows={4} style={{ width: '100%', boxSizing: 'border-box' }} placeholder="Enter resolution details…" value={resolution} onChange={e => setResolution(e.target.value)} />
            </div>
          </section>
          )}

          {/* AI Analysis — auto-surfaced if generated, on-demand otherwise */}
          {(aiImpact || aiActions) ? (
            <div className="srs-ai-card">
              <div className="srs-ai-card-hd">
                <span className="srs-ai-card-title">AI Analysis</span>
                <span className="srs-ai-card-badge">Auto-generated</span>
              </div>
              {aiImpact && (
                <div className="srs-ai-card-text">{aiImpact}</div>
              )}
              {aiActions && (
                <div className="srs-ai-card-rec"><strong>Recommended: </strong>{aiActions}</div>
              )}
              {canAI && (
                <div className="srs-ai-card-footer">
                  <button
                    className="srs-ai-card-regen"
                    type="button"
                    onClick={handleGenerateAI}
                    disabled={aiLoading}
                  >
                    <Sparkles size={12} style={{ marginRight: 5 }} />
                    {aiLoading ? 'Working…' : 'Regenerate'}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <section className="srs-card">
              <div className="srs-card-hd">AI Analysis</div>
              <div className="srs-ai-actions">
                <button
                  className="btn btn-ai"
                  type="button"
                  onClick={handleGenerateAI}
                  disabled={aiLoading || !canAI}
                >
                  <Sparkles size={14} style={{ marginRight: 6 }} />
                  {aiLoading ? 'Working…' : 'Generate AI Analysis'}
                </button>
              </div>
            </section>
          )}

          {/* Audit Trail */}
          {incidentAudit.length > 0 && (
            <section className="srs-card">
              <div className="srs-card-hd">Audit Trail</div>
              <ul className="srs-audit-list">
                {incidentAudit.map(entry => (
                  <li key={entry.id} className="srs-audit-item">
                    <div className="srs-audit-dot">✎</div>
                    <div className="srs-audit-body">
                      <div className="srs-audit-top">
                        <span className="srs-audit-title">{entry.summary}</span>
                        <span className="srs-audit-time">
                          {new Date(entry.timestamp).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="srs-audit-user">{entry.user_email}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

        </div>

        {/* Footer */}
        {drawerError && (
          <div className="auth-error" style={{ margin: '0 20px 8px' }}>{drawerError}</div>
        )}
        <div className="srs-drawer-ft">
          {canReview && (
            <button className="srs-btn srs-btn-primary" onClick={handleSave} disabled={saving} type="button">
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          )}
          {canReview && (
            <button className="srs-btn srs-btn-outline" onClick={handleMarkResolved} disabled={saving} type="button">
              Mark as Resolved
            </button>
          )}
          {canReview && (
            <button
              className="srs-btn srs-btn-danger"
              onClick={handleDelete}
              disabled={deleting}
              type="button"
            >
              {confirmDelete ? 'Confirm Delete' : deleting ? 'Deleting…' : 'Delete'}
            </button>
          )}
        </div>

      </aside>
    </>
  );
}
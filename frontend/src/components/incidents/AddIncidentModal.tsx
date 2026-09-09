// src/components/incidents/AddIncidentModal.tsx

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listRisks } from '../../services/risks';
import type { IncidentCreate } from '../../types/incident';
import type { Risk } from '../../types/risk';

// ── Module-level constants ───────────────────────────────────────────────────

const CONTROL_OUTCOMES = [
  { value: 'control_failed',           label: 'Control failed'             },
  { value: 'control_partially_worked', label: 'Control partially worked'   },
  { value: 'control_was_bypassed',     label: 'Control was bypassed'       },
  { value: 'control_not_applicable',   label: 'Control was not applicable' },
  { value: 'no_control_existed',       label: 'No control existed'         },
] as const;

const CONFIDENCE_OPTIONS = ['Unknown', 'Estimated', 'Confirmed'] as const;

function getToday(): string {
  return new Date().toISOString().split('T')[0];
}

function emptyForm(): IncidentCreate {
  return {
    description:       '',
    category:          '',
    severity:          'Medium',
    reported_by:       '',
    reported_at:       getToday(),
    status:            'New',
    linked_risk_id:    null,
    linked_control:    null,
    control_outcome:   null,
    impact_confidence: 'Unknown',
  };
}

// ── Interfaces ───────────────────────────────────────────────────────────────

interface Props {
  open:       boolean;
  onClose:    () => void;
  onSubmit:   (payload: IncidentCreate) => Promise<void>;
  members:    { name: string; email: string }[];
  categories: string[];
  severities: string[];
  channels:   string[];
}

// ── Component ────────────────────────────────────────────────────────────────

export default function AddIncidentModal({
  open, onClose, onSubmit, members, categories, severities, channels,
}: Props) {
  const [form,         setForm]         = useState<IncidentCreate>(emptyForm);
  const [incidentDate, setIncidentDate] = useState('');
  const [incidentTime, setIncidentTime] = useState('');
  const [linkedRiskId, setLinkedRiskId] = useState('');
  const [linkedControl, setLinkedControl] = useState('');
  const [controlOutcome, setControlOutcome] = useState('');
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState<string | null>(null);

  const risksQuery = useQuery({
    queryKey: ['risks-for-incident-linkage'],
    queryFn:  () => listRisks({ page_size: 200 }),
    enabled:  open,
    staleTime: 2 * 60 * 1000,
  });


  if (!open) return null;

  const risks: Risk[] = risksQuery.data?.items ?? [];
  const selectedRisk  = risks.find(r => r.id === linkedRiskId) ?? null;
  const controlOptions = selectedRisk?.controls
    ? selectedRisk.controls.split(/[,\n]/).map(c => c.trim()).filter(Boolean)
    : [];

  function field(key: keyof IncidentCreate, value: string | null) {
    setForm(f => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const payload: IncidentCreate = {
        ...form,
        incident_dt: incidentDate
          ? `${incidentDate}T${incidentTime || '00:00'}:00`
          : undefined,
        linked_risk_id:  linkedRiskId  || null,
        linked_control:  linkedControl || null,
        control_outcome: controlOutcome || null,
      };
      await onSubmit(payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create incident');
      setLoading(false);
    }
  }

  return (
    <div className="modal-backdrop show" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-tall">
        <div className="modal-hd">
          <h3 className="modal-title">Add Incident</h3>
          <button className="x" type="button" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', minHeight: 0 }}>
          <div className="modal-bd" style={{ flex: 1, overflowY: 'auto' }}>

            {/* When it happened */}
            <div className="modal-section-label">When it happened</div>
            <div className="grid2" style={{ marginBottom: 14 }}>
              <div className="field">
                <label>Incident Date <span style={{ color: '#dc2626' }}>*</span></label>
                <input
                  type="date"
                  value={incidentDate}
                  onChange={(e) => setIncidentDate(e.target.value)}
                />
              </div>
              <div className="field">
                <label>Incident Time</label>
                <input
                  type="time"
                  value={incidentTime}
                  onChange={(e) => setIncidentTime(e.target.value)}
                />
              </div>
            </div>

            {/* How it was reported */}
            <div className="modal-section-label">How it was reported</div>
            <div className="grid2" style={{ marginBottom: 14 }}>
              <div className="field">
                <label>Reported By <span style={{ color: '#dc2626' }}>*</span></label>
                <select
                  required
                  value={form.reported_by}
                  onChange={(e) => field('reported_by', e.target.value)}
                >
                  <option value="">— Select —</option>
                  {members.map(m => (
                    <option key={m.email} value={m.name || m.email}>{m.name || m.email}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Date Reported <span style={{ color: '#dc2626' }}>*</span></label>
                <input
                  type="date"
                  required
                  value={form.reported_at}
                  onChange={(e) => field('reported_at', e.target.value)}
                />
              </div>
              <div className="field">
                <label>Channel</label>
                <select value={form.channel ?? ''} onChange={(e) => field('channel', e.target.value || null)}>
                  <option value="">— Select —</option>
                  {channels.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Reporter Email</label>
                <input
                  type="email"
                  placeholder="e.g. alex@company.com"
                  value={form.reporter_email ?? ''}
                  onChange={(e) => field('reporter_email', e.target.value || null)}
                />
              </div>
            </div>

            {/* Classification */}
            <div className="modal-section-label">Classification</div>
            <div className="grid2" style={{ marginBottom: 14 }}>
              <div className="field">
                <label>Category <span style={{ color: '#dc2626' }}>*</span></label>
                <select required value={form.category} onChange={(e) => field('category', e.target.value)}>
                  <option value="">— Select —</option>
                  {categories.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Severity <span style={{ color: '#dc2626' }}>*</span></label>
                <select required value={form.severity} onChange={(e) => field('severity', e.target.value)}>
                  {severities.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
            </div>

            {/* What happened */}
            <div className="modal-section-label">What happened</div>
            <div className="field" style={{ marginBottom: 14 }}>
              <label>Description <span style={{ color: '#dc2626' }}>*</span></label>
              <textarea
                required
                rows={3}
                placeholder="What happened?"
                value={form.description}
                onChange={(e) => field('description', e.target.value)}
              />
            </div>
            <div className="grid2" style={{ marginBottom: 14 }}>
              <div className="field">
                <label>Affected Asset</label>
                <input
                  type="text"
                  placeholder="e.g. Payroll records"
                  value={form.affected_asset ?? ''}
                  onChange={(e) => field('affected_asset', e.target.value || null)}
                />
              </div>
              <div className="field">
                <label>Assigned Owner</label>
                <select
                  value={form.assigned_to ?? ''}
                  onChange={(e) => field('assigned_to', e.target.value || null)}
                >
                  <option value="">— Select owner —</option>
                  {members.map(m => (
                    <option key={m.email} value={m.name || m.email}>{m.name || m.email}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Immediate Actions Taken</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Blocked sender, warned users"
                  value={form.immediate_actions ?? ''}
                  onChange={(e) => field('immediate_actions', e.target.value || null)}
                />
              </div>
              <div className="field">
                <label>Business Unit</label>
                <input
                  type="text"
                  placeholder="e.g. Finance"
                  value={form.business_unit ?? ''}
                  onChange={(e) => field('business_unit', e.target.value || null)}
                />
              </div>
            </div>

            {/* Risk & Control Linkage */}
            <div className="modal-section-label" style={{ color: '#6a3fc9' }}>
              Risk &amp; Control Linkage
              <span className="linkage-badge" style={{ marginLeft: 'auto' }}>Optional</span>
            </div>
            <div className="linkage-panel">
              <p className="linkage-sub">
                Both fields are optional, but linking gives the risk owner real evidence for reassessment.
              </p>

              <div className="field" style={{ marginBottom: 12 }}>
                <label>Related Risk</label>
                <select
                  value={linkedRiskId}
                  onChange={(e) => {
                    setLinkedRiskId(e.target.value);
                    setLinkedControl('');
                    setControlOutcome('');
                  }}
                >
                  <option value="">— No related risk —</option>
                  {risks.map(r => (
                    <option key={r.id} value={r.id}>
                      {r.id} — {r.description?.slice(0, 60) ?? ''}
                    </option>
                  ))}
                </select>
              </div>

              {selectedRisk && (
                <div className="risk-preview-card">
                  <strong>{selectedRisk.id}</strong>
                  {selectedRisk.level && (
                    <span className="risk-level-pill">{selectedRisk.level}</span>
                  )}
                  {selectedRisk.controls && (
                    <div style={{ marginTop: 4, color: 'var(--muted)' }}>
                      Controls: {selectedRisk.controls}
                    </div>
                  )}
                </div>
              )}

              {controlOptions.length > 0 && (
                <div className="field" style={{ marginBottom: 12 }}>
                  <label>Related Control</label>
                  <select value={linkedControl} onChange={(e) => setLinkedControl(e.target.value)}>
                    <option value="">— No related control —</option>
                    {controlOptions.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              )}

              {linkedRiskId && (
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>Control Outcome</label>
                  <select value={controlOutcome} onChange={(e) => setControlOutcome(e.target.value)}>
                    <option value="">— Select outcome —</option>
                    {CONTROL_OUTCOMES.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                  <p className="linkage-outcome-hint">
                    This does not change the risk score automatically. It becomes evidence the risk owner reviews during reassessment.
                  </p>
                </div>
              )}
            </div>

            {/* Impact */}
            <div className="modal-section-label">Impact</div>
            <div className="grid2" style={{ marginBottom: 14 }}>
              <div className="field">
                <label>Financial Impact</label>
                <input
                  type="number"
                  min={0}
                  placeholder="0"
                  value={form.financial_impact ?? ''}
                  onChange={(e) => field('financial_impact', e.target.value || null)}
                />
              </div>
              <div className="field">
                <label>Impact Confidence</label>
                <select
                  value={form.impact_confidence ?? 'Unknown'}
                  onChange={(e) => field('impact_confidence', e.target.value)}
                >
                  {CONFIDENCE_OPTIONS.map(o => <option key={o}>{o}</option>)}
                </select>
              </div>
            </div>

            {error && (
              <p style={{ color: '#dc2626', fontSize: 13, marginTop: 8 }}>{error}</p>
            )}
          </div>

          <div className="modal-ft">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Creating…' : 'Create Incident'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
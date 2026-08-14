// src/pages/ExternalIncident.tsx
// Public route: /external/incident?workspace_id={tenantId}
// No auth required. Matches GAS External_Add_Incident.html layout and field set.
// Note: GAS form used action=createIncident (no pending queue). V2 routes all
// external incidents through the pending queue for consistent security posture.
import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';

const CHANNELS  = ['Email', 'Phone', 'Walk-in', 'Monitoring', 'Other'];
const SEVERITIES = ['Low', 'Medium', 'High', 'Very High'];

const DEFAULT_CATEGORIES = [
  'Cybersecurity', 'IT Operations', 'Physical Security',
  'Data Protection', 'Compliance', 'Other',
];

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

interface FormState {
  reportedBy:      string;
  reporterEmail:   string;
  dateReported:    string;
  channel:         string;
  description:     string;
  category:        string;
  incidentType:    string;
  severity:        string;
  businessUnit:    string;
  incidentDate:    string;
  incidentTime:    string;
  affectedAsset:   string;
  financialImpact: string;
  actionsTaken:    string;
}

const EMPTY: FormState = {
  reportedBy:      '',
  reporterEmail:   '',
  dateReported:    todayISO(),
  channel:         '',
  description:     '',
  category:        '',
  incidentType:    '',
  severity:        'Medium',
  businessUnit:    '',
  incidentDate:    '',
  incidentTime:    '',
  affectedAsset:   '',
  financialImpact: '',
  actionsTaken:    '',
};

export default function ExternalIncident() {
  const [params]    = useSearchParams();
  const workspaceId = params.get('workspace_id') ?? '';

  const [form,       setForm]       = useState<FormState>({ ...EMPTY });
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);
  const [busUnits,   setBusUnits]   = useState<string[]>([]);
  const [errors,     setErrors]     = useState<Partial<Record<keyof FormState, boolean>>>({});
  const [errMsg,     setErrMsg]     = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted,  setSubmitted]  = useState(false);

  // Hydrate category and business unit dropdowns from workspace lookups
  useEffect(() => {
    if (!workspaceId) return;
    const base = `${API_BASE}/api/v1/external/lookups/${workspaceId}`;

    fetch(`${base}?key=incident_category`)
      .then(r => r.json())
      .then(d => { if (Array.isArray(d.data) && d.data.length) setCategories(d.data); })
      .catch(() => {});

    fetch(`${base}?key=business_unit`)
      .then(r => r.json())
      .then(d => { if (Array.isArray(d.data)) setBusUnits(d.data); })
      .catch(() => {});
  }, [workspaceId]);

  function set(field: keyof FormState, value: string) {
    setForm(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: false }));
    setErrMsg('');
  }

  function resetForm() {
    setForm({ ...EMPTY, dateReported: todayISO() });
    setErrors({});
    setErrMsg('');
  }

  async function handleSubmit() {
    if (!workspaceId) {
      setErrMsg('Invalid form link — missing workspace ID.');
      return;
    }

    const required: (keyof FormState)[] = ['reportedBy', 'dateReported', 'category', 'severity', 'description'];
    const newErrors: Partial<Record<keyof FormState, boolean>> = {};
    required.forEach(k => { if (!form[k].trim()) newErrors[k] = true; });

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      setErrMsg('Please fill all required fields marked with *');
      return;
    }

    setSubmitting(true);
    setErrMsg('');
    try {
      const res = await fetch(
        `${API_BASE}/api/v1/external/submit/incident?tenant_id=${encodeURIComponent(workspaceId)}`,
        {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reported_by:      form.reportedBy.trim(),
            reporter_email:   form.reporterEmail.trim().toLowerCase(),
            date_reported:    form.dateReported,
            channel:          form.channel,
            description:      form.description.trim(),
            category:         form.category,
            incident_type:    form.incidentType.trim(),
            severity:         form.severity,
            business_unit:    form.businessUnit,
            incident_date:    form.incidentDate,
            incident_time:    form.incidentTime,
            affected_asset:   form.affectedAsset.trim(),
            financial_impact: form.financialImpact.trim(),
            actions_taken:    form.actionsTaken.trim(),
          }),
        },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.detail ?? json.error ?? 'Submission failed');
      setSubmitted(true);
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!workspaceId) {
    return (
      <div className="ext-page">
        <div className="ext-wrap">
          <div className="ext-card">
            <div className="ext-hd" style={{ background: '#01b88e' }}>
              <div className="ext-hd-org">SmartRisk GRC</div>
            </div>
            <div className="ext-bd">
              <p className="ext-err" style={{ display: 'block', fontSize: 14, textAlign: 'center', padding: '24px 0' }}>
                Invalid form link — missing workspace ID. Please request a new link from your administrator.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ext-page">
      <div className="ext-wrap" style={{ maxWidth: 700 }}>
        <div className="ext-card">
          {/* GAS incident form uses teal header; risk form uses navy. Kept for parity. */}
          <div className="ext-hd" style={{ background: '#01b88e' }}>
            <div className="ext-hd-org">Report an Incident</div>
            <div className="ext-hd-sub">Submit incident details to SmartRisk GRC</div>
          </div>

          <div className="ext-bd">
            {submitted ? (
              <div className="ext-success">
                <div className="ext-success-ico">
                  <svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#01b88e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" /><polyline points="9 12 11 14 15 10" />
                  </svg>
                </div>
                <h2>Incident Submitted</h2>
                <p>Your incident has been received and is pending review by the risk management team.</p>
                <button className="ext-reset-btn" style={{ marginTop: 20 }} onClick={() => { setSubmitted(false); resetForm(); }}>
                  Submit Another
                </button>
              </div>
            ) : (
              <>
                {errMsg && <p className="ext-err" style={{ display: 'block', marginBottom: 16 }}>{errMsg}</p>}

                {/* Reporter Information */}
                <div className="ext-section-label">Reporter Information</div>
                <div className="ext-grid2">
                  <div className="field">
                    <label>Date Reported <span className="ext-req">*</span></label>
                    <input
                      type="date"
                      value={form.dateReported}
                      className={errors.dateReported ? 'ext-input-invalid' : ''}
                      onChange={e => set('dateReported', e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label>Your Name <span className="ext-req">*</span></label>
                    <input
                      type="text"
                      placeholder="e.g., John Smith"
                      value={form.reportedBy}
                      className={errors.reportedBy ? 'ext-input-invalid' : ''}
                      onChange={e => set('reportedBy', e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label>Your Email</label>
                    <input
                      type="email"
                      placeholder="e.g., john@company.com"
                      value={form.reporterEmail}
                      onChange={e => set('reporterEmail', e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label>Reporting Channel</label>
                    <select value={form.channel} onChange={e => set('channel', e.target.value)}>
                      <option value="">—</option>
                      {CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>

                <hr className="ext-divider" />
                <div className="ext-section-label">Incident Details</div>

                <div className="field">
                  <label>Description <span className="ext-req">*</span></label>
                  <textarea
                    placeholder="What happened? Please provide as much detail as possible…"
                    value={form.description}
                    className={errors.description ? 'ext-input-invalid' : ''}
                    onChange={e => set('description', e.target.value)}
                  />
                </div>

                <div className="ext-grid2">
                  <div className="field">
                    <label>Incident Category <span className="ext-req">*</span></label>
                    <select
                      value={form.category}
                      className={errors.category ? 'ext-input-invalid' : ''}
                      onChange={e => set('category', e.target.value)}
                    >
                      <option value="">—</option>
                      {categories.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label>Incident Type</label>
                    <input
                      type="text"
                      placeholder="e.g., Phishing attempt"
                      value={form.incidentType}
                      onChange={e => set('incidentType', e.target.value)}
                    />
                  </div>
                </div>

                <div className="field">
                  <label>Severity <span className="ext-req">*</span></label>
                  <select
                    value={form.severity}
                    className={errors.severity ? 'ext-input-invalid' : ''}
                    onChange={e => set('severity', e.target.value)}
                  >
                    {SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                <div className="ext-grid2">
                  {busUnits.length > 0 && (
                    <div className="field">
                      <label>Business Unit</label>
                      <select value={form.businessUnit} onChange={e => set('businessUnit', e.target.value)}>
                        <option value="">—</option>
                        {busUnits.map(b => <option key={b} value={b}>{b}</option>)}
                      </select>
                    </div>
                  )}
                  <div className="field">
                    <label>Incident Date</label>
                    <input type="date" value={form.incidentDate} onChange={e => set('incidentDate', e.target.value)} />
                  </div>
                  <div className="field">
                    <label>Incident Time</label>
                    <input type="time" value={form.incidentTime} onChange={e => set('incidentTime', e.target.value)} />
                  </div>
                </div>

                <hr className="ext-divider" />
                <div className="ext-section-label">Impact & Actions Taken</div>

                <div className="ext-grid2">
                  <div className="field">
                    <label>Affected Asset / System</label>
                    <input
                      type="text"
                      placeholder="e.g., Payroll system"
                      value={form.affectedAsset}
                      onChange={e => set('affectedAsset', e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label>Estimated Financial Impact</label>
                    <input
                      type="text"
                      placeholder="e.g., $0 / Unknown"
                      value={form.financialImpact}
                      onChange={e => set('financialImpact', e.target.value)}
                    />
                  </div>
                </div>

                <div className="field">
                  <label>Immediate Actions Taken</label>
                  <textarea
                    rows={2}
                    placeholder="e.g., Blocked sender, reset password"
                    value={form.actionsTaken}
                    onChange={e => set('actionsTaken', e.target.value)}
                  />
                </div>

                <div className="ext-grid2" style={{ marginTop: 8 }}>
                  <button className="ext-reset-btn" onClick={resetForm}>Reset Form</button>
                  <button className="ext-submit-btn" disabled={submitting} onClick={handleSubmit} style={{ margin: 0 }}>
                    {submitting ? 'Submitting…' : 'Submit Incident'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="ext-footer" style={{ borderRadius: '0 0 16px 16px', borderTop: 'none', marginTop: -1 }}>
          SmartRisk GRC © 2026. All submissions are confidential and will be reviewed promptly.
        </div>
      </div>
    </div>
  );
}
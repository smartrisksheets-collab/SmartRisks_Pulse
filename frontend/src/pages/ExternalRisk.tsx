// src/pages/ExternalRisk.tsx
// Public route: /external/risk?workspace_id={tenantId}
// No auth required. Matches GAS External_Add_Risk.html layout and field set.
import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';

const CATEGORIES = [
  'Strategic Risks', 'Operational Risks', 'Financial Risks',
  'Compliance Risks', 'Reputational Risks', 'Technology Risks',
  'Project Risks', 'Enterprise Risks', 'Other',
];

const TREATMENTS = ['Mitigate', 'Transfer', 'Accept', 'Avoid'];

const LIKELIHOOD_OPTIONS = [
  { value: 1, label: '1 — Very Low' },
  { value: 2, label: '2 — Low' },
  { value: 3, label: '3 — Medium' },
  { value: 4, label: '4 — High' },
  { value: 5, label: '5 — Critical' },
];

interface FormState {
  submitterName:  string;
  submitterEmail: string;
  department:     string;
  deptOther:      string;
  category:       string;
  description:    string;
  primaryImpact:  string;
  likelihood:     string;
  impactScore:    string;
  treatment:      string;
  controls:       string;
  comments:       string;
}

const EMPTY: FormState = {
  submitterName:  '',
  submitterEmail: '',
  department:     '',
  deptOther:      '',
  category:       '',
  description:    '',
  primaryImpact:  '',
  likelihood:     '',
  impactScore:    '',
  treatment:      '',
  controls:       '',
  comments:       '',
};

export default function ExternalRisk() {
  const [params]        = useSearchParams();
  const workspaceId     = params.get('workspace_id') ?? '';

  const [form,        setForm]        = useState<FormState>(EMPTY);
  const [departments, setDepartments] = useState<string[]>([]);
  const [errors,      setErrors]      = useState<Partial<Record<keyof FormState, boolean>>>({});
  const [errMsg,      setErrMsg]      = useState('');
  const [submitting,  setSubmitting]  = useState(false);
  const [submitted,   setSubmitted]   = useState(false);

  // Hydrate department dropdown from workspace lookups
  useEffect(() => {
    if (!workspaceId) return;
    fetch(`${API_BASE}/api/v1/external/lookups/${workspaceId}?key=business_unit`)
      .then(r => r.json())
      .then(d => {
        const arr = Array.isArray(d.data) ? d.data : [];
        setDepartments(arr);
      })
      .catch(() => setDepartments([]));
  }, [workspaceId]);

  function set(field: keyof FormState, value: string) {
    setForm(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: false }));
    setErrMsg('');
  }

  async function handleSubmit() {
    if (!workspaceId) {
      setErrMsg('Invalid form link — missing workspace ID.');
      return;
    }

    const dept = form.department === '__other__' ? form.deptOther.trim() : form.department;

    const required: (keyof FormState)[] = [
      'submitterName', 'submitterEmail', 'category',
      'description', 'primaryImpact', 'likelihood', 'impactScore', 'treatment',
    ];
    const newErrors: Partial<Record<keyof FormState, boolean>> = {};
    required.forEach(k => { if (!form[k].trim()) newErrors[k] = true; });
    if (!dept) newErrors['department'] = true;
    if (form.department === '__other__' && !form.deptOther.trim()) newErrors['deptOther'] = true;

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      setErrMsg('Please complete all highlighted fields.');
      return;
    }

    setSubmitting(true);
    setErrMsg('');
    try {
      const res = await fetch(
        `${API_BASE}/api/v1/external/submit/risk?tenant_id=${encodeURIComponent(workspaceId)}`,
        {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            submitter_name:  form.submitterName.trim() + ':' + dept,
            submitter_email: form.submitterEmail.trim().toLowerCase(),
            department:      dept,
            category:        form.category,
            description:     form.description.trim(),
            primary_impact:  form.primaryImpact.trim(),
            likelihood:      parseInt(form.likelihood, 10),
            impact_score:    parseInt(form.impactScore, 10),
            treatment:       form.treatment,
            controls:        form.controls.trim(),
            comments:        form.comments.trim(),
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
            <div className="ext-hd">
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
      <div className="ext-wrap">
        <div className="ext-card">
          <div className="ext-hd">
            <div className="ext-hd-org">SmartRisk GRC</div>
            <div className="ext-hd-sub">External Risk Submission Form</div>
          </div>

          <div className="ext-bd">
            {submitted ? (
              <div className="ext-success">
                <div className="ext-success-ico">
                  <svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#01b88e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" /><polyline points="9 12 11 14 15 10" />
                  </svg>
                </div>
                <h2>Submission Received</h2>
                <p>Thank you. Your risk has been logged and is pending review. You will be notified by email of the outcome.</p>
              </div>
            ) : (
              <>
                <div className="ext-title">Submit a Risk</div>
                <p className="ext-intro">
                  Use this form to report a risk to the risk management team.
                  Fields marked <span className="ext-req">*</span> are required.
                </p>

                <div className="ext-section-label">Your Details</div>

                <div className="ext-grid2">
                  <div className="field">
                    <label>Your Name <span className="ext-req">*</span></label>
                    <input
                      type="text"
                      placeholder="Full name"
                      value={form.submitterName}
                      className={errors.submitterName ? 'ext-input-invalid' : ''}
                      onChange={e => set('submitterName', e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label>Your Email <span className="ext-req">*</span></label>
                    <input
                      type="email"
                      placeholder="you@company.com"
                      value={form.submitterEmail}
                      className={errors.submitterEmail ? 'ext-input-invalid' : ''}
                      onChange={e => set('submitterEmail', e.target.value)}
                    />
                  </div>
                </div>

                <div className="field">
                  <label>Department <span className="ext-req">*</span></label>
                  <select
                    value={form.department}
                    className={errors.department ? 'ext-input-invalid' : ''}
                    onChange={e => set('department', e.target.value)}
                  >
                    <option value="">Select department…</option>
                    {departments.map(d => <option key={d} value={d}>{d}</option>)}
                    <option value="__other__">Other…</option>
                  </select>
                </div>

                {form.department === '__other__' && (
                  <div className="field">
                    <label>Specify Department <span className="ext-req">*</span></label>
                    <input
                      type="text"
                      placeholder="Enter your department…"
                      value={form.deptOther}
                      className={errors.deptOther ? 'ext-input-invalid' : ''}
                      onChange={e => set('deptOther', e.target.value)}
                    />
                  </div>
                )}

                <hr className="ext-divider" />
                <div className="ext-section-label">Risk Details</div>

                <div className="field">
                  <label>Risk Category <span className="ext-req">*</span></label>
                  <select
                    value={form.category}
                    className={errors.category ? 'ext-input-invalid' : ''}
                    onChange={e => set('category', e.target.value)}
                  >
                    <option value="">Select category…</option>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                <div className="field">
                  <label>Risk Description <span className="ext-req">*</span></label>
                  <textarea
                    placeholder="Describe the risk clearly — what could go wrong, what is the potential cause, and what might be affected…"
                    value={form.description}
                    className={errors.description ? 'ext-input-invalid' : ''}
                    onChange={e => set('description', e.target.value)}
                  />
                </div>

                <div className="field">
                  <label>Primary Impact Area <span className="ext-req">*</span></label>
                  <input
                    type="text"
                    placeholder="e.g. Operations, Finance, Reputation, Compliance…"
                    value={form.primaryImpact}
                    className={errors.primaryImpact ? 'ext-input-invalid' : ''}
                    onChange={e => set('primaryImpact', e.target.value)}
                  />
                </div>

                <div className="ext-grid2">
                  <div className="field">
                    <label>Likelihood <span className="ext-req">*</span></label>
                    <select
                      value={form.likelihood}
                      className={errors.likelihood ? 'ext-input-invalid' : ''}
                      onChange={e => set('likelihood', e.target.value)}
                    >
                      <option value="">Select…</option>
                      {LIKELIHOOD_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label>Potential Impact <span className="ext-req">*</span></label>
                    <select
                      value={form.impactScore}
                      className={errors.impactScore ? 'ext-input-invalid' : ''}
                      onChange={e => set('impactScore', e.target.value)}
                    >
                      <option value="">Select…</option>
                      {LIKELIHOOD_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="field">
                  <label>Suggested Treatment <span className="ext-req">*</span></label>
                  <select
                    value={form.treatment}
                    className={errors.treatment ? 'ext-input-invalid' : ''}
                    onChange={e => set('treatment', e.target.value)}
                  >
                    <option value="">Select…</option>
                    {TREATMENTS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>

                <hr className="ext-divider" />
                <div className="ext-section-label">Additional Information (Optional)</div>

                <div className="field">
                  <label>Existing Controls</label>
                  <textarea
                    placeholder="What controls or measures are already in place, if any…"
                    value={form.controls}
                    onChange={e => set('controls', e.target.value)}
                    style={{ minHeight: 70 }}
                  />
                </div>

                <div className="field">
                  <label>Additional Comments</label>
                  <textarea
                    placeholder="Any other relevant context or supporting information…"
                    value={form.comments}
                    onChange={e => set('comments', e.target.value)}
                    style={{ minHeight: 70 }}
                  />
                </div>

                {errMsg && <p className="ext-err" style={{ display: 'block' }}>{errMsg}</p>}

                <button
                  className="ext-submit-btn"
                  disabled={submitting}
                  onClick={handleSubmit}
                >
                  {submitting ? 'Submitting…' : 'Submit Risk'}
                </button>
              </>
            )}
          </div>
        </div>

        <div style={{ textAlign: 'center', marginTop: 16, fontSize: 12, color: '#94a3b8' }}>
          SmartRisk GRC © 2026. All submissions are confidential and will be reviewed promptly.
        </div>
      </div>
    </div>
  );
}
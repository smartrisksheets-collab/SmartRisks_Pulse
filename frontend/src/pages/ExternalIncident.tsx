// src/pages/ExternalIncident.tsx
// Public route: /external/incident?workspace_id={tenantId}. No auth.
// Pulse skin (partner design, Nov 2026). Submissions go to the pending queue and the
// risk team approves them into the incident register.
// Severity levels come from the workspace's Settings (GET /external/severity/{id}),
// categories and business units from its lookups, the name and logo from its brand.
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { INCIDENT_TITLE_MAX } from '../types/incident';
import { IMPACT_CONFIDENCE, PUBLIC_INCIDENT_CATEGORIES, REPORT_CHANNELS, todayIso } from '../utils/incidentDisplay';
import { initialsOf } from '../components/home/links';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';

interface FormState {
  dateReported:     string;
  reportedBy:       string;
  reporterEmail:    string;
  channel:          string;
  title:            string;
  description:      string;
  category:         string;
  incidentType:     string;
  severity:         string;
  businessUnit:     string;
  incidentDate:     string;
  incidentTime:     string;
  affectedAsset:    string;
  financialImpact:  string;
  impactConfidence: string;
  actionsTaken:     string;
}

type FieldKey = keyof FormState;
interface Brand { org_name: string; logo_url: string | null }
interface SeverityLevel { label: string; help: string }

const emptyForm = (): FormState => ({
  dateReported: todayIso(), reportedBy: '', reporterEmail: '', channel: '',
  title: '', description: '', category: '', incidentType: '', severity: '',
  businessUnit: '', incidentDate: '', incidentTime: '',
  affectedAsset: '', financialImpact: '', impactConfidence: 'Unknown', actionsTaken: '',
});

const REQUIRED: FieldKey[] = ['dateReported', 'reportedBy', 'description', 'category', 'severity'];

function BrandRow({ brand }: { brand: Brand }) {
  const name = brand.org_name || 'SmartRisk Pulse';
  return (
    <header className="pl-ext-col pl-ext-brand">
      <span className="pl-ext-logo">
        {brand.logo_url ? <img src={brand.logo_url} alt={`${name} logo`} /> : <span aria-hidden="true">{initialsOf(name)}</span>}
      </span>
      <span className="pl-ext-org">{name}</span>
    </header>
  );
}

function Footer() {
  return <p className="pl-caption pl-ext-foot">Powered by SmartRisk Pulse · All submissions are confidential and will be reviewed promptly.</p>;
}

export default function ExternalIncident() {
  const [params]    = useSearchParams();
  const workspaceId = params.get('workspace_id') ?? '';

  const [form,       setForm]       = useState<FormState>(emptyForm);
  const [brand,      setBrand]      = useState<Brand>({ org_name: '', logo_url: null });
  const [categories, setCategories] = useState<string[]>(PUBLIC_INCIDENT_CATEGORIES);
  const [busUnits,   setBusUnits]   = useState<string[]>([]);
  const [levels,     setLevels]     = useState<SeverityLevel[]>([]);
  const [errors,     setErrors]     = useState<Partial<Record<FieldKey, boolean>>>({});
  const [errMsg,     setErrMsg]     = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted,  setSubmitted]  = useState(false);

  useEffect(() => {
    if (!workspaceId) return;
    const id = encodeURIComponent(workspaceId);
    fetch(`${API_BASE}/api/v1/external/brand/${id}`)
      .then(r => r.json())
      .then(d => { if (d.data) setBrand(d.data); })
      .catch(() => { });
    fetch(`${API_BASE}/api/v1/external/severity/${id}`)
      .then(r => r.json())
      .then(d => { if (Array.isArray(d.data)) setLevels(d.data); })
      .catch(() => { });
    fetch(`${API_BASE}/api/v1/external/lookups/${id}?key=incident_category`)
      .then(r => r.json())
      .then(d => { if (Array.isArray(d.data) && d.data.length) setCategories(d.data); })
      .catch(() => { });
    fetch(`${API_BASE}/api/v1/external/lookups/${id}?key=business_unit`)
      .then(r => r.json())
      .then(d => { if (Array.isArray(d.data)) setBusUnits(d.data); })
      .catch(() => { });
  }, [workspaceId]);

  function set(field: FieldKey, value: string) {
    setForm(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: false }));
    setErrMsg('');
  }

  function resetForm() {
    setForm(emptyForm());
    setErrors({});
    setErrMsg('');
  }

  async function handleSubmit() {
    const missing = REQUIRED.filter(k => !form[k].trim());
    if (missing.length > 0) {
      setErrors(Object.fromEntries(missing.map(k => [k, true])));
      setErrMsg('Please fill in every field marked *.');
      return;
    }
    // Past-only dates (the server rejects future ones too). ISO strings compare as dates.
    const today = todayIso();
    const future = (['dateReported', 'incidentDate'] as const).filter(k => form[k] > today);
    if (future.length > 0) {
      setErrors(Object.fromEntries(future.map(k => [k, true])));
      setErrMsg('Dates cannot be in the future.');
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
            reported_by:       form.reportedBy.trim(),
            reporter_email:    form.reporterEmail.trim().toLowerCase(),
            date_reported:     form.dateReported,
            channel:           form.channel,
            title:             form.title.trim(),
            description:       form.description.trim(),
            category:          form.category,
            incident_type:     form.incidentType.trim(),
            severity:          form.severity,
            business_unit:     form.businessUnit,
            incident_date:     form.incidentDate,
            incident_time:     form.incidentTime,
            affected_asset:    form.affectedAsset.trim(),
            financial_impact:  form.financialImpact.trim(),
            impact_confidence: form.impactConfidence,
            actions_taken:     form.actionsTaken.trim(),
          }),
        },
      );
      const json = await res.json();
      if (!res.ok) {
        // Our errors arrive as { error: "..." }; request validation errors as { detail: [...] }.
        const msg = typeof json.error === 'string' ? json.error
          : typeof json.detail === 'string' ? json.detail
          : 'Some details could not be accepted. Please check the form and try again.';
        throw new Error(msg);
      }
      setSubmitted(true);
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const cls = (k: FieldKey) => `pl-input${errors[k] ? ' invalid' : ''}`;
  const req = <span className="pl-req" aria-hidden="true">*</span>;
  const opt = <span className="pl-opt">optional</span>;
  const org = brand.org_name || 'the organisation';
  const today = todayIso();

  if (!workspaceId) {
    return (
      <div className="pl-app pl-ext-page">
        <BrandRow brand={brand} />
        <main className="pl-ext-col">
          <div className="pl-card">
            <p className="pl-note pl-alert" role="alert">This form link is missing its workspace. Please ask your administrator for a new link.</p>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="pl-app pl-ext-page">
        <BrandRow brand={brand} />
        <main className="pl-ext-col">
          <section className="pl-card pl-ext-done" aria-live="polite">
            <CheckCircle2 size={48} className="pl-ext-done-ico" aria-hidden="true" />
            <h1 className="pl-page-title">Incident submitted</h1>
            <p className="pl-ext-intro">{org}'s risk team has your report and will review it shortly.
              {form.reporterEmail.trim() && ' A confirmation is on its way to your email.'}</p>
            <button type="button" className="pl-btn pl-btn-secondary" onClick={() => { setSubmitted(false); resetForm(); }}>
              Report another incident
            </button>
          </section>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="pl-app pl-ext-page">
      <BrandRow brand={brand} />
      <main className="pl-ext-col">
        <form className="pl-card pl-ext-form" aria-label="Report an incident" noValidate onSubmit={e => { e.preventDefault(); handleSubmit(); }}>
          <div className="pl-stack-xs">
            <p className="pl-label pl-ext-kicker">External incident report</p>
            <h1 className="pl-page-title">Report an incident</h1>
            <p className="pl-ext-intro">Submit incident details to {org}'s risk team. Tell us what happened as clearly as you can. You do not need to know the cause.</p>
          </div>

          <section className="pl-ext-sec" aria-labelledby="xi-s1">
            <div className="pl-form-sec-h"><span className="pl-sec-n">1</span><h2 id="xi-s1" className="pl-section">Reporter information</h2></div>
            <div className="pl-row2">
              <div className="pl-field">
                <label className="pl-field-label" htmlFor="xi-rep">Date reported {req}</label>
                <input id="xi-rep" className={cls('dateReported')} type="date" max={today} value={form.dateReported}
                  onChange={e => set('dateReported', e.target.value)} aria-invalid={!!errors.dateReported} />
              </div>
              <div className="pl-field">
                <label className="pl-field-label" htmlFor="xi-name">Your name {req}</label>
                <input id="xi-name" className={cls('reportedBy')} placeholder="e.g. John Smith" value={form.reportedBy}
                  onChange={e => set('reportedBy', e.target.value)} aria-invalid={!!errors.reportedBy} autoComplete="name" />
              </div>
              <div className="pl-field">
                <label className="pl-field-label" htmlFor="xi-email">Your email {opt}</label>
                <input id="xi-email" className="pl-input" type="email" placeholder="e.g. john@company.com" value={form.reporterEmail}
                  onChange={e => set('reporterEmail', e.target.value)} autoComplete="email" />
              </div>
              <div className="pl-field">
                <label className="pl-field-label" htmlFor="xi-chan">Reporting channel {opt}</label>
                <select id="xi-chan" className="pl-input" value={form.channel} onChange={e => set('channel', e.target.value)}>
                  <option value="">Choose…</option>
                  {REPORT_CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
          </section>

          <section className="pl-ext-sec" aria-labelledby="xi-s2">
            <div className="pl-form-sec-h"><span className="pl-sec-n">2</span><h2 id="xi-s2" className="pl-section">Incident details</h2></div>
            <div className="pl-field">
              <label className="pl-field-label" htmlFor="xi-title">Give it a short title {opt}</label>
              <span className="pl-help" id="xi-title-help">A few words the risk team will see in their list. They can change it.</span>
              <input id="xi-title" className="pl-input" maxLength={INCIDENT_TITLE_MAX} placeholder="e.g. Payroll system down for two hours"
                value={form.title} onChange={e => set('title', e.target.value)} aria-describedby="xi-title-help" />
            </div>
            <div className="pl-field">
              <label className="pl-field-label" htmlFor="xi-desc">Description {req}</label>
              <textarea id="xi-desc" className={cls('description')} rows={4} placeholder="What happened? Please give as much detail as you can."
                value={form.description} onChange={e => set('description', e.target.value)} aria-invalid={!!errors.description} />
            </div>
            <div className="pl-row2">
              <div className="pl-field">
                <label className="pl-field-label" htmlFor="xi-cat">Incident category {req}</label>
                <select id="xi-cat" className={cls('category')} value={form.category}
                  onChange={e => set('category', e.target.value)} aria-invalid={!!errors.category}>
                  <option value="">Choose…</option>
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="pl-field">
                <label className="pl-field-label" htmlFor="xi-type">Incident type {opt}</label>
                <input id="xi-type" className="pl-input" placeholder="e.g. Phishing attempt" value={form.incidentType}
                  onChange={e => set('incidentType', e.target.value)} />
              </div>
            </div>
            <div className="pl-field" role="radiogroup" aria-labelledby="xi-sev" aria-invalid={!!errors.severity}>
              <span id="xi-sev" className="pl-field-label">Severity {req}</span>
              <div className="pl-choices pl-in-choices">
                {levels.map(l => (
                  <button key={l.label} type="button" role="radio" aria-checked={form.severity === l.label}
                    className={`pl-choice${form.severity === l.label ? ' pl-on' : ''}`} onClick={() => set('severity', l.label)}>
                    {l.label}
                    {l.help && <span>{l.help}</span>}
                  </button>
                ))}
              </div>
              {errors.severity && <p className="pl-field-error">Choose how severe it is.</p>}
            </div>
            <div className="pl-row2">
              {busUnits.length > 0 && (
                <div className="pl-field">
                  <label className="pl-field-label" htmlFor="xi-bu">Business unit {opt}</label>
                  <select id="xi-bu" className="pl-input" value={form.businessUnit} onChange={e => set('businessUnit', e.target.value)}>
                    <option value="">Choose…</option>
                    {busUnits.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
              )}
              <div className="pl-field">
                <label className="pl-field-label" htmlFor="xi-date">Incident date {opt}</label>
                <input id="xi-date" className={cls('incidentDate')} type="date" max={today} value={form.incidentDate}
                  onChange={e => set('incidentDate', e.target.value)} aria-invalid={!!errors.incidentDate} />
              </div>
              <div className="pl-field">
                <label className="pl-field-label" htmlFor="xi-time">Incident time {opt}</label>
                <input id="xi-time" className="pl-input" type="time" value={form.incidentTime} onChange={e => set('incidentTime', e.target.value)} />
              </div>
            </div>
          </section>

          <section className="pl-ext-sec" aria-labelledby="xi-s3">
            <div className="pl-form-sec-h"><span className="pl-sec-n">3</span><h2 id="xi-s3" className="pl-section">Impact and actions taken</h2></div>
            <div className="pl-field">
              <label className="pl-field-label" htmlFor="xi-asset">Affected asset or system {opt}</label>
              <input id="xi-asset" className="pl-input" placeholder="e.g. Payroll system" value={form.affectedAsset}
                onChange={e => set('affectedAsset', e.target.value)} />
            </div>
            <div className="pl-row2">
              <div className="pl-field">
                <label className="pl-field-label" htmlFor="xi-fin">Estimated financial impact {opt}</label>
                <input id="xi-fin" className="pl-input" placeholder="e.g. 250,000 or Unknown" value={form.financialImpact}
                  onChange={e => set('financialImpact', e.target.value)} />
              </div>
              <div className="pl-field">
                <label className="pl-field-label" htmlFor="xi-conf">How sure is that figure? {opt}</label>
                <select id="xi-conf" className="pl-input" value={form.impactConfidence} onChange={e => set('impactConfidence', e.target.value)}>
                  {IMPACT_CONFIDENCE.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
            <div className="pl-field">
              <label className="pl-field-label" htmlFor="xi-act">Immediate actions taken {opt}</label>
              <textarea id="xi-act" className="pl-input" rows={2} placeholder="e.g. Blocked sender, reset password"
                value={form.actionsTaken} onChange={e => set('actionsTaken', e.target.value)} />
            </div>
          </section>

          {errMsg && <p className="pl-note pl-alert" role="alert">{errMsg}</p>}

          <div className="pl-ext-actions">
            <button type="button" className="pl-btn pl-btn-secondary" onClick={resetForm} disabled={submitting}>Reset form</button>
            <button type="submit" className="pl-btn pl-btn-primary" disabled={submitting}>
              {submitting ? 'Submitting…' : 'Submit incident'}
            </button>
          </div>
        </form>

        <section className="pl-card pl-stack-xs" aria-labelledby="xi-next">
          <h2 id="xi-next" className="pl-label">After you submit</h2>
          <p className="pl-ext-intro">The risk team triages your report and completes the rest of the record:</p>
          <div className="pl-inline">
            <span className="pl-tag">Related risk</span>
            <span className="pl-tag">Did the risk's control work?</span>
            <span className="pl-tag">Incident owner</span>
            <span className="pl-tag">Target date to resolve</span>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}

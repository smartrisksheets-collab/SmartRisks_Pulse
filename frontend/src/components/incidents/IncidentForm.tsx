// src/components/incidents/IncidentForm.tsx
// Full-page log and edit form in four steps. The target date, the risk
// suggestion and the "when you save" list come from POST /incidents/target-preview,
// so the target always matches the SLA breach rule. Nothing is computed here.

import { useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { listRisks } from '../../services/risks';
import { targetPreview } from '../../services/incidents';
import { useLookups } from '../../hooks/useLookups';
import { formatDate } from '../../utils/format';
import type { IncidentCreate } from '../../types/incident';
import { INCIDENT_STAGES, INCIDENT_TITLE_MAX } from '../../types/incident';
import type { SeverityLevelResponse } from '../../types/incident_severity';
import {
  CONTROL_OUTCOMES, IMPACT_CONFIDENCE, INCIDENT_FIELD_ORDER, REPORT_CHANNELS,
  incidentPayload, todayIso, validateIncidentForm,
  type IncidentFieldErrors, type IncidentFieldKey, type IncidentFormValues,
} from '../../utils/incidentDisplay';
import Explain from '../help/Explain';

interface Props {
  initial:    IncidentFormValues;
  isEdit:     boolean;
  levels:     SeverityLevelResponse[];
  canAddRisk: boolean;
  saving:     boolean;
  error:      string | null;
  onSubmit:   (payload: IncidentCreate) => void;
  onCancel:   () => void;
}

export default function IncidentForm({ initial, isEdit, levels, canAddRisk, saving, error, onSubmit, onCancel }: Props) {
  const [v, setV] = useState<IncidentFormValues>(initial);
  const [errors, setErrors] = useState<IncidentFieldErrors>({});
  const formRef = useRef<HTMLFormElement>(null);
  const { lookups } = useLookups();
  const today = todayIso();

  const categories = lookups?.incident_category ?? [];
  const people = lookups?.risk_owner ?? [];
  const units = lookups?.business_unit ?? [];

  const risks = useQuery({
    queryKey: ['risks', 'for-incident-link'],
    queryFn:  () => listRisks({ page_size: 1000, sort: 'residual' }),
    staleTime: 2 * 60 * 1000,
  });
  const riskOptions = risks.data?.items ?? [];

  const preview = useQuery({
    queryKey: ['incidents', 'target-preview', v.severity, v.reported_at, v.category, v.linked_risk_id],
    queryFn:  () => targetPreview({
      severity: v.severity,
      reported_at: v.reported_at || null,
      category: v.category || null,
      linked_risk_id: v.linked_risk_id || null,
    }),
    enabled: !!v.severity,
    staleTime: 60 * 1000,
    placeholderData: keepPreviousData,
  });
  const p = preview.data;
  const suggestion = !v.linked_risk_id && p?.suggested_risks[0] ? p.suggested_risks[0] : null;

  function set<K extends keyof IncidentFormValues>(key: K, value: IncidentFormValues[K]) {
    setV(prev => ({ ...prev, [key]: value }));
  }

  function blur(key: IncidentFieldKey) {
    const msg = validateIncidentForm(v, today)[key];
    setErrors(prev => ({ ...prev, [key]: msg }));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const found = validateIncidentForm(v, today);
    setErrors(found);
    const first = INCIDENT_FIELD_ORDER.find(k => found[k]);
    if (first) {
      formRef.current?.querySelector<HTMLElement>(`[data-field="${first}"]`)?.focus();
      return;
    }
    onSubmit(incidentPayload(v, isEdit));
  }

  const inputCls = (k: IncidentFieldKey) => `pl-input${errors[k] ? ' invalid' : ''}`;
  const fieldError = (k: IncidentFieldKey) => errors[k] && <p className="pl-field-error">{errors[k]}</p>;
  const req = <span className="pl-req" aria-hidden="true">*</span>;
  const opt = <span className="pl-opt">optional</span>;

  return (
    <form ref={formRef} className="pl-rr-form-page" onSubmit={handleSubmit} noValidate>
      <div className="pl-rr-form-body">
        <div className="pl-rr-form-main">
          {error && <p className="pl-note pl-alert" role="alert">{error}</p>}

          <section className="pl-card" aria-labelledby="if-s1">
            <div className="pl-form-sec-h"><span className="pl-sec-n">1</span><h2 id="if-s1" className="pl-section">What happened?</h2></div>
            <p className="pl-hint">Write it as you would tell your manager. You can add detail later.</p>
            <div className="pl-stack">
              <div className="pl-field">
                <label className="pl-field-label" htmlFor="if-title">Incident title {req}</label>
                <input id="if-title" data-field="title" className={inputCls('title')} maxLength={INCIDENT_TITLE_MAX}
                  value={v.title} onChange={e => set('title', e.target.value)} onBlur={() => blur('title')}
                  placeholder="e.g. Payroll outage" aria-invalid={!!errors.title} />
                {errors.title ? fieldError('title') : <span className="pl-help">Up to {INCIDENT_TITLE_MAX} characters.</span>}
              </div>
              <div className="pl-field">
                <label className="pl-field-label" htmlFor="if-desc">Description {req}</label>
                <textarea id="if-desc" data-field="description" className={inputCls('description')} value={v.description}
                  onChange={e => set('description', e.target.value)} onBlur={() => blur('description')}
                  placeholder="What happened, who or what was affected, and how you found out" aria-invalid={!!errors.description} />
                {fieldError('description')}
              </div>
              <div className="pl-row2">
                <div className="pl-field">
                  <label className="pl-field-label" htmlFor="if-cat">Category {req}</label>
                  <select id="if-cat" data-field="category" className={inputCls('category')} value={v.category}
                    onChange={e => set('category', e.target.value)} onBlur={() => blur('category')} aria-invalid={!!errors.category}>
                    <option value="">Choose a category</option>
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                    {v.category && !categories.includes(v.category) && <option value={v.category}>{v.category}</option>}
                  </select>
                  {fieldError('category')}
                </div>
                <div className="pl-field">
                  <label className="pl-field-label" htmlFor="if-asset">Affected asset or service {opt}</label>
                  <input id="if-asset" className="pl-input" value={v.affected_asset} onChange={e => set('affected_asset', e.target.value)}
                    placeholder="e.g. Payroll bureau service" />
                </div>
                <div className="pl-field">
                  <label className="pl-field-label" htmlFor="if-bu">Business unit {opt}</label>
                  {units.length > 0 ? (
                    <select id="if-bu" className="pl-input" value={v.business_unit} onChange={e => set('business_unit', e.target.value)}>
                      <option value="">Choose a unit</option>
                      {units.map(u => <option key={u} value={u}>{u}</option>)}
                      {v.business_unit && !units.includes(v.business_unit) && <option value={v.business_unit}>{v.business_unit}</option>}
                    </select>
                  ) : (
                    <input id="if-bu" className="pl-input" value={v.business_unit} onChange={e => set('business_unit', e.target.value)}
                      placeholder="e.g. Operations" />
                  )}
                </div>
              </div>
              <div className="pl-field" role="radiogroup" aria-labelledby="if-sev">
                <span id="if-sev" className="pl-field-label">Severity {req}</span>
                <div className="pl-choices pl-in-choices">
                  {levels.map((l, n) => (
                    <button key={l.id} type="button" role="radio" aria-checked={v.severity === l.label}
                      data-field={n === 0 ? 'severity' : undefined}
                      className={`pl-choice${v.severity === l.label ? ' pl-on' : ''}`}
                      onClick={() => { set('severity', l.label); setErrors(prev => ({ ...prev, severity: undefined })); }}>
                      {l.label}
                      {l.criteria_text && <span>{l.criteria_text}</span>}
                    </button>
                  ))}
                  {v.severity && !levels.some(l => l.label === v.severity) && (
                    <button type="button" role="radio" aria-checked className="pl-choice pl-on">{v.severity}<span>No longer a configured level</span></button>
                  )}
                </div>
                {fieldError('severity')}
              </div>
            </div>
          </section>

          <section className="pl-card" aria-labelledby="if-s2">
            <div className="pl-form-sec-h"><span className="pl-sec-n">2</span><h2 id="if-s2" className="pl-section">When, and who reported it?</h2></div>
            <p className="pl-hint">The target date counts from the day it was reported.</p>
            <div className="pl-stack">
              <div className="pl-row2">
                <div className="pl-field">
                  <label className="pl-field-label" htmlFor="if-occ">Date it happened {req}</label>
                  <input id="if-occ" data-field="occurred_date" type="date" max={today} className={inputCls('occurred_date')}
                    value={v.occurred_date} onChange={e => set('occurred_date', e.target.value)} onBlur={() => blur('occurred_date')}
                    aria-invalid={!!errors.occurred_date} />
                  {fieldError('occurred_date')}
                </div>
                <div className="pl-field">
                  <label className="pl-field-label" htmlFor="if-time">Time {opt}</label>
                  <input id="if-time" type="time" className="pl-input" value={v.occurred_time} onChange={e => set('occurred_time', e.target.value)} />
                </div>
                <div className="pl-field">
                  <label className="pl-field-label" htmlFor="if-rep">Date reported {req}</label>
                  <input id="if-rep" data-field="reported_at" type="date" max={today} className={inputCls('reported_at')}
                    value={v.reported_at} onChange={e => set('reported_at', e.target.value)} onBlur={() => blur('reported_at')}
                    aria-invalid={!!errors.reported_at} />
                  {fieldError('reported_at')}
                </div>
              </div>
              <div className="pl-row2">
                <div className="pl-field">
                  <label className="pl-field-label" htmlFor="if-by">Reported by {req}</label>
                  <input id="if-by" data-field="reported_by" list="if-people" className={inputCls('reported_by')}
                    value={v.reported_by} onChange={e => set('reported_by', e.target.value)} onBlur={() => blur('reported_by')}
                    placeholder="Choose or type a name" aria-invalid={!!errors.reported_by} />
                  {fieldError('reported_by')}
                </div>
                <div className="pl-field">
                  <label className="pl-field-label" htmlFor="if-ch">How it was reported</label>
                  <select id="if-ch" className="pl-input" value={v.channel} onChange={e => set('channel', e.target.value)}>
                    <option value="">Not recorded</option>
                    {REPORT_CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
                    {v.channel && !(REPORT_CHANNELS as readonly string[]).includes(v.channel) && <option value={v.channel}>{v.channel}</option>}
                  </select>
                </div>
                <div className="pl-field">
                  <label className="pl-field-label" htmlFor="if-email">Reporter's email {opt}</label>
                  <input id="if-email" data-field="reporter_email" type="email" className={inputCls('reporter_email')}
                    value={v.reporter_email} onChange={e => set('reporter_email', e.target.value)} onBlur={() => blur('reporter_email')}
                    placeholder="name@company.com" aria-invalid={!!errors.reporter_email} />
                  {fieldError('reporter_email')}
                </div>
              </div>
            </div>
          </section>

          <section className="pl-card" aria-labelledby="if-s3">
            <div className="pl-form-sec-h">
              <span className="pl-sec-n">3</span><h2 id="if-s3" className="pl-section">Which risk does it belong to?</h2>
              <Explain id="link-incident-to-risk" />
            </div>
            <p className="pl-hint">Linking gives the risk owner evidence to reassess. It does not change the risk score on its own.</p>
            <div className="pl-stack">
              {suggestion && (
                <div className="pl-note pl-inline">
                  <span className="pl-grow">This may belong to {suggestion.id} {suggestion.title}.</span>
                  <button type="button" className="pl-btn pl-btn-secondary pl-btn-sm" onClick={() => set('linked_risk_id', suggestion.id)}>Link it</button>
                </div>
              )}
              {!v.linked_risk_id && p && v.category && !p.covered && (
                <div className="pl-note pl-alert pl-inline">
                  <span className="pl-grow">No risk on the register covers {v.category} yet.</span>
                  {canAddRisk && <Link className="pl-btn pl-btn-secondary pl-btn-sm" to="/risks/new">Create a risk</Link>}
                </div>
              )}
              <div className="pl-field">
                <label className="pl-field-label" htmlFor="if-risk">Related risk {opt}</label>
                <select id="if-risk" className="pl-input" value={v.linked_risk_id} onChange={e => set('linked_risk_id', e.target.value)}>
                  <option value="">No related risk yet</option>
                  {riskOptions.map(r => <option key={r.id} value={r.id}>{r.id} {r.display_title}</option>)}
                  {v.linked_risk_id && !riskOptions.some(r => r.id === v.linked_risk_id) && (
                    <option value={v.linked_risk_id}>{v.linked_risk_id}</option>
                  )}
                </select>
                {risks.isError && <span className="pl-help">The risk list could not be loaded.</span>}
              </div>
              {v.linked_risk_id && (
                <div className="pl-field" role="radiogroup" aria-labelledby="if-out">
                  <span id="if-out" className="pl-field-label">Did the risk's control work?</span>
                  <div className="pl-choices pl-in-choices">
                    {CONTROL_OUTCOMES.map(o => (
                      <button key={o.value} type="button" role="radio" aria-checked={v.control_outcome === o.value}
                        className={`pl-choice${v.control_outcome === o.value ? ' pl-on' : ''}`}
                        onClick={() => set('control_outcome', v.control_outcome === o.value ? '' : o.value)}>
                        {o.label}<span>{o.help}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="pl-card" aria-labelledby="if-s4">
            <div className="pl-form-sec-h"><span className="pl-sec-n">4</span><h2 id="if-s4" className="pl-section">First response and cost</h2></div>
            <p className="pl-hint">Rough figures are fine. Mark how sure you are.</p>
            <div className="pl-stack">
              <div className="pl-field">
                <label className="pl-field-label" htmlFor="if-act">Immediate actions taken</label>
                <textarea id="if-act" className="pl-input pl-rr-short" value={v.immediate_actions} onChange={e => set('immediate_actions', e.target.value)}
                  placeholder="e.g. Link blocked, affected passwords reset" />
              </div>
              <div className="pl-row2">
                <div className="pl-field">
                  <label className="pl-field-label" htmlFor="if-own">Owner {req}</label>
                  <input id="if-own" data-field="assigned_to" list="if-people" className={inputCls('assigned_to')}
                    value={v.assigned_to} onChange={e => set('assigned_to', e.target.value)} onBlur={() => blur('assigned_to')}
                    placeholder="Choose or type a name" aria-invalid={!!errors.assigned_to} />
                  {errors.assigned_to ? fieldError('assigned_to')
                    : people.length === 0 && <span className="pl-help">Add owners in Settings, Lookups, to pick from a list.</span>}
                </div>
                <div className="pl-field">
                  <label className="pl-field-label" htmlFor="if-money">Financial impact {opt}</label>
                  <input id="if-money" data-field="financial_impact" inputMode="decimal" className={inputCls('financial_impact')}
                    value={v.financial_impact} onChange={e => set('financial_impact', e.target.value)} onBlur={() => blur('financial_impact')}
                    placeholder="e.g. 4,200,000" aria-invalid={!!errors.financial_impact} />
                  {fieldError('financial_impact')}
                </div>
                <div className="pl-field">
                  <label className="pl-field-label" htmlFor="if-conf">How sure is that figure?</label>
                  <select id="if-conf" className="pl-input" value={v.impact_confidence} onChange={e => set('impact_confidence', e.target.value)}>
                    {IMPACT_CONFIDENCE.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>
              {isEdit && (
                <div className="pl-row2">
                  <div className="pl-field">
                    <label className="pl-field-label" htmlFor="if-status">Stage</label>
                    <select id="if-status" className="pl-input" value={v.status} onChange={e => set('status', e.target.value as IncidentFormValues['status'])}>
                      {INCIDENT_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="pl-field pl-in-span2">
                    <label className="pl-field-label" htmlFor="if-res">Resolution summary {opt}</label>
                    <input id="if-res" className="pl-input" value={v.resolution_summary} onChange={e => set('resolution_summary', e.target.value)}
                      placeholder="What fixed it, and what was learned" />
                  </div>
                </div>
              )}
            </div>
          </section>
          <datalist id="if-people">
            {people.map(o => <option key={o} value={o} />)}
          </datalist>
        </div>

        <aside className="pl-rr-form-side" aria-label="What happens when you save">
          <section className="pl-card pl-rr-live">
            <h2 className="pl-label">Target to resolve</h2>
            <p className="pl-metric-m">{p?.resolve_by ? formatDate(p.resolve_by) : '…'}</p>
            <p className="pl-caption">{p ? `${p.due_note} Resolve by the end of this day.` : 'Choose a severity.'}</p>
          </section>
          {p && (
            <section className="pl-card pl-rr-live">
              <h2 className="pl-label">{isEdit ? 'Once saved' : 'When you save'}</h2>
              <ul className="pl-in-outcomes">
                {p.outcomes.slice(isEdit ? 1 : 0).map(o => <li key={o}>{o}</li>)}
              </ul>
            </section>
          )}
          {preview.isError && <p className="pl-note pl-alert" role="alert">The target could not be loaded. You can still save.</p>}
          <p className="pl-caption">Target days per severity come from your incident settings.</p>
        </aside>
      </div>

      <div className="pl-rr-form-foot">
        <span className="pl-caption pl-grow">Fields marked <span className="pl-req">*</span> are required.</span>
        <button type="button" className="pl-btn pl-btn-secondary" onClick={onCancel} disabled={saving}>Cancel</button>
        <button type="submit" className="pl-btn pl-btn-primary" disabled={saving}>
          {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Log incident'}
        </button>
      </div>
    </form>
  );
}

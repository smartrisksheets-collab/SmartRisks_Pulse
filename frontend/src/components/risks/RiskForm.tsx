// src/components/risks/RiskForm.tsx
// Full-page add and edit form in five steps, with a live score beside it.
// The live score comes from POST /risks/score-preview, which runs the same
// scoring function the backend uses on save. Nothing is scored here.

import { useRef, useState, type FormEvent } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import type { MitigationStatus, RiskCreate, RiskTreatment } from '../../types/risk';
import { RISK_TITLE_MAX } from '../../types/risk';
import { FIELD_ORDER, validateRiskForm, type RiskFieldErrors, type RiskFieldKey, type RiskFormValues } from '../../utils/riskForm';
import { useLookups } from '../../hooks/useLookups';
import { useMatrix } from '../../hooks/useMatrix';
import { scorePreview } from '../../services/risks';
import { ASSERTION_SOURCES, MITIGATION_STATUSES, appetiteChip, levelChipClass, pctOf, scoreText } from '../../utils/riskDisplay';
import Explain from '../help/Explain';


interface Props {
  initial:      RiskFormValues;
  isEdit:       boolean;
  saving:       boolean;
  error:        string | null;
  onSubmit:     (payload: RiskCreate, addAnother: boolean) => void;
  onCancel:     () => void;
}

export default function RiskForm({ initial, isEdit, saving, error, onSubmit, onCancel }: Props) {
  const [v, setV] = useState<RiskFormValues>(initial);
  const [errors, setErrors] = useState<RiskFieldErrors>({});
  const formRef = useRef<HTMLFormElement>(null);
  const { lookups } = useLookups();
  const { query: matrixQuery } = useMatrix();

  const matrix = matrixQuery.data;
  const lScale = matrix?.likelihood_scale ?? 5;
  const iScale = matrix?.impact_scale ?? 5;
  const ceScale = matrix?.ce_scale ?? 5;
  const ceLabels = matrix?.ce_labels ?? {};
  const bandCount = matrix?.band_count ?? 4;

  const categories = lookups?.category ?? [];
  const owners = lookups?.risk_owner ?? [];
  const treatments = (lookups?.treatment ?? []) as RiskTreatment[];

  const preview = useQuery({
    queryKey: ['risks', 'score-preview', v.likelihood, v.impact_score, v.control_effectiveness, v.category],
    queryFn: () => scorePreview({
      likelihood: v.likelihood,
      impact_score: v.impact_score,
      control_effectiveness: v.control_effectiveness,
      category: v.category || null,
    }),
    staleTime: 60 * 1000,
    placeholderData: keepPreviousData,
  });
  const score = preview.data;

  function set<K extends keyof RiskFormValues>(key: K, value: RiskFormValues[K]) {
    setV(prev => ({ ...prev, [key]: value }));
  }

  function blur(key: RiskFieldKey) {
    const msg = validateRiskForm(v)[key];
    setErrors(prev => ({ ...prev, [key]: msg }));
  }

  function submit(addAnother: boolean) {
    const found = validateRiskForm(v);
    setErrors(found);
    const first = FIELD_ORDER.find(k => found[k]);
    if (first) {
      formRef.current?.querySelector<HTMLElement>(`[data-field="${first}"]`)?.focus();
      return;
    }
    onSubmit({
      title:                 v.title.trim(),
      category:              v.category,
      description:           v.description.trim(),
      owner:                 v.owner,
      treatment:             v.treatment as RiskTreatment,
      likelihood:            v.likelihood,
      impact_score:          v.impact_score,
      // Cleared text fields send null, never undefined, so an edit really clears them.
      primary_impact:        v.primary_impact.trim()     || null,
      controls:              v.controls.trim()           || null,
      control_effectiveness: v.control_effectiveness,
      mitigation_plan:       v.mitigation_plan.trim()    || null,
      comments:              v.comments.trim()           || null,
      owner_email:           v.owner_email.trim()        || null,
      target_date:           v.target_date               || null,
      mitigation_status:     v.mitigation_status,
      logged_at:             v.logged_at                 || undefined,
      root_cause:            v.root_cause.trim()         || null,
      financial_exposure:    v.financial_exposure.trim() || null,
      linked_decision:       v.linked_decision.trim()    || null,
      control_last_tested:   v.control_last_tested       || null,
      control_assertion_source: v.control_assertion_source || null,
    }, addAnother);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    submit(false);
  }

  const inputCls = (k: RiskFieldKey) => `pl-input${errors[k] ? ' invalid' : ''}`;
  const req = <span className="pl-req" aria-hidden="true">*</span>;
  const opt = <span className="pl-opt">optional</span>;
  const scale = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
  const app = score ? appetiteChip(score.appetite_status, !!v.category) : null;

  return (
    <form ref={formRef} className="pl-rr-form-page" onSubmit={handleSubmit} noValidate>
      <div className="pl-rr-form-body">
        <div className="pl-rr-form-main">
          {error && <p className="pl-note pl-alert" role="alert">{error}</p>}

          <section className="pl-card" aria-labelledby="rf-s1">
            <div className="pl-form-sec-h"><span className="pl-sec-n">1</span><h2 id="rf-s1" className="pl-section">What is the risk?</h2></div>
            <p className="pl-hint">A short title appears in lists and reports. Use the description for the detail.</p>
            <div className="pl-stack">
              <div className="pl-field">
                <label className="pl-field-label" htmlFor="rf-title">Risk title {req}</label>
                <input id="rf-title" data-field="title" className={inputCls('title')} maxLength={RISK_TITLE_MAX}
                  value={v.title} onChange={e => set('title', e.target.value)} onBlur={() => blur('title')}
                  placeholder="e.g. Vendor data leak" aria-invalid={!!errors.title} aria-describedby="rf-title-help" />
                {errors.title
                  ? <p className="pl-field-error" id="rf-title-help">{errors.title}</p>
                  : <span className="pl-help" id="rf-title-help">Up to {RISK_TITLE_MAX} characters.</span>}
              </div>
              <div className="pl-row2">
                <div className="pl-field">
                  <label className="pl-field-label" htmlFor="rf-cat">Category {req}</label>
                  <select id="rf-cat" data-field="category" className={inputCls('category')} value={v.category}
                    onChange={e => set('category', e.target.value)} onBlur={() => blur('category')} aria-invalid={!!errors.category}>
                    <option value="">Choose a category</option>
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                    {v.category && !categories.includes(v.category) && <option value={v.category}>{v.category}</option>}
                  </select>
                  {errors.category && <p className="pl-field-error">{errors.category}</p>}
                </div>
                <div className="pl-field">
                  <label className="pl-field-label" htmlFor="rf-owner">Risk owner {req}</label>
                  <select id="rf-owner" data-field="owner" className={inputCls('owner')} value={v.owner}
                    onChange={e => set('owner', e.target.value)} onBlur={() => blur('owner')} aria-invalid={!!errors.owner}>
                    <option value="">Choose an owner</option>
                    {owners.map(o => <option key={o} value={o}>{o}</option>)}
                    {v.owner && !owners.includes(v.owner) && <option value={v.owner}>{v.owner}</option>}
                  </select>
                  {errors.owner && <p className="pl-field-error">{errors.owner}</p>}
                  {owners.length === 0 && <span className="pl-help">Add risk owners in Settings, Lookups.</span>}
                </div>
                <div className="pl-field">
                  <label className="pl-field-label" htmlFor="rf-date">Date logged</label>
                  <input id="rf-date" type="date" className="pl-input" value={v.logged_at} onChange={e => set('logged_at', e.target.value)} />
                </div>
              </div>
              <div className="pl-field">
                <label className="pl-field-label" htmlFor="rf-desc">Description {req}</label>
                <textarea id="rf-desc" data-field="description" className={inputCls('description')} value={v.description}
                  onChange={e => set('description', e.target.value)} onBlur={() => blur('description')}
                  placeholder="What could happen, and to what?" aria-invalid={!!errors.description} />
                {errors.description && <p className="pl-field-error">{errors.description}</p>}
              </div>
              <div className="pl-field">
                <label className="pl-field-label" htmlFor="rf-cause">Root cause {opt}</label>
                <textarea id="rf-cause" className="pl-input pl-rr-short" value={v.root_cause} onChange={e => set('root_cause', e.target.value)}
                  placeholder="What is driving this risk? Leave blank if not yet known." />
              </div>
            </div>
          </section>

          <section className="pl-card" aria-labelledby="rf-s2">
            <div className="pl-form-sec-h"><span className="pl-sec-n">2</span><h2 id="rf-s2" className="pl-section">What would it cost?</h2></div>
            <p className="pl-hint">For context only. The score in step 3 is what Pulse uses.</p>
            <div className="pl-row2">
              <div className="pl-field">
                <label className="pl-field-label" htmlFor="rf-imp">Business impact</label>
                <input id="rf-imp" className="pl-input" value={v.primary_impact} onChange={e => set('primary_impact', e.target.value)}
                  placeholder="e.g. Regulatory fine, customer losses" />
              </div>
              <div className="pl-field">
                <label className="pl-field-label" htmlFor="rf-exp">Financial exposure {opt}</label>
                <input id="rf-exp" className="pl-input" value={v.financial_exposure} onChange={e => set('financial_exposure', e.target.value)}
                  placeholder="e.g. 25000000, or 100000 per day" />
              </div>
            </div>
          </section>

          <section className="pl-card" aria-labelledby="rf-s3">
            <div className="pl-form-sec-h"><span className="pl-sec-n">3</span><h2 id="rf-s3" className="pl-section">How likely, how severe?</h2></div>
            <p className="pl-hint">Score the risk before any controls. The scales come from your risk matrix in Settings.</p>
            <div className="pl-stack">
              <div className="pl-field" role="radiogroup" aria-labelledby="rf-lik">
                <span id="rf-lik" className="pl-field-label">Likelihood {req}</span>
                <div className="pl-scale" style={{ '--pl-scale-n': lScale } as React.CSSProperties}>
                  {scale(lScale).map(n => (
                    <button key={n} type="button" role="radio" aria-checked={v.likelihood === n}
                      className={`pl-scale-btn${v.likelihood === n ? ' pl-on' : ''}`} onClick={() => set('likelihood', n)}>{n}</button>
                  ))}
                </div>
              </div>
              <div className="pl-field" role="radiogroup" aria-labelledby="rf-impact">
                <span id="rf-impact" className="pl-field-label">Impact {req}</span>
                <div className="pl-scale" style={{ '--pl-scale-n': iScale } as React.CSSProperties}>
                  {scale(iScale).map(n => (
                    <button key={n} type="button" role="radio" aria-checked={v.impact_score === n}
                      className={`pl-scale-btn${v.impact_score === n ? ' pl-on' : ''}`} onClick={() => set('impact_score', n)}>{n}</button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="pl-card" aria-labelledby="rf-s4">
            <div className="pl-form-sec-h"><span className="pl-sec-n">4</span><h2 id="rf-s4" className="pl-section">What controls are in place?</h2></div>
            <p className="pl-hint">
              Control strength reduces the inherent score to the residual. A rating counts as evidenced only if it was
              independently tested or audited in the last 12 months.<Explain id="control-effectiveness" />
            </p>
            <div className="pl-stack">
              <div className="pl-field">
                <label className="pl-field-label" htmlFor="rf-ctl">Existing controls</label>
                <textarea id="rf-ctl" className="pl-input pl-rr-short" value={v.controls} onChange={e => set('controls', e.target.value)}
                  placeholder="e.g. Annual vendor questionnaire; contract clause on data protection" />
              </div>
              <div className="pl-field" role="radiogroup" aria-labelledby="rf-ce">
                <span id="rf-ce" className="pl-field-label">Control strength</span>
                <div className="pl-scale" style={{ '--pl-scale-n': ceScale + 1 } as React.CSSProperties}>
                  <button type="button" role="radio" aria-checked={v.control_effectiveness === null}
                    className={`pl-scale-btn${v.control_effectiveness === null ? ' pl-on' : ''}`}
                    onClick={() => set('control_effectiveness', null)}>–<span>Not assessed</span></button>
                  {scale(ceScale).map(n => (
                    <button key={n} type="button" role="radio" aria-checked={v.control_effectiveness === n}
                      className={`pl-scale-btn${v.control_effectiveness === n ? ' pl-on' : ''}`}
                      onClick={() => set('control_effectiveness', n)}>
                      {n}{(ceLabels[String(n)] ?? '').trim() && <span>{ceLabels[String(n)]}</span>}
                    </button>
                  ))}
                </div>
              </div>
              <div className="pl-row2">
                <div className="pl-field">
                  <label className="pl-field-label" htmlFor="rf-src">Evidence</label>
                  <select id="rf-src" className="pl-input" value={v.control_assertion_source} onChange={e => set('control_assertion_source', e.target.value)}>
                    {ASSERTION_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="pl-field">
                  <label className="pl-field-label" htmlFor="rf-tested">Last tested {opt}</label>
                  <input id="rf-tested" type="date" className="pl-input" value={v.control_last_tested} onChange={e => set('control_last_tested', e.target.value)} />
                </div>
              </div>
            </div>
          </section>

          <section className="pl-card" aria-labelledby="rf-s5">
            <div className="pl-form-sec-h"><span className="pl-sec-n">5</span><h2 id="rf-s5" className="pl-section">What will you do about it?</h2></div>
            <p className="pl-hint">Choose a treatment. A risk that is elevated or outside appetite shows as Undecided until a linked decision is recorded.</p>
            <div className="pl-stack">
              <div className="pl-field" role="radiogroup" aria-labelledby="rf-treat">
                <span id="rf-treat" className="pl-field-label">Treatment {req}</span>
                <div className="pl-choices">
                  {treatments.map((t, n) => (
                    <button key={t} type="button" role="radio" aria-checked={v.treatment === t}
                      data-field={n === 0 ? 'treatment' : undefined}
                      className={`pl-choice${v.treatment === t ? ' pl-on' : ''}`}
                      onClick={() => { set('treatment', t); setErrors(prev => ({ ...prev, treatment: undefined })); }}>
                      {t}
                    </button>
                  ))}
                </div>
                {errors.treatment && <p className="pl-field-error">{errors.treatment}</p>}
              </div>
              <div className="pl-field">
                <label className="pl-field-label" htmlFor="rf-plan">Plan</label>
                <textarea id="rf-plan" className="pl-input pl-rr-short" value={v.mitigation_plan} onChange={e => set('mitigation_plan', e.target.value)}
                  placeholder="e.g. Restrict the vendor to masked data, then audit their data handling" />
              </div>
              <div className="pl-row2">
                <div className="pl-field">
                  <label className="pl-field-label" htmlFor="rf-target">Target date</label>
                  <input id="rf-target" type="date" className="pl-input" value={v.target_date} onChange={e => set('target_date', e.target.value)} />
                </div>
                <div className="pl-field">
                  <label className="pl-field-label" htmlFor="rf-status">Status</label>
                  <select id="rf-status" className="pl-input" value={v.mitigation_status} onChange={e => set('mitigation_status', e.target.value as MitigationStatus)}>
                    {MITIGATION_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div className="pl-field">
                <label className="pl-field-label" htmlFor="rf-dec">Linked decision {opt}</label>
                <input id="rf-dec" className="pl-input" value={v.linked_decision} onChange={e => set('linked_decision', e.target.value)}
                  placeholder="Which upcoming decision does this risk affect?" />
              </div>
              <div className="pl-field">
                <label className="pl-field-label" htmlFor="rf-notes">Notes {opt}</label>
                <textarea id="rf-notes" className="pl-input pl-rr-short" value={v.comments} onChange={e => set('comments', e.target.value)}
                  placeholder="Notes for follow-up" />
              </div>
            </div>
          </section>
        </div>

        <aside className="pl-rr-form-side" aria-label="Live score">
          <section className="pl-card pl-rr-live">
            <h2 className="pl-label">Live score</h2>
            <div className="pl-score">
              <span className="pl-metric-xl">{score ? Math.round(score.residual) : '…'}</span>
              <span className="pl-caption">residual of {score?.residual_max ?? '…'}</span>
            </div>
            {score && (
              <div className={`pl-rr-meter${score.appetite_status === 'exceeds' ? ' pl-over' : ''}`}
                style={{ '--pl-fill': pctOf(score.residual, score.residual_max), '--pl-thr': pctOf(score.threshold, score.residual_max) } as React.CSSProperties}
                aria-hidden="true">
                <span />
                {score.threshold != null && <i />}
              </div>
            )}
            {score && (
              <dl className="pl-stack-0">
                <div className="pl-prow"><dt>Inherent</dt><dd>
                  {v.likelihood} × {v.impact_score} = {scoreText(score.severity).replace(/\.0$/, '')}
                  <span className={`pl-chip ${levelChipClass(score.level_index, bandCount)}`}>{score.level}</span>
                </dd></div>
                <div className="pl-prow"><dt>Controls</dt><dd>{score.ce_label} · cuts {score.ce_pct}%</dd></div>
                <div className="pl-prow"><dt>Appetite</dt><dd>{app && <span className={app.cls}>{app.text}</span>}</dd></div>
              </dl>
            )}
            {score && <p className={`pl-note${score.appetite_status === 'exceeds' ? ' pl-alert' : ''}`}>{score.note}</p>}
            {preview.isError && <p className="pl-note pl-alert" role="alert">The live score could not be loaded. You can still save.</p>}
          </section>
          <p className="pl-caption">Residual = inherent × (1 − control strength). Bands and thresholds come from your workspace settings.</p>
        </aside>
      </div>

      <div className="pl-rr-form-foot">
        <span className="pl-caption pl-grow">Fields marked <span className="pl-req">*</span> are required.</span>
        <button type="button" className="pl-btn pl-btn-secondary" onClick={onCancel} disabled={saving}>Cancel</button>
        {!isEdit && (
          <button type="button" className="pl-btn pl-btn-secondary" onClick={() => submit(true)} disabled={saving}>Save and add another</button>
        )}
        <button type="submit" className="pl-btn pl-btn-primary" disabled={saving}>
          {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Save risk'}
        </button>
      </div>
    </form>
  );
}

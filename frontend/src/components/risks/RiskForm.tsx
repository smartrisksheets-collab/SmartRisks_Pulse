// src/components/risks/RiskForm.tsx

import { useState, type FormEvent } from 'react';
import type { RiskCreate, RiskTreatment, MitigationStatus } from '../../types/risk';
import { useLookups } from '../../hooks/useLookups';
import { useMatrix } from '../../hooks/useMatrix';

const FALLBACK_CATEGORIES: string[]        = ['Strategic', 'Operational', 'Financial', 'Compliance', 'Reputational', 'Technical'];
const FALLBACK_TREATMENTS: RiskTreatment[] = ['Mitigate', 'Transfer', 'Accept', 'Avoid'];
const CTRL_EFF = [
  { label: '— None —', value: 0 },
  { label: '1', value: 1 },
  { label: '2', value: 2 },
  { label: '3', value: 3 },
  { label: '4', value: 4 },
  { label: '5', value: 5 },
];

export interface RiskFormValues {
  category:              string;
  description:           string;
  owner:                 string;
  primary_impact:        string;
  logged_at:             string;
  likelihood:            number;
  impact_score:          number;
  treatment:             RiskTreatment;
  controls:              string;
  control_effectiveness: number;
  mitigation_plan:       string;
  comments:              string;
  owner_email:           string;
  target_date:           string;
  mitigation_status:        MitigationStatus;
  root_cause:               string;
  financial_exposure:       string;
  linked_decision:          string;
  control_last_tested:      string;
  control_assertion_source: string;
}

const EMPTY: RiskFormValues = {
  category: '', description: '', owner: '', primary_impact: '',
  logged_at: new Date().toISOString().slice(0, 10),
  likelihood: 3, impact_score: 3, treatment: 'Mitigate',
  controls: '', control_effectiveness: 0,
  mitigation_plan: '', comments: '',
  owner_email: '', target_date: '', mitigation_status: 'Open',
  root_cause: '', financial_exposure: '', linked_decision: '',
  control_last_tested: '', control_assertion_source: 'Self-assessed',
};

interface Props {
  editId?:     string;
  initial?:    Partial<RiskFormValues>;
  submitLabel: string;
  loading:     boolean;
  error:       string | null;
  onSubmit:    (values: RiskCreate) => void;
  onCancel:    () => void;
}

export default function RiskForm({ editId, initial, submitLabel, loading, error, onSubmit, onCancel }: Props) {
  const [v, setV] = useState<RiskFormValues>({ ...EMPTY, ...initial });
  const { lookups } = useLookups();

  const { query: matrixQuery } = useMatrix();
  const lScale = matrixQuery.data?.likelihood_scale ?? 5;
  const iScale = matrixQuery.data?.impact_scale     ?? 5;
  const scaleOptions = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

  const categories = lookups?.category   ?? FALLBACK_CATEGORIES;
  const treatments = (lookups?.treatment as RiskTreatment[] | undefined) ?? FALLBACK_TREATMENTS;
  const owners     = lookups?.risk_owner ?? [];

  function f<K extends keyof RiskFormValues>(key: K) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      const raw = e.target.value;
      const val = (key === 'likelihood' || key === 'impact_score' || key === 'control_effectiveness')
        ? Number(raw)
        : raw;
      setV(prev => ({ ...prev, [key]: val }));
    };
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onSubmit({
      category:              v.category,
      description:           v.description,
      owner:                 v.owner,
      treatment:             v.treatment,
      likelihood:            v.likelihood,
      impact_score:          v.impact_score,
      primary_impact:        v.primary_impact   || undefined,
      controls:              v.controls         || undefined,
      control_effectiveness: v.control_effectiveness || undefined,
      mitigation_plan:       v.mitigation_plan  || undefined,
      comments:              v.comments         || undefined,
      owner_email:           v.owner_email      || undefined,
      target_date:           v.target_date      || undefined,
      mitigation_status:     v.mitigation_status,
      logged_at:             v.logged_at               || undefined,
      root_cause:            v.root_cause              || undefined,
      financial_exposure:    v.financial_exposure       || undefined,
      linked_decision:       v.linked_decision          || undefined,
      control_last_tested:   v.control_last_tested      || undefined,
      control_assertion_source: v.control_assertion_source || undefined,
    });
  }

  const req = <span style={{ color: '#ef4444' }}>*</span>;

  return (
    <form onSubmit={handleSubmit}>
      <div className="modal-bd">
        {error && <div className="auth-error" style={{ marginBottom: 14 }}>{error}</div>}

        <div className="row">

          {/* Risk ID — edit mode only */}
          {editId && (
            <div className="field" style={{ gridColumn: 'span 2' }}>
              <label>Risk ID</label>
              <input value={editId} readOnly />
            </div>
          )}

          {/* Category */}
          <div className="field" style={{ gridColumn: editId ? 'span 4' : 'span 6' }}>
            <label>Category {req}</label>
            <select value={v.category} onChange={f('category')} required>
              <option value="">— Select Category —</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
              {v.category && !categories.includes(v.category) && (
                <option value={v.category}>{v.category}</option>
              )}
            </select>
          </div>

          {/* Owner */}
          <div className="field" style={{ gridColumn: 'span 3' }}>
            <label>Owner {req}</label>
            <select value={v.owner} onChange={f('owner')} required>
              <option value="">— Select Owner —</option>
              {owners.map(o => <option key={o} value={o}>{o}</option>)}
              {v.owner && !owners.includes(v.owner) && (
                <option value={v.owner}>{v.owner}</option>
              )}
            </select>
          </div>

          {/* Date Logged */}
          <div className="field" style={{ gridColumn: 'span 3' }}>
            <label>Date Logged</label>
            <input type="date" value={v.logged_at} onChange={f('logged_at')} />
          </div>

          {/* Description */}
          <div className="field" style={{ gridColumn: 'span 12' }}>
            <label>Description {req}</label>
            <textarea
              value={v.description}
              onChange={f('description')}
              required
              placeholder="Describe the risk clearly…"
            />
          </div>

          {/* Root Cause */}
          <div className="field" style={{ gridColumn: 'span 12' }}>
            <label>Root cause <span className="field-hint" style={{ display: 'inline', fontStyle: 'italic' }}>optional</span></label>
            <textarea
              value={v.root_cause}
              onChange={f('root_cause')}
              placeholder="What is actually driving this risk? Leave blank if not yet known."
              style={{ minHeight: 60 }}
            />
          </div>

          {/* Primary Impact + Financial Exposure */}
          <div className="field" style={{ gridColumn: 'span 6' }}>
            <label>Business impact</label>
            <input
              value={v.primary_impact}
              onChange={f('primary_impact')}
              placeholder="e.g. Loan losses, Regulatory fine"
            />
          </div>

          <div className="field" style={{ gridColumn: 'span 6' }}>
            <label>Financial exposure <span className="field-hint" style={{ display: 'inline', fontStyle: 'italic' }}>optional</span></label>
            <input
              value={v.financial_exposure}
              onChange={f('financial_exposure')}
              placeholder="e.g. ₦450M — analyst estimate, not derived from severity"
            />
          </div>

          {/* Likelihood */}
          <div className="field" style={{ gridColumn: 'span 3' }}>
            <label>Likelihood {req}</label>
            <select value={v.likelihood} onChange={f('likelihood')}>
              {scaleOptions(lScale).map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>

          {/* Impact Score */}
          <div className="field" style={{ gridColumn: 'span 3' }}>
            <label>Impact Score {req}</label>
            <select value={v.impact_score} onChange={f('impact_score')}>
              {scaleOptions(iScale).map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>

          {/* Treatment */}
          <div className="field" style={{ gridColumn: 'span 4' }}>
            <label>Treatment {req}</label>
            <select value={v.treatment} onChange={f('treatment')}>
              {treatments.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {/* Mitigation Plan */}
          <div className="field" style={{ gridColumn: 'span 8' }}>
            <label>Mitigation Plan</label>
            <input
              value={v.mitigation_plan}
              onChange={f('mitigation_plan')}
              placeholder="e.g. Source qualified vendors, increase reserves…"
            />
          </div>

          {/* Control Effectiveness Assessment */}
          <div className="form-section" style={{ gridColumn: 'span 12' }}>
            <p className="form-section-title">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
              </svg>
              Control effectiveness assessment
            </p>
            <div className="row">
              <div className="field" style={{ gridColumn: 'span 8' }}>
                <label>Existing controls</label>
                <input
                  value={v.controls}
                  onChange={f('controls')}
                  placeholder="e.g. Weekly review, vendor qualification…"
                />
              </div>
              <div className="field" style={{ gridColumn: 'span 4' }}>
                <label>Effectiveness</label>
                <select value={v.control_effectiveness} onChange={f('control_effectiveness')}>
                  {CTRL_EFF.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div className="field" style={{ gridColumn: 'span 4' }}>
                <label>Last tested</label>
                <input type="date" value={v.control_last_tested} onChange={f('control_last_tested')} />
              </div>
              <div className="field" style={{ gridColumn: 'span 4' }}>
                <label>Assertion source</label>
                <select value={v.control_assertion_source} onChange={f('control_assertion_source')}>
                  <option>Self-assessed</option>
                  <option>Independently tested</option>
                  <option>External audit</option>
                </select>
              </div>
            </div>
            <p className="form-section-note">
              This rating shows as untested until a Last tested date is entered, and can go stale over time, following the same governance clock as risk review freshness.
            </p>
          </div>

          {/* Linked Decision */}
          <div className="field" style={{ gridColumn: 'span 12' }}>
            <label>Linked decision <span className="field-hint" style={{ display: 'inline', fontStyle: 'italic' }}>optional</span></label>
            <input
              value={v.linked_decision}
              onChange={f('linked_decision')}
              placeholder="Which upcoming decision does this risk affect?"
            />
          </div>

          {/* Analyst Comments */}
          <div className="field" style={{ gridColumn: 'span 12' }}>
            <label>Analyst Comments</label>
            <textarea
              value={v.comments}
              onChange={f('comments')}
              placeholder="Notes for follow-up…"
              style={{ minHeight: 80 }}
            />
          </div>

        </div>
      </div>

      <div className="modal-ft">
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={loading}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading && <span className="spinner" />}
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
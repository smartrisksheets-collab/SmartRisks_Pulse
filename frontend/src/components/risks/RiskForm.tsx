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
  mitigation_status:     MitigationStatus;
}

const EMPTY: RiskFormValues = {
  category: '', description: '', owner: '', primary_impact: '',
  logged_at: new Date().toISOString().slice(0, 10),
  likelihood: 3, impact_score: 3, treatment: 'Mitigate',
  controls: '', control_effectiveness: 0,
  mitigation_plan: '', comments: '',
  owner_email: '', target_date: '', mitigation_status: 'Open',
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
      logged_at:             v.logged_at        || undefined,
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

          {/* Primary Impact */}
          <div className="field" style={{ gridColumn: 'span 6' }}>
            <label>Primary Impact</label>
            <input
              value={v.primary_impact}
              onChange={f('primary_impact')}
              placeholder="e.g. Financial, Reputational"
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

          {/* Existing Controls */}
          <div className="field" style={{ gridColumn: 'span 8' }}>
            <label>Existing Controls</label>
            <input
              value={v.controls}
              onChange={f('controls')}
              placeholder="e.g. Weekly review, vendor qualification…"
            />
          </div>

          {/* Control Effectiveness */}
          <div className="field" style={{ gridColumn: 'span 4' }}>
            <label>Control Effectiveness</label>
            <select value={v.control_effectiveness} onChange={f('control_effectiveness')}>
              {CTRL_EFF.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
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
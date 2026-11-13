// src/utils/riskForm.ts
// Values, defaults and field checks for the risk add and edit form (RiskForm.tsx).

import type { MitigationStatus, Risk, RiskTreatment } from '../types/risk';
import { RISK_TITLE_MAX } from '../types/risk';

export interface RiskFormValues {
  title:                    string;
  category:                 string;
  description:              string;
  owner:                    string;
  primary_impact:           string;
  logged_at:                string;
  likelihood:               number;
  impact_score:             number;
  treatment:                RiskTreatment | '';
  controls:                 string;
  control_effectiveness:    number | null;
  mitigation_plan:          string;
  comments:                 string;
  owner_email:              string;
  target_date:              string;
  mitigation_status:        MitigationStatus;
  root_cause:               string;
  financial_exposure:       string;
  linked_decision:          string;
  control_last_tested:      string;
  control_assertion_source: string;
}

export const EMPTY_RISK_FORM: RiskFormValues = {
  title: '', category: '', description: '', owner: '', primary_impact: '',
  logged_at: new Date().toISOString().slice(0, 10),
  likelihood: 3, impact_score: 3, treatment: '',
  controls: '', control_effectiveness: null,
  mitigation_plan: '', comments: '',
  owner_email: '', target_date: '', mitigation_status: 'Open',
  root_cause: '', financial_exposure: '', linked_decision: '',
  control_last_tested: '', control_assertion_source: 'Self-assessed',
};

export type RiskFieldKey = 'title' | 'category' | 'owner' | 'description' | 'treatment';
export type RiskFieldErrors = Partial<Record<RiskFieldKey, string>>;

export function validateRiskForm(v: RiskFormValues): RiskFieldErrors {
  const e: RiskFieldErrors = {};
  const title = v.title.trim();
  if (!title) e.title = 'Give the risk a short title.';
  else if (title.length > RISK_TITLE_MAX) e.title = `Keep the title to ${RISK_TITLE_MAX} characters.`;
  if (!v.category.trim()) e.category = 'Choose a category.';
  if (!v.owner.trim()) e.owner = 'Choose a risk owner.';
  if (!v.description.trim()) e.description = 'Describe what could happen.';
  if (!v.treatment) e.treatment = 'Choose how the risk will be treated.';
  return e;
}

export const FIELD_ORDER: RiskFieldKey[] = ['title', 'category', 'owner', 'description', 'treatment'];

export function formFromRisk(r: Risk): RiskFormValues {
  return {
    title:                    r.title ?? '',
    category:                 r.category ?? '',
    description:              r.description ?? '',
    owner:                    r.owner ?? '',
    primary_impact:           r.primary_impact ?? '',
    logged_at:                r.logged_at ?? '',
    likelihood:               r.likelihood ?? 3,
    impact_score:             r.impact_score ?? 3,
    treatment:                r.treatment ?? '',
    controls:                 r.controls ?? '',
    control_effectiveness:    r.control_effectiveness ?? null,
    mitigation_plan:          r.mitigation_plan ?? '',
    comments:                 r.comments ?? '',
    owner_email:              r.owner_email ?? '',
    target_date:              r.target_date ?? '',
    mitigation_status:        r.mitigation_status ?? 'Open',
    root_cause:               r.root_cause ?? '',
    financial_exposure:       r.financial_exposure ?? '',
    linked_decision:          r.linked_decision ?? '',
    control_last_tested:      r.control_last_tested ?? '',
    control_assertion_source: r.control_assertion_source ?? 'Self-assessed',
  };
}

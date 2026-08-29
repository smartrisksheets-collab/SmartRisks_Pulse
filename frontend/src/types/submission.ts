// src/types/submission.ts

export type TriageStatus     = 'pending' | 'accepted' | 'merged' | 'rerouted' | 'closed';
export type SubmissionType   = 'risk' | 'incident';
export type SubmitterUrgency = 'now' | 'soon' | 'no_rush';

export interface SubmissionToken {
  id:               string;
  workspace_id:     string;
  token:            string;
  label:            string;
  department:       string;
  issued_by:        string;
  issued_at:        string;
  expires_at:       string | null;
  revoked_at:       string | null;
  submission_count: number;
}

export interface RiskSubmissionListItem {
  id:                string;
  reference:         string;
  submitted_at:      string;
  department:        string;
  submitter_name:    string;
  submitter_email:   string;
  description:       string;
  submitter_urgency: SubmitterUrgency | null;
  submission_type:   SubmissionType;
  status:            TriageStatus;
}

export interface RiskSubmission {
  id:                 string;
  workspace_id:       string;
  token_id:           string;
  reference:          string;
  submitter_name:     string;
  submitter_email:    string;
  department:         string;
  submission_type:    SubmissionType;
  description:        string;
  cause:              string | null;
  affects:            string | null;
  suggested_category: string | null;
  existing_controls:  string | null;
  suggested_action:   string | null;
  submitter_urgency:  SubmitterUrgency | null;
  attachment_url:     string | null;
  status:             TriageStatus;
  triaged_by:         string | null;
  triaged_at:         string | null;
  triage_note:        string | null;
  promoted_risk_id:   string | null;
  submitted_at:       string;
  submitter_ip:       string | null;
}

export interface TokenResolveResponse {
  label:      string;
  department: string;
}

export interface SubmissionTokenCreate {
  label:      string;
  department: string;
  expires_at: string | null;
}

export interface TriageMergePayload {
  target_risk_id: string;
  note:           string;
}

export interface TriageNotePayload {
  note: string;
}

export interface PromotePayload {
  category:        string;
  owner:           string;
  likelihood:      number;
  impact_score:    number;
  treatment:       string;
  controls:        string | null;
  mitigation_plan: string | null;
  target_date:     string | null;
  owner_email:     string | null;
}
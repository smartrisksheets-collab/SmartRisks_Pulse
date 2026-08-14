// src/types/external.ts

export interface ExternalRiskPayload {
  submitter_name:  string;
  submitter_email: string;
  department:      string;
  category:        string;
  description:     string;
  primary_impact:  string;
  likelihood:      number;
  impact_score:    number;
  treatment:       string;
  controls:        string;
  comments:        string;
}

export interface ExternalIncidentPayload {
  reported_by:      string;
  reporter_email:   string;
  date_reported:    string;
  channel:          string;
  description:      string;
  category:         string;
  incident_type:    string;
  severity:         string;
  business_unit:    string;
  incident_date:    string;
  incident_time:    string;
  affected_asset:   string;
  financial_impact: string;
  actions_taken:    string;
}

export interface ExternalSubmitResponse {
  id:     string;
  status: string;
}

export interface PendingSubmissionItem {
  id:              string;
  submission_type: 'risk' | 'incident';
  submitter_name:  string;
  submitter_email: string;
  submitted_at:    string;
  category:        string;
  description:     string;
  payload:         Record<string, unknown>;
}

export interface PendingListResponse {
  items: PendingSubmissionItem[];
  total: number;
}

export interface PendingCountResponse {
  count: number;
}
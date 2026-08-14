// src/types/brief.ts
// Types for the Risk Brief engine (Phase 10).
// Mirrors app/schemas/brief.py BriefPayload shape.

export interface SignalRow {
  type: string;
  exposure_delta?: number | null;
  exposure_driver?: string | null;
  failed_controls?: number | null;
  incident_count?: number | null;
  incident_area?: string | null;
}

export interface BriefTableRow {
  id: string;
  description: string;
  level?: string | null;
  delta?: number | null;
  days_logged?: number | null;
  days_since_review?: number | null;
  action?: string | null;
}

export interface BriefTables {
  volatile: BriefTableRow[];
  high_critical: BriefTableRow[];
  stale: BriefTableRow[];
}

export interface OutreachItem {
  owner_name: string;
  risk_id?: string | null;
  reason: string;
  message: string;
  mailto?: string | null;
}

export interface DailyException {
  is_empty: boolean;
  empty_message?: string | null;
  item_count: number;
}

export interface WeeklyDigest {
  health_wow: number;
  health_now: number;
  health_prev: number;
  top_movers_count: number;
  overdue_reviews_count: number;
  overdue_actions_count: number;
}

export interface BriefMeta {
  cadence_sections: string[];
  workspace_name: string;
  is_warming_up: boolean;
  generated_at: string;
}

export interface BriefPayload {
  ok: boolean;
  skip: boolean;
  reason?: string | null;
  reader?: { first_name: string; email: string } | null;
  meta?: BriefMeta | null;
  greeting?: string | null;
  residual_change_summary?: string | null;
  critical_count: number;
  signal_rows: SignalRow[];
  recommended_action?: string | null;
  tables?: BriefTables | null;
  outreach: OutreachItem[];
  daily_exception?: DailyException | null;
  weekly?: WeeklyDigest | null;
}

export interface SendTestBriefRequest {
  to_email: string;
}

export interface SendTestBriefResponse {
  ok: boolean;
  reason?: string | null;
}
// src/types/settings.ts

export interface SettingsData {
  // Identity
  name: string;
  organization: string;
  industry: string;
  framework: string;
  timezone: string;
  date_format: string;
  currency_symbol: string;
  logo_url: string | null;

  // Brand
  primary_color: string;
  accent_color: string;
  theme_mode: string;

  // Roles
  roles_default_role: string;
  roles_access_mode: string;
  perm_owner_risks: boolean;
  perm_mgr_risks: boolean;
  perm_analyst_risks: boolean;
  perm_owner_inc: boolean;
  perm_mgr_inc: boolean;
  perm_analyst_inc: boolean;
  perm_owner_ai: boolean;
  perm_mgr_ai: boolean;
  perm_analyst_ai: boolean;
  perm_owner_print: boolean;
  perm_mgr_print: boolean;
  perm_analyst_print: boolean;
  perm_owner_users: boolean;
  perm_mgr_users: boolean;
  perm_analyst_users: boolean;

  // AI
  ai_enabled: string;
  ai_model: string;
  ai_confidence: string;
  ai_auto_run: string;
  ai_policy: string;
  ai_policy_industry: string;
  ai_policy_tone: string;
  ai_policy_sensitivity: string;
  ai_policy_extra: string;

  // Alerts
  alert_high_threshold: number;
  alert_very_high_threshold: number;
  alert_incident_notify: string;
  alert_resolved_notify: string;
  alert_recipients: string;
  alert_digest: string;
  alert_digest_time: string;

  // Brief
  brief_enabled: string;
  brief_send_time: string;
  brief_recipients: string;
  brief_weekly_enabled: boolean;
  brief_monthly_enabled: boolean;
  brief_quarterly_enabled: boolean;
  brief_stale_threshold: number;
  brief_testing_interval: number;
  brief_outreach_cap: number;

  // Billing
  plan: string;
  plan_expires_at: string | null;
  modules: string[];
  max_risks: number;
  max_users: number;

  // PIN
  has_pin: boolean;
}

export type SettingsUpdate = Partial<
  Omit<SettingsData, "plan" | "plan_expires_at" | "modules" | "max_risks" | "max_users" | "has_pin">
>;

export interface AppetiteThreshold {
  id: string;
  tenant_id: string;
  category: string;
  threshold: number;
  rationale: string | null;
  set_by: string | null;
  set_at: string | null;
  updated_at: string | null;
}

export interface AppetiteThresholdUpsert {
  category: string;
  threshold: number;
  rationale?: string;
}

export interface NotificationPref {
  brief_frequency: string;
  opted_out: boolean;
}

export type NotificationPrefUpdate = Partial<NotificationPref>;
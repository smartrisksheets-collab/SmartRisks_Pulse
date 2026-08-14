export const MAX_RISKS = 1000;
export const RISK_WARNING_THRESHOLD = 0.8;
export const MAX_USERS = 25;
export const MAX_WORKSPACES_TRIAL = 1;
export const MAX_WORKSPACES_PAID = 3;
export const DEFAULT_CURRENCY = "₦";
export const MODULE_RISK = "risk";
export const MODULE_INCIDENT = "incident";
export const VALID_MODULES = ["risk", "incident"] as const;
export const DEFAULT_MODULES = ["risk"] as const;
export const ACTIVITY_FEED_CAP = 200;
export const RECYCLE_BIN_TTL_DAYS = 30;
export const PRESENCE_WINDOW_SECONDS = 110;
export const DEFAULT_ROLE = "Analyst";
export const DEFAULT_PLAN = "TRIAL";
export const TRIAL_DURATION_DAYS = 14;
export const PAID_DURATION_DAYS = 365;
export const EXPIRY_REMINDER_DAYS = 30;
export const ROLES = ['Owner', 'Manager', 'Analyst'] as const;
export const PLANS = ['TRIAL', 'PAID', 'EXPIRED'] as const;
export const INDUSTRIES = [
  'Banking', 'Insurance', 'Financial Services', 'Healthcare',
  'Energy', 'Manufacturing', 'Technology', 'Retail',
  'Logistics', 'Government', 'Education', 'Other',
] as const;
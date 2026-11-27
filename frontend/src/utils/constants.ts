export const MAX_RISKS = 1000;
// Rows per page on every table in the app. One rule, changed here only.
export const TABLE_PAGE_SIZE = 10;
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
// Display labels for the stored plan values. The stored value stays PAID; the screen shows PRO.
export const PLAN_LABELS: Record<(typeof PLANS)[number], string> = {
  TRIAL: 'TRIAL',
  PAID: 'PRO',
  EXPIRED: 'EXPIRED',
};
export function planLabel(plan: string | null | undefined): string {
  if (!plan) return PLAN_LABELS.TRIAL;
  const key = plan.toUpperCase();
  return key in PLAN_LABELS ? PLAN_LABELS[key as keyof typeof PLAN_LABELS] : plan;
}
// Shown in the profile menu when the account has no name on file. The email is never shown.
export const PROFILE_NAME_FALLBACK = 'My account';

export const MAILTO_QUOTE =
  'mailto:info@smartrisksheets.com' +
  '?subject=Request%20for%20SmartRisk%20Pulse%20Annual%20Plan%20Quote' +
  '&body=Hello%20SmartRisk%20Team%2C%0A%0A' +
  'I%20am%20interested%20in%20continuing%20with%20SmartRisk%20Pulse%20and%20would%20like%20to%20request%20a%20quote%20for%20the%20Annual%20Plan.%0A%0A' +
  'Please%20find%20my%20details%20below%3A%0A%0A' +
  'Organisation%20Name%3A%0A' +
  'Contact%20Name%3A%0A' +
  'Phone%20Number%3A%0A%0A' +
  'Kindly%20share%20the%20applicable%20annual%20subscription%20quote%20and%20next%20steps.%0A%0A' +
  'Thank%20you.';

export const MAILTO_DEMO =
  'mailto:info@smartrisksheets.com' +
  '?subject=Custom%20Demo%20Request%20%E2%80%94%20SmartRisk%20Pulse' +
  '&body=Hello%20SmartRisk%20Team%2C%0A%0A' +
  'I%20would%20like%20to%20book%20a%20custom%20demo%20of%20SmartRisk%20Pulse%20for%20my%20organisation.%0A%0A' +
  'Please%20find%20my%20details%20below%3A%0A%0A' +
  'Organisation%20Name%3A%0A' +
  'Contact%20Name%3A%0A' +
  'Phone%20Number%3A%0A' +
  'Preferred%20Date%2FTime%3A%0A%0A' +
  'I%20would%20like%20to%20see%20how%20SmartRisk%20Pulse%20can%20support%20our%20risk%20management%20processes%20and%20would%20be%20happy%20to%20discuss%20our%20specific%20requirements%20during%20the%20session.%0A%0A' +
  'Kindly%20confirm%20the%20next%20available%20demo%20slot.%0A%0A' +
  'Thank%20you.';

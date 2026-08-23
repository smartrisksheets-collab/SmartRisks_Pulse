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

export const WIZARD_INDUSTRIES = [
  { key: 'Finance',       icon: 'Building2'       },
  { key: 'Healthcare',    icon: 'Heart'            },
  { key: 'Oil & gas',    icon: 'Droplets'         },
  { key: 'Manufacturing', icon: 'Factory'          },
  { key: 'Technology',   icon: 'Cpu'              },
  { key: 'Government',   icon: 'Landmark'         },
  { key: 'Energy',       icon: 'Zap'              },
  { key: 'Other',        icon: 'MoreHorizontal'   },
] as const;

export const ORG_SIZES = ['1–10', '11–50', '51–200', '200+'] as const;

export const FRAMEWORKS = ['ISO 31000', 'NIST CSF', 'COSO ERM', 'COBIT', 'ISO 27001', 'Custom'] as const;

export const CURRENCIES = [
  { label: '₦ — Naira (NGN)',    value: '₦' },
  { label: '$ — US Dollar (USD)', value: '$' },
  { label: '£ — Pound (GBP)',     value: '£' },
  { label: '€ — Euro (EUR)',      value: '€' },
] as const;

export const TIMEZONES = [
  'Africa/Lagos',
  'UTC',
  'Europe/London',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'Europe/Paris',
  'Asia/Dubai',
  'Asia/Singapore',
  'Asia/Tokyo',
] as const;

export const DATE_FORMATS = ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'] as const;

export const WIZARD_BAND_ROWS = [
  { label: 'Low',      color: '#0d9668', range: '1–4'   },
  { label: 'Medium',   color: '#c9911f', range: '5–9'   },
  { label: 'High',     color: '#c0392b', range: '10–16' },
  { label: 'Critical', color: '#7a1f1f', range: '17–25' },
] as const;

// 5×5 heatmap cells, top-left = (L5,I1), rendered row by row (high likelihood first)
export const WIZARD_HEATMAP: string[] = [
  '#c9911f','#c0392b','#c0392b','#7a1f1f','#7a1f1f',
  '#0d9668','#c9911f','#c0392b','#c0392b','#7a1f1f',
  '#0d9668','#c9911f','#c9911f','#c0392b','#c0392b',
  '#0d9668','#0d9668','#c9911f','#c9911f','#c0392b',
  '#0d9668','#0d9668','#0d9668','#0d9668','#c9911f',
];

export const WIZARD_ROLES = ['Analyst', 'Manager', 'Owner'] as const;

export const WIZARD_CATEGORY_EXAMPLES = [
  'Credit', 'Compliance', 'Operational', 'Cybersecurity',
  'Liquidity', 'Vendor / Third-party', 'Reputational', 'Legal',
] as const;
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

export const WIZARD_CATEGORY_EXAMPLES = [
  'Credit', 'Compliance', 'Operational', 'Cybersecurity',
  'Liquidity', 'Vendor / Third-party', 'Reputational', 'Legal',
] as const;
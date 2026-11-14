// src/utils/reportPresets.ts
// Report Builder configuration (UI step 7): section groups, built-in templates
// and reporting periods. Dates are built from local calendar parts, never from
// toISOString(), so a quarter start in Lagos (UTC+1) stays on the 1st.

import type { AIStatus, BlockKey, DateRange, PeriodPreset, ReportPeriod } from '../types/report';

export interface SectionGroup {
  name: string;
  keys: BlockKey[];
}

export const SECTION_GROUPS: SectionGroup[] = [
  {
    name: 'Executive',
    keys: ['executive-dashboard', 'ai-exec-summary', 'exposure-index', 'top-risks', 'appetite-breaches',
           'decisions-needed', 'key-risk-changes', 'risk-snapshot'],
  },
  {
    name: 'Risk detail',
    keys: ['risk-heat-map', 'risk-distribution', 'control-evidence', 'risk-ownership', 'top-emerging-risks',
           'exposure-trend', 'residual-risk-trend'],
  },
  {
    name: 'Incidents',
    keys: ['incident-stability', 'incident-analytics', 'major-incidents', 'risk-incident-correlation', 'incident-trend'],
  },
  {
    name: 'Appendix',
    keys: ['findings', 'recommendations', 'conclusion', 'methodology'],
  },
];

export const INCIDENT_BLOCK_KEYS = new Set<BlockKey>([
  'incident-stability', 'incident-trend', 'major-incidents', 'incident-analytics', 'risk-incident-correlation',
]);

export interface BuiltinTemplate {
  id:     string;
  name:   string;
  blocks: BlockKey[];
}

export const BUILTIN_PREFIX = 'builtin:';

export const BUILTIN_TEMPLATES: BuiltinTemplate[] = [
  {
    id: 'builtin:monthly', name: 'Monthly risk report',
    blocks: ['ai-exec-summary', 'exposure-index', 'top-risks', 'appetite-breaches', 'incident-stability',
             'risk-incident-correlation'],
  },
  {
    id: 'builtin:board', name: 'Board pack',
    blocks: ['executive-dashboard', 'ai-exec-summary', 'exposure-index', 'appetite-breaches', 'decisions-needed',
             'risk-heat-map', 'exposure-trend', 'recommendations'],
  },
  {
    id: 'builtin:incident', name: 'Incident review',
    blocks: ['incident-stability', 'incident-analytics', 'major-incidents', 'incident-trend',
             'risk-incident-correlation', 'control-evidence'],
  },
  { id: 'builtin:blank', name: 'Blank report', blocks: [] },
];

export const DEFAULT_TEMPLATE_ID = 'builtin:monthly';
export const DEFAULT_BLOCKS: BlockKey[] = BUILTIN_TEMPLATES[0].blocks;

export const PERIOD_OPTIONS: { value: PeriodPreset; label: string }[] = [
  { value: 'last_30',         label: 'Last 30 days' },
  { value: 'quarter_to_date', label: 'Quarter to date' },
  { value: 'last_quarter',    label: 'Last quarter' },
  { value: 'last_6_months',   label: 'Last 6 months' },
  { value: 'last_12_months',  label: 'Last 12 months' },
  { value: 'custom',          label: 'Custom dates' },
];

export const DEFAULT_PERIOD: ReportPeriod = { preset: 'last_30', date_from: null, date_to: null };

export const FOOTER_OPTIONS = ['Confidential', 'Internal', 'Public'];

const pad = (n: number): string => String(n).padStart(2, '0');

/** YYYY-MM-DD from local calendar parts. */
export function toIsoDay(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local date from YYYY-MM-DD, or null. new Date('YYYY-MM-DD') would parse as UTC. */
export function fromIsoDay(s: string | null | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s ?? '');
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.getMonth() === Number(m[2]) - 1 ? d : null;
}

/** Same day n months earlier, clamped to the month's last day (31 Aug minus 6 months is 28 or 29 Feb). */
function monthsBack(today: Date, n: number): Date {
  const first = new Date(today.getFullYear(), today.getMonth() - n, 1);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return new Date(first.getFullYear(), first.getMonth(), Math.min(today.getDate(), last));
}

/** The date range a period covers. Custom dates come back as typed; customError checks them. */
export function periodRange(period: ReportPeriod, today: Date = new Date()): DateRange {
  const to = toIsoDay(today);
  const qStart = Math.floor(today.getMonth() / 3) * 3;
  switch (period.preset) {
    case 'quarter_to_date':
      return { date_from: toIsoDay(new Date(today.getFullYear(), qStart, 1)), date_to: to };
    case 'last_quarter':
      return {
        date_from: toIsoDay(new Date(today.getFullYear(), qStart - 3, 1)),
        date_to:   toIsoDay(new Date(today.getFullYear(), qStart, 0)),
      };
    case 'last_6_months':
      return { date_from: toIsoDay(monthsBack(today, 6)), date_to: to };
    case 'last_12_months':
      return { date_from: toIsoDay(monthsBack(today, 12)), date_to: to };
    case 'custom':
      return { date_from: period.date_from || null, date_to: period.date_to || to };
    default: {
      const from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 30);
      return { date_from: toIsoDay(from), date_to: to };
    }
  }
}

/** Why custom dates cannot be used, or '' when they can. */
export function customError(period: ReportPeriod, today: Date = new Date()): string {
  if (period.preset !== 'custom') return '';
  const from = fromIsoDay(period.date_from);
  const to = period.date_to ? fromIsoDay(period.date_to) : today;
  if (!from) return 'Choose a start date.';
  if (!to) return 'Choose a valid end date.';
  if (from > to) return 'The start date must be on or before the end date.';
  return '';
}

/** "1 Oct 2026 to 14 Nov 2026" for the cover preview. */
export function periodText(range: DateRange): string {
  const fmt = (s: string | null): string => {
    const d = fromIsoDay(s);
    return d ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  };
  return [fmt(range.date_from), fmt(range.date_to)].filter(Boolean).join(' to ');
}

/** Chip class for a risk band by its position (label-agnostic, works with custom band names). */
export function levelChipClass(levelIndex: number): string {
  if (levelIndex >= 4) return 'pl-sev-x';
  if (levelIndex === 3) return 'pl-sev-h';
  if (levelIndex === 2) return 'pl-sev-m';
  return 'pl-sev-l';
}

/** Heat map cell class by band position 1 to 5. */
export function heatCellClass(bandIndex: number): string {
  return `pl-rb-hm-b${Math.min(5, Math.max(1, bandIndex))}`;
}

export const AI_STATUS_TEXT: Record<AIStatus, { text: string; cls: string }> = {
  not_included: { text: 'not included',        cls: 'pl-tag' },
  not_written:  { text: 'not written yet',     cls: 'pl-tag' },
  draft:        { text: 'draft, not reviewed', cls: 'pl-chip pl-sev-m' },
  reviewed:     { text: 'reviewed',            cls: 'pl-chip pl-ok' },
};

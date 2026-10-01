// src/utils/riskExport.ts
// Column registry, CSV builder and per-workspace column memory for the register export.

import type { Risk } from '../types/risk';

export type ExportScope = 'all' | 'filtered' | 'selected';
type Cell = string | number | null;

export interface ExportColumn { key: string; label: string; default: boolean; get: (r: Risk) => Cell; }

function field(key: keyof Risk, label: string, isDefault = false): ExportColumn {
  return {
    key, label, default: isDefault,
    get: r => { const v = r[key]; return typeof v === 'boolean' ? (v ? 'Yes' : 'No') : v; },
  };
}

// Fixed order. Labels for importable fields match the import auto-map so an export re-imports cleanly.
export const EXPORT_COLUMNS: ExportColumn[] = [
  field('id', 'Risk ID', true),
  field('logged_at', 'Date Logged', true),
  field('category', 'Category', true),
  field('description', 'Description', true),
  field('primary_impact', 'Primary Impact'),
  field('owner', 'Owner', true),
  field('owner_email', 'Owner Email'),
  field('source', 'Source', true),
  field('likelihood', 'Likelihood'),
  field('impact_score', 'Impact Score'),
  field('severity', 'Severity', true),
  field('level', 'Level', true),
  field('is_elevated', 'Elevated'),
  field('treatment', 'Treatment', true),
  field('controls', 'Existing Controls'),
  field('control_effectiveness', 'Control Effectiveness'),
  field('control_last_tested', 'Control Last Tested'),
  field('control_test_result', 'Control Test Result'),
  field('control_assertion_source', 'Control Assertion Source'),
  field('control_freshness', 'Control Freshness'),
  { key: 'residual', label: 'Residual', default: true, get: r => (r.residual != null ? Math.round(r.residual) : null) },
  field('overall_rating', 'Overall Rating'),
  field('mitigation_plan', 'Mitigation Plan'),
  field('mitigation_status', 'Mitigation Status', true),
  field('target_date', 'Target Date'),
  field('root_cause', 'Root Cause'),
  field('financial_exposure', 'Financial Exposure'),
  field('linked_decision', 'Linked Decision'),
  field('comments', 'Comments'),
  field('ai_insight', 'AI Insight'),
  field('movement', 'Movement'),
  field('score_delta', 'Score Delta'),
  field('freshness', 'Freshness'),
  field('last_reviewed_at', 'Last Reviewed'),
  field('created_at', 'Created'),
  field('updated_at', 'Updated'),
];

const KNOWN = new Set(EXPORT_COLUMNS.map(c => c.key));
export const DEFAULT_EXPORT_COLUMNS = EXPORT_COLUMNS.filter(c => c.default).map(c => c.key);

// Leading = + - @ tab or CR makes spreadsheet apps evaluate the cell as a formula.
const FORMULA_START = /^[=+\-@\t\r]/;

function csvCell(v: Cell): string {
  if (v == null) return '';
  if (typeof v === 'number') return String(v);
  const safe = FORMULA_START.test(v) ? `'${v}` : v;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function buildRiskCsv(risks: Risk[], keys: string[]): string {
  const cols = EXPORT_COLUMNS.filter(c => keys.includes(c.key));
  const lines = [
    cols.map(c => csvCell(c.label)).join(','),
    ...risks.map(r => cols.map(c => csvCell(c.get(r))).join(',')),
  ];
  return '\uFEFF' + lines.join('\r\n');
}

export function downloadCsv(csv: string, filename: string): void {
  const href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = href; a.download = filename; a.click();
  URL.revokeObjectURL(href);
}

const KEY_PREFIX = 'sr-export-cols:';

export function loadExportColumns(tenantId: string | null): string[] {
  if (!tenantId) return DEFAULT_EXPORT_COLUMNS;
  try {
    const raw = localStorage.getItem(KEY_PREFIX + tenantId);
    if (!raw) return DEFAULT_EXPORT_COLUMNS;
    const keys = (JSON.parse(raw) as string[]).filter(k => KNOWN.has(k));
    return keys.length ? keys : DEFAULT_EXPORT_COLUMNS;
  } catch { return DEFAULT_EXPORT_COLUMNS; }
}

export function saveExportColumns(tenantId: string | null, keys: string[]): void {
  if (!tenantId) return;
  try { localStorage.setItem(KEY_PREFIX + tenantId, JSON.stringify(keys)); } catch { /* storage blocked */ }
}
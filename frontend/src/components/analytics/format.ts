// src/components/analytics/format.ts
// Chip colours and wording helpers for the Analytics tabs. They only choose how
// a backend value is shown; no figure is calculated here.

import type { HealthStatus, PressureLevel, PressureCategoryRow } from '../../types/dashboard';

export function healthChip(status: HealthStatus): string {
  if (status === 'Healthy') return 'pl-ok';
  if (status === 'Monitoring') return 'pl-sev-l';
  if (status === 'At Risk') return 'pl-sev-m';
  if (status === 'Critical') return 'pl-sev-x';
  return 'pl-tag';
}

export function pressureChip(level: PressureLevel): string {
  if (level === 'Elevated') return 'pl-sev-h';
  if (level === 'Moderate') return 'pl-sev-m';
  if (level === 'Low') return 'pl-ok';
  return 'pl-tag';
}

export function severityChip(severity: string | null | undefined): string {
  const s = (severity ?? '').toLowerCase();
  if (s === 'very high' || s === 'extreme' || s === 'critical') return 'pl-sev-x';
  if (s === 'high') return 'pl-sev-h';
  if (s === 'medium') return 'pl-sev-m';
  return 'pl-sev-l';
}

export function appetiteCell(row: PressureCategoryRow): { cls: string; text: string } {
  if (!row.covered) return { cls: 'pl-sev-x', text: 'No risk line' };
  if (row.exceeds > 0) return { cls: 'pl-sev-x', text: `${row.exceeds} exceed${row.exceeds === 1 ? 's' : ''}` };
  if (row.near > 0) return { cls: 'pl-sev-m', text: `${row.near} near` };
  if (!row.threshold_configured) return { cls: 'pl-tag', text: 'No threshold set' };
  return { cls: 'pl-ok', text: 'Within' };
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

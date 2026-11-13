// src/utils/riskDisplay.ts
// How register values are shown: chip classes and short labels. Every status
// (appetite, undecided, past target, band) comes from the backend; this file
// only picks the colour and words for it.

import type { Risk } from '../types/risk';

export interface ChipView { cls: string; text: string; }

/** Band chip by position from the top band, so renamed or 4/5-band matrices keep their colours. */
export function levelChipClass(levelIndex: number | null | undefined, bandCount: number): string {
  const idx = levelIndex ?? 1;
  const fromTop = bandCount - idx;
  if (fromTop <= 0) return 'pl-sev-x';
  if (fromTop === 1) return 'pl-sev-h';
  if (idx <= 1) return 'pl-sev-l';
  return 'pl-sev-m';
}

export function appetiteChip(status: Risk['appetite_status'], hasCategory: boolean): ChipView {
  if (status === 'exceeds') return { cls: 'pl-chip pl-sev-x', text: 'Exceeds' };
  if (status === 'near') return { cls: 'pl-chip pl-sev-m', text: 'Near' };
  if (status === 'within') return { cls: 'pl-chip pl-ok', text: 'Within' };
  return { cls: 'pl-chip pl-sev-l', text: hasCategory ? 'No threshold' : 'No category' };
}

/** "Undecided" when the backend undecided rule applies, otherwise the stored treatment. */
export function decisionChip(r: Pick<Risk, 'is_undecided' | 'treatment'>): ChipView {
  if (r.is_undecided) return { cls: 'pl-chip pl-sev-m', text: 'Undecided' };
  return { cls: 'pl-tag', text: r.treatment ?? 'Not set' };
}

/** The one flag a row shows under its title, most urgent first. */
export function rowFlag(r: Pick<Risk, 'appetite_status' | 'is_past_target' | 'category'>): ChipView | null {
  if (r.appetite_status === 'exceeds') return { cls: 'pl-chip pl-sev-x', text: 'Outside appetite' };
  if (r.is_past_target) return { cls: 'pl-chip pl-sev-h', text: 'Past target date' };
  if (r.appetite_status === null && (r.category ?? '').trim()) return { cls: 'pl-tag', text: 'No threshold set' };
  return null;
}

export function freshnessClass(freshness: string | null | undefined): string {
  if (freshness === 'Fresh') return 'pl-rr-fresh';
  if (freshness === 'Aging') return 'pl-rr-aging';
  if (freshness === 'Stale') return 'pl-rr-stale';
  return 'pl-rr-unknown';
}

export function scoreText(v: number | null | undefined): string {
  return v == null ? '—' : v.toFixed(1);
}

/** Width of a residual bar or threshold marker, as a CSS percentage. */
export function pctOf(value: number | null | undefined, max: number): string {
  if (value == null || max <= 0) return '0%';
  return `${Math.max(0, Math.min(100, (value / max) * 100)).toFixed(1)}%`;
}

export type RegisterView = 'all' | 'exceeds' | 'elevated' | 'undecided' | 'past_target';

export const REGISTER_VIEWS: { key: RegisterView; label: (elevatedLabel: string) => string }[] = [
  { key: 'all',         label: () => 'All risks' },
  { key: 'exceeds',     label: () => 'Outside appetite' },
  { key: 'elevated',    label: l => l },
  { key: 'undecided',   label: () => 'Undecided' },
  { key: 'past_target', label: () => 'Past target date' },
];

export const REGISTER_PAGE_SIZE = 10;

export const ASSERTION_SOURCES = ['Self-assessed', 'Independently tested', 'External audit'] as const;

export const MITIGATION_STATUSES = ['Open', 'In Progress', 'Closed', 'Accepted'] as const;

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

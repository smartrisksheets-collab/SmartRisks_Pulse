// src/utils/format.ts
// Shared display formatters. Non-component helpers live here, never in
// component files, so Fast Refresh is not broken by mixed exports.

/** Renders an ISO date as "15 May 2026". Returns an em dash for empty input. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Prefixes the workspace currency symbol onto a free-text exposure value.
 *
 * financial_exposure is a TEXT column, so real values include plain figures
 * ("251000"), figures with a rate ("100,000 per day") and deliberate
 * non-answers ("Unknown"). Only a leading number is formatted; any trailing
 * text is preserved and anything that does not start with a digit is returned
 * untouched.
 */
export function formatExposure(value: string | null | undefined, symbol: string): string {
  if (!value) return '';
  const raw = value.trim();
  if (!raw) return '';
  const m = raw.match(/^([\d,]+(?:\.\d+)?)(.*)$/);
  if (!m) return raw;
  const amount = Number(m[1].replace(/,/g, ''));
  if (Number.isNaN(amount)) return raw;
  return `${symbol}${amount.toLocaleString()}${m[2]}`;
}

/** Compact money for stat cards: 2.5M, 340k, 900. */
export function formatMoneyCompact(value: string | number | null | undefined, symbol: string): string {
  const n = typeof value === 'number' ? value : parseFloat(value ?? '');
  if (Number.isNaN(n)) return `${symbol}0`;
  if (n >= 1_000_000) return `${symbol}${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `${symbol}${(n / 1_000).toFixed(0)}k`;
  return `${symbol}${n.toLocaleString()}`;
}
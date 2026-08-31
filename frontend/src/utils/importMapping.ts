// src/utils/importMapping.ts
// Remembers the last successful import column mapping per workspace.

const KEY_PREFIX = 'sr-import-map:';

export function loadImportMapping(
  tenantId: string | null | undefined,
  headers: string[],
): Record<string, string> | null {
  if (!tenantId) return null;
  try {
    const raw = localStorage.getItem(KEY_PREFIX + tenantId);
    if (!raw) return null;
    const saved = JSON.parse(raw) as Record<string, string>;
    const cols = Object.values(saved);
    if (!cols.length) return null;
    // Only restore when every remembered column exists in this file, otherwise
    // the saved mapping belongs to a different spreadsheet shape.
    const present = new Set(headers);
    if (!cols.every((c) => present.has(c))) return null;
    return saved;
  } catch {
    return null;
  }
}

export function saveImportMapping(
  tenantId: string | null | undefined,
  mapping: Record<string, string>,
): void {
  if (!tenantId) return;
  try {
    localStorage.setItem(KEY_PREFIX + tenantId, JSON.stringify(mapping));
  } catch {
    // Storage full, disabled, or private mode. The mapping simply is not remembered.
  }
}
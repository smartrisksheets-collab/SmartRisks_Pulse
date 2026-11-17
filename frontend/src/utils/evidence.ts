// src/utils/evidence.ts
// Limits and helpers for a risk's evidence document. The backend checks the
// file again by its content; these checks only give a quick answer in the form.

export const EVIDENCE_MAX_BYTES = 10 * 1024 * 1024;
export const EVIDENCE_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'] as const;
export const EVIDENCE_ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp';
export const EVIDENCE_TYPES_TEXT = 'PDF, PNG, JPEG or WebP, up to 10 MB';

const EXTENSIONS = ['pdf', 'png', 'jpg', 'jpeg', 'webp'];

/** An error message for a file the backend would refuse, or '' when it looks fine. */
export function checkEvidenceFile(file: File): string {
  if (file.size === 0) return 'The file is empty.';
  if (file.size > EVIDENCE_MAX_BYTES) return 'Evidence must be 10 MB or smaller.';
  const ext = (file.name.split('.').pop() ?? '').toLowerCase();
  const typeOk = (EVIDENCE_TYPES as readonly string[]).includes(file.type);
  if (!typeOk && !EXTENSIONS.includes(ext)) return 'Evidence must be a PDF, PNG, JPEG or WebP file.';
  return '';
}

/** The file's type, falling back to its extension when the browser gives none. */
export function evidenceMime(file: File): string {
  if (file.type) return file.type;
  const ext = (file.name.split('.').pop() ?? '').toLowerCase();
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  return 'image/jpeg';
}

export function isPdf(mime: string | null | undefined): boolean {
  return mime === 'application/pdf';
}

export function formatBytes(n: number | null | undefined): string {
  if (n == null) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

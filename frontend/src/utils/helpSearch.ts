import type { Permissions } from '../types/api';
import type { HelpEntry } from '../types/help';

export const HELP_STARTERS = [
  'risk-appetite', 'residual-risk', 'enterprise-risk-health', 'submission-link', 'report-builder',
] as const;
export const HELP_SUPPORT_EMAIL = 'info@smartrisksheets.com';
export const HELP_NO_RESULTS_DELAY_MS = 700;
export const HELP_POP_WIDTH = 310;
export const HELP_POP_GUTTER = 16;
export const HELP_SHORTCUT_LABEL =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘K' : 'Ctrl K';

const PERMISSION_LABELS: Record<keyof Permissions, string> = {
  manage_risks:     'Manage Risks',
  manage_incidents: 'Manage Incidents',
  review_resolve:   'Review & Resolve',
  generate_ai:      'Generate AI',
  print_reports:    'Print Reports',
  manage_users:     'Manage Users',
  manage_settings:  'Manage Settings',
};

export function canAct(entry: HelpEntry, perms: Permissions | null): boolean {
  return entry.requires === null || perms?.[entry.requires] === true;
}

export function lockedNote(entry: HelpEntry): string | null {
  if (entry.requires === null) return null;
  return `Changing this needs the ${PERMISSION_LABELS[entry.requires]} permission. Your workspace Admin can grant it.`;
}

export function starterEntries(entries: HelpEntry[]): HelpEntry[] {
  return HELP_STARTERS
    .map(id => entries.find(e => e.id === id))
    .filter((e): e is HelpEntry => e !== undefined);
}

/** Palette search. Title beats keywords beats body, so exact names win. */
export function searchHelp(entries: HelpEntry[], query: string, limit = 8): HelpEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return entries
    .map(e => {
      const title = e.title.toLowerCase();
      let score = 0;
      if (title === q) score += 100;
      else if (title.startsWith(q)) score += 60;
      else if (title.includes(q)) score += 40;
      if (e.keywords.some(k => k === q)) score += 50;
      else if (e.keywords.some(k => k.startsWith(q))) score += 30;
      else if (e.keywords.some(k => k.includes(q))) score += 15;
      if (e.what.toLowerCase().includes(q)) score += 8;
      if (e.how?.toLowerCase().includes(q)) score += 4;
      return { e, score };
    })
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(r => r.e);
}
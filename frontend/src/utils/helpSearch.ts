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

// ── Search ────────────────────────────────────────────────────────────────
// People type questions ("how do I add a risk"), not titles. The query is split
// into words, filler words are dropped, common synonyms are added, and a word
// one letter off still matches. Exact titles and keywords still rank first.
// Action words (add, edit, export) are kept: on their own they are the question,
// and next to a subject they lift the entry for that action above the rest.

/** Words that carry no meaning in a help question. */
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'how', 'do', 'does', 'did', 'i', 'we', 'you', 'my', 'our', 'me', 'can', 'could', 'should',
  'what', 'whats', 'is', 'are', 'was', 'where', 'why', 'when', 'which', 'who', 'to', 'of', 'in', 'on', 'for',
  'with', 'it', 'this', 'that', 'there', 'be', 'get', 'find', 'use', 'make', 'way', 'please', 'help', 'about',
  'and', 'or', 'if', 'at', 'by', 'from', 'up', 'out', 'into', 'want', 'need', 'some', 'any',
]);

/** Words people type, mapped to the words help entries use. */
const SYNONYMS: Record<string, string[]> = {
  add:         ['create', 'new', 'record', 'log'],
  create:      ['add', 'new'],
  new:         ['add', 'create'],
  record:      ['add', 'log'],
  change:      ['edit', 'update', 'modify'],
  changing:    ['edit', 'update', 'change'],
  edit:        ['update', 'change', 'modify'],
  update:      ['edit', 'change'],
  set:         ['settings', 'configure'],
  setup:       ['settings', 'get', 'started'],
  delete:      ['recycle', 'bin', 'remove'],
  remove:      ['delete', 'recycle'],
  restore:     ['recycle', 'bin'],
  undo:        ['recycle', 'restore'],
  kpi:         ['health', 'score', 'pressure'],
  dashboard:   ['health', 'insights', 'feed'],
  staff:       ['invite', 'users'],
  colleague:   ['invite', 'users'],
  team:        ['invite', 'users'],
  member:      ['invite', 'users'],
  access:      ['role', 'permission', 'invite'],
  permission:  ['role'],
  rights:      ['role', 'permission'],
  deadline:    ['sla', 'target'],
  due:         ['sla', 'target'],
  overdue:     ['sla', 'breach'],
  late:        ['sla', 'stale'],
  tolerance:   ['appetite'],
  licence:     ['billing', 'plan'],
  license:     ['billing', 'plan'],
  subscription:['billing', 'plan'],
  price:       ['billing', 'plan'],
  pricing:     ['billing', 'plan'],
  payment:     ['billing', 'plan'],
  upload:      ['import'],
  excel:       ['import', 'export', 'spreadsheet'],
  xlsx:        ['import', 'spreadsheet'],
  download:    ['export'],
  print:       ['export', 'report'],
  board:       ['report'],
  heatmap:     ['matrix'],
  heat:        ['matrix'],
  likelihood:  ['matrix', 'severity'],
  impact:      ['matrix', 'severity'],
  net:         ['residual'],
  gross:       ['severity', 'inherent'],
  inherent:    ['severity'],
  history:     ['audit'],
  changed:     ['audit', 'history'],
  modified:    ['audit', 'history'],
  trail:       ['audit'],
  email:       ['brief', 'invite'],
  notification:['brief'],
  alert:       ['brief', 'sla'],
  ai:          ['insights'],
  chatgpt:     ['ai', 'insights'],
  claude:      ['ai', 'insights'],
  colour:      ['color', 'theme', 'brand'],
  color:       ['colour', 'theme', 'brand'],
  organization:['organisation', 'workspace'],
  organisation:['organization', 'workspace'],
  company:     ['workspace'],
  code:        ['pin'],
  lock:        ['pin'],
  outdated:    ['stale'],
  old:         ['stale'],
  link:        ['linked', 'submission'],
  form:        ['submission'],
};

function words(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/[\s-]+/).filter(Boolean);
}

/** True when a and b differ by at most one edit (insert, delete or swap a letter). */
function oneEditApart(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

interface Indexed {
  e:        HelpEntry;
  title:    string;
  titleW:   string[];
  keywords: string[];
  keyW:     string[];
  what:     string;
  body:     string;
}

function index(e: HelpEntry): Indexed {
  const keywords = e.keywords.map(k => k.toLowerCase());
  return {
    e,
    title: e.title.toLowerCase(),
    titleW: words(e.title),
    keywords,
    keyW: keywords.flatMap(words),
    what: e.what.toLowerCase(),
    body: [e.how ?? '', ...(e.steps ?? [])].join(' ').toLowerCase(),
  };
}

function scoreWord(x: Indexed, w: string): number {
  if (x.titleW.includes(w)) return 30;
  if (x.keyW.includes(w)) return 25;
  if (x.titleW.some(t => t.startsWith(w)) && w.length >= 3) return 18;
  if (x.keyW.some(k => k.startsWith(w)) && w.length >= 3) return 14;
  if (x.what.includes(w)) return 6;
  if (x.body.includes(w)) return 3;
  if (w.length >= 5 && (x.titleW.some(t => oneEditApart(w, t)) || x.keyW.some(k => oneEditApart(w, k)))) return 12;
  return 0;
}

/** Ask Pulse search. Whole-phrase matches first, then entries matching the most words. */
export function searchHelp(entries: HelpEntry[], query: string, limit = 8): HelpEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const all = words(q);
  const terms = all.filter(w => !STOP_WORDS.has(w));
  // A question made only of filler words ("how do I") matches nothing.
  if (terms.length === 0) return [];
  const meaningful = terms;

  return entries
    .map(index)
    .map(x => {
      let score = 0;
      // Whole phrase: an exact title or keyword still wins outright.
      if (x.title === q) score += 100;
      else if (x.title.startsWith(q)) score += 60;
      else if (x.title.includes(q)) score += 40;
      if (x.keywords.includes(q)) score += 50;
      else if (x.keywords.some(k => k.includes(q))) score += 15;

      // Word by word, with synonyms at a lower weight.
      let matched = 0;
      for (const w of meaningful) {
        let best = scoreWord(x, w);
        for (const s of SYNONYMS[w] ?? []) best = Math.max(best, Math.round(scoreWord(x, s) * 0.6));
        if (best > 0) matched++;
        score += best;
      }
      // Favour entries that match every word the person typed.
      if (meaningful.length > 1) score = Math.round(score * (0.5 + 0.5 * (matched / meaningful.length)));
      return { e: x.e, score };
    })
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(r => r.e);
}
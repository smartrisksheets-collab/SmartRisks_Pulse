// src/utils/triageDraft.ts

export type TriageDraftAction = 'promote' | 'merge' | 'reroute' | 'close';

export interface TriageDraft {
  action: TriageDraftAction;
  note: string;
  mergeSelected: { id: string; description: string; category: string | null } | null;
  promote: {
    category: string; owner: string; ownerEmail: string; likelihood: string; impact: string;
    treatment: string; controls: string; plan: string; targetDate: string;
  };
}

const PREFIX = 'sr-triage-draft:';
const draftKey = (tenantId: string, subId: string) => `${PREFIX}${tenantId}:${subId}`;

export function loadTriageDraft(tenantId: string | null, subId: string): TriageDraft | null {
  if (!tenantId) return null;
  try {
    const raw = localStorage.getItem(draftKey(tenantId, subId));
    return raw ? (JSON.parse(raw) as TriageDraft) : null;
  } catch { return null; }
}

export function saveTriageDraft(tenantId: string | null, subId: string, draft: TriageDraft): void {
  if (!tenantId) return;
  try { localStorage.setItem(draftKey(tenantId, subId), JSON.stringify(draft)); } catch { /* storage full or blocked */ }
}

export function clearTriageDraft(tenantId: string | null, subId: string): void {
  if (!tenantId) return;
  try { localStorage.removeItem(draftKey(tenantId, subId)); } catch { /* storage blocked */ }
}

export function hasTriageDraft(tenantId: string | null, subId: string): boolean {
  if (!tenantId) return false;
  try { return localStorage.getItem(draftKey(tenantId, subId)) !== null; } catch { return false; }
}

/** Removes drafts for submissions no longer in the pending queue. */
export function pruneTriageDrafts(tenantId: string | null, liveIds: string[]): void {
  if (!tenantId) return;
  try {
    const live = new Set(liveIds.map(id => draftKey(tenantId, id)));
    const prefix = `${PREFIX}${tenantId}:`;
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix) && !live.has(k)) localStorage.removeItem(k);
    }
  } catch { /* storage blocked */ }
}
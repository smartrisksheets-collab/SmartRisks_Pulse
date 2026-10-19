import { apiGet, apiPost } from './api';
import type { HelpEntry, HelpEvent } from '../types/help';

export function getHelpEntries(): Promise<HelpEntry[]> {
  return apiGet<HelpEntry[]>('/api/v1/help');
}

/** Fire-and-forget. A failed log must never affect the user. */
export function logHelpEvent(body: HelpEvent): void {
  apiPost<{ ok: boolean }>('/api/v1/help/events', body).catch(() => undefined);
}
import type { Permissions } from './api';

export type HelpGroup = 'Dashboard' | 'Risk register' | 'Incidents' | 'Reports' | 'Settings' | 'Methodology';

export interface HelpEntry {
  id:       string;
  title:    string;
  what:     string;
  how:      string | null;
  where:    string | null;
  route:    string | null;
  requires: keyof Permissions | null;
  keywords: string[];
  group:    HelpGroup;
}

export type HelpEvent =
  | { event: 'open'; entry_id: string }
  | { event: 'no_results' | 'contact'; query: string };
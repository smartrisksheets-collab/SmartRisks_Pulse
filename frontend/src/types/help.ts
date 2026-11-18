import type { Permissions } from './api';

export type HelpGroup =
  | 'Getting started' | 'Dashboard' | 'Risk register' | 'Incidents' | 'Reports'
  | 'Users & access' | 'Settings' | 'Methodology';

/** concept: what a term means · how-to: steps · page: what a screen is for · setting: what a tab controls */
export type HelpKind = 'concept' | 'how-to' | 'page' | 'setting';

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
  kind:     HelpKind;
  steps:    string[];
  module:   'risk' | 'incident' | null;
  related:  string[];
}

export type HelpEvent =
  | { event: 'open'; entry_id: string }
  | { event: 'no_results' | 'contact'; query: string };

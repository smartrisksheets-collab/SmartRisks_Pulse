// Response of GET /api/v1/home. Every figure and sentence is built by the backend.
import type { ActivityEntry, IncidentFeedEntry, RecommendedAction, UnifiedBrief } from './dashboard';

export interface HomeTile {
  value: number | null;
  status: string | null;
  note: string;
}

export interface HomeTiles {
  health: HomeTile;
  outside_appetite: HomeTile;
  open_incidents: HomeTile;
  open_high: number;
  open_actions: HomeTile;
}

export type HomeTargetKind = 'risk' | 'risks' | 'incident' | 'incidents' | 'category' | 'none';

export interface HomeAction extends RecommendedAction {
  target_kind: HomeTargetKind;
}

export interface HomeRiskRow {
  id: string;
  title: string | null;
  level: string | null;
  residual: number | null;
  tags: string[];
}

export interface HomeIncidentRow {
  id: string;
  title: string | null;
  severity: string | null;
  status: string | null;
  tags: string[];
}

export interface HomeSetup {
  appetite: boolean;
  risks: boolean;
  incidents: boolean;
  team: boolean;
  first_run: boolean;
}

export interface HomeData {
  first_name: string | null;
  workspace: string;
  status: string;
  confidence: string;
  verdict: string;
  focus: { kind: 'risk' | 'incident'; id: string } | null;
  tiles: HomeTiles;
  actions: HomeAction[];
  actions_total: number;
  top_risks: HomeRiskRow[];
  open_incidents: HomeIncidentRow[];
  activity_feed: ActivityEntry[];
  incident_feed: IncidentFeedEntry[];
  brief: UnifiedBrief | null;
  setup: HomeSetup;
}

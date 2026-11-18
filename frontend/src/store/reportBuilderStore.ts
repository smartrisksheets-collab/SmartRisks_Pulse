// src/store/reportBuilderStore.ts
// Report Builder state, kept across page navigation (no persist middleware).
// The server draft (migration 065) is what survives a reload.

import { create } from 'zustand';
import type { BlockKey, BlockDataMap, ReportPeriod, ReportSettings } from '../types/report';
import { DEFAULT_SETTINGS } from '../types/report';
import { DEFAULT_BLOCKS, DEFAULT_PERIOD, DEFAULT_TEMPLATE_ID } from '../utils/reportPresets';

export interface ReportBuilderState {
  activeBlocks: BlockKey[];
  settings:     ReportSettings;
  blockData:    BlockDataMap;
  aiData:       Record<string, string>;
  aiReviewed:   string[];
  period:       ReportPeriod;
  template:     string;
  dataKey:      string;          // the period blockData was computed for
  draftSavedAt: string | null;
  hydrated:     boolean;         // server draft or saved settings already applied this session
  tenantId:     string | null;   // workspace this state belongs to; a switch starts afresh
}

interface ReportBuilderStore extends ReportBuilderState {
  sync:  (patch: Partial<ReportBuilderState>) => void;
  reset: () => void;
}

export const initialReportState = (): ReportBuilderState => ({
  activeBlocks: [...DEFAULT_BLOCKS],
  settings:     { ...DEFAULT_SETTINGS, signoff: { ...DEFAULT_SETTINGS.signoff } },
  blockData:    {},
  aiData:       {},
  aiReviewed:   [],
  period:       { ...DEFAULT_PERIOD },
  template:     DEFAULT_TEMPLATE_ID,
  dataKey:      '',
  draftSavedAt: null,
  hydrated:     false,
  tenantId:     null,
});

export const useReportBuilderStore = create<ReportBuilderStore>()((set) => ({
  ...initialReportState(),
  sync:  (patch) => set((s) => ({ ...s, ...patch })),
  reset: ()      => set((s) => ({ ...initialReportState(), hydrated: true, tenantId: s.tenantId })),
}));

// src/store/reportBuilderStore.ts

import { create } from 'zustand';
import type { BlockKey, ReportSettings, BuildStep } from '../types/report';
import { DEFAULT_SETTINGS } from '../types/report';

const DEFAULT_BLOCKS: BlockKey[] = ['executive-dashboard', 'top-risks'];

import type { BlockDataMap } from '../types/report';

interface ReportBuilderStore {
  activeBlocks: BlockKey[];
  settings:     ReportSettings;
  step:         BuildStep;
  blockData:    BlockDataMap;
  aiData:       Record<string, string>;
  sync: (patch: {
    activeBlocks?: BlockKey[];
    settings?:     ReportSettings;
    step?:         BuildStep;
    blockData?:    BlockDataMap;
    aiData?:       Record<string, string>;
  }) => void;
  reset: () => void;
}

export const useReportBuilderStore = create<ReportBuilderStore>()((set) => ({
  activeBlocks: [...DEFAULT_BLOCKS],
  settings:     { ...DEFAULT_SETTINGS },
  step:         1 as BuildStep,
  blockData:    {},
  aiData:       {},
  sync:  (patch) => set((s) => ({ ...s, ...patch })),
  reset: ()      => set({
    activeBlocks: [...DEFAULT_BLOCKS],
    settings:     { ...DEFAULT_SETTINGS },
    step:         1 as BuildStep,
    blockData:    {},
    aiData:       {},
  }),
}));
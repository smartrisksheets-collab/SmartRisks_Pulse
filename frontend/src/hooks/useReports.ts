// src/hooks/useReports.ts

import { useState, useCallback } from 'react';
import * as reportsApi from '../services/reports';
import type {
  BlockKey,
  BlockDataMap,
  ReportSettings,
  ReportTemplate,
  DateRange,
  BuildStep,
} from '../types/report';
import { DEFAULT_SETTINGS as DEFAULTS } from '../types/report';

export type ToastFn = (msg: string, type?: 'success' | 'error' | 'info') => void;

interface UseReportsState {
  // canvas
  activeBlocks:  BlockKey[];
  blockData:     BlockDataMap;
  aiData:        Record<string, string>;
  settings:      ReportSettings;
  step:          BuildStep;

  // loading flags
  previewing:    boolean;
  generatingAI:  boolean;
  exporting:     boolean;

  // templates
  templates:     ReportTemplate[];
  loadingTpls:   boolean;
}

const DEFAULT_BLOCKS: BlockKey[] = ['executive-dashboard', 'top-risks'];

export function useReports(toast: ToastFn) {
  const [state, setState] = useState<UseReportsState>({
    activeBlocks: DEFAULT_BLOCKS,
    blockData:    {},
    aiData:       {},
    settings:     { ...DEFAULTS },
    step:         1,
    previewing:   false,
    generatingAI: false,
    exporting:    false,
    templates:    [],
    loadingTpls:  false,
  });

  const set = (patch: Partial<UseReportsState>) =>
    setState((prev) => ({ ...prev, ...patch }));

  // ── Date range ─────────────────────────────────────────────────────────────

  const getRange = useCallback((
    preset: string,
    customFrom: string,
    customTo: string,
  ): DateRange => {
    const to = new Date();

    if (preset === 'custom') {
      const from = customFrom ? new Date(customFrom) : null;
      const customToDate = customTo ? new Date(customTo) : to;
      return {
        date_from: from ? from.toISOString() : null,
        date_to:   customToDate.toISOString(),
      };
    }

    const days = preset === 'Last 3 months'  ? 90
               : preset === 'Last 6 months'  ? 180
               : preset === 'Last 12 months' ? 365
               : 30;
    const from = new Date();
    from.setDate(from.getDate() - days);
    return { date_from: from.toISOString(), date_to: to.toISOString() };
  }, []);

  // ── Preview ────────────────────────────────────────────────────────────────

  const preview = useCallback(async (range: DateRange) => {
    if (state.previewing) return;
    set({ previewing: true });
    try {
      const result = await reportsApi.previewReport(state.activeBlocks, range);
      set({
        blockData: result.block_data,
        aiData:    {},
        step:      2,
        previewing: false,
      });
      toast('Preview ready — add AI narrative or export directly', 'success');
    } catch (err) {
      set({ previewing: false });
      toast(err instanceof Error ? err.message : 'Preview failed', 'error');
    }
  }, [state.previewing, state.activeBlocks, toast]);

  // ── AI narrative ───────────────────────────────────────────────────────────

  const AI_BLOCKS: BlockKey[] = [
    'ai-exec-summary', 'executive-commentary', 'top-risks',
    'top-emerging-risks', 'major-incidents', 'recommendations', 'executive-dashboard',
  ];

  const generateAI = useCallback(async (range: DateRange) => {
    if (state.generatingAI) return;
    const aiBlocks = state.activeBlocks.filter((b) => AI_BLOCKS.includes(b));
    if (!aiBlocks.length) {
      toast('No AI-capable blocks on the canvas', 'info');
      return;
    }
    set({ generatingAI: true });
    try {
      const aiData = await reportsApi.generateAINarrative(aiBlocks, range);
      const clean: Record<string, string> = {};
      for (const [k, v] of Object.entries(aiData)) {
        if (v) clean[k] = v;
      }
      set({ aiData: clean, step: 3, generatingAI: false });
      toast('AI narrative generated — review, edit if needed, then export', 'success');
    } catch (err) {
      set({ generatingAI: false });
      toast(err instanceof Error ? err.message : 'AI generation failed', 'error');
    }
  }, [state.generatingAI, state.activeBlocks, toast]);

  // ── Export PDF ─────────────────────────────────────────────────────────────

  const exportPDF = useCallback(async (range: DateRange, mode: 'download' | 'email', emailTo?: string, emailSubject?: string) => {
    if (state.exporting) return;
    set({ exporting: true });
    try {
      if (mode === 'download') {
        const result = await reportsApi.exportReport({
          blocks:     state.activeBlocks,
          block_data: state.blockData,
          ai_data:    state.aiData as Record<string, string>,
          settings:   state.settings,
          date_from:  range.date_from,
          date_to:    range.date_to,
        });
        reportsApi.downloadPDF(result.pdf_base64, result.file_name);
        toast('Report downloaded', 'success');
      } else {
        if (!emailTo) throw new Error('Recipient email is required');
        await reportsApi.emailReport({
          blocks:     state.activeBlocks,
          block_data: state.blockData,
          ai_data:    state.aiData as Record<string, string>,
          settings:   state.settings,
          date_from:  range.date_from,
          date_to:    range.date_to,
          to:         emailTo,
          subject:    emailSubject || 'SmartRisk Report',
        });
        toast(`Report sent to ${emailTo}`, 'success');
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Export failed', 'error');
    } finally {
      set({ exporting: false });
    }
  }, [state, toast]);

  // ── Block canvas management ────────────────────────────────────────────────

  const addBlock = useCallback((key: BlockKey) => {
    if (state.activeBlocks.includes(key)) {
      toast(`${key} is already on the canvas`, 'info');
      return;
    }
    set({ activeBlocks: [...state.activeBlocks, key] });
  }, [state.activeBlocks, toast]);

  const removeBlock = useCallback((key: BlockKey) => {
    const next = { ...state.aiData };
    delete next[key];
    set({
      activeBlocks: state.activeBlocks.filter((b) => b !== key),
      aiData: next,
    });
  }, [state.activeBlocks, state.aiData]);

  const reorderBlocks = useCallback((ordered: BlockKey[]) => {
    set({ activeBlocks: ordered });
  }, []);

  // ── Settings ───────────────────────────────────────────────────────────────

  const updateSettings = useCallback((patch: Partial<ReportSettings>) => {
    set({ settings: { ...state.settings, ...patch } });
  }, [state.settings]);

  const updateSignoff = useCallback((patch: Partial<ReportSettings['signoff']>) => {
    set({ settings: { ...state.settings, signoff: { ...state.settings.signoff, ...patch } } });
  }, [state.settings]);

  // Auto-save settings (debounced in the page component via useEffect)
  const saveSettings = useCallback(async () => {
    try {
      await reportsApi.saveReportSettings(state.settings);
    } catch (e) {
      console.error('saveSettings failed:', e);
    }
  }, [state.settings]);

  const loadSavedSettings = useCallback(async () => {
    try {
      const saved = await reportsApi.getReportSettings();
      if (saved && Object.keys(saved).length) {
        set({ settings: { ...DEFAULTS, ...saved, signoff: { ...DEFAULTS.signoff, ...(saved.signoff || {}) } } });
      }
    } catch (e) {
      console.error('loadSavedSettings failed:', e);
    }
  }, []);

  // ── Narrative edits ────────────────────────────────────────────────────────
  // Allows the user to edit AI-generated or computed narratives inline.

  const updateNarrative = useCallback((blockKey: string, value: string) => {
    set({ aiData: { ...state.aiData, [blockKey]: value } });
  }, [state.aiData]);

  // ── Templates ──────────────────────────────────────────────────────────────

  const loadTemplates = useCallback(async () => {
    set({ loadingTpls: true });
    try {
      const tpls = await reportsApi.listTemplates();
      set({ templates: tpls, loadingTpls: false });
    } catch {
      set({ loadingTpls: false });
    }
  }, []);

  const saveTemplate = useCallback(async (name: string, description: string) => {
    try {
      await reportsApi.saveTemplate({
        name, description,
        report_type: '',
        blocks:   state.activeBlocks,
        settings: state.settings,
      });
      toast('Template saved', 'success');
      await loadTemplates();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not save template', 'error');
    }
  }, [state.activeBlocks, state.settings, loadTemplates, toast]);

  const applyTemplate = useCallback(async (templateId: string) => {
    try {
      const tpl = await reportsApi.getTemplate(templateId);
      set({
        activeBlocks: tpl.blocks as BlockKey[],
        settings: { ...DEFAULTS, ...tpl.settings, signoff: { ...DEFAULTS.signoff, ...(tpl.settings?.signoff || {}) } },
        blockData: {},
        aiData:    {},
        step:      1,
      });
      toast('Template applied — click Preview & Edit to load live data', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not load template', 'error');
    }
  }, [toast]);

  const deleteTemplate = useCallback(async (templateId: string) => {
    try {
      await reportsApi.deleteTemplate(templateId);
      toast('Template deleted', 'success');
      await loadTemplates();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not delete template', 'error');
    }
  }, [loadTemplates, toast]);

  const setDefaultTemplate = useCallback(async (templateId: string, reportType: string) => {
    try {
      await reportsApi.setDefaultTemplate(templateId, reportType);
      toast('Default template updated', 'success');
      await loadTemplates();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not set default', 'error');
    }
  }, [loadTemplates, toast]);

  return {
    ...state,
    // actions
    preview,
    generateAI,
    exportPDF,
    addBlock,
    removeBlock,
    reorderBlocks,
    updateSettings,
    updateSignoff,
    saveSettings,
    loadSavedSettings,
    updateNarrative,
    loadTemplates,
    saveTemplate,
    applyTemplate,
    deleteTemplate,
    setDefaultTemplate,
    getRange,
  };
}
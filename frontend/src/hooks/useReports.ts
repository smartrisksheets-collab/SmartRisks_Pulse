// src/hooks/useReports.ts
// Report Builder state and actions (UI step 7). State lives in reportBuilderStore so it
// survives navigation; the server draft (migration 065) survives a reload. Figures load
// per section as sections are added, so AI text already written is never thrown away
// by adding a section.

import { useCallback, useEffect, useRef, useState } from 'react';
import * as reportsApi from '../services/reports';
import { useReportBuilderStore, initialReportState } from '../store/reportBuilderStore';
import { useAuthStore } from '../store/authStore';
import { useToast } from './useToast';
import type {
  AIStatus,
  BlockKey,
  ExportFormat,
  ReportDraft,
  ReportPeriod,
  ReportSettings,
  ReportTemplate,
} from '../types/report';
import { AI_BLOCKS, BLOCK_LABELS, DEFAULT_SETTINGS } from '../types/report';
import {
  BUILTIN_PREFIX, BUILTIN_TEMPLATES, INCIDENT_BLOCK_KEYS, customError, periodRange,
} from '../utils/reportPresets';

const KNOWN_BLOCKS = new Set<string>(Object.keys(BLOCK_LABELS));

function mergeSettings(saved: Partial<ReportSettings> | null | undefined): ReportSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...(saved ?? {}),
    signoff: { ...DEFAULT_SETTINGS.signoff, ...(saved?.signoff ?? {}) },
  };
}

/** Sections whose AI text is written but not yet reviewed. */
export function unreviewedKeys(activeBlocks: BlockKey[], aiData: Record<string, string>, aiReviewed: string[]): BlockKey[] {
  return activeBlocks.filter(k => AI_BLOCKS.has(k) && !!aiData[k] && !aiReviewed.includes(k));
}

export function aiStatusOf(activeBlocks: BlockKey[], aiData: Record<string, string>, aiReviewed: string[]): AIStatus {
  const aiKeys = activeBlocks.filter(k => AI_BLOCKS.has(k));
  if (!aiKeys.length) return 'not_included';
  if (!aiKeys.some(k => aiData[k])) return 'not_written';
  return unreviewedKeys(activeBlocks, aiData, aiReviewed).length ? 'draft' : 'reviewed';
}

export function useReports() {
  const toast = useToast();
  const st = useReportBuilderStore();
  const tenantId = useAuthStore(s => s.claims?.active_tenant_id ?? null);
  const modules = useAuthStore(s => s.claims?.modules);
  const hasIncident = (modules ?? []).includes('incident');

  const [loadingKeys, setLoadingKeys] = useState<BlockKey[]>([]);
  const [generating, setGenerating]   = useState<BlockKey[]>([]);
  const [exporting, setExporting]     = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [templates, setTemplates]     = useState<ReportTemplate[]>([]);
  const inflight    = useRef(new Set<string>());
  const replacing   = useRef('');
  const hydrating   = useRef(false);

  const allowed = useCallback(
    (keys: string[]): BlockKey[] => keys.filter(
      (k): k is BlockKey => KNOWN_BLOCKS.has(k) && (hasIncident || !INCIDENT_BLOCK_KEYS.has(k as BlockKey)),
    ),
    [hasIncident],
  );

  const periodError = customError(st.period);
  const range = periodRange(st.period);
  const rangeKey = periodError ? '' : JSON.stringify(range);

  // ── Figures ──────────────────────────────────────────────────────────────

  const fetchBlocks = useCallback(async (keys: BlockKey[], replace: boolean) => {
    const s = useReportBuilderStore.getState();
    if (customError(s.period) || !keys.length) return;
    const r = periodRange(s.period);
    const key = JSON.stringify(r);
    keys.forEach(k => inflight.current.add(k));
    if (replace) replacing.current = key;
    setLoadingKeys(prev => Array.from(new Set([...prev, ...keys])));
    try {
      const res = await reportsApi.previewReport(keys, r);
      const cur = useReportBuilderStore.getState();
      if (JSON.stringify(periodRange(cur.period)) !== key) return;   // the period changed meanwhile
      cur.sync({
        blockData: replace ? res.block_data : { ...cur.blockData, ...res.block_data },
        dataKey: key,
      });
      const failed = Object.keys(res.errors ?? {});
      if (failed.length) toast(`Could not load: ${failed.map(k => BLOCK_LABELS[k as BlockKey] ?? k).join(', ')}`, 'error');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not load the figures', 'error');
    } finally {
      keys.forEach(k => inflight.current.delete(k));
      if (replace && replacing.current === key) replacing.current = '';
      setLoadingKeys(prev => prev.filter(k => !keys.includes(k)));
    }
  }, [toast]);

  // Load figures for the current period, then for each section as it is added.
  useEffect(() => {
    if (!st.hydrated || !rangeKey) return;
    if (st.dataKey !== rangeKey) {
      if (replacing.current !== rangeKey) void fetchBlocks(st.activeBlocks, true);
      return;
    }
    const missing = st.activeBlocks.filter(k => !(k in st.blockData) && !inflight.current.has(k));
    if (missing.length) void fetchBlocks(missing, false);
  }, [st.hydrated, rangeKey, st.dataKey, st.activeBlocks, st.blockData, fetchBlocks]);

  // ── First load: the person's draft, else the workspace's saved report details ──

  useEffect(() => {
    if (hydrating.current) return;
    const s = useReportBuilderStore.getState();
    if (s.hydrated && s.tenantId === tenantId) return;
    hydrating.current = true;
    (async () => {
      let next = { ...initialReportState(), tenantId, hydrated: true };
      try {
        const draft = await reportsApi.getDraft();
        if (draft) {
          const blocks = allowed(draft.blocks);
          next = {
            ...next,
            activeBlocks: blocks,
            settings:     mergeSettings(draft.settings),
            aiData:       Object.fromEntries(Object.entries(draft.ai_data ?? {}).filter(([k]) => blocks.includes(k as BlockKey))),
            aiReviewed:   (draft.ai_reviewed ?? []).filter(k => blocks.includes(k as BlockKey)),
            period:       draft.period ?? next.period,
            template:     draft.template ?? '',
            draftSavedAt: draft.updated_at ?? null,
          };
        } else {
          next = { ...next, activeBlocks: allowed(next.activeBlocks), settings: mergeSettings(await reportsApi.getReportSettings()) };
        }
      } catch (err) {
        toast(err instanceof Error ? err.message : 'Could not load your saved report', 'error');
      } finally {
        useReportBuilderStore.getState().sync(next);
        hydrating.current = false;
      }
    })();
  }, [tenantId, allowed, toast]);

  // Report details stay the workspace default for the next report (existing behaviour).
  const settingsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!st.hydrated) return;
    if (settingsTimer.current) clearTimeout(settingsTimer.current);
    const snapshot = st.settings;
    settingsTimer.current = setTimeout(() => {
      reportsApi.saveReportSettings(snapshot).catch(() => { /* the draft keeps them too */ });
    }, 1200);
    return () => { if (settingsTimer.current) clearTimeout(settingsTimer.current); };
  }, [st.hydrated, st.settings]);

  // ── Sections ─────────────────────────────────────────────────────────────

  const addBlock = useCallback((key: BlockKey) => {
    const s = useReportBuilderStore.getState();
    if (s.activeBlocks.includes(key)) return;
    s.sync({ activeBlocks: [...s.activeBlocks, key] });
  }, []);

  const removeBlock = useCallback((key: BlockKey) => {
    const s = useReportBuilderStore.getState();
    const aiData = { ...s.aiData };
    delete aiData[key];
    s.sync({
      activeBlocks: s.activeBlocks.filter(b => b !== key),
      aiData,
      aiReviewed: s.aiReviewed.filter(k => k !== key),
    });
  }, []);

  const moveBlock = useCallback((key: BlockKey, dir: -1 | 1) => {
    const s = useReportBuilderStore.getState();
    const a = [...s.activeBlocks];
    const i = a.indexOf(key);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= a.length) return;
    [a[i], a[j]] = [a[j], a[i]];
    s.sync({ activeBlocks: a });
  }, []);

  const setPeriod = useCallback((period: ReportPeriod, clearAI: boolean) => {
    useReportBuilderStore.getState().sync(clearAI ? { period, aiData: {}, aiReviewed: [] } : { period });
  }, []);

  const updateSettings = useCallback((patch: Partial<ReportSettings>) => {
    const s = useReportBuilderStore.getState();
    s.sync({ settings: { ...s.settings, ...patch } });
  }, []);

  const updateSignoff = useCallback((patch: Partial<ReportSettings['signoff']>) => {
    const s = useReportBuilderStore.getState();
    s.sync({ settings: { ...s.settings, signoff: { ...s.settings.signoff, ...patch } } });
  }, []);

  // ── AI narrative and review ──────────────────────────────────────────────

  const generateAI = useCallback(async (keys?: BlockKey[]) => {
    const s = useReportBuilderStore.getState();
    const target = (keys ?? s.activeBlocks).filter(k => AI_BLOCKS.has(k) && s.activeBlocks.includes(k));
    if (!target.length) { toast('No section in this report takes AI text', 'info'); return; }
    if (customError(s.period)) { toast(customError(s.period), 'error'); return; }
    setGenerating(target);
    try {
      const ai = await reportsApi.generateAINarrative(target, periodRange(s.period));
      const cur = useReportBuilderStore.getState();
      const aiData = { ...cur.aiData };
      for (const k of target) {
        const v = ai[k];
        if (v) aiData[k] = v; else delete aiData[k];
      }
      cur.sync({ aiData, aiReviewed: cur.aiReviewed.filter(k => !target.includes(k as BlockKey)) });
      toast('AI text written. Review it before you share the report.', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'AI generation failed', 'error');
    } finally {
      setGenerating([]);
    }
  }, [toast]);

  const setReviewed = useCallback((key: string, reviewed: boolean) => {
    const s = useReportBuilderStore.getState();
    const rest = s.aiReviewed.filter(k => k !== key);
    s.sync({ aiReviewed: reviewed ? [...rest, key] : rest });
  }, []);

  /** Text saved in Review and Edit counts as reviewed. */
  const updateNarrative = useCallback((key: string, value: string) => {
    const s = useReportBuilderStore.getState();
    s.sync({
      aiData: { ...s.aiData, [key]: value },
      aiReviewed: [...s.aiReviewed.filter(k => k !== key), key],
    });
  }, []);

  // ── Export ───────────────────────────────────────────────────────────────

  const exportReport = useCallback(async (
    mode: 'download' | 'email', format: ExportFormat = 'pdf',
    email?: { to: string; cc: string[]; subject: string },
  ) => {
    const s = useReportBuilderStore.getState();
    if (customError(s.period)) { toast(customError(s.period), 'error'); return; }
    const r = periodRange(s.period);
    const base = {
      blocks: s.activeBlocks, block_data: s.blockData, ai_data: s.aiData,
      settings: s.settings, date_from: r.date_from, date_to: r.date_to,
    };
    setExporting(true);
    try {
      if (mode === 'download') {
        const res = await reportsApi.exportReport({ ...base, format });
        reportsApi.downloadFile(res.file_base64, res.file_name, res.mime_type);
        toast(format === 'pptx' ? 'PowerPoint downloaded' : 'PDF downloaded', 'success');
      } else if (email) {
        await reportsApi.emailReport({ ...base, to: email.to, cc: email.cc, subject: email.subject || 'SmartRisk Report' });
        toast(`Report sent to ${email.to}${email.cc.length ? ` and ${email.cc.length} CC` : ''}`, 'success');
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Export failed', 'error');
    } finally {
      setExporting(false);
    }
  }, [toast]);

  // ── Draft ────────────────────────────────────────────────────────────────

  const saveDraft = useCallback(async () => {
    const s = useReportBuilderStore.getState();
    const draft: ReportDraft = {
      blocks: s.activeBlocks, settings: s.settings, ai_data: s.aiData,
      ai_reviewed: s.aiReviewed, period: s.period, template: s.template,
    };
    setSavingDraft(true);
    try {
      const saved = await reportsApi.saveDraft(draft);
      useReportBuilderStore.getState().sync({ draftSavedAt: saved.updated_at ?? new Date().toISOString() });
      toast('Draft saved', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not save the draft', 'error');
    } finally {
      setSavingDraft(false);
    }
  }, [toast]);

  const newReport = useCallback(async () => {
    try {
      await reportsApi.deleteDraft();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not discard the saved draft', 'error');
      return;
    }
    const s = useReportBuilderStore.getState();
    s.reset();
    useReportBuilderStore.getState().sync({ activeBlocks: allowed(initialReportState().activeBlocks), settings: s.settings });
  }, [allowed, toast]);

  // ── Templates ────────────────────────────────────────────────────────────

  const loadTemplates = useCallback(async () => {
    try {
      setTemplates(await reportsApi.listTemplates());
    } catch { /* the select still offers the built-in templates */ }
  }, []);

  useEffect(() => {
    let live = true;
    reportsApi.listTemplates()
      .then((t) => { if (live) setTemplates(t); })
      .catch(() => { /* the select still offers the built-in templates */ });
    return () => { live = false; };
  }, [tenantId]);

  const applyTemplate = useCallback(async (id: string) => {
    try {
      if (id.startsWith(BUILTIN_PREFIX)) {
        const t = BUILTIN_TEMPLATES.find(b => b.id === id);
        if (!t) return;
        useReportBuilderStore.getState().sync({ activeBlocks: allowed(t.blocks), template: id, aiData: {}, aiReviewed: [] });
      } else {
        const t = await reportsApi.getTemplate(id);
        const cur = useReportBuilderStore.getState();
        cur.sync({
          activeBlocks: allowed(t.blocks),
          settings: mergeSettings({ ...cur.settings, ...t.settings }),
          template: id, aiData: {}, aiReviewed: [],
        });
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not load the template', 'error');
    }
  }, [allowed, toast]);

  const saveTemplate = useCallback(async (name: string, description: string) => {
    const s = useReportBuilderStore.getState();
    try {
      const res = await reportsApi.saveTemplate({ name, description, report_type: '', blocks: s.activeBlocks, settings: s.settings });
      useReportBuilderStore.getState().sync({ template: res.template_id });
      toast('Template saved', 'success');
      await loadTemplates();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not save the template', 'error');
    }
  }, [loadTemplates, toast]);

  const deleteTemplate = useCallback(async (id: string) => {
    try {
      await reportsApi.deleteTemplate(id);
      const s = useReportBuilderStore.getState();
      if (s.template === id) s.sync({ template: '' });
      toast('Template deleted', 'success');
      await loadTemplates();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not delete the template', 'error');
    }
  }, [loadTemplates, toast]);

  const setDefaultTemplate = useCallback(async (id: string, reportType: string) => {
    try {
      await reportsApi.setDefaultTemplate(id, reportType);
      toast('Default template updated', 'success');
      await loadTemplates();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not set the default', 'error');
    }
  }, [loadTemplates, toast]);

  return {
    ...st,
    range,
    periodError,
    hasIncident,
    loadingKeys,
    generating,
    exporting,
    savingDraft,
    templates,
    aiStatus: aiStatusOf(st.activeBlocks, st.aiData, st.aiReviewed),
    unreviewed: unreviewedKeys(st.activeBlocks, st.aiData, st.aiReviewed),
    addBlock, removeBlock, moveBlock, setPeriod, updateSettings, updateSignoff,
    generateAI, setReviewed, updateNarrative, exportReport,
    saveDraft, newReport,
    applyTemplate, saveTemplate, deleteTemplate, setDefaultTemplate,
  };
}

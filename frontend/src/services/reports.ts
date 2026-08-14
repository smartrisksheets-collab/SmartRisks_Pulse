// src/services/reports.ts

import { apiGet, apiPost, apiDelete } from './api';
import type {
  BlockKey,
  BlockDataMap,
  ReportSettings,
  DateRange,
  ReportTemplate,
} from '../types/report';

// ── Preview ────────────────────────────────────────────────────────────────────

export async function previewReport(
  blocks: BlockKey[],
  range: DateRange,
): Promise<{ block_data: BlockDataMap; errors: Record<string, string>; meta: Record<string, unknown> }> {
  return apiPost<{ block_data: BlockDataMap; errors: Record<string, string>; meta: Record<string, unknown> }>(
    '/api/v1/reports/preview',
    { blocks, date_from: range.date_from, date_to: range.date_to },
  );
}

// ── AI narrative ───────────────────────────────────────────────────────────────

export async function generateAINarrative(
  blocks: BlockKey[],
  range: DateRange,
): Promise<Record<string, string | null>> {
  const res = await apiPost<{ ai_data: Record<string, string | null> }>(
    '/api/v1/reports/ai-narrative',
    { blocks, date_from: range.date_from, date_to: range.date_to },
  );
  return res.ai_data;
}

// ── Export PDF ─────────────────────────────────────────────────────────────────

export async function exportReport(payload: {
  blocks:      BlockKey[];
  block_data:  BlockDataMap;
  ai_data:     Record<string, string>;
  settings:    ReportSettings;
  date_from:   string | null;
  date_to:     string;
  orientation?: string;
}): Promise<{ pdf_base64: string; file_name: string }> {
  return apiPost<{ pdf_base64: string; file_name: string }>(
    '/api/v1/reports/export',
    payload,
  );
}

// ── Email report ───────────────────────────────────────────────────────────────

export async function emailReport(payload: {
  blocks:     BlockKey[];
  block_data: BlockDataMap;
  ai_data:    Record<string, string>;
  settings:   ReportSettings;
  date_from:  string | null;
  date_to:    string;
  to:         string;
  subject:    string;
}): Promise<void> {
  await apiPost('/api/v1/reports/email', payload);
}

// ── Templates ──────────────────────────────────────────────────────────────────

export async function listTemplates(): Promise<ReportTemplate[]> {
  const res = await apiGet<{ templates: ReportTemplate[] }>('/api/v1/reports/templates');
  return res.templates;
}

export async function saveTemplate(payload: {
  name:        string;
  description: string;
  report_type: string;
  blocks:      BlockKey[];
  settings:    Partial<ReportSettings>;
}): Promise<{ template_id: string }> {
  return apiPost<{ template_id: string }>('/api/v1/reports/templates', payload);
}

export async function getTemplate(templateId: string): Promise<ReportTemplate> {
  const res = await apiGet<{ template: ReportTemplate }>(
    `/api/v1/reports/templates/${templateId}`,
  );
  return res.template;
}

export async function deleteTemplate(templateId: string): Promise<void> {
  await apiDelete(`/api/v1/reports/templates/${templateId}`);
}

export async function setDefaultTemplate(templateId: string, reportType: string): Promise<void> {
  await apiPost(`/api/v1/reports/templates/${templateId}/default`, { report_type: reportType });
}

// ── Report settings ────────────────────────────────────────────────────────────

export async function getReportSettings(): Promise<Partial<ReportSettings>> {
  const res = await apiGet<{ settings: Partial<ReportSettings> }>('/api/v1/reports/settings');
  return res.settings;
}

export async function saveReportSettings(settings: ReportSettings): Promise<void> {
  await apiPost('/api/v1/reports/settings', { settings });
}

// ── Download helper ────────────────────────────────────────────────────────────

export function downloadPDF(base64: string, fileName: string): void {
  const bytes  = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const blob   = new Blob([bytes], { type: 'application/pdf' });
  const url    = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href     = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
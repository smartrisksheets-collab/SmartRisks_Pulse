// src/utils/incidentDisplay.ts
// How incident values are shown, and the log form's values and checks.
// Every stage, target, link state and count comes from the backend; this file
// only picks the colour and the words for it.

import type { ChipView } from './riskDisplay';
import type { Incident, IncidentCreate, IncidentRow, IncidentStage } from '../types/incident';
import { INCIDENT_TITLE_MAX } from '../types/incident';

// ── Quick views ──────────────────────────────────────────────────────────────

export type IncidentView = 'open' | 'unlinked' | 'high' | 'resolved' | 'all';

export const INCIDENT_VIEWS: { key: IncidentView; label: (highLabel: string) => string }[] = [
  { key: 'open',     label: () => 'Open' },
  { key: 'unlinked', label: () => 'Open with no risk' },
  { key: 'high',     label: l => l },
  { key: 'resolved', label: () => 'Resolved' },
  { key: 'all',      label: () => 'All' },
];

export const INCIDENT_PAGE_SIZE = 10;

// ── Chips ────────────────────────────────────────────────────────────────────

/** Severity chip by the level's position in the workspace's configured order (0 = most severe). */
export function severityChipClass(rank: number | undefined, levelCount: number): string {
  if (rank === undefined) return 'pl-tag';
  if (rank === 0) return 'pl-sev-x';
  if (rank === 1) return 'pl-sev-h';
  if (rank >= levelCount - 1) return 'pl-sev-l';
  return 'pl-sev-m';
}

export function stageChipClass(status: string | null | undefined): string {
  if (status === 'New') return 'pl-st-new';
  if (status === 'Resolved' || status === 'Closed') return 'pl-st-done';
  return 'pl-st-prog';
}

export function targetChip(r: Pick<IncidentRow, 'target_state' | 'target_text'>): ChipView {
  if (r.target_state === 'missed') return { cls: 'pl-in-target pl-in-missed', text: r.target_text };
  if (r.target_state === 'due_today') return { cls: 'pl-in-target pl-in-today', text: r.target_text };
  if (r.target_state === 'met') return { cls: 'pl-in-target pl-in-met', text: r.target_text };
  return { cls: 'pl-in-target', text: r.target_text };
}

export function linkChip(r: Pick<IncidentRow, 'link_state' | 'linked_risk_id' | 'is_open'>): ChipView {
  if (r.link_state === 'linked') return { cls: 'pl-tag', text: r.linked_risk_id ?? '' };
  if (r.link_state === 'uncovered') return { cls: r.is_open ? 'pl-chip pl-sev-h' : 'pl-tag', text: 'No risk line' };
  return { cls: r.is_open ? 'pl-chip pl-sev-m' : 'pl-tag', text: 'Not linked' };
}

// ── Labels for stored values ─────────────────────────────────────────────────

/** Control outcome: stored value, label and the help line under it (merged list, 13 Nov 2026). */
export const CONTROL_OUTCOMES: { value: string; label: string; help: string }[] = [
  { value: 'control_held',             label: 'Held',            help: 'It limited the damage' },
  { value: 'control_partially_worked', label: 'Partly failed',   help: 'It helped, not enough' },
  { value: 'control_failed',           label: 'Failed',          help: 'It did not work' },
  { value: 'control_was_bypassed',     label: 'Bypassed',        help: 'It was worked around' },
  { value: 'control_not_applicable',   label: 'Not applicable',  help: 'It does not cover this' },
  { value: 'no_control_existed',       label: 'No control',      help: 'Nothing was in place' },
  { value: 'not_known',                label: 'Not known',       help: 'Still being checked' },
];

export function controlOutcomeLabel(value: string | null | undefined): string {
  return CONTROL_OUTCOMES.find(o => o.value === value)?.label ?? 'not recorded';
}

/** How sure the cost figure is. Stored values stay as they were. */
export const IMPACT_CONFIDENCE: { value: string; label: string }[] = [
  { value: 'Unknown',   label: 'Not known yet' },
  { value: 'Estimated', label: 'Estimated' },
  { value: 'Confirmed', label: 'Confirmed' },
];

export function confidenceLabel(value: string | null | undefined): string {
  return IMPACT_CONFIDENCE.find(o => o.value === value)?.label ?? 'Not known yet';
}

export const REPORT_CHANNELS = ['Phone or in person', 'Email', 'Reporting link', 'System alert', 'Customer complaint'] as const;

// ── Form ─────────────────────────────────────────────────────────────────────

export interface IncidentFormValues {
  title:              string;
  description:        string;
  category:           string;
  affected_asset:     string;
  business_unit:      string;
  severity:           string;
  occurred_date:      string;
  occurred_time:      string;
  reported_at:        string;
  reported_by:        string;
  channel:            string;
  reporter_email:     string;
  linked_risk_id:     string;
  control_outcome:    string;
  immediate_actions:  string;
  assigned_to:        string;
  financial_impact:   string;
  impact_confidence:  string;
  status:             IncidentStage;
  resolution_summary: string;
}

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function emptyIncidentForm(defaultSeverity: string): IncidentFormValues {
  const today = todayIso();
  return {
    title: '', description: '', category: '', affected_asset: '', business_unit: '',
    severity: defaultSeverity, occurred_date: today, occurred_time: '', reported_at: today,
    reported_by: '', channel: REPORT_CHANNELS[0], reporter_email: '',
    linked_risk_id: '', control_outcome: '', immediate_actions: '', assigned_to: '',
    financial_impact: '', impact_confidence: 'Unknown', status: 'New', resolution_summary: '',
  };
}

export function formFromIncident(i: Incident): IncidentFormValues {
  // incident_dt is stored in UTC; the form shows the same date and time it was entered with.
  const dt = i.incident_dt ?? '';
  return {
    title:              i.title ?? '',
    description:        i.description ?? '',
    category:           i.category ?? '',
    affected_asset:     i.affected_asset ?? '',
    business_unit:      i.business_unit ?? '',
    severity:           i.severity ?? '',
    occurred_date:      dt ? dt.slice(0, 10) : '',
    occurred_time:      dt && dt.slice(11, 16) !== '00:00' ? dt.slice(11, 16) : '',
    reported_at:        i.reported_at ?? '',
    reported_by:        i.reported_by ?? '',
    channel:            i.channel ?? '',
    reporter_email:     i.reporter_email ?? '',
    linked_risk_id:     i.linked_risk_id ?? '',
    control_outcome:    i.control_outcome ?? '',
    immediate_actions:  i.immediate_actions ?? '',
    assigned_to:        i.assigned_to ?? '',
    financial_impact:   i.financial_impact == null ? '' : String(Number(i.financial_impact)),
    impact_confidence:  i.impact_confidence ?? 'Unknown',
    status:             (i.status ?? 'New') as IncidentStage,
    resolution_summary: i.resolution_summary ?? '',
  };
}

export type IncidentFieldKey =
  'title' | 'description' | 'category' | 'severity' | 'occurred_date' | 'reported_at'
  | 'reported_by' | 'reporter_email' | 'assigned_to' | 'financial_impact';
export type IncidentFieldErrors = Partial<Record<IncidentFieldKey, string>>;

export const INCIDENT_FIELD_ORDER: IncidentFieldKey[] = [
  'title', 'description', 'category', 'severity', 'occurred_date', 'reported_at',
  'reported_by', 'reporter_email', 'assigned_to', 'financial_impact',
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MONEY_RE = /^\d+(\.\d{1,2})?$/;

export function moneyDigits(v: string): string {
  return v.replace(/[,\s]/g, '');
}

export function validateIncidentForm(v: IncidentFormValues, today: string): IncidentFieldErrors {
  const e: IncidentFieldErrors = {};
  const title = v.title.trim();
  if (!title) e.title = 'Give the incident a short title.';
  else if (title.length > INCIDENT_TITLE_MAX) e.title = `Keep the title to ${INCIDENT_TITLE_MAX} characters.`;
  if (!v.description.trim()) e.description = 'Say what happened.';
  if (!v.category) e.category = 'Choose a category.';
  if (!v.severity) e.severity = 'Choose a severity.';
  if (!v.occurred_date) e.occurred_date = 'Enter the date it happened.';
  else if (v.occurred_date > today) e.occurred_date = 'The date it happened cannot be in the future.';
  if (!v.reported_at) e.reported_at = 'Enter the date it was reported.';
  else if (v.reported_at > today) e.reported_at = 'The date reported cannot be in the future.';
  else if (v.occurred_date && v.reported_at < v.occurred_date) e.reported_at = 'It cannot be reported before it happened.';
  if (!v.reported_by.trim()) e.reported_by = 'Say who reported it.';
  if (v.reporter_email.trim() && !EMAIL_RE.test(v.reporter_email.trim())) e.reporter_email = 'Enter a valid email address.';
  if (!v.assigned_to.trim()) e.assigned_to = 'Choose who owns the response.';
  const money = moneyDigits(v.financial_impact);
  if (money && !MONEY_RE.test(money)) e.financial_impact = 'Enter an amount in numbers, for example 4200000.';
  return e;
}

/** Payload for create and update. Cleared optional fields send null so an edit really clears them. */
export function incidentPayload(v: IncidentFormValues, isEdit: boolean): IncidentCreate {
  const linked = v.linked_risk_id || null;
  const payload: IncidentCreate = {
    title:             v.title.trim(),
    description:       v.description.trim(),
    category:          v.category,
    severity:          v.severity,
    reported_by:       v.reported_by.trim(),
    reported_at:       v.reported_at,
    incident_dt:       v.occurred_date ? `${v.occurred_date}T${v.occurred_time || '00:00'}:00Z` : null,
    affected_asset:    v.affected_asset.trim() || null,
    business_unit:     v.business_unit.trim() || null,
    channel:           v.channel || null,
    reporter_email:    v.reporter_email.trim() || null,
    linked_risk_id:    linked,
    control_outcome:   linked ? (v.control_outcome || null) : null,
    immediate_actions: v.immediate_actions.trim() || null,
    assigned_to:       v.assigned_to.trim(),
    financial_impact:  moneyDigits(v.financial_impact) || null,
    impact_confidence: v.impact_confidence || null,
  };
  if (isEdit) {
    payload.status = v.status;
    payload.resolution_summary = v.resolution_summary.trim() || null;
  }
  return payload;
}

// ── AI insight text ──────────────────────────────────────────────────────────

/**
 * The page-insight prompt bolds numbers with <strong>. The text also carries
 * incident titles, so it is never injected as HTML: split it into plain parts
 * and drop any other tag.
 */
export function insightParts(text: string): { text: string; bold: boolean }[] {
  return text
    .split(/(<strong>[\s\S]*?<\/strong>)/g)
    .filter(Boolean)
    .map(p => {
      const bold = p.startsWith('<strong>') && p.endsWith('</strong>');
      return { text: (bold ? p.slice(8, -9) : p).replace(/<[^>]*>/g, ''), bold };
    })
    .filter(p => p.text);
}

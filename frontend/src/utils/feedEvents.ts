// src/utils/feedEvents.ts
// Wording, tiers and badges for Operational Feed events. Shared by the Risk tab,
// the Incident tab and the merged All view, so every surface describes an event the same way.

import type { ActivityEntry, IncidentFeedEntry } from '../types/dashboard';

export type FeedTier = 'critical' | 'escalated' | 'monitoring' | 'improving' | 'informational';

export interface FeedEventConfig {
  tier: FeedTier;
  badge: string;
}

export interface FeedNarrative {
  lead: string;
  body: string;
}

export type FeedItem =
  | { kind: 'risk'; at: string; key: string; entry: ActivityEntry }
  | { kind: 'incident'; at: string; key: string; entry: IncidentFeedEntry };

// ── Shared ────────────────────────────────────────────────────────────────────

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function inCategory(category: string | null | undefined): string {
  return category ? ` in ${category}` : '';
}

export function mergeFeed(risks: ActivityEntry[], incidents: IncidentFeedEntry[]): FeedItem[] {
  const items: FeedItem[] = [
    ...risks.map(e => ({ kind: 'risk' as const, at: e.created_at, key: `r-${e.id}`, entry: e })),
    ...incidents.map(e => ({ kind: 'incident' as const, at: e.created_at, key: `i-${e.id}`, entry: e })),
  ];
  return items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

// ── Risk events ───────────────────────────────────────────────────────────────

const RISK_CONFIG: Record<string, FeedEventConfig> = {
  score_change_up:   { tier: 'escalated',     badge: 'Exposure Increased'  },
  score_change_down: { tier: 'improving',     badge: 'Exposure Reduced'    },
  score_change:      { tier: 'monitoring',    badge: 'Score Updated'       },
  owner_change:      { tier: 'informational', badge: 'Ownership Updated'   },
  mitigation_update: { tier: 'monitoring',    badge: 'Under Review'        },
  escalated:         { tier: 'critical',      badge: 'Escalated'           },
  risk_created:      { tier: 'monitoring',    badge: 'High Risk Added'     },
  risk_updated:      { tier: 'informational', badge: 'Risk Updated'        },
  ext_submitted:     { tier: 'monitoring',    badge: 'External Submission' },
  ext_approved:      { tier: 'improving',     badge: 'Approved'            },
  ext_returned:      { tier: 'escalated',     badge: 'Returned for Review' },
  risk_deleted:      { tier: 'informational', badge: 'Risk Deleted'        },
};

export const RISK_ACTION_LABELS: Record<string, string> = {
  score_change:      'Score Change',
  owner_change:      'Owner Change',
  mitigation_update: 'Mitigation Update',
  escalated:         'Escalated',
  risk_created:      'New Risk',
  risk_updated:      'Updated',
  ext_submitted:     'External Submission',
  ext_approved:      'Approved to Register',
  ext_returned:      'Returned for Review',
};

export function riskEventConfig(item: ActivityEntry): FeedEventConfig {
  if (item.action_type === 'score_change') {
    const o = item.old_value, n = item.new_value;
    if (o !== null && n !== null) {
      return n > o ? RISK_CONFIG.score_change_up : RISK_CONFIG.score_change_down;
    }
  }
  return RISK_CONFIG[item.action_type ?? ''] ?? { tier: 'informational', badge: item.action_type ?? 'Updated' };
}

function riskLabel(item: ActivityEntry): string {
  const id = item.risk_id ?? '';
  const title = item.risk_title ?? '';
  if (id && title) return `${id} · ${title}`;
  return id || title || 'This risk';
}

export function riskNarrative(item: ActivityEntry): FeedNarrative {
  const cat = inCategory(item.category);
  const label = riskLabel(item);
  const o = item.old_value, n = item.new_value;

  switch (item.action_type) {
    case 'risk_created':
      return { lead: `New risk exposure logged${cat}`, body: `${label}. Early monitoring recommended.` };
    case 'score_change':
      if (o !== null && n !== null) {
        const lvl = item.level ? ` to ${item.level}` : '';
        return n > o
          ? { lead: `Residual exposure increased${cat}`, body: `${label}. Severity escalated${lvl}; requires owner review.` }
          : { lead: `Residual exposure reduced${cat}`, body: `${label}. Severity improved${lvl}; continue monitoring.` };
      }
      return { lead: `Risk score adjusted${cat}`, body: `${label}.` };
    case 'owner_change':
      return { lead: `Risk ownership transferred${cat}`, body: `${label}. New owner should review current controls.` };
    case 'mitigation_update':
      return { lead: `Mitigation plan updated${cat}`, body: `${label}. Confirm revised controls address residual exposure.` };
    case 'escalated':
      return { lead: `Exposure exceeded tolerance${cat}`, body: `${label} escalated. Senior review required.` };
    case 'risk_updated':
      return { lead: `Risk details updated${cat}`, body: `${label}.` };
    case 'ext_submitted':
      return { lead: `External risk submission received${cat}`, body: `${label}. Pending review by the risk team.` };
    case 'ext_approved':
      return { lead: `External submission approved${cat}`, body: `${label} added to the Risk Register.` };
    case 'ext_returned':
      return { lead: `External submission returned${cat}`, body: `${label} sent back for revision.` };
    default:
      return { lead: `Risk record updated${cat}`, body: label === 'This risk' ? '' : `${label}.` };
  }
}

export function riskInsight(item: ActivityEntry): string {
  const o = item.old_value, n = item.new_value;
  switch (item.action_type) {
    case 'risk_created':
      return 'This risk was newly logged. Early-stage monitoring is recommended to establish a baseline score before treatment decisions are made.';
    case 'score_change': {
      if (o !== null && n !== null) {
        const change = Math.round(Math.abs(n - o) * 100) / 100;
        const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2));
        const pts = `${fmt(change)} point${change !== 1 ? 's' : ''}`;
        return n > o
          ? `Score increased from ${fmt(o)} to ${fmt(n)}, a rise of ${pts}. This risk has worsened and may require immediate owner attention or escalation.`
          : `Score decreased from ${fmt(o)} to ${fmt(n)}, an improvement of ${pts}. Controls appear to be working. Continue monitoring to confirm the trend.`;
      }
      return 'A score adjustment was recorded for this risk.';
    }
    case 'owner_change':
      return 'Ownership of this risk was transferred. Ensure the new owner is briefed on current controls and treatment plan.';
    case 'mitigation_update':
      return 'The mitigation plan was updated. Review the revised plan to confirm it adequately addresses the residual exposure.';
    case 'escalated':
      return 'This risk was escalated, indicating it has exceeded acceptable thresholds. Senior review is recommended.';
    case 'risk_updated':
      return 'General details on this risk were updated. No score change was recorded at this time.';
    case 'ext_submitted':
      return "You're required to approve and address the root cause of the risk(s) logged.";
    case 'ext_approved':
      return 'This externally submitted risk passed review and has been added to the Risk Register. Monitor for scoring and treatment assignment.';
    case 'ext_returned':
      return n !== null
        ? `This submission was returned to the submitter. Reason: ${n}`
        : 'This submission was returned to the submitter for revision.';
    default:
      return 'An update was recorded on this risk.';
  }
}

// ── Incident events ───────────────────────────────────────────────────────────

const INCIDENT_CONFIG: Record<string, FeedEventConfig> = {
  incident_resolved:    { tier: 'improving',  badge: 'Resolved'     },
  incident_escalated:   { tier: 'critical',   badge: 'Escalated'    },
  incident_in_progress: { tier: 'monitoring', badge: 'In Progress'  },
  incident_created:     { tier: 'escalated',  badge: 'New Incident' },
};

export function incidentEventConfig(entry: IncidentFeedEntry): FeedEventConfig {
  return INCIDENT_CONFIG[entry.event_type] ?? { tier: 'informational', badge: entry.event_type };
}

export function incidentFlag(entry: IncidentFeedEntry): string | null {
  return entry.linked_risk_id ? null : 'Unlinked';
}

function incidentLabel(entry: IncidentFeedEntry): string {
  return entry.incident_title ? `${entry.incident_id} · ${entry.incident_title}` : entry.incident_id;
}

export function incidentNarrative(entry: IncidentFeedEntry): FeedNarrative {
  const cat = inCategory(entry.category);
  const label = incidentLabel(entry);

  switch (entry.event_type) {
    case 'incident_resolved':
      return { lead: `Incident resolved${cat}`, body: `${label}. Confirm the root cause is recorded and controls validated.` };
    case 'incident_escalated':
      return { lead: `${entry.severity ?? 'High'} severity incident${cat}`, body: `${label}. Senior review required.` };
    case 'incident_in_progress':
      return { lead: `Incident under investigation${cat}`, body: `${label}. Track resolution against its SLA.` };
    case 'incident_created':
      return entry.linked_risk_id
        ? { lead: `New incident logged${cat}`, body: `${label}. Assign an owner and begin initial assessment.` }
        : { lead: `New incident logged${cat}`, body: `${label}. No matching risk on the register; log it as a new risk or link it to an existing one.` };
    default:
      return { lead: `Incident updated${cat}`, body: `${label}.` };
  }
}

export function incidentInsight(entry: IncidentFeedEntry): string {
  switch (entry.event_type) {
    case 'incident_resolved':
      return 'This incident has been resolved. Confirm that a post-incident review was completed and root cause is documented before closing.';
    case 'incident_escalated':
      return `This is a ${entry.severity ?? 'high'} severity incident requiring immediate attention. Escalate to senior risk owner if not already done.`;
    case 'incident_in_progress':
      return 'This incident is actively being managed. Track resolution time against the applicable SLA and update status regularly.';
    case 'incident_created':
      return 'A new incident was logged. Early-stage investigation is recommended. Assign an owner and set the initial severity rating.';
    default:
      return 'An update was recorded on this incident.';
  }
}
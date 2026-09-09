// src/components/dashboard/OperationalFeed.tsx
// Operational feed card: Risk activity and Incident activity with a toggle.
// Placed in UnifiedSection between the Distribution row and the AI card.

import { useState } from 'react';
import type { ActivityEntry, IncidentFeedEntry } from '../../types/dashboard';
import ActivityFeed from './ActivityFeed';

// ── Incident event config ─────────────────────────────────────────────────────

interface IncEventConfig {
  tier: 'critical' | 'escalated' | 'monitoring' | 'improving' | 'informational';
  badge: string;
}

const INC_EVENT_CONFIG: Record<string, IncEventConfig> = {
  incident_resolved:    { tier: 'improving',     badge: 'Resolved'      },
  incident_escalated:   { tier: 'critical',      badge: 'Escalated'     },
  incident_in_progress: { tier: 'monitoring',    badge: 'In Progress'   },
  incident_created:     { tier: 'escalated',     badge: 'New Incident'  },
};

const TIER_BORDER: Record<string, string> = {
  critical:      '#dc2626',
  escalated:     '#f59e0b',
  monitoring:    '#2563eb',
  improving:     '#16a34a',
  informational: '#94a3b8',
};

const TIER_BADGE: Record<string, { bg: string; color: string }> = {
  critical:      { bg: '#fee2e2', color: '#991b1b' },
  escalated:     { bg: '#fef3c7', color: '#92400e' },
  monitoring:    { bg: '#dbeafe', color: '#1e40af' },
  improving:     { bg: '#dcfce7', color: '#166534' },
  informational: { bg: '#f1f5f9', color: '#475569' },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function resolveIncConfig(entry: IncidentFeedEntry): IncEventConfig {
  return INC_EVENT_CONFIG[entry.event_type] ?? {
    tier: 'informational' as const,
    badge: entry.event_type,
  };
}

function buildIncidentNarrative(entry: IncidentFeedEntry): React.ReactNode {
  const title = entry.incident_title
    ? <em style={{ color: '#6f7895' }}>{entry.incident_title}</em>
    : <strong>{entry.incident_id}</strong>;
  const cat = entry.category ? <> in <strong>{entry.category}</strong></> : null;
  const sev = entry.severity ? <strong>{entry.severity}</strong> : null;

  switch (entry.event_type) {
    case 'incident_resolved':
      return <>Incident resolved{cat} — {title}. Confirm root cause documented and controls validated.</>;
    case 'incident_escalated':
      return <>{sev ? <>{sev} incident escalated{cat}</> : <>Critical incident escalated{cat}</>} — {title}. Senior review required.</>;
    case 'incident_in_progress':
      return <>Incident under active investigation{cat} — {title}. Monitor resolution progress and SLA.</>;
    case 'incident_created':
      return <>New incident logged{cat} — {title}. Assign owner and begin initial assessment.</>;
    default:
      return <>Incident updated{cat} — {title}.</>;
  }
}

function buildIncidentInsight(entry: IncidentFeedEntry): string {
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

// ── Incident feed row ─────────────────────────────────────────────────────────

function IncidentFeedRow({
  entry,
  onClick,
}: {
  entry: IncidentFeedEntry
  onClick: (e: IncidentFeedEntry) => void
}) {
  const cfg    = resolveIncConfig(entry);
  const border = TIER_BORDER[cfg.tier] ?? '#94a3b8';
  const badge  = TIER_BADGE[cfg.tier]  ?? TIER_BADGE.informational;

  return (
    <div className="af-feed-row" onClick={() => onClick(entry)}>
      <div className="af-feed-tier" style={{ background: border }} />
      <div className="af-feed-body">
        <div className="af-feed-text">{buildIncidentNarrative(entry)}</div>
        <div className="af-feed-meta">
          {entry.category && (
            <span className="af-feed-meta-t">
              {entry.category}{entry.severity ? ` · ${entry.severity}` : ''}
            </span>
          )}
          <span className="af-feed-meta-t">{timeAgo(entry.created_at)}</span>
        </div>
      </div>
      <span className="af-feed-badge" style={{ background: badge.bg, color: badge.color }}>
        {cfg.badge}
      </span>
    </div>
  );
}

// ── Incident strip ────────────────────────────────────────────────────────────

function IncidentStrip({ items }: { items: IncidentFeedEntry[] }) {
  const resolved    = items.filter(i => i.event_type === 'incident_resolved');
  const escalated   = items.filter(i => i.event_type === 'incident_escalated');
  const inProgress  = items.filter(i => i.event_type === 'incident_in_progress');
  const created     = items.filter(i => i.event_type === 'incident_created');

  const parts: Array<{ color: string; text: string }> = [];
  if (escalated.length)  parts.push({ color: '#dc2626', text: `${escalated.length} escalated` });
  if (inProgress.length) parts.push({ color: '#2563eb', text: `${inProgress.length} in progress` });
  if (created.length)    parts.push({ color: '#f59e0b', text: `${created.length} new` });
  if (resolved.length)   parts.push({ color: '#16a34a', text: `${resolved.length} resolved` });

  if (!parts.length) return null;

  return (
    <div className="af-strip">
      {parts.map(p => (
        <span key={p.text} className="af-strip-part">
          <span className="af-strip-dot" style={{ background: p.color }} />
          {p.text}
        </span>
      ))}
    </div>
  );
}

// ── Incident detail modal ─────────────────────────────────────────────────────

function IncidentDetailModal({
  entry,
  open,
  onClose,
}: {
  entry: IncidentFeedEntry | null
  open: boolean
  onClose: () => void
}) {
  if (!open || !entry) return null;
  const cfg   = resolveIncConfig(entry);
  const badge = TIER_BADGE[cfg.tier] ?? TIER_BADGE.informational;

  return (
    <div className="dl-modal-back z-top" onClick={onClose}>
      <div className="dl-modal sm" onClick={e => e.stopPropagation()}>
        <div className="dl-modal-hd">
          <span className="dl-modal-title">{entry.incident_id} — Incident Detail</span>
          <button className="dl-modal-x lg" onClick={onClose}>✕</button>
        </div>
        <div className="dl-modal-bd">
          <div className="dl-detail-bd">
            <div className="dl-detail-grid">
              {[
                { label: 'Incident ID', value: entry.incident_id },
                { label: 'Event',       value: cfg.badge },
                { label: 'Category',    value: entry.category ?? '—' },
                { label: 'Severity',    value: entry.severity ?? '—' },
                { label: 'Status',      value: entry.status ?? '—' },
                { label: 'When',        value: timeAgo(entry.created_at) },
              ].map(({ label, value }) => (
                <div key={label} className="dl-detail-cell">
                  <div className="dl-detail-lbl">{label}</div>
                  <div className="dl-detail-val">{value}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 2 }}>
              <div className="dl-section-lbl">Event Badge</div>
              <span className="af-feed-badge" style={{ background: badge.bg, color: badge.color, display: 'inline-block', marginTop: 4 }}>
                {cfg.badge}
              </span>
            </div>
            <div className="dl-insight-box" style={{ marginTop: 12 }}>
              <div className="dl-insight-lbl">Insight</div>
              <div className="dl-insight-text">{buildIncidentInsight(entry)}</div>
            </div>
            {entry.incident_title && (
              <div style={{ marginTop: 12 }}>
                <div className="dl-section-lbl">Title</div>
                <div className="dl-insight-text">{entry.incident_title}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Incident view-all modal ───────────────────────────────────────────────────

function IncidentFeedModal({
  items,
  open,
  onClose,
  onItemClick,
}: {
  items: IncidentFeedEntry[]
  open: boolean
  onClose: () => void
  onItemClick: (e: IncidentFeedEntry) => void
}) {
  if (!open) return null;
  return (
    <div className="dl-modal-back" onClick={onClose}>
      <div className="dl-modal" onClick={e => e.stopPropagation()}>
        <div className="dl-modal-hd">
          <span className="dl-modal-title" style={{ fontSize: 15 }}>Incident Activity — Recent Events</span>
          <button className="dl-modal-x lg" onClick={onClose}>✕</button>
        </div>
        <div className="dl-modal-bd">
          {items.slice(0, 10).map(entry => (
            <IncidentFeedRow
              key={entry.id}
              entry={entry}
              onClick={e => { onClose(); onItemClick(e); }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Incident feed panel ───────────────────────────────────────────────────────

function IncidentFeedPanel({ items }: { items: IncidentFeedEntry[] }) {
  const [feedOpen,   setFeedOpen]   = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selected,   setSelected]   = useState<IncidentFeedEntry | null>(null);

  if (!items.length) {
    return <div className="af-empty">No incident activity yet — changes will appear here.</div>;
  }

  const visible     = items.slice(0, 3);
  const showViewAll = items.length > 5;

  function openDetail(entry: IncidentFeedEntry) {
    setSelected(entry);
    setDetailOpen(true);
  }

  return (
    <>
      <div className="af-container">
        <IncidentStrip items={visible} />
        {visible.map(entry => (
          <IncidentFeedRow key={entry.id} entry={entry} onClick={openDetail} />
        ))}
        {showViewAll && (
          <div className="af-viewall">
            <button className="af-viewall-btn" onClick={() => setFeedOpen(true)}>
              View all {Math.min(items.length, 10)} events
            </button>
          </div>
        )}
      </div>
      <IncidentFeedModal
        items={items}
        open={feedOpen}
        onClose={() => setFeedOpen(false)}
        onItemClick={openDetail}
      />
      <IncidentDetailModal
        entry={selected}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
      />
    </>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function OperationalFeed({
  riskItems,
  incidentItems,
}: {
  riskItems: ActivityEntry[]
  incidentItems: IncidentFeedEntry[]
}) {
  const [tab, setTab] = useState<'risk' | 'incident'>('risk');

  return (
    <div className="im-card of-card">
      <div className="im-card-head">
        <span className="im-label">OPERATIONAL FEED</span>
        <div className="of-toggle-group">
          <button
            className={`of-toggle-btn${tab === 'risk' ? ' active' : ''}`}
            onClick={() => setTab('risk')}
          >
            Risk
          </button>
          <button
            className={`of-toggle-btn${tab === 'incident' ? ' active' : ''}`}
            onClick={() => setTab('incident')}
          >
            Incident
          </button>
        </div>
      </div>

      <div className="of-feed-body">
        {tab === 'risk'
          ? <ActivityFeed items={riskItems} />
          : <IncidentFeedPanel items={incidentItems} />
        }
      </div>
    </div>
  );
}
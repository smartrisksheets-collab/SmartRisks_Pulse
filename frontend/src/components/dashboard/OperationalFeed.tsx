// src/components/dashboard/OperationalFeed.tsx
// Operational feed card: All, Risk and Incident views with a toggle.

import { useState } from 'react';
import type { ActivityEntry, IncidentFeedEntry } from '../../types/dashboard';
import ActivityFeed, { ActivityDetailModal } from './ActivityFeed';
import FeedEventRow from './FeedEventRow';
import {
  incidentEventConfig,
  incidentNarrative,
  incidentInsight,
  incidentFlag,
  riskEventConfig,
  riskNarrative,
  mergeFeed,
  timeAgo,
} from '../../utils/feedEvents';

type FeedTab = 'all' | 'risk' | 'incident';

// ── Incident feed row ─────────────────────────────────────────────────────────

function IncidentFeedRow({
  entry,
  onClick,
}: {
  entry: IncidentFeedEntry
  onClick: (e: IncidentFeedEntry) => void
}) {
  return (
    <FeedEventRow
      config={incidentEventConfig(entry)}
      narrative={incidentNarrative(entry)}
      meta={[entry.category ? `${entry.category}${entry.severity ? ` · ${entry.severity}` : ''}` : '', timeAgo(entry.created_at)]}
      flag={incidentFlag(entry)}
      onClick={() => onClick(entry)}
    />
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
  const cfg = incidentEventConfig(entry);

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
              <span className={`af-feed-badge af-feed-badge-block t-${cfg.tier}`}>
                {cfg.badge}
              </span>
            </div>
            <div className="dl-insight-box" style={{ marginTop: 12 }}>
              <div className="dl-insight-lbl">Insight</div>
              <div className="dl-insight-text">{incidentInsight(entry)}</div>
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

// ── All view ──────────────────────────────────────────────────────────────────

function AllFeedPanel({ risks, incidents }: { risks: ActivityEntry[]; incidents: IncidentFeedEntry[] }) {
  const [riskSel, setRiskSel] = useState<ActivityEntry | null>(null);
  const [incSel, setIncSel]   = useState<IncidentFeedEntry | null>(null);
  const items = mergeFeed(risks, incidents).slice(0, 6);

  if (!items.length) {
    return <div className="af-empty">No activity yet. Changes will appear here.</div>;
  }

  return (
    <>
      <div className="af-container">
        {items.map(it => (it.kind === 'risk' ? (
          <FeedEventRow
            key={it.key}
            config={riskEventConfig(it.entry)}
            narrative={riskNarrative(it.entry)}
            meta={['Risk', it.entry.category ?? '', timeAgo(it.at)]}
            pending={it.entry.action_type === 'ext_submitted'}
            onClick={() => setRiskSel(it.entry)}
          />
        ) : (
          <FeedEventRow
            key={it.key}
            config={incidentEventConfig(it.entry)}
            narrative={incidentNarrative(it.entry)}
            meta={['Incident', it.entry.severity ?? '', timeAgo(it.at)]}
            flag={incidentFlag(it.entry)}
            onClick={() => setIncSel(it.entry)}
          />
        )))}
      </div>
      <ActivityDetailModal item={riskSel} open={riskSel !== null} onClose={() => setRiskSel(null)} />
      <IncidentDetailModal entry={incSel} open={incSel !== null} onClose={() => setIncSel(null)} />
    </>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function OperationalFeed({
  riskItems,
  incidentItems,
  exceedsAppetite,
}: {
  riskItems: ActivityEntry[]
  incidentItems: IncidentFeedEntry[]
  exceedsAppetite: number
}) {
  const [tab, setTab] = useState<FeedTab>('all');

  return (
    <div className="im-card of-card">
      <div className="im-card-head">
        <span className="im-label">LIVE EVENTS</span>
        <div className="of-toggle-group" role="group" aria-label="Filter feed">
          {(['all', 'risk', 'incident'] as const).map(t => (
            <button
              key={t}
              type="button"
              className={`of-toggle-btn${tab === t ? ' active' : ''}`}
              aria-pressed={tab === t}
              onClick={() => setTab(t)}
            >
              {t === 'all' ? 'All' : t === 'risk' ? 'Risk' : 'Incident'}
            </button>
          ))}
        </div>
      </div>

      {exceedsAppetite > 0 && (
        <div className="of-alert">
          {exceedsAppetite} risk{exceedsAppetite === 1 ? ' is' : 's are'} currently outside appetite
        </div>
      )}

      <div className="of-feed-body">
        {tab === 'all' && <AllFeedPanel risks={riskItems} incidents={incidentItems} />}
        {tab === 'risk' && <ActivityFeed items={riskItems} />}
        {tab === 'incident' && <IncidentFeedPanel items={incidentItems} />}
      </div>
    </div>
  );
}
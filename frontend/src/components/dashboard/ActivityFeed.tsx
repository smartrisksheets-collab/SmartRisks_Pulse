import { useState } from 'react';
import type { ActivityEntry } from '../../types/dashboard';
import FeedEventRow from './FeedEventRow';
import { riskEventConfig, riskNarrative, riskInsight, timeAgo, RISK_ACTION_LABELS } from '../../utils/feedEvents';

// ── Feed row ──────────────────────────────────────────────────────────────────

function FeedRow({ item, onClick }: { item: ActivityEntry; onClick: (i: ActivityEntry) => void }) {
  return (
    <FeedEventRow
      config={riskEventConfig(item)}
      narrative={riskNarrative(item)}
      meta={[item.category ? `${item.category}${item.level ? ` · ${item.level}` : ''}` : '', timeAgo(item.created_at)]}
      pending={item.action_type === 'ext_submitted'}
      onClick={() => onClick(item)}
    />
  );
}

// ── Insight strip ─────────────────────────────────────────────────────────────

function InsightStrip({ items }: { items: ActivityEntry[] }) {
  const worsened  = items.filter(i => i.action_type === 'score_change' && (i.new_value ?? 0) > (i.old_value ?? 0));
  const improved  = items.filter(i => i.action_type === 'score_change' && (i.new_value ?? 0) < (i.old_value ?? 0));
  const created   = items.filter(i => i.action_type === 'risk_created');
  const escalated = items.filter(i => i.action_type === 'escalated');
  const submitted = items.filter(i => i.action_type === 'ext_submitted');
  const returned  = items.filter(i => i.action_type === 'ext_returned');

  const parts: Array<{ color: string; text: string }> = [];
  if (worsened.length)  parts.push({ color: '#dc2626', text: `${worsened.length} exposure increased` });
  if (escalated.length) parts.push({ color: '#f59e0b', text: `${escalated.length} escalated` });
  if (improved.length)  parts.push({ color: '#16a34a', text: `${improved.length} exposure reduced` });
  if (created.length)   parts.push({ color: '#1F2854', text: `${created.length} new risk added` });
  if (submitted.length) parts.push({ color: '#6366f1', text: `${submitted.length} external submission${submitted.length > 1 ? 's' : ''}` });
  if (returned.length)  parts.push({ color: '#f59e0b', text: `${returned.length} returned for review` });

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

// ── Feed modal ────────────────────────────────────────────────────────────────

function FeedModal({ items, open, onClose, onItemClick }: { items: ActivityEntry[]; open: boolean; onClose: () => void; onItemClick: (i: ActivityEntry) => void }) {
  if (!open) return null;
  return (
    <div className="dl-modal-back" onClick={onClose}>
      <div className="dl-modal" onClick={e => e.stopPropagation()}>
        <div className="dl-modal-hd">
          <span className="dl-modal-title" style={{ fontSize: 15 }}>Risk Activity — Recent Events</span>
          <button className="dl-modal-x lg" onClick={onClose}>✕</button>
        </div>
        <div className="dl-modal-bd">
          {items.slice(0, 10).map(item => (
            <FeedRow key={item.id} item={item} onClick={i => { onClose(); onItemClick(i); }} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Detail modal ──────────────────────────────────────────────────────────────

export function ActivityDetailModal({ item, open, onClose }: { item: ActivityEntry | null; open: boolean; onClose: () => void }) {
  if (!open || !item) return null;
  const o = item.old_value, n = item.new_value;
  const isScoreChange = item.action_type === 'score_change' && o !== null && n !== null;
  const isReturned    = item.action_type === 'ext_returned' && n !== null;

  return (
    <div className="dl-modal-back z-top" onClick={onClose}>
      <div className="dl-modal sm" onClick={e => e.stopPropagation()}>
        <div className="dl-modal-hd">
          <span className="dl-modal-title">{item.risk_id ?? '—'} — Activity Detail</span>
          <button className="dl-modal-x lg" onClick={onClose}>✕</button>
        </div>
        <div className="dl-modal-bd">
          <div className="dl-detail-bd">
            <div className="dl-detail-grid">
              {[
                { label: 'Risk ID',       value: item.risk_id ?? '—' },
                { label: 'Action',        value: RISK_ACTION_LABELS[item.action_type ?? ''] ?? item.action_type ?? '—' },
                { label: 'Business Unit', value: item.category ?? '—' },
                { label: 'When',          value: timeAgo(item.created_at) },
              ].map(({ label, value }) => (
                <div key={label} className="dl-detail-cell">
                  <div className="dl-detail-lbl">{label}</div>
                  <div className="dl-detail-val">{value}</div>
                </div>
              ))}
            </div>

            {isScoreChange && (
              <div>
                <div className="dl-section-lbl">Score Movement</div>
                <div className="dl-score-row">
                  <span className="dl-score-val">{Math.round(o)}</span>
                  <span className="dl-score-arrow">→</span>
                  <span className="dl-score-val" style={{ color: (n ?? 0) > (o ?? 0) ? '#ef4444' : '#18c29c' }}>{Math.round(n)}</span>
                  <span className="dl-score-badge" style={{
                    background: (n ?? 0) > (o ?? 0) ? '#fee2e2' : '#d1fae5',
                    color:      (n ?? 0) > (o ?? 0) ? '#991b1b' : '#065f46',
                  }}>
                    {(n ?? 0) > (o ?? 0) ? 'Worsened' : 'Improved'}
                  </span>
                </div>
              </div>
            )}

            <div>
              <div className="dl-section-lbl">Risk Description</div>
              <div className="dl-insight-text">{item.risk_title ?? '—'}</div>
            </div>

            <div className="dl-insight-box">
              <div className="dl-insight-lbl">Insight</div>
              <div className="dl-insight-text">{riskInsight(item)}</div>
            </div>

            {isReturned && (
              <div className="dl-return-box">
                <div className="dl-return-lbl">Return Reason</div>
                <div className="dl-return-text">{String(n)}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function ActivityFeed({ items }: { items: ActivityEntry[] }) {
  const [feedOpen,   setFeedOpen]   = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selected,   setSelected]   = useState<ActivityEntry | null>(null);

  if (!items.length) {
    return <div className="af-empty">No activity yet — changes will appear here.</div>;
  }

  const visible    = items.slice(0, 3);
  const showViewAll = items.length > 5;

  function openDetail(item: ActivityEntry) {
    setSelected(item);
    setDetailOpen(true);
  }

  return (
    <>
      <div className="af-container">
        <InsightStrip items={visible} />
        {visible.map(item => <FeedRow key={item.id} item={item} onClick={openDetail} />)}
        {showViewAll && (
          <div className="af-viewall">
            <button className="af-viewall-btn" onClick={() => setFeedOpen(true)}>
              View all {Math.min(items.length, 10)} events
            </button>
          </div>
        )}
      </div>
      <FeedModal  items={items} open={feedOpen}   onClose={() => setFeedOpen(false)}   onItemClick={openDetail} />
      <ActivityDetailModal item={selected} open={detailOpen} onClose={() => setDetailOpen(false)} />
    </>
  );
}
import { useState } from 'react';
import type { ActivityEntry } from '../../types/dashboard';

// ── Action type config ────────────────────────────────────────────────────────

interface ActionConfig {
  tier: 'critical' | 'escalated' | 'monitoring' | 'improving' | 'informational';
  badge: string;
}

const ACTION_CONFIG: Record<string, ActionConfig> = {
  score_change_up:   { tier: 'escalated',     badge: 'Exposure Increased'  },
  score_change_down: { tier: 'improving',      badge: 'Exposure Reduced'    },
  score_change:      { tier: 'monitoring',     badge: 'Score Updated'       },
  owner_change:      { tier: 'informational',  badge: 'Ownership Updated'   },
  mitigation_update: { tier: 'monitoring',     badge: 'Under Review'        },
  escalated:         { tier: 'critical',       badge: 'Escalated'           },
  risk_created:      { tier: 'monitoring',     badge: 'High Risk Added'     },
  risk_updated:      { tier: 'informational',  badge: 'Risk Updated'        },
  ext_submitted:     { tier: 'monitoring',     badge: 'External Submission' },
  ext_approved:      { tier: 'improving',      badge: 'Approved'            },
  ext_returned:      { tier: 'escalated',      badge: 'Returned for Review' },
  risk_deleted:      { tier: 'informational',  badge: 'Risk Deleted'        },
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

function resolveConfig(item: ActivityEntry): ActionConfig {
  if (item.action_type === 'score_change') {
    const o = item.old_value, n = item.new_value;
    if (o !== null && n !== null) {
      return n > o ? ACTION_CONFIG.score_change_up : ACTION_CONFIG.score_change_down;
    }
  }
  return ACTION_CONFIG[item.action_type ?? ''] ?? {
    tier: 'informational' as const,
    badge: item.action_type ?? 'Updated',
  };
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function buildNarrative(item: ActivityEntry): React.ReactNode {
  const title = item.risk_title
    ? <em style={{ color: '#6f7895' }}>{item.risk_title}</em>
    : <strong>{item.risk_id ?? '—'}</strong>;
  const cat = item.category ? <> in <strong>{item.category}</strong></> : null;
  const o = item.old_value, n = item.new_value;

  switch (item.action_type) {
    case 'risk_created':
      return <>New risk exposure logged{cat} — {title}. Early monitoring recommended.</>;
    case 'score_change': {
      if (o !== null && n !== null) {
        const lvl = item.level ? <> to <strong>{item.level}</strong></> : null;
        return n > o
          ? <>Residual exposure increased{cat} — risk severity escalated{lvl}. Requires owner review.</>
          : <>Residual exposure reduced{cat} — risk severity improved{lvl}. Continue monitoring.</>;
      }
      return <>Risk score adjusted{cat} for {title}.</>;
    }
    case 'owner_change':
      return <>Risk ownership transferred{cat} — {title}. New owner should review current controls.</>;
    case 'mitigation_update':
      return <>Mitigation plan updated{cat} for {title}. Confirm revised controls address residual exposure.</>;
    case 'escalated':
      return <>Residual exposure exceeded tolerance threshold{cat} — {title} escalated. Senior review required.</>;
    case 'risk_updated':
      return <>Risk details updated{cat} — {title}.</>;
    case 'ext_submitted':
      return <>External risk submission received{cat} — {title}. Pending review by the risk team.</>;
    case 'ext_approved':
      return <>External submission approved{cat} — {title} added to the Risk Register.</>;
    case 'ext_returned':
      return <>External submission returned{cat} — {title} sent back for revision.</>;
    default:
      return <>Risk record updated{cat}.</>;
  }
}

function buildInsightText(item: ActivityEntry): string {
  const o = item.old_value, n = item.new_value;
  switch (item.action_type) {
    case 'risk_created':
      return 'This risk was newly logged. Early-stage monitoring is recommended to establish a baseline score before treatment decisions are made.';
    case 'score_change': {
      if (o !== null && n !== null) {
        const rise = Math.round(Math.abs(n - o) * 100) / 100;
        const fmt  = (v: number) => Number.isInteger(v) ? String(v) : v.toFixed(2);
        return n > o
          ? `Score increased from ${fmt(o)} to ${fmt(n)} — a rise of ${fmt(rise)} point${rise !== 1 ? 's' : ''}. This risk has worsened and may require immediate owner attention or escalation.`
          : `Score decreased from ${fmt(o)} to ${fmt(n)} — an improvement of ${fmt(rise)} point${rise !== 1 ? 's' : ''}. Controls appear to be working. Continue monitoring to confirm the trend.`;
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

// ── Feed row ──────────────────────────────────────────────────────────────────

function FeedRow({ item, onClick }: { item: ActivityEntry; onClick: (i: ActivityEntry) => void }) {
  const cfg    = resolveConfig(item);
  const border = TIER_BORDER[cfg.tier] ?? '#94a3b8';
  const badge  = TIER_BADGE[cfg.tier]  ?? TIER_BADGE.informational;
  const isPending = item.action_type === 'ext_submitted';

  return (
    <div className="af-feed-row" onClick={() => onClick(item)}>
      <div className="af-feed-tier" style={{ background: border }} />
      <div className="af-feed-body">
        <div className="af-feed-text">
          {buildNarrative(item)}
          {isPending && <span className="af-feed-pending">Pending Approval</span>}
        </div>
        <div className="af-feed-meta">
          {item.category && (
            <span className="af-feed-meta-t">
              {item.category}{item.level ? ` · ${item.level}` : ''}
            </span>
          )}
          <span className="af-feed-meta-t">{timeAgo(item.created_at)}</span>
        </div>
      </div>
      <span className="af-feed-badge" style={{ background: badge.bg, color: badge.color }}>
        {cfg.badge}
      </span>
    </div>
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

const ACTION_LABELS: Record<string, string> = {
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

function DetailModal({ item, open, onClose }: { item: ActivityEntry | null; open: boolean; onClose: () => void }) {
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
                { label: 'Action',        value: ACTION_LABELS[item.action_type ?? ''] ?? item.action_type ?? '—' },
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
              <div className="dl-insight-text">{buildInsightText(item)}</div>
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
      <DetailModal item={selected}  open={detailOpen} onClose={() => setDetailOpen(false)} />
    </>
  );
}
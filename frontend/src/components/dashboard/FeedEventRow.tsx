// src/components/dashboard/FeedEventRow.tsx
// One Operational Feed row, shared by the Risk, Incident and All views.

import type { FeedEventConfig, FeedNarrative } from '../../utils/feedEvents';

interface Props {
  config: FeedEventConfig;
  narrative: FeedNarrative;
  meta: string[];
  flag?: string | null;
  pending?: boolean;
  onClick: () => void;
}

export default function FeedEventRow({ config, narrative, meta, flag, pending, onClick }: Props) {
  return (
    <div
      className="af-feed-row"
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <div className={`af-feed-tier t-${config.tier}`} />
      <div className="af-feed-body">
        <div className="af-feed-text">
          <strong className="af-feed-lead">{narrative.lead}.</strong>
          {narrative.body && <> {narrative.body}</>}
          {pending && <span className="af-feed-pending">Pending Approval</span>}
        </div>
        <div className="af-feed-meta">
          {meta.filter(m => m !== '').map((m, i) => (
            <span key={`${i}-${m}`} className="af-feed-meta-t">{m}</span>
          ))}
        </div>
      </div>
      <div className="af-feed-tags">
        {flag && <span className="af-feed-flag">{flag}</span>}
        <span className={`af-feed-badge t-${config.tier}`}>{config.badge}</span>
      </div>
    </div>
  );
}
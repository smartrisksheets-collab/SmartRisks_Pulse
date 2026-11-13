// src/components/analytics/ActivityTab.tsx
// Every risk and incident change, newest first, filtered by type.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { DashboardData } from '../../types/dashboard';
import {
  incidentEventConfig,
  incidentFlag,
  incidentNarrative,
  mergeFeed,
  riskEventConfig,
  riskNarrative,
  timeAgo,
  type FeedTier,
} from '../../utils/feedEvents';
import Explain from '../help/Explain';
import { Card } from './shared';

type Filter = 'all' | 'risk' | 'incident';

const TIER_CHIP: Record<FeedTier, string> = {
  critical: 'pl-sev-x',
  escalated: 'pl-sev-h',
  monitoring: 'pl-sev-m',
  improving: 'pl-ok',
  informational: 'pl-sev-l',
};

interface Props {
  data: DashboardData;
  hasRisk: boolean;
  hasIncident: boolean;
  showAuditLink: boolean;
  open: (path: string) => void;
}

export default function ActivityTab({ data, hasRisk, hasIncident, showAuditLink, open }: Props) {
  const [filter, setFilter] = useState<Filter>('all');
  const items = mergeFeed(hasRisk ? data.activity_feed : [], hasIncident ? data.incident_feed : []);
  const riskN = items.filter(i => i.kind === 'risk').length;
  const incN = items.length - riskN;
  const shown = filter === 'all' ? items : items.filter(i => i.kind === filter);
  const options: { key: Filter; label: string; n: number }[] = [
    { key: 'all', label: 'All', n: items.length },
    ...(hasRisk ? [{ key: 'risk' as const, label: 'Risk', n: riskN }] : []),
    ...(hasIncident ? [{ key: 'incident' as const, label: 'Incident', n: incN }] : []),
  ];

  return (
    <Card
      title="Every change, as it happens"
      intro="Risk and incident changes, with what each one means for the register."
      right={<Explain id="operational-feed" />}
    >
      {options.length > 2 && (
        <div className="pl-seg" role="group" aria-label="Filter activity">
          {options.map(o => (
            <button
              key={o.key}
              type="button"
              className={`pl-seg-btn${filter === o.key ? ' pl-on' : ''}`}
              aria-pressed={filter === o.key}
              onClick={() => setFilter(o.key)}
            >
              {o.label} {o.n}
            </button>
          ))}
        </div>
      )}
      {shown.length === 0 ? (
        <p className="pl-caption">No changes recorded yet.</p>
      ) : (
        <div className="pl-stack-0">
          {shown.map(it => {
            const cfg = it.kind === 'risk' ? riskEventConfig(it.entry) : incidentEventConfig(it.entry);
            const nar = it.kind === 'risk' ? riskNarrative(it.entry) : incidentNarrative(it.entry);
            const flag = it.kind === 'incident' ? incidentFlag(it.entry) : null;
            const target = it.kind === 'risk'
              ? (it.entry.risk_id ? `/risks?risk=${encodeURIComponent(it.entry.risk_id)}` : null)
              : `/incidents?incident=${encodeURIComponent(it.entry.incident_id)}`;
            const body = (
              <>
                <span className="pl-ev-when pl-meta">{timeAgo(it.at)}</span>
                <span className="pl-tag">{it.kind === 'risk' ? 'Risk' : 'Incident'}</span>
                <span className="pl-grow"><b>{nar.lead}.</b>{nar.body && ` ${nar.body}`}</span>
                {flag && <span className="pl-chip pl-sev-h">{flag}</span>}
                <span className={`pl-chip ${TIER_CHIP[cfg.tier]}`}>{cfg.badge}</span>
              </>
            );
            return target ? (
              <button key={it.key} type="button" className="pl-ev pl-ev-btn" onClick={() => open(target)}>{body}</button>
            ) : (
              <div key={it.key} className="pl-ev">{body}</div>
            );
          })}
        </div>
      )}
      <p className="pl-caption">
        Logins, settings and user changes are not shown here.
        {showAuditLink && <> They are in the <Link to="/audit">Audit Log</Link>.</>}
      </p>
    </Card>
  );
}

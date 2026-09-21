// src/components/incidents/IncidentStatCards.tsx

import { useState } from 'react';
import type { IncidentStats } from '../../types/incident';
import { formatMoneyCompact } from '../../utils/format';
import { useSettingsStore } from '../../store/settingsStore';

interface Props {
  stats:   IncidentStats | null;
  loading: boolean;
}

function compFillClass(score: number): string {
  return score >= 70 ? '' : score >= 40 ? 'amber' : 'red';
}

export default function IncidentStatCards({ stats, loading }: Props) {
  const currency  = useSettingsStore(s => s.currency);
  const [whyOpen, setWhyOpen] = useState(false);

  if (loading || !stats) {
    return (
      <div className="im-top-strip">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="im-card" style={{ opacity: .5 }}>
            <div className="im-card-head"><span className="im-label">Loading…</span></div>
          </div>
        ))}
      </div>
    );
  }

  const { health, totals, lifecycle, resolution } = stats;

  const scoreColor = health.label === 'Healthy'    ? '#059669'
                   : health.label === 'Monitoring' ? '#01b88e'
                   : health.label === 'At Risk'    ? '#d97706'
                   : '#dc2626';

  const tagClass   = health.label === 'Healthy'    ? 'im-delta up'
                   : health.label === 'Monitoring' ? 'im-delta flat'
                   : health.label === 'At Risk'    ? 'im-delta warn'
                   : 'im-delta down';

  return (
    <div className="im-top-strip">

      {/* Card 1: Incident Health — composite score */}
      <div className="im-card">
        <div className="im-card-head">
          <span className="im-label">INCIDENT HEALTH{health.small_n ? ' · Indicative' : ''}</span>
          <span className={tagClass}>{health.label}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
          <div className="im-big" style={{ color: scoreColor }}>{health.score}</div>
          <div className="im-sub">/ 100</div>
        </div>
        <div className="im-sub">Operational posture</div>
        <div className="im-detail-row">
          <span>Within SLA</span>
          <strong className={health.within_sla < health.within_sla_total ? 'bad' : ''}>
            {health.within_sla} of {health.within_sla_total}
          </strong>
        </div>
        <div className="im-detail-row">
          <span>Open past target</span>
          <strong className={health.open_past_target > 0 ? 'bad' : 'zero'}>
            {health.open_past_target}
          </strong>
        </div>
        <div className="im-detail-row">
          <span>Linked to register risk</span>
          <strong className={health.linked < health.total ? 'bad' : ''}>
            {health.linked} of {health.total}
          </strong>
        </div>
        {health.flag && <div className="im-flag"><b>{health.flag}</b></div>}
        <details className="im-why" open={whyOpen} onToggle={e => setWhyOpen((e.target as HTMLDetailsElement).open)}>
          <summary>Why {health.score}?</summary>
          <div className="im-why-body">
            {health.components.map(c => (
              <div key={c.name} className="im-comp">
                <span className="im-comp-name">{c.suppressed ? `${c.name} (n/a)` : c.name}</span>
                <span className="im-comp-weight">{c.weight}</span>
                <span className="im-comp-track">
                  <span className={`im-comp-fill ${compFillClass(c.score)}`} style={{ width: `${c.suppressed ? 0 : c.score}%` }} />
                </span>
                <span className="im-comp-score">{c.suppressed ? '—' : c.score}</span>
              </div>
            ))}
          </div>
        </details>
      </div>

      {/* Card 2: Incident Volume */}
      <div className="im-card">
        <div className="im-card-head">
          <span className="im-label">INCIDENT VOLUME</span>
          <span className="im-delta flat">Live</span>
        </div>
        <div className="im-big">{totals.count}</div>
        <div className="im-sub">Logged this period</div>
        <div className="im-detail-row">
          <span>Open</span>
          <strong className={totals.open_count > 0 ? '' : 'zero'}>{totals.open_count}</strong>
        </div>
        <div className="im-detail-row">
          <span>Overdue</span>
          <strong className={totals.overdue_count > 0 ? 'bad' : 'zero'}>{totals.overdue_count}</strong>
        </div>
        <div className="im-detail-row">
          <span>High or above</span>
          <strong className={totals.high_or_above > 0 ? 'warn' : 'zero'}>{totals.high_or_above}</strong>
        </div>
        {totals.flag && <div className="im-flag"><b>{totals.flag}</b></div>}
      </div>

      {/* Card 3: Incident Lifecycle — all 6 statuses, always */}
      <div className="im-card">
        <div className="im-card-head">
          <span className="im-label">INCIDENT LIFECYCLE</span>
          <span className="im-delta flat">Live</span>
        </div>
        <div className="im-sub">Current workflow distribution</div>
        <div className="im-detail-row">
          <span>New</span>
          <strong className={lifecycle.new === 0 ? 'zero' : ''}>{lifecycle.new}</strong>
        </div>
        <div className="im-detail-row">
          <span>Open</span>
          <strong className={lifecycle.open === 0 ? 'zero' : ''}>{lifecycle.open}</strong>
        </div>
        <div className="im-detail-row">
          <span>In Progress</span>
          <strong className={lifecycle.in_progress === 0 ? 'zero' : ''}>{lifecycle.in_progress}</strong>
        </div>
        <div className="im-detail-row">
          <span>Under Review</span>
          <strong className={lifecycle.under_review === 0 ? 'zero' : 'bad'}>
            {lifecycle.under_review}
            {lifecycle.under_review > 0 && lifecycle.oldest_open_days !== null && (
              <span className="note"> oldest {lifecycle.oldest_open_days}d</span>
            )}
          </strong>
        </div>
        <div className="im-detail-row">
          <span>Resolved</span>
          <strong className={lifecycle.resolved === 0 ? 'zero' : ''}>{lifecycle.resolved}</strong>
        </div>
        <div className="im-detail-row">
          <span>Closed</span>
          <strong className={lifecycle.closed === 0 ? 'zero' : ''}>{lifecycle.closed}</strong>
        </div>
      </div>

      {/* Card 4: Resolution & Impact */}
      <div className="im-card">
        <div className="im-card-head">
          <span className="im-label">RESOLUTION & IMPACT</span>
          <span className="im-delta flat">Live</span>
        </div>
        {resolution.oldest_open_days !== null ? (
          <>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
              <div className="im-big" style={{ color: '#dc2626' }}>{resolution.oldest_open_days}</div>
              <div className="im-sub">d oldest open</div>
            </div>
            <div className="im-sub">
              {resolution.oldest_open_id} · {resolution.oldest_open_severity} · {resolution.oldest_open_date ?? '—'}
            </div>
          </>
        ) : (
          <>
            <div className="im-big">{resolution.median_days !== null ? `${resolution.median_days}d` : '—'}</div>
            <div className="im-sub">Median time to resolve</div>
          </>
        )}
        <div className="im-detail-row">
          <span>Median time to resolve</span>
          <strong>
            {resolution.median_days !== null ? `${resolution.median_days}d` : '—'}
            {resolution.resolved_count > 0 && <span className="note"> {resolution.resolved_count} resolved</span>}
          </strong>
        </div>
        <div className="im-detail-row">
          <span>Breaching own target</span>
          <strong className={resolution.breach_count > 0 ? 'bad' : 'zero'}>
            {resolution.breach_count} of {resolution.breach_total}
          </strong>
        </div>
        <div className="im-detail-row">
          <span>Estimated impact</span>
          <strong>
            {resolution.impact_count > 0
              ? formatMoneyCompact(resolution.impact_total, currency)
              : '—'}
            {resolution.impact_count > 0 && (
              <span className="note"> {resolution.impact_count} of {resolution.impact_total_count}</span>
            )}
          </strong>
        </div>
        {resolution.flag && <div className="im-flag amber"><b>{resolution.flag}</b></div>}
      </div>

    </div>
  );
}
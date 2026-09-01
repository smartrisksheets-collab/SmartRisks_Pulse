// src/components/incidents/IncidentStatCards.tsx

import type { IncidentStats } from '../../types/incident';
import { formatMoneyCompact } from '../../utils/format';
import { useSettingsStore } from '../../store/settingsStore';

interface Props {
  stats:   IncidentStats | null;
  loading: boolean;
}

export default function IncidentStatCards({ stats, loading }: Props) {
  const currency = useSettingsStore(s => s.currency);

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
  const healthColor = health.label === 'Healthy' ? '#047857' : health.label === 'At Risk' ? '#f59e0b' : '#dc2626';

  const fmtImpact = (v: string | null) => formatMoneyCompact(v, currency);

  const slaTarget = 5;
  const mttr = resolution.avg_days;
  const slaCompare = mttr !== null ? (slaTarget - mttr).toFixed(1) : null;

  return (
    <div className="im-top-strip">

      {/* Card 1: Incident Health */}
      <div className="im-card im-accent-teal">
        <div className="im-card-head">
          <span className="im-label">INCIDENT HEALTH</span>
          <span className="im-delta flat">Live</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div className="im-big">{health.pct}%</div>
          <div className="im-big-soft" style={{ color: healthColor }}>{health.label}</div>
        </div>
        <div className="im-sub">Operational posture</div>
        <div className="im-divider" />
        <div className="im-mini-row">
          <span>SLA breaches</span>
          <strong>{health.sla_pct}%</strong>
        </div>
        <div className="im-mini-row">
          <span>Critical trend</span>
          <strong className={health.critical_trend === 'Stable' ? 'good' : ''}>
            {health.critical_trend}
          </strong>
        </div>
      </div>

      {/* Card 2: Total Incidents */}
      <div className="im-card im-accent-navy">
        <div className="im-card-head">
          <span className="im-label">TOTAL INCIDENTS</span>
          <span className="im-delta flat">Live</span>
        </div>
        <div className="im-big">{totals.count}</div>
        <div className="im-sub">Active in incident register</div>
        <div className="im-divider" />
        <div className="im-mini-row">
          <span>Critical exposure</span>
          <strong>{totals.critical_count}</strong>
        </div>
        <div className="im-mini-row">
          <span>Open incidents</span>
          <strong>{totals.open_count}</strong>
        </div>
      </div>

      {/* Card 3: Incident Lifecycle */}
      <div className="im-card im-accent-split">
        <div className="im-card-head">
          <span className="im-label">INCIDENTS LIFECYCLE</span>
          <span className="im-delta flat">Live</span>
        </div>
        <div className="im-sub">Current workflow distribution</div>
        <div className="im-divider" />
        <div className="im-status-grid">
          <div className="im-status-row">
            <span>New</span>
            <strong>{lifecycle.new}</strong>
          </div>
          <div className="im-status-row">
            <span>Under Review</span>
            <strong>{lifecycle.under_review}</strong>
          </div>
          <div className="im-status-row">
            <span>Resolved</span>
            <strong>{lifecycle.resolved}</strong>
          </div>
        </div>
      </div>

      {/* Card 4: Resolution & Impact */}
      <div className="im-card im-accent-emerald">
        <div className="im-card-head">
          <span className="im-label">RESOLUTION & IMPACT</span>
          <span className="im-delta flat">Live</span>
        </div>
        <div className="im-split-grid">
          <div className="im-split-block">
            <span className="im-sub">Avg Resolution</span>
            <strong className="im-big">{mttr !== null ? `${mttr}d` : 'N/A'}</strong>
            <span className="im-sub">Mean time to resolve</span>
          </div>
          <div className="im-split-divider" />
          <div className="im-split-block">
            <span className="im-sub">Estimated Impact</span>
            <strong className="im-big">{fmtImpact(resolution.total_financial_impact)}</strong>
            <span className="im-sub">Total financial exposure</span>
          </div>
        </div>
        <div className="im-divider" />
        <div className="im-mini-row">
          <span>vs SLA target</span>
          {slaCompare !== null ? (
            <strong className={Number(slaCompare) >= 0 ? 'good' : ''}>
              {Number(slaCompare) >= 0 ? `${slaCompare}d faster` : `${Math.abs(Number(slaCompare))}d slower`}
            </strong>
          ) : <strong>—</strong>}
        </div>
      </div>

    </div>
  );
}
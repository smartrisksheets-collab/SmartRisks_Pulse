import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
} from 'recharts';
import type { DashboardData, TopIncident } from '../../types/dashboard';
import { DEFAULT_CURRENCY } from '../../utils/constants';

const SLA_TARGET_DAYS = 5;

function DeltaBadge({
  value,
  lowerIsBetter = false,
}: {
  value: number | null;
  lowerIsBetter?: boolean;
}) {
  if (value === null || value === undefined) return null;
  const isPositive = value > 0;
  const isGood = lowerIsBetter ? !isPositive : isPositive;
  const cls = value === 0 ? 'flat' : isGood ? 'up' : 'down';
  const sign = value > 0 ? '+' : '';
  return <span className={`sr-delta ${cls}`}>{sign}{value}%</span>;
}

function formatCurrency(val: number): string {
  if (val >= 1_000_000) return `${DEFAULT_CURRENCY}${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `${DEFAULT_CURRENCY}${(val / 1_000).toFixed(1)}K`;
  return `${DEFAULT_CURRENCY}${val.toFixed(0)}`;
}

function severityColor(s: string | null): string {
  if (!s) return '#94a3b8';
  const l = s.toLowerCase();
  if (l === 'critical') return '#ef4444';
  if (l === 'high') return '#f59e0b';
  if (l === 'medium') return '#3b82f6';
  return '#10b981';
}

function daysSince(dateStr: string | null): string {
  if (!dateStr) return '—';
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return '1d';
  return `${days}d`;
}

interface Props {
  data: DashboardData;
}

export default function IncidentSection({ data }: Props) {
  const {
    incident_health,
    total_incidents,
    lifecycle,
    avg_resolution,
    incident_velocity,
    top_open_incidents,
    snapshot_delta,
  } = data;

  const { health_score, label: healthLabel, sla_pct, critical_trend } = incident_health;
  const { days: mttr, data_points } = avg_resolution;
  const healthColor =
    health_score >= 76 ? '#10b981'
    : health_score >= 51 ? '#14b8a6'
    : health_score >= 26 ? '#f59e0b'
    : '#ef4444';

  const slaDelta = mttr != null ? (SLA_TARGET_DAYS - mttr).toFixed(1) : null;
  const slaGood = slaDelta !== null && Number(slaDelta) >= 0;
  const resolveBarPct = mttr != null
    ? Math.min(100, Math.round((mttr / SLA_TARGET_DAYS) * 100))
    : 0;

  return (
    <div className="dash-section">

      {/* Row 1 — three stat cards */}
      <div className="im-grid-top">

        {/* Incident Health Index */}
        <div className="im-card">
          <div className="im-card-head">
            <span className="im-label">INCIDENT HEALTH INDEX</span>
            <DeltaBadge value={snapshot_delta.open_incidents} lowerIsBetter />
          </div>
          <div className="im-health-top">
            <div className="im-health-score" style={{ color: healthColor }}>{health_score}</div>
            <div className="im-health-meta">
              <div className="im-health-status" style={{ color: healthColor }}>{healthLabel}</div>
              <div className="im-health-trend">{critical_trend}</div>
              <div className="im-health-target">Target ≥ 76</div>
            </div>
          </div>
          {/* Marker bar */}
          <div style={{ marginTop: 8 }}>
            <div className="dash-hbar-scale">
              <span>Critical</span><span>At Risk</span><span>Monitoring</span><span>Healthy</span>
            </div>
            <div className="dash-hbar-track">
              <div className="dash-hbar-marker" style={{ left: `${health_score}%` }} />
            </div>
          </div>
        </div>

        {/* Cost Exposure */}
        <div className="im-card">
          <div className="im-card-head">
            <span className="im-label">COST EXPOSURE</span>
            <span className="im-cost-status">
              {total_incidents.financial_total > 100_000 ? 'High' : total_incidents.financial_total > 10_000 ? 'Moderate' : 'Low'}
            </span>
          </div>
          <div>
            <div className="im-cost-caption">Estimated impact</div>
            <div className="im-cost-value">
              {total_incidents.financial_total > 0
                ? formatCurrency(total_incidents.financial_total)
                : '—'}
            </div>
          </div>
          <div className="im-cost-evidence">
            Open incidents: {total_incidents.open_count} &nbsp;·&nbsp;
            Critical exposure: {total_incidents.critical_exposure}
          </div>
          <div className="dash-metric-list" style={{ marginTop: 4 }}>
            <div className="dash-metric-row">
              <span>Total incidents</span><strong>{total_incidents.count}</strong>
            </div>
            <div className="dash-metric-row">
              <span>New / Open</span><strong>{lifecycle.new_count}</strong>
            </div>
            <div className="dash-metric-row">
              <span>Under Review</span><strong>{lifecycle.under_review}</strong>
            </div>
            <div className="dash-metric-row">
              <span>Resolved</span><strong>{lifecycle.resolved}</strong>
            </div>
          </div>
        </div>

        {/* Resolution Performance */}
        <div className="im-card">
          <div className="im-card-head">
            <span className="im-label">RESOLUTION PERFORMANCE</span>
            <DeltaBadge value={snapshot_delta.avg_mttr} lowerIsBetter />
          </div>
          <div className="im-resolve-val">{mttr != null ? `${mttr}d` : '—'}</div>
          <div className="im-resolve-cap">Mean time to resolve</div>
          {mttr != null && (
            <div className="dash-bar-wrap" style={{ marginTop: 6 }}>
              <div
                className="dash-bar-fill"
                style={{
                  width: `${resolveBarPct}%`,
                  background: resolveBarPct <= 75 ? '#01b88e' : resolveBarPct <= 100 ? '#f59e0b' : '#ef4444',
                }}
              />
            </div>
          )}
          <div className="im-resolve-meta">
            <div className="im-resolve-row">
              <span>vs SLA target ({SLA_TARGET_DAYS}d)</span>
              {slaDelta !== null ? (
                <strong className={slaGood ? 'im-good' : 'im-bad'}>
                  {slaGood ? `${slaDelta}d faster` : `${Math.abs(Number(slaDelta))}d slower`}
                </strong>
              ) : <strong>—</strong>}
            </div>
            <div className="im-resolve-row">
              <span>Critical trend</span>
              <strong className={sla_pct <= 10 ? 'im-good' : sla_pct <= 25 ? '' : 'im-bad'}>
                {critical_trend}
              </strong>
            </div>
            <div className="im-resolve-row">
              <span>Data points</span><strong>{data_points}</strong>
            </div>
          </div>
          <div className="dash-trend-note" style={{ marginTop: 4 }}>
            {mttr == null
              ? 'No resolved incidents yet.'
              : resolveBarPct <= 75
                ? 'Resolution is strong and within SLA.'
                : resolveBarPct <= 100
                  ? 'Trending toward SLA threshold.'
                  : 'SLA exceeded — requires attention.'}
          </div>
        </div>

      </div>

      {/* Row 2 */}
      <div className="im-grid-bot">

        {/* Incident Trend */}
        <div className="im-card">
          <div className="im-card-head">
            <span className="im-label">INCIDENT TREND</span>
            <div className="im-trend-head-right">
              <span className="im-trend-sub">6-month rolling</span>
              <div className="im-trend-legend">
                <span className="im-legend-item">
                  <span className="im-legend-dot navy" />Created
                </span>
                <span className="im-legend-item">
                  <span className="im-legend-dot emerald" />Resolved
                </span>
              </div>
            </div>
          </div>
          {incident_velocity.length > 0 ? (
            <div className="dash-chart-wrap">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={incident_velocity}
                  margin={{ top: 4, right: 4, bottom: 0, left: -20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--muted)' }} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} allowDecimals={false} />
                  <RTooltip contentStyle={{ fontSize: 12, borderRadius: 6 }} />
                  <Bar dataKey="created" name="Created" fill="#1F2854" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="resolved" name="Resolved" fill="#01b88e" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="dash-empty">No incident data in this period.</div>
          )}
        </div>

        {/* Top Incident Drivers */}
        <div className="im-card">
          <div className="im-card-head">
            <span className="im-label">TOP INCIDENT DRIVERS</span>
          </div>
          {top_open_incidents.length > 0 ? (
            <div className="dash-tbl-wrap">
              <table className="dash-tbl">
                <thead>
                  <tr>
                    <th>Incident</th><th>Category</th><th>Severity</th><th>Age</th>
                  </tr>
                </thead>
                <tbody>
                  {top_open_incidents.map((inc: TopIncident) => (
                    <tr key={inc.id}>
                      <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{inc.id}</td>
                      <td>{inc.category ?? '—'}</td>
                      <td>
                        <span style={{
                          fontSize: 11, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                          background: `${severityColor(inc.severity)}22`,
                          color: severityColor(inc.severity),
                        }}>
                          {inc.severity ?? '—'}
                        </span>
                      </td>
                      <td>{daysSince(inc.reported_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="dash-empty">No open incidents.</div>
          )}
        </div>

      </div>

      {/* AI Insights (static — Phase 7 adds narrative generation) */}
      <div className="im-card im-ai-card">
        <div className="im-card-head">
          <span className="im-label">AI INSIGHTS</span>
          <span className="im-badge">Executive</span>
        </div>
        <div className="im-ai-body">
          {total_incidents.count === 0
            ? 'No incidents recorded. Log incidents to generate insights.'
            : `${total_incidents.count} total incidents with ${total_incidents.open_count} open.
              ${total_incidents.critical_exposure > 0
                ? `${total_incidents.critical_exposure} critical or high-severity incident(s) require immediate action.`
                : 'No critical incidents open.'
              }
              ${mttr != null
                ? `Mean resolution time: ${mttr}d vs ${SLA_TARGET_DAYS}d SLA.`
                : ''
              }`
          }
        </div>
        <div className="dash-ai-note">
          AI-assisted narrative generation is available in the Report Builder.
        </div>
      </div>

    </div>
  );
}
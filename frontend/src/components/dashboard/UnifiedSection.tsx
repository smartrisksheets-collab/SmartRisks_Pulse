import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
} from 'recharts';
import type { DashboardData } from '../../types/dashboard';
import { DEFAULT_CURRENCY } from '../../utils/constants';

const SLA_TARGET_DAYS = 5;

const CAT_COLORS = [
  '#1F2854', '#01b88e', '#3b82f6', '#f59e0b',
  '#10b981', '#8b5cf6', '#ef4444', '#14b8a6',
];

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

interface Props {
  data: DashboardData;
}

export default function UnifiedSection({ data }: Props) {
  const {
    kpis,
    incident_health,
    total_incidents,
    avg_resolution,
    risks_by_category,
    incident_velocity,
    residual_trend,
    snapshot_delta,
  } = data;

  // Enterprise health = risk health
  const exposure = Math.min(100, Math.round((kpis.risk_severity_avg / 25) * 100));
  const enterpriseHealth = Math.max(0, 100 - exposure);
  const healthColor =
    enterpriseHealth >= 76 ? '#10b981'
    : enterpriseHealth >= 51 ? '#14b8a6'
    : enterpriseHealth >= 26 ? '#f59e0b'
    : '#ef4444';
  const healthLabel =
    enterpriseHealth >= 76 ? 'Healthy'
    : enterpriseHealth >= 51 ? 'Monitoring'
    : enterpriseHealth >= 26 ? 'At Risk'
    : 'Critical';

  const pressurePct = kpis.total_risks > 0
    ? Math.round((kpis.high_risks / kpis.total_risks) * 100)
    : 0;
  const pressureColor = pressurePct > 30 ? '#ef4444' : pressurePct > 15 ? '#f59e0b' : '#10b981';

  const mttr = avg_resolution.days;
  const resolveBarPct = mttr != null
    ? Math.min(100, Math.round((mttr / SLA_TARGET_DAYS) * 100))
    : 0;
  const slaDelta = mttr != null ? (SLA_TARGET_DAYS - mttr).toFixed(1) : null;
  const slaGood = slaDelta !== null && Number(slaDelta) >= 0;

  // Category donut data
  const riskCatData = Object.entries(risks_by_category)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, value]) => ({ name, value }));

  // Impact drivers: top risk categories by count
  const impactDrivers = Object.entries(risks_by_category)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const maxDriverCount = impactDrivers[0]?.[1] ?? 1;

  // Dual-axis trend: residual_trend + incident_velocity merged by label
  const trendLabels = [
    ...new Set([
      ...residual_trend.map((p) => p.label),
      ...incident_velocity.map((v) => v.label),
    ]),
  ].slice(-6);

  const resMap = Object.fromEntries(residual_trend.map((p) => [p.label, p.avg]));
  const velMap = Object.fromEntries(incident_velocity.map((v) => [v.label, v.created]));
  const trendData = trendLabels.map((label) => ({
    label,
    residual: resMap[label] ?? null,
    incidents: velMap[label] ?? null,
  }));

  return (
    <div className="dash-section">

      {/* Row 1 — three stat cards */}
      <div className="im-grid-top">

        {/* Enterprise Risk Health */}
        <div className="im-card">
          <div className="im-card-head">
            <span className="im-label">ENTERPRISE RISK HEALTH</span>
            <div className="im-head-signals">
              <DeltaBadge value={snapshot_delta.health_delta} lowerIsBetter={false} />
              <div className="im-confidence">
                <span className="im-confidence-dot" />High Confidence
              </div>
            </div>
          </div>
          <div className="im-exposure-top">
            <div className="im-exposure-score" style={{ color: healthColor }}>
              {enterpriseHealth}
            </div>
            <div className="im-exposure-meta">
              <div className="im-exposure-status" style={{ color: healthColor }}>
                {healthLabel}
              </div>
              <div className="im-exposure-change">
                {snapshot_delta.has_data
                  ? `${snapshot_delta.period_label}`
                  : 'No baseline yet'}
              </div>
              <div className="im-exposure-target">Risk appetite threshold: 80</div>
            </div>
          </div>
          <div className="im-exposure-divider" />
          <div className="im-exposure-grid">
            <div className="im-exposure-item">
              <div className="im-exposure-label">Residual Risk</div>
              <div className="im-exposure-value">
                {kpis.risk_severity_avg > 0 ? kpis.risk_severity_avg.toFixed(1) : '—'}
              </div>
            </div>
            <div className="im-exposure-item">
              <div className="im-exposure-label">Incident Health</div>
              <div className="im-exposure-value">{incident_health.health_score}</div>
            </div>
            <div className="im-exposure-item">
              <div className="im-exposure-label">Financial Exposure</div>
              <div className="im-exposure-value">
                {total_incidents.financial_total > 0
                  ? formatCurrency(total_incidents.financial_total)
                  : '—'}
              </div>
            </div>
          </div>
          <div className="im-exposure-driver">
            {kpis.high_risks > 0
              ? `${kpis.high_risks} High/Critical risk(s) driving exposure.`
              : 'No High or Critical risks active.'}
          </div>
        </div>

        {/* Risk Pressure */}
        <div className="im-card">
          <div className="im-card-head">
            <span className="im-label">RISK PRESSURE</span>
            <DeltaBadge value={snapshot_delta.high_risk_count} lowerIsBetter />
          </div>
          <div className="im-pressure-bar">
            <div
              className="im-pressure-fill"
              style={{ width: `${pressurePct}%`, background: pressureColor }}
            />
          </div>
          <div className="im-metric-list">
            <div className="im-row">
              <span>Active Risks</span><strong>{kpis.total_risks}</strong>
            </div>
            <div className="im-row">
              <span>High / Critical</span><strong>{kpis.high_risks}</strong>
            </div>
            <div className="im-row">
              <span>Open Incidents</span><strong>{kpis.open_incidents}</strong>
            </div>
            <div className="im-row">
              <span>Critical Incidents</span><strong>{total_incidents.critical_exposure}</strong>
            </div>
            <div className="im-row">
              <span>Pressure Score</span>
              <strong style={{ color: pressureColor }}>{pressurePct}%</strong>
            </div>
          </div>
        </div>

        {/* Incident Performance */}
        <div className="im-card">
          <div className="im-card-head">
            <span className="im-label">INCIDENT PERFORMANCE</span>
            <DeltaBadge value={snapshot_delta.avg_mttr} lowerIsBetter />
          </div>
          <div className="im-resolve-val">{mttr != null ? `${mttr}d` : '—'}</div>
          <div className="im-resolve-cap">Incident MTTR</div>
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
              <span>SLA Compliance</span>
              <strong className={slaGood ? 'im-good' : 'im-bad'}>
                {slaDelta !== null
                  ? slaGood ? `${slaDelta}d faster` : `${Math.abs(Number(slaDelta))}d over`
                  : '—'}
              </strong>
            </div>
            <div className="im-resolve-row">
              <span>Control Strength</span>
              <strong className="im-good">
                {kpis.control_effectiveness_avg > 0
                  ? `${Math.round(kpis.control_effectiveness_avg)}%`
                  : '—'}
              </strong>
            </div>
          </div>
          <div className="dash-trend-note" style={{ marginTop: 4 }}>
            {incident_health.critical_trend}
          </div>
        </div>

      </div>

      {/* Exposure Impact Drivers — full width */}
      <div className="im-card">
        <div className="im-card-head">
          <span className="im-label">EXPOSURE IMPACT DRIVERS</span>
        </div>
        {impactDrivers.length > 0 ? (
          <div className="im-impact-list">
            {impactDrivers.map(([name, count]) => (
              <div key={name} className="im-impact-row">
                <span className="im-impact-name">{name}</span>
                <div className="im-impact-bar-wrap">
                  <div
                    className="im-impact-bar-fill"
                    style={{ width: `${Math.round((count / maxDriverCount) * 100)}%` }}
                  />
                </div>
                <span className="im-impact-val">{count} risk{count !== 1 ? 's' : ''}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="dash-empty">No risk categories defined.</div>
        )}
      </div>

      {/* Row 2 */}
      <div className="im-grid-bot">

        {/* Exposure Trend — dual axis */}
        <div className="im-card">
          <div className="im-card-head">
            <span className="im-label">EXPOSURE TREND</span>
            <div className="im-trend-head-right">
              <div className="im-trend-legend">
                <span className="im-legend-item">
                  <span className="im-legend-dot navy" />Residual Risk
                </span>
                <span className="im-legend-item">
                  <span className="im-legend-dot emerald" />Incidents
                </span>
              </div>
              <span className="im-trend-sub">6-month movement</span>
            </div>
          </div>
          {trendData.length > 0 ? (
            <div className="dash-chart-wrap">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--muted)' }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11, fill: 'var(--muted)' }} domain={[0, 25]} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: 'var(--muted)' }} allowDecimals={false} />
                  <RTooltip contentStyle={{ fontSize: 12, borderRadius: 6 }} />
                  <Line
                    yAxisId="left" type="monotone" dataKey="residual"
                    name="Avg Residual" stroke="#1F2854" strokeWidth={2}
                    dot={{ fill: '#1F2854', r: 3 }} activeDot={{ r: 5 }}
                    connectNulls
                  />
                  <Line
                    yAxisId="right" type="monotone" dataKey="incidents"
                    name="Incidents" stroke="#01b88e" strokeWidth={2}
                    dot={{ fill: '#01b88e', r: 3 }} activeDot={{ r: 5 }}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="dash-empty">Trend data will appear once risks have logged dates.</div>
          )}
        </div>

        {/* Risk & Incident Distribution */}
        <div className="im-card">
          <div className="im-card-head">
            <span className="im-label">RISK & INCIDENT DISTRIBUTION</span>
          </div>
          <div className="im-donut-grid">
            <div className="im-donut-box">
              <div className="im-donut-title">Risk Categories</div>
              {riskCatData.length > 0 ? (
                <ResponsiveContainer width={130} height={130}>
                  <PieChart>
                    <Pie data={riskCatData} cx="50%" cy="50%" innerRadius={30} outerRadius={55} paddingAngle={2} dataKey="value">
                      {riskCatData.map((_, i) => (
                        <Cell key={i} fill={CAT_COLORS[i % CAT_COLORS.length]} />
                      ))}
                    </Pie>
                    <RTooltip contentStyle={{ fontSize: 12, borderRadius: 6 }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="dash-empty" style={{ fontSize: 11 }}>No data</div>
              )}
              <div className="im-trend-legend">
                {riskCatData.slice(0, 3).map((d, i) => (
                  <span key={d.name} className="im-legend-item">
                    <span className="im-legend-dot" style={{ background: CAT_COLORS[i % CAT_COLORS.length] }} />
                    {d.name}
                  </span>
                ))}
              </div>
            </div>
            <div className="im-donut-divider" />
            <div className="im-donut-box">
              <div className="im-donut-title">Incident Velocity</div>
              {incident_velocity.length > 0 ? (
                <ResponsiveContainer width={130} height={130}>
                  <BarChart data={incident_velocity.slice(-4)} margin={{ top: 4, right: 0, bottom: 0, left: -28 }}>
                    <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'var(--muted)' }} />
                    <YAxis tick={{ fontSize: 9, fill: 'var(--muted)' }} allowDecimals={false} />
                    <RTooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} />
                    <Bar dataKey="created" name="Created" fill="#1F2854" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="resolved" name="Resolved" fill="#01b88e" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="dash-empty" style={{ fontSize: 11 }}>No data</div>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* Executive Intelligence */}
      <div className="im-card im-ai-card">
        <div className="im-card-head">
          <span className="im-label">EXECUTIVE INTELLIGENCE</span>
          <span className="im-badge">AI</span>
        </div>
        <div className="im-ai-body">
          {kpis.total_risks === 0 && total_incidents.count === 0
            ? 'No risk or incident data yet. Add records to enable intelligence reporting.'
            : `Enterprise posture: ${kpis.total_risks} active risks (${kpis.high_risks} High/Critical) and ${total_incidents.count} total incidents (${total_incidents.open_count} open).
              Risk health score: ${enterpriseHealth}/100.
              Incident health: ${incident_health.health_score}/100 — ${incident_health.label}.
              ${total_incidents.financial_total > 0 ? `Financial exposure: ${formatCurrency(total_incidents.financial_total)}.` : ''}`
          }
        </div>
        <div className="im-ai-footer">
          <div className="im-ai-note">
            AI-assisted insights support decision-making. Validate alongside professional judgment.
          </div>
          <div className="im-ai-status">
            ● Risk &amp; Incident data active — unified analytics enabled
          </div>
        </div>
      </div>

    </div>
  );
}
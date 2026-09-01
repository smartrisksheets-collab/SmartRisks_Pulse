import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip as RTooltip,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  BarChart,
  Bar,
} from 'recharts';
import type { DashboardData, KPISummary, TopRisk, TrendPoint } from '../../types/dashboard';
import ActivityFeed from './ActivityFeed';
import { useQuery } from '@tanstack/react-query';
import { fetchExecInsight } from '../../services/dashboard';
import type { ExecInsight, ActionItem } from '../../types/dashboard';

// ── Color helpers (match GAS health bands exactly) ────────────────────────────

function healthColor(h: number): string {
  if (h >= 76) return '#10b981';
  if (h >= 51) return '#14b8a6';
  if (h >= 26) return '#f59e0b';
  return '#ef4444';
}

function healthLabel(h: number): string {
  if (h >= 76) return 'Healthy';
  if (h >= 51) return 'Monitoring';
  if (h >= 26) return 'At Risk';
  return 'Critical';
}

// GAS: health <= 25 = 'down', <= 50 = 'warn', <= 75 = '', > 75 = 'up'
function healthStatusCls(h: number): string {
  if (h <= 25) return 'down';
  if (h <= 50) return 'warn';
  if (h <= 75) return 'neutral';
  return 'up';
}

function levelTextColor(level: string | null): string {
  const l = (level ?? '').toLowerCase();
  if (l === 'critical' || l === 'extreme') return '#b91c1c';
  if (l === 'high')                        return '#dc2626';
  if (l === 'medium')                      return '#b45309';
  return '#059669';
}

// GAS donut palette: ['#1F2854','#01b88e','#94a3b8','#f59e0b','#ef4444']
const CAT_COLORS = ['#1F2854', '#01b88e', '#94a3b8', '#f59e0b', '#ef4444'];

// ── Semicircle gauge ──────────────────────────────────────────────────────────
// GAS: Chart.js doughnut, rotation:-90, circumference:180 = pure semicircle
// Container: position:relative; height:140px  (.sr-gauge-wrap)
// Text: position:absolute; left:50%; bottom:14px  (.sr-gauge-center)
//
// SVG approach: viewBox "0 0 200 100", cy=100 (arc base at container bottom)
// width="100%" height="140" → scale = min(cardWidth/200, 140/100) = 1.4
// At scale 1.4: r=90 renders as 252px diameter, strokeWidth=10 renders as 14px

function ExposureGauge({ health, exposure }: { health: number; exposure: number }) {
  const r        = 88;
  const cx       = 100;
  const cy       = 100;
  const circ     = 2 * Math.PI * r;
  const halfCirc = circ / 2;
  const clamped  = Math.max(0, Math.min(100, health));
  const fillLen  = (clamped / 100) * halfCirc;
  const color    = healthColor(clamped);
  const offset   = halfCirc;

  const [animatedFill, setAnimatedFill] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setAnimatedFill(fillLen), 50);
    return () => clearTimeout(t);
  }, [fillLen]);

  return (
    <div className="rs-gauge-wrap">
      <svg
        viewBox="0 0 200 100"
        width="100%" height="140"
        aria-label={`Health score ${health}`}
      >
        {/* Background track — full semicircle */}
        <circle cx={cx} cy={cy} r={r} fill="none"
          stroke="var(--line)" strokeWidth="16"
          strokeDasharray={`${halfCirc} ${halfCirc}`}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
        {/* Value arc — animates from 0 to fill on mount */}
        <circle cx={cx} cy={cy} r={r} fill="none"
          stroke={color} strokeWidth="16"
          strokeDasharray={`${animatedFill} ${circ - animatedFill}`}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.8s ease-out' }}
        />
      </svg>
      {/* Text overlay */}
      <div className="rs-gauge-overlay">
        <div className="rs-gauge-num" style={{ color }}>{health}</div>
        <div className="rs-gauge-lbl">Health</div>
        <div className="rs-gauge-sub">Exposure: {exposure}%</div>
      </div>
    </div>
  );
}

// ── Trend insight builder — mirrors GAS buildInsight() ───────────────────────

function buildTrendInsight(points: TrendPoint[], index: number): string {
  const cur   = points[index].avg;
  const prev  = index > 0 ? points[index - 1].avg : cur;
  const delta = cur - prev;
  const dir   = delta < -0.5 ? 'improving ▼' : delta > 0.5 ? 'deteriorating ▲' : 'stable →';
  const avgs  = points.map(p => p.avg);
  const range = Math.max(...avgs) - Math.min(...avgs);
  const vol   = range >= 5 ? 'High volatility.' : range >= 2 ? 'Moderate variability.' : 'Controlled movement.';
  return `<strong>${points[index].label}:</strong> Avg residual <b>${cur}</b> — ${dir}. ${vol}`;
}

// ── Action Plan Modal ─────────────────────────────────────────────────────────

function ActionPlanModal({ open, onClose, insight, assignedOwners, onSetOwner }: {
  open: boolean;
  onClose: () => void;
  insight: ExecInsight;
  assignedOwners: Record<number, string>;
  onSetOwner: (sentenceNum: number, value: string) => void;
}) {
  if (!open) return null;

  function exportPDF() {
    const rows = insight.action_items.map(item => {
      const owner = assignedOwners[item.sentence_num] ?? '';
      return `
        <div style="margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid #e5e7eb;">
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#01b88e;margin-bottom:4px;">${item.source_label}</div>
          <div style="font-size:14px;font-weight:700;color:#1F2854;margin-bottom:6px;">${item.title}</div>
          <div style="font-size:12px;color:#047857;background:#e3f7f1;border-radius:6px;padding:6px 10px;display:inline-block;margin-bottom:6px;"><strong>Done when:</strong> ${item.done_when}</div>
          ${owner ? `<div style="font-size:11px;color:#64748b;margin-top:4px;">Owner: <strong>${owner}</strong></div>` : ''}
        </div>`;
    }).join('');

    const html = `<!DOCTYPE html><html><head><title>30-Day Action Plan</title>
      <style>body{font-family:system-ui,sans-serif;padding:32px;max-width:720px;margin:0 auto;color:#1F2854;}</style>
      </head><body>
      <h2 style="margin:0 0 4px;font-size:20px;">30-Day Action Plan</h2>
      <p style="font-size:12px;color:#64748b;margin:0 0 8px;">Built from this cycle's Executive Insights. Near-term response, not a maturity roadmap.</p>
      <p style="font-size:13px;color:#334155;line-height:1.7;background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:12px 16px;margin-bottom:24px;">${insight.summary}</p>
      ${rows}
      <p style="font-size:10px;color:#94a3b8;margin-top:24px;">AI-assisted. Validate alongside professional judgment.</p>
      </body></html>`;

    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
  }

  return (
    <div className="dl-modal-back z-top" onClick={onClose}>
      <div className="dl-modal xl" onClick={e => e.stopPropagation()}>
        <div className="ap-modal-hd">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <p className="ap-modal-title">30-Day Action Plan</p>
              <p className="ap-modal-sub">Built directly from this cycle's Executive Insights — not a generic checklist.</p>
            </div>
            <button className="dl-modal-x lg" onClick={onClose}>✕</button>
          </div>
          <span className="ap-horizon-tag">⚡ Near-term response, not a maturity roadmap</span>
        </div>
        <div className="dl-modal-bd" style={{ padding: '20px 24px' }}>
          <div className="ap-basis-note">
            Each action below responds directly to one fact from this cycle's summary. <strong>Nothing here is generic advice.</strong> If a fact changes next cycle, this plan changes with it.
          </div>
          <div className="ap-action-list">
            {insight.action_items.map((item: ActionItem, idx: number) => (
              <div key={idx} className="ap-action-item">
                {/* Display position, not sentence_num. sentence_num is a stable
                    identity for the summary sentence this action came from and
                    has gaps when a sentence is omitted for missing data, so it
                    would show a list starting at 2 on a new workspace. It stays
                    the key for owner assignment below. */}
                <div className="ap-action-num">{idx + 1}</div>
                <div className="ap-action-body">
                  <div className="ap-action-source">{item.source_label}</div>
                  <div className="ap-action-title">{item.title}</div>
                  <div className="ap-action-done"><strong>Done when:</strong> {item.done_when}</div>
                  {insight.owners.length > 0 && (
                    <div className="ap-owner-row">
                      <span>Owner:</span>
                      <select
                        value={assignedOwners[item.sentence_num] ?? ''}
                        onChange={e => onSetOwner(item.sentence_num, e.target.value)}
                      >
                        <option value="">— Assign —</option>
                        {insight.owners.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="ap-modal-footer">
          <span className="ap-footer-note">Regenerates automatically each cycle as Executive Insights updates.</span>
          <button className="btn btn-secondary btn-compact" onClick={exportPDF}>Export as PDF</button>
        </div>
      </div>
    </div>
  );
}

// ── Executive Insights card with AI summary ───────────────────────────────────

function ExecInsightCard({ totalRisks }: { totalRisks: number }) {
  const [planOpen, setPlanOpen] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['exec-insights'],
    queryFn:  () => fetchExecInsight(),
    staleTime: 30 * 60 * 1000,
    enabled:   totalRisks > 0,
  });

  const [ownersState, setOwnersState] = useState<{ summary: string; owners: Record<number, string> }>({
    summary: '',
    owners: {},
  });

  const assignedOwners = ownersState.summary === (data?.summary ?? '')
    ? ownersState.owners
    : {};

  function setOwner(sentenceNum: number, value: string) {
    setOwnersState(prev => ({
      summary: data?.summary ?? '',
      owners: { ...prev.owners, [sentenceNum]: value },
    }));
  }

  if (totalRisks === 0) {
    return <div className="rs-exec-empty">No risks recorded. Add risks to the register to generate insights.</div>;
  }
  if (isLoading) {
    return <div className="ap-loading">Generating executive insights…</div>;
  }
  if (isError || !data) {
    return <div className="rs-exec-empty">Could not generate insights. Check AI is enabled in Settings.</div>;
  }

  return (
    <>
      <div className="rs-risk-narrative" dangerouslySetInnerHTML={{ __html: data.summary }} />
      <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
        <button className="ap-plan-link" onClick={() => setPlanOpen(true)}>
          💬 What should we do about this? →
        </button>
      </div>
      {planOpen && (
        <ActionPlanModal
          open={planOpen}
          onClose={() => setPlanOpen(false)}
          insight={data}
          assignedOwners={assignedOwners}
          onSetOwner={setOwner}
        />
      )}
    </>
  );
}

// ── Pressure modal ────────────────────────────────────────────────────────────

function PressureModal({
  open, onClose, kpis, topRisks, pressurePct,
}: {
  open: boolean; onClose: () => void;
  kpis: KPISummary; topRisks: TopRisk[]; pressurePct: number;
}) {
  if (!open) return null;
  const pressureLevel = kpis.high_risks * 4 >= 60 ? 'Critical' : kpis.high_risks * 4 >= 35 ? 'Elevated' : 'Stable';
  const highSharePct  = kpis.total_risks > 0 ? Math.round((kpis.high_risks / kpis.total_risks) * 100) : 0;
  const reco = pressurePct > 30
    ? 'High-risk concentration is critical. Prioritize treatment of highest residual risks, review controls below effectiveness thresholds, and escalate immediately.'
    : pressurePct > 15
      ? 'Risk posture is elevated. Monitor closely and address risks approaching threshold scores before they worsen.'
      : 'Risk posture is within acceptable bounds. Continue routine monitoring.';

  return (
    <div className="dl-modal-back z-top" onClick={onClose}>
      <div className="dl-modal lg" onClick={e => e.stopPropagation()}>
        <div className="dl-modal-hd flat">
          <span>Risk Pressure — Insights</span>
          <button className="dl-modal-x md" onClick={onClose}>✕</button>
        </div>

        {/* Section 1: Stress indicators */}
        <div style={{ marginBottom: 18 }}>
          <div className="dl-section-lbl navy" style={{ marginBottom: 10 }}>Forward-Looking Stress Indicators</div>
          <div className="dl-panel">
            {[
              { label: 'High-risk concentration', value: `${kpis.high_risks} risks (${highSharePct}%)` },
              { label: 'Avg residual score',       value: kpis.risk_severity_avg > 0 ? kpis.risk_severity_avg.toFixed(1) : '—' },
              { label: 'Pressure level',           value: pressureLevel },
            ].map(({ label, value }) => (
              <div key={label} className="dl-panel-row">
                <span>{label}</span><strong>{value}</strong>
              </div>
            ))}
          </div>
        </div>

        {/* Section 2: Top pressure drivers table */}
        <div style={{ marginBottom: 18 }}>
          <div className="dl-section-lbl navy" style={{ marginBottom: 10 }}>Top Pressure Drivers</div>
          <div className="dash-tbl-wrap">
            <table className="dash-tbl">
              <thead><tr><th>Risk ID</th><th>Description</th><th>Residual</th><th>Level</th></tr></thead>
              <tbody>
                {topRisks.slice(0, 3).length > 0
                  ? topRisks.slice(0, 3).map(r => (
                      <tr key={r.id}>
                        <td style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{r.id}</td>
                        <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.description ?? ''}>{r.description ?? '—'}</td>
                        <td style={{ textAlign: 'center' }}>{r.residual != null ? Math.round(r.residual) : '—'}</td>
                        <td style={{ textAlign: 'center', color: levelTextColor(r.level), fontWeight: 700 }}>{r.level ?? '—'}</td>
                      </tr>
                    ))
                  : <tr><td colSpan={4} className="dash-empty">No data</td></tr>
                }
              </tbody>
            </table>
          </div>
        </div>

        {/* Section 3: Recommendation */}
        <div>
          <div className="dl-section-lbl navy">Recommended Focus</div>
          <div className="dl-body-text">{reco}</div>
        </div>
      </div>
    </div>
  );
}

// ── Distribution modal ────────────────────────────────────────────────────────

function DistributionModal({
  open, onClose, catData,
}: {
  open: boolean; onClose: () => void;
  catData: Array<{ name: string; value: number }>;
}) {
  if (!open) return null;
  const chartData = [...catData].sort((a, b) => b.value - a.value).slice(0, 10);

  return (
    <div className="dl-modal-back z-top" onClick={onClose}>
      <div className="dl-modal lg" onClick={e => e.stopPropagation()}>
        <div className="dl-modal-hd flat">
          <span>Risk Distribution — Detail</span>
          <button className="dl-modal-x md" onClick={onClose}>✕</button>
        </div>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={Math.max(320, chartData.length * 52)}>
            <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }}>
              <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--muted)' }} allowDecimals={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: 'var(--text)' }} width={120} />
              <RTooltip contentStyle={{ fontSize: 12, borderRadius: 6 }} />
              <Bar dataKey="value" name="Risks" fill="#01b88e" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="dash-empty">No category data yet.</div>
        )}
      </div>
    </div>
  );
}

// ── Incident upsell modal ─────────────────────────────────────────────────────

function IncidentUpsellModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="dl-modal-back z-top" onClick={onClose}>
      <div className="dl-modal xs" onClick={e => e.stopPropagation()}>
        <div className="dl-modal-hd flat">
          <span>Incident Management — What it adds</span>
          <button className="dl-modal-x md" onClick={onClose}>✕</button>
        </div>
        <div className="dl-body-text">
          <strong>Enable the Incident module to:</strong>
          <ul className="dl-upsell-list">
            <li>Link real incidents to risk exposure automatically</li>
            <li>Quantify residual risk movement from events</li>
            <li>Surface control breakdown patterns early</li>
            <li>Track MTTR and SLA compliance over time</li>
            <li>Strengthen audit defensibility and reporting</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  data: DashboardData;
}

export default function RiskSection({ data }: Props) {
  const { kpis, snapshot_delta, risks_by_category, top_risks, residual_trend, activity_feed } = data;

  const navigate = useNavigate();
  const [pressureOpen, setPressureOpen] = useState(false);
  const [distOpen,     setDistOpen]     = useState(false);
  const [upsellOpen,   setUpsellOpen]   = useState(false);
  const [trendInsight, setTrendInsight] = useState('Hover the chart for monthly detail.');

  const avgResidual  = kpis.risk_severity_avg;
  const exposure     = Math.min(100, Math.round((avgResidual / 25) * 100));
  const health       = Math.max(0, 100 - exposure);
  const pressurePct  = kpis.total_risks > 0 ? Math.round((kpis.high_risks / kpis.total_risks) * 100) : 0;
  const pressureColor = pressurePct > 30 ? '#ef4444' : pressurePct > 15 ? '#f59e0b' : '#10b981';
  const hStatusCls   = healthStatusCls(health);
  const hLabel       = healthLabel(health);

  // Donut: top 3 categories only — matches GAS slice(0,3)
  const catData    = Object.entries(risks_by_category).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name, value]) => ({ name, value }));
  const allCatData = Object.entries(risks_by_category).map(([name, value]) => ({ name, value }));

  const pressureText = pressurePct > 30
    ? 'High-risk concentration — intervention recommended.'
    : pressurePct > 15
      ? 'Risk posture elevated — monitor closely.'
      : 'Risk posture within acceptable thresholds.';

  return (
    <div className="dash-section">

      {/* ── Row 1: 1.2fr 1fr 1fr — gauge card is wider, matches GAS .sr-grid-top ── */}
      <div className="rs-grid-top">

        {/* Card 1: Risk Health
            GAS .sr-hero: border-top:3px solid var(--sr-emerald)
            GAS .sr-gauge-wrap: height:140px; position:relative */}
        <div className="im-card">
          <div className="im-card-head">
            <span className="im-label">RISK HEALTH</span>
            <div className="rs-signal-col">
              <div className="rs-signal-row">
                {/* Signal 1: current health status label */}
                <span className={`sr-delta ${hStatusCls}`}>{hLabel}</span>
                {/* Signal 2: month-over-month % change pill */}
                {snapshot_delta.has_data && snapshot_delta.health_delta !== null && (
                  <span
                    className={`sr-delta ${snapshot_delta.health_delta > 0 ? 'up' : 'down'}`}
                    title={`Health is ${snapshot_delta.health_delta > 0 ? 'up' : 'down'} ${Math.abs(snapshot_delta.health_delta)}% ${snapshot_delta.period_label}`}
                  >
                    {snapshot_delta.health_delta > 0 ? '▲' : '▼'}&nbsp;{Math.abs(snapshot_delta.health_delta)}%
                  </span>
                )}
              </div>
              {snapshot_delta.has_data && snapshot_delta.period_label && (
                <span className="dash-period">{snapshot_delta.period_label}</span>
              )}
            </div>
          </div>

          {/* Gauge — fixed 140px container with SVG arcs + absolute text overlay */}
          <ExposureGauge health={health} exposure={exposure} />

          {/* Legend — horizontal centered, matching GAS .sr-gauge-legend */}
          <div className="rs-legend">
            {[
              { color: '#ef4444', label: '0–25 Critical' },
              { color: '#f59e0b', label: '26–50 At Risk' },
              { color: '#14b8a6', label: '51–75 Monitoring' },
              { color: '#10b981', label: '76–100 Healthy' },
            ].map(b => (
              <span key={b.label} className="sr-band">
                <i className="sr-dot" style={{ background: b.color }} />
                {b.label}
              </span>
            ))}
          </div>
        </div>

        {/* Card 2: Risk Pressure */}
        <div className="im-card">
          <div className="im-card-head">
            <span className="im-label">RISK PRESSURE</span>
            {/* GAS: sr-ghost-btn opens pressure modal */}
            <button className="rs-ghost-btn" onClick={() => setPressureOpen(true)}>
              View insights →
            </button>
          </div>
          {/* GAS: height:5px; background:#eef2f7 */}
          <div className="rs-pressure-bar">
            <div className="rs-pressure-fill" style={{ width: `${pressurePct}%`, background: pressureColor }} />
          </div>
          {/* GAS: gap:12px between metric rows */}
          <div className="dash-metric-list">
            <div className="dash-metric-row"><span>Active risks</span><strong>{kpis.total_risks}</strong></div>
            <div className="dash-metric-row"><span>High / Critical</span><strong>{kpis.high_risks}</strong></div>
            <div className="dash-metric-row">
              <span>Avg severity score</span>
              <strong>{avgResidual > 0 ? avgResidual.toFixed(1) : '—'}</strong>
            </div>
            <div className="dash-metric-row">
              <span>Control strength</span>
              <strong>{kpis.control_effectiveness_avg > 0 ? `${Math.round(kpis.control_effectiveness_avg)}%` : '—'}</strong>
            </div>
            {kpis.open_incidents > 0 && (
              <div className="dash-metric-row"><span>Total incidents</span><strong>{kpis.open_incidents}</strong></div>
            )}
          </div>
          {/* GAS: border-top:1px dashed var(--sr-gray-200); font-size:12px */}
          <div className="rs-pressure-footer">{pressureText}</div>
        </div>

        {/* Card 3: Risk Distribution
            GAS: donut height 165px, legend horizontal centered, NO counts, top 3 only */}
        <div className="im-card">
          <div className="im-card-head">
            <span className="im-label">RISK DISTRIBUTION</span>
            <button className="rs-ghost-btn" onClick={() => setDistOpen(true)}>
              View all →
            </button>
          </div>
          {catData.length > 0 ? (
            <>
              {/* GAS: .sr-donut-wrap { height:165px } */}
              <div className="rs-donut-wrap">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={catData} cx="50%" cy="50%"
                      innerRadius="65%" outerRadius="95%"
                      paddingAngle={0} strokeWidth={0} dataKey="value"
                    >
                      {catData.map((_, i) => <Cell key={i} fill={CAT_COLORS[i % CAT_COLORS.length]} />)}
                    </Pie>
                    <RTooltip contentStyle={{ fontSize: 12, borderRadius: 6 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              {/* GAS: .sr-donut-legend { display:flex; justify-content:center; gap:12px; flex-wrap:wrap }
                  GAS: just category name, NO count numbers */}
              <div className="rs-donut-legend">
                {catData.map((d, i) => (
                  <span key={d.name} className="sr-band">
                    <i className="sr-dot" style={{ background: CAT_COLORS[i % CAT_COLORS.length] }} />
                    {d.name}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <div className="dash-empty">No category data yet.</div>
          )}
        </div>

      </div>

      {/* ── Row 2: trend + top risks ── */}
      <div className="dash-grid-2">

        {/* Residual Risk Trend
            GAS .sr-trend-insight: styled box with bg, border, padding
            GAS chart: fill area, custom navy tooltip, hover updates insight text */}
        <div className="im-card rs-card-tall">
          <div className="im-card-head">
            <span className="im-label">RESIDUAL RISK TREND</span>
            <span className="rs-trend-sub">6-month rolling average</span>
          </div>
          {/* GAS .sr-trend-insight: styled box — updates on hover */}
          <div className="dash-trend-note" dangerouslySetInnerHTML={{ __html: trendInsight }} />
          {residual_trend.length > 0 ? (
            <div className="rs-chart-170">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={residual_trend}
                  margin={{ top: 4, right: 4, bottom: 0, left: -20 }}
                  onMouseMove={e => {
                    const payload = (e as unknown as { activePayload?: Array<{ payload: { label: string } }> })?.activePayload;
                    if (Array.isArray(payload) && payload.length > 0) {
                      const label = payload[0]?.payload?.label;
                      const idx = residual_trend.findIndex(p => p.label === label);
                      if (idx >= 0) setTrendInsight(buildTrendInsight(residual_trend, idx));
                    }
                  }}
                  onMouseLeave={() => setTrendInsight('Hover the chart for monthly detail.')}
                >
                  <CartesianGrid stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} interval={0} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} domain={['auto', 'auto']} />
                  <RTooltip
                    contentStyle={{ background: '#1F2854', border: 'none', borderRadius: 8, padding: '8px 12px' }}
                    labelStyle={{ color: '#fff', fontWeight: 600, fontSize: 12 }}
                    itemStyle={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}
                  />
                  <Area
                    type="monotone" dataKey="avg" name="Avg residual"
                    stroke="#94a3b8" strokeWidth={2.5}
                    fill="rgba(31,40,84,0.06)"
                    dot={{ fill: '#1F2854', stroke: '#1F2854', r: 3 }}
                    activeDot={{ r: 5, fill: '#01b88e', stroke: 'none' }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="dash-empty">Add date-logged values to risks to see trend data.</div>
          )}
        </div>

        {/* Top Residual Risk Drivers — top 3, title tooltip, navy thead */}
        <div className="im-card rs-card-tall">
          <div className="im-card-head">
            <span className="im-label">TOP RESIDUAL RISK DRIVERS</span>
          </div>
          {top_risks.length > 0 ? (
            <>
              <div className="dash-tbl-wrap">
                <table className="dash-tbl">
                  <thead>
                    <tr><th>Risk ID</th><th>Description</th><th>Residual</th><th>Level</th></tr>
                  </thead>
                  <tbody>
                    {top_risks.slice(0, 3).map(r => (
                      <tr key={r.id}>
                        <td style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{r.id}</td>
                        <td
                          style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}
                          title={r.description ?? ''}
                        >
                          {r.description ?? '—'}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {r.residual != null ? Math.round(r.residual) : '—'}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: levelTextColor(r.level) }}>
                            {r.level ?? '—'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* GAS: sr-table-cta with → Risk Register button */}
              <div className="rs-cta-row">
                <button className="rs-cta-btn" onClick={() => navigate('/risks')}>→ Risk Register</button>
              </div>
            </>
          ) : (
            <div className="dash-empty">No risks on record.</div>
          )}
        </div>

      </div>

      {/* ── Operational Intelligence Feed ── */}
      <div className="im-card">
        <div className="im-card-head">
          <span className="im-label">OPERATIONAL INTELLIGENCE FEED</span>
          <span className="af-live-wrap">
            <span className="af-live-dot" />
            <span className="im-badge" style={{ background: '#e8faf5', color: '#18c29c' }}>Live</span>
          </span>
        </div>
        <ActivityFeed items={activity_feed} />
      </div>

      {/* ── Executive Insights
          GAS .sr-ai-card: border-top:3px solid var(--sr-navy)
          GAS .sr-ai-body: styled background box
          GAS .sr-cross-insight: border-top:1px dashed ── */}
      <div className="im-card">
        <div className="im-card-head">
          <span className="im-label">EXECUTIVE INSIGHTS</span>
          <span className="rs-exec-badge">Executive</span>
        </div>
        <ExecInsightCard totalRisks={kpis.total_risks} />
        {/* GAS .sr-cross-insight: border-top:1px dashed, font-size:12px */}
        <div className="rs-exec-footer">
          <div className="rs-exec-footer-row">
            <span>
              AI-assisted insights support decision-making. Validate alongside professional judgment.{' '}
              <a href="https://smartrisksheets.com/ai-transparency-data-use-statement/" target="_blank" rel="noopener noreferrer" className="rs-exec-learn">
                Learn more
              </a>
            </span>
            <div className="rs-exec-module">
              <button className="rs-info-btn" onClick={() => setUpsellOpen(true)} title="Learn about the Incident module">
                ⓘ
              </button>
              <span>Incident impact on residual exposure — module not enabled</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Modals ── */}
      <PressureModal  open={pressureOpen} onClose={() => setPressureOpen(false)} kpis={kpis} topRisks={top_risks} pressurePct={pressurePct} />
      <DistributionModal open={distOpen} onClose={() => setDistOpen(false)} catData={allCatData} />
      <IncidentUpsellModal open={upsellOpen} onClose={() => setUpsellOpen(false)} />

    </div>
  );
}
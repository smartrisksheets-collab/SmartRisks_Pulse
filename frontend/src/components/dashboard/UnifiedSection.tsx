// src/components/dashboard/UnifiedSection.tsx

import { useState, type ReactNode } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  BarChart,
  Bar,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
} from 'recharts';
import type { DashboardData } from '../../types/dashboard';
import OperationalFeed from './OperationalFeed';
import { useSettingsStore } from '../../store/settingsStore';
import { formatMoneyCompact } from '../../utils/format';

// ── Module-level constants ────────────────────────────────────────────────────

const SLA_TARGET_DAYS = 5;
const DONUT_PALETTE   = ['#01b88e', '#1F2854', '#94a3b8'] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function clamp(min: number, max: number, v: number): number {
  return Math.max(min, Math.min(max, v));
}

// ── Modal shell ───────────────────────────────────────────────────────────────

function UnifiedModal({
  title,
  onClose,
  wide,
  children,
}: {
  title: string;
  onClose: () => void;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="u-modal-backdrop" onClick={onClose}>
      <div
        className={`u-modal-box${wide ? ' u-modal-wide' : ''}`}
        onClick={e => e.stopPropagation()}
      >
        <div className="u-modal-head">
          <span>{title}</span>
          <button type="button" className="u-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="u-modal-body">{children}</div>
      </div>
    </div>
  );
}

// ── Modal content components (module-level — no inner component definitions) ──

interface PressureModalProps {
  pressure: number;
  pFillColor: string;
  pLabel: string;
  total: number;
  high: number;
  openInc: number;
  distRows: { cat: string; risks: number; incidents: number; score: number; label: string }[];
}

function PressureModalContent({
  pressure, pFillColor, pLabel, total, high, openInc, distRows,
}: PressureModalProps) {
  return (
    <>
      <div className="u-modal-kpis">
        <div className="u-modal-kpi">
          <div className="u-modal-kpi-label">Pressure Score</div>
          <div className="u-modal-kpi-value" style={{ color: pFillColor }}>{pressure}/100</div>
        </div>
        <div className="u-modal-kpi">
          <div className="u-modal-kpi-label">Active Risks</div>
          <div className="u-modal-kpi-value">{total}</div>
        </div>
        <div className="u-modal-kpi">
          <div className="u-modal-kpi-label">High / Very High</div>
          <div className="u-modal-kpi-value">{high}</div>
        </div>
        <div className="u-modal-kpi">
          <div className="u-modal-kpi-label">Open Incidents</div>
          <div className="u-modal-kpi-value">{openInc}</div>
        </div>
      </div>

      {distRows.length > 0 && (
        <div className="u-modal-section">
          <div className="u-modal-section-title">Pressure Distribution</div>
          <table className="u-modal-table">
            <thead>
              <tr>
                <th>Category</th>
                <th style={{ textAlign: 'center' }}>Risks</th>
                <th style={{ textAlign: 'center' }}>Incidents</th>
                <th>Score</th>
              </tr>
            </thead>
            <tbody>
              {distRows.map(r => (
                <tr key={r.cat}>
                  <td>{r.cat}</td>
                  <td style={{ textAlign: 'center' }}>{r.risks}</td>
                  <td style={{ textAlign: 'center' }}>{r.incidents}</td>
                  <td>
                    <span style={{
                      fontWeight: 700,
                      color: r.score >= 70 ? '#dc2626' : r.score >= 40 ? '#b45309' : '#059669',
                    }}>
                      {r.score} <span style={{ fontWeight: 400, fontSize: 11, color: 'var(--muted)' }}>({r.label})</span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="u-modal-section">
        <div className="u-modal-section-title">Pressure Drivers</div>
        <p>
          Operational exposure remains the primary contributor to risk pressure.
          Incident backlog and SLA breaches are sustaining residual exposure across categories.
          Pressure is rated <strong>{pLabel}</strong>.
        </p>
      </div>

      <div className="u-modal-section">
        <div className="u-modal-section-title">Recommended Actions</div>
        <p>
          1. Resolve operational incident backlog.{' '}
          2. Address SLA breaches before they compound residual exposure.{' '}
          3. Strengthen high-risk category controls.
        </p>
      </div>
    </>
  );
}

interface OperationsModalProps {
  incHealthPct: number;
  openCount: number;
  mttr: number | null;
  financialTotal: number;
  totalCount: number;
  slaCompliance: string;
  ctrlStrength: string;
  currency: string;
}

function OperationsModalContent({
  incHealthPct, openCount, mttr, financialTotal, totalCount, slaCompliance, ctrlStrength, currency,
}: OperationsModalProps) {
  return (
    <>
      <div className="u-modal-kpis">
        <div className="u-modal-kpi">
          <div className="u-modal-kpi-label">Incident Health Index</div>
          <div className="u-modal-kpi-value">{incHealthPct.toFixed(0)}%</div>
        </div>
        <div className="u-modal-kpi">
          <div className="u-modal-kpi-label">Open Incidents</div>
          <div className="u-modal-kpi-value">{openCount}</div>
        </div>
        <div className="u-modal-kpi">
          <div className="u-modal-kpi-label">Incident MTTR</div>
          <div className="u-modal-kpi-value">{mttr != null ? `${mttr}d` : '—'}</div>
        </div>
        <div className="u-modal-kpi">
          <div className="u-modal-kpi-label">Financial Exposure</div>
          <div className="u-modal-kpi-value">
            {financialTotal > 0 ? formatMoneyCompact(financialTotal, currency) : `${currency}0`}
          </div>
        </div>
      </div>

      <div className="u-modal-section">
        <div className="u-modal-section-title">Incident Overview</div>
        <table className="u-modal-table">
          <thead><tr><th>Metric</th><th>Value</th></tr></thead>
          <tbody>
            <tr><td>Total Incidents</td><td><strong>{totalCount}</strong></td></tr>
            <tr><td>Open Incidents</td><td><strong>{openCount}</strong></td></tr>
            <tr><td>Total Financial Exposure</td><td><strong>{financialTotal > 0 ? formatMoneyCompact(financialTotal, currency) : `${currency}0`}</strong></td></tr>
            <tr><td>MTTR</td><td><strong>{mttr != null ? `${mttr}d` : '—'}</strong></td></tr>
          </tbody>
        </table>
      </div>

      <div className="u-modal-section">
        <div className="u-modal-section-title">Resolution Performance</div>
        <p>
          Incident response performance averages <strong>{mttr != null ? `${mttr}d` : '—'}</strong> to resolution.
          SLA compliance is at <strong>{slaCompliance}</strong> with control effectiveness
          at <strong>{ctrlStrength}</strong>.
        </p>
      </div>

      <div className="u-modal-section">
        <div className="u-modal-section-title">Operational Impact</div>
        <p>
          Financial exposure from incident activity is currently estimated
          at <strong>{financialTotal > 0 ? formatMoneyCompact(financialTotal, currency) : `${currency}0`}</strong>.
          Continued monitoring of incident resolution velocity is recommended to prevent escalation of exposure.
        </p>
      </div>
    </>
  );
}

interface ImpactModalProps {
  topDriverCategory: string;
  topDriverCount: number;
  financialTotal: number;
  topResidual: number | null;
  causeChain: { id: string; title: string | null; severity: string | null }[];
  currency: string;
}

function ImpactModalContent({
  topDriverCategory, topDriverCount, financialTotal, topResidual, causeChain, currency,
}: ImpactModalProps) {
  return (
    <>
      <div className="u-modal-kpis">
        <div className="u-modal-kpi">
          <div className="u-modal-kpi-label">Top Driver</div>
          <div className="u-modal-kpi-value">{topDriverCategory}</div>
        </div>
        <div className="u-modal-kpi">
          <div className="u-modal-kpi-label">Financial Exposure</div>
          <div className="u-modal-kpi-value">
            {financialTotal > 0 ? formatMoneyCompact(financialTotal, currency) : `${currency}0`}
          </div>
        </div>
        <div className="u-modal-kpi">
          <div className="u-modal-kpi-label">Linked Incidents</div>
          <div className="u-modal-kpi-value">{topDriverCount}</div>
        </div>
        <div className="u-modal-kpi">
          <div className="u-modal-kpi-label">Top Residual Score</div>
          <div className="u-modal-kpi-value">{topResidual != null ? `${topResidual}/25` : '—'}</div>
        </div>
      </div>

      <div className="u-modal-section">
        <div className="u-modal-section-title">Driver Analysis</div>
        <p>
          <strong>{topDriverCategory}</strong> is the largest contributor to enterprise exposure.
          Incident monitoring control gaps may allow incidents in this category to persist longer than expected,
          increasing projected financial exposure.
        </p>
      </div>

      {causeChain.length > 0 && (
        <div className="u-modal-section">
          <div className="u-modal-section-title">High Severity Incident Cause Chain</div>
          <table className="u-modal-table">
            <thead><tr><th>ID</th><th>Description</th><th>Severity</th></tr></thead>
            <tbody>
              {causeChain.map(i => (
                <tr key={i.id}>
                  <td style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{i.id}</td>
                  <td style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {i.title ?? '—'}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>{i.severity ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="u-modal-section">
        <div className="u-modal-section-title">Recommended Action Plan</div>
        <p>
          1. Strengthen incident monitoring controls in <strong>{topDriverCategory}</strong>.{' '}
          2. Improve escalation workflows for High and Very High severity incidents.{' '}
          3. Review control effectiveness for this category.
          Expected exposure reduction: <strong>15–20%</strong> next cycle.
        </p>
      </div>
    </>
  );
}

interface DistributionModalProps {
  riskData: { name: string; value: number }[];
  incData: { name: string; value: number }[];
}

function DistributionModalContent({ riskData, incData }: DistributionModalProps) {
  const [tab, setTab] = useState<'risk' | 'incident'>('risk');
  const activeData = tab === 'risk' ? riskData : incData;
  const activeColor = tab === 'risk' ? '#01b88e' : '#1F2854';
  const chartHeight = Math.max(120, activeData.length * 34 + 20);

  return (
    <>
      <div className="u-dist-tabs">
        <button
          type="button"
          className={`u-dist-tab${tab === 'risk' ? ' active' : ''}`}
          onClick={() => setTab('risk')}
        >
          Risk Distribution
        </button>
        <button
          type="button"
          className={`u-dist-tab${tab === 'incident' ? ' active' : ''}`}
          onClick={() => setTab('incident')}
        >
          Incident Distribution
        </button>
      </div>

      {activeData.length > 0 ? (
        <div style={{ height: chartHeight }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={activeData}
              layout="vertical"
              margin={{ top: 0, right: 24, bottom: 0, left: 10 }}
            >
              <XAxis
                type="number"
                tick={{ fontSize: 10, fill: 'var(--muted)' }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fontSize: 12, fill: 'var(--text)' }}
                axisLine={false}
                tickLine={false}
                width={130}
              />
              <RTooltip
                contentStyle={{ fontSize: 11, borderRadius: 6, background: '#1F2854', border: 'none', color: '#fff', padding: '5px 10px' }}
                cursor={{ fill: 'rgba(0,0,0,.04)' }}
              />
              <Bar dataKey="value" fill={activeColor} radius={[0, 4, 4, 0]} barSize={14} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p style={{ textAlign: 'center', color: 'var(--muted)', padding: '24px 0', margin: 0 }}>
          No {tab === 'risk' ? 'risk' : 'incident'} data for this period.
        </p>
      )}
    </>
  );
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function InsightFooter({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <div className="im-card-footer">
      <button type="button" className="im-insight-link" onClick={onClick}>{label} →</button>
    </div>
  );
}

function DonutEmpty({ label }: { label: string }) {
  return (
    <div style={{ height: 130, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
      <span style={{ fontSize: 20, color: 'var(--line)', lineHeight: 1 }}>—</span>
      <span style={{ fontSize: 11, color: 'var(--muted)' }}>{label}</span>
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  data: DashboardData;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function UnifiedSection({ data }: Props) {
  const currency = useSettingsStore(s => s.currency);
  const [modal, setModal] = useState<'pressure' | 'operations' | 'impact' | 'distribution' | null>(null);
  const closeModal = () => setModal(null);

  const {
    kpis,
    incident_health,
    total_incidents,
    avg_resolution,
    risks_by_category,
    incidents_by_category,
    incident_velocity,
    residual_trend,
    top_risks,
    top_open_incidents,
    snapshot_delta,
  } = data;

  const period = snapshot_delta.has_data ? snapshot_delta.period_label : undefined;
  const mttr   = avg_resolution.days;

  // ── Block 1: Enterprise Risk Health ──────────────────────────────────────

  const avgResid     = kpis.risk_severity_avg;
  const riskHealth   = clamp(0, 100, Math.round(100 - (avgResid / 25) * 100));
  const incHealth    = clamp(0, 100, 100 - incident_health.sla_pct);
  const composite    = Math.round((riskHealth + incHealth) / 2);

  const healthStatus =
    composite >= 76 ? 'HEALTHY'
    : composite >= 51 ? 'MONITORING'
    : composite >= 26 ? 'WATCH'
    : 'CRITICAL';

  const healthColor =
    composite >= 76 ? '#10b981'
    : composite >= 51 ? '#14b8a6'
    : composite >= 26 ? '#f59e0b'
    : '#ef4444';

  const healthDeltaClass =
    composite >= 76 ? 'up'
    : composite >= 51 ? 'flat'
    : 'down';

  const deltaD = snapshot_delta.avg_residual;
  const exposureChange = deltaD == null
    ? ''
    : deltaD === 0
      ? '→ No change vs last period'
      : deltaD > 0
        ? `▼ -${deltaD.toFixed(1)} vs last period`
        : `▲ +${Math.abs(deltaD).toFixed(1)} vs last period`;
  const exposureChangeColor = deltaD == null || deltaD === 0
    ? 'var(--muted)'
    : deltaD > 0 ? '#ef4444' : '#059669';

  const topRisk = top_risks[0] ?? null;
  const exposureDriver = topRisk
    ? `Top risk driver: ${topRisk.description ?? '—'} (Risk ID: ${topRisk.id})`
    : 'No critical exposure drivers detected.';

  // ── Block 2: Risk Pressure ────────────────────────────────────────────────

  const total      = kpis.total_risks;
  const high       = kpis.high_risks;
  const openInc    = kpis.open_incidents;
  const critSignal = clamp(0, 100, incident_health.sla_pct);
  const riskSignal = total > 0 ? clamp(0, 100, Math.round((high / total) * 100)) : 0;
  const incSignal  = clamp(0, 100, Math.round((openInc / 20) * 100));
  const pressure   = clamp(0, 100, Math.round(riskSignal * 0.4 + incSignal * 0.35 + critSignal * 0.25));
  const pLabel     = pressure >= 60 ? 'High' : pressure >= 35 ? 'Moderate' : 'Low';
  const pClass     = pressure >= 60 ? 'down' : pressure >= 35 ? 'warn' : 'up';
  const pFillColor = pressure >= 60 ? '#ef4444' : pressure >= 20 ? '#f59e0b' : '#10b981';

  // ── Block 3: Incident Performance ─────────────────────────────────────────

  const resolveRatio   = mttr != null ? mttr / SLA_TARGET_DAYS : null;
  const resolveBarPct  = resolveRatio != null ? clamp(0, 100, Math.round(resolveRatio * 100)) : 0;
  const resolveBarBg   = resolveBarPct <= 75
    ? 'linear-gradient(90deg,#01b88e,#059669)'
    : resolveBarPct <= 100
      ? '#f59e0b'
      : '#ef4444';
  const slaComplianceNum = 100 - incident_health.sla_pct;
  const slaCompliance  = `${slaComplianceNum.toFixed(0)}%`;
  const ctrlStrength   = kpis.control_effectiveness_avg > 0
    ? `${Math.round(kpis.control_effectiveness_avg)}%`
    : '—';
  const resolveInsight = resolveRatio == null
    ? '—'
    : resolveRatio <= 0.75
      ? 'Resolution performance remains within SLA tolerance.'
      : resolveRatio <= 1
        ? 'Resolution time is trending toward SLA threshold.'
        : 'Resolution time has exceeded SLA — requires attention.';
  const mttrDeltaText  = resolveRatio == null
    ? '—'
    : resolveRatio <= 0.75 ? '▲ On Track'
    : resolveRatio <= 1    ? 'Watch'
    : '▼ Breached';
  const mttrDeltaClass = resolveRatio == null
    ? 'flat'
    : resolveRatio <= 0.75 ? 'up'
    : resolveRatio <= 1    ? 'warn'
    : 'down';

  // ── Block 4: Exposure Impact Drivers ──────────────────────────────────────

  const topDrivers = incidents_by_category.slice(0, 3);
  const maxImpact  = topDrivers[0]?.financial_total || 1;

  // ── Block 5: Exposure Trend ───────────────────────────────────────────────

  const velValues  = incident_velocity.map(v => v.created);
  const recent3    = velValues.slice(-3);
  const r3first    = recent3[0] ?? 0;
  const r3last     = recent3[recent3.length - 1] ?? 0;
  const slope      = r3first > 0 ? (r3last - r3first) / r3first : 0;
  const absDelta   = r3last - r3first;
  const trendLabel =
    slope <= -0.25 && absDelta < -2 ? 'Improving'
    : slope >= 0.25 && absDelta > 2 ? 'Deteriorating'
    : 'Stable';
  const trendClass = trendLabel === 'Improving' ? 'good' : trendLabel === 'Deteriorating' ? 'bad' : 'warn';

  const trendLabels = [
    ...new Set([
      ...residual_trend.map(p => p.label),
      ...incident_velocity.map(v => v.label),
    ]),
  ].slice(-6);
  const resMap  = Object.fromEntries(residual_trend.map(p => [p.label, p.avg]));
  const velMap  = Object.fromEntries(incident_velocity.map(v => [v.label, v.created]));
  const trendData = trendLabels.map(label => ({
    label,
    residual:  resMap[label]  ?? null,
    incidents: velMap[label]  ?? null,
  }));

  // ── Block 6: Distribution donuts ──────────────────────────────────────────

  const riskDonutData = Object.entries(risks_by_category)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, value]) => ({ name, value }));

  const incDonutData = incidents_by_category
    .slice(0, 3)
    .map(d => ({ name: d.category, value: d.count }));

  // ── Block 7: Executive Intelligence ──────────────────────────────────────

  const highPct = total > 0 ? Math.round((high / total) * 100) : 0;
  const posture = highPct > 30 ? 'under pressure' : highPct > 15 ? 'elevated' : 'stable';

  // ── Modal data ────────────────────────────────────────────────────────────

  // Pressure modal: merge risk categories and incident categories into pressure table
  const pressureDistRows = (() => {
    const merged: Record<string, { risks: number; incidents: number }> = {};
    Object.entries(risks_by_category).forEach(([cat, count]) => {
      merged[cat] = { risks: count, incidents: 0 };
    });
    incidents_by_category.forEach(d => {
      if (!merged[d.category]) merged[d.category] = { risks: 0, incidents: 0 };
      merged[d.category].incidents = d.count;
    });
    return Object.entries(merged)
      .map(([cat, d]) => {
        const score = Math.min(100, d.risks * 3 + d.incidents * 4);
        const label = score >= 70 ? 'High' : score >= 40 ? 'Moderate' : 'Low';
        return { cat, risks: d.risks, incidents: d.incidents, score, label };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
  })();

  // Impact modal: high/very-high incidents for cause chain
  const causeCandidates = top_open_incidents
    .filter(i => i.severity === 'High' || i.severity === 'Very High')
    .slice(0, 4);

  // Distribution modal: bar chart data
  const riskDistData = Object.entries(risks_by_category)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, value]) => ({ name, value }));

  const incDistData = incidents_by_category
    .slice(0, 8)
    .map(d => ({ name: d.category, value: d.count }));

  const topDriverCat   = incidents_by_category[0]?.category ?? '—';
  const topDriverCount = incidents_by_category[0]?.count ?? 0;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <div className="dash-section">

        {/* ROW 1 */}
        <div className="im-grid-top">

          {/* Block 1: Enterprise Risk Health */}
          <div className="im-card im-hero">
            <div className="im-card-head">
              <span className="im-label">ENTERPRISE RISK HEALTH</span>
              <div className="im-head-signals">
                <span className={`im-delta ${healthDeltaClass}`}>{healthStatus}</span>
                <div className="im-confidence">
                  <span className="im-confidence-dot" />High Confidence
                </div>
              </div>
            </div>

            <div className="im-exposure-top">
              <div className="im-exposure-score">{composite}</div>
              <div className="im-exposure-meta">
                <div className="im-exposure-status" style={{ color: healthColor }}>{healthStatus}</div>
                {exposureChange && (
                  <div className="im-exposure-change" style={{ color: exposureChangeColor }}>
                    {exposureChange}
                  </div>
                )}
                {!exposureChange && period && (
                  <div className="im-exposure-change">{period}</div>
                )}
                <div className="im-exposure-target">Risk appetite threshold: 80</div>
              </div>
            </div>

            <div className="im-exposure-divider" />

            <div className="im-exposure-grid">
              <div className="im-exposure-item">
                <div className="im-exposure-label">Residual Risk</div>
                <div className="im-exposure-value">{avgResid > 0 ? avgResid.toFixed(0) : '—'}</div>
              </div>
              <div className="im-exposure-item">
                <div className="im-exposure-label">Incident Health</div>
                <div className="im-exposure-value">{incHealth}%</div>
              </div>
              <div className="im-exposure-item">
                <div className="im-exposure-label">Financial Exposure</div>
                <div className="im-exposure-value">
                  {total_incidents.financial_total > 0
                    ? formatMoneyCompact(total_incidents.financial_total, currency)
                    : `${currency}0`}
                </div>
              </div>
            </div>

            <div className="im-exposure-driver">{exposureDriver}</div>
          </div>

          {/* Block 2: Risk Pressure */}
          <div className="im-card">
            <div className="im-card-head">
              <span className="im-label">RISK PRESSURE</span>
              <span className={`im-delta ${pClass}`}>{pLabel}</span>
            </div>

            <div className="im-pressure-bar">
              <div className="im-pressure-fill" style={{ width: `${pressure}%`, background: pFillColor }} />
            </div>

            <div className="im-metric-list">
              <div className="im-row"><span>Active Risks</span><strong>{total}</strong></div>
              <div className="im-row"><span>High / Very High</span><strong>{high}</strong></div>
              <div className="im-row"><span>Open Incidents</span><strong>{openInc}</strong></div>
              <div className="im-row">
                <span>Critical Incidents</span>
                <strong>{incident_health.sla_pct.toFixed(0)}%</strong>
              </div>
              <div className="im-row">
                <span>Pressure Score</span>
                <strong style={{ color: pFillColor }}>{pressure}/100</strong>
              </div>
            </div>

            <InsightFooter label="View insights" onClick={() => setModal('pressure')} />
          </div>

          {/* Block 3: Incident Performance */}
          <div className="im-card">
            <div className="im-card-head">
              <span className="im-label">INCIDENT PERFORMANCE</span>
              <span className={`im-delta ${mttrDeltaClass}`}>{mttrDeltaText}</span>
            </div>

            <div className="im-resolve-primary">
              <div className="im-resolve-value">{mttr != null ? `${mttr}d` : '—'}</div>
              <div className="im-resolve-caption">Incident MTTR</div>
            </div>

            <div className="im-resolve-bar">
              <div className="im-resolve-fill" style={{ width: `${resolveBarPct}%`, background: resolveBarBg }} />
            </div>

            <div className="im-resolve-meta">
              <div className="im-resolve-row">
                <span>SLA Compliance</span>
                <strong className={slaComplianceNum >= 80 ? 'im-good' : 'im-bad'}>{slaCompliance}</strong>
              </div>
              <div className="im-resolve-row">
                <span>Control Strength</span>
                <strong className="im-good">{ctrlStrength}</strong>
              </div>
            </div>

            <div className="im-resolve-insight">{resolveInsight}</div>

            <InsightFooter label="View insights" onClick={() => setModal('operations')} />
          </div>

        </div>

        {/* Block 4: Exposure Impact Drivers */}
        <div className="im-card">
          <div className="im-card-head">
            <span className="im-label">EXPOSURE IMPACT DRIVERS</span>
          </div>

          <div className="im-impact-list">
            {topDrivers.length > 0 ? topDrivers.map(d => {
              const pct = Math.round((d.financial_total / maxImpact) * 100) || 15;
              const cls = pct >= 70 ? 'danger' : pct >= 45 ? 'warn' : 'good';
              const val = d.financial_total > 0
                ? formatMoneyCompact(d.financial_total, currency)
                : `Score ${d.count}`;
              return (
                <div key={d.category} className="im-impact-row">
                  <div className="im-impact-driver">
                    {d.category}
                    <span className="im-impact-meta">
                      ({d.count} incident{d.count !== 1 ? 's' : ''})
                    </span>
                  </div>
                  <div className="im-impact-bar-wrap">
                    <div className={`im-impact-bar ${cls}`} style={{ width: `${pct}%` }} />
                  </div>
                  <div className="im-impact-value">{val}</div>
                </div>
              );
            }) : (
              <p style={{ fontSize: 12, color: 'var(--muted)', margin: '4px 0 6px', lineHeight: 1.5 }}>
                No incident exposure recorded for this period.
              </p>
            )}
          </div>

          <InsightFooter label="View insights" onClick={() => setModal('impact')} />
        </div>

        {/* ROW 2 */}
        <div className="im-grid-bot">

          {/* Block 5: Exposure Trend */}
          <div className="im-card im-wide">
            <div className="im-card-head">
              <span className="im-label">EXPOSURE TREND</span>
              <div className="im-trend-head-right">
                <div className="im-trend-legend">
                  <span className="im-legend-item"><span className="im-legend-dot navy" />Residual Risk</span>
                  <span className="im-legend-item"><span className="im-legend-dot emerald" />Incident Volume</span>
                </div>
                <span className="im-trend-sub">6-month movement</span>
                {trendData.length >= 3 && (
                  <span className={`im-trend-badge ${trendClass}`}>{trendLabel}</span>
                )}
              </div>
            </div>

            {trendData.length > 0 ? (
              <div className="dash-chart-wrap">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData} margin={{ top: 4, right: 10, bottom: 0, left: -22 }}>
                    <CartesianGrid strokeDasharray="2 4" stroke="var(--line)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
                    <YAxis yAxisId="left" tick={{ fontSize: 10, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: 'var(--muted)' }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <RTooltip
                      contentStyle={{ fontSize: 11, borderRadius: 6, background: '#1F2854', border: 'none', color: '#fff', padding: '6px 10px' }}
                      labelStyle={{ color: '#94a3b8', fontSize: 10 }}
                      itemStyle={{ color: '#fff' }}
                    />
                    <Line yAxisId="left" type="monotone" dataKey="residual" name="Avg Residual" stroke="#1F2854" strokeWidth={2} dot={{ fill: '#1F2854', r: 3, strokeWidth: 0 }} activeDot={{ r: 4, strokeWidth: 0 }} connectNulls />
                    <Line yAxisId="right" type="monotone" dataKey="incidents" name="Incident Volume" stroke="#01b88e" strokeWidth={2} dot={{ fill: '#01b88e', r: 3, strokeWidth: 0 }} activeDot={{ r: 4, strokeWidth: 0 }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="dash-empty">Trend data appears once risks have logged dates.</div>
            )}
          </div>

          {/* Block 6: Risk & Incident Distribution */}
          <div className="im-card im-wide">
            <div className="im-card-head">
              <span className="im-label">RISK &amp; INCIDENT DISTRIBUTION</span>
            </div>

            <div className="im-donut-grid">
              <div className="im-donut-box">
                <div className="im-donut-title">Risk Categories</div>
                {riskDonutData.length > 0 ? (
                  <ResponsiveContainer width={130} height={130}>
                    <PieChart>
                      <Pie data={riskDonutData} cx="50%" cy="50%" innerRadius={32} outerRadius={54} paddingAngle={2} dataKey="value">
                        {riskDonutData.map((_, i) => (
                          <Cell key={i} fill={DONUT_PALETTE[i % DONUT_PALETTE.length]} />
                        ))}
                      </Pie>
                      <RTooltip contentStyle={{ fontSize: 11, borderRadius: 6, padding: '4px 8px' }} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <DonutEmpty label="No categories" />
                )}
                <div className="im-trend-legend">
                  {riskDonutData.map((d, i) => (
                    <span key={d.name} className="im-legend-item">
                      <span className="im-legend-dot" style={{ background: DONUT_PALETTE[i % DONUT_PALETTE.length] }} />
                      {d.name}
                    </span>
                  ))}
                </div>
              </div>

              <div className="im-donut-divider" />

              <div className="im-donut-box">
                <div className="im-donut-title">Incident Categories</div>
                {incDonutData.length > 0 ? (
                  <ResponsiveContainer width={130} height={130}>
                    <PieChart>
                      <Pie data={incDonutData} cx="50%" cy="50%" innerRadius={32} outerRadius={54} paddingAngle={2} dataKey="value">
                        {incDonutData.map((_, i) => (
                          <Cell key={i} fill={DONUT_PALETTE[i % DONUT_PALETTE.length]} />
                        ))}
                      </Pie>
                      <RTooltip contentStyle={{ fontSize: 11, borderRadius: 6, padding: '4px 8px' }} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <DonutEmpty label="No incidents recorded" />
                )}
                <div className="im-trend-legend">
                  {incDonutData.map((d, i) => (
                    <span key={d.name} className="im-legend-item">
                      <span className="im-legend-dot" style={{ background: DONUT_PALETTE[i % DONUT_PALETTE.length] }} />
                      {d.name}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <InsightFooter label="Distribution Detail" onClick={() => setModal('distribution')} />
          </div>

        </div>

        {/* Block 7: Operational Feed */}
        <OperationalFeed
          riskItems={data.activity_feed}
          incidentItems={data.incident_feed}
        />

        {/* Block 8: Executive Intelligence */}
        <div className="im-card im-ai-card">
          <div className="im-card-head">
            <span className="im-label">EXECUTIVE INTELLIGENCE</span>
            <span className="im-badge">AI</span>
          </div>
          <div className="im-ai-body">
            {total === 0 && total_incidents.count === 0
              ? 'No risk or incident data yet. Add records to enable intelligence reporting.'
              : <>
                  Enterprise risk posture is <strong>{posture}</strong>.{' '}
                  <strong>{total}</strong> active risks;{' '}
                  <strong>{high}</strong> ({highPct}%) rated High or Very High.{' '}
                  Incident posture: <strong>{(incident_health.label || '—').toLowerCase()}</strong>.{' '}
                  <strong>{total_incidents.open_count}</strong> open incidents.
                  {mttr != null && <> MTTR: <strong>{mttr}d</strong>.</>}
                  {' '}SLA breach rate: <strong>{incident_health.sla_pct.toFixed(0)}%</strong>.
                </>
            }
          </div>
          <div className="im-ai-footer">
            <div className="im-ai-note">
              AI-assisted insights support decision-making. Validate alongside professional judgment.{' '}
              <a href="https://smartrisksheets.com/ai-transparency-data-use-statement/" target="_blank" rel="noreferrer" className="im-ai-link">
                Learn more
              </a>
            </div>
            <div className="im-ai-status">● Risk &amp; Incident data active — unified analytics enabled</div>
          </div>
        </div>

      </div>

      {/* ── Modals ─────────────────────────────────────────────────────────── */}

      {modal === 'pressure' && (
        <UnifiedModal title="Exposure Pressure Analysis" onClose={closeModal}>
          <PressureModalContent
            pressure={pressure}
            pFillColor={pFillColor}
            pLabel={pLabel}
            total={total}
            high={high}
            openInc={openInc}
            distRows={pressureDistRows}
          />
        </UnifiedModal>
      )}

      {modal === 'operations' && (
        <UnifiedModal title="Incident Performance" onClose={closeModal}>
          <OperationsModalContent
            incHealthPct={100 - incident_health.sla_pct}
            openCount={total_incidents.open_count}
            mttr={mttr}
            financialTotal={total_incidents.financial_total}
            totalCount={total_incidents.count}
            slaCompliance={slaCompliance}
            ctrlStrength={ctrlStrength}
            currency={currency}
          />
        </UnifiedModal>
      )}

      {modal === 'impact' && (
        <UnifiedModal title="Exposure Impact Investigation" onClose={closeModal}>
          <ImpactModalContent
            topDriverCategory={topDriverCat}
            topDriverCount={topDriverCount}
            financialTotal={total_incidents.financial_total}
            topResidual={top_risks[0]?.residual ?? null}
            causeChain={causeCandidates}
            currency={currency}
          />
        </UnifiedModal>
      )}

      {modal === 'distribution' && (
        <UnifiedModal title="Risk & Incident Distribution — Detail" onClose={closeModal} wide>
          <DistributionModalContent riskData={riskDistData} incData={incDistData} />
        </UnifiedModal>
      )}
    </>
  );
}
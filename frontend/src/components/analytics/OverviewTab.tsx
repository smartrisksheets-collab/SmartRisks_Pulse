// src/components/analytics/OverviewTab.tsx
// Overview: enterprise risk health, risk pressure, what drives pressure,
// where to look next and pressure by category.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { DashboardData } from '../../types/dashboard';
import { formatMoneyCompact } from '../../utils/format';
import Explain from '../help/Explain';
import { Card, ScoreBars } from './shared';
import { appetiteCell, healthChip, plural, pressureChip } from './format';

export type TabKey = 'overview' | 'correlation' | 'trends' | 'incidents' | 'activity';

interface Props {
  data: DashboardData;
  currency: string;
  tabs: TabKey[];
  go: (tab: TabKey) => void;
}

export default function OverviewTab({ data, currency, tabs, go }: Props) {
  const { enterprise_health: h, pressure: p, snapshot_delta: delta, correlation: c, control_evidence: ev } = data;
  const [whyOpen, setWhyOpen] = useState(true);
  const noData = h.status === 'No data';
  const ap = h.appetite;
  const threshold = ap.configured ? ap.threshold_avg : null;
  const barValue = threshold != null && ap.avg_residual_scored != null ? ap.avg_residual_scored : h.avg_residual;
  const over = threshold != null && barValue > threshold;
  const headroom = threshold != null ? Math.abs(threshold - barValue).toFixed(1) : null;
  const resDelta = delta.has_data ? delta.avg_residual : null;
  const deltaText = !delta.has_data
    ? 'No earlier snapshot to compare yet'
    : resDelta == null || resDelta === 0
      ? `Average residual unchanged ${delta.period_label}`
      : `${resDelta > 0 ? '▲' : '▼'} Average residual ${resDelta > 0 ? 'up' : 'down'} ${Math.abs(resDelta).toFixed(1)}% ${delta.period_label}`;
  const has = (t: TabKey) => tabs.includes(t);

  return (
    <>
      <div className="pl-card-grid">
        <Card
          label="Enterprise risk health"
          right={
            <span className="pl-inline">
              <span className={`pl-chip ${healthChip(h.status)}`}>{h.status}</span>
              {!noData && (
                <span className="pl-chip pl-sev-l" title={h.confidence_reasons.join('; ') || 'All evidence checks passed'}>
                  {h.confidence} confidence
                </span>
              )}
              <Explain id="enterprise-risk-health" />
            </span>
          }
        >
          <div className="pl-score">
            <span className="pl-metric-xl">{noData ? '—' : h.score}</span>
            <span className="pl-score-of">/ 100</span>
          </div>
          <p className="pl-meta">{deltaText}</p>
          <div className="pl-stack-xs">
            <div className="pl-an-head pl-caption">
              <span>{threshold != null ? 'Average residual of risks with a threshold' : 'Average residual'} · scale 0 to {h.scale_max}</span>
              {threshold != null && <span>Appetite {threshold}</span>}
            </div>
            <span className={`pl-bar${over ? ' pl-warn' : ''}`} aria-hidden="true">
              <span style={{ ['--pl-fill' as string]: `${Math.min(100, (barValue / Math.max(h.scale_max, 1)) * 100)}%` }} />
            </span>
          </div>
          {!ap.configured ? (
            <p className="pl-note">No appetite thresholds are set, so this score shows how large the exposure is, not whether it is acceptable.</p>
          ) : threshold != null && (
            <p className={`pl-note${over || p.exceeds_appetite > 0 ? ' pl-alert' : ''}`}>
              The average sits {headroom} points {over ? 'above' : 'inside'} appetite.
              {p.exceeds_appetite > 0 && ` ${plural(p.exceeds_appetite, 'risk')} ${p.exceeds_appetite === 1 ? 'is' : 'are'} above its own category threshold.`}
              {h.capped_by_appetite && ' An average can hide a single breach, which is why the status is capped at At Risk.'}
            </p>
          )}
          <div className="pl-an-stats">
            <div className="pl-stat">
              <span className="pl-label">Residual risk</span>
              <span className="pl-metric-s">{p.active_risks > 0 ? h.avg_residual : '—'}</span>
              <span className="pl-caption">average of {plural(p.active_risks, 'risk')}</span>
            </div>
            <div className="pl-stat">
              <span className="pl-label">Incident health</span>
              <span className="pl-metric-s">{h.incident_health_score ?? '—'}</span>
              <span className="pl-caption">{plural(p.open_incidents, 'open incident')}</span>
            </div>
            <div className="pl-stat">
              <span className="pl-label">Financial exposure</span>
              <span className="pl-metric-s">{h.financial_exposure > 0 ? formatMoneyCompact(h.financial_exposure, currency) : '—'}</span>
              <span className="pl-caption">{h.financial_quantified} of {plural(p.active_risks, 'risk')} quantified</span>
            </div>
          </div>
          {!noData && (
            <>
              <button type="button" className="pl-btn pl-btn-ghost pl-btn-sm" aria-expanded={whyOpen} onClick={() => setWhyOpen(o => !o)}>
                {whyOpen ? 'Hide why' : `Why ${h.score}?`}
              </button>
              {whyOpen && (
                <ol className="pl-why">
                  {h.capped_by_appetite && (
                    <li><b>Caps score.</b> {plural(p.exceeds_appetite, 'risk')} outside appetite. Health cannot rise above At Risk until {p.exceeds_appetite === 1 ? 'it is' : 'they are'} back inside threshold.</li>
                  )}
                  {h.confidence_reasons.length > 0 && (
                    <li>
                      <b>Confidence.</b> {h.confidence} because of: {h.confidence_reasons.join('; ')}.
                      {has('correlation') && ev.rated > ev.evidenced && <> <a href="#correlation" onClick={e => { e.preventDefault(); go('correlation'); }}>Control evidence</a></>}
                    </li>
                  )}
                  {c.uncovered_categories.length > 0 && (
                    <li>
                      <b>Coverage.</b> {c.uncovered_categories.join(', ')} {c.uncovered_categories.length === 1 ? 'has' : 'have'} incidents and no covering risk, so part of the exposure is not in the score.
                      {has('correlation') && <> <a href="#correlation" onClick={e => { e.preventDefault(); go('correlation'); }}>Blind spots</a></>}
                    </li>
                  )}
                </ol>
              )}
              {whyOpen && <ScoreBars components={h.components} higherIsWorse={false} />}
            </>
          )}
        </Card>

        <Card
          label="Risk pressure"
          right={
            <span className="pl-inline">
              <span className={`pl-chip ${pressureChip(p.level)}`}>{p.level}</span>
              <Explain id="risk-pressure" />
            </span>
          }
        >
          <div className="pl-score">
            <span className="pl-metric-xl">{p.level === 'No data' ? '—' : p.score}</span>
            <span className="pl-score-of">/ 100</span>
          </div>
          <p className="pl-intro">How much is pushing on the register right now. Higher means more open work and more exposure at once.</p>
          <dl className="pl-stack-0">
            <div className="pl-prow"><dt>Active risks</dt><dd>{p.active_risks}</dd></div>
            <div className="pl-prow"><dt>Elevated risks</dt><dd>{p.elevated} of {p.active_risks}</dd></div>
            <div className="pl-prow"><dt>Exceeding appetite</dt><dd>{p.exceeds_appetite}</dd></div>
            <div className="pl-prow">
              <dt>Open incidents</dt>
              <dd>{p.open_incidents}{p.open_high > 0 && <span className="pl-chip pl-sev-h">{p.open_high} high</span>}</dd>
            </div>
            <div className="pl-prow"><dt>Undecided risks</dt><dd>{p.undecided}</dd></div>
            <div className="pl-prow"><dt>Past target date</dt><dd>{p.past_target}</dd></div>
            <div className="pl-prow"><dt>Controls evidenced</dt><dd>{p.evidenced} of {p.rated} rated</dd></div>
            <div className="pl-prow">
              <dt>Top owner by residual</dt>
              <dd>{p.top_owner ? `${p.top_owner} · ${p.top_owner_residual} across ${plural(p.top_owner_risks, 'risk')}` : '—'}</dd>
            </div>
          </dl>
        </Card>
      </div>

      <div className="pl-card-grid">
        <Card title="What makes up the pressure score" intro="Four parts, each scored 0 to 100, then weighted.">
          <ScoreBars components={p.components} higherIsWorse />
        </Card>

        <Card title="Where to look next">
          <div className="pl-stack-0">
            {has('correlation') && (
              <a className="pl-row" href="#correlation" onClick={e => { e.preventDefault(); go('correlation'); }}>
                <span className="pl-grow"><b>Correlation</b><br /><span className="pl-meta">Incidents with no matching risk, risks that materialised and control evidence.</span></span>
                {c.incidents_unlinked > 0 && <span className="pl-chip pl-sev-m">{plural(c.incidents_unlinked, 'unlinked incident')}</span>}
              </a>
            )}
            {has('trends') && (
              <a className="pl-row" href="#trends" onClick={e => { e.preventDefault(); go('trends'); }}>
                <span className="pl-grow"><b>Trends</b><br /><span className="pl-meta">Six-month exposure and incident movement, and category overlap.</span></span>
              </a>
            )}
            {has('incidents') && (
              <a className="pl-row" href="#incidents" onClick={e => { e.preventDefault(); go('incidents'); }}>
                <span className="pl-grow"><b>Incidents</b><br /><span className="pl-meta">Resolution times, targets met, stages and cost of the incident log.</span></span>
                <span className="pl-tag">{p.open_incidents} open</span>
              </a>
            )}
            <a className="pl-row" href="#activity" onClick={e => { e.preventDefault(); go('activity'); }}>
              <span className="pl-grow"><b>Activity</b><br /><span className="pl-meta">Every risk and incident change, filtered by type.</span></span>
            </a>
          </div>
        </Card>
      </div>

      <Card
        title="Pressure by category"
        intro={`Where the ${plural(p.active_risks, 'risk')} and ${plural(c.incidents_total, 'incident')} sit. Incidents count under every risk category that covers them.`}
        right={<Link to="/risks">Risk Register</Link>}
      >
        {p.by_category.length === 0 ? (
          <p className="pl-caption">No risks on the register yet.</p>
        ) : (
          <div className="pl-table-wrap">
            <table className="pl-table">
              <thead>
                <tr>
                  <th scope="col">Category</th>
                  <th scope="col" className="pl-r">Risks</th>
                  <th scope="col" className="pl-r">Elevated</th>
                  <th scope="col" className="pl-r">Incidents</th>
                  <th scope="col">Appetite</th>
                </tr>
              </thead>
              <tbody>
                {p.by_category.map(row => {
                  const a = appetiteCell(row);
                  return (
                    <tr key={`${row.category}-${row.covered}`}>
                      <td>{row.category}</td>
                      <td className="pl-r">{row.risks}</td>
                      <td className="pl-r">{row.elevated}</td>
                      <td className="pl-r">{row.incidents}</td>
                      <td><span className={`pl-chip ${a.cls}`}>{a.text}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

// src/components/analytics/TrendsTab.tsx
// Six-month movement from the monthly snapshots, plus category overlap.

import type { DashboardData, MovementPoint } from '../../types/dashboard';
import { BarChart, Card, LineChart, Sparkline } from './shared';
import { plural } from './format';

interface Props {
  data: DashboardData;
  hasRisk: boolean;
  hasIncident: boolean;
  goCorrelation: (() => void) | null;
}

function shortMonth(p: MovementPoint): string {
  return p.label.split(' ')[0];
}

function lastKnown(points: MovementPoint[], pick: (p: MovementPoint) => number | null): number | null {
  for (let i = points.length - 1; i >= 0; i -= 1) {
    const v = pick(points[i]);
    if (v != null) return v;
  }
  return null;
}

export default function TrendsTab({ data, hasRisk, hasIncident, goCorrelation }: Props) {
  const { movement: m, enterprise_health: h, risks_by_category, incidents_by_category } = data;
  const pts = m.points;
  const resMaxRaw = Math.max(0, ...pts.map(p => p.avg_residual ?? 0), h.appetite.threshold_avg ?? 0);
  const resMax = resMaxRaw > 0 ? Math.min(h.scale_max, Math.ceil(resMaxRaw * 1.25)) : h.scale_max;
  const incTotal = pts.reduce((n, p) => n + p.incidents_created, 0);

  const cats = Array.from(new Set([
    ...(hasRisk ? Object.keys(risks_by_category) : []),
    ...(hasIncident ? incidents_by_category.map(i => i.category) : []),
  ]));
  const riskN = (cat: string) => risks_by_category[cat] ?? 0;
  const incN = (cat: string) => incidents_by_category.find(i => i.category === cat)?.count ?? 0;
  const riskMax = Math.max(1, ...cats.map(riskN));
  const incMax = Math.max(1, ...cats.map(incN));
  cats.sort((a, b) => (incN(b) - incN(a)) || (riskN(b) - riskN(a)) || a.localeCompare(b));

  const tiles = [
    hasRisk && { label: 'Health score', value: lastKnown(pts, p => p.health_score), spark: pts.map(p => p.health_score) },
    hasRisk && { label: 'Risk pressure', value: lastKnown(pts, p => p.pressure_score), spark: pts.map(p => p.pressure_score) },
    hasRisk && { label: 'Average residual', value: lastKnown(pts, p => p.avg_residual), spark: pts.map(p => p.avg_residual) },
    hasIncident && { label: 'Incidents logged', value: pts.length ? pts[pts.length - 1].incidents_created : null, spark: pts.map(p => p.incidents_created) },
  ].filter(Boolean) as { label: string; value: number | null; spark: (number | null)[] }[];

  return (
    <>
      <p className="pl-intro">
        How the figures have moved month by month, from the monthly snapshots. Snapshots are never rewritten, so past
        months stay as they were reported. The current month is live.
      </p>

      <div className="pl-kpi-grid">
        {tiles.map(t => (
          <div key={t.label} className="pl-stat">
            <span className="pl-label">{t.label}</span>
            <span className="pl-metric-s">{t.value ?? '—'}</span>
            <Sparkline values={t.spark} label={`${t.label} over ${plural(pts.length, 'month')}`} />
          </div>
        ))}
      </div>

      <Card title="Exposure and incident trend" intro="Separate charts on the same months, so each keeps its own honest scale.">
        <div className="pl-card-grid">
          {hasRisk && (
            <figure className="pl-figure">
              <figcaption className="pl-caption">
                Average residual · scale 0 to {h.scale_max}, shown 0 to {resMax}
                {h.appetite.threshold_avg != null && ' · dashed line is appetite'}
              </figcaption>
              <LineChart
                points={pts.map(p => ({ label: shortMonth(p), value: p.avg_residual }))}
                max={resMax}
                threshold={h.appetite.threshold_avg}
                label="Average residual per month"
              />
            </figure>
          )}
          {hasIncident && (
            <figure className="pl-figure">
              <figcaption className="pl-caption">Incidents logged per month · {incTotal} in total</figcaption>
              <BarChart points={pts.map(p => ({ label: shortMonth(p), value: p.incidents_created }))} label="Incidents logged per month" />
            </figure>
          )}
        </div>
        {m.trend_findings.map(f => <p key={f} className="pl-p">{f}</p>)}
      </Card>

      {cats.length > 0 && (
        <Card title="Category overlap" intro="Risks on the register against incidents logged, per category.">
          <div className="pl-legend">
            {hasRisk && <span><i className="pl-ov-risk-key" />Risks</span>}
            {hasIncident && <span><i className="pl-ov-inc-key" />Incidents</span>}
          </div>
          <div className="pl-stack-0">
            {cats.map(cat => (
              <div key={cat} className="pl-ov">
                <b>{cat}</b>
                <div className="pl-stack-xs">
                  {hasRisk && (
                    <span className="pl-ov-bar pl-ov-risk">
                      <span style={{ ['--pl-fill' as string]: `${(riskN(cat) / riskMax) * 100}%` }} />
                      <span className="pl-caption">{riskN(cat) === 0 ? 'No risk line' : plural(riskN(cat), 'risk')}</span>
                    </span>
                  )}
                  {hasIncident && (
                    <span className="pl-ov-bar pl-ov-inc">
                      <span style={{ ['--pl-fill' as string]: `${(incN(cat) / incMax) * 100}%` }} />
                      <span className="pl-caption">{plural(incN(cat), 'incident')}</span>
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
          {m.overlap_findings.map(f => <p key={f} className="pl-p">{f}</p>)}
          {goCorrelation && (
            <a href="#correlation" onClick={e => { e.preventDefault(); goCorrelation(); }}>See the blind spots in Correlation</a>
          )}
        </Card>
      )}

      <Card title="Monthly snapshots" intro="The figures behind every chart on this tab. Months saved before health and pressure were recorded show a dash.">
        <div className="pl-table-wrap">
          <table className="pl-table pl-compact">
            <thead>
              <tr>
                <th scope="col">Month</th>
                {hasRisk && <th scope="col" className="pl-r">Health</th>}
                {hasRisk && <th scope="col" className="pl-r">Pressure</th>}
                {hasRisk && <th scope="col" className="pl-r">Avg residual</th>}
                {hasIncident && <th scope="col" className="pl-r">Incidents</th>}
              </tr>
            </thead>
            <tbody>
              {[...pts].reverse().map(p => (
                <tr key={p.month_key}>
                  <td>{p.label}{p.is_live && <span className="pl-meta"> · live</span>}</td>
                  {hasRisk && <td className="pl-r">{p.health_score ?? '—'}</td>}
                  {hasRisk && <td className="pl-r">{p.pressure_score ?? '—'}</td>}
                  {hasRisk && <td className="pl-r">{p.avg_residual ?? '—'}</td>}
                  {hasIncident && <td className="pl-r">{p.incidents_created}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="pl-caption">{plural(m.snapshots_held, 'monthly snapshot')} held.</p>
      </Card>
    </>
  );
}

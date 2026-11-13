// src/components/analytics/IncidentsTab.tsx
// How well incidents are handled: targets, resolution time, stages and cost.

import { Link } from 'react-router-dom';
import type { IncidentStats } from '../../types/incident';
import { formatMoneyCompact } from '../../utils/format';
import { Card } from './shared';
import { plural } from './format';

interface Props {
  stats: IncidentStats | undefined;
  isLoading: boolean;
  uncovered: string[];
  currency: string;
  goCorrelation: (() => void) | null;
}

export default function IncidentsTab({ stats, isLoading, uncovered, currency, goCorrelation }: Props) {
  if (isLoading) return <p className="pl-caption">Loading incident figures…</p>;
  if (!stats) return <p className="pl-note pl-alert">Incident figures could not be loaded. Refresh the page to try again.</p>;

  const { health, totals, lifecycle: lc, resolution: res } = stats;
  const met = res.breach_total - res.breach_count;
  const metPct = res.breach_total > 0 ? Math.round((met / res.breach_total) * 100) : null;
  const noFigure = res.impact_total_count - res.impact_count;
  const stages: { label: string; n: number }[] = [
    { label: 'New', n: lc.new },
    { label: 'Triaged', n: lc.triaged },
    { label: 'Investigating', n: lc.investigating },
    { label: 'Remediating', n: lc.remediating },
    { label: 'Resolved', n: lc.resolved },
    { label: 'Closed', n: lc.closed },
  ];

  return (
    <>
      <p className="pl-intro">
        How well incidents are being handled: how fast they close, whether targets are met, where they sit in the
        workflow and what they cost. Covers all {plural(totals.count, 'incident')} on the log.
      </p>

      <div className="pl-kpi-grid">
        <div className="pl-stat">
          <span className="pl-label">Incident health</span>
          <span><span className="pl-metric-s">{totals.count > 0 ? health.score : '—'}</span> <span className="pl-meta">/ 100 · {health.label}</span></span>
          {health.flag && <span className="pl-caption">{health.flag}</span>}
        </div>
        <div className="pl-stat">
          <span className="pl-label">Met their target</span>
          <span><span className="pl-metric-s">{met}</span> <span className="pl-meta">of {res.breach_total}{metPct != null ? ` · ${metPct}%` : ''}</span></span>
          {res.flag && <span className="pl-caption">{res.flag}</span>}
        </div>
        <div className="pl-stat">
          <span className="pl-label">Time to resolve</span>
          <span><span className="pl-metric-s">{res.median_days ?? '—'}</span> <span className="pl-meta">days, median</span></span>
          <span className="pl-caption">
            {res.oldest_open_id ? `Oldest open: ${res.oldest_open_id}, ${plural(res.oldest_open_days ?? 0, 'day')}.` : 'No open incidents.'}
          </span>
        </div>
        <div className="pl-stat">
          <span className="pl-label">Estimated cost</span>
          <span className="pl-metric-s">{res.impact_count > 0 ? formatMoneyCompact(res.impact_total, currency) : '—'}</span>
          <span className="pl-caption">{res.impact_count} of {plural(res.impact_total_count, 'incident')} have a figure.</span>
        </div>
      </div>

      <Card title="Where they are in the workflow" intro={`All ${plural(totals.count, 'incident')} by status.`}>
        <ol className="pl-steps">
          {stages.map(s => (
            <li key={s.label} className={`pl-step${s.n > 0 ? ' pl-is-cur' : ''}`}>
              <span className="pl-step-dot">{s.n}</span>
              {s.label}
            </li>
          ))}
        </ol>
        {lc.resolved > 0 && (
          <p className="pl-note">
            {plural(lc.resolved, 'resolved incident')} {lc.resolved === 1 ? 'is' : 'are'} not closed. Close each once its lessons are recorded on the linked risk.
          </p>
        )}
      </Card>

      <Card title="Targets by severity" intro="Target days come from your incident settings.">
        <div className="pl-table-wrap">
          <table className="pl-table pl-compact">
            <thead>
              <tr>
                <th scope="col">Severity</th><th scope="col" className="pl-r">Target</th><th scope="col" className="pl-r">Open</th>
                <th scope="col" className="pl-r">Resolved</th><th scope="col" className="pl-r">Met target</th><th scope="col" className="pl-r">Median days</th>
              </tr>
            </thead>
            <tbody>
              {stats.by_severity.map(s => (
                <tr key={s.severity}>
                  <td>{s.severity}</td>
                  <td className="pl-r">{plural(s.target_days, 'day')}</td>
                  <td className="pl-r">{s.open}</td>
                  <td className="pl-r">{s.resolved}</td>
                  <td className="pl-r">{s.resolved > 0 ? `${s.met} of ${s.resolved}` : '—'}</td>
                  <td className="pl-r">{s.median_days ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="pl-card-grid">
        <Card title="Top incident drivers" intro="Categories ranked by incidents, then by open ones.">
          {stats.by_category.length === 0 ? (
            <p className="pl-caption">No incidents logged yet.</p>
          ) : (
            <div className="pl-table-wrap">
              <table className="pl-table pl-compact">
                <thead>
                  <tr>
                    <th scope="col">Category</th><th scope="col" className="pl-r">Incidents</th>
                    <th scope="col" className="pl-r">Open</th><th scope="col">Register cover</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.by_category.map(c => {
                    const ids = c.unlinked_ids;
                    const cover = uncovered.includes(c.category)
                      ? 'No risk line'
                      : ids.length === 0
                        ? 'Linked'
                        : `${ids.slice(0, 3).join(', ')}${ids.length > 3 ? ` and ${ids.length - 3} more` : ''} not linked`;
                    return (
                      <tr key={c.category}>
                        <td>{c.category}</td>
                        <td className="pl-r">{c.count}</td>
                        <td className="pl-r">{c.open}</td>
                        <td>{cover}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {goCorrelation && (
            <a href="#correlation" onClick={e => { e.preventDefault(); goCorrelation(); }}>See the blind spots in Correlation</a>
          )}
        </Card>

        <Card title="Estimated cost" intro="The incidents with a figure, largest first.">
          {stats.costs.length === 0 ? (
            <p className="pl-caption">No incident has a cost figure yet.</p>
          ) : (
            <dl className="pl-stack-0">
              {stats.costs.map(c => (
                <div key={c.id} className="pl-prow">
                  <dt>{c.id}{c.title ? ` ${c.title}` : ''}</dt>
                  <dd>
                    {formatMoneyCompact(c.amount, currency)}
                    {c.confidence && <span className="pl-tag">{c.confidence}</span>}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          {noFigure > 0 && (
            <p className="pl-note">{plural(noFigure, 'incident')} {noFigure === 1 ? 'has' : 'have'} no figure yet. Treat the total as a floor, not a full cost.</p>
          )}
          <Link to="/incidents">Open the incident log</Link>
        </Card>
      </div>
    </>
  );
}

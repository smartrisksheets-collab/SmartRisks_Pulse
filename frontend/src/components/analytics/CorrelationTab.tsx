// src/components/analytics/CorrelationTab.tsx
// What the risk register and the incident log say about each other.

import type { DashboardData, EvidenceStatus } from '../../types/dashboard';
import { formatDate } from '../../utils/format';
import Explain from '../help/Explain';
import { ActionList, Card } from './shared';
import { plural, severityChip } from './format';

interface Props {
  data: DashboardData;
  canManageRisks: boolean;
  canLinkIncidents: boolean;
  open: (path: string) => void;
}

const EVIDENCE: Record<EvidenceStatus, { cls: string; text: string }> = {
  contradicted: { cls: 'pl-sev-x', text: 'Contradicted' },
  unevidenced:  { cls: 'pl-sev-m', text: 'Unevidenced' },
  evidenced:    { cls: 'pl-ok',    text: 'Evidenced' },
};

function jump(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export default function CorrelationTab({ data, canManageRisks, canLinkIncidents, open }: Props) {
  const { correlation: c, control_evidence: ev } = data;
  const unevidenced = ev.rated - ev.evidenced;

  return (
    <>
      <p className="pl-intro">
        What the risk register and the incident log say about each other. Each gap below is either something missing
        from the register, or a control rating the incidents do not support. <Explain id="correlation" />
      </p>

      <div className="pl-kpi-grid">
        <a className="pl-kpi" href="#blind-spots" onClick={e => { e.preventDefault(); jump('blind-spots'); }}>
          <span className="pl-label">Incidents with no matching risk</span>
          <span><span className="pl-metric-m">{c.incidents_unlinked}</span> <span className="pl-meta">of {plural(c.incidents_total, 'incident')}</span></span>
          <span className="pl-caption">
            {c.uncovered_categories.length > 0
              ? `${c.uncovered_categories.join(', ')} ${c.uncovered_categories.length === 1 ? 'has' : 'have'} no covering risk at all.`
              : 'Every incident category has a covering risk.'}
          </span>
        </a>
        <a className="pl-kpi" href="#materialised" onClick={e => { e.preventDefault(); jump('materialised'); }}>
          <span className="pl-label">Risks that materialised</span>
          <span><span className="pl-metric-m">{c.risks_materialised}</span> <span className="pl-meta">of {plural(c.risks_total, 'risk')}</span></span>
          <span className="pl-caption">Identified on the register, and an incident still happened.</span>
        </a>
        <a className="pl-kpi" href="#controls" onClick={e => { e.preventDefault(); jump('controls'); }}>
          <span className="pl-label">Control ratings vs reality</span>
          <span><span className="pl-metric-m">{ev.evidenced}</span> <span className="pl-meta">of {ev.rated} rated controls evidenced</span></span>
          <span className="pl-caption">
            {ev.contradicted > 0 && `${ev.contradicted} contradicted. `}
            {unevidenced > 0 ? `${plural(unevidenced, 'rating')} rest on self-assessment or an old test.` : 'No unevidenced ratings.'}
          </span>
        </a>
      </div>

      <div id="blind-spots">
        <Card title="Incidents with no matching risk" intro="Each one is either a risk that should be logged, or a link to an existing risk that triage missed.">
          {c.unlinked.length === 0 ? (
            <p className="pl-caption">Every incident is linked to a risk.</p>
          ) : (
            <div className="pl-table-wrap">
              <table className="pl-table">
                <thead>
                  <tr>
                    <th scope="col">Incident</th><th scope="col">Category</th><th scope="col">Severity</th>
                    <th scope="col">Logged</th><th scope="col">Register coverage</th><th scope="col">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {c.unlinked.map(u => (
                    <tr key={u.incident_id}>
                      <td>{u.incident_id}{u.title ? ` ${u.title}` : ''}</td>
                      <td>{u.category ?? '—'}</td>
                      <td>{u.severity ? <span className={`pl-chip ${severityChip(u.severity)}`}>{u.severity}</span> : '—'}</td>
                      <td>{formatDate(u.reported_at)}</td>
                      <td>{u.covered ? 'Category covered, not linked' : 'No covering risk'}</td>
                      <td>
                        {u.covered && canLinkIncidents && (
                          <button type="button" className="pl-btn pl-btn-secondary pl-btn-sm" onClick={() => open(`/incidents?incident=${encodeURIComponent(u.incident_id)}`)}>Link to a risk</button>
                        )}
                        {!u.covered && canManageRisks && (
                          <button type="button" className="pl-btn pl-btn-secondary pl-btn-sm" onClick={() => open(`/risks?new=1&category=${encodeURIComponent(u.category ?? '')}`)}>Create risk</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {c.uncovered_categories.length > 0 && (
            <p className="pl-note pl-alert">
              <b>{c.uncovered_categories.join(', ')} {c.uncovered_categories.length === 1 ? 'has' : 'have'} no risk line on the register.</b>{' '}
              That is a category gap, not a one-off event. Until it is covered, that exposure is invisible to every score here.
            </p>
          )}
          <h3 className="pl-item-title">Recommended actions</h3>
          <ActionList actions={c.unlinked_actions} emptyText="Nothing to do here right now." />
        </Card>
      </div>

      <div id="materialised">
        <Card title="Risks that materialised" intro="These risks were identified in advance, and the control did not prevent an incident. That is a control failure, not an identification failure.">
          {c.materialised.length === 0 ? (
            <p className="pl-caption">No linked incidents yet.</p>
          ) : (
            <div className="pl-table-wrap">
              <table className="pl-table">
                <thead>
                  <tr>
                    <th scope="col">Risk</th><th scope="col">Category</th><th scope="col" className="pl-r">Residual</th>
                    <th scope="col" className="pl-r">Control</th><th scope="col">Incident produced</th><th scope="col">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {c.materialised.map(m => (
                    <tr key={m.risk_id}>
                      <td>{m.risk_id}</td>
                      <td>{m.category ?? '—'}</td>
                      <td className="pl-r">{m.residual ?? '—'}</td>
                      <td className="pl-r">{m.control_rating ?? '—'}</td>
                      <td>
                        {[m.latest_incident_id, m.latest_incident_severity, m.latest_incident_reported_at ? formatDate(m.latest_incident_reported_at) : null].filter(Boolean).join(' · ')}
                        {m.incident_count > 1 && <span className="pl-meta"> · {m.incident_count} in total</span>}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="pl-btn pl-btn-secondary pl-btn-sm"
                          onClick={() => open(canManageRisks ? `/risks?edit=${encodeURIComponent(m.risk_id)}` : `/risks?risk=${encodeURIComponent(m.risk_id)}`)}
                        >
                          {canManageRisks ? 'Re-score' : 'Open'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <h3 className="pl-item-title">Recommended actions</h3>
          <ActionList actions={c.materialised_actions} emptyText="Nothing to do here right now." />
        </Card>
      </div>

      <div id="controls">
        <Card title="Control ratings vs reality" intro="A rating counts as evidenced only when it was tested recently, by an independent test or an external audit. Self-assessment does not count.">
          {ev.rows.length === 0 ? (
            <p className="pl-caption">No control ratings recorded yet.</p>
          ) : (
            <div className="pl-table-wrap">
              <table className="pl-table">
                <thead>
                  <tr>
                    <th scope="col">Risk</th><th scope="col">Category</th><th scope="col" className="pl-r">Control</th>
                    <th scope="col">Last tested</th><th scope="col">Source</th><th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {ev.rows.map(r => (
                    <tr key={r.risk_id}>
                      <td>{r.risk_id}</td>
                      <td>{r.category ?? '—'}</td>
                      <td className="pl-r">{r.control_rating ?? '—'}</td>
                      <td>{r.last_tested ? formatDate(r.last_tested) : 'Never'}</td>
                      <td>{r.assertion_source ?? '—'}</td>
                      <td><span className={`pl-chip ${(EVIDENCE[r.status] ?? { cls: 'pl-tag' }).cls}`}>{EVIDENCE[r.status]?.text ?? r.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <h3 className="pl-item-title">Recommended actions</h3>
          <ActionList actions={ev.actions} emptyText="Nothing to do here right now." />
        </Card>
      </div>
    </>
  );
}

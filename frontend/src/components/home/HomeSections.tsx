// src/components/home/HomeSections.tsx
// The four tiles, "Do this next", the two lists and recent activity.
// Every figure, tag and sentence comes from GET /api/v1/home.

import { Link } from 'react-router-dom';
import type { HealthStatus } from '../../types/dashboard';
import type { HomeAction, HomeData, HomeIncidentRow, HomeRiskRow } from '../../types/home';
import { incidentNarrative, mergeFeed, riskNarrative, timeAgo } from '../../utils/feedEvents';
import { formatDate } from '../../utils/format';
import { healthChip, severityChip } from '../analytics/format';
import { actionLink, incidentPath, initialsOf, riskPath } from './links';

const ring = (on: boolean) => (on ? ' pl-tour-on' : '');

// ── Tiles ────────────────────────────────────────────────────────────────────

export function Tiles({ data, hasRisk, hasIncident, tourOn }: {
  data: HomeData; hasRisk: boolean; hasIncident: boolean; tourOn: boolean;
}) {
  const t = data.tiles;
  const health = t.health.value;
  const exceed = t.outside_appetite.value ?? 0;
  const warn = data.status === 'At Risk' || data.status === 'Critical';
  return (
    <section id="sec-kpis" className={`pl-kpi-grid pl-tour-target${ring(tourOn)}`} aria-label="Key figures">
      {hasRisk && (
        <Link to="/analytics#overview" className="pl-kpi">
          <span className="pl-label">Health score</span>
          <span className="pl-score">
            <span className="pl-metric-l">{health ?? 'n/a'}</span>
            {health != null && <span className="pl-score-of">/ 100</span>}
            {t.health.status && <span className={`pl-chip ${healthChip(t.health.status as HealthStatus)} pl-push`}>{t.health.status}</span>}
          </span>
          {health != null && (
            <span className={`pl-bar${warn ? ' pl-warn' : ''}`} aria-hidden="true">
              <span style={{ ['--pl-fill' as string]: `${health}%` }} />
            </span>
          )}
          {t.health.note && <span className="pl-body-s">{t.health.note}</span>}
        </Link>
      )}
      {hasRisk && (
        <Link to="/risks" className="pl-kpi">
          <span className="pl-label">Outside appetite</span>
          <span className="pl-score">
            <span className={`pl-metric-l${exceed > 0 ? ' pl-tone-alert' : ''}`}>{exceed}</span>
            <span className="pl-score-of">{exceed === 1 ? 'risk' : 'risks'}</span>
          </span>
          <span className="pl-body-s">{t.outside_appetite.note}</span>
        </Link>
      )}
      {hasIncident && (
        <Link to="/incidents" className="pl-kpi">
          <span className="pl-label">Open incidents</span>
          <span className="pl-score">
            <span className="pl-metric-l">{t.open_incidents.value ?? 0}</span>
            {t.open_high > 0 && <span className="pl-chip pl-sev-h pl-push">{t.open_high} High</span>}
          </span>
          <span className="pl-body-s">{t.open_incidents.note}</span>
        </Link>
      )}
      {hasRisk && (
        <Link to="/analytics" className="pl-kpi">
          <span className="pl-label">Open actions</span>
          <span className="pl-score">
            <span className="pl-metric-l">{t.open_actions.value ?? 0}</span>
            <span className="pl-score-of">to do</span>
          </span>
          {t.open_actions.note && <span className="pl-body-s">{t.open_actions.note}</span>}
        </Link>
      )}
    </section>
  );
}

// ── Do this next ─────────────────────────────────────────────────────────────

function ActionRow({ a, n }: { a: HomeAction; n: number }) {
  const first = n === 1;
  const link = actionLink(a);
  const refs = a.target_kind === 'risks' || a.target_kind === 'incidents' ? a.refs.slice(0, 3) : [];
  return (
    <div className={`pl-home-act${first ? ' pl-first' : ''}`}>
      <span className={`pl-num-badge${first ? ' pl-first' : ''}`}>{n}</span>
      <div className="pl-home-act-body">
        <p className="pl-item-title">{a.title}</p>
        <p className="pl-body-s">{a.detail}</p>
        {(a.owner || a.due || refs.length > 0) && (
          <div className="pl-inline pl-home-tags">
            {a.owner && <span className="pl-tag">{a.owner}</span>}
            {a.due && <span className="pl-tag">Due {formatDate(a.due)}</span>}
            {refs.map(r => <span key={r} className="pl-tag">{r}</span>)}
          </div>
        )}
      </div>
      <Link to={link.to} className={`pl-btn ${first ? 'pl-btn-primary' : 'pl-btn-secondary'}`}>{link.label}</Link>
    </div>
  );
}

export function NextActions({ data, tourOn }: { data: HomeData; tourOn: boolean }) {
  return (
    <section id="sec-actions" className={`pl-card pl-stack-xs pl-tour-target${ring(tourOn)}`} aria-label="Do this next">
      <div className="pl-an-head">
        <div className="pl-stack-xs">
          <h2 className="pl-section">Do this next</h2>
          <p className="pl-intro">
            {data.actions.length > 1
              ? `${data.actions.length === 3 ? 'Three' : 'Two'} actions from your current figures, most urgent first.`
              : 'From your current figures.'}
          </p>
        </div>
        {data.actions_total > data.actions.length && (
          <Link to="/analytics" className="pl-link-strong">See all {data.actions_total} actions</Link>
        )}
      </div>
      {data.actions.length === 0 ? (
        <p className="pl-note">Nothing needs action right now.</p>
      ) : (
        data.actions.map((a, i) => <ActionRow key={a.key} a={a} n={i + 1} />)
      )}
    </section>
  );
}

// ── Where the risk sits ──────────────────────────────────────────────────────

function Tags({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null;
  return (
    <span className="pl-inline">
      {tags.map(t => (
        <span key={t} className={`pl-tag${t === 'Outside appetite' ? ' pl-tag-alert' : ''}`}>{t}</span>
      ))}
    </span>
  );
}

function RiskRow({ r }: { r: HomeRiskRow }) {
  return (
    <Link to={riskPath(r.id)} className="pl-row">
      <span className="pl-rid">{r.id}</span>
      <span className="pl-grow pl-stack-xs">{r.title ?? 'Untitled risk'}<Tags tags={r.tags} /></span>
      {r.level && <span className={`pl-chip ${severityChip(r.level)}`}>{r.level}</span>}
    </Link>
  );
}

function IncidentRow({ i }: { i: HomeIncidentRow }) {
  return (
    <Link to={incidentPath(i.id)} className="pl-row">
      <span className="pl-rid">{i.id}</span>
      <span className="pl-grow pl-stack-xs">{i.title ?? 'Untitled incident'}<Tags tags={i.tags} /></span>
      {i.severity && <span className={`pl-chip ${severityChip(i.severity)}`}>{i.severity}</span>}
    </Link>
  );
}

export function WhereLists({ data, hasRisk, hasIncident, tourOn }: {
  data: HomeData; hasRisk: boolean; hasIncident: boolean; tourOn: boolean;
}) {
  return (
    <div id="sec-where" className={`pl-card-grid pl-tour-target${ring(tourOn)}`}>
      {hasRisk && (
        <section className="pl-card" aria-label="Top risks">
          <div className="pl-an-head pl-home-list-head">
            <h2 className="pl-label">Top risks</h2>
            <Link to="/risks" className="pl-link-strong">Risk Register</Link>
          </div>
          {data.top_risks.length === 0
            ? <p className="pl-caption">No scored risks yet.</p>
            : data.top_risks.map(r => <RiskRow key={r.id} r={r} />)}
        </section>
      )}
      {hasIncident && (
        <section className="pl-card" aria-label="Open incidents">
          <div className="pl-an-head pl-home-list-head">
            <h2 className="pl-label">Open incidents</h2>
            <Link to="/incidents" className="pl-link-strong">Incidents</Link>
          </div>
          {data.open_incidents.length === 0
            ? <p className="pl-caption">Nothing open right now.</p>
            : data.open_incidents.map(i => <IncidentRow key={i.id} i={i} />)}
        </section>
      )}
    </div>
  );
}

// ── Recent activity ──────────────────────────────────────────────────────────

export function RecentActivity({ data, showAuditLink }: { data: HomeData; showAuditLink: boolean }) {
  const items = mergeFeed(data.activity_feed, data.incident_feed).slice(0, 3);
  return (
    <section className="pl-card" aria-label="Recent activity">
      <h2 className="pl-label pl-home-list-head">Recent activity</h2>
      {items.length === 0 && <p className="pl-caption">No changes recorded yet.</p>}
      {items.map(it => {
        const nar = it.kind === 'risk' ? riskNarrative(it.entry) : incidentNarrative(it.entry);
        const who = it.kind === 'risk' ? initialsOf(it.entry.user_email ?? 'R') : 'IN';
        const id = it.kind === 'risk' ? it.entry.risk_id : it.entry.incident_id;
        const to = it.kind === 'risk'
          ? (it.entry.risk_id ? riskPath(it.entry.risk_id) : null)
          : incidentPath(it.entry.incident_id);
        const body = (
          <>
            <span className="pl-ev-when pl-meta">{timeAgo(it.at)}</span>
            <span className={`pl-avatar pl-sm${it.kind === 'incident' ? ' pl-avatar-inc' : ''}`} aria-hidden="true">{who}</span>
            <span className="pl-grow">{id && <span className="pl-rid">{id} </span>}{nar.lead}</span>
          </>
        );
        return to
          ? <Link key={it.key} to={to} className="pl-row">{body}</Link>
          : <div key={it.key} className="pl-row">{body}</div>;
      })}
      <div className="pl-inline pl-home-more">
        <Link to="/analytics#activity" className="pl-link-strong">Every change</Link>
        {showAuditLink && <Link to="/audit" className="pl-link-strong">Audit Log</Link>}
      </div>
    </section>
  );
}

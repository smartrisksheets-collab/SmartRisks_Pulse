// src/components/dashboard/UnifiedSection.tsx

import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { timeAgo } from '../../utils/feedEvents';
import { useCanDo } from '../../utils/permissions';
import {
  ResponsiveContainer,
  ComposedChart,
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
import type {
  DashboardData,
  EnterpriseHealth,
  RiskPressure,
  Correlation,
  Movement,
  SnapshotDelta,
  HealthStatus,
  PressureLevel,
  RecommendedAction,
  ScoreComponent,
  ControlEvidence,
  PressureCategoryRow,
  UnifiedBrief,
} from '../../types/dashboard';

type ModalKey = 'pressure' | 'distribution' | 'materialised' | 'unlinked' | 'evidence';
import OperationalFeed from './OperationalFeed';
import { useSettingsStore } from '../../store/settingsStore';
import { formatMoneyCompact, formatDate } from '../../utils/format';
import { generateUnifiedBrief } from '../../services/dashboard';

// ── Module-level constants ────────────────────────────────────────────────────

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

function pressureCompFill(score: number): string {
  return score >= 60 ? 'red' : score >= 30 ? 'amber' : '';
}

function appetiteChip(row: PressureCategoryRow): { cls: string; text: string } {
  if (row.exceeds > 0) return { cls: 'red', text: `${row.exceeds} exceed${row.exceeds === 1 ? 's' : ''}` };
  if (row.near > 0) return { cls: 'amber', text: `${row.near} near` };
  if (!row.threshold_configured) return { cls: 'grey', text: 'No threshold' };
  return { cls: 'teal', text: 'Within' };
}

function ScoreBars({ components, higherIsWorse }: { components: ScoreComponent[]; higherIsWorse: boolean }) {
  return (
    <div className="im-why-body u-score-bars">
      {components.map(c => (
        <div key={c.name} className="im-comp">
          <span className="im-comp-name">{c.suppressed ? `${c.name} (n/a)` : c.name}</span>
          <span className="im-comp-weight">{c.weight}</span>
          <span className="im-comp-track">
            <span
              className={`im-comp-fill ${higherIsWorse ? pressureCompFill(c.score) : compFill(c.score)}`}
              style={{ width: `${c.suppressed ? 0 : c.score}%` }}
            />
          </span>
          <span className="im-comp-score">{c.suppressed ? '—' : c.score}</span>
        </div>
      ))}
    </div>
  );
}

function ActionList({ actions, emptyText }: { actions: RecommendedAction[]; emptyText: string }) {
  if (actions.length === 0) return <p className="u-modal-note">{emptyText}</p>;
  return (
    <ul className="u-acts">
      {actions.map(a => {
        const meta = [a.owner, a.due ? `Due ${formatDate(a.due)}` : null].filter(Boolean).join(' · ');
        return (
          <li key={a.key} className="u-act">
            <div className="u-act-head">
              <span className="u-act-title">{a.title}</span>
              {meta && <span className="u-act-meta">{meta}</span>}
            </div>
            <p className="u-act-detail">{a.detail}</p>
            <p className="u-act-done">Done when: {a.done_when}</p>
          </li>
        );
      })}
    </ul>
  );
}

// ── Risk Pressure modal ───────────────────────────────────────────────────────

function PressureModalContent({ pressure, canCreateRisk, onGo }: {
  pressure: RiskPressure;
  canCreateRisk: boolean;
  onGo: (path: string) => void;
}) {
  const uncovered = pressure.by_category.filter(r => !r.covered);
  const firstGap = uncovered[0];

  return (
    <>
      <div className="u-modal-kpis">
        <div className="u-modal-kpi">
          <div className="u-modal-kpi-label">Pressure Score</div>
          <div className={`u-modal-kpi-value ${pressure.level === 'Elevated' ? 'bad' : pressure.level === 'Moderate' ? 'warn' : ''}`}>
            {pressure.level === 'No data' ? '—' : pressure.score}
          </div>
          <div className="u-modal-kpi-sub">of 100</div>
        </div>
        <div className="u-modal-kpi">
          <div className="u-modal-kpi-label">Active Risks</div>
          <div className="u-modal-kpi-value">{pressure.active_risks}</div>
        </div>
        <div className="u-modal-kpi">
          <div className="u-modal-kpi-label">Outside Appetite</div>
          <div className={`u-modal-kpi-value ${pressure.exceeds_appetite > 0 ? 'bad' : ''}`}>{pressure.exceeds_appetite}</div>
        </div>
        <div className="u-modal-kpi">
          <div className="u-modal-kpi-label">Open Incidents</div>
          <div className="u-modal-kpi-value">{pressure.open_incidents}</div>
          {pressure.open_incidents_overdue > 0 && (
            <div className="u-modal-kpi-sub">{pressure.open_incidents_overdue} overdue</div>
          )}
        </div>
      </div>

      <div className="u-modal-section">
        <div className="u-modal-section-title">What makes up the score</div>
        <ScoreBars components={pressure.components} higherIsWorse />
      </div>

      {pressure.by_category.length > 0 && (
        <div className="u-modal-section">
          <div className="u-modal-section-title">Pressure by category</div>
          <table className="u-modal-table">
            <thead>
              <tr>
                <th>Category</th>
                <th className="u-num">Risks</th>
                <th className="u-num">Elevated</th>
                <th className="u-num">Incidents</th>
                <th>Appetite</th>
                <th aria-label="Action" />
              </tr>
            </thead>
            <tbody>
              {pressure.by_category.map(row => {
                const chip = row.covered ? appetiteChip(row) : { cls: 'grey', text: 'No covering risk' };
                return (
                  <tr key={`${row.covered ? 'r' : 'i'}-${row.category}`}>
                    <td className={row.covered ? '' : 'u-miss'}>{row.category}</td>
                    <td className="u-num">{row.risks}</td>
                    <td className="u-num">{row.covered ? row.elevated : '—'}</td>
                    <td className={`u-num${!row.covered && row.incidents > 0 ? ' u-bad' : ''}`}>{row.incidents}</td>
                    <td><span className={`u-chip ${chip.cls}`}>{chip.text}</span></td>
                    <td>
                      {!row.covered && canCreateRisk && (
                        <button
                          type="button"
                          className="u-rowbtn"
                          onClick={() => onGo(`/risks?new=1&category=${encodeURIComponent(row.category)}`)}
                        >
                          Create risk
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {firstGap && (
            <p className="u-modal-note">
              <b>
                {firstGap.category} has produced {firstGap.incidents} incident{firstGap.incidents === 1 ? '' : 's'} and no
                register risk covers it.
              </b>{' '}
              It adds nothing to the pressure score, because the score can only see what has been logged.
            </p>
          )}
        </div>
      )}

      <div className="u-modal-section">
        <div className="u-modal-section-title">Recommended actions</div>
        <ActionList
          actions={pressure.actions}
          emptyText="Nothing needs action: no appetite breaches, no undecided or overdue risks, and no uncovered incident categories."
        />
      </div>
    </>
  );
}

// ── Materialised risks modal ──────────────────────────────────────────────────

function MaterialisedModalContent({ c, currency, canEditRisk, onGo }: {
  c: Correlation;
  currency: string;
  canEditRisk: boolean;
  onGo: (path: string) => void;
}) {
  if (c.risks_materialised === 0) {
    return <p className="u-modal-note">No incident is linked to a register risk yet.</p>;
  }

  return (
    <>
      <p className="u-modal-note">
        <b>These risks were identified in advance, and the controls did not prevent an incident.</b> That is a control
        failure, not an identification failure, which is a different problem from incidents with no matching risk.
      </p>

      <div className="u-modal-kpis">
        <div className="u-modal-kpi">
          <div className="u-modal-kpi-label">Materialised</div>
          <div className="u-modal-kpi-value warn">{c.risks_materialised}</div>
          <div className="u-modal-kpi-sub">of {c.risks_total} risks</div>
        </div>
        <div className="u-modal-kpi">
          <div className="u-modal-kpi-label">Rated Well Controlled</div>
          <div className={`u-modal-kpi-value ${c.contradicted > 0 ? 'bad' : ''}`}>{c.contradicted}</div>
          <div className="u-modal-kpi-sub">rated 4 or 5</div>
        </div>
        <div className="u-modal-kpi">
          <div className="u-modal-kpi-label">Repeat Categories</div>
          <div className={`u-modal-kpi-value ${c.repeat_categories.length > 0 ? 'warn' : ''}`}>{c.repeat_categories.length}</div>
          <div className="u-modal-kpi-sub">{c.repeat_categories.join(', ') || 'none'}</div>
        </div>
        <div className="u-modal-kpi">
          <div className="u-modal-kpi-label">Financial Impact</div>
          <div className="u-modal-kpi-value">
            {c.materialised_financial_total > 0 ? formatMoneyCompact(c.materialised_financial_total, currency) : '—'}
          </div>
          <div className="u-modal-kpi-sub">{c.materialised_financial_quantified} of {c.materialised_incidents} quantified</div>
        </div>
      </div>

      <div className="u-modal-section">
        <div className="u-modal-section-title">The records</div>
        <table className="u-modal-table">
          <thead>
            <tr>
              <th>Risk</th>
              <th>Category</th>
              <th className="u-num">Residual</th>
              <th className="u-num">Control</th>
              <th>Incident produced</th>
              <th aria-label="Action" />
            </tr>
          </thead>
          <tbody>
            {c.materialised.map(m => (
              <tr key={m.risk_id}>
                <td className="u-id" title={m.description ?? undefined}>{m.risk_id}</td>
                <td>{m.category ?? '—'}</td>
                <td className="u-num">{m.residual != null ? m.residual.toFixed(1) : '—'}</td>
                <td className={`u-num${m.contradicted ? ' u-bad' : ''}`}>
                  {m.control_rating != null ? `${m.control_rating} / 5` : '—'}
                </td>
                <td>
                  {m.latest_incident_id ?? '—'}
                  {m.latest_incident_severity ? ` · ${m.latest_incident_severity}` : ''}
                  {m.latest_incident_reported_at ? ` · ${formatDate(m.latest_incident_reported_at)}` : ''}
                  {m.incident_count > 1 ? ` (+${m.incident_count - 1} more)` : ''}
                </td>
                <td>
                  {canEditRisk && (
                    <button
                      type="button"
                      className="u-rowbtn"
                      onClick={() => onGo(`/risks?edit=${encodeURIComponent(m.risk_id)}`)}
                    >
                      Re-score
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {c.risks_materialised > c.materialised.length && (
          <p className="u-modal-note">Showing {c.materialised.length} of {c.risks_materialised}.</p>
        )}
      </div>

      <div className="u-modal-section">
        <div className="u-modal-section-title">Recommended actions</div>
        <ActionList actions={c.materialised_actions} emptyText="No action needed on materialised risks." />
      </div>
    </>
  );
}

// ── Unlinked incidents modal ──────────────────────────────────────────────────

function UnlinkedModalContent({ c, canCreateRisk, canLink, onGo }: {
  c: Correlation;
  canCreateRisk: boolean;
  canLink: boolean;
  onGo: (path: string) => void;
}) {
  if (c.incidents_unlinked === 0) {
    return <p className="u-modal-note">Every incident is linked to a register risk.</p>;
  }

  const pct = c.incidents_total > 0 ? Math.round((c.incidents_unlinked / c.incidents_total) * 100) : 0;
  const gaps = c.uncovered_categories;

  return (
    <>
      <p className="u-modal-note">
        <b>{pct}% of incidents have no matching register risk.</b> Each one is either a risk that should be logged, or a
        match to an existing risk that triage missed.
      </p>

      <div className="u-modal-kpis">
        <div className="u-modal-kpi">
          <div className="u-modal-kpi-label">Unlinked</div>
          <div className="u-modal-kpi-value bad">{c.incidents_unlinked}</div>
          <div className="u-modal-kpi-sub">of {c.incidents_total} incidents</div>
        </div>
        <div className="u-modal-kpi">
          <div className="u-modal-kpi-label">Uncovered Categories</div>
          <div className={`u-modal-kpi-value ${gaps.length > 0 ? 'bad' : ''}`}>{gaps.length}</div>
          <div className="u-modal-kpi-sub">no covering risk</div>
        </div>
        <div className="u-modal-kpi">
          <div className="u-modal-kpi-label">Recurring</div>
          <div className={`u-modal-kpi-value ${c.recurring_unlinked_categories.length > 0 ? 'warn' : ''}`}>
            {c.recurring_unlinked_categories.length}
          </div>
          <div className="u-modal-kpi-sub">{c.recurring_unlinked_categories.join(', ') || 'none'}</div>
        </div>
        <div className="u-modal-kpi">
          <div className="u-modal-kpi-label">Highest Severity</div>
          <div className="u-modal-kpi-value warn">{c.highest_unlinked_severity ?? '—'}</div>
          <div className="u-modal-kpi-sub">{c.highest_unlinked_id ?? ''}</div>
        </div>
      </div>

      <div className="u-modal-section">
        <div className="u-modal-section-title">The records</div>
        <table className="u-modal-table">
          <thead>
            <tr>
              <th>Incident</th>
              <th>Category</th>
              <th>Severity</th>
              <th>Logged</th>
              <th>Register coverage</th>
              <th aria-label="Action" />
            </tr>
          </thead>
          <tbody>
            {c.unlinked.map(u => (
              <tr key={u.incident_id}>
                <td className="u-id" title={u.title ?? undefined}>{u.incident_id}</td>
                <td>{u.category ?? '—'}</td>
                <td>{u.severity ?? '—'}</td>
                <td>{formatDate(u.reported_at)}</td>
                <td>
                  {u.covered ? (
                    <span className="u-chip teal" title={u.covering_categories.join(', ')}>
                      {u.candidate_risks} candidate risk{u.candidate_risks === 1 ? '' : 's'}
                    </span>
                  ) : (
                    <span className="u-chip grey">No covering risk</span>
                  )}
                </td>
                <td>
                  {u.covered && canLink && (
                    <button
                      type="button"
                      className="u-rowbtn"
                      onClick={() => onGo(`/incidents?incident=${encodeURIComponent(u.incident_id)}`)}
                    >
                      Link
                    </button>
                  )}
                  {!u.covered && canCreateRisk && (
                    <button
                      type="button"
                      className="u-rowbtn"
                      onClick={() => onGo(`/risks?new=1&category=${encodeURIComponent(u.category ?? '')}`)}
                    >
                      Create risk
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {c.incidents_unlinked > c.unlinked.length && (
          <p className="u-modal-note">Showing {c.unlinked.length} of {c.incidents_unlinked}.</p>
        )}
        {gaps.length > 0 && (
          <p className="u-modal-note">
            <b>{gaps.join(', ')} {gaps.length === 1 ? 'has' : 'have'} no covering risk on the register.</b> That is a
            category gap, not a set of separate events.
          </p>
        )}
      </div>

      <div className="u-modal-section">
        <div className="u-modal-section-title">Recommended actions</div>
        <ActionList actions={c.unlinked_actions} emptyText="No action needed on unlinked incidents." />
      </div>
    </>
  );
}

// ── Control evidence modal ────────────────────────────────────────────────────

function EvidenceModalContent({ ev, canEditRisk, onGo }: {
  ev: ControlEvidence;
  canEditRisk: boolean;
  onGo: (path: string) => void;
}) {
  if (ev.rated === 0) {
    return <p className="u-modal-note">No control effectiveness ratings are recorded yet.</p>;
  }

  const shown = ev.rows.slice(0, 5);
  const statusChip = (s: string): { cls: string; text: string } =>
    s === 'contradicted' ? { cls: 'red', text: 'Contradicted' }
    : s === 'evidenced'  ? { cls: 'teal', text: 'Evidenced' }
    : { cls: 'amber', text: 'Unevidenced' };

  return (
    <>
      <p className="u-modal-note">
        {ev.evidenced === 0
          ? <b>None of the control ratings carries a recent independent test. They rest on self-assessment.</b>
          : <b>{ev.evidenced} of {ev.rated} ratings carry a recent independent test. The others rely on self-assessment.</b>}
        {ev.contradicted > 0 &&
          ` ${ev.contradicted} ${ev.contradicted === 1 ? 'has' : 'have'} already been contradicted by an incident.`}
      </p>

      <div className="u-modal-kpis">
        <div className="u-modal-kpi">
          <div className="u-modal-kpi-label">With Test Date</div>
          <div className={`u-modal-kpi-value ${ev.with_recent_test < ev.rated ? 'bad' : ''}`}>{ev.with_recent_test}</div>
          <div className="u-modal-kpi-sub">of {ev.rated}, last 12 months</div>
        </div>
        <div className="u-modal-kpi">
          <div className="u-modal-kpi-label">Independent</div>
          <div className={`u-modal-kpi-value ${ev.independently_asserted < ev.rated ? 'bad' : ''}`}>{ev.independently_asserted}</div>
          <div className="u-modal-kpi-sub">of {ev.rated}</div>
        </div>
        <div className="u-modal-kpi">
          <div className="u-modal-kpi-label">Rated 4 or 5</div>
          <div className={`u-modal-kpi-value ${ev.rated_high > 0 ? 'warn' : ''}`}>{ev.rated_high}</div>
          <div className="u-modal-kpi-sub">test these first</div>
        </div>
        <div className="u-modal-kpi">
          <div className="u-modal-kpi-label">Contradicted</div>
          <div className={`u-modal-kpi-value ${ev.contradicted > 0 ? 'bad' : ''}`}>{ev.contradicted}</div>
          <div className="u-modal-kpi-sub">by an incident</div>
        </div>
      </div>

      <div className="u-modal-section">
        <div className="u-modal-section-title">Highest-rated first, these carry the most weight</div>
        <table className="u-modal-table">
          <thead>
            <tr>
              <th>Risk</th>
              <th>Category</th>
              <th className="u-num">Control</th>
              <th>Last tested</th>
              <th>Assertion source</th>
              <th>Status</th>
              <th aria-label="Action" />
            </tr>
          </thead>
          <tbody>
            {shown.map(r => {
              const chip = statusChip(r.status);
              return (
                <tr key={r.risk_id}>
                  <td className="u-id" title={r.description ?? undefined}>{r.risk_id}</td>
                  <td>{r.category ?? '—'}</td>
                  <td className="u-num">{r.control_rating != null ? `${r.control_rating} / 5` : '—'}</td>
                  <td className={r.last_tested ? '' : 'u-miss'}>{r.last_tested ? formatDate(r.last_tested) : 'Never'}</td>
                  <td className={r.assertion_source ? '' : 'u-miss'}>{r.assertion_source ?? 'Not recorded'}</td>
                  <td><span className={`u-chip ${chip.cls}`}>{chip.text}</span></td>
                  <td>
                    {canEditRisk && r.status !== 'evidenced' && (
                      <button
                        type="button"
                        className="u-rowbtn"
                        onClick={() => onGo(`/risks?edit=${encodeURIComponent(r.risk_id)}`)}
                      >
                        Evidence
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="u-modal-note">
          {ev.rated > shown.length && `Showing ${shown.length} of ${ev.rated}. `}
          A rating of 5 removes all of a risk&apos;s inherent severity from its residual score, so an unevidenced 5 is the
          largest unverified assumption on the register.
        </p>
      </div>

      <div className="u-modal-section">
        <div className="u-modal-section-title">Recommended actions</div>
        <ActionList actions={ev.actions} emptyText="No action needed on control evidence." />
      </div>
    </>
  );
}

// ── Status helpers (not exported, so Fast Refresh is unaffected) ─────────────

function healthTone(status: HealthStatus): string {
  if (status === 'Healthy')    return 'im-tone-good';
  if (status === 'Monitoring') return 'im-tone-teal';
  if (status === 'At Risk')    return 'im-tone-warn';
  if (status === 'Critical')   return 'im-tone-bad';
  return 'im-tone-muted';
}

function healthPillClass(status: HealthStatus): string {
  if (status === 'Healthy')  return 'up';
  if (status === 'At Risk')  return 'warn';
  if (status === 'Critical') return 'down';
  return 'flat';
}

function pressurePillClass(level: PressureLevel): string {
  if (level === 'Elevated') return 'down';
  if (level === 'Moderate') return 'warn';
  if (level === 'Low')      return 'up';
  return 'flat';
}

function pressureFillClass(level: PressureLevel): string {
  if (level === 'Elevated') return 'lvl-elevated';
  if (level === 'Moderate') return 'lvl-moderate';
  if (level === 'Low')      return 'lvl-low';
  return 'lvl-none';
}

function compFill(score: number): string {
  return score >= 70 ? '' : score >= 40 ? 'amber' : 'red';
}

// ── Enterprise Risk Health card ───────────────────────────────────────────────

interface HealthCardProps {
  health: EnterpriseHealth;
  delta: SnapshotDelta;
  exceeds: number;
  totalRisks: number;
  currency: string;
}

function HealthCard({ health, delta, exceeds, totalRisks, currency }: HealthCardProps) {
  const tone   = healthTone(health.status);
  const noData = health.status === 'No data';
  const ap     = health.appetite;
  const scale  = health.scale_max;

  const threshold    = ap.configured ? ap.threshold_avg : null;
  const barValue     = threshold != null && ap.avg_residual_scored != null ? ap.avg_residual_scored : health.avg_residual;
  const valuePct     = clamp(0, 100, (barValue / scale) * 100);
  const thresholdPct = threshold != null ? clamp(0, 100, (threshold / scale) * 100) : null;
  const over         = threshold != null && barValue > threshold;
  const headroom     = threshold != null ? Math.abs(threshold - barValue).toFixed(1) : null;

  const residualDelta = delta.has_data ? delta.avg_residual : null;
  const changeTone = residualDelta == null || residualDelta === 0
    ? 'im-tone-muted'
    : residualDelta > 0 ? 'im-tone-bad' : 'im-tone-good';
  const changeText = !delta.has_data
    ? 'No earlier snapshot to compare yet'
    : residualDelta == null || residualDelta === 0
      ? `Residual unchanged ${delta.period_label}`
      : residualDelta > 0
        ? `Residual ▲ +${residualDelta.toFixed(1)}% ${delta.period_label}`
        : `Residual ▼ ${residualDelta.toFixed(1)}% ${delta.period_label}`;

  const incN = health.incident_count;
  const hasSuppressed = health.components.some(c => c.suppressed);

  return (
    <div className="im-card">
      <div className="im-card-head">
        <span className="im-label">ENTERPRISE RISK HEALTH</span>
        <div className="im-head-signals">
          <span className={`im-delta ${healthPillClass(health.status)}`}>{health.status}</span>
          <span
            className="im-delta flat"
            title={health.confidence_reasons.join('; ') || 'All evidence checks passed'}
          >
            {health.confidence} confidence
          </span>
        </div>
      </div>

      <div className="im-score-row">
        <span className={`im-score-num ${tone}`}>{noData ? '—' : health.score}</span>
        <span className="im-score-of">of 100</span>
        <span className={`im-score-status ${tone}`}>{health.status}</span>
      </div>
      <div className={`im-score-change ${changeTone}`}>{changeText}</div>

      <div className="im-appetite">
        <div className="im-appetite-head">
          <span>{threshold != null ? 'Avg residual of risks with a threshold' : 'Average residual'} · scale 0 to {scale}</span>
          {threshold != null && <span>Appetite {threshold}</span>}
        </div>
        <div
          className="im-appetite-bar"
          role="img"
          aria-label={
            threshold == null
              ? `Average residual ${barValue} of ${scale}. No appetite threshold to compare.`
              : `Average residual ${barValue} against an appetite threshold of ${threshold} on a ${scale}-point scale.`
          }
        >
          <span className={`im-appetite-fill${over ? ' over' : ''}`} style={{ width: `${valuePct}%` }} />
          {thresholdPct != null && (
            <>
              <span
                className={`im-appetite-gap${over ? ' over' : ''}`}
                style={{ left: `${Math.min(valuePct, thresholdPct)}%`, width: `${Math.abs(thresholdPct - valuePct)}%` }}
              />
              <span className="im-appetite-marker" style={{ left: `${thresholdPct}%` }} />
            </>
          )}
        </div>
        <div className="im-appetite-scale"><span>0</span><span>{scale / 2}</span><span>{scale}</span></div>
      </div>

      {!ap.configured ? (
        <div className="im-appetite-note">
          <strong>No appetite thresholds configured.</strong> This score describes how large the exposure is,
          not whether it is acceptable.
        </div>
      ) : threshold == null ? (
        <div className="im-appetite-note">
          <strong>Thresholds are set, but no risks sit in those categories yet.</strong>
        </div>
      ) : (
        <div className={`im-appetite-note ${over || exceeds > 0 ? 'bad' : 'ok'}`}>
          <strong>
            {over
              ? `The average sits ${headroom} points above appetite.`
              : `The average sits ${headroom} points inside appetite.`}
          </strong>
          {exceeds > 0 && ` ${exceeds} risk${exceeds === 1 ? '' : 's'} exceed${exceeds === 1 ? 's' : ''} their own category threshold.`}
          {health.capped_by_appetite && ' Status is capped at At Risk by the breach, independent of the score.'}
        </div>
      )}

      <div className="im-exposure-divider" />

      <div className="im-exposure-grid">
        <div className="im-exposure-item">
          <div className="im-exposure-label">Residual risk</div>
          <div className="im-exposure-value">{totalRisks > 0 ? health.avg_residual.toFixed(1) : '—'}</div>
          <div className="im-exposure-basis">avg of {scale}</div>
        </div>
        <div className="im-exposure-item">
          <div className="im-exposure-label">Incident health</div>
          <div className="im-exposure-value">{health.incident_health_score ?? '—'}</div>
          <div className="im-exposure-basis">
            {incN} incident{incN === 1 ? '' : 's'}{incN > 0 && incN < 5 ? ' · indicative' : ''}
          </div>
        </div>
        <div className="im-exposure-item">
          <div className="im-exposure-label">Financial exposure</div>
          <div className="im-exposure-value">
            {health.financial_exposure > 0 ? formatMoneyCompact(health.financial_exposure, currency) : '—'}
          </div>
          <div className="im-exposure-basis">{health.financial_quantified} of {totalRisks} risks quantified</div>
        </div>
      </div>

      {!noData && (
        <details className="im-why">
          <summary>Why {health.score}?</summary>
          <div className="im-why-body">
            {health.components.map(c => (
              <div key={c.name} className="im-comp">
                <span className="im-comp-name">{c.suppressed ? `${c.name} (n/a)` : c.name}</span>
                <span className="im-comp-weight">{c.weight}</span>
                <span className="im-comp-track">
                  <span className={`im-comp-fill ${compFill(c.score)}`} style={{ width: `${c.suppressed ? 0 : c.score}%` }} />
                </span>
                <span className="im-comp-score">{c.suppressed ? '—' : c.score}</span>
              </div>
            ))}
            {hasSuppressed && (
              <p className="im-why-supp">Components marked n/a have no data yet; their weight is shared across the others.</p>
            )}
          </div>
        </details>
      )}
    </div>
  );
}

// ── Risk Pressure card ────────────────────────────────────────────────────────

function PressureCard({ pressure, onInsights }: { pressure: RiskPressure; onInsights: () => void }) {
  const noData       = pressure.level === 'No data';
  const evidenceWeak = pressure.rated > 0 && pressure.evidenced * 2 < pressure.rated;

  return (
    <div className="im-card">
      <div className="im-card-head">
        <span className="im-label">RISK PRESSURE</span>
        <span className={`im-delta ${pressurePillClass(pressure.level)}`}>{pressure.level}</span>
      </div>

      <div className="im-score-row">
        <span className="im-score-num im-score-sm">{noData ? '—' : pressure.score}</span>
        <span className="im-score-of">/100</span>
      </div>
      <div className="im-pressure-bar">
        <div
          className={`im-pressure-fill ${pressureFillClass(pressure.level)}`}
          style={{ width: `${noData ? 0 : pressure.score}%` }}
        />
      </div>

      <div className="im-metric-list">
        <div className="im-row"><span>Active risks</span><strong>{pressure.active_risks}</strong></div>
        <div className="im-row">
          <span>High or above</span>
          <strong className={pressure.elevated > 0 ? 'is-warn' : ''}>{pressure.elevated} of {pressure.active_risks}</strong>
        </div>
        <div className="im-row">
          <span>Exceeding appetite</span>
          <strong className={pressure.exceeds_appetite > 0 ? 'is-bad' : ''}>{pressure.exceeds_appetite}</strong>
        </div>
        <div className="im-row">
          <span>Open incidents</span>
          <strong>
            {pressure.open_incidents}
            {pressure.open_incidents_overdue > 0 && (
              <span className="im-row-note">{pressure.open_incidents_overdue} overdue</span>
            )}
          </strong>
        </div>
        <div className="im-row">
          <span>Undecided risks</span>
          <strong className={pressure.undecided > 0 ? 'is-warn' : ''}>{pressure.undecided}</strong>
        </div>
        <div className="im-row">
          <span>Past target date</span>
          <strong className={pressure.past_target > 0 ? 'is-warn' : ''}>{pressure.past_target}</strong>
        </div>
        <div className="im-row">
          <span>Controls evidenced</span>
          <strong className={evidenceWeak ? 'is-bad' : ''}>
            {pressure.rated > 0 ? `${pressure.evidenced} of ${pressure.rated}` : '—'}
          </strong>
        </div>
      </div>

      <InsightFooter label="View insights" onClick={onInsights} />
    </div>
  );
}

// ── Executive Intelligence card ───────────────────────────────────────────────

function ExecBriefCard({ stored, hasData, snapshotsHeld, canGenerate }: {
  stored: UnifiedBrief | null;
  hasData: boolean;
  snapshotsHeld: number;
  canGenerate: boolean;
}) {
  const qc = useQueryClient();
  const [fresh, setFresh]     = useState<UnifiedBrief | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr]         = useState<string | null>(null);
  const brief = fresh ?? stored;

  async function generate() {
    setLoading(true);
    setErr(null);
    try {
      setFresh(await generateUnifiedBrief());
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'The executive brief could not be generated.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="im-card im-exec">
      <div className="im-card-head">
        <span className="im-label">EXECUTIVE INTELLIGENCE</span>
        <span className="im-badge">AI-assisted</span>
      </div>

      {!hasData ? (
        <p className="im-exec-p">No risk or incident data yet. Add records to enable the executive brief.</p>
      ) : brief ? (
        brief.paragraphs.map((p, i) => (
          <p key={i} className="im-exec-p" dangerouslySetInnerHTML={{ __html: p }} />
        ))
      ) : (
        <p className="im-exec-p im-exec-muted">
          A plain-language brief of the figures above, written for the board. Generated on request.
        </p>
      )}

      {brief && hasData && (
        <p className="im-exec-meta">
          Generated {timeAgo(brief.generated_at)}{brief.generated_by ? ` by ${brief.generated_by}` : ''}
        </p>
      )}
      {brief?.stale && hasData && (
        <p className="im-exec-stale">
          The figures have changed since this brief was generated. Regenerate it before relying on it.
        </p>
      )}

      {err && <p className="im-exec-err">{err}</p>}

      {hasData && canGenerate && (
        <div>
          <button type="button" className="btn btn-ai btn-compact" onClick={generate} disabled={loading}>
            {loading
              ? <><span className="spinner" />Generating...</>
              : brief ? 'Regenerate brief' : 'Generate executive brief'}
          </button>
        </div>
      )}

      <div className="im-exec-foot">
        <span>
          Validate alongside professional judgment.{' '}
          <a
          
            href="https://smartrisksheets.com/ai-transparency-data-use-statement/"
            target="_blank"
            rel="noreferrer"
            className="im-ai-link"
          >
            Learn more
          </a>
        </span>
        <span>
          {snapshotsHeld} snapshot{snapshotsHeld === 1 ? '' : 's'}
          {snapshotsHeld < 2 ? ' · trend indicators suppressed' : ''}
        </span>
        <span>Risk and incident data unified</span>
      </div>
    </div>
  );
}

// ── Risk & Incident Correlation row ──────────────────────────────────────────

function CorrelationRow({ c, evidenced, rated, onOpen }: {
  c: Correlation;
  evidenced: number;
  rated: number;
  onOpen: (key: ModalKey) => void;
}) {
  const head = (
    <div className="im-sect-head">
      <h2>RISK &amp; INCIDENT CORRELATION</h2>
      <p>What the two registers say about each other</p>
    </div>
  );

  if (c.incidents_total === 0) {
    return (
      <>
        {head}
        <div className="im-card im-corr-empty">
          <p>
            Correlation appears once incidents are logged. Link each incident to the register risk it relates to
            during triage, and this row will show which risks materialised, which incidents the register never
            anticipated, and which control ratings reality contradicts.
          </p>
        </div>
      </>
    );
  }

  const indicative  = c.incidents_total < 5;
  const unlinkedPct = Math.round((c.incidents_unlinked / c.incidents_total) * 100);
  const uncovered   = c.uncovered_categories.length;
  const matFoot = c.materialised.slice(0, 3)
    .map(m => (m.category ? `${m.risk_id} ${m.category}` : m.risk_id)).join(' · ');
  const unlFoot = c.unlinked.slice(0, 3)
    .map(u => (u.category ? `${u.incident_id} ${u.category}` : u.incident_id)).join(' · ');

  return (
    <>
      {head}
      <div className="im-grid-corr">
        <div className="im-card">
          <div className="im-card-head">
            <span className="im-label">RISKS THAT MATERIALISED</span>
            {indicative && <span className="im-delta flat">Indicative</span>}
          </div>
          <div className={`im-corr-big${c.risks_materialised > 0 ? ' warn' : ''}`}>
            {c.risks_materialised}<em>of {c.risks_total} risks</em>
          </div>
          <p className="im-corr-copy">
            {c.risks_materialised > 0
              ? 'Identified on the register, and the control did not prevent an incident.'
              : 'No incident is linked to a register risk yet.'}
          </p>
          <p className="im-corr-foot">{matFoot || '—'}</p>
          <InsightFooter label="View materialised risks" onClick={() => onOpen('materialised')} />
        </div>

        <div className="im-card">
          <div className="im-card-head">
            <span className="im-label">INCIDENTS WITH NO MATCHING RISK</span>
            {c.incidents_unlinked > 0 && <span className="im-delta down">Blind spot</span>}
          </div>
          <div className={`im-corr-big${c.incidents_unlinked > 0 ? ' bad' : ''}`}>
            {c.incidents_unlinked}<em>of {c.incidents_total} incidents</em>
          </div>
          <p className="im-corr-copy">
            {c.incidents_unlinked > 0 ? (
              <>
                {unlinkedPct}% of incidents have no corresponding register risk.
                {uncovered > 0 && (
                  <strong> {uncovered} incident categor{uncovered === 1 ? 'y has' : 'ies have'} no covering risk at all.</strong>
                )}
              </>
            ) : 'Every incident is linked to a register risk.'}
          </p>
          <p className="im-corr-foot">{unlFoot || '—'}</p>
          <InsightFooter label="Review unlinked incidents" onClick={() => onOpen('unlinked')} />
        </div>

        <div className="im-card">
          <div className="im-card-head">
            <span className="im-label">CONTROL RATINGS VS REALITY</span>
            {c.contradicted > 0 && <span className="im-delta down">{c.contradicted} contradicted</span>}
          </div>
          <div className={`im-corr-big${c.contradicted > 0 ? ' bad' : ''}`}>
            {c.contradicted}<em>of {c.risks_materialised} materialised</em>
          </div>
          <p className="im-corr-copy">
            {c.risks_materialised === 0
              ? 'Nothing to test against yet: no incident is linked to a risk.'
              : c.contradicted > 0
                ? 'Rated 4 or 5 for control effectiveness and still produced an incident. These ratings are the first to test.'
                : 'No well-rated control has produced an incident.'}
          </p>
          <p className="im-corr-foot">
            {rated > 0
              ? `${evidenced} of ${rated} control ratings carry a recent independent test`
              : 'No control ratings recorded'}
          </p>
          <InsightFooter label="Review control evidence" onClick={() => onOpen('evidence')} />
        </div>
      </div>
    </>
  );
}

// ── Exposure & Incident Trend card ────────────────────────────────────────────

function TrendCard({ movement }: { movement: Movement }) {
  const held = movement.snapshots_held;
  const chartData = movement.points.map(p => ({
    label: p.label,
    residual: p.avg_residual,
    incidents: p.incidents_created,
  }));

  return (
    <div className="im-card im-wide">
      <div className="im-card-head">
        <span className="im-label">EXPOSURE &amp; INCIDENT TREND</span>
        <div className="im-trend-head-right">
          <div className="im-trend-legend">
            <span className="im-legend-item"><span className="im-legend-dot navy" />Avg residual</span>
            <span className="im-legend-item"><span className="im-legend-dot emerald" />Incident volume</span>
          </div>
          <span className="im-trend-sub">{held} snapshot{held === 1 ? '' : 's'} held</span>
          {held < 2 && <span className="im-trend-badge">Baseline</span>}
        </div>
      </div>

      {chartData.length > 0 ? (
        <div className="dash-chart-wrap">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 4, right: 10, bottom: 0, left: -22 }}>
              <CartesianGrid strokeDasharray="2 4" stroke="var(--line)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="left" tick={{ fontSize: 10, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: 'var(--muted)' }} axisLine={false} tickLine={false} allowDecimals={false} />
              <RTooltip
                contentStyle={{ fontSize: 11, borderRadius: 6, background: '#1F2854', border: 'none', color: '#fff', padding: '6px 10px' }}
                labelStyle={{ color: '#94a3b8', fontSize: 10 }}
                itemStyle={{ color: '#fff' }}
              />
              <Bar yAxisId="right" dataKey="incidents" name="Incident volume" fill="#01b88e" radius={[3, 3, 0, 0]} barSize={18} />
              <Line yAxisId="left" type="monotone" dataKey="residual" name="Avg residual" stroke="#1F2854" strokeWidth={2} dot={{ fill: '#1F2854', r: 3, strokeWidth: 0 }} activeDot={{ r: 4, strokeWidth: 0 }} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="dash-empty">Trend data appears once risks are logged.</div>
      )}

      {movement.trend_findings.length > 0
        ? movement.trend_findings.map(f => <p key={f} className="im-finding">{f}</p>)
        : <p className="im-finding-muted">A trend finding appears once three months of snapshots are held.</p>}
    </div>
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
  const [modal, setModal] = useState<ModalKey | null>(null);
  const closeModal = () => setModal(null);
  const navigate = useNavigate();
  const go = (path: string) => navigate(path);
  const canManageRisks = useCanDo('manage_risks');
  const canLinkIncidents = useCanDo('review_resolve');
  const canGenerateAI = useCanDo('generate_ai');

  const {
    risks_by_category,
    incidents_by_category,
    snapshot_delta,
    enterprise_health,
    pressure,
    correlation,
    control_evidence,
    movement,
  } = data;

  // ── Category overlap donuts ───────────────────────────────────────────────

  const riskDonutData = Object.entries(risks_by_category)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, value]) => ({ name, value }));

  const incDonutData = incidents_by_category
    .slice(0, 3)
    .map(d => ({ name: d.category, value: d.count }));

  // ── Modal data ────────────────────────────────────────────────────────────

  const riskDistData = Object.entries(risks_by_category)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, value]) => ({ name, value }));

  const incDistData = incidents_by_category
    .slice(0, 8)
    .map(d => ({ name: d.category, value: d.count }));

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <div className="dash-section">

        {/* Posture */}
        <div className="im-grid-posture">
          <HealthCard
            health={enterprise_health}
            delta={snapshot_delta}
            exceeds={pressure.exceeds_appetite}
            totalRisks={pressure.active_risks}
            currency={currency}
          />
          <PressureCard pressure={pressure} onInsights={() => setModal('pressure')} />
        </div>

        {/* Correlation */}
        <CorrelationRow
          c={correlation}
          evidenced={control_evidence.evidenced}
          rated={control_evidence.rated}
          onOpen={setModal}
        />

        {/* Movement */}
        <div className="im-sect-head">
          <h2>MOVEMENT</h2>
          <p>Six-month view of exposure and incidents</p>
        </div>
        <div className="im-grid-movement">

          <TrendCard movement={movement} />

          {/* Block 6: Risk & Incident Distribution */}
          <div className="im-card im-wide">
            <div className="im-card-head">
              <span className="im-label">CATEGORY OVERLAP</span>
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

            {movement.overlap_findings.map(f => <p key={f} className="im-finding">{f}</p>)}

            <InsightFooter label="View distribution detail" onClick={() => setModal('distribution')} />
          </div>

        </div>

        {/* Operational Feed */}
        <div className="im-sect-head">
          <h2>OPERATIONAL FEED</h2>
          <p>Every change, as it happens</p>
        </div>
        <OperationalFeed
          riskItems={data.activity_feed}
          incidentItems={data.incident_feed}
          exceedsAppetite={pressure.exceeds_appetite}
        />

        {/* Executive Intelligence */}
        <ExecBriefCard
          stored={data.unified_brief}
          hasData={correlation.risks_total > 0 || correlation.incidents_total > 0}
          snapshotsHeld={movement.snapshots_held}
          canGenerate={canGenerateAI}
        />

      </div>

      {/* ── Modals ─────────────────────────────────────────────────────────── */}

      {modal === 'pressure' && (
        <UnifiedModal
          title={`Risk Pressure · ${pressure.level === 'No data' ? '—' : pressure.score} / 100 · ${pressure.level}`}
          onClose={closeModal}
          wide
        >
          <PressureModalContent pressure={pressure} canCreateRisk={canManageRisks} onGo={go} />
        </UnifiedModal>
      )}

      {modal === 'materialised' && (
        <UnifiedModal
          title={`Risks that materialised · ${correlation.risks_materialised} of ${correlation.risks_total}`}
          onClose={closeModal}
          wide
        >
          <MaterialisedModalContent c={correlation} currency={currency} canEditRisk={canManageRisks} onGo={go} />
        </UnifiedModal>
      )}

      {modal === 'unlinked' && (
        <UnifiedModal
          title={`Incidents with no matching risk · ${correlation.incidents_unlinked} of ${correlation.incidents_total}`}
          onClose={closeModal}
          wide
        >
          <UnlinkedModalContent
            c={correlation}
            canCreateRisk={canManageRisks}
            canLink={canLinkIncidents}
            onGo={go}
          />
        </UnifiedModal>
      )}

      {modal === 'evidence' && (
        <UnifiedModal
          title={`Control evidence · ${control_evidence.evidenced} of ${control_evidence.rated} evidenced`}
          onClose={closeModal}
          wide
        >
           <EvidenceModalContent ev={control_evidence} canEditRisk={canManageRisks} onGo={go} />
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
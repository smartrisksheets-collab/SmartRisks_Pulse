// src/components/risks/RiskPanel.tsx
// Side panel for one risk: how it scores, the risk itself, treatment, AI insight,
// linked incidents and recent history. Scores and the appetite sentence come from
// GET /risks/{id}/context; nothing is calculated here.

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import type { Risk } from '../../types/risk';
import { getRiskContext } from '../../services/risks';
import { formatDate, formatExposure } from '../../utils/format';
import { useSettingsStore } from '../../store/settingsStore';
import { severityChip } from '../analytics/format';
import { appetiteChip, decisionChip, levelChipClass, pctOf, scoreText } from '../../utils/riskDisplay';

interface Props {
  risk:           Risk;
  bandCount:      number;
  canManage:      boolean;
  canSeeAudit:    boolean;
  onClose:        () => void;
  onEdit:         () => void;
  onDelete:       () => void;
  onLinkDecision: (decision: string) => Promise<void>;
}

export default function RiskPanel({
  risk, bandCount, canManage, canSeeAudit, onClose, onEdit, onDelete, onLinkDecision,
}: Props) {
  const currency = useSettingsStore(s => s.currency);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [deciding, setDeciding] = useState(false);
  const [decision, setDecision] = useState('');
  const [saving, setSaving] = useState(false);

  const ctx = useQuery({
    queryKey: ['risks', 'context', risk.id, risk.updated_at],
    queryFn:  () => getRiskContext(risk.id),
    staleTime: 60 * 1000,
  });

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const app = appetiteChip(risk.appetite_status, !!(risk.category ?? '').trim());
  const dec = decisionChip(risk);
  const score = ctx.data?.score;
  const exposure = formatExposure(risk.financial_exposure, currency);
  const evidence = [risk.control_assertion_source, risk.control_last_tested ? formatDate(risk.control_last_tested) : null]
    .filter(Boolean).join(', ') || 'Not tested';

  async function saveDecision() {
    const text = decision.trim();
    if (!text) return;
    setSaving(true);
    try {
      await onLinkDecision(text);
      setDeciding(false);
      setDecision('');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="pl-panel-overlay" onClick={onClose} />
      <aside className="pl-panel pl-app" role="dialog" aria-modal="true" aria-label={`Risk ${risk.id}`}>
        <div className="pl-panel-head">
          <div className="pl-inline">
            <span className="pl-rid pl-rr-panel-id">{risk.id}</span>
            <span className={`pl-chip ${levelChipClass(risk.level_index, bandCount)}`}>{risk.level ?? '—'}</span>
            <span className={app.cls}>{app.text}</span>
            <button ref={closeRef} type="button" className="pl-icon-btn pl-push" aria-label="Close" onClick={onClose}>
              <X size={16} aria-hidden="true" />
            </button>
          </div>
          <h2 className="pl-section">{risk.display_title}</h2>
          <p className="pl-meta">
            {risk.category ?? 'No category'} · Owner {risk.owner ?? 'not set'} · Logged {formatDate(risk.logged_at)}
          </p>
        </div>

        <div className="pl-panel-body">
          <section className="pl-sect">
            <h3 className="pl-label">How it scores</h3>
            <div className="pl-rr-scores">
              <div className="pl-stat">
                <span className="pl-label">Inherent</span>
                <span className="pl-metric-m">{scoreText(risk.severity).replace(/\.0$/, '')}</span>
                <span className="pl-caption">L{risk.likelihood ?? '—'} × I{risk.impact_score ?? '—'}</span>
              </div>
              <div className="pl-stat">
                <span className="pl-label">Controls</span>
                <span className="pl-metric-m">
                  {score ? (score.ce_level == null ? '—' : `${score.ce_level} / ${score.ce_scale}`) : '…'}
                </span>
                <span className="pl-caption">{score ? `${score.ce_label} · cuts ${score.ce_pct}%` : ' '}</span>
              </div>
              <div className="pl-stat">
                <span className="pl-label">Residual</span>
                <span className="pl-metric-m">{risk.residual == null ? '—' : Math.round(risk.residual)}</span>
                <span className="pl-caption">
                  Appetite {score ? (score.threshold == null ? 'not set' : scoreText(score.threshold)) : '…'}
                </span>
              </div>
            </div>
            {score && (
              <>
                <div
                  className={`pl-rr-meter${score.appetite_status === 'exceeds' ? ' pl-over' : ''}`}
                  style={{ '--pl-fill': pctOf(score.residual, score.residual_max), '--pl-thr': pctOf(score.threshold, score.residual_max) } as React.CSSProperties}
                  role="img"
                  aria-label={`Residual ${scoreText(score.residual)} of ${score.residual_max}`}
                >
                  <span />
                  {score.threshold != null && <i />}
                </div>
                <p className="pl-p">{score.note}</p>
              </>
            )}
            {ctx.isError && <p className="pl-note pl-alert" role="alert">The score breakdown could not be loaded.</p>}
            <dl className="pl-dl">
              <div><dt>Controls in place</dt><dd>{risk.controls || 'None recorded'}</dd></div>
              <div><dt>Evidence</dt><dd>{evidence}</dd></div>
            </dl>
          </section>

          <section className="pl-sect">
            <h3 className="pl-label">The risk</h3>
            <p className="pl-p pl-rr-pre">{risk.description || 'No description.'}</p>
            <dl className="pl-dl">
              <div><dt>Root cause</dt><dd>{risk.root_cause || 'Not known yet'}</dd></div>
              <div><dt>Business impact</dt><dd>{risk.primary_impact || 'Not recorded'}</dd></div>
              <div><dt>Financial exposure</dt><dd>{exposure || 'Not quantified'}</dd></div>
              <div><dt>Last reviewed</dt><dd>{formatDate(risk.last_reviewed_at)}</dd></div>
            </dl>
          </section>

          <section className="pl-sect">
            <h3 className="pl-label">Treatment</h3>
            <dl className="pl-dl">
              <div><dt>Decision</dt><dd><span className={dec.cls}>{dec.text}</span></dd></div>
              <div><dt>Target date</dt><dd>{risk.target_date ? formatDate(risk.target_date) : 'Not set'}</dd></div>
              <div><dt>Status</dt><dd>{risk.mitigation_status ?? 'Open'}</dd></div>
              <div><dt>Linked decision</dt><dd>{risk.linked_decision || 'None recorded'}</dd></div>
            </dl>
            <p className="pl-p">{risk.mitigation_plan || 'No plan recorded yet.'}</p>
            {deciding && (
              <div className="pl-field">
                <label className="pl-field-label" htmlFor="rr-decision">Which decision does this risk affect?</label>
                <input
                  id="rr-decision"
                  className="pl-input"
                  value={decision}
                  maxLength={500}
                  onChange={e => setDecision(e.target.value)}
                  placeholder="e.g. Board approval of the vendor renewal, Q1"
                />
                <div className="pl-inline">
                  <button type="button" className="pl-btn pl-btn-primary pl-btn-sm" disabled={saving || !decision.trim()} onClick={saveDecision}>
                    {saving ? 'Saving…' : 'Save decision'}
                  </button>
                  <button type="button" className="pl-btn pl-btn-ghost pl-btn-sm" onClick={() => setDeciding(false)}>Cancel</button>
                </div>
              </div>
            )}
          </section>

          {risk.ai_insight && (
            <section className="pl-sect">
              <h3 className="pl-label">AI insight</h3>
              <p className="pl-note pl-rr-pre">{risk.ai_insight}</p>
            </section>
          )}

          <section className="pl-sect">
            <h3 className="pl-label">Linked incidents</h3>
            {ctx.data && ctx.data.incidents.length === 0 && <p className="pl-p">None linked.</p>}
            {ctx.data?.incidents.map(i => (
              <Link key={i.id} className="pl-row" to={`/incidents?incident=${encodeURIComponent(i.id)}`}>
                <span className="pl-row-id">{i.id}</span>
                <span className="pl-grow">{i.title ?? 'Untitled incident'}</span>
                {i.severity && <span className={`pl-chip ${severityChip(i.severity)}`}>{i.severity}</span>}
                <span className="pl-caption">{formatDate(i.reported_at)}</span>
              </Link>
            ))}
          </section>

          <section className="pl-sect">
            <h3 className="pl-label">History</h3>
            {ctx.isLoading && <p className="pl-caption" role="status">Loading history…</p>}
            {ctx.data && ctx.data.history.length === 0 && <p className="pl-p">No changes recorded yet.</p>}
            {ctx.data?.history.map((h, n) => (
              <div className="pl-ev" key={`${h.at ?? ''}-${n}`}>
                <span className="pl-rr-when">{formatDate(h.at)}</span>
                <span className="pl-grow">{h.summary ?? h.action}{h.user ? ` (${h.user})` : ''}</span>
              </div>
            ))}
            {canSeeAudit && <Link className="pl-link-strong" to="/audit">Full history in the Audit Log</Link>}
          </section>
        </div>

        {canManage && (
          <div className="pl-panel-foot">
            <button type="button" className="pl-btn pl-btn-primary" onClick={onEdit}>Edit risk</button>
            <button type="button" className="pl-btn pl-btn-secondary" onClick={() => setDeciding(true)} disabled={deciding}>
              Record decision
            </button>
            <button type="button" className="pl-btn pl-btn-ghost pl-push pl-rr-danger" onClick={onDelete}>Move to recycle bin</button>
          </div>
        )}
      </aside>
    </>
  );
}

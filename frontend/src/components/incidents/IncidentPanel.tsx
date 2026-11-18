// src/components/incidents/IncidentPanel.tsx
// Side panel for one incident: where it is in the stage line, what happened,
// its link to the register, AI analysis and history. Stages, the next step,
// the target wording and risk suggestions come from GET /incidents/{id}/context.

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import type { IncidentRow, IncidentStage } from '../../types/incident';
import { getIncidentContext, generateAIActions, generateAIImpact } from '../../services/incidents';
import { formatDate, formatExposure } from '../../utils/format';
import { useSettingsStore } from '../../store/settingsStore';
import {
  confidenceLabel, controlOutcomeLabel, severityChipClass, stageChipClass, targetChip,
} from '../../utils/incidentDisplay';

interface Props {
  incidentId:   string;
  row:          IncidentRow | null;
  sevRank:      Record<string, number>;
  canManage:    boolean;
  canAddRisk:   boolean;
  canAI:        boolean;
  canSeeAudit:  boolean;
  onClose:      () => void;
  onEdit:       () => void;
  onDelete:     () => Promise<void>;
  onPatch:      (patch: { status?: IncidentStage; linked_risk_id?: string }, done: string) => Promise<void>;
}

export default function IncidentPanel({
  incidentId, row, sevRank, canManage, canAddRisk, canAI, canSeeAudit, onClose, onEdit, onDelete, onPatch,
}: Props) {
  const currency = useSettingsStore(s => s.currency);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [ai, setAi] = useState<{ impact: string; actions: string } | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const ctx = useQuery({
    queryKey: ['incidents', 'context', incidentId, row?.updated_at ?? ''],
    queryFn:  () => getIncidentContext(incidentId),
    staleTime: 60 * 1000,
  });

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const d = ctx.data?.incident ?? row;
  const c = ctx.data;

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try { await action(); } catch { /* the page shows the error */ } finally { setBusy(false); }
  }

  async function generateAI() {
    setAiBusy(true);
    setAiError(null);
    try {
      const [impact, actions] = await Promise.all([generateAIImpact(incidentId, true), generateAIActions(incidentId, true)]);
      setAi({ impact: impact.text, actions: actions.text });
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'The AI analysis could not be generated.');
    } finally {
      setAiBusy(false);
    }
  }

  const aiImpact = ai?.impact ?? d?.ai_impact ?? '';
  const aiActions = ai?.actions ?? d?.ai_actions ?? '';
  const levelCount = Object.keys(sevRank).length;
  const target = d ? targetChip(d) : null;
  const occurred = d?.incident_dt
    ? `${formatDate(d.incident_dt.slice(0, 10))}${d.incident_dt.slice(11, 16) !== '00:00' ? `, ${d.incident_dt.slice(11, 16)}` : ''}`
    : 'Not recorded';
  const reported = d
    ? [formatDate(d.reported_at), d.reported_by ? `by ${d.reported_by}` : '', d.channel ? `(${d.channel.toLowerCase()})` : '']
        .filter(Boolean).join(' ')
    : '';
  const money = d?.financial_impact ? formatExposure(d.financial_impact, currency) : '';

  return (
    <>
      <div className="pl-panel-overlay" onClick={onClose} />
      <aside className="pl-panel pl-app" role="dialog" aria-modal="true" aria-label={`Incident ${incidentId}`}>
        <div className="pl-panel-head">
          <div className="pl-inline">
            <span className="pl-rid pl-rr-panel-id">{incidentId}</span>
            {d?.severity && <span className={`pl-chip ${severityChipClass(sevRank[d.severity], levelCount)}`}>{d.severity}</span>}
            {d && <span className={`pl-chip ${stageChipClass(d.status)}`}>{d.status ?? 'New'}</span>}
            <button ref={closeRef} type="button" className="pl-icon-btn pl-push" aria-label="Close" onClick={onClose}>
              <X size={16} aria-hidden="true" />
            </button>
          </div>
          <h2 className="pl-section">{d?.display_title ?? 'Loading…'}</h2>
          {d && (
            <p className="pl-meta">
              {d.category ?? 'No category'} · Owner {d.assigned_to ?? 'not set'}
              {target && <> · <span className={target.cls}>{target.text}</span></>}
              {d.resolve_by && d.is_open && <> (resolve by {formatDate(d.resolve_by)})</>}
            </p>
          )}
        </div>

        <div className="pl-panel-body">
          {ctx.isError && <p className="pl-note pl-alert" role="alert">This incident could not be loaded. It may have been deleted.</p>}

          {c && (
            <section className="pl-sect">
              <h3 className="pl-label">Where it is</h3>
              <ol className="pl-steps" aria-label="Incident stages">
                {c.steps.map((s, k) => (
                  <li key={s.name} className={`pl-step${s.state === 'done' ? ' pl-is-done' : s.state === 'current' ? ' pl-is-cur' : ''}`}
                    aria-current={s.state === 'current' ? 'step' : undefined}>
                    <span className="pl-step-dot" aria-hidden="true">{s.state === 'done' ? '✓' : k + 1}</span>
                    {s.name}
                  </li>
                ))}
              </ol>
              <p className="pl-p">{c.stage_note}</p>
            </section>
          )}

          {d && (
            <section className="pl-sect">
              <h3 className="pl-label">What happened</h3>
              <p className="pl-p pl-rr-pre">{d.description || 'No description.'}</p>
              <dl className="pl-dl">
                <div><dt>Occurred</dt><dd>{occurred}</dd></div>
                <div><dt>Reported</dt><dd>{reported || 'Not recorded'}</dd></div>
                <div><dt>Affected asset</dt><dd>{d.affected_asset || 'Not recorded'}</dd></div>
                <div><dt>Business unit</dt><dd>{d.business_unit || 'Not recorded'}</dd></div>
                <div><dt>Immediate actions</dt><dd>{d.immediate_actions || 'None recorded'}</dd></div>
                <div><dt>Financial impact</dt><dd>{money ? `${money} · ${confidenceLabel(d.impact_confidence).toLowerCase()}` : 'None recorded'}</dd></div>
                {d.resolution_summary && <div><dt>Resolution</dt><dd>{d.resolution_summary}</dd></div>}
              </dl>
            </section>
          )}

          {c && (
            <section className="pl-sect">
              <h3 className="pl-label">Link to the register</h3>
              {c.linked_risk ? (
                <div className="pl-row">
                  <span className="pl-row-id">{c.linked_risk.id}</span>
                  {c.linked_risk.on_register
                    ? <Link className="pl-grow" to={`/risks?risk=${encodeURIComponent(c.linked_risk.id)}`}>{c.linked_risk.title}</Link>
                    : <span className="pl-grow">{c.linked_risk.title}</span>}
                  <span className="pl-tag">Control {controlOutcomeLabel(d?.control_outcome).toLowerCase()}</span>
                </div>
              ) : (
                <div className={`pl-note${c.covered ? '' : ' pl-alert'}`}>
                  <p className="pl-p"><b>No risk is linked.</b> {c.link_note}</p>
                  {canManage && c.suggested_risks.map(s => (
                    <div className="pl-row" key={s.id}>
                      <span className="pl-row-id">{s.id}</span>
                      <span className="pl-grow">{s.title}</span>
                      {s.residual != null && <span className="pl-caption">Residual {s.residual}</span>}
                      <button type="button" className="pl-btn pl-btn-secondary pl-btn-sm" disabled={busy}
                        onClick={() => run(() => onPatch({ linked_risk_id: s.id }, `Linked to ${s.id}.`))}>
                        Link
                      </button>
                    </div>
                  ))}
                  {(canManage || canAddRisk) && (
                    <div className="pl-inline">
                      {canManage && <button type="button" className="pl-btn pl-btn-secondary pl-btn-sm" onClick={onEdit}>Choose a risk</button>}
                      {canAddRisk && <Link className="pl-btn pl-btn-ghost pl-btn-sm" to="/risks/new">Create a new risk</Link>}
                    </div>
                  )}
                </div>
              )}
            </section>
          )}

          {(aiImpact || aiActions || canAI) && (
            <section className="pl-sect">
              <h3 className="pl-label">AI analysis</h3>
              {aiImpact && <p className="pl-note pl-rr-pre">{aiImpact}</p>}
              {aiActions && <p className="pl-p pl-rr-pre"><b>Recommended: </b>{aiActions}</p>}
              {!aiImpact && !aiActions && <p className="pl-p">No analysis yet.</p>}
              {aiError && <p className="pl-note pl-alert" role="alert">{aiError}</p>}
              {canAI && (
                <div className="pl-inline">
                  <button type="button" className="pl-btn pl-btn-secondary pl-btn-sm" disabled={aiBusy} onClick={generateAI}>
                    {aiBusy ? 'Working…' : aiImpact || aiActions ? 'Regenerate' : 'Generate AI analysis'}
                  </button>
                </div>
              )}
            </section>
          )}

          <section className="pl-sect">
            <h3 className="pl-label">History</h3>
            {ctx.isLoading && <p className="pl-caption" role="status">Loading history…</p>}
            {c && c.history.length === 0 && <p className="pl-p">No changes recorded yet.</p>}
            {c?.history.map((h, n) => (
              <div className="pl-ev" key={`${h.at}-${n}`}>
                <span className="pl-rr-when">{formatDate(h.at)}</span>
                <span className="pl-grow">{h.summary ?? h.action}{h.user ? ` (${h.user})` : ''}</span>
              </div>
            ))}
            {canSeeAudit && <Link className="pl-link-strong" to="/audit">Full history in the Audit Log</Link>}
          </section>
        </div>

        {canManage && c && (
          <div className="pl-panel-foot">
            {c.next_status && c.next_label && (
              <button type="button" className="pl-btn pl-btn-primary" disabled={busy}
                onClick={() => run(() => onPatch({ status: c.next_status ?? undefined }, `${incidentId} moved to ${c.next_status}.`))}>
                {c.next_label}
              </button>
            )}
            <button type="button" className="pl-btn pl-btn-secondary" onClick={onEdit}>Edit</button>
            {confirmDelete ? (
              <>
                <button type="button" className="pl-btn pl-btn-ghost pl-push" onClick={() => setConfirmDelete(false)}>Keep it</button>
                <button type="button" className="pl-btn pl-btn-secondary pl-rr-danger" disabled={busy} onClick={() => run(onDelete)}>
                  Confirm move to bin
                </button>
              </>
            ) : (
              <button type="button" className="pl-btn pl-btn-ghost pl-push pl-rr-danger" onClick={() => setConfirmDelete(true)}>
                Move to recycle bin
              </button>
            )}
          </div>
        )}
      </aside>
    </>
  );
}

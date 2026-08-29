// src/pages/TriageQueue.tsx

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  useTriageQueue, useSubmission, useDuplicates,
  useTriageAccept, useTriageMerge, useTriageReroute,
  useTriageClose, usePromote,
} from '../hooks/useSubmissions';
import { useToast } from '../hooks/useToast';
import { listRisks } from '../services/risks';
import { useAuthStore } from '../store/authStore';
import type { RiskSubmissionListItem, TriageStatus, SubmitterUrgency } from '../types/submission';

interface RiskOption { id: string; description: string; category: string | null; }

function statusPill(s: TriageStatus) {
  const map: Record<TriageStatus, string> = {
    pending:  'triage-pending',
    accepted: 'triage-accepted',
    merged:   'triage-merged',
    rerouted: 'triage-rerouted',
    closed:   'triage-closed',
  };
  const labels: Record<TriageStatus, string> = {
    pending: 'Pending', accepted: 'Accepted',
    merged: 'Merged', rerouted: 'Rerouted', closed: 'Closed',
  };
  return <span className={`status-pill ${map[s]}`}>{labels[s]}</span>;
}

function urgencyPill(u: SubmitterUrgency | null) {
  if (!u) return null;
  const map: Record<SubmitterUrgency, string> = { now: 'urgency-now', soon: 'urgency-soon', no_rush: 'urgency-no_rush' };
  const labels: Record<SubmitterUrgency, string> = { now: 'Now', soon: 'Soon', no_rush: 'No rush' };
  return <span className={`status-pill ${map[u]}`}>{labels[u]}</span>;
}

type TriageAction = 'accept' | 'merge' | 'reroute' | 'close' | 'promote' | null;

export default function TriageQueue() {
  const toast    = useToast();
  const navigate = useNavigate();
  const hasIncident = useAuthStore(s => (s.claims?.modules ?? []).includes('incident'));
  const { data: queue, isLoading } = useTriageQueue();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [action,     setAction]     = useState<TriageAction>(null);

  // Action form state
  const [note,            setNote]           = useState('');
  const [mergeRiskId,     setMergeRiskId]    = useState('');
  const [mergeSearch,     setMergeSearch]    = useState('');
  const [mergeSelected,   setMergeSelected]  = useState<RiskOption | null>(null);
  const [showMergeDrop,   setShowMergeDrop]  = useState(false);

  // Promote form state
  const [pCategory,    setPCategory]   = useState('');
  const [pOwner,       setPOwner]      = useState('');
  const [pOwnerEmail,  setPOwnerEmail] = useState('');
  const [pLikelihood,  setPLikelihood] = useState('');
  const [pImpact,      setPImpact]     = useState('');
  const [pTreatment,   setPTreatment]  = useState('');
  const [pControls,    setPControls]   = useState('');
  const [pPlan,        setPPlan]       = useState('');
  const [pTargetDate,  setPTargetDate] = useState('');

  const { data: detail } = useSubmission(selectedId);
  const { data: dupes }  = useDuplicates(selectedId);
  const isIdPattern = (s: string) => /^[A-Za-z]+-?/i.test(s) && s.includes('-');
  const mergeQueryParam = isIdPattern(mergeSearch.trim())
    ? { risk_id: mergeSearch.trim(), page_size: 10 }
    : { search: mergeSearch.trim(), page_size: 8 };

  const { data: mergeResults } = useQuery({
    queryKey: ['risks', 'merge-search', mergeSearch],
    queryFn:  () => listRisks(mergeQueryParam),
    enabled:  mergeSearch.trim().length >= 1 && !mergeSelected,
    staleTime: 30_000,
  });

  const acceptMut  = useTriageAccept();
  const mergeMut   = useTriageMerge();
  const rerouteMut = useTriageReroute();
  const closeMut   = useTriageClose();
  const promoteMut = usePromote();

  function openDetail(item: RiskSubmissionListItem) {
    setSelectedId(item.id);
    setAction(null);
    setNote('');
    setMergeRiskId('');
    setMergeSearch('');
    setMergeSelected(null);
    setShowMergeDrop(false);
  }

  function closeDetail() {
    setSelectedId(null);
    setAction(null);
  }

  async function handleAccept() {
    if (!selectedId) return;
    try {
      await acceptMut.mutateAsync(selectedId);
      setAction('promote');
    } catch {
      toast('Failed to accept submission.', 'error');
      acceptMut.reset();
    }
  }

  async function handleMerge() {
    if (!selectedId || !mergeRiskId.trim() || !note.trim()) {
      toast('Risk ID and note are required.', 'error'); return;
    }
    try {
      await mergeMut.mutateAsync({ id: selectedId, payload: { target_risk_id: mergeRiskId.trim(), note } });
      toast('Submission merged into risk.', 'success');
      closeDetail();
    } catch {
      toast('Merge failed. Check the Risk ID and try again.', 'error');
    }
  }

  async function handleReroute() {
    if (!selectedId || !note.trim()) { toast('A note is required.', 'error'); return; }
    try {
      await rerouteMut.mutateAsync({ id: selectedId, payload: { note } });
      toast('Submission rerouted to incident register.', 'success');
      closeDetail();
    } catch {
      toast('Reroute failed.', 'error');
    }
  }

  async function handleClose() {
    if (!selectedId || !note.trim()) { toast('A reason is required.', 'error'); return; }
    try {
      await closeMut.mutateAsync({ id: selectedId, payload: { note } });
      toast('Submission closed.', 'success');
      closeDetail();
    } catch {
      toast('Failed to close submission.', 'error');
    }
  }

  async function handlePromote() {
    if (!selectedId) return;
    if (!pCategory || !pOwner || !pLikelihood || !pImpact || !pTreatment) {
      toast('Category, owner, likelihood, impact, and treatment are required.', 'error'); return;
    }
    try {
      const res = await promoteMut.mutateAsync({
        id: selectedId,
        payload: {
          category:        pCategory,
          owner:           pOwner,
          likelihood:      parseInt(pLikelihood),
          impact_score:    parseInt(pImpact),
          treatment:       pTreatment,
          controls:        pControls  || null,
          mitigation_plan: pPlan      || null,
          target_date:     pTargetDate || null,
          owner_email:     pOwnerEmail || null,
        },
      });
      toast(`Promoted to risk register as ${res.risk_id}.`, 'success');
      closeDetail();
    } catch {
      toast('Promotion failed.', 'error');
    }
  }

  return (
    <div>
      <div className="card">
        <div className="card-title" style={{ justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button className="btn btn-secondary btn-compact" onClick={() => navigate('/risks')}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
              </svg>
              Risk Register
            </button>
            <span style={{ fontWeight: 800, color: 'var(--navy)' }}>Submissions Inbox</span>
          </div>
        </div>

        {isLoading ? (
          <div style={{ padding: 32, textAlign: 'center' }}><div className="sr-spinner" style={{ margin: '0 auto' }} /></div>
        ) : !queue?.length ? (
          <div style={{ padding: '24px 16px', color: 'var(--muted)', fontSize: 14 }}>
            No pending submissions.
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Type</th>
                  <th>Department</th>
                  <th>Submitted By</th>
                  <th>Description</th>
                  <th>Urgency</th>
                  <th>Date</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {queue.map(item => (
                  <tr
                    key={item.id}
                    style={{ cursor: 'pointer' }}
                    onClick={() => openDetail(item)}
                  >
                    <td style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: 13 }}>
                      {item.reference}
                    </td>
                    <td>
                      <span className={`status-pill ${item.submission_type === 'incident' ? 'triage-rerouted' : 'triage-pending'}`}>
                        {item.submission_type === 'incident' ? 'Incident' : 'Risk'}
                      </span>
                    </td>
                    <td>{item.department}</td>
                    <td style={{ fontSize: 13 }}>
                      <div>{item.submitter_name}</div>
                      <div style={{ color: 'var(--muted)', fontSize: 12 }}>{item.submitter_email}</div>
                    </td>
                    <td style={{ fontSize: 13, maxWidth: 280 }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.description}
                      </div>
                    </td>
                    <td>{urgencyPill(item.submitter_urgency)}</td>
                    <td style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                      {new Date(item.submitted_at).toLocaleDateString()}
                    </td>
                    <td>{statusPill(item.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail drawer */}
      {selectedId && detail && (
        <div className="modal-backdrop show">
          <div className="modal modal-tall modal-submission" style={{ maxWidth: 640 }}>
            <div className="modal-hd">
              <div>
                <h2 className="modal-title">{detail.reference}</h2>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                  {detail.submitter_name} · {detail.department} · {new Date(detail.submitted_at).toLocaleDateString()}
                </div>
              </div>
              <button className="btn-icon" onClick={closeDetail}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            <div className="modal-bd">
              <div className="sub-pills">
                {statusPill(detail.status)}
                {urgencyPill(detail.submitter_urgency)}
                <span className={`status-pill ${detail.submission_type === 'incident' ? 'triage-rerouted' : 'triage-pending'}`}>
                  {detail.submission_type === 'incident' ? 'Incident' : 'Risk'}
                </span>
              </div>

              <div className="sub-meta">
                <span className="sub-meta-email">{detail.submitter_email}</span>
                <span>·</span>
                <span>{detail.department}</span>
                <span>·</span>
                <span>{new Date(detail.submitted_at).toLocaleDateString()}</span>
              </div>

              <div className="sub-field">
                <span className="sub-label">Description</span>
                <p className="sub-value">{detail.description}</p>
              </div>

              {detail.cause && (
                <div className="sub-field">
                  <span className="sub-label">Possible Cause</span>
                  <p className="sub-value">{detail.cause}</p>
                </div>
              )}

              {detail.affects && (
                <div className="sub-field">
                  <span className="sub-label">What Could Be Affected</span>
                  <p className="sub-value">{detail.affects}</p>
                </div>
              )}

              {detail.suggested_category && (
                <div className="sub-field">
                  <span className="sub-label">Suggested Category</span>
                  <p className="sub-value">{detail.suggested_category}</p>
                </div>
              )}

              {detail.existing_controls && (
                <div className="sub-field">
                  <span className="sub-label">Existing Controls</span>
                  <p className="sub-value">{detail.existing_controls}</p>
                </div>
              )}

              {detail.suggested_action && (
                <div className="sub-field">
                  <span className="sub-label">Suggested Action</span>
                  <p className="sub-value">{detail.suggested_action}</p>
                </div>
              )}

              {/* Duplicate candidates */}
              {dupes && dupes.length > 0 && (
                <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 10, padding: '12px 14px', marginTop: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#d97706', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
                    Possible duplicates in register
                  </div>
                  {dupes.map(d => (
                    <div key={d.risk_id} style={{ fontSize: 13, marginBottom: 6 }}>
                      <span style={{ fontWeight: 700, fontFamily: 'monospace' }}>{d.risk_id}</span>
                      {' — '}
                      <span style={{ color: 'var(--muted)' }}>{d.snippet}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Action panels */}
              {detail.status === 'pending' && !action && (
                <div className="sub-actions-bar">
                  <button className="btn btn-primary btn-compact" onClick={handleAccept} disabled={acceptMut.isPending}
                    title="Score this submission and add it to the risk register.">
                    Accept
                  </button>
                  <button className="btn btn-secondary btn-compact" onClick={() => setAction('merge')}
                    title="Link this submission to an existing risk in the register.">
                    Merge
                  </button>
                  {hasIncident && (
                    <button className="btn btn-secondary btn-compact" onClick={() => setAction('reroute')}
                      title="Log this as an incident rather than a risk.">
                      Reroute to Incident
                    </button>
                  )}
                  <button className="btn btn-secondary btn-compact" onClick={() => setAction('close')}
                    title="Dismiss this submission with a reason sent to the submitter.">
                    Close
                  </button>
                </div>
              )}

              {action === 'promote' && (
                <div className="sub-action-panel">
                  <div className="sub-action-title">Score and promote to risk register</div>
                  <div className="row">
                    <div className="field" style={{ gridColumn: 'span 6' }}>
                      <label>Category <span style={{ color: '#ef4444' }}>*</span></label>
                      <input value={pCategory} onChange={e => setPCategory(e.target.value)}
                        placeholder={detail.suggested_category ?? 'e.g. Operational'}
                        onFocus={() => { if (!pCategory && detail.suggested_category) setPCategory(detail.suggested_category); }} />
                    </div>
                    <div className="field" style={{ gridColumn: 'span 6' }}>
                      <label>Owner <span style={{ color: '#ef4444' }}>*</span></label>
                      <input value={pOwner} onChange={e => setPOwner(e.target.value)}
                        placeholder="e.g. Tolu, Head of Finance" />
                    </div>
                    <div className="field" style={{ gridColumn: 'span 6' }}>
                      <label>Owner Email</label>
                      <input type="email" value={pOwnerEmail} onChange={e => setPOwnerEmail(e.target.value)} />
                    </div>
                    <div className="field" style={{ gridColumn: 'span 3' }}>
                      <label>Likelihood <span style={{ color: '#ef4444' }}>*</span></label>
                      <select value={pLikelihood} onChange={e => setPLikelihood(e.target.value)}>
                        <option value="">Select…</option>
                        {[1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </div>
                    <div className="field" style={{ gridColumn: 'span 3' }}>
                      <label>Impact <span style={{ color: '#ef4444' }}>*</span></label>
                      <select value={pImpact} onChange={e => setPImpact(e.target.value)}>
                        <option value="">Select…</option>
                        {[1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </div>
                    <div className="field" style={{ gridColumn: 'span 6' }}>
                      <label>Treatment <span style={{ color: '#ef4444' }}>*</span></label>
                      <select value={pTreatment} onChange={e => setPTreatment(e.target.value)}>
                        <option value="">Select…</option>
                        {['Mitigate','Transfer','Accept','Avoid'].map(t => <option key={t}>{t}</option>)}
                      </select>
                    </div>
                    <div className="field" style={{ gridColumn: 'span 12' }}>
                      <label>Controls</label>
                      <textarea value={pControls} onChange={e => setPControls(e.target.value)}
                        style={{ minHeight: 60 }} placeholder="Existing or planned controls…" />
                    </div>
                    <div className="field" style={{ gridColumn: 'span 12' }}>
                      <label>Mitigation Plan</label>
                      <textarea value={pPlan} onChange={e => setPPlan(e.target.value)}
                        style={{ minHeight: 60 }} placeholder="Steps to mitigate…" />
                    </div>
                    <div className="field" style={{ gridColumn: 'span 6' }}>
                      <label>Target Date</label>
                      <input type="date" value={pTargetDate} onChange={e => setPTargetDate(e.target.value)} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button className="btn btn-primary btn-compact" onClick={handlePromote} disabled={promoteMut.isPending}>
                      {promoteMut.isPending ? 'Promoting…' : 'Promote to Register'}
                    </button>
                    <button className="btn btn-secondary btn-compact" onClick={() => setAction(null)}>Cancel</button>
                  </div>
                </div>
              )}

              {action === 'merge' && (
                <div className="sub-action-panel">
                  <div className="sub-action-title">Merge into existing risk</div>

                  {/* Step 1 — pick a risk */}
                  <div className="field">
                    <label>Target risk <span style={{ color: '#ef4444' }}>*</span></label>
                    <p className="sf-help" style={{ marginBottom: 8 }}>
                      The submission content will be appended to this risk's notes. Search by risk ID or keyword.
                    </p>
                    <div className="merge-combo">
                      <input
                        value={mergeSelected ? mergeSelected.id : mergeSearch}
                        onChange={e => {
                          setMergeSearch(e.target.value);
                          setMergeSelected(null);
                          setMergeRiskId('');
                          setShowMergeDrop(true);
                        }}
                        onFocus={() => { if (!mergeSelected) setShowMergeDrop(true); }}
                        onBlur={() => setTimeout(() => setShowMergeDrop(false), 150)}
                        placeholder="e.g. R-003 or type a keyword…"
                        readOnly={!!mergeSelected}
                      />
                      {showMergeDrop && !mergeSelected && mergeSearch.trim().length >= 1 && (
                        <div className="merge-dropdown">
                          {mergeResults?.items.length === 0 && (
                            <div className="merge-option-empty">No risks found matching "{mergeSearch}"</div>
                          )}
                          {(mergeResults?.items ?? []).map(r => (
                            <div
                              key={r.id}
                              className="merge-option"
                              onMouseDown={() => {
                                setMergeSelected({ id: r.id, description: r.description ?? '', category: r.category ?? null });
                                setMergeRiskId(r.id);
                                setMergeSearch('');
                                setShowMergeDrop(false);
                              }}
                            >
                              <div className="merge-option-id">{r.id}</div>
                              <div className="merge-option-desc">{r.description}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    {mergeSelected && (
                      <div className="merge-preview">
                        <div className="merge-preview-id">
                          {mergeSelected.id}
                          {mergeSelected.category ? ` · ${mergeSelected.category}` : ''}
                        </div>
                        <div className="merge-preview-desc">{mergeSelected.description}</div>
                        <button
                          type="button"
                          className="btn btn-secondary btn-compact"
                          style={{ marginTop: 8, fontSize: 11 }}
                          onClick={() => { setMergeSelected(null); setMergeRiskId(''); setMergeSearch(''); }}
                        >
                          Change selection
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Step 2 — note, only prominent once a risk is chosen */}
                  <div className="field" style={{ marginTop: mergeSelected ? 16 : 8, opacity: mergeSelected ? 1 : 0.45, pointerEvents: mergeSelected ? 'auto' : 'none' }}>
                    <label>
                      Note to submitter <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <p className="sf-help" style={{ marginBottom: 8 }}>
                      This note is sent to the submitter by email as part of the outcome notification.
                    </p>
                    <textarea
                      value={note}
                      onChange={e => setNote(e.target.value)}
                      style={{ minHeight: 80 }}
                      placeholder="Explain that their submission has been linked to an existing risk and what happens next…"
                    />
                  </div>

                  <div className="sub-actions-bar">
                    <button
                      className="btn btn-primary btn-compact"
                      onClick={handleMerge}
                      disabled={mergeMut.isPending || !mergeSelected}
                    >
                      {mergeMut.isPending ? 'Merging…' : 'Confirm Merge'}
                    </button>
                    <button className="btn btn-secondary btn-compact" onClick={() => setAction(null)}>Cancel</button>
                  </div>
                </div>
              )}

              {action === 'reroute' && (
                <div className="sub-action-panel">
                  <div className="field">
                    <label>Note to submitter <span style={{ color: '#ef4444' }}>*</span></label>
                    <textarea value={note} onChange={e => setNote(e.target.value)}
                      style={{ minHeight: 70 }} placeholder="Explain why this is being rerouted to the incident register…" />
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-primary btn-compact" onClick={handleReroute} disabled={rerouteMut.isPending}>
                      {rerouteMut.isPending ? 'Rerouting…' : 'Confirm Reroute'}
                    </button>
                    <button className="btn btn-secondary btn-compact" onClick={() => setAction(null)}>Cancel</button>
                  </div>
                </div>
              )}

              {action === 'close' && (
                <div className="sub-action-panel">
                  <div className="field">
                    <label>Reason <span style={{ color: '#ef4444' }}>*</span></label>
                    <textarea value={note} onChange={e => setNote(e.target.value)}
                      style={{ minHeight: 70 }} placeholder="Why is this submission being closed without action? This is sent to the submitter." />
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-primary btn-compact" onClick={handleClose} disabled={closeMut.isPending}>
                      {closeMut.isPending ? 'Closing…' : 'Confirm Close'}
                    </button>
                    <button className="btn btn-secondary btn-compact" onClick={() => setAction(null)}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
// src/pages/TokenManager.tsx

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTokens, useCreateToken, useRevokeToken } from '../hooks/useSubmissions';
import { useToast } from '../hooks/useToast';
import type { SubmissionToken } from '../types/submission';

const BASE_URL = window.location.origin;

function statusLabel(t: SubmissionToken): { text: string; cls: string } {
  if (t.revoked_at) return { text: 'Revoked', cls: 'triage-closed' };
  if (t.expires_at && new Date(t.expires_at) < new Date()) return { text: 'Expired', cls: 'triage-closed' };
  return { text: 'Active', cls: 'triage-accepted' };
}

export default function TokenManager() {
  const toast         = useToast();
  const navigate      = useNavigate();
  const { data: tokens, isLoading } = useTokens();
  const createMut     = useCreateToken();
  const revokeMut     = useRevokeToken();

  const [showCreate, setShowCreate] = useState(false);
  const [label,      setLabel]      = useState('');
  const [dept,       setDept]       = useState('');
  const [expires,    setExpires]    = useState('');
  const [revokeId,   setRevokeId]   = useState<string | null>(null);
  const [copied,     setCopied]     = useState<string | null>(null);

  async function handleCreate() {
    if (!label.trim() || !dept.trim()) {
      toast('Label and department are required.', 'error'); return;
    }
    try {
      await createMut.mutateAsync({
        label:      label.trim(),
        department: dept.trim(),
        expires_at: expires || null,
      });
      setLabel(''); setDept(''); setExpires('');
      setShowCreate(false);
      toast('Submission link created.', 'success');
    } catch {
      toast('Failed to create link.', 'error');
    }
  }

  async function handleRevoke(id: string) {
    try {
      await revokeMut.mutateAsync(id);
      setRevokeId(null);
      toast('Link revoked.', 'success');
    } catch {
      toast('Failed to revoke link.', 'error');
    }
  }

  function copyUrl(token: string) {
    const url = `${BASE_URL}/submit/${token}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(token);
      setTimeout(() => setCopied(null), 2000);
    });
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
            <span style={{ fontWeight: 800, color: 'var(--navy)' }}>Submission Links</span>
          </div>
          <button className="btn btn-primary btn-compact" onClick={() => setShowCreate(true)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4 }}>
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            New Link
          </button>
        </div>

        <p className="muted small" style={{ padding: '0 16px 12px' }}>
          Share these links with departments to let them submit risks without a Pulse account.
          Submissions land in the Triage Queue for review.
        </p>

        {isLoading ? (
          <div style={{ padding: 32, textAlign: 'center' }}><div className="sr-spinner" style={{ margin: '0 auto' }} /></div>
        ) : !tokens?.length ? (
          <div style={{ padding: '24px 16px', color: 'var(--muted)', fontSize: 14 }}>
            No submission links yet. Create one to get started.
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Label</th>
                  <th>Department</th>
                  <th>Submissions</th>
                  <th>Issued</th>
                  <th>Expires</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {tokens.map(t => {
                  const { text, cls } = statusLabel(t);
                  const url = `${BASE_URL}/submit/${t.token}`;
                  return (
                    <tr key={t.id} className={t.revoked_at ? 'token-revoked' : ''}>
                      <td style={{ fontWeight: 700 }}>{t.label}</td>
                      <td>{t.department}</td>
                      <td>{t.submission_count}</td>
                      <td style={{ fontSize: 12, color: 'var(--muted)' }}>
                        {new Date(t.issued_at).toLocaleDateString()}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--muted)' }}>
                        {t.expires_at ? new Date(t.expires_at).toLocaleDateString() : 'Never'}
                      </td>
                      <td>
                        <span className={`status-pill ${cls}`}>{text}</span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          {!t.revoked_at && (
                            <>
                              <button
                                className="btn btn-secondary btn-compact"
                                onClick={() => copyUrl(t.token)}
                                title={url}
                              >
                                {copied === t.token ? 'Copied!' : 'Copy Link'}
                              </button>
                              <button
                                className="btn btn-compact"
                                style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }}
                                onClick={() => setRevokeId(t.id)}
                              >
                                Revoke
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create modal */}
      {showCreate && (
        <div className="modal-backdrop show">
          <div className="modal">
            <div className="modal-hd">
              <h2 className="modal-title">New Submission Link</h2>
              <button className="btn-icon" onClick={() => setShowCreate(false)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="modal-bd">
              <div className="row">
                <div className="field" style={{ gridColumn: 'span 6' }}>
                  <label>Label <span style={{ color: '#ef4444' }}>*</span></label>
                  <input value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Q3 Risk Collection" />
                </div>
                <div className="field" style={{ gridColumn: 'span 6' }}>
                  <label>Department <span style={{ color: '#ef4444' }}>*</span></label>
                  <input value={dept} onChange={e => setDept(e.target.value)} placeholder="e.g. Finance" />
                </div>
                <div className="field" style={{ gridColumn: 'span 6' }}>
                  <label>Expiry Date (optional)</label>
                  <input type="date" value={expires} onChange={e => setExpires(e.target.value)} />
                </div>
              </div>
            </div>
            <div className="modal-ft">
              <button className="btn btn-secondary btn-compact" onClick={() => setShowCreate(false)}>Cancel</button>
              <button className="btn btn-primary btn-compact" onClick={handleCreate} disabled={createMut.isPending}>
                {createMut.isPending ? 'Creating…' : 'Create Link'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Revoke confirm */}
      {revokeId && (
        <div className="modal-backdrop show">
          <div className="modal" style={{ maxWidth: 420 }}>
            <div className="modal-hd">
              <h2 className="modal-title">Revoke Link</h2>
            </div>
            <div className="modal-bd">
              <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.6 }}>
                Revoking this link immediately prevents any new submissions from being made through it.
                Submissions already received are not affected and remain in the inbox.
              </p>
              <p style={{ fontSize: 13, color: '#dc2626', fontWeight: 600, marginTop: 10 }}>
                This is permanent. A revoked link cannot be reactivated. If you need to collect
                submissions again, create a new link.
              </p>
            </div>
            <div className="modal-ft">
              <button className="btn btn-secondary btn-compact" onClick={() => setRevokeId(null)}>Cancel</button>
              <button
                className="btn btn-compact"
                style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }}
                onClick={() => handleRevoke(revokeId)}
                disabled={revokeMut.isPending}
              >
                {revokeMut.isPending ? 'Revoking…' : 'Revoke Link'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
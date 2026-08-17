// src/components/risks/PendingSubmissionsModal.tsx
import { useState } from 'react';
import { usePendingSubmissions, useApproveSubmission, useReturnSubmission } from '../../hooks/useExternalSubmissions';
import type { PendingSubmissionItem } from '../../types/external';

interface Props {
  open:    boolean;
  onClose: () => void;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.getDate()} ${d.toLocaleString('default', { month: 'short' })} ${d.getFullYear()}`;
  } catch {
    return iso;
  }
}

function truncate(s: string, max: number): string {
  if (!s) return '';
  return s.length > max ? s.slice(0, max) + '…' : s;
}

interface ItemRowProps {
  item:     PendingSubmissionItem;
  onDone:   (id: string) => void;
}

function ItemRow({ item, onDone }: ItemRowProps) {
  const [showReturn, setShowReturn]  = useState(false);
  const [returnMsg,  setReturnMsg]   = useState('');
  const [done,       setDone]        = useState(false);
  const [rowError,   setRowError]    = useState<string | null>(null);

  const approve = useApproveSubmission();
  const ret     = useReturnSubmission();

  const busy = approve.isPending || ret.isPending;

  function handleApprove() {
    approve.mutate(
      { id: item.id },
      {
        onSuccess: () => { setDone(true); onDone(item.id); },
        onError:   (err) => alert(err instanceof Error ? err.message : 'Approve failed'),
      },
    );
  }

  function handleSendReturn() {
    if (!returnMsg.trim()) return;
    ret.mutate(
      { id: item.id, message: returnMsg.trim() },
      {
        onSuccess: () => { setDone(true); onDone(item.id); },
        onError:   (err) => setRowError(err instanceof Error ? err.message : 'Return failed'),
      },
    );
  }

  return (
    <div className={`psub-item${done ? ' psub-item-done' : ''}`}>
      <div className="psub-top">
        <span className={`psub-badge psub-badge-${item.submission_type}`}>
          {item.submission_type}
        </span>
        <div className="psub-info">
          <div className="psub-cat">{item.category || 'Uncategorised'}</div>
          <div className="psub-desc">{truncate(item.description, 100)}</div>
        </div>
      </div>

      <div className="psub-meta">
        {item.submitter_name  && <span>From: {item.submitter_name}</span>}
        {item.submitter_email && <span>{item.submitter_email}</span>}
        <span>{formatDate(item.submitted_at)}</span>
      </div>

      {!done && (
        <div className="psub-actions">
          <button
            className="psub-approve-btn"
            disabled={busy}
            onClick={handleApprove}
          >
            {approve.isPending ? 'Approving…' : 'Approve'}
          </button>
          <button
            className="psub-return-btn"
            disabled={busy}
            onClick={() => setShowReturn(v => !v)}
          >
            Return
          </button>
        </div>
      )}

      {rowError && (
        <div className="auth-error" style={{ margin: '6px 0 0' }}>{rowError}</div>
      )}
      {showReturn && !done && (
        <div className="psub-return-box">
          <textarea
            placeholder="Enter a message for the submitter explaining what additional information is needed…"
            value={returnMsg}
            onChange={e => setReturnMsg(e.target.value)}
          />
          <button
            className="psub-send-btn"
            disabled={!returnMsg.trim() || busy}
            onClick={handleSendReturn}
          >
            {ret.isPending ? 'Sending…' : 'Send Return'}
          </button>
        </div>
      )}
    </div>
  );
}

export default function PendingSubmissionsModal({ open, onClose }: Props) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const { data, isLoading, isError } = usePendingSubmissions();

  if (!open) return null;

  const items = (data?.items ?? []).filter(i => !dismissed.has(i.id));

  function handleDone(id: string) {
    setDismissed(prev => new Set([...prev, id]));
  }

  return (
    <div className="modal-backdrop show" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 620 }}>
        <div className="modal-hd">
          <h3 className="modal-title">
            Pending Submissions
            {items.length > 0 && (
              <span
                style={{
                  marginLeft: 8,
                  fontSize: 11,
                  fontWeight: 800,
                  background: '#1F2854',
                  color: '#fff',
                  borderRadius: 999,
                  padding: '2px 7px',
                }}
              >
                {items.length}
              </span>
            )}
          </h3>
          <button className="x" onClick={onClose}>✕</button>
        </div>

        <div className="modal-bd">
          {isLoading && (
            <p className="muted small" style={{ textAlign: 'center', padding: '24px 0' }}>
              Loading submissions…
            </p>
          )}

          {isError && (
            <p className="muted small" style={{ textAlign: 'center', padding: '24px 0', color: '#ef4444' }}>
              Failed to load submissions.
            </p>
          )}

          {!isLoading && !isError && items.length === 0 && (
            <p className="muted small" style={{ textAlign: 'center', padding: '24px 0' }}>
              No pending submissions.
            </p>
          )}

          {!isLoading && !isError && items.length > 0 && (
            <div className="psub-list">
              {items.map(item => (
                <ItemRow key={item.id} item={item} onDone={handleDone} />
              ))}
            </div>
          )}
        </div>

        <div className="modal-ft">
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
// Users page, Admins only: let colleagues with your work email domain ask to
// join, and approve or decline their requests.

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  approveJoin, declineJoin, getJoinDomain, getJoinRequests, setJoinDomain,
  JOIN_DOMAIN_KEY, JOIN_REQUESTS_KEY,
} from '../../services/join';

type JoinRole = 'Manager' | 'Analyst';

const errorText = (err: unknown, fallback: string): string =>
  err instanceof Error && err.message ? err.message : fallback;

export default function JoinByDomainPanel({ defaultRole, toast }: {
  defaultRole: string | undefined;
  toast: (msg: string) => void;
}) {
  const qc = useQueryClient();
  const setting = useQuery({ queryKey: JOIN_DOMAIN_KEY, queryFn: getJoinDomain });
  const requests = useQuery({ queryKey: JOIN_REQUESTS_KEY, queryFn: getJoinRequests });
  const startRole: JoinRole = defaultRole === 'Manager' ? 'Manager' : 'Analyst';
  const [roles, setRoles] = useState<Record<string, JoinRole>>({});
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const s = setting.data;
  if (!s) return null;
  const pending = requests.data ?? [];

  async function run(key: string, job: () => Promise<unknown>, done: string) {
    setBusy(key);
    setError('');
    try {
      await job();
      toast(done);
      await Promise.all([
        qc.invalidateQueries({ queryKey: JOIN_DOMAIN_KEY }),
        qc.invalidateQueries({ queryKey: JOIN_REQUESTS_KEY }),
        qc.invalidateQueries({ queryKey: ['users'] }),
      ]);
    } catch (err: unknown) {
      setError(errorText(err, 'That did not work. Try again.'));
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="card join-panel">
      <div className="card-title">
        <span>Join by email domain</span>
        {pending.length > 0 && <span className="member-badge pending">{pending.length} waiting</span>}
      </div>

      {error && <p className="join-error" role="alert">{error}</p>}

      {s.allowed ? (
        <label className="join-switch">
          <input
            type="checkbox"
            checked={s.enabled}
            disabled={busy === 'switch'}
            onChange={e => {
              const on = e.target.checked;
              run('switch', () => setJoinDomain(on), on ? `People with @${s.your_domain} emails can now ask to join.` : 'Join requests by email domain are off.');
            }}
          />
          <span>
            Let people who sign up with an <strong>@{s.your_domain}</strong> email ask to join this workspace.
            <span className="muted small join-hint">You approve each one. Nobody gets in on their own.</span>
          </span>
        </label>
      ) : (
        <p className="muted small">
          This needs a work email. You signed in with @{s.your_domain}, a personal email provider, so anyone could
          sign up with it. Invite people by email instead.
        </p>
      )}

      {pending.length > 0 && (
        <ul className="join-list">
          {pending.map(r => (
            <li key={r.id} className="join-row">
              <div className="join-who">
                <span className="join-name">{r.name || r.email}</span>
                <span className="muted small">{r.email} · asked {new Date(r.requested_at).toLocaleDateString()}</span>
              </div>
              <div className="join-actions">
                <select
                  aria-label={`Role for ${r.email}`}
                  value={roles[r.id] ?? startRole}
                  onChange={e => setRoles({ ...roles, [r.id]: e.target.value as JoinRole })}
                >
                  <option value="Analyst">Analyst</option>
                  <option value="Manager">Manager</option>
                </select>
                <button
                  type="button" className="btn btn-primary" disabled={!!busy}
                  onClick={() => run(r.id, () => approveJoin(r.id, roles[r.id] ?? startRole), `${r.email} has joined.`)}
                >
                  {busy === r.id ? 'Working…' : 'Approve'}
                </button>
                <button
                  type="button" className="btn btn-secondary" disabled={!!busy}
                  onClick={() => run(r.id, () => declineJoin(r.id), `${r.email}'s request was declined.`)}
                >
                  Decline
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {s.enabled && pending.length === 0 && <p className="muted small">No requests waiting.</p>}
    </div>
  );
}

// Shown on setup step 1 when a workspace lets people with your email domain
// ask to join. You can still set up your own workspace below it.

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Users } from 'lucide-react';
import { apiPost } from '../../services/api';
import { askToJoin, getJoinable, JOINABLE_KEY } from '../../services/join';
import { useAuthStore } from '../../store/authStore';
import type { JoinableWorkspace } from '../../types/join';

const errorText = (err: unknown, fallback: string): string =>
  err instanceof Error && err.message ? err.message : fallback;

export default function JoinTeamCard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { setToken, workspaces, setWorkspaces } = useAuthStore();
  const { data, refetch, isFetching } = useQuery({ queryKey: JOINABLE_KEY, queryFn: getJoinable });
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  if (!data || data.length === 0) return null;

  async function ask(ws: JoinableWorkspace) {
    setBusy(ws.tenant_id);
    setError('');
    try {
      await askToJoin(ws.tenant_id);
      await queryClient.invalidateQueries({ queryKey: JOINABLE_KEY });
    } catch (err: unknown) {
      setError(errorText(err, 'Your request could not be sent.'));
    } finally {
      setBusy('');
    }
  }

  async function open(ws: JoinableWorkspace) {
    setBusy(ws.tenant_id);
    setError('');
    try {
      const r = await apiPost<{ access_token: string; requires_pin?: boolean }>(
        '/api/v1/auth/select-workspace', { tenant_id: ws.tenant_id },
      );
      setToken(r.access_token);
      const claims = useAuthStore.getState().claims;
      if (claims?.role) {
        setWorkspaces([
          ...workspaces.filter(w => w.tenant_id !== ws.tenant_id),
          { tenant_id: ws.tenant_id, name: ws.name, role: claims.role, plan: claims.plan, modules: claims.modules },
        ]);
      }
      navigate(r.requires_pin ? '/verify-pin' : '/', { replace: true });
    } catch (err: unknown) {
      setError(errorText(err, 'This workspace could not be opened.'));
      setBusy('');
    }
  }

  return (
    <section className="wiz-join" aria-label="Join your team">
      <div className="wiz-join-head">
        <span className="wiz-join-icon" aria-hidden="true"><Users size={16} /></span>
        <div>
          <p className="wiz-join-title">Your team is already on Pulse</p>
          <p className="wiz-join-sub">Ask to join, and an Admin there will approve you. Or set up your own workspace below.</p>
        </div>
      </div>
      {error && <div className="wiz-error" role="alert">{error}</div>}
      <ul className="wiz-join-list">
        {data.map(ws => (
          <li key={ws.tenant_id} className="wiz-join-row">
            <span className="wiz-join-name">{ws.name}</span>
            {ws.request_status === 'NONE' && (
              <button type="button" className="wiz-btn" disabled={!!busy} onClick={() => ask(ws)}>
                {busy === ws.tenant_id ? 'Sending…' : 'Ask to join'}
              </button>
            )}
            {ws.request_status === 'PENDING' && (
              <span className="wiz-join-state">
                Request sent. Waiting for an Admin.{' '}
                <button type="button" className="wiz-btn-ghost" disabled={isFetching} onClick={() => refetch()}>
                  {isFetching ? 'Checking…' : 'Check again'}
                </button>
              </span>
            )}
            {ws.request_status === 'APPROVED' && (
              <button type="button" className="wiz-btn wiz-btn-primary" disabled={!!busy} onClick={() => open(ws)}>
                {busy === ws.tenant_id ? 'Opening…' : 'Approved. Open workspace'}
              </button>
            )}
            {ws.request_status === 'DECLINED' && (
              <span className="wiz-join-state">Declined. Ask an Admin there to invite you.</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

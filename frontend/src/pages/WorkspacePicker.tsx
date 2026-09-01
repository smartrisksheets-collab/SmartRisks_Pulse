import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGet, apiPost } from '../services/api';
import { useAuthStore } from '../store/authStore';
import type { WorkspaceInfo } from '../types/auth';
import type { ModuleKey, PlanStage, UserRole } from '../types/api';
import { roleLabel } from '../utils/roles';

export default function WorkspacePicker() {
  const navigate = useNavigate();
  const { workspaces, setToken, setWorkspaces } = useAuthStore();
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError]       = useState('');

  useEffect(() => {
    apiGet<{ id: string; name: string; plan: string; modules: string[]; role: string }[]>(
      '/api/v1/workspaces'
    )
      .then((list) => {
        const mapped: WorkspaceInfo[] = list.map((w) => ({
          tenant_id: w.id,
          name:      w.name,
          role:      (w.role ?? 'Analyst') as UserRole,
          plan:      (w.plan ?? 'TRIAL')   as PlanStage,
          modules:   (w.modules ?? [])     as ModuleKey[],
        }));
        setWorkspaces(mapped);
      })
      .catch(() => { /* show what is in store if fetch fails */ })
      .finally(() => setFetching(false));
  }, [setWorkspaces]);

  const isTrial = workspaces.some(ws => ws.plan === 'TRIAL');

  async function handleOpen() {
    if (!selected) return;
    setError('');
    setLoading(true);
    try {
      const result = await apiPost<{ access_token: string; requires_pin?: boolean }>(
        '/api/v1/auth/select-workspace', { tenant_id: selected }
      );
      setToken(result.access_token);
      if (result.requires_pin) navigate('/verify-pin');
      else navigate('/');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to open workspace');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="picker-shell">
      <div className="picker-wrap">
        <div className="picker-brand">
          <img
            src="https://smartrisksheets.com/wp-content/uploads/2025/09/cropped-Smartrisksheets-favicon-v2.png"
            width="36"
            height="36"
            alt="SmartRisk Pulse"
            style={{ borderRadius: 8, flexShrink: 0 }}
          />
          <span className="picker-brand-name">SmartRisk Pulse</span>
        </div>

        <h1 className="picker-title">Choose a workspace</h1>
        <p className="picker-sub">Select the workspace you want to access.</p>

        {error && <div className="auth-error">{error}</div>}

        <div className="workspace-grid">
          {fetching
            ? <p className="picker-sub">Loading your workspaces…</p>
            : workspaces.length === 0
              ? <p className="picker-sub">No workspaces found. Create one below.</p>
              : null
          }
          {!fetching && workspaces.map((ws: WorkspaceInfo) => (
            <button
              key={ws.tenant_id}
              className={`workspace-card${selected === ws.tenant_id ? ' selected' : ''}`}
              onClick={() => setSelected(ws.tenant_id)}
            >
              <div className="workspace-card-name">{ws.name}</div>
              <div className="workspace-card-meta">
                <span className="badge">{ws.plan}</span>
                <span>{roleLabel(ws.role)}</span>
              </div>
            </button>
          ))}
        </div>

        <div className="picker-actions">
          <span
            className="tooltip-wrap"
            data-tip={isTrial ? 'You are on a trial plan. Upgrade to add more workspaces.' : undefined}
          >
            <button
              className="btn btn-ghost"
              onClick={() => navigate('/workspaces/create')}
              disabled={isTrial}
            >
              + New workspace
            </button>
          </span>
          <button className="btn btn-navy" onClick={handleOpen} disabled={!selected || loading}>
            {loading && <span className="spinner" />}
            {loading ? 'Opening...' : 'Open workspace'}
          </button>
        </div>
      </div>
    </div>
  );
}
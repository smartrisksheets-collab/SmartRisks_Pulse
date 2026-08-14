import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiPost } from '../services/api';
import { useAuthStore } from '../store/authStore';
import type { WorkspaceInfo } from '../types/auth';

export default function WorkspacePicker() {
  const navigate = useNavigate();
  const { workspaces, setToken } = useAuthStore();
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

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
          {workspaces.map((ws: WorkspaceInfo) => (
            <button
              key={ws.tenant_id}
              className={`workspace-card${selected === ws.tenant_id ? ' selected' : ''}`}
              onClick={() => setSelected(ws.tenant_id)}
            >
              <div className="workspace-card-name">{ws.name}</div>
              <div className="workspace-card-meta">
                <span className="badge">{ws.plan}</span>
                <span>{ws.role}</span>
              </div>
            </button>
          ))}
        </div>

        <div className="picker-actions">
          <button className="btn btn-ghost" onClick={() => navigate('/workspaces/create')}>
            + New workspace
          </button>
          <button className="btn btn-navy" onClick={handleOpen} disabled={!selected || loading}>
            {loading && <span className="spinner" />}
            {loading ? 'Opening...' : 'Open workspace'}
          </button>
        </div>
      </div>
    </div>
  );
}
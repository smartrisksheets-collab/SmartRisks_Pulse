import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiPost } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { INDUSTRIES } from '../utils/constants';

interface WorkspaceResult { id: string; name: string; }

const FEATURES = [
  { label: 'Risk Register', desc: 'Track up to 1,000 risks with live scoring and movement indicators.' },
  { label: 'AI Insights', desc: 'Generate intelligent risk analysis and mitigation recommendations.' },
  { label: 'Team Collaboration', desc: 'Invite up to 25 team members with role-based access control.' },
  { label: 'Reports and Briefs', desc: 'Generate board-ready PDF reports and automated daily risk briefs.' },
];

function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export default function CreateWorkspace() {
  const navigate = useNavigate();
  const { setToken, claims } = useAuthStore();
  const [name, setName]         = useState('');
  const [industry, setIndustry] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  const email   = claims?.email ?? '';
  const initial = email.charAt(0).toUpperCase();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const ws = await apiPost<WorkspaceResult>('/api/v1/workspaces', { name, industry });
      const result = await apiPost<{ access_token: string }>(
        '/api/v1/auth/select-workspace', { tenant_id: ws.id }
      );
      setToken(result.access_token);
      navigate('/');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create workspace');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="picker-shell">
      <div className="picker-wrap" style={{ maxWidth: 480 }}>

        {/* Brand */}
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

        {/* Trial banner */}
        <div className="onboard-trial-banner">
          <div className="onboard-trial-dot" />
          <div className="onboard-trial-text">
            14-day free trial active <span>— no credit card required</span>
          </div>
        </div>

        <h1 className="picker-title">Set up your workspace</h1>
        <p className="picker-sub">You are one step away from your risk management environment.</p>

        {/* User badge */}
        {email && (
          <div className="onboard-user-badge">
            <div className="onboard-user-avatar">{initial}</div>
            <div className="onboard-user-email">{email}</div>
          </div>
        )}

        {/* What you get */}
        <div className="onboard-features">
          {FEATURES.map((f) => (
            <div key={f.label} className="onboard-feature">
              <div className="onboard-feature-icon"><CheckIcon /></div>
              <div className="onboard-feature-text">
                <strong>{f.label}</strong> — {f.desc}
              </div>
            </div>
          ))}
        </div>

        {error && <div className="auth-error">{error}</div>}

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div className="auth-field">
            <label htmlFor="ws-name">Workspace name</label>
            <input
              id="ws-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Acme Corp Risk Register"
              required
            />
          </div>
          <div className="auth-field">
            <label htmlFor="ws-industry">Industry</label>
            <select
              id="ws-industry"
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              style={{ padding: '14px 16px', border: '2px solid #e2e8f0', borderRadius: 10, fontSize: 15, background: 'white', width: '100%', color: '#0f172a' }}
            >
              <option value="">Select your industry</option>
              {INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
            </select>
          </div>

          <button type="submit" className="auth-btn" disabled={!name || loading}>
            {loading && <span className="spinner" />}
            {loading ? 'Creating your workspace...' : 'Create my workspace →'}
          </button>
        </form>

        <div className="onboard-footer">
          By continuing you agree to our{' '}
          <a href="/terms" target="_blank">Terms of Service</a>
          {' '}and{' '}
          <a href="/privacy" target="_blank">Privacy Policy</a>
        </div>
      </div>
    </div>
  );
}
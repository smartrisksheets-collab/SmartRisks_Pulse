import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useNavigate, Link } from 'react-router-dom';
import { apiPost } from '../services/api';
import { useAuthStore } from '../store/authStore';
import type { LoginResult } from '../types/auth';
import { validateEmail, validatePassword } from '../utils/validation';

export default function Login() {
  const navigate = useNavigate();
  const { setToken, setWorkspaces } = useAuthStore();
  const [searchParams] = useSearchParams();
  const [email, setEmail]       = useState(searchParams.get('email') ?? '');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [showPwd, setShowPwd]   = useState(false);
  const [emailErr, setEmailErr]     = useState('');
  const [passwordErr, setPasswordErr] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    const eErr = validateEmail(email);
    const pErr = validatePassword(password);
    setEmailErr(eErr);
    setPasswordErr(pErr);
    if (eErr || pErr) {
      if (eErr) (document.getElementById('email') as HTMLInputElement)?.focus();
      else (document.getElementById('password') as HTMLInputElement)?.focus();
      return;
    }
    setLoading(true);
    try {
      const result = await apiPost<LoginResult>('/api/v1/auth/login', { email, password });
      setToken(result.access_token);
      if (result.workspaces?.length) setWorkspaces(result.workspaces);
      if (result.requires_pin) navigate('/verify-pin');
      else if (result.requires_workspace_select) navigate('/workspaces');
      else navigate('/');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-shell">

      {/* Left panel */}
      <div className="auth-left">
        <div className="auth-left-brand">
          <img
            src="https://smartrisksheets.com/wp-content/uploads/2025/09/cropped-Smartrisksheets-favicon-v2.png"
            width="40"
            height="40"
            alt="SmartRisk Pulse"
            style={{ borderRadius: 8, flexShrink: 0 }}
          />
          <span className="auth-brand-name">SmartRisk Pulse</span>
        </div>

        <p className="auth-eyebrow">Risk Intelligence</p>
        <h2>
          Track exposure. Brief the board.<br />
          <span style={{ color: '#01b88e' }}>In real time.</span>
        </h2>
        <p className="auth-left-sub">
          Your risk register working as live intelligence — health, exposure and
          updates in one view, so you always know what changed before your next meeting.
        </p>

        <div className="auth-info-cards">
          <div className="auth-info-card">
            <div className="auth-tick">
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <polyline points="2,6.5 5.5,10 11,3" stroke="white" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h3>Live risk health</h3>
            <p>Track your entire risk register with real-time scoring and movement indicators.</p>
          </div>
          <div className="auth-info-card">
            <div className="auth-tick">
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <polyline points="2,6.5 5.5,10 11,3" stroke="white" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h3>AI-powered briefs</h3>
            <p>Automated daily and weekly risk briefs sent directly to your team.</p>
          </div>
        </div>

        <div className="auth-left-footer">
          &copy; {new Date().getFullYear()} SmartRisk Pulse. All rights reserved.
        </div>
      </div>

      {/* Right panel */}
      <div className="auth-right">
        <div className="auth-form-wrap">
          <p className="auth-form-eyebrow">Secure Sign In</p>
          <h1>Welcome back</h1>
          <p className="auth-form-sub">
            Sign in to your workspace to continue managing risk.
          </p>

          {error && <div className="auth-error">{error}</div>}

          <form onSubmit={handleSubmit}>
            <div className="auth-field">
              <label htmlFor="email">Email address</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); if (emailErr) setEmailErr(''); }}
                onBlur={(e) => setEmailErr(validateEmail(e.target.value))}
                placeholder="you@yourcompany.com"
                autoComplete="email"
                className={emailErr ? 'invalid' : ''}
              />
              {emailErr && <p className="form-error">{emailErr}</p>}
            </div>
            <div className="auth-field">
              <label htmlFor="password">Password</label>
              <div className="input-wrap">
                <input
                  id="password"
                  type={showPwd ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); if (passwordErr) setPasswordErr(''); }}
                  onBlur={(e) => setPasswordErr(validatePassword(e.target.value))}
                  placeholder="Your password"
                  autoComplete="current-password"
                  className={passwordErr ? 'invalid' : ''}
                />
                <button type="button" className="input-eye" onClick={() => setShowPwd(v => !v)} aria-label="Toggle password visibility">
                  {showPwd
                    ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  }
                </button>
              </div>
              {passwordErr && <p className="form-error">{passwordErr}</p>}
            </div>
            <div style={{ display: 'flex', gap: 16, marginBottom: 16, justifyContent: 'flex-end' }}>
              <Link to="/register" style={{ fontSize: 13, color: '#01b88e', fontWeight: 600 }}>
                Create account
              </Link>
              <Link to="/forgot-password" style={{ fontSize: 13, color: '#01b88e', fontWeight: 600 }}>
                Forgot password?
              </Link>
            </div>
            <button type="submit" className="auth-btn" disabled={loading}>
              {loading && <span className="spinner" />}
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
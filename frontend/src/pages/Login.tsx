import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useNavigate, Link } from 'react-router-dom';
import { useGoogleLogin } from '@react-oauth/google';
import { Clock, BarChart2, Activity } from 'lucide-react';
import { apiPost } from '../services/api';
import { useAuthStore } from '../store/authStore';
import type { LoginResult } from '../types/auth';
import { validateEmail, validatePassword } from '../utils/validation';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

interface GoogleBtnProps {
  onSuccess: (accessToken: string) => void;
  onError: (msg: string) => void;
  loading: boolean;
}

function GoogleSignInButton({ onSuccess, onError, loading }: GoogleBtnProps) {
  const [googlePending, setGooglePending] = useState(false);

  const login = useGoogleLogin({
    onSuccess: (r) => {
      onSuccess(r.access_token);
      // loading takes over from here — parent sets its own loading state
    },
    onError: () => {
      setGooglePending(false);
      onError(
        navigator.onLine
          ? 'Google sign-in was cancelled or failed. Please try again.'
          : 'No internet connection. Check your network and try again.'
      );
    },
  });

  function handleClick() {
    if (!navigator.onLine) {
      onError('No internet connection. Check your network and try again.');
      return;
    }
    setGooglePending(true);
    login();
  }

  const busy = loading || googlePending;

  return (
    <button
      type="button"
      className="auth-google-btn"
      disabled={busy}
      onClick={handleClick}
    >
      {googlePending
        ? <span className="spinner" />
        : (
          <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
            <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.874 2.684-6.616z"/>
            <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
            <path fill="#FBBC05" d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z"/>
            <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.167 6.656 3.58 9 3.58z"/>
          </svg>
        )
      }
      {googlePending ? 'Connecting to Google…' : 'Continue with Google'}
    </button>
  );
}

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

        <p className="auth-eyebrow">Pulse Portal</p>
        <h2>
          Welcome<br />
          <span style={{ color: '#01b88e' }}>back.</span>
        </h2>
        <p className="auth-left-sub">
          Sign in to pick up right where your risk register left off.
        </p>

        <div className="auth-features">
          <div className="auth-feature">
            <Clock size={17} className="auth-feature-icon" />
            <div>
              <div className="auth-feature-title">Fresh, aging, stale</div>
              <div className="auth-feature-sub">Know which risks have actually been reviewed, not just edited.</div>
            </div>
          </div>
          <div className="auth-feature">
            <BarChart2 size={17} className="auth-feature-icon" />
            <div>
              <div className="auth-feature-title">Live board reporting</div>
              <div className="auth-feature-sub">Generated from your current register, not last month's slide deck.</div>
            </div>
          </div>
          <div className="auth-feature">
            <Activity size={17} className="auth-feature-icon" />
            <div>
              <div className="auth-feature-title">Continuous monitoring</div>
              <div className="auth-feature-sub">Not a static spreadsheet snapshot frozen at last quarter's review.</div>
            </div>
          </div>
        </div>

        <div className="auth-left-footer">
          <div>NDPC/DCP/12625 registered &middot; Aligned to ISO 31000 &amp; COSO ERM principles</div>
          <div>SmartRisk Sheets Technologies Limited &middot; RC 9170218</div>
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
            {GOOGLE_CLIENT_ID && (
              <>
                <GoogleSignInButton
                  loading={loading}
                  onSuccess={async (accessToken) => {
                    setError('');
                    setLoading(true);
                    try {
                      const result = await apiPost<LoginResult>('/api/v1/auth/google', { access_token: accessToken });
                      setToken(result.access_token);
                      if (result.workspaces?.length) setWorkspaces(result.workspaces);
                      if (result.requires_pin) navigate('/verify-pin');
                      else if (result.requires_workspace_select) navigate('/workspaces');
                      else navigate('/');
                    } catch (err: unknown) {
                      setError(err instanceof Error ? err.message : 'Google sign-in failed.');
                    } finally {
                      setLoading(false);
                    }
                  }}
                  onError={msg => setError(msg)}
                />
                <div className="auth-or-divider">or continue with email</div>
              </>
            )}
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
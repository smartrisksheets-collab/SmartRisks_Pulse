import { useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useGoogleLogin } from '@react-oauth/google';
import { apiPost } from '../services/api';
import { useAuthStore } from '../store/authStore';
import type { LoginResult } from '../types/auth';
import {
  validateEmail, validatePassword, validateConfirm,
  validateName, getPasswordStrength, type PasswordStrength,
} from '../utils/validation';

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

function StrengthBar({ s }: { s: PasswordStrength | '' }) {
  const levels: PasswordStrength[] = ['weak', 'fair', 'strong'];
  const idx = s ? levels.indexOf(s) : -1;
  return (
    <div className="pwd-strength">
      <div className="pwd-strength-bars">
        {levels.map((l, i) => (
          <div key={l} className={`pwd-strength-bar${i <= idx ? ` filled ${s}` : ''}`} />
        ))}
      </div>
      {s && <span className={`pwd-strength-label ${s}`}>{s.charAt(0).toUpperCase() + s.slice(1)}</span>}
    </div>
  );
}

export default function Register() {
  const navigate = useNavigate();
  const { setToken } = useAuthStore();

  const [name, setName]           = useState('');
  const [email, setEmail]         = useState('');
  const [password, setPassword]   = useState('');
  const [confirm, setConfirm]     = useState('');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [showPwd, setShowPwd]     = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [nameErr, setNameErr]         = useState('');
  const [emailErr, setEmailErr]       = useState('');
  const [passwordErr, setPasswordErr] = useState('');
  const [confirmErr, setConfirmErr]   = useState('');
  const [strength, setStrength]       = useState<PasswordStrength | ''>('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    const nErr = validateName(name);
    const eErr = validateEmail(email);
    const pErr = validatePassword(password);
    const cErr = validateConfirm(confirm, password);
    setNameErr(nErr);
    setEmailErr(eErr);
    setPasswordErr(pErr);
    setConfirmErr(cErr);
    if (nErr || eErr || pErr || cErr) {
      const firstId = nErr ? 'name' : eErr ? 'email' : pErr ? 'password' : 'confirm';
      (document.getElementById(firstId) as HTMLInputElement)?.focus();
      return;
    }
    setLoading(true);
    try {
      const result = await apiPost<LoginResult>('/api/v1/auth/register', { name, email, password });
      setToken(result.access_token);
      if (result.requires_workspace_select) navigate('/workspaces');
      else navigate('/workspaces/create');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-shell">
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

        <p className="auth-eyebrow">Get started free</p>
        <h2>
          Your risk register,<br />
          <span style={{ color: '#01b88e' }}>live in minutes.</span>
        </h2>
        <p className="auth-left-sub">
          Set up your workspace, invite your team, and start tracking risk with
          AI-powered insights from day one. No setup fees. Full access on trial.
        </p>

        <div className="auth-info-cards">
          <div className="auth-info-card">
            <div className="auth-tick">
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <polyline points="2,6.5 5.5,10 11,3" stroke="white" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h3>14-day free trial</h3>
            <p>Full access to every feature. No credit card required to start.</p>
          </div>
          <div className="auth-info-card">
            <div className="auth-tick">
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <polyline points="2,6.5 5.5,10 11,3" stroke="white" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h3>Up to 25 users</h3>
            <p>Invite your entire risk team with role-based access control.</p>
          </div>
        </div>

        <div className="auth-left-footer">
          &copy; {new Date().getFullYear()} SmartRisk Pulse. All rights reserved.
        </div>
      </div>

      <div className="auth-right">
        <div className="auth-form-wrap">
          <p className="auth-form-eyebrow">Create your account</p>
          <h1>Get started</h1>
          <p className="auth-form-sub">
            Already have an account?{' '}
            <Link to="/login" style={{ color: '#01b88e', fontWeight: 600 }}>Sign in</Link>
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
                      if (result.requires_workspace_select) navigate('/workspaces');
                      else navigate('/workspaces/create');
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
              <label htmlFor="name">Full name</label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => { setName(e.target.value); if (nameErr) setNameErr(''); }}
                onBlur={(e) => setNameErr(validateName(e.target.value))}
                placeholder="Your full name"
                autoComplete="name"
                className={nameErr ? 'invalid' : ''}
              />
              {nameErr && <p className="form-error">{nameErr}</p>}
            </div>
            <div className="auth-field">
              <label htmlFor="email">Work email</label>
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
                  onChange={(e) => { setPassword(e.target.value); setStrength(getPasswordStrength(e.target.value)); if (passwordErr) setPasswordErr(''); }}
                  onBlur={(e) => setPasswordErr(validatePassword(e.target.value))}
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
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
              <StrengthBar s={strength} />
            </div>
            <div className="auth-field">
              <label htmlFor="confirm">Confirm password</label>
              <div className="input-wrap">
                <input
                  id="confirm"
                  type={showConfirm ? 'text' : 'password'}
                  value={confirm}
                  onChange={(e) => { setConfirm(e.target.value); if (confirmErr) setConfirmErr(''); }}
                  onBlur={(e) => setConfirmErr(validateConfirm(e.target.value, password))}
                  placeholder="Repeat your password"
                  autoComplete="new-password"
                  className={confirmErr ? 'invalid' : ''}
                />
                <button type="button" className="input-eye" onClick={() => setShowConfirm(v => !v)} aria-label="Toggle confirm password visibility">
                  {showConfirm
                    ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  }
                </button>
              </div>
              {confirmErr && <p className="form-error">{confirmErr}</p>}
            </div>
            <button type="submit" className="auth-btn" disabled={loading}>
              {loading && <span className="spinner" />}
              {loading ? 'Creating account...' : 'Create account'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
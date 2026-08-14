import { useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { apiPost } from '../services/api';
import { useAuthStore } from '../store/authStore';
import type { LoginResult } from '../types/auth';
import {
  validateEmail, validatePassword, validateConfirm,
  validateName, getPasswordStrength, type PasswordStrength,
} from '../utils/validation';

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
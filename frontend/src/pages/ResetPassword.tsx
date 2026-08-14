import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import {
  validatePassword, validateConfirm,
  getPasswordStrength, type PasswordStrength,
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

export default function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [loading, setLoading]   = useState(false);
  const [ready, setReady]       = useState(false);
  const [showPwd, setShowPwd]     = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError]       = useState('');
  const [done, setDone]           = useState(false);
  const [passwordErr, setPasswordErr] = useState('');
  const [confirmErr, setConfirmErr]   = useState('');
  const [strength, setStrength]       = useState<PasswordStrength | ''>('');

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    const pErr = validatePassword(password);
    const cErr = validateConfirm(confirm, password);
    setPasswordErr(pErr); setConfirmErr(cErr);
    if (pErr || cErr) {
      (document.getElementById(pErr ? 'password' : 'confirm') as HTMLInputElement)?.focus();
      return;
    }
    setLoading(true);
    try {
      const { error: sbError } = await supabase.auth.updateUser({ password });
      if (sbError) throw new Error(sbError.message);
      setDone(true);
      setTimeout(() => navigate('/login'), 2500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update password.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-left">
        <div className="auth-left-brand">
          <div className="auth-brand-icon">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M10 2L2 7l8 5 8-5-8-5zM2 13l8 5 8-5M2 10l8 5 8-5"
                stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <span className="auth-brand-name">SmartRisk Pulse</span>
        </div>
        <p className="auth-eyebrow">Account Security</p>
        <h2>Set a new<br /><span style={{ color: '#01b88e' }}>password.</span></h2>
        <p className="auth-left-sub">
          Choose a strong password you have not used before.
          You will be signed in automatically after updating.
        </p>
        <div className="auth-left-footer">
          &copy; {new Date().getFullYear()} SmartRisk Pulse. All rights reserved.
        </div>
      </div>

      <div className="auth-right">
        <div className="auth-form-wrap">
          {done ? (
            <>
              <p className="auth-form-eyebrow">All done</p>
              <h1>Password updated</h1>
              <p className="auth-form-sub">
                Your password has been changed. Redirecting you to sign in...
              </p>
            </>
          ) : !ready ? (
            <>
              <p className="auth-form-eyebrow">Verifying link</p>
              <h1>One moment</h1>
              <p className="auth-form-sub">
                Validating your reset link. If nothing happens, the link may have
                expired. Request a{' '}
                <a href="/forgot-password" style={{ color: '#01b88e', fontWeight: 600 }}>
                  new reset link
                </a>.
              </p>
            </>
          ) : (
            <>
              <p className="auth-form-eyebrow">Almost there</p>
              <h1>New password</h1>
              <p className="auth-form-sub">Enter and confirm your new password below.</p>

              {error && <div className="auth-error">{error}</div>}

              <form onSubmit={handleSubmit}>
                <div className="auth-field">
                  <label htmlFor="password">New password</label>
                  <div className="input-wrap">
                    <input
                      id="password"
                      type={showPwd ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        setStrength(getPasswordStrength(e.target.value));
                        if (passwordErr) setPasswordErr('');
                      }}
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
                  <label htmlFor="confirm">Confirm new password</label>
                  <div className="input-wrap">
                    <input
                      id="confirm"
                      type={showConfirm ? 'text' : 'password'}
                      value={confirm}
                      onChange={(e) => { setConfirm(e.target.value); if (confirmErr) setConfirmErr(''); }}
                      onBlur={(e) => setConfirmErr(validateConfirm(e.target.value, password))}
                      placeholder="Repeat your new password"
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
                  {loading ? 'Updating...' : 'Update password'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
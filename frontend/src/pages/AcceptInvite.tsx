// src/pages/AcceptInvite.tsx

import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import { useAuthStore } from '../store/authStore';

interface ValidateResult {
  email:            string;
  workspace_name:   string;
  role:             string;
  is_existing_user: boolean;
}

type Stage = 'loading' | 'invalid' | 'existing' | 'set_password' | 'done';

export default function AcceptInvite() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const { setToken } = useAuthStore();

  const [stage,       setStage]       = useState<Stage>(token ? 'loading' : 'invalid');
  const [info,        setInfo]        = useState<ValidateResult | null>(null);
  const [password,    setPassword]    = useState('');
  const [confirm,     setConfirm]     = useState('');
  const [pwdErr,      setPwdErr]      = useState('');
  const [confirmErr,  setConfirmErr]  = useState('');
  const [submitErr,   setSubmitErr]   = useState('');
  const [submitting,  setSubmitting]  = useState(false);

  useEffect(() => {
    if (!token) return;
    api.get<{ data: ValidateResult; error: string | null }>(`/api/v1/auth/validate-invite?token=${encodeURIComponent(token)}`)
      .then((res) => {
        if (res.data.error) { setStage('invalid'); return; }
        const d = res.data.data;
        setInfo(d);
        setStage(d.is_existing_user ? 'existing' : 'set_password');
      })
      .catch(() => setStage('invalid'));
  }, [token]);

  async function handleSubmit() {
    let ok = true;
    if (password.length < 8) { setPwdErr('Password must be at least 8 characters.'); ok = false; }
    else setPwdErr('');
    if (password !== confirm) { setConfirmErr('Passwords do not match.'); ok = false; }
    else setConfirmErr('');
    if (!ok) return;

    setSubmitting(true);
    setSubmitErr('');
    try {
      const res = await api.post<{ data: { access_token: string; refresh_token?: string }; error: string | null }>(
        '/api/v1/auth/accept-invite',
        { token, password },
      );
      if (res.data.error) { setSubmitErr(res.data.error); return; }
      setToken(res.data.data.access_token);
      setStage('done');
      navigate('/');
    } catch (err: unknown) {
      setSubmitErr(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="picker-shell" style={{ alignItems: 'center', justifyContent: 'center' }}>
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

        {stage === 'loading' && (
          <p className="picker-sub" style={{ marginTop: 24 }}>Verifying your invite…</p>
        )}

        {stage === 'invalid' && (
          <>
            <h1 className="picker-title">Link invalid or expired</h1>
            <p className="picker-sub">
              This invite link has expired or is not valid. Ask your workspace admin to send a new one.
            </p>
          </>
        )}

        {stage === 'existing' && info && (
          <>
            <h1 className="picker-title">You've been added</h1>
            <p className="picker-sub">
              You've been added to <strong>{info.workspace_name}</strong> as {info.role === 'Owner' ? 'Admin' : info.role}.
              Sign in with your existing account and the workspace will appear automatically.
            </p>
            <div className="picker-actions" style={{ marginTop: 24 }}>
              <button
                className="btn btn-navy"
                style={{ width: '100%' }}
                onClick={() => navigate(`/login?email=${encodeURIComponent(info.email)}`)}
              >
                Sign In
              </button>
            </div>
          </>
        )}

        {stage === 'set_password' && info && (
          <>
            <h1 className="picker-title">Set your password</h1>
            <p className="picker-sub">
              You've been invited to <strong>{info.workspace_name}</strong> as {info.role === 'Owner' ? 'Admin' : info.role}.
              Create a password to access your account.
            </p>

            {submitErr && <div className="auth-error" style={{ marginBottom: 16 }}>{submitErr}</div>}

            <div className="auth-field">
              <label style={{ fontSize: 13, fontWeight: 600, color: '#1F2854', display: 'block', marginBottom: 6 }}>
                Email
              </label>
              <input type="email" value={info.email} disabled style={{ width: '100%' }} />
            </div>

            <div className="auth-field">
              <label style={{ fontSize: 13, fontWeight: 600, color: '#1F2854', display: 'block', marginBottom: 6 }}>
                Password
              </label>
              <input
                type="password"
                placeholder="Minimum 8 characters"
                value={password}
                onChange={(e) => { setPassword(e.target.value); if (pwdErr) setPwdErr(''); }}
                className={pwdErr ? 'invalid' : ''}
                autoComplete="new-password"
                style={{ width: '100%' }}
              />
              {pwdErr && <p className="form-error">{pwdErr}</p>}
            </div>

            <div className="auth-field">
              <label style={{ fontSize: 13, fontWeight: 600, color: '#1F2854', display: 'block', marginBottom: 6 }}>
                Confirm Password
              </label>
              <input
                type="password"
                placeholder="Repeat your password"
                value={confirm}
                onChange={(e) => { setConfirm(e.target.value); if (confirmErr) setConfirmErr(''); }}
                className={confirmErr ? 'invalid' : ''}
                autoComplete="new-password"
                style={{ width: '100%' }}
              />
              {confirmErr && <p className="form-error">{confirmErr}</p>}
            </div>

            <div className="picker-actions" style={{ marginTop: 8 }}>
              <button
                className="btn btn-navy"
                style={{ width: '100%' }}
                onClick={handleSubmit}
                disabled={submitting}
              >
                {submitting ? 'Setting up…' : 'Create Account & Sign In'}
              </button>
            </div>
          </>
        )}

        {stage === 'done' && (
          <p className="picker-sub" style={{ marginTop: 24 }}>Signing you in…</p>
        )}
      </div>
    </div>
  );
}
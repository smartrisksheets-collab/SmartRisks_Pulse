import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { apiPost } from '../services/api';
import { validateEmail } from '../utils/validation';

export default function ForgotPassword() {
  const [email, setEmail]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [sent, setSent]         = useState(false);
  const [error, setError]     = useState('');
  const [emailErr, setEmailErr] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    const eErr = validateEmail(email);
    setEmailErr(eErr);
    if (eErr) {
      (document.getElementById('email') as HTMLInputElement)?.focus();
      return;
    }
    setLoading(true);
    try {
      await apiPost('/api/v1/auth/forgot-password', { email });
      setSent(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send reset email.');
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
        <p className="auth-eyebrow">Account Recovery</p>
        <h2>Reset your<br /><span style={{ color: '#01b88e' }}>password.</span></h2>
        <p className="auth-left-sub">
          Enter the email address on your account and we will send you a link to
          reset your password. The link expires in 15 minutes.
        </p>
        <div className="auth-left-footer">
          &copy; {new Date().getFullYear()} SmartRisk Pulse. All rights reserved.
        </div>
      </div>

      <div className="auth-right">
        <div className="auth-form-wrap">
          {sent ? (
            <>
              <p className="auth-form-eyebrow">Check your inbox</p>
              <h1>Email sent</h1>
              <p className="auth-form-sub">
                We sent a password reset link to <strong>{email}</strong>.
                Check your inbox and follow the link to set a new password.
              </p>
              <p className="auth-form-sub" style={{ marginTop: 24 }}>
                <Link to="/login" style={{ color: '#01b88e', fontWeight: 600 }}>
                  Back to sign in
                </Link>
              </p>
            </>
          ) : (
            <>
              <p className="auth-form-eyebrow">Forgot your password?</p>
              <h1>Reset password</h1>
              <p className="auth-form-sub">
                Remember it?{' '}
                <Link to="/login" style={{ color: '#01b88e', fontWeight: 600 }}>Sign in</Link>
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
                <button type="submit" className="auth-btn" disabled={loading}>
                  {loading && <span className="spinner" />}
                  {loading ? 'Sending...' : 'Send reset link'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
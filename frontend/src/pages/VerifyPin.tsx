// src/pages/VerifyPin.tsx

import { useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { apiPost } from '../services/api';
import { useAuthStore } from '../store/authStore';

export default function VerifyPin() {
  const navigate = useNavigate();
  const { claims, setToken } = useAuthStore();

  const inputRefs = useRef<(HTMLInputElement | null)[]>(Array(6).fill(null));
  const [digits, setDigits] = useState<string[]>(Array(6).fill(''));
  const [error, setError]   = useState('');
  const [ok, setOk]         = useState('');
  const [loading, setLoading] = useState(false);

  if (claims?.active_tenant_id) return <Navigate to="/" replace />;
  if (!claims?.pending_tenant_id) return <Navigate to="/workspaces" replace />;

  const full = digits.every((d) => d !== '');

  function update(i: number, val: string) {
    setDigits((prev) => {
      const next = [...prev];
      next[i] = val;
      return next;
    });
  }

  function handleInput(i: number, e: React.ChangeEvent<HTMLInputElement>) {
    const digit = e.target.value.replace(/\D/g, '').slice(-1);
    e.target.value = digit;
    update(i, digit);
    if (digit && i < 5) inputRefs.current[i + 1]?.focus();
  }

  function handleKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      inputRefs.current[i - 1]?.focus();
    }
    if (e.key === 'Enter' && full) handleVerify();
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const raw = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    const next = Array(6).fill('');
    raw.split('').forEach((d, j) => { next[j] = d; });
    setDigits(next);
    raw.split('').forEach((d, j) => {
      if (inputRefs.current[j]) inputRefs.current[j]!.value = d;
    });
    const last = Math.min(raw.length, 5);
    inputRefs.current[last]?.focus();
  }

  async function handleVerify() {
    if (!full || loading) return;
    setError('');
    setOk('');
    setLoading(true);
    try {
      const result = await apiPost<{ access_token: string }>(
        '/api/v1/auth/verify-pin', { pin: digits.join('') }
      );
      setOk('Correct — loading workspace…');
      setToken(result.access_token);
      navigate('/');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Incorrect PIN. Please try again.');
      setDigits(Array(6).fill(''));
      inputRefs.current.forEach((el) => { if (el) el.value = ''; });
      inputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="pin-shell">
      <div className="pin-card">
        <div className="pin-logo">SR</div>
        <h1 className="pin-title">Workspace PIN</h1>
        <p className="pin-sub">Enter the 6-digit PIN to access this workspace.</p>

        <div className="pin-row">
          {digits.map((d, i) => (
            <input
              key={i}
              type="password"
              inputMode="numeric"
              maxLength={1}
              className={`pin-box${d ? ' filled' : ''}`}
              ref={(el) => { inputRefs.current[i] = el; }}
              onChange={(e) => handleInput(i, e)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              onPaste={handlePaste}
              autoFocus={i === 0}
            />
          ))}
        </div>

        <button
          className="btn btn-navy"
          style={{ width: '100%', padding: '14px', fontSize: 15 }}
          onClick={handleVerify}
          disabled={!full || loading}
        >
          {loading ? 'Verifying…' : 'Unlock'}
        </button>

        {error && <p className="pin-err">{error}</p>}
        {ok    && <p className="pin-ok">{ok}</p>}

        <p className="pin-foot">
          Forgot PIN? Contact your workspace Owner to remove it.
        </p>
      </div>
    </div>
  );
}
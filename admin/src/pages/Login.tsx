import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAdminAuthStore } from '../store/adminAuthStore'
import { adminAuthApi } from '../services/api'

const FEATURES = [
  {
    title: 'Workspace oversight',
    sub: 'Manage plans, modules, trial states, and billing for every workspace on the platform.',
  },
  {
    title: 'Product observability',
    sub: 'API error rates, activation signals, ghost accounts, and trials expiring this week.',
  },
  {
    title: 'Full audit trail',
    sub: 'Every admin action is logged with actor, target, and before/after values.',
  },
]

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const { setAuth } = useAdminAuthStore()
  const navigate = useNavigate()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await adminAuthApi.login(email, password)
      setAuth(res.access_token, res.admin)
      navigate('/', { replace: true })
    } catch {
      setError('Invalid email or password.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="a-auth-shell">

      {/* Left panel */}
      <div className="a-auth-left">
        <div className="a-auth-left-brand">
          <img
            src="https://smartrisksheets.com/wp-content/uploads/2025/09/cropped-Smartrisksheets-favicon-v2.png"
            width="36"
            height="36"
            alt="SmartRisk"
            style={{ borderRadius: 8, flexShrink: 0 }}
          />
          <div>
            <div className="a-auth-brand-name">SmartRisk Pulse</div>
            <div className="a-auth-brand-sub">Admin Panel</div>
          </div>
        </div>

        <div className="a-auth-headline">
          Platform control,<br />
          <span>not product access.</span>
        </div>
        <p className="a-auth-left-sub">
          This panel is for the SmartRisk operations team only.
          Every action taken here is logged and attributed to your account.
        </p>

        <div className="a-auth-features">
          {FEATURES.map((f) => (
            <div key={f.title} className="a-auth-feature">
              <div className="a-auth-feature-dot" />
              <div>
                <div className="a-auth-feature-title">{f.title}</div>
                <div className="a-auth-feature-sub">{f.sub}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="a-auth-left-footer">
          <div>NDPC/DCP/12625 registered</div>
          <div>SmartRisk Sheets Technologies Limited &middot; RC 9170218</div>
        </div>
      </div>

      {/* Right panel */}
      <div className="a-auth-right">
        <div className="a-auth-form-wrap">
          <div className="a-auth-form-eyebrow">Secure access</div>
          <div className="a-auth-form-title">Sign in</div>
          <p className="a-auth-form-sub">
            Admin credentials only. Access is monitored and logged.
          </p>

          {error && (
            <div
              className="a-error-msg"
              style={{ textAlign: 'left', marginBottom: 16, fontSize: 13 }}
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="a-form-group">
              <label className="a-form-label">Email</label>
              <input
                className="a-input"
                type="email"
                autoComplete="email"
                placeholder="you@smartrisksheets.com"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(null) }}
                required
              />
            </div>

            <div className="a-form-group">
              <label className="a-form-label">Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  className="a-input"
                  type={showPwd ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="Your admin password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(null) }}
                  style={{ paddingRight: 40 }}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((v) => !v)}
                  style={{
                    position: 'absolute',
                    right: 12,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--muted)',
                    padding: 0,
                    display: 'flex',
                    alignItems: 'center',
                  }}
                  aria-label="Toggle password visibility"
                >
                  {showPwd ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/>
                      <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <button
              className="a-btn a-btn-primary"
              type="submit"
              disabled={loading}
              style={{ width: '100%', justifyContent: 'center', padding: '11px 16px', fontSize: 14, marginTop: 8 }}
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
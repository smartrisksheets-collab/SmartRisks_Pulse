import { useAuthStore } from '../store/authStore';
import { MAILTO_QUOTE, MAILTO_DEMO } from '../utils/constants';

export default function PlanExpired() {
  const claims = useAuthStore(s => s.claims);
  const logout = useAuthStore(s => s.logout);
  const isTrial = claims?.plan === 'TRIAL';

  function handleLogout() {
    logout();
    window.location.href = '/login';
  }

  return (
    <div className="expired-page">
      <div className="expired-wrap">
        <div className="expired-brand">
          <img
            src="https://smartrisksheets.com/wp-content/uploads/2025/09/cropped-Smartrisksheets-favicon-v2.png"
            width="36"
            height="36"
            alt="SmartRisk Pulse"
            style={{ borderRadius: 8, flexShrink: 0 }}
          />
          <span className="expired-brand-name">SmartRisk Pulse</span>
        </div>

        <span className="expired-badge">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          {isTrial ? 'Trial ended' : 'Plan expired'}
        </span>

        <div className="expired-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>

        <h1 className="expired-title">
          {isTrial ? 'Your free trial has ended' : 'Your workspace has expired'}
        </h1>
        <p className="expired-msg">
          {isTrial
            ? 'Your 14-day trial period is up. Your data is safe and preserved. Contact us to activate a plan and restore full access immediately.'
            : 'Your annual plan has lapsed. Your data is fully preserved. Contact us to renew and restore access.'}
        </p>

        <div className="expired-actions">
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
            <a href={MAILTO_QUOTE} className="btn btn-navy">Request a Quote</a>
            <a href={MAILTO_DEMO}  className="btn btn-secondary">Book a Custom Demo</a>
          </div>
          <button className="expired-logout" onClick={handleLogout}>
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
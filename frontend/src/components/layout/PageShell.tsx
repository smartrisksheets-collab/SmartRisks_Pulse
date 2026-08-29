import { type ReactNode, useState } from 'react';
import { useOfflineDetection } from '../../hooks/useOfflineDetection';
import { useLocation } from 'react-router-dom';
import { useUIStore } from '../../store/uiStore';
import { useAuth } from '../../hooks/useAuth';
import { useInactivityLogout } from '../../hooks/useInactivityLogout';

const ROUTE_META: Record<string, string> = {
  '/':            'Dashboard',
  '/risks':       'Risk Register',
  '/incidents':   'Incident Management',
  '/reports':     'Report Builder',
  '/frameworks':  'Frameworks',
  '/users':       'Users',
  '/audit':       'Audit Log',
  '/settings':    'Settings',
  '/help':        'Help',
};
import { useAuthStore } from '../../store/authStore';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import FeedbackWidget from './FeedbackWidget';

function trialDaysRemaining(trial_expires_at: string | null): number | null {
  if (!trial_expires_at) return null;
  const exp = new Date(trial_expires_at);
  if (isNaN(exp.getTime())) return null;
  return Math.ceil((exp.getTime() - Date.now()) / 86_400_000);
}

import { MAILTO_QUOTE, MAILTO_DEMO } from '../../utils/constants';

function TrialBanner() {
  const claims = useAuthStore(s => s.claims);
  const [dismissed, setDismissed] = useState(false);

  if (!claims || claims.plan !== 'TRIAL' || !claims.trial_expires_at) return null;

  const days = trialDaysRemaining(claims.trial_expires_at);
  if (days === null || days <= 0 || days > 7) return null;
  if (dismissed) return null;

  const isUrgent = days <= 2;
  const modClass = isUrgent ? 'trial-warn--red' : 'trial-warn--amber';
  const dayLabel = `${days} day${days === 1 ? '' : 's'}`;

  const msg = `Your trial expires in ${dayLabel}.`;
  const sub = isUrgent
    ? 'After expiry your workspace pauses. Data is preserved but access is suspended until a plan is activated.'
    : 'Contact us to activate a plan before your trial ends.';

  return (
    <div className={`trial-warn ${modClass}`}>
      <div className="trial-warn-content">
        <div className="trial-warn-msg">{msg}</div>
        <div className="trial-warn-sub">{sub}</div>
        <div className="trial-warn-actions">
          <a href={MAILTO_QUOTE} className="trial-warn-action">Request a Quote</a>
          <a href={MAILTO_DEMO}  className="trial-warn-action">Book a Custom Demo</a>
        </div>
      </div>
      <button
        className="trial-warn-dismiss"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss trial warning"
      >
        ✕
      </button>
    </div>
  );
}

interface PageShellProps {
  children: ReactNode;
  title?: string;
}

export default function PageShell({ children, title }: PageShellProps) {
  const location   = useLocation();
  const routeTitle = ROUTE_META[location.pathname] ?? title ?? 'SmartRisk';
  const { sidebarCollapsed, mobSidebarOpen } = useUIStore();
  const { logout } = useAuth();
  const { countdown, stayLoggedIn } = useInactivityLogout(logout);
  const isOffline = useOfflineDetection();

  const appClass = [
    'app',
    sidebarCollapsed ? 'sidebar-collapsed' : '',
    mobSidebarOpen   ? 'mob-open' : '',
  ].filter(Boolean).join(' ');

  return (
    <>
    {isOffline && (
      <div className="offline-banner">
        <div className="offline-banner-dot" />
        No internet connection. Changes may not be saved.
      </div>
    )}
    {countdown !== null && (
      <div className="inactivity-warn">
        <div className="inactivity-warn-circle">{countdown}</div>
        <div>
          <div className="inactivity-warn-text">Logging you out due to inactivity</div>
          <div className="inactivity-warn-sub">Any activity will keep you signed in</div>
        </div>
        <button className="inactivity-warn-btn" onClick={stayLoggedIn}>
          Stay signed in
        </button>
      </div>
    )}
    <FeedbackWidget />
    <div className={appClass}>
      <Sidebar />
      <div className="main">
        <Topbar title={routeTitle} />
        <div className="content">
          <TrialBanner />
          {children}
        </div>
      </div>
    </div>
    </>
  );
}
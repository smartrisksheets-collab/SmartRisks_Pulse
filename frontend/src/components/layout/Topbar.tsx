import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Moon, Sun, Monitor } from 'lucide-react';
import { useUIStore } from '../../store/uiStore';
import { useAuthStore } from '../../store/authStore';
import { useAuth } from '../../hooks/useAuth';
import { usePresence } from '../../hooks/usePresence';
import SetupStatusPanel from './SetupStatusPanel';
import { roleLabel } from '../../utils/roles';
import { useHome } from '../../hooks/useHome';
import { useProfile } from '../../services/profile';
import { PROFILE_NAME_FALLBACK } from '../../utils/constants';
import { SETUP_STATUS_LABEL } from '../../utils/setupSteps';
import { initialsOf } from '../home/links';
import AskPulse from '../help/AskPulse';

interface TopbarProps { title?: string; }

export default function Topbar({ title = 'Dashboard' }: TopbarProps) {
  const { setMobSidebarOpen, theme, setTheme } = useUIStore();
  const { claims, workspaces, workspaceQuota } = useAuthStore();
  const atLimit = workspaceQuota !== null && workspaceQuota.owned >= workspaceQuota.limit;
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [wsOpen,   setWsOpen]   = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const wsRef   = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onOut(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
      if (wsRef.current   && !wsRef.current.contains(e.target as Node))   setWsOpen(false);
    }
    document.addEventListener('mousedown', onOut);
    return () => document.removeEventListener('mousedown', onOut);
  }, []);

  const activeTenant = workspaces.find((w) => w.tenant_id === claims?.active_tenant_id);
  const tenantId     = claims?.active_tenant_id ?? '';
  const isTrial      = claims?.plan === 'TRIAL';

  const THEME_NEXT: Record<string, 'light' | 'dark' | 'auto'> = { light: 'dark', dark: 'auto', auto: 'light' };
  const THEME_LABEL: Record<string, string> = { light: 'Light', dark: 'Dark', auto: 'Auto' };
  const ThemeIcon = theme === 'dark' ? Moon : theme === 'auto' ? Monitor : Sun;

  // Presence
  const presenceEmails = usePresence(tenantId);
  const presenceShown  = presenceEmails.slice(0, 5);
  const presenceExtra  = presenceEmails.length - 5;

  // Setup status pill: the same steps and percent as Home, from GET /api/v1/home.
  // Opens only when clicked, and leaves the top bar once every step is done.
  const [setupOpen, setSetupOpen] = useState(false);
  const closeSetup = () => setSetupOpen(false);

  // The profile menu shows the account name only. The email is never rendered on screen.
  const { data: home } = useHome();
  const { data: me }   = useProfile();
  const profileName = me?.first_name || home?.first_name || PROFILE_NAME_FALLBACK;
  const initials    = initialsOf(me ? `${me.first_name} ${me.last_name}` : home?.first_name ?? claims?.email);
  const setup       = home?.setup;
  const showSetup   = !!setup && setup.total > 0 && setup.percent < 100;

  return (
    <>
    <div className="topbar">
      <div className="topbar-left">
        <button
          className="mob-menu-btn"
          onClick={() => setMobSidebarOpen(true)}
          aria-label="Open navigation"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="6" x2="21" y2="6"/>
            <line x1="3" y1="12" x2="21" y2="12"/>
            <line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>
        <div>
          <h1 className="page-title">{title}</h1>
          {activeTenant && <p className="crumbs">{activeTenant.name}</p>}
        </div>
      </div>

      <div className="topbar-right">
        {tenantId && presenceEmails.length > 0 && (
          <div className="presence-strip">
            <div className="presence-avatars">
              {presenceShown.map((email) => (
                <div key={email} className="sr-presence-avatar" title={email}>
                  {email.slice(0, 2).toUpperCase()}
                </div>
              ))}
            </div>
            <span className="presence-count">
              {presenceEmails.length === 1
                ? '1 active'
                : `${presenceEmails.length} active${presenceExtra > 0 ? ` (+${presenceExtra})` : ''}`}
            </span>
          </div>
        )}

        <AskPulse />

        <button
          className="topbar-theme-btn"
          onClick={() => setTheme(THEME_NEXT[theme])}
          title={`Theme: ${THEME_LABEL[theme]}`}
          aria-label={`Switch theme, current: ${THEME_LABEL[theme]}`}
        >
          <ThemeIcon size={15} />
        </button>
        {showSetup && setup && (
          <button
            type="button"
            className={`pl-status-pill${setupOpen ? ' pl-on' : ''}`}
            onClick={() => setSetupOpen(v => !v)}
            aria-expanded={setupOpen}
            aria-haspopup="dialog"
          >
            {SETUP_STATUS_LABEL} {setup.percent}%
            <span className="pl-bar" aria-hidden="true"><span style={{ ['--pl-fill' as string]: `${setup.percent}%` }} /></span>
          </button>
        )}

        {/* Workspace dropdown */}
        <div className="topbar-dd-wrap" ref={wsRef}>
          <button
            className="pl-btn pl-btn-secondary topbar-btn"
            onClick={() => setWsOpen((v) => !v)}
            aria-expanded={wsOpen}
          >
            Workspace
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
          {wsOpen && (
            <div className="topbar-dropdown">
              <span
                className="tooltip-wrap tooltip-wrap--inline"
                data-tip={
                  isTrial ? 'Trial plan. Upgrade.' :
                  workspaces.length <= 1 ? 'Only one workspace exists.' : undefined
                }
              >
                <button
                  className="topbar-dropdown-item"
                  disabled={isTrial || workspaces.length <= 1}
                  onClick={() => { setWsOpen(false); navigate('/workspaces'); }}
                >
                  Switch workspace
                </button>
              </span>
              <span
                className="tooltip-wrap tooltip-wrap--inline"
                data-tip={
                  isTrial ? 'Trial plan. Upgrade.' :
                  atLimit  ? `Workspace limit reached (${workspaceQuota!.owned} of ${workspaceQuota!.limit}).` :
                  undefined
                }
              >
                <button
                  className="topbar-dropdown-item"
                  disabled={isTrial || atLimit}
                  onClick={() => { setWsOpen(false); navigate('/workspaces/create'); }}
                >
                  + Add workspace
                </button>
              </span>
            </div>
          )}
        </div>

        <div className="topbar-dd-wrap" ref={menuRef}>
          <button className="topbar-user-btn" onClick={() => setMenuOpen((v) => !v)}>
            {me?.avatar_url
              ? <img className="topbar-avatar" src={me.avatar_url} alt="" />
              : <div className="topbar-avatar">{initials}</div>}
            <span>{roleLabel(claims?.role)}</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>

          {menuOpen && (
            <div className="topbar-dropdown">
              <div className="topbar-dropdown-email">{profileName}</div>
              <div className="topbar-dropdown-divider" />
              <button
                className="topbar-dropdown-item"
                onClick={() => { setMenuOpen(false); navigate('/profile'); }}
              >
                My profile
              </button>
              {claims?.permissions?.manage_settings && (
                <button
                  className="topbar-dropdown-item"
                  onClick={() => { setMenuOpen(false); navigate('/settings'); }}
                >
                  Settings
                </button>
              )}
              <div className="topbar-dropdown-divider" />
              <button className="topbar-dropdown-item danger" onClick={logout}>
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
    {setupOpen && showSetup && setup && <SetupStatusPanel setup={setup} permissions={claims?.permissions} onClose={closeSetup} />}
  </>
  );
}
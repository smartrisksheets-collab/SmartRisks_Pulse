import { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Moon, Sun, Monitor } from 'lucide-react';
import { useUIStore } from '../../store/uiStore';
import { useAuthStore } from '../../store/authStore';
import { useAuth } from '../../hooks/useAuth';
import { usePresence } from '../../hooks/usePresence';
import GetStartedDrawer from './GetStartedDrawer';

function computeGsPulse(tid: string): boolean {
  if (!tid) return false;
  try {
    const never    = localStorage.getItem(`gs_never_${tid}`) === '1';
    const raw      = JSON.parse(localStorage.getItem(`gs_steps_${tid}`) ?? '{}') as Record<string, boolean>;
    const complete = Object.values(raw).filter(Boolean).length >= 8;
    return !never && !complete;
  } catch { return false; }
}

interface TopbarProps { title?: string; }

export default function Topbar({ title = 'Dashboard' }: TopbarProps) {
  const { setMobSidebarOpen, theme, setTheme } = useUIStore();
  const { claims, workspaces } = useAuthStore();
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

  // Get Started
  const [gsOpen,        setGsOpen]        = useState(false);
  const [pulseVersion,  setPulseVersion]   = useState(0);
  const gsPulse = useMemo(() => computeGsPulse(tenantId), [tenantId, pulseVersion]);

  useEffect(() => {
    if (!tenantId) return;
    const never    = localStorage.getItem(`gs_never_${tenantId}`) === '1';
    const seen     = localStorage.getItem(`gs_seen_${tenantId}`) === '1';
    const raw      = JSON.parse(localStorage.getItem(`gs_steps_${tenantId}`) ?? '{}') as Record<string, boolean>;
    const complete = Object.values(raw).filter(Boolean).length >= 8;
    if (!never && !seen && !complete) {
      try { localStorage.setItem(`gs_seen_${tenantId}`, '1'); } catch { /* noop */ }
      setTimeout(() => setGsOpen(true), 1200);
    }
  }, [tenantId]);

  function handleGsClose() {
    setGsOpen(false);
    setPulseVersion((v) => v + 1);
  }
  const initials = claims?.email ? claims.email.slice(0, 2).toUpperCase() : '??';

  return (
    <>
    <div className="topbar">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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

        <button
          className="topbar-theme-btn"
          onClick={() => setTheme(THEME_NEXT[theme])}
          title={`Theme: ${THEME_LABEL[theme]}`}
          aria-label={`Switch theme, current: ${THEME_LABEL[theme]}`}
        >
          <ThemeIcon size={15} />
        </button>
        <button className="btn btn-secondary btn-compact" style={{ position: 'relative' }} onClick={() => setGsOpen(true)}>
          Get Started
          {gsPulse && <span className="gs-pulse" />}
        </button>

        {/* Workspace dropdown */}
        <div className="topbar-dd-wrap" ref={wsRef}>
          <button
            className="btn btn-secondary btn-compact"
            onClick={() => setWsOpen((v) => !v)}
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
                data-tip={isTrial ? 'Trial plan. Upgrade.' : undefined}
              >
                <button
                  className="topbar-dropdown-item"
                  disabled={isTrial}
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
            <div className="topbar-avatar">{initials}</div>
            <span>{claims?.role}</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>

          {menuOpen && (
            <div className="topbar-dropdown">
              <div className="topbar-dropdown-email">{claims?.email}</div>
              <div className="topbar-dropdown-divider" />
              <button
                className="topbar-dropdown-item"
                onClick={() => { setMenuOpen(false); navigate('/settings'); }}
              >
                Settings
              </button>
              <div className="topbar-dropdown-divider" />
              <button className="topbar-dropdown-item danger" onClick={logout}>
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
    <GetStartedDrawer key={tenantId} open={gsOpen} onClose={handleGsClose} tenantId={tenantId} />
  </>
  );
}
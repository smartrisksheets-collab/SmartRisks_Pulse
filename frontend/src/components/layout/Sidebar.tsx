import { useNavigate, useLocation } from 'react-router-dom';
import { useUIStore } from '../../store/uiStore';
import { useAuthStore } from '../../store/authStore';
import { useAuth } from '../../hooks/useAuth';
import { useSettings } from '../../hooks/useSettings';
import { useSettingsStore } from '../../store/settingsStore';
import { roleLabel } from '../../utils/roles';
// useCanDo not needed here — claims used directly in nav filter
import {
  LayoutDashboard, FileText, ShieldAlert,
  BarChart2, Grid2X2, Users, Settings, HelpCircle, ClipboardList,
  type LucideIcon,
} from 'lucide-react';

interface NavItem { label: string; path: string; Icon: LucideIcon; }

const NAV: NavItem[] = [
  { label: 'Dashboard',      path: '/',            Icon: LayoutDashboard },
  { label: 'Risk Register',  path: '/risks',       Icon: FileText        },
  { label: 'Incidents',      path: '/incidents',   Icon: ShieldAlert     },
  { label: 'Report Builder', path: '/reports',     Icon: BarChart2       },
  { label: 'Frameworks',     path: '/frameworks',  Icon: Grid2X2         },
  { label: 'Users',          path: '/users',       Icon: Users           },
  { label: 'Audit Log',      path: '/audit',       Icon: ClipboardList   },
  { label: 'Settings',       path: '/settings',    Icon: Settings        },
  { label: 'Help',           path: '/help',        Icon: HelpCircle      },
];

export default function Sidebar() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const { mobSidebarOpen, toggleSidebar, setMobSidebarOpen } = useUIStore();
  const { claims } = useAuthStore();

  const visibleNav = NAV.filter(({ path }) => {
    if (path === '/risks')     return (claims?.modules ?? []).includes('risk');
    if (path === '/incidents') return (claims?.modules ?? []).includes('incident');
    if (path === '/users')     return !!claims?.permissions?.manage_users;
    if (path === '/audit')     return !!claims?.permissions?.manage_settings;
    if (path === '/settings')  return !!claims?.permissions?.manage_settings;
    return true;
  });
  const { logout } = useAuth();
  // const canManageUsers    = useCanDo('manage_users');
  // const canManageSettings = useCanDo('manage_settings');

  const workspaceName = useAuthStore((s) =>
    s.workspaces.find((w) => w.tenant_id === s.claims?.active_tenant_id)?.name ?? 'SmartRisk'
  );
  const logoUrl = useSettingsStore((s) => s.logoUrl);
  const { query: settingsQuery } = useSettings();
  const industry = settingsQuery.data?.industry ?? '';

  function go(path: string) {
    navigate(path);
    setMobSidebarOpen(false);
  }

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    if (path === '/risks') return location.pathname === '/risks';
    return location.pathname.startsWith(path);
  };

  return (
    <>
      <div
        className={`sidebar-overlay${mobSidebarOpen ? ' show' : ''}`}
        onClick={() => setMobSidebarOpen(false)}
      />
      <nav className="sidebar">
        <button className="sidebar-toggle" onClick={toggleSidebar} aria-label="Toggle sidebar">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M7 2L3 6l4 4"
              stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>

        <div className="brand">
          <div className="brand-mark">
          {logoUrl
            ? <img src={logoUrl} alt={workspaceName} />
            : <div className="brand-mark-text">{workspaceName.charAt(0).toUpperCase()}</div>
          }
        </div>
          <div className="brand-info">
            <div className="brand-name">{workspaceName}</div>
            <div className="brand-sub">{industry}</div>
          </div>
        </div>

        <div className="nav">
          {visibleNav.map(({ path, label, Icon }) => (
            <button
              key={path}
              className={`nav-item${isActive(path) ? ' active' : ''}`}
              onClick={() => go(path)}
            >
              <span className="nav-ico"><Icon size={18} strokeWidth={2} /></span>
              <span className="nav-label">{label}</span>
            </button>
          ))}

        </div>

        <div className="sidebar-foot">
          <button className="btn-logout" onClick={logout}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>
            </svg>
            <span className="nav-label">Logout</span>
          </button>
          <div className="pill" style={{ overflow: 'hidden' }}>
            <div className="status-dot active" />
            <span style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {roleLabel(claims?.role) || 'Analyst'} · {claims?.plan ?? 'Trial'}
            </span>
          </div>
          <div className="sidebar-copy">
            SmartRisk Pulse © {new Date().getFullYear()}
          </div>
        </div>
      </nav>
    </>
  );
}
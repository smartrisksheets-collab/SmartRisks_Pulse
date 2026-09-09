import { NavLink } from 'react-router-dom'
import { useAdminAuthStore } from '../../store/adminAuthStore'

const NAV = [
  { label: 'Platform', items: [
    { to: '/', text: 'Overview' },
    { to: '/workspaces', text: 'Workspaces' },
    { to: '/users', text: 'Platform Users' },
  ]},
  { label: 'Observability', items: [
    { to: '/errors', text: 'API Errors' },
  ]},
  { label: 'Admin', items: [
    { to: '/admin-accounts', text: 'Admin Accounts' },
    { to: '/audit', text: 'Audit Log' },
  ]},
]

export default function Sidebar() {
  const { admin, clear } = useAdminAuthStore()

  return (
    <aside className="admin-sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-brand-name">SmartRisk</div>
        <div className="sidebar-brand-sub">Admin Panel</div>
      </div>

      <nav className="sidebar-nav">
        {NAV.map((section) => (
          <div key={section.label}>
            <div className="sidebar-nav-label">{section.label}</div>
            {section.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  `sidebar-nav-item${isActive ? ' active' : ''}`
                }
              >
                {item.text}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-admin-name">{admin?.name}</div>
        <div className="sidebar-admin-role">{admin?.role === 'super_admin' ? 'Super Admin' : 'Admin'}</div>
        <button
          className="a-btn a-btn-ghost a-mt-8"
          style={{ width: '100%', fontSize: '12px', padding: '6px 12px' }}
          onClick={clear}
        >
          Sign out
        </button>
      </div>
    </aside>
  )
}
import { useEffect } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAdminAuthStore } from '../../store/adminAuthStore'
import { adminAuthApi } from '../../services/api'
import Sidebar from './Sidebar'

const PAGE_TITLES: Record<string, string> = {
  '/':                   'Platform Overview',
  '/workspaces':         'Workspaces',
  '/platform-users':     'Platform Users',
  '/errors':             'API Errors',
  '/admin-accounts':     'Admin Accounts',
  '/audit-log':          'Audit Log',
}

export default function Shell() {
  const { token, admin, clear } = useAdminAuthStore()
  const location = useLocation()

  useEffect(() => {
    if (!token) return
    adminAuthApi.me().catch(() => {
      clear()
    })
  }, [token, clear])

  if (!token) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  const pageTitle = PAGE_TITLES[location.pathname] ?? 'Admin Panel'

  return (
    <div className="admin-shell">
      <Sidebar />
      <main className="admin-main">
        <div className="admin-topbar">
          <div className="admin-topbar-title">{pageTitle}</div>
          {admin && (
            <div className="admin-topbar-user">
              <span className="admin-topbar-name">{admin.name}</span>
              <span className="admin-topbar-role">{admin.role === 'super_admin' ? 'Super Admin' : 'Admin'}</span>
            </div>
          )}
        </div>
        <div className="admin-content">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
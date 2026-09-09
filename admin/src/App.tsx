import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import Shell from './components/layout/Shell'
import Login from './pages/Login'

const Overview        = lazy(() => import('./pages/Overview'))
const Workspaces      = lazy(() => import('./pages/Workspaces'))
const PlatformUsers   = lazy(() => import('./pages/PlatformUsers'))
const ApiErrors       = lazy(() => import('./pages/ApiErrors'))
const AdminAccounts   = lazy(() => import('./pages/AdminAccounts'))
const AuditLog        = lazy(() => import('./pages/AuditLog'))

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={null}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<Shell />}>
            <Route index element={<Overview />} />
            <Route path="workspaces" element={<Workspaces />} />
            <Route path="users" element={<PlatformUsers />} />
            <Route path="errors" element={<ApiErrors />} />
            <Route path="admin-accounts" element={<AdminAccounts />} />
            <Route path="audit" element={<AuditLog />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
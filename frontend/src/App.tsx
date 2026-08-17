import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from './store/authStore';
import type { Permissions } from './types/auth';
import type { ModuleKey } from './types/api';
import { ToastProvider } from './components/layout/Toast';

// ── Eager: shell, auth flow, and the two most-visited app pages ──────────
import NotFound       from './pages/NotFound';
import PageShell      from './components/layout/PageShell';
import Login          from './pages/Login';
import Register       from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword  from './pages/ResetPassword';
import WorkspacePicker from './pages/WorkspacePicker';
import VerifyPin      from './pages/VerifyPin';
import CreateWorkspace from './pages/CreateWorkspace';
import AcceptInvite   from './pages/AcceptInvite';
import PlanExpired    from './pages/PlanExpired';
import Dashboard      from './pages/Dashboard';
import RiskRegister   from './pages/RiskRegister';
import Incidents      from './pages/Incidents';

// ── Lazy: heavy or infrequently visited pages ─────────────────────────────
const ReportBuilder    = lazy(() => import('./pages/ReportBuilder'));
const Settings         = lazy(() => import('./pages/Settings'));
const Frameworks       = lazy(() => import('./pages/Frameworks'));
const Help             = lazy(() => import('./pages/Help'));
const AuditLog         = lazy(() => import('./pages/AuditLog'));
const Users            = lazy(() => import('./pages/Users'));
const ExternalRisk     = lazy(() => import('./pages/ExternalRisk'));
const ExternalIncident = lazy(() => import('./pages/ExternalIncident'));

function PageLoader() {
  return (
    <div className="page-loader">
      <div className="sr-spinner" />
    </div>
  );
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { token, claims } = useAuthStore();
  const location = useLocation();
  if (!token) return <Navigate to="/login" state={{ from: location }} replace />;
  if (claims?.pending_tenant_id && !claims?.active_tenant_id) return <Navigate to="/verify-pin" replace />;
  if (!claims?.active_tenant_id) return <Navigate to="/workspaces" replace />;
  return <>{children}</>;
}

function RequirePermission({ permission, children }: { permission: keyof Permissions; children: React.ReactNode }) {
  const claims = useAuthStore(s => s.claims);
  if (!claims?.permissions?.[permission]) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function RequireModule({ module: mod, children }: { module: ModuleKey; children: React.ReactNode }) {
  const claims = useAuthStore(s => s.claims);
  if (!(claims?.modules ?? []).includes(mod)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function RequireToken({ children }: { children: React.ReactNode }) {
  const { token, claims } = useAuthStore();
  if (!token) return <Navigate to="/login" replace />;
  if (claims?.pending_tenant_id && !claims?.active_tenant_id) return <Navigate to="/verify-pin" replace />;
  return <>{children}</>;
}

// function Placeholder({ title }: { title: string }) {
//   return (
//     <div className="card">
//       <div className="card-title">{title}</div>
//       <p className="muted small" style={{ marginTop: 8 }}>Coming in a future phase.</p>
//     </div>
//   );
// }

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login"           element={<Login />} />
          <Route path="/register"        element={<Register />} />
          <Route path="/forgot-password"      element={<ForgotPassword />} />
          <Route path="/reset-password"       element={<ResetPassword />} />
          <Route path="/external/risk"     element={<Suspense fallback={<PageLoader />}><ExternalRisk /></Suspense>} />
          <Route path="/external/incident" element={<Suspense fallback={<PageLoader />}><ExternalIncident /></Suspense>} />
          <Route path="/accept-invite"        element={<AcceptInvite />} />

          <Route path="/expired"    element={<PlanExpired />} />
          <Route path="/verify-pin" element={<VerifyPin />} />
          <Route path="/workspaces" element={
            <RequireToken><WorkspacePicker /></RequireToken>
          } />

          <Route path="/workspaces/create" element={
            <RequireToken><CreateWorkspace /></RequireToken>
          } />

          <Route path="/*" element={
            <RequireAuth>
              <PageShell>
                <Suspense fallback={<PageLoader />}>
                  <Routes>
                    <Route path="/"          element={<Dashboard />} />
                    <Route path="/risks"     element={<RequireModule module="risk"><RiskRegister /></RequireModule>} />
                    <Route path="/incidents" element={<RequireModule module="incident"><Incidents /></RequireModule>} />
                    <Route path="/reports"   element={<ReportBuilder />} />
                    <Route path="/audit"     element={<RequirePermission permission="manage_settings"><AuditLog /></RequirePermission>} />
                    <Route path="/users"     element={<RequirePermission permission="manage_users"><Users /></RequirePermission>} />
                    <Route path="/settings"   element={<RequirePermission permission="manage_settings"><Settings /></RequirePermission>} />
                    <Route path="/frameworks" element={<Frameworks />} />
                    <Route path="/help"       element={<Help />} />
                    <Route path="*"           element={<NotFound />} />
                  </Routes>
                </Suspense>
              </PageShell>
            </RequireAuth>
          } />
        </Routes>
      </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}
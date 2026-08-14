import { useEffect, useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { useDashboard } from '../hooks/useDashboard';
import RiskSection from '../components/dashboard/RiskSection';
import IncidentSection from '../components/dashboard/IncidentSection';
import UnifiedSection from '../components/dashboard/UnifiedSection';

// ── Live "Updated X ago" — mirrors GAS _renderLastUpdated() ─────────────────
// TanStack Query exposes dataUpdatedAt: the exact ms timestamp of the last
// successful fetch. We derive a relative label from it and tick every 60s.

function timeAgo(ts: number): string {
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1) return 'Updated just now';
  if (mins < 60) return `Updated ${mins}m ago`;
  return `Updated ${Math.floor(mins / 60)}h ago`;
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function DashSkeleton() {
  return (
    <div className="dash-section">
      <div className="rs-grid-top">
        {[1, 2, 3].map(i => (
          <div key={i} className="im-card" style={{ minHeight: 220 }}>
            <div className="dash-skeleton" style={{ height: 12, width: '45%', borderRadius: 4, marginBottom: 14 }} />
            <div className="dash-skeleton" style={{ height: 140, borderRadius: 8, marginBottom: 12 }} />
            <div className="dash-skeleton" style={{ height: 10, width: '70%', borderRadius: 4, marginBottom: 6 }} />
            <div className="dash-skeleton" style={{ height: 10, width: '55%', borderRadius: 4 }} />
          </div>
        ))}
      </div>
      <div className="dash-grid-2">
        {[1, 2].map(i => (
          <div key={i} className="im-card" style={{ minHeight: 260 }}>
            <div className="dash-skeleton" style={{ height: 12, width: '40%', borderRadius: 4, marginBottom: 14 }} />
            <div className="dash-skeleton" style={{ height: 180, borderRadius: 8 }} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const claims = useAuthStore(s => s.claims);
  const modules    = claims?.modules ?? [];
  const hasRisk    = modules.includes('risk');
  const hasIncident = modules.includes('incident');
  const isUnified  = hasRisk && hasIncident;

  const { data, isLoading, isError, isFetching, dataUpdatedAt } = useDashboard();

  // Live ticker — re-derives the label every 60s from the fixed dataUpdatedAt stamp
  const [updatedLabel, setUpdatedLabel] = useState(() =>
    dataUpdatedAt ? timeAgo(dataUpdatedAt) : ''
  );
  useEffect(() => {
    if (!dataUpdatedAt) return;
    const t = setInterval(() => setUpdatedLabel(timeAgo(dataUpdatedAt)), 60000);
    return () => clearInterval(t);
  }, [dataUpdatedAt]);

  // Welcome name: workspace name from active tenant, fallback to email username
  const activeTenant = claims?.workspaces?.find(w => w.tenant_id === claims.active_tenant_id);
  const displayName  = activeTenant?.name ?? claims?.email?.split('@')[0] ?? 'there';

  return (
    <div>
      {/* ── Top strip: welcome + live updated label
          Mirrors GAS #srDashBar layout:
          left = welcome, right = updated label + (no refresh button in v2 —
          query invalidation on every write handles freshness automatically) ── */}
      <div className="dash-topbar">
        <div className="dash-welcome">Welcome, {displayName} ✨</div>
        <div className="dash-topbar-right">
          {isFetching && (
            <span className="dash-refresh">
              <span className="dash-refresh-ico">↻</span>
              Refreshing
            </span>
          )}
          <span className="dash-updated">{updatedLabel}</span>
        </div>
      </div>

      {/* Content */}
      {isLoading && <DashSkeleton />}

      {isError && !isLoading && (
        <div className="dash-empty" style={{ padding: '40px 0' }}>
          Failed to load dashboard data. Navigate away and back, or check your connection.
        </div>
      )}

      {data && !isLoading && (
        <>
          {isUnified   && <UnifiedSection  data={data} />}
          {hasRisk     && !isUnified && <RiskSection     data={data} />}
          {hasIncident && !isUnified && <IncidentSection data={data} />}
          {!hasRisk && !hasIncident && (
            <div className="dash-empty" style={{ padding: '40px 0' }}>
              No module access configured for this workspace.
            </div>
          )}
        </>
      )}
    </div>
  );
}
// src/pages/Analytics.tsx
// The detail behind the dashboard figures, in five tabs. The tab lives in the
// URL hash (/analytics#correlation), so other pages can link to one section.

import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';
import { useSettingsStore } from '../store/settingsStore';
import { useDashboard } from '../hooks/useDashboard';
import { useCanDo } from '../utils/permissions';
import { getIncidentStats } from '../services/incidents';
import type { IncidentStats } from '../types/incident';
import OverviewTab, { type TabKey } from '../components/analytics/OverviewTab';
import CorrelationTab from '../components/analytics/CorrelationTab';
import TrendsTab from '../components/analytics/TrendsTab';
import IncidentsTab from '../components/analytics/IncidentsTab';
import ActivityTab from '../components/analytics/ActivityTab';

const LABELS: Record<TabKey, string> = {
  overview: 'Overview',
  correlation: 'Correlation',
  trends: 'Trends',
  incidents: 'Incidents',
  activity: 'Activity',
};

function updatedText(ts: number, now: number): string {
  const mins = Math.floor((now - ts) / 60000);
  if (mins < 1) return 'Figures updated just now';
  if (mins < 60) return `Figures updated ${mins} min ago`;
  return `Figures updated ${Math.floor(mins / 60)} h ago`;
}

export default function Analytics() {
  const claims = useAuthStore(s => s.claims);
  const modules = claims?.modules ?? [];
  const hasRisk = modules.includes('risk');
  const hasIncident = modules.includes('incident');
  const currency = useSettingsStore(s => s.currency);
  const canManageRisks = useCanDo('manage_risks');
  const canLinkIncidents = useCanDo('review_resolve');
  const showAuditLink = !!claims?.permissions?.manage_settings;
  const navigate = useNavigate();
  const location = useLocation();

  const { data, isLoading, isError, isFetching, dataUpdatedAt } = useDashboard();
  const statsQuery = useQuery<IncidentStats>({
    queryKey: ['incidents', 'stats'],
    queryFn: getIncidentStats,
    staleTime: 2 * 60 * 1000,
    enabled: hasIncident,
  });

  const tabs: TabKey[] = [
    ...(hasRisk ? (['overview'] as const) : []),
    ...(hasRisk && hasIncident ? (['correlation'] as const) : []),
    ...(hasRisk || hasIncident ? (['trends'] as const) : []),
    ...(hasIncident ? (['incidents'] as const) : []),
    ...(hasRisk || hasIncident ? (['activity'] as const) : []),
  ];
  const fromHash = location.hash.replace('#', '') as TabKey;
  const tab: TabKey | undefined = tabs.includes(fromHash) ? fromHash : tabs[0];
  const go = (t: TabKey) => navigate({ hash: t });
  const open = (path: string) => navigate(path);

  // Ticks once a minute so the "updated" label stays current between fetches.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);
  const updated = dataUpdatedAt ? updatedText(dataUpdatedAt, Math.max(now, dataUpdatedAt)) : '';

  useEffect(() => { window.scrollTo({ top: 0 }); }, [tab]);

  if (tabs.length === 0) {
    return <div className="pl-app pl-an-page"><p className="pl-note">No module access is configured for this workspace.</p></div>;
  }

  const badge = (t: TabKey): string | null => {
    if (!data) return null;
    if (t === 'correlation' && data.correlation.incidents_unlinked > 0) return `${data.correlation.incidents_unlinked} unlinked`;
    if (t === 'trends' && hasRisk && data.snapshot_delta.has_data && data.snapshot_delta.avg_residual) {
      const d = data.snapshot_delta.avg_residual;
      return `Residual ${d > 0 ? 'up' : 'down'} ${Math.abs(d).toFixed(1)}%`;
    }
    if (t === 'incidents' && statsQuery.data) return `${statsQuery.data.totals.open_count} open`;
    return null;
  };

  return (
    <div className="pl-app pl-an-page">
      <div className="pl-an-head">
        <p className="pl-intro">The detail behind the dashboard figures.</p>
        <span className="pl-meta" aria-live="polite">{isFetching ? 'Refreshing…' : updated}</span>
      </div>

      <nav className="pl-tabs" aria-label="Analytics sections">
        {tabs.map(t => {
          const b = badge(t);
          return (
            <a
              key={t}
              href={`#${t}`}
              className={`pl-tab${t === tab ? ' pl-on' : ''}`}
              aria-current={t === tab ? 'page' : undefined}
              onClick={e => { e.preventDefault(); go(t); }}
            >
              {LABELS[t]}
              {b && <span className="pl-tag">{b}</span>}
            </a>
          );
        })}
      </nav>

      {isLoading && <p className="pl-caption">Loading figures…</p>}
      {isError && !isLoading && (
        <p className="pl-note pl-alert">The figures could not be loaded. Navigate away and back, or check your connection.</p>
      )}

      {data && !isLoading && (
        <>
          {tab === 'overview' && <OverviewTab data={data} currency={currency} tabs={tabs} go={go} />}
          {tab === 'correlation' && (
            <CorrelationTab data={data} canManageRisks={canManageRisks} canLinkIncidents={canLinkIncidents} open={open} />
          )}
          {tab === 'trends' && (
            <TrendsTab
              data={data}
              hasRisk={hasRisk}
              hasIncident={hasIncident}
              goCorrelation={tabs.includes('correlation') ? () => go('correlation') : null}
            />
          )}
          {tab === 'incidents' && (
            <IncidentsTab
              stats={statsQuery.data}
              isLoading={statsQuery.isLoading}
              uncovered={hasRisk ? data.correlation.uncovered_categories : []}
              currency={currency}
              goCorrelation={tabs.includes('correlation') ? () => go('correlation') : null}
            />
          )}
          {tab === 'activity' && (
            <ActivityTab data={data} hasRisk={hasRisk} hasIncident={hasIncident} showAuditLink={showAuditLink} open={open} />
          )}
        </>
      )}
    </div>
  );
}

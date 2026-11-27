// src/pages/Home.tsx
// The 60-second view: verdict, four tiles, what to do next, where the risk sits,
// the executive brief and recent activity. A new workspace sees the setup view instead.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useHome } from '../hooks/useHome';
import { useSettings } from '../hooks/useSettings';
import { useCanDo } from '../utils/permissions';
import { healthChip } from '../components/analytics/format';
import type { HealthStatus } from '../types/dashboard';
import SkyHero from '../components/home/SkyHero';
import { NextActions, RecentActivity, Tiles, WhereLists } from '../components/home/HomeSections';
import BriefCard from '../components/home/BriefCard';
import Tour from '../components/home/Tour';
import SetupView from '../components/home/SetupView';
import { TOUR_STEPS, incidentPath, initialsOf, localDateLine, riskPath } from '../components/home/links';
import { useProfile } from '../services/profile';
import { SETUP_STATUS_LABEL } from '../utils/setupSteps';

// The verdict sentence comes from the backend as "<workspace name> is <status>. ...".
// The hero reads it as "<organization>'s risk posture is <status>." with the opening in bold.
// Organization comes from Settings and falls back to the workspace name when it is blank.
function Verdict({ verdict, workspace, org, status }: { verdict: string; workspace: string; org: string; status: string }) {
  const head = `${workspace} is ${status}.`;
  if (!status || !verdict.startsWith(head)) {
    const text = workspace && verdict.startsWith(workspace) ? org + verdict.slice(workspace.length) : verdict;
    return <p className="pl-hero-text">{text}</p>;
  }
  return (
    <p className="pl-hero-text">
      <strong>
        {org}'s risk posture is <span className={`pl-chip ${healthChip(status as HealthStatus)} pl-hero-chip`}>{status}</span>.
      </strong>
      {verdict.slice(head.length)}
    </p>
  );
}

export default function Home() {
  const claims = useAuthStore(s => s.claims);
  const modules = claims?.modules ?? [];
  const hasRisk = modules.includes('risk');
  const hasIncident = modules.includes('incident');
  const canGenerate = useCanDo('generate_ai');
  const canSeeAudit = useCanDo('manage_settings');
  const { data, isLoading, isError, refetch } = useHome();
  const { data: me } = useProfile();
  const { query: settingsQuery } = useSettings();

  const [tour, setTour] = useState(-1);
  const closeTour = () => setTour(-1);

  if (isLoading) {
    return <div className="pl-app pl-an-page"><p className="pl-caption" role="status">Loading your Home…</p></div>;
  }
  if (isError || !data) {
    return (
      <div className="pl-app pl-an-page">
        <p className="pl-note pl-alert" role="alert">
          Home could not be loaded.{' '}
          <button type="button" className="pl-btn pl-btn-secondary pl-btn-sm" onClick={() => refetch()}>Try again</button>
        </p>
      </div>
    );
  }

  // Part of day and date come from the backend in the workspace time zone (Settings),
  // not the viewer's device clock. Home refetches every 5 minutes, so they stay current.
  const part = data.day_part;
  const greeting = data.first_name ? `Good ${part}, ${data.first_name}` : `Good ${part}`;
  const dateLine = localDateLine(data.local_date);
  // Same initials and photo as the top bar (My profile).
  const initials = initialsOf(me ? `${me.first_name} ${me.last_name}` : data.first_name ?? claims?.email);

  if (data.setup.first_run) {
    const { percent: pct, done_count: doneCount, total } = data.setup;
    return (
      <div className="pl-app pl-an-page">
        <SkyHero part={part} initials={initials} photoUrl={me?.avatar_url} dateLine={dateLine} greeting={greeting}>
          <p className="pl-hero-text">
            Welcome to Pulse. This page becomes your 60-second view of {data.workspace} once your
            {hasRisk && hasIncident ? ' risks and incidents are' : hasRisk ? ' risks are' : ' incidents are'} in.
            A few steps get you there.
          </p>
          <div className="pl-stack-xs pl-hero-progress">
            <div className="pl-an-head pl-hero-text-s"><span>{SETUP_STATUS_LABEL} · {doneCount} of {total} done</span><span className="pl-num">{pct}%</span></div>
            <span className="pl-bar pl-hero-track" aria-hidden="true"><span style={{ ['--pl-fill' as string]: `${pct}%` }} /></span>
          </div>
          <div className="pl-inline">
            <a className="pl-btn pl-btn-primary" href="#sec-setup">Continue setup</a>
          </div>
        </SkyHero>
        <SetupView
          workspace={data.workspace}
          setup={data.setup}
          hasRisk={hasRisk}
          hasIncident={hasIncident}
          workspaceId={claims?.active_tenant_id ?? ''}
        />
      </div>
    );
  }

  const showBrief = hasRisk && hasIncident;
  const steps = TOUR_STEPS.filter(s =>
    (s.id !== 'sec-actions' || hasRisk) && (s.id !== 'sec-brief' || showBrief));
  const onStep = (id: string) => tour >= 0 && steps[tour]?.id === id;
  const focusPath = data.focus
    ? (data.focus.kind === 'risk' ? riskPath(data.focus.id) : incidentPath(data.focus.id))
    : null;

  return (
    <div className="pl-app pl-an-page">
      <SkyHero part={part} initials={initials} photoUrl={me?.avatar_url} dateLine={dateLine} greeting={greeting} tourOn={onStep('sec-verdict')}>
        <Verdict
          verdict={data.verdict}
          workspace={data.workspace}
          org={settingsQuery.data?.organization?.trim() || data.workspace}
          status={data.status}
        />
        <div className="pl-inline">
          <button type="button" className="pl-btn pl-btn-primary" onClick={() => setTour(0)}>
            <Compass size={16} aria-hidden="true" />Take the 60-second tour
          </button>
          {data.focus && focusPath && (
            <Link className="pl-btn pl-btn-secondary" to={focusPath}>
              Open {data.focus.kind} {data.focus.id}
            </Link>
          )}
        </div>
      </SkyHero>

      <Tiles data={data} hasRisk={hasRisk} hasIncident={hasIncident} tourOn={onStep('sec-kpis')} />
      {hasRisk && <NextActions data={data} tourOn={onStep('sec-actions')} />}
      <WhereLists data={data} hasRisk={hasRisk} hasIncident={hasIncident} tourOn={onStep('sec-where')} />

      <div className="pl-card-grid">
        {showBrief && (
          <BriefCard stored={data.brief} confidence={data.confidence} canGenerate={canGenerate} tourOn={onStep('sec-brief')} />
        )}
        <RecentActivity data={data} showAuditLink={canSeeAudit} />
      </div>

      {tour >= 0 && steps[tour] && <Tour steps={steps} index={tour} onGo={setTour} onClose={closeTour} />}
    </div>
  );
}

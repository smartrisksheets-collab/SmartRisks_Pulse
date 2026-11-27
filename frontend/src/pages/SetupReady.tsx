// src/pages/SetupReady.tsx
// Shown once after the setup wizard: what was saved, anything that failed
// (with Try again), and one main next step. Setup status comes from GET /api/v1/home.

import { useRef, useState, type ChangeEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { SrLogo } from '../components/layout/SrLogo';
import { useAuthStore } from '../store/authStore';
import { useHome } from '../hooks/useHome';
import { apiPatch } from '../services/api';
import { uploadLogo } from '../services/settings';
import { isSetupReadyState, type SetupReadyState } from '../types/setup';
import { SETUP_STATUS_LABEL } from '../utils/setupSteps';

const errorText = (err: unknown, fallback: string): string =>
  err instanceof Error && err.message ? err.message : fallback;

function SavedRow({ title, text }: { title: string; text: string }) {
  return (
    <div className="pl-left-row pl-is-done">
      <span className="pl-setup-dot" aria-hidden="true"><Check size={13} strokeWidth={3} /></span>
      <div className="pl-left-body">
        <p className="pl-item-title">{title}</p>
        <p className="pl-body-s">{text}</p>
      </div>
    </div>
  );
}

export default function SetupReady() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const modules = useAuthStore(s => s.claims?.modules) ?? [];
  const canAddRisk = useAuthStore(s => s.claims?.permissions?.manage_risks === true);
  const { data: home } = useHome();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const raw: unknown = location.state;
  // Opened directly or after the state was lost: there is nothing to report, so go Home.
  if (!isSetupReadyState(raw)) return <Navigate to="/" replace />;
  const state: SetupReadyState = raw;

  const hasRisk = modules.includes('risk');
  const hasIncident = modules.includes('incident');
  const setup = home?.setup;
  const greet = home?.first_name ? `, ${home.first_name}` : '';

  // Keep the latest result in the route state, so a reload shows the same screen.
  const save = (next: SetupReadyState) => navigate('/workspaces/ready', { replace: true, state: next });

  async function retryLogo(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const { logo_url } = await uploadLogo(file);
      await apiPatch('/api/v1/settings', { logo_url });
      save({ ...state, logo: 'saved', logoError: '' });
      queryClient.invalidateQueries();
    } catch (err: unknown) {
      save({ ...state, logo: 'failed', logoError: errorText(err, 'Your logo could not be uploaded.') });
    } finally {
      setBusy(false);
    }
  }

  const workspaceLine = [state.workspace, state.organisation].filter(Boolean).join(' · ');
  const logoLine = state.logo === 'saved' ? ' · logo uploaded' : '';

  return (
    <div className="pl-ready-page pl-app">
      <div className="pl-ready-card pl-stack">
        <SrLogo size={40} />
        <div className="pl-stack-xs">
          <span className="pl-chip pl-ok">Setup done</span>
          <h1 className="pl-section">{state.workspace} is ready{greet}.</h1>
          <p className="pl-intro">Your Home switches on as soon as your first {hasRisk ? 'risks are' : 'incidents are'} in.</p>
        </div>

        {setup && (
          <div className="pl-stack-xs">
            <div className="pl-an-head pl-body-s">
              <span>{SETUP_STATUS_LABEL} · {setup.done_count} of {setup.total} done</span>
              <span className="pl-num">{setup.percent}%</span>
            </div>
            <span className="pl-bar" aria-hidden="true"><span style={{ ['--pl-fill' as string]: `${setup.percent}%` }} /></span>
          </div>
        )}

        <section className="pl-card pl-stack-xs" aria-label="What we saved">
          <h2 className="pl-label">What we saved</h2>
          <div className="pl-stack-0">
            <SavedRow title="Workspace" text={`${workspaceLine}${logoLine}`} />
            {hasRisk && (
              <SavedRow
                title="Risk matrix and categories"
                text={`SmartRisk default matrix · ${state.categories.join(', ')}`}
              />
            )}
            {hasRisk && (
              <SavedRow
                title="Appetite"
                text={state.appetiteSkipped || state.appetiteSaved === 0
                  ? 'Skipped for now. Set it in Settings, Risk Appetite, in line with your board approved risk appetite.'
                  : `Thresholds set for ${state.appetiteSaved === 1 ? '1 category' : `all ${state.appetiteSaved} categories`}`}
              />
            )}
          </div>

          {state.logo === 'failed' && (
            <div className="pl-note pl-alert pl-stack-xs" role="alert">
              <p className="pl-item-title">Your logo did not upload</p>
              <p className="pl-body-s">{state.logoError} Everything else is saved.</p>
              <button
                type="button"
                className="pl-btn pl-btn-secondary pl-btn-sm pl-self-start"
                disabled={busy}
                onClick={() => fileRef.current?.click()}
              >
                {busy ? 'Uploading…' : 'Try again'}
              </button>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={retryLogo} />
            </div>
          )}
        </section>

        <section className="pl-stack-xs" aria-label="Your next step">
          <h2 className="pl-label">Your next step</h2>
          {hasRisk && canAddRisk ? (
            <div className="pl-ready-next pl-stack-xs">
              <p className="pl-item-title">Add your first risk</p>
              <p className="pl-body-s">Your Health score and appetite check start working as soon as it is in.</p>
              <div className="pl-inline">
                <Link className="pl-btn pl-btn-primary" to="/risks?new=1">Add your first risk</Link>
                <Link className="pl-btn pl-btn-secondary" to="/risks">Import a spreadsheet</Link>
                {hasIncident && <Link className="pl-btn pl-btn-secondary" to="/incidents">Log an incident</Link>}
              </div>
            </div>
          ) : hasIncident ? (
            <div className="pl-ready-next pl-stack-xs">
              <p className="pl-item-title">Log your first incident</p>
              <p className="pl-body-s">Open incidents show on your Home straight away.</p>
              <div className="pl-inline">
                <Link className="pl-btn pl-btn-primary" to="/incidents">Log an incident</Link>
              </div>
            </div>
          ) : null}
          <Link className="pl-self-start" to="/">Go to my Home first</Link>
        </section>
      </div>
    </div>
  );
}

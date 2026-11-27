// src/components/home/SetupView.tsx
// First-time Home: shown until the workspace has a risk or an incident.
// Each step is ticked from what the workspace really holds (GET /api/v1/home setup flags).

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import type { HomeSetup } from '../../types/home';
import { useAuthStore } from '../../store/authStore';
import { SETUP_ADMIN_NOTE, SETUP_STATUS_LABEL, SETUP_STEP_COPY } from '../../utils/setupSteps';
import { MAILTO_DEMO } from '../../utils/constants';
import IncidentExternalLinkModal from '../incidents/IncidentExternalLinkModal';

interface Cta { label: string; to?: string; onClick?: () => void }

export default function SetupView({ workspace, setup, hasRisk, hasIncident, workspaceId }: {
  workspace: string;
  setup: HomeSetup;
  hasRisk: boolean;
  hasIncident: boolean;
  workspaceId: string;
}) {
  const [showIncLink, setShowIncLink] = useState(false);
  const permissions = useAuthStore(s => s.claims?.permissions);

  // Steps and their done flags come from the backend, in order, for this workspace's modules.
  const defs = setup.steps.map(st => {
    const copy = SETUP_STEP_COPY[st.key];
    const allowed = copy.perm === null || permissions?.[copy.perm] === true;
    const cta: Cta | undefined = allowed && copy.cta ? copy.cta : undefined;
    const alt: Cta | undefined = !allowed || !copy.alt
      ? undefined
      : copy.incidentLinkAlt
        ? { label: copy.alt.label, onClick: () => setShowIncLink(true) }
        : copy.alt;
    return {
      key: st.key,
      done: st.done,
      title: copy.title,
      text: st.key === 'workspace' ? `${workspace} is set up.` : copy.text,
      doneNote: copy.doneNote,
      cta,
      alt,
      note: allowed ? undefined : SETUP_ADMIN_NOTE,
    };
  });

  const nextKey = defs.find(d => !d.done)?.key;

  const tiles = [
    ...(hasRisk ? [
      { label: 'Health score', ready: setup.matrix && setup.risks, needs: 'Needs categories and scored risks' },
      { label: 'Outside appetite', ready: setup.appetite && setup.risks, needs: 'Needs appetite and risks' },
    ] : []),
    ...(hasIncident ? [{ label: 'Open incidents', ready: setup.incidents, needs: 'Needs your incident log' }] : []),
    ...(hasRisk ? [{ label: 'Open actions', ready: setup.risks, needs: 'Needs risks on the register' }] : []),
  ];

  const button = (c: Cta, primary: boolean) => {
    const cls = `pl-btn ${primary ? 'pl-btn-primary' : 'pl-btn-secondary'}`;
    return c.to
      ? <Link key={c.label} to={c.to} className={cls}>{c.label}</Link>
      : <button key={c.label} type="button" className={cls} onClick={c.onClick}>{c.label}</button>;
  };

  return (
    <>
      <div className="pl-setup-wrap">
        <section id="sec-setup" className="pl-card pl-stack-xs pl-setup-main" aria-label="Setup checklist">
          <div className="pl-stack-xs pl-home-list-head">
            <h2 className="pl-section">Get {workspace} ready</h2>
            <p className="pl-intro">The same list as {SETUP_STATUS_LABEL} in the top bar. Each step switches on part of your Home.</p>
          </div>
          {defs.map((d, i) => {
            const isNext = d.key === nextKey;
            return (
              <div key={d.key} className={`pl-setup-step${isNext ? ' pl-is-cur' : ''}${d.done ? ' pl-is-done' : ''}`}>
                <span className="pl-setup-dot" aria-hidden="true">{d.done ? <Check size={15} strokeWidth={3} /> : i + 1}</span>
                <div className="pl-home-act-body">
                  <p className="pl-item-title">{d.title}<span className="sr-only">{d.done ? ' (done)' : ''}</span></p>
                  <p className="pl-body-s">{d.text}</p>
                  {d.done ? (
                    <p className="pl-done">{d.doneNote}</p>
                  ) : (
                    <>
                      {(d.cta || d.alt) && (
                        <div className="pl-inline pl-home-tags">
                          {d.cta && button(d.cta, isNext)}
                          {d.alt && button(d.alt, false)}
                        </div>
                      )}
                      {d.note && <p className="pl-caption">{d.note}</p>}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </section>

        <div className="pl-stack pl-setup-side">
          <section className="pl-card pl-stack-xs" aria-label="What your Home will show">
            <h2 className="pl-label">Your Home after setup</h2>
            <p className="pl-body-s">Four numbers an executive can read in seconds. They switch on as you finish each step.</p>
            <div className="pl-setup-tiles">
              {tiles.map(t => (
                <div key={t.label} className={`pl-setup-tile${t.ready ? ' pl-on' : ''}`}>
                  <span className="pl-label">{t.label}</span>
                  <span className={`pl-chip ${t.ready ? 'pl-ok' : 'pl-sev-l'}`}>{t.ready ? 'Ready' : 'Waiting'}</span>
                  <span className="pl-caption">{t.ready ? 'Live on your Home' : t.needs}</span>
                </div>
              ))}
            </div>
          </section>
          <section className="pl-brief" aria-label="Help">
            <h2 className="pl-label pl-brief-label">Prefer a guided start?</h2>
            <p className="pl-brief-p">Book a walkthrough and the SmartRisk team will set up your matrix and first risks with you.</p>
            <a className="pl-btn pl-btn-primary pl-self-start" href={MAILTO_DEMO}>Book a walkthrough</a>
          </section>
        </div>
      </div>
      {showIncLink && <IncidentExternalLinkModal workspaceId={workspaceId} onClose={() => setShowIncLink(false)} />}
    </>
  );
}

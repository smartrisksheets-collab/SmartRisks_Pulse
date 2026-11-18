// src/components/home/SetupView.tsx
// First-time Home: shown until the workspace has a risk or an incident.
// Each step is ticked from what the workspace really holds (GET /api/v1/home setup flags).

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import type { HomeSetup } from '../../types/home';
import { MAILTO_DEMO } from '../../utils/constants';
import IncidentExternalLinkModal from '../incidents/IncidentExternalLinkModal';

interface Cta { label: string; to?: string; onClick?: () => void }
interface StepDef { key: string; title: string; text: string; done: boolean; doneNote: string; cta?: Cta; alt?: Cta; note?: string }

export default function SetupView({ workspace, setup, hasRisk, hasIncident, perms, workspaceId }: {
  workspace: string;
  setup: HomeSetup;
  hasRisk: boolean;
  hasIncident: boolean;
  perms: { settings: boolean; risks: boolean; users: boolean };
  workspaceId: string;
}) {
  const [showIncLink, setShowIncLink] = useState(false);
  const adminNote = 'Your workspace admin does this step.';

  const defs: StepDef[] = [
    { key: 'ws', title: 'Create your workspace', text: `${workspace} is set up.`, done: true, doneNote: 'Done' },
    ...(hasRisk ? [{
      key: 'matrix', title: 'Set your risk matrix and appetite',
      text: 'Pick the SmartRisk default scale or your own, then set how much risk each category can carry.',
      done: setup.appetite, doneNote: 'Appetite saved',
      cta: perms.settings ? { label: 'Open risk settings', to: '/settings?tab=appetite' } : undefined,
      note: perms.settings ? undefined : adminNote,
    }, {
      key: 'risks', title: 'Add your first risks',
      text: 'Type them in yourself, or share a submission link so departments can send risks without logging in.',
      done: setup.risks, doneNote: 'Risks added to the register',
      cta: perms.risks ? { label: 'Add a risk', to: '/risks?new=1' } : undefined,
      alt: perms.risks ? { label: 'Share submission link', to: '/risks/submission-links' } : undefined,
      note: perms.risks ? undefined : adminNote,
    }] : []),
    ...(hasIncident ? [{
      key: 'incidents', title: 'Record incidents',
      text: 'Log an incident, or share the external link so staff can report one as it happens.',
      done: setup.incidents, doneNote: 'Incident log started',
      cta: { label: 'Log an incident', to: '/incidents' },
      alt: { label: 'Share incident link', onClick: () => setShowIncLink(true) },
    }] : []),
    {
      key: 'team', title: 'Invite your risk owners',
      text: 'Actions on Home go to named owners, so add the people who own each risk.',
      done: setup.team, doneNote: 'Team members added',
      cta: perms.users ? { label: 'Invite people', to: '/users' } : undefined,
      note: perms.users ? undefined : adminNote,
    },
  ];

  const nextKey = defs.find(d => !d.done)?.key;

  const tiles = [
    ...(hasRisk ? [
      { label: 'Health score', ready: setup.appetite && setup.risks, needs: 'Needs a matrix and scored risks' },
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
            <p className="pl-intro">Do these in order. Each one switches on part of your Home.</p>
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

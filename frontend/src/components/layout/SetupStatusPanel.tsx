// src/components/layout/SetupStatusPanel.tsx
// "What's left": opened from the Setup status pill in the top bar.
// Same steps and percent as the Home setup view (GET /api/v1/home setup).

import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Check, X } from 'lucide-react';
import type { HomeSetup } from '../../types/home';
import type { Permissions } from '../../types/auth';
import { SETUP_ADMIN_NOTE, SETUP_STATUS_LABEL, SETUP_STEP_COPY } from '../../utils/setupSteps';

export default function SetupStatusPanel({ setup, permissions, onClose }: {
  setup: HomeSetup;
  permissions: Permissions | undefined;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  // Held in a ref so a top bar re-render (Home refetches every 5 minutes)
  // does not move focus back to the close button.
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCloseRef.current(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const left = setup.steps.filter(st => !st.done);
  const done = setup.steps.filter(st => st.done);
  const nextKey = left[0]?.key;
  const stepNumber = (key: string) => setup.steps.findIndex(st => st.key === key) + 1;

  return (
    <>
      <div className="pl-panel-overlay" onClick={onClose} />
      <aside className="pl-panel pl-app" role="dialog" aria-modal="true" aria-label="What's left">
        <div className="pl-panel-head">
          <div className="pl-inline">
            <h2 className="pl-section">What's left</h2>
            <button ref={closeRef} type="button" className="pl-icon-btn pl-push" aria-label="Close" onClick={onClose}>
              <X size={16} aria-hidden="true" />
            </button>
          </div>
          <div className="pl-stack-xs">
            <div className="pl-an-head pl-body-s">
              <span>{SETUP_STATUS_LABEL} · {setup.done_count} of {setup.total} done</span>
              <span className="pl-num">{setup.percent}%</span>
            </div>
            <span className="pl-bar" aria-hidden="true"><span style={{ ['--pl-fill' as string]: `${setup.percent}%` }} /></span>
            <p className="pl-caption">
              {left.length === 1 ? '1 step left.' : `${left.length} steps left.`} Pulse works fully once these are done.
            </p>
          </div>
        </div>

        <div className="pl-panel-body">
          {left.length > 0 && <h3 className="pl-label">To finish setup</h3>}
          <div className="pl-stack-0">
            {left.map(st => {
              const copy = SETUP_STEP_COPY[st.key];
              const allowed = copy.perm === null || permissions?.[copy.perm] === true;
              const isNext = st.key === nextKey;
              return (
                <div key={st.key} className={`pl-left-row${isNext ? ' pl-is-cur' : ''}`}>
                  <span className="pl-setup-dot" aria-hidden="true">{stepNumber(st.key)}</span>
                  <div className="pl-left-body">
                    <p className="pl-item-title">{copy.title}</p>
                    {copy.unlocks && <p className="pl-caption">{copy.unlocks}</p>}
                    {!allowed && <p className="pl-caption">{SETUP_ADMIN_NOTE}</p>}
                  </div>
                  {allowed && copy.cta && (
                    <Link
                      to={copy.cta.to}
                      className={`pl-btn pl-btn-sm ${isNext ? 'pl-btn-primary' : 'pl-btn-secondary'}`}
                      onClick={onClose}
                    >
                      {copy.go}
                    </Link>
                  )}
                </div>
              );
            })}
          </div>

          {done.length > 0 && <h3 className="pl-label">Done</h3>}
          <div className="pl-stack-0">
            {done.map(st => (
              <div key={st.key} className="pl-left-row pl-is-done">
                <span className="pl-setup-dot" aria-hidden="true"><Check size={13} strokeWidth={3} /></span>
                <div className="pl-left-body">
                  <p className="pl-item-title">
                    {SETUP_STEP_COPY[st.key].title}<span className="sr-only"> (done)</span>
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="pl-panel-foot">
          <p className="pl-caption">
            {SETUP_STATUS_LABEL} leaves the top bar once every step is done.
          </p>
        </div>
      </aside>
    </>
  );
}

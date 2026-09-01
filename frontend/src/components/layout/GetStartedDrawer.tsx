import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const TOTAL_STEPS = 7;

interface StepDef {
  id: number;
  title: string;
  desc: string;
  goLabel: string;
  goTo: string;
}

const STEPS: StepDef[] = [
  { id: 1, title: 'Explore your Dashboard',
    desc: 'Get familiar with your live risk exposure index, residual trends, top risk drivers, and operational intelligence feed.',
    goLabel: 'Go to Dashboard →', goTo: '/' },

  { id: 2, title: 'Set up your Risk Config',
    desc: 'Define your departments and risk owners, risk categories, and treatment options. This is the foundation everything else builds on.',
    goLabel: 'Go to Risk Config →', goTo: '/settings?tab=tax' },

  { id: 3, title: 'Customise your Risk Matrix',
    desc: 'The 5-band default matrix is ready to use. If your organisation uses a 3 or 4-band model, or custom labels, configure it now in Settings, Risk Matrix.',
    goLabel: 'Go to Risk Matrix →', goTo: '/settings?tab=matrix' },

  { id: 4, title: 'Set your Risk Appetite',
    desc: 'Define the thresholds that determine what level of risk is acceptable before escalation or treatment is triggered.',
    goLabel: 'Go to Risk Appetite →', goTo: '/settings?tab=appetite' },

  { id: 5, title: 'Add your first risk',
    desc: 'Log a risk in the Risk Register with a description, likelihood, impact, and treatment plan.',
    goLabel: 'Go to Risk Register →', goTo: '/risks' },

  { id: 6, title: 'Import existing risks',
    desc: 'Already have risks in a spreadsheet? Import them in bulk via CSV or XLSX using the Import button on the Risk Register.',
    goLabel: 'Import Risks →', goTo: '/risks' },

  { id: 7, title: 'Print your first Executive Report',
    desc: 'Generate a formatted PDF risk report ready for board or management review from the Report Builder.',
    goLabel: 'Go to Report Builder →', goTo: '/reports' },
];

interface StepRowProps {
  step: StepDef;
  done: boolean;
  onToggle: (id: number) => void;
  onGo: (path: string) => void;
}

function StepRow({ step, done, onToggle, onGo }: StepRowProps) {
  return (
    <div
      className={`gs-step${done ? ' gs-done' : ''}`}
      onClick={() => onToggle(step.id)}
    >
      <div className="gs-step-left">
        <div className="gs-check">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
      </div>
      <div className="gs-step-body">
        <div className="gs-step-title">{step.title}</div>
        <div className="gs-step-desc">{step.desc}</div>
        <button
          className="gs-go-btn"
          onClick={(e) => { e.stopPropagation(); onGo(step.goTo); }}
        >
          {step.goLabel}
        </button>
      </div>
    </div>
  );
}

interface GetStartedDrawerProps {
  open: boolean;
  onClose: () => void;
  tenantId: string;
}

export default function GetStartedDrawer({ open, onClose, tenantId }: GetStartedDrawerProps) {
  const navigate = useNavigate();
  const lsKey   = `gs_steps_${tenantId}`;
  const lsNever = `gs_never_${tenantId}`;

  const [state, setState] = useState<Record<number, boolean>>(() => {
    if (!tenantId) return {};
    try { return JSON.parse(localStorage.getItem(`gs_steps_${tenantId}`) ?? '{}') as Record<number, boolean>; }
    catch { return {}; }
  });

  function save(next: Record<number, boolean>) {
    setState(next);
    try { localStorage.setItem(lsKey, JSON.stringify(next)); } catch { /* noop */ }
  }

  function toggle(id: number) {
    save({ ...state, [id]: !state[id] });
  }

  function goTo(path: string) {
    onClose();
    navigate(path);
  }

  function handleNeverShow() {
    try { localStorage.setItem(lsNever, '1'); } catch { /* noop */ }
    onClose();
  }

  function handleReset() {
    save({});
  }

  const doneCount = Object.values(state).filter(Boolean).length;
  const pct       = Math.round((doneCount / TOTAL_STEPS) * 100);

  return (
    <>
      {open && <div className="srs-backdrop" onClick={onClose} />}
      <aside
        className={`srs-drawer${open ? ' open' : ''}`}
        aria-hidden={!open}
        style={{ width: 'min(420px, 92vw)' }}
      >
        <div className="srs-drawer-hd">
          <div className="srs-title-row">
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--accent)' }}>Get Started</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Follow these steps to set up your workspace</div>
            </div>
            <button className="srs-icon-btn" onClick={onClose} title="Close">✕</button>
          </div>
        </div>

        <div className="srs-drawer-bd" style={{ padding: 16 }}>
          <div className="gs-progress-wrap">
            <div className="gs-progress-hd">
              <span className="gs-progress-label">{doneCount} of {TOTAL_STEPS} complete</span>
              <span className="gs-progress-pct">{pct}%</span>
            </div>
            <div className="gs-progress-track">
              <div
                className="gs-progress-fill"
                style={{ '--gs-pct': `${pct}%` } as React.CSSProperties}
              />
            </div>
          </div>

          <div className="gs-list">
            {STEPS.map((step) => (
              <StepRow
                key={step.id}
                step={step}
                done={!!state[step.id]}
                onToggle={toggle}
                onGo={goTo}
              />
            ))}
          </div>
        </div>

        <div className="srs-drawer-ft" style={{ justifyContent: 'space-between' }}>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>Click any step to mark it complete</span>
          <div className="gs-foot-links">
            <button className="gs-foot-link" onClick={handleNeverShow}>Never show again</button>
            <button className="gs-foot-link" onClick={handleReset}>Reset</button>
          </div>
        </div>
      </aside>
    </>
  );
}
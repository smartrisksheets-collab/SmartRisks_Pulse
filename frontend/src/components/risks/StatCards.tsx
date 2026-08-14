// src/components/risks/StatCards.tsx

import type { RiskStats } from '../../types/risk';

interface Props {
  stats:   RiskStats | null;
  loading: boolean;
}

function gaugeColor(pct: number): string {
  if (pct < 30) return '#01b88e';
  if (pct < 55) return '#f59e0b';
  if (pct < 75) return '#ef4444';
  return '#b91c1c';
}

export default function StatCards({ stats, loading }: Props) {
  if (loading || !stats) {
    return (
      <div className="sr-top-strip">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="sr-card" style={{ minHeight: 130, opacity: .5 }}>
            <div className="sr-card-head"><span className="sr-label">Loading…</span></div>
          </div>
        ))}
      </div>
    );
  }

  const { exposure_index: ei, risk_volume: rv, concentration, top_owner, control_signal: cs } = stats;
  const highPct = rv.total > 0 ? Math.round((rv.high_critical / rv.total) * 100) : 0;
  const color   = gaugeColor(ei.pct);

  return (
    <div className="sr-top-strip">

      {/* Card 1: Exposure Index */}
      <div className="sr-card sr-accent-emerald">
        <div className="sr-card-head">
          <span className="sr-label">RISK EXPOSURE INDEX</span>
        </div>
        <div className="sr-main-col">
          <div
            className="sr-gauge"
            style={{ '--val': ei.pct } as React.CSSProperties}
          >
            <svg viewBox="0 0 120 120">
              <circle className="g-bg" cx="60" cy="60" r="50" />
              <circle className="g-val" cx="60" cy="60" r="50" style={{ stroke: color }} />
            </svg>
            <div className="g-center">
              <span style={{ fontSize: 18, fontWeight: 900, color: '#1F2854' }}>{ei.pct}%</span>
            </div>
          </div>
          <div className="sr-meta-center">
            <div className="sr-big-soft">{ei.label}</div>
            <div className="sr-sub">Residual-weighted across {ei.total} active risks</div>
          </div>
        </div>
      </div>

      {/* Card 2: Risk Volume */}
      <div className="sr-card sr-accent-navy">
        <div className="sr-card-head">
          <span className="sr-label">Risk Volume</span>
          <span className="sr-delta flat">Live</span>
        </div>
        <div className="sr-big">{rv.total}</div>
        <div className="sr-sub">Active risks in register</div>
        <div className="sr-divider" />
        <div className="sr-row">
          <span className="sr-sub">High / Critical</span>
          <strong>{rv.high_critical}</strong>
        </div>
        <div className="sr-progress">
          <div className="sr-progress-bar" style={{ width: `${highPct}%` }} />
        </div>
      </div>

      {/* Card 3: Risk Concentration */}
      <div className="sr-card sr-accent-amber">
        <div className="sr-card-head">
          <span className="sr-label">Risk Concentration</span>
        </div>
        <div className="sr-list">
          {concentration.map(item => (
            <div key={item.name} className="sr-list-row">
              <span className="sr-sub">{item.name}</span>
              <div className="sr-list-right">
                <strong>{item.count}</strong>
              </div>
            </div>
          ))}
          {concentration.length === 0 && (
            <span className="sr-sub">No data</span>
          )}
        </div>
        <div className="sr-divider" />
        <div className="sr-section-title">Top Owner by Residual</div>
        <div className="sr-row">
          <span className="sr-sub">{top_owner?.name ?? '—'}</span>
          <strong>{top_owner?.score ?? '—'}</strong>
        </div>
      </div>

      {/* Card 4: Control Signal */}
      <div className="sr-card sr-accent-teal">
        <div className="sr-card-head">
          <span className="sr-label">Control Signal</span>
        </div>
        <div className="sr-split">
          <div className="sr-split-block">
            <div className="sr-split-label">Control Strength</div>
            <div className="sr-split-value">{cs.eff_pct}%</div>
          </div>
          <div className="sr-split-divider" />
          <div className="sr-split-block">
            <div className="sr-split-label">Avg Residual</div>
            <div className="sr-split-value">{cs.avg_residual}</div>
          </div>
        </div>
        <div className={`sr-intel ${cs.signal_class}`}>{cs.signal_msg}</div>
      </div>

    </div>
  );
}
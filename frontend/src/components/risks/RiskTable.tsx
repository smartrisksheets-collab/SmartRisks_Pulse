// src/components/risks/RiskTable.tsx

import { useState } from 'react';
import type { Risk } from '../../types/risk';
import type { AppetiteThreshold } from '../../types/settings';
import { formatDate, formatExposure } from '../../utils/format';
import { freshnessClass } from '../../utils/scoring';
import { useSettingsStore } from '../../store/settingsStore';


const _FRESH_META: Record<string, { label: string; sub: string; color: string }> = {
  Fresh:       { label: 'FRESH',       sub: 'Reviewed recently. Risk data is current.',              color: '#059669' },
  Aging:       { label: 'AGING',       sub: 'Review overdue. Data may be becoming outdated.',        color: '#b45309' },
  Stale:       { label: 'STALE',       sub: 'Not reviewed in a long time. Treat with caution.',      color: '#dc2626' },
  Unevidenced: { label: 'UNEVIDENCED', sub: 'No review date on record for this risk.',               color: '#475569' },
};

function FreshTip({ risk, x, y }: { risk: Risk; x: number; y: number }) {
  const f    = risk.freshness as string;
  const meta = _FRESH_META[f] ?? _FRESH_META['Unevidenced'];
  return (
    <div className={`fresh-tip ${f.toLowerCase()}`} style={{ top: y - 8, left: x + 16 }}>
      <div className="fresh-tip-title" style={{ color: meta.color }}>{meta.label}</div>
      <div className="fresh-tip-sub">{meta.sub}</div>
      <div className="fresh-tip-row">
        <span className="fresh-tip-lbl">Last reviewed</span>
        <span className={`fresh-tip-val${risk.last_reviewed_at ? ' accent' : ''}`}>
          {risk.last_reviewed_at ? formatDate(risk.last_reviewed_at) : 'Not recorded'}
        </span>
      </div>
    </div>
  );
}

function HoverTip({ title, sub, rows, x, y }: {
  title: string;
  sub:   string;
  rows?: { label: string; value: string; accent?: boolean }[];
  x: number;
  y: number;
}) {
  return (
    <div className="fresh-tip unevidenced" style={{ top: y - 8, left: x + 16 }}>
      <div className="fresh-tip-title" style={{ color: '#1F2854' }}>{title}</div>
      <div className="fresh-tip-sub">{sub}</div>
      {rows?.map((row, i) => (
        <div className="fresh-tip-row" key={i}>
          <span className="fresh-tip-lbl">{row.label}</span>
          <span className={`fresh-tip-val${row.accent ? ' accent' : ''}`}>{row.value}</span>
        </div>
      ))}
    </div>
  );
}

interface Props {
  risks:        Risk[];
  loading:      boolean;
  onView:       (r: Risk) => void;
  onEdit:       (r: Risk) => void;
  flashId?:     string | null;
  aiFlashIds?:  Set<string>;
  selectedIds:  Set<string>;
  onToggle:     (id: string) => void;
  onToggleAll:  () => void;
  appetites?:   AppetiteThreshold[];
}

// Index-based badge class
function levelBadgeClass(index: number | null): string {
  const map: Record<number, string> = { 5: 'extreme', 4: 'vhigh', 3: 'high', 2: 'med', 1: 'low' };
  return map[index ?? 1] ?? 'low';
}

// Appetite status: compares residual against category threshold
function appetiteStatus(
  residual: number | null,
  threshold: number | null
): 'within' | 'near' | 'exceeds' | 'unset' {
  if (residual == null || threshold == null) return 'unset';
  if (residual > threshold)        return 'exceeds';
  if (residual > threshold * 0.75) return 'near';
  return 'within';
}

// Days since a risk was logged with no linked decision
function decisionDays(loggedAt: string | null | undefined): number {
  if (!loggedAt) return 0;
  return Math.floor((Date.now() - new Date(loggedAt).getTime()) / 86_400_000);
}

const APT_PILL_CLS: Record<string, string> = {
  within:  'apt-pill apt-pill-within',
  near:    'apt-pill apt-pill-near',
  exceeds: 'apt-pill apt-pill-exceeds',
};

const APT_LABELS: Record<string, string> = {
  within: 'Within', near: 'Near', exceeds: 'Exceeds',
};



export default function RiskTable({ risks, loading, onView, onEdit, flashId, aiFlashIds, selectedIds, onToggle, onToggleAll, appetites }: Props) {
  const [freshTip,  setFreshTip]  = useState<{ risk: Risk; x: number; y: number } | null>(null);
  const [hoverTip,  setHoverTip]  = useState<{ title: string; sub: string; rows?: { label: string; value: string; accent?: boolean }[]; x: number; y: number } | null>(null);
  const currency = useSettingsStore(s => s.currency);

  if (loading && !risks.length) {
    return (
      <div className="table-wrap">
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', fontSize: 13 }}>Loading risks...</div>
      </div>
    );
  }

  if (!risks.length) {
    return (
      <div className="table-wrap">
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', fontSize: 13 }}>
          No risks found. Add your first risk to get started.
        </div>
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th style={{ width: 36 }} onClick={e => e.stopPropagation()}>
              <input
                type="checkbox"
                checked={risks.length > 0 && risks.every(r => selectedIds.has(r.id))}
                onChange={onToggleAll}
                title="Select all on this page"
              />
            </th>
            <th style={{ width: 90 }}>Risk ID</th>
            <th style={{ width: 110 }}>Date Logged</th>
            <th>Description</th>
            <th style={{ width: 130 }}>Dept/Risk Owner</th>
            <th style={{ width: 140 }}>Business Impact</th>
            <th style={{ width: 70, textAlign: 'center' }}>Severity</th>
            <th style={{ width: 90 }}>Level</th>
            <th style={{ width: 80, textAlign: 'center' }}>Residual</th>
            <th style={{ width: 120 }}>Estimate</th>
            <th style={{ width: 100, background: 'rgba(1,184,142,.06)' }}>Appetite</th>
            <th style={{ width: 120 }}>Decision</th>
          </tr>
        </thead>
        <tbody id="riskBody">
          {risks.map(r => {

            return (
              <tr
                key={r.id}
                data-riskid={r.id}
                className={`tr-clickable${flashId === r.id || (aiFlashIds?.has(r.id) ?? false) ? ' row-flash' : ''}`}
                onClick={() => onView(r)}
              >
                {/* Checkbox */}
                <td onClick={e => e.stopPropagation()} style={{ textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(r.id)}
                    onChange={() => onToggle(r.id)}
                  />
                </td>
                {/* Risk ID + control effectiveness prompt */}
                <td>
                  <span style={{ fontWeight: 700, color: '#1F2854', fontSize: 13 }}>{r.id}</span>
                  <br />
                  {(r.control_effectiveness === null) && (
                    <span
                      role="button"
                      onClick={(e) => { e.stopPropagation(); onEdit(r); }}
                      style={{
                        fontSize: 10, fontWeight: 700, padding: '2px 7px',
                        borderRadius: 4, cursor: 'pointer', marginTop: 2,
                        display: 'inline-block',
                        background: 'rgba(245,158,11,.12)',
                        border: '1px solid rgba(245,158,11,.30)',
                        color: '#78450c',
                      }}
                      title="Control effectiveness not set — click to edit"
                    >
                      Set Controls
                    </span>
                  )}
                </td>

                {/* Date Logged */}
                <td className="date-col" style={{ fontSize: 12, color: '' }}>
                  {formatDate(r.logged_at)}
                </td>

                {/* Description */}
                <td className="risk-desc-cell">
                  <span className="risk-desc-text" style={{ color: 'var(--muted)' }} title={r.description ?? ''}>
                    {r.description ?? '—'}
                  </span>
                </td>

                {/* Owner */}
                <td style={{ fontSize: 12, color: 'var(--muted)' }}>{r.owner ?? '—'}</td>

                {/* Business Impact */}
                <td className="risk-impact-cell" style={{ fontSize: 12, color: 'var(--muted)' }}>
                  {r.primary_impact
                    ? <span className="risk-impact-text" title={r.primary_impact}>{r.primary_impact}</span>
                    : <span className="not-est">Not entered</span>}
                </td>

                {/* Severity */}
                <td style={{ textAlign: 'center', fontWeight: 700 }}>{r.severity ?? '—'}</td>

                {/* Level badge */}
                <td>
                  <span className={`badge ${levelBadgeClass(r.level_index)}`}>{r.level ?? '—'}</span>
                </td>

                {/* Residual + freshness */}
                <td
                  style={{ textAlign: 'center', fontWeight: 700 }}
                  onMouseMove={r.freshness ? (e) => setFreshTip({ risk: r, x: e.clientX, y: e.clientY }) : undefined}
                  onMouseLeave={r.freshness ? () => setFreshTip(null) : undefined}
                >
                  {r.residual != null ? Math.round(r.residual) : '—'}
                  {r.freshness && (
                    <div style={{ marginTop: 4 }}>
                      <span className={`freshness ${freshnessClass(r.freshness)}`}>
                        {r.freshness}
                      </span>
                    </div>
                  )}
                </td>

                {/* Financial Exposure */}
                <td style={{ fontSize: 12, color: 'var(--muted)' }}>
                  {r.financial_exposure
                    ? formatExposure(r.financial_exposure, currency)
                    : <span className="not-est">Not estimated</span>}
                </td>

                {/* Appetite */}
                <td style={{ background: 'rgba(1,184,142,.04)' }}>
                  {(() => {
                    const rec    = (appetites ?? []).find(
                      a => a.category.trim().toLowerCase() === (r.category ?? '').trim().toLowerCase()
                    );
                    const status = appetiteStatus(r.residual, rec?.threshold ?? null);
                    if (status === 'unset') return (
                      <span
                        className="apt-pill apt-pill-unset"
                        onMouseMove={(e) => setHoverTip({ title: 'NO THRESHOLD', sub: 'Visit settings to configure an appetite threshold for this category.', x: e.clientX, y: e.clientY })}
                        onMouseLeave={() => setHoverTip(null)}
                      >
                        No threshold
                      </span>
                    );
                    return <span className={APT_PILL_CLS[status]}>{APT_LABELS[status]}</span>;
                  })()}
                </td>

                {/* Decision Required */}
                <td>
                  {r.linked_decision
                    ? <span className="dec-linked">Linked</span>
                    : (
                      <div
                        className="dec-warn"
                        style={{ position: 'relative' }}
                        onMouseMove={(e) => setHoverTip({ title: 'DECISION PENDING', sub: 'This risk has no linked governance decision.', rows: [{ label: 'Days open', value: `${decisionDays(r.logged_at)}d`, accent: true }], x: e.clientX, y: e.clientY })}
                        onMouseLeave={() => setHoverTip(null)}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#b9762a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                          <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                        </svg>
                        <span className="dec-days">{decisionDays(r.logged_at)}d</span>
                      </div>
                    )
                  }
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {freshTip  && <FreshTip  risk={freshTip.risk} x={freshTip.x}  y={freshTip.y} />}
      {hoverTip  && <HoverTip  title={hoverTip.title} sub={hoverTip.sub} rows={hoverTip.rows} x={hoverTip.x} y={hoverTip.y} />}
    </div>
  );
}
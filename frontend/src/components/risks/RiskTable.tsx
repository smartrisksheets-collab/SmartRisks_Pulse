// src/components/risks/RiskTable.tsx

// import { useState } from 'react';
import type { Risk } from '../../types/risk';
import type { AppetiteThreshold } from '../../types/settings';
import { formatDate, formatExposure } from '../../utils/format';
import { useSettingsStore } from '../../store/settingsStore';


interface Props {
  risks:        Risk[];
  loading:      boolean;
  onView:       (r: Risk) => void;
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



export default function RiskTable({ risks, loading, onView, flashId, aiFlashIds, selectedIds, onToggle, onToggleAll, appetites }: Props) {
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
            <th style={{ width: 120 }}>Financial Exposure</th>
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
                {/* Risk ID + source badge */}
                <td>
                  <span style={{ fontWeight: 900, color: '#01b88e', fontSize: 13 }}>{r.id}</span>
                  <br />
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '2px 8px',
                    borderRadius: 4,
                    background: r.source === 'external' ? 'rgba(1,184,142,.15)' : '#dbeafe',
                    color: r.source === 'external' ? '#01b88e' : '#1d4ed8',
                    display: 'inline-block', marginTop: 2,
                  }}>
                    {r.source === 'external' ? 'External' : 'Internal'}
                  </span>
                </td>

                {/* Date Logged */}
                <td className="date-col" style={{ fontSize: 12, fontWeight: 700 }}>
                  {formatDate(r.logged_at)}
                </td>

                {/* Description */}
                <td className="risk-desc-cell">
                  <span className="risk-desc-text" style={{ fontWeight: 700 }} title={r.description ?? ''}>
                    {r.description ?? '—'}
                  </span>
                </td>

                {/* Owner */}
                <td style={{ fontSize: 12, fontWeight: 700 }}>{r.owner ?? '—'}</td>

                {/* Business Impact */}
                <td style={{ fontSize: 12, fontWeight: 700 }}>
                  {r.primary_impact ?? <span className="not-est">Not entered</span>}
                </td>

                {/* Severity */}
                <td style={{ textAlign: 'center', fontWeight: 700 }}>{r.severity ?? '—'}</td>

                {/* Level badge */}
                <td>
                  <span className={`badge ${levelBadgeClass(r.level_index)}`}>{r.level ?? '—'}</span>
                </td>

                {/* Residual */}
                <td style={{ textAlign: 'center', fontWeight: 700 }}>
                  {r.residual != null ? Math.round(r.residual) : '—'}
                </td>

                {/* Financial Exposure */}
                <td style={{ fontSize: 12, fontWeight: 700 }}>
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
                    if (status === 'unset') return <span className="apt-pill apt-pill-unset tooltip-wrap" data-tip="Visit settings to set risk appetite.">No threshold</span>;
                    return <span className={APT_PILL_CLS[status]}>{APT_LABELS[status]}</span>;
                  })()}
                </td>

                {/* Decision Required */}
                <td>
                  {r.linked_decision
                    ? <span className="dec-linked">Linked</span>
                    : (
                      <div className="dec-warn tooltip-wrap" data-tip="Edit risk to link a decision to the risk." style={{ position: 'relative' }}>
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
    </div>
  );
}
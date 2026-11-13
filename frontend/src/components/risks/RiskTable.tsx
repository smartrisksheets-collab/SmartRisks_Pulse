// src/components/risks/RiskTable.tsx
// Register table in the Pulse layout. Every status and score comes from the
// backend; riskDisplay only picks the chip colour and wording.

import type { Risk } from '../../types/risk';
import { formatExposure } from '../../utils/format';
import { useSettingsStore } from '../../store/settingsStore';
import {
  appetiteChip, decisionChip, freshnessClass, levelChipClass, rowFlag, scoreText,
} from '../../utils/riskDisplay';

interface Props {
  risks:       Risk[];
  loading:     boolean;
  bandCount:   number;
  openId:      string | null;
  selectedIds: Set<string>;
  onOpen:      (r: Risk) => void;
  onToggle:    (id: string) => void;
  onToggleAll: () => void;
}

export default function RiskTable({
  risks, loading, bandCount, openId, selectedIds, onOpen, onToggle, onToggleAll,
}: Props) {
  const currency = useSettingsStore(s => s.currency);
  const allOnPage = risks.length > 0 && risks.every(r => selectedIds.has(r.id));

  return (
    <div className="pl-table-wrap pl-rr-wrap">
      <table className="pl-table pl-rr-table" aria-busy={loading}>
        <thead>
          <tr>
            <th className="pl-rr-check">
              <input
                type="checkbox"
                aria-label="Select every risk on this page"
                checked={allOnPage}
                disabled={risks.length === 0}
                onChange={onToggleAll}
              />
            </th>
            <th>Risk</th>
            <th>Owner</th>
            <th>Inherent</th>
            <th className="pl-r" aria-sort="descending">Residual</th>
            <th>Appetite</th>
            <th>Decision</th>
            <th className="pl-r">Exposure</th>
          </tr>
        </thead>
        <tbody>
          {risks.map(r => {
            const flag = rowFlag(r);
            const app = appetiteChip(r.appetite_status, !!(r.category ?? '').trim());
            const dec = decisionChip(r);
            const exposure = formatExposure(r.financial_exposure, currency);
            const rowCls = selectedIds.has(r.id) || openId === r.id ? 'pl-rr-row pl-rr-sel' : 'pl-rr-row';
            return (
              <tr key={r.id} className={rowCls} onClick={() => onOpen(r)}>
                <td className="pl-rr-check" onClick={e => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    aria-label={`Select ${r.id}`}
                    checked={selectedIds.has(r.id)}
                    onChange={() => onToggle(r.id)}
                  />
                </td>
                <td>
                  <div className="pl-rr-risk">
                    <div className="pl-rr-title-line">
                      <span className="pl-rid">{r.id}</span>
                      <button
                        type="button"
                        className="pl-ttl"
                        title={r.display_title}
                        onClick={e => { e.stopPropagation(); onOpen(r); }}
                      >
                        {r.display_title}
                      </button>
                    </div>
                    <div className="pl-inline">
                      {r.category && <span className="pl-tag">{r.category}</span>}
                      {flag && <span className={flag.cls}>{flag.text}</span>}
                    </div>
                  </div>
                </td>
                <td className="pl-rr-owner">{r.owner ?? '—'}</td>
                <td>
                  <span className={`pl-chip ${levelChipClass(r.level_index, bandCount)}`}>
                    {r.level ?? '—'} · {scoreText(r.severity).replace(/\.0$/, '')}
                  </span>
                </td>
                <td className="pl-r">
                  <div className="pl-rr-res">
                    <span className="pl-rr-res-n">{r.residual == null ? '—' : Math.round(r.residual)}</span>
                    <span className={freshnessClass(r.freshness)}>{r.freshness ?? 'Not reviewed'}</span>
                  </div>
                </td>
                <td><span className={app.cls}>{app.text}</span></td>
                <td><span className={dec.cls}>{dec.text}</span></td>
                <td className="pl-r pl-rr-exp">{exposure || '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

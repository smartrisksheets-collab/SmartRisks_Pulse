// src/components/incidents/IncidentTable.tsx
// Incident log table in the Pulse layout. Stage, target and link wording come
// from the backend; incidentDisplay only picks the chip colour.

import type { IncidentRow } from '../../types/incident';
import { formatDate } from '../../utils/format';
import { linkChip, severityChipClass, stageChipClass, targetChip } from '../../utils/incidentDisplay';

interface Props {
  incidents:   IncidentRow[];
  loading:     boolean;
  sevRank:     Record<string, number>;
  openId:      string | null;
  selectedIds: Set<string>;
  onOpen:      (r: IncidentRow) => void;
  onToggle:    (id: string) => void;
  onToggleAll: () => void;
}

export default function IncidentTable({
  incidents, loading, sevRank, openId, selectedIds, onOpen, onToggle, onToggleAll,
}: Props) {
  const allOnPage = incidents.length > 0 && incidents.every(r => selectedIds.has(r.id));
  const levelCount = Object.keys(sevRank).length;

  return (
    <div className="pl-table-wrap pl-rr-wrap">
      <table className="pl-table pl-rr-table pl-in-table" aria-busy={loading}>
        <thead>
          <tr>
            <th className="pl-rr-check">
              <input
                type="checkbox"
                aria-label="Select every incident on this page"
                checked={allOnPage}
                disabled={incidents.length === 0}
                onChange={onToggleAll}
              />
            </th>
            <th>Incident</th>
            <th>Severity</th>
            <th>Status</th>
            <th>Linked risk</th>
            <th>Owner</th>
            <th aria-sort="descending">Logged</th>
            <th>Target</th>
          </tr>
        </thead>
        <tbody>
          {incidents.map(r => {
            const link = linkChip(r);
            const target = targetChip(r);
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
                    {r.category && <div className="pl-inline"><span className="pl-tag">{r.category}</span></div>}
                  </div>
                </td>
                <td>
                  <span className={`pl-chip ${severityChipClass(sevRank[r.severity ?? ''], levelCount)}`}>{r.severity ?? '—'}</span>
                </td>
                <td><span className={`pl-chip ${stageChipClass(r.status)}`}>{r.status ?? 'New'}</span></td>
                <td>
                  <span className={link.cls} title={r.linked_risk_title ?? undefined}>{link.text}</span>
                </td>
                <td className="pl-rr-owner">{r.assigned_to ?? '—'}</td>
                <td className="pl-in-nowrap">{formatDate(r.reported_at)}</td>
                <td className="pl-in-nowrap"><span className={target.cls}>{target.text}</span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

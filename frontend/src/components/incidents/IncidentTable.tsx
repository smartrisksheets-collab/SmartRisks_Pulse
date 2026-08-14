// src/components/incidents/IncidentTable.tsx

import type { Incident } from '../../types/incident';

interface Props {
  incidents: Incident[];
  flashId:   string | null;
  onOpen:    (inc: Incident) => void;
  page:      number;
  pageSize:  number;
  total:     number;
  onPrev:    () => void;
  onNext:    () => void;
}

function sevClass(severity: string | null): string {
  const s = (severity ?? '').toLowerCase();
  if (s.includes('very')) return 'pill pill-red';
  if (s === 'high')       return 'pill pill-amber';
  return 'pill pill-mint';
}

function statClass(status: string | null): string {
  const s = (status ?? '').toLowerCase();
  if (s === 'resolved' || s === 'closed')       return 'pill pill-mint';
  if (s === 'new')                               return 'pill pill-blue';
  if (s === 'open' || s === 'in progress')       return 'pill pill-amber';
  return 'pill';
}

export default function IncidentTable({ incidents, flashId, onOpen, page, pageSize, total, onPrev, onNext }: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (incidents.length === 0) {
    return (
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Incident ID</th><th>Business Unit</th><th>Category</th>
              <th>Severity</th><th>Status</th><th>Date Logged</th><th style={{ width: 110 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr className="muted"><td colSpan={7}>No incidents yet.</td></tr>
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Incident ID</th><th>Business Unit</th><th>Category</th>
              <th>Severity</th><th>Status</th><th>Date Logged</th><th style={{ width: 110 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {incidents.map(inc => (
              <tr key={inc.id} className={`inc-row${inc.id === flashId ? ' inc-row--new' : ''}`}>
                <td><b>{inc.id}</b></td>
                <td>{inc.business_unit ?? '—'}</td>
                <td>{inc.category ?? '—'}</td>
                <td><span className={sevClass(inc.severity)}>{inc.severity}</span></td>
                <td><span className={statClass(inc.status)}>{inc.status}</span></td>
                <td className="date-col">{inc.reported_at ?? '—'}</td>
                <td>
                  <button className="icon-btn" onClick={() => onOpen(inc)} type="button">
                    Open
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="pager right">
        <button className="btn btn-secondary" onClick={onPrev} disabled={page <= 1} type="button">Prev</button>
        <div className="muted">Page {page} of {totalPages}</div>
        <button className="btn btn-secondary" onClick={onNext} disabled={page >= totalPages} type="button">Next</button>
      </div>
    </>
  );
}
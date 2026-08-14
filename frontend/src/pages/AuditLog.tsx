// src/pages/AuditLog.tsx
// Filterable, paginated audit log with CSV export and Owner-only clear.
// Source: AuditService.gs api_getAuditLog + View_Users.html audit panel.

import { useState } from "react";
import { useAuth } from "../hooks/useAuth";
import api from "../services/api";
import {
  useAuditLog,
  useClearAuditLog,
  buildAuditExportUrl,
  type AuditFilters,
} from "../hooks/useAudit";

// ── constants at module scope ────────────────────────────────────────────

const PERIOD_OPTIONS: { label: string; value: string }[] = [
  { label: "All Time",    value: "" },
  { label: "Today",       value: "today" },
  { label: "Yesterday",   value: "yesterday" },
  { label: "Last 7 Days", value: "week" },
  { label: "Last 30 Days", value: "month" },
];

const MODULE_OPTIONS = ["", "Risk", "Incident"];
const ACTION_OPTIONS = ["", "CREATE", "UPDATE", "DELETE", "IMPORT", "RESTORE"];
const PAGE_SIZE = 50;

// ── action badge helper ──────────────────────────────────────────────────

function actionColor(action: string): string {
  switch (action.toUpperCase()) {
    case "CREATE":  return "#01b88e";
    case "DELETE":  return "#ef4444";
    case "UPDATE":  return "#f59e0b";
    case "IMPORT":  return "#3b82f6";
    case "RESTORE": return "#8b5cf6";
    default:        return "#6b7280";
  }
}

// ── main page ────────────────────────────────────────────────────────────

export default function AuditLog() {
  const { claims } = useAuth();
  const isOwner = claims?.role === "Owner";

  const [dateRange,     setDateRange]     = useState("");
  const [moduleFilter,  setModuleFilter]  = useState("");
  const [actionFilter,  setActionFilter]  = useState("");
  const [userFilter,    setUserFilter]    = useState("");
  const [searchDraft,   setSearchDraft]   = useState("");
  const [page,          setPage]          = useState(1);
  const [clearConfirm,  setClearConfirm]  = useState(false);

  const filters: AuditFilters = {
    date_range: dateRange || undefined,
    module:     moduleFilter || undefined,
    action:     actionFilter || undefined,
    user_email: userFilter || undefined,
    page,
    page_size: PAGE_SIZE,
  };

  const { data, isLoading, refetch } = useAuditLog(filters);
  const clearMutation = useClearAuditLog();

  const entries = data?.data ?? [];
  const total   = data?.meta?.total ?? 0;
  const pages   = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function applySearch() {
    setUserFilter(searchDraft.trim());
    setPage(1);
  }

  function clearFilters() {
    setModuleFilter("");
    setActionFilter("");
    setUserFilter("");
    setSearchDraft("");
    setPage(1);
  }

  async function handleExport() {
    const url = buildAuditExportUrl({
      date_range: dateRange || undefined,
      module:     moduleFilter || undefined,
      action:     actionFilter || undefined,
      user_email: userFilter || undefined,
    });
    try {
      const res  = await api.get(url, { responseType: "blob" });
      const blob = new Blob([res.data as BlobPart], { type: "text/csv" });
      const href = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = href;
      a.download = "audit_log.csv";
      a.click();
      URL.revokeObjectURL(href);
    } catch {
      // export failure is non-critical, no toast needed
    }
  }

  function handleClear() {
    if (!clearConfirm) { setClearConfirm(true); return; }
    clearMutation.mutate(undefined, {
      onSuccess: () => setClearConfirm(false),
      onError:   () => setClearConfirm(false),
    });
  }

  return (
    <div className="card">
      {/* Header */}
      <div className="card-title">
        <span>Audit Log</span>
        <div className="action-group">
          {isOwner && (
            <button
              className="btn btn-danger"
              type="button"
              onClick={handleClear}
              disabled={clearMutation.isPending}
              style={{ opacity: clearConfirm ? 1 : 0.85 }}
            >
              {clearMutation.isPending
                ? "Clearing…"
                : clearConfirm
                ? "Confirm Clear?"
                : "Clear Log"}
            </button>
          )}
          <button className="btn btn-secondary" type="button" onClick={handleExport}>
            ↓ Export CSV
          </button>
          <button className="btn btn-secondary" type="button" onClick={() => refetch()}>
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Period tabs */}
      <div className="al-period-bar">
        {PERIOD_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`btn btn-secondary al-period-btn${dateRange === opt.value ? ' active' : ''}`}
            onClick={() => { setDateRange(opt.value); setPage(1); }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Filter bar */}
      <div className="filter-bar">
        <div className="filter-field">
          <label className="filter-label">Module</label>
          <select
            value={moduleFilter}
            onChange={(e) => { setModuleFilter(e.target.value); setPage(1); }}
          >
            {MODULE_OPTIONS.map((m) => (
              <option key={m} value={m}>{m || "All"}</option>
            ))}
          </select>
        </div>

        <div className="filter-field">
          <label className="filter-label">Action</label>
          <select
            value={actionFilter}
            onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
          >
            {ACTION_OPTIONS.map((a) => (
              <option key={a} value={a}>{a || "All"}</option>
            ))}
          </select>
        </div>

        <div className="filter-field grow">
          <label className="filter-label">Search User</label>
          <input
            placeholder="Filter by email…"
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") applySearch(); }}
          />
        </div>

        <div className="filter-actions">
          <button className="btn btn-secondary" type="button" onClick={clearFilters}>
            Clear
          </button>
          <button className="btn btn-primary" type="button" onClick={applySearch}>
            Search
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>User</th>
              <th>Action</th>
              <th>Module</th>
              <th>Record ID</th>
              <th>Summary</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={6} className="muted small" style={{ textAlign: "center", padding: 40 }}>
                  Loading…
                </td>
              </tr>
            ) : entries.length === 0 ? (
              <tr>
                <td colSpan={6} className="muted small" style={{ textAlign: "center", padding: 40 }}>
                  No audit entries found.
                </td>
              </tr>
            ) : entries.map((row) => (
              <tr key={row.id}>
                <td style={{ whiteSpace: "nowrap", fontSize: 12, color: "var(--muted)" }}>
                  {row.timestamp}
                </td>
                <td style={{ fontSize: 13 }}>{row.user_email}</td>
                <td>
                  <span style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: actionColor(row.action),
                    background: "transparent",
                    padding: "2px 0",
                    letterSpacing: "0.04em",
                  }}>
                    {row.action}
                  </span>
                </td>
                <td style={{ fontSize: 13 }}>{row.module}</td>
                <td style={{ fontSize: 12, fontWeight: 700, color: "var(--navy)" }}>
                  {row.record_id}
                </td>
                <td style={{ fontSize: 12, color: "var(--muted)", maxWidth: 320 }}>
                  {row.summary}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination + count */}
      <div className="al-pager">
        <p className="muted small" style={{ margin: 0 }}>
          {total} {total === 1 ? "entry" : "entries"}
          {total > PAGE_SIZE ? ` — page ${page} of ${pages}` : ""}
        </p>
        {pages > 1 && (
          <div className="al-pager-btns">
            <button className="btn btn-secondary al-page-btn" type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              ← Prev
            </button>
            <button className="btn btn-secondary al-page-btn" type="button" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
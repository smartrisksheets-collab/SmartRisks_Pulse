// src/pages/Users.tsx
// User list with stat cards, filters, invite modal, and edit/deactivate flow.
// Source: UserService.gs + View_Users.html (team panel + modals).

import { useState, useRef, useCallback } from "react";
import { useAuth } from "../hooks/useAuth";
import { useFeedbackStore } from "../store/feedbackStore";
import { useSettings } from "../hooks/useSettings";
import {
  useUsers,
  useAddUser,
  useUpdateUser,
  useDeactivateUser,
  useReactivateUser,
  useRemoveUser,
  type WorkspaceMember,
  type UpdateMemberPayload,
} from "../hooks/useUsers";

// ── local toast hook ──────────────────────────────────────────────────────

function useToast() {
  const [toasts, setToasts] = useState<{ id: number; msg: string; type: string }[]>([]);
  const idRef = useRef(0);
  const toast = useCallback((msg: string, type: "success" | "error" | "info" = "success") => {
    const id = ++idRef.current;
    setToasts((prev) => [...prev, { id, msg, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  }, []);
  const ToastHost = () => (
    <div id="toastHost">
      {toasts.map((t) => (
        <div key={t.id} className={`toast show ${t.type}`}>{t.msg}</div>
      ))}
    </div>
  );
  return { toast, ToastHost };
}

// ── module-scope constants ────────────────────────────────────────────────

const ROLES = ["Analyst", "Manager", "Owner"] as const;

const ROLE_PERM_DEFAULTS: Record<string, Record<string, boolean>> = {
  Owner:   { manage_risks: true,  manage_incidents: true,  review_resolve: true,  generate_ai: true,  print_reports: true,  manage_users: true,  manage_settings: true  },
  Manager: { manage_risks: true,  manage_incidents: true,  review_resolve: true,  generate_ai: true,  print_reports: true,  manage_users: false, manage_settings: false },
  Analyst: { manage_risks: false, manage_incidents: false, review_resolve: false, generate_ai: false, print_reports: true,  manage_users: false, manage_settings: false },
};

const PERM_LABELS: { key: string; label: string }[] = [
  { key: "manage_risks",     label: "Manage Risks"     },
  { key: "manage_incidents", label: "Manage Incidents" },
  { key: "review_resolve",   label: "Review & Resolve" },
  { key: "generate_ai",      label: "Generate AI"      },
  { key: "print_reports",    label: "Print Reports"    },
  { key: "manage_users",     label: "Manage Users"     },
  { key: "manage_settings",  label: "Manage Settings"  },
];

// ── helper components at module scope (Fast Refresh rule) ─────────────────

function RoleBadge({ role }: { role: string }) {
  const styles: Record<string, { background: string; color: string }> = {
    Owner:   { background: "rgba(31,40,84,.10)",   color: "#1F2854" },
    Manager: { background: "rgba(1,184,142,.12)",   color: "#006b52" },
    Analyst: { background: "rgba(107,114,128,.12)", color: "#374151" },
  };
  const s = styles[role] ?? styles.Analyst;
  return (
    <span style={{
      ...s,
      fontSize: 11, fontWeight: 700, padding: "3px 10px",
      borderRadius: 20, display: "inline-block",
    }}>
      {role === "Owner" ? "Admin" : role}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const active = status === "ACTIVE";
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20,
      background: active ? "rgba(1,184,142,.12)" : "rgba(239,68,68,.10)",
      color:      active ? "#006b52" : "#b91c1c",
    }}>
      {active ? "Active" : "Deactivated"}
    </span>
  );
}

// ── Invite modal ──────────────────────────────────────────────────────────

interface InviteModalProps {
  onClose: () => void;
  toast:   (msg: string, type?: "success" | "error" | "info") => void;
}

function InviteModal({ onClose, toast }: InviteModalProps) {
  const addUser = useAddUser();
  const [email, setEmail] = useState("");
  const [name,  setName]  = useState("");
  const [role,  setRole]  = useState("Analyst");
  const [err,   setErr]   = useState("");

  function handleSubmit() {
    if (!email.trim()) { setErr("Email is required."); return; }
    setErr("");
    addUser.mutate(
      { email: email.trim(), name: name.trim(), role },
      {
        onSuccess: () => {
          useFeedbackStore.getState().trigger('invite_user', 'How was the invite experience?');
          toast("User invited successfully.");
          onClose();
        },
        onError: (err: unknown) => setErr(err instanceof Error ? err.message : "Failed to invite user. Check the email and try again."),
      }
    );
  }

  return (
    <div className="modal-backdrop show">
      <div className="modal" style={{ maxWidth: 480 }}>
        <div className="modal-hd">
          <h3 className="modal-title">Invite User</h3>
          <button className="x" type="button" onClick={onClose}>✕</button>
        </div>

        <div className="modal-bd">
          <div className="field" style={{ marginBottom: 12 }}>
            <label>Email Address <span style={{ color: "#ef4444" }}>*</span></label>
            <input
              type="email"
              placeholder="colleague@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="field" style={{ marginBottom: 12 }}>
            <label>Name</label>
            <input
              placeholder="Full name (optional)"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Role</label>
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="Analyst">Analyst — Limited access</option>
              <option value="Manager">Manager — Mid-level access</option>
              <option value="Owner">Admin — Full access</option>
            </select>
          </div>
          {err && <p style={{ color: "#ef4444", fontSize: 13, marginTop: 8 }}>{err}</p>}
        </div>

        <div className="modal-ft">
          <button className="btn btn-secondary" type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            type="button"
            onClick={handleSubmit}
            disabled={addUser.isPending}
          >
            {addUser.isPending ? "Sending…" : "Send Invite"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Edit modal ────────────────────────────────────────────────────────────

interface EditModalProps {
  member:  WorkspaceMember;
  selfId:  string;
  onClose: () => void;
  toast:   (msg: string, type?: "success" | "error" | "info") => void;
}

function EditModal({ member, selfId, onClose, toast }: EditModalProps) {
  const updateUser     = useUpdateUser();
  const deactivateUser = useDeactivateUser();
  const reactivateUser = useReactivateUser();
  const removeUser     = useRemoveUser();

  const [name,          setName]          = useState(member.name ?? "");
  const [role,          setRole]          = useState(member.role);
  const [err,           setErr]           = useState("");
  const [confirm,       setConfirm]       = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [customPerms, setCustomPerms] = useState(member.permissions !== null);
  const [perms,       setPerms]       = useState<Record<string, boolean>>(
    member.permissions ?? ROLE_PERM_DEFAULTS[member.role] ?? ROLE_PERM_DEFAULTS["Analyst"]
  );

  const isActive = member.status === "ACTIVE";
  const isSelf   = member.account_id === selfId;

  function handleSave() {
    setErr("");
    const body: UpdateMemberPayload = { name: name.trim() || undefined, role };
    if (customPerms) {
      body.permissions = perms;
    } else if (member.permissions !== null) {
      body.reset_permissions = true;
    }
    updateUser.mutate(
      { id: member.id, body },
      {
        onSuccess: () => { toast("User updated."); onClose(); },
        onError:   (err: unknown) => setErr(err instanceof Error ? err.message : "Update failed. Please try again."),
      }
    );
  }

  function handleDeactivate() {
    if (!confirm) { setConfirm(true); return; }
    setErr("");
    deactivateUser.mutate(member.id, {
      onSuccess: () => { toast("User deactivated."); onClose(); },
      onError:   () => { setErr("Deactivation failed. Cannot remove the last Owner."); setConfirm(false); },
    });
  }

  function handleReactivate() {
    setErr("");
    reactivateUser.mutate(member.id, {
      onSuccess: () => { toast("User reactivated."); onClose(); },
      onError:   (err: unknown) => setErr(err instanceof Error ? err.message : "Reactivation failed. User limit may be reached."),
    });
  }

  function handleRemove() {
    if (!confirmRemove) { setConfirmRemove(true); return; }
    setErr("");
    removeUser.mutate(member.id, {
      onSuccess: () => { toast("User removed from workspace.", "info"); onClose(); },
      onError:   (err: unknown) => { setErr(err instanceof Error ? err.message : "Removal failed. Cannot remove the last Owner."); setConfirmRemove(false); },
    });
  }

  return (
    <div className="modal-backdrop show">
      <div className="modal" style={{ maxWidth: 520 }}>
        <div className="modal-hd">
          <h3 className="modal-title">Edit User</h3>
          <button className="x" type="button" onClick={onClose}>✕</button>
        </div>

        <div className="modal-bd">
          <div className="field" style={{ marginBottom: 12 }}>
            <label>Email</label>
            <input
              value={member.email}
              readOnly
              style={{ background: "var(--bg)", color: "var(--muted)" }}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div className="field">
              <label>Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="field">
              <label>Role</label>
              <select value={role} onChange={(e) => {
                setRole(e.target.value);
                if (!customPerms) {
                  setPerms(ROLE_PERM_DEFAULTS[e.target.value] ?? ROLE_PERM_DEFAULTS["Analyst"]);
                }
              }} disabled={isSelf}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>{r === "Owner" ? "Admin" : r}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid var(--line)", fontSize: 13, color: "var(--muted)", marginBottom: 10 }}>
            Status: <StatusBadge status={member.status} />
            {isSelf && <span style={{ marginLeft: 10, fontSize: 12 }}>This is your account.</span>}
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, marginBottom: 8 }}>
            <input
              type="checkbox"
              checked={customPerms}
              onChange={(e) => {
                setCustomPerms(e.target.checked);
                if (e.target.checked) {
                  setPerms(member.permissions ?? ROLE_PERM_DEFAULTS[role] ?? ROLE_PERM_DEFAULTS["Analyst"]);
                }
              }}
              style={{ width: 16, height: 16 }}
            />
            Customize permissions (override role defaults)
          </label>

          {customPerms && (
            <div style={{ background: "var(--bg)", padding: 14, borderRadius: 10, border: "1px solid var(--line)", marginBottom: 8 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {PERM_LABELS.map(({ key, label }) => (
                  <label key={key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={!!perms[key]}
                      onChange={(e) => setPerms((p) => ({ ...p, [key]: e.target.checked }))}
                      style={{ width: 15, height: 15 }}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          )}

          {err && <p style={{ color: "#ef4444", fontSize: 13, marginTop: 8 }}>{err}</p>}
        </div>

        <div className="modal-ft" style={{ justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: 8 }}>
            {!isSelf && isActive && (
              <button
                className="btn btn-danger"
                type="button"
                onClick={handleDeactivate}
                disabled={deactivateUser.isPending}
              >
                {deactivateUser.isPending ? "Deactivating…" : confirm ? "Confirm?" : "Deactivate"}
              </button>
            )}
            {!isSelf && !isActive && (
              <button
                className="btn btn-primary"
                type="button"
                onClick={handleReactivate}
                disabled={reactivateUser.isPending}
              >
                {reactivateUser.isPending ? "Reactivating…" : "Reactivate"}
              </button>
            )}
            {!isSelf && (
              <button
                className="btn btn-danger"
                type="button"
                onClick={handleRemove}
                disabled={removeUser.isPending}
                style={{ opacity: confirmRemove ? 1 : 0.7 }}
              >
                {removeUser.isPending ? "Removing…" : confirmRemove ? "Confirm Remove?" : "Remove"}
              </button>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-secondary" type="button" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" type="button" onClick={handleSave} disabled={updateUser.isPending}>
              {updateUser.isPending ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── main page ─────────────────────────────────────────────────────────────

export default function Users() {
  const { claims } = useAuth();
  const { query: settingsQuery } = useSettings();
  const { toast, ToastHost } = useToast();

  const { data: members = [], isLoading, refetch } = useUsers();

  const [search,      setSearch]      = useState("");
  const [roleFilter,  setRoleFilter]  = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showInvite,  setShowInvite]  = useState(false);
  const [editTarget,  setEditTarget]  = useState<WorkspaceMember | null>(null);

  const selfId   = claims?.sub ?? "";
  const maxUsers = settingsQuery.data?.max_users ?? 25;

  // ── derived stats ───────────────────────────────────────────────────────
  const activeCount  = members.filter((m) => m.status === "ACTIVE").length;
  const deactCount   = members.filter((m) => m.status !== "ACTIVE").length;

  // ── filtered list ───────────────────────────────────────────────────────
  const filtered = members.filter((m) => {
    const q = search.toLowerCase();
    const matchSearch = !q
      || (m.email ?? "").toLowerCase().includes(q)
      || (m.name  ?? "").toLowerCase().includes(q);
    const matchRole   = !roleFilter   || m.role   === roleFilter;
    const matchStatus = !statusFilter || m.status === statusFilter;
    return matchSearch && matchRole && matchStatus;
  });

  return (
    <>
      <div className="card">
        {/* Header */}
        <div className="card-title">
          <span>Team Members</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-secondary" type="button" onClick={() => refetch()}>
              ↻ Refresh
            </button>
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => setShowInvite(true)}
              disabled={activeCount >= maxUsers}
              title={activeCount >= maxUsers ? `User limit of ${maxUsers} reached` : undefined}
            >
              + Invite User
            </button>
          </div>
        </div>

        {/* Stat cards */}
        <div className="kpi-row" style={{ marginBottom: 16 }}>
          <div className="kpi">
            <div className="lbl">Active</div>
            <div className="num" style={{ color: "#01b88e" }}>{activeCount}</div>
          </div>
          <div className="kpi">
            <div className="lbl">Deactivated</div>
            <div className="num" style={{ color: "#ef4444" }}>{deactCount}</div>
          </div>
          <div className="kpi">
            <div className="lbl">Limit</div>
            <div className="num">
              {activeCount}
              <span style={{ fontSize: 14, fontWeight: 400, color: "var(--muted)" }}>
                /{maxUsers}
              </span>
            </div>
          </div>
          <div className="kpi">
            <div className="lbl">Plan</div>
            <div className="num" style={{ fontSize: 16, color: "var(--accent)" }}>
              {settingsQuery.data?.plan ?? "—"}
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="filters">
          <div className="field" style={{ minWidth: 220 }}>
            <label>Search Users</label>
            <input
              placeholder="Search by name or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Role</label>
            <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
              <option value="">All</option>
              <option value="Owner">Admin</option>
              <option value="Manager">Manager</option>
              <option value="Analyst">Analyst</option>
            </select>
          </div>
          <div className="field">
            <label>Status</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All</option>
              <option value="ACTIVE">Active</option>
              <option value="DEACTIVATED">Deactivated</option>
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Last Login</th>
                <th style={{ textAlign: "center" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="muted small" style={{ textAlign: "center", padding: 40 }}>
                    Loading users…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="muted small" style={{ textAlign: "center", padding: 40 }}>
                    No users found.
                  </td>
                </tr>
              ) : filtered.map((m) => (
                <tr key={m.id}>
                  <td style={{ fontWeight: 600 }}>
                    {m.name || "—"}
                    {m.account_id === selfId && (
                      <span className="badge-you">You</span>
                    )}
                  </td>
                  <td style={{ fontSize: 13 }}>{m.email}</td>
                  <td><RoleBadge role={m.role} /></td>
                  <td><StatusBadge status={m.status} /></td>
                  <td className="muted small">
                    {m.last_login ? new Date(m.last_login).toLocaleDateString() : "—"}
                  </td>
                  <td style={{ textAlign: "center" }}>
                    <button
                      className="btn btn-secondary"
                      type="button"
                      style={{ fontSize: 12, padding: "4px 12px" }}
                      onClick={() => setEditTarget(m)}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="muted small" style={{ marginTop: 10 }}>
          Users here populate the "Risk Owner" dropdown in the Risk Register.
        </p>
      </div>

      {showInvite && <InviteModal onClose={() => setShowInvite(false)} toast={toast} />}
      {editTarget  && (
        <EditModal
          member={editTarget}
          selfId={selfId}
          onClose={() => setEditTarget(null)}
          toast={toast}
        />
      )}
      <ToastHost />
    </>
  );
}
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { usersApi } from '../services/api'
import type { PlatformUser } from '../types/admin'

type GhostFilter = 'ALL' | 'ACTIVE' | 'GHOST'

const GHOST_FILTERS: GhostFilter[] = ['ALL', 'ACTIVE', 'GHOST']

function formatDate(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

function formatRelative(d: string | null): string {
  if (!d) return '—'
  const diff = Date.now() - new Date(d).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  return formatDate(d)
}

function GhostPill({ is_ghost }: { is_ghost: boolean }) {
  if (!is_ghost) return null
  return (
    <span
      className="a-badge"
      style={{ background: 'rgba(239,68,68,0.10)', color: 'var(--danger)', marginLeft: 6 }}
    >
      ghost
    </span>
  )
}

function WorkspaceLimitCell({ user }: { user: PlatformUser }) {
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [value, setValue]     = useState(String(user.max_workspaces))
  const [err, setErr]         = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () => usersApi.updateWorkspaceLimit(user.id, Number(value)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'platform-users'] })
      setEditing(false)
      setErr(null)
    },
    onError: (e: unknown) => {
      const data = (e as { response?: { data?: { error?: string } } }).response?.data
      setErr(data?.error ?? 'Failed to update.')
    },
  })

  if (!editing) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontWeight: 700, color: '#1F2854' }}>{user.max_workspaces}</span>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>
          ({user.workspace_count} used)
        </span>
        <button
          className="a-btn a-btn-ghost"
          style={{ padding: '3px 10px', fontSize: 11 }}
          onClick={() => { setValue(String(user.max_workspaces)); setEditing(true) }}
        >
          Set
        </button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input
          type="number"
          min={1}
          max={50}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="a-input"
          style={{ width: 64, padding: '4px 8px', fontSize: 12 }}
        />
        <button
          className="a-btn a-btn-primary"
          style={{ padding: '4px 12px', fontSize: 12 }}
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending || !value || Number(value) < 1}
        >
          {mutation.isPending ? '...' : 'Save'}
        </button>
        <button
          className="a-btn a-btn-ghost"
          style={{ padding: '4px 8px', fontSize: 12 }}
          onClick={() => { setEditing(false); setErr(null) }}
        >
          Cancel
        </button>
      </div>
      {err && <span style={{ fontSize: 11, color: 'var(--danger)' }}>{err}</span>}
    </div>
  )
}

function UserRow({ user }: { user: PlatformUser }) {
  return (
    <tr>
      <td>
        <div style={{ fontWeight: 600 }}>
          {user.name}
          <GhostPill is_ghost={user.is_ghost} />
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
          {user.email}
        </div>
      </td>
      <td><WorkspaceLimitCell user={user} /></td>
      <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
        {formatRelative(user.last_login)}
      </td>
      <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
        {formatRelative(user.last_seen)}
      </td>
      <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
        {formatDate(user.created_at)}
      </td>
    </tr>
  )
}

export default function PlatformUsers() {
  const [search, setSearch] = useState('')
  const [ghostFilter, setGhostFilter] = useState<GhostFilter>('ALL')

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['admin', 'platform-users'],
    queryFn: usersApi.list,
    staleTime: 60_000,
  })

  const ghostCount = users.filter((u) => u.is_ghost).length

  const filtered = users.filter((u) => {
    const matchSearch =
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
    const matchGhost =
      ghostFilter === 'ALL' ||
      (ghostFilter === 'GHOST' && u.is_ghost) ||
      (ghostFilter === 'ACTIVE' && !u.is_ghost)
    return matchSearch && matchGhost
  })

  return (
    <div>
      <div className="a-page-header">
        <div>
          <div className="a-page-title">Platform Users</div>
          <div className="a-page-sub">
            {users.length} accounts,{' '}
            <span style={{ color: 'var(--danger)' }}>{ghostCount} ghost</span>
          </div>
        </div>
      </div>

      <div className="a-search-bar">
        <input
          className="a-search-input"
          placeholder="Search by name or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="a-select"
          value={ghostFilter}
          onChange={(e) => setGhostFilter(e.target.value as GhostFilter)}
        >
          {GHOST_FILTERS.map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <div className="a-text-muted">Loading...</div>
      ) : (
        <div className="a-table-wrap">
          <table className="a-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Workspace Limit</th>
                <th>Last Login</th>
                <th>Last Seen</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    style={{ textAlign: 'center', color: 'var(--muted)', padding: 32 }}
                  >
                    No users match your filters.
                  </td>
                </tr>
              ) : (
                filtered.map((u) => <UserRow key={u.id} user={u} />)
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
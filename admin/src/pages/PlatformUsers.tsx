import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
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
      <td>{user.workspace_count}</td>
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
                <th>Workspaces</th>
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
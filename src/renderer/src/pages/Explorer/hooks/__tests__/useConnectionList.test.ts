import { describe, it, expect } from 'vitest'
import { computeConnectionList } from '../useConnectionList'
import type { UseConnectionListParams } from '../useConnectionList'
import type { ConnectionRecord } from '../../connections.types'
import type { EnvironmentDefinition } from '../../../Settings/useSettings'

function makeConn(overrides: Partial<ConnectionRecord> & { id: string; name: string }): ConnectionRecord {
  return {
    host: 'localhost',
    port: 5432,
    username: 'user',
    password: '',
    provider: 'postgres',
    defaultDatabase: '',
    rememberPassword: false,
    ...overrides
  }
}

const ENV_PROD: EnvironmentDefinition = { id: 'env-prod', name: 'Production', color: '#f00', description: '', critical: false }
const ENV_DEV: EnvironmentDefinition = { id: 'env-dev', name: 'Development', color: '#0f0', description: '', critical: false }

function computeList(params: Partial<UseConnectionListParams> & { connections: ConnectionRecord[] }) {
  return computeConnectionList({
    connections: params.connections,
    environments: params.environments ?? [],
    searchText: params.searchText ?? '',
    filterProviders: params.filterProviders ?? new Set(),
    filterEnvironmentIds: params.filterEnvironmentIds ?? new Set(),
    connectedIds: params.connectedIds ?? new Set(),
    filterStatus: params.filterStatus ?? null,
    statusLabels: params.statusLabels,
    sortField: params.sortField ?? 'name',
    sortDirection: params.sortDirection ?? 'asc'
  })
}

describe('useConnectionList – search', () => {
  const connections = [
    makeConn({ id: '1', name: 'Alpha DB', host: 'alpha.example.com' }),
    makeConn({ id: '2', name: 'Beta DB', host: 'beta.example.com' }),
    makeConn({ id: '3', name: 'Gamma', host: 'localhost' })
  ]

  it('returns all connections when search text is empty', () => {
    const { entries } = computeList({ connections, searchText: '' })
    expect(entries).toHaveLength(3)
  })

  it('filters by connection name (case-insensitive)', () => {
    const { entries } = computeList({ connections, searchText: 'alpha' })
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ kind: 'connection', connection: { id: '1' } })
  })

  it('filters by host', () => {
    const { entries } = computeList({ connections, searchText: 'beta.example' })
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ kind: 'connection', connection: { id: '2' } })
  })

  it('matches partial name across multiple connections', () => {
    const { entries } = computeList({ connections, searchText: 'DB' })
    expect(entries).toHaveLength(2)
  })

  it('returns empty list when nothing matches', () => {
    const { entries } = computeList({ connections, searchText: 'zzz-no-match' })
    expect(entries).toHaveLength(0)
  })
})

describe('useConnectionList – filter', () => {
  const connections = [
    makeConn({ id: '1', name: 'PG Conn', provider: 'postgres' }),
    makeConn({ id: '2', name: 'MySQL Conn', provider: 'mysql' }),
    makeConn({ id: '3', name: 'SQLite Conn', provider: 'sqlite' }),
    makeConn({ id: '4', name: 'Prod Conn', provider: 'postgres', environmentId: ENV_PROD.id }),
    makeConn({ id: '5', name: 'Dev Conn', provider: 'mysql', environmentId: ENV_DEV.id })
  ]

  it('hasActiveFilters is false when no filters set', () => {
    const { hasActiveFilters } = computeList({ connections })
    expect(hasActiveFilters).toBe(false)
  })

  it('hasActiveFilters is true when provider filter set', () => {
    const { hasActiveFilters } = computeList({ connections, filterProviders: new Set(['postgres']) })
    expect(hasActiveFilters).toBe(true)
  })

  it('hasActiveFilters is true when environment filter set', () => {
    const { hasActiveFilters } = computeList({ connections, filterEnvironmentIds: new Set([ENV_PROD.id]) })
    expect(hasActiveFilters).toBe(true)
  })

  it('filters by a single provider', () => {
    const { entries } = computeList({ connections, filterProviders: new Set(['postgres']) })
    const ids = entries.map((e) => e.kind === 'connection' ? e.connection.id : null).filter(Boolean)
    expect(ids).toEqual(expect.arrayContaining(['1', '4']))
    expect(ids).toHaveLength(2)
  })

  it('filters by multiple providers', () => {
    const { entries } = computeList({ connections, filterProviders: new Set(['postgres', 'mysql']) })
    const ids = entries.map((e) => e.kind === 'connection' ? e.connection.id : null).filter(Boolean)
    expect(ids).toHaveLength(4)
  })

  it('filters by environment id', () => {
    const { entries } = computeList({ connections, filterEnvironmentIds: new Set([ENV_PROD.id]) })
    const ids = entries.map((e) => e.kind === 'connection' ? e.connection.id : null).filter(Boolean)
    expect(ids).toEqual(['4'])
  })

  it('filters by empty-string env id (no environment)', () => {
    const { entries } = computeList({ connections, filterEnvironmentIds: new Set(['']) })
    const ids = entries.map((e) => e.kind === 'connection' ? e.connection.id : null).filter(Boolean)
    expect(ids).toEqual(expect.arrayContaining(['1', '2', '3']))
    expect(ids).toHaveLength(3)
  })

  it('combines provider and environment filters (intersection)', () => {
    const { entries } = computeList({
      connections,
      filterProviders: new Set(['postgres']),
      filterEnvironmentIds: new Set([ENV_PROD.id])
    })
    const ids = entries.map((e) => e.kind === 'connection' ? e.connection.id : null).filter(Boolean)
    expect(ids).toEqual(['4'])
  })
})

describe('useConnectionList – status filter', () => {
  const connections = [
    makeConn({ id: '1', name: 'Connected A', provider: 'postgres' }),
    makeConn({ id: '2', name: 'Connected B', provider: 'mysql' }),
    makeConn({ id: '3', name: 'Disconnected', provider: 'sqlite' }),
    makeConn({ id: '4', name: 'Connecting', provider: 'postgres' }),
    makeConn({ id: '5', name: 'Errored', provider: 'mysql' })
  ]
  // Only ids 1 and 2 are connected; 3 disconnected, 4 connecting, 5 error.
  const connectedIds = new Set(['1', '2'])

  it('hasActiveFilters is true when status filter set', () => {
    const { hasActiveFilters } = computeList({ connections, connectedIds, filterStatus: 'online' })
    expect(hasActiveFilters).toBe(true)
  })

  it('online filter returns only connected connections', () => {
    const { entries } = computeList({ connections, connectedIds, filterStatus: 'online' })
    const ids = entries.map((e) => e.kind === 'connection' ? e.connection.id : null).filter(Boolean)
    expect(ids).toEqual(expect.arrayContaining(['1', '2']))
    expect(ids).toHaveLength(2)
  })

  it('offline filter returns every non-connected connection (incl. connecting/error)', () => {
    const { entries } = computeList({ connections, connectedIds, filterStatus: 'offline' })
    const ids = entries.map((e) => e.kind === 'connection' ? e.connection.id : null).filter(Boolean)
    expect(ids).toEqual(expect.arrayContaining(['3', '4', '5']))
    expect(ids).toHaveLength(3)
  })

  it('returns all connections when status filter is null', () => {
    const { entries } = computeList({ connections, connectedIds, filterStatus: null })
    expect(entries).toHaveLength(5)
  })

  it('treats every connection as offline when none are connected', () => {
    const { entries } = computeList({ connections, connectedIds: new Set(), filterStatus: 'offline' })
    expect(entries).toHaveLength(5)
  })

  it('combines status and provider filters (intersection)', () => {
    const { entries } = computeList({
      connections,
      connectedIds,
      filterStatus: 'online',
      filterProviders: new Set(['postgres'])
    })
    const ids = entries.map((e) => e.kind === 'connection' ? e.connection.id : null).filter(Boolean)
    expect(ids).toEqual(['1'])
  })
})

describe('useConnectionList – sort by name', () => {
  const connections = [
    makeConn({ id: '1', name: 'Zeta' }),
    makeConn({ id: '2', name: 'Alpha' }),
    makeConn({ id: '3', name: 'Mu' })
  ]

  it('sorts ascending by name', () => {
    const { entries } = computeList({ connections, sortField: 'name', sortDirection: 'asc' })
    const names = entries.map((e) => e.kind === 'connection' ? e.connection.name : null)
    expect(names).toEqual(['Alpha', 'Mu', 'Zeta'])
  })

  it('sorts descending by name', () => {
    const { entries } = computeList({ connections, sortField: 'name', sortDirection: 'desc' })
    const names = entries.map((e) => e.kind === 'connection' ? e.connection.name : null)
    expect(names).toEqual(['Zeta', 'Mu', 'Alpha'])
  })
})

describe('useConnectionList – sort by createdAt', () => {
  const connections = [
    makeConn({ id: '1', name: 'Old', createdAt: '2023-01-01T00:00:00.000Z' }),
    makeConn({ id: '2', name: 'New', createdAt: '2024-06-01T00:00:00.000Z' }),
    makeConn({ id: '3', name: 'Undated' }) // no createdAt
  ]

  it('sorts asc: oldest first, undated last', () => {
    const { entries } = computeList({ connections, sortField: 'createdAt', sortDirection: 'asc' })
    const ids = entries.map((e) => e.kind === 'connection' ? e.connection.id : null)
    expect(ids).toEqual(['1', '2', '3'])
  })

  it('sorts desc: newest first, undated still last', () => {
    const { entries } = computeList({ connections, sortField: 'createdAt', sortDirection: 'desc' })
    const ids = entries.map((e) => e.kind === 'connection' ? e.connection.id : null)
    expect(ids).toEqual(['2', '1', '3'])
  })
})

describe('useConnectionList – sort by lastUsedAt', () => {
  const connections = [
    makeConn({ id: '1', name: 'A', lastUsedAt: '2024-01-01T00:00:00.000Z' }),
    makeConn({ id: '2', name: 'B', lastUsedAt: '2024-03-01T00:00:00.000Z' }),
    makeConn({ id: '3', name: 'C' }) // never used
  ]

  it('sorts asc: earliest used first, never-used last', () => {
    const { entries } = computeList({ connections, sortField: 'lastUsedAt', sortDirection: 'asc' })
    const ids = entries.map((e) => e.kind === 'connection' ? e.connection.id : null)
    expect(ids).toEqual(['1', '2', '3'])
  })

  it('sorts desc: most recently used first, never-used still last', () => {
    const { entries } = computeList({ connections, sortField: 'lastUsedAt', sortDirection: 'desc' })
    const ids = entries.map((e) => e.kind === 'connection' ? e.connection.id : null)
    expect(ids).toEqual(['2', '1', '3'])
  })
})

describe('useConnectionList – sort by provider with group headers', () => {
  const connections = [
    makeConn({ id: '1', name: 'Z Postgres', provider: 'postgres' }),
    makeConn({ id: '2', name: 'A MySQL', provider: 'mysql' }),
    makeConn({ id: '3', name: 'B Postgres', provider: 'postgres' })
  ]

  it('emits group-header entries before each provider group', () => {
    const { entries } = computeList({ connections, sortField: 'provider', sortDirection: 'asc' })
    const kinds = entries.map((e) => e.kind)
    // Should be: header, conn, header, conn, conn  (mysql first asc, then postgres)
    expect(kinds[0]).toBe('group-header')
    expect(kinds[2]).toBe('group-header')
  })

  it('sorts groups ascending', () => {
    const { entries } = computeList({ connections, sortField: 'provider', sortDirection: 'asc' })
    const headers = entries.filter((e) => e.kind === 'group-header').map((e) => (e as import('../useConnectionList').ConnectionGroupHeader).label)
    expect(headers[0].toLowerCase() <= headers[1].toLowerCase()).toBe(true)
  })

  it('sorts groups descending', () => {
    const { entries } = computeList({ connections, sortField: 'provider', sortDirection: 'desc' })
    const headers = entries.filter((e) => e.kind === 'group-header').map((e) => (e as import('../useConnectionList').ConnectionGroupHeader).label)
    expect(headers[0].toLowerCase() >= headers[1].toLowerCase()).toBe(true)
  })

  it('sorts connections within a group by name ascending regardless of direction', () => {
    const { entries } = computeList({ connections, sortField: 'provider', sortDirection: 'desc' })
    // Postgres group is first when desc; it contains 'B Postgres' and 'Z Postgres'
    const postgresGroup = entries.filter(
      (e) => e.kind === 'connection' && e.connection.provider === 'postgres'
    )
    const names = postgresGroup.map((e) => e.kind === 'connection' ? e.connection.name : '')
    expect(names).toEqual(['B Postgres', 'Z Postgres'])
  })
})

describe('useConnectionList – sort by status with group headers', () => {
  const connections = [
    makeConn({ id: '1', name: 'Online A' }),
    makeConn({ id: '2', name: 'Offline B' }),
    makeConn({ id: '3', name: 'Online C' }),
    makeConn({ id: '4', name: 'Offline D' })
  ]
  // ids 1 and 3 connected; 2 and 4 not connected.
  const connectedIds = new Set(['1', '3'])

  it('emits a group-header before each status group', () => {
    const { entries } = computeList({ connections, connectedIds, sortField: 'status', sortDirection: 'asc' })
    const headers = entries.filter((e) => e.kind === 'group-header')
    expect(headers).toHaveLength(2)
  })

  it('groups connected connections under "Online" and the rest under "Offline"', () => {
    const { entries } = computeList({ connections, connectedIds, sortField: 'status', sortDirection: 'asc' })
    const headerLabels = entries
      .filter((e) => e.kind === 'group-header')
      .map((e) => (e as import('../useConnectionList').ConnectionGroupHeader).label)
    expect(headerLabels).toContain('Online')
    expect(headerLabels).toContain('Offline')
  })

  it('uses provided localized status labels for group headers', () => {
    const { entries } = computeList({
      connections,
      connectedIds,
      statusLabels: { online: 'מחובר', offline: 'מנותק' },
      sortField: 'status',
      sortDirection: 'asc'
    })
    const headerLabels = entries
      .filter((e) => e.kind === 'group-header')
      .map((e) => (e as import('../useConnectionList').ConnectionGroupHeader).label)
    expect(headerLabels).toEqual(expect.arrayContaining(['מחובר', 'מנותק']))
  })

  it('places connected ids in the Online group and non-connected ids in the Offline group', () => {
    const { entries } = computeList({ connections, connectedIds, sortField: 'status', sortDirection: 'asc' })
    let current = ''
    const grouped: Record<string, string[]> = { Online: [], Offline: [] }
    for (const e of entries) {
      if (e.kind === 'group-header') current = e.label
      else grouped[current].push(e.connection.id)
    }
    expect(grouped.Online).toEqual(expect.arrayContaining(['1', '3']))
    expect(grouped.Offline).toEqual(expect.arrayContaining(['2', '4']))
  })

  it('puts the Online group first when ascending', () => {
    const { entries } = computeList({ connections, connectedIds, sortField: 'status', sortDirection: 'asc' })
    const headerLabels = entries
      .filter((e) => e.kind === 'group-header')
      .map((e) => (e as import('../useConnectionList').ConnectionGroupHeader).label)
    expect(headerLabels).toEqual(['Online', 'Offline'])
  })

  it('puts the Offline group first when descending', () => {
    const { entries } = computeList({ connections, connectedIds, sortField: 'status', sortDirection: 'desc' })
    const headerLabels = entries
      .filter((e) => e.kind === 'group-header')
      .map((e) => (e as import('../useConnectionList').ConnectionGroupHeader).label)
    expect(headerLabels).toEqual(['Offline', 'Online'])
  })

  it('treats every connection as Offline when none are connected', () => {
    const { entries } = computeList({ connections, connectedIds: new Set(), sortField: 'status', sortDirection: 'asc' })
    const headerLabels = entries
      .filter((e) => e.kind === 'group-header')
      .map((e) => (e as import('../useConnectionList').ConnectionGroupHeader).label)
    expect(headerLabels).toEqual(['Offline'])
  })
})

describe('useConnectionList – sort by environment with group headers', () => {
  const connections = [
    makeConn({ id: '1', name: 'Prod A', provider: 'postgres', environmentId: ENV_PROD.id }),
    makeConn({ id: '2', name: 'Dev A', provider: 'mysql', environmentId: ENV_DEV.id }),
    makeConn({ id: '3', name: 'No Env', provider: 'sqlite' }) // no environmentId
  ]
  const environments = [ENV_PROD, ENV_DEV]

  it('emits group-header entries before each environment group', () => {
    const { entries } = computeList({ connections, environments, sortField: 'environment', sortDirection: 'asc' })
    const headers = entries.filter((e) => e.kind === 'group-header')
    expect(headers).toHaveLength(3)
  })

  it('"No environment" group is always last regardless of sort direction', () => {
    for (const dir of ['asc', 'desc'] as const) {
      const { entries } = computeList({ connections, environments, sortField: 'environment', sortDirection: dir })
      const headers = entries.filter((e) => e.kind === 'group-header') as import('../useConnectionList').ConnectionGroupHeader[]
      expect(headers[headers.length - 1].label).toBe('No environment')
    }
  })

  it('displays environment name in group header', () => {
    const { entries } = computeList({ connections, environments, sortField: 'environment', sortDirection: 'asc' })
    const headerLabels = entries.filter((e) => e.kind === 'group-header').map((e) => (e as import('../useConnectionList').ConnectionGroupHeader).label)
    expect(headerLabels).toContain('Production')
    expect(headerLabels).toContain('Development')
    expect(headerLabels).toContain('No environment')
  })
})

import { useMemo } from 'react'
import type { ConnectionRecord, ConnectionProvider } from '../connections.types'
import type { EnvironmentDefinition, ConnectionSortField, SortDirection } from '../../Settings/useSettings'
import { PROVIDER_METADATA } from '../providerMetadata'

export interface ConnectionGroupHeader {
  kind: 'group-header'
  id: string
  label: string
}

export interface ConnectionItem {
  kind: 'connection'
  connection: ConnectionRecord
}

export type ConnectionListEntry = ConnectionGroupHeader | ConnectionItem

export interface UseConnectionListParams {
  connections: ConnectionRecord[]
  environments: EnvironmentDefinition[]
  searchText: string
  filterProviders: Set<ConnectionProvider>
  filterEnvironmentIds: Set<string>
  sortField: ConnectionSortField
  sortDirection: SortDirection
}

export interface UseConnectionListReturn {
  entries: ConnectionListEntry[]
  hasActiveFilters: boolean
}

function compareStrings(a: string | undefined, b: string | undefined, direction: SortDirection): number {
  const aVal = (a ?? '').toLocaleLowerCase()
  const bVal = (b ?? '').toLocaleLowerCase()
  const order = aVal < bVal ? -1 : aVal > bVal ? 1 : 0
  return direction === 'asc' ? order : -order
}

function compareTimestamps(a: string | undefined, b: string | undefined, direction: SortDirection): number {
  // Undated entries sort after dated ones regardless of direction
  if (!a && !b) return 0
  if (!a) return 1
  if (!b) return -1
  const order = a < b ? -1 : a > b ? 1 : 0
  return direction === 'asc' ? order : -order
}

export function computeConnectionList({
  connections,
  environments,
  searchText,
  filterProviders,
  filterEnvironmentIds,
  sortField,
  sortDirection
}: UseConnectionListParams): UseConnectionListReturn {
  const hasActiveFilters = filterProviders.size > 0 || filterEnvironmentIds.size > 0

  const normalizedSearch = searchText.trim().toLocaleLowerCase()

  const filtered = connections.filter((conn) => {
    if (normalizedSearch) {
      const matchesName = conn.name.toLocaleLowerCase().includes(normalizedSearch)
      const matchesHost = conn.host.toLocaleLowerCase().includes(normalizedSearch)
      if (!matchesName && !matchesHost) return false
    }

    if (filterProviders.size > 0 && !filterProviders.has(conn.provider)) return false

    if (filterEnvironmentIds.size > 0) {
      const envId = conn.environmentId ?? ''
      if (!filterEnvironmentIds.has(envId)) return false
    }

    return true
  })

  let entries: ConnectionListEntry[]

  if (sortField === 'provider') {
    entries = buildGroupedEntries(
      filtered,
      (conn) => conn.provider,
      (provider) => PROVIDER_METADATA[provider as ConnectionProvider]?.label ?? provider,
      sortDirection
    )
  } else if (sortField === 'environment') {
    const envMap = new Map(environments.map((e) => [e.id, e.name]))
    entries = buildGroupedEntries(
      filtered,
      (conn) => conn.environmentId ?? '',
      (envId) => (envId ? (envMap.get(envId) ?? envId) : 'No environment'),
      sortDirection
    )
  } else {
    const sorted = [...filtered].sort((a, b) => {
      switch (sortField) {
        case 'name':
          return compareStrings(a.name, b.name, sortDirection)
        case 'createdAt':
          return compareTimestamps(a.createdAt, b.createdAt, sortDirection)
        case 'lastUsedAt':
          return compareTimestamps(a.lastUsedAt, b.lastUsedAt, sortDirection)
        default:
          return 0
      }
    })
    entries = sorted.map<ConnectionListEntry>((conn) => ({ kind: 'connection', connection: conn }))
  }

  return { entries, hasActiveFilters }
}

export function useConnectionList(params: UseConnectionListParams): UseConnectionListReturn {
  const { connections, environments, searchText, filterProviders, filterEnvironmentIds, sortField, sortDirection } = params

  const filtered = useMemo(() => {
    const normalizedSearch = searchText.trim().toLocaleLowerCase()
    return connections.filter((conn) => {
      if (normalizedSearch) {
        const matchesName = conn.name.toLocaleLowerCase().includes(normalizedSearch)
        const matchesHost = conn.host.toLocaleLowerCase().includes(normalizedSearch)
        if (!matchesName && !matchesHost) return false
      }
      if (filterProviders.size > 0 && !filterProviders.has(conn.provider)) return false
      if (filterEnvironmentIds.size > 0) {
        const envId = conn.environmentId ?? ''
        if (!filterEnvironmentIds.has(envId)) return false
      }
      return true
    })
  }, [connections, searchText, filterProviders, filterEnvironmentIds])

  const entries = useMemo(() => {
    if (sortField === 'provider') {
      return buildGroupedEntries(
        filtered,
        (conn) => conn.provider,
        (provider) => PROVIDER_METADATA[provider as ConnectionProvider]?.label ?? provider,
        sortDirection
      )
    }
    if (sortField === 'environment') {
      const envMap = new Map(environments.map((e) => [e.id, e.name]))
      return buildGroupedEntries(
        filtered,
        (conn) => conn.environmentId ?? '',
        (envId) => (envId ? (envMap.get(envId) ?? envId) : 'No environment'),
        sortDirection
      )
    }
    const sorted = [...filtered].sort((a, b) => {
      switch (sortField) {
        case 'name': return compareStrings(a.name, b.name, sortDirection)
        case 'createdAt': return compareTimestamps(a.createdAt, b.createdAt, sortDirection)
        case 'lastUsedAt': return compareTimestamps(a.lastUsedAt, b.lastUsedAt, sortDirection)
        default: return 0
      }
    })
    return sorted.map<ConnectionListEntry>((conn) => ({ kind: 'connection', connection: conn }))
  }, [filtered, sortField, sortDirection, environments])

  return { entries, hasActiveFilters: filterProviders.size > 0 || filterEnvironmentIds.size > 0 }
}

/**
 * Groups connections by a key, sorts groups alphabetically, and within each
 * group sorts connections by name (direction applies to the group order, name
 * within a group is always ascending for readability).
 */
function buildGroupedEntries(
  connections: ConnectionRecord[],
  getKey: (conn: ConnectionRecord) => string,
  getLabel: (key: string) => string,
  direction: SortDirection
): ConnectionListEntry[] {
  const groups = new Map<string, ConnectionRecord[]>()
  const NO_ENV_KEY = ''

  for (const conn of connections) {
    const key = getKey(conn)
    const existing = groups.get(key)
    if (existing) {
      existing.push(conn)
    } else {
      groups.set(key, [conn])
    }
  }

  // Sort groups: "No environment" (empty key) always last
  const sortedKeys = [...groups.keys()].sort((a, b) => {
    if (a === NO_ENV_KEY) return 1
    if (b === NO_ENV_KEY) return -1
    const labelA = getLabel(a).toLocaleLowerCase()
    const labelB = getLabel(b).toLocaleLowerCase()
    const order = labelA < labelB ? -1 : labelA > labelB ? 1 : 0
    return direction === 'asc' ? order : -order
  })

  const result: ConnectionListEntry[] = []
  for (const key of sortedKeys) {
    const label = getLabel(key)
    result.push({ kind: 'group-header', id: `group:${key}`, label })
    const groupConns = [...(groups.get(key) ?? [])].sort((a, b) =>
      compareStrings(a.name, b.name, 'asc')
    )
    for (const conn of groupConns) {
      result.push({ kind: 'connection', connection: conn })
    }
  }

  return result
}

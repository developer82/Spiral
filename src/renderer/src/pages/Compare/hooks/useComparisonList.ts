import { useMemo } from 'react'
import type { ComparisonRecord, ComparisonSortField } from '../comparison.types'
import type { ConnectionProvider } from '../../Explorer/connections.types'
import type { SortDirection } from '../../Settings/useSettings'
import { PROVIDER_METADATA } from '../../Explorer/providerMetadata'

export interface UseComparisonListParams {
  comparisons: ComparisonRecord[]
  searchText: string
  filterProviders: Set<ConnectionProvider>
  sortField: ComparisonSortField
  sortDirection: SortDirection
}

export interface UseComparisonListReturn {
  comparisons: ComparisonRecord[]
  hasActiveFilters: boolean
}

function compareStrings(a: string | undefined, b: string | undefined, direction: SortDirection): number {
  const aVal = (a ?? '').toLocaleLowerCase()
  const bVal = (b ?? '').toLocaleLowerCase()
  const order = aVal < bVal ? -1 : aVal > bVal ? 1 : 0
  return direction === 'asc' ? order : -order
}

function compareTimestamps(a: string | undefined, b: string | undefined, direction: SortDirection): number {
  if (!a && !b) return 0
  if (!a) return 1
  if (!b) return -1
  const order = a < b ? -1 : a > b ? 1 : 0
  return direction === 'asc' ? order : -order
}

function getProviderLabel(provider: ConnectionProvider): string {
  return PROVIDER_METADATA[provider]?.label ?? provider
}

export function computeComparisonList({
  comparisons,
  searchText,
  filterProviders,
  sortField,
  sortDirection
}: UseComparisonListParams): UseComparisonListReturn {
  const hasActiveFilters = filterProviders.size > 0

  const normalizedSearch = searchText.trim().toLocaleLowerCase()

  const filtered = comparisons.filter((c) => {
    if (normalizedSearch) {
      const matchesName = c.name.toLocaleLowerCase().includes(normalizedSearch)
      const matchesDescription = c.description.toLocaleLowerCase().includes(normalizedSearch)
      const matchesSourceProvider = getProviderLabel(c.source.provider).toLocaleLowerCase().includes(normalizedSearch)
      const matchesTargetProvider = getProviderLabel(c.target.provider).toLocaleLowerCase().includes(normalizedSearch)
      if (!matchesName && !matchesDescription && !matchesSourceProvider && !matchesTargetProvider) return false
    }

    if (filterProviders.size > 0) {
      const sourceMatch = filterProviders.has(c.source.provider)
      const targetMatch = filterProviders.has(c.target.provider)
      if (!sourceMatch && !targetMatch) return false
    }

    return true
  })

  const sorted = [...filtered].sort((a, b) => {
    switch (sortField) {
      case 'name':
        return compareStrings(a.name, b.name, sortDirection)
      case 'createdAt':
        return compareTimestamps(a.createdAt, b.createdAt, sortDirection)
      case 'updatedAt':
        return compareTimestamps(a.updatedAt, b.updatedAt, sortDirection)
      case 'sourceProvider':
        return compareStrings(getProviderLabel(a.source.provider), getProviderLabel(b.source.provider), sortDirection)
      case 'targetProvider':
        return compareStrings(getProviderLabel(a.target.provider), getProviderLabel(b.target.provider), sortDirection)
      default:
        return 0
    }
  })

  return { comparisons: sorted, hasActiveFilters }
}

export function useComparisonList(params: UseComparisonListParams): UseComparisonListReturn {
  const { comparisons, searchText, filterProviders, sortField, sortDirection } = params

  const filtered = useMemo(() => {
    const normalizedSearch = searchText.trim().toLocaleLowerCase()
    return comparisons.filter((c) => {
      if (normalizedSearch) {
        const matchesName = c.name.toLocaleLowerCase().includes(normalizedSearch)
        const matchesDescription = c.description.toLocaleLowerCase().includes(normalizedSearch)
        const matchesSourceProvider = getProviderLabel(c.source.provider).toLocaleLowerCase().includes(normalizedSearch)
        const matchesTargetProvider = getProviderLabel(c.target.provider).toLocaleLowerCase().includes(normalizedSearch)
        if (!matchesName && !matchesDescription && !matchesSourceProvider && !matchesTargetProvider) return false
      }
      if (filterProviders.size > 0) {
        const sourceMatch = filterProviders.has(c.source.provider)
        const targetMatch = filterProviders.has(c.target.provider)
        if (!sourceMatch && !targetMatch) return false
      }
      return true
    })
  }, [comparisons, searchText, filterProviders])

  const result = useMemo(() => {
    const sorted = [...filtered].sort((a, b) => {
      switch (sortField) {
        case 'name': return compareStrings(a.name, b.name, sortDirection)
        case 'createdAt': return compareTimestamps(a.createdAt, b.createdAt, sortDirection)
        case 'updatedAt': return compareTimestamps(a.updatedAt, b.updatedAt, sortDirection)
        case 'sourceProvider': return compareStrings(getProviderLabel(a.source.provider), getProviderLabel(b.source.provider), sortDirection)
        case 'targetProvider': return compareStrings(getProviderLabel(a.target.provider), getProviderLabel(b.target.provider), sortDirection)
        default: return 0
      }
    })
    return sorted
  }, [filtered, sortField, sortDirection])

  return { comparisons: result, hasActiveFilters: filterProviders.size > 0 }
}

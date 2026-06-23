import { describe, it, expect } from 'vitest'
import { computeComparisonList } from '../useComparisonList'
import type { UseComparisonListParams } from '../useComparisonList'
import type { ComparisonRecord } from '../../comparison.types'

function makeComparison(overrides: Partial<ComparisonRecord> & { id: string; name: string }): ComparisonRecord {
  return {
    description: '',
    source: { connectionId: 'conn-1', databaseName: 'db1', provider: 'postgres' },
    target: { connectionId: 'conn-2', databaseName: 'db2', provider: 'mysql' },
    scopeKeys: [],
    tableKeyMappings: [],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides
  }
}

function compute(params: Partial<UseComparisonListParams> & { comparisons: ComparisonRecord[] }) {
  return computeComparisonList({
    comparisons: params.comparisons,
    searchText: params.searchText ?? '',
    filterProviders: params.filterProviders ?? new Set(),
    sortField: params.sortField ?? 'name',
    sortDirection: params.sortDirection ?? 'asc'
  })
}

const COMPARISONS: ComparisonRecord[] = [
  makeComparison({ id: '1', name: 'Alpha', description: 'prod comparison', source: { connectionId: 'c1', databaseName: 'db', provider: 'postgres' }, target: { connectionId: 'c2', databaseName: 'db', provider: 'mysql' } }),
  makeComparison({ id: '2', name: 'Beta', description: 'staging check', source: { connectionId: 'c3', databaseName: 'db', provider: 'sqlserver' }, target: { connectionId: 'c4', databaseName: 'db', provider: 'postgres' } }),
  makeComparison({ id: '3', name: 'Gamma', description: 'dev environment', source: { connectionId: 'c5', databaseName: 'db', provider: 'sqlite' }, target: { connectionId: 'c6', databaseName: 'db', provider: 'mongodb' } }),
]

describe('useComparisonList – search', () => {
  it('returns all comparisons when search text is empty', () => {
    const { comparisons } = compute({ comparisons: COMPARISONS })
    expect(comparisons).toHaveLength(3)
  })

  it('filters by name (case-insensitive)', () => {
    const { comparisons } = compute({ comparisons: COMPARISONS, searchText: 'alpha' })
    expect(comparisons).toHaveLength(1)
    expect(comparisons[0].id).toBe('1')
  })

  it('filters by description', () => {
    const { comparisons } = compute({ comparisons: COMPARISONS, searchText: 'staging' })
    expect(comparisons).toHaveLength(1)
    expect(comparisons[0].id).toBe('2')
  })

  it('filters by source provider label', () => {
    const { comparisons } = compute({ comparisons: COMPARISONS, searchText: 'SQL Server' })
    expect(comparisons).toHaveLength(1)
    expect(comparisons[0].id).toBe('2')
  })

  it('filters by target provider label', () => {
    const { comparisons } = compute({ comparisons: COMPARISONS, searchText: 'mongodb' })
    expect(comparisons).toHaveLength(1)
    expect(comparisons[0].id).toBe('3')
  })

  it('matches partial text across multiple comparisons', () => {
    const { comparisons } = compute({ comparisons: COMPARISONS, searchText: 'post' })
    // 'Alpha' has postgres source, 'Beta' has postgres target
    expect(comparisons).toHaveLength(2)
    const ids = comparisons.map((c) => c.id)
    expect(ids).toContain('1')
    expect(ids).toContain('2')
  })

  it('returns empty array when no match', () => {
    const { comparisons } = compute({ comparisons: COMPARISONS, searchText: 'zzznomatch' })
    expect(comparisons).toHaveLength(0)
  })
})

describe('useComparisonList – provider filter', () => {
  it('shows comparison when source provider matches', () => {
    const { comparisons } = compute({ comparisons: COMPARISONS, filterProviders: new Set(['postgres']) })
    const ids = comparisons.map((c) => c.id)
    expect(ids).toContain('1') // postgres source
    expect(ids).toContain('2') // postgres target
    expect(ids).not.toContain('3')
  })

  it('shows comparison when target provider matches (either-side semantics)', () => {
    const { comparisons } = compute({ comparisons: COMPARISONS, filterProviders: new Set(['mysql']) })
    expect(comparisons).toHaveLength(1)
    expect(comparisons[0].id).toBe('1') // mysql target
  })

  it('excludes comparison when neither side matches', () => {
    const { comparisons } = compute({ comparisons: COMPARISONS, filterProviders: new Set(['redis']) })
    expect(comparisons).toHaveLength(0)
  })

  it('handles multiple providers in filter set', () => {
    const { comparisons } = compute({ comparisons: COMPARISONS, filterProviders: new Set(['sqlite', 'mongodb']) })
    expect(comparisons).toHaveLength(1)
    expect(comparisons[0].id).toBe('3')
  })

  it('returns all when filter set is empty', () => {
    const { comparisons } = compute({ comparisons: COMPARISONS, filterProviders: new Set() })
    expect(comparisons).toHaveLength(3)
  })
})

describe('useComparisonList – hasActiveFilters', () => {
  it('is false when no providers filtered', () => {
    const { hasActiveFilters } = compute({ comparisons: COMPARISONS })
    expect(hasActiveFilters).toBe(false)
  })

  it('is true when providers are filtered', () => {
    const { hasActiveFilters } = compute({ comparisons: COMPARISONS, filterProviders: new Set(['postgres']) })
    expect(hasActiveFilters).toBe(true)
  })
})

describe('useComparisonList – sort', () => {
  const sortable: ComparisonRecord[] = [
    makeComparison({ id: 'b', name: 'Beta', createdAt: '2024-02-01T00:00:00Z', updatedAt: '2024-03-01T00:00:00Z', source: { connectionId: 'c1', databaseName: 'db', provider: 'mysql' }, target: { connectionId: 'c2', databaseName: 'db', provider: 'sqlserver' } }),
    makeComparison({ id: 'a', name: 'Alpha', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-04-01T00:00:00Z', source: { connectionId: 'c3', databaseName: 'db', provider: 'postgres' }, target: { connectionId: 'c4', databaseName: 'db', provider: 'mongodb' } }),
    makeComparison({ id: 'c', name: 'Gamma', createdAt: '2024-03-01T00:00:00Z', updatedAt: '2024-02-01T00:00:00Z', source: { connectionId: 'c5', databaseName: 'db', provider: 'sqlite' }, target: { connectionId: 'c6', databaseName: 'db', provider: 'redis' } }),
  ]

  it('sorts by name ascending', () => {
    const { comparisons } = compute({ comparisons: sortable, sortField: 'name', sortDirection: 'asc' })
    expect(comparisons.map((c) => c.id)).toEqual(['a', 'b', 'c'])
  })

  it('sorts by name descending', () => {
    const { comparisons } = compute({ comparisons: sortable, sortField: 'name', sortDirection: 'desc' })
    expect(comparisons.map((c) => c.id)).toEqual(['c', 'b', 'a'])
  })

  it('sorts by createdAt ascending', () => {
    const { comparisons } = compute({ comparisons: sortable, sortField: 'createdAt', sortDirection: 'asc' })
    expect(comparisons.map((c) => c.id)).toEqual(['a', 'b', 'c'])
  })

  it('sorts by createdAt descending', () => {
    const { comparisons } = compute({ comparisons: sortable, sortField: 'createdAt', sortDirection: 'desc' })
    expect(comparisons.map((c) => c.id)).toEqual(['c', 'b', 'a'])
  })

  it('sorts by updatedAt ascending', () => {
    const { comparisons } = compute({ comparisons: sortable, sortField: 'updatedAt', sortDirection: 'asc' })
    expect(comparisons.map((c) => c.id)).toEqual(['c', 'b', 'a'])
  })

  it('sorts by updatedAt descending', () => {
    const { comparisons } = compute({ comparisons: sortable, sortField: 'updatedAt', sortDirection: 'desc' })
    expect(comparisons.map((c) => c.id)).toEqual(['a', 'b', 'c'])
  })

  it('sorts by sourceProvider ascending (MySQL < PostgreSQL < SQLite)', () => {
    const { comparisons } = compute({ comparisons: sortable, sortField: 'sourceProvider', sortDirection: 'asc' })
    expect(comparisons.map((c) => c.id)).toEqual(['b', 'a', 'c']) // MySQL, PostgreSQL, SQLite
  })

  it('sorts by sourceProvider descending', () => {
    const { comparisons } = compute({ comparisons: sortable, sortField: 'sourceProvider', sortDirection: 'desc' })
    expect(comparisons.map((c) => c.id)).toEqual(['c', 'a', 'b'])
  })

  it('sorts by targetProvider ascending (MongoDB < Redis < SQL Server)', () => {
    const { comparisons } = compute({ comparisons: sortable, sortField: 'targetProvider', sortDirection: 'asc' })
    expect(comparisons.map((c) => c.id)).toEqual(['a', 'c', 'b']) // MongoDB, Redis, SQL Server
  })

  it('sorts by targetProvider descending', () => {
    const { comparisons } = compute({ comparisons: sortable, sortField: 'targetProvider', sortDirection: 'desc' })
    expect(comparisons.map((c) => c.id)).toEqual(['b', 'c', 'a'])
  })
})

describe('useComparisonList – empty states', () => {
  it('returns empty array for empty input', () => {
    const { comparisons } = compute({ comparisons: [] })
    expect(comparisons).toHaveLength(0)
  })

  it('hasActiveFilters is false for empty input with no filters', () => {
    const { hasActiveFilters } = compute({ comparisons: [] })
    expect(hasActiveFilters).toBe(false)
  })

  it('returns empty when filter removes all results', () => {
    const { comparisons } = compute({ comparisons: COMPARISONS, filterProviders: new Set(['redis']) })
    expect(comparisons).toHaveLength(0)
  })

  it('returns empty when search removes all results', () => {
    const { comparisons } = compute({ comparisons: COMPARISONS, searchText: 'zzznomatch' })
    expect(comparisons).toHaveLength(0)
  })
})

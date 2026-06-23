import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useComparisonReport } from '../useComparisonReport'
import type { ComparisonReportItem } from '../../comparison.types'

function makeItem(overrides: Partial<ComparisonReportItem>): ComparisonReportItem {
  return {
    id: overrides.id ?? 'item-1',
    scopeKey: 'default' as ComparisonReportItem['scopeKey'],
    category: overrides.category ?? 'tables',
    changeType: overrides.changeType ?? 'added',
    objectName: overrides.objectName ?? 'users',
    details: overrides.details ?? [],
    sourceValue: overrides.sourceValue,
    targetValue: overrides.targetValue
  }
}

const ITEMS: ComparisonReportItem[] = [
  makeItem({ id: '1', objectName: 'accounts', category: 'tables', changeType: 'added' }),
  makeItem({ id: '2', objectName: 'users', category: 'tables', changeType: 'removed' }),
  makeItem({ id: '3', objectName: 'orders', category: 'tables', changeType: 'modified' }),
  makeItem({ id: '4', objectName: 'email', category: 'columns', changeType: 'added' }),
  makeItem({ id: '5', objectName: 'age', category: 'columns', changeType: 'unsupported' })
]

function run(
  items: ComparisonReportItem[],
  searchText: string,
  filterChangeTypes: Set<ComparisonReportItem['changeType']>,
  sortDirection: 'asc' | 'desc' = 'asc'
) {
  return renderHook(() =>
    useComparisonReport({ items, searchText, filterChangeTypes, sortDirection })
  ).result.current
}

describe('useComparisonReport', () => {
  describe('search filtering', () => {
    it('returns all items when search is empty', () => {
      const { groupedItems } = run(ITEMS, '', new Set())
      const total = groupedItems.reduce((acc, g) => acc + g.items.length, 0)
      expect(total).toBe(5)
    })

    it('filters by objectName substring (case-insensitive)', () => {
      const { groupedItems } = run(ITEMS, 'acc', new Set())
      expect(groupedItems).toHaveLength(1)
      expect(groupedItems[0].items[0].objectName).toBe('accounts')
    })

    it('returns empty groups when no items match', () => {
      const { groupedItems } = run(ITEMS, 'zzz', new Set())
      expect(groupedItems).toHaveLength(0)
    })

    it('is case-insensitive', () => {
      const { groupedItems } = run(ITEMS, 'USERS', new Set())
      expect(groupedItems[0].items[0].objectName).toBe('users')
    })
  })

  describe('change type filtering', () => {
    it('shows all items when filterChangeTypes is empty', () => {
      const { groupedItems } = run(ITEMS, '', new Set())
      const total = groupedItems.reduce((acc, g) => acc + g.items.length, 0)
      expect(total).toBe(5)
    })

    it('filters to a single change type', () => {
      const { groupedItems } = run(ITEMS, '', new Set(['added']))
      const all = groupedItems.flatMap((g) => g.items)
      expect(all.every((item) => item.changeType === 'added')).toBe(true)
      expect(all).toHaveLength(2)
    })

    it('filters to multiple change types', () => {
      const { groupedItems } = run(ITEMS, '', new Set(['added', 'removed']))
      const all = groupedItems.flatMap((g) => g.items)
      expect(all).toHaveLength(3)
      expect(all.every((item) => ['added', 'removed'].includes(item.changeType))).toBe(true)
    })

    it('combines search and changeType filters', () => {
      const { groupedItems } = run(ITEMS, 'e', new Set(['added']))
      const all = groupedItems.flatMap((g) => g.items)
      expect(all.every((item) => item.changeType === 'added' && item.objectName.includes('e'))).toBe(true)
    })
  })

  describe('sort direction', () => {
    it('sorts items ascending by objectName within each group', () => {
      const { groupedItems } = run(ITEMS, '', new Set(), 'asc')
      const tableGroup = groupedItems.find((g) => g.category === 'tables')!
      const names = tableGroup.items.map((i) => i.objectName)
      expect(names).toEqual([...names].sort())
    })

    it('sorts items descending by objectName within each group', () => {
      const { groupedItems } = run(ITEMS, '', new Set(), 'desc')
      const tableGroup = groupedItems.find((g) => g.category === 'tables')!
      const names = tableGroup.items.map((i) => i.objectName)
      expect(names).toEqual([...names].sort().reverse())
    })
  })

  describe('grouping', () => {
    it('groups items by category and omits empty groups', () => {
      const { groupedItems } = run(ITEMS, '', new Set())
      const categories = groupedItems.map((g) => g.category)
      expect(categories).toContain('tables')
      expect(categories).toContain('columns')
      expect(categories).not.toContain('indexes')
    })

    it('preserves CATEGORY_ORDER for group ordering', () => {
      const { groupedItems } = run(ITEMS, '', new Set())
      const categories = groupedItems.map((g) => g.category)
      expect(categories.indexOf('tables')).toBeLessThan(categories.indexOf('columns'))
    })
  })

  describe('hasActiveFilters', () => {
    it('is false when no filters are set', () => {
      const { hasActiveFilters } = run(ITEMS, '', new Set())
      expect(hasActiveFilters).toBe(false)
    })

    it('is true when searchText is non-empty', () => {
      const { hasActiveFilters } = run(ITEMS, 'x', new Set())
      expect(hasActiveFilters).toBe(true)
    })

    it('is true when filterChangeTypes has entries', () => {
      const { hasActiveFilters } = run(ITEMS, '', new Set(['added']))
      expect(hasActiveFilters).toBe(true)
    })
  })

  it('returns empty groups for an empty items array', () => {
    const { groupedItems, hasActiveFilters } = run([], '', new Set())
    expect(groupedItems).toHaveLength(0)
    expect(hasActiveFilters).toBe(false)
  })
})

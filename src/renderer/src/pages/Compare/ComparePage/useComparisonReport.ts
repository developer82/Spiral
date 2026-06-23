import { useMemo } from 'react'
import type { ComparisonChangeType, ComparisonReportCategory, ComparisonReportItem } from '../comparison.types'

export type ComparisonSortDirection = 'asc' | 'desc'

export const CATEGORY_ORDER: ComparisonReportCategory[] = [
  'tables',
  'columns',
  'foreignKeys',
  'checkConstraints',
  'indexes',
  'triggers',
  'views',
  'storedProcedures',
  'functions',
  'securityUsers',
  'securityRoles',
  'securitySchemas',
  'rows'
]

export interface GroupedReportItems {
  category: ComparisonReportCategory
  items: ComparisonReportItem[]
}

interface UseComparisonReportParams {
  items: ComparisonReportItem[]
  searchText: string
  filterChangeTypes: Set<ComparisonChangeType>
  sortDirection: ComparisonSortDirection
}

interface UseComparisonReportReturn {
  groupedItems: GroupedReportItems[]
  hasActiveFilters: boolean
}

export function useComparisonReport({
  items,
  searchText,
  filterChangeTypes,
  sortDirection
}: UseComparisonReportParams): UseComparisonReportReturn {
  const filteredItems = useMemo(() => {
    const lowerSearch = searchText.toLowerCase()
    return items.filter((item) => {
      if (lowerSearch && !item.objectName.toLowerCase().includes(lowerSearch)) return false
      if (filterChangeTypes.size > 0 && !filterChangeTypes.has(item.changeType)) return false
      return true
    })
  }, [items, searchText, filterChangeTypes])

  const groupedItems = useMemo(() => {
    return CATEGORY_ORDER.map((category) => {
      const categoryItems = filteredItems
        .filter((item) => item.category === category)
        .slice()
        .sort((a, b) => {
          const cmp = a.objectName.localeCompare(b.objectName)
          return sortDirection === 'asc' ? cmp : -cmp
        })
      return { category, items: categoryItems }
    }).filter((group) => group.items.length > 0)
  }, [filteredItems, sortDirection])

  const hasActiveFilters = searchText !== '' || filterChangeTypes.size > 0

  return { groupedItems, hasActiveFilters }
}

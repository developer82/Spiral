import { useRef, useState, useEffect, useCallback, memo, type JSX, type ReactNode } from 'react'
import { Key, ArrowRight, Filter } from 'lucide-react'
import type { SortIndicator } from '../QueryEditor/sortIndicators'
import { resolveBooleanLabel } from '../booleanPill'

// Row height must match the CSS: padding (0.5rem * 2 = 16px) + border (1px) + line height (~16px) ≈ 33px
const ROW_HEIGHT = 33
// Extra rows rendered above and below the visible window
const OVERSCAN = 20

interface ColumnKeyMeta {
  isPrimaryKey: boolean
  isForeignKey: boolean
  isNullable?: boolean
  isBoolean?: boolean
}

interface VirtualResultsTableProps {
  columns: string[]
  rows: Record<string, unknown>[]
  columnKeyMeta?: Array<ColumnKeyMeta | null>
  sortIndicatorsMap: Record<string, SortIndicator>
  sortedCount: number
  filteredColumns?: Set<string>
  uppercaseHeaders: boolean
  showGridLines?: boolean
  useInteractiveTables: boolean
  onColumnSort?: (columnName: string) => void
  onColumnContextMenu?: (columnName: string, position: { x: number; y: number }) => void
  selectedRowIndices?: Set<number>
  onRowSelect?: (index: number, selected: boolean) => void
  onSelectAll?: (selected: boolean) => void
  onBooleanCellClick?: (columnName: string, row: Record<string, unknown>, rowIndex: number) => void
  onBooleanCellRightClick?: (columnName: string, row: Record<string, unknown>, rowIndex: number, position: { x: number; y: number }) => void
  loadingBoolCell?: { colName: string; rowIndex: number }
  onRowDoubleClick?: (row: Record<string, unknown>, rowIndex: number) => void
  onRowContextMenu?: (row: Record<string, unknown>, rowIndex: number, position: { x: number; y: number }) => void
}

const VirtualResultsTable = memo(function VirtualResultsTable({
  columns,
  rows,
  columnKeyMeta,
  sortIndicatorsMap,
  sortedCount,
  filteredColumns,
  uppercaseHeaders,
  showGridLines = false,
  useInteractiveTables,
  onColumnSort,
  onColumnContextMenu,
  selectedRowIndices,
  onRowSelect,
  onSelectAll,
  onBooleanCellClick,
  onBooleanCellRightClick,
  loadingBoolCell,
  onRowDoubleClick,
  onRowContextMenu
}: VirtualResultsTableProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const scrollTopRef = useRef(0)
  const rafRef = useRef<number | null>(null)
  const selectAllCheckboxRef = useRef<HTMLInputElement>(null)
  // A tick counter that triggers a re-render when the scroll position changes
  const [, setTick] = useState(0)

  const showCheckboxes = selectedRowIndices !== undefined && onRowSelect !== undefined

  // Keep the select-all checkbox's indeterminate state in sync
  useEffect(() => {
    if (!selectAllCheckboxRef.current || !showCheckboxes) return
    const selectedCount = selectedRowIndices?.size ?? 0
    const totalCount = rows.length
    selectAllCheckboxRef.current.indeterminate = selectedCount > 0 && selectedCount < totalCount
  })

  // Clean up any pending animation frame on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  const handleScroll = useCallback((): void => {
    if (rafRef.current !== null) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      scrollTopRef.current = containerRef.current?.scrollTop ?? 0
      setTick((t) => t + 1)
    })
  }, [])

  // Get container height directly from DOM — always current after mount
  const containerHeight = containerRef.current?.clientHeight ?? 400
  const scrollTop = scrollTopRef.current

  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN)
  const endIndex = Math.min(rows.length, Math.ceil((scrollTop + containerHeight) / ROW_HEIGHT) + OVERSCAN)

  const topPadding = startIndex * ROW_HEIGHT
  const bottomPadding = Math.max(0, (rows.length - endIndex) * ROW_HEIGHT)

  return (
    <div
      ref={containerRef}
      className="query-results__virtual-scroll"
      onScroll={handleScroll}
    >
      <table
        className={`query-results__table${uppercaseHeaders ? ' query-results__table--uppercase-headers' : ''}${showGridLines ? ' query-results__table--grid-lines' : ''}`}
      >
        <thead>
          <tr>
            <th className="query-results__th query-results__th--row-num">#</th>
            {showCheckboxes && (
              <th className="query-results__th query-results__th--checkbox">
                <input
                  ref={selectAllCheckboxRef}
                  type="checkbox"
                  className="query-results__row-checkbox"
                  aria-label="Select all rows"
                  checked={rows.length > 0 && (selectedRowIndices?.size ?? 0) === rows.length}
                  onChange={(e) => onSelectAll?.(e.target.checked)}
                />
              </th>
            )}
            {columns.map((col, colIdx) => {
              const keyMeta = columnKeyMeta?.[colIdx] ?? null
              const indicator =
                sortIndicatorsMap[col] ??
                Object.entries(sortIndicatorsMap).find(
                  ([k]) => k.toLowerCase() === col.toLowerCase()
                )?.[1] ??
                null
              const isFiltered =
                filteredColumns?.has(col) ||
                (filteredColumns != null &&
                  [...filteredColumns].some((k) => k.toLowerCase() === col.toLowerCase()))
              const hasMeta = keyMeta !== null || indicator !== null || isFiltered
              const isSortable = useInteractiveTables && onColumnSort != null
              const thClass = `query-results__th${isSortable ? ' query-results__th--sortable' : ''}`
              return (
                <th
                  key={col}
                  className={thClass}
                  onClick={isSortable ? () => onColumnSort(col) : undefined}
                  onContextMenu={
                    isSortable && indicator !== null && onColumnContextMenu != null
                      ? (e) => {
                          e.preventDefault()
                          onColumnContextMenu(col, { x: e.clientX, y: e.clientY })
                        }
                      : undefined
                  }
                >
                  {hasMeta ? (
                    <span className="query-results__th-content">
                      {keyMeta?.isPrimaryKey && (
                        <Key size={10} className="query-results__pk-icon" />
                      )}
                      {keyMeta && !keyMeta.isPrimaryKey && keyMeta.isForeignKey && (
                        <ArrowRight size={10} className="query-results__fk-icon" />
                      )}
                      {col}
                      {isFiltered && (
                        <Filter size={9} className="query-results__filter-icon" />
                      )}
                      {indicator && (
                        <span className="query-results__sort-arrow">
                          {indicator.sortType === 'ASC' ? '▲' : '▼'}
                        </span>
                      )}
                      {indicator && sortedCount > 1 && (
                        <span className="query-results__sort-badge">{indicator.sortOrder}</span>
                      )}
                    </span>
                  ) : (
                    col
                  )}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {topPadding > 0 && (
            <tr aria-hidden="true">
              <td style={{ height: topPadding, padding: 0 }} colSpan={columns.length + 1 + (showCheckboxes ? 1 : 0)} />
            </tr>
          )}
          {rows.slice(startIndex, endIndex).map((row, i) => {
            const absIndex = startIndex + i
            const isSelected = selectedRowIndices?.has(absIndex) ?? false
            return (
              <tr
                key={absIndex}
                className={`${absIndex % 2 === 1 ? 'query-results__tr--alt' : ''}${isSelected ? ' query-results__tr--selected' : ''}${onRowDoubleClick ? ' query-results__tr--clickable' : ''}`}
                onDoubleClick={onRowDoubleClick ? () => onRowDoubleClick(row, absIndex) : undefined}
                onContextMenu={onRowContextMenu ? (e) => { e.preventDefault(); onRowContextMenu(row, absIndex, { x: e.clientX, y: e.clientY }) } : undefined}
              >
                <td className="query-results__td query-results__td--row-num">{absIndex + 1}</td>
                {showCheckboxes && (
                  <td className="query-results__td query-results__td--checkbox">
                    <input
                      type="checkbox"
                      className="query-results__row-checkbox"
                      aria-label={`Select row ${absIndex + 1}`}
                      checked={isSelected}
                      onChange={(e) => {
                        e.stopPropagation()
                        onRowSelect(absIndex, e.target.checked)
                      }}
                    />
                  </td>
                )}
                {columns.map((col, colIdx) => {
                  const colMeta = columnKeyMeta?.[colIdx]
                  const val = row[col]
                  const isNull = val === null || val === undefined
                  const isBoolVal = typeof val === 'boolean'
                  const isInteractiveBoolCol = useInteractiveTables && colMeta?.isBoolean === true
                  const hasClickHandler = isInteractiveBoolCol && onBooleanCellClick !== undefined
                  const isLoading =
                    loadingBoolCell?.colName === col && loadingBoolCell?.rowIndex === absIndex

                  let innerContent: ReactNode
                  if (isNull) {
                    innerContent = <span className="query-results__null">NULL</span>
                  } else if (useInteractiveTables && isBoolVal) {
                    const pillClass = [
                      'query-results__bool-pill',
                      `query-results__bool-pill--${val ? 'true' : 'false'}`,
                      isLoading ? 'query-results__bool-pill--loading' : ''
                    ].filter(Boolean).join(' ')
                    innerContent = <span className={pillClass}>{resolveBooleanLabel(col, val)}</span>
                  } else {
                    innerContent = String(val)
                  }

                  if (hasClickHandler) {
                    const hasRightClick =
                      !isNull &&
                      isBoolVal &&
                      colMeta?.isNullable === true &&
                      onBooleanCellRightClick !== undefined
                    return (
                      <td key={col} className="query-results__td">
                        <button
                          className="query-results__bool-pill-btn"
                          onClick={() => onBooleanCellClick!(col, row, absIndex)}
                          onContextMenu={
                            hasRightClick
                              ? (e) => {
                                  e.preventDefault()
                                  e.stopPropagation()
                                  onBooleanCellRightClick!(col, row, absIndex, { x: e.clientX, y: e.clientY })
                                }
                              : undefined
                          }
                        >
                          {innerContent}
                        </button>
                      </td>
                    )
                  }

                  return <td key={col} className="query-results__td">{innerContent}</td>
                })}
              </tr>
            )
          })}
          {bottomPadding > 0 && (
            <tr aria-hidden="true">
              <td style={{ height: bottomPadding, padding: 0 }} colSpan={columns.length + 1 + (showCheckboxes ? 1 : 0)} />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
})

export default VirtualResultsTable

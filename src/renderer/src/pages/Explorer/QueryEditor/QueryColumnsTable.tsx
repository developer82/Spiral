import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import type { ColumnConfig, SortType } from './queryEditorTypes'
import './QueryColumnsTable.css'

interface QueryColumnsTableProps {
  columns: ColumnConfig[]
  onChange: (updated: ColumnConfig[]) => void
  /** When false, Sort Type and Sort Order columns are hidden. Defaults to true. */
  showSort?: boolean
}

const SORT_OPTIONS: { value: SortType; label: string }[] = [
  { value: 'UNSORTED', label: 'Unsorted' },
  { value: 'ASC', label: 'Ascending' },
  { value: 'DESC', label: 'Descending' }
]

/** Compact sort orders of sorted columns so they are always 1..N with no gaps. */
function compactSortOrders(cols: ColumnConfig[]): ColumnConfig[] {
  const sorted = cols
    .map((c, i) => ({ i, sortOrder: c.sortOrder }))
    .filter(({ i }) => cols[i].sortType !== 'UNSORTED' && cols[i].sortOrder > 0)
    .sort((a, b) => a.sortOrder - b.sortOrder)
  const next = cols.map((c) => ({ ...c }))
  sorted.forEach(({ i }, pos) => {
    next[i] = { ...next[i], sortOrder: pos + 1 }
  })
  return next
}

export default function QueryColumnsTable({ columns, onChange, showSort = true }: QueryColumnsTableProps) {
  const { t } = useTranslation()

  const sortedCount = columns.filter((c) => c.sortType !== 'UNSORTED').length

  const handleSortTypeChange = useCallback(
    (index: number, st: SortType) => {
      let next = columns.map((c, i) =>
        i === index
          ? { ...c, sortType: st, sortOrder: st === 'UNSORTED' ? 0 : c.sortOrder }
          : c
      )
      if (st === 'UNSORTED') {
        // Column leaves the sort; compact remaining
        next = compactSortOrders(next)
      } else if (columns[index].sortType === 'UNSORTED') {
        // Column newly joins the sort; append at the end
        const newCount = next.filter((c) => c.sortType !== 'UNSORTED').length
        next = next.map((c, i) => (i === index ? { ...c, sortOrder: newCount } : c))
      }
      onChange(next)
    },
    [columns, onChange]
  )

  const handleSortOrderChange = useCallback(
    (index: number, newOrder: number) => {
      // Build ordered list of sorted-column indices by current sortOrder
      const sortedEntries = columns
        .map((c, i) => ({ i, sortOrder: c.sortOrder }))
        .filter(({ i }) => columns[i].sortType !== 'UNSORTED' && columns[i].sortOrder > 0)
        .sort((a, b) => a.sortOrder - b.sortOrder)

      // Remove the column being changed from the list, then insert at newOrder position (1-based)
      const without = sortedEntries.filter((e) => e.i !== index)
      without.splice(newOrder - 1, 0, { i: index, sortOrder: newOrder })

      // Reassign 1..N in the new order
      const next = columns.map((c) => ({ ...c }))
      without.forEach(({ i }, pos) => {
        next[i] = { ...next[i], sortOrder: pos + 1 }
      })
      onChange(next)
    },
    [columns, onChange]
  )

  const update = useCallback(
    (index: number, patch: Partial<ColumnConfig>) => {
      const next = columns.map((c, i) => (i === index ? { ...c, ...patch } : c))
      onChange(next)
    },
    [columns, onChange]
  )

  return (
    <div className="qct">
      <table className="qct__table" aria-label={t('explorer.manageViews.queryEditor.columnsTable')}>
        <thead>
          <tr>
            <th className="qct__th qct__th--col">{t('explorer.manageViews.queryEditor.colColumn')}</th>
            <th className="qct__th qct__th--alias">{t('explorer.manageViews.queryEditor.colAlias')}</th>
            <th className="qct__th qct__th--table">{t('explorer.manageViews.queryEditor.colTable')}</th>
            <th className="qct__th qct__th--output">{t('explorer.manageViews.queryEditor.colOutput')}</th>
            {showSort && <th className="qct__th qct__th--sorttype">{t('explorer.manageViews.queryEditor.colSortType')}</th>}
            {showSort && <th className="qct__th qct__th--sortorder">{t('explorer.manageViews.queryEditor.colSortOrder')}</th>}
            <th className="qct__th qct__th--filter">{t('explorer.manageViews.queryEditor.colFilter')}</th>
          </tr>
        </thead>
        <tbody>
          {columns.length === 0 ? (
            <tr>
              <td colSpan={showSort ? 7 : 5} className="qct__empty">
                {t('explorer.manageViews.queryEditor.columnsEmpty')}
              </td>
            </tr>
          ) : (
            columns.map((col, i) => (
              <tr
                key={`${col.tableSchema}.${col.tableName}.${col.columnName}`}
                className={`qct__row${col.output ? '' : ' qct__row--hidden'}`}
              >
                {/* Column name (readonly) */}
                <td className="qct__td qct__td--col">
                  <span className="qct__col-name">{col.columnName}</span>
                </td>

                {/* Alias */}
                <td className="qct__td qct__td--alias">
                  <input
                    type="text"
                    className="qct__input"
                    value={col.alias}
                    placeholder={col.columnName}
                    onChange={(e) => update(i, { alias: e.target.value })}
                    aria-label={`Alias for ${col.columnName}`}
                  />
                </td>

                {/* Table (readonly) */}
                <td className="qct__td qct__td--table">
                  <span className="qct__table-ref">
                    {col.tableSchema}.{col.tableName}
                  </span>
                </td>

                {/* Output */}
                <td className="qct__td qct__td--output">
                  <input
                    type="checkbox"
                    className="qct__checkbox"
                    checked={col.output}
                    onChange={(e) => update(i, { output: e.target.checked })}
                    aria-label={`Include ${col.columnName} in output`}
                  />
                </td>

                {/* Sort type */}
                {showSort && (
                  <td className="qct__td qct__td--sorttype">
                    <select
                      className="qct__select"
                      value={col.sortType}
                      onChange={(e) => handleSortTypeChange(i, e.target.value as SortType)}
                      aria-label={`Sort type for ${col.columnName}`}
                    >
                      {SORT_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </td>
                )}

                {/* Sort order */}
                {showSort && (
                  <td className="qct__td qct__td--sortorder">
                    <select
                      className="qct__select"
                      value={col.sortOrder}
                      disabled={col.sortType === 'UNSORTED'}
                      onChange={(e) => handleSortOrderChange(i, Number(e.target.value))}
                      aria-label={`Sort order for ${col.columnName}`}
                    >
                      <option value={0}>—</option>
                      {Array.from({ length: sortedCount }, (_, k) => k + 1).map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </td>
                )}

                {/* Filter */}
                <td className="qct__td qct__td--filter">
                  <input
                    type="text"
                    className="qct__input"
                    value={col.filter}
                    placeholder="= 'value'"
                    onChange={(e) => update(i, { filter: e.target.value })}
                    aria-label={`Filter for ${col.columnName}`}
                  />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

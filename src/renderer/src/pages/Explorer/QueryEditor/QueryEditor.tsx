import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  useLayoutEffect,
  type JSX
} from 'react'
import MonacoEditor, { type BeforeMount, type OnMount } from '@monaco-editor/react'
import type * as Monaco from 'monaco-editor'
import { Play, AlertTriangle, RefreshCw, Filter } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ErdSchema } from '../erd.types'
import type { SelectedTable, ColumnConfig, ErdRelationship } from './queryEditorTypes'
import { buildSortIndicators, buildFilteredColumns, type SortIndicator } from './sortIndicators'
import type { ErdTable } from '../erd.types'
import { generateSQL } from './sqlGenerator'
import { parseSQL } from './sqlParser'
import QueryTableCanvas from './QueryTableCanvas'
import QueryColumnsTable from './QueryColumnsTable'
import '../MonacoEditor/monacoSetup'
import { defineMonacoThemes, resolveMonacoTheme } from '../MonacoEditor/monacoThemes'
import './QueryEditor.css'
import './QueryTableCanvas.css'
import './QueryColumnsTable.css'

export interface QueryEditorProps {
  connectionId: string
  databaseName: string
  /** Initial SQL to populate on first render */
  initialSQL?: string
  /** Called whenever the SQL changes */
  onChange?: (sql: string) => void
  /** Whether the Add Table panel is open (controlled by parent) */
  addTablePanelOpen: boolean
  /** Called when the panel open state should change */
  onAddTablePanelOpenChange: (open: boolean) => void
  /** Whether to show Sort Type / Sort Order columns in the column config table. Defaults to true. */
  showSort?: boolean
}

// ─── Monaco theme helpers ────────────────────────────────────────────────────

const handleBeforeMount: BeforeMount = (monaco) => {
  defineMonacoThemes(monaco)
}

// ─── Resizer divider ─────────────────────────────────────────────────────────

type ResizerTarget = 'canvasCols' | 'colsSql' | 'sqlResults'

const MIN_SECTION_PX = 60

// ─── QueryEditor ─────────────────────────────────────────────────────────────

type ResultRow = Record<string, unknown>

interface QueryResult {
  columns: string[]
  rows: ResultRow[]
  rowCount: number
  executionTime?: number
  sortIndicators: Record<string, SortIndicator>
  filteredColumns: Set<string>
}

export default function QueryEditor({
  connectionId,
  databaseName,
  initialSQL = '',
  onChange,
  addTablePanelOpen,
  onAddTablePanelOpenChange,
  showSort = true
}: QueryEditorProps): JSX.Element {
  const { t } = useTranslation()

  // ── State ──────────────────────────────────────────────────────────────────
  const [erdSchema, setErdSchema] = useState<ErdSchema | null>(null)
  const [erdLoading, setErdLoading] = useState(true)
  const [erdError, setErdError] = useState<string | null>(null)

  const [selectedTables, setSelectedTables] = useState<SelectedTable[]>([])
  const [columnConfigs, setColumnConfigs] = useState<ColumnConfig[]>([])
  const [sqlQuery, setSqlQuery] = useState(initialSQL)
  const [isSyncedWithUI, setIsSyncedWithUI] = useState(true)

  const [monacoTheme, setMonacoTheme] = useState(resolveMonacoTheme)

  // Results panel
  const [isRunning, setIsRunning] = useState(false)
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null)
  const [queryError, setQueryError] = useState<string | null>(null)

  // ── Panel heights (% of total container height) ───────────────────────────
  // canvas | columns | sql | results (only when results visible)
  const [panelHeights, setPanelHeights] = useState({ canvas: 33, columns: 22, sql: 25, results: 20 })
  const containerRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ target: ResizerTarget; startY: number; startHeights: typeof panelHeights } | null>(null)

  // Track whether we are programmatically updating the editor (to avoid loops)
  const isUpdatingEditorRef = useRef(false)
  // Ref to the Monaco editor instance for imperative updates
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null)
  // Tracks the last value that came from user typing so external changes can be detected
  const lastInternalValueRef = useRef(sqlQuery)

  // ── Drag-resize logic ──────────────────────────────────────────────────────
  const startResize = useCallback((target: ResizerTarget, e: React.MouseEvent) => {
    e.preventDefault()
    dragRef.current = { target, startY: e.clientY, startHeights: { ...panelHeights } }

    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current || !containerRef.current) return
      const totalH = containerRef.current.getBoundingClientRect().height
      const deltaPct = ((ev.clientY - dragRef.current.startY) / totalH) * 100
      const h = { ...dragRef.current.startHeights }

      // Redistibute between the two adjacent sections
      switch (dragRef.current.target) {
        case 'canvasCols': {
          const newCanvas = Math.max(MIN_SECTION_PX / totalH * 100, h.canvas + deltaPct)
          const newCols = Math.max(MIN_SECTION_PX / totalH * 100, h.columns - deltaPct)
          const diff = (h.canvas + h.columns) - (newCanvas + newCols)
          setPanelHeights((prev) => ({ ...prev, canvas: newCanvas + diff / 2, columns: newCols + diff / 2 }))
          break
        }
        case 'colsSql': {
          const newCols = Math.max(MIN_SECTION_PX / totalH * 100, h.columns + deltaPct)
          const newSql = Math.max(MIN_SECTION_PX / totalH * 100, h.sql - deltaPct)
          const diff = (h.columns + h.sql) - (newCols + newSql)
          setPanelHeights((prev) => ({ ...prev, columns: newCols + diff / 2, sql: newSql + diff / 2 }))
          break
        }
        case 'sqlResults': {
          const newSql = Math.max(MIN_SECTION_PX / totalH * 100, h.sql + deltaPct)
          const newResults = Math.max(MIN_SECTION_PX / totalH * 100, h.results - deltaPct)
          const diff = (h.sql + h.results) - (newSql + newResults)
          setPanelHeights((prev) => ({ ...prev, sql: newSql + diff / 2, results: newResults + diff / 2 }))
          break
        }
      }
    }

    const onUp = () => {
      dragRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [panelHeights])

  // ── Load ERD schema ────────────────────────────────────────────────────────
  useEffect(() => {
    void (async () => {
      setErdLoading(true)
      setErdError(null)
      const result = await window.api.database.getErdSchema(connectionId, databaseName)
      setErdLoading(false)
      if (result.status === 'ok') {
        setErdSchema(result.schema)
      } else {
        setErdError(result.message)
      }
    })()
  }, [connectionId, databaseName])

  // ── Parse initialSQL when schema is loaded ─────────────────────────────────
  // Use a ref flag so we only parse once (avoids re-parsing on every
  // user-edit that flows back through onChange → setEditSQL → initialSQL).
  const initialParseDoneRef = useRef(false)

  useEffect(() => {
    if (initialParseDoneRef.current || !erdSchema || !initialSQL) return
    initialParseDoneRef.current = true
    const parsed = parseSQL(initialSQL, erdSchema.tables, erdSchema.relationships)
    if (parsed) {
      setSelectedTables(parsed.tables)
      setColumnConfigs(parsed.columnConfigs.filter((c) => c.output))
      setSqlQuery(initialSQL)
      setIsSyncedWithUI(true)
    } else {
      setIsSyncedWithUI(false)
    }
  }, [erdSchema, initialSQL])

  // ── Theme observer ─────────────────────────────────────────────────────────
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setMonacoTheme(resolveMonacoTheme())
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])

  // ── Build checkedColumns set ───────────────────────────────────────────────
  const checkedColumns = useMemo(() => {
    const s = new Set<string>()
    for (const col of columnConfigs) {
      if (col.output) {
        s.add(`${col.tableSchema}.${col.tableName}.${col.columnName}`)
      }
    }
    return s
  }, [columnConfigs])

  // ── Relationships for current selected tables ──────────────────────────────
  const relationships: ErdRelationship[] = useMemo(() => {
    return erdSchema?.relationships ?? []
  }, [erdSchema])

  // ── Available tables for canvas ────────────────────────────────────────────
  const allTables: ErdTable[] = useMemo(() => {
    return erdSchema?.tables ?? []
  }, [erdSchema])

  // ── Rebuild SQL when UI state changes ─────────────────────────────────────
  const rebuildSQL = useCallback(
    (tables: SelectedTable[], columns: ColumnConfig[], rels: ErdRelationship[]) => {
      const sql = generateSQL(tables, columns, rels)
      isUpdatingEditorRef.current = true
      setSqlQuery(sql)
      setIsSyncedWithUI(true)
      onChange?.(sql)
      // Reset flag after React flushes
      requestAnimationFrame(() => {
        isUpdatingEditorRef.current = false
      })
    },
    [onChange]
  )

  // ── Add tables from canvas ─────────────────────────────────────────────────
  const handleAddTables = useCallback(
    (newTables: ErdTable[]) => {
      setSelectedTables((prev) => {
        const existingKeys = new Set(prev.map((t) => `${t.schema}.${t.name}`))
        const toAdd: SelectedTable[] = newTables
          .filter((t) => !existingKeys.has(`${t.schema}.${t.name}`))
          .map((t, i) => ({
            schema: t.schema,
            name: t.name,
            alias: `t${prev.length + i + 1}`,
            columns: t.columns
          }))
        const next = [...prev, ...toAdd]

        setColumnConfigs((prevCols) => {
          // Don't pre-populate columns; user selects them via ERD checkboxes
          rebuildSQL(next, prevCols, relationships)
          return prevCols
        })

        return next
      })
    },
    [relationships, rebuildSQL]
  )

  // ── Remove table ───────────────────────────────────────────────────────────
  const handleRemoveTable = useCallback(
    (schema: string, name: string) => {
      setSelectedTables((prev) => {
        const next = prev.filter((t) => !(t.schema === schema && t.name === name))
        setColumnConfigs((prevCols) => {
          const nextCols = prevCols.filter(
            (c) => !(c.tableSchema === schema && c.tableName === name)
          )
          rebuildSQL(next, nextCols, relationships)
          return nextCols
        })
        return next
      })
    },
    [relationships, rebuildSQL]
  )

  // ── Column checkbox toggle ─────────────────────────────────────────────────
  const handleColumnToggle = useCallback(
    (tableSchema: string, tableName: string, columnName: string, checked: boolean) => {
      setSelectedTables((tables) => {
        const tableEntry = tables.find((t) => t.schema === tableSchema && t.name === tableName)
        setColumnConfigs((prev) => {
          let next: ColumnConfig[]
          if (checked) {
            // Add the column if not already present
            const alreadyExists = prev.some(
              (c) => c.tableSchema === tableSchema && c.tableName === tableName && c.columnName === columnName
            )
            if (alreadyExists) return prev
            const col = tableEntry?.columns.find((c) => c.name === columnName)
            const alias = tableEntry?.alias ?? 't1'
            next = [
              ...prev,
              {
                tableSchema,
                tableName,
                tableAlias: alias,
                columnName: col?.name ?? columnName,
                alias: '',
                output: true,
                sortType: 'UNSORTED',
                sortOrder: 0,
                filter: ''
              }
            ]
          } else {
            // Remove the column
            next = prev.filter(
              (c) => !(c.tableSchema === tableSchema && c.tableName === tableName && c.columnName === columnName)
            )
          }
          rebuildSQL(tables, next, relationships)
          return next
        })
        return tables
      })
    },
    [relationships, rebuildSQL]
  )

  // ── Column config table changes ────────────────────────────────────────────
  const handleColumnsChange = useCallback(
    (updated: ColumnConfig[]) => {
      // If a row's output was unchecked via the table, remove it entirely to stay
      // in sync with the ERD checkboxes (which are driven by columnConfigs)
      const filtered = updated.filter((c) => c.output)
      setColumnConfigs(filtered)
      setSelectedTables((tables) => {
        rebuildSQL(tables, filtered, relationships)
        return tables
      })
    },
    [relationships, rebuildSQL]
  )

  // Apply external sqlQuery changes (from rebuildSQL) to the editor imperatively.
  // Skips values that already originated from the user typing to avoid resetting cursor position.
  useLayoutEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    const model = editor.getModel()
    if (!model || sqlQuery === model.getValue()) return
    lastInternalValueRef.current = sqlQuery
    editor.setValue(sqlQuery)
  }, [sqlQuery])

  const handleMount: OnMount = (editor) => {
    editorRef.current = editor
  }

  // ── Monaco editor change ───────────────────────────────────────────────────
  const handleSQLChange = useCallback(
    (value: string | undefined) => {
      if (isUpdatingEditorRef.current) return
      const sql = value ?? ''
      lastInternalValueRef.current = sql
      setSqlQuery(sql)
      onChange?.(sql)

      if (erdSchema) {
        const parsed = parseSQL(sql, erdSchema.tables, erdSchema.relationships)
        if (parsed) {
          setSelectedTables(parsed.tables)
          // Only keep output:true entries — columns explicitly selected in the query
          setColumnConfigs(parsed.columnConfigs.filter((c) => c.output))
          setIsSyncedWithUI(true)
        } else {
          setIsSyncedWithUI(false)
        }
      }
    },
    [erdSchema, onChange]
  )

  // ── Run query ──────────────────────────────────────────────────────────────
  const handleRunQuery = useCallback(async () => {
    if (!sqlQuery.trim() || isRunning) return
    setIsRunning(true)
    setQueryError(null)
    // Snapshot sort and filter state before the async call so it matches the query being run
    const sortIndicators = buildSortIndicators(columnConfigs, isSyncedWithUI)
    const filteredColumns = buildFilteredColumns(columnConfigs, isSyncedWithUI)
    const start = Date.now()
    const sqlWithContext = `USE [${databaseName}];\n${sqlQuery}`
    const result = await window.api.database.executeQuery(connectionId, sqlWithContext)
    const elapsed = Date.now() - start
    setIsRunning(false)

    if (result.status === 'error') {
      setQueryError(result.message)
      setQueryResult(null)
      return
    }

    const firstSet = result.resultSets?.[0]
    if (firstSet) {
      setQueryResult({
        columns: firstSet.columns,
        rows: firstSet.rows,
        rowCount: firstSet.rows.length,
        executionTime: elapsed,
        sortIndicators,
        filteredColumns
      })
    } else {
      setQueryResult({ columns: [], rows: [], rowCount: 0, executionTime: elapsed, sortIndicators: {}, filteredColumns: new Set() })
    }
  }, [connectionId, sqlQuery, isRunning, columnConfigs, isSyncedWithUI])

  // ─── Render ────────────────────────────────────────────────────────────────

  if (erdLoading) {
    return (
      <div className="qe qe--loading">
        <RefreshCw size={16} className="qe__loading-icon" />
        <span>{t('explorer.manageViews.queryEditor.loadingSchema')}</span>
      </div>
    )
  }

  if (erdError) {
    return (
      <div className="qe qe--error">
        <AlertTriangle size={16} />
        <span>{erdError}</span>
      </div>
    )
  }

  const hasResults = queryResult !== null || queryError !== null

  return (
    <div className="qe" ref={containerRef}>
      {/* ── ERD canvas pane ── */}
      <div className="qe__canvas-pane" style={{ '--qe-h': `${panelHeights.canvas}%` } as React.CSSProperties}>
        <QueryTableCanvas
          tables={selectedTables}
          allTables={allTables}
          relationships={relationships}
          onAddTables={handleAddTables}
          onRemoveTable={handleRemoveTable}
          onColumnToggle={handleColumnToggle}
          checkedColumns={checkedColumns}
          addPanelOpen={addTablePanelOpen}
          onAddPanelOpenChange={onAddTablePanelOpenChange}
        />
      </div>

      <div className="qe__resizer" onMouseDown={(e) => startResize('canvasCols', e)} />

      {/* ── Column config table pane ── */}
      <div className="qe__cols-pane" style={{ '--qe-h': `${panelHeights.columns}%` } as React.CSSProperties}>
        {!isSyncedWithUI && (
          <div className="qe__sync-warning">
            <AlertTriangle size={13} />
            {t('explorer.manageViews.queryEditor.syncWarning')}
          </div>
        )}
        <QueryColumnsTable columns={columnConfigs} onChange={handleColumnsChange} showSort={showSort} />
      </div>

      <div className="qe__resizer" onMouseDown={(e) => startResize('colsSql', e)} />

      {/* ── SQL editor pane ── */}
      <div className="qe__sql-pane" style={{ '--qe-h': `${hasResults ? panelHeights.sql : panelHeights.sql + panelHeights.results}%` } as React.CSSProperties}>
        <div className="qe__sql-toolbar">
          <span className="qe__sql-label">SQL</span>
          <button
            className="qe__run-btn"
            onClick={handleRunQuery}
            disabled={isRunning || !sqlQuery.trim()}
            title={t('explorer.manageViews.queryEditor.runQuery')}
          >
            {isRunning ? (
              <RefreshCw size={13} className="qe__run-spin" />
            ) : (
              <Play size={13} />
            )}
            {t('explorer.manageViews.queryEditor.runQuery')}
          </button>
        </div>
        <div className="qe__monaco-wrap">
          <MonacoEditor
            language="sql"
            theme={monacoTheme}
            defaultValue={sqlQuery}
            beforeMount={handleBeforeMount}
            onMount={handleMount}
            onChange={handleSQLChange}
            options={{
              fontSize: 13,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              lineNumbers: 'on',
              renderLineHighlight: 'line',
              padding: { top: 8, bottom: 8 }
            }}
          />
        </div>
      </div>

      {/* ── Results panel (only shown after a query runs) ── */}
      {hasResults && (
        <>
        <div className="qe__resizer" onMouseDown={(e) => startResize('sqlResults', e)} />
        <div className="qe__results" style={{ '--qe-h': `${panelHeights.results}%` } as React.CSSProperties}>
          <div className="qe__results-header">
            {t('explorer.manageViews.queryEditor.results')}
            {queryResult !== null && (
              <span className="qe__results-count">
                {queryResult.rowCount} {t('explorer.manageViews.queryEditor.rows')}
                {queryResult.executionTime !== undefined && ` (${queryResult.executionTime}ms)`}
              </span>
            )}
          </div>
          <div className="qe__results-body">
            {queryError ? (
              <div className="qe__results-error" style={{ userSelect: 'text', cursor: 'text', WebkitUserSelect: 'text' }}>{queryError}</div>
            ) : queryResult === null ? (
              <div className="qe__results-empty">
                {t('explorer.manageViews.queryEditor.resultsEmpty')}
              </div>
            ) : queryResult.columns.length === 0 ? (
              <div className="qe__results-empty">
                {t('explorer.manageViews.queryEditor.resultsNoRows')}
              </div>
            ) : (
              <div className="qe__results-scroll">
                <table className="qe__results-table" aria-label="Query results">
                  <thead>
                    <tr>
                      {(() => {
                        const sortedCount = Object.keys(queryResult.sortIndicators).length
                        return queryResult.columns.map((col) => {
                          const indicator = queryResult.sortIndicators[col]
                          const isFiltered =
                            queryResult.filteredColumns.has(col) ||
                            [...queryResult.filteredColumns].some((k) => k.toLowerCase() === col.toLowerCase())
                          return (
                            <th key={col} className="qe__results-th">
                              <div className="qe__th-label">
                                {col}
                                {isFiltered && (
                                  <Filter size={9} className="qe__filter-icon" />
                                )}
                                {indicator && (
                                  <span className="qe__sort-arrow">
                                    {indicator.sortType === 'ASC' ? '▲' : '▼'}
                                  </span>
                                )}
                                {indicator && sortedCount > 1 && (
                                  <span className="qe__sort-badge">{indicator.sortOrder}</span>
                                )}
                              </div>
                            </th>
                          )
                        })
                      })()}
                    </tr>
                  </thead>
                  <tbody>
                    {queryResult.rows.map((row, ri) => (
                      <tr key={ri} className="qe__results-tr">
                        {queryResult.columns.map((col) => (
                          <td key={col} className="qe__results-td">
                            {row[col] === null || row[col] === undefined ? (
                              <span className="qe__null">NULL</span>
                            ) : (
                              String(row[col])
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
        </>
      )}
    </div>
  )
}

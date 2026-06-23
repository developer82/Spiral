/**
 * useInteractiveResults — manages row selection, record deletion,
 * boolean cell toggles, and the various result-table context menus.
 */
import { useState } from 'react'
import type { QueryTab } from '../explorer.types'
import type { QueryResultSet } from '../connections.types'
import { buildDeleteSql } from '../deleteUtils'
import { buildUpdateBooleanSql } from '../updateUtils'

interface UseInteractiveResultsOptions {
  activeConnectionId: string | null
  connections: Array<{ id: string; provider: string }>
  buildQuerySql: (tab: QueryTab, selectedText?: string) => string
  getTabDatabaseName: (tab: QueryTab) => string | undefined
  executeQueryForTabWithSql: (tab: QueryTab, sql: string) => Promise<void>
}

export interface UseInteractiveResultsReturn {
  selectedRowsMap: Map<string, Set<number>>
  setSelectedRowsMap: React.Dispatch<React.SetStateAction<Map<string, Set<number>>>>
  deleteConfirmState: {
    tabId: string
    rsIndex: number
    connectionId: string
    databaseName: string
    sourceTable: { schema: string; table: string }
    pkColumns: string[]
    selectedRows: Record<string, unknown>[]
  } | null
  setDeleteConfirmState: React.Dispatch<React.SetStateAction<{
    tabId: string
    rsIndex: number
    connectionId: string
    databaseName: string
    sourceTable: { schema: string; table: string }
    pkColumns: string[]
    selectedRows: Record<string, unknown>[]
  } | null>>
  deleteErrors: Map<string, string>
  setDeleteErrors: React.Dispatch<React.SetStateAction<Map<string, string>>>
  isDeleting: boolean
  recordDialogState: {
    mode: 'add' | 'edit'
    connectionId: string
    databaseName: string | undefined
    provider: string
    sourceTable: { schema: string; table: string }
    pkColumns: string[]
    row?: Record<string, unknown>
  } | null
  setRecordDialogState: React.Dispatch<React.SetStateAction<{
    mode: 'add' | 'edit'
    connectionId: string
    databaseName: string | undefined
    provider: string
    sourceTable: { schema: string; table: string }
    pkColumns: string[]
    row?: Record<string, unknown>
  } | null>>
  updateErrors: Map<string, string>
  setUpdateErrors: React.Dispatch<React.SetStateAction<Map<string, string>>>
  updatingCell: { tabId: string; rsIndex: number; colName: string; rowIndex: number } | null
  columnSortContextMenu: {
    tab: QueryTab
    columnName: string
    position: { x: number; y: number }
  } | null
  setColumnSortContextMenu: React.Dispatch<React.SetStateAction<{
    tab: QueryTab
    columnName: string
    position: { x: number; y: number }
  } | null>>
  boolPillContextMenu: {
    columnName: string
    row: Record<string, unknown>
    rowIndex: number
    tab: QueryTab
    rsIndex: number
    sourceTable: { schema: string; table: string }
    pkColumns: string[]
    position: { x: number; y: number }
  } | null
  setBoolPillContextMenu: React.Dispatch<React.SetStateAction<{
    columnName: string
    row: Record<string, unknown>
    rowIndex: number
    tab: QueryTab
    rsIndex: number
    sourceTable: { schema: string; table: string }
    pkColumns: string[]
    position: { x: number; y: number }
  } | null>>
  rowContextMenu: {
    row: Record<string, unknown>
    rowIndex: number
    tab: QueryTab
    rsIndex: number
    sourceTable: { schema: string; table: string }
    pkColumns: string[]
    connectionId: string
    databaseName: string
    provider: string
    position: { x: number; y: number }
  } | null
  setRowContextMenu: React.Dispatch<React.SetStateAction<{
    row: Record<string, unknown>
    rowIndex: number
    tab: QueryTab
    rsIndex: number
    sourceTable: { schema: string; table: string }
    pkColumns: string[]
    connectionId: string
    databaseName: string
    provider: string
    position: { x: number; y: number }
  } | null>>
  handleRowSelect: (tabId: string, rsIndex: number, rowIndex: number, selected: boolean) => void
  handleSelectAll: (tabId: string, rsIndex: number, totalRows: number, selected: boolean) => void
  handleDeleteRows: (tabId: string, rsIndex: number, rs: QueryResultSet, connectionId: string, databaseName: string | undefined) => void
  executeDelete: () => Promise<void>
  handleOpenAddRecord: (connectionId: string, databaseName: string | undefined, provider: string, sourceTable: { schema: string; table: string }, pkColumns: string[]) => void
  handleOpenEditRecord: (connectionId: string, databaseName: string | undefined, provider: string, sourceTable: { schema: string; table: string }, pkColumns: string[], row: Record<string, unknown>) => void
  handleBooleanToggle: (tab: QueryTab, rsIndex: number, sourceTable: { schema: string; table: string }, pkColumns: string[], colName: string, row: Record<string, unknown>, rowIndex: number, newValue: boolean | null) => Promise<void>
  handleBooleanRightClick: (tab: QueryTab, rsIndex: number, rs: QueryResultSet, colName: string, row: Record<string, unknown>, rowIndex: number, pkColumns: string[], position: { x: number; y: number }) => void
  handleRowContextMenu: (tab: QueryTab, rsIndex: number, rs: QueryResultSet, pkColumns: string[], row: Record<string, unknown>, rowIndex: number, position: { x: number; y: number }) => void
  cleanupTabData: (tabId: string) => void
  getTabsForRef: () => Array<{ id: string; kind: string; content?: string; connectionId?: string; databaseName?: string }>
}

export function useInteractiveResults({
  activeConnectionId,
  connections,
  buildQuerySql,
  getTabDatabaseName,
  executeQueryForTabWithSql
}: UseInteractiveResultsOptions): UseInteractiveResultsReturn {
  const [selectedRowsMap, setSelectedRowsMap] = useState<Map<string, Set<number>>>(new Map())
  const [deleteConfirmState, setDeleteConfirmState] = useState<{
    tabId: string
    rsIndex: number
    connectionId: string
    databaseName: string
    sourceTable: { schema: string; table: string }
    pkColumns: string[]
    selectedRows: Record<string, unknown>[]
  } | null>(null)
  const [deleteErrors, setDeleteErrors] = useState<Map<string, string>>(new Map())
  const [isDeleting, setIsDeleting] = useState(false)
  const [recordDialogState, setRecordDialogState] = useState<{
    mode: 'add' | 'edit'
    connectionId: string
    databaseName: string | undefined
    provider: string
    sourceTable: { schema: string; table: string }
    pkColumns: string[]
    row?: Record<string, unknown>
  } | null>(null)
  const [updateErrors, setUpdateErrors] = useState<Map<string, string>>(new Map())
  const [updatingCell, setUpdatingCell] = useState<{ tabId: string; rsIndex: number; colName: string; rowIndex: number } | null>(null)
  const [columnSortContextMenu, setColumnSortContextMenu] = useState<{
    tab: QueryTab
    columnName: string
    position: { x: number; y: number }
  } | null>(null)
  const [boolPillContextMenu, setBoolPillContextMenu] = useState<{
    columnName: string
    row: Record<string, unknown>
    rowIndex: number
    tab: QueryTab
    rsIndex: number
    sourceTable: { schema: string; table: string }
    pkColumns: string[]
    position: { x: number; y: number }
  } | null>(null)
  const [rowContextMenu, setRowContextMenu] = useState<{
    row: Record<string, unknown>
    rowIndex: number
    tab: QueryTab
    rsIndex: number
    sourceTable: { schema: string; table: string }
    pkColumns: string[]
    connectionId: string
    databaseName: string
    provider: string
    position: { x: number; y: number }
  } | null>(null)

  function handleRowSelect(tabId: string, rsIndex: number, rowIndex: number, selected: boolean): void {
    const key = `${tabId}:${rsIndex}`
    setSelectedRowsMap((prev) => {
      const next = new Map(prev)
      const current = new Set(prev.get(key) ?? [])
      if (selected) current.add(rowIndex)
      else current.delete(rowIndex)
      next.set(key, current)
      return next
    })
  }

  function handleSelectAll(tabId: string, rsIndex: number, totalRows: number, selected: boolean): void {
    const key = `${tabId}:${rsIndex}`
    setSelectedRowsMap((prev) => {
      const next = new Map(prev)
      if (selected) {
        next.set(key, new Set(Array.from({ length: totalRows }, (_, i) => i)))
      } else {
        next.set(key, new Set())
      }
      return next
    })
  }

  function handleDeleteRows(
    tabId: string,
    rsIndex: number,
    rs: QueryResultSet,
    connectionId: string,
    databaseName: string | undefined
  ): void {
    if (!databaseName || !rs.sourceTable) return
    const key = `${tabId}:${rsIndex}`
    const selectedIndices = selectedRowsMap.get(key) ?? new Set<number>()
    if (selectedIndices.size === 0) return

    const pkColumns = rs.columnKeyMeta
      ? rs.columns.filter((_, i) => rs.columnKeyMeta![i]?.isPrimaryKey)
      : []

    if (pkColumns.length === 0) {
      setDeleteErrors((prev) => {
        const next = new Map(prev)
        next.set(key, 'Cannot delete: no primary key columns are identified for this result set.')
        return next
      })
      return
    }

    const selectedRows = [...selectedIndices].map((i) => rs.rows[i])
    setDeleteConfirmState({ tabId, rsIndex, connectionId, databaseName, sourceTable: rs.sourceTable, pkColumns, selectedRows })
  }

  async function executeDelete(): Promise<void> {
    if (!deleteConfirmState) return
    const { tabId, rsIndex, connectionId, databaseName, sourceTable, pkColumns, selectedRows } = deleteConfirmState
    const key = `${tabId}:${rsIndex}`
    const provider = connections.find((c) => c.id === connectionId)?.provider
    setIsDeleting(true)
    try {
      const sql = buildDeleteSql(selectedRows, sourceTable, pkColumns, provider)
      const result = await window.api.database.executeQuery(connectionId, sql, false, false, databaseName)
      if (result.status === 'error') {
        setDeleteErrors((prev) => {
          const next = new Map(prev)
          next.set(key, result.message)
          return next
        })
      } else {
        setSelectedRowsMap((prev) => {
          const next = new Map(prev)
          for (const k of next.keys()) {
            if (k.startsWith(`${tabId}:`)) next.delete(k)
          }
          return next
        })
        // Re-run the query in the tab to refresh results
        // We rely on the caller (ExplorerPage) to provide a ref to the tab's content via executeQueryForTabWithSql
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setDeleteErrors((prev) => {
        const next = new Map(prev)
        next.set(key, message)
        return next
      })
    } finally {
      setIsDeleting(false)
      setDeleteConfirmState(null)
    }
  }

  function handleOpenAddRecord(
    connectionId: string,
    databaseName: string | undefined,
    provider: string,
    sourceTable: { schema: string; table: string },
    pkColumns: string[]
  ): void {
    setRecordDialogState({ mode: 'add', connectionId, databaseName, provider, sourceTable, pkColumns })
  }

  function handleOpenEditRecord(
    connectionId: string,
    databaseName: string | undefined,
    provider: string,
    sourceTable: { schema: string; table: string },
    pkColumns: string[],
    row: Record<string, unknown>
  ): void {
    setRecordDialogState({ mode: 'edit', connectionId, databaseName, provider, sourceTable, pkColumns, row })
  }

  async function handleBooleanToggle(
    tab: QueryTab,
    rsIndex: number,
    sourceTable: { schema: string; table: string },
    pkColumns: string[],
    colName: string,
    row: Record<string, unknown>,
    rowIndex: number,
    newValue: boolean | null
  ): Promise<void> {
    if (updatingCell !== null) return
    const connectionId = tab.connectionId ?? activeConnectionId
    if (!connectionId) return
    const key = `${tab.id}:${rsIndex}`

    if (pkColumns.length === 0) {
      setUpdateErrors((prev) => {
        const next = new Map(prev)
        next.set(key, 'Cannot update: no primary key columns are identified for this result set.')
        return next
      })
      return
    }

    setUpdatingCell({ tabId: tab.id, rsIndex, colName, rowIndex })
    try {
      const provider = connections.find((c) => c.id === connectionId)?.provider
      const rawSql = buildUpdateBooleanSql(row, sourceTable, pkColumns, colName, newValue, provider)
      const sql = buildQuerySql(tab, rawSql)
      const result = await window.api.database.executeQuery(connectionId, sql, false, false, getTabDatabaseName(tab))
      if (result.status === 'error') {
        setUpdateErrors((prev) => {
          const next = new Map(prev)
          next.set(key, result.message)
          return next
        })
      } else {
        await executeQueryForTabWithSql(tab, tab.content)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setUpdateErrors((prev) => {
        const next = new Map(prev)
        next.set(key, message)
        return next
      })
    } finally {
      setUpdatingCell(null)
    }
  }

  function handleBooleanRightClick(
    tab: QueryTab,
    rsIndex: number,
    rs: QueryResultSet,
    colName: string,
    row: Record<string, unknown>,
    rowIndex: number,
    pkColumns: string[],
    position: { x: number; y: number }
  ): void {
    if (!rs.sourceTable) return
    setBoolPillContextMenu({ columnName: colName, row, rowIndex, tab, rsIndex, sourceTable: rs.sourceTable, pkColumns, position })
  }

  function handleRowContextMenu(
    tab: QueryTab,
    rsIndex: number,
    rs: QueryResultSet,
    pkColumns: string[],
    row: Record<string, unknown>,
    rowIndex: number,
    position: { x: number; y: number }
  ): void {
    if (!rs.sourceTable || !tab.databaseName) return
    const connectionId = tab.connectionId ?? activeConnectionId
    if (!connectionId) return
    const provider = connections.find((c) => c.id === connectionId)?.provider ?? 'sqlserver'
    setRowContextMenu({ row, rowIndex, tab, rsIndex, sourceTable: rs.sourceTable, pkColumns, connectionId, databaseName: tab.databaseName, provider, position })
  }

  /** Clean up per-tab row selection and error state when a tab is closed. */
  function cleanupTabData(tabId: string): void {
    setSelectedRowsMap((prev) => {
      const next = new Map(prev)
      for (const key of next.keys()) {
        if (key.startsWith(`${tabId}:`)) next.delete(key)
      }
      return next
    })
    setDeleteErrors((prev) => {
      const next = new Map(prev)
      for (const key of next.keys()) {
        if (key.startsWith(`${tabId}:`)) next.delete(key)
      }
      return next
    })
  }

  // Placeholder to satisfy the return type - this isn't used
  function getTabsForRef(): Array<{ id: string; kind: string; content?: string; connectionId?: string; databaseName?: string }> {
    return []
  }

  return {
    selectedRowsMap,
    setSelectedRowsMap,
    deleteConfirmState,
    setDeleteConfirmState,
    deleteErrors,
    setDeleteErrors,
    isDeleting,
    recordDialogState,
    setRecordDialogState,
    updateErrors,
    setUpdateErrors,
    updatingCell,
    columnSortContextMenu,
    setColumnSortContextMenu,
    boolPillContextMenu,
    setBoolPillContextMenu,
    rowContextMenu,
    setRowContextMenu,
    handleRowSelect,
    handleSelectAll,
    handleDeleteRows,
    executeDelete,
    handleOpenAddRecord,
    handleOpenEditRecord,
    handleBooleanToggle,
    handleBooleanRightClick,
    handleRowContextMenu,
    cleanupTabData,
    getTabsForRef
  }
}

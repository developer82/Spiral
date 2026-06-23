/**
 * useQueryRunner — manages query execution, execution plan/statistics state,
 * result set state, and DDL-triggered tree refreshes.
 */
import { useState } from 'react'
import { format as formatSQL } from 'sql-formatter'
import type { QueryTab, TabQueryState, ResultsView } from '../explorer.types'
import type { ConnectionRecord, ExecuteQuerySuccessResult } from '../connections.types'
import { applyKeyMetaToResults, detectDdlFolderTypes } from '../ExplorerUtils'
import {
  parseSqlOrderBy,
  parseSqlWhere,
  modifyOrderByInSql
} from '../QueryEditor/sortIndicators'
import type { QueryEditorHandle } from '../MonacoEditor/QueryEditor'
import { parseSedScript } from '../SedPanel/parseSedScript'
import type { SedPanelItem } from '../SedPanel/parseSedScript'
import type { SedExecutionState, SedTaskStatus } from '../SedPanel/SedPanel'

interface UseQueryRunnerOptions {
  activeTabId: string | null
  tabs: Array<{ id: string; kind: string; content?: string; connectionId?: string; databaseName?: string }>
  connections: ConnectionRecord[]
  activeConnectionId: string | null
  settings: {
    autoIncludeExecutionPlan?: boolean
    autoIncludeClientStatistics?: boolean
    showKeyIconsInResults?: boolean
    useInteractiveTables?: boolean
  }
  beforeExecuteQuery?: (tab: QueryTab, sql: string, connectionId: string) => Promise<boolean>
  shouldUseInteractiveTablesForConnection: (connectionId: string | null | undefined) => boolean
  getConnectionCapabilities: (connectionId: string) => { defaultSchema: string }
  queryEditorRefs: React.MutableRefObject<Map<string, React.RefObject<QueryEditorHandle | null>>>
  setTabs: (updater: (prev: Array<{ id: string; kind: string; content?: string; connectionId?: string; databaseName?: string; isDirty?: boolean }>) => Array<{ id: string; kind: string; content?: string; connectionId?: string; databaseName?: string; isDirty?: boolean }>) => void
  loadNodeChildren: (connectionId: string, nodeId: string) => Promise<void>
  expandedNodes: Set<string>
  setSelectedRowsMap: React.Dispatch<React.SetStateAction<Map<string, Set<number>>>>
  setDeleteErrors: React.Dispatch<React.SetStateAction<Map<string, string>>>
  onSedStart?: () => void
  onSedConfirmRerun?: () => Promise<boolean>
}

export interface UseQueryRunnerReturn {
  tabQueryStates: Map<string, TabQueryState>
  setTabQueryStates: React.Dispatch<React.SetStateAction<Map<string, TabQueryState>>>
  tabResultsViews: Map<string, ResultsView>
  setTabResultsViews: React.Dispatch<React.SetStateAction<Map<string, ResultsView>>>
  tabSedStates: Map<string, SedExecutionState>
  handleExecuteQuery: () => Promise<void>
  handleExecuteQueryWithPlan: () => Promise<void>
  handleExecuteQueryWithStatistics: () => Promise<void>
  handleFormat: () => void
  handleColumnSort: (tab: QueryTab, columnName: string) => Promise<void>
  handleColumnRemoveSort: (tab: QueryTab, columnName: string) => Promise<void>
  executeQueryForTabWithSql: (tab: QueryTab, newSql: string) => Promise<void>
}

export function useQueryRunner({
  activeTabId,
  tabs,
  activeConnectionId,
  settings,
  beforeExecuteQuery,
  shouldUseInteractiveTablesForConnection,
  getConnectionCapabilities,
  queryEditorRefs,
  setTabs,
  loadNodeChildren,
  expandedNodes,
  setSelectedRowsMap,
  setDeleteErrors,
  onSedStart,
  onSedConfirmRerun
}: UseQueryRunnerOptions): UseQueryRunnerReturn {
  const [tabQueryStates, setTabQueryStates] = useState<Map<string, TabQueryState>>(new Map())
  const [tabResultsViews, setTabResultsViews] = useState<Map<string, ResultsView>>(new Map())
  const [tabSedStates, setTabSedStates] = useState<Map<string, SedExecutionState>>(new Map())

  function buildQuerySql(tab: QueryTab, selectedText?: string): string {
    const content = selectedText || tab.content

    if (tab.mongoCollection) {
      // Strip block and line comments, then trim whitespace
      const stripped = content
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/[^\n]*/g, '')
        .trim()

      if (!stripped) {
        // Empty → fetch all documents from the collection
        return `db.${tab.mongoCollection}.find({})`
      }

      // If already a shell command, pass through unchanged
      if (stripped.startsWith('db.')) {
        return stripped
      }

      // Treat as a JSON filter document
      return `db.${tab.mongoCollection}.find(${stripped})`
    }

    return content
  }

  function getTabDatabaseName(tab: QueryTab): string | undefined {
    return tab.databaseName
  }

  function getActiveEditorSelectedText(): string {
    if (!activeTabId) return ''
    return queryEditorRefs.current.get(activeTabId)?.current?.getSelectedText() ?? ''
  }

  async function refreshDdlNodes(connectionId: string, databaseName: string | undefined, sql: string): Promise<void> {
    if (!databaseName) return
    const folderTypes = detectDdlFolderTypes(sql)
    if (folderTypes.length === 0) return
    await Promise.all(
      folderTypes.map((ft) => window.api.database.invalidateCache(connectionId, `db:${databaseName}:${ft}`))
    )
    for (const ft of folderTypes) {
      const nodeId = `db:${databaseName}:${ft}`
      const nodeKey = `${connectionId}/${nodeId}`
      if (expandedNodes.has(nodeKey)) {
        void loadNodeChildren(connectionId, nodeId)
      }
    }
  }

  async function performExecution(
    tab: QueryTab,
    sql: string,
    connectionId: string,
    withPlan: boolean,
    withStatistics: boolean,
    clearInteractiveState: boolean
  ): Promise<void> {
    setTabQueryStates((prev) => {
      const next = new Map(prev)
      next.set(tab.id, { status: 'running' })
      return next
    })

    if (clearInteractiveState) {
      setSelectedRowsMap((prev) => {
        const next = new Map(prev)
        for (const key of next.keys()) {
          if (key.startsWith(`${tab.id}:`)) next.delete(key)
        }
        return next
      })
      setDeleteErrors((prev) => {
        const next = new Map(prev)
        for (const key of next.keys()) {
          if (key.startsWith(`${tab.id}:`)) next.delete(key)
        }
        return next
      })
    }

    const sortIndicators = parseSqlOrderBy(sql)
    const filteredColumns = parseSqlWhere(sql)

    try {
      const result = await window.api.database.executeQuery(
        connectionId,
        buildQuerySql(tab, sql),
        withPlan,
        withStatistics,
        getTabDatabaseName(tab)
      )
      if (
        result.status === 'ok' &&
        (settings.showKeyIconsInResults || shouldUseInteractiveTablesForConnection(connectionId))
      ) {
        const caps = getConnectionCapabilities(connectionId)
        await applyKeyMetaToResults(connectionId, tab.databaseName, sql, result.resultSets, caps.defaultSchema)
      }
      setTabQueryStates((prev) => {
        const next = new Map(prev)
        if (result.status === 'ok') {
          next.set(tab.id, {
            status: 'ok',
            resultSets: result.resultSets,
            messages: result.messages,
            durationMs: result.durationMs,
            executionPlanXml: result.executionPlanXml,
            clientStatistics: result.clientStatistics,
            sortIndicators,
            filteredColumns
          })
        } else {
          next.set(tab.id, { status: 'error', message: result.message })
        }
        return next
      })
      setTabResultsViews((prev) => {
        const next = new Map(prev)
        next.set(tab.id, 'results')
        return next
      })
      if (result.status === 'ok') {
        void refreshDdlNodes(connectionId, tab.databaseName, sql)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Query execution failed'
      setTabQueryStates((prev) => {
        const next = new Map(prev)
        next.set(tab.id, { status: 'error', message })
        return next
      })
    }
  }

  async function performSedExecution(
    tab: QueryTab,
    parsedSed: NonNullable<ReturnType<typeof parseSedScript>>,
    connectionId: string
  ): Promise<void> {
    const { tasks, items } = parsedSed

    const existing = tabSedStates.get(tab.id)
    let startIndex = 0
    let initialTaskStatuses: SedTaskStatus[]

    const labelsMatch =
      existing &&
      existing.taskStatuses.length === tasks.length &&
      existing.taskStatuses.every((t, i) => t.label === tasks[i].label)

    if (labelsMatch && existing && existing.overallStatus === 'completed') {
      const confirmed = onSedConfirmRerun ? await onSedConfirmRerun() : true
      if (!confirmed) return
      initialTaskStatuses = tasks.map((t) => ({ label: t.label, status: 'pending' as const }))
    } else if (labelsMatch && existing) {
      startIndex = existing.resumeFromIndex
      initialTaskStatuses = existing.taskStatuses.map((t, i) =>
        i < startIndex ? t : { label: t.label, status: 'pending' as const }
      )
    } else {
      initialTaskStatuses = tasks.map((t) => ({ label: t.label, status: 'pending' as const }))
    }

    const buildState = (
      taskStatuses: SedTaskStatus[],
      overallStatus: SedExecutionState['overallStatus'],
      resumeFromIndex: number
    ): SedExecutionState => ({ items: items as SedPanelItem[], taskStatuses, overallStatus, resumeFromIndex })

    setTabSedStates((prev) => {
      const next = new Map(prev)
      next.set(tab.id, buildState(initialTaskStatuses, 'running', startIndex))
      return next
    })

    setTabQueryStates((prev) => {
      const next = new Map(prev)
      next.set(tab.id, { status: 'running' })
      return next
    })

    let currentStatuses = [...initialTaskStatuses]
    let lastOkResult: ExecuteQuerySuccessResult | null = null

    for (let i = startIndex; i < tasks.length; i++) {
      currentStatuses = currentStatuses.map((t, idx) =>
        idx === i ? { ...t, status: 'running' as const } : t
      )
      setTabSedStates((prev) => {
        const next = new Map(prev)
        next.set(tab.id, buildState(currentStatuses, 'running', i))
        return next
      })

      try {
        const result = await window.api.database.executeQuery(
          connectionId,
          tasks[i].sql,
          false,
          false,
          tab.databaseName
        )

        if (result.status === 'error') {
          currentStatuses = currentStatuses.map((t, idx) =>
            idx === i ? { label: t.label, status: 'error' as const, error: result.message } : t
          )
          setTabSedStates((prev) => {
            const next = new Map(prev)
            next.set(tab.id, buildState(currentStatuses, 'error', i))
            return next
          })
          setTabQueryStates((prev) => {
            const next = new Map(prev)
            next.set(tab.id, { status: 'error', message: result.message })
            return next
          })
          return
        }

        lastOkResult = result
        currentStatuses = currentStatuses.map((t, idx) =>
          idx === i ? { ...t, status: 'completed' as const } : t
        )
        setTabSedStates((prev) => {
          const next = new Map(prev)
          next.set(tab.id, buildState(currentStatuses, 'running', i + 1))
          return next
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Query execution failed'
        currentStatuses = currentStatuses.map((t, idx) =>
          idx === i ? { label: t.label, status: 'error' as const, error: message } : t
        )
        setTabSedStates((prev) => {
          const next = new Map(prev)
          next.set(tab.id, buildState(currentStatuses, 'error', i))
          return next
        })
        setTabQueryStates((prev) => {
          const next = new Map(prev)
          next.set(tab.id, { status: 'error', message })
          return next
        })
        return
      }
    }

    setTabSedStates((prev) => {
      const next = new Map(prev)
      next.set(tab.id, buildState(currentStatuses, 'completed', tasks.length))
      return next
    })

    setTabQueryStates((prev) => {
      const next = new Map(prev)
      next.set(tab.id, {
        status: 'ok',
        resultSets: lastOkResult?.resultSets ?? [],
        messages: lastOkResult?.messages ?? [],
        durationMs: lastOkResult?.durationMs ?? 0
      })
      return next
    })

    setTabResultsViews((prev) => {
      const next = new Map(prev)
      next.set(tab.id, 'results')
      return next
    })
  }

  async function requestExecution(
    tab: QueryTab,
    sql: string,
    withPlan: boolean,
    withStatistics: boolean,
    clearInteractiveState: boolean
  ): Promise<void> {
    const connectionId = tab.connectionId ?? activeConnectionId
    if (!connectionId) return

    if (beforeExecuteQuery) {
      const approved = await beforeExecuteQuery(tab, sql, connectionId)
      if (!approved) return
    }

    const parsedSed = parseSedScript(sql)
    if (parsedSed) {
      onSedStart?.()
      await performSedExecution(tab, parsedSed, connectionId)
      return
    }

    await performExecution(tab, sql, connectionId, withPlan, withStatistics, clearInteractiveState)
  }

  async function executeQueryForTabWithSql(tab: QueryTab, newSql: string): Promise<void> {
    const withPlan = settings.autoIncludeExecutionPlan || false
    const withStatistics = settings.autoIncludeClientStatistics || false
    await requestExecution(tab, newSql, withPlan, withStatistics, true)
  }

  async function runWithOptions(withPlan: boolean, withStatistics: boolean): Promise<void> {
    if (!activeTabId) return
    const activeTab = tabs.find((t) => t.id === activeTabId) as QueryTab | undefined
    if (!activeTab || activeTab.kind !== 'query') return

    const connectionId = activeTab.connectionId ?? activeConnectionId
    if (!connectionId) {
      setTabQueryStates((prev) => {
        const next = new Map(prev)
        next.set(activeTabId, { status: 'error', message: 'No connection selected. Click a connection in the panel to select it.' })
        return next
      })
      return
    }

    const selectedText = getActiveEditorSelectedText()
    await requestExecution(activeTab, selectedText || activeTab.content, withPlan, withStatistics, !withPlan && !withStatistics)
  }

  async function handleExecuteQuery(): Promise<void> {
    return runWithOptions(
      settings.autoIncludeExecutionPlan || false,
      settings.autoIncludeClientStatistics || false
    )
  }

  async function handleExecuteQueryWithPlan(): Promise<void> {
    return runWithOptions(true, false)
  }

  async function handleExecuteQueryWithStatistics(): Promise<void> {
    return runWithOptions(false, true)
  }

  function handleFormat(): void {
    if (!activeTabId) return
    const activeTab = tabs.find((t) => t.id === activeTabId) as QueryTab | undefined
    if (!activeTab || activeTab.kind !== 'query') return
    const formatted = formatSQL(activeTab.content, { language: 'sql', tabWidth: 2 })
    setTabs((prev) =>
      prev.map((t) => (t.id === activeTabId && t.kind === 'query' ? { ...t, content: formatted, isDirty: true } : t))
    )
  }

  async function handleColumnSort(tab: QueryTab, columnName: string): Promise<void> {
    const newSql = modifyOrderByInSql(tab.content, columnName, 'toggle')
    setTabs((prev) =>
      prev.map((t) => (t.id === tab.id && t.kind === 'query' ? { ...t, content: newSql, isDirty: true } : t))
    )
    await executeQueryForTabWithSql(tab, newSql)
  }

  async function handleColumnRemoveSort(tab: QueryTab, columnName: string): Promise<void> {
    const newSql = modifyOrderByInSql(tab.content, columnName, 'remove')
    setTabs((prev) =>
      prev.map((t) => (t.id === tab.id && t.kind === 'query' ? { ...t, content: newSql, isDirty: true } : t))
    )
    await executeQueryForTabWithSql(tab, newSql)
  }

  return {
    tabQueryStates,
    setTabQueryStates,
    tabResultsViews,
    setTabResultsViews,
    tabSedStates,
    handleExecuteQuery,
    handleExecuteQueryWithPlan,
    handleExecuteQueryWithStatistics,
    handleFormat,
    handleColumnSort,
    handleColumnRemoveSort,
    executeQueryForTabWithSql
  }
}

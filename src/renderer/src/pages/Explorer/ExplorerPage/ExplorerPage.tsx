import { useState, useRef, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useScreenNav } from '../../../components/NavController/NavController'
import {
  Plus,
  ChevronRight,
  ChevronDown,
  Database,
  AlertCircle,
  FilePlus,
  FileText,
  Save,
  FolderOpen,
  X,
  Play,
  AlignLeft,
  TableProperties,
  Loader2,
  Download,
  Pencil,
  Plug,
  PlugZap,
  Trash2,
  DatabaseZap,
  RefreshCw,
  Key,
  Lock,
  Bell,
  Network,
  Activity,
  ListOrdered,
  ScrollText,
  BarChart2,
  Eye,
  Code,
  Tag,
  List,
  SlidersHorizontal,
  ArrowUpDown,
  Check,
  FolderPlus,
  PenLine,
  TerminalSquare,
  Bot,
  UserPlus,
  ShieldPlus,
  DatabaseBackup,
  Upload
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ConnectionRecord, ExplorerNode, ConnectionProvider } from '../connections.types'
import { PROVIDER_METADATA, PROVIDER_LIST } from '../providerMetadata'
import type { MenuItem } from '../../../components/Menu/Menu'
import Menu from '../../../components/Menu/Menu'
import QueryEditor from '../MonacoEditor/QueryEditor'
import { useSettings } from '../../Settings/useSettings'
import VirtualResultsTable from '../VirtualResultsTable/VirtualResultsTable'
import JsonViewer from '../../../components/JsonViewer/JsonViewer'
import './ExplorerPage.css'
import ErdCanvas from '../ErdCanvas/ErdCanvas'
import type { ErdCanvasSerializedState } from '../erd.types'
import RedisDashboardTab from '../RedisDashboardTab/RedisDashboardTab'
import MongoShellTab from '../MongoShellTab/MongoShellTab'
import RedisShellTab from '../RedisShellTab/RedisShellTab'
import ExecutionPlanCanvas from '../ExecutionPlanCanvas/ExecutionPlanCanvas'
import ClientStatisticsView from '../ClientStatisticsView/ClientStatisticsView'
import type { ErdExportOptions } from '../Dialogs/ErdExportDialog/ErdExportDialog'
import { buildCsvContent, buildJsonRows } from './exportUtils'
import type { QueryResultSet } from '../connections.types'
import SearchField from '../../../components/SearchField/SearchField'
import Button from '../../../components/Button/Button'
import ToolbarButton from '../../../components/ToolbarButton/ToolbarButton'
import { Toolbar } from '../../../components/Toolbar/Toolbar'

import {
  EXPANDABLE_KINDS,
  NODE_ICONS,
  FOLDER_I18N_KEYS,
  DATABASES_NODE,
  SECURITY_NODE,
  type QueryTab,
  type DashboardTab,
  type MongoShellTab as MongoShellTabType,
  type RedisShellTab as RedisShellTabType,
  type RedisDbExplorerTab as RedisDbExplorerTabType,
  type ResultsView
} from '../explorer.types'
import RedisDbExplorerTab from '../RedisDbExplorerTab/RedisDbExplorerTab'
import { getNodeDragText } from '../ExplorerUtils'
import { parseSqlOrderBy, parseSqlWhere } from '../QueryEditor/sortIndicators'
import { useLayoutManager } from '../hooks/useLayoutManager'
import { useExplorerTree } from '../hooks/useExplorerTree'
import { useConnectionList } from '../hooks/useConnectionList'
import type { ConnectionSortField, SortDirection } from '../../Settings/useSettings'
import { useTabsManager } from '../hooks/useTabsManager'
import { useQueryRunner } from '../hooks/useQueryRunner'
import { useInteractiveResults } from '../hooks/useInteractiveResults'
import DialogManager from './DialogManager'
import { AiChatPanel } from '../AiChat/AiChatPanel'
import { SedPanel } from '../SedPanel/SedPanel'
import CriticalEnvironmentConfirmDialog from '../Dialogs/CriticalEnvironmentConfirmDialog/CriticalEnvironmentConfirmDialog'
import ConfirmDialog from '../../../components/ConfirmDialog/ConfirmDialog'
import {
  canUseInteractiveTablesForConnection,
  isClearlyReadOnlySql,
  resolveConnectionEnvironment
} from '../environmentUtils'
import {
  EXPLORER_OPEN_SCRIPT_EVENT,
  type ExplorerOpenScriptDetail
} from '../../../events/connectionEvents'
import { buildCollectionContextMenuItems, buildMongoIndexesFolderContextMenuItems, buildMongoIndexNodeContextMenuItems, buildMongoAggregationsFolderContextMenuItems, buildMongoAggregationNodeContextMenuItems, buildMongoValidationContextMenuItems } from '../explorerContextMenus'
import { buildQueryContext } from '../MonacoEditor/queryContextUtils'
import { trackEvent } from '../../../analytics/track'

// Re-export utility functions so existing tests that import from this path continue to work
export { getNodeDragText, detectDdlFolderTypes } from '../ExplorerUtils'

function ExplorerPage({ isActive = false }: { isActive?: boolean }): React.JSX.Element {
  const { t } = useTranslation()
  const { settings } = useSettings()
  const screenNavSlot = useScreenNav()

  // ── Layout ────────────────────────────────────────────────────────────────
  const layout = useLayoutManager()

  // ── Tree state & operations ───────────────────────────────────────────────
  const tree = useExplorerTree(settings.showSystemDatabases ?? false)

  // ── Connection list toolbar state ─────────────────────────────────────────
  const [connectionSearch, setConnectionSearch] = useState('')
  const [filterProviders, setFilterProviders] = useState<Set<ConnectionProvider>>(new Set())
  const [filterEnvironmentIds, setFilterEnvironmentIds] = useState<Set<string>>(new Set())
  const [filterStatus, setFilterStatus] = useState<'online' | 'offline' | null>(null)
  const [sortField, setSortField] = useState<ConnectionSortField>(
    () => settings.defaultConnectionSort?.field ?? 'name'
  )
  const [sortDirection, setSortDirection] = useState<SortDirection>(
    () => settings.defaultConnectionSort?.direction ?? 'asc'
  )
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [isSortOpen, setIsSortOpen] = useState(false)
  const filterBtnRef = useRef<HTMLButtonElement>(null)
  const sortBtnRef = useRef<HTMLButtonElement>(null)
  const filterPanelRef = useRef<HTMLDivElement>(null)
  const sortPanelRef = useRef<HTMLDivElement>(null)

  // Dismiss filter/sort panels on outside click
  useEffect(() => {
    if (!isFilterOpen && !isSortOpen) return
    function handleOutsideClick(e: MouseEvent): void {
      const target = e.target as Node
      if (
        filterPanelRef.current?.contains(target) ||
        filterBtnRef.current?.contains(target) ||
        sortPanelRef.current?.contains(target) ||
        sortBtnRef.current?.contains(target)
      ) return
      setIsFilterOpen(false)
      setIsSortOpen(false)
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [isFilterOpen, isSortOpen])

  function toggleFilterProvider(provider: ConnectionProvider): void {
    setFilterProviders((prev) => {
      const next = new Set(prev)
      if (next.has(provider)) next.delete(provider)
      else next.add(provider)
      return next
    })
  }

  function toggleFilterEnvironment(envId: string): void {
    setFilterEnvironmentIds((prev) => {
      const next = new Set(prev)
      if (next.has(envId)) next.delete(envId)
      else next.add(envId)
      return next
    })
  }

  function toggleFilterStatus(status: 'online' | 'offline'): void {
    setFilterStatus((prev) => (prev === status ? null : status))
  }

  function getFilterPanelPosition(): { top: number; left: number } {
    const btn = filterBtnRef.current
    if (!btn) return { top: 0, left: 0 }
    const rect = btn.getBoundingClientRect()
    return { top: rect.bottom + 4, left: rect.left }
  }

  function getSortPanelPosition(): { top: number; left: number } {
    const btn = sortBtnRef.current
    if (!btn) return { top: 0, left: 0 }
    const rect = btn.getBoundingClientRect()
    return { top: rect.bottom + 4, left: Math.max(0, rect.right - 176) }
  }

  // ── Derived connection list ───────────────────────────────────────────────
  const connectedIds = useMemo(() => {
    const s = new Set<string>()
    for (const c of tree.connections) {
      if (tree.runtimeStates.get(c.id)?.status === 'connected') s.add(c.id)
    }
    return s
  }, [tree.connections, tree.runtimeStates])

  const statusLabels = useMemo(
    () => ({ online: t('explorer.filter.online'), offline: t('explorer.filter.offline') }),
    [t]
  )

  const { entries: connectionEntries, hasActiveFilters } = useConnectionList({
    connections: tree.connections,
    environments: settings.environments ?? [],
    searchText: connectionSearch,
    filterProviders,
    filterEnvironmentIds,
    connectedIds,
    filterStatus,
    statusLabels,
    sortField,
    sortDirection
  })

  // ── Dialog states (not managed by any hook) ───────────────────────────────
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingConnection, setEditingConnection] = useState<ConnectionRecord | null>(null)
  const [createDbDialog, setCreateDbDialog] = useState<{ connectionId: string } | null>(null)
  const [createCollectionDialog, setCreateCollectionDialog] = useState<{
    connectionId: string
    databaseName: string
  } | null>(null)
  const [renameCollectionDialog, setRenameCollectionDialog] = useState<{
    connectionId: string
    databaseName: string
    collectionName: string
  } | null>(null)
  const [mongoDocumentDialogState, setMongoDocumentDialogState] = useState<{
    mode: 'add' | 'edit'
    connectionId: string
    databaseName: string
    collectionName: string
    documentJson?: string
  } | null>(null)
  const [deleteMongoDocumentState, setDeleteMongoDocumentState] = useState<{
    connectionId: string
    databaseName: string
    collectionName: string
    documentJson: string
  } | null>(null)
  const [isDeletingMongoDocument, setIsDeletingMongoDocument] = useState(false)
  const [createTableDialog, setCreateTableDialog] = useState<{
    connectionId: string
    databaseName: string
    provider: ConnectionRecord['provider']
    editTable?: { schema: string; tableName: string }
  } | null>(null)
  const [manageForeignKeysDialog, setManageForeignKeysDialog] = useState<{
    connectionId: string
    databaseName: string
    schema: string
    tableName: string
    initialFkName?: string
  } | null>(null)
  const [manageConstraintsDialog, setManageConstraintsDialog] = useState<{
    connectionId: string
    databaseName: string
    schema: string
    tableName: string
    initialConstraintName?: string
    openAddNew?: boolean
  } | null>(null)
  const [manageTriggersDialog, setManageTriggersDialog] = useState<{
    connectionId: string
    databaseName: string
    schema: string
    tableName: string
    initialTriggerName?: string
    openOnNew?: boolean
  } | null>(null)
  const [manageIndexesDialog, setManageIndexesDialog] = useState<{
    connectionId: string
    databaseName: string
    schema: string
    tableName: string
    initialIndexName?: string
    openOnNew?: boolean
  } | null>(null)
  const [manageMongoIndexesDialog, setManageMongoIndexesDialog] = useState<{
    connectionId: string
    databaseName: string
    collectionName: string
    initialIndexName?: string
    openOnNew?: boolean
  } | null>(null)
  const [manageMongoAggregationsDialog, setManageMongoAggregationsDialog] = useState<{
    connectionId: string
    databaseName: string
    collectionName: string
    initialAggregationId?: string
    openOnNew?: boolean
  } | null>(null)
  const [collectionValidationDialog, setCollectionValidationDialog] = useState<{
    connectionId: string
    databaseName: string
    collectionName: string
  } | null>(null)
  const [manageViewsDialog, setManageViewsDialog] = useState<{
    connectionId: string
    databaseName: string
    initialViewName?: string
    openOnNew?: boolean
  } | null>(null)
  const [manageStoredProceduresDialog, setManageStoredProceduresDialog] = useState<{
    connectionId: string
    databaseName: string
    initialProcedureName?: string
    openOnNew?: boolean
  } | null>(null)
  const [manageDataTypesDialog, setManageDataTypesDialog] = useState<{
    connectionId: string
    databaseName: string
    initialTypeName?: string
    openOnNew?: boolean
  } | null>(null)
  const [manageTableTypesDialog, setManageTableTypesDialog] = useState<{
    connectionId: string
    databaseName: string
    initialTypeName?: string
    openOnNew?: boolean
  } | null>(null)
  const [manageMemoryOptimizedTableTypesDialog, setManageMemoryOptimizedTableTypesDialog] = useState<{
    connectionId: string
    databaseName: string
    initialTypeName?: string
    openOnNew?: boolean
  } | null>(null)
  const [manageServerUsersDialog, setManageServerUsersDialog] = useState<{
    connectionId: string
    initialLoginName?: string
    openOnNew?: boolean
  } | null>(null)
  const [manageServerRolesDialog, setManageServerRolesDialog] = useState<{
    connectionId: string
    initialRoleName?: string
    openOnNew?: boolean
  } | null>(null)
  const [manageDatabaseUsersDialog, setManageDatabaseUsersDialog] = useState<{
    connectionId: string
    databaseName: string
    initialUserName?: string
    openOnNew?: boolean
  } | null>(null)
  const [manageMySqlUsersDialog, setManageMySqlUsersDialog] = useState<{
    connectionId: string
    initialUserKey?: string
    openOnNew?: boolean
  } | null>(null)
  const [manageMySqlDatabaseUsersDialog, setManageMySqlDatabaseUsersDialog] = useState<{
    connectionId: string
    databaseName: string
    initialUserKey?: string
  } | null>(null)
  const [manageRedisAclUsersDialog, setManageRedisAclUsersDialog] = useState<{
    connectionId: string
    initialUsername?: string
    openOnNew?: boolean
  } | null>(null)
  const [manageMongoUsersDialog, setManageMongoUsersDialog] = useState<{
    connectionId: string
    initialUsername?: string
    openOnNew?: boolean
  } | null>(null)
  const [profilerDialog, setProfilerDialog] = useState<{
    connectionId: string
    connectionName: string
    databaseName: string
  } | null>(null)
  const [backupDialog, setBackupDialog] = useState<{
    connectionId: string
    databaseName: string
  } | null>(null)
  const [restoreDialog, setRestoreDialog] = useState<{
    connectionId: string
    databaseName: string
  } | null>(null)
  const [mySqlBackupDialog, setMySqlBackupDialog] = useState<{
    connectionId: string
    databaseName: string
  } | null>(null)
  const [mySqlRestoreDialog, setMySqlRestoreDialog] = useState<{
    connectionId: string
    databaseName: string
  } | null>(null)
  const [postgresBackupDialog, setPostgresBackupDialog] = useState<{
    connectionId: string
    databaseName: string
  } | null>(null)
  const [postgresRestoreDialog, setPostgresRestoreDialog] = useState<{
    connectionId: string
    databaseName: string
  } | null>(null)
  const [sqliteBackupDialog, setSqliteBackupDialog] = useState<{
    connectionId: string
    databaseName: string
  } | null>(null)
  const [sqliteRestoreDialog, setSqliteRestoreDialog] = useState<{
    connectionId: string
    databaseName: string
  } | null>(null)
  const [redisBackupDialog, setRedisBackupDialog] = useState<{
    connectionId: string
    scope: { kind: 'database'; databaseIndex: number } | { kind: 'all' }
  } | null>(null)
  const [redisRestoreDialog, setRedisRestoreDialog] = useState<{
    connectionId: string
    scope: { kind: 'database'; databaseIndex: number } | { kind: 'all' }
  } | null>(null)
  const [mongoBackupDialog, setMongoBackupDialog] = useState<{
    connectionId: string
    databaseName: string
  } | null>(null)
  const [mongoRestoreDialog, setMongoRestoreDialog] = useState<{
    connectionId: string
    databaseName: string
  } | null>(null)
  const [pendingConfirm, setPendingConfirm] = useState<{
    title: string
    message: string
    confirmLabel?: string
    variant?: 'danger' | 'default'
    resolve: (confirmed: boolean) => void
  } | null>(null)

  const [criticalConfirmState, setCriticalConfirmState] = useState<{
    tabId: string
    environmentName: string
  } | null>(null)
  const criticalConfirmResolverRef = useRef<((confirmed: boolean) => void) | null>(null)
  const [skipCriticalConfirmTabIds, setSkipCriticalConfirmTabIds] = useState<Set<string>>(new Set())
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ items: MenuItem[]; position: { x: number; y: number } } | null>(null)

  // ── Circular-dependency breaker ───────────────────────────────────────────
  // useInteractiveResults needs executeQueryForTabWithSql (from useQueryRunner),
  // but useQueryRunner needs setSelectedRowsMap/setDeleteErrors (from useInteractiveResults).
  // Break the cycle with a ref that is updated synchronously after useQueryRunner is created.
  const executeQueryForTabRef = useRef<(tab: QueryTab, sql: string) => Promise<void>>(async () => {})
    const tabIdCounterRef = useRef(0)

  // ── Helper functions (defined after tree hook so they close over tree.connections) ──
  function buildQuerySql(tab: QueryTab, selectedText?: string): string {
    const content = selectedText || tab.content
    return content
  }

  function getTabDatabaseName(tab: QueryTab): string | undefined {
    return tab.databaseName
  }

  // ── Hooks (order matters for circular dep resolution) ─────────────────────

  const interactiveResults = useInteractiveResults({
    activeConnectionId: tree.activeConnectionId,
    connections: tree.connections,
    buildQuerySql,
    getTabDatabaseName,
    executeQueryForTabWithSql: (tab, sql) => executeQueryForTabRef.current(tab, sql)
  })

  const tabsMgr = useTabsManager({
    isActive,
    activeConnectionId: tree.activeConnectionId,
    getSelectedContext: tree.getSelectedContext,
    onResultsToggle: layout.handleToggleResults,
    onToggleAiPanel: layout.toggleAiPanel,
    connections: tree.connections,
    setConnections: tree.setConnections
  })

  function getTabConnectionId(tab: QueryTab): string | null {
    return tab.connectionId ?? (tab.id === tabsMgr.activeTabId ? tree.activeConnectionId : null)
  }

  function getConnectionEnvironment(connectionId: string | null | undefined) {
    return resolveConnectionEnvironment(tree.connections, settings.environments ?? [], connectionId)
  }

  function shouldUseInteractiveTables(connectionId: string | null | undefined): boolean {
    return canUseInteractiveTablesForConnection(
      tree.connections,
      settings.environments ?? [],
      connectionId,
      settings.useInteractiveTables ?? false
    )
  }

  async function confirmCriticalExecution(tab: QueryTab, sql: string, connectionId: string): Promise<boolean> {
    const environment = getConnectionEnvironment(connectionId)
    if (!environment?.critical) return true
    if (skipCriticalConfirmTabIds.has(tab.id)) return true
    if (isClearlyReadOnlySql(sql)) return true

    return new Promise<boolean>((resolve) => {
      criticalConfirmResolverRef.current = resolve
      setCriticalConfirmState({ tabId: tab.id, environmentName: environment.name })
    })
  }

  const queryRunner = useQueryRunner({
    activeTabId: tabsMgr.activeTabId,
    tabs: tabsMgr.tabs,
    connections: tree.connections,
    activeConnectionId: tree.activeConnectionId,
    settings,
    beforeExecuteQuery: confirmCriticalExecution,
    shouldUseInteractiveTablesForConnection: shouldUseInteractiveTables,
    getConnectionCapabilities: tree.getConnectionCapabilities,
    queryEditorRefs: tabsMgr.queryEditorRefs,
    setTabs: tabsMgr.setTabs as unknown as Parameters<typeof useQueryRunner>[0]['setTabs'],
    loadNodeChildren: tree.loadNodeChildren,
    expandedNodes: tree.expandedNodes,
    setSelectedRowsMap: interactiveResults.setSelectedRowsMap,
    setDeleteErrors: interactiveResults.setDeleteErrors,
    onSedStart: () => layout.setSedPanelOpen(true),
    onSedConfirmRerun: () => requestConfirmDefault(
      t('sed.rerun.title', 'Run script again?'),
      t('sed.rerun.message', 'Script completed successfully. Run the entire script again from the beginning?'),
      t('sed.rerun.confirm', 'Run again')
    )
  })

  useEffect(() => {
    setSkipCriticalConfirmTabIds((prev) => {
      const next = new Set([...prev].filter((tabId) => tabsMgr.tabs.some((tab) => tab.id === tabId)))
      return next.size === prev.size ? prev : next
    })

    if (criticalConfirmState && !tabsMgr.tabs.some((tab) => tab.id === criticalConfirmState.tabId)) {
      criticalConfirmResolverRef.current?.(false)
      criticalConfirmResolverRef.current = null
      setCriticalConfirmState(null)
    }
  }, [criticalConfirmState, tabsMgr.tabs])

  // Resolve the circular dependency by keeping the ref up-to-date
    useEffect(() => {
      executeQueryForTabRef.current = queryRunner.executeQueryForTabWithSql
    }, [queryRunner.executeQueryForTabWithSql])

  // Handle explorer:open-script events dispatched from other pages (e.g. Compare)
  useEffect(() => {
    function onOpenScript(e: Event): void {
      const { title, content, connectionId, databaseName } = (e as CustomEvent<ExplorerOpenScriptDetail>).detail
      tabsMgr.openScriptTab(title, content, connectionId, databaseName, tree.setActiveConnectionId)
    }
    window.addEventListener(EXPLORER_OPEN_SCRIPT_EVENT, onOpenScript)
    return () => window.removeEventListener(EXPLORER_OPEN_SCRIPT_EVENT, onOpenScript)
  }, [tabsMgr, tree.setActiveConnectionId])

  // ── Connection dialog handlers ────────────────────────────────────────────

  async function handleSaveConnection(record: Omit<ConnectionRecord, 'id'>): Promise<void> {
    const saved = await window.api.connections.create(record)
    trackEvent('connection_created', {
      provider: record.provider,
      has_ssh: record.sshEnabled === true,
      has_tls: record.tlsEnabled === true
    })
    tree.setConnections((prev) => [...prev, saved])
    setIsDialogOpen(false)
  }

  async function handleUpdateConnection(record: Omit<ConnectionRecord, 'id'>): Promise<void> {
    if (!editingConnection) return
    const updated = await window.api.connections.update({ ...record, id: editingConnection.id })
    tree.setConnections((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
    setIsDialogOpen(false)
    setEditingConnection(null)
  }

  function closeDialog(): void {
    setIsDialogOpen(false)
    setEditingConnection(null)
  }

  // ── Database / table operations ───────────────────────────────────────────

  async function handleCreateDatabaseSubmit(name: string): Promise<void> {
    if (!createDbDialog) return
    const { connectionId } = createDbDialog
    const result = await window.api.database.createDatabase(connectionId, name)
    if (result.status === 'error') throw Object.assign(new Error(result.message), { sql: result.sql })
    setCreateDbDialog(null)
    void tree.loadNodeChildren(connectionId, 'databases')
  }

  async function handleCreateCollectionSubmit(name: string): Promise<void> {
    if (!createCollectionDialog) return
    const { connectionId, databaseName } = createCollectionDialog
    const result = await window.api.database.createCollection(connectionId, databaseName, name)
    if (result.status === 'error') throw new Error(result.message)
    setCreateCollectionDialog(null)
    const nodeId = `mongodb-db:${databaseName}`
    void window.api.database.invalidateCache(connectionId, nodeId).then(() => {
      void tree.loadNodeChildren(connectionId, nodeId)
    })
  }

  async function handleRenameCollectionSubmit(newName: string): Promise<void> {
    if (!renameCollectionDialog) return
    const { connectionId, databaseName, collectionName } = renameCollectionDialog
    const result = await window.api.database.renameCollection(connectionId, databaseName, collectionName, newName)
    if (result.status === 'error') throw new Error(result.message)
    setRenameCollectionDialog(null)
    const nodeId = `mongodb-db:${databaseName}`
    void window.api.database.invalidateCache(connectionId, nodeId).then(() => {
      void tree.loadNodeChildren(connectionId, nodeId)
    })
  }

  async function handleSelectTopRows(
    connectionId: string,
    databaseName: string,
    schema: string,
    tableName: string
  ): Promise<void> {
    const count = settings.selectTopRowsCount
    const scriptResult = await window.api.database.scriptSelectTopRows(
      connectionId, databaseName, schema, tableName, count
    )
    if (scriptResult.status === 'error') {
      window.alert(scriptResult.message)
      return
    }
    const query = scriptResult.script
    // Create a tab with the query content and immediately execute it
    const tabId = `sel-${++tabIdCounterRef.current}`
    const newTab: QueryTab = {
      id: tabId,
      kind: 'query',
      title: `Top ${count} — ${tableName}`,
      content: query,
      isDirty: false,
      connectionId,
      databaseName
    }
    tabsMgr.setTabs((prev) => [...prev, newTab])
    tabsMgr.setActiveTabId(tabId)
    tree.setActiveConnectionId(connectionId)
    // Execute query directly without buildQuerySql wrapper (matches original behavior)
    const result = await window.api.database.executeQuery(connectionId, query)
    const sortIndicators = parseSqlOrderBy(query)
    const filteredColumns = parseSqlWhere(query)

    if (result.status === 'ok' && (settings.showKeyIconsInResults || settings.useInteractiveTables)) {
      const [schemaResult, fkResult] = await Promise.all([
        window.api.database.getTableSchema(connectionId, databaseName, schema, tableName),
        window.api.database.getForeignKeys(connectionId, databaseName, schema, tableName)
      ])
      if (schemaResult.status === 'ok') {
        const fkColumns = fkResult.status === 'ok'
          ? new Set(fkResult.foreignKeys.map((fk) => fk.columnName))
          : new Set<string>()
        const keyMap = new Map(
          schemaResult.columns.map((col) => {
            const colTypeLower = col.type.toLowerCase()
            return [
              col.name,
              {
                isPrimaryKey: col.isPrimaryKey,
                isForeignKey: fkColumns.has(col.name),
                isNullable: col.isNullable,
                isBoolean: colTypeLower === 'bit' || colTypeLower === 'bool' || colTypeLower === 'boolean'
              }
            ]
          })
        )
        for (const rs of result.resultSets) {
          rs.columnKeyMeta = rs.columns.map((col) => keyMap.get(col) ?? null)
          rs.sourceTable = { schema, table: tableName }
        }
      }
    }
    queryRunner.setTabQueryStates((prev) => {
      const next = new Map(prev)
      if (result.status === 'ok') {
        next.set(tabId, {
          status: 'ok',
          resultSets: result.resultSets,
          messages: result.messages,
          durationMs: result.durationMs,
          executionPlanXml: undefined,
          clientStatistics: undefined,
          sortIndicators,
          filteredColumns
        })
      } else {
        next.set(tabId, { status: 'error', message: result.message })
      }
      return next
    })
  }

  function requestConfirm(title: string, message: string): Promise<boolean> {
    return new Promise((resolve) => setPendingConfirm({ title, message, variant: 'danger', resolve }))
  }

  function requestConfirmDefault(title: string, message: string, confirmLabel?: string): Promise<boolean> {
    return new Promise((resolve) => setPendingConfirm({ title, message, confirmLabel, variant: 'default', resolve }))
  }

  async function handleDropDatabase(connectionId: string, databaseName: string): Promise<void> {
    const confirmed = await requestConfirm(
      t('explorer.dropDatabase.confirmTitle'),
      t('explorer.dropDatabase.confirmMessage', { databaseName })
    )
    if (!confirmed) return
    const scriptResult = await window.api.database.scriptDropDatabase(connectionId, databaseName)
    if (scriptResult.status === 'error') { window.alert(scriptResult.message); return }
    const result = await window.api.database.executeQuery(connectionId, scriptResult.script)
    if (result.status === 'error') { window.alert(result.message); return }
    await window.api.database.invalidateCache(connectionId, 'databases')
    void tree.loadNodeChildren(connectionId, 'databases')
  }

  async function handleDropTable(
    connectionId: string,
    databaseName: string,
    schema: string,
    tableName: string
  ): Promise<void> {
    const confirmed = await requestConfirm(
      t('explorer.dropTable.confirmTitle'),
      t('explorer.dropTable.confirmMessage', { tableName: `${schema}.${tableName}` })
    )
    if (!confirmed) return
    const scriptResult = await window.api.database.scriptTableDrop(
      connectionId, databaseName, schema, tableName
    )
    if (scriptResult.status === 'error') { window.alert(scriptResult.message); return }
    const result = await window.api.database.executeQuery(connectionId, scriptResult.script)
    if (result.status === 'error') { window.alert(result.message); return }
    await window.api.database.invalidateCache(connectionId, `db:${databaseName}:tables`)
    void tree.loadNodeChildren(connectionId, `db:${databaseName}:tables`)
  }

  // ── Context menu handlers ─────────────────────────────────────────────────

  function handleDatabasesNodeContextMenu(
    e: React.MouseEvent,
    connectionId: string
  ): void {
    e.preventDefault()
    e.stopPropagation()
    const caps = tree.getConnectionCapabilities(connectionId)
    const isRedis = tree.connections.find((c) => c.id === connectionId)?.provider === 'redis'
    setContextMenu({
      items: [
        {
          id: 'refresh-databases',
          label: t('explorer.createDatabase.refreshContextMenuLabel'),
          icon: <RefreshCw size={13} />,
          onClick: () => {
            void window.api.database.invalidateCache(connectionId, 'databases').then(() => {
              void tree.loadNodeChildren(connectionId, 'databases')
            })
          }
        },
        ...(caps.hasCreateDatabase ? [{
          id: 'create-database',
          label: t('explorer.createDatabase.contextMenuLabel'),
          icon: <DatabaseZap size={13} />,
          onClick: () => setCreateDbDialog({ connectionId })
        }] : []),
        ...(isRedis ? ([
          { id: 'sep-backup', separator: true },
          {
            id: 'backup-all',
            label: t('explorer.redisBackup.contextMenuAllLabel'),
            icon: <DatabaseBackup size={13} />,
            onClick: () => setRedisBackupDialog({ connectionId, scope: { kind: 'all' } })
          },
          {
            id: 'restore-all',
            label: t('explorer.redisRestore.contextMenuAllLabel'),
            icon: <Upload size={13} />,
            onClick: () => setRedisRestoreDialog({ connectionId, scope: { kind: 'all' } })
          }
        ] as MenuItem[]) : [])
      ],
      position: { x: e.clientX, y: e.clientY }
    })
  }

  function handleTablesFolderContextMenu(
    e: React.MouseEvent,
    connectionId: string,
    node: ExplorerNode
  ): void {
    e.preventDefault()
    e.stopPropagation()
    const match = node.id.match(/^db:([^:]+):tables$/)
    if (!match) return
    const databaseName = match[1]
    const conn = tree.connections.find((c) => c.id === connectionId)
    if (!conn) return
    setContextMenu({
      items: [
        {
          id: 'new-query',
          label: t('explorer.newQuery'),
          icon: <FilePlus size={13} />,
          onClick: () => tabsMgr.openQueryTabForConnection(connectionId, databaseName, tree.setActiveConnectionId)
        },
        { id: 'sep', separator: true },
        {
          id: 'refresh-tables',
          label: t('explorer.createTable.refreshContextMenuLabel'),
          icon: <RefreshCw size={13} />,
          onClick: () => {
            void window.api.database.invalidateCache(connectionId, node.id).then(() => {
              void tree.loadNodeChildren(connectionId, node.id)
            })
          }
        },
        ...(tree.getConnectionCapabilities(connectionId).hasCreateTable ? [{
          id: 'create-table',
          label: t('explorer.createTable.contextMenuLabel'),
          icon: <TableProperties size={13} />,
          onClick: () => setCreateTableDialog({ connectionId, databaseName, provider: conn.provider })
        }] : [])
      ],
      position: { x: e.clientX, y: e.clientY }
    })
  }

  function handleDatabaseNodeContextMenu(
    e: React.MouseEvent,
    connectionId: string,
    node: ExplorerNode
  ): void {
    e.preventDefault()
    e.stopPropagation()
    const match = node.id.match(/^db:([^:]+)$/)
    if (!match) return
    const databaseName = match[1]
    setContextMenu({
      items: [
        {
          id: 'new-query',
          label: t('explorer.newQuery'),
          icon: <FilePlus size={13} />,
          onClick: () => tabsMgr.openQueryTabForConnection(connectionId, databaseName, tree.setActiveConnectionId)
        },
        {
          id: 'create-erd',
          label: t('explorer.createErd.contextMenuLabel'),
          icon: <Network size={13} />,
          onClick: () => {
            void tabsMgr.handleCreateErd(
              connectionId,
              databaseName,
              (settings as unknown as Record<string, string>).defaultErdBackground ?? 'dots'
            )
          }
        },
        ...(tree.getConnectionCapabilities(connectionId).hasProfiler ? [{
          id: 'profile',
          label: t('explorer.profile'),
          icon: <Activity size={13} />,
          onClick: () => {
            const conn = tree.connections.find((c) => c.id === connectionId)
            setProfilerDialog({ connectionId, connectionName: conn?.name ?? connectionId, databaseName })
          }
        }] : []),
        ...(tree.getConnectionCapabilities(connectionId).hasBackupRestore ? ([
          { id: 'sep-backup', separator: true },
          {
            id: 'backup',
            label: t('explorer.backup.contextMenuLabel'),
            icon: <DatabaseBackup size={13} />,
            onClick: () => {
              const provider = tree.connections.find((c) => c.id === connectionId)?.provider
              if (provider === 'mysql') setMySqlBackupDialog({ connectionId, databaseName })
              else if (provider === 'postgres')
                setPostgresBackupDialog({ connectionId, databaseName })
              else if (provider === 'sqlite')
                setSqliteBackupDialog({ connectionId, databaseName })
              else setBackupDialog({ connectionId, databaseName })
            }
          },
          {
            id: 'restore',
            label: t('explorer.restore.contextMenuLabel'),
            icon: <Upload size={13} />,
            onClick: () => {
              const provider = tree.connections.find((c) => c.id === connectionId)?.provider
              if (provider === 'mysql') setMySqlRestoreDialog({ connectionId, databaseName })
              else if (provider === 'postgres')
                setPostgresRestoreDialog({ connectionId, databaseName })
              else if (provider === 'sqlite')
                setSqliteRestoreDialog({ connectionId, databaseName })
              else setRestoreDialog({ connectionId, databaseName })
            }
          }
        ] as MenuItem[]) : []),
        { id: 'sep-danger', separator: true },
        {
          id: 'delete-database',
          label: t('explorer.dropDatabase.contextMenuLabel'),
          icon: <Trash2 size={13} />,
          onClick: () => { void handleDropDatabase(connectionId, databaseName) }
        }
      ],
      position: { x: e.clientX, y: e.clientY }
    })
  }

  function handleMongoDbDatabaseNodeContextMenu(
    e: React.MouseEvent,
    connectionId: string,
    node: ExplorerNode
  ): void {
    e.preventDefault()
    e.stopPropagation()
    const match = node.id.match(/^mongodb-db:(.+)$/)
    if (!match) return
    const databaseName = match[1]
    setContextMenu({
      items: [
        {
          id: 'create-collection',
          label: t('explorer.createCollection.contextMenuLabel'),
          icon: <FolderPlus size={13} />,
          onClick: () => setCreateCollectionDialog({ connectionId, databaseName })
        },
        { id: 'sep', separator: true },
        {
          id: 'refresh-collections',
          label: t('explorer.createCollection.refreshContextMenuLabel'),
          icon: <RefreshCw size={13} />,
          onClick: () => {
            void window.api.database.invalidateCache(connectionId, node.id).then(() => {
              void tree.loadNodeChildren(connectionId, node.id)
            })
          }
        },
        ...(tree.getConnectionCapabilities(connectionId).hasBackupRestore
          ? ([
              { id: 'sep-backup', separator: true },
              {
                id: 'backup',
                label: t('explorer.backup.contextMenuLabel'),
                icon: <DatabaseBackup size={13} />,
                onClick: () => setMongoBackupDialog({ connectionId, databaseName })
              },
              {
                id: 'restore',
                label: t('explorer.restore.contextMenuLabel'),
                icon: <Upload size={13} />,
                onClick: () => setMongoRestoreDialog({ connectionId, databaseName })
              }
            ] as MenuItem[])
          : [])
      ],
      position: { x: e.clientX, y: e.clientY }
    })
  }

  function handleMongoCollectionContextMenu(
    e: React.MouseEvent,
    connectionId: string,
    node: ExplorerNode
  ): void {
    e.preventDefault()
    e.stopPropagation()
    const match = node.id.match(/^mongodb-collection:([^:]+):(.+)$/)
    if (!match) return
    const databaseName = match[1]
    const collectionName = match[2]
    setContextMenu({
      items: buildCollectionContextMenuItems(
        () => setMongoDocumentDialogState({ mode: 'add', connectionId, databaseName, collectionName }),
        () => setRenameCollectionDialog({ connectionId, databaseName, collectionName }),
        () => {
          void (async () => {
            const confirmed = await requestConfirm(
              t('explorer.dropCollection.confirmTitle'),
              t('explorer.dropCollection.confirmMessage', { collectionName })
            )
            if (!confirmed) return
            const result = await window.api.database.dropCollection(connectionId, databaseName, collectionName)
            if (result.status === 'error') { window.alert(result.message); return }
            const nodeId = `mongodb-db:${databaseName}`
            void window.api.database.invalidateCache(connectionId, nodeId).then(() => {
              void tree.loadNodeChildren(connectionId, nodeId)
            })
          })()
        }
      ),
      position: { x: e.clientX, y: e.clientY }
    })
  }

  function handleMongoDocumentsContextMenu(
    e: React.MouseEvent,
    connectionId: string,
    node: ExplorerNode
  ): void {
    e.preventDefault()
    e.stopPropagation()
    const match = node.id.match(/^mongodb-collection-documents:([^:]+):(.+)$/)
    if (!match) return
    const databaseName = match[1]
    const collectionName = match[2]
    const collectionNodeId = `mongodb-collection:${databaseName}:${collectionName}`
    setContextMenu({
      items: [
        { id: 'add-document', label: 'Add Document', icon: <Plus size={13} />, onClick: () => setMongoDocumentDialogState({ mode: 'add', connectionId, databaseName, collectionName }) },
        { id: 'sep', separator: true },
        { id: 'refresh', label: 'Refresh', icon: <RefreshCw size={13} />, onClick: () => {
          void tree.silentRefreshNodeChildren(connectionId, collectionNodeId)
        }}
      ],
      position: { x: e.clientX, y: e.clientY }
    })
  }

  function handleMongoIndexesFolderContextMenu(
    e: React.MouseEvent,
    connectionId: string,
    node: ExplorerNode
  ): void {
    e.preventDefault()
    e.stopPropagation()
    const match = node.id.match(/^mongodb-collection-indexes:([^:]+):(.+)$/)
    if (!match) return
    const databaseName = match[1]
    const collectionName = match[2]
    setContextMenu({
      items: buildMongoIndexesFolderContextMenuItems(
        (key: string, opts?: object | string) => t(key, opts as never) as unknown as string,
        () => setManageMongoIndexesDialog({ connectionId, databaseName, collectionName, openOnNew: true }),
        () => { void tree.silentRefreshNodeChildren(connectionId, node.id) }
      ),
      position: { x: e.clientX, y: e.clientY }
    })
  }

  function handleMongoIndexNodeContextMenu(
    e: React.MouseEvent,
    connectionId: string,
    node: ExplorerNode
  ): void {
    e.preventDefault()
    e.stopPropagation()
    const match = node.id.match(/^mongodb-index:([^:]+):([^:]+):(.+)$/)
    if (!match) return
    const databaseName = match[1]
    const collectionName = match[2]
    const indexName = match[3]
    const isIdIndex = indexName === '_id_'
    const folderNodeId = `mongodb-collection-indexes:${databaseName}:${collectionName}`
    setContextMenu({
      items: buildMongoIndexNodeContextMenuItems(
        (key: string, opts?: object | string) => t(key, opts as never) as unknown as string,
        () => setManageMongoIndexesDialog({ connectionId, databaseName, collectionName, initialIndexName: indexName }),
        () => {
          void (async () => {
            const confirmed = await requestConfirm(
              t('explorer.manageMongoIndexes.dropConfirmTitle'),
              t('explorer.manageMongoIndexes.dropConfirmMessage', { indexName })
            )
            if (!confirmed) return
            const result = await window.api.database.dropMongoIndex(connectionId, databaseName, collectionName, indexName)
            if (result.status === 'error') { window.alert(result.message); return }
            void window.api.database.invalidateCache(connectionId, folderNodeId).then(() => {
              void tree.loadNodeChildren(connectionId, folderNodeId)
            })
          })()
        },
        isIdIndex
      ),
      position: { x: e.clientX, y: e.clientY }
    })
  }

  function handleMongoAggregationsFolderContextMenu(
    e: React.MouseEvent,
    connectionId: string,
    node: ExplorerNode
  ): void {
    e.preventDefault()
    e.stopPropagation()
    const match = node.id.match(/^mongodb-collection-aggregations:([^:]+):(.+)$/)
    if (!match) return
    const databaseName = match[1]
    const collectionName = match[2]
    setContextMenu({
      items: buildMongoAggregationsFolderContextMenuItems(
        () => setManageMongoAggregationsDialog({ connectionId, databaseName, collectionName, openOnNew: true }),
        () => { void tree.silentRefreshNodeChildren(connectionId, node.id) }
      ),
      position: { x: e.clientX, y: e.clientY }
    })
  }

  function handleMongoAggregationNodeContextMenu(
    e: React.MouseEvent,
    connectionId: string,
    node: ExplorerNode
  ): void {
    e.preventDefault()
    e.stopPropagation()
    const match = node.id.match(/^mongodb-aggregation:([^:]+):([^:]+):(.+)$/)
    if (!match) return
    const databaseName = match[1]
    const collectionName = match[2]
    const aggregationId = match[3]
    const folderNodeId = `mongodb-collection-aggregations:${databaseName}:${collectionName}`
    setContextMenu({
      items: buildMongoAggregationNodeContextMenuItems(
        () => setManageMongoAggregationsDialog({ connectionId, databaseName, collectionName, initialAggregationId: aggregationId }),
        () => {
          void (async () => {
            const confirmed = await requestConfirm('Delete Aggregation', 'Delete this aggregation permanently? This action cannot be undone.')
            if (!confirmed) return
            const result = await window.api.database.deleteMongoAggregation(connectionId, databaseName, collectionName, aggregationId)
            if (result.status === 'error') { window.alert(result.message); return }
            void window.api.database.invalidateCache(connectionId, folderNodeId).then(() => {
              void tree.loadNodeChildren(connectionId, folderNodeId)
            })
          })()
        }
      ),
      position: { x: e.clientX, y: e.clientY }
    })
  }

  function handleMongoValidationContextMenu(
    e: React.MouseEvent,
    connectionId: string,
    node: ExplorerNode
  ): void {
    e.preventDefault()
    e.stopPropagation()
    const match = node.id.match(/^mongodb-collection-validation:([^:]+):(.+)$/)
    if (!match) return
    const databaseName = match[1]
    const collectionName = match[2]
    setContextMenu({
      items: buildMongoValidationContextMenuItems(
        () => setCollectionValidationDialog({ connectionId, databaseName, collectionName })
      ),
      position: { x: e.clientX, y: e.clientY }
    })
  }

  function handleRedisKeyspaceContextMenu(
    e: React.MouseEvent,
    connectionId: string,
    node: ExplorerNode
  ): void {
    e.preventDefault()
    e.stopPropagation()
    const match = node.id.match(/^redis-db:(\d+)$/)
    const dbIndex = match ? parseInt(match[1], 10) : 0
    const conn = tree.connections.find((c) => c.id === connectionId)
    const title = `${conn?.name ?? connectionId} — DB ${dbIndex} — Explorer`
    setContextMenu({
      items: [
        {
          id: 'explore-data',
          label: t('explorer.redisKeyspace.exploreDataContextMenuLabel'),
          icon: <TableProperties size={13} />,
          onClick: () =>
            tabsMgr.openOrFocusRedisDbExplorerTab(
              connectionId,
              dbIndex,
              title,
              tree.setActiveConnectionId
            )
        },
        { id: 'sep-keyspace', separator: true },
        {
          id: 'refresh-keyspace',
          label: t('explorer.redisKeyspace.refreshContextMenuLabel'),
          icon: <RefreshCw size={13} />,
          onClick: () => {
            void window.api.database.invalidateCache(connectionId, node.id).then(() => {
              void tree.loadNodeChildren(connectionId, node.id)
            })
          }
        },
        { id: 'sep-backup', separator: true },
        {
          id: 'backup',
          label: t('explorer.redisBackup.contextMenuLabel'),
          icon: <DatabaseBackup size={13} />,
          onClick: () =>
            setRedisBackupDialog({
              connectionId,
              scope: { kind: 'database', databaseIndex: dbIndex }
            })
        },
        {
          id: 'restore',
          label: t('explorer.redisRestore.contextMenuLabel'),
          icon: <Upload size={13} />,
          onClick: () =>
            setRedisRestoreDialog({
              connectionId,
              scope: { kind: 'database', databaseIndex: dbIndex }
            })
        }
      ],
      position: { x: e.clientX, y: e.clientY }
    })
  }

  function handleRedisKeyContextMenu(
    e: React.MouseEvent,
    connectionId: string,
    node: ExplorerNode
  ): void {
    e.preventDefault()
    e.stopPropagation()
    // node.id pattern: redis-key:<dbIndex>:<keyName>
    const match = node.id.match(/^redis-key:(\d+):(.+)$/)
    if (!match) return
    const [, databaseIndex, keyName] = match
    // Determine parent node IDs for cache invalidation
    const keyspaceId = `redis-db:${databaseIndex}`
    // Check if this key lives under a prefix (e.g. "user:123" belongs to prefix "user")
    const colonIdx = keyName.indexOf(':')
    const prefixId = colonIdx > 0 ? `redis-prefix:${databaseIndex}:${keyName.slice(0, colonIdx)}` : null
    setContextMenu({
      items: [
        {
          id: 'sep-danger',
          separator: true
        },
        {
          id: 'delete-redis-key',
          label: t('explorer.deleteRedisKey.contextMenuLabel'),
          icon: <Trash2 size={13} />,
          onClick: () => {
            void (async () => {
              const confirmed = await requestConfirm(
                t('explorer.deleteRedisKey.confirmTitle'),
                t('explorer.deleteRedisKey.confirmMessage', { keyName })
              )
              if (!confirmed) return
              const result = await window.api.database.deleteRedisKey(connectionId, databaseIndex, keyName)
              if (result.status === 'error') { window.alert(result.message); return }
              void window.api.database.invalidateCache(connectionId, keyspaceId).then(() => {
                void tree.loadNodeChildren(connectionId, keyspaceId)
              })
              if (prefixId) {
                void window.api.database.invalidateCache(connectionId, prefixId).then(() => {
                  void tree.loadNodeChildren(connectionId, prefixId)
                })
              }
            })()
          }
        }
      ],
      position: { x: e.clientX, y: e.clientY }
    })
  }

  function handleRedisPrefixContextMenu(
    e: React.MouseEvent,
    connectionId: string,
    node: ExplorerNode
  ): void {
    e.preventDefault()
    e.stopPropagation()
    // node.id pattern: redis-prefix:<dbIndex>:<prefix>
    const match = node.id.match(/^redis-prefix:(\d+):(.+)$/)
    if (!match) return
    const [, databaseIndex, prefix] = match
    const keyspaceId = `redis-db:${databaseIndex}`
    setContextMenu({
      items: [
        {
          id: 'sep-danger',
          separator: true
        },
        {
          id: 'delete-redis-prefix',
          label: t('explorer.deleteRedisPrefix.contextMenuLabel'),
          icon: <Trash2 size={13} />,
          onClick: () => {
            void (async () => {
              const confirmed = await requestConfirm(
                t('explorer.deleteRedisPrefix.confirmTitle'),
                t('explorer.deleteRedisPrefix.confirmMessage', { prefix })
              )
              if (!confirmed) return
              const result = await window.api.database.deleteRedisPrefix(connectionId, databaseIndex, prefix)
              if (result.status === 'error') { window.alert(result.message); return }
              void window.api.database.invalidateCache(connectionId, keyspaceId).then(() => {
                void tree.loadNodeChildren(connectionId, keyspaceId)
              })
            })()
          }
        }
      ],
      position: { x: e.clientX, y: e.clientY }
    })
  }

  function handleTableNodeContextMenu(
    e: React.MouseEvent,
    connectionId: string,
    node: ExplorerNode
  ): void {
    e.preventDefault()
    e.stopPropagation()
    const match = node.id.match(/^db:([^:]+):tables:([^.]+)\.(.+)$/)
    if (!match) return
    const [, databaseName, schema, tableName] = match
    const conn = tree.connections.find((c) => c.id === connectionId)
    if (!conn) return
    setContextMenu({
      items: [
        {
          id: 'new-query',
          label: t('explorer.newQuery'),
          icon: <FilePlus size={13} />,
          onClick: () => tabsMgr.openQueryTabForConnection(connectionId, databaseName, tree.setActiveConnectionId)
        },
        { id: 'sep', separator: true },
        {
          id: 'refresh-table',
          label: t('explorer.createTable.refreshContextMenuLabel'),
          icon: <RefreshCw size={13} />,
          onClick: () => {
            void window.api.database.invalidateCache(connectionId, node.id).then(() => {
              void tree.loadNodeChildren(connectionId, node.id)
            })
          }
        },
        { id: 'sep-2', separator: true },
        {
          id: 'select-top-rows',
          label: t('explorer.selectTopRows', { count: settings.selectTopRowsCount }),
          icon: <List size={13} />,
          onClick: () => { void handleSelectTopRows(connectionId, databaseName, schema, tableName) }
        },
        {
          id: 'create-script',
          label: 'Script...',
          icon: <ScrollText size={13} />,
          items: [
            {
              id: 'create-script-create',
              label: 'Create',
              onClick: () => {
                void window.api.database.scriptTableCreate(connectionId, databaseName, schema, tableName).then((result) => {
                  if (result.status !== 'ok') return
                  tabsMgr.openScriptTab(`Create — ${tableName}`, result.script, connectionId, databaseName, tree.setActiveConnectionId)
                })
              }
            },
            {
              id: 'create-script-update',
              label: 'Update',
              onClick: () => {
                void window.api.database.scriptTableAlter(connectionId, databaseName, schema, tableName).then((result) => {
                  if (result.status !== 'ok') return
                  tabsMgr.openScriptTab(`Alter — ${tableName}`, result.script, connectionId, databaseName, tree.setActiveConnectionId)
                })
              }
            },
            {
              id: 'create-script-drop',
              label: 'Drop',
              onClick: () => {
                void window.api.database.scriptTableDrop(connectionId, databaseName, schema, tableName).then((result) => {
                  if (result.status !== 'ok') return
                  tabsMgr.openScriptTab(`Drop — ${tableName}`, result.script, connectionId, databaseName, tree.setActiveConnectionId)
                })
              }
            }
          ]
        },
        {
          id: 'edit-table',
          label: t('explorer.editTable.contextMenuLabel'),
          icon: <Pencil size={13} />,
          onClick: () => setCreateTableDialog({ connectionId, databaseName, provider: conn.provider, editTable: { schema, tableName } })
        },
        { id: 'sep-3', separator: true },
        {
          id: 'delete-table',
          label: t('explorer.dropTable.contextMenuLabel'),
          icon: <Trash2 size={13} />,
          onClick: () => { void handleDropTable(connectionId, databaseName, schema, tableName) }
        }
      ],
      position: { x: e.clientX, y: e.clientY }
    })
  }

  function handleTableSubFolderContextMenu(
    e: React.MouseEvent,
    connectionId: string,
    node: ExplorerNode
  ): void {
    e.preventDefault()
    e.stopPropagation()
    const match = node.id.match(
      /^db:([^:]+):tables:([^.]+)\.(.+):(columns|keys|constraints|triggers|indexes|statistics)$/
    )
    if (!match) return
    const [, databaseName, schema, tableName] = match
    const conn = tree.connections.find((c) => c.id === connectionId)
    if (!conn) return
    const items: MenuItem[] = [
      {
        id: 'refresh',
        label: t('explorer.createTable.refreshContextMenuLabel'),
        icon: <RefreshCw size={13} />,
        onClick: () => {
          void window.api.database.invalidateCache(connectionId, node.id).then(() => {
            void tree.loadNodeChildren(connectionId, node.id)
          })
        }
      },
      {
        id: 'edit-table',
        label: t('explorer.editTable.contextMenuLabel'),
        icon: <Pencil size={13} />,
        onClick: () => setCreateTableDialog({ connectionId, databaseName, provider: conn.provider, editTable: { schema, tableName } })
      }
    ]
    if (node.kind === 'table-keys-folder') {
      items.push(
        { id: 'sep-fk', separator: true },
        {
          id: 'add-foreign-key',
          label: t('explorer.foreignKeys.addContextMenuLabel', 'Add Foreign Key'),
          icon: <Key size={13} />,
          onClick: () => setManageForeignKeysDialog({ connectionId, databaseName, schema, tableName })
        }
      )
    }
    if (node.kind === 'table-constraints-folder') {
      items.push(
        { id: 'sep-cc', separator: true },
        {
          id: 'add-constraint',
          label: t('explorer.checkConstraints.addContextMenuLabel', 'Add Constraint'),
          icon: <Lock size={13} />,
          onClick: () => setManageConstraintsDialog({ connectionId, databaseName, schema, tableName, openAddNew: true })
        }
      )
    }
    if (node.kind === 'table-triggers-folder') {
      items.push(
        { id: 'sep-tr', separator: true },
        {
          id: 'create-trigger',
          label: t('explorer.manageTriggers.createContextMenuLabel'),
          icon: <Bell size={13} />,
          onClick: () => setManageTriggersDialog({ connectionId, databaseName, schema, tableName, openOnNew: true })
        }
      )
    }
    if (node.kind === 'table-indexes-folder') {
      items.push(
        { id: 'sep-idx', separator: true },
        {
          id: 'create-index',
          label: t('explorer.manageIndexes.createContextMenuLabel'),
          icon: <ListOrdered size={13} />,
          onClick: () => setManageIndexesDialog({ connectionId, databaseName, schema, tableName, openOnNew: true })
        }
      )
    }
    setContextMenu({ items, position: { x: e.clientX, y: e.clientY } })
  }

  function handleKeyNodeContextMenu(
    e: React.MouseEvent,
    connectionId: string,
    node: ExplorerNode
  ): void {
    if (!node.label.includes('(FOREIGN KEY)')) return
    e.preventDefault()
    e.stopPropagation()
    const match = node.id.match(/^db:([^:]+):tables:([^.]+)\.(.+):keys:(.+)$/)
    if (!match) return
    const [, databaseName, schema, tableName, constraintName] = match
    setContextMenu({
      items: [{
        id: 'edit-foreign-key',
        label: t('explorer.foreignKeys.editContextMenuLabel', 'Edit Foreign Key'),
        icon: <Key size={13} />,
        onClick: () => setManageForeignKeysDialog({ connectionId, databaseName, schema, tableName, initialFkName: constraintName })
      }],
      position: { x: e.clientX, y: e.clientY }
    })
  }

  function handleConstraintNodeContextMenu(
    e: React.MouseEvent,
    connectionId: string,
    node: ExplorerNode
  ): void {
    if (!node.label.includes('(CHECK)')) return
    e.preventDefault()
    e.stopPropagation()
    const match = node.id.match(/^db:([^:]+):tables:([^.]+)\.(.+):constraints:(.+)$/)
    if (!match) return
    const [, databaseName, schema, tableName, constraintName] = match
    setContextMenu({
      items: [{
        id: 'edit-constraint',
        label: t('explorer.checkConstraints.editContextMenuLabel', 'Edit Constraint'),
        icon: <Lock size={13} />,
        onClick: () => setManageConstraintsDialog({ connectionId, databaseName, schema, tableName, initialConstraintName: constraintName })
      }],
      position: { x: e.clientX, y: e.clientY }
    })
  }

  function handleTriggerNodeContextMenu(
    e: React.MouseEvent,
    connectionId: string,
    node: ExplorerNode
  ): void {
    e.preventDefault()
    e.stopPropagation()
    const match = node.id.match(/^db:([^:]+):tables:([^.]+)\.(.+):triggers:(.+)$/)
    if (!match) return
    const [, databaseName, schema, tableName, triggerName] = match
    setContextMenu({
      items: [{
        id: 'edit-trigger',
        label: t('explorer.manageTriggers.editContextMenuLabel'),
        icon: <Bell size={13} />,
        onClick: () => setManageTriggersDialog({ connectionId, databaseName, schema, tableName, initialTriggerName: triggerName })
      }],
      position: { x: e.clientX, y: e.clientY }
    })
  }

  function handleIndexNodeContextMenu(
    e: React.MouseEvent,
    connectionId: string,
    node: ExplorerNode
  ): void {
    e.preventDefault()
    e.stopPropagation()
    const match = node.id.match(/^db:([^:]+):tables:([^.]+)\.(.+):indexes:(.+)$/)
    if (!match) return
    const [, databaseName, schema, tableName, indexName] = match
    const caps = tree.getConnectionCapabilities(connectionId)
    setContextMenu({
      items: [
        {
          id: 'edit-index',
          label: t('explorer.manageIndexes.editContextMenuLabel'),
          icon: <ListOrdered size={13} />,
          onClick: () => setManageIndexesDialog({ connectionId, databaseName, schema, tableName, initialIndexName: indexName })
        },
        { id: 'sep-idx-ops', separator: true },
        ...(caps.hasIndexRebuild ? [{
          id: 'rebuild-index',
          label: t('explorer.manageIndexes.rebuild'),
          icon: <ListOrdered size={13} />,
          onClick: () => {
            void window.api.database
              .rebuildIndex(connectionId, databaseName, indexName, schema, tableName)
              .then((result) => {
                if (result.status !== 'error') {
                  void window.api.database.invalidateCache(connectionId, `db:${databaseName}:tables:${schema}.${tableName}:indexes`).then(() => {
                    void tree.loadNodeChildren(connectionId, `db:${databaseName}:tables:${schema}.${tableName}:indexes`)
                  })
                }
              })
          }
        }] : []),
        ...(caps.hasIndexReorganize ? [{
          id: 'reorganize-index',
          label: t('explorer.manageIndexes.reorganize'),
          icon: <ListOrdered size={13} />,
          onClick: () => {
            void window.api.database
              .reorganizeIndex(connectionId, databaseName, indexName, schema, tableName)
              .then((result) => {
                if (result.status !== 'error') {
                  void window.api.database.invalidateCache(connectionId, `db:${databaseName}:tables:${schema}.${tableName}:indexes`).then(() => {
                    void tree.loadNodeChildren(connectionId, `db:${databaseName}:tables:${schema}.${tableName}:indexes`)
                  })
                }
              })
          }
        }] : []),
        ...(caps.hasIndexDisable ? [{
          id: 'disable-index',
          label: t('explorer.manageIndexes.disable'),
          icon: <ListOrdered size={13} />,
          onClick: () => {
            void window.api.database
              .disableIndex(connectionId, databaseName, indexName, schema, tableName)
              .then((result) => {
                if (result.status !== 'error') {
                  void window.api.database.invalidateCache(connectionId, `db:${databaseName}:tables:${schema}.${tableName}:indexes`).then(() => {
                    void tree.loadNodeChildren(connectionId, `db:${databaseName}:tables:${schema}.${tableName}:indexes`)
                  })
                }
              })
          }
        }] : [])
      ],
      position: { x: e.clientX, y: e.clientY }
    })
  }

  function handleViewsFolderContextMenu(
    e: React.MouseEvent,
    connectionId: string,
    node: ExplorerNode
  ): void {
    e.preventDefault()
    e.stopPropagation()
    const match = node.id.match(/^db:([^:]+):views$/)
    if (!match) return
    const databaseName = match[1]
    setContextMenu({
      items: [
        {
          id: 'refresh-views',
          label: t('explorer.manageViews.refreshContextMenuLabel'),
          icon: <RefreshCw size={13} />,
          onClick: () => {
            void window.api.database.invalidateCache(connectionId, node.id).then(() => {
              void tree.loadNodeChildren(connectionId, node.id)
            })
          }
        },
        {
          id: 'create-view',
          label: t('explorer.manageViews.createContextMenuLabel'),
          icon: <Eye size={13} />,
          onClick: () => setManageViewsDialog({ connectionId, databaseName, openOnNew: true })
        }
      ],
      position: { x: e.clientX, y: e.clientY }
    })
  }

  function handleViewNodeContextMenu(
    e: React.MouseEvent,
    connectionId: string,
    node: ExplorerNode
  ): void {
    e.preventDefault()
    e.stopPropagation()
    const match = node.id.match(/^db:([^:]+):views:([^.]+)\.(.+)$/)
    if (!match) return
    const [, databaseName, schema, viewName] = match
    setContextMenu({
      items: [
        {
          id: 'edit-view',
          label: t('explorer.manageViews.editContextMenuLabel'),
          icon: <Eye size={13} />,
          onClick: () => setManageViewsDialog({ connectionId, databaseName, initialViewName: viewName })
        },
        { id: 'sep-view-script', separator: true },
        {
          id: 'view-script',
          label: 'Script...',
          icon: <ScrollText size={13} />,
          items: [
            {
              id: 'view-script-create',
              label: 'Create',
              onClick: () => {
                void window.api.database.scriptViewCreate(connectionId, databaseName, schema, viewName).then((result) => {
                  if (result.status !== 'ok') return
                  tabsMgr.openScriptTab(`Create — ${viewName}`, result.script, connectionId, databaseName, tree.setActiveConnectionId)
                })
              }
            },
            {
              id: 'view-script-update',
              label: 'Update',
              onClick: () => {
                void window.api.database.scriptViewAlter(connectionId, databaseName, schema, viewName).then((result) => {
                  if (result.status !== 'ok') return
                  tabsMgr.openScriptTab(`Alter — ${viewName}`, result.script, connectionId, databaseName, tree.setActiveConnectionId)
                })
              }
            },
            {
              id: 'view-script-drop',
              label: 'Delete',
              onClick: () => {
                void window.api.database.scriptViewDrop(connectionId, databaseName, schema, viewName).then((result) => {
                  if (result.status !== 'ok') return
                  tabsMgr.openScriptTab(`Drop — ${viewName}`, result.script, connectionId, databaseName, tree.setActiveConnectionId)
                })
              }
            }
          ]
        }
      ],
      position: { x: e.clientX, y: e.clientY }
    })
  }

  function handleStoredProceduresFolderContextMenu(
    e: React.MouseEvent,
    connectionId: string,
    node: ExplorerNode
  ): void {
    e.preventDefault()
    e.stopPropagation()
    const match = node.id.match(/^db:([^:]+):stored-procedures$/)
    if (!match) return
    const databaseName = match[1]
    setContextMenu({
      items: [
        {
          id: 'refresh-stored-procedures',
          label: t('explorer.manageStoredProcedures.refreshContextMenuLabel'),
          icon: <RefreshCw size={13} />,
          onClick: () => {
            void window.api.database.invalidateCache(connectionId, node.id).then(() => {
              void tree.loadNodeChildren(connectionId, node.id)
            })
          }
        },
        {
          id: 'create-stored-procedure',
          label: t('explorer.manageStoredProcedures.createContextMenuLabel'),
          icon: <Code size={13} />,
          onClick: () => setManageStoredProceduresDialog({ connectionId, databaseName, openOnNew: true })
        }
      ],
      position: { x: e.clientX, y: e.clientY }
    })
  }

  function handleStoredProcedureNodeContextMenu(
    e: React.MouseEvent,
    connectionId: string,
    node: ExplorerNode
  ): void {
    e.preventDefault()
    e.stopPropagation()
    const match = node.id.match(/^db:([^:]+):stored-procedures:([^.]+)\.(.+)$/)
    if (!match) return
    const [, databaseName, schema, procedureName] = match
    setContextMenu({
      items: [
        {
          id: 'edit-stored-procedure',
          label: t('explorer.manageStoredProcedures.editContextMenuLabel'),
          icon: <Code size={13} />,
          onClick: () => setManageStoredProceduresDialog({ connectionId, databaseName, initialProcedureName: procedureName })
        },
        { id: 'sep-sp-script', separator: true },
        {
          id: 'sp-script',
          label: 'Script...',
          icon: <ScrollText size={13} />,
          items: [
            {
              id: 'sp-script-create',
              label: 'Create',
              onClick: () => {
                void window.api.database.scriptStoredProcedureCreate(connectionId, databaseName, schema, procedureName).then((result) => {
                  if (result.status !== 'ok') return
                  tabsMgr.openScriptTab(`Create — ${procedureName}`, result.script, connectionId, databaseName, tree.setActiveConnectionId)
                })
              }
            },
            {
              id: 'sp-script-update',
              label: 'Update',
              onClick: () => {
                void window.api.database.scriptStoredProcedureAlter(connectionId, databaseName, schema, procedureName).then((result) => {
                  if (result.status !== 'ok') return
                  tabsMgr.openScriptTab(`Alter — ${procedureName}`, result.script, connectionId, databaseName, tree.setActiveConnectionId)
                })
              }
            },
            {
              id: 'sp-script-drop',
              label: 'Delete',
              onClick: () => {
                void window.api.database.scriptStoredProcedureDrop(connectionId, databaseName, schema, procedureName).then((result) => {
                  if (result.status !== 'ok') return
                  tabsMgr.openScriptTab(`Drop — ${procedureName}`, result.script, connectionId, databaseName, tree.setActiveConnectionId)
                })
              }
            }
          ]
        }
      ],
      position: { x: e.clientX, y: e.clientY }
    })
  }

  function handleTypeDataTypesFolderContextMenu(
    e: React.MouseEvent,
    connectionId: string,
    node: ExplorerNode
  ): void {
    e.preventDefault()
    e.stopPropagation()
    const match = node.id.match(/^db:([^:]+):types:data-types$/)
    if (!match) return
    const databaseName = match[1]
    setContextMenu({
      items: [
        {
          id: 'refresh-data-types',
          label: t('explorer.manageDataTypes.refreshContextMenuLabel'),
          icon: <RefreshCw size={13} />,
          onClick: () => {
            void window.api.database.invalidateCache(connectionId, node.id).then(() => {
              void tree.loadNodeChildren(connectionId, node.id)
            })
          }
        },
        {
          id: 'create-data-type',
          label: t('explorer.manageDataTypes.createContextMenuLabel'),
          icon: <Tag size={13} />,
          onClick: () => setManageDataTypesDialog({ connectionId, databaseName, openOnNew: true })
        }
      ],
      position: { x: e.clientX, y: e.clientY }
    })
  }

  function handleDataTypeNodeContextMenu(
    e: React.MouseEvent,
    connectionId: string,
    node: ExplorerNode
  ): void {
    e.preventDefault()
    e.stopPropagation()
    const match = node.id.match(/^db:([^:]+):types:data-types:(.+)$/)
    if (!match) return
    const [, databaseName, typeIdentifier] = match
    setContextMenu({
      items: [{
        id: 'edit-data-type',
        label: t('explorer.manageDataTypes.editContextMenuLabel'),
        icon: <Tag size={13} />,
        onClick: () => setManageDataTypesDialog({ connectionId, databaseName, initialTypeName: typeIdentifier })
      }],
      position: { x: e.clientX, y: e.clientY }
    })
  }

  function handleTypeTablesFolderContextMenu(
    e: React.MouseEvent,
    connectionId: string,
    node: ExplorerNode
  ): void {
    e.preventDefault()
    e.stopPropagation()
    const match = node.id.match(/^db:([^:]+):types:tables$/)
    if (!match) return
    const databaseName = match[1]
    setContextMenu({
      items: [
        {
          id: 'refresh-table-types',
          label: t('explorer.manageTableTypes.refreshContextMenuLabel'),
          icon: <RefreshCw size={13} />,
          onClick: () => {
            void window.api.database.invalidateCache(connectionId, node.id).then(() => {
              void tree.loadNodeChildren(connectionId, node.id)
            })
          }
        },
        {
          id: 'create-table-type',
          label: t('explorer.manageTableTypes.createContextMenuLabel'),
          icon: <Tag size={13} />,
          onClick: () => setManageTableTypesDialog({ connectionId, databaseName, openOnNew: true })
        }
      ],
      position: { x: e.clientX, y: e.clientY }
    })
  }

  function handleTableTypeNodeContextMenu(
    e: React.MouseEvent,
    connectionId: string,
    node: ExplorerNode
  ): void {
    e.preventDefault()
    e.stopPropagation()
    const match = node.id.match(/^db:([^:]+):types:tables:(.+)$/)
    if (!match) return
    const [, databaseName, typeIdentifier] = match
    setContextMenu({
      items: [{
        id: 'edit-table-type',
        label: t('explorer.manageTableTypes.editContextMenuLabel'),
        icon: <Tag size={13} />,
        onClick: () => setManageTableTypesDialog({ connectionId, databaseName, initialTypeName: typeIdentifier })
      }],
      position: { x: e.clientX, y: e.clientY }
    })
  }

  function handleTypeMemoryOptimizedTablesFolderContextMenu(
    e: React.MouseEvent,
    connectionId: string,
    node: ExplorerNode
  ): void {
    e.preventDefault()
    e.stopPropagation()
    const match = node.id.match(/^db:([^:]+):types:memory-optimized-tables$/)
    if (!match) return
    const databaseName = match[1]
    setContextMenu({
      items: [
        {
          id: 'refresh-memory-optimized-table-types',
          label: t('explorer.manageMemoryOptimizedTableTypes.refreshContextMenuLabel'),
          icon: <RefreshCw size={13} />,
          onClick: () => {
            void window.api.database.invalidateCache(connectionId, node.id).then(() => {
              void tree.loadNodeChildren(connectionId, node.id)
            })
          }
        },
        {
          id: 'create-memory-optimized-table-type',
          label: t('explorer.manageMemoryOptimizedTableTypes.createContextMenuLabel'),
          icon: <Tag size={13} />,
          onClick: () => setManageMemoryOptimizedTableTypesDialog({ connectionId, databaseName, openOnNew: true })
        }
      ],
      position: { x: e.clientX, y: e.clientY }
    })
  }

  function handleMemoryOptimizedTableTypeNodeContextMenu(
    e: React.MouseEvent,
    connectionId: string,
    node: ExplorerNode
  ): void {
    e.preventDefault()
    e.stopPropagation()
    const match = node.id.match(/^db:([^:]+):types:memory-optimized-tables:(.+)$/)
    if (!match) return
    const [, databaseName, typeIdentifier] = match
    setContextMenu({
      items: [{
        id: 'edit-memory-optimized-table-type',
        label: t('explorer.manageMemoryOptimizedTableTypes.editContextMenuLabel'),
        icon: <Tag size={13} />,
        onClick: () => setManageMemoryOptimizedTableTypesDialog({ connectionId, databaseName, initialTypeName: typeIdentifier })
      }],
      position: { x: e.clientX, y: e.clientY }
    })
  }

  function handleTypeEnumsFolderContextMenu(
    e: React.MouseEvent,
    connectionId: string,
    node: ExplorerNode
  ): void {
    e.preventDefault()
    e.stopPropagation()
    const match = node.id.match(/^db:([^:]+):types:enums$/)
    if (!match) return
    const databaseName = match[1]
    setContextMenu({
      items: [
        {
          id: 'refresh-enums',
          label: t('explorer.manageDataTypes.refreshContextMenuLabel'),
          icon: <RefreshCw size={13} />,
          onClick: () => {
            void window.api.database.invalidateCache(connectionId, node.id).then(() => {
              void tree.loadNodeChildren(connectionId, node.id)
            })
          }
        },
        {
          id: 'create-enum',
          label: t('explorer.manageDataTypes.createContextMenuLabel'),
          icon: <Tag size={13} />,
          onClick: () => setManageDataTypesDialog({ connectionId, databaseName, openOnNew: true })
        }
      ],
      position: { x: e.clientX, y: e.clientY }
    })
  }

  function handleTypeCompositesFolderContextMenu(
    e: React.MouseEvent,
    connectionId: string,
    node: ExplorerNode
  ): void {
    e.preventDefault()
    e.stopPropagation()
    const match = node.id.match(/^db:([^:]+):types:composites$/)
    if (!match) return
    const databaseName = match[1]
    setContextMenu({
      items: [
        {
          id: 'refresh-composites',
          label: t('explorer.manageTableTypes.refreshContextMenuLabel'),
          icon: <RefreshCw size={13} />,
          onClick: () => {
            void window.api.database.invalidateCache(connectionId, node.id).then(() => {
              void tree.loadNodeChildren(connectionId, node.id)
            })
          }
        },
        {
          id: 'create-composite',
          label: t('explorer.manageTableTypes.createContextMenuLabel'),
          icon: <Tag size={13} />,
          onClick: () => setManageTableTypesDialog({ connectionId, databaseName, openOnNew: true })
        }
      ],
      position: { x: e.clientX, y: e.clientY }
    })
  }

  function handleConnectionContextMenu(
    e: React.MouseEvent,
    conn: ConnectionRecord
  ): void {
    e.preventDefault()
    const state = tree.getRuntimeState(conn.id)
    const items: MenuItem[] = [
      {
        id: 'edit',
        label: t('explorer.contextMenu.edit'),
        icon: <Pencil size={13} />,
        onClick: () => { void tree.handleEditAction(conn.id, t, requestConfirmDefault, setIsDialogOpen, setEditingConnection) }
      }
    ]
    if (state.status === 'connected') {
      items.push({
        id: 'disconnect',
        label: t('explorer.contextMenu.disconnect'),
        icon: <PlugZap size={13} />,
        onClick: () => { void tree.handleDisconnectAction(conn.id) }
      })
    } else if (state.status === 'disconnected' || state.status === 'error') {
      items.push({
        id: 'connect',
        label: t('explorer.contextMenu.connect'),
        icon: <Plug size={13} />,
        onClick: () => {
          if (conn.provider === 'sqlite' && conn.filePath) {
            void (async () => {
              const exists = await window.api.file.checkFileExists(conn.filePath!)
              if (
                !exists &&
                !window.confirm(
                  `"${conn.filePath}" does not exist.\n\nCreate a new SQLite database at this path?`
                )
              )
                return
              tree.handleConnectAction(conn.id)
            })()
          } else {
            tree.handleConnectAction(conn.id)
          }
        }
      })
    }
    items.push({ id: 'sep', separator: true })
    if (conn.provider === 'redis' && state.status === 'connected') {
      items.push({
        id: 'redis-dashboard',
        label: t('explorer.redisDashboard.contextMenuLabel'),
        icon: <BarChart2 size={13} />,
        onClick: () => tabsMgr.openOrFocusDashboardTab('redis', conn.id, `${conn.name} — Dashboard`, tree.setActiveConnectionId)
      })
    }
    if (conn.provider === 'redis') {
      items.push({
        id: 'redis-shell',
        label: 'Open Shell',
        icon: <TerminalSquare size={13} />,
        onClick: () => {
          if (state.status !== 'connected') tree.handleConnectAction(conn.id)
          tabsMgr.openOrFocusRedisShellTab(conn.id, `${conn.name} — Shell`, conn.defaultDatabase, tree.setActiveConnectionId)
        }
      })
      items.push({ id: 'sep-del', separator: true })
    }
    if (conn.provider === 'mongodb') {
      items.push({
        id: 'mongo-shell',
        label: 'Open Shell',
        icon: <TerminalSquare size={13} />,
        onClick: () => {
          if (state.status !== 'connected') tree.handleConnectAction(conn.id)
          tabsMgr.openOrFocusMongoShellTab(conn.id, `${conn.name} — Shell`, conn.defaultDatabase, tree.setActiveConnectionId)
        }
      })
      items.push({ id: 'sep-shell', separator: true })
    }
    items.push({
      id: 'delete',
      label: t('explorer.contextMenu.delete'),
      icon: <Trash2 size={13} />,
        onClick: () => { void tree.handleDeleteAction(conn.id, (key: string, opts?: object) => t(key, opts as any) as string, requestConfirm) }
    })
    setContextMenu({ items, position: { x: e.clientX, y: e.clientY } })
  }

  // ── Tree rendering ────────────────────────────────────────────────────────

  function renderNodeLoadState(
    connectionId: string,
    parentNode: ExplorerNode
  ): React.JSX.Element {
    const nodeState = tree.nodeStates.get(`${connectionId}/${parentNode.id}`)
    if (!nodeState || nodeState.status === 'loading') {
      return (
        <div className="conn__connecting-row" aria-live="polite">
          <span className="conn__spinner" aria-hidden="true" />
          <span className="conn__connecting-label">{t('explorer.loading')}</span>
        </div>
      )
    }
    if (nodeState.status === 'error') {
      return (
        <div
          className="conn__error-row"
          onClick={() => { void tree.loadNodeChildren(connectionId, parentNode.id) }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') void tree.loadNodeChildren(connectionId, parentNode.id)
          }}
          title={t('explorer.retryConnection')}
        >
          <AlertCircle className="conn__error-icon" />
          <span className="conn__error-message">
            {nodeState.errorMessage || t('explorer.connectionError')}
          </span>
        </div>
      )
    }
    if (nodeState.status === 'loaded') {
      if (!nodeState.children || nodeState.children.length === 0) {
        return <div className="tree-empty-row">{t('explorer.noItems')}</div>
      }
      return (
        <>
          {nodeState.children.map((child) => renderExplorerNode(connectionId, child))}
        </>
      )
    }
    return <></>
  }

  function handleSecurityUsersFolderContextMenu(
    e: React.MouseEvent,
    connectionId: string,
    node: ExplorerNode
  ): void {
    e.preventDefault()
    e.stopPropagation()
    if (node.id !== 'security:users') return
    const provider = tree.connections.find((c) => c.id === connectionId)?.provider
    const isMySql = provider === 'mysql'
    const isRedis = provider === 'redis'
    const isMongo = provider === 'mongodb'
    setContextMenu({
      items: [
        {
          id: 'add-server-user',
          label: isMySql
            ? t('explorer.manageMySqlUsers.addButton')
            : isRedis
              ? t('explorer.manageRedisAclUsers.addButton')
              : isMongo
                ? t('explorer.manageMongoUsers.addButton')
                : t('explorer.manageServerUsers.addButton'),
          icon: <UserPlus size={13} />,
          onClick: () =>
            isMySql
              ? setManageMySqlUsersDialog({ connectionId, openOnNew: true })
              : isRedis
                ? setManageRedisAclUsersDialog({ connectionId, openOnNew: true })
                : isMongo
                  ? setManageMongoUsersDialog({ connectionId, openOnNew: true })
                  : setManageServerUsersDialog({ connectionId, openOnNew: true })
        }
      ],
      position: { x: e.clientX, y: e.clientY }
    })
  }

  function handleSecurityUserNodeContextMenu(
    e: React.MouseEvent,
    connectionId: string,
    node: ExplorerNode
  ): void {
    e.preventDefault()
    e.stopPropagation()
    const match = node.id.match(/^security:users:(.+)$/)
    if (!match) return
    const userKey = match[1]
    const provider = tree.connections.find((c) => c.id === connectionId)?.provider
    const isMySql = provider === 'mysql'
    const isRedis = provider === 'redis'
    const isMongo = provider === 'mongodb'

    if (isMongo) {
      setContextMenu({
        items: [
          {
            id: 'edit-mongo-user',
            label: t('explorer.manageMongoUsers.editButton'),
            icon: <Pencil size={13} />,
            onClick: () => setManageMongoUsersDialog({ connectionId, initialUsername: userKey })
          },
          {
            id: 'delete-mongo-user',
            label: t('explorer.manageMongoUsers.deleteButton'),
            icon: <Trash2 size={13} />,
            onClick: async () => {
              const confirmed = await requestConfirm(
                t('explorer.manageMongoUsers.deleteButton'),
                t('explorer.manageMongoUsers.confirmDelete', { name: userKey })
              )
              if (!confirmed) return
              const result = await window.api.database.deleteMongoUser(connectionId, userKey)
              if (result.status === 'error') { window.alert(result.message); return }
              void window.api.database.invalidateCache(connectionId, 'security:users').then(() => {
                void tree.loadNodeChildren(connectionId, 'security:users')
              })
            }
          }
        ],
        position: { x: e.clientX, y: e.clientY }
      })
    } else if (isRedis) {
      setContextMenu({
        items: [
          {
            id: 'edit-redis-user',
            label: t('explorer.manageRedisAclUsers.editButton'),
            icon: <Pencil size={13} />,
            onClick: () => setManageRedisAclUsersDialog({ connectionId, initialUsername: userKey })
          },
          {
            id: 'delete-redis-user',
            label: t('explorer.manageRedisAclUsers.deleteButton'),
            icon: <Trash2 size={13} />,
            onClick: async () => {
              const confirmed = await requestConfirm(
                t('explorer.manageRedisAclUsers.deleteButton'),
                t('explorer.manageRedisAclUsers.confirmDelete', { name: userKey })
              )
              if (!confirmed) return
              const result = await window.api.database.deleteRedisAclUser(connectionId, userKey)
              if (result.status === 'error') { window.alert(result.message); return }
              void window.api.database.invalidateCache(connectionId, 'security:users').then(() => {
                void tree.loadNodeChildren(connectionId, 'security:users')
              })
            }
          }
        ],
        position: { x: e.clientX, y: e.clientY }
      })
    } else if (isMySql) {
      setContextMenu({
        items: [
          {
            id: 'edit-mysql-user',
            label: t('explorer.manageMySqlUsers.editButton'),
            icon: <Pencil size={13} />,
            onClick: () => setManageMySqlUsersDialog({ connectionId, initialUserKey: userKey })
          },
          {
            id: 'delete-mysql-user',
            label: t('explorer.manageMySqlUsers.deleteButton'),
            icon: <Trash2 size={13} />,
            onClick: async () => {
              const confirmed = await requestConfirm(
                t('explorer.manageMySqlUsers.deleteButton'),
                t('explorer.manageMySqlUsers.confirmDelete', { name: userKey })
              )
              if (!confirmed) return
              const at = userKey.lastIndexOf('@')
              const username = userKey.slice(0, at)
              const host = userKey.slice(at + 1)
              const result = await window.api.database.deleteMySqlUser(connectionId, username, host)
              if (result.status === 'error') { window.alert(result.message); return }
              void window.api.database.invalidateCache(connectionId, 'security:users').then(() => {
                void tree.loadNodeChildren(connectionId, 'security:users')
              })
            }
          }
        ],
        position: { x: e.clientX, y: e.clientY }
      })
    } else {
      setContextMenu({
        items: [
          {
            id: 'edit-server-user',
            label: t('explorer.manageServerUsers.editButton'),
            icon: <Pencil size={13} />,
            onClick: () => setManageServerUsersDialog({ connectionId, initialLoginName: userKey })
          },
          {
            id: 'delete-server-user',
            label: t('explorer.manageServerUsers.deleteButton'),
            icon: <Trash2 size={13} />,
            onClick: async () => {
              const confirmed = await requestConfirm(
                t('explorer.manageServerUsers.deleteButton'),
                t('explorer.manageServerUsers.confirmDelete', { name: userKey })
              )
              if (!confirmed) return
              const result = await window.api.database.deleteServerLogin(connectionId, userKey)
              if (result.status === 'error') { window.alert(result.message); return }
              void window.api.database.invalidateCache(connectionId, 'security:users').then(() => {
                void tree.loadNodeChildren(connectionId, 'security:users')
              })
            }
          }
        ],
        position: { x: e.clientX, y: e.clientY }
      })
    }
  }

  function handleSecurityRolesFolderContextMenu(
    e: React.MouseEvent,
    connectionId: string,
    node: ExplorerNode
  ): void {
    e.preventDefault()
    e.stopPropagation()
    if (node.id !== 'security:roles') return
    setContextMenu({
      items: [
        {
          id: 'add-server-role',
          label: t('explorer.manageServerRoles.addButton'),
          icon: <ShieldPlus size={13} />,
          onClick: () => setManageServerRolesDialog({ connectionId, openOnNew: true })
        }
      ],
      position: { x: e.clientX, y: e.clientY }
    })
  }

  function handleSecurityRoleNodeContextMenu(
    e: React.MouseEvent,
    connectionId: string,
    node: ExplorerNode
  ): void {
    e.preventDefault()
    e.stopPropagation()
    const match = node.id.match(/^security:roles:(.+)$/)
    if (!match) return
    const roleName = match[1]
    setContextMenu({
      items: [
        {
          id: 'edit-server-role',
          label: t('explorer.manageServerRoles.editButton'),
          icon: <Pencil size={13} />,
          onClick: () => setManageServerRolesDialog({ connectionId, initialRoleName: roleName })
        },
        {
          id: 'delete-server-role',
          label: t('explorer.manageServerRoles.deleteButton'),
          icon: <Trash2 size={13} />,
          onClick: async () => {
            const confirmed = await requestConfirm(
              t('explorer.manageServerRoles.deleteButton'),
              t('explorer.manageServerRoles.confirmDeleteContextMenu', { name: roleName })
            )
            if (!confirmed) return
            const result = await window.api.database.deleteServerRole(connectionId, roleName)
            if (result.status === 'error') { window.alert(result.message); return }
            void window.api.database.invalidateCache(connectionId, 'security:roles').then(() => {
              void tree.loadNodeChildren(connectionId, 'security:roles')
            })
          }
        }
      ],
      position: { x: e.clientX, y: e.clientY }
    })
  }

  function handleDbSecurityUsersFolderContextMenu(
    e: React.MouseEvent,
    connectionId: string,
    node: ExplorerNode
  ): void {
    e.preventDefault()
    e.stopPropagation()
    const m = node.id.match(/^db:([^:]+):security:users$/)
    if (!m) return
    const databaseName = m[1]
    const isMySql = tree.connections.find((c) => c.id === connectionId)?.provider === 'mysql'
    setContextMenu({
      items: [
        {
          id: 'add-database-user',
          label: isMySql
            ? t('explorer.manageMySqlDatabaseUsers.editButton')
            : t('explorer.manageDatabaseUsers.addButton'),
          icon: <UserPlus size={13} />,
          onClick: () =>
            isMySql
              ? setManageMySqlDatabaseUsersDialog({ connectionId, databaseName })
              : setManageDatabaseUsersDialog({ connectionId, databaseName, openOnNew: true })
        }
      ],
      position: { x: e.clientX, y: e.clientY }
    })
  }

  function handleDbSecurityUserNodeContextMenu(
    e: React.MouseEvent,
    connectionId: string,
    node: ExplorerNode
  ): void {
    e.preventDefault()
    e.stopPropagation()
    const m = node.id.match(/^db:([^:]+):security:users:(.+)$/)
    if (!m) return
    const databaseName = m[1]
    const dbUserName = m[2]
    const isMySql = tree.connections.find((c) => c.id === connectionId)?.provider === 'mysql'

    if (isMySql) {
      setContextMenu({
        items: [
          {
            id: 'edit-mysql-db-user',
            label: t('explorer.manageMySqlDatabaseUsers.editButton'),
            icon: <Pencil size={13} />,
            onClick: () =>
              setManageMySqlDatabaseUsersDialog({
                connectionId,
                databaseName,
                initialUserKey: dbUserName
              })
          },
          {
            id: 'revoke-mysql-db-user',
            label: t('explorer.manageMySqlDatabaseUsers.deleteButton'),
            icon: <Trash2 size={13} />,
            onClick: async () => {
              const confirmed = await requestConfirm(
                t('explorer.manageMySqlDatabaseUsers.deleteButton'),
                t('explorer.manageMySqlDatabaseUsers.confirmRevoke', {
                  name: dbUserName,
                  database: databaseName
                })
              )
              if (!confirmed) return
              const at = dbUserName.lastIndexOf('@')
              const username = dbUserName.slice(0, at)
              const host = dbUserName.slice(at + 1)
              const result = await window.api.database.saveMySqlDatabaseUserPrivileges(
                connectionId,
                { username, host, databaseName, privileges: [] }
              )
              if (result.status === 'error') { window.alert(result.message); return }
              const nodeId = `db:${databaseName}:security:users`
              void window.api.database.invalidateCache(connectionId, nodeId).then(() => {
                void tree.loadNodeChildren(connectionId, nodeId)
              })
            }
          }
        ],
        position: { x: e.clientX, y: e.clientY }
      })
    } else {
      setContextMenu({
        items: [
          {
            id: 'edit-database-user',
            label: t('explorer.manageDatabaseUsers.editButton'),
            icon: <Pencil size={13} />,
            onClick: () =>
              setManageDatabaseUsersDialog({ connectionId, databaseName, initialUserName: dbUserName })
          },
          {
            id: 'delete-database-user',
            label: t('explorer.manageDatabaseUsers.deleteButton'),
            icon: <Trash2 size={13} />,
            onClick: async () => {
              const confirmed = await requestConfirm(
                t('explorer.manageDatabaseUsers.deleteButton'),
                t('explorer.manageDatabaseUsers.confirmDelete', {
                  name: dbUserName,
                  database: databaseName
                })
              )
              if (!confirmed) return
              const result = await window.api.database.deleteDatabaseUser(
                connectionId,
                databaseName,
                dbUserName
              )
              if (result.status === 'error') { window.alert(result.message); return }
              const nodeId = `db:${databaseName}:security:users`
              void window.api.database.invalidateCache(connectionId, nodeId).then(() => {
                void tree.loadNodeChildren(connectionId, nodeId)
              })
            }
          }
        ],
        position: { x: e.clientX, y: e.clientY }
      })
    }
  }

  function renderExplorerNode(connectionId: string, node: ExplorerNode): React.JSX.Element {
    const nodeKey = `${connectionId}/${node.id}`
    const isExpandable = EXPANDABLE_KINDS.has(node.kind)
    const isExpanded = isExpandable && tree.expandedNodes.has(nodeKey)
    const label = FOLDER_I18N_KEYS[node.kind] ? t(FOLDER_I18N_KEYS[node.kind]!) : node.label
    const Icon = NODE_ICONS[node.kind]
    const dragText = getNodeDragText(node)
    const nodeClassName = `${isExpandable ? 'tree-section__header' : 'tree-leaf'}${tree.selectedKey === nodeKey ? ' tree-node--selected' : ''}`
    const contextMenuHandler =
      node.kind === 'databases-folder'
        ? (e: React.MouseEvent<HTMLDivElement>) => handleDatabasesNodeContextMenu(e, connectionId)
        : node.kind === 'database' && node.id.startsWith('mongodb-db:')
          ? (e: React.MouseEvent<HTMLDivElement>) => handleMongoDbDatabaseNodeContextMenu(e, connectionId, node)
          : node.kind === 'database'
            ? (e: React.MouseEvent<HTMLDivElement>) => handleDatabaseNodeContextMenu(e, connectionId, node)
            : node.kind === 'tables-folder'
            ? (e: React.MouseEvent<HTMLDivElement>) => handleTablesFolderContextMenu(e, connectionId, node)
            : node.kind === 'table'
              ? (e: React.MouseEvent<HTMLDivElement>) => handleTableNodeContextMenu(e, connectionId, node)
              : node.kind === 'table-columns-folder' ||
                  node.kind === 'table-keys-folder' ||
                  node.kind === 'table-constraints-folder' ||
                  node.kind === 'table-triggers-folder' ||
                  node.kind === 'table-indexes-folder' ||
                  node.kind === 'table-statistics-folder'
                ? (e: React.MouseEvent<HTMLDivElement>) => handleTableSubFolderContextMenu(e, connectionId, node)
                : node.kind === 'key'
                  ? (e: React.MouseEvent<HTMLDivElement>) => handleKeyNodeContextMenu(e, connectionId, node)
                  : node.kind === 'constraint'
                    ? (e: React.MouseEvent<HTMLDivElement>) => handleConstraintNodeContextMenu(e, connectionId, node)
                    : node.kind === 'trigger'
                      ? (e: React.MouseEvent<HTMLDivElement>) => handleTriggerNodeContextMenu(e, connectionId, node)
                      : node.kind === 'index'
                        ? (e: React.MouseEvent<HTMLDivElement>) => handleIndexNodeContextMenu(e, connectionId, node)
                        : node.kind === 'views-folder'
                          ? (e: React.MouseEvent<HTMLDivElement>) => handleViewsFolderContextMenu(e, connectionId, node)
                          : node.kind === 'view'
                            ? (e: React.MouseEvent<HTMLDivElement>) => handleViewNodeContextMenu(e, connectionId, node)
                            : node.kind === 'stored-procedures-folder'
                              ? (e: React.MouseEvent<HTMLDivElement>) => handleStoredProceduresFolderContextMenu(e, connectionId, node)
                              : node.kind === 'stored-procedure'
                                ? (e: React.MouseEvent<HTMLDivElement>) => handleStoredProcedureNodeContextMenu(e, connectionId, node)
                                : node.kind === 'type-data-types-folder'
                                  ? (e: React.MouseEvent<HTMLDivElement>) => handleTypeDataTypesFolderContextMenu(e, connectionId, node)
                                  : node.kind === 'type' && node.id.includes(':types:data-types:')
                                    ? (e: React.MouseEvent<HTMLDivElement>) => handleDataTypeNodeContextMenu(e, connectionId, node)
                                    : node.kind === 'type-tables-folder'
                                      ? (e: React.MouseEvent<HTMLDivElement>) => handleTypeTablesFolderContextMenu(e, connectionId, node)
                                      : node.kind === 'type' && node.id.includes(':types:tables:')
                                        ? (e: React.MouseEvent<HTMLDivElement>) => handleTableTypeNodeContextMenu(e, connectionId, node)
                                        : node.kind === 'type-memory-optimized-tables-folder'
                                          ? (e: React.MouseEvent<HTMLDivElement>) => handleTypeMemoryOptimizedTablesFolderContextMenu(e, connectionId, node)
                                          : node.kind === 'type' && node.id.includes(':types:memory-optimized-tables:')
                                            ? (e: React.MouseEvent<HTMLDivElement>) => handleMemoryOptimizedTableTypeNodeContextMenu(e, connectionId, node)
                                            : node.kind === 'type-enums-folder'
                                              ? (e: React.MouseEvent<HTMLDivElement>) => handleTypeEnumsFolderContextMenu(e, connectionId, node)
                                              : node.kind === 'type-composites-folder'
                                                ? (e: React.MouseEvent<HTMLDivElement>) => handleTypeCompositesFolderContextMenu(e, connectionId, node)
                                                : node.kind === 'type' && node.id.includes(':types:enums:')
                                                  ? (e: React.MouseEvent<HTMLDivElement>) => handleDataTypeNodeContextMenu(e, connectionId, node)
                                                  : node.kind === 'type' && node.id.includes(':types:composites:')
                                                    ? (e: React.MouseEvent<HTMLDivElement>) => handleTableTypeNodeContextMenu(e, connectionId, node)
                                                    : node.kind === 'redis-keyspace'
                                                      ? (e: React.MouseEvent<HTMLDivElement>) => handleRedisKeyspaceContextMenu(e, connectionId, node)
                                                      : node.kind === 'redis-key'
                                                        ? (e: React.MouseEvent<HTMLDivElement>) => handleRedisKeyContextMenu(e, connectionId, node)
                                                        : node.kind === 'redis-key-prefix'
                                                          ? (e: React.MouseEvent<HTMLDivElement>) => handleRedisPrefixContextMenu(e, connectionId, node)
                                                          : node.kind === 'mongodb-collection'
                                                            ? (e: React.MouseEvent<HTMLDivElement>) => handleMongoCollectionContextMenu(e, connectionId, node)
                                                            : node.kind === 'mongodb-collection-documents'
                                                              ? (e: React.MouseEvent<HTMLDivElement>) => handleMongoDocumentsContextMenu(e, connectionId, node)
                                                              : node.kind === 'mongodb-collection-indexes'
                                                                ? (e: React.MouseEvent<HTMLDivElement>) => handleMongoIndexesFolderContextMenu(e, connectionId, node)
                                                                : node.kind === 'mongodb-index'
                                                                  ? (e: React.MouseEvent<HTMLDivElement>) => handleMongoIndexNodeContextMenu(e, connectionId, node)
                                                                  : node.kind === 'mongodb-collection-aggregations'
                                                                    ? (e: React.MouseEvent<HTMLDivElement>) => handleMongoAggregationsFolderContextMenu(e, connectionId, node)
                                                                    : node.kind === 'mongodb-aggregation'
                                                                      ? (e: React.MouseEvent<HTMLDivElement>) => handleMongoAggregationNodeContextMenu(e, connectionId, node)
                                                                      : node.kind === 'mongodb-collection-validation'
                                                                        ? (e: React.MouseEvent<HTMLDivElement>) => handleMongoValidationContextMenu(e, connectionId, node)
                                                                        : node.kind === 'security-users-folder' && node.id === 'security:users'
                                                                          ? (e: React.MouseEvent<HTMLDivElement>) => handleSecurityUsersFolderContextMenu(e, connectionId, node)
                                                                          : node.kind === 'security-user' && node.id.startsWith('security:users:')
                                                                            ? (e: React.MouseEvent<HTMLDivElement>) => handleSecurityUserNodeContextMenu(e, connectionId, node)
                                                                            : node.kind === 'security-users-folder' && /^db:[^:]+:security:users$/.test(node.id)
                                                                              ? (e: React.MouseEvent<HTMLDivElement>) => handleDbSecurityUsersFolderContextMenu(e, connectionId, node)
                                                                              : node.kind === 'security-user' && /^db:[^:]+:security:users:.+$/.test(node.id)
                                                                                ? (e: React.MouseEvent<HTMLDivElement>) => handleDbSecurityUserNodeContextMenu(e, connectionId, node)
                                                                                : node.kind === 'security-roles-folder' && node.id === 'security:roles'
                                                                                  ? (e: React.MouseEvent<HTMLDivElement>) => handleSecurityRolesFolderContextMenu(e, connectionId, node)
                                                                                  : node.kind === 'security-role' && node.id.startsWith('security:roles:')
                                                                                    ? (e: React.MouseEvent<HTMLDivElement>) => handleSecurityRoleNodeContextMenu(e, connectionId, node)
                                                                                    : undefined
    const nodeContent = (
      <>
        {isExpandable ? (
          isExpanded ? (
            <ChevronDown className="tree-section__chevron" />
          ) : (
            <ChevronRight className="tree-section__chevron" />
          )
        ) : (
          <span className="tree-section__spacer" />
        )}
        <Icon className="tree-section__icon" strokeWidth={1.5} />
        <span>{label}</span>
      </>
    )

    return (
      <div key={nodeKey}>
        {isExpandable ? (
          <div
            className={nodeClassName}
            draggable={dragText !== null}
            onDragStart={
              dragText !== null
                ? (e) => {
                    e.dataTransfer.setData('text/plain', dragText)
                    e.dataTransfer.effectAllowed = 'copy'
                  }
                : undefined
            }
            onClick={() => {
              tree.setSelectedKey(nodeKey)
              tree.toggleNode(connectionId, node)
            }}
            onContextMenu={contextMenuHandler}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') tree.toggleNode(connectionId, node)
            }}
          >
            {nodeContent}
          </div>
        ) : (
          <div
            className={nodeClassName}
            draggable={dragText !== null}
            onDragStart={
              dragText !== null
                ? (e) => {
                    e.dataTransfer.setData('text/plain', dragText)
                    e.dataTransfer.effectAllowed = 'copy'
                  }
                : undefined
            }
            onClick={() => {
              tree.setSelectedKey(nodeKey)
            }}
            onDoubleClick={
              node.kind === 'redis-keyspace'
                ? () => {
                    const m = node.id.match(/^redis-db:(\d+)$/)
                    if (m) {
                      const dbIdx = parseInt(m[1], 10)
                      const conn = tree.connections.find((c) => c.id === connectionId)
                      tabsMgr.openOrFocusRedisDbExplorerTab(
                        connectionId,
                        dbIdx,
                        `${conn?.name ?? connectionId} — DB ${dbIdx} — Explorer`,
                        tree.setActiveConnectionId
                      )
                    }
                  }
                : node.kind === 'mongodb-collection-documents'
                  ? () => {
                      const m = node.id.match(/^mongodb-collection-documents:([^:]+):(.+)$/)
                      if (m) {
                        tabsMgr.openOrFocusMongoQueryTab(connectionId, m[1], m[2], tree.setActiveConnectionId)
                      }
                    }
                  : node.kind === 'mongodb-collection-validation'
                    ? () => {
                        const m = node.id.match(/^mongodb-collection-validation:([^:]+):(.+)$/)
                        if (m) {
                          setCollectionValidationDialog({ connectionId, databaseName: m[1], collectionName: m[2] })
                        }
                      }
                    : node.kind === 'security-user' && node.id.startsWith('security:users:')
                      ? () => {
                          const m = node.id.match(/^security:users:(.+)$/)
                          if (!m) return
                          const p = tree.connections.find((c) => c.id === connectionId)?.provider
                          if (p === 'mysql') {
                            setManageMySqlUsersDialog({ connectionId, initialUserKey: m[1] })
                          } else if (p === 'redis') {
                            setManageRedisAclUsersDialog({ connectionId, initialUsername: m[1] })
                          } else if (p === 'mongodb') {
                            setManageMongoUsersDialog({ connectionId, initialUsername: m[1] })
                          } else {
                            setManageServerUsersDialog({ connectionId, initialLoginName: m[1] })
                          }
                        }
                      : node.kind === 'security-user' && /^db:[^:]+:security:users:.+$/.test(node.id)
                        ? () => {
                            const m = node.id.match(/^db:([^:]+):security:users:(.+)$/)
                            if (!m) return
                            const isMySql = tree.connections.find((c) => c.id === connectionId)?.provider === 'mysql'
                            if (isMySql) {
                              setManageMySqlDatabaseUsersDialog({
                                connectionId,
                                databaseName: m[1],
                                initialUserKey: m[2]
                              })
                            } else {
                              setManageDatabaseUsersDialog({
                                connectionId,
                                databaseName: m[1],
                                initialUserName: m[2]
                              })
                            }
                          }
                        : node.kind === 'security-role' && node.id.startsWith('security:roles:')
                          ? () => {
                              const m = node.id.match(/^security:roles:(.+)$/)
                              if (!m) return
                              setManageServerRolesDialog({ connectionId, initialRoleName: m[1] })
                            }
                          : undefined
            }
            onContextMenu={contextMenuHandler}
          >
            {nodeContent}
          </div>
        )}
        {isExpandable && isExpanded && (
          <div className={`conn__children${node.kind === 'mongodb-collection' ? ' conn__children--mongo-collection' : ''}`}>
            {renderNodeLoadState(connectionId, node)}
            {node.kind === 'database' && renderErdFilesFolder(connectionId, node)}
          </div>
        )}
      </div>
    )
  }

  function renderErdFilesFolder(connectionId: string, dbNode: ExplorerNode): React.JSX.Element {
    const match = dbNode.id.match(/^db:([^:]+)$/)
    if (!match) return <></>
    const databaseName = match[1]
    const conn = tree.connections.find((c) => c.id === connectionId)
    const erdFiles = (conn?.erdFiles ?? []).filter((f) => f.databaseName === databaseName)
    if (erdFiles.length === 0) return <></>

    const folderKey = `${connectionId}/erd-files/${databaseName}`
    const isExpanded = tree.expandedErdFolders.has(folderKey)

    function toggleFolder(): void {
      tree.setExpandedErdFolders((prev) => {
        const next = new Set(prev)
        if (isExpanded) next.delete(folderKey)
        else next.add(folderKey)
        return next
      })
    }

    return (
      <div>
        <div
          className="tree-section__header"
          onClick={toggleFolder}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggleFolder() }}
        >
          {isExpanded ? (
            <ChevronDown className="tree-section__chevron" />
          ) : (
            <ChevronRight className="tree-section__chevron" />
          )}
          <Network className="tree-section__icon" strokeWidth={1.5} />
          <span>{t('explorer.erdFilesFolder')}</span>
        </div>
        {isExpanded && (
          <div className="conn__children">
            {erdFiles.map((f) => {
              const fileName = f.filePath.split(/[\\/]/).pop() ?? f.filePath
              const title = fileName.replace(/\.erd$/i, '')
              return (
                <div
                  key={f.filePath}
                  className="tree-leaf"
                  onClick={() => { void tabsMgr.handleOpenErdFromTree(connectionId, f.filePath) }}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setContextMenu({
                      items: [{
                        id: 'remove-erd-file',
                        label: t('explorer.erdFile.remove'),
                        icon: <Trash2 size={13} />,
                        onClick: async () => {
                          await window.api.connections.removeErdFile(connectionId, f.filePath)
                          const updatedConns = await window.api.connections.getAll()
                          tree.setConnections(updatedConns)
                        }
                      }],
                      position: { x: e.clientX, y: e.clientY }
                    })
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') void tabsMgr.handleOpenErdFromTree(connectionId, f.filePath)
                  }}
                >
                  <span className="tree-section__spacer" />
                  <FileText className="tree-section__icon" strokeWidth={1.5} />
                  <span>{title}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  function renderConnChildren(conn: ConnectionRecord): React.JSX.Element {
    const state = tree.getRuntimeState(conn.id)

    if (state.status === 'connecting') {
      return (
        <div className="conn__connecting-row" aria-live="polite">
          <span className="conn__spinner" aria-hidden="true" />
          <span className="conn__connecting-label">{t('explorer.connecting')}</span>
        </div>
      )
    }

    if (state.status === 'error') {
      return (
        <div
          className="conn__error-row"
          onClick={() => { void tree.connectToDatabase(conn.id) }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') void tree.connectToDatabase(conn.id)
          }}
          title={t('explorer.retryConnection')}
        >
          <AlertCircle className="conn__error-icon" />
          <span className="conn__error-message">
            {state.errorMessage || t('explorer.connectionError')}
          </span>
        </div>
      )
    }

    if (state.status === 'connected') {
      return (
        <>
          {renderExplorerNode(conn.id, DATABASES_NODE)}
          {renderExplorerNode(conn.id, SECURITY_NODE)}
        </>
      )
    }

    return <></>
  }

  // ── Main JSX ──────────────────────────────────────────────────────────────

  const activeTab = tabsMgr.tabs.find((t) => t.id === tabsMgr.activeTabId)

  function renderConnectionPanel(): React.JSX.Element {
    return (
      <aside ref={layout.panelRef} className="explorer__panel">
        <div className="explorer__resize-handle" onMouseDown={layout.onResizeStart} />
        <div className="explorer__panel-header">
          <Button variant="primary" size="sm" className="explorer__new-btn" analyticsId="new_connection" onClick={() => setIsDialogOpen(true)}>
            <Plus size={13} />
            {t('explorer.newConnection')}
          </Button>
        </div>

        <div className="explorer__panel-toolbar">
          <SearchField
            value={connectionSearch}
            onChange={setConnectionSearch}
            placeholder={t('explorer.search.placeholder')}
            ariaLabel={t('explorer.search.ariaLabel')}
            buttons={[
              {
                icon: <SlidersHorizontal size={14} />,
                ariaLabel: t('explorer.filter.ariaLabel'),
                onClick: () => { setIsFilterOpen((v) => !v); setIsSortOpen(false) },
                active: hasActiveFilters,
                buttonRef: filterBtnRef,
              },
              {
                icon: <ArrowUpDown size={14} />,
                ariaLabel: t('explorer.sort.ariaLabel'),
                onClick: () => { setIsSortOpen((v) => !v); setIsFilterOpen(false) },
                buttonRef: sortBtnRef,
              },
            ]}
          />
        </div>

        {isFilterOpen && (() => {
          const pos = getFilterPanelPosition()
          const environments = settings.environments ?? []
          return (
            <div
              ref={filterPanelRef}
              className="explorer__dropdown-panel"
              style={{ top: pos.top, left: pos.left }}
              role="dialog"
              aria-label={t('explorer.filter.title')}
            >
              <div className="explorer__dropdown-section">{t('explorer.filter.provider')}</div>
              {PROVIDER_LIST.map(({ value, meta }) => {
                const active = filterProviders.has(value)
                return (
                  <button
                    key={value}
                    className={`explorer__dropdown-item${active ? ' explorer__dropdown-item--active' : ''}`}
                    onClick={() => toggleFilterProvider(value)}
                  >
                    <Check size={12} className="explorer__dropdown-check" />
                    {meta.label}
                  </button>
                )
              })}
              {environments.length > 0 && (
                <>
                  <div className="explorer__dropdown-separator" />
                  <div className="explorer__dropdown-section">{t('explorer.filter.environment')}</div>
                  {environments.map((env) => {
                    const active = filterEnvironmentIds.has(env.id)
                    return (
                      <button
                        key={env.id}
                        className={`explorer__dropdown-item${active ? ' explorer__dropdown-item--active' : ''}`}
                        onClick={() => toggleFilterEnvironment(env.id)}
                      >
                        <Check size={12} className="explorer__dropdown-check" />
                        {env.name}
                      </button>
                    )
                  })}
                  <button
                    className={`explorer__dropdown-item${filterEnvironmentIds.has('') ? ' explorer__dropdown-item--active' : ''}`}
                    onClick={() => toggleFilterEnvironment('')}
                  >
                    <Check size={12} className="explorer__dropdown-check" />
                    {t('explorer.sort.noEnvironment')}
                  </button>
                </>
              )}
              <div className="explorer__dropdown-separator" />
              <div className="explorer__dropdown-section">{t('explorer.filter.status')}</div>
              {(['online', 'offline'] as const).map((status) => (
                <button
                  key={status}
                  className={`explorer__dropdown-item${filterStatus === status ? ' explorer__dropdown-item--active' : ''}`}
                  onClick={() => toggleFilterStatus(status)}
                >
                  <Check size={12} className="explorer__dropdown-check" />
                  {t(`explorer.filter.${status}`)}
                </button>
              ))}
            </div>
          )
        })()}

        {isSortOpen && (() => {
          const pos = getSortPanelPosition()
          const SORT_FIELDS: Array<{ field: ConnectionSortField; label: string }> = [
            { field: 'name', label: t('explorer.sort.fields.name') },
            { field: 'createdAt', label: t('explorer.sort.fields.createdAt') },
            { field: 'lastUsedAt', label: t('explorer.sort.fields.lastUsedAt') },
            { field: 'provider', label: t('explorer.sort.fields.provider') },
            { field: 'environment', label: t('explorer.sort.fields.environment') },
            { field: 'status', label: t('explorer.sort.fields.status') }
          ]
          return (
            <div
              ref={sortPanelRef}
              className="explorer__dropdown-panel"
              style={{ top: pos.top, left: pos.left, minWidth: '11rem' }}
              role="dialog"
              aria-label={t('explorer.sort.title')}
            >
              <div className="explorer__dropdown-section">{t('explorer.sort.title')}</div>
              {SORT_FIELDS.map(({ field, label }) => {
                const active = sortField === field
                return (
                  <button
                    key={field}
                    className={`explorer__dropdown-item${active ? ' explorer__dropdown-item--active' : ''}`}
                    onClick={() => setSortField(field)}
                  >
                    <Check size={12} className="explorer__dropdown-check" />
                    {label}
                  </button>
                )
              })}
              <div className="explorer__dropdown-separator" />
              <div className="explorer__dropdown-section">{sortDirection === 'asc' ? t('explorer.sort.directions.asc') : t('explorer.sort.directions.desc')}</div>
              {(['asc', 'desc'] as const).map((dir) => {
                const active = sortDirection === dir
                return (
                  <button
                    key={dir}
                    className={`explorer__dropdown-item${active ? ' explorer__dropdown-item--active' : ''}`}
                    onClick={() => setSortDirection(dir)}
                  >
                    <Check size={12} className="explorer__dropdown-check" />
                    {t(`explorer.sort.directions.${dir}`)}
                  </button>
                )
              })}
            </div>
          )
        })()}

        <div className="explorer__tree">
          {connectionEntries.length === 0 ? (
            <p className="explorer__empty">{t('explorer.emptyState')}</p>
          ) : (
            connectionEntries.map((entry) => {
              if (entry.kind === 'group-header') {
                return (
                  <div key={entry.id} className="conn-group-header">
                    {entry.label}
                  </div>
                )
              }
              const conn = entry.connection
              const isExpanded = tree.expandedConns.has(conn.id)
              const state = tree.getRuntimeState(conn.id)
              const iconColor = conn.color || PROVIDER_METADATA[conn.provider].color

              return (
                <div key={conn.id} className="conn">
                  <div
                    className={`conn__header${tree.selectedKey === `conn:${conn.id}` ? ' conn__header--selected' : ''}`}
                    onClick={() => tree.toggleConn(conn.id)}
                    onContextMenu={(e) => handleConnectionContextMenu(e, conn)}
                  >
                    {isExpanded ? (
                      <ChevronDown className="conn__chevron" />
                    ) : (
                      <ChevronRight className="conn__chevron" />
                    )}
                    <Database
                      className="conn__db-icon"
                      style={{ color: iconColor }}
                      strokeWidth={1.5}
                    />
                    <span className="conn__name">{conn.name}</span>
                    {tree.eagerLoadStates.get(conn.id) === 'loading' && (
                      <span className="conn__eager-spinner" aria-label={t('explorer.eagerLoading')} />
                    )}
                    <span
                      className={`conn__status conn__status--${state.status}`}
                      aria-label={t(`explorer.statusLabel.${state.status}`)}
                    />
                  </div>

                  {isExpanded && (
                    <div className="conn__children">{renderConnChildren(conn)}</div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </aside>
    )
  }

  return (
    <>
      {screenNavSlot
        ? (isActive && createPortal(renderConnectionPanel(), screenNavSlot))
        : renderConnectionPanel()
      }
      <div className="explorer">
      <div className="explorer__content">
        <div className="explorer__editor-wrapper" ref={layout.editorAreaRef}>
        <div className="explorer__editor-area">
        <div className="explorer__content-header">
          <div className="explorer__tabs" role="tablist" aria-label="Query tabs">
            {tabsMgr.tabs.map((tab) => {
              const tabEnvironment = tab.kind === 'query' ? getConnectionEnvironment(getTabConnectionId(tab)) : null
              const isActiveTab = tab.id === tabsMgr.activeTabId

              return (
                <button
                  key={tab.id}
                  role="tab"
                  aria-selected={isActiveTab}
                  className={`explorer__tab${isActiveTab ? ' explorer__tab--active' : ''}${isActiveTab && tabEnvironment ? ' explorer__tab--environment-active' : ''}`}
                  onClick={() => tabsMgr.setActiveTabId(tab.id)}
                >
                  {isActiveTab && (
                    tab.kind === 'query'
                      ? <FileText size={12} className="explorer__tab-icon" />
                      : tab.kind === 'dashboard'
                        ? <BarChart2 size={12} className="explorer__tab-icon" />
                        : (tab.kind === 'mongo-shell' || tab.kind === 'redis-shell')
                          ? <TerminalSquare size={12} className="explorer__tab-icon" />
                          : tab.kind === 'redis-db-explorer'
                            ? <TableProperties size={12} className="explorer__tab-icon" />
                            : <Network size={12} className="explorer__tab-icon" />
                  )}
                  {tab.title}
                  {tab.kind === 'query' && tab.isDirty && <span className="explorer__tab-unsaved" aria-label="Unsaved changes" />}
                  <span
                    className="explorer__tab-close"
                    aria-label={`Close ${tab.title}`}
                    onClick={(e) => tabsMgr.closeTab(e, tab.id)}
                  >
                    <X size={11} />
                  </span>
                  {isActiveTab && tabEnvironment && (
                    <svg className="explorer__tab-env-border" viewBox="0 0 100 2" preserveAspectRatio="none" aria-hidden="true">
                      <line x1="0" y1="1" x2="100" y2="1" stroke={tabEnvironment.color} strokeWidth="2" />
                    </svg>
                  )}
                </button>
              )
            })}
          </div>
          <Toolbar
            className="explorer__content-header-actions"
            groups={[
              tabsMgr.activeTabId !== null && activeTab?.kind === 'query'
                ? (() => {
                    const tabConnId = activeTab.connectionId
                    const caps = tabConnId ? tree.getConnectionCapabilities(tabConnId) : null
                    return [
                      <ToolbarButton
                        key="execute"
                        icon={queryRunner.tabQueryStates.get(tabsMgr.activeTabId)?.status === 'running'
                          ? <Loader2 size={15} className="toolbar-btn__spinner" />
                          : <Play size={15} />}
                        label="Execute Query"
                        tooltip="Execute Query"
                        onClick={queryRunner.handleExecuteQuery}
                        disabled={queryRunner.tabQueryStates.get(tabsMgr.activeTabId)?.status === 'running'}
                      />,
                      <ToolbarButton
                        key="format"
                        icon={<AlignLeft size={15} />}
                        label="Format"
                        tooltip="Format"
                        onClick={queryRunner.handleFormat}
                      />,
                      caps && caps.executionPlan.kind !== 'none'
                        ? <ToolbarButton
                            key="plan"
                            icon={<Network size={15} />}
                            label={caps.executionPlan.buttonLabel}
                            tooltip={caps.executionPlan.buttonLabel}
                            onClick={queryRunner.handleExecuteQueryWithPlan}
                            disabled={queryRunner.tabQueryStates.get(tabsMgr.activeTabId)?.status === 'running'}
                          />
                        : null,
                      caps && caps.clientStatistics.kind !== 'none'
                        ? <ToolbarButton
                            key="stats"
                            icon={<BarChart2 size={15} />}
                            label={caps.clientStatistics.buttonLabel}
                            tooltip={caps.clientStatistics.buttonLabel}
                            onClick={queryRunner.handleExecuteQueryWithStatistics}
                            disabled={queryRunner.tabQueryStates.get(tabsMgr.activeTabId)?.status === 'running'}
                          />
                        : null,
                    ]
                  })()
                : [],
              tabsMgr.activeTabId !== null && activeTab?.kind === 'erd'
                ? [
                    <ToolbarButton
                      key="export"
                      icon={<Download size={15} />}
                      label="Export"
                      tooltip="Export as PNG"
                      onClick={() => setIsExportDialogOpen(true)}
                    />
                  ]
                : [],
              (() => {
                const { connectionId } = tree.getSelectedContext()
                const resolvedConnId = connectionId ?? tree.activeConnectionId
                const conn = tree.connections.find((c) => c.id === resolvedConnId)
                const provider = conn?.provider
                const isRedisOrMongo = provider === 'redis' || provider === 'mongodb'
                return [
                  !isRedisOrMongo
                    ? <ToolbarButton
                        key="new-query"
                        icon={<FilePlus size={15} />}
                        label="New Query"
                        tooltip="New Query"
                        onClick={tabsMgr.handleNewQuery}
                      />
                    : null,
                  isRedisOrMongo
                    ? <ToolbarButton
                        key="open-shell"
                        icon={<TerminalSquare size={15} />}
                        label="Open Shell"
                        tooltip="Open Shell"
                        onClick={() => {
                          const { connectionId: ctxConnId } = tree.getSelectedContext()
                          const rid = ctxConnId ?? tree.activeConnectionId
                          const c = tree.connections.find((cc) => cc.id === rid)
                          if (!c) return
                          const state = tree.getRuntimeState(c.id)
                          if (state.status !== 'connected') tree.handleConnectAction(c.id)
                          if (c.provider === 'redis') {
                            tabsMgr.openOrFocusRedisShellTab(c.id, `${c.name} — Shell`, c.defaultDatabase, tree.setActiveConnectionId)
                          } else if (c.provider === 'mongodb') {
                            tabsMgr.openOrFocusMongoShellTab(c.id, `${c.name} — Shell`, c.defaultDatabase, tree.setActiveConnectionId)
                          }
                        }}
                      />
                    : null,
                  provider && !isRedisOrMongo
                    ? <ToolbarButton
                        key="ai"
                        icon={<Bot size={15} />}
                        label="AI"
                        tooltip={`AI Assistant (${window.api.platform === 'darwin' ? 'Cmd' : 'Ctrl'}+Shift+I)`}
                        active={layout.aiPanelOpen}
                        onClick={layout.toggleAiPanel}
                      />
                    : null,
                  <ToolbarButton
                    key="save"
                    icon={<Save size={15} />}
                    label="Save"
                    tooltip="Save (Ctrl+S)"
                    onClick={() => { void tabsMgr.handleSave() }}
                  />,
                  <ToolbarButton
                    key="open"
                    icon={<FolderOpen size={15} />}
                    label="Open"
                    tooltip="Open (Ctrl+O)"
                    onClick={() => { void tabsMgr.handleOpen() }}
                  />,
                ]
              })(),
            ]}
          />
        </div>

          {tabsMgr.tabs.map((tab) =>
            tab.kind === 'query' ? (
              <div
                key={tab.id}
                className={`explorer__query-pane${tab.id === tabsMgr.activeTabId ? '' : ' explorer__query-pane--hidden'}`}
              >
                {(() => {
                  const tabEnvironment = getConnectionEnvironment(getTabConnectionId(tab))

                  return tabEnvironment ? (
                    <div className="explorer__environment-banner">
                      <svg className="explorer__environment-banner-bg" viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden="true">
                        <rect x="0" y="0" width="100" height="32" fill={tabEnvironment.color} fillOpacity="0.24" />
                      </svg>
                      <span className="explorer__environment-banner-label" title={tabEnvironment.description || undefined}>
                        {tabEnvironment.name}
                      </span>
                    </div>
                  ) : null
                })()}
                <QueryEditor
                  ref={tabsMgr.getOrCreateQueryEditorRef(tab.id)}
                  value={tab.content}
                  onChange={(content) => tabsMgr.handleTabContentChange(tab.id, content)}
                  visible={tab.id === tabsMgr.activeTabId}
                  language={(() => {
                    const provider = tree.connections.find((c) => c.id === tab.connectionId)?.provider
                    if (tab.mongoCollection || provider === 'mongodb') return 'json'
                    return provider === 'redis' ? 'plaintext' : 'sql'
                  })()}
                  queryContext={buildQueryContext(tab, tree.connections.find((c) => c.id === tab.connectionId)) ?? undefined}
                  onExecute={queryRunner.handleExecuteQuery}
                  onToggleResults={layout.handleToggleResults}
                />
              </div>
            ) : tab.kind === 'erd' ? (
              <div
                key={tab.id}
                className={`explorer__erd-pane${tab.id === tabsMgr.activeTabId ? '' : ' explorer__erd-pane--hidden'}`}
              >
                <ErdCanvas
                  loadState={tab.loadState}
                  schema={tab.schema}
                  error={tab.error}
                  databaseName={tab.databaseName}
                  background={tab.background}
                  onBackgroundChange={(bg) => tabsMgr.handleErdBackgroundChange(tab.id, bg)}
                  exportTrigger={tab.id === tabsMgr.activeTabId ? (tabsMgr.pendingExportTrigger as Parameters<typeof ErdCanvas>[0]['exportTrigger']) : null}
                  onExportComplete={() => tabsMgr.setPendingExportTrigger(null)}
                  initialNodes={tab.initialNodes}
                  initialEdges={tab.initialEdges}
                  initialCurveType={tab.initialCurveType}
                  initialViewport={tab.initialViewport}
                  saveTrigger={tab.id === tabsMgr.activeTabId ? tabsMgr.pendingSaveTrigger : false}
                  onSaveComplete={(state: ErdCanvasSerializedState) => {
                    tabsMgr.setPendingSaveTrigger(false)
                    tabsMgr.pendingSaveResolveRef.current?.(state)
                    tabsMgr.pendingSaveResolveRef.current = null
                  }}
                />
              </div>
            ) : tab.kind === 'mongo-shell' ? (
              <div
                key={tab.id}
                className={`explorer__dashboard-pane${tab.id === tabsMgr.activeTabId ? '' : ' explorer__dashboard-pane--hidden'}`}
              >
                <MongoShellTab
                  tab={tab as MongoShellTabType}
                  connection={tree.connections.find((c) => c.id === (tab as MongoShellTabType).connectionId)}
                />
              </div>
            ) : tab.kind === 'redis-shell' ? (
              <div
                key={tab.id}
                className={`explorer__dashboard-pane${tab.id === tabsMgr.activeTabId ? '' : ' explorer__dashboard-pane--hidden'}`}
              >
                <RedisShellTab
                  tab={tab as RedisShellTabType}
                  connection={tree.connections.find((c) => c.id === (tab as RedisShellTabType).connectionId)}
                />
              </div>
            ) : tab.kind === 'redis-db-explorer' ? (
              <div
                key={tab.id}
                className={`explorer__dashboard-pane${tab.id === tabsMgr.activeTabId ? '' : ' explorer__dashboard-pane--hidden'}`}
              >
                <RedisDbExplorerTab
                  tab={tab as RedisDbExplorerTabType}
                  connection={tree.connections.find((c) => c.id === (tab as RedisDbExplorerTabType).connectionId)}
                  backgroundAutoRefresh={tree.connections.find((c) => c.id === (tab as RedisDbExplorerTabType).connectionId)?.backgroundAutoRefresh ?? false}
                />
              </div>
            ) : (
              <div
                key={tab.id}
                className={`explorer__dashboard-pane${tab.id === tabsMgr.activeTabId ? '' : ' explorer__dashboard-pane--hidden'}`}
              >
                {(tab as DashboardTab).dashboardKind === 'redis' && (
                  <RedisDashboardTab
                    tab={tab as DashboardTab}
                    connection={tree.connections.find((c) => c.id === (tab as DashboardTab).connectionId)}
                    backgroundAutoRefresh={tree.connections.find((c) => c.id === (tab as DashboardTab).connectionId)?.backgroundAutoRefresh ?? false}
                    onOpenQueryTab={(content) => tabsMgr.openScriptTab('Redis INFO', content, (tab as DashboardTab).connectionId, '', tree.setActiveConnectionId)}
                  />
                )}
              </div>
            )
          )}
          {tabsMgr.tabs.length === 0 && (
            <div className="explorer__editor-empty">
              <span>Open a new query to get started</span>
            </div>
          )}

        </div>

          {tabsMgr.activeTabId !== null && activeTab?.kind === 'query' && (() => {
            const activeQueryTab = activeTab
            const qState = queryRunner.tabQueryStates.get(tabsMgr.activeTabId)
            if (!qState || qState.status === 'idle') return null

            const activeEnvironment = getConnectionEnvironment(activeQueryTab.connectionId ?? tree.activeConnectionId)
            const useInteractiveTables = shouldUseInteractiveTables(activeQueryTab.connectionId ?? tree.activeConnectionId)
            const showCriticalInteractiveOverride =
              (settings.useInteractiveTables ?? false) && activeEnvironment?.critical === true

            const resultsView = queryRunner.tabResultsViews.get(tabsMgr.activeTabId) ?? 'results'

            const totalRows = qState.status === 'ok'
              ? qState.resultSets.reduce((sum, rs) => sum + rs.rowCount, 0)
              : 0

            const badgeText = qState.status === 'ok'
              ? qState.resultSets.length > 1
                ? `${qState.resultSets.length} result sets · ${totalRows} ${totalRows === 1 ? 'row' : 'rows'} · ${qState.durationMs}ms`
                : `${totalRows} ${totalRows === 1 ? 'row' : 'rows'} · ${qState.durationMs}ms`
              : null

            function setResultsView(view: ResultsView): void {
              queryRunner.setTabResultsViews((prev) => {
                const next = new Map(prev)
                next.set(tabsMgr.activeTabId!, view)
                return next
              })
            }

            function exportCsv(rs: QueryResultSet, index: number): void {
              const content = buildCsvContent(rs)
              const blob = new Blob([content], { type: 'text/csv' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = `query-results${qState!.status === 'ok' && qState!.resultSets.length > 1 ? `-${index + 1}` : ''}.csv`
              a.click()
              URL.revokeObjectURL(url)
            }

            async function exportJson(rs: QueryResultSet, index: number): Promise<void> {
              const rows = buildJsonRows(rs)
              const content = JSON.stringify(rows, null, 2)
              const suffix = qState!.status === 'ok' && qState!.resultSets.length > 1 ? `-${index + 1}` : ''
              await window.api.file.saveDialog(content, {
                defaultPath: `query-results${suffix}.json`,
                filters: [
                  { name: 'JSON Files', extensions: ['json'] },
                  { name: 'All Files', extensions: ['*'] }
                ]
              })
            }

            return (
              <div className={`query-results${layout.resultsVisible ? '' : ' query-results--hidden'}`}>
                <div className="query-results__resize-handle" onMouseDown={layout.onResultsResizeStart} />
                <div className="query-results__header">
                  <div className="query-results__header-left">
                    <TableProperties size={14} className="query-results__header-icon" />
                    <span className="query-results__title">Query Results</span>
                    {badgeText && (
                      <span className="query-results__badge">{badgeText}</span>
                    )}
                  </div>
                  <div className="query-results__header-right">
                    {useInteractiveTables && (
                      <span className="query-results__interactive-mode-label">
                        Interactive Table Mode: <span className="query-results__interactive-mode-on">On</span>
                      </span>
                    )}
                    {showCriticalInteractiveOverride && (
                      <span className="query-results__interactive-mode-label">
                        Interactive Table Mode: <span className="query-results__interactive-mode-off">Off</span>
                      </span>
                    )}
                  </div>
                </div>

                {qState.status === 'ok' && (
                  <div className="query-results__tabs">
                    <button
                      className={`query-results__tab${resultsView === 'results' ? ' query-results__tab--active' : ''}`}
                      onClick={() => setResultsView('results')}
                    >
                      Results
                      {qState.resultSets.length > 0 && (
                        <span className="query-results__tab-badge">{qState.resultSets.length}</span>
                      )}
                    </button>
                    {!activeQueryTab.mongoCollection && (
                      <button
                        className={`query-results__tab${resultsView === 'messages' ? ' query-results__tab--active' : ''}`}
                        onClick={() => setResultsView('messages')}
                      >
                        Messages
                        {qState.messages.length > 0 && (
                          <span className="query-results__tab-badge">{qState.messages.length}</span>
                        )}
                      </button>
                    )}
                    {qState.executionPlanXml && (
                      <button
                        className={`query-results__tab${resultsView === 'execution-plan' ? ' query-results__tab--active' : ''}`}
                        onClick={() => setResultsView('execution-plan')}
                      >
                        Execution Plan
                      </button>
                    )}
                    {qState.clientStatistics && (
                      <button
                        className={`query-results__tab${resultsView === 'client-statistics' ? ' query-results__tab--active' : ''}`}
                        onClick={() => setResultsView('client-statistics')}
                      >
                        Client Statistics
                      </button>
                    )}
                  </div>
                )}

                {qState.status === 'running' && (
                  <div className="query-results__loading">
                    <Loader2 size={16} className="query-results__loading-spinner" />
                    <span>Executing query…</span>
                  </div>
                )}

                {qState.status === 'error' && (
                  <div className="query-results__error query-results__error--selectable">
                    <AlertCircle size={14} className="query-results__error-icon" />
                    <span>{qState.message}</span>
                  </div>
                )}

                {qState.status === 'ok' && resultsView === 'results' && (
                  <div className="query-results__table-wrap">
                    {qState.resultSets.length === 0 ? (
                      <div className="query-results__empty">Query executed successfully. No rows returned.</div>
                    ) : (
                      qState.resultSets.map((rs, rsIndex) => {
                        const selectionKey = `${activeQueryTab.id}:${rsIndex}`
                        const selectedIndices = interactiveResults.selectedRowsMap.get(selectionKey) ?? new Set<number>()
                        const selectedCount = selectedIndices.size
                        const deleteError = interactiveResults.deleteErrors.get(selectionKey)
                        const updateError = interactiveResults.updateErrors.get(selectionKey)
                        const useInteractive = useInteractiveTables
                        const canShowCheckboxes = useInteractive && !!rs.sourceTable
                        const pkColumns = rs.columnKeyMeta
                          ? rs.columns.filter((_, i) => rs.columnKeyMeta![i]?.isPrimaryKey)
                          : []
                        const canToggleBooleans = useInteractive && !!rs.sourceTable && pkColumns.length > 0
                        const loadingBoolCell =
                          interactiveResults.updatingCell?.tabId === activeQueryTab.id && interactiveResults.updatingCell?.rsIndex === rsIndex
                            ? { colName: interactiveResults.updatingCell.colName, rowIndex: interactiveResults.updatingCell.rowIndex }
                            : undefined
                        return (
                          <div key={rsIndex} className="query-results__result-set">
                            <div className="query-results__result-set-header">
                              {qState.resultSets.length > 1 && (
                                <span className="query-results__result-set-label">
                                  Result {rsIndex + 1} · {rs.rowCount} {rs.rowCount === 1 ? 'row' : 'rows'}
                                </span>
                              )}
                              {rs.columns.length > 0 && (
                                <div className="query-results__export-group">
                                  <button
                                    className="query-results__action-btn"
                                    title="Export CSV"
                                    onClick={() => exportCsv(rs, rsIndex)}
                                  >
                                    <Download size={13} />
                                    <span>Export CSV</span>
                                  </button>
                                  <span className="query-results__action-btn-separator" />
                                  <button
                                    className="query-results__action-btn"
                                    title="Export JSON"
                                    onClick={() => exportJson(rs, rsIndex)}
                                  >
                                    <Download size={13} />
                                    <span>Export JSON</span>
                                  </button>
                                </div>
                              )}
                              {canShowCheckboxes && (
                                <div className="query-results__interactive-actions">
                                  <button
                                    className="query-results__action-btn"
                                    title="Add a new record to the table"
                                    onClick={() => interactiveResults.handleOpenAddRecord(
                                      activeQueryTab.connectionId ?? tree.activeConnectionId ?? '',
                                      activeQueryTab.databaseName,
                                      tree.connections.find((c) => c.id === (activeQueryTab.connectionId ?? tree.activeConnectionId))?.provider ?? 'sqlserver',
                                      rs.sourceTable!,
                                      pkColumns
                                    )}
                                  >
                                    <Plus size={13} />
                                    <span>Add Record</span>
                                  </button>
                                  {selectedCount > 0 && (
                                    <button
                                      className="query-results__action-btn query-results__action-btn--danger"
                                      title={`Delete ${selectedCount} selected ${selectedCount === 1 ? 'row' : 'rows'}`}
                                      onClick={() => interactiveResults.handleDeleteRows(
                                        activeQueryTab.id, rsIndex, rs,
                                        activeQueryTab.connectionId ?? tree.activeConnectionId ?? '',
                                        activeQueryTab.databaseName
                                      )}
                                    >
                                      <Trash2 size={13} />
                                      <span>Delete ({selectedCount})</span>
                                    </button>
                                  )}
                                </div>
                              )}
                              {activeQueryTab.mongoCollection && (
                                <div className="query-results__interactive-actions">
                                  <button
                                    className="query-results__action-btn"
                                    title="Add a new document to the collection"
                                    onClick={() => setMongoDocumentDialogState({
                                      mode: 'add',
                                      connectionId: activeQueryTab.connectionId ?? tree.activeConnectionId ?? '',
                                      databaseName: activeQueryTab.databaseName ?? '',
                                      collectionName: activeQueryTab.mongoCollection ?? ''
                                    })}
                                  >
                                    <Plus size={13} />
                                    <span>Add Document</span>
                                  </button>
                                </div>
                              )}
                            </div>
                            {deleteError && (
                              <div className="query-results__delete-error">
                                <AlertCircle size={12} />
                                <span>{deleteError}</span>
                                <button
                                  className="query-results__delete-error-dismiss"
                                  aria-label="Dismiss error"
                                  onClick={() => interactiveResults.setDeleteErrors((prev) => {
                                    const next = new Map(prev)
                                    next.delete(selectionKey)
                                    return next
                                  })}
                                >
                                  <X size={11} />
                                </button>
                              </div>
                            )}
                            {updateError && (
                              <div className="query-results__delete-error">
                                <AlertCircle size={12} />
                                <span>{updateError}</span>
                                <button
                                  className="query-results__delete-error-dismiss"
                                  aria-label="Dismiss error"
                                  onClick={() => interactiveResults.setUpdateErrors((prev) => {
                                    const next = new Map(prev)
                                    next.delete(selectionKey)
                                    return next
                                  })}
                                >
                                  <X size={11} />
                                </button>
                              </div>
                            )}
                            {activeQueryTab.mongoCollection && rs.rawDocuments !== undefined ? (
                              rs.rawDocuments.length === 0 ? (
                                <div className="query-results__empty">No documents found.</div>
                              ) : (
                                <div className="query-results__mongo-docs">
                                  {rs.rawDocuments.map((docJson, i) => (
                                    <div
                                      key={i}
                                      className="query-results__mongo-doc"
                                      onContextMenu={(e) => {
                                        if ((e.target as HTMLElement).closest('.json-viewer')) return
                                        e.preventDefault()
                                        e.stopPropagation()
                                        setContextMenu({
                                          items: [
                                            {
                                              id: 'edit-document',
                                              label: 'Edit Document',
                                              icon: <PenLine size={13} />,
                                              onClick: () => setMongoDocumentDialogState({
                                                mode: 'edit',
                                                connectionId: activeQueryTab.connectionId ?? tree.activeConnectionId ?? '',
                                                databaseName: activeQueryTab.databaseName ?? '',
                                                collectionName: activeQueryTab.mongoCollection ?? '',
                                                documentJson: docJson
                                              })
                                            },
                                            {
                                              id: 'delete-document',
                                              label: 'Delete Document',
                                              icon: <Trash2 size={13} />,
                                              onClick: () => setDeleteMongoDocumentState({
                                                connectionId: activeQueryTab.connectionId ?? tree.activeConnectionId ?? '',
                                                databaseName: activeQueryTab.databaseName ?? '',
                                                collectionName: activeQueryTab.mongoCollection ?? '',
                                                documentJson: docJson
                                              })
                                            }
                                          ],
                                          position: { x: e.clientX, y: e.clientY }
                                        })
                                      }}
                                    >
                                      <div className="query-results__mongo-doc-toolbar">
                                        <button
                                          type="button"
                                          className="query-results__mongo-doc-edit-btn"
                                          title="Edit document"
                                          onClick={() => setMongoDocumentDialogState({
                                            mode: 'edit',
                                            connectionId: activeQueryTab.connectionId ?? tree.activeConnectionId ?? '',
                                            databaseName: activeQueryTab.databaseName ?? '',
                                            collectionName: activeQueryTab.mongoCollection ?? '',
                                            documentJson: docJson
                                          })}
                                        >
                                          <PenLine size={12} />
                                          <span>Edit</span>
                                        </button>
                                        <button
                                          type="button"
                                          className="query-results__mongo-doc-delete-btn"
                                          title="Delete document"
                                          onClick={() => setDeleteMongoDocumentState({
                                            connectionId: activeQueryTab.connectionId ?? tree.activeConnectionId ?? '',
                                            databaseName: activeQueryTab.databaseName ?? '',
                                            collectionName: activeQueryTab.mongoCollection ?? '',
                                            documentJson: docJson
                                          })}
                                        >
                                          <Trash2 size={12} />
                                          <span>Delete</span>
                                        </button>
                                      </div>
                                      <JsonViewer json={docJson} copyFormatted={settings.copyJsonFormatted} />
                                    </div>
                                  ))}
                                </div>
                              )
                            ) : rs.columns.length === 0 ? (
                              <div className="query-results__empty">Query executed successfully. No rows returned.</div>
                            ) : (
                              <VirtualResultsTable
                                columns={rs.columns}
                                rows={rs.rows}
                                columnKeyMeta={rs.columnKeyMeta}
                                sortIndicatorsMap={qState.sortIndicators ?? {}}
                                sortedCount={Object.keys(qState.sortIndicators ?? {}).length}
                                filteredColumns={qState.filteredColumns}
                                uppercaseHeaders={(settings as unknown as Record<string, boolean>).uppercaseColumnHeaders ?? false}
                                showGridLines={settings.showGridLines ?? false}
                                useInteractiveTables={useInteractive}
                                onColumnSort={useInteractive ? (colName) => queryRunner.handleColumnSort(activeQueryTab, colName) : undefined}
                                onColumnContextMenu={useInteractive ? (colName, pos) => interactiveResults.setColumnSortContextMenu({ tab: activeQueryTab, columnName: colName, position: pos }) : undefined}
                                selectedRowIndices={canShowCheckboxes ? selectedIndices : undefined}
                                onRowSelect={canShowCheckboxes ? (idx, sel) => interactiveResults.handleRowSelect(activeQueryTab.id, rsIndex, idx, sel) : undefined}
                                onSelectAll={canShowCheckboxes ? (sel) => interactiveResults.handleSelectAll(activeQueryTab.id, rsIndex, rs.rows.length, sel) : undefined}
                                onBooleanCellClick={canToggleBooleans ? (col, row, rowIdx) => {
                                  const currentVal = row[col]
                                  const newVal = currentVal === null || currentVal === undefined ? true : !currentVal
                                  void interactiveResults.handleBooleanToggle(activeQueryTab, rsIndex, rs.sourceTable!, pkColumns, col, row, rowIdx, newVal)
                                } : undefined}
                                onBooleanCellRightClick={canToggleBooleans ? (col, row, rowIdx, pos) => interactiveResults.handleBooleanRightClick(activeQueryTab, rsIndex, rs, col, row, rowIdx, pkColumns, pos) : undefined}
                                loadingBoolCell={loadingBoolCell}
                                onRowDoubleClick={canToggleBooleans && rs.sourceTable ? (row) => interactiveResults.handleOpenEditRecord(
                                  activeQueryTab.connectionId ?? tree.activeConnectionId ?? '',
                                  activeQueryTab.databaseName,
                                  tree.connections.find((c) => c.id === (activeQueryTab.connectionId ?? tree.activeConnectionId))?.provider ?? 'sqlserver',
                                  rs.sourceTable!,
                                  pkColumns,
                                  row
                                ) : undefined}
                                onRowContextMenu={canToggleBooleans && rs.sourceTable ? (row, rowIdx, pos) => interactiveResults.handleRowContextMenu(activeQueryTab, rsIndex, rs, pkColumns, row, rowIdx, pos) : undefined}
                              />
                            )}
                          </div>
                        )
                      })
                    )}
                  </div>
                )}

                {qState.status === 'ok' && resultsView === 'messages' && (
                  <div className="query-results__messages">
                    {qState.messages.length === 0 ? (
                      <div className="query-results__empty">No messages.</div>
                    ) : (
                      qState.messages.map((msg, i) => (
                        <div
                          key={i}
                          className={`query-results__message${msg.type === 'error' ? ' query-results__message--error' : ''}`}
                        >
                          {msg.text}
                        </div>
                      ))
                    )}
                  </div>
                )}

                {qState.status === 'ok' && resultsView === 'execution-plan' && qState.executionPlanXml && (
                  <div className="query-results__execution-plan">
                    <ExecutionPlanCanvas planXml={qState.executionPlanXml} />
                  </div>
                )}

                {qState.status === 'ok' && resultsView === 'client-statistics' && qState.clientStatistics && (
                  <ClientStatisticsView statistics={qState.clientStatistics} />
                )}
              </div>
            )
          })()}
        </div>
      </div>

      {layout.aiPanelOpen && (() => {
        const { connectionId: selectedConnId } = tree.getSelectedContext()
        const resolvedConnId = selectedConnId ?? tree.activeConnectionId
        const activeQueryTab = activeTab?.kind === 'query' ? activeTab : null
        const aiConnectionId = activeQueryTab?.connectionId ?? resolvedConnId
        const aiDatabaseName = activeQueryTab?.databaseName ?? null
        const aiConn = tree.connections.find((c) => c.id === aiConnectionId)
        const aiProvider = aiConn?.provider ?? null
        const aiConnectionName = aiConn?.name ?? null

        return (
          <div
            ref={layout.aiPanelRef}
            className="explorer__ai-panel"
          >
            <div className="explorer__ai-resize-handle" onMouseDown={layout.onAiPanelResizeStart} />
            <AiChatPanel
              connectionId={aiConnectionId ?? null}
              connectionName={aiConnectionName}
              databaseName={aiDatabaseName}
              provider={aiProvider}
              onClose={layout.toggleAiPanel}
              onInsertSql={(sql) => {
                if (!activeQueryTab) return
                const current = activeQueryTab.content
                const newContent = current ? `${current}\n\n${sql}` : sql
                tabsMgr.handleTabContentChange(activeQueryTab.id, newContent)
              }}
            />
          </div>
        )
      })()}

      {layout.sedPanelOpen && (() => {
        const sedState = queryRunner.tabSedStates.get(tabsMgr.activeTabId ?? '')
        if (!sedState) return null
        return (
          <div
            ref={layout.sedPanelRef}
            className="explorer__sed-panel"
          >
            <div className="explorer__sed-resize-handle" onMouseDown={layout.onSedPanelResizeStart} />
            <SedPanel
              state={sedState}
              onClose={() => layout.setSedPanelOpen(false)}
            />
          </div>
        )
      })()}

      <DialogManager
        // NewConnectionDialog
        isDialogOpen={isDialogOpen}
        editingConnection={editingConnection}
        onSaveConnection={handleSaveConnection}
        onUpdateConnection={handleUpdateConnection}
        onCloseDialog={closeDialog}
        // UnsavedChangesDialog
        unsavedCloseDialog={tabsMgr.unsavedCloseDialog}
        tabs={tabsMgr.tabs}
        onSaveAndClose={tabsMgr.handleSaveAndClose}
        onDiscardAndClose={(tabId) => tabsMgr.handleDiscardAndClose(tabId)}
        onCancelClose={() => tabsMgr.handleCancelClose()}
        // ConfirmDeleteDialog
        deleteConfirmState={interactiveResults.deleteConfirmState}
        isDeleting={interactiveResults.isDeleting}
        onConfirmDelete={() => { void interactiveResults.executeDelete() }}
        onCloseDeleteDialog={() => interactiveResults.setDeleteConfirmState(null)}
        // RecordDialog
        recordDialogState={interactiveResults.recordDialogState}
        activeTabId={tabsMgr.activeTabId}
        onCloseRecordDialog={() => interactiveResults.setRecordDialogState(null)}
        onRecordSuccess={() => {
          interactiveResults.setRecordDialogState(null)
          const currentActiveTab = tabsMgr.tabs.find((t) => t.kind === 'query' && t.id === tabsMgr.activeTabId)
          if (currentActiveTab?.kind === 'query') {
            void queryRunner.executeQueryForTabWithSql(currentActiveTab, currentActiveTab.content)
          }
        }}
        onRecordAddAnother={() => {
          const currentActiveTab = tabsMgr.tabs.find((t) => t.kind === 'query' && t.id === tabsMgr.activeTabId)
          if (currentActiveTab?.kind === 'query') {
            void queryRunner.executeQueryForTabWithSql(currentActiveTab, currentActiveTab.content)
          }
        }}
        // CreateDatabaseDialog
        createDbDialog={createDbDialog}
        onCreateDatabaseSubmit={handleCreateDatabaseSubmit}
        onCloseCreateDb={() => setCreateDbDialog(null)}
        // Backup / Restore
        backupDialog={backupDialog}
        onCloseBackup={() => setBackupDialog(null)}
        restoreDialog={restoreDialog}
        onCloseRestore={() => setRestoreDialog(null)}
        mySqlBackupDialog={mySqlBackupDialog}
        onCloseMySqlBackup={() => setMySqlBackupDialog(null)}
        mySqlRestoreDialog={mySqlRestoreDialog}
        onCloseMySqlRestore={() => setMySqlRestoreDialog(null)}
        postgresBackupDialog={postgresBackupDialog}
        onClosePostgresBackup={() => setPostgresBackupDialog(null)}
        postgresRestoreDialog={postgresRestoreDialog}
        onClosePostgresRestore={() => setPostgresRestoreDialog(null)}
        sqliteBackupDialog={sqliteBackupDialog}
        onCloseSqliteBackup={() => setSqliteBackupDialog(null)}
        sqliteRestoreDialog={sqliteRestoreDialog}
        onCloseSqliteRestore={() => setSqliteRestoreDialog(null)}
        redisBackupDialog={redisBackupDialog}
        onCloseRedisBackup={() => setRedisBackupDialog(null)}
        redisRestoreDialog={redisRestoreDialog}
        onCloseRedisRestore={() => setRedisRestoreDialog(null)}
        mongoBackupDialog={mongoBackupDialog}
        onCloseMongoBackup={() => setMongoBackupDialog(null)}
        mongoRestoreDialog={mongoRestoreDialog}
        onCloseMongoRestore={() => setMongoRestoreDialog(null)}
        // CreateCollectionDialog
        createCollectionDialog={createCollectionDialog}
        onCreateCollectionSubmit={handleCreateCollectionSubmit}
        onCloseCreateCollection={() => setCreateCollectionDialog(null)}
        // RenameCollectionDialog
        renameCollectionDialog={renameCollectionDialog}
        onRenameCollectionSubmit={handleRenameCollectionSubmit}
        onCloseRenameCollection={() => setRenameCollectionDialog(null)}
        // CreateTableDialog
        createTableDialog={createTableDialog}
        onCloseCreateTable={() => setCreateTableDialog(null)}
        onCreateTableSuccess={() => {
          if (!createTableDialog) return
          const { connectionId, databaseName } = createTableDialog
          setCreateTableDialog(null)
          void window.api.database.invalidateCache(connectionId, `db:${databaseName}:tables`).then(() => {
            void tree.loadNodeChildren(connectionId, `db:${databaseName}:tables`)
          })
        }}
        // ManageForeignKeysDialog
        manageForeignKeysDialog={manageForeignKeysDialog}
        onCloseForeignKeys={() => setManageForeignKeysDialog(null)}
        onForeignKeysSuccess={() => {
          if (!manageForeignKeysDialog) return
          const { connectionId, databaseName, schema, tableName } = manageForeignKeysDialog
          const keysNodeId = `db:${databaseName}:tables:${schema}.${tableName}:keys`
          void window.api.database.invalidateCache(connectionId, keysNodeId).then(() => {
            void tree.loadNodeChildren(connectionId, keysNodeId)
          })
        }}
        // ManageConstraintsDialog
        manageConstraintsDialog={manageConstraintsDialog}
        onCloseConstraints={() => setManageConstraintsDialog(null)}
        onConstraintsSuccess={() => {
          if (!manageConstraintsDialog) return
          const { connectionId, databaseName, schema, tableName } = manageConstraintsDialog
          const constraintsNodeId = `db:${databaseName}:tables:${schema}.${tableName}:constraints`
          void window.api.database.invalidateCache(connectionId, constraintsNodeId).then(() => {
            void tree.loadNodeChildren(connectionId, constraintsNodeId)
          })
        }}
        // ManageTriggersDialog
        manageTriggersDialog={manageTriggersDialog}
        onCloseTriggers={() => setManageTriggersDialog(null)}
        onTriggersSuccess={() => {
          if (!manageTriggersDialog) return
          const { connectionId, databaseName, schema, tableName } = manageTriggersDialog
          const triggersNodeId = `db:${databaseName}:tables:${schema}.${tableName}:triggers`
          void window.api.database.invalidateCache(connectionId, triggersNodeId).then(() => {
            void tree.loadNodeChildren(connectionId, triggersNodeId)
          })
        }}
        // ManageIndexesDialog
        manageIndexesDialog={manageIndexesDialog}
        onCloseIndexes={() => setManageIndexesDialog(null)}
        onIndexesSuccess={() => {
          if (!manageIndexesDialog) return
          const { connectionId, databaseName, schema, tableName } = manageIndexesDialog
          const indexesNodeId = `db:${databaseName}:tables:${schema}.${tableName}:indexes`
          void window.api.database.invalidateCache(connectionId, indexesNodeId).then(() => {
            void tree.loadNodeChildren(connectionId, indexesNodeId)
          })
        }}
        // ManageMongoIndexesDialog
        manageMongoIndexesDialog={manageMongoIndexesDialog}
        onCloseMongoIndexes={() => setManageMongoIndexesDialog(null)}
        onMongoIndexesSuccess={() => {
          if (!manageMongoIndexesDialog) return
          const { connectionId, databaseName, collectionName } = manageMongoIndexesDialog
          const folderNodeId = `mongodb-collection-indexes:${databaseName}:${collectionName}`
          void window.api.database.invalidateCache(connectionId, folderNodeId).then(() => {
            void tree.loadNodeChildren(connectionId, folderNodeId)
          })
        }}
        // ManageMongoAggregationsDialog
        manageMongoAggregationsDialog={manageMongoAggregationsDialog}
        onCloseMongoAggregations={() => setManageMongoAggregationsDialog(null)}
        onMongoAggregationsSuccess={() => {
          if (!manageMongoAggregationsDialog) return
          const { connectionId, databaseName, collectionName } = manageMongoAggregationsDialog
          const folderNodeId = `mongodb-collection-aggregations:${databaseName}:${collectionName}`
          void window.api.database.invalidateCache(connectionId, folderNodeId).then(() => {
            void tree.loadNodeChildren(connectionId, folderNodeId)
          })
        }}
        // CollectionValidationDialog
        collectionValidationDialog={collectionValidationDialog}
        onCloseCollectionValidation={() => setCollectionValidationDialog(null)}
        // ErdExportDialog
        isExportDialogOpen={isExportDialogOpen}
        activeTab={activeTab}
        onConfirmExport={(opts: ErdExportOptions) => {
          setIsExportDialogOpen(false)
          tabsMgr.setPendingExportTrigger(opts)
        }}
        onCancelExport={() => setIsExportDialogOpen(false)}
        // StartProfilingDialog
        profilerDialog={profilerDialog}
        onCloseProfiler={() => setProfilerDialog(null)}
        // ManageViewsDialog
        manageViewsDialog={manageViewsDialog}
        onCloseViews={() => setManageViewsDialog(null)}
        onViewsSuccess={() => {
          if (!manageViewsDialog) return
          const { connectionId, databaseName } = manageViewsDialog
          const viewsNodeId = `db:${databaseName}:views`
          void window.api.database.invalidateCache(connectionId, viewsNodeId).then(() => {
            void tree.loadNodeChildren(connectionId, viewsNodeId)
          })
        }}
        // ManageStoredProceduresDialog
        manageStoredProceduresDialog={manageStoredProceduresDialog}
        onCloseStoredProcedures={() => setManageStoredProceduresDialog(null)}
        onStoredProceduresSuccess={() => {
          if (!manageStoredProceduresDialog) return
          const { connectionId, databaseName } = manageStoredProceduresDialog
          const spNodeId = `db:${databaseName}:stored-procedures`
          void window.api.database.invalidateCache(connectionId, spNodeId).then(() => {
            void tree.loadNodeChildren(connectionId, spNodeId)
          })
        }}
        // ManageDataTypesDialog
        manageDataTypesDialog={manageDataTypesDialog}
        onCloseDataTypes={() => setManageDataTypesDialog(null)}
        onDataTypesSuccess={() => {
          if (!manageDataTypesDialog) return
          const { connectionId, databaseName } = manageDataTypesDialog
          const dataTypesNodeId = `db:${databaseName}:types:data-types`
          void window.api.database.invalidateCache(connectionId, dataTypesNodeId).then(() => {
            void tree.loadNodeChildren(connectionId, dataTypesNodeId)
          })
        }}
        // ManageTableTypesDialog
        manageTableTypesDialog={manageTableTypesDialog}
        onCloseTableTypes={() => setManageTableTypesDialog(null)}
        onTableTypesSuccess={() => {
          if (!manageTableTypesDialog) return
          const { connectionId, databaseName } = manageTableTypesDialog
          const tableTypesNodeId = `db:${databaseName}:types:tables`
          void window.api.database.invalidateCache(connectionId, tableTypesNodeId).then(() => {
            void tree.loadNodeChildren(connectionId, tableTypesNodeId)
          })
        }}
        // ManageMemoryOptimizedTableTypesDialog
        manageMemoryOptimizedTableTypesDialog={manageMemoryOptimizedTableTypesDialog}
        onCloseMemoryOptimizedTableTypes={() => setManageMemoryOptimizedTableTypesDialog(null)}
        onMemoryOptimizedTableTypesSuccess={() => {
          if (!manageMemoryOptimizedTableTypesDialog) return
          const { connectionId, databaseName } = manageMemoryOptimizedTableTypesDialog
          const memOptNodeId = `db:${databaseName}:types:memory-optimized-tables`
          void window.api.database.invalidateCache(connectionId, memOptNodeId).then(() => {
            void tree.loadNodeChildren(connectionId, memOptNodeId)
          })
        }}
        // ManageServerUsersDialog
        manageServerUsersDialog={manageServerUsersDialog}
        onCloseServerUsers={() => setManageServerUsersDialog(null)}
        onServerUsersSuccess={() => {
          if (!manageServerUsersDialog) return
          const { connectionId } = manageServerUsersDialog
          void window.api.database.invalidateCache(connectionId, 'security:users').then(() => {
            void tree.loadNodeChildren(connectionId, 'security:users')
          })
        }}
        // ManageServerRolesDialog
        manageServerRolesDialog={manageServerRolesDialog}
        onCloseServerRoles={() => setManageServerRolesDialog(null)}
        onServerRolesSuccess={() => {
          if (!manageServerRolesDialog) return
          const { connectionId } = manageServerRolesDialog
          void window.api.database.invalidateCache(connectionId, 'security:roles').then(() => {
            void tree.loadNodeChildren(connectionId, 'security:roles')
          })
        }}
        // ManageDatabaseUsersDialog
        manageDatabaseUsersDialog={manageDatabaseUsersDialog}
        onCloseDatabaseUsers={() => setManageDatabaseUsersDialog(null)}
        onDatabaseUsersSuccess={() => {
          if (!manageDatabaseUsersDialog) return
          const { connectionId, databaseName } = manageDatabaseUsersDialog
          const nodeId = `db:${databaseName}:security:users`
          void window.api.database.invalidateCache(connectionId, nodeId).then(() => {
            void tree.loadNodeChildren(connectionId, nodeId)
          })
        }}
        // ManageMySqlUsersDialog
        manageMySqlUsersDialog={manageMySqlUsersDialog}
        onCloseMySqlUsers={() => setManageMySqlUsersDialog(null)}
        onMySqlUsersSuccess={() => {
          if (!manageMySqlUsersDialog) return
          const { connectionId } = manageMySqlUsersDialog
          void window.api.database.invalidateCache(connectionId, 'security:users').then(() => {
            void tree.loadNodeChildren(connectionId, 'security:users')
          })
        }}
        // ManageMySqlDatabaseUsersDialog
        manageMySqlDatabaseUsersDialog={manageMySqlDatabaseUsersDialog}
        onCloseMySqlDatabaseUsers={() => setManageMySqlDatabaseUsersDialog(null)}
        onMySqlDatabaseUsersSuccess={() => {
          if (!manageMySqlDatabaseUsersDialog) return
          const { connectionId, databaseName } = manageMySqlDatabaseUsersDialog
          const nodeId = `db:${databaseName}:security:users`
          void window.api.database.invalidateCache(connectionId, nodeId).then(() => {
            void tree.loadNodeChildren(connectionId, nodeId)
          })
        }}
        // ManageRedisAclUsersDialog
        manageRedisAclUsersDialog={manageRedisAclUsersDialog}
        onCloseRedisAclUsers={() => setManageRedisAclUsersDialog(null)}
        onRedisAclUsersSuccess={() => {
          if (!manageRedisAclUsersDialog) return
          const { connectionId } = manageRedisAclUsersDialog
          void window.api.database.invalidateCache(connectionId, 'security:users').then(() => {
            void tree.loadNodeChildren(connectionId, 'security:users')
          })
        }}
        // ManageMongoUsersDialog
        manageMongoUsersDialog={manageMongoUsersDialog}
        onCloseMongoUsers={() => setManageMongoUsersDialog(null)}
        onMongoUsersSuccess={() => {
          if (!manageMongoUsersDialog) return
          const { connectionId } = manageMongoUsersDialog
          void window.api.database.invalidateCache(connectionId, 'security:users').then(() => {
            void tree.loadNodeChildren(connectionId, 'security:users')
          })
        }}
        // MongoDocumentDialog
        mongoDocumentDialogState={mongoDocumentDialogState}
        onCloseMongoDocumentDialog={() => setMongoDocumentDialogState(null)}
        onMongoDocumentSuccess={() => {
          if (mongoDocumentDialogState?.mode === 'add') {
            const { connectionId, databaseName, collectionName } = mongoDocumentDialogState
            const collectionNodeId = `mongodb-collection:${databaseName}:${collectionName}`
            void tree.silentRefreshNodeChildren(connectionId, collectionNodeId)
          }
          setMongoDocumentDialogState(null)
          const currentActiveTab = tabsMgr.tabs.find((t) => t.kind === 'query' && t.id === tabsMgr.activeTabId)
          if (currentActiveTab?.kind === 'query') {
            void queryRunner.executeQueryForTabWithSql(currentActiveTab, currentActiveTab.content)
          }
        }}
        onMongoDocumentSuccessKeepOpen={() => {
          if (mongoDocumentDialogState?.mode === 'add') {
            const { connectionId, databaseName, collectionName } = mongoDocumentDialogState
            const collectionNodeId = `mongodb-collection:${databaseName}:${collectionName}`
            void tree.silentRefreshNodeChildren(connectionId, collectionNodeId)
          }
          const currentActiveTab = tabsMgr.tabs.find((t) => t.kind === 'query' && t.id === tabsMgr.activeTabId)
          if (currentActiveTab?.kind === 'query') {
            void queryRunner.executeQueryForTabWithSql(currentActiveTab, currentActiveTab.content)
          }
        }}
        // DeleteMongoDocumentDialog
        deleteMongoDocumentState={deleteMongoDocumentState}
        isDeletingMongoDocument={isDeletingMongoDocument}
        onCloseDeleteMongoDocument={() => {
          setDeleteMongoDocumentState(null)
          setIsDeletingMongoDocument(false)
        }}
        onConfirmDeleteMongoDocument={async () => {
          if (!deleteMongoDocumentState) return
          setIsDeletingMongoDocument(true)
          try {
            const result = await window.api.database.deleteMongoDocument(
              deleteMongoDocumentState.connectionId,
              deleteMongoDocumentState.databaseName,
              deleteMongoDocumentState.collectionName,
              deleteMongoDocumentState.documentJson
            )
            if (result.status === 'ok') {
              setDeleteMongoDocumentState(null)
              const currentActiveTab = tabsMgr.tabs.find((t) => t.kind === 'query' && t.id === tabsMgr.activeTabId)
              if (currentActiveTab?.kind === 'query') {
                void queryRunner.executeQueryForTabWithSql(currentActiveTab, currentActiveTab.content)
              }
            }
          } finally {
            setIsDeletingMongoDocument(false)
          }
        }}
      />

      {pendingConfirm && (
        <ConfirmDialog
          title={pendingConfirm.title}
          message={pendingConfirm.message}
          icon={pendingConfirm.variant === 'danger' ? <Trash2 size={16} /> : undefined}
          iconColor={pendingConfirm.variant === 'danger' ? '#ff6464' : undefined}
          variant={pendingConfirm.variant === 'danger' ? 'danger' : 'primary'}
          confirmLabel={pendingConfirm.confirmLabel ?? (pendingConfirm.variant === 'danger' ? t('confirmDialog.delete') : undefined)}
          onConfirm={() => {
            pendingConfirm.resolve(true)
            setPendingConfirm(null)
          }}
          onClose={() => {
            pendingConfirm.resolve(false)
            setPendingConfirm(null)
          }}
        />
      )}

      {criticalConfirmState && (
        <CriticalEnvironmentConfirmDialog
          environmentName={criticalConfirmState.environmentName}
          onClose={() => {
            criticalConfirmResolverRef.current?.(false)
            criticalConfirmResolverRef.current = null
            setCriticalConfirmState(null)
          }}
          onConfirm={(skipForTab) => {
            if (skipForTab) {
              setSkipCriticalConfirmTabIds((prev) => new Set(prev).add(criticalConfirmState.tabId))
            }
            criticalConfirmResolverRef.current?.(true)
            criticalConfirmResolverRef.current = null
            setCriticalConfirmState(null)
          }}
        />
      )}

      <Menu
        items={contextMenu?.items ?? []}
        position={contextMenu?.position ?? null}
        onClose={() => setContextMenu(null)}
      />
      <Menu
        items={[{
          id: 'remove-sort',
          label: 'Remove Sort',
          onClick: () => {
            if (interactiveResults.columnSortContextMenu) {
              queryRunner.handleColumnRemoveSort(
                interactiveResults.columnSortContextMenu.tab,
                interactiveResults.columnSortContextMenu.columnName
              )
              interactiveResults.setColumnSortContextMenu(null)
            }
          }
        }]}
        position={interactiveResults.columnSortContextMenu?.position ?? null}
        onClose={() => interactiveResults.setColumnSortContextMenu(null)}
      />
      <Menu
        items={[{
          id: 'clear',
          label: 'Clear',
          onClick: () => {
            if (interactiveResults.boolPillContextMenu) {
              const { tab, rsIndex, columnName, row, rowIndex, sourceTable, pkColumns } = interactiveResults.boolPillContextMenu
              void interactiveResults.handleBooleanToggle(tab, rsIndex, sourceTable, pkColumns, columnName, row, rowIndex, null)
              interactiveResults.setBoolPillContextMenu(null)
            }
          }
        }]}
        position={interactiveResults.boolPillContextMenu?.position ?? null}
        onClose={() => interactiveResults.setBoolPillContextMenu(null)}
      />
      <Menu
        items={interactiveResults.rowContextMenu ? [
          {
            id: 'edit',
            label: 'Edit',
            icon: <Pencil size={13} />,
            onClick: () => {
              const { row, sourceTable, pkColumns, connectionId, databaseName, provider } = interactiveResults.rowContextMenu!
              interactiveResults.setRowContextMenu(null)
              interactiveResults.handleOpenEditRecord(connectionId, databaseName, provider, sourceTable, pkColumns, row)
            }
          },
          {
            id: 'delete',
            label: 'Delete',
            icon: <Trash2 size={13} />,
            onClick: () => {
              const { row, tab, rsIndex, sourceTable, pkColumns, connectionId, databaseName } = interactiveResults.rowContextMenu!
              interactiveResults.setRowContextMenu(null)
              interactiveResults.setDeleteConfirmState({ tabId: tab.id, rsIndex, connectionId, databaseName, sourceTable, pkColumns, selectedRows: [row] })
            }
          }
        ] : []}
        position={interactiveResults.rowContextMenu?.position ?? null}
        onClose={() => interactiveResults.setRowContextMenu(null)}
      />
      </div>
    </>
  )
}

export default ExplorerPage

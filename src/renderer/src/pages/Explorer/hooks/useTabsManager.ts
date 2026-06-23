/**
 * useTabsManager — manages tab lifecycle, file I/O, and keyboard bindings
 * for the Explorer page's tab strip.
 */
import { useState, useRef, useEffect, useCallback, createRef } from 'react'
import type { Tab, QueryTab, ErdTab, DashboardTab, MongoShellTab, RedisShellTab, RedisDbExplorerTab } from '../explorer.types'
import type { ErdFileContent, ErdCanvasSerializedState } from '../erd.types'
import type { Node, Edge } from '@xyflow/react'
import type { QueryEditorHandle } from '../MonacoEditor/QueryEditor'
import type { ConnectionRecord } from '../connections.types'
import { useMenuStateContext } from '../../../contexts/MenuStateContext'

let tabCounter = 0

interface UseTabsManagerOptions {
  isActive: boolean
  activeConnectionId: string | null
  getSelectedContext: () => { connectionId: string | null; databaseName: string | null; collectionName?: string | null }
  onResultsToggle: () => void
  onToggleAiPanel: () => void
  connections: ConnectionRecord[]
  setConnections: (updater: (prev: ConnectionRecord[]) => ConnectionRecord[]) => void
}

export interface UseTabsManagerReturn {
  tabs: Tab[]
  activeTabId: string | null
  setActiveTabId: (id: string | null) => void
  queryEditorRefs: React.MutableRefObject<Map<string, React.RefObject<QueryEditorHandle | null>>>
  getOrCreateQueryEditorRef: (tabId: string) => React.RefObject<QueryEditorHandle | null>
  handleNewQuery: () => void
  handleSave: () => Promise<void>
  handleOpen: () => Promise<void>
  handleSaveAs: () => Promise<void>
  handleSaveAll: () => Promise<void>
  removeTab: (tabId: string) => void
  closeActiveTab: () => void
  closeAllTabs: () => void
  closeTab: (e: React.MouseEvent, tabId: string) => void
  handleTabContentChange: (tabId: string, content: string) => void
  setTabs: React.Dispatch<React.SetStateAction<Tab[]>>
  unsavedCloseDialog: { tabId: string; pendingTabIds?: string[] } | null
  setUnsavedCloseDialog: React.Dispatch<React.SetStateAction<{ tabId: string; pendingTabIds?: string[] } | null>>
  handleSaveAndClose: (tabId: string) => Promise<void>
  handleDiscardAndClose: (tabId: string) => void
  handleCancelClose: () => void
  handleCreateErd: (connectionId: string, databaseName: string, defaultErdBackground: string) => Promise<void>
  handleErdBackgroundChange: (tabId: string, bg: string) => void
  handleOpenErdFromTree: (connectionId: string, filePath: string) => Promise<void>
  pendingExportTrigger: unknown
  setPendingExportTrigger: React.Dispatch<React.SetStateAction<unknown>>
  pendingSaveTrigger: boolean
  setPendingSaveTrigger: React.Dispatch<React.SetStateAction<boolean>>
  pendingSaveResolveRef: React.MutableRefObject<((state: ErdCanvasSerializedState) => void) | null>
  openQueryTabForConnection: (connectionId: string, databaseName: string, setActiveConnectionId: (id: string) => void) => string
  openScriptTab: (title: string, content: string, connectionId: string, databaseName: string, setActiveConnectionId: (id: string) => void) => void
  openOrFocusDashboardTab: (dashboardKind: 'redis', connectionId: string, title: string, setActiveConnectionId: (id: string) => void) => void
  openOrFocusMongoQueryTab: (connectionId: string, databaseName: string, collectionName: string, setActiveConnectionId: (id: string) => void) => void
  openOrFocusMongoShellTab: (connectionId: string, title: string, databaseName: string | undefined, setActiveConnectionId: (id: string) => void) => void
  openOrFocusRedisShellTab: (connectionId: string, title: string, initialDbIndex: string | undefined, setActiveConnectionId: (id: string) => void) => void
  openOrFocusRedisDbExplorerTab: (connectionId: string, dbIndex: number, title: string, setActiveConnectionId: (id: string) => void) => void
}

export function useTabsManager({
  isActive,
  activeConnectionId,
  getSelectedContext,
  onResultsToggle,
  onToggleAiPanel,
  connections,
  setConnections
}: UseTabsManagerOptions): UseTabsManagerReturn {
  const { updateMenuState } = useMenuStateContext()
  const [tabs, setTabs] = useState<Tab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const [unsavedCloseDialog, setUnsavedCloseDialog] = useState<{ tabId: string; pendingTabIds?: string[] } | null>(null)
  const [pendingExportTrigger, setPendingExportTrigger] = useState<unknown>(null)
  const [pendingSaveTrigger, setPendingSaveTrigger] = useState(false)
  const pendingSaveResolveRef = useRef<((state: ErdCanvasSerializedState) => void) | null>(null)
  const queryEditorRefs = useRef(new Map<string, React.RefObject<QueryEditorHandle | null>>())

  // Keep stable refs for callbacks used in event listeners
  const handleSaveRef = useRef<() => Promise<void>>(async () => {})
  const handleOpenRef = useRef<() => Promise<void>>(async () => {})
  const handleNewQueryRef = useRef<() => void>(() => {})
  const menuFileActionRef = useRef<(action: string) => void>(() => {})
  const handleCycleTabRef = useRef<(direction: 1 | -1) => void>(() => {})
  const onToggleAiPanelRef = useRef<() => void>(() => {})

  // Sync menu state with tab/active state
  useEffect(() => {
    if (!isActive) {
      updateMenuState({ hasOpenDocuments: false, canSaveActive: false, isDocumentFocused: false })
      return
    }
    const activeTab = tabs.find((t) => t.id === activeTabId)
    const hasOpenDocuments = tabs.length > 0
    const canSaveActive =
      hasOpenDocuments &&
      (!activeTab || activeTab.kind === 'erd' || (activeTab.kind === 'query' && activeTab.isDirty))
    const isDocumentFocused = activeTabId !== null
    updateMenuState({ hasOpenDocuments, canSaveActive, isDocumentFocused })
  }, [tabs, activeTabId, isActive, updateMenuState])

  // Focus active query editor when active tab changes.
  // Only depends on activeTabId — not on tabs — so it does not fire on every
  // keystroke (tab content changes on every keystroke via handleTabContentChange).
  // queryEditorRefs only contains entries for query tabs, so no kind-check needed.
  useEffect(() => {
    if (activeTabId === null) return
    queryEditorRefs.current.get(activeTabId)?.current?.focus()
  }, [activeTabId])

  // Wire up menu file actions
  useEffect(() => {
    function onFileAction(e: Event): void {
      menuFileActionRef.current((e as CustomEvent<string>).detail)
    }
    window.addEventListener('menu:file-action', onFileAction)
    return () => window.removeEventListener('menu:file-action', onFileAction)
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const isMac = window.api.platform === 'darwin'
    function onKeyDown(e: KeyboardEvent): void {
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault()
        handleNewQueryRef.current()
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
        e.preventDefault()
        onResultsToggle()
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        handleSaveRef.current()
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
        e.preventDefault()
        handleOpenRef.current()
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Tab') {
        e.preventDefault()
        handleCycleTabRef.current(e.shiftKey ? -1 : 1)
      }
      const aiPanelModifier = isMac ? e.metaKey : e.ctrlKey
      if (aiPanelModifier && e.shiftKey && e.code === 'KeyI') {
        e.preventDefault()
        onToggleAiPanelRef.current()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onResultsToggle])

  function getOrCreateQueryEditorRef(tabId: string): React.RefObject<QueryEditorHandle | null> {
    if (!queryEditorRefs.current.has(tabId)) {
      queryEditorRefs.current.set(tabId, createRef<QueryEditorHandle>())
    }
    return queryEditorRefs.current.get(tabId)!
  }

  const MONGO_STARTER_COMMENT = '/*\n * Write your query here, or execute empty query to get entire collection.\n */\n'

  function handleNewQuery(): void {
    tabCounter += 1
    const id = `tab-${tabCounter}`
    const { connectionId, databaseName, collectionName } = getSelectedContext()
    const resolvedConnectionId = connectionId ?? activeConnectionId
    const conn = connections.find((c) => c.id === resolvedConnectionId)
    if (conn?.provider === 'mongodb') {
      // For MongoDB, require a collection node to be selected
      if (!collectionName || !resolvedConnectionId || !databaseName) return
      const newTab: QueryTab = {
        id,
        kind: 'query',
        title: collectionName,
        content: MONGO_STARTER_COMMENT,
        isDirty: false,
        connectionId: resolvedConnectionId,
        databaseName,
        mongoCollection: collectionName
      }
      setTabs((prev) => [...prev, newTab])
      setActiveTabId(id)
      return
    }
    const newTab: QueryTab = {
      id,
      kind: 'query',
      title: 'Unnamed',
      content: '',
      isDirty: false,
      connectionId: connectionId ?? undefined,
      databaseName: databaseName ?? undefined
    }
    setTabs((prev) => [...prev, newTab])
    setActiveTabId(id)
  }

  /** Opens a blank query tab pre-bound to a connection/database, returns its id. */
  function openQueryTabForConnection(
    connectionId: string,
    databaseName: string,
    setActiveConnectionId: (id: string) => void
  ): string {
    tabCounter += 1
    const id = `tab-${tabCounter}`
    const newTab: QueryTab = {
      id,
      kind: 'query',
      title: 'Unnamed',
      content: '',
      isDirty: false,
      connectionId,
      databaseName
    }
    setTabs((prev) => [...prev, newTab])
    setActiveTabId(id)
    setActiveConnectionId(connectionId)
    return id
  }

  /** Opens a script tab with pre-populated content. */
  function openScriptTab(
    title: string,
    content: string,
    connectionId: string,
    databaseName: string,
    setActiveConnectionId: (id: string) => void
  ): void {
    tabCounter += 1
    const id = `tab-${tabCounter}`
    const newTab: QueryTab = { id, kind: 'query', title, content, isDirty: false, connectionId, databaseName }
    setTabs((prev) => [...prev, newTab])
    setActiveTabId(id)
    setActiveConnectionId(connectionId)
  }

  function removeTab(tabId: string): void {
    queryEditorRefs.current.delete(tabId)
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== tabId)
      if (activeTabId === tabId) {
        const idx = prev.findIndex((t) => t.id === tabId)
        const sibling = prev[idx - 1] ?? prev[idx + 1]
        setActiveTabId(sibling?.id ?? null)
      }
      return next
    })
  }

  function closeActiveTab(): void {
    if (!activeTabId) return
    const tab = tabs.find((t) => t.id === activeTabId)
    if (tab?.kind === 'query' && tab.isDirty) {
      setUnsavedCloseDialog({ tabId: activeTabId })
      return
    }
    removeTab(activeTabId)
  }

  function closeAllTabs(): void {
    const dirtyTabIds = tabs
      .filter((t): t is QueryTab => t.kind === 'query' && t.isDirty)
      .map((t) => t.id)
    const dirtySet = new Set(dirtyTabIds)
    // Clean up refs for non-dirty tabs immediately
    tabs.forEach((t) => {
      if (!dirtySet.has(t.id)) {
        queryEditorRefs.current.delete(t.id)
      }
    })
    if (dirtyTabIds.length === 0) {
      setTabs([])
      setActiveTabId(null)
      return
    }
    // Keep only dirty tabs, then show dialog for the first one
    setTabs((prev) => prev.filter((t) => dirtySet.has(t.id)))
    const [first, ...rest] = dirtyTabIds
    setActiveTabId(first)
    setUnsavedCloseDialog({ tabId: first, pendingTabIds: rest })
  }

  function closeTab(e: React.MouseEvent, tabId: string): void {
    e.stopPropagation()
    const tab = tabs.find((t) => t.id === tabId)
    if (tab?.kind === 'query' && tab.isDirty) {
      setUnsavedCloseDialog({ tabId })
      return
    }
    removeTab(tabId)
  }

  function handleTabContentChange(tabId: string, content: string): void {
    setTabs((prev) =>
      prev.map((t) => (t.id === tabId && t.kind === 'query' ? { ...t, content, isDirty: true } : t))
    )
  }

  async function handleSave(): Promise<void> {
    if (!activeTabId) return
    const activeTab = tabs.find((t) => t.id === activeTabId)
    if (!activeTab) return

    if (activeTab.kind === 'query') {
      if (activeTab.filePath) {
        await window.api.file.save(activeTab.filePath, activeTab.content)
        setTabs((prev) =>
          prev.map((t) => (t.id === activeTabId ? { ...t, isDirty: false } : t))
        )
      } else {
        const result = await window.api.file.saveDialog(activeTab.content)
        if (result.status === 'ok') {
          const fileName = result.filePath.split(/[\\/]/).pop() ?? result.filePath
          setTabs((prev) =>
            prev.map((t) =>
              t.id === activeTabId
                ? { ...t, filePath: result.filePath, title: fileName, isDirty: false }
                : t
            )
          )
        }
      }
      return
    }

    if (activeTab.kind === 'erd') {
      const state = await new Promise<ErdCanvasSerializedState>((resolve) => {
        pendingSaveResolveRef.current = resolve
        setPendingSaveTrigger(true)
      })
      const conn = connections.find((c) => c.id === activeTab.connectionId)
      const fileContent: ErdFileContent = {
        version: 1,
        connectionId: activeTab.connectionId,
        connectionName: conn?.name ?? activeTab.connectionId,
        databaseName: activeTab.databaseName,
        nodes: state.nodes,
        edges: state.edges,
        curveType: state.curveType,
        background: activeTab.background as ErdTab['background'],
        viewport: state.viewport,
        savedAt: new Date().toISOString()
      }
      const json = JSON.stringify(fileContent, null, 2)
      if (activeTab.filePath) {
        await window.api.file.save(activeTab.filePath, json)
        await window.api.connections.addErdFile(activeTab.connectionId, activeTab.databaseName, activeTab.filePath)
      } else {
        const result = await window.api.file.saveErdDialog(json)
        if (result.status === 'ok') {
          const fileName = result.filePath.split(/[\\/]/).pop() ?? result.filePath
          const title = fileName.replace(/\.erd$/i, '')
          setTabs((prev) =>
            prev.map((t) =>
              t.id === activeTabId && t.kind === 'erd'
                ? { ...t, filePath: result.filePath, title }
                : t
            )
          )
          await window.api.connections.addErdFile(activeTab.connectionId, activeTab.databaseName, result.filePath)
        }
      }
      const updatedConns = await window.api.connections.getAll()
      setConnections(() => updatedConns)
    }
  }

  async function handleOpen(): Promise<void> {
    const activeTab = tabs.find((t) => t.id === activeTabId)
    if (activeTab?.kind === 'erd') {
      const result = await window.api.file.openErdDialog()
      if (result.status !== 'ok') return
      const parsed = JSON.parse(result.content) as ErdFileContent
      const fileName = result.filePath.split(/[\\/]/).pop() ?? result.filePath
      const title = fileName.replace(/\.erd$/i, '')
      tabCounter += 1
      const id = `tab-${tabCounter}`
      const newTab: ErdTab = {
        id,
        kind: 'erd',
        title,
        connectionId: parsed.connectionId,
        databaseName: parsed.databaseName,
        loadState: 'loaded',
        background: parsed.background as ErdTab['background'],
        filePath: result.filePath,
        initialNodes: parsed.nodes as Node[],
        initialEdges: parsed.edges as Edge[],
        initialCurveType: parsed.curveType,
        initialViewport: parsed.viewport
      }
      setTabs((prev) => [...prev, newTab])
      setActiveTabId(id)
      return
    }

    const result = await window.api.file.openDialog()
    if (result.status !== 'ok') return
    const fileName = result.filePath.split(/[\\/]/).pop() ?? result.filePath

    if (/\.erd$/i.test(result.filePath)) {
      const parsed = JSON.parse(result.content) as ErdFileContent
      const title = fileName.replace(/\.erd$/i, '')
      tabCounter += 1
      const id = `tab-${tabCounter}`
      const newTab: ErdTab = {
        id,
        kind: 'erd',
        title,
        connectionId: parsed.connectionId,
        databaseName: parsed.databaseName,
        loadState: 'loaded',
        background: parsed.background as ErdTab['background'],
        filePath: result.filePath,
        initialNodes: parsed.nodes as Node[],
        initialEdges: parsed.edges as Edge[],
        initialCurveType: parsed.curveType,
        initialViewport: parsed.viewport
      }
      setTabs((prev) => [...prev, newTab])
      setActiveTabId(id)
      return
    }

    tabCounter += 1
    const id = `tab-${tabCounter}`
    const newTab: QueryTab = {
      id,
      kind: 'query',
      title: fileName,
      filePath: result.filePath,
      content: result.content,
      isDirty: false
    }
    setTabs((prev) => [...prev, newTab])
    setActiveTabId(id)
  }

  async function handleSaveAs(): Promise<void> {
    if (!activeTabId) return
    const activeTab = tabs.find((t) => t.id === activeTabId)
    if (!activeTab || activeTab.kind !== 'query') return
    const result = await window.api.file.saveDialog(activeTab.content)
    if (result.status === 'ok') {
      const fileName = result.filePath.split(/[\\/]/).pop() ?? result.filePath
      setTabs((prev) =>
        prev.map((t) =>
          t.id === activeTabId
            ? { ...t, filePath: result.filePath, title: fileName, isDirty: false }
            : t
        )
      )
    }
  }

  async function handleSaveAll(): Promise<void> {
    const dirtyTabs = tabs.filter((t): t is QueryTab => t.kind === 'query' && t.isDirty)
    for (const tab of dirtyTabs) {
      if (tab.filePath) {
        await window.api.file.save(tab.filePath, tab.content)
        setTabs((prev) => prev.map((t) => (t.id === tab.id ? { ...t, isDirty: false } : t)))
      } else {
        const result = await window.api.file.saveDialog(tab.content)
        if (result.status === 'ok') {
          const fileName = result.filePath.split(/[\\/]/).pop() ?? result.filePath
          setTabs((prev) =>
            prev.map((t) =>
              t.id === tab.id
                ? { ...t, filePath: result.filePath, title: fileName, isDirty: false }
                : t
            )
          )
        }
      }
    }
  }

  async function handleSaveAndClose(tabId: string): Promise<void> {
    const pending = unsavedCloseDialog?.pendingTabIds ?? []
    const tab = tabs.find((t) => t.id === tabId)
    if (!tab || tab.kind !== 'query') {
      removeTab(tabId)
      advanceCloseQueue(pending)
      return
    }
    if (tab.filePath) {
      await window.api.file.save(tab.filePath, tab.content)
      removeTab(tabId)
      advanceCloseQueue(pending)
    } else {
      const result = await window.api.file.saveDialog(tab.content)
      if (result.status === 'ok') {
        removeTab(tabId)
        advanceCloseQueue(pending)
      }
      // If the OS file dialog was cancelled, leave unsavedCloseDialog open for this tab.
    }
  }

  function advanceCloseQueue(pending: string[]): void {
    if (pending.length === 0) {
      setUnsavedCloseDialog(null)
      return
    }
    const [next, ...rest] = pending
    setActiveTabId(next)
    setUnsavedCloseDialog({ tabId: next, pendingTabIds: rest })
  }

  function handleDiscardAndClose(tabId: string): void {
    const pending = unsavedCloseDialog?.pendingTabIds ?? []
    removeTab(tabId)
    advanceCloseQueue(pending)
  }

  function handleCancelClose(): void {
    setUnsavedCloseDialog(null)
  }

  async function handleCreateErd(connectionId: string, databaseName: string, defaultErdBackground: string): Promise<void> {
    tabCounter += 1
    const id = `tab-${tabCounter}`
    const newTab: ErdTab = {
      id,
      kind: 'erd',
      title: `ERD · ${databaseName}`,
      connectionId,
      databaseName,
      loadState: 'loading',
      background: (defaultErdBackground ?? 'dots') as ErdTab['background']
    }
    setTabs((prev) => [...prev, newTab])
    setActiveTabId(id)
    try {
      const result = await window.api.database.getErdSchema(connectionId, databaseName)
      setTabs((prev) =>
        prev.map((t) => {
          if (t.id !== id || t.kind !== 'erd') return t
          if (result.status === 'ok') {
            return { ...t, loadState: 'loaded' as const, schema: result.schema as import('../erd.types').ErdSchema }
          }
          return { ...t, loadState: 'error' as const, error: result.message }
        })
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load ERD schema'
      setTabs((prev) =>
        prev.map((t) =>
          t.id === id && t.kind === 'erd' ? { ...t, loadState: 'error' as const, error: message } : t
        )
      )
    }
  }

  function handleErdBackgroundChange(tabId: string, bg: string): void {
    setTabs((prev) =>
      prev.map((t) =>
        t.id === tabId && t.kind === 'erd' ? { ...t, background: bg as ErdTab['background'] } : t
      )
    )
  }

  async function handleOpenErdFromTree(connectionId: string, filePath: string): Promise<void> {
    const existing = tabs.find((t) => t.kind === 'erd' && t.filePath === filePath)
    if (existing) {
      setActiveTabId(existing.id)
      return
    }
    const result = await window.api.file.read(filePath)
    if (result.status !== 'ok') return
    const parsed = JSON.parse(result.content) as ErdFileContent
    const fileName = filePath.split(/[\\/]/).pop() ?? filePath
    const title = fileName.replace(/\.erd$/i, '')
    tabCounter += 1
    const id = `tab-${tabCounter}`
    const newTab: ErdTab = {
      id,
      kind: 'erd',
      title,
      connectionId,
      databaseName: parsed.databaseName,
      loadState: 'loaded',
      background: parsed.background as ErdTab['background'],
      filePath,
      initialNodes: parsed.nodes as Node[],
      initialEdges: parsed.edges as Edge[],
      initialCurveType: parsed.curveType,
      initialViewport: parsed.viewport
    }
    setTabs((prev) => [...prev, newTab])
    setActiveTabId(id)
  }

  // Update stable refs each render
  const handleSaveCallback = useCallback(handleSave, [tabs, activeTabId, connections])
  const handleOpenCallback = useCallback(handleOpen, [tabs, activeTabId])
  handleSaveRef.current = handleSaveCallback
  handleOpenRef.current = handleOpenCallback
  handleNewQueryRef.current = handleNewQuery
  onToggleAiPanelRef.current = onToggleAiPanel
  handleCycleTabRef.current = (direction: 1 | -1): void => {
    if (tabs.length < 2) return
    const currentIndex = tabs.findIndex((t) => t.id === activeTabId)
    if (currentIndex === -1) return
    const nextIndex = (currentIndex + direction + tabs.length) % tabs.length
    setActiveTabId(tabs[nextIndex].id)
  }
  menuFileActionRef.current = (action: string): void => {
    if (!isActive) {
      if (action === 'quit') window.api.app.quit()
      return
    }
    if (action === 'new') handleNewQuery()
    else if (action === 'open') void handleOpenRef.current()
    else if (action === 'save') void handleSaveRef.current()
    else if (action === 'save-as') void handleSaveAs()
    else if (action === 'save-all') void handleSaveAll()
    else if (action === 'close') closeActiveTab()
    else if (action === 'window:close-all-tabs') closeAllTabs()
    else if (action === 'quit') window.api.app.quit()
  }

  /** Opens a dashboard tab for a connection, or focuses the existing one. */
  function openOrFocusDashboardTab(
    dashboardKind: 'redis',
    connectionId: string,
    title: string,
    setActiveConnectionId: (id: string) => void
  ): void {
    const existing = tabs.find(
      (t): t is DashboardTab =>
        t.kind === 'dashboard' && t.dashboardKind === dashboardKind && t.connectionId === connectionId
    )
    if (existing) {
      setActiveTabId(existing.id)
      setActiveConnectionId(connectionId)
      return
    }
    tabCounter += 1
    const id = `tab-${tabCounter}`
    const newTab: DashboardTab = { id, kind: 'dashboard', dashboardKind, title, connectionId }
    setTabs((prev) => [...prev, newTab])
    setActiveTabId(id)
    setActiveConnectionId(connectionId)
  }

  /** Opens a Redis shell tab for a connection, or focuses the existing one. */
  function openOrFocusRedisShellTab(
    connectionId: string,
    title: string,
    initialDbIndex: string | undefined,
    setActiveConnectionId: (id: string) => void
  ): void {
    const existing = tabs.find(
      (t): t is RedisShellTab => t.kind === 'redis-shell' && t.connectionId === connectionId
    )
    if (existing) {
      setActiveTabId(existing.id)
      setActiveConnectionId(connectionId)
      return
    }
    tabCounter += 1
    const id = `tab-${tabCounter}`
    const newTab: RedisShellTab = { id, kind: 'redis-shell', title, connectionId, initialDbIndex }
    setTabs((prev) => [...prev, newTab])
    setActiveTabId(id)
    setActiveConnectionId(connectionId)
  }

  /** Opens a Redis DB Explorer tab for a specific db index, or focuses the existing one. */
  function openOrFocusRedisDbExplorerTab(
    connectionId: string,
    dbIndex: number,
    title: string,
    setActiveConnectionId: (id: string) => void
  ): void {
    const existing = tabs.find(
      (t): t is RedisDbExplorerTab =>
        t.kind === 'redis-db-explorer' && t.connectionId === connectionId && t.dbIndex === dbIndex
    )
    if (existing) {
      setActiveTabId(existing.id)
      setActiveConnectionId(connectionId)
      return
    }
    tabCounter += 1
    const id = `tab-${tabCounter}`
    const newTab: RedisDbExplorerTab = { id, kind: 'redis-db-explorer', title, connectionId, dbIndex }
    setTabs((prev) => [...prev, newTab])
    setActiveTabId(id)
    setActiveConnectionId(connectionId)
  }

  /** Opens a MongoDB shell tab for a connection, or focuses the existing one. */
  function openOrFocusMongoShellTab(
    connectionId: string,
    title: string,
    databaseName: string | undefined,
    setActiveConnectionId: (id: string) => void
  ): void {
    const existing = tabs.find(
      (t): t is MongoShellTab => t.kind === 'mongo-shell' && t.connectionId === connectionId
    )
    if (existing) {
      setActiveTabId(existing.id)
      setActiveConnectionId(connectionId)
      return
    }
    tabCounter += 1
    const id = `tab-${tabCounter}`
    const newTab: MongoShellTab = { id, kind: 'mongo-shell', title, connectionId, databaseName }
    setTabs((prev) => [...prev, newTab])
    setActiveTabId(id)
    setActiveConnectionId(connectionId)
  }

  /** Opens a collection-bound Mongo query tab, or focuses an existing one for the same collection. */
  function openOrFocusMongoQueryTab(
    connectionId: string,
    databaseName: string,
    collectionName: string,
    setActiveConnectionId: (id: string) => void
  ): void {
    const existing = tabs.find(
      (t): t is QueryTab =>
        t.kind === 'query' &&
        t.connectionId === connectionId &&
        t.databaseName === databaseName &&
        t.mongoCollection === collectionName
    )
    if (existing) {
      setActiveTabId(existing.id)
      setActiveConnectionId(connectionId)
      return
    }
    tabCounter += 1
    const id = `tab-${tabCounter}`
    const newTab: QueryTab = {
      id,
      kind: 'query',
      title: collectionName,
      content: MONGO_STARTER_COMMENT,
      isDirty: false,
      connectionId,
      databaseName,
      mongoCollection: collectionName
    }
    setTabs((prev) => [...prev, newTab])
    setActiveTabId(id)
    setActiveConnectionId(connectionId)
  }

  return {
    tabs,
    activeTabId,
    setActiveTabId,
    queryEditorRefs,
    getOrCreateQueryEditorRef,
    handleNewQuery,
    handleSave,
    handleOpen,
    handleSaveAs,
    handleSaveAll,
    removeTab,
    closeActiveTab,
    closeAllTabs,
    closeTab,
    handleTabContentChange,
    setTabs,
    unsavedCloseDialog,
    setUnsavedCloseDialog,
    handleSaveAndClose,
    handleDiscardAndClose,
    handleCancelClose,
    handleCreateErd,
    handleErdBackgroundChange,
    handleOpenErdFromTree,
    pendingExportTrigger,
    setPendingExportTrigger,
    pendingSaveTrigger,
    setPendingSaveTrigger,
    pendingSaveResolveRef,
    openQueryTabForConnection,
    openScriptTab,
    openOrFocusDashboardTab,
    openOrFocusMongoQueryTab,
    openOrFocusMongoShellTab,
    openOrFocusRedisShellTab,
    openOrFocusRedisDbExplorerTab
  }
}

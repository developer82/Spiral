/**
 * useExplorerTree — manages connection state, node loading, tree expansion,
 * and eager-load status for the Explorer sidebar tree.
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import type {
  ConnectionRecord,
  ConnectionRuntimeState,
  ConnectionUserProfile,
  ExplorerNode,
  NodeLoadState,
  ProviderCapabilities
} from '../connections.types'
import { DEFAULT_CAPABILITIES } from '../ExplorerUtils'
import {
  CONNECTIONS_UPDATED_EVENT,
  EXPLORER_REFRESH_DATABASE_EVENT,
  type ExplorerRefreshDatabaseDetail
} from '../../../events/connectionEvents'
import { trackEvent } from '../../../analytics/track'

/**
 * A connection needs an interactive password prompt when its password was not
 * saved (rememberPassword === false). SQLite is file-based with no auth, so it
 * never prompts. Anonymous-login connections deliberately connect without any
 * credentials, so they never prompt either.
 */
export function needsPasswordPrompt(conn: ConnectionRecord): boolean {
  return !conn.rememberPassword && !conn.anonymousLogin && conn.provider !== 'sqlite'
}

export interface UseExplorerTreeReturn {
  connections: ConnectionRecord[]
  setConnections: React.Dispatch<React.SetStateAction<ConnectionRecord[]>>
  runtimeStates: Map<string, ConnectionRuntimeState>
  nodeStates: Map<string, NodeLoadState>
  expandedConns: Set<string>
  expandedNodes: Set<string>
  eagerLoadStates: Map<string, 'loading' | 'complete' | 'error'>
  connectionsCapabilities: Map<string, ProviderCapabilities>
  expandedErdFolders: Set<string>
  setExpandedErdFolders: React.Dispatch<React.SetStateAction<Set<string>>>
  selectedKey: string | null
  setSelectedKey: React.Dispatch<React.SetStateAction<string | null>>
  activeConnectionId: string | null
  setActiveConnectionId: React.Dispatch<React.SetStateAction<string | null>>
  getRuntimeState: (id: string) => ConnectionRuntimeState
  getConnectionCapabilities: (connectionId: string) => ProviderCapabilities
  getSelectedContext: () => { connectionId: string | null; databaseName: string | null; collectionName?: string | null }
  toggleConn: (id: string) => void
  toggleNode: (connectionId: string, node: ExplorerNode) => void
  loadNodeChildren: (connectionId: string, nodeId: string) => Promise<void>
  silentRefreshNodeChildren: (connectionId: string, nodeId: string) => Promise<void>
  connectToDatabase: (id: string, silent?: boolean) => Promise<void>
  connectWithCredentials: (id: string, username: string, password: string) => Promise<void>
  connectAsProfile: (id: string, profile: ConnectionUserProfile) => Promise<void>
  passwordPromptConnection: ConnectionRecord | null
  /** The user profile being connected as, when the password prompt was opened via "Connect As…". */
  passwordPromptProfile: ConnectionUserProfile | null
  /** Error to show in the password prompt, e.g. when a saved-credential "Connect As…" failed. */
  passwordPromptError: string | null
  cancelPasswordPrompt: () => void
  disconnectConnection: (connectionId: string) => Promise<void>
  handleConnectAction: (connectionId: string) => void
  handleDisconnectAction: (connectionId: string) => Promise<void>
  handleEditAction: (
    connectionId: string,
    t: (key: string) => string,
    requestConfirm: (title: string, message: string, confirmLabel?: string) => Promise<boolean>,
    setIsDialogOpen: (v: boolean) => void,
    setEditingConnection: (c: ConnectionRecord | null) => void
  ) => Promise<void>
  handleDeleteAction: (connectionId: string, t: (key: string, opts?: object) => string, requestConfirm: (title: string, message: string) => Promise<boolean>) => Promise<void>
  clearConnectionState: (connectionId: string) => void
}

export function useExplorerTree(showSystemDatabases: boolean): UseExplorerTreeReturn {
  const [connections, setConnections] = useState<ConnectionRecord[]>([])
  const [runtimeStates, setRuntimeStates] = useState<Map<string, ConnectionRuntimeState>>(new Map())
  const [nodeStates, setNodeStates] = useState<Map<string, NodeLoadState>>(new Map())
  const [expandedConns, setExpandedConns] = useState<Set<string>>(new Set())
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())
  const [eagerLoadStates, setEagerLoadStates] = useState<Map<string, 'loading' | 'complete' | 'error'>>(new Map())
  const [connectionsCapabilities, setConnectionsCapabilities] = useState<Map<string, ProviderCapabilities>>(new Map())
  const [expandedErdFolders, setExpandedErdFolders] = useState<Set<string>>(new Set())
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null)
  const [passwordPromptConnection, setPasswordPromptConnection] = useState<ConnectionRecord | null>(null)
  const [passwordPromptProfile, setPasswordPromptProfile] = useState<ConnectionUserProfile | null>(null)
  const [passwordPromptError, setPasswordPromptError] = useState<string | null>(null)

  // Always-current ref used by event listeners to avoid stale closures
  const nodeStatesRef = useRef(nodeStates)
  nodeStatesRef.current = nodeStates

  const loadConnections = useCallback(async (): Promise<ConnectionRecord[]> => {
    const conns = await window.api.connections.getAll()
    setConnections(conns)
    return conns
  }, [])

  // Load all connections and auto-connect on mount
  useEffect(() => {
    loadConnections().then((conns) => {
      for (const conn of conns) {
        if (conn.autoConnect) {
          void connectToDatabase(conn.id, true)
        }
      }
    })
  }, [loadConnections])

  useEffect(() => {
    const handleConnectionsUpdated = (): void => {
      void loadConnections()
    }

    window.addEventListener(CONNECTIONS_UPDATED_EVENT, handleConnectionsUpdated)
    return () => window.removeEventListener(CONNECTIONS_UPDATED_EVENT, handleConnectionsUpdated)
  }, [loadConnections])

  // Refresh specific database nodes when an external action (e.g. Sync All) modifies the schema
  useEffect(() => {
    const SYNC_FOLDER_TYPES = ['tables', 'views', 'stored-procedures'] as const

    const handleRefreshDatabase = (event: Event): void => {
      const { connectionId, databaseName } = (event as CustomEvent<ExplorerRefreshDatabaseDetail>).detail
      void Promise.all(
        SYNC_FOLDER_TYPES.map(async (folderType) => {
          const nodeId = `db:${databaseName}:${folderType}`
          await window.api.database.invalidateCache(connectionId, nodeId)
          if (nodeStatesRef.current.get(`${connectionId}/${nodeId}`)?.status === 'loaded') {
            void loadNodeChildren(connectionId, nodeId)
          }
        })
      )
    }

    window.addEventListener(EXPLORER_REFRESH_DATABASE_EVENT, handleRefreshDatabase)
    return () => window.removeEventListener(EXPLORER_REFRESH_DATABASE_EVENT, handleRefreshDatabase)
  }, [])

  // Subscribe to eager load status updates
  useEffect(() => {
    const unsubscribe = window.api.database.onEagerLoadStatus(({ connectionId, status }) => {
      setEagerLoadStates((prev) => {
        const next = new Map(prev)
        next.set(connectionId, status)
        return next
      })
    })
    return unsubscribe
  }, [])

  // Subscribe to background refresh events from the main process.
  // Applies changed children directly (no loading state) so the tree updates silently.
  useEffect(() => {
    const unsubscribe = window.api.database.onBackgroundRefresh(({ connectionId, updates }) => {
      const currentStates = nodeStatesRef.current
      // Collect child IDs that were removed by updated parents, so we can prune stale descendants
      const removedChildIds: string[] = []
      for (const { nodeId, children } of updates) {
        const key = `${connectionId}/${nodeId}`
        const current = currentStates.get(key)
        if (current?.status === 'loaded' && current.children) {
          const newIdSet = new Set(children.map((c) => c.id))
          for (const old of current.children) {
            if (!newIdSet.has(old.id)) removedChildIds.push(old.id)
          }
        }
      }
      setNodeStates((prev) => {
        const next = new Map(prev)
        for (const { nodeId, children } of updates) {
          const key = `${connectionId}/${nodeId}`
          if (next.get(key)?.status === 'loaded') {
            next.set(key, { status: 'loaded', children })
          }
        }
        // Prune cached state for descendants of removed children
        if (removedChildIds.length > 0) {
          for (const key of next.keys()) {
            if (!key.startsWith(`${connectionId}/`)) continue
            const nodeId = key.slice(connectionId.length + 1)
            if (removedChildIds.some((id) => nodeId === id || nodeId.startsWith(`${id}:`))) {
              next.delete(key)
            }
          }
        }
        return next
      })
      if (removedChildIds.length > 0) {
        setExpandedNodes((prev) => {
          let changed = false
          const next = new Set(prev)
          for (const key of next) {
            if (!key.startsWith(`${connectionId}/`)) continue
            const nodeId = key.slice(connectionId.length + 1)
            if (removedChildIds.some((id) => nodeId === id || nodeId.startsWith(`${id}:`))) {
              next.delete(key)
              changed = true
            }
          }
          return changed ? next : prev
        })
      }
    })
    return unsubscribe
  }, [])

  // Sync watch state to main whenever tree state changes (debounced).
  // Main process uses this to know which nodes to watch for each connection.
  const watchSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (watchSyncTimerRef.current !== null) {
      clearTimeout(watchSyncTimerRef.current)
    }
    watchSyncTimerRef.current = setTimeout(() => {
      watchSyncTimerRef.current = null
      const appFocused = document.hasFocus()
      const connectedAutoRefresh = connections.filter(
        (c) => c.backgroundAutoRefresh && runtimeStates.get(c.id)?.status === 'connected'
      )
      for (const conn of connectedAutoRefresh) {
        const watchedNodes: string[] = []
        for (const key of expandedNodes) {
          if (!key.startsWith(`${conn.id}/`)) continue
          const nodeId = key.slice(conn.id.length + 1)
          if (nodeStates.get(key)?.status === 'loaded') {
            watchedNodes.push(nodeId)
          }
        }
        void window.api.database.syncWatchState(conn.id, true, appFocused, watchedNodes, showSystemDatabases)
      }
    }, 300)
    return () => {
      if (watchSyncTimerRef.current !== null) {
        clearTimeout(watchSyncTimerRef.current)
        watchSyncTimerRef.current = null
      }
    }
  }, [connections, runtimeStates, expandedNodes, nodeStates, showSystemDatabases])

  // Re-load databases when showSystemDatabases setting changes (but skip first render)
  const isFirstRender = { current: true }
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    for (const [connectionId, runtimeState] of runtimeStates) {
      if (runtimeState.status !== 'connected') continue
      const key = `${connectionId}/databases`
      if (nodeStates.get(key)?.status === 'loaded') {
        void loadNodeChildren(connectionId, 'databases')
      }
    }
  }, [showSystemDatabases])

  function setRuntimeState(id: string, state: ConnectionRuntimeState): void {
    setRuntimeStates((prev) => {
      const next = new Map(prev)
      next.set(id, state)
      return next
    })
  }

  function getRuntimeState(id: string): ConnectionRuntimeState {
    return runtimeStates.get(id) ?? { status: 'disconnected' }
  }

  function getConnectionCapabilities(connectionId: string): ProviderCapabilities {
    return connectionsCapabilities.get(connectionId) ?? DEFAULT_CAPABILITIES
  }

  function getSelectedContext(): { connectionId: string | null; databaseName: string | null; collectionName?: string | null } {
    if (!selectedKey) return { connectionId: null, databaseName: null }
    if (selectedKey.startsWith('conn:')) {
      return { connectionId: selectedKey.slice(5), databaseName: null }
    }
    const slashIdx = selectedKey.indexOf('/')
    if (slashIdx === -1) return { connectionId: null, databaseName: null }
    const connectionId = selectedKey.slice(0, slashIdx)
    const nodeId = selectedKey.slice(slashIdx + 1)
    // Mongo collection node: mongodb-collection:{dbName}:{collName}
    const mongoCollMatch = nodeId.match(/^mongodb-collection:([^:]+):(.+)$/)
    if (mongoCollMatch) {
      return { connectionId, databaseName: mongoCollMatch[1], collectionName: mongoCollMatch[2] }
    }
    // Mongo collection sub-nodes: mongodb-collection-{kind}:{dbName}:{collName}
    const mongoCollSubMatch = nodeId.match(/^mongodb-collection-(?:documents|indexes|aggregations|validation):([^:]+):(.+)$/)
    if (mongoCollSubMatch) {
      return { connectionId, databaseName: mongoCollSubMatch[1], collectionName: mongoCollSubMatch[2] }
    }
    const dbMatch = nodeId.match(/^db:([^:]+)/)
    return { connectionId, databaseName: dbMatch?.[1] ?? null }
  }

  function setNodeState(key: string, state: NodeLoadState): void {
    setNodeStates((prev) => {
      const next = new Map(prev)
      next.set(key, state)
      return next
    })
  }

  async function loadNodeChildren(connectionId: string, nodeId: string): Promise<void> {
    const key = `${connectionId}/${nodeId}`
    setNodeState(key, { status: 'loading' })
    try {
      const result = await window.api.database.getChildren(connectionId, nodeId)
      if (result.status === 'ok') {
        setNodeState(key, { status: 'loaded', children: result.children })
      } else {
        setNodeState(key, { status: 'error', errorMessage: result.message })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load'
      setNodeState(key, { status: 'error', errorMessage: message })
    }
  }

  async function silentRefreshNodeChildren(connectionId: string, nodeId: string): Promise<void> {
    const key = `${connectionId}/${nodeId}`
    try {
      await window.api.database.invalidateCache(connectionId, nodeId)
      const result = await window.api.database.getChildren(connectionId, nodeId)
      if (result.status === 'ok') {
        setNodeState(key, { status: 'loaded', children: result.children })
      }
    } catch {
      // silent — no UI feedback on failure
    }
  }

  function toggleNode(connectionId: string, node: ExplorerNode): void {
    const key = `${connectionId}/${node.id}`
    const isExpanded = expandedNodes.has(key)
    setExpandedNodes((prev) => {
      const next = new Set(prev)
      if (isExpanded) next.delete(key)
      else next.add(key)
      return next
    })
    if (!isExpanded) {
      const state = nodeStates.get(key)
      if (!state || state.status === 'error') {
        void loadNodeChildren(connectionId, node.id)
      }
    }
  }

  // Shared post-connect success handling: mark connected, track, fetch capabilities.
  async function applyConnectSuccess(id: string, activeUsername: string): Promise<void> {
    setRuntimeState(id, { status: 'connected', activeUsername })
    const provider = connections.find((c) => c.id === id)?.provider
    if (provider) trackEvent('connection_opened', { provider })
    try {
      const caps = await window.api.database.getCapabilities(id)
      if (caps) {
        setConnectionsCapabilities((prev) => {
          const next = new Map(prev)
          next.set(id, { ...DEFAULT_CAPABILITIES, ...caps })
          return next
        })
      }
    } catch {
      // Non-critical; ignore capability fetch failures
    }
  }

  async function connectToDatabase(id: string, silent = false): Promise<void> {
    // When the password was not saved, prompt the user for credentials instead
    // of attempting a connect that would fail. Background (silent) connects skip
    // the prompt and just stay disconnected.
    if (!silent) {
      const conn = connections.find((c) => c.id === id)
      if (conn && needsPasswordPrompt(conn)) {
        setPasswordPromptProfile(null)
        setPasswordPromptError(null)
        setPasswordPromptConnection(conn)
        return
      }
    }
    if (!silent) setRuntimeState(id, { status: 'connecting' })
    try {
      const result = await window.api.database.connect(id)
      if (result.status === 'connected') {
        const conn = connections.find((c) => c.id === id)
        await applyConnectSuccess(id, conn?.username ?? '')
      } else {
        setRuntimeState(id, silent ? { status: 'disconnected' } : { status: 'error', errorMessage: result.message })
      }
    } catch {
      if (!silent) {
        setRuntimeState(id, { status: 'error', errorMessage: 'Connection failed' })
      }
    }
  }

  // Connect using credentials entered in the Enter Password dialog. Throws on
  // failure so the dialog can surface the error and stay open.
  async function connectWithCredentials(id: string, username: string, password: string): Promise<void> {
    setRuntimeState(id, { status: 'connecting' })
    const result = await window.api.database.connect(id, { username, password })
    if (result.status === 'connected') {
      await applyConnectSuccess(id, username)
      setPasswordPromptConnection(null)
      setPasswordPromptProfile(null)
      setPasswordPromptError(null)
      return
    }
    setRuntimeState(id, { status: 'error', errorMessage: result.message })
    throw new Error(result.message)
  }

  // Connect as an additional user profile ("Connect As…"). When the profile has a
  // saved password we connect directly with those credentials; if that fails we
  // reopen the Enter Password dialog seeded with the profile and the login error
  // so the user can retry. Profiles without a saved password prompt immediately.
  async function connectAsProfile(id: string, profile: ConnectionUserProfile): Promise<void> {
    const conn = connections.find((c) => c.id === id)
    if (profile.password) {
      try {
        await connectWithCredentials(id, profile.username, profile.password)
      } catch (err) {
        if (conn) {
          setPasswordPromptProfile(profile)
          setPasswordPromptError(err instanceof Error ? err.message : String(err))
          setPasswordPromptConnection(conn)
        }
      }
      return
    }
    if (conn) {
      setPasswordPromptProfile(profile)
      setPasswordPromptError(null)
      setPasswordPromptConnection(conn)
    }
  }

  function cancelPasswordPrompt(): void {
    setPasswordPromptConnection(null)
    setPasswordPromptProfile(null)
    setPasswordPromptError(null)
  }

  function clearConnectionState(connectionId: string): void {
    setExpandedConns((prev) => {
      const next = new Set(prev)
      next.delete(connectionId)
      return next
    })
    setExpandedNodes((prev) => {
      const next = new Set(prev)
      for (const key of next) {
        if (key.startsWith(`${connectionId}/`)) next.delete(key)
      }
      return next
    })
    setNodeStates((prev) => {
      const next = new Map(prev)
      for (const key of next.keys()) {
        if (key.startsWith(`${connectionId}/`)) next.delete(key)
      }
      return next
    })
  }

  async function disconnectConnection(connectionId: string): Promise<void> {
    try {
      await window.api.database.disconnect(connectionId)
    } catch {
      // ignore disconnect errors — local state is still reset
    }
    setRuntimeState(connectionId, { status: 'disconnected' })
    clearConnectionState(connectionId)
  }

  function toggleConn(id: string): void {
    const isExpanded = expandedConns.has(id)
    setExpandedConns((prev) => {
      const next = new Set(prev)
      if (isExpanded) next.delete(id)
      else next.add(id)
      return next
    })
    setSelectedKey(`conn:${id}`)
    if (!isExpanded) {
      setActiveConnectionId(id)
      const state = getRuntimeState(id)
      if (state.status === 'disconnected' || state.status === 'error') {
        void connectToDatabase(id)
      }
    }
  }

  function handleConnectAction(connectionId: string): void {
    if (!expandedConns.has(connectionId)) {
      setExpandedConns((prev) => {
        const next = new Set(prev)
        next.add(connectionId)
        return next
      })
    }
    void connectToDatabase(connectionId)
  }

  async function handleDisconnectAction(connectionId: string): Promise<void> {
    await disconnectConnection(connectionId)
  }

  async function handleEditAction(
    connectionId: string,
    t: (key: string) => string,
    requestConfirm: (title: string, message: string, confirmLabel?: string) => Promise<boolean>,
    setIsDialogOpen: (v: boolean) => void,
    setEditingConnection: (c: ConnectionRecord | null) => void
  ): Promise<void> {
    const conn = connections.find((c) => c.id === connectionId)
    if (!conn) return
    const state = getRuntimeState(connectionId)
    if (state.status === 'connected' || state.status === 'connecting') {
      const confirmed = await requestConfirm(
        t('explorer.contextMenu.confirmDisconnectForEditTitle'),
        t('explorer.contextMenu.confirmDisconnectForEdit'),
        t('explorer.contextMenu.confirmDisconnectForEditConfirm')
      )
      if (!confirmed) return
      await disconnectConnection(connectionId)
    }
    setEditingConnection(conn)
    setIsDialogOpen(true)
  }

  async function handleDeleteAction(
    connectionId: string,
    t: (key: string, opts?: object) => string,
    requestConfirm: (title: string, message: string) => Promise<boolean>
  ): Promise<void> {
    const conn = connections.find((c) => c.id === connectionId)
    if (!conn) return
    const state = getRuntimeState(connectionId)
    const isConnected = state.status === 'connected' || state.status === 'connecting'
    const message = isConnected
      ? t('explorer.contextMenu.confirmDeleteConnected', { name: conn.name })
      : t('explorer.contextMenu.confirmDelete', { name: conn.name })
    if (!await requestConfirm(t('explorer.contextMenu.deleteConnectionTitle'), message)) return
    if (isConnected) {
      await disconnectConnection(connectionId)
    }
    await window.api.connections.delete(connectionId)
    setConnections((prev) => prev.filter((c) => c.id !== connectionId))
    setRuntimeStates((prev) => {
      const next = new Map(prev)
      next.delete(connectionId)
      return next
    })
    clearConnectionState(connectionId)
  }

  return {
    connections,
    setConnections,
    runtimeStates,
    nodeStates,
    expandedConns,
    expandedNodes,
    eagerLoadStates,
    connectionsCapabilities,
    expandedErdFolders,
    setExpandedErdFolders,
    selectedKey,
    setSelectedKey,
    activeConnectionId,
    setActiveConnectionId,
    getRuntimeState,
    getConnectionCapabilities,
    getSelectedContext,
    toggleConn,
    toggleNode,
    loadNodeChildren,
    silentRefreshNodeChildren,
    connectToDatabase,
    connectWithCredentials,
    connectAsProfile,
    passwordPromptConnection,
    passwordPromptProfile,
    passwordPromptError,
    cancelPasswordPrompt,
    disconnectConnection,
    handleConnectAction,
    handleDisconnectAction,
    handleEditAction,
    handleDeleteAction,
    clearConnectionState
  }
}

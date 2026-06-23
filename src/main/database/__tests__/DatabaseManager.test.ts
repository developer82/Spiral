// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { DatabaseManager } from '../DatabaseManager'
import type { DatabaseProvider, ExplorerNode } from '../types'

// ── mock SqlServerProvider ────────────────────────────────────────────────────

const { mockProvider, mockSqlServerProvider } = vi.hoisted(() => {
  const mockProvider: DatabaseProvider = {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    listDatabases: vi.fn(),
    listCategories: vi.fn(),
    listTables: vi.fn(),
    listViews: vi.fn(),
    listStoredProcedures: vi.fn(),
    listFunctions: vi.fn(),
    listTypes: vi.fn(),
    listTypeCategories: vi.fn(),
    listTypeDataTypes: vi.fn(),
    listTypeTables: vi.fn(),
    listTypeMemoryOptimizedTables: vi.fn(),
    getDataTypes: vi.fn(),
    saveDataType: vi.fn(),
    deleteDataType: vi.fn(),
    getTableTypes: vi.fn(),
    getTableType: vi.fn(),
    saveTableType: vi.fn(),
    deleteTableType: vi.fn(),
    getMemoryOptimizedTableTypes: vi.fn(),
    getMemoryOptimizedTableType: vi.fn(),
    saveMemoryOptimizedTableType: vi.fn(),
    deleteMemoryOptimizedTableType: vi.fn(),
    deleteRedisKey: vi.fn(),
    deleteRedisPrefix: vi.fn(),
    getCheckConstraints: vi.fn(),
    getTriggers: vi.fn(),
    saveTrigger: vi.fn(),
    deleteTrigger: vi.fn(),
    getIndexes: vi.fn(),
    saveIndex: vi.fn(),
    deleteIndex: vi.fn(),
    rebuildIndex: vi.fn(),
    reorganizeIndex: vi.fn(),
    disableIndex: vi.fn(),
    getViews: vi.fn(),
    saveView: vi.fn(),
    deleteView: vi.fn(),
    getStoredProcedures: vi.fn(),
    saveStoredProcedure: vi.fn(),
    deleteStoredProcedure: vi.fn(),
    listTableCategories: vi.fn(),
    listColumns: vi.fn(),
    listKeys: vi.fn(),
    listConstraints: vi.fn(),
    listTriggers: vi.fn(),
    listIndexes: vi.fn(),
    listStatistics: vi.fn(),
    executeQuery: vi.fn(),
    getTableSchema: vi.fn(),
    getForeignKeys: vi.fn(),
    getErdSchema: vi.fn(),
    listServerSecurityCategories: vi.fn(),
    listServerUsers: vi.fn(),
    listServerRoles: vi.fn(),
    listServerSchemas: vi.fn(),
    listDatabaseSecurityCategories: vi.fn(),
    listDatabaseUsers: vi.fn(),
    listDatabaseRoles: vi.fn(),
    listDatabaseSchemas: vi.fn(),
    executeMonitoringQuery: vi.fn(),
    scriptTableCreate: vi.fn(),
    scriptTableAlter: vi.fn(),
    scriptTableDrop: vi.fn(),
    scriptViewCreate: vi.fn(),
    scriptViewAlter: vi.fn(),
    scriptViewDrop: vi.fn(),
    scriptStoredProcedureCreate: vi.fn(),
    scriptStoredProcedureAlter: vi.fn(),
    scriptStoredProcedureDrop: vi.fn(),
    scriptSelectTopRows: vi.fn(),
    scriptDropDatabase: vi.fn(),
    getCapabilities: vi.fn().mockReturnValue({
      executionPlan: { kind: 'none' },
      clientStatistics: { kind: 'none' },
      hasCreateDatabase: true,
      hasStoredProcedures: true,
      hasFunctions: true,
      hasUserDefinedTypes: false,
      hasTableTypes: false,
      hasMemoryOptimizedTableTypes: false,
      hasStatistics: false,
      hasIndexRebuild: false,
      hasIndexReorganize: false,
      hasIndexDisable: false,
      hasProfiler: false,
      hasCreateTable: true,
      hasBackupRestore: false
    })
  }

  const mockSqlServerProvider = vi.fn().mockImplementation(() => mockProvider)

  return { mockProvider, mockSqlServerProvider }
})

vi.mock('../providers/SqlServerProvider', () => ({
  SqlServerProvider: mockSqlServerProvider
}))

// ── helpers ───────────────────────────────────────────────────────────────────

const CONNECTION_RECORD = {
  id: 'conn-1',
  name: 'Test',
  provider: 'sqlserver' as const,
  host: 'localhost',
  port: 1433,
  username: 'sa',
  password: 'pw',
  rememberPassword: false,
  defaultDatabase: 'master'
}

const DB_NODES: ExplorerNode[] = [
  { id: 'db:TestDB', label: 'TestDB', kind: 'database' }
]

async function buildConnectedManager(): Promise<DatabaseManager> {
  const manager = new DatabaseManager()
  await manager.connect(CONNECTION_RECORD)
  return manager
}

// ── createDatabase cache invalidation ────────────────────────────────────────

describe('DatabaseManager.createDatabase', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(mockProvider.executeQuery).mockResolvedValue({ status: 'ok', messages: [], resultSets: [], durationMs: 0 })
    vi.mocked(mockProvider.listDatabases).mockResolvedValue(DB_NODES)
    vi.mocked(mockProvider.listCategories).mockReturnValue([])
    vi.mocked(mockProvider.listTables).mockResolvedValue([])
    vi.mocked(mockProvider.listViews).mockResolvedValue([])
    vi.mocked(mockProvider.listStoredProcedures).mockResolvedValue([])
    vi.mocked(mockProvider.listFunctions).mockResolvedValue([])
    vi.mocked(mockProvider.listTypes).mockResolvedValue([])
    vi.mocked(mockProvider.listTypeCategories).mockReturnValue([])
  })

  it('invalidates the databases cache so getChildren re-fetches after creation', async () => {
    const manager = await buildConnectedManager()

    // Seed the cache via eager load (simulates what happens after connecting)
    await manager.startEagerLoad('conn-1')
    expect(mockProvider.listDatabases).toHaveBeenCalledTimes(1)

    // getChildren should now serve from cache (no additional listDatabases call)
    await manager.getChildren('conn-1', 'databases')
    expect(mockProvider.listDatabases).toHaveBeenCalledTimes(1)

    // Create a new database
    const result = await manager.createDatabase('conn-1', 'NewDB')
    expect(result).toEqual({ status: 'ok' })

    // After creation, getChildren must re-fetch because cache was invalidated
    await manager.getChildren('conn-1', 'databases')
    expect(mockProvider.listDatabases).toHaveBeenCalledTimes(2)
  })

  it('does not invalidate the databases cache when creation fails', async () => {
    const manager = await buildConnectedManager()

    // Seed the cache via eager load
    await manager.startEagerLoad('conn-1')
    expect(mockProvider.listDatabases).toHaveBeenCalledTimes(1)

    // getChildren should serve from cache
    await manager.getChildren('conn-1', 'databases')
    expect(mockProvider.listDatabases).toHaveBeenCalledTimes(1)

    // Simulate a provider-level error
    vi.mocked(mockProvider.executeQuery).mockResolvedValue({
      status: 'error',
      message: 'Database already exists'
    })

    const result = await manager.createDatabase('conn-1', 'ExistingDB')
    expect(result).toEqual({ status: 'error', message: 'Database already exists', sql: 'CREATE DATABASE [ExistingDB]' })

    // Cache should NOT be invalidated on failure — still serves from cache
    await manager.getChildren('conn-1', 'databases')
    expect(mockProvider.listDatabases).toHaveBeenCalledTimes(1)
  })

  it('returns error for empty database name without touching the cache', async () => {
    const manager = await buildConnectedManager()

    const result = await manager.createDatabase('conn-1', '   ')
    expect(result).toEqual({ status: 'error', message: 'Database name cannot be empty' })
    expect(mockProvider.executeQuery).not.toHaveBeenCalled()
  })

  it('returns error for database name with invalid characters', async () => {
    const manager = await buildConnectedManager()

    const result = await manager.createDatabase('conn-1', 'bad[name]')
    expect(result).toEqual({ status: 'error', message: 'Invalid database name: "bad[name]"' })
    expect(mockProvider.executeQuery).not.toHaveBeenCalled()
  })

  it('returns error when not connected', async () => {
    const manager = new DatabaseManager()

    const result = await manager.createDatabase('conn-1', 'NewDB')
    expect(result).toEqual({ status: 'error', message: 'Not connected' })
  })

  it('returns error when provider does not support creating databases', async () => {
    vi.mocked(mockProvider.getCapabilities).mockReturnValueOnce({
      executionPlan: { kind: 'none' },
      clientStatistics: { kind: 'none' },
      hasCreateDatabase: false,
      hasStoredProcedures: false,
      hasFunctions: false,
      hasUserDefinedTypes: false,
      hasTableTypes: false,
      hasMemoryOptimizedTableTypes: false,
      hasStatistics: false,
      hasIndexRebuild: false,
      hasIndexReorganize: false,
      hasIndexDisable: false,
      hasProfiler: false,
      hasCreateTable: true,
      hasBackupRestore: false
    })
    const manager = await buildConnectedManager()

    const result = await manager.createDatabase('conn-1', 'NewDB')
    expect(result).toEqual({ status: 'error', message: 'This provider does not support creating databases.' })
    expect(mockProvider.executeQuery).not.toHaveBeenCalled()
  })
})

// ── deleteRedisKey ───────────────────────────────────────────────────────────

describe('DatabaseManager.deleteRedisKey', () => {
  it('delegates to provider and returns result', async () => {
    vi.mocked(mockProvider.deleteRedisKey!).mockResolvedValue({ status: 'ok', deletedCount: 1 })
    const manager = await buildConnectedManager()
    const result = await manager.deleteRedisKey('conn-1', '0', 'user:42')
    expect(mockProvider.deleteRedisKey).toHaveBeenCalledWith('0', 'user:42')
    expect(result).toEqual({ status: 'ok', deletedCount: 1 })
  })

  it('returns error when not connected', async () => {
    const manager = new DatabaseManager()
    const result = await manager.deleteRedisKey('conn-1', '0', 'user:42')
    expect(result).toEqual({ status: 'error', message: 'Not connected' })
  })

  it('returns error when provider does not support the method', async () => {
    const manager = await buildConnectedManager()
    const original = mockProvider.deleteRedisKey
    mockProvider.deleteRedisKey = undefined
    const result = await manager.deleteRedisKey('conn-1', '0', 'user:42')
    expect(result).toEqual({ status: 'error', message: 'Not supported for this connection type' })
    mockProvider.deleteRedisKey = original
  })
})

// ── deleteRedisPrefix ─────────────────────────────────────────────────────────

describe('DatabaseManager.deleteRedisPrefix', () => {
  it('delegates to provider and returns result', async () => {
    vi.mocked(mockProvider.deleteRedisPrefix!).mockResolvedValue({ status: 'ok', deletedCount: 5 })
    const manager = await buildConnectedManager()
    const result = await manager.deleteRedisPrefix('conn-1', '0', 'user')
    expect(mockProvider.deleteRedisPrefix).toHaveBeenCalledWith('0', 'user')
    expect(result).toEqual({ status: 'ok', deletedCount: 5 })
  })

  it('returns error when not connected', async () => {
    const manager = new DatabaseManager()
    const result = await manager.deleteRedisPrefix('conn-1', '0', 'user')
    expect(result).toEqual({ status: 'error', message: 'Not connected' })
  })

  it('returns error when provider does not support the method', async () => {
    const manager = await buildConnectedManager()
    const original = mockProvider.deleteRedisPrefix
    mockProvider.deleteRedisPrefix = undefined
    const result = await manager.deleteRedisPrefix('conn-1', '0', 'user')
    expect(result).toEqual({ status: 'error', message: 'Not supported for this connection type' })
    mockProvider.deleteRedisPrefix = original
  })
})

// ── Watch coordinator ─────────────────────────────────────────────────────────

const FOCUSED_INTERVAL_MS = 8_000
const UNFOCUSED_INTERVAL_MS = 30_000

function makeMockWebContents(): { send: ReturnType<typeof vi.fn>; isDestroyed: ReturnType<typeof vi.fn> } {
  return { send: vi.fn(), isDestroyed: vi.fn().mockReturnValue(false) }
}

describe('DatabaseManager watch coordinator', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.mocked(mockProvider.listDatabases).mockResolvedValue(DB_NODES)
    vi.mocked(mockProvider.listCategories).mockReturnValue([])
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts polling after syncWatchState with enabled=true', async () => {
    const manager = await buildConnectedManager()
    const wc = makeMockWebContents()

    manager.syncWatchState('conn-1', true, true, ['databases'], false, wc as any)
    await vi.advanceTimersByTimeAsync(FOCUSED_INTERVAL_MS + 100)

    expect(mockProvider.listDatabases).toHaveBeenCalled()
  })

  it('does not emit on the first observation (baseline)', async () => {
    const manager = await buildConnectedManager()
    const wc = makeMockWebContents()

    manager.syncWatchState('conn-1', true, true, ['databases'], false, wc as any)
    await vi.advanceTimersByTimeAsync(FOCUSED_INTERVAL_MS + 100)

    expect(wc.send).not.toHaveBeenCalled()
  })

  it('emits database:background-refresh when data changes after baseline', async () => {
    const manager = await buildConnectedManager()
    const wc = makeMockWebContents()

    manager.syncWatchState('conn-1', true, true, ['databases'], false, wc as any)

    // First cycle — baseline
    await vi.advanceTimersByTimeAsync(FOCUSED_INTERVAL_MS + 100)
    expect(wc.send).not.toHaveBeenCalled()

    // Modify data
    const newNodes: ExplorerNode[] = [
      { id: 'db:TestDB', label: 'TestDB', kind: 'database' },
      { id: 'db:NewDB', label: 'NewDB', kind: 'database' }
    ]
    vi.mocked(mockProvider.listDatabases).mockResolvedValue(newNodes)

    // Second cycle — should detect and emit the change
    await vi.advanceTimersByTimeAsync(FOCUSED_INTERVAL_MS + 100)

    expect(wc.send).toHaveBeenCalledWith('database:background-refresh', {
      connectionId: 'conn-1',
      updates: [{ nodeId: 'databases', children: newNodes }]
    })
  })

  it('does not emit when data is unchanged after baseline', async () => {
    const manager = await buildConnectedManager()
    const wc = makeMockWebContents()

    manager.syncWatchState('conn-1', true, true, ['databases'], false, wc as any)

    // Baseline
    await vi.advanceTimersByTimeAsync(FOCUSED_INTERVAL_MS + 100)
    // Second cycle with same data
    await vi.advanceTimersByTimeAsync(FOCUSED_INTERVAL_MS + 100)

    expect(wc.send).not.toHaveBeenCalled()
  })

  it('stops polling when syncWatchState is called with enabled=false', async () => {
    const manager = await buildConnectedManager()
    const wc = makeMockWebContents()

    manager.syncWatchState('conn-1', true, true, ['databases'], false, wc as any)
    await vi.advanceTimersByTimeAsync(FOCUSED_INTERVAL_MS + 100)

    manager.syncWatchState('conn-1', false, true, [], false, wc as any)

    vi.mocked(mockProvider.listDatabases).mockResolvedValue([
      ...DB_NODES,
      { id: 'db:NewDB', label: 'NewDB', kind: 'database' }
    ])
    await vi.advanceTimersByTimeAsync(FOCUSED_INTERVAL_MS + 100)

    expect(wc.send).not.toHaveBeenCalled()
  })

  it('stopWatch cleans up the session', async () => {
    const manager = await buildConnectedManager()
    const wc = makeMockWebContents()

    manager.syncWatchState('conn-1', true, true, ['databases'], false, wc as any)
    await vi.advanceTimersByTimeAsync(FOCUSED_INTERVAL_MS + 100)

    manager.stopWatch('conn-1')

    vi.mocked(mockProvider.listDatabases).mockResolvedValue([
      ...DB_NODES,
      { id: 'db:NewDB', label: 'NewDB', kind: 'database' }
    ])
    await vi.advanceTimersByTimeAsync(FOCUSED_INTERVAL_MS + 100)

    expect(wc.send).not.toHaveBeenCalled()
  })

  it('disconnect stops the watch session', async () => {
    const manager = await buildConnectedManager()
    const wc = makeMockWebContents()

    manager.syncWatchState('conn-1', true, true, ['databases'], false, wc as any)
    await vi.advanceTimersByTimeAsync(FOCUSED_INTERVAL_MS + 100)

    await manager.disconnect('conn-1')

    vi.mocked(mockProvider.listDatabases).mockResolvedValue([
      ...DB_NODES,
      { id: 'db:NewDB', label: 'NewDB', kind: 'database' }
    ])
    await vi.advanceTimersByTimeAsync(FOCUSED_INTERVAL_MS + 100)

    expect(wc.send).not.toHaveBeenCalled()
  })

  it('uses the unfocused interval after focus changes to false', async () => {
    const manager = await buildConnectedManager()
    const wc = makeMockWebContents()

    manager.syncWatchState('conn-1', true, true, ['databases'], false, wc as any)
    await vi.advanceTimersByTimeAsync(FOCUSED_INTERVAL_MS + 100)

    manager.syncWatchState('conn-1', true, false, ['databases'], false, wc as any)

    vi.mocked(mockProvider.listDatabases).mockResolvedValue([
      ...DB_NODES,
      { id: 'db:NewDB', label: 'NewDB', kind: 'database' }
    ])

    await vi.advanceTimersByTimeAsync(FOCUSED_INTERVAL_MS + 100)
    expect(wc.send).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(UNFOCUSED_INTERVAL_MS - FOCUSED_INTERVAL_MS)
    expect(wc.send).toHaveBeenCalled()
  })
})

// ── MongoDB resolveChildren routing ──────────────────────────────────────────

describe('DatabaseManager MongoDB routing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(mockProvider.connect).mockResolvedValue(undefined)
    vi.mocked(mockProvider.listTables).mockResolvedValue([
      { id: 'mongodb-collection:mydb:users', label: 'users', kind: 'mongodb-collection' }
    ])
    vi.mocked(mockProvider.getCapabilities).mockReturnValue({
      executionPlan: { kind: 'none' },
      clientStatistics: { kind: 'none' },
      hasCreateDatabase: true,
      hasStoredProcedures: false,
      hasFunctions: false,
      hasUserDefinedTypes: false,
      hasTableTypes: false,
      hasMemoryOptimizedTableTypes: false,
      hasStatistics: false,
      hasIndexRebuild: false,
      hasIndexReorganize: false,
      hasIndexDisable: false,
      hasProfiler: false,
      hasCreateTable: true,
      hasBackupRestore: false
    })
  })

  it('routes mongodb-collections:<dbName> nodeId to listTables', async () => {
    const manager = new DatabaseManager()
    await manager.connect({ ...CONNECTION_RECORD, provider: 'sqlserver' })
    const result = await manager.getChildren('conn-1', 'mongodb-collections:mydb')
    expect(mockProvider.listTables).toHaveBeenCalledWith('mydb')
    expect(result).toMatchObject({
      status: 'ok',
      children: [{ id: 'mongodb-collection:mydb:users', label: 'users', kind: 'mongodb-collection' }]
    })
  })
})

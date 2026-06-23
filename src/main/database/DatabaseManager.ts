import type { WebContents } from 'electron'
import type { ConnectionRecord } from '../store'
import { aggregationsStore } from '../store'
import type { MongoAggregationDefinition } from '../store'
import type { ConnectResult, GetChildrenResult, ExplorerNode, DatabaseProvider, ExecuteQueryResult, GetTableSchemaResult, GetErdSchemaResult, GetForeignKeysResult, GetCheckConstraintsResult, GetTriggersResult, SaveTriggerParams, SaveTriggerResult, DeleteTriggerResult, GetIndexesResult, SaveIndexParams, SaveIndexResult, DeleteIndexResult, RebuildIndexResult, ReorganizeIndexResult, DisableIndexResult, GetViewsResult, SaveViewParams, SaveViewResult, DeleteViewResult, GetStoredProceduresResult, SaveStoredProcedureParams, SaveStoredProcedureResult, DeleteStoredProcedureResult, GetDataTypesResult, SaveDataTypeParams, SaveDataTypeResult, DeleteDataTypeResult, GetTableTypesResult, GetTableTypeResult, SaveTableTypeParams, SaveTableTypeResult, DeleteTableTypeResult, GetMemoryOptimizedTableTypesResult, GetMemoryOptimizedTableTypeResult, SaveMemoryOptimizedTableTypeParams, SaveMemoryOptimizedTableTypeResult, DeleteMemoryOptimizedTableTypeResult, GenerateScriptResult, ProviderCapabilities, DeleteRedisKeyResult, RedisDashboardResult, RedisDashboardCommand, RedisDashboardCommandResult, GetMongoIndexesResult, SaveMongoIndexParams, SaveMongoIndexResult, DropMongoIndexResult, GetCollectionFieldsResult, GetMongoAggregationsResult, SaveMongoAggregationParams, SaveMongoAggregationResult, DeleteMongoAggregationResult, RunMongoAggregationResult, GetMongoAggregationSampleResult, GetMongoValidationResult, SaveMongoValidationResult, TestMongoValidationResult, GenerateMongoValidationRulesResult, GetRedisDbKeysResult, GetRedisKeyValueResult, SaveRedisKeyParams, SaveRedisKeyResult, ServerLoginDetails, ServerLoginRoleEntry, DatabaseMappingEntry, DatabaseRoleEntry, SaveServerLoginParams, SaveServerLoginResult, DeleteServerLoginResult, DatabaseUserDetails, DatabaseUserRoleEntry, SaveDatabaseUserParams, SaveDatabaseUserResult, DeleteDatabaseUserResult, MySqlUserDetails, MySqlGlobalPrivilegeEntry, MySqlDatabasePrivilegeEntry, SaveMySqlUserParams, SaveMySqlUserResult, DeleteMySqlUserResult, SaveMySqlDatabaseUserPrivilegesParams, SaveMySqlDatabaseUserPrivilegesResult, RedisAclUserDetails, SaveRedisAclUserParams, SaveRedisAclUserResult, DeleteRedisAclUserResult, MongoUserDetails, SaveMongoUserParams, SaveMongoUserResult, DeleteMongoUserResult, ServerRoleDetails, SaveServerRoleParams, SaveServerRoleResult, DeleteServerRoleResult, ListServerDrivesResult, ListServerDirResult, GetDatabaseFilesResult, BackupOptions, BuildBackupSqlResult, ExecuteBackupResult, ReadBackupHeaderResult, ReadBackupFileListResult, GetBackupSetsResult, RestoreOptions, BuildRestoreSqlResult, ExecuteRestoreResult, MySqlBackupOptions, MySqlRestoreOptions, MySqlBackupToolStatusResult, BuildMySqlBackupPreviewResult, ExecuteMySqlBackupResult, ExecuteMySqlRestoreResult, PostgresBackupOptions, PostgresRestoreOptions, PostgresBackupToolStatusResult, BuildPostgresBackupPreviewResult, ExecutePostgresBackupResult, ExecutePostgresRestoreResult, SqliteBackupOptions, SqliteRestoreOptions, ExecuteSqliteBackupResult, ExecuteSqliteRestoreResult, RedisBackupOptions, ExecuteRedisBackupResult, RedisRestoreOptions, ExecuteRedisRestoreResult, MongoBackupOptions, MongoRestoreOptions, MongoBackupToolStatusResult, BuildMongoBackupPreviewResult, ExecuteMongoBackupResult, ExecuteMongoRestoreResult } from './types'
import { SqlServerProvider } from './providers/SqlServerProvider'
import { PostgresProvider } from './providers/PostgresProvider'
import { MySqlProvider } from './providers/MySqlProvider'
import { SqliteProvider } from './providers/SqliteProvider'
import { RedisProvider } from './providers/RedisProvider'
import { MongoDbProvider } from './providers/MongoDbProvider'

type ProviderFactory = () => DatabaseProvider

// ── Background watch constants ────────────────────────────────────────────────
const FOCUSED_INTERVAL_MS = 8_000
const UNFOCUSED_INTERVAL_MS = 30_000
/** Maximum number of nodes polled per cycle per connection (round-robin). */
const MAX_NODES_PER_CYCLE = 10

interface WatchSessionState {
  webContents: WebContents
  watchedNodes: string[]
  roundRobinOffset: number
  snapshots: Map<string, string>
  polling: boolean
  intervalHandle: ReturnType<typeof setInterval> | null
  appFocused: boolean
  showSystemDatabases: boolean
}

const PROVIDER_FACTORIES: Record<string, ProviderFactory> = {
  sqlserver: () => new SqlServerProvider(),
  postgres: () => new PostgresProvider(),
  mysql: () => new MySqlProvider(),
  sqlite: () => new SqliteProvider(),
  redis: () => new RedisProvider(),
  mongodb: () => new MongoDbProvider()
}

/** Splits a "schema.tableName" identifier at the first dot. */
function splitTableIdentifier(tableIdentifier: string): { schemaName: string; tableName: string } {
  const dotIdx = tableIdentifier.indexOf('.')
  return {
    schemaName: tableIdentifier.slice(0, dotIdx),
    tableName: tableIdentifier.slice(dotIdx + 1)
  }
}

export class DatabaseManager {
  private readonly sessions = new Map<string, DatabaseProvider>()
  private readonly eagerCache = new Map<string, ExplorerNode[]>()
  private readonly watchSessions = new Map<string, WatchSessionState>()

  async connect(record: ConnectionRecord): Promise<ConnectResult> {
    const existing = this.sessions.get(record.id)
    if (existing) {
      return { status: 'connected' }
    }

    const factory = PROVIDER_FACTORIES[record.provider]
    if (!factory) {
      return { status: 'error', message: `No provider registered for: ${record.provider}` }
    }

    const provider = factory()
    try {
      await provider.connect(record)
      this.sessions.set(record.id, provider)
      return { status: 'connected' }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { status: 'error', message }
    }
  }

  async getChildren(
    connectionId: string,
    nodeId: string,
    options: { showSystemDatabases: boolean } = { showSystemDatabases: false }
  ): Promise<GetChildrenResult> {
    const provider = this.sessions.get(connectionId)
    if (!provider) {
      return { status: 'error', message: 'Not connected' }
    }
    const cacheKey = `${connectionId}/${nodeId}`
    const cached = this.eagerCache.get(cacheKey)
    if (cached) {
      return { status: 'ok', children: cached }
    }
    try {
      const children = await this.resolveChildren(connectionId, provider, nodeId, options)
      return { status: 'ok', children }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { status: 'error', message }
    }
  }

  invalidateCacheEntry(connectionId: string, nodeId: string): void {
    const cacheKey = `${connectionId}/${nodeId}`
    this.eagerCache.delete(cacheKey)
    // Drop the watch snapshot so the next poll cycle re-baselines silently
    // instead of emitting a stale-snapshot change after a manual refresh.
    this.watchSessions.get(connectionId)?.snapshots.delete(nodeId)
  }

  async startEagerLoad(connectionId: string, showSystemDatabases = false): Promise<void> {
    const provider = this.sessions.get(connectionId)
    if (!provider) return

    const dbsKey = `${connectionId}/databases`
    let databases: ExplorerNode[]
    try {
      databases = await provider.listDatabases(showSystemDatabases)
      this.eagerCache.set(dbsKey, databases)
    } catch {
      return
    }

    await Promise.allSettled(
      databases.map(async (db) => {
        const dbName = db.label
        const categoriesKey = `${connectionId}/db:${dbName}`
        const categories = provider.listCategories(dbName)
        this.eagerCache.set(categoriesKey, categories)

        await Promise.allSettled([
          provider.listTables(dbName).then((v) => this.eagerCache.set(`${connectionId}/db:${dbName}:tables`, v)),
          provider.listViews(dbName).then((v) => this.eagerCache.set(`${connectionId}/db:${dbName}:views`, v)),
          provider.listStoredProcedures(dbName).then((v) => this.eagerCache.set(`${connectionId}/db:${dbName}:stored-procedures`, v)),
          provider.listFunctions(dbName).then((v) => this.eagerCache.set(`${connectionId}/db:${dbName}:functions`, v)),
          Promise.resolve(provider.listTypeCategories(dbName)).then((v) => this.eagerCache.set(`${connectionId}/db:${dbName}:types`, v))
        ])
      })
    )
  }

  private async resolveChildren(
    connectionId: string,
    provider: DatabaseProvider,
    nodeId: string,
    options: { showSystemDatabases: boolean }
  ): Promise<ExplorerNode[]> {
    if (nodeId === 'databases') {
      return provider.listDatabases(options.showSystemDatabases)
    }

    // ── Redis-specific node patterns ─────────────────────────────────────────
    const redisDbMatch = nodeId.match(/^redis-db:(\d+)$/)
    if (redisDbMatch && provider.listRedisKeyPrefixes) {
      return provider.listRedisKeyPrefixes(redisDbMatch[1])
    }

    const redisPrefixMatch = nodeId.match(/^redis-prefix:(\d+):(.+)$/)
    if (redisPrefixMatch && provider.listRedisKeysForPrefix) {
      return provider.listRedisKeysForPrefix(redisPrefixMatch[1], redisPrefixMatch[2])
    }
    // ─────────────────────────────────────────────────────────────────────────
    // ── MongoDB-specific node patterns ────────────────────────────────────
    const mongoDbMatch = nodeId.match(/^mongodb-db:(.+)$/)
    if (mongoDbMatch) {
      return provider.listTables(mongoDbMatch[1])
    }
    const mongoCollMatch = nodeId.match(/^mongodb-collection:([^:]+):(.+)$/)
    if (mongoCollMatch && provider.listCollectionChildren) {
      return provider.listCollectionChildren(mongoCollMatch[1], mongoCollMatch[2])
    }
    const mongoIndexesFolderMatch = nodeId.match(/^mongodb-collection-indexes:([^:]+):(.+)$/)
    if (mongoIndexesFolderMatch && provider instanceof MongoDbProvider) {
      return provider.listMongoIndexes(mongoIndexesFolderMatch[1], mongoIndexesFolderMatch[2])
    }
    const mongoAggsFolderMatch = nodeId.match(/^mongodb-collection-aggregations:([^:]+):(.+)$/)
    if (mongoAggsFolderMatch) {
      const [, databaseName, collectionName] = mongoAggsFolderMatch
      const stored = aggregationsStore.get('aggregations').filter(
        (a) => a.connectionId === connectionId && a.databaseName === databaseName && a.collectionName === collectionName
      )
      return stored.map((agg) => ({
        id: `mongodb-aggregation:${databaseName}:${collectionName}:${agg.id}`,
        label: agg.name,
        kind: 'mongodb-aggregation' as const
      }))
    }
    // ──────────────────────────────────────────────────────────────────────────
    const dbOnlyMatch = nodeId.match(/^db:([^:]+)$/)
    if (dbOnlyMatch) {
      return provider.listCategories(dbOnlyMatch[1])
    }

    const tablesMatch = nodeId.match(/^db:([^:]+):tables$/)
    if (tablesMatch) return provider.listTables(tablesMatch[1])

    const viewsMatch = nodeId.match(/^db:([^:]+):views$/)
    if (viewsMatch) return provider.listViews(viewsMatch[1])

    const spMatch = nodeId.match(/^db:([^:]+):stored-procedures$/)
    if (spMatch) return provider.listStoredProcedures(spMatch[1])

    const fnMatch = nodeId.match(/^db:([^:]+):functions$/)
    if (fnMatch) return provider.listFunctions(fnMatch[1])

    const typesMatch = nodeId.match(/^db:([^:]+):types$/)
    if (typesMatch) return provider.listTypeCategories(typesMatch[1])

    const typeDataTypesMatch = nodeId.match(/^db:([^:]+):types:data-types$/)
    if (typeDataTypesMatch) return provider.listTypeDataTypes(typeDataTypesMatch[1])

    const typeTablesMatch = nodeId.match(/^db:([^:]+):types:tables$/)
    if (typeTablesMatch) return provider.listTypeTables(typeTablesMatch[1])

    const typeMemOptMatch = nodeId.match(/^db:([^:]+):types:memory-optimized-tables$/)
    if (typeMemOptMatch) return provider.listTypeMemoryOptimizedTables(typeMemOptMatch[1])

    const typeEnumsMatch = nodeId.match(/^db:([^:]+):types:enums$/)
    if (typeEnumsMatch) return provider.listTypeDataTypes(typeEnumsMatch[1])

    const typeCompositesMatch = nodeId.match(/^db:([^:]+):types:composites$/)
    if (typeCompositesMatch) return provider.listTypeTables(typeCompositesMatch[1])

    if (nodeId === 'security') return provider.listServerSecurityCategories()
    if (nodeId === 'security:users') return provider.listServerUsers()
    if (nodeId === 'security:roles') return provider.listServerRoles()
    if (nodeId === 'security:schemas') return provider.listServerSchemas()

    const dbSecurityMatch = nodeId.match(/^db:([^:]+):security$/)
    if (dbSecurityMatch) return provider.listDatabaseSecurityCategories(dbSecurityMatch[1])

    const dbSecurityUsersMatch = nodeId.match(/^db:([^:]+):security:users$/)
    if (dbSecurityUsersMatch) return provider.listDatabaseUsers(dbSecurityUsersMatch[1])

    const dbSecurityRolesMatch = nodeId.match(/^db:([^:]+):security:roles$/)
    if (dbSecurityRolesMatch) return provider.listDatabaseRoles(dbSecurityRolesMatch[1])

    const dbSecuritySchemasMatch = nodeId.match(/^db:([^:]+):security:schemas$/)
    if (dbSecuritySchemasMatch) return provider.listDatabaseSchemas(dbSecuritySchemasMatch[1])

    const tableNodeMatch = nodeId.match(/^db:([^:]+):tables:([^:]+)$/)
    if (tableNodeMatch) {
      return provider.listTableCategories(tableNodeMatch[1], tableNodeMatch[2])
    }

    const tableSubMatch = nodeId.match(/^db:([^:]+):tables:([^:]+):(columns|keys|constraints|triggers|indexes|statistics)$/)
    if (tableSubMatch) {
      const [, dbName, tableIdentifier, subKind] = tableSubMatch
      const { schemaName, tableName } = splitTableIdentifier(tableIdentifier)
      switch (subKind) {
        case 'columns': return provider.listColumns(dbName, schemaName, tableName)
        case 'keys': return provider.listKeys(dbName, schemaName, tableName)
        case 'constraints': return provider.listConstraints(dbName, schemaName, tableName)
        case 'triggers': return provider.listTriggers(dbName, schemaName, tableName)
        case 'indexes': return provider.listIndexes(dbName, schemaName, tableName)
        case 'statistics': return provider.listStatistics(dbName, schemaName, tableName)
      }
    }

    return []
  }

  clearConnectionCache(connectionId: string): void {
    for (const key of this.eagerCache.keys()) {
      if (key.startsWith(`${connectionId}/`)) {
        this.eagerCache.delete(key)
      }
    }
  }

  // ── Background watch API ────────────────────────────────────────────────────

  syncWatchState(
    connectionId: string,
    enabled: boolean,
    appFocused: boolean,
    watchedNodes: string[],
    showSystemDatabases: boolean,
    webContents: WebContents
  ): void {
    const existing = this.watchSessions.get(connectionId)

    if (!enabled || watchedNodes.length === 0) {
      if (existing) {
        this.stopWatchInterval(existing)
        this.watchSessions.delete(connectionId)
      }
      return
    }

    if (existing) {
      const focusChanged = existing.appFocused !== appFocused
      existing.appFocused = appFocused
      existing.webContents = webContents
      existing.showSystemDatabases = showSystemDatabases
      // Prune snapshots for nodes that are no longer watched
      const newSet = new Set(watchedNodes)
      for (const nodeId of existing.snapshots.keys()) {
        if (!newSet.has(nodeId)) existing.snapshots.delete(nodeId)
      }
      existing.watchedNodes = watchedNodes
      if (focusChanged) {
        this.stopWatchInterval(existing)
        this.startWatchInterval(connectionId, existing)
      }
    } else {
      const session: WatchSessionState = {
        webContents,
        watchedNodes,
        roundRobinOffset: 0,
        snapshots: new Map(),
        polling: false,
        intervalHandle: null,
        appFocused,
        showSystemDatabases
      }
      this.watchSessions.set(connectionId, session)
      this.startWatchInterval(connectionId, session)
    }
  }

  stopWatch(connectionId: string): void {
    const session = this.watchSessions.get(connectionId)
    if (session) {
      this.stopWatchInterval(session)
      this.watchSessions.delete(connectionId)
    }
  }

  private startWatchInterval(connectionId: string, session: WatchSessionState): void {
    const intervalMs = session.appFocused ? FOCUSED_INTERVAL_MS : UNFOCUSED_INTERVAL_MS
    session.intervalHandle = setInterval(
      () => void this.pollWatchCycle(connectionId, session),
      intervalMs
    )
  }

  private stopWatchInterval(session: WatchSessionState): void {
    if (session.intervalHandle !== null) {
      clearInterval(session.intervalHandle)
      session.intervalHandle = null
    }
  }

  private async pollWatchCycle(connectionId: string, session: WatchSessionState): Promise<void> {
    if (session.polling) return

    const provider = this.sessions.get(connectionId)
    if (!provider) return

    if (session.webContents.isDestroyed()) {
      this.stopWatchInterval(session)
      this.watchSessions.delete(connectionId)
      return
    }

    session.polling = true
    const updates: Array<{ nodeId: string; children: ExplorerNode[] }> = []

    try {
      const allNodes = session.watchedNodes
      if (allNodes.length === 0) return

      const offset = session.roundRobinOffset % allNodes.length
      const batch = allNodes.slice(offset, offset + MAX_NODES_PER_CYCLE)
      session.roundRobinOffset = (offset + batch.length) % allNodes.length

      await Promise.allSettled(
        batch.map(async (nodeId) => {
          try {
            const freshChildren = await this.resolveChildren(connectionId, provider, nodeId, {
              showSystemDatabases: session.showSystemDatabases
            })
            const signature = freshChildren.map((c) => `${c.kind}|${c.id}|${c.label}`).join('\x00')
            const existing = session.snapshots.get(nodeId)

            if (existing === undefined) {
              // First observation — baseline silently, no refresh event
              session.snapshots.set(nodeId, signature)
            } else if (existing !== signature) {
              // Changed — update cache and queue an update
              this.eagerCache.set(`${connectionId}/${nodeId}`, freshChildren)
              session.snapshots.set(nodeId, signature)
              updates.push({ nodeId, children: freshChildren })
            }
          } catch {
            // Ignore transient per-node errors
          }
        })
      )
    } finally {
      session.polling = false
    }

    if (updates.length > 0 && !session.webContents.isDestroyed()) {
      session.webContents.send('database:background-refresh', { connectionId, updates })
    }
  }

  async disconnect(connectionId: string): Promise<void> {
    this.stopWatch(connectionId)
    const provider = this.sessions.get(connectionId)
    if (!provider) return
    await provider.disconnect()
    this.sessions.delete(connectionId)
    this.clearConnectionCache(connectionId)
  }

  async createDatabase(
    connectionId: string,
    databaseName: string
  ): Promise<{ status: 'ok' } | { status: 'error'; message: string; sql?: string }> {
    if (!databaseName.trim()) {
      return { status: 'error', message: 'Database name cannot be empty' }
    }
    if (/[[\]'"`]/.test(databaseName)) {
      return { status: 'error', message: `Invalid database name: "${databaseName}"` }
    }
    const provider = this.sessions.get(connectionId)
    if (!provider) {
      return { status: 'error', message: 'Not connected' }
    }
    let createSql = ''
    try {
      if (!provider.getCapabilities().hasCreateDatabase) {
        return { status: 'error', message: 'This provider does not support creating databases.' }
      } else if (provider instanceof MongoDbProvider) {
        return await provider.createDatabase(databaseName)
      } else if (provider instanceof MySqlProvider) {
        createSql = `CREATE DATABASE \`${databaseName}\``
      } else if (provider instanceof PostgresProvider) {
        createSql = `CREATE DATABASE "${databaseName}"`
      } else {
        createSql = `CREATE DATABASE [${databaseName}]`
      }
      const result = await provider.executeQuery(createSql)
      if (result.status === 'error') {
        return { status: 'error', message: result.message, sql: createSql }
      }
      this.eagerCache.delete(`${connectionId}/databases`)
      return { status: 'ok' }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { status: 'error', message, sql: createSql }
    }
  }

  // ─── Backup & Restore (SQL Server) ──────────────────────────────────────────

  private getSqlServerSession(
    connectionId: string
  ): SqlServerProvider | { status: 'error'; message: string } {
    const provider = this.sessions.get(connectionId)
    if (!provider) {
      return { status: 'error', message: 'Not connected' }
    }
    if (!(provider instanceof SqlServerProvider) || !provider.getCapabilities().hasBackupRestore) {
      return { status: 'error', message: 'Backup and restore are only supported for SQL Server connections.' }
    }
    return provider
  }

  async listServerDrives(connectionId: string): Promise<ListServerDrivesResult> {
    const provider = this.getSqlServerSession(connectionId)
    if (!(provider instanceof SqlServerProvider)) return provider
    return provider.listServerDrives()
  }

  async listServerDir(connectionId: string, path: string): Promise<ListServerDirResult> {
    const provider = this.getSqlServerSession(connectionId)
    if (!(provider instanceof SqlServerProvider)) return provider
    return provider.listServerDir(path)
  }

  async getDatabaseFiles(connectionId: string, databaseName: string): Promise<GetDatabaseFilesResult> {
    const provider = this.getSqlServerSession(connectionId)
    if (!(provider instanceof SqlServerProvider)) return provider
    return provider.getDatabaseFiles(databaseName)
  }

  async buildBackupSql(connectionId: string, opts: BackupOptions): Promise<BuildBackupSqlResult> {
    const provider = this.getSqlServerSession(connectionId)
    if (!(provider instanceof SqlServerProvider)) return provider
    return provider.buildBackupSql(opts)
  }

  async executeBackup(connectionId: string, opts: BackupOptions): Promise<ExecuteBackupResult> {
    const provider = this.getSqlServerSession(connectionId)
    if (!(provider instanceof SqlServerProvider)) return provider
    return provider.executeBackup(opts)
  }

  async readBackupHeader(connectionId: string, path: string): Promise<ReadBackupHeaderResult> {
    const provider = this.getSqlServerSession(connectionId)
    if (!(provider instanceof SqlServerProvider)) return provider
    return provider.readBackupHeader(path)
  }

  async readBackupFileList(
    connectionId: string,
    path: string,
    position: number
  ): Promise<ReadBackupFileListResult> {
    const provider = this.getSqlServerSession(connectionId)
    if (!(provider instanceof SqlServerProvider)) return provider
    return provider.readBackupFileList(path, position)
  }

  async getBackupSets(connectionId: string, databaseName: string): Promise<GetBackupSetsResult> {
    const provider = this.getSqlServerSession(connectionId)
    if (!(provider instanceof SqlServerProvider)) return provider
    return provider.getBackupSets(databaseName)
  }

  async buildRestoreSql(connectionId: string, opts: RestoreOptions): Promise<BuildRestoreSqlResult> {
    const provider = this.getSqlServerSession(connectionId)
    if (!(provider instanceof SqlServerProvider)) return provider
    return provider.buildRestoreSql(opts)
  }

  async executeRestore(connectionId: string, opts: RestoreOptions): Promise<ExecuteRestoreResult> {
    const provider = this.getSqlServerSession(connectionId)
    if (!(provider instanceof SqlServerProvider)) return provider
    const result = await provider.executeRestore(opts)
    if (result.status === 'ok') {
      this.eagerCache.delete(`${connectionId}/databases`)
    }
    return result
  }

  // ─── Backup & Restore (MySQL) ───────────────────────────────────────────────

  private getMySqlSession(
    connectionId: string
  ): MySqlProvider | { status: 'error'; message: string } {
    const provider = this.sessions.get(connectionId)
    if (!provider) {
      return { status: 'error', message: 'Not connected' }
    }
    if (!(provider instanceof MySqlProvider)) {
      return { status: 'error', message: 'This operation is only supported for MySQL connections.' }
    }
    return provider
  }

  async mysqlGetBackupTools(
    connectionId: string,
    paths?: { mysqlDumpPath?: string; mysqlClientPath?: string }
  ): Promise<MySqlBackupToolStatusResult> {
    const provider = this.getMySqlSession(connectionId)
    if (!(provider instanceof MySqlProvider)) return provider
    return provider.getBackupToolStatus(paths)
  }

  mysqlBuildBackupPreview(
    connectionId: string,
    opts: MySqlBackupOptions
  ): BuildMySqlBackupPreviewResult {
    const provider = this.getMySqlSession(connectionId)
    if (!(provider instanceof MySqlProvider)) return provider
    return provider.buildBackupCommandPreview(opts)
  }

  async mysqlExecuteBackup(
    connectionId: string,
    opts: MySqlBackupOptions
  ): Promise<ExecuteMySqlBackupResult> {
    const provider = this.getMySqlSession(connectionId)
    if (!(provider instanceof MySqlProvider)) return provider
    return provider.executeBackup(opts)
  }

  async mysqlExecuteRestore(
    connectionId: string,
    opts: MySqlRestoreOptions
  ): Promise<ExecuteMySqlRestoreResult> {
    const provider = this.getMySqlSession(connectionId)
    if (!(provider instanceof MySqlProvider)) return provider
    const result = await provider.executeRestore(opts)
    if (result.status === 'ok') {
      this.eagerCache.delete(`${connectionId}/databases`)
    }
    return result
  }

  // ─── Backup & Restore (MongoDB) ─────────────────────────────────────────────

  private getMongoSession(
    connectionId: string
  ): MongoDbProvider | { status: 'error'; message: string } {
    const provider = this.sessions.get(connectionId)
    if (!provider) {
      return { status: 'error', message: 'Not connected' }
    }
    if (!(provider instanceof MongoDbProvider)) {
      return { status: 'error', message: 'This operation is only supported for MongoDB connections.' }
    }
    return provider
  }

  async mongoGetBackupTools(
    connectionId: string,
    paths?: { mongodumpPath?: string; mongorestorePath?: string }
  ): Promise<MongoBackupToolStatusResult> {
    const provider = this.getMongoSession(connectionId)
    if (!(provider instanceof MongoDbProvider)) return provider
    return provider.getBackupToolStatus(paths)
  }

  mongoBuildBackupPreview(
    connectionId: string,
    opts: MongoBackupOptions
  ): BuildMongoBackupPreviewResult {
    const provider = this.getMongoSession(connectionId)
    if (!(provider instanceof MongoDbProvider)) return provider
    return provider.buildBackupCommandPreview(opts)
  }

  async mongoExecuteBackup(
    connectionId: string,
    opts: MongoBackupOptions
  ): Promise<ExecuteMongoBackupResult> {
    const provider = this.getMongoSession(connectionId)
    if (!(provider instanceof MongoDbProvider)) return provider
    return provider.executeBackup(opts)
  }

  async mongoExecuteRestore(
    connectionId: string,
    opts: MongoRestoreOptions
  ): Promise<ExecuteMongoRestoreResult> {
    const provider = this.getMongoSession(connectionId)
    if (!(provider instanceof MongoDbProvider)) return provider
    const result = await provider.executeRestore(opts)
    if (result.status === 'ok') {
      this.eagerCache.delete(`${connectionId}/databases`)
    }
    return result
  }

  // ─── Backup & Restore (PostgreSQL) ──────────────────────────────────────────

  private getPostgresSession(
    connectionId: string
  ): PostgresProvider | { status: 'error'; message: string } {
    const provider = this.sessions.get(connectionId)
    if (!provider) {
      return { status: 'error', message: 'Not connected' }
    }
    if (!(provider instanceof PostgresProvider)) {
      return {
        status: 'error',
        message: 'This operation is only supported for PostgreSQL connections.'
      }
    }
    return provider
  }

  async postgresGetBackupTools(
    connectionId: string,
    paths?: { pgDumpPath?: string; pgRestorePath?: string; psqlPath?: string }
  ): Promise<PostgresBackupToolStatusResult> {
    const provider = this.getPostgresSession(connectionId)
    if (!(provider instanceof PostgresProvider)) return provider
    return provider.getBackupToolStatus(paths)
  }

  postgresBuildBackupPreview(
    connectionId: string,
    opts: PostgresBackupOptions
  ): BuildPostgresBackupPreviewResult {
    const provider = this.getPostgresSession(connectionId)
    if (!(provider instanceof PostgresProvider)) return provider
    return provider.buildBackupCommandPreview(opts)
  }

  async postgresExecuteBackup(
    connectionId: string,
    opts: PostgresBackupOptions
  ): Promise<ExecutePostgresBackupResult> {
    const provider = this.getPostgresSession(connectionId)
    if (!(provider instanceof PostgresProvider)) return provider
    return provider.executeBackup(opts)
  }

  async postgresExecuteRestore(
    connectionId: string,
    opts: PostgresRestoreOptions
  ): Promise<ExecutePostgresRestoreResult> {
    const provider = this.getPostgresSession(connectionId)
    if (!(provider instanceof PostgresProvider)) return provider
    const result = await provider.executeRestore(opts)
    if (result.status === 'ok') {
      this.eagerCache.delete(`${connectionId}/databases`)
    }
    return result
  }

  // ─── Backup & Restore (SQLite) ──────────────────────────────────────────────

  private getSqliteSession(
    connectionId: string
  ): SqliteProvider | { status: 'error'; message: string } {
    const provider = this.sessions.get(connectionId)
    if (!provider) {
      return { status: 'error', message: 'Not connected' }
    }
    if (!(provider instanceof SqliteProvider)) {
      return {
        status: 'error',
        message: 'This operation is only supported for SQLite connections.'
      }
    }
    return provider
  }

  async sqliteExecuteBackup(
    connectionId: string,
    opts: SqliteBackupOptions
  ): Promise<ExecuteSqliteBackupResult> {
    const provider = this.getSqliteSession(connectionId)
    if (!(provider instanceof SqliteProvider)) return provider
    return provider.executeBackup(opts)
  }

  async sqliteExecuteRestore(
    connectionId: string,
    opts: SqliteRestoreOptions
  ): Promise<ExecuteSqliteRestoreResult> {
    const provider = this.getSqliteSession(connectionId)
    if (!(provider instanceof SqliteProvider)) return provider
    const result = await provider.executeRestore(opts)
    if (result.status === 'ok') {
      this.eagerCache.delete(`${connectionId}/databases`)
    }
    return result
  }

  async createCollection(
    connectionId: string,
    databaseName: string,
    collectionName: string
  ): Promise<{ status: 'ok' } | { status: 'error'; message: string }> {
    if (!collectionName.trim()) {
      return { status: 'error', message: 'Collection name cannot be empty' }
    }
    const provider = this.sessions.get(connectionId)
    if (!provider) {
      return { status: 'error', message: 'Not connected' }
    }
    if (!(provider instanceof MongoDbProvider)) {
      return { status: 'error', message: 'This provider does not support creating collections.' }
    }
    return provider.createCollection(databaseName, collectionName.trim())
  }

  async renameCollection(
    connectionId: string,
    databaseName: string,
    oldName: string,
    newName: string
  ): Promise<{ status: 'ok' } | { status: 'error'; message: string }> {
    if (!newName.trim()) {
      return { status: 'error', message: 'Collection name cannot be empty' }
    }
    const provider = this.sessions.get(connectionId)
    if (!provider) {
      return { status: 'error', message: 'Not connected' }
    }
    if (!(provider instanceof MongoDbProvider)) {
      return { status: 'error', message: 'This provider does not support renaming collections.' }
    }
    return provider.renameCollection(databaseName, oldName, newName.trim())
  }

  async dropCollection(
    connectionId: string,
    databaseName: string,
    collectionName: string
  ): Promise<{ status: 'ok' } | { status: 'error'; message: string }> {
    const provider = this.sessions.get(connectionId)
    if (!provider) {
      return { status: 'error', message: 'Not connected' }
    }
    if (!(provider instanceof MongoDbProvider)) {
      return { status: 'error', message: 'This provider does not support dropping collections.' }
    }
    return provider.dropCollection(databaseName, collectionName)
  }

  async insertMongoDocument(
    connectionId: string,
    databaseName: string,
    collectionName: string,
    ejsonDocString: string
  ): Promise<{ status: 'ok'; insertedId: string } | { status: 'error'; message: string }> {
    const provider = this.sessions.get(connectionId)
    if (!provider) {
      return { status: 'error', message: 'Not connected' }
    }
    if (!(provider instanceof MongoDbProvider)) {
      return { status: 'error', message: 'This operation is only supported for MongoDB connections.' }
    }
    return provider.insertMongoDocument(databaseName, collectionName, ejsonDocString)
  }

  async replaceMongoDocument(
    connectionId: string,
    databaseName: string,
    collectionName: string,
    ejsonDocString: string
  ): Promise<{ status: 'ok' } | { status: 'error'; message: string }> {
    const provider = this.sessions.get(connectionId)
    if (!provider) {
      return { status: 'error', message: 'Not connected' }
    }
    if (!(provider instanceof MongoDbProvider)) {
      return { status: 'error', message: 'This operation is only supported for MongoDB connections.' }
    }
    return provider.replaceMongoDocument(databaseName, collectionName, ejsonDocString)
  }

  async deleteMongoDocument(
    connectionId: string,
    databaseName: string,
    collectionName: string,
    ejsonDocString: string
  ): Promise<{ status: 'ok' } | { status: 'error'; message: string }> {
    const provider = this.sessions.get(connectionId)
    if (!provider) {
      return { status: 'error', message: 'Not connected' }
    }
    if (!(provider instanceof MongoDbProvider)) {
      return { status: 'error', message: 'This operation is only supported for MongoDB connections.' }
    }
    return provider.deleteMongoDocument(databaseName, collectionName, ejsonDocString)
  }

  async getTableSchema(
    connectionId: string,
    databaseName: string,
    schemaName: string,
    tableName: string
  ): Promise<GetTableSchemaResult> {
    const provider = this.sessions.get(connectionId)
    if (!provider) {
      return { status: 'error', message: 'Not connected' }
    }
    return provider.getTableSchema(databaseName, schemaName, tableName)
  }

  async getForeignKeys(
    connectionId: string,
    databaseName: string,
    schemaName: string,
    tableName: string
  ): Promise<GetForeignKeysResult> {
    const provider = this.sessions.get(connectionId)
    if (!provider) {
      return { status: 'error', message: 'Not connected' }
    }
    return provider.getForeignKeys(databaseName, schemaName, tableName)
  }

  async getCheckConstraints(
    connectionId: string,
    databaseName: string,
    schemaName: string,
    tableName: string
  ): Promise<GetCheckConstraintsResult> {
    const provider = this.sessions.get(connectionId)
    if (!provider) {
      return { status: 'error', message: 'Not connected' }
    }
    return provider.getCheckConstraints(databaseName, schemaName, tableName)
  }

  async getTriggers(
    connectionId: string,
    databaseName: string,
    schemaName: string,
    tableName: string
  ): Promise<GetTriggersResult> {
    const provider = this.sessions.get(connectionId)
    if (!provider) {
      return { status: 'error', message: 'Not connected' }
    }
    return provider.getTriggers(databaseName, schemaName, tableName)
  }

  async saveTrigger(
    connectionId: string,
    databaseName: string,
    params: SaveTriggerParams,
    originalTriggerName?: string
  ): Promise<SaveTriggerResult> {
    const provider = this.sessions.get(connectionId)
    if (!provider) {
      return { status: 'error', message: 'Not connected' }
    }
    return provider.saveTrigger(databaseName, params, originalTriggerName)
  }

  async deleteTrigger(
    connectionId: string,
    databaseName: string,
    triggerName: string,
    schemaName: string
  ): Promise<DeleteTriggerResult> {
    const provider = this.sessions.get(connectionId)
    if (!provider) {
      return { status: 'error', message: 'Not connected' }
    }
    return provider.deleteTrigger(databaseName, triggerName, schemaName)
  }

  async getIndexes(
    connectionId: string,
    databaseName: string,
    schemaName: string,
    tableName: string
  ): Promise<GetIndexesResult> {
    const provider = this.sessions.get(connectionId)
    if (!provider) {
      return { status: 'error', message: 'Not connected' }
    }
    return provider.getIndexes(databaseName, schemaName, tableName)
  }

  async saveIndex(
    connectionId: string,
    databaseName: string,
    params: SaveIndexParams,
    originalIndexName?: string
  ): Promise<SaveIndexResult> {
    const provider = this.sessions.get(connectionId)
    if (!provider) {
      return { status: 'error', message: 'Not connected' }
    }
    return provider.saveIndex(databaseName, params, originalIndexName)
  }

  async deleteIndex(
    connectionId: string,
    databaseName: string,
    indexName: string,
    schemaName: string,
    tableName: string
  ): Promise<DeleteIndexResult> {
    const provider = this.sessions.get(connectionId)
    if (!provider) {
      return { status: 'error', message: 'Not connected' }
    }
    return provider.deleteIndex(databaseName, indexName, schemaName, tableName)
  }

  async rebuildIndex(
    connectionId: string,
    databaseName: string,
    indexName: string,
    schemaName: string,
    tableName: string
  ): Promise<RebuildIndexResult> {
    const provider = this.sessions.get(connectionId)
    if (!provider) {
      return { status: 'error', message: 'Not connected' }
    }
    return provider.rebuildIndex(databaseName, indexName, schemaName, tableName)
  }

  async reorganizeIndex(
    connectionId: string,
    databaseName: string,
    indexName: string,
    schemaName: string,
    tableName: string
  ): Promise<ReorganizeIndexResult> {
    const provider = this.sessions.get(connectionId)
    if (!provider) {
      return { status: 'error', message: 'Not connected' }
    }
    return provider.reorganizeIndex(databaseName, indexName, schemaName, tableName)
  }

  async disableIndex(
    connectionId: string,
    databaseName: string,
    indexName: string,
    schemaName: string,
    tableName: string
  ): Promise<DisableIndexResult> {
    const provider = this.sessions.get(connectionId)
    if (!provider) {
      return { status: 'error', message: 'Not connected' }
    }
    return provider.disableIndex(databaseName, indexName, schemaName, tableName)
  }

  async getErdSchema(connectionId: string, databaseName: string): Promise<GetErdSchemaResult> {
    const provider = this.sessions.get(connectionId)
    if (!provider) {
      return { status: 'error', message: 'Not connected' }
    }
    return provider.getErdSchema(databaseName)
  }

  async getViews(connectionId: string, databaseName: string): Promise<GetViewsResult> {
    const provider = this.sessions.get(connectionId)
    if (!provider) {
      return { status: 'error', message: 'Not connected' }
    }
    return provider.getViews(databaseName)
  }

  async saveView(
    connectionId: string,
    databaseName: string,
    params: SaveViewParams,
    originalViewName?: string
  ): Promise<SaveViewResult> {
    const provider = this.sessions.get(connectionId)
    if (!provider) {
      return { status: 'error', message: 'Not connected' }
    }
    return provider.saveView(databaseName, params, originalViewName)
  }

  async deleteView(
    connectionId: string,
    databaseName: string,
    schemaName: string,
    viewName: string
  ): Promise<DeleteViewResult> {
    const provider = this.sessions.get(connectionId)
    if (!provider) {
      return { status: 'error', message: 'Not connected' }
    }
    return provider.deleteView(databaseName, schemaName, viewName)
  }

  async getStoredProcedures(connectionId: string, databaseName: string): Promise<GetStoredProceduresResult> {
    const provider = this.sessions.get(connectionId)
    if (!provider) {
      return { status: 'error', message: 'Not connected' }
    }
    return provider.getStoredProcedures(databaseName)
  }

  async saveStoredProcedure(
    connectionId: string,
    databaseName: string,
    params: SaveStoredProcedureParams,
    originalProcedureName?: string
  ): Promise<SaveStoredProcedureResult> {
    const provider = this.sessions.get(connectionId)
    if (!provider) {
      return { status: 'error', message: 'Not connected' }
    }
    return provider.saveStoredProcedure(databaseName, params, originalProcedureName)
  }

  async deleteStoredProcedure(
    connectionId: string,
    databaseName: string,
    schemaName: string,
    procedureName: string
  ): Promise<DeleteStoredProcedureResult> {
    const provider = this.sessions.get(connectionId)
    if (!provider) {
      return { status: 'error', message: 'Not connected' }
    }
    return provider.deleteStoredProcedure(databaseName, schemaName, procedureName)
  }

  async getDataTypes(connectionId: string, databaseName: string): Promise<GetDataTypesResult> {
    const provider = this.sessions.get(connectionId)
    if (!provider) return { status: 'error', message: 'Not connected' }
    return provider.getDataTypes(databaseName)
  }

  async saveDataType(
    connectionId: string,
    databaseName: string,
    params: SaveDataTypeParams,
    originalTypeName?: string,
    originalSchemaName?: string
  ): Promise<SaveDataTypeResult> {
    const provider = this.sessions.get(connectionId)
    if (!provider) return { status: 'error', message: 'Not connected' }
    return provider.saveDataType(databaseName, params, originalTypeName, originalSchemaName)
  }

  async deleteDataType(
    connectionId: string,
    databaseName: string,
    schemaName: string,
    typeName: string
  ): Promise<DeleteDataTypeResult> {
    const provider = this.sessions.get(connectionId)
    if (!provider) return { status: 'error', message: 'Not connected' }
    return provider.deleteDataType(databaseName, schemaName, typeName)
  }

  async getTableTypes(connectionId: string, databaseName: string): Promise<GetTableTypesResult> {
    const provider = this.sessions.get(connectionId)
    if (!provider) return { status: 'error', message: 'Not connected' }
    return provider.getTableTypes(databaseName)
  }

  async getTableType(
    connectionId: string,
    databaseName: string,
    schemaName: string,
    typeName: string
  ): Promise<GetTableTypeResult> {
    const provider = this.sessions.get(connectionId)
    if (!provider) return { status: 'error', message: 'Not connected' }
    return provider.getTableType(databaseName, schemaName, typeName)
  }

  async saveTableType(
    connectionId: string,
    databaseName: string,
    params: SaveTableTypeParams,
    originalTypeName?: string,
    originalSchemaName?: string
  ): Promise<SaveTableTypeResult> {
    const provider = this.sessions.get(connectionId)
    if (!provider) return { status: 'error', message: 'Not connected' }
    return provider.saveTableType(databaseName, params, originalTypeName, originalSchemaName)
  }

  async deleteTableType(
    connectionId: string,
    databaseName: string,
    schemaName: string,
    typeName: string
  ): Promise<DeleteTableTypeResult> {
    const provider = this.sessions.get(connectionId)
    if (!provider) return { status: 'error', message: 'Not connected' }
    return provider.deleteTableType(databaseName, schemaName, typeName)
  }

  async getMemoryOptimizedTableTypes(connectionId: string, databaseName: string): Promise<GetMemoryOptimizedTableTypesResult> {
    const provider = this.sessions.get(connectionId)
    if (!provider) return { status: 'error', message: 'Not connected' }
    return provider.getMemoryOptimizedTableTypes(databaseName)
  }

  async getMemoryOptimizedTableType(
    connectionId: string,
    databaseName: string,
    schemaName: string,
    typeName: string
  ): Promise<GetMemoryOptimizedTableTypeResult> {
    const provider = this.sessions.get(connectionId)
    if (!provider) return { status: 'error', message: 'Not connected' }
    return provider.getMemoryOptimizedTableType(databaseName, schemaName, typeName)
  }

  async saveMemoryOptimizedTableType(
    connectionId: string,
    databaseName: string,
    params: SaveMemoryOptimizedTableTypeParams,
    originalTypeName?: string,
    originalSchemaName?: string
  ): Promise<SaveMemoryOptimizedTableTypeResult> {
    const provider = this.sessions.get(connectionId)
    if (!provider) return { status: 'error', message: 'Not connected' }
    return provider.saveMemoryOptimizedTableType(databaseName, params, originalTypeName, originalSchemaName)
  }

  async deleteMemoryOptimizedTableType(
    connectionId: string,
    databaseName: string,
    schemaName: string,
    typeName: string
  ): Promise<DeleteMemoryOptimizedTableTypeResult> {
    const provider = this.sessions.get(connectionId)
    if (!provider) return { status: 'error', message: 'Not connected' }
    return provider.deleteMemoryOptimizedTableType(databaseName, schemaName, typeName)
  }

  async deleteRedisKey(
    connectionId: string,
    databaseIndex: string,
    keyName: string
  ): Promise<DeleteRedisKeyResult> {
    const provider = this.sessions.get(connectionId)
    if (!provider) return { status: 'error', message: 'Not connected' }
    if (!provider.deleteRedisKey) return { status: 'error', message: 'Not supported for this connection type' }
    return provider.deleteRedisKey(databaseIndex, keyName)
  }

  async deleteRedisPrefix(
    connectionId: string,
    databaseIndex: string,
    prefix: string
  ): Promise<DeleteRedisKeyResult> {
    const provider = this.sessions.get(connectionId)
    if (!provider) return { status: 'error', message: 'Not connected' }
    if (!provider.deleteRedisPrefix) return { status: 'error', message: 'Not supported for this connection type' }
    return provider.deleteRedisPrefix(databaseIndex, prefix)
  }

  async getRedisDbKeys(connectionId: string, databaseIndex: string): Promise<GetRedisDbKeysResult> {
    const provider = this.sessions.get(connectionId)
    if (!provider) return { status: 'error', message: 'Not connected' }
    if (!provider.getRedisDbKeys) return { status: 'error', message: 'Not supported for this connection type' }
    return provider.getRedisDbKeys(databaseIndex)
  }

  async getRedisKeyValue(connectionId: string, databaseIndex: string, keyName: string): Promise<GetRedisKeyValueResult> {
    const provider = this.sessions.get(connectionId)
    if (!provider) return { status: 'error', message: 'Not connected' }
    if (!provider.getRedisKeyValue) return { status: 'error', message: 'Not supported for this connection type' }
    return provider.getRedisKeyValue(databaseIndex, keyName)
  }

  async saveRedisKey(connectionId: string, databaseIndex: string, params: SaveRedisKeyParams): Promise<SaveRedisKeyResult> {
    const provider = this.sessions.get(connectionId)
    if (!provider) return { status: 'error', message: 'Not connected' }
    if (!provider.saveRedisKey) return { status: 'error', message: 'Not supported for this connection type' }
    return provider.saveRedisKey(databaseIndex, params)
  }

  async redisBackup(
    connectionId: string,
    opts: RedisBackupOptions
  ): Promise<ExecuteRedisBackupResult> {
    const provider = this.sessions.get(connectionId)
    if (!provider) return { status: 'error', message: 'Not connected' }
    if (!provider.backupDatabases)
      return { status: 'error', message: 'Not supported for this connection type' }
    return provider.backupDatabases(opts)
  }

  async redisRestore(
    connectionId: string,
    opts: RedisRestoreOptions
  ): Promise<ExecuteRedisRestoreResult> {
    const provider = this.sessions.get(connectionId)
    if (!provider) return { status: 'error', message: 'Not connected' }
    if (!provider.restoreDatabases)
      return { status: 'error', message: 'Not supported for this connection type' }
    const result = await provider.restoreDatabases(opts)
    if (result.status === 'ok') {
      // Drop cached keyspace listings so the tree re-scans restored keys
      for (const key of this.eagerCache.keys()) {
        if (key.startsWith(`${connectionId}/redis-`)) this.eagerCache.delete(key)
      }
    }
    return result
  }

  async getRedisDashboard(connectionId: string): Promise<RedisDashboardResult> {
    const provider = this.sessions.get(connectionId)
    if (!provider) return { status: 'error', message: 'Not connected' }
    if (!provider.getRedisDashboard) return { status: 'error', message: 'Not supported for this connection type' }
    return provider.getRedisDashboard()
  }

  async executeRedisDashboardCommand(
    connectionId: string,
    command: RedisDashboardCommand,
    databaseIndex?: number
  ): Promise<RedisDashboardCommandResult> {
    const provider = this.sessions.get(connectionId)
    if (!provider) return { status: 'error', message: 'Not connected' }
    if (!provider.executeRedisDashboardCommand) return { status: 'error', message: 'Not supported for this connection type' }
    return provider.executeRedisDashboardCommand(command, databaseIndex)
  }

  async executeQuery(connectionId: string, querySql: string, timeoutMs?: number, withPlan?: boolean, withStatistics?: boolean, databaseName?: string): Promise<ExecuteQueryResult> {
    const provider = this.sessions.get(connectionId)
    if (!provider) {
      return { status: 'error', message: 'Not connected' }
    }
    return provider.executeQuery(querySql, timeoutMs, withPlan, withStatistics, databaseName)
  }

  async executeMongoShellCommand(
    connectionId: string,
    command: string,
    currentDb: string
  ): Promise<{ status: 'ok' | 'error'; output: string }> {
    const provider = this.sessions.get(connectionId)
    if (!provider) return { status: 'error', output: 'Not connected' }
    if (!(provider instanceof MongoDbProvider)) {
      return { status: 'error', output: 'Not a MongoDB connection' }
    }
    return provider.executeMongoShellCommand(command, currentDb)
  }

  async executeRedisShellCommand(
    connectionId: string,
    command: string,
    databaseIndex: number
  ): Promise<{ status: 'ok' | 'error'; output: string }> {
    const provider = this.sessions.get(connectionId)
    if (!provider) return { status: 'error', output: 'Not connected' }
    if (!(provider instanceof RedisProvider)) {
      return { status: 'error', output: 'Not a Redis connection' }
    }
    return provider.executeRedisShellCommand(command, databaseIndex)
  }

  async getMongoIndexes(
    connectionId: string,
    databaseName: string,
    collectionName: string
  ): Promise<GetMongoIndexesResult> {
    const provider = this.sessions.get(connectionId)
    if (!provider) return { status: 'error', message: 'Not connected' }
    if (!(provider instanceof MongoDbProvider)) return { status: 'error', message: 'Not a MongoDB connection' }
    return provider.getMongoIndexes(databaseName, collectionName)
  }

  async saveMongoIndex(
    connectionId: string,
    databaseName: string,
    collectionName: string,
    params: SaveMongoIndexParams,
    originalName?: string
  ): Promise<SaveMongoIndexResult> {
    const provider = this.sessions.get(connectionId)
    if (!provider) return { status: 'error', message: 'Not connected' }
    if (!(provider instanceof MongoDbProvider)) return { status: 'error', message: 'Not a MongoDB connection' }
    return provider.saveMongoIndex(databaseName, collectionName, params, originalName)
  }

  async dropMongoIndex(
    connectionId: string,
    databaseName: string,
    collectionName: string,
    indexName: string
  ): Promise<DropMongoIndexResult> {
    const provider = this.sessions.get(connectionId)
    if (!provider) return { status: 'error', message: 'Not connected' }
    if (!(provider instanceof MongoDbProvider)) return { status: 'error', message: 'Not a MongoDB connection' }
    return provider.dropMongoIndex(databaseName, collectionName, indexName)
  }

  async getCollectionFields(
    connectionId: string,
    databaseName: string,
    collectionName: string
  ): Promise<GetCollectionFieldsResult> {
    const provider = this.sessions.get(connectionId)
    if (!provider) return { status: 'error', message: 'Not connected' }
    if (!(provider instanceof MongoDbProvider)) return { status: 'error', message: 'Not a MongoDB connection' }
    return provider.getCollectionFields(databaseName, collectionName)
  }

  async getMongoAggregations(
    connectionId: string,
    databaseName: string,
    collectionName: string
  ): Promise<GetMongoAggregationsResult> {
    const aggregations = aggregationsStore.get('aggregations').filter(
      (a) => a.connectionId === connectionId && a.databaseName === databaseName && a.collectionName === collectionName
    )
    return { status: 'ok', aggregations }
  }

  async saveMongoAggregation(
    connectionId: string,
    databaseName: string,
    collectionName: string,
    params: SaveMongoAggregationParams,
    originalId?: string
  ): Promise<SaveMongoAggregationResult> {
    const all = aggregationsStore.get('aggregations')
    const now = new Date().toISOString()
    if (originalId) {
      const idx = all.findIndex((a) => a.id === originalId)
      if (idx === -1) return { status: 'error', message: 'Aggregation not found' }
      const updated: MongoAggregationDefinition = { ...all[idx], name: params.name, stages: params.stages, updatedAt: now }
      all[idx] = updated
      aggregationsStore.set('aggregations', all)
      return { status: 'ok', id: originalId }
    }
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const newAgg: MongoAggregationDefinition = {
      id,
      connectionId,
      databaseName,
      collectionName,
      name: params.name,
      stages: params.stages,
      createdAt: now,
      updatedAt: now
    }
    aggregationsStore.set('aggregations', [...all, newAgg])
    return { status: 'ok', id }
  }

  async deleteMongoAggregation(
    connectionId: string,
    databaseName: string,
    collectionName: string,
    aggregationId: string
  ): Promise<DeleteMongoAggregationResult> {
    const all = aggregationsStore.get('aggregations')
    const filtered = all.filter(
      (a) => !(a.id === aggregationId && a.connectionId === connectionId && a.databaseName === databaseName && a.collectionName === collectionName)
    )
    aggregationsStore.set('aggregations', filtered)
    return { status: 'ok' }
  }

  async runMongoAggregation(
    connectionId: string,
    databaseName: string,
    collectionName: string,
    pipeline: unknown[]
  ): Promise<RunMongoAggregationResult> {
    const provider = this.sessions.get(connectionId)
    if (!provider) return { status: 'error', message: 'Not connected' }
    if (!(provider instanceof MongoDbProvider)) return { status: 'error', message: 'Not a MongoDB connection' }
    return provider.runMongoAggregation(databaseName, collectionName, pipeline)
  }

  async getMongoAggregationSample(
    connectionId: string,
    databaseName: string,
    collectionName: string,
    limit?: number
  ): Promise<GetMongoAggregationSampleResult> {
    const provider = this.sessions.get(connectionId)
    if (!provider) return { status: 'error', message: 'Not connected' }
    if (!(provider instanceof MongoDbProvider)) return { status: 'error', message: 'Not a MongoDB connection' }
    return provider.sampleDocuments(databaseName, collectionName, limit)
  }

  async getMongoValidation(
    connectionId: string,
    databaseName: string,
    collectionName: string
  ): Promise<GetMongoValidationResult> {
    const provider = this.sessions.get(connectionId)
    if (!provider) return { status: 'error', message: 'Not connected' }
    if (!(provider instanceof MongoDbProvider)) return { status: 'error', message: 'Not a MongoDB connection' }
    return provider.getMongoValidation(databaseName, collectionName)
  }

  async saveMongoValidation(
    connectionId: string,
    databaseName: string,
    collectionName: string,
    validator: Record<string, unknown>,
    validationAction: string,
    validationLevel: string
  ): Promise<SaveMongoValidationResult> {
    const provider = this.sessions.get(connectionId)
    if (!provider) return { status: 'error', message: 'Not connected' }
    if (!(provider instanceof MongoDbProvider)) return { status: 'error', message: 'Not a MongoDB connection' }
    return provider.saveMongoValidation(databaseName, collectionName, validator, validationAction, validationLevel)
  }

  async testMongoValidation(
    connectionId: string,
    databaseName: string,
    collectionName: string,
    validator: Record<string, unknown>
  ): Promise<TestMongoValidationResult> {
    const provider = this.sessions.get(connectionId)
    if (!provider) return { status: 'error', message: 'Not connected' }
    if (!(provider instanceof MongoDbProvider)) return { status: 'error', message: 'Not a MongoDB connection' }
    return provider.testMongoValidation(databaseName, collectionName, validator)
  }

  async generateMongoValidationRules(
    connectionId: string,
    databaseName: string,
    collectionName: string
  ): Promise<GenerateMongoValidationRulesResult> {
    const provider = this.sessions.get(connectionId)
    if (!provider) return { status: 'error', message: 'Not connected' }
    if (!(provider instanceof MongoDbProvider)) return { status: 'error', message: 'Not a MongoDB connection' }
    return provider.generateMongoValidationRules(databaseName, collectionName)
  }

  async testConnection(record: Omit<ConnectionRecord, 'id'>): Promise<ConnectResult> {
    const factory = PROVIDER_FACTORIES[record.provider]
    if (!factory) {
      return { status: 'error', message: `No provider registered for: ${record.provider}` }
    }

    const provider = factory()
    try {
      await provider.connect({ ...record, id: '__test__' })
      await provider.disconnect()
      return { status: 'connected' }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { status: 'error', message }
    }
  }

  async closeAll(): Promise<void> {
    await Promise.all([...this.sessions.values()].map((p) => p.disconnect()))
    this.sessions.clear()
  }

  async executeMonitoringQuery<T>(connectionId: string, querySql: string): Promise<T[]> {
    const provider = this.sessions.get(connectionId)
    if (!provider) return []
    return provider.executeMonitoringQuery<T>(querySql)
  }

  async scriptTableCreate(connectionId: string, databaseName: string, schemaName: string, tableName: string): Promise<GenerateScriptResult> {
    const provider = this.sessions.get(connectionId)
    if (!provider) return { status: 'error', message: 'Not connected' }
    return provider.scriptTableCreate(databaseName, schemaName, tableName)
  }

  async scriptTableAlter(connectionId: string, databaseName: string, schemaName: string, tableName: string): Promise<GenerateScriptResult> {
    const provider = this.sessions.get(connectionId)
    if (!provider) return { status: 'error', message: 'Not connected' }
    return provider.scriptTableAlter(databaseName, schemaName, tableName)
  }

  async scriptTableDrop(connectionId: string, databaseName: string, schemaName: string, tableName: string): Promise<GenerateScriptResult> {
    const provider = this.sessions.get(connectionId)
    if (!provider) return { status: 'error', message: 'Not connected' }
    return provider.scriptTableDrop(databaseName, schemaName, tableName)
  }

  async scriptViewCreate(connectionId: string, databaseName: string, schemaName: string, viewName: string): Promise<GenerateScriptResult> {
    const provider = this.sessions.get(connectionId)
    if (!provider) return { status: 'error', message: 'Not connected' }
    return provider.scriptViewCreate(databaseName, schemaName, viewName)
  }

  async scriptViewAlter(connectionId: string, databaseName: string, schemaName: string, viewName: string): Promise<GenerateScriptResult> {
    const provider = this.sessions.get(connectionId)
    if (!provider) return { status: 'error', message: 'Not connected' }
    return provider.scriptViewAlter(databaseName, schemaName, viewName)
  }

  async scriptViewDrop(connectionId: string, databaseName: string, schemaName: string, viewName: string): Promise<GenerateScriptResult> {
    const provider = this.sessions.get(connectionId)
    if (!provider) return { status: 'error', message: 'Not connected' }
    return provider.scriptViewDrop(databaseName, schemaName, viewName)
  }

  async scriptStoredProcedureCreate(connectionId: string, databaseName: string, schemaName: string, procedureName: string): Promise<GenerateScriptResult> {
    const provider = this.sessions.get(connectionId)
    if (!provider) return { status: 'error', message: 'Not connected' }
    return provider.scriptStoredProcedureCreate(databaseName, schemaName, procedureName)
  }

  async scriptStoredProcedureAlter(connectionId: string, databaseName: string, schemaName: string, procedureName: string): Promise<GenerateScriptResult> {
    const provider = this.sessions.get(connectionId)
    if (!provider) return { status: 'error', message: 'Not connected' }
    return provider.scriptStoredProcedureAlter(databaseName, schemaName, procedureName)
  }

  async scriptStoredProcedureDrop(connectionId: string, databaseName: string, schemaName: string, procedureName: string): Promise<GenerateScriptResult> {
    const provider = this.sessions.get(connectionId)
    if (!provider) return { status: 'error', message: 'Not connected' }
    return provider.scriptStoredProcedureDrop(databaseName, schemaName, procedureName)
  }

  async scriptSelectTopRows(connectionId: string, databaseName: string, schemaName: string, tableName: string, count: number): Promise<GenerateScriptResult> {
    const provider = this.sessions.get(connectionId)
    if (!provider) return { status: 'error', message: 'Not connected' }
    return provider.scriptSelectTopRows(databaseName, schemaName, tableName, count)
  }

  async scriptDropDatabase(connectionId: string, databaseName: string): Promise<GenerateScriptResult> {
    const provider = this.sessions.get(connectionId)
    if (!provider) return { status: 'error', message: 'Not connected' }
    return provider.scriptDropDatabase(databaseName)
  }

  getCapabilities(connectionId: string): ProviderCapabilities | null {
    const provider = this.sessions.get(connectionId)
    if (!provider) return null
    return provider.getCapabilities()
  }

  // ── Server Login Management (SQL Server only) ─────────────────────────────

  async getServerLoginDetails(connectionId: string, loginName: string): Promise<ServerLoginDetails | null> {
    const provider = this.sessions.get(connectionId)
    if (!(provider instanceof SqlServerProvider)) return null
    return provider.getServerLoginDetails(loginName)
  }

  async listServerDatabases(connectionId: string): Promise<string[]> {
    const provider = this.sessions.get(connectionId)
    if (!(provider instanceof SqlServerProvider)) return []
    return provider.listServerDatabases()
  }

  async listServerLanguages(connectionId: string): Promise<string[]> {
    const provider = this.sessions.get(connectionId)
    if (!(provider instanceof SqlServerProvider)) return []
    return provider.listServerLanguages()
  }

  async getServerLoginRoles(connectionId: string, loginName: string): Promise<ServerLoginRoleEntry[]> {
    const provider = this.sessions.get(connectionId)
    if (!(provider instanceof SqlServerProvider)) return []
    return provider.getServerLoginRoles(loginName)
  }

  async getServerLoginDatabaseMappings(connectionId: string, loginName: string): Promise<DatabaseMappingEntry[]> {
    const provider = this.sessions.get(connectionId)
    if (!(provider instanceof SqlServerProvider)) return []
    return provider.getServerLoginDatabaseMappings(loginName)
  }

  async getDatabaseRolesForLogin(connectionId: string, databaseName: string, loginName: string): Promise<DatabaseRoleEntry[]> {
    const provider = this.sessions.get(connectionId)
    if (!(provider instanceof SqlServerProvider)) return []
    return provider.getDatabaseRolesForLogin(databaseName, loginName)
  }

  async saveServerLogin(connectionId: string, params: SaveServerLoginParams): Promise<SaveServerLoginResult> {
    const provider = this.sessions.get(connectionId)
    if (!(provider instanceof SqlServerProvider)) return { status: 'error', message: 'Not connected' }
    return provider.saveServerLogin(params)
  }

  async deleteServerLogin(connectionId: string, loginName: string): Promise<DeleteServerLoginResult> {
    const provider = this.sessions.get(connectionId)
    if (!(provider instanceof SqlServerProvider)) return { status: 'error', message: 'Not connected' }
    return provider.deleteServerLogin(loginName)
  }

  async getServerRoleDetails(connectionId: string, roleName: string): Promise<ServerRoleDetails | null> {
    const provider = this.sessions.get(connectionId)
    if (!(provider instanceof SqlServerProvider)) return null
    return provider.getServerRoleDetails(roleName)
  }

  async saveServerRole(connectionId: string, params: SaveServerRoleParams): Promise<SaveServerRoleResult> {
    const provider = this.sessions.get(connectionId)
    if (!(provider instanceof SqlServerProvider)) return { status: 'error', message: 'Not connected' }
    return provider.saveServerRole(params)
  }

  async deleteServerRole(connectionId: string, roleName: string): Promise<DeleteServerRoleResult> {
    const provider = this.sessions.get(connectionId)
    if (!(provider instanceof SqlServerProvider)) return { status: 'error', message: 'Not connected' }
    return provider.deleteServerRole(roleName)
  }

  async getDatabaseUserDetails(connectionId: string, databaseName: string, userName: string): Promise<DatabaseUserDetails | null> {
    const provider = this.sessions.get(connectionId)
    if (!(provider instanceof SqlServerProvider)) return null
    return provider.getDatabaseUserDetails(databaseName, userName)
  }

  async getDatabaseUserRoles(connectionId: string, databaseName: string, userName: string): Promise<DatabaseUserRoleEntry[]> {
    const provider = this.sessions.get(connectionId)
    if (!(provider instanceof SqlServerProvider)) return []
    return provider.getDatabaseUserRoles(databaseName, userName)
  }

  async saveDatabaseUser(connectionId: string, params: SaveDatabaseUserParams): Promise<SaveDatabaseUserResult> {
    const provider = this.sessions.get(connectionId)
    if (!(provider instanceof SqlServerProvider)) return { status: 'error', message: 'Not connected' }
    return provider.saveDatabaseUser(params)
  }

  async deleteDatabaseUser(connectionId: string, databaseName: string, userName: string): Promise<DeleteDatabaseUserResult> {
    const provider = this.sessions.get(connectionId)
    if (!(provider instanceof SqlServerProvider)) return { status: 'error', message: 'Not connected' }
    return provider.deleteDatabaseUser(databaseName, userName)
  }

  // ── MySQL User Management ─────────────────────────────────────────────────

  async getMySqlUserDetails(connectionId: string, username: string, host: string): Promise<MySqlUserDetails | null> {
    const provider = this.sessions.get(connectionId)
    if (!(provider instanceof MySqlProvider)) return null
    return provider.getMySqlUserDetails(username, host)
  }

  async getMySqlUserGlobalPrivileges(connectionId: string, username: string, host: string): Promise<MySqlGlobalPrivilegeEntry[]> {
    const provider = this.sessions.get(connectionId)
    if (!(provider instanceof MySqlProvider)) return []
    return provider.getMySqlUserGlobalPrivileges(username, host)
  }

  async getMySqlUserDatabasePrivileges(connectionId: string, username: string, host: string): Promise<MySqlDatabasePrivilegeEntry[]> {
    const provider = this.sessions.get(connectionId)
    if (!(provider instanceof MySqlProvider)) return []
    return provider.getMySqlUserDatabasePrivileges(username, host)
  }

  async getMySqlDatabaseList(connectionId: string): Promise<string[]> {
    const provider = this.sessions.get(connectionId)
    if (!(provider instanceof MySqlProvider)) return []
    return provider.getMySqlDatabaseList()
  }

  async getMySqlDatabaseUsers(connectionId: string, databaseName: string): Promise<{ username: string; host: string }[]> {
    const provider = this.sessions.get(connectionId)
    if (!(provider instanceof MySqlProvider)) return []
    return provider.getMySqlDatabaseUsers(databaseName)
  }

  async saveMySqlUser(connectionId: string, params: SaveMySqlUserParams): Promise<SaveMySqlUserResult> {
    const provider = this.sessions.get(connectionId)
    if (!(provider instanceof MySqlProvider)) return { status: 'error', message: 'Not connected' }
    return provider.saveMySqlUser(params)
  }

  async deleteMySqlUser(connectionId: string, username: string, host: string): Promise<DeleteMySqlUserResult> {
    const provider = this.sessions.get(connectionId)
    if (!(provider instanceof MySqlProvider)) return { status: 'error', message: 'Not connected' }
    return provider.deleteMySqlUser(username, host)
  }

  async saveMySqlDatabaseUserPrivileges(connectionId: string, params: SaveMySqlDatabaseUserPrivilegesParams): Promise<SaveMySqlDatabaseUserPrivilegesResult> {
    const provider = this.sessions.get(connectionId)
    if (!(provider instanceof MySqlProvider)) return { status: 'error', message: 'Not connected' }
    return provider.saveMySqlDatabaseUserPrivileges(params)
  }

  // ── Redis ACL User Management ─────────────────────────────────────────────

  async getRedisAclUserDetails(connectionId: string, username: string): Promise<RedisAclUserDetails | null> {
    const provider = this.sessions.get(connectionId)
    if (!(provider instanceof RedisProvider)) return null
    return provider.getRedisAclUserDetails(username)
  }

  async saveRedisAclUser(connectionId: string, params: SaveRedisAclUserParams): Promise<SaveRedisAclUserResult> {
    const provider = this.sessions.get(connectionId)
    if (!(provider instanceof RedisProvider)) return { status: 'error', message: 'Not connected' }
    return provider.saveRedisAclUser(params)
  }

  async deleteRedisAclUser(connectionId: string, username: string): Promise<DeleteRedisAclUserResult> {
    const provider = this.sessions.get(connectionId)
    if (!(provider instanceof RedisProvider)) return { status: 'error', message: 'Not connected' }
    return provider.deleteRedisAclUser(username)
  }

  // ── MongoDB User Management ─────────────────────────────────────────────────

  async getMongoUserDetails(connectionId: string, username: string): Promise<MongoUserDetails | null> {
    const provider = this.sessions.get(connectionId)
    if (!(provider instanceof MongoDbProvider)) return null
    return provider.getMongoUserDetails(username)
  }

  async saveMongoUser(connectionId: string, params: SaveMongoUserParams): Promise<SaveMongoUserResult> {
    const provider = this.sessions.get(connectionId)
    if (!(provider instanceof MongoDbProvider)) return { status: 'error', message: 'Not connected' }
    return provider.saveMongoUser(params)
  }

  async deleteMongoUser(connectionId: string, username: string): Promise<DeleteMongoUserResult> {
    const provider = this.sessions.get(connectionId)
    if (!(provider instanceof MongoDbProvider)) return { status: 'error', message: 'Not connected' }
    return provider.deleteMongoUser(username)
  }
}

export const databaseManager = new DatabaseManager()

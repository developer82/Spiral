import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type {
  BackupOptions,
  RestoreOptions,
  MySqlBackupOptions,
  MySqlRestoreOptions,
  PostgresBackupOptions,
  PostgresRestoreOptions,
  SqliteBackupOptions,
  SqliteRestoreOptions,
  RedisBackupOptions,
  RedisRestoreOptions,
  MongoBackupOptions,
  MongoRestoreOptions
} from '../main/database/types'
import type { DraftDocument } from '../main/autosave'

// Custom APIs for renderer
const api = {
  settings: {
    initial: ipcRenderer.sendSync('settings:get-all-sync'),
    getAll: () => ipcRenderer.invoke('settings:get-all'),
    set: (key: string, value: unknown) => ipcRenderer.invoke('settings:set', key, value),
    reset: () => ipcRenderer.invoke('settings:reset')
  },
  analytics: {
    track: (name: string, params?: Record<string, unknown>) =>
      ipcRenderer.invoke('analytics:track', name, params),
    pageView: (pageId: string) => ipcRenderer.invoke('analytics:page-view', pageId)
  },
  connections: {
    getAll: () => ipcRenderer.invoke('connections:get-all'),
    create: (record: unknown) => ipcRenderer.invoke('connections:create', record),
    update: (record: unknown) => ipcRenderer.invoke('connections:update', record),
    delete: (id: string) => ipcRenderer.invoke('connections:delete', id),
    addErdFile: (connectionId: string, databaseName: string, filePath: string) =>
      ipcRenderer.invoke('connections:add-erd-file', connectionId, databaseName, filePath),
    removeErdFile: (connectionId: string, filePath: string) =>
      ipcRenderer.invoke('connections:remove-erd-file', connectionId, filePath)
  },
  comparisons: {
    getAll: () => ipcRenderer.invoke('comparisons:get-all'),
    create: (record: unknown) => ipcRenderer.invoke('comparisons:create', record),
    update: (record: unknown) => ipcRenderer.invoke('comparisons:update', record),
    delete: (id: string) => ipcRenderer.invoke('comparisons:delete', id),
    execute: (id: string) => ipcRenderer.invoke('comparisons:execute', id),
    generateSyncScript: (id: string, report: unknown, direction: string) =>
      ipcRenderer.invoke('comparisons:generate-sync-script', id, report, direction),
    executeSync: (id: string, report: unknown, direction: string, generateRevertScript: boolean) =>
      ipcRenderer.invoke('comparisons:execute-sync', id, report, direction, generateRevertScript)
  },
  database: {
    connect: (connectionId: string, credentials?: { username?: string; password: string }) =>
      ipcRenderer.invoke('database:connect', connectionId, credentials),
    disconnect: (connectionId: string) => ipcRenderer.invoke('database:disconnect', connectionId),
    getChildren: (connectionId: string, nodeId: string) =>
      ipcRenderer.invoke('database:get-children', connectionId, nodeId),
    getDatabases: (connectionId: string) => ipcRenderer.invoke('database:get-databases', connectionId),
    executeQuery: (connectionId: string, querySql: string, withPlan?: boolean, withStatistics?: boolean, databaseName?: string) =>
      ipcRenderer.invoke('database:execute-query', connectionId, querySql, withPlan, withStatistics, databaseName),
    createDatabase: (connectionId: string, databaseName: string) =>
      ipcRenderer.invoke('database:create-database', connectionId, databaseName),
    listServerDrives: (connectionId: string) =>
      ipcRenderer.invoke('database:list-server-drives', connectionId),
    listServerDir: (connectionId: string, path: string) =>
      ipcRenderer.invoke('database:list-server-dir', connectionId, path),
    getDatabaseFiles: (connectionId: string, databaseName: string) =>
      ipcRenderer.invoke('database:get-database-files', connectionId, databaseName),
    buildBackupSql: (connectionId: string, opts: BackupOptions) =>
      ipcRenderer.invoke('database:build-backup-sql', connectionId, opts),
    executeBackup: (connectionId: string, opts: BackupOptions) =>
      ipcRenderer.invoke('database:execute-backup', connectionId, opts),
    readBackupHeader: (connectionId: string, path: string) =>
      ipcRenderer.invoke('database:read-backup-header', connectionId, path),
    readBackupFileList: (connectionId: string, path: string, position: number) =>
      ipcRenderer.invoke('database:read-backup-file-list', connectionId, path, position),
    getBackupSets: (connectionId: string, databaseName: string) =>
      ipcRenderer.invoke('database:get-backup-sets', connectionId, databaseName),
    buildRestoreSql: (connectionId: string, opts: RestoreOptions) =>
      ipcRenderer.invoke('database:build-restore-sql', connectionId, opts),
    executeRestore: (connectionId: string, opts: RestoreOptions) =>
      ipcRenderer.invoke('database:execute-restore', connectionId, opts),
    mysqlGetBackupTools: (
      connectionId: string,
      paths?: { mysqlDumpPath?: string; mysqlClientPath?: string }
    ) => ipcRenderer.invoke('mysql:get-backup-tools', connectionId, paths),
    mysqlProbeTools: (paths?: { mysqlDumpPath?: string; mysqlClientPath?: string }) =>
      ipcRenderer.invoke('mysql:probe-tools', paths),
    mysqlBuildBackupPreview: (connectionId: string, opts: MySqlBackupOptions) =>
      ipcRenderer.invoke('mysql:build-backup-preview', connectionId, opts),
    mysqlExecuteBackup: (connectionId: string, opts: MySqlBackupOptions) =>
      ipcRenderer.invoke('mysql:execute-backup', connectionId, opts),
    mysqlExecuteRestore: (connectionId: string, opts: MySqlRestoreOptions) =>
      ipcRenderer.invoke('mysql:execute-restore', connectionId, opts),
    mysqlPickBackupPath: (options?: { defaultFileName?: string; compress?: boolean }) =>
      ipcRenderer.invoke('mysql:pick-backup-path', options),
    mysqlPickRestoreFile: () => ipcRenderer.invoke('mysql:pick-restore-file'),
    redisExecuteBackup: (connectionId: string, opts: RedisBackupOptions) =>
      ipcRenderer.invoke('redis:execute-backup', connectionId, opts),
    redisExecuteRestore: (connectionId: string, opts: RedisRestoreOptions) =>
      ipcRenderer.invoke('redis:execute-restore', connectionId, opts),
    redisPickBackupPath: (options?: { defaultFileName?: string; compress?: boolean }) =>
      ipcRenderer.invoke('redis:pick-backup-path', options),
    redisPickRestoreFile: () => ipcRenderer.invoke('redis:pick-restore-file'),
    mongoGetBackupTools: (
      connectionId: string,
      paths?: { mongodumpPath?: string; mongorestorePath?: string }
    ) => ipcRenderer.invoke('mongo:get-backup-tools', connectionId, paths),
    mongoBuildBackupPreview: (connectionId: string, opts: MongoBackupOptions) =>
      ipcRenderer.invoke('mongo:build-backup-preview', connectionId, opts),
    mongoExecuteBackup: (connectionId: string, opts: MongoBackupOptions) =>
      ipcRenderer.invoke('mongo:execute-backup', connectionId, opts),
    mongoExecuteRestore: (connectionId: string, opts: MongoRestoreOptions) =>
      ipcRenderer.invoke('mongo:execute-restore', connectionId, opts),
    mongoPickBackupPath: (options?: {
      defaultFileName?: string
      gzip?: boolean
      engine?: 'mongodump' | 'js'
    }) => ipcRenderer.invoke('mongo:pick-backup-path', options),
    mongoPickRestoreFile: () => ipcRenderer.invoke('mongo:pick-restore-file'),
    postgresGetBackupTools: (
      connectionId: string,
      paths?: { pgDumpPath?: string; pgRestorePath?: string; psqlPath?: string }
    ) => ipcRenderer.invoke('postgres:get-backup-tools', connectionId, paths),
    postgresProbeTools: (paths?: {
      pgDumpPath?: string
      pgRestorePath?: string
      psqlPath?: string
    }) => ipcRenderer.invoke('postgres:probe-tools', paths),
    postgresBuildBackupPreview: (connectionId: string, opts: PostgresBackupOptions) =>
      ipcRenderer.invoke('postgres:build-backup-preview', connectionId, opts),
    postgresExecuteBackup: (connectionId: string, opts: PostgresBackupOptions) =>
      ipcRenderer.invoke('postgres:execute-backup', connectionId, opts),
    postgresExecuteRestore: (connectionId: string, opts: PostgresRestoreOptions) =>
      ipcRenderer.invoke('postgres:execute-restore', connectionId, opts),
    postgresPickBackupPath: (options?: {
      defaultFileName?: string
      compress?: boolean
      format?: string
    }) => ipcRenderer.invoke('postgres:pick-backup-path', options),
    postgresPickRestoreFile: () => ipcRenderer.invoke('postgres:pick-restore-file'),
    sqliteExecuteBackup: (connectionId: string, opts: SqliteBackupOptions) =>
      ipcRenderer.invoke('sqlite:execute-backup', connectionId, opts),
    sqliteExecuteRestore: (connectionId: string, opts: SqliteRestoreOptions) =>
      ipcRenderer.invoke('sqlite:execute-restore', connectionId, opts),
    sqlitePickBackupPath: (options?: { defaultFileName?: string; compress?: boolean }) =>
      ipcRenderer.invoke('sqlite:pick-backup-path', options),
    sqlitePickRestoreFile: () => ipcRenderer.invoke('sqlite:pick-restore-file'),
    createCollection: (connectionId: string, databaseName: string, collectionName: string) =>
      ipcRenderer.invoke('database:create-collection', connectionId, databaseName, collectionName),
    renameCollection: (connectionId: string, databaseName: string, oldName: string, newName: string) =>
      ipcRenderer.invoke('database:rename-collection', connectionId, databaseName, oldName, newName),
    dropCollection: (connectionId: string, databaseName: string, collectionName: string) =>
      ipcRenderer.invoke('database:drop-collection', connectionId, databaseName, collectionName),
    insertMongoDocument: (connectionId: string, databaseName: string, collectionName: string, ejsonDocString: string) =>
      ipcRenderer.invoke('database:insert-mongo-document', connectionId, databaseName, collectionName, ejsonDocString),
    replaceMongoDocument: (connectionId: string, databaseName: string, collectionName: string, ejsonDocString: string) =>
      ipcRenderer.invoke('database:replace-mongo-document', connectionId, databaseName, collectionName, ejsonDocString),
    deleteMongoDocument: (connectionId: string, databaseName: string, collectionName: string, ejsonDocString: string) =>
      ipcRenderer.invoke('database:delete-mongo-document', connectionId, databaseName, collectionName, ejsonDocString),
    executeMongoShellCommand: (connectionId: string, command: string, currentDb: string) =>
      ipcRenderer.invoke('database:execute-mongo-shell-command', connectionId, command, currentDb),
    executeRedisShellCommand: (connectionId: string, command: string, databaseIndex: number) =>
      ipcRenderer.invoke('database:execute-redis-shell-command', connectionId, command, databaseIndex),
    getMongoIndexes: (connectionId: string, databaseName: string, collectionName: string) =>
      ipcRenderer.invoke('database:get-mongo-indexes', connectionId, databaseName, collectionName),
    saveMongoIndex: (connectionId: string, databaseName: string, collectionName: string, params: unknown, originalName?: string) =>
      ipcRenderer.invoke('database:save-mongo-index', connectionId, databaseName, collectionName, params, originalName),
    dropMongoIndex: (connectionId: string, databaseName: string, collectionName: string, indexName: string) =>
      ipcRenderer.invoke('database:drop-mongo-index', connectionId, databaseName, collectionName, indexName),
    getCollectionFields: (connectionId: string, databaseName: string, collectionName: string) =>
      ipcRenderer.invoke('database:get-collection-fields', connectionId, databaseName, collectionName),
    getMongoAggregations: (connectionId: string, databaseName: string, collectionName: string) =>
      ipcRenderer.invoke('database:get-mongo-aggregations', connectionId, databaseName, collectionName),
    saveMongoAggregation: (connectionId: string, databaseName: string, collectionName: string, params: unknown, originalId?: string) =>
      ipcRenderer.invoke('database:save-mongo-aggregation', connectionId, databaseName, collectionName, params, originalId),
    deleteMongoAggregation: (connectionId: string, databaseName: string, collectionName: string, aggregationId: string) =>
      ipcRenderer.invoke('database:delete-mongo-aggregation', connectionId, databaseName, collectionName, aggregationId),
    runMongoAggregation: (connectionId: string, databaseName: string, collectionName: string, pipeline: unknown[]) =>
      ipcRenderer.invoke('database:run-mongo-aggregation', connectionId, databaseName, collectionName, pipeline),
    getMongoAggregationSample: (connectionId: string, databaseName: string, collectionName: string, limit?: number) =>
      ipcRenderer.invoke('database:get-mongo-aggregation-sample', connectionId, databaseName, collectionName, limit),
    getMongoValidation: (connectionId: string, databaseName: string, collectionName: string) =>
      ipcRenderer.invoke('database:get-mongo-validation', connectionId, databaseName, collectionName),
    saveMongoValidation: (connectionId: string, databaseName: string, collectionName: string, validator: unknown, validationAction: string, validationLevel: string) =>
      ipcRenderer.invoke('database:save-mongo-validation', connectionId, databaseName, collectionName, validator, validationAction, validationLevel),
    testMongoValidation: (connectionId: string, databaseName: string, collectionName: string, validator: unknown) =>
      ipcRenderer.invoke('database:test-mongo-validation', connectionId, databaseName, collectionName, validator),
    generateMongoValidationRules: (connectionId: string, databaseName: string, collectionName: string) =>
      ipcRenderer.invoke('database:generate-mongo-validation-rules', connectionId, databaseName, collectionName),
    getTableSchema: (
      connectionId: string,
      databaseName: string,
      schemaName: string,
      tableName: string
    ) =>
      ipcRenderer.invoke(
        'database:get-table-schema',
        connectionId,
        databaseName,
        schemaName,
        tableName
      ),
    getForeignKeys: (
      connectionId: string,
      databaseName: string,
      schemaName: string,
      tableName: string
    ) =>
      ipcRenderer.invoke(
        'database:get-foreign-keys',
        connectionId,
        databaseName,
        schemaName,
        tableName
      ),
    getCheckConstraints: (
      connectionId: string,
      databaseName: string,
      schemaName: string,
      tableName: string
    ) =>
      ipcRenderer.invoke(
        'database:get-check-constraints',
        connectionId,
        databaseName,
        schemaName,
        tableName
      ),
    getTriggers: (
      connectionId: string,
      databaseName: string,
      schemaName: string,
      tableName: string
    ) =>
      ipcRenderer.invoke(
        'database:get-triggers',
        connectionId,
        databaseName,
        schemaName,
        tableName
      ),
    saveTrigger: (
      connectionId: string,
      databaseName: string,
      params: unknown,
      originalTriggerName?: string
    ) =>
      ipcRenderer.invoke(
        'database:save-trigger',
        connectionId,
        databaseName,
        params,
        originalTriggerName
      ),
    deleteTrigger: (
      connectionId: string,
      databaseName: string,
      triggerName: string,
      schemaName: string
    ) =>
      ipcRenderer.invoke(
        'database:delete-trigger',
        connectionId,
        databaseName,
        triggerName,
        schemaName
      ),
    getIndexes: (
      connectionId: string,
      databaseName: string,
      schemaName: string,
      tableName: string
    ) =>
      ipcRenderer.invoke(
        'database:get-indexes',
        connectionId,
        databaseName,
        schemaName,
        tableName
      ),
    saveIndex: (
      connectionId: string,
      databaseName: string,
      params: unknown,
      originalIndexName?: string
    ) =>
      ipcRenderer.invoke(
        'database:save-index',
        connectionId,
        databaseName,
        params,
        originalIndexName
      ),
    deleteIndex: (
      connectionId: string,
      databaseName: string,
      indexName: string,
      schemaName: string,
      tableName: string
    ) =>
      ipcRenderer.invoke(
        'database:delete-index',
        connectionId,
        databaseName,
        indexName,
        schemaName,
        tableName
      ),
    rebuildIndex: (
      connectionId: string,
      databaseName: string,
      indexName: string,
      schemaName: string,
      tableName: string
    ) =>
      ipcRenderer.invoke(
        'database:rebuild-index',
        connectionId,
        databaseName,
        indexName,
        schemaName,
        tableName
      ),
    reorganizeIndex: (
      connectionId: string,
      databaseName: string,
      indexName: string,
      schemaName: string,
      tableName: string
    ) =>
      ipcRenderer.invoke(
        'database:reorganize-index',
        connectionId,
        databaseName,
        indexName,
        schemaName,
        tableName
      ),
    disableIndex: (
      connectionId: string,
      databaseName: string,
      indexName: string,
      schemaName: string,
      tableName: string
    ) =>
      ipcRenderer.invoke(
        'database:disable-index',
        connectionId,
        databaseName,
        indexName,
        schemaName,
        tableName
      ),
    testConnection: (record: unknown) => ipcRenderer.invoke('database:test-connection', record),
    getErdSchema: (connectionId: string, databaseName: string) =>
      ipcRenderer.invoke('database:get-erd-schema', connectionId, databaseName),
    getViews: (connectionId: string, databaseName: string) =>
      ipcRenderer.invoke('database:get-views', connectionId, databaseName),
    saveView: (connectionId: string, databaseName: string, params: unknown, originalViewName?: string) =>
      ipcRenderer.invoke('database:save-view', connectionId, databaseName, params, originalViewName),
    deleteView: (connectionId: string, databaseName: string, schemaName: string, viewName: string) =>
      ipcRenderer.invoke('database:delete-view', connectionId, databaseName, schemaName, viewName),
    getStoredProcedures: (connectionId: string, databaseName: string) =>
      ipcRenderer.invoke('database:get-stored-procedures', connectionId, databaseName),
    saveStoredProcedure: (connectionId: string, databaseName: string, params: unknown, originalProcedureName?: string) =>
      ipcRenderer.invoke('database:save-stored-procedure', connectionId, databaseName, params, originalProcedureName),
    deleteStoredProcedure: (connectionId: string, databaseName: string, schemaName: string, procedureName: string) =>
      ipcRenderer.invoke('database:delete-stored-procedure', connectionId, databaseName, schemaName, procedureName),
    getDataTypes: (connectionId: string, databaseName: string) =>
      ipcRenderer.invoke('database:get-data-types', connectionId, databaseName),
    saveDataType: (connectionId: string, databaseName: string, params: unknown, originalTypeName?: string, originalSchemaName?: string) =>
      ipcRenderer.invoke('database:save-data-type', connectionId, databaseName, params, originalTypeName, originalSchemaName),
    deleteDataType: (connectionId: string, databaseName: string, schemaName: string, typeName: string) =>
      ipcRenderer.invoke('database:delete-data-type', connectionId, databaseName, schemaName, typeName),
    getTableTypes: (connectionId: string, databaseName: string) =>
      ipcRenderer.invoke('database:get-table-types', connectionId, databaseName),
    getTableType: (connectionId: string, databaseName: string, schemaName: string, typeName: string) =>
      ipcRenderer.invoke('database:get-table-type', connectionId, databaseName, schemaName, typeName),
    saveTableType: (connectionId: string, databaseName: string, params: unknown, originalTypeName?: string, originalSchemaName?: string) =>
      ipcRenderer.invoke('database:save-table-type', connectionId, databaseName, params, originalTypeName, originalSchemaName),
    deleteTableType: (connectionId: string, databaseName: string, schemaName: string, typeName: string) =>
      ipcRenderer.invoke('database:delete-table-type', connectionId, databaseName, schemaName, typeName),
    getMemoryOptimizedTableTypes: (connectionId: string, databaseName: string) =>
      ipcRenderer.invoke('database:get-memory-optimized-table-types', connectionId, databaseName),
    getMemoryOptimizedTableType: (connectionId: string, databaseName: string, schemaName: string, typeName: string) =>
      ipcRenderer.invoke('database:get-memory-optimized-table-type', connectionId, databaseName, schemaName, typeName),
    saveMemoryOptimizedTableType: (connectionId: string, databaseName: string, params: unknown, originalTypeName?: string, originalSchemaName?: string) =>
      ipcRenderer.invoke('database:save-memory-optimized-table-type', connectionId, databaseName, params, originalTypeName, originalSchemaName),
    deleteMemoryOptimizedTableType: (connectionId: string, databaseName: string, schemaName: string, typeName: string) =>
      ipcRenderer.invoke('database:delete-memory-optimized-table-type', connectionId, databaseName, schemaName, typeName),
    invalidateCache: (connectionId: string, nodeId: string) =>
      ipcRenderer.invoke('database:invalidate-cache', connectionId, nodeId),
    deleteRedisKey: (connectionId: string, databaseIndex: string, keyName: string) =>
      ipcRenderer.invoke('database:delete-redis-key', connectionId, databaseIndex, keyName),
    deleteRedisPrefix: (connectionId: string, databaseIndex: string, prefix: string) =>
      ipcRenderer.invoke('database:delete-redis-prefix', connectionId, databaseIndex, prefix),
    getRedisDbKeys: (connectionId: string, databaseIndex: string) =>
      ipcRenderer.invoke('database:get-redis-db-keys', connectionId, databaseIndex),
    getRedisKeyValue: (connectionId: string, databaseIndex: string, keyName: string) =>
      ipcRenderer.invoke('database:get-redis-key-value', connectionId, databaseIndex, keyName),
    saveRedisKey: (connectionId: string, databaseIndex: string, params: unknown) =>
      ipcRenderer.invoke('database:save-redis-key', connectionId, databaseIndex, params),
    getRedisDashboard: (connectionId: string) =>
      ipcRenderer.invoke('database:get-redis-dashboard', connectionId),
    executeRedisDashboardCommand: (connectionId: string, command: string, databaseIndex?: number) =>
      ipcRenderer.invoke('database:execute-redis-dashboard-command', connectionId, command, databaseIndex),
    onEagerLoadStatus: (cb: (payload: { connectionId: string; status: 'loading' | 'complete' | 'error' }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: { connectionId: string; status: 'loading' | 'complete' | 'error' }) => cb(payload)
      ipcRenderer.on('database:eager-load-status', handler)
      return () => ipcRenderer.off('database:eager-load-status', handler)
    },
    syncWatchState: (
      connectionId: string,
      enabled: boolean,
      appFocused: boolean,
      watchedNodes: string[],
      showSystemDatabases: boolean
    ) => ipcRenderer.invoke('database:sync-watch-state', connectionId, enabled, appFocused, watchedNodes, showSystemDatabases),
    onBackgroundRefresh: (cb: (payload: { connectionId: string; updates: Array<{ nodeId: string; children: unknown[] }> }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: { connectionId: string; updates: Array<{ nodeId: string; children: unknown[] }> }) => cb(payload)
      ipcRenderer.on('database:background-refresh', handler)
      return () => ipcRenderer.off('database:background-refresh', handler)
    },
    scriptTableCreate: (connectionId: string, databaseName: string, schemaName: string, tableName: string) =>
      ipcRenderer.invoke('database:script-table-create', connectionId, databaseName, schemaName, tableName),
    scriptTableAlter: (connectionId: string, databaseName: string, schemaName: string, tableName: string) =>
      ipcRenderer.invoke('database:script-table-alter', connectionId, databaseName, schemaName, tableName),
    scriptTableDrop: (connectionId: string, databaseName: string, schemaName: string, tableName: string) =>
      ipcRenderer.invoke('database:script-table-drop', connectionId, databaseName, schemaName, tableName),
    scriptViewCreate: (connectionId: string, databaseName: string, schemaName: string, viewName: string) =>
      ipcRenderer.invoke('database:script-view-create', connectionId, databaseName, schemaName, viewName),
    scriptViewAlter: (connectionId: string, databaseName: string, schemaName: string, viewName: string) =>
      ipcRenderer.invoke('database:script-view-alter', connectionId, databaseName, schemaName, viewName),
    scriptViewDrop: (connectionId: string, databaseName: string, schemaName: string, viewName: string) =>
      ipcRenderer.invoke('database:script-view-drop', connectionId, databaseName, schemaName, viewName),
    scriptStoredProcedureCreate: (connectionId: string, databaseName: string, schemaName: string, procedureName: string) =>
      ipcRenderer.invoke('database:script-stored-procedure-create', connectionId, databaseName, schemaName, procedureName),
    scriptStoredProcedureAlter: (connectionId: string, databaseName: string, schemaName: string, procedureName: string) =>
      ipcRenderer.invoke('database:script-stored-procedure-alter', connectionId, databaseName, schemaName, procedureName),
    scriptStoredProcedureDrop: (connectionId: string, databaseName: string, schemaName: string, procedureName: string) =>
      ipcRenderer.invoke('database:script-stored-procedure-drop', connectionId, databaseName, schemaName, procedureName),
    scriptSelectTopRows: (connectionId: string, databaseName: string, schemaName: string, tableName: string, count: number) =>
      ipcRenderer.invoke('database:script-select-top-rows', connectionId, databaseName, schemaName, tableName, count),
    scriptDropDatabase: (connectionId: string, databaseName: string) =>
      ipcRenderer.invoke('database:script-drop-database', connectionId, databaseName),
    getCapabilities: (connectionId: string) =>
      ipcRenderer.invoke('database:get-capabilities', connectionId),
    getServerLoginDetails: (connectionId: string, loginName: string) =>
      ipcRenderer.invoke('database:get-server-login-details', connectionId, loginName),
    listServerDatabases: (connectionId: string) =>
      ipcRenderer.invoke('database:list-server-databases', connectionId),
    listServerLanguages: (connectionId: string) =>
      ipcRenderer.invoke('database:list-server-languages', connectionId),
    getServerLoginRoles: (connectionId: string, loginName: string) =>
      ipcRenderer.invoke('database:get-server-login-roles', connectionId, loginName),
    getServerLoginDatabaseMappings: (connectionId: string, loginName: string) =>
      ipcRenderer.invoke('database:get-server-login-database-mappings', connectionId, loginName),
    getDatabaseRolesForLogin: (connectionId: string, databaseName: string, loginName: string) =>
      ipcRenderer.invoke('database:get-database-roles-for-login', connectionId, databaseName, loginName),
    saveServerLogin: (connectionId: string, params: unknown) =>
      ipcRenderer.invoke('database:save-server-login', connectionId, params),
    deleteServerLogin: (connectionId: string, loginName: string) =>
      ipcRenderer.invoke('database:delete-server-login', connectionId, loginName),
    getServerRoleDetails: (connectionId: string, roleName: string) =>
      ipcRenderer.invoke('database:get-server-role-details', connectionId, roleName),
    saveServerRole: (connectionId: string, params: unknown) =>
      ipcRenderer.invoke('database:save-server-role', connectionId, params),
    deleteServerRole: (connectionId: string, roleName: string) =>
      ipcRenderer.invoke('database:delete-server-role', connectionId, roleName),
    getDatabaseUserDetails: (connectionId: string, databaseName: string, userName: string) =>
      ipcRenderer.invoke('database:get-database-user-details', connectionId, databaseName, userName),
    getDatabaseUserRoles: (connectionId: string, databaseName: string, userName: string) =>
      ipcRenderer.invoke('database:get-database-user-roles', connectionId, databaseName, userName),
    saveDatabaseUser: (connectionId: string, params: unknown) =>
      ipcRenderer.invoke('database:save-database-user', connectionId, params),
    deleteDatabaseUser: (connectionId: string, databaseName: string, userName: string) =>
      ipcRenderer.invoke('database:delete-database-user', connectionId, databaseName, userName),
    getMySqlUserDetails: (connectionId: string, username: string, host: string) =>
      ipcRenderer.invoke('database:get-mysql-user-details', connectionId, username, host),
    getMySqlUserGlobalPrivileges: (connectionId: string, username: string, host: string) =>
      ipcRenderer.invoke('database:get-mysql-user-global-privileges', connectionId, username, host),
    getMySqlUserDatabasePrivileges: (connectionId: string, username: string, host: string) =>
      ipcRenderer.invoke('database:get-mysql-user-database-privileges', connectionId, username, host),
    getMySqlDatabaseList: (connectionId: string) =>
      ipcRenderer.invoke('database:get-mysql-database-list', connectionId),
    getMySqlDatabaseUsers: (connectionId: string, databaseName: string) =>
      ipcRenderer.invoke('database:get-mysql-database-users', connectionId, databaseName),
    saveMySqlUser: (connectionId: string, params: unknown) =>
      ipcRenderer.invoke('database:save-mysql-user', connectionId, params),
    deleteMySqlUser: (connectionId: string, username: string, host: string) =>
      ipcRenderer.invoke('database:delete-mysql-user', connectionId, username, host),
    saveMySqlDatabaseUserPrivileges: (connectionId: string, params: unknown) =>
      ipcRenderer.invoke('database:save-mysql-database-user-privileges', connectionId, params),
    getRedisAclUserDetails: (connectionId: string, username: string) =>
      ipcRenderer.invoke('database:get-redis-acl-user-details', connectionId, username),
    saveRedisAclUser: (connectionId: string, params: unknown) =>
      ipcRenderer.invoke('database:save-redis-acl-user', connectionId, params),
    deleteRedisAclUser: (connectionId: string, username: string) =>
      ipcRenderer.invoke('database:delete-redis-acl-user', connectionId, username),
    getMongoUserDetails: (connectionId: string, username: string) =>
      ipcRenderer.invoke('database:get-mongo-user-details', connectionId, username),
    saveMongoUser: (connectionId: string, params: unknown) =>
      ipcRenderer.invoke('database:save-mongo-user', connectionId, params),
    deleteMongoUser: (connectionId: string, username: string) =>
      ipcRenderer.invoke('database:delete-mongo-user', connectionId, username)
  },
  file: {
    save: (filePath: string, content: string) => ipcRenderer.invoke('file:save', filePath, content),
    saveDialog: (content: string, options?: { defaultPath?: string; filters?: { name: string; extensions: string[] }[] }) =>
      ipcRenderer.invoke('file:save-dialog', content, options),
    openDialog: () => ipcRenderer.invoke('file:open-dialog'),
    saveErdDialog: (content: string) => ipcRenderer.invoke('file:save-erd-dialog', content),
    openErdDialog: () => ipcRenderer.invoke('file:open-erd-dialog'),
    read: (filePath: string) => ipcRenderer.invoke('file:read', filePath),
    openSqliteDialog: () => ipcRenderer.invoke('file:open-sqlite-dialog'),
    openFileDialog: () => ipcRenderer.invoke('file:open-file-dialog'),
    checkFileExists: (filePath: string): Promise<boolean> =>
      ipcRenderer.invoke('file:check-exists', filePath)
  },
  autosave: {
    getRecovered: () => ipcRenderer.invoke('autosave:get-recovered'),
    write: (drafts: DraftDocument[]) => ipcRenderer.invoke('autosave:write', drafts),
    clear: () => ipcRenderer.invoke('autosave:clear')
  },
  menu: {
    executeRole: (role: string) => ipcRenderer.send('menu:execute-role', role),
    updateState: (state: { hasOpenDocuments?: boolean; canSaveActive?: boolean; isDocumentFocused?: boolean }) =>
      ipcRenderer.send('menu:update-state', state),
    onNativeAction: (cb: (action: string) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, action: string) => cb(action)
      ipcRenderer.on('menu:native-action', handler)
      return () => ipcRenderer.off('menu:native-action', handler)
    }
  },
  app: {
    quit: () => ipcRenderer.send('app:quit'),
    restart: () => ipcRenderer.send('app:restart'),
    openDevTools: () => ipcRenderer.send('app:open-dev-tools')
  },
  isDev: ipcRenderer.sendSync('app:is-dev') as boolean,
  updater: {
    checkForUpdates: () => ipcRenderer.invoke('updater:check-for-updates'),
    startDownload: () => ipcRenderer.invoke('updater:start-download'),
    cancelDownload: () => ipcRenderer.invoke('updater:cancel-download'),
    installUpdate: () => ipcRenderer.invoke('updater:install-update'),
    getVersion: () => ipcRenderer.invoke('updater:get-version') as Promise<string>,
    getPreviousVersion: () => ipcRenderer.invoke('updater:get-previous-version') as Promise<string | null>,
    clearPreviousVersion: () => ipcRenderer.invoke('updater:clear-previous-version'),
    getDownloadedVersion: () =>
      ipcRenderer.invoke('updater:get-downloaded-version') as Promise<string | null>,
    clearDownloadedVersion: () => ipcRenderer.invoke('updater:clear-downloaded-version'),
    getReleaseNotes: (fromVersion?: string) =>
      ipcRenderer.invoke('updater:get-release-notes', fromVersion) as Promise<
        | { status: 'ok'; notes: Array<{ version: string; body: string; publishedAt: string }> }
        | { status: 'error'; message: string }
      >,
    onChecking: (cb: () => void) => {
      const handler = () => cb()
      ipcRenderer.on('updater:checking', handler)
      return () => ipcRenderer.off('updater:checking', handler)
    },
    onUpdateAvailable: (cb: (info: { version: string; releaseNotes: string | null; releaseDate?: string }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, info: { version: string; releaseNotes: string | null; releaseDate?: string }) => cb(info)
      ipcRenderer.on('updater:update-available', handler)
      return () => ipcRenderer.off('updater:update-available', handler)
    },
    onNotAvailable: (cb: () => void) => {
      const handler = () => cb()
      ipcRenderer.on('updater:not-available', handler)
      return () => ipcRenderer.off('updater:not-available', handler)
    },
    onDownloadProgress: (cb: (data: { percent: number; bytesPerSecond: number }) => void) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        data: { percent: number; bytesPerSecond: number }
      ) => cb(data)
      ipcRenderer.on('updater:download-progress', handler)
      return () => ipcRenderer.off('updater:download-progress', handler)
    },
    onDownloadCancelled: (cb: () => void) => {
      const handler = () => cb()
      ipcRenderer.on('updater:download-cancelled', handler)
      return () => ipcRenderer.off('updater:download-cancelled', handler)
    },
    onDownloaded: (cb: (info: { version: string; releaseNotes: string | null; releaseDate?: string }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, info: { version: string; releaseNotes: string | null; releaseDate?: string }) => cb(info)
      ipcRenderer.on('updater:downloaded', handler)
      return () => ipcRenderer.off('updater:downloaded', handler)
    },
    onError: (cb: (message: string) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, message: string) => cb(message)
      ipcRenderer.on('updater:error', handler)
      return () => ipcRenderer.off('updater:error', handler)
    },
    onCheckForUpdatesMenu: (cb: () => void) => {
      const handler = (_event: Electron.IpcRendererEvent, action: string) => {
        if (action === 'updater:check-for-updates-menu') cb()
      }
      ipcRenderer.on('menu:native-action', handler)
      return () => ipcRenderer.off('menu:native-action', handler)
    }
  },
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximizeRestore: () => ipcRenderer.send('window:maximize-restore'),
    close: () => ipcRenderer.send('window:close'),
    captureScreenshotPreview: () =>
      ipcRenderer.invoke('window:screenshot-preview') as Promise<{
        dataUrl: string
        width: number
        height: number
      } | null>,
    captureScreenshotAtSize: (width: number, height: number) =>
      ipcRenderer.invoke('window:screenshot-capture', { width, height }) as Promise<{
        dataUrl: string
      } | null>,
    writeScreenshot: (dataUrl: string) =>
      ipcRenderer.invoke('window:screenshot-write', { dataUrl }) as Promise<boolean>,
    getContentSize: () =>
      ipcRenderer.invoke('window:get-content-size') as Promise<{
        width: number
        height: number
      } | null>,
    resizeWindow: (width: number, height: number) =>
      ipcRenderer.invoke('window:resize', { width, height }) as Promise<void>,
    isMaximized: () => ipcRenderer.invoke('window:is-maximized') as Promise<boolean>,
    onMaximize: (cb: () => void) => {
      const handler = () => cb()
      ipcRenderer.on('window:maximized', handler)
      return () => ipcRenderer.off('window:maximized', handler)
    },
    onUnmaximize: (cb: () => void) => {
      const handler = () => cb()
      ipcRenderer.on('window:unmaximized', handler)
      return () => ipcRenderer.off('window:unmaximized', handler)
    }
  },
  environment: {
    export: (options: {
      connections: boolean
      comparisons: boolean
      passwords: boolean
      settings: boolean
    }) => ipcRenderer.invoke('environment:export', options),
    import: () => ipcRenderer.invoke('environment:import'),
    onImportProgress: (cb: (progress: { step: string; total?: number }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, progress: unknown) =>
        cb(progress as { step: string; total?: number })
      ipcRenderer.on('environment:import-progress', handler)
      return () => ipcRenderer.off('environment:import-progress', handler)
    }
  },
  platform: process.platform,
  profile: {
    get: () => ipcRenderer.invoke('profile:get'),
    setName: (name: string) => ipcRenderer.invoke('profile:set-name', name),
    pickAvatar: () => ipcRenderer.invoke('profile:pick-avatar'),
    removeAvatar: () => ipcRenderer.invoke('profile:remove-avatar'),
    getAvatarDataUrl: () => ipcRenderer.invoke('profile:get-avatar-data-url'),
    setAvatarTransform: (zoom: number, offsetX: number, offsetY: number) =>
      ipcRenderer.invoke('profile:set-avatar-transform', zoom, offsetX, offsetY),
    setLockSettings: (settings: { lockOnStartup: boolean; lockOnInactivity: boolean; inactivityTimeoutMinutes: number }) =>
      ipcRenderer.invoke('profile:set-lock-settings', settings)
  },
  auth: {
    getState: () => ipcRenderer.invoke('auth:get-state'),
    setPassword: (plaintext: string) => ipcRenderer.invoke('auth:set-password', plaintext),
    changePassword: (current: string, next: string) => ipcRenderer.invoke('auth:change-password', current, next),
    removePassword: (current: string) => ipcRenderer.invoke('auth:remove-password', current),
    verify: (plaintext: string) => ipcRenderer.invoke('auth:verify', plaintext),
    clearSessionKey: () => ipcRenderer.invoke('auth:clear-session-key'),
    lockNow: () => ipcRenderer.invoke('auth:lock-now'),
    onLock: (cb: () => void) => {
      const handler = () => cb()
      ipcRenderer.on('auth:lock', handler)
      return () => ipcRenderer.off('auth:lock', handler)
    }
  },
  ai: {
    checkModel: (modelId: string) => ipcRenderer.invoke('ai:check-model', modelId),
    listModels: () => ipcRenderer.invoke('ai:list-models'),
    downloadModel: (modelId: string) => ipcRenderer.invoke('ai:download-model', modelId),
    cancelDownload: (modelId: string) => ipcRenderer.invoke('ai:cancel-download', modelId),
    deleteModel: (modelId: string) => ipcRenderer.invoke('ai:delete-model', modelId),
    getSchemaContext: (connectionId: string, databaseName: string, provider: string) =>
      ipcRenderer.invoke('ai:get-schema-context', connectionId, databaseName, provider),
    chatStream: (request: unknown, sessionId: string) =>
      ipcRenderer.invoke('ai:chat-stream', request, sessionId),
    abortCompletion: (sessionId: string) =>
      ipcRenderer.invoke('ai:abort-completion', sessionId),
    onDownloadProgress: (cb: (data: unknown) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: unknown) => cb(data)
      ipcRenderer.on('ai:download-progress', handler)
      return () => ipcRenderer.off('ai:download-progress', handler)
    },
    onChatChunk: (cb: (data: unknown) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: unknown) => cb(data)
      ipcRenderer.on('ai:chat-chunk', handler)
      return () => ipcRenderer.off('ai:chat-chunk', handler)
    }
  },
  profiler: {
    start: (config: unknown) => ipcRenderer.invoke('profiler:start', config),
    stop: (sessionId: string) => ipcRenderer.invoke('profiler:stop', sessionId),
    pause: (sessionId: string) => ipcRenderer.invoke('profiler:pause', sessionId),
    resume: (sessionId: string) => ipcRenderer.invoke('profiler:resume', sessionId),
    onEvent: (cb: (payload: unknown) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: unknown) => cb(payload)
      ipcRenderer.on('profiler:event', handler)
      return () => ipcRenderer.off('profiler:event', handler)
    },
    onEventUpdate: (cb: (payload: unknown) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: unknown) => cb(payload)
      ipcRenderer.on('profiler:event-update', handler)
      return () => ipcRenderer.off('profiler:event-update', handler)
    },
    onError: (cb: (payload: unknown) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: unknown) => cb(payload)
      ipcRenderer.on('profiler:error', handler)
      return () => ipcRenderer.off('profiler:error', handler)
    }
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}

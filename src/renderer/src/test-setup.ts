// @testing-library/jest-dom/vitest imports expect from vitest itself and extends it,
// avoiding the "expect is not defined" global issue.
import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

if (typeof localStorage === 'undefined') {
  const storage = new Map<string, string>()

  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value)
      },
      removeItem: (key: string) => {
        storage.delete(key)
      },
      clear: () => {
        storage.clear()
      }
    }
  })
}

// Monaco Editor uses window/DOM APIs unavailable in jsdom worker contexts.
// Replace it with a lightweight stub so component tests aren't affected.
vi.mock('@monaco-editor/react', () => ({
  default: vi.fn(() => null)
}))

// Mock window.api (Electron preload bridge) for renderer unit tests.
// Individual tests can override specific methods with vi.spyOn or vi.fn.
if (typeof window !== 'undefined') {
  const defaultEnvironments = [
    {
      id: 'production',
      name: 'Production',
      description: 'Live production environment.',
      critical: true,
      color: '#ff3b30'
    },
    {
      id: 'qa',
      name: 'QA',
      description: 'Quality assurance and pre-release validation.',
      critical: false,
      color: '#2e7d32'
    },
    {
      id: 'development',
      name: 'Development',
      description: 'Local development and internal testing.',
      critical: false,
      color: '#6b7280'
    }
  ]

  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      settings: {
        initial: {
          language: 'en',
          theme: 'dark' as const,
          showSideNavigationBar: true,
          syntaxHighlighting: true,
          showGridLines: false,
          fontScaling: 100,
          queryTimeout: 30,
          showSystemDatabases: false,
          selectTopRowsCount: 1000,
          defaultErdBackground: 'dots' as const,
          autoIncludeExecutionPlan: false,
          autoIncludeClientStatistics: false,
          customTitlebar: true,
          useInteractiveTables: false,
          environments: defaultEnvironments,
          askBeforeIncludingSecretsInComparisonExport: true,
          includeSecretsInComparisonExportByDefault: false,
          likeConfetti: false,
          showTipsAndTricks: true,
          copyJsonFormatted: true,
          hfToken: '',
          glassEffectHour: -1
        },
        getAll: () =>
          Promise.resolve({
            language: 'en',
            theme: 'dark' as const,
            showSideNavigationBar: true,
            syntaxHighlighting: true,
            showGridLines: false,
            fontScaling: 100,
            queryTimeout: 30,
            showSystemDatabases: false,
            selectTopRowsCount: 1000,
            defaultErdBackground: 'dots' as const,
            autoIncludeExecutionPlan: false,
            autoIncludeClientStatistics: false,
            customTitlebar: true,
            useInteractiveTables: false,
            environments: defaultEnvironments,
            askBeforeIncludingSecretsInComparisonExport: true,
            includeSecretsInComparisonExportByDefault: false,
            likeConfetti: false,
            showTipsAndTricks: true,
            copyJsonFormatted: true,
            hfToken: '',
            glassEffectHour: -1
          }),
        set: () => Promise.resolve(),
        reset: () => Promise.resolve()
      },
      analytics: {
        track: () => Promise.resolve(),
        pageView: () => Promise.resolve()
      },
      connections: {
        getAll: () => Promise.resolve([]),
        create: () => Promise.resolve(),
        update: () => Promise.resolve(),
        delete: () => Promise.resolve(),
        addErdFile: () => Promise.resolve(),
        removeErdFile: () => Promise.resolve()
      },
      comparisons: {
        getAll: () => Promise.resolve([]),
        create: () => Promise.resolve(),
        update: () => Promise.resolve(),
        delete: () => Promise.resolve(),
        execute: () => Promise.resolve({
          comparisonId: 'mock-comparison',
          comparisonName: 'Mock Comparison',
          generatedAt: new Date(0).toISOString(),
          durationMs: 0,
          counts: { total: 0, added: 0, removed: 0, modified: 0, unsupported: 0 },
          items: [],
          warnings: []
        }),
        generateSyncScript: () => Promise.resolve({ status: 'ok', script: '', sections: [], skippedCount: 0 }),
        executeSync: () => Promise.resolve({ status: 'ok' })
      },
      database: {
        connect: () => Promise.resolve({ status: 'connected' }),
        disconnect: () => Promise.resolve(),
        getChildren: () => Promise.resolve({ status: 'ok', children: [] }),
        getDatabases: () => Promise.resolve({ status: 'ok', databases: [] }),
        executeQuery: () => Promise.resolve({ status: 'ok', resultSets: [], messages: [], durationMs: 0 }),
        createDatabase: () => Promise.resolve({ status: 'ok' }),
        listServerDrives: () => Promise.resolve({ status: 'ok', drives: [], platform: 'windows' }),
        listServerDir: () => Promise.resolve({ status: 'ok', entries: [] }),
        getDatabaseFiles: () => Promise.resolve({ status: 'ok', files: [] }),
        buildBackupSql: () => Promise.resolve({ status: 'ok', sql: '' }),
        executeBackup: () => Promise.resolve({ status: 'ok', sql: '', messages: [], durationMs: 0 }),
        readBackupHeader: () => Promise.resolve({ status: 'ok', backupSets: [] }),
        readBackupFileList: () => Promise.resolve({ status: 'ok', files: [] }),
        getBackupSets: () => Promise.resolve({ status: 'ok', history: [] }),
        buildRestoreSql: () => Promise.resolve({ status: 'ok', sql: '' }),
        executeRestore: () => Promise.resolve({ status: 'ok', sql: '', messages: [], durationMs: 0 }),
        mysqlGetBackupTools: () =>
          Promise.resolve({
            status: 'ok',
            tools: { mysqldump: { found: true }, mysql: { found: true } }
          }),
        mysqlProbeTools: () =>
          Promise.resolve({
            status: 'ok',
            tools: { mysqldump: { found: true }, mysql: { found: true } }
          }),
        mysqlBuildBackupPreview: () => Promise.resolve({ status: 'ok', command: 'mysqldump ...' }),
        mysqlExecuteBackup: () =>
          Promise.resolve({ status: 'ok', filePath: '/tmp/db.sql', engine: 'mysqldump', durationMs: 0, bytes: 0 }),
        mysqlExecuteRestore: () =>
          Promise.resolve({ status: 'ok', engine: 'mysqldump', durationMs: 0, statementsRun: 0 }),
        mysqlPickBackupPath: () => Promise.resolve({ status: 'cancelled' }),
        mysqlPickRestoreFile: () => Promise.resolve({ status: 'cancelled' }),
        postgresGetBackupTools: () =>
          Promise.resolve({
            status: 'ok',
            tools: { pgDump: { found: true }, pgRestore: { found: true }, psql: { found: true } }
          }),
        postgresProbeTools: () =>
          Promise.resolve({
            status: 'ok',
            tools: { pgDump: { found: true }, pgRestore: { found: true }, psql: { found: true } }
          }),
        postgresBuildBackupPreview: () => Promise.resolve({ status: 'ok', command: 'pg_dump ...' }),
        postgresExecuteBackup: () =>
          Promise.resolve({ status: 'ok', filePath: '/tmp/db.dump', durationMs: 0, bytes: 0 }),
        postgresExecuteRestore: () => Promise.resolve({ status: 'ok', durationMs: 0 }),
        postgresPickBackupPath: () => Promise.resolve({ status: 'cancelled' }),
        postgresPickRestoreFile: () => Promise.resolve({ status: 'cancelled' }),
        sqliteExecuteBackup: () =>
          Promise.resolve({ status: 'ok', filePath: '/tmp/db.db', durationMs: 0, bytes: 0 }),
        sqliteExecuteRestore: () => Promise.resolve({ status: 'ok', durationMs: 0 }),
        sqlitePickBackupPath: () => Promise.resolve({ status: 'cancelled' }),
        sqlitePickRestoreFile: () => Promise.resolve({ status: 'cancelled' }),
        redisExecuteBackup: () =>
          Promise.resolve({ status: 'ok', filePath: '/tmp/redis.json', durationMs: 0, bytes: 0, keyCount: 0, databaseCount: 1 }),
        redisExecuteRestore: () =>
          Promise.resolve({ status: 'ok', durationMs: 0, keysRestored: 0, keysSkipped: 0, databaseCount: 1 }),
        redisPickBackupPath: () => Promise.resolve({ status: 'cancelled' }),
        redisPickRestoreFile: () => Promise.resolve({ status: 'cancelled' }),
        mongoGetBackupTools: () =>
          Promise.resolve({
            status: 'ok',
            tools: { mongodump: { found: true }, mongorestore: { found: true } }
          }),
        mongoBuildBackupPreview: () => Promise.resolve({ status: 'ok', command: 'mongodump ...' }),
        mongoExecuteBackup: () =>
          Promise.resolve({ status: 'ok', filePath: '/tmp/db.archive', engine: 'mongodump', durationMs: 0, bytes: 0 }),
        mongoExecuteRestore: () =>
          Promise.resolve({ status: 'ok', engine: 'mongodump', durationMs: 0, collectionsRestored: 0 }),
        mongoPickBackupPath: () => Promise.resolve({ status: 'cancelled' }),
        mongoPickRestoreFile: () => Promise.resolve({ status: 'cancelled' }),
        invalidateCache: () => Promise.resolve(),
        getTableSchema: () => Promise.resolve({ status: 'ok', columns: [] }),
        getForeignKeys: () => Promise.resolve({ status: 'ok', foreignKeys: [] }),
        getCheckConstraints: () => Promise.resolve({ status: 'ok', constraints: [] }),
        getTriggers: () => Promise.resolve({ status: 'ok', triggers: [] }),
        saveTrigger: () => Promise.resolve({ status: 'ok' }),
        deleteTrigger: () => Promise.resolve({ status: 'ok' }),
        getIndexes: () => Promise.resolve({ status: 'ok', indexes: [] }),
        saveIndex: () => Promise.resolve({ status: 'ok' }),
        deleteIndex: () => Promise.resolve({ status: 'ok' }),
        rebuildIndex: () => Promise.resolve({ status: 'ok' }),
        reorganizeIndex: () => Promise.resolve({ status: 'ok' }),
        disableIndex: () => Promise.resolve({ status: 'ok' }),
        testConnection: () => Promise.resolve({ status: 'connected' }),
        getErdSchema: () => Promise.resolve({ status: 'ok', schema: { tables: [], relationships: [], indexes: [] } }),
        onEagerLoadStatus: () => () => {},
        syncWatchState: () => Promise.resolve(),
        onBackgroundRefresh: () => () => {},
        getTableTypes: () => Promise.resolve({ status: 'ok', tableTypes: [] }),
        getTableType: () => Promise.resolve({ status: 'ok', tableType: { schemaName: 'dbo', typeName: '', columns: [] } }),
        saveTableType: () => Promise.resolve({ status: 'ok' }),
        deleteTableType: () => Promise.resolve({ status: 'ok' }),
        scriptSelectTopRows: () => Promise.resolve({ status: 'ok', script: '' }),
        scriptTableDrop: () => Promise.resolve({ status: 'ok', script: '' }),
        scriptDropDatabase: () => Promise.resolve({ status: 'ok', script: '' }),
        getCapabilities: () => Promise.resolve(null),
        deleteRedisKey: () => Promise.resolve({ status: 'ok', deletedCount: 0 }),
        deleteRedisPrefix: () => Promise.resolve({ status: 'ok', deletedCount: 0 }),
        getRedisDbKeys: () => Promise.resolve({ status: 'ok', dbIndex: 0, keys: [] }),
        getRedisKeyValue: () => Promise.resolve({ status: 'ok', keyName: 'key', type: 'string', ttl: -1, value: { type: 'string', value: '' } }),
        saveRedisKey: () => Promise.resolve({ status: 'ok' }),
        getMongoAggregations: () => Promise.resolve({ status: 'ok', aggregations: [] }),
        saveMongoAggregation: () => Promise.resolve({ status: 'ok', id: 'mock-id' }),
        deleteMongoAggregation: () => Promise.resolve({ status: 'ok' }),
        runMongoAggregation: () => Promise.resolve({ status: 'ok', resultSet: { columns: [], rows: [], rowCount: 0, rawDocuments: [] } }),
        getMongoAggregationSample: () => Promise.resolve({ status: 'ok', documents: [] }),
        getCollectionFields: () => Promise.resolve({ status: 'ok', fields: [] }),
        getMongoIndexes: () => Promise.resolve({ status: 'ok', indexes: [] }),
        saveMongoIndex: () => Promise.resolve({ status: 'ok' }),
        dropMongoIndex: () => Promise.resolve({ status: 'ok' }),
        getDatabaseUserDetails: () => Promise.resolve(null),
        getDatabaseUserRoles: () => Promise.resolve([]),
        saveDatabaseUser: () => Promise.resolve({ status: 'ok' }),
        deleteDatabaseUser: () => Promise.resolve({ status: 'ok' }),
        getServerLoginDetails: () => Promise.resolve(null),
        saveServerLogin: () => Promise.resolve({ status: 'ok' }),
        deleteServerLogin: () => Promise.resolve({ status: 'ok' }),
        getServerRoleDetails: () => Promise.resolve(null),
        saveServerRole: () => Promise.resolve({ status: 'ok' }),
        deleteServerRole: () => Promise.resolve({ status: 'ok' })
      },
      file: {
        save: () => Promise.resolve({ status: 'ok' }),
        saveDialog: () => Promise.resolve({ status: 'cancelled' }),
        openDialog: () => Promise.resolve({ status: 'cancelled' }),
        saveErdDialog: () => Promise.resolve({ status: 'cancelled' }),
        openErdDialog: () => Promise.resolve({ status: 'cancelled' }),
        read: () => Promise.resolve({ status: 'error', message: 'not mocked' }),
        openSqliteDialog: () => Promise.resolve({ status: 'cancelled' }),
        checkFileExists: () => Promise.resolve(false)
      },
      autosave: {
        getRecovered: () => Promise.resolve([]),
        write: () => Promise.resolve(),
        clear: () => Promise.resolve()
      },
      menu: {
        executeRole: () => {},
        onNativeAction: () => () => {}
      },
      app: {
        quit: () => {},
        restart: () => {}
      },
      window: {
        minimize: () => {},
        maximizeRestore: () => {},
        close: () => {},
        captureScreenshotPreview: () =>
          Promise.resolve({ dataUrl: 'data:image/png;base64,AAAA', width: 1500, height: 950 }),
        saveScreenshot: () => Promise.resolve(),
        isMaximized: () => Promise.resolve(false),
        onMaximize: () => () => {},
        onUnmaximize: () => () => {}
      },
      platform: 'win32' as NodeJS.Platform,
      profiler: {
        start: () => Promise.resolve('mock-session-id'),
        stop: () => Promise.resolve(),
        pause: () => Promise.resolve(),
        resume: () => Promise.resolve(),
        onEvent: () => () => {},
        onEventUpdate: () => () => {},
        onError: () => () => {}
      },
      updater: {
        checkForUpdates: () => Promise.resolve(),
        startDownload: () => Promise.resolve(),
        cancelDownload: () => Promise.resolve(),
        installUpdate: () => Promise.resolve(),
        getVersion: () => Promise.resolve('0.0.0'),
        getPreviousVersion: () => Promise.resolve(null),
        clearPreviousVersion: () => Promise.resolve(),
        getDownloadedVersion: () => Promise.resolve(null),
        clearDownloadedVersion: () => Promise.resolve(),
        getReleaseNotes: () => Promise.resolve({ status: 'ok' as const, notes: [] }),
        onChecking: () => () => {},
        onUpdateAvailable: () => () => {},
        onNotAvailable: () => () => {},
        onDownloadProgress: () => () => {},
        onDownloadCancelled: () => () => {},
        onDownloaded: () => () => {},
        onError: () => () => {},
        onCheckForUpdatesMenu: () => () => {}
      },
      profile: {
        get: () => Promise.resolve({
          displayName: '',
          avatarFile: null,
          lockOnStartup: false,
          lockOnInactivity: false,
          inactivityTimeoutMinutes: 5,
          passwordMeta: null
        }),
        setName: () => Promise.resolve(),
        pickAvatar: () => Promise.resolve({ status: 'cancelled' as const }),
        removeAvatar: () => Promise.resolve(),
        getAvatarDataUrl: () => Promise.resolve(null),
        setAvatarTransform: () => Promise.resolve(),
        setLockSettings: () => Promise.resolve()
      },
      auth: {
        getState: () => Promise.resolve({
          hasPassword: false,
          lockOnStartup: false,
          lockOnInactivity: false,
          lockOnMinimize: false,
          inactivityTimeoutMinutes: 5
        }),
        setPassword: () => Promise.resolve({ status: 'ok' as const }),
        changePassword: () => Promise.resolve({ status: 'ok' as const }),
        removePassword: () => Promise.resolve({ status: 'ok' as const }),
        verify: () => Promise.resolve({ valid: true }),
        onLock: () => () => {}
      },
      ai: {
        checkModel: () => Promise.resolve({ exists: false }),
        listModels: () => Promise.resolve([]),
        downloadModel: () => Promise.resolve({ status: 'ok' as const, filePath: '/models/test.gguf' }),
        cancelDownload: () => Promise.resolve(),
        deleteModel: () => Promise.resolve(),
        getSchemaContext: () => Promise.resolve({ databaseName: 'mydb', provider: 'postgres', ddl: '', tableCount: 0 }),
        chatStream: () => Promise.resolve({ status: 'ok' as const }),
        abortCompletion: () => Promise.resolve(),
        onDownloadProgress: () => () => {},
        onChatChunk: () => () => {}
      }
    }
  })
}

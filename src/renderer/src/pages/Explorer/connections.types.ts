export type ConnectionProvider = 'sqlserver' | 'postgres' | 'mysql' | 'sqlite' | 'redis' | 'mongodb'

export interface ConnectionRecord {
  id: string
  name: string
  provider: ConnectionProvider
  host: string
  port: number
  username: string
  password: string
  rememberPassword: boolean
  defaultDatabase: string
  /** Path to the SQLite database file (used when provider === 'sqlite'). */
  filePath?: string
  color?: string
  environmentId?: string
  autoConnect?: boolean
  eagerLoading?: boolean
  backgroundAutoRefresh?: boolean
  erdFiles?: { databaseName: string; filePath: string }[]
  createdAt?: string
  lastUsedAt?: string
  // ── Redis-specific fields ─────────────────────────────────────────────────
  redisMode?: 'standalone' | 'cluster' | 'sentinel'
  sentinelMasterName?: string
  sentinelNodes?: string
  tlsEnabled?: boolean
  tlsServername?: string
  tlsRejectUnauthorized?: boolean
  sshEnabled?: boolean
  sshHost?: string
  sshPort?: number
  sshUsername?: string
  sshAuthMode?: 'password' | 'privateKey'
  sshPassword?: string
  sshPrivateKeyPath?: string
  sshPassphrase?: string
  /** When true, only Redis logical databases that contain at least one key are shown in the tree. */
  redisHideEmptyDatabases?: boolean
  // ── MongoDB-specific fields ───────────────────────────────────────────────
  /** When true, connect via DNS Seedlist (SRV) — generates mongodb+srv:// URI. */
  mongodbSrv?: boolean
  mongodbUri?: string
  mongodbAuthMechanism?: 'SCRAM-SHA-1' | 'SCRAM-SHA-256' | 'MONGODB-X509' | 'GSSAPI' | 'PLAIN' | 'MONGODB-AWS'
  mongodbAuthSource?: string
  mongodbAuthMechanismProperties?: string
  mongodbReplicaSet?: string
  mongodbDirectConnection?: boolean
  tlsCAFile?: string
  tlsCertificateKeyFile?: string
  tlsCertificateKeyFilePassword?: string
  tlsAllowInvalidHostnames?: boolean
  tlsAllowInvalidCertificates?: boolean
}

export type ExplorerNodeKind =
  | 'databases-folder'
  | 'database'
  | 'tables-folder'
  | 'views-folder'
  | 'stored-procedures-folder'
  | 'functions-folder'
  | 'types-folder'
  | 'type-data-types-folder'
  | 'type-tables-folder'
  | 'type-memory-optimized-tables-folder'
  | 'table'
  | 'view'
  | 'stored-procedure'
  | 'function'
  | 'type'
  | 'table-columns-folder'
  | 'table-keys-folder'
  | 'table-constraints-folder'
  | 'table-triggers-folder'
  | 'table-indexes-folder'
  | 'table-statistics-folder'
  | 'column'
  | 'column-pk'
  | 'key'
  | 'constraint'
  | 'trigger'
  | 'index'
  | 'statistic'
  | 'type-enums-folder'
  | 'type-composites-folder'
  | 'security-folder'
  | 'security-users-folder'
  | 'security-roles-folder'
  | 'security-schemas-folder'
  | 'security-user'
  | 'security-role'
  | 'security-schema'
  // ── Redis node kinds ─────────────────────────────────────────────────
  | 'redis-keyspaces-folder'
  | 'redis-keyspace'
  | 'redis-key-prefix'
  | 'redis-key'
  // ── MongoDB node kinds ───────────────────────────────────────────────
  | 'mongodb-collections-folder'
  | 'mongodb-collection'
  | 'mongodb-collection-documents'
  | 'mongodb-collection-indexes'
  | 'mongodb-collection-aggregations'
  | 'mongodb-collection-validation'
  | 'mongodb-index'
  | 'mongodb-aggregation'

export interface ExplorerNode {
  id: string
  label: string
  kind: ExplorerNodeKind
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface ConnectionRuntimeState {
  status: ConnectionStatus
  errorMessage?: string
}

export type NodeLoadStatus = 'loading' | 'loaded' | 'error'

export interface NodeLoadState {
  status: NodeLoadStatus
  children?: ExplorerNode[]
  errorMessage?: string
}

export type ExecutionPlanCapability =
  | { kind: 'none' }
  | { kind: 'xml-visual'; buttonLabel: string }
  | { kind: 'explain-text'; buttonLabel: string }

export type ClientStatisticsCapability =
  | { kind: 'none' }
  | { kind: 'client-stats'; buttonLabel: string }

export interface ProviderCapabilities {
  executionPlan: ExecutionPlanCapability
  clientStatistics: ClientStatisticsCapability
  defaultSchema: string
  hasCreateDatabase: boolean
  hasStoredProcedures: boolean
  hasFunctions: boolean
  hasUserDefinedTypes: boolean
  hasTableTypes: boolean
  hasMemoryOptimizedTableTypes: boolean
  hasStatistics: boolean
  hasIndexRebuild: boolean
  hasIndexReorganize: boolean
  hasIndexDisable: boolean
  hasProfiler: boolean
  hasCreateTable: boolean
  hasBackupRestore: boolean
}

export interface QueryResultSet {
  columns: string[]
  rows: Record<string, unknown>[]
  rowCount: number
  columnKeyMeta?: Array<{ isPrimaryKey: boolean; isForeignKey: boolean; isNullable?: boolean; isBoolean?: boolean } | null>
  sourceTable?: { schema: string; table: string }
  rawDocuments?: string[]
}

export interface QueryMessage {
  type: 'info' | 'error'
  text: string
}

export interface ExecuteQuerySuccessResult {
  status: 'ok'
  resultSets: QueryResultSet[]
  messages: QueryMessage[]
  durationMs: number
  executionPlanXml?: string
}

export interface ExecuteQueryErrorResult {
  status: 'error'
  message: string
}

export type ExecuteQueryResult = ExecuteQuerySuccessResult | ExecuteQueryErrorResult

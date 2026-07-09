import { ElectronAPI } from '@electron-toolkit/preload'

export interface EnvironmentDefinition {
  id: string
  name: string
  description: string
  critical: boolean
  color: string
}

export type ErdBackground = 'none' | 'dots' | 'grid'

export type ConnectionSortField = 'name' | 'createdAt' | 'lastUsedAt' | 'provider' | 'environment' | 'status'
export type SortDirection = 'asc' | 'desc'

export interface ConnectionSortOrder {
  field: ConnectionSortField
  direction: SortDirection
}

export interface AppSettings {
  language: string
  theme: string
  nativeThemeSource: 'dark' | 'light' | 'system'
  showSideNavigationBar: boolean
  syntaxHighlighting: boolean
  showGridLines: boolean
  fontScaling: number
  queryTimeout: number
  showSystemDatabases: boolean
  selectTopRowsCount: number
  defaultErdBackground: ErdBackground
  autoIncludeExecutionPlan: boolean
  autoIncludeClientStatistics: boolean
  customTitlebar: boolean
  enableAnimations: boolean
  uppercaseColumnHeaders: boolean
  showKeyIconsInResults: boolean
  useInteractiveTables: boolean
  environments: EnvironmentDefinition[]
  defaultConnectionSort: ConnectionSortOrder
  askBeforeIncludingSecretsInComparisonExport: boolean
  includeSecretsInComparisonExportByDefault: boolean
  likeConfetti: boolean
  showTipsAndTricks: boolean
  copyJsonFormatted: boolean
  hfToken: string
  showToolbarTextButtons: boolean
  darkTerminals: boolean
  glassEffectHour: number
  glassEffectManualColor: string
  analyticsEnabled: boolean
  mysqlDumpPath: string
  mysqlClientPath: string
  pgDumpPath: string
  pgRestorePath: string
  psqlPath: string
  mongodumpPath: string
  mongorestorePath: string
}

export type ConnectionProvider = 'sqlserver' | 'postgres' | 'mysql' | 'sqlite' | 'redis' | 'mongodb'

export type ComparisonScopeKey =
  | 'schema.tablesCoreConstraints'
  | 'schema.programmableObjects'
  | 'schema.indexingSubsystems'
  | 'schema.securityMetadataProfiles'
  | 'data.rowLevelValues'
  | 'data.keyMatchedSets'

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
  /** Full MongoDB connection URI (overrides individual host/port/auth fields when set). */
  mongodbUri?: string
  /** Authentication mechanism for MongoDB. Defaults to SCRAM-SHA-256 when not specified. */
  mongodbAuthMechanism?: 'SCRAM-SHA-1' | 'SCRAM-SHA-256' | 'MONGODB-X509' | 'GSSAPI' | 'PLAIN' | 'MONGODB-AWS'
  /** Authentication database. Defaults to 'admin'; use '$external' for X.509/Kerberos/LDAP/AWS. */
  mongodbAuthSource?: string
  /** Comma-separated mechanism properties, e.g. "SERVICE_NAME:mongodb,CANONICALIZE_HOST_NAME:none" */
  mongodbAuthMechanismProperties?: string
  /** Replica set name for replica set connections (e.g. "rs0"). */
  mongodbReplicaSet?: string
  /** Direct connection flag — bypasses SRV and topology discovery. */
  mongodbDirectConnection?: boolean
  /** Path to a CA certificate PEM file for TLS verification. */
  tlsCAFile?: string
  /** Path to the client certificate/key PEM file for TLS or X.509 auth. */
  tlsCertificateKeyFile?: string
  /** Passphrase for the client certificate/key file (if encrypted). */
  tlsCertificateKeyFilePassword?: string
  /** Whether to skip hostname verification on the TLS certificate. */
  tlsAllowInvalidHostnames?: boolean
  /** Whether to skip certificate validation entirely. */
  tlsAllowInvalidCertificates?: boolean
}

export interface ComparisonEndpoint {
  connectionId: string
  databaseName: string
  provider: ConnectionProvider
}

export interface ComparisonTableKeyMapping {
  sourceTable: string
  targetTable: string
  sourceColumns: string[]
  targetColumns: string[]
}

export interface ComparisonRecord {
  id: string
  name: string
  description: string
  source: ComparisonEndpoint
  target: ComparisonEndpoint
  scopeKeys: ComparisonScopeKey[]
  tableKeyMappings: ComparisonTableKeyMapping[]
  createdAt: string
  updatedAt: string
}

export type ComparisonChangeType = 'added' | 'removed' | 'modified' | 'unsupported'

export type ComparisonReportCategory =
  | 'tables'
  | 'columns'
  | 'foreignKeys'
  | 'checkConstraints'
  | 'indexes'
  | 'triggers'
  | 'views'
  | 'storedProcedures'
  | 'functions'
  | 'securityUsers'
  | 'securityRoles'
  | 'securitySchemas'
  | 'rows'

export interface ComparisonReportItem {
  id: string
  scopeKey: ComparisonScopeKey
  category: ComparisonReportCategory
  changeType: ComparisonChangeType
  objectName: string
  details: string[]
  sourceValue?: string
  targetValue?: string
}

export interface ComparisonExecutionReport {
  comparisonId: string
  comparisonName: string
  generatedAt: string
  durationMs: number
  counts: {
    total: number
    added: number
    removed: number
    modified: number
    unsupported: number
  }
  items: ComparisonReportItem[]
  warnings: string[]
}

interface SettingsAPI {
  initial: AppSettings
  getAll: () => Promise<AppSettings>
  set: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => Promise<void>
  reset: () => Promise<void>
}

interface AnalyticsAPI {
  track: (name: string, params?: Record<string, unknown>) => Promise<void>
  pageView: (pageId: string) => Promise<void>
}

interface ConnectionsAPI {
  getAll: () => Promise<ConnectionRecord[]>
  create: (record: Omit<ConnectionRecord, 'id'>) => Promise<ConnectionRecord>
  update: (record: ConnectionRecord) => Promise<ConnectionRecord>
  delete: (id: string) => Promise<void>
  addErdFile: (connectionId: string, databaseName: string, filePath: string) => Promise<void>
  removeErdFile: (connectionId: string, filePath: string) => Promise<void>
}

export type ComparisonSyncDirection = 'forward' | 'swapped'

export interface SyncScriptSection {
  itemId: string
  objectName: string
  category: string
  changeType: string
  sql: string | null
  skipped: boolean
  skipReason?: string
}

export type GenerateSyncScriptResult =
  | { status: 'ok'; script: string; sections: SyncScriptSection[]; skippedCount: number }
  | { status: 'error'; message: string }

export type ExecuteSyncResult =
  | { status: 'ok'; revertScript?: string }
  | { status: 'error'; message: string }

interface ComparisonsAPI {
  getAll: () => Promise<ComparisonRecord[]>
  create: (record: Omit<ComparisonRecord, 'id' | 'createdAt' | 'updatedAt'>) => Promise<ComparisonRecord>
  update: (record: ComparisonRecord) => Promise<ComparisonRecord>
  delete: (id: string) => Promise<void>
  execute: (id: string) => Promise<ComparisonExecutionReport>
  generateSyncScript: (
    id: string,
    report: ComparisonExecutionReport,
    direction: ComparisonSyncDirection
  ) => Promise<GenerateSyncScriptResult>
  executeSync: (
    id: string,
    report: ComparisonExecutionReport,
    direction: ComparisonSyncDirection,
    generateRevertScript: boolean
  ) => Promise<ExecuteSyncResult>
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
  | 'redis-keyspaces-folder'
  | 'redis-keyspace'
  | 'redis-key-prefix'
  | 'redis-key'
  | 'security-folder'
  | 'security-users-folder'
  | 'security-roles-folder'
  | 'security-schemas-folder'
  | 'security-user'
  | 'security-role'
  | 'security-schema'
  | 'mongodb-collections-folder'
  | 'mongodb-collection'
  | 'mongodb-collection-documents'
  | 'mongodb-collection-indexes'
  | 'mongodb-collection-aggregations'
  | 'mongodb-collection-validation'
  | 'mongodb-index'

export interface ExplorerNode {
  id: string
  label: string
  kind: ExplorerNodeKind
}

export interface ConnectSuccessResult {
  status: 'connected'
}

export interface ConnectErrorResult {
  status: 'error'
  message: string
}

export type ConnectResult = ConnectSuccessResult | ConnectErrorResult

export interface GetChildrenSuccessResult {
  status: 'ok'
  children: ExplorerNode[]
}

export interface GetChildrenErrorResult {
  status: 'error'
  message: string
}

export type GetChildrenResult = GetChildrenSuccessResult | GetChildrenErrorResult

export interface QueryResultSet {
  columns: string[]
  rows: Record<string, unknown>[]
  rowCount: number
  columnKeyMeta?: Array<{ isPrimaryKey: boolean; isForeignKey: boolean; isNullable?: boolean; isBoolean?: boolean } | null>
  rawDocuments?: string[]
  sourceTable?: { schema: string; table: string }
}

export interface QueryMessage {
  type: 'info' | 'error'
  text: string
}

export interface ClientStatistics {
  totalExecutionTimeMs: number
  rowsReturned: number
  resultSetsCount: number
  bytesSentToServer: number
}

export interface ExecuteQuerySuccessResult {
  status: 'ok'
  resultSets: QueryResultSet[]
  messages: QueryMessage[]
  durationMs: number
  executionPlanXml?: string
  clientStatistics?: ClientStatistics
}

export interface ExecuteQueryErrorResult {
  status: 'error'
  message: string
}

export type ExecuteQueryResult = ExecuteQuerySuccessResult | ExecuteQueryErrorResult

export interface CreateDatabaseSuccessResult {
  status: 'ok'
}

export interface CreateDatabaseErrorResult {
  status: 'error'
  message: string
  sql?: string
}

export type CreateDatabaseResult = CreateDatabaseSuccessResult | CreateDatabaseErrorResult

export type CreateCollectionResult =
  | { status: 'ok' }
  | { status: 'error'; message: string }

export type InsertMongoDocumentResult =
  | { status: 'ok'; insertedId: string }
  | { status: 'error'; message: string }

export type ReplaceMongoDocumentResult =
  | { status: 'ok' }
  | { status: 'error'; message: string }

export type DeleteMongoDocumentResult =
  | { status: 'ok' }
  | { status: 'error'; message: string }

export interface MongoShellCommandResult {
  status: 'ok' | 'error'
  output: string
}

export interface MongoIndexField {
  fieldName: string
  indexType: 1 | -1 | '2dsphere' | 'text'
}

export interface SaveMongoIndexParams {
  collectionName: string
  name?: string
  fields: MongoIndexField[]
  unique?: boolean
  expireAfterSeconds?: number
  partialFilterExpression?: string
  wildcardProjection?: string
  sparse?: boolean
  collation?: string
}

export interface MongoIndexDefinition {
  name: string
  fields: MongoIndexField[]
  unique?: boolean
  expireAfterSeconds?: number
  partialFilterExpression?: unknown
  wildcardProjection?: unknown
  sparse?: boolean
  collation?: unknown
  isIdIndex?: boolean
}

export type GetMongoIndexesResult =
  | { status: 'ok'; indexes: MongoIndexDefinition[] }
  | { status: 'error'; message: string }

export type SaveMongoIndexResult =
  | { status: 'ok' }
  | { status: 'error'; message: string }

export type DropMongoIndexResult =
  | { status: 'ok' }
  | { status: 'error'; message: string }

export type GetCollectionFieldsResult =
  | { status: 'ok'; fields: string[] }
  | { status: 'error'; message: string }

export interface MongoAggregationStage {
  id: string
  stageType: string
  json: string
  enabled: boolean
  collapsed: boolean
}

export interface MongoAggregationDefinition {
  id: string
  connectionId: string
  databaseName: string
  collectionName: string
  name: string
  stages: MongoAggregationStage[]
  createdAt: string
  updatedAt: string
}

export interface SaveMongoAggregationParams {
  name: string
  stages: MongoAggregationStage[]
}

export type GetMongoAggregationsResult =
  | { status: 'ok'; aggregations: MongoAggregationDefinition[] }
  | { status: 'error'; message: string }

export type SaveMongoAggregationResult =
  | { status: 'ok'; id: string }
  | { status: 'error'; message: string }

export type DeleteMongoAggregationResult =
  | { status: 'ok' }
  | { status: 'error'; message: string }

export type RunMongoAggregationResult =
  | { status: 'ok'; resultSet: QueryResultSet }
  | { status: 'error'; message: string }

export type GetMongoAggregationSampleResult =
  | { status: 'ok'; documents: string[] }
  | { status: 'error'; message: string }

export interface MongoValidationDefinition {
  validator: Record<string, unknown>
  validationAction: string
  validationLevel: string
}

export type GetMongoValidationResult =
  | { status: 'ok'; definition: MongoValidationDefinition }
  | { status: 'error'; message: string }

export type SaveMongoValidationResult =
  | { status: 'ok' }
  | { status: 'error'; message: string }

export type TestMongoValidationResult =
  | { status: 'ok'; passed: string[]; failed: string[] }
  | { status: 'error'; message: string }

export type GenerateMongoValidationRulesResult =
  | { status: 'ok'; validatorJson: string }
  | { status: 'error'; message: string }

export type GetDatabasesResult =
  | { status: 'ok'; databases: string[] }
  | { status: 'error'; message: string }

export interface TableColumnMeta {
  name: string
  type: string
  maxLength: number | null
  precision: number | null
  scale: number | null
  isNullable: boolean
  defaultValue: string | null
  isIdentity: boolean
  identitySeed: number | null
  identityIncrement: number | null
  isPrimaryKey: boolean
}

export interface GetTableSchemaSuccessResult {
  status: 'ok'
  columns: TableColumnMeta[]
}

export interface GetTableSchemaErrorResult {
  status: 'error'
  message: string
}

export type GetTableSchemaResult = GetTableSchemaSuccessResult | GetTableSchemaErrorResult

export interface ErdColumn {
  name: string
  type: string
  maxLength: number | null
  isNullable: boolean
  isPrimaryKey: boolean
  isForeignKey: boolean
}

export interface ErdTable {
  schema: string
  name: string
  columns: ErdColumn[]
}

export interface ErdRelationship {
  constraintName: string
  fromSchema: string
  fromTable: string
  fromColumn: string
  toSchema: string
  toTable: string
  toColumn: string
}

export interface ErdIndex {
  schema: string
  table: string
  name: string
  typeDesc: string
  isUnique: boolean
  isPrimaryKey: boolean
}

export interface ErdSchema {
  tables: ErdTable[]
  relationships: ErdRelationship[]
  indexes: ErdIndex[]
}

export type GetErdSchemaResult =
  | { status: 'ok'; schema: ErdSchema }
  | { status: 'error'; message: string }

export type ForeignKeyRule = 'NO_ACTION' | 'CASCADE' | 'SET_NULL' | 'SET_DEFAULT'

export interface ForeignKeyDefinition {
  constraintName: string
  columnName: string
  referencedSchema: string
  referencedTable: string
  referencedColumn: string
  isEnabled: boolean
  enforceForReplication: boolean
  deleteRule: ForeignKeyRule
  updateRule: ForeignKeyRule
  description?: string
}

export type GetForeignKeysResult =
  | { status: 'ok'; foreignKeys: ForeignKeyDefinition[] }
  | { status: 'error'; message: string }

export interface CheckConstraintDefinition {
  constraintName: string
  condition: string
  isEnabled: boolean
  checkExistingData: boolean
  enforceForReplication: boolean
  description?: string
}

export type GetCheckConstraintsResult =
  | { status: 'ok'; constraints: CheckConstraintDefinition[] }
  | { status: 'error'; message: string }

export interface TriggerDefinition {
  triggerName: string
  isInsteadOf: boolean
  isInsert: boolean
  isUpdate: boolean
  isDelete: boolean
  body: string
  description?: string
}

export type GetTriggersResult =
  | { status: 'ok'; triggers: TriggerDefinition[] }
  | { status: 'error'; message: string }

export interface SaveTriggerParams {
  triggerName: string
  schemaName: string
  tableName: string
  isInsteadOf: boolean
  isInsert: boolean
  isUpdate: boolean
  isDelete: boolean
  body: string
  description?: string
}

export type SaveTriggerResult =
  | { status: 'ok' }
  | { status: 'error'; message: string }

export type DeleteTriggerResult =
  | { status: 'ok' }
  | { status: 'error'; message: string }

export interface IndexColumnEntry {
  columnName: string
  keyOrdinal: number
  isDescendingKey: boolean
  isIncludedColumn: boolean
}

export interface IndexDefinition {
  name: string
  schemaName: string
  tableName: string
  type: string
  isUnique: boolean
  isPrimaryKey: boolean
  isDisabled: boolean
  columns: IndexColumnEntry[]
  filterExpression?: string
  fillFactor?: number
  padIndex?: boolean
  description?: string
}

export type GetIndexesResult =
  | { status: 'ok'; indexes: IndexDefinition[] }
  | { status: 'error'; message: string }

export interface SaveIndexParams {
  name: string
  schemaName: string
  tableName: string
  type: 'CLUSTERED' | 'NONCLUSTERED'
  isUnique: boolean
  columns: IndexColumnEntry[]
  filterExpression?: string
  fillFactor?: number
  padIndex?: boolean
  description?: string
}

export type SaveIndexResult =
  | { status: 'ok' }
  | { status: 'error'; message: string }

export type DeleteIndexResult =
  | { status: 'ok' }
  | { status: 'error'; message: string }

export type RebuildIndexResult =
  | { status: 'ok' }
  | { status: 'error'; message: string }

export type ReorganizeIndexResult =
  | { status: 'ok' }
  | { status: 'error'; message: string }

export type DisableIndexResult =
  | { status: 'ok' }
  | { status: 'error'; message: string }

export interface ViewDefinition {
  schemaName: string
  viewName: string
  definition: string
  isSchemabound: boolean
  isEncrypted: boolean
}

export type GetViewsResult =
  | { status: 'ok'; views: ViewDefinition[] }
  | { status: 'error'; message: string }

export interface SaveViewParams {
  schemaName: string
  viewName: string
  definition: string
}

export type SaveViewResult =
  | { status: 'ok' }
  | { status: 'error'; message: string }

export type DeleteViewResult =
  | { status: 'ok' }
  | { status: 'error'; message: string }

export interface StoredProcedureParameter {
  name: string
  type: string
  defaultValue?: string
}

export interface StoredProcedureDefinition {
  schemaName: string
  procedureName: string
  description: string
  parameters: StoredProcedureParameter[]
  body: string
}

export interface SaveStoredProcedureParams {
  schemaName: string
  procedureName: string
  description: string
  parameters: StoredProcedureParameter[]
  body: string
}

export type GetStoredProceduresResult =
  | { status: 'ok'; procedures: StoredProcedureDefinition[] }
  | { status: 'error'; message: string }

export type SaveStoredProcedureResult =
  | { status: 'ok' }
  | { status: 'error'; message: string }

export type DeleteStoredProcedureResult =
  | { status: 'ok' }
  | { status: 'error'; message: string }

export interface DataTypeDefinition {
  schemaName: string
  typeName: string
  baseType: string
  maxLength: number
  precision: number
  scale: number
  isNullable: boolean
}

export interface SaveDataTypeParams {
  schemaName: string
  typeName: string
  baseType: string
  isMax: boolean
  length: number | null
  precision: number | null
  scale: number | null
  isNullable: boolean
}

export type GetDataTypesResult =
  | { status: 'ok'; dataTypes: DataTypeDefinition[] }
  | { status: 'error'; message: string }

export type SaveDataTypeResult =
  | { status: 'ok' }
  | { status: 'error'; message: string }

export type DeleteDataTypeResult =
  | { status: 'ok' }
  | { status: 'error'; message: string }

export interface TableTypeColumn {
  name: string
  type: string
  /** Raw max_length from sys.types. -1 = MAX. 0 = not applicable. */
  maxLength: number
  precision: number
  scale: number
  isNullable: boolean
  isPrimaryKey?: boolean
}

export interface TableTypeDefinition {
  schemaName: string
  typeName: string
  columns: TableTypeColumn[]
}

export interface TableTypeColumnParam {
  name: string
  type: string
  length: number | 'MAX' | null
  precision: number | null
  scale: number | null
  isNullable: boolean
  isPrimaryKey?: boolean
}

export interface SaveTableTypeParams {
  schemaName: string
  typeName: string
  columns: TableTypeColumnParam[]
}

export type GetTableTypesResult =
  | { status: 'ok'; tableTypes: Array<{ schemaName: string; typeName: string }> }
  | { status: 'error'; message: string }

export type GetTableTypeResult =
  | { status: 'ok'; tableType: TableTypeDefinition }
  | { status: 'error'; message: string }

export type SaveTableTypeResult =
  | { status: 'ok' }
  | { status: 'error'; message: string }

export type DeleteTableTypeResult =
  | { status: 'ok' }
  | { status: 'error'; message: string }

export type GetMemoryOptimizedTableTypesResult =
  | { status: 'ok'; tableTypes: Array<{ schemaName: string; typeName: string }> }
  | { status: 'error'; message: string }

export type GetMemoryOptimizedTableTypeResult =
  | { status: 'ok'; tableType: TableTypeDefinition }
  | { status: 'error'; message: string }

export interface SaveMemoryOptimizedTableTypeParams {
  schemaName: string
  typeName: string
  columns: TableTypeColumnParam[]
}

export type SaveMemoryOptimizedTableTypeResult =
  | { status: 'ok' }
  | { status: 'error'; message: string }

export type DeleteMemoryOptimizedTableTypeResult =
  | { status: 'ok' }
  | { status: 'error'; message: string }

export type DeleteRedisKeyResult =
  | { status: 'ok'; deletedCount: number }
  | { status: 'error'; message: string }

// ─── Redis Explorer Types ─────────────────────────────────────────────────────

export type RedisKeyType = 'string' | 'list' | 'set' | 'zset' | 'hash' | 'stream'

export interface RedisKeyEntry {
  keyName: string
  type: RedisKeyType
  ttl: number
  sizeBytes: number | null
  valuePreview: string
}

export type GetRedisDbKeysResult =
  | { status: 'ok'; dbIndex: number; keys: RedisKeyEntry[] }
  | { status: 'error'; message: string }

export type RedisKeyFullValue =
  | { type: 'string'; value: string }
  | { type: 'list'; items: string[] }
  | { type: 'set'; members: string[] }
  | { type: 'zset'; members: Array<{ member: string; score: number }> }
  | { type: 'hash'; fields: Array<{ field: string; value: string }> }
  | { type: 'stream'; entries: Array<{ id: string; fields: Record<string, string> }>; totalLength: number }

export type GetRedisKeyValueResult =
  | { status: 'ok'; keyName: string; type: RedisKeyType; ttl: number; value: RedisKeyFullValue }
  | { status: 'error'; message: string }

export interface SaveRedisKeyParams {
  keyName: string
  type: RedisKeyType
  ttl: number
  value: RedisKeyFullValue
}

export type SaveRedisKeyResult =
  | { status: 'ok' }
  | { status: 'error'; message: string }

// ─── Redis Backup & Restore Types ─────────────────────────────────────────────

export type RedisBackupScope = { kind: 'database'; databaseIndex: number } | { kind: 'all' }

export interface RedisBackupOptions {
  filePath: string
  scope: RedisBackupScope
  compress: boolean
}

export type RedisRestoreConflict = 'replace' | 'flush' | 'skip'

export interface RedisRestoreOptions {
  filePath: string
  conflict: RedisRestoreConflict
  targetDatabaseIndex?: number
}

export type ExecuteRedisBackupResult =
  | {
      status: 'ok'
      filePath: string
      durationMs: number
      bytes: number
      keyCount: number
      databaseCount: number
    }
  | { status: 'error'; message: string }

export type ExecuteRedisRestoreResult =
  | {
      status: 'ok'
      durationMs: number
      keysRestored: number
      keysSkipped: number
      databaseCount: number
    }
  | { status: 'error'; message: string }

export type MongoBackupEngine = 'mongodump' | 'js'

export interface MongoBackupOptions {
  databaseName: string
  filePath: string
  gzip: boolean
  mongodumpPath?: string
}

export interface MongoRestoreOptions {
  filePath: string
  sourceDatabaseName: string
  targetDatabaseName: string
  drop: boolean
  stopOnError: boolean
  mongorestorePath?: string
}

export interface MongoToolInfo {
  found: boolean
  path?: string
  version?: string
}

export interface MongoBackupToolStatus {
  mongodump: MongoToolInfo
  mongorestore: MongoToolInfo
}

export type MongoBackupToolStatusResult =
  | { status: 'ok'; tools: MongoBackupToolStatus }
  | { status: 'error'; message: string }

export type BuildMongoBackupPreviewResult =
  | { status: 'ok'; command: string }
  | { status: 'error'; message: string }

export type ExecuteMongoBackupResult =
  | { status: 'ok'; filePath: string; engine: MongoBackupEngine; durationMs: number; bytes: number }
  | { status: 'error'; message: string }

export type ExecuteMongoRestoreResult =
  | { status: 'ok'; engine: MongoBackupEngine; durationMs: number; collectionsRestored?: number }
  | { status: 'error'; message: string }

// ─── Redis Dashboard Types ────────────────────────────────────────────────────

export interface RedisDashboardSnapshot {
  fetchedAt: string
  mode: 'standalone' | 'cluster' | 'sentinel'
  server: {
    redisVersion: string
    redisMode: string
    os: string
    archBits: number
    processId: number
    runId: string
    tcpPort: number
    uptimeInSeconds: number
    uptimeInDays: number
    hz: number
    configuredHz?: number
    executablePath?: string
    configFile?: string
  }
  memory: {
    usedMemoryBytes: number
    usedMemoryHuman: string
    usedMemoryRssBytes?: number
    usedMemoryRssHuman?: string
    usedMemoryPeakBytes: number
    usedMemoryPeakHuman: string
    usedMemoryPeakPercentage?: string
    usedMemoryLuaBytes?: number
    usedMemoryLuaHuman?: string
    maxMemoryBytes?: number
    maxMemoryHuman?: string
    maxMemoryPolicy?: string
    memFragmentationRatio?: number
    memFragmentationBytes?: number
    memAllocator?: string
  }
  stats: {
    connectedClients: number
    blockedClients: number
    totalConnectionsReceived: number
    totalCommandsProcessed: number
    instantaneousOpsPerSec: number
    totalNetInputBytes?: number
    totalNetOutputBytes?: number
    rejectedConnections: number
    expiredKeys: number
    evictedKeys: number
    keyspaceHits: number
    keyspaceMisses: number
    keyspaceHitRatio?: number
    pubsubChannels?: number
    pubsubPatterns?: number
  }
  persistence: {
    loading: boolean
    rdbChangesSinceLastSave: number
    rdbBgsaveInProgress: boolean
    rdbLastBgsaveStatus: string
    rdbLastBgsaveTimeSec?: number
    rdbCurrentBgsaveTimeSec?: number
    rdbLastSaveTime?: number
    aofEnabled: boolean
    aofRewriteInProgress?: boolean
    aofRewriteScheduled?: boolean
    aofCurrentSize?: number
    aofBaseSize?: number
    aofLastRewriteTimeSec?: number
    aofLastBgrewriteStatus?: string
  }
  replication: {
    role: string
    connectedSlaves?: number
    masterHost?: string
    masterPort?: number
    masterLinkStatus?: string
    masterLastIoSecondsAgo?: number
    replicationId?: string
    replicationOffset?: number
    nodes?: Array<{
      id: string
      addr: string
      role: string
      master?: string
      connected: boolean
      flags: string
    }>
  }
  cpu?: {
    usedCpuSys?: number
    usedCpuUser?: number
    usedCpuSysChildren?: number
    usedCpuUserChildren?: number
  }
  keyspaces: Array<{
    dbIndex: number
    keyCount: number
    expiresCount?: number
    avgTtl?: number
  }>
  rawInfo: Array<{
    section: string
    key: string
    value: string
  }>
  commandStats?: Array<{
    command: string
    calls: number
    usecTotal: number
    usecPerCall: number
    rejectedCalls?: number
    failedCalls?: number
  }>
}

export type RedisDashboardResult =
  | { status: 'ok'; snapshot: RedisDashboardSnapshot }
  | { status: 'error'; message: string }

export type RedisDashboardCommand =
  | 'BGSAVE'
  | 'BGREWRITEAOF'
  | 'MEMORY_PURGE'
  | 'SLOWLOG_RESET'
  | 'FLUSHDB'
  | 'FLUSHALL'

export type RedisDashboardCommandResult =
  | { status: 'ok'; message?: string }
  | { status: 'error'; message: string }

export type GenerateScriptResult =
  | { status: 'ok'; script: string }
  | { status: 'error'; message: string }

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

// ─── Backup & Restore (SQL Server) ───────────────────────────────────────────

export interface ServerDirEntry {
  name: string
  isDirectory: boolean
}

export type ListServerDrivesResult =
  | { status: 'ok'; drives: string[]; platform: 'windows' | 'linux' }
  | { status: 'error'; message: string }

export type ListServerDirResult =
  | { status: 'ok'; entries: ServerDirEntry[] }
  | { status: 'error'; message: string }

export interface DatabaseFileEntry {
  logicalName: string
  physicalName: string
  type: 'data' | 'log'
  fileGroup: string | null
}

export type GetDatabaseFilesResult =
  | { status: 'ok'; files: DatabaseFileEntry[] }
  | { status: 'error'; message: string }

export type BackupType = 'full' | 'differential' | 'log'
export type BackupCompression = 'default' | 'compress' | 'no-compress'
export type BackupOverwrite = 'append' | 'overwrite'
export type LogTailAction = 'truncate' | 'tail-norecovery'

export interface BackupExpiration {
  mode: 'none' | 'after-days' | 'on-date'
  afterDays?: number
  onDate?: string
}

export interface BackupOptions {
  databaseName: string
  backupType: BackupType
  filesAndFilegroups?: string[]
  destinations: string[]
  overwrite: BackupOverwrite
  verify: boolean
  checksum: boolean
  continueOnError: boolean
  logTail?: LogTailAction
  expiration: BackupExpiration
  compression: BackupCompression
  name?: string
}

export type BuildBackupSqlResult =
  | { status: 'ok'; sql: string }
  | { status: 'error'; message: string }

export type ExecuteBackupResult =
  | { status: 'ok'; sql: string; messages: QueryMessage[]; durationMs: number }
  | { status: 'error'; message: string; sql?: string }

export interface BackupSetEntry {
  position: number
  name: string | null
  backupType: BackupType
  serverName: string | null
  databaseName: string | null
  backupStartDate: string | null
  backupFinishDate: string | null
}

export type ReadBackupHeaderResult =
  | { status: 'ok'; backupSets: BackupSetEntry[] }
  | { status: 'error'; message: string }

export interface BackupFileEntry {
  logicalName: string
  physicalName: string
  type: 'data' | 'log' | 'other'
}

export type ReadBackupFileListResult =
  | { status: 'ok'; files: BackupFileEntry[] }
  | { status: 'error'; message: string }

export interface BackupHistoryEntry {
  databaseName: string
  backupType: BackupType
  backupFinishDate: string | null
  physicalDevice: string
  position: number
}

export type GetBackupSetsResult =
  | { status: 'ok'; history: BackupHistoryEntry[] }
  | { status: 'error'; message: string }

export type RestoreRecoveryState = 'recovery' | 'norecovery' | 'standby'

export interface RestoreMoveEntry {
  logicalName: string
  targetPath: string
}

export interface RestoreSourceEntry {
  path: string
  position: number
  backupType: BackupType
}

export interface RestoreOptions {
  targetDatabaseName: string
  source: RestoreSourceEntry[]
  replace: boolean
  takeTailLogBackup: boolean
  tailLogPath?: string
  restrictedUser: boolean
  recoveryState: RestoreRecoveryState
  standbyFile?: string
  move: RestoreMoveEntry[]
}

export type BuildRestoreSqlResult =
  | { status: 'ok'; sql: string }
  | { status: 'error'; message: string }

export type ExecuteRestoreResult =
  | { status: 'ok'; sql: string; messages: QueryMessage[]; durationMs: number }
  | { status: 'error'; message: string; sql?: string }

export type MySqlBackupContent = 'schema-and-data' | 'schema-only' | 'data-only'
export type MySqlBackupEngine = 'mysqldump' | 'js'

export interface MySqlBackupOptions {
  databaseName: string
  filePath: string
  content: MySqlBackupContent
  tables?: string[]
  addDropTable: boolean
  singleTransaction: boolean
  includeRoutines: boolean
  includeTriggers: boolean
  includeEvents: boolean
  extendedInsert: boolean
  addCreateDatabase: boolean
  charset: string
  compress: boolean
  mysqlDumpPath?: string
}

export interface MySqlRestoreOptions {
  filePath: string
  targetDatabaseName: string
  createDatabaseIfNotExists: boolean
  stopOnError: boolean
  mysqlClientPath?: string
}

export interface MySqlToolInfo {
  found: boolean
  path?: string
  version?: string
}

export interface MySqlBackupToolStatus {
  mysqldump: MySqlToolInfo
  mysql: MySqlToolInfo
}

export type MySqlBackupToolStatusResult =
  | { status: 'ok'; tools: MySqlBackupToolStatus }
  | { status: 'error'; message: string }

export type BuildMySqlBackupPreviewResult =
  | { status: 'ok'; command: string }
  | { status: 'error'; message: string }

export type ExecuteMySqlBackupResult =
  | { status: 'ok'; filePath: string; engine: MySqlBackupEngine; durationMs: number; bytes: number }
  | { status: 'error'; message: string }

export type ExecuteMySqlRestoreResult =
  | { status: 'ok'; engine: MySqlBackupEngine; durationMs: number; statementsRun?: number }
  | { status: 'error'; message: string }

export type MySqlPickPathResult =
  | { status: 'ok'; filePath: string }
  | { status: 'cancelled' }

export type PostgresBackupFormat = 'plain' | 'custom' | 'tar' | 'directory'
export type PostgresBackupContent = 'schema-and-data' | 'schema-only' | 'data-only'

export interface PostgresBackupOptions {
  databaseName: string
  filePath: string
  format: PostgresBackupFormat
  content: PostgresBackupContent
  noOwner: boolean
  noPrivileges: boolean
  clean: boolean
  createDatabase: boolean
  compressionLevel?: number
  encoding?: string
  compress: boolean
  pgDumpPath?: string
}

export interface PostgresRestoreOptions {
  filePath: string
  format: PostgresBackupFormat
  targetDatabaseName: string
  createDatabase: boolean
  clean: boolean
  noOwner: boolean
  singleTransaction: boolean
  jobs?: number
  pgRestorePath?: string
  psqlPath?: string
}

export interface PostgresToolInfo {
  found: boolean
  path?: string
  version?: string
}

export interface PostgresBackupToolStatus {
  pgDump: PostgresToolInfo
  pgRestore: PostgresToolInfo
  psql: PostgresToolInfo
}

export type PostgresBackupToolStatusResult =
  | { status: 'ok'; tools: PostgresBackupToolStatus }
  | { status: 'error'; message: string }

export type BuildPostgresBackupPreviewResult =
  | { status: 'ok'; command: string }
  | { status: 'error'; message: string }

export type ExecutePostgresBackupResult =
  | { status: 'ok'; filePath: string; durationMs: number; bytes: number }
  | { status: 'error'; message: string }

export type ExecutePostgresRestoreResult =
  | { status: 'ok'; durationMs: number }
  | { status: 'error'; message: string }

export interface SqliteBackupOptions {
  filePath: string
  compact: boolean
  compress: boolean
}

export interface SqliteRestoreOptions {
  filePath: string
  safetyCopy: boolean
}

export type ExecuteSqliteBackupResult =
  | { status: 'ok'; filePath: string; durationMs: number; bytes: number }
  | { status: 'error'; message: string }

export type ExecuteSqliteRestoreResult =
  | { status: 'ok'; durationMs: number; safetyCopyPath?: string }
  | { status: 'error'; message: string }

interface DatabaseAPI {
  connect: (
    connectionId: string,
    credentials?: { username?: string; password: string }
  ) => Promise<ConnectResult>
  disconnect: (connectionId: string) => Promise<void>
  getChildren: (connectionId: string, nodeId: string) => Promise<GetChildrenResult>
  getDatabases: (connectionId: string) => Promise<GetDatabasesResult>
  executeQuery: (connectionId: string, querySql: string, withPlan?: boolean, withStatistics?: boolean, databaseName?: string) => Promise<ExecuteQueryResult>
  createDatabase: (connectionId: string, databaseName: string) => Promise<CreateDatabaseResult>
  listServerDrives: (connectionId: string) => Promise<ListServerDrivesResult>
  listServerDir: (connectionId: string, path: string) => Promise<ListServerDirResult>
  getDatabaseFiles: (connectionId: string, databaseName: string) => Promise<GetDatabaseFilesResult>
  buildBackupSql: (connectionId: string, opts: BackupOptions) => Promise<BuildBackupSqlResult>
  executeBackup: (connectionId: string, opts: BackupOptions) => Promise<ExecuteBackupResult>
  readBackupHeader: (connectionId: string, path: string) => Promise<ReadBackupHeaderResult>
  readBackupFileList: (connectionId: string, path: string, position: number) => Promise<ReadBackupFileListResult>
  getBackupSets: (connectionId: string, databaseName: string) => Promise<GetBackupSetsResult>
  buildRestoreSql: (connectionId: string, opts: RestoreOptions) => Promise<BuildRestoreSqlResult>
  executeRestore: (connectionId: string, opts: RestoreOptions) => Promise<ExecuteRestoreResult>
  mysqlGetBackupTools: (connectionId: string, paths?: { mysqlDumpPath?: string; mysqlClientPath?: string }) => Promise<MySqlBackupToolStatusResult>
  mysqlProbeTools: (paths?: { mysqlDumpPath?: string; mysqlClientPath?: string }) => Promise<MySqlBackupToolStatusResult>
  mysqlBuildBackupPreview: (connectionId: string, opts: MySqlBackupOptions) => Promise<BuildMySqlBackupPreviewResult>
  mysqlExecuteBackup: (connectionId: string, opts: MySqlBackupOptions) => Promise<ExecuteMySqlBackupResult>
  mysqlExecuteRestore: (connectionId: string, opts: MySqlRestoreOptions) => Promise<ExecuteMySqlRestoreResult>
  mysqlPickBackupPath: (options?: { defaultFileName?: string; compress?: boolean }) => Promise<MySqlPickPathResult>
  mysqlPickRestoreFile: () => Promise<MySqlPickPathResult>
  postgresGetBackupTools: (connectionId: string, paths?: { pgDumpPath?: string; pgRestorePath?: string; psqlPath?: string }) => Promise<PostgresBackupToolStatusResult>
  postgresProbeTools: (paths?: { pgDumpPath?: string; pgRestorePath?: string; psqlPath?: string }) => Promise<PostgresBackupToolStatusResult>
  postgresBuildBackupPreview: (connectionId: string, opts: PostgresBackupOptions) => Promise<BuildPostgresBackupPreviewResult>
  postgresExecuteBackup: (connectionId: string, opts: PostgresBackupOptions) => Promise<ExecutePostgresBackupResult>
  postgresExecuteRestore: (connectionId: string, opts: PostgresRestoreOptions) => Promise<ExecutePostgresRestoreResult>
  postgresPickBackupPath: (options?: { defaultFileName?: string; compress?: boolean; format?: string }) => Promise<MySqlPickPathResult>
  postgresPickRestoreFile: () => Promise<MySqlPickPathResult>
  sqliteExecuteBackup: (connectionId: string, opts: SqliteBackupOptions) => Promise<ExecuteSqliteBackupResult>
  sqliteExecuteRestore: (connectionId: string, opts: SqliteRestoreOptions) => Promise<ExecuteSqliteRestoreResult>
  sqlitePickBackupPath: (options?: { defaultFileName?: string; compress?: boolean }) => Promise<MySqlPickPathResult>
  sqlitePickRestoreFile: () => Promise<MySqlPickPathResult>
  redisExecuteBackup: (connectionId: string, opts: RedisBackupOptions) => Promise<ExecuteRedisBackupResult>
  redisExecuteRestore: (connectionId: string, opts: RedisRestoreOptions) => Promise<ExecuteRedisRestoreResult>
  redisPickBackupPath: (options?: { defaultFileName?: string; compress?: boolean }) => Promise<MySqlPickPathResult>
  redisPickRestoreFile: () => Promise<MySqlPickPathResult>
  mongoGetBackupTools: (connectionId: string, paths?: { mongodumpPath?: string; mongorestorePath?: string }) => Promise<MongoBackupToolStatusResult>
  mongoBuildBackupPreview: (connectionId: string, opts: MongoBackupOptions) => Promise<BuildMongoBackupPreviewResult>
  mongoExecuteBackup: (connectionId: string, opts: MongoBackupOptions) => Promise<ExecuteMongoBackupResult>
  mongoExecuteRestore: (connectionId: string, opts: MongoRestoreOptions) => Promise<ExecuteMongoRestoreResult>
  mongoPickBackupPath: (options?: { defaultFileName?: string; gzip?: boolean; engine?: 'mongodump' | 'js' }) => Promise<MySqlPickPathResult>
  mongoPickRestoreFile: () => Promise<MySqlPickPathResult>
  createCollection: (connectionId: string, databaseName: string, collectionName: string) => Promise<CreateCollectionResult>
  renameCollection: (connectionId: string, databaseName: string, oldName: string, newName: string) => Promise<CreateCollectionResult>
  dropCollection: (connectionId: string, databaseName: string, collectionName: string) => Promise<CreateCollectionResult>
  insertMongoDocument: (connectionId: string, databaseName: string, collectionName: string, ejsonDocString: string) => Promise<InsertMongoDocumentResult>
  replaceMongoDocument: (connectionId: string, databaseName: string, collectionName: string, ejsonDocString: string) => Promise<ReplaceMongoDocumentResult>
  deleteMongoDocument: (connectionId: string, databaseName: string, collectionName: string, ejsonDocString: string) => Promise<DeleteMongoDocumentResult>
  executeMongoShellCommand: (connectionId: string, command: string, currentDb: string) => Promise<MongoShellCommandResult>
  executeRedisShellCommand: (connectionId: string, command: string, databaseIndex: number) => Promise<{ status: 'ok' | 'error'; output: string }>
  getMongoIndexes: (connectionId: string, databaseName: string, collectionName: string) => Promise<GetMongoIndexesResult>
  saveMongoIndex: (connectionId: string, databaseName: string, collectionName: string, params: SaveMongoIndexParams, originalName?: string) => Promise<SaveMongoIndexResult>
  dropMongoIndex: (connectionId: string, databaseName: string, collectionName: string, indexName: string) => Promise<DropMongoIndexResult>
  getCollectionFields: (connectionId: string, databaseName: string, collectionName: string) => Promise<GetCollectionFieldsResult>
  getMongoAggregations: (connectionId: string, databaseName: string, collectionName: string) => Promise<GetMongoAggregationsResult>
  saveMongoAggregation: (connectionId: string, databaseName: string, collectionName: string, params: SaveMongoAggregationParams, originalId?: string) => Promise<SaveMongoAggregationResult>
  deleteMongoAggregation: (connectionId: string, databaseName: string, collectionName: string, aggregationId: string) => Promise<DeleteMongoAggregationResult>
  runMongoAggregation: (connectionId: string, databaseName: string, collectionName: string, pipeline: unknown[]) => Promise<RunMongoAggregationResult>
  getMongoAggregationSample: (connectionId: string, databaseName: string, collectionName: string, limit?: number) => Promise<GetMongoAggregationSampleResult>
  getMongoValidation: (connectionId: string, databaseName: string, collectionName: string) => Promise<GetMongoValidationResult>
  saveMongoValidation: (connectionId: string, databaseName: string, collectionName: string, validator: Record<string, unknown>, validationAction: string, validationLevel: string) => Promise<SaveMongoValidationResult>
  testMongoValidation: (connectionId: string, databaseName: string, collectionName: string, validator: Record<string, unknown>) => Promise<TestMongoValidationResult>
  generateMongoValidationRules: (connectionId: string, databaseName: string, collectionName: string) => Promise<GenerateMongoValidationRulesResult>
  getTableSchema: (
    connectionId: string,
    databaseName: string,
    schemaName: string,
    tableName: string
  ) => Promise<GetTableSchemaResult>
  getForeignKeys: (
    connectionId: string,
    databaseName: string,
    schemaName: string,
    tableName: string
  ) => Promise<GetForeignKeysResult>
  getCheckConstraints: (
    connectionId: string,
    databaseName: string,
    schemaName: string,
    tableName: string
  ) => Promise<GetCheckConstraintsResult>
  getTriggers: (
    connectionId: string,
    databaseName: string,
    schemaName: string,
    tableName: string
  ) => Promise<GetTriggersResult>
  saveTrigger: (
    connectionId: string,
    databaseName: string,
    params: SaveTriggerParams,
    originalTriggerName?: string
  ) => Promise<SaveTriggerResult>
  deleteTrigger: (
    connectionId: string,
    databaseName: string,
    triggerName: string,
    schemaName: string
  ) => Promise<DeleteTriggerResult>
  getIndexes: (
    connectionId: string,
    databaseName: string,
    schemaName: string,
    tableName: string
  ) => Promise<GetIndexesResult>
  saveIndex: (
    connectionId: string,
    databaseName: string,
    params: SaveIndexParams,
    originalIndexName?: string
  ) => Promise<SaveIndexResult>
  deleteIndex: (
    connectionId: string,
    databaseName: string,
    indexName: string,
    schemaName: string,
    tableName: string
  ) => Promise<DeleteIndexResult>
  rebuildIndex: (
    connectionId: string,
    databaseName: string,
    indexName: string,
    schemaName: string,
    tableName: string
  ) => Promise<RebuildIndexResult>
  reorganizeIndex: (
    connectionId: string,
    databaseName: string,
    indexName: string,
    schemaName: string,
    tableName: string
  ) => Promise<ReorganizeIndexResult>
  disableIndex: (
    connectionId: string,
    databaseName: string,
    indexName: string,
    schemaName: string,
    tableName: string
  ) => Promise<DisableIndexResult>
  testConnection: (record: Omit<ConnectionRecord, 'id'>) => Promise<ConnectResult>
  getErdSchema: (connectionId: string, databaseName: string) => Promise<GetErdSchemaResult>
  getViews: (connectionId: string, databaseName: string) => Promise<GetViewsResult>
  saveView: (
    connectionId: string,
    databaseName: string,
    params: SaveViewParams,
    originalViewName?: string
  ) => Promise<SaveViewResult>
  deleteView: (
    connectionId: string,
    databaseName: string,
    schemaName: string,
    viewName: string
  ) => Promise<DeleteViewResult>
  getStoredProcedures: (connectionId: string, databaseName: string) => Promise<GetStoredProceduresResult>
  saveStoredProcedure: (
    connectionId: string,
    databaseName: string,
    params: SaveStoredProcedureParams,
    originalProcedureName?: string
  ) => Promise<SaveStoredProcedureResult>
  deleteStoredProcedure: (
    connectionId: string,
    databaseName: string,
    schemaName: string,
    procedureName: string
  ) => Promise<DeleteStoredProcedureResult>
  getDataTypes: (connectionId: string, databaseName: string) => Promise<GetDataTypesResult>
  saveDataType: (
    connectionId: string,
    databaseName: string,
    params: SaveDataTypeParams,
    originalTypeName?: string,
    originalSchemaName?: string
  ) => Promise<SaveDataTypeResult>
  deleteDataType: (
    connectionId: string,
    databaseName: string,
    schemaName: string,
    typeName: string
  ) => Promise<DeleteDataTypeResult>
  getTableTypes: (connectionId: string, databaseName: string) => Promise<GetTableTypesResult>
  getTableType: (
    connectionId: string,
    databaseName: string,
    schemaName: string,
    typeName: string
  ) => Promise<GetTableTypeResult>
  saveTableType: (
    connectionId: string,
    databaseName: string,
    params: SaveTableTypeParams,
    originalTypeName?: string,
    originalSchemaName?: string
  ) => Promise<SaveTableTypeResult>
  deleteTableType: (
    connectionId: string,
    databaseName: string,
    schemaName: string,
    typeName: string
  ) => Promise<DeleteTableTypeResult>
  getMemoryOptimizedTableTypes: (connectionId: string, databaseName: string) => Promise<GetMemoryOptimizedTableTypesResult>
  getMemoryOptimizedTableType: (
    connectionId: string,
    databaseName: string,
    schemaName: string,
    typeName: string
  ) => Promise<GetMemoryOptimizedTableTypeResult>
  saveMemoryOptimizedTableType: (
    connectionId: string,
    databaseName: string,
    params: SaveMemoryOptimizedTableTypeParams,
    originalTypeName?: string,
    originalSchemaName?: string
  ) => Promise<SaveMemoryOptimizedTableTypeResult>
  deleteMemoryOptimizedTableType: (
    connectionId: string,
    databaseName: string,
    schemaName: string,
    typeName: string
  ) => Promise<DeleteMemoryOptimizedTableTypeResult>
  invalidateCache: (connectionId: string, nodeId: string) => Promise<void>
  deleteRedisKey: (
    connectionId: string,
    databaseIndex: string,
    keyName: string
  ) => Promise<DeleteRedisKeyResult>
  deleteRedisPrefix: (
    connectionId: string,
    databaseIndex: string,
    prefix: string
  ) => Promise<DeleteRedisKeyResult>
  getRedisDashboard: (connectionId: string) => Promise<RedisDashboardResult>
  executeRedisDashboardCommand: (
    connectionId: string,
    command: RedisDashboardCommand,
    databaseIndex?: number
  ) => Promise<RedisDashboardCommandResult>
  getRedisDbKeys: (connectionId: string, databaseIndex: string) => Promise<GetRedisDbKeysResult>
  getRedisKeyValue: (connectionId: string, databaseIndex: string, keyName: string) => Promise<GetRedisKeyValueResult>
  saveRedisKey: (connectionId: string, databaseIndex: string, params: SaveRedisKeyParams) => Promise<SaveRedisKeyResult>
  onEagerLoadStatus: (
    cb: (payload: { connectionId: string; status: 'loading' | 'complete' | 'error' }) => void
  ) => () => void
  syncWatchState: (
    connectionId: string,
    enabled: boolean,
    appFocused: boolean,
    watchedNodes: string[],
    showSystemDatabases: boolean
  ) => Promise<void>
  onBackgroundRefresh: (
    cb: (payload: { connectionId: string; updates: Array<{ nodeId: string; children: ExplorerNode[] }> }) => void
  ) => () => void
  scriptTableCreate: (connectionId: string, databaseName: string, schemaName: string, tableName: string) => Promise<GenerateScriptResult>
  scriptTableAlter: (connectionId: string, databaseName: string, schemaName: string, tableName: string) => Promise<GenerateScriptResult>
  scriptTableDrop: (connectionId: string, databaseName: string, schemaName: string, tableName: string) => Promise<GenerateScriptResult>
  scriptViewCreate: (connectionId: string, databaseName: string, schemaName: string, viewName: string) => Promise<GenerateScriptResult>
  scriptViewAlter: (connectionId: string, databaseName: string, schemaName: string, viewName: string) => Promise<GenerateScriptResult>
  scriptViewDrop: (connectionId: string, databaseName: string, schemaName: string, viewName: string) => Promise<GenerateScriptResult>
  scriptStoredProcedureCreate: (connectionId: string, databaseName: string, schemaName: string, procedureName: string) => Promise<GenerateScriptResult>
  scriptStoredProcedureAlter: (connectionId: string, databaseName: string, schemaName: string, procedureName: string) => Promise<GenerateScriptResult>
  scriptStoredProcedureDrop: (connectionId: string, databaseName: string, schemaName: string, procedureName: string) => Promise<GenerateScriptResult>
  scriptSelectTopRows: (connectionId: string, databaseName: string, schemaName: string, tableName: string, count: number) => Promise<GenerateScriptResult>
  scriptDropDatabase: (connectionId: string, databaseName: string) => Promise<GenerateScriptResult>
  getCapabilities: (connectionId: string) => Promise<ProviderCapabilities | null>
  getServerLoginDetails: (connectionId: string, loginName: string) => Promise<ServerLoginDetails | null>
  listServerDatabases: (connectionId: string) => Promise<string[]>
  listServerLanguages: (connectionId: string) => Promise<string[]>
  getServerLoginRoles: (connectionId: string, loginName: string) => Promise<ServerLoginRoleEntry[]>
  getServerLoginDatabaseMappings: (connectionId: string, loginName: string) => Promise<DatabaseMappingEntry[]>
  getDatabaseRolesForLogin: (connectionId: string, databaseName: string, loginName: string) => Promise<DatabaseRoleEntry[]>
  saveServerLogin: (connectionId: string, params: SaveServerLoginParams) => Promise<SaveServerLoginResult>
  deleteServerLogin: (connectionId: string, loginName: string) => Promise<DeleteServerLoginResult>
  getServerRoleDetails: (connectionId: string, roleName: string) => Promise<ServerRoleDetails | null>
  saveServerRole: (connectionId: string, params: SaveServerRoleParams) => Promise<SaveServerRoleResult>
  deleteServerRole: (connectionId: string, roleName: string) => Promise<DeleteServerRoleResult>
  getDatabaseUserDetails: (connectionId: string, databaseName: string, userName: string) => Promise<DatabaseUserDetails | null>
  getDatabaseUserRoles: (connectionId: string, databaseName: string, userName: string) => Promise<DatabaseUserRoleEntry[]>
  saveDatabaseUser: (connectionId: string, params: SaveDatabaseUserParams) => Promise<SaveDatabaseUserResult>
  deleteDatabaseUser: (connectionId: string, databaseName: string, userName: string) => Promise<DeleteDatabaseUserResult>
  getMySqlUserDetails: (connectionId: string, username: string, host: string) => Promise<MySqlUserDetails | null>
  getMySqlUserGlobalPrivileges: (connectionId: string, username: string, host: string) => Promise<MySqlGlobalPrivilegeEntry[]>
  getMySqlUserDatabasePrivileges: (connectionId: string, username: string, host: string) => Promise<MySqlDatabasePrivilegeEntry[]>
  getMySqlDatabaseList: (connectionId: string) => Promise<string[]>
  getMySqlDatabaseUsers: (connectionId: string, databaseName: string) => Promise<{ username: string; host: string }[]>
  saveMySqlUser: (connectionId: string, params: SaveMySqlUserParams) => Promise<SaveMySqlUserResult>
  deleteMySqlUser: (connectionId: string, username: string, host: string) => Promise<DeleteMySqlUserResult>
  saveMySqlDatabaseUserPrivileges: (connectionId: string, params: SaveMySqlDatabaseUserPrivilegesParams) => Promise<SaveMySqlDatabaseUserPrivilegesResult>
  getRedisAclUserDetails: (connectionId: string, username: string) => Promise<RedisAclUserDetails | null>
  saveRedisAclUser: (connectionId: string, params: SaveRedisAclUserParams) => Promise<SaveRedisAclUserResult>
  deleteRedisAclUser: (connectionId: string, username: string) => Promise<DeleteRedisAclUserResult>
  getMongoUserDetails: (connectionId: string, username: string) => Promise<MongoUserDetails | null>
  saveMongoUser: (connectionId: string, params: SaveMongoUserParams) => Promise<SaveMongoUserResult>
  deleteMongoUser: (connectionId: string, username: string) => Promise<DeleteMongoUserResult>
}

interface FileSaveDialogOptions {
  defaultPath?: string
  filters?: { name: string; extensions: string[] }[]
}

interface FileSaveResult {
  status: 'ok'
}

interface FileSaveDialogResult {
  status: 'ok'
  filePath: string
}

interface FileCancelledResult {
  status: 'cancelled'
}

interface FileOpenDialogResult {
  status: 'ok'
  filePath: string
  content: string
}

interface FileReadResult {
  status: 'ok'
  content: string
}

interface FileReadErrorResult {
  status: 'error'
  message: string
}

interface SqliteOpenDialogResult {
  status: 'ok'
  filePath: string
}

interface FileAPI {
  save: (filePath: string, content: string) => Promise<FileSaveResult>
  saveDialog: (content: string, options?: FileSaveDialogOptions) => Promise<FileSaveDialogResult | FileCancelledResult>
  openDialog: () => Promise<FileOpenDialogResult | FileCancelledResult>
  saveErdDialog: (content: string) => Promise<FileSaveDialogResult | FileCancelledResult>
  openErdDialog: () => Promise<FileOpenDialogResult | FileCancelledResult>
  read: (filePath: string) => Promise<FileReadResult | FileReadErrorResult>
  openSqliteDialog: () => Promise<SqliteOpenDialogResult | FileCancelledResult>
  openFileDialog: () => Promise<SqliteOpenDialogResult | FileCancelledResult>
  checkFileExists: (filePath: string) => Promise<boolean>
}

export interface DraftDocument {
  draftId: string
  title: string
  filePath?: string
  content: string
  connectionId?: string
  databaseName?: string
  mongoCollection?: string
  savedAt: string
}

interface AutosaveAPI {
  getRecovered: () => Promise<DraftDocument[]>
  write: (drafts: DraftDocument[]) => Promise<void>
  clear: () => Promise<void>
}

interface MenuAPI {
  executeRole: (role: string) => void
  updateState: (state: { hasOpenDocuments?: boolean; canSaveActive?: boolean; isDocumentFocused?: boolean }) => void
  onNativeAction: (cb: (action: string) => void) => () => void
}

interface AppQuitAPI {
  quit: () => void
  restart: () => void
  openDevTools: () => void
}

export interface ExportEnvironmentOptions {
  connections: boolean
  comparisons: boolean
  passwords: boolean
  settings: boolean
}

export type ExportEnvironmentResult =
  | { success: true }
  | { cancelled: true }

export type ImportEnvironmentResult =
  | { success: true; connectionsImported: number; comparisonsImported: number; settingsImported: boolean }
  | { cancelled: true }
  | { error: string }

export interface ImportProgressEvent {
  step: 'validating' | 'connections' | 'comparisons' | 'settings'
  total?: number
}

interface EnvironmentAPI {
  export: (options: ExportEnvironmentOptions) => Promise<ExportEnvironmentResult>
  import: () => Promise<ImportEnvironmentResult>
  onImportProgress: (cb: (progress: ImportProgressEvent) => void) => () => void
}

interface WindowAPI {
  minimize: () => void
  maximizeRestore: () => void
  close: () => void
  captureScreenshotPreview: () => Promise<{
    dataUrl: string
    width: number
    height: number
  } | null>
  captureScreenshotAtSize: (
    width: number,
    height: number
  ) => Promise<{ dataUrl: string } | null>
  writeScreenshot: (dataUrl: string) => Promise<boolean>
  getContentSize: () => Promise<{ width: number; height: number } | null>
  resizeWindow: (width: number, height: number) => Promise<void>
  isMaximized: () => Promise<boolean>
  onMaximize: (cb: () => void) => () => void
  onUnmaximize: (cb: () => void) => () => void
}

export type ProfilerTrackedEventType =
  | 'sql-statement'
  | 'blocked-query'
  | 'session-login'
  | 'session-logout'
  | 'error'

export interface ProfilerEvent {
  id: string
  timestamp: string
  type: ProfilerTrackedEventType
  sessionId: number
  sqlText?: string
  durationMs?: number
  cpuTime?: number
  reads?: number
  writes?: number
  rowCount?: number
  waitType?: string
  waitTimeMs?: number
  loginName?: string
  hostName?: string
  programName?: string
  blockingSessionId?: number
  status?: string
  command?: string
}

export interface ProfilerSessionConfig {
  connectionId: string
  connectionName: string
  databaseName: string
  trackedEvents: ProfilerTrackedEventType[]
  intervalMs: number
}

interface ProfileData {
  displayName: string
  avatarFile: string | null
  avatarZoom: number
  avatarOffsetX: number
  avatarOffsetY: number
  lockOnStartup: boolean
  lockOnInactivity: boolean
  inactivityTimeoutMinutes: number
  passwordMeta: string | null
}

interface AuthState {
  hasPassword: boolean
  lockOnStartup: boolean
  lockOnInactivity: boolean
  lockOnMinimize: boolean
  inactivityTimeoutMinutes: number
  lockout: { isLockedOut: boolean; lockedUntilMs: number | null }
}

interface AuthVerifyResult {
  valid: boolean
  lockedOut?: boolean
  lockedUntilMs?: number | null
  attemptsRemaining?: number | null
}

interface ProfileAPI {
  get: () => Promise<ProfileData>
  setName: (name: string) => Promise<void>
  pickAvatar: () => Promise<{ status: 'ok'; avatarFile: string } | { status: 'cancelled' }>
  removeAvatar: () => Promise<void>
  getAvatarDataUrl: () => Promise<string | null>
  setAvatarTransform: (zoom: number, offsetX: number, offsetY: number) => Promise<void>
  setLockSettings: (settings: { lockOnStartup: boolean; lockOnInactivity: boolean; lockOnMinimize: boolean; inactivityTimeoutMinutes: number }) => Promise<void>
}

interface AuthAPI {
  getState: () => Promise<AuthState>
  setPassword: (plaintext: string) => Promise<{ status: 'ok' } | { status: 'error'; message: string }>
  changePassword: (current: string, next: string) => Promise<{ status: 'ok' } | { status: 'error'; message: string }>
  removePassword: (current: string) => Promise<{ status: 'ok' } | { status: 'error'; message: string }>
  verify: (plaintext: string) => Promise<AuthVerifyResult>
  clearSessionKey: () => Promise<void>
  lockNow: () => Promise<void>
  onLock: (cb: () => void) => () => void
}

interface ProfilerAPI {
  start: (config: ProfilerSessionConfig) => Promise<string>
  stop: (sessionId: string) => Promise<void>
  pause: (sessionId: string) => Promise<void>
  resume: (sessionId: string) => Promise<void>
  onEvent: (
    cb: (payload: { sessionId: string; event: ProfilerEvent }) => void
  ) => () => void
  onEventUpdate: (
    cb: (payload: { sessionId: string; eventId: string; updates: Partial<ProfilerEvent> }) => void
  ) => () => void
  onError: (
    cb: (payload: { sessionId: string; message: string }) => void
  ) => () => void
}

export interface UpdateInfo {
  version: string
  releaseNotes: string | null
  releaseDate?: string
}

export interface ReleaseNote {
  version: string
  body: string
  publishedAt: string
}

export type GetReleaseNotesResult =
  | { status: 'ok'; notes: ReleaseNote[] }
  | { status: 'error'; message: string }

interface UpdaterAPI {
  checkForUpdates: () => Promise<void>
  startDownload: () => Promise<void>
  cancelDownload: () => Promise<void>
  installUpdate: () => Promise<void>
  getVersion: () => Promise<string>
  getPreviousVersion: () => Promise<string | null>
  clearPreviousVersion: () => Promise<void>
  getDownloadedVersion: () => Promise<string | null>
  clearDownloadedVersion: () => Promise<void>
  getReleaseNotes: (fromVersion?: string) => Promise<GetReleaseNotesResult>
  onChecking: (cb: () => void) => () => void
  onUpdateAvailable: (cb: (info: UpdateInfo) => void) => () => void
  onNotAvailable: (cb: () => void) => () => void
  onDownloadProgress: (cb: (data: { percent: number; bytesPerSecond: number }) => void) => () => void
  onDownloadCancelled: (cb: () => void) => () => void
  onDownloaded: (cb: (info: UpdateInfo) => void) => () => void
  onError: (cb: (message: string) => void) => () => void
  onCheckForUpdatesMenu: (cb: () => void) => () => void
}

export type AiModelStatus = 'not-downloaded' | 'downloading' | 'ready' | 'error'

export interface ModelCheckResult {
  exists: boolean
  filePath?: string
  sizeBytes?: number
}

export interface AiModelListItem {
  modelId: string
  displayName: string
  description: string
  fileSizeBytes: number
  fileName: string
  status: AiModelStatus
  sizeOnDisk?: number
}

export interface AiDownloadProgress {
  modelId: string
  downloaded: number
  total: number
  percent: number
}

export interface AiChatRequest {
  connectionId: string
  databaseName: string
  provider: string
  message: string
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>
}

export interface AiChatChunk {
  sessionId: string
  delta: string
  done: boolean
  fullText?: string
  error?: string
}

export interface AiSchemaContext {
  databaseName: string
  provider: string
  ddl: string
  tableCount: number
}

interface AiAPI {
  checkModel: (modelId: string) => Promise<ModelCheckResult>
  listModels: () => Promise<AiModelListItem[]>
  downloadModel: (modelId: string) => Promise<{ status: 'ok'; filePath: string } | { status: 'error'; message: string }>
  cancelDownload: (modelId: string) => Promise<void>
  deleteModel: (modelId: string) => Promise<void>
  getSchemaContext: (connectionId: string, databaseName: string, provider: string) => Promise<AiSchemaContext>
  chatStream: (request: AiChatRequest, sessionId: string) => Promise<{ status: 'ok' }>
  abortCompletion: (sessionId: string) => Promise<void>
  onDownloadProgress: (cb: (progress: AiDownloadProgress) => void) => () => void
  onChatChunk: (cb: (chunk: AiChatChunk) => void) => () => void
}

interface AppAPI {
  settings: SettingsAPI
  analytics: AnalyticsAPI
  connections: ConnectionsAPI
  comparisons: ComparisonsAPI
  database: DatabaseAPI
  file: FileAPI
  autosave: AutosaveAPI
  menu: MenuAPI
  profiler: ProfilerAPI
  app: AppQuitAPI
  window: WindowAPI
  updater: UpdaterAPI
  environment: EnvironmentAPI
  profile: ProfileAPI
  auth: AuthAPI
  ai: AiAPI
  platform: NodeJS.Platform
  isDev: boolean
}

// ─── Server Login Management Types (SQL Server) ───────────────────────────────

export interface ServerLoginDetails {
  name: string
  type: 'S' | 'U' | 'G' | 'E' | 'X'
  defaultDatabase: string
  defaultLanguage: string
  isPolicyChecked: boolean
  isExpirationChecked: boolean
  mustChangePassword: boolean
}

export interface ServerLoginRoleEntry {
  roleName: string
  isMember: boolean
}

export interface DatabaseMappingEntry {
  databaseName: string
  isMapped: boolean
  userName: string | null
}

export interface DatabaseRoleEntry {
  roleName: string
  isMember: boolean
}

export interface SaveServerLoginParams {
  originalLoginName?: string
  loginName: string
  authenticationType: 'sql' | 'windows' | 'entra'
  password?: string
  mustChangePassword?: boolean
  enforcePolicy?: boolean
  enforceExpiration?: boolean
  defaultDatabase: string
  defaultLanguage: string
  serverRoles: string[]
  userMappings: Array<{
    databaseName: string
    isMapped: boolean
    userName: string
    roles: string[]
  }>
}

export type SaveServerLoginResult =
  | { status: 'ok' }
  | { status: 'error'; message: string }

export type DeleteServerLoginResult =
  | { status: 'ok' }
  | { status: 'error'; message: string }

// ─── Server Role Management Types (SQL Server) ───────────────────────────────

export interface ServerRoleSecurable {
  securable: string
  permission: string
  state: 'GRANT' | 'GRANT_WITH_GRANT_OPTION' | 'DENY'
}

export interface ServerRoleDetails {
  name: string
  owner: string
  isFixedRole: boolean
  members: string[]
  memberships: string[]
  securables: ServerRoleSecurable[]
  endpoints: string[]
}

export interface SaveServerRoleParams {
  isNew: boolean
  name: string
  owner: string
  originalOwner: string
  members: string[]
  originalMembers: string[]
  memberships: string[]
  originalMemberships: string[]
  securables: ServerRoleSecurable[]
  originalSecurables: ServerRoleSecurable[]
}

export type SaveServerRoleResult =
  | { status: 'ok' }
  | { status: 'error'; message: string }

export type DeleteServerRoleResult =
  | { status: 'ok' }
  | { status: 'error'; message: string }

export interface DatabaseUserDetails {
  name: string
  type: 'S' | 'U' | 'G' | 'E' | 'X'
  loginName: string | null
  defaultSchema: string
}

export interface DatabaseUserRoleEntry {
  roleName: string
  isMember: boolean
}

export interface SaveDatabaseUserParams {
  databaseName: string
  originalUserName?: string
  userName: string
  userType: 'sql' | 'windows' | 'external' | 'nologin'
  loginName?: string
  defaultSchema: string
  roles: string[]
}

export type SaveDatabaseUserResult =
  | { status: 'ok' }
  | { status: 'error'; message: string }

export type DeleteDatabaseUserResult =
  | { status: 'ok' }
  | { status: 'error'; message: string }

// ─── MySQL User Management Types ─────────────────────────────────────────────

export interface MySqlUserDetails {
  username: string
  host: string
  plugin: string
  accountLocked: boolean
  passwordExpired: boolean
}

export interface MySqlGlobalPrivilegeEntry {
  privilege: string
  isGranted: boolean
}

export interface MySqlDatabasePrivilegeEntry {
  databaseName: string
  privileges: MySqlGlobalPrivilegeEntry[]
}

export interface SaveMySqlUserParams {
  originalUsername?: string
  originalHost?: string
  username: string
  host: string
  plugin: string
  password?: string
  accountLocked: boolean
  passwordExpired: boolean
  globalPrivileges: string[]
  databasePrivileges: Array<{ databaseName: string; privileges: string[] }>
}

export type SaveMySqlUserResult =
  | { status: 'ok' }
  | { status: 'error'; message: string }

export type DeleteMySqlUserResult =
  | { status: 'ok' }
  | { status: 'error'; message: string }

export interface SaveMySqlDatabaseUserPrivilegesParams {
  username: string
  host: string
  databaseName: string
  privileges: string[]
}

export type SaveMySqlDatabaseUserPrivilegesResult =
  | { status: 'ok' }
  | { status: 'error'; message: string }

// ─── Redis ACL User Management Types ─────────────────────────────────────────

export interface RedisAclUserDetails {
  username: string
  enabled: boolean
  nopass: boolean
  allCommands: boolean
  noCommands: boolean
  categories: string[]
  allKeys: boolean
  noKeys: boolean
  keyPatterns: string[]
  allChannels: boolean
  noChannels: boolean
  channelPatterns: string[]
}

export interface SaveRedisAclUserParams {
  originalUsername?: string
  username: string
  password?: string
  enabled: boolean
  nopass: boolean
  allCommands: boolean
  categories: string[]
  allKeys: boolean
  keyPatterns: string[]
  allChannels: boolean
  channelPatterns: string[]
}

export type SaveRedisAclUserResult =
  | { status: 'ok' }
  | { status: 'error'; message: string }

export type DeleteRedisAclUserResult =
  | { status: 'ok' }
  | { status: 'error'; message: string }

export interface MongoUserDetails {
  username: string
  roles: { role: string; db: string }[]
}

export interface SaveMongoUserParams {
  originalUsername?: string
  username: string
  password?: string
  roles: { role: string; db: string }[]
}

export type SaveMongoUserResult =
  | { status: 'ok' }
  | { status: 'error'; message: string }

export type DeleteMongoUserResult =
  | { status: 'ok' }
  | { status: 'error'; message: string }

declare global {
  interface Window {
    electron: ElectronAPI
    api: AppAPI
  }
}

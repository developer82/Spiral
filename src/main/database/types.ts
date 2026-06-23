import type { ConnectionRecord } from '../store'

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
  | 'type-enums-folder'
  | 'type-composites-folder'
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
  | 'security-folder'
  | 'security-users-folder'
  | 'security-roles-folder'
  | 'security-schemas-folder'
  | 'security-user'
  | 'security-role'
  | 'security-schema'
  | 'redis-keyspaces-folder'
  | 'redis-keyspace'
  | 'redis-key-prefix'
  | 'redis-key'
  | 'mongodb-collections-folder'
  | 'mongodb-collection'
  | 'mongodb-collection-documents'
  | 'mongodb-collection-indexes'
  | 'mongodb-collection-aggregations'
  | 'mongodb-collection-validation'
  | 'mongodb-index'
  | 'mongodb-aggregation'

export interface ExplorerNode {
  /** Path-encoded id used to request children via IPC. */
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
  columnKeyMeta?: Array<{ isPrimaryKey: boolean; isForeignKey: boolean } | null>
  rawDocuments?: string[]
}

export interface QueryMessage {
  type: 'info' | 'error'
  text: string
}

export interface ClientStatistics {
  /** Wall-clock round-trip time in milliseconds */
  totalExecutionTimeMs: number
  /** Total rows returned across all result sets */
  rowsReturned: number
  /** Number of result sets returned */
  resultSetsCount: number
  /** UTF-8 byte length of the SQL sent to the server */
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

export interface TableColumnMeta {
  name: string
  type: string
  maxLength: number | null
  /** null means the column has no precision constraint (e.g. int). -1 means MAX. */
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

export interface GetErdSchemaSuccessResult {
  status: 'ok'
  schema: ErdSchema
}

export interface GetErdSchemaErrorResult {
  status: 'error'
  message: string
}

export type GetErdSchemaResult = GetErdSchemaSuccessResult | GetErdSchemaErrorResult

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
  /** CLUSTERED | NONCLUSTERED | XML | SPATIAL | CLUSTERED COLUMNSTORE | NONCLUSTERED COLUMNSTORE | NONCLUSTERED HASH */
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
  /** CLUSTERED | NONCLUSTERED */
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
  /** Raw max_length from sys.types. -1 = MAX. 0 = not applicable. For unicode types, divide by 2 for char count. */
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

export type GenerateScriptResult =
  | { status: 'ok'; script: string }
  | { status: 'error'; message: string }

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

export interface GenerateSyncScriptResult {
  status: 'ok' | 'error'
  script?: string
  sections?: SyncScriptSection[]
  skippedCount?: number
  message?: string
}

export interface ExecuteSyncResult {
  status: 'ok' | 'error'
  revertScript?: string
  message?: string
}

/**
 * Describes how a provider surfaces execution plan support.
 * - `none`: provider does not support query plans.
 * - `xml-visual`: provider returns SQL Server XML plan → rendered in ExecutionPlanCanvas.
 * - `explain-text`: provider prepends EXPLAIN ANALYZE → output comes back as a result set row.
 */
export type ExecutionPlanCapability =
  | { kind: 'none' }
  | { kind: 'xml-visual'; buttonLabel: string }
  | { kind: 'explain-text'; buttonLabel: string }

/**
 * Describes how a provider surfaces client-side statistics.
 * - `none`: not supported.
 * - `client-stats`: timing / bytes panel.
 */
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
  /** ISO date string (yyyy-mm-dd) when mode is 'on-date' */
  onDate?: string
}

export interface BackupOptions {
  databaseName: string
  backupType: BackupType
  /** Logical file/filegroup names to back up; empty/undefined = whole database. */
  filesAndFilegroups?: string[]
  /** Full server-side file paths to write the backup to (at least one). */
  destinations: string[]
  overwrite: BackupOverwrite
  verify: boolean
  checksum: boolean
  continueOnError: boolean
  /** Only meaningful when backupType is 'log'. */
  logTail?: LogTailAction
  expiration: BackupExpiration
  compression: BackupCompression
  /** Optional descriptive backup set name. */
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
  /** Ordered restore chain (full first, then differentials/logs). */
  source: RestoreSourceEntry[]
  replace: boolean
  takeTailLogBackup: boolean
  /** Path for the tail-log backup when takeTailLogBackup is set. */
  tailLogPath?: string
  restrictedUser: boolean
  recoveryState: RestoreRecoveryState
  /** Standby (undo) file path when recoveryState is 'standby'. */
  standbyFile?: string
  move: RestoreMoveEntry[]
}

export type BuildRestoreSqlResult =
  | { status: 'ok'; sql: string }
  | { status: 'error'; message: string }

export type ExecuteRestoreResult =
  | { status: 'ok'; sql: string; messages: QueryMessage[]; durationMs: number }
  | { status: 'error'; message: string; sql?: string }

// ─── Backup & Restore (MySQL) ────────────────────────────────────────────────

/** Which parts of the database a MySQL backup should contain. */
export type MySqlBackupContent = 'schema-and-data' | 'schema-only' | 'data-only'

/** Engine that actually produced/consumed a MySQL backup. */
export type MySqlBackupEngine = 'mysqldump' | 'js'

export interface MySqlBackupOptions {
  databaseName: string
  /** Absolute local file path to write the dump to (chosen via save dialog). */
  filePath: string
  content: MySqlBackupContent
  /** Tables to include; empty/undefined = all tables in the database. */
  tables?: string[]
  /** Prepend DROP TABLE IF EXISTS before each CREATE TABLE. */
  addDropTable: boolean
  /** Wrap the dump in a single consistent transaction (InnoDB). */
  singleTransaction: boolean
  includeRoutines: boolean
  includeTriggers: boolean
  includeEvents: boolean
  /** Use multi-row extended INSERT statements. */
  extendedInsert: boolean
  /** Emit CREATE DATABASE IF NOT EXISTS + USE at the top of the dump. */
  addCreateDatabase: boolean
  /** Connection charset for the dump (default utf8mb4). */
  charset: string
  /** Gzip the output (file ends with .sql.gz). */
  compress: boolean
  /** Optional override path to the mysqldump binary. */
  mysqlDumpPath?: string
}

export interface MySqlRestoreOptions {
  /** Absolute local file path of the dump to restore (.sql or .sql.gz). */
  filePath: string
  targetDatabaseName: string
  createDatabaseIfNotExists: boolean
  /** Abort on the first error (true) or keep going (false). */
  stopOnError: boolean
  /** Optional override path to the mysql client binary. */
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

// ─── Backup & Restore (PostgreSQL) ───────────────────────────────────────────

/** pg_dump output format. Plain restores via psql; the rest via pg_restore. */
export type PostgresBackupFormat = 'plain' | 'custom' | 'tar' | 'directory'

/** Which parts of the database a Postgres backup should contain. */
export type PostgresBackupContent = 'schema-and-data' | 'schema-only' | 'data-only'

export interface PostgresBackupOptions {
  databaseName: string
  /** Absolute local file (or directory) path to write the dump to. */
  filePath: string
  format: PostgresBackupFormat
  content: PostgresBackupContent
  /** Skip restoring ownership of objects (--no-owner). */
  noOwner: boolean
  /** Skip restoring access privileges/GRANTs (--no-acl). */
  noPrivileges: boolean
  /** Emit DROP commands before CREATE (--clean --if-exists). */
  clean: boolean
  /** Emit CREATE DATABASE before connecting (--create). */
  createDatabase: boolean
  /** Compression level 0-9 for custom/directory formats (-Z). */
  compressionLevel?: number
  /** Output encoding (--encoding), e.g. UTF8. */
  encoding?: string
  /** Gzip the plain-format output (file ends with .sql.gz). */
  compress: boolean
  /** Optional override path to the pg_dump binary. */
  pgDumpPath?: string
}

export interface PostgresRestoreOptions {
  /** Absolute local file path of the dump to restore. */
  filePath: string
  /** Archive format; selects psql (plain) vs pg_restore (custom/tar/directory). */
  format: PostgresBackupFormat
  targetDatabaseName: string
  /** Create the target database before restoring. */
  createDatabase: boolean
  /** Drop existing objects before recreating (--clean --if-exists). */
  clean: boolean
  /** Skip restoring ownership of objects (--no-owner). */
  noOwner: boolean
  /** Wrap the restore in a single transaction (--single-transaction). */
  singleTransaction: boolean
  /** Parallel restore jobs for custom/directory formats (-j). */
  jobs?: number
  /** Optional override path to the pg_restore binary. */
  pgRestorePath?: string
  /** Optional override path to the psql binary. */
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

// ─── Backup & Restore (SQLite) ───────────────────────────────────────────────

/**
 * SQLite is file-based, so a backup is simply a copy of the database file.
 * No external tools are involved; everything runs against `record.filePath`.
 */
export interface SqliteBackupOptions {
  /** Absolute local file path to write the backup to (.db, or .db.gz when compressed). */
  filePath: string
  /** Defragment/shrink the output using VACUUM INTO instead of an exact copy. */
  compact: boolean
  /** Gzip the output file (path ends with .gz). */
  compress: boolean
}

export interface SqliteRestoreOptions {
  /** Absolute local file path of the backup to restore (gzip auto-detected). */
  filePath: string
  /** Copy the current database to a timestamped file before overwriting it. */
  safetyCopy: boolean
}

export type ExecuteSqliteBackupResult =
  | { status: 'ok'; filePath: string; durationMs: number; bytes: number }
  | { status: 'error'; message: string }

export type ExecuteSqliteRestoreResult =
  | { status: 'ok'; durationMs: number; safetyCopyPath?: string }
  | { status: 'error'; message: string }

export interface DatabaseProvider {
  connect(record: ConnectionRecord): Promise<void>
  disconnect(): Promise<void>
  listDatabases(showSystemDatabases: boolean): Promise<ExplorerNode[]>
  listCategories(databaseName: string): ExplorerNode[]
  listTables(databaseName: string): Promise<ExplorerNode[]>
  listViews(databaseName: string): Promise<ExplorerNode[]>
  listStoredProcedures(databaseName: string): Promise<ExplorerNode[]>
  listFunctions(databaseName: string): Promise<ExplorerNode[]>
  listTypes(databaseName: string): Promise<ExplorerNode[]>
  listTypeCategories(databaseName: string): ExplorerNode[]
  listTypeDataTypes(databaseName: string): Promise<ExplorerNode[]>
  listTypeTables(databaseName: string): Promise<ExplorerNode[]>
  listTypeMemoryOptimizedTables(databaseName: string): Promise<ExplorerNode[]>
  listTableCategories(databaseName: string, tableIdentifier: string): ExplorerNode[]
  listColumns(databaseName: string, schemaName: string, tableName: string): Promise<ExplorerNode[]>
  listKeys(databaseName: string, schemaName: string, tableName: string): Promise<ExplorerNode[]>
  listConstraints(databaseName: string, schemaName: string, tableName: string): Promise<ExplorerNode[]>
  listTriggers(databaseName: string, schemaName: string, tableName: string): Promise<ExplorerNode[]>
  listIndexes(databaseName: string, schemaName: string, tableName: string): Promise<ExplorerNode[]>
  listStatistics(databaseName: string, schemaName: string, tableName: string): Promise<ExplorerNode[]>
  getTableSchema(databaseName: string, schemaName: string, tableName: string): Promise<GetTableSchemaResult>
  getForeignKeys(databaseName: string, schemaName: string, tableName: string): Promise<GetForeignKeysResult>
  getCheckConstraints(databaseName: string, schemaName: string, tableName: string): Promise<GetCheckConstraintsResult>
  getTriggers(databaseName: string, schemaName: string, tableName: string): Promise<GetTriggersResult>
  saveTrigger(databaseName: string, params: SaveTriggerParams, originalTriggerName?: string): Promise<SaveTriggerResult>
  deleteTrigger(databaseName: string, triggerName: string, schemaName: string): Promise<DeleteTriggerResult>
  getIndexes(databaseName: string, schemaName: string, tableName: string): Promise<GetIndexesResult>
  saveIndex(databaseName: string, params: SaveIndexParams, originalIndexName?: string): Promise<SaveIndexResult>
  deleteIndex(databaseName: string, indexName: string, schemaName: string, tableName: string): Promise<DeleteIndexResult>
  rebuildIndex(databaseName: string, indexName: string, schemaName: string, tableName: string): Promise<RebuildIndexResult>
  reorganizeIndex(databaseName: string, indexName: string, schemaName: string, tableName: string): Promise<ReorganizeIndexResult>
  disableIndex(databaseName: string, indexName: string, schemaName: string, tableName: string): Promise<DisableIndexResult>
  getErdSchema(databaseName: string): Promise<GetErdSchemaResult>
  getViews(databaseName: string): Promise<GetViewsResult>
  saveView(databaseName: string, params: SaveViewParams, originalViewName?: string): Promise<SaveViewResult>
  deleteView(databaseName: string, schemaName: string, viewName: string): Promise<DeleteViewResult>
  getStoredProcedures(databaseName: string): Promise<GetStoredProceduresResult>
  saveStoredProcedure(databaseName: string, params: SaveStoredProcedureParams, originalProcedureName?: string): Promise<SaveStoredProcedureResult>
  deleteStoredProcedure(databaseName: string, schemaName: string, procedureName: string): Promise<DeleteStoredProcedureResult>
  getDataTypes(databaseName: string): Promise<GetDataTypesResult>
  saveDataType(databaseName: string, params: SaveDataTypeParams, originalTypeName?: string, originalSchemaName?: string): Promise<SaveDataTypeResult>
  deleteDataType(databaseName: string, schemaName: string, typeName: string): Promise<DeleteDataTypeResult>
  getTableTypes(databaseName: string): Promise<GetTableTypesResult>
  getTableType(databaseName: string, schemaName: string, typeName: string): Promise<GetTableTypeResult>
  saveTableType(databaseName: string, params: SaveTableTypeParams, originalTypeName?: string, originalSchemaName?: string): Promise<SaveTableTypeResult>
  deleteTableType(databaseName: string, schemaName: string, typeName: string): Promise<DeleteTableTypeResult>
  getMemoryOptimizedTableTypes(databaseName: string): Promise<GetMemoryOptimizedTableTypesResult>
  getMemoryOptimizedTableType(databaseName: string, schemaName: string, typeName: string): Promise<GetMemoryOptimizedTableTypeResult>
  saveMemoryOptimizedTableType(databaseName: string, params: SaveMemoryOptimizedTableTypeParams, originalTypeName?: string, originalSchemaName?: string): Promise<SaveMemoryOptimizedTableTypeResult>
  deleteMemoryOptimizedTableType(databaseName: string, schemaName: string, typeName: string): Promise<DeleteMemoryOptimizedTableTypeResult>
  executeQuery(sql: string, timeoutMs?: number, withPlan?: boolean, withStatistics?: boolean, databaseName?: string): Promise<ExecuteQueryResult>
  executeMonitoringQuery<T>(sql: string): Promise<T[]>
  scriptTableCreate(databaseName: string, schemaName: string, tableName: string): Promise<GenerateScriptResult>
  scriptTableAlter(databaseName: string, schemaName: string, tableName: string): Promise<GenerateScriptResult>
  scriptTableDrop(databaseName: string, schemaName: string, tableName: string): Promise<GenerateScriptResult>
  scriptViewCreate(databaseName: string, schemaName: string, viewName: string): Promise<GenerateScriptResult>
  scriptViewAlter(databaseName: string, schemaName: string, viewName: string): Promise<GenerateScriptResult>
  scriptViewDrop(databaseName: string, schemaName: string, viewName: string): Promise<GenerateScriptResult>
  scriptStoredProcedureCreate(databaseName: string, schemaName: string, procedureName: string): Promise<GenerateScriptResult>
  scriptStoredProcedureAlter(databaseName: string, schemaName: string, procedureName: string): Promise<GenerateScriptResult>
  scriptStoredProcedureDrop(databaseName: string, schemaName: string, procedureName: string): Promise<GenerateScriptResult>
  scriptSelectTopRows(databaseName: string, schemaName: string, tableName: string, count: number): Promise<GenerateScriptResult>
  scriptDropDatabase(databaseName: string): Promise<GenerateScriptResult>
  listServerSecurityCategories(): ExplorerNode[]
  listServerUsers(): Promise<ExplorerNode[]>
  listServerRoles(): Promise<ExplorerNode[]>
  listServerSchemas(): Promise<ExplorerNode[]>
  listDatabaseSecurityCategories(databaseName: string): ExplorerNode[]
  listDatabaseUsers(databaseName: string): Promise<ExplorerNode[]>
  listDatabaseRoles(databaseName: string): Promise<ExplorerNode[]>
  listDatabaseSchemas(databaseName: string): Promise<ExplorerNode[]>
  getCapabilities(): ProviderCapabilities
  /** Redis-specific: list key prefixes and bare keys for a given DB index (0-based string). */
  listRedisKeyPrefixes?(databaseIndex: string): Promise<ExplorerNode[]>
  /** Redis-specific: list all keys under a given prefix in the specified DB index. */
  listRedisKeysForPrefix?(databaseIndex: string, prefix: string): Promise<ExplorerNode[]>
  /** Redis-specific: delete a single key from the given DB index. */
  deleteRedisKey?(databaseIndex: string, keyName: string): Promise<DeleteRedisKeyResult>
  /** Redis-specific: delete all keys matching prefix:* from the given DB index. */
  deleteRedisPrefix?(databaseIndex: string, prefix: string): Promise<DeleteRedisKeyResult>
  /** Redis-specific: get a structured dashboard snapshot. */
  getRedisDashboard?(): Promise<RedisDashboardResult>
  /** Redis-specific: execute a maintenance command. */
  executeRedisDashboardCommand?(command: RedisDashboardCommand, databaseIndex?: number): Promise<RedisDashboardCommandResult>
  /** Redis-specific: list all keys in a database with type/TTL/size/preview. */
  getRedisDbKeys?(databaseIndex: string): Promise<GetRedisDbKeysResult>
  /** Redis-specific: fetch full value of a single key for editing. */
  getRedisKeyValue?(databaseIndex: string, keyName: string): Promise<GetRedisKeyValueResult>
  /** Redis-specific: write a key value (replace + optional TTL). */
  saveRedisKey?(databaseIndex: string, params: SaveRedisKeyParams): Promise<SaveRedisKeyResult>
  /** Redis-specific: back up scoped database(s) to a file via native DUMP. */
  backupDatabases?(opts: RedisBackupOptions): Promise<ExecuteRedisBackupResult>
  /** Redis-specific: restore a backup file via native RESTORE. */
  restoreDatabases?(opts: RedisRestoreOptions): Promise<ExecuteRedisRestoreResult>
  /** MongoDB-specific: list the virtual sub-categories of a collection. */
  listCollectionChildren?(databaseName: string, collectionName: string): Promise<ExplorerNode[]>
}

export type DeleteRedisKeyResult =
  | { status: 'ok'; deletedCount: number }
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

// ─── MongoDB Index Types ──────────────────────────────────────────────────────

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

// ─── MongoDB Aggregation Types ────────────────────────────────────────────────

export interface MongoAggregationStageParam {
  id: string
  stageType: string
  json: string
  enabled: boolean
  collapsed: boolean
}

export interface SaveMongoAggregationParams {
  name: string
  stages: MongoAggregationStageParam[]
}

export type GetMongoAggregationsResult =
  | { status: 'ok'; aggregations: import('../store').MongoAggregationDefinition[] }
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

// ── MongoDB Validation ────────────────────────────────────────────────────────

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

// ─── Backup & Restore (Redis) ─────────────────────────────────────────────────

/** One serialized key in a Redis backup. `payload` is base64 of the Redis DUMP
 * binary; `pttl` is the remaining TTL in milliseconds (-1 = no expiry). */
export interface RedisBackupKeyEntry {
  key: string
  pttl: number
  payload: string
}

export interface RedisBackupDatabase {
  index: number
  keys: RedisBackupKeyEntry[]
}

/** On-disk Redis backup file format. */
export interface RedisBackupFile {
  spiralRedisBackup: 1
  createdAt: string
  source: { connectionName?: string; mode: string }
  databases: RedisBackupDatabase[]
}

/** What a Redis backup should cover: a single database index or every database. */
export type RedisBackupScope = { kind: 'database'; databaseIndex: number } | { kind: 'all' }

export interface RedisBackupOptions {
  /** Absolute local file path to write the backup to (.json or .json.gz). */
  filePath: string
  scope: RedisBackupScope
  /** Gzip the output (file ends with .json.gz). */
  compress: boolean
}

/** How to handle keys that already exist in the target database during restore. */
export type RedisRestoreConflict = 'replace' | 'flush' | 'skip'

export interface RedisRestoreOptions {
  /** Absolute local file path of the backup to restore (.json or .json.gz). */
  filePath: string
  conflict: RedisRestoreConflict
  /** For a single-database backup, restore into this index instead of the
   * original one. Ignored for multi-database backups (keys keep their index). */
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

// ─── Backup & Restore (MongoDB) ───────────────────────────────────────────────

/** Engine that actually produced/consumed a MongoDB backup. */
export type MongoBackupEngine = 'mongodump' | 'js'

export interface MongoBackupOptions {
  databaseName: string
  /** Absolute local file path to write the backup to (chosen via save dialog). */
  filePath: string
  /** Gzip the output (CLI: .archive.gz, JS: .json.gz). */
  gzip: boolean
  /** Optional override path to the mongodump binary. */
  mongodumpPath?: string
}

export interface MongoRestoreOptions {
  /** Absolute local file path of the backup to restore (.archive[.gz] or .json[.gz]). */
  filePath: string
  /** Database the backup was taken from; used to remap CLI archive namespaces. */
  sourceDatabaseName: string
  /** Target database to restore into (remapped from the source database name). */
  targetDatabaseName: string
  /** Drop each collection before restoring it. */
  drop: boolean
  /** Abort on the first error (true) or keep going (false). */
  stopOnError: boolean
  /** Optional override path to the mongorestore binary. */
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

export interface DatabaseUserDetails {
  name: string
  /** type code from sys.database_principals: S=SQL, U=Windows, G=Windows group, E=External/Entra, X=Entra group */
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

// ─── MongoDB User Management Types ───────────────────────────────────────────

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

import { createPool } from 'mysql2/promise'
import type { Pool, FieldPacket, RowDataPacket } from 'mysql2/promise'
import type { ConnectionRecord } from '../../store'
import type {
  DatabaseProvider,
  ExplorerNode,
  ExecuteQueryResult,
  GetTableSchemaResult,
  TableColumnMeta,
  ErdTable,
  ErdRelationship,
  ErdIndex,
  GetErdSchemaResult,
  ForeignKeyDefinition,
  GetForeignKeysResult,
  CheckConstraintDefinition,
  GetCheckConstraintsResult,
  TriggerDefinition,
  GetTriggersResult,
  SaveTriggerParams,
  SaveTriggerResult,
  DeleteTriggerResult,
  IndexColumnEntry,
  IndexDefinition,
  GetIndexesResult,
  SaveIndexParams,
  SaveIndexResult,
  DeleteIndexResult,
  RebuildIndexResult,
  ReorganizeIndexResult,
  DisableIndexResult,
  ViewDefinition,
  GetViewsResult,
  SaveViewParams,
  SaveViewResult,
  DeleteViewResult,
  StoredProcedureDefinition,
  GetStoredProceduresResult,
  SaveStoredProcedureParams,
  SaveStoredProcedureResult,
  DeleteStoredProcedureResult,
  GetDataTypesResult,
  SaveDataTypeParams,
  SaveDataTypeResult,
  DeleteDataTypeResult,
  GetTableTypesResult,
  GetTableTypeResult,
  SaveTableTypeParams,
  SaveTableTypeResult,
  DeleteTableTypeResult,
  GetMemoryOptimizedTableTypesResult,
  GetMemoryOptimizedTableTypeResult,
  SaveMemoryOptimizedTableTypeParams,
  SaveMemoryOptimizedTableTypeResult,
  DeleteMemoryOptimizedTableTypeResult,
  GenerateScriptResult,
  ProviderCapabilities,
  MySqlUserDetails,
  MySqlGlobalPrivilegeEntry,
  MySqlDatabasePrivilegeEntry,
  SaveMySqlUserParams,
  SaveMySqlUserResult,
  DeleteMySqlUserResult,
  SaveMySqlDatabaseUserPrivilegesParams,
  SaveMySqlDatabaseUserPrivilegesResult,
  MySqlBackupOptions,
  MySqlRestoreOptions,
  MySqlToolInfo,
  MySqlBackupToolStatusResult,
  BuildMySqlBackupPreviewResult,
  ExecuteMySqlBackupResult,
  ExecuteMySqlRestoreResult
} from '../types'
import { spawn, execFile } from 'node:child_process'
import { createReadStream, createWriteStream, statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createGzip, createGunzip, gunzipSync } from 'node:zlib'
import { dumpDatabaseToFile, restoreFromText } from './mysqlDump'
import type { DumpRow } from './mysqlDump'

/** System databases hidden unless showSystemDatabases is true. */
const SYSTEM_DATABASES = new Set(['information_schema', 'mysql', 'performance_schema', 'sys'])

export const MYSQL_GLOBAL_PRIVILEGES = [
  'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP', 'RELOAD',
  'PROCESS', 'FILE', 'REFERENCES', 'INDEX', 'ALTER', 'SHOW DATABASES',
  'SUPER', 'CREATE TEMPORARY TABLES', 'LOCK TABLES', 'EXECUTE',
  'REPLICATION SLAVE', 'REPLICATION CLIENT', 'CREATE VIEW', 'SHOW VIEW',
  'CREATE ROUTINE', 'ALTER ROUTINE', 'CREATE USER', 'EVENT', 'TRIGGER'
]

export const MYSQL_DATABASE_PRIVILEGES = [
  'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP',
  'ALTER', 'INDEX', 'CREATE VIEW', 'SHOW VIEW'
]

/** Wraps a MySQL identifier in backticks, escaping any existing backticks. */
function qi(identifier: string): string {
  return '`' + identifier.replace(/`/g, '``') + '`'
}

/**
 * MySQL database provider.
 *
 * MySQL has no schema layer between database and table, so the database name
 * is used as the schema identifier throughout the node tree. Per-database
 * connection pools are lazily created as the user navigates, mirroring the
 * pattern used by PostgresProvider.
 */
export class MySqlProvider implements DatabaseProvider {
  private defaultPool: Pool | null = null
  private dbPools = new Map<string, Pool>()
  private connectionRecord: ConnectionRecord | null = null

  // ── Connection ────────────────────────────────────────────────────────────

  async connect(record: ConnectionRecord): Promise<void> {
    this.connectionRecord = record
    this.defaultPool = createPool({
      host: record.host,
      port: record.port,
      user: record.username,
      password: record.password,
      database: record.defaultDatabase || undefined,
      waitForConnections: true,
      connectionLimit: 5,
      connectTimeout: 10_000
    })
    const connection = await this.defaultPool.getConnection()
    connection.release()
  }

  async disconnect(): Promise<void> {
    await Promise.all([
      this.defaultPool?.end(),
      ...[...this.dbPools.values()].map((p) => p.end())
    ])
    this.defaultPool = null
    this.dbPools.clear()
    this.connectionRecord = null
  }

  // ── Internal helpers ──────────────────────────────────────────────────────

  private get record(): ConnectionRecord {
    if (!this.connectionRecord) throw new Error('Not connected')
    return this.connectionRecord
  }

  /** Returns (or lazily creates) a pool connected to the given database. */
  private getPool(databaseName: string): Pool {
    const defaultDb = this.record.defaultDatabase || ''
    if (databaseName === defaultDb && this.defaultPool) return this.defaultPool

    let pool = this.dbPools.get(databaseName)
    if (!pool) {
      pool = createPool({
        host: this.record.host,
        port: this.record.port,
        user: this.record.username,
        password: this.record.password,
        database: databaseName,
        waitForConnections: true,
        connectionLimit: 5,
        connectTimeout: 10_000
      })
      this.dbPools.set(databaseName, pool)
    }
    return pool
  }

  private async query<T extends RowDataPacket>(
    pool: Pool,
    sql: string,
    params?: unknown[]
  ): Promise<T[]> {
    const connection = await pool.getConnection()
    try {
      const [rows] = await connection.query<T[]>(sql, params)
      return rows
    } finally {
      connection.release()
    }
  }

  // ── Tree listing ──────────────────────────────────────────────────────────

  async listDatabases(showSystemDatabases: boolean): Promise<ExplorerNode[]> {
    const pool = this.defaultPool ?? this.getPool(this.record.defaultDatabase || 'mysql')
    const rows = await this.query<RowDataPacket & { Database: string }>(pool, 'SHOW DATABASES')
    return rows
      .filter((r) => showSystemDatabases || !SYSTEM_DATABASES.has(r.Database))
      .map((r) => ({ id: `db:${r.Database}`, label: r.Database, kind: 'database' as const }))
  }

  listCategories(databaseName: string): ExplorerNode[] {
    return [
      { id: `db:${databaseName}:tables`, label: 'Tables', kind: 'tables-folder' as const },
      { id: `db:${databaseName}:views`, label: 'Views', kind: 'views-folder' as const },
      {
        id: `db:${databaseName}:stored-procedures`,
        label: 'Stored Procedures',
        kind: 'stored-procedures-folder' as const
      },
      { id: `db:${databaseName}:functions`, label: 'Functions', kind: 'functions-folder' as const },
      { id: `db:${databaseName}:security`, label: 'Security', kind: 'security-folder' as const }
    ]
  }

  listServerSecurityCategories(): ExplorerNode[] {
    return [
      { id: 'security:users', label: 'Users', kind: 'security-users-folder' as const },
      { id: 'security:roles', label: 'Roles', kind: 'security-roles-folder' as const },
      { id: 'security:schemas', label: 'Schemas', kind: 'security-schemas-folder' as const }
    ]
  }

  async listServerUsers(): Promise<ExplorerNode[]> {
    const pool = this.defaultPool ?? this.getPool(this.record.defaultDatabase || 'mysql')
    const rows = await this.query<RowDataPacket & { user: string; host: string }>(
      pool,
      `SELECT user, host FROM mysql.user ORDER BY user, host`
    )
    return rows.map((r) => ({
      id: `security:users:${r.user}@${r.host}`,
      label: `${r.user}@${r.host}`,
      kind: 'security-user' as const
    }))
  }

  async listServerRoles(): Promise<ExplorerNode[]> {
    // MySQL 8+ roles; return empty for broader compatibility
    return []
  }

  async listServerSchemas(): Promise<ExplorerNode[]> {
    // MySQL uses databases as schemas; not applicable at server level
    return []
  }

  listDatabaseSecurityCategories(databaseName: string): ExplorerNode[] {
    return [
      { id: `db:${databaseName}:security:users`, label: 'Users', kind: 'security-users-folder' as const },
      { id: `db:${databaseName}:security:roles`, label: 'Roles', kind: 'security-roles-folder' as const },
      { id: `db:${databaseName}:security:schemas`, label: 'Schemas', kind: 'security-schemas-folder' as const }
    ]
  }

  async listDatabaseUsers(databaseName: string): Promise<ExplorerNode[]> {
    const pool = this.defaultPool ?? this.getPool(databaseName)
    const rows = await this.query<RowDataPacket & { user: string; host: string }>(
      pool,
      `SELECT user, host FROM mysql.user ORDER BY user, host`
    )
    return rows.map((r) => ({
      id: `db:${databaseName}:security:users:${r.user}@${r.host}`,
      label: `${r.user}@${r.host}`,
      kind: 'security-user' as const
    }))
  }

  async listDatabaseRoles(_databaseName: string): Promise<ExplorerNode[]> {
    // MySQL 8+ roles; return empty for broader compatibility
    return []
  }

  async listDatabaseSchemas(_databaseName: string): Promise<ExplorerNode[]> {
    // MySQL uses databases as schemas; not applicable per-database
    return []
  }

  async listTables(databaseName: string): Promise<ExplorerNode[]> {
    const pool = this.getPool(databaseName)
    const rows = await this.query<RowDataPacket & { TABLE_NAME: string }>(
      pool,
      `SELECT TABLE_NAME FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
       ORDER BY TABLE_NAME`,
      [databaseName]
    )
    return rows.map((r) => ({
      id: `db:${databaseName}:tables:${databaseName}.${r.TABLE_NAME}`,
      label: r.TABLE_NAME,
      kind: 'table' as const
    }))
  }

  async listViews(databaseName: string): Promise<ExplorerNode[]> {
    const pool = this.getPool(databaseName)
    const rows = await this.query<RowDataPacket & { TABLE_NAME: string }>(
      pool,
      `SELECT TABLE_NAME FROM information_schema.VIEWS
       WHERE TABLE_SCHEMA = ?
       ORDER BY TABLE_NAME`,
      [databaseName]
    )
    return rows.map((r) => ({
      id: `db:${databaseName}:views:${databaseName}.${r.TABLE_NAME}`,
      label: r.TABLE_NAME,
      kind: 'view' as const
    }))
  }

  async listStoredProcedures(databaseName: string): Promise<ExplorerNode[]> {
    const pool = this.getPool(databaseName)
    const rows = await this.query<RowDataPacket & { ROUTINE_NAME: string }>(
      pool,
      `SELECT ROUTINE_NAME FROM information_schema.ROUTINES
       WHERE ROUTINE_SCHEMA = ? AND ROUTINE_TYPE = 'PROCEDURE'
       ORDER BY ROUTINE_NAME`,
      [databaseName]
    )
    return rows.map((r) => ({
      id: `db:${databaseName}:stored-procedures:${databaseName}.${r.ROUTINE_NAME}`,
      label: r.ROUTINE_NAME,
      kind: 'stored-procedure' as const
    }))
  }

  async listFunctions(databaseName: string): Promise<ExplorerNode[]> {
    const pool = this.getPool(databaseName)
    const rows = await this.query<RowDataPacket & { ROUTINE_NAME: string }>(
      pool,
      `SELECT ROUTINE_NAME FROM information_schema.ROUTINES
       WHERE ROUTINE_SCHEMA = ? AND ROUTINE_TYPE = 'FUNCTION'
       ORDER BY ROUTINE_NAME`,
      [databaseName]
    )
    return rows.map((r) => ({
      id: `db:${databaseName}:functions:${databaseName}.${r.ROUTINE_NAME}`,
      label: r.ROUTINE_NAME,
      kind: 'function' as const
    }))
  }

  // MySQL has no standalone user-defined types
  async listTypes(_databaseName: string): Promise<ExplorerNode[]> {
    return []
  }

  listTypeCategories(_databaseName: string): ExplorerNode[] {
    return []
  }

  async listTypeDataTypes(_databaseName: string): Promise<ExplorerNode[]> {
    return []
  }

  async listTypeTables(_databaseName: string): Promise<ExplorerNode[]> {
    return []
  }

  async listTypeMemoryOptimizedTables(_databaseName: string): Promise<ExplorerNode[]> {
    return []
  }

  listTableCategories(databaseName: string, tableIdentifier: string): ExplorerNode[] {
    const base = `db:${databaseName}:tables:${tableIdentifier}`
    return [
      { id: `${base}:columns`, label: 'Columns', kind: 'table-columns-folder' as const },
      { id: `${base}:keys`, label: 'Keys', kind: 'table-keys-folder' as const },
      { id: `${base}:constraints`, label: 'Constraints', kind: 'table-constraints-folder' as const },
      { id: `${base}:triggers`, label: 'Triggers', kind: 'table-triggers-folder' as const },
      { id: `${base}:indexes`, label: 'Indexes', kind: 'table-indexes-folder' as const }
    ]
  }

  async listColumns(
    databaseName: string,
    schemaName: string,
    tableName: string
  ): Promise<ExplorerNode[]> {
    const pool = this.getPool(databaseName)
    const rows = await this.query<
      RowDataPacket & {
        COLUMN_NAME: string
        DATA_TYPE: string
        IS_NULLABLE: string
        COLUMN_KEY: string
      }
    >(
      pool,
      `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_KEY
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
       ORDER BY ORDINAL_POSITION`,
      [schemaName, tableName]
    )
    return rows.map((r) => ({
      id: `db:${databaseName}:tables:${schemaName}.${tableName}:columns:${r.COLUMN_NAME}`,
      label: `${r.COLUMN_NAME} (${r.DATA_TYPE}, ${r.IS_NULLABLE === 'YES' ? 'null' : 'not null'})`,
      kind: r.COLUMN_KEY === 'PRI' ? ('column-pk' as const) : ('column' as const)
    }))
  }

  async listKeys(
    databaseName: string,
    schemaName: string,
    tableName: string
  ): Promise<ExplorerNode[]> {
    const pool = this.getPool(databaseName)
    const rows = await this.query<
      RowDataPacket & { CONSTRAINT_NAME: string; CONSTRAINT_TYPE: string }
    >(
      pool,
      `SELECT CONSTRAINT_NAME, CONSTRAINT_TYPE
       FROM information_schema.TABLE_CONSTRAINTS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
         AND CONSTRAINT_TYPE IN ('PRIMARY KEY', 'FOREIGN KEY')
       ORDER BY CONSTRAINT_TYPE, CONSTRAINT_NAME`,
      [schemaName, tableName]
    )
    return rows.map((r) => ({
      id: `db:${databaseName}:tables:${schemaName}.${tableName}:keys:${r.CONSTRAINT_NAME}`,
      label: `${r.CONSTRAINT_NAME} (${r.CONSTRAINT_TYPE})`,
      kind: 'key' as const
    }))
  }

  async listConstraints(
    databaseName: string,
    schemaName: string,
    tableName: string
  ): Promise<ExplorerNode[]> {
    const pool = this.getPool(databaseName)
    const rows = await this.query<RowDataPacket & { CONSTRAINT_NAME: string }>(
      pool,
      `SELECT CONSTRAINT_NAME
       FROM information_schema.TABLE_CONSTRAINTS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND CONSTRAINT_TYPE = 'CHECK'
       ORDER BY CONSTRAINT_NAME`,
      [schemaName, tableName]
    )
    return rows.map((r) => ({
      id: `db:${databaseName}:tables:${schemaName}.${tableName}:constraints:${r.CONSTRAINT_NAME}`,
      label: r.CONSTRAINT_NAME,
      kind: 'constraint' as const
    }))
  }

  async listTriggers(
    databaseName: string,
    schemaName: string,
    tableName: string
  ): Promise<ExplorerNode[]> {
    const pool = this.getPool(databaseName)
    const rows = await this.query<RowDataPacket & { TRIGGER_NAME: string }>(
      pool,
      `SELECT TRIGGER_NAME
       FROM information_schema.TRIGGERS
       WHERE TRIGGER_SCHEMA = ? AND EVENT_OBJECT_TABLE = ?
       ORDER BY TRIGGER_NAME`,
      [schemaName, tableName]
    )
    return rows.map((r) => ({
      id: `db:${databaseName}:tables:${schemaName}.${tableName}:triggers:${r.TRIGGER_NAME}`,
      label: r.TRIGGER_NAME,
      kind: 'trigger' as const
    }))
  }

  async listIndexes(
    databaseName: string,
    schemaName: string,
    tableName: string
  ): Promise<ExplorerNode[]> {
    const pool = this.getPool(databaseName)
    const rows = await this.query<RowDataPacket & { INDEX_NAME: string }>(
      pool,
      `SELECT DISTINCT INDEX_NAME
       FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
       ORDER BY INDEX_NAME`,
      [schemaName, tableName]
    )
    return rows.map((r) => ({
      id: `db:${databaseName}:tables:${schemaName}.${tableName}:indexes:${r.INDEX_NAME}`,
      label: r.INDEX_NAME,
      kind: 'index' as const
    }))
  }

  async listStatistics(
    _databaseName: string,
    _schemaName: string,
    _tableName: string
  ): Promise<ExplorerNode[]> {
    return []
  }

  // ── Table schema / detail ─────────────────────────────────────────────────

  async getTableSchema(
    databaseName: string,
    schemaName: string,
    tableName: string
  ): Promise<GetTableSchemaResult> {
    try {
      const pool = this.getPool(databaseName)
      const rows = await this.query<
        RowDataPacket & {
          COLUMN_NAME: string
          DATA_TYPE: string
          CHARACTER_MAXIMUM_LENGTH: number | null
          NUMERIC_PRECISION: number | null
          NUMERIC_SCALE: number | null
          IS_NULLABLE: string
          COLUMN_DEFAULT: string | null
          EXTRA: string
          COLUMN_KEY: string
        }
      >(
        pool,
        `SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, NUMERIC_PRECISION,
                NUMERIC_SCALE, IS_NULLABLE, COLUMN_DEFAULT, EXTRA, COLUMN_KEY
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
         ORDER BY ORDINAL_POSITION`,
        [schemaName, tableName]
      )
      const columns: TableColumnMeta[] = rows.map((r) => ({
        name: r.COLUMN_NAME,
        type: r.DATA_TYPE,
        maxLength: r.CHARACTER_MAXIMUM_LENGTH,
        precision: r.NUMERIC_PRECISION,
        scale: r.NUMERIC_SCALE,
        isNullable: r.IS_NULLABLE === 'YES',
        defaultValue: r.COLUMN_DEFAULT,
        isIdentity: r.EXTRA.toLowerCase().includes('auto_increment'),
        identitySeed: r.EXTRA.toLowerCase().includes('auto_increment') ? 1 : null,
        identityIncrement: r.EXTRA.toLowerCase().includes('auto_increment') ? 1 : null,
        isPrimaryKey: r.COLUMN_KEY === 'PRI'
      }))
      return { status: 'ok', columns }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async getForeignKeys(
    databaseName: string,
    schemaName: string,
    tableName: string
  ): Promise<GetForeignKeysResult> {
    try {
      const pool = this.getPool(databaseName)
      const rows = await this.query<
        RowDataPacket & {
          CONSTRAINT_NAME: string
          COLUMN_NAME: string
          REFERENCED_TABLE_SCHEMA: string
          REFERENCED_TABLE_NAME: string
          REFERENCED_COLUMN_NAME: string
          DELETE_RULE: string
          UPDATE_RULE: string
        }
      >(
        pool,
        `SELECT kcu.CONSTRAINT_NAME, kcu.COLUMN_NAME,
                kcu.REFERENCED_TABLE_SCHEMA, kcu.REFERENCED_TABLE_NAME, kcu.REFERENCED_COLUMN_NAME,
                rc.DELETE_RULE, rc.UPDATE_RULE
         FROM information_schema.KEY_COLUMN_USAGE kcu
         JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
           ON kcu.CONSTRAINT_NAME = rc.CONSTRAINT_NAME
           AND kcu.CONSTRAINT_SCHEMA = rc.CONSTRAINT_SCHEMA
         WHERE kcu.TABLE_SCHEMA = ? AND kcu.TABLE_NAME = ?
           AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
         ORDER BY kcu.CONSTRAINT_NAME, kcu.ORDINAL_POSITION`,
        [schemaName, tableName]
      )

      const mapRule = (r: string): ForeignKeyDefinition['deleteRule'] => {
        const upper = r.toUpperCase()
        if (upper === 'CASCADE') return 'CASCADE'
        if (upper === 'SET NULL') return 'SET_NULL'
        if (upper === 'SET DEFAULT') return 'SET_DEFAULT'
        return 'NO_ACTION'
      }

      const foreignKeys: ForeignKeyDefinition[] = rows.map((r) => ({
        constraintName: r.CONSTRAINT_NAME,
        columnName: r.COLUMN_NAME,
        referencedSchema: r.REFERENCED_TABLE_SCHEMA,
        referencedTable: r.REFERENCED_TABLE_NAME,
        referencedColumn: r.REFERENCED_COLUMN_NAME,
        isEnabled: true,
        enforceForReplication: false,
        deleteRule: mapRule(r.DELETE_RULE),
        updateRule: mapRule(r.UPDATE_RULE)
      }))

      return { status: 'ok', foreignKeys }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async getCheckConstraints(
    databaseName: string,
    schemaName: string,
    tableName: string
  ): Promise<GetCheckConstraintsResult> {
    try {
      const pool = this.getPool(databaseName)
      // CHECK constraints are available in information_schema from MySQL 8.0.16+
      const rows = await this.query<
        RowDataPacket & { CONSTRAINT_NAME: string; CHECK_CLAUSE: string }
      >(
        pool,
        `SELECT cc.CONSTRAINT_NAME, cc.CHECK_CLAUSE
         FROM information_schema.CHECK_CONSTRAINTS cc
         JOIN information_schema.TABLE_CONSTRAINTS tc
           ON cc.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
           AND cc.CONSTRAINT_SCHEMA = tc.CONSTRAINT_SCHEMA
         WHERE tc.TABLE_SCHEMA = ? AND tc.TABLE_NAME = ?
         ORDER BY cc.CONSTRAINT_NAME`,
        [schemaName, tableName]
      )
      const constraints: CheckConstraintDefinition[] = rows.map((r) => ({
        constraintName: r.CONSTRAINT_NAME,
        condition: r.CHECK_CLAUSE,
        isEnabled: true,
        checkExistingData: true,
        enforceForReplication: false
      }))
      return { status: 'ok', constraints }
    } catch {
      // CHECK_CONSTRAINTS table does not exist on MySQL < 8.0.16
      return { status: 'ok', constraints: [] }
    }
  }

  async getTriggers(
    databaseName: string,
    schemaName: string,
    tableName: string
  ): Promise<GetTriggersResult> {
    try {
      const pool = this.getPool(databaseName)
      const rows = await this.query<
        RowDataPacket & {
          TRIGGER_NAME: string
          EVENT_MANIPULATION: string
          ACTION_TIMING: string
          ACTION_STATEMENT: string
        }
      >(
        pool,
        `SELECT TRIGGER_NAME, EVENT_MANIPULATION, ACTION_TIMING, ACTION_STATEMENT
         FROM information_schema.TRIGGERS
         WHERE TRIGGER_SCHEMA = ? AND EVENT_OBJECT_TABLE = ?
         ORDER BY TRIGGER_NAME, EVENT_MANIPULATION`,
        [schemaName, tableName]
      )
      // MySQL triggers fire on exactly one event type each.
      const triggers: TriggerDefinition[] = rows.map((r) => ({
        triggerName: r.TRIGGER_NAME,
        isInsteadOf: false, // MySQL has no INSTEAD OF triggers
        isInsert: r.EVENT_MANIPULATION === 'INSERT',
        isUpdate: r.EVENT_MANIPULATION === 'UPDATE',
        isDelete: r.EVENT_MANIPULATION === 'DELETE',
        body: r.ACTION_STATEMENT
      }))
      return { status: 'ok', triggers }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async saveTrigger(
    databaseName: string,
    params: SaveTriggerParams,
    originalTriggerName?: string
  ): Promise<SaveTriggerResult> {
    try {
      const pool = this.getPool(databaseName)
      const dropName = originalTriggerName ?? params.triggerName

      await this.query(
        pool,
        `DROP TRIGGER IF EXISTS ${qi(params.schemaName)}.${qi(dropName)}`
      )

      // MySQL supports one event per trigger; use the first enabled event
      const event = params.isInsert
        ? 'INSERT'
        : params.isUpdate
          ? 'UPDATE'
          : params.isDelete
            ? 'DELETE'
            : null
      if (!event) return { status: 'error', message: 'No trigger event selected' }

      // MySQL has no INSTEAD OF; treat as BEFORE if isInsteadOf is set
      const timing = params.isInsteadOf ? 'BEFORE' : 'BEFORE'

      await this.query(
        pool,
        `CREATE TRIGGER ${qi(params.triggerName)}
         ${timing} ${event}
         ON ${qi(params.schemaName)}.${qi(params.tableName)}
         FOR EACH ROW
         ${params.body}`
      )
      return { status: 'ok' }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async deleteTrigger(
    databaseName: string,
    triggerName: string,
    schemaName: string
  ): Promise<DeleteTriggerResult> {
    try {
      const pool = this.getPool(databaseName)
      await this.query(pool, `DROP TRIGGER IF EXISTS ${qi(schemaName)}.${qi(triggerName)}`)
      return { status: 'ok' }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  // ── Indexes ───────────────────────────────────────────────────────────────

  async getIndexes(
    databaseName: string,
    schemaName: string,
    tableName: string
  ): Promise<GetIndexesResult> {
    try {
      const pool = this.getPool(databaseName)
      const rows = await this.query<
        RowDataPacket & {
          INDEX_NAME: string
          NON_UNIQUE: number
          COLUMN_NAME: string
          SEQ_IN_INDEX: number
          COLLATION: string | null
          INDEX_TYPE: string
        }
      >(
        pool,
        `SELECT INDEX_NAME, NON_UNIQUE, COLUMN_NAME, SEQ_IN_INDEX, COLLATION, INDEX_TYPE
         FROM information_schema.STATISTICS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
         ORDER BY INDEX_NAME, SEQ_IN_INDEX`,
        [schemaName, tableName]
      )

      const indexMap = new Map<
        string,
        { nonUnique: number; indexType: string; columns: IndexColumnEntry[] }
      >()
      for (const r of rows) {
        if (!indexMap.has(r.INDEX_NAME)) {
          indexMap.set(r.INDEX_NAME, { nonUnique: r.NON_UNIQUE, indexType: r.INDEX_TYPE, columns: [] })
        }
        indexMap.get(r.INDEX_NAME)!.columns.push({
          columnName: r.COLUMN_NAME,
          keyOrdinal: r.SEQ_IN_INDEX,
          isDescendingKey: r.COLLATION === 'D',
          isIncludedColumn: false
        })
      }

      const indexes: IndexDefinition[] = [...indexMap.entries()].map(([name, idx]) => ({
        name,
        schemaName,
        tableName,
        type: 'NONCLUSTERED',
        isUnique: idx.nonUnique === 0,
        isPrimaryKey: name === 'PRIMARY',
        isDisabled: false,
        columns: idx.columns
      }))

      return { status: 'ok', indexes }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async saveIndex(
    databaseName: string,
    params: SaveIndexParams,
    originalIndexName?: string
  ): Promise<SaveIndexResult> {
    try {
      const pool = this.getPool(databaseName)
      if (originalIndexName && originalIndexName !== params.name) {
        await this.query(
          pool,
          `DROP INDEX ${qi(originalIndexName)} ON ${qi(params.schemaName)}.${qi(params.tableName)}`
        )
      }
      const unique = params.isUnique ? 'UNIQUE ' : ''
      const cols = params.columns
        .filter((c) => !c.isIncludedColumn)
        .sort((a, b) => a.keyOrdinal - b.keyOrdinal)
        .map((c) => `${qi(c.columnName)}${c.isDescendingKey ? ' DESC' : ''}`)
        .join(', ')
      await this.query(
        pool,
        `CREATE ${unique}INDEX ${qi(params.name)} ON ${qi(params.schemaName)}.${qi(params.tableName)} (${cols})`
      )
      return { status: 'ok' }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async deleteIndex(
    databaseName: string,
    indexName: string,
    schemaName: string,
    tableName: string
  ): Promise<DeleteIndexResult> {
    try {
      const pool = this.getPool(databaseName)
      await this.query(pool, `DROP INDEX ${qi(indexName)} ON ${qi(schemaName)}.${qi(tableName)}`)
      return { status: 'ok' }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async rebuildIndex(
    databaseName: string,
    _indexName: string,
    schemaName: string,
    tableName: string
  ): Promise<RebuildIndexResult> {
    try {
      const pool = this.getPool(databaseName)
      // MySQL does not support per-index rebuild; OPTIMIZE TABLE rebuilds all indexes
      await this.query(pool, `OPTIMIZE TABLE ${qi(schemaName)}.${qi(tableName)}`)
      return { status: 'ok' }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async reorganizeIndex(
    _databaseName: string,
    _indexName: string,
    _schemaName: string,
    _tableName: string
  ): Promise<ReorganizeIndexResult> {
    return { status: 'error', message: 'Index reorganize is not supported for MySQL' }
  }

  async disableIndex(
    _databaseName: string,
    _indexName: string,
    _schemaName: string,
    _tableName: string
  ): Promise<DisableIndexResult> {
    return { status: 'error', message: 'Index disable is not supported for MySQL' }
  }

  // ── ERD schema ────────────────────────────────────────────────────────────

  async getErdSchema(databaseName: string): Promise<GetErdSchemaResult> {
    try {
      const pool = this.getPool(databaseName)

      const tableRows = await this.query<
        RowDataPacket & {
          TABLE_NAME: string
          COLUMN_NAME: string
          DATA_TYPE: string
          CHARACTER_MAXIMUM_LENGTH: number | null
          IS_NULLABLE: string
        }
      >(
        pool,
        `SELECT t.TABLE_NAME, c.COLUMN_NAME, c.DATA_TYPE, c.CHARACTER_MAXIMUM_LENGTH, c.IS_NULLABLE
         FROM information_schema.TABLES t
         JOIN information_schema.COLUMNS c
           ON c.TABLE_SCHEMA = t.TABLE_SCHEMA AND c.TABLE_NAME = t.TABLE_NAME
         WHERE t.TABLE_SCHEMA = ? AND t.TABLE_TYPE = 'BASE TABLE'
         ORDER BY t.TABLE_NAME, c.ORDINAL_POSITION`,
        [databaseName]
      )

      const pkRows = await this.query<RowDataPacket & { TABLE_NAME: string; COLUMN_NAME: string }>(
        pool,
        `SELECT kcu.TABLE_NAME, kcu.COLUMN_NAME
         FROM information_schema.TABLE_CONSTRAINTS tc
         JOIN information_schema.KEY_COLUMN_USAGE kcu
           ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
           AND tc.TABLE_SCHEMA = kcu.TABLE_SCHEMA
           AND tc.TABLE_NAME = kcu.TABLE_NAME
         WHERE tc.TABLE_SCHEMA = ? AND tc.CONSTRAINT_TYPE = 'PRIMARY KEY'`,
        [databaseName]
      )

      const fkRows = await this.query<
        RowDataPacket & {
          CONSTRAINT_NAME: string
          TABLE_NAME: string
          COLUMN_NAME: string
          REFERENCED_TABLE_NAME: string
          REFERENCED_COLUMN_NAME: string
        }
      >(
        pool,
        `SELECT kcu.CONSTRAINT_NAME, kcu.TABLE_NAME, kcu.COLUMN_NAME,
                kcu.REFERENCED_TABLE_NAME, kcu.REFERENCED_COLUMN_NAME
         FROM information_schema.KEY_COLUMN_USAGE kcu
         JOIN information_schema.TABLE_CONSTRAINTS tc
           ON kcu.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
           AND kcu.TABLE_SCHEMA = tc.TABLE_SCHEMA
           AND kcu.TABLE_NAME = tc.TABLE_NAME
         WHERE kcu.TABLE_SCHEMA = ? AND tc.CONSTRAINT_TYPE = 'FOREIGN KEY'
           AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
         ORDER BY kcu.CONSTRAINT_NAME, kcu.ORDINAL_POSITION`,
        [databaseName]
      )

      const indexRows = await this.query<
        RowDataPacket & { TABLE_NAME: string; INDEX_NAME: string; NON_UNIQUE: number }
      >(
        pool,
        `SELECT DISTINCT TABLE_NAME, INDEX_NAME, NON_UNIQUE
         FROM information_schema.STATISTICS
         WHERE TABLE_SCHEMA = ?
         ORDER BY TABLE_NAME, INDEX_NAME`,
        [databaseName]
      )

      const pkSet = new Set(pkRows.map((r) => `${r.TABLE_NAME}.${r.COLUMN_NAME}`))
      const fkSet = new Set(fkRows.map((r) => `${r.TABLE_NAME}.${r.COLUMN_NAME}`))

      const tableMap = new Map<string, ErdTable>()
      for (const r of tableRows) {
        if (!tableMap.has(r.TABLE_NAME)) {
          tableMap.set(r.TABLE_NAME, { schema: databaseName, name: r.TABLE_NAME, columns: [] })
        }
        const fullCol = `${r.TABLE_NAME}.${r.COLUMN_NAME}`
        tableMap.get(r.TABLE_NAME)!.columns.push({
          name: r.COLUMN_NAME,
          type: r.DATA_TYPE,
          maxLength: r.CHARACTER_MAXIMUM_LENGTH,
          isNullable: r.IS_NULLABLE === 'YES',
          isPrimaryKey: pkSet.has(fullCol),
          isForeignKey: fkSet.has(fullCol)
        })
      }

      const relationships: ErdRelationship[] = fkRows.map((r) => ({
        constraintName: r.CONSTRAINT_NAME,
        fromSchema: databaseName,
        fromTable: r.TABLE_NAME,
        fromColumn: r.COLUMN_NAME,
        toSchema: databaseName,
        toTable: r.REFERENCED_TABLE_NAME,
        toColumn: r.REFERENCED_COLUMN_NAME
      }))

      const indexes: ErdIndex[] = indexRows.map((r) => ({
        schema: databaseName,
        table: r.TABLE_NAME,
        name: r.INDEX_NAME,
        typeDesc: 'NONCLUSTERED',
        isUnique: r.NON_UNIQUE === 0,
        isPrimaryKey: r.INDEX_NAME === 'PRIMARY'
      }))

      return { status: 'ok', schema: { tables: [...tableMap.values()], relationships, indexes } }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  // ── Views ─────────────────────────────────────────────────────────────────

  async getViews(databaseName: string): Promise<GetViewsResult> {
    try {
      const pool = this.getPool(databaseName)
      const rows = await this.query<
        RowDataPacket & { TABLE_NAME: string; VIEW_DEFINITION: string }
      >(
        pool,
        `SELECT TABLE_NAME, VIEW_DEFINITION
         FROM information_schema.VIEWS
         WHERE TABLE_SCHEMA = ?
         ORDER BY TABLE_NAME`,
        [databaseName]
      )
      const views: ViewDefinition[] = rows.map((r) => ({
        schemaName: databaseName,
        viewName: r.TABLE_NAME,
        definition: r.VIEW_DEFINITION ?? '',
        isSchemabound: false,
        isEncrypted: false
      }))
      return { status: 'ok', views }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async saveView(
    databaseName: string,
    params: SaveViewParams,
    originalViewName?: string
  ): Promise<SaveViewResult> {
    try {
      const pool = this.getPool(databaseName)
      if (originalViewName && originalViewName !== params.viewName) {
        await this.query(
          pool,
          `DROP VIEW IF EXISTS ${qi(params.schemaName)}.${qi(originalViewName)}`
        )
      }
      await this.query(
        pool,
        `CREATE OR REPLACE VIEW ${qi(params.schemaName)}.${qi(params.viewName)} AS ${params.definition}`
      )
      return { status: 'ok' }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async deleteView(
    databaseName: string,
    schemaName: string,
    viewName: string
  ): Promise<DeleteViewResult> {
    try {
      const pool = this.getPool(databaseName)
      await this.query(pool, `DROP VIEW IF EXISTS ${qi(schemaName)}.${qi(viewName)}`)
      return { status: 'ok' }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  // ── Stored Procedures ─────────────────────────────────────────────────────

  async getStoredProcedures(databaseName: string): Promise<GetStoredProceduresResult> {
    try {
      const pool = this.getPool(databaseName)
      const rows = await this.query<
        RowDataPacket & { ROUTINE_NAME: string; ROUTINE_DEFINITION: string | null }
      >(
        pool,
        `SELECT ROUTINE_NAME, ROUTINE_DEFINITION
         FROM information_schema.ROUTINES
         WHERE ROUTINE_SCHEMA = ? AND ROUTINE_TYPE = 'PROCEDURE'
         ORDER BY ROUTINE_NAME`,
        [databaseName]
      )
      const procedures: StoredProcedureDefinition[] = rows.map((r) => ({
        schemaName: databaseName,
        procedureName: r.ROUTINE_NAME,
        description: '',
        parameters: [],
        body: r.ROUTINE_DEFINITION ?? ''
      }))
      return { status: 'ok', procedures }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async saveStoredProcedure(
    databaseName: string,
    params: SaveStoredProcedureParams,
    originalProcedureName?: string
  ): Promise<SaveStoredProcedureResult> {
    try {
      const pool = this.getPool(databaseName)
      if (originalProcedureName) {
        await this.query(
          pool,
          `DROP PROCEDURE IF EXISTS ${qi(params.schemaName)}.${qi(originalProcedureName)}`
        )
      }
      const paramList = params.parameters
        .map((p) => `IN ${p.name} ${p.type}${p.defaultValue ? ` DEFAULT ${p.defaultValue}` : ''}`)
        .join(', ')
      await this.query(
        pool,
        `CREATE PROCEDURE ${qi(params.schemaName)}.${qi(params.procedureName)}(${paramList})
         ${params.body}`
      )
      return { status: 'ok' }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async deleteStoredProcedure(
    databaseName: string,
    schemaName: string,
    procedureName: string
  ): Promise<DeleteStoredProcedureResult> {
    try {
      const pool = this.getPool(databaseName)
      await this.query(pool, `DROP PROCEDURE IF EXISTS ${qi(schemaName)}.${qi(procedureName)}`)
      return { status: 'ok' }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  // ── Data Types (not supported by MySQL) ───────────────────────────────────

  async getDataTypes(_databaseName: string): Promise<GetDataTypesResult> {
    return { status: 'ok', dataTypes: [] }
  }

  async saveDataType(
    _databaseName: string,
    _params: SaveDataTypeParams
  ): Promise<SaveDataTypeResult> {
    return { status: 'error', message: 'User-defined types are not supported for MySQL' }
  }

  async deleteDataType(
    _databaseName: string,
    _schemaName: string,
    _typeName: string
  ): Promise<DeleteDataTypeResult> {
    return { status: 'error', message: 'User-defined types are not supported for MySQL' }
  }

  // ── Table Types (not supported by MySQL) ──────────────────────────────────

  async getTableTypes(_databaseName: string): Promise<GetTableTypesResult> {
    return { status: 'ok', tableTypes: [] }
  }

  async getTableType(
    _databaseName: string,
    _schemaName: string,
    _typeName: string
  ): Promise<GetTableTypeResult> {
    return { status: 'error', message: 'Table types are not supported for MySQL' }
  }

  async saveTableType(
    _databaseName: string,
    _params: SaveTableTypeParams
  ): Promise<SaveTableTypeResult> {
    return { status: 'error', message: 'Table types are not supported for MySQL' }
  }

  async deleteTableType(
    _databaseName: string,
    _schemaName: string,
    _typeName: string
  ): Promise<DeleteTableTypeResult> {
    return { status: 'error', message: 'Table types are not supported for MySQL' }
  }

  // ── Memory-Optimized Table Types (not supported by MySQL) ─────────────────

  async getMemoryOptimizedTableTypes(_databaseName: string): Promise<GetMemoryOptimizedTableTypesResult> {
    return { status: 'ok', tableTypes: [] }
  }

  async getMemoryOptimizedTableType(
    _databaseName: string,
    _schemaName: string,
    _typeName: string
  ): Promise<GetMemoryOptimizedTableTypeResult> {
    return { status: 'error', message: 'Memory-optimized table types are not supported for MySQL' }
  }

  async saveMemoryOptimizedTableType(
    _databaseName: string,
    _params: SaveMemoryOptimizedTableTypeParams
  ): Promise<SaveMemoryOptimizedTableTypeResult> {
    return { status: 'error', message: 'Memory-optimized table types are not supported for MySQL' }
  }

  async deleteMemoryOptimizedTableType(
    _databaseName: string,
    _schemaName: string,
    _typeName: string
  ): Promise<DeleteMemoryOptimizedTableTypeResult> {
    return { status: 'error', message: 'Memory-optimized table types are not supported for MySQL' }
  }

  // ── Query execution ───────────────────────────────────────────────────────

  async executeQuery(
    querySql: string,
    timeoutMs?: number,
    withPlan?: boolean,
    _withStatistics?: boolean,
    databaseName?: string
  ): Promise<ExecuteQueryResult> {
    const pool = databaseName ? this.getPool(databaseName) : this.defaultPool
    if (!pool) return { status: 'error', message: 'Not connected' }

    const startTime = Date.now()
    const connection = await pool.getConnection()
    try {
      if (timeoutMs && timeoutMs > 0) {
        // MySQL 5.7.8+ supports max_execution_time hint (milliseconds)
        await connection.query(`SET SESSION max_execution_time = ${timeoutMs}`)
      }

      if (withPlan) {
        const [rows, fields] = await connection.query<RowDataPacket[]>(`EXPLAIN ${querySql}`)
        const columns = (fields as FieldPacket[]).map((f) => f.name)
        const durationMs = Date.now() - startTime
        return {
          status: 'ok',
          resultSets: [
            { columns, rows: rows as Record<string, unknown>[], rowCount: rows.length }
          ],
          messages: [],
          durationMs
        }
      }

      const messages: Array<{ type: 'info' | 'error'; text: string }> = []

      // Split on semicolons to handle multi-statement batches (same as PostgresProvider)
      const statements = querySql
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean)

      const resultSets: import('../types').QueryResultSet[] = []
      for (const stmt of statements) {
        const [rows, fields] = await connection.query<RowDataPacket[]>(stmt)
        if (Array.isArray(fields) && (fields as FieldPacket[]).length > 0) {
          resultSets.push({
            columns: (fields as FieldPacket[]).map((f) => f.name),
            rows: rows as Record<string, unknown>[],
            rowCount: rows.length
          })
        } else {
          const result = rows as unknown as { affectedRows?: number }
          messages.push({ type: 'info', text: `${result.affectedRows ?? 0} row(s) affected` })
        }
      }

      const durationMs = Date.now() - startTime
      return { status: 'ok', resultSets, messages, durationMs }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    } finally {
      if (timeoutMs && timeoutMs > 0) {
        try {
          await connection.query('SET SESSION max_execution_time = 0')
        } catch {
          // ignore cleanup error
        }
      }
      connection.release()
    }
  }

  async executeMonitoringQuery<T>(querySql: string): Promise<T[]> {
    const pool = this.defaultPool
    if (!pool) return []
    const connection = await pool.getConnection()
    try {
      const [rows] = await connection.query<RowDataPacket[]>(querySql)
      return rows as T[]
    } finally {
      connection.release()
    }
  }

  // ── Script generation ─────────────────────────────────────────────────────

  async scriptTableCreate(
    databaseName: string,
    schemaName: string,
    tableName: string
  ): Promise<GenerateScriptResult> {
    try {
      const pool = this.getPool(databaseName)
      const rows = await this.query<RowDataPacket & { 'Create Table': string }>(
        pool,
        `SHOW CREATE TABLE ${qi(schemaName)}.${qi(tableName)}`
      )
      if (!rows.length) return { status: 'error', message: `Table ${tableName} not found` }
      return { status: 'ok', script: rows[0]['Create Table'] + ';' }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async scriptTableAlter(
    _databaseName: string,
    schemaName: string,
    tableName: string
  ): Promise<GenerateScriptResult> {
    return {
      status: 'ok',
      script: `-- ALTER TABLE ${qi(schemaName)}.${qi(tableName)}\n-- ADD COLUMN column_name data_type;`
    }
  }

  async scriptTableDrop(
    _databaseName: string,
    schemaName: string,
    tableName: string
  ): Promise<GenerateScriptResult> {
    return { status: 'ok', script: `DROP TABLE IF EXISTS ${qi(schemaName)}.${qi(tableName)};` }
  }

  async scriptViewCreate(
    databaseName: string,
    schemaName: string,
    viewName: string
  ): Promise<GenerateScriptResult> {
    try {
      const pool = this.getPool(databaseName)
      const rows = await this.query<RowDataPacket & { 'Create View': string }>(
        pool,
        `SHOW CREATE VIEW ${qi(schemaName)}.${qi(viewName)}`
      )
      if (!rows.length) return { status: 'error', message: `View ${viewName} not found` }
      return { status: 'ok', script: rows[0]['Create View'] + ';' }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async scriptViewAlter(
    _databaseName: string,
    schemaName: string,
    viewName: string
  ): Promise<GenerateScriptResult> {
    return {
      status: 'ok',
      script: `CREATE OR REPLACE VIEW ${qi(schemaName)}.${qi(viewName)} AS\n-- SELECT ...;`
    }
  }

  async scriptViewDrop(
    _databaseName: string,
    schemaName: string,
    viewName: string
  ): Promise<GenerateScriptResult> {
    return { status: 'ok', script: `DROP VIEW IF EXISTS ${qi(schemaName)}.${qi(viewName)};` }
  }

  async scriptStoredProcedureCreate(
    databaseName: string,
    _schemaName: string,
    procedureName: string
  ): Promise<GenerateScriptResult> {
    try {
      const pool = this.getPool(databaseName)
      // Check whether it's a procedure or a function
      const typeRows = await this.query<RowDataPacket & { ROUTINE_TYPE: string }>(
        pool,
        `SELECT ROUTINE_TYPE FROM information_schema.ROUTINES
         WHERE ROUTINE_SCHEMA = ? AND ROUTINE_NAME = ?
         LIMIT 1`,
        [databaseName, procedureName]
      )
      const routineType = typeRows[0]?.ROUTINE_TYPE ?? 'PROCEDURE'

      if (routineType === 'FUNCTION') {
        const rows = await this.query<RowDataPacket & { 'Create Function': string }>(
          pool,
          `SHOW CREATE FUNCTION ${qi(databaseName)}.${qi(procedureName)}`
        )
        if (!rows.length) return { status: 'error', message: `Function ${procedureName} not found` }
        return { status: 'ok', script: rows[0]['Create Function'] + ';' }
      } else {
        const rows = await this.query<RowDataPacket & { 'Create Procedure': string }>(
          pool,
          `SHOW CREATE PROCEDURE ${qi(databaseName)}.${qi(procedureName)}`
        )
        if (!rows.length)
          return { status: 'error', message: `Procedure ${procedureName} not found` }
        return { status: 'ok', script: rows[0]['Create Procedure'] + ';' }
      }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async scriptStoredProcedureAlter(
    _databaseName: string,
    schemaName: string,
    procedureName: string
  ): Promise<GenerateScriptResult> {
    return {
      status: 'ok',
      script: [
        `DROP PROCEDURE IF EXISTS ${qi(schemaName)}.${qi(procedureName)};`,
        `CREATE PROCEDURE ${qi(schemaName)}.${qi(procedureName)}()`,
        `BEGIN`,
        `  -- body`,
        `END;`
      ].join('\n')
    }
  }

  async scriptStoredProcedureDrop(
    _databaseName: string,
    schemaName: string,
    procedureName: string
  ): Promise<GenerateScriptResult> {
    return {
      status: 'ok',
      script: `DROP PROCEDURE IF EXISTS ${qi(schemaName)}.${qi(procedureName)};`
    }
  }

  async scriptSelectTopRows(
    _databaseName: string,
    schemaName: string,
    tableName: string,
    count: number
  ): Promise<GenerateScriptResult> {
    return { status: 'ok', script: `SELECT * FROM ${qi(schemaName)}.${qi(tableName)} LIMIT ${count};` }
  }

  async scriptDropDatabase(databaseName: string): Promise<GenerateScriptResult> {
    return { status: 'ok', script: `DROP DATABASE ${qi(databaseName)};` }
  }

  // ── MySQL User Management ─────────────────────────────────────────────────

  private get adminPool(): Pool {
    return this.defaultPool ?? this.getPool(this.record.defaultDatabase || 'mysql')
  }

  async getMySqlUserList(): Promise<{ username: string; host: string }[]> {
    const rows = await this.query<RowDataPacket & { user: string; host: string }>(
      this.adminPool,
      `SELECT user, host FROM mysql.user ORDER BY user, host`
    )
    return rows.map((r) => ({ username: r.user, host: r.host }))
  }

  async getMySqlUserDetails(username: string, host: string): Promise<MySqlUserDetails | null> {
    const rows = await this.query<
      RowDataPacket & {
        user: string
        host: string
        plugin: string
        account_locked: string
        password_expired: string
      }
    >(
      this.adminPool,
      `SELECT user, host, plugin, account_locked, password_expired
       FROM mysql.user WHERE user = ? AND host = ?`,
      [username, host]
    )
    if (!rows.length) return null
    const r = rows[0]
    return {
      username: r.user,
      host: r.host,
      plugin: r.plugin,
      accountLocked: r.account_locked === 'Y',
      passwordExpired: r.password_expired === 'Y'
    }
  }

  async getMySqlUserGlobalPrivileges(
    username: string,
    host: string
  ): Promise<MySqlGlobalPrivilegeEntry[]> {
    const grantee = `'${username}'@'${host}'`
    const rows = await this.query<RowDataPacket & { PRIVILEGE_TYPE: string }>(
      this.adminPool,
      `SELECT PRIVILEGE_TYPE FROM information_schema.USER_PRIVILEGES WHERE GRANTEE = ?`,
      [grantee]
    )
    const granted = new Set(rows.map((r) => r.PRIVILEGE_TYPE.toUpperCase()))
    return MYSQL_GLOBAL_PRIVILEGES.map((p) => ({ privilege: p, isGranted: granted.has(p) }))
  }

  async getMySqlUserDatabasePrivileges(
    username: string,
    host: string
  ): Promise<MySqlDatabasePrivilegeEntry[]> {
    const grantee = `'${username}'@'${host}'`
    const rows = await this.query<
      RowDataPacket & { TABLE_SCHEMA: string; PRIVILEGE_TYPE: string }
    >(
      this.adminPool,
      `SELECT TABLE_SCHEMA, PRIVILEGE_TYPE
       FROM information_schema.SCHEMA_PRIVILEGES WHERE GRANTEE = ?
       ORDER BY TABLE_SCHEMA`,
      [grantee]
    )
    const dbMap = new Map<string, Set<string>>()
    for (const r of rows) {
      if (!dbMap.has(r.TABLE_SCHEMA)) dbMap.set(r.TABLE_SCHEMA, new Set())
      dbMap.get(r.TABLE_SCHEMA)!.add(r.PRIVILEGE_TYPE.toUpperCase())
    }
    return [...dbMap.entries()].map(([databaseName, granted]) => ({
      databaseName,
      privileges: MYSQL_DATABASE_PRIVILEGES.map((p) => ({ privilege: p, isGranted: granted.has(p) }))
    }))
  }

  async getMySqlDatabaseList(): Promise<string[]> {
    const rows = await this.query<RowDataPacket & { Database: string }>(
      this.adminPool,
      `SHOW DATABASES`
    )
    return rows
      .map((r) => r.Database)
      .filter((db) => !SYSTEM_DATABASES.has(db))
  }

  async getMySqlDatabaseUsers(
    databaseName: string
  ): Promise<{ username: string; host: string }[]> {
    const rows = await this.query<RowDataPacket & { user: string; host: string }>(
      this.adminPool,
      `SELECT DISTINCT u.user, u.host
       FROM mysql.user u
       WHERE EXISTS (
         SELECT 1 FROM information_schema.SCHEMA_PRIVILEGES sp
         WHERE sp.GRANTEE = CONCAT("'", u.user, "'@'", u.host, "'")
           AND sp.TABLE_SCHEMA = ?
       )
       ORDER BY u.user, u.host`,
      [databaseName]
    )
    return rows.map((r) => ({ username: r.user, host: r.host }))
  }

  async saveMySqlUser(params: SaveMySqlUserParams): Promise<SaveMySqlUserResult> {
    try {
      const pool = this.adminPool
      const isNew = !params.originalUsername
      const userRef = `${qi(params.username)}@${qi(params.host)}`
      const pluginNeedsPassword = !params.plugin.includes('socket') && !params.plugin.includes('pam') && !params.plugin.includes('windows')

      if (isNew) {
        if (pluginNeedsPassword && params.password) {
          await this.query(
            pool,
            `CREATE USER IF NOT EXISTS ${qi(params.username)}@${qi(params.host)} IDENTIFIED WITH ${params.plugin} BY ?`,
            [params.password]
          )
        } else {
          await this.query(
            pool,
            `CREATE USER IF NOT EXISTS ${qi(params.username)}@${qi(params.host)} IDENTIFIED WITH ${params.plugin}`
          )
        }
      } else {
        const originalRef = `${qi(params.originalUsername!)}@${qi(params.originalHost!)}`
        const nameChanged = params.username !== params.originalUsername || params.host !== params.originalHost
        if (nameChanged) {
          await this.query(pool, `RENAME USER ${originalRef} TO ${userRef}`)
        }
        if (pluginNeedsPassword && params.password) {
          await this.query(
            pool,
            `ALTER USER ${userRef} IDENTIFIED WITH ${params.plugin} BY ?`,
            [params.password]
          )
        }
      }

      if (params.accountLocked) {
        await this.query(pool, `ALTER USER ${userRef} ACCOUNT LOCK`)
      } else {
        await this.query(pool, `ALTER USER ${userRef} ACCOUNT UNLOCK`)
      }

      if (params.passwordExpired) {
        await this.query(pool, `ALTER USER ${userRef} PASSWORD EXPIRE`)
      } else {
        await this.query(pool, `ALTER USER ${userRef} PASSWORD EXPIRE NEVER`)
      }

      // Global privileges: revoke all then grant desired
      await this.query(pool, `REVOKE ALL PRIVILEGES ON *.* FROM ${userRef}`)
      if (params.globalPrivileges.length > 0) {
        const privList = params.globalPrivileges.join(', ')
        await this.query(pool, `GRANT ${privList} ON *.* TO ${userRef}`)
      }

      // Database privileges: revoke all on previously held dbs, then grant desired
      const grantee = `'${params.username}'@'${params.host}'`
      const currentDbRows = await this.query<RowDataPacket & { TABLE_SCHEMA: string }>(
        pool,
        `SELECT DISTINCT TABLE_SCHEMA FROM information_schema.SCHEMA_PRIVILEGES WHERE GRANTEE = ?`,
        [grantee]
      )
      const currentDbs = new Set(currentDbRows.map((r) => r.TABLE_SCHEMA).filter(Boolean))
      const desiredDbMap = new Map(params.databasePrivileges.map((d) => [d.databaseName, d.privileges]))

      // Revoke from databases no longer in desired set
      for (const db of currentDbs) {
        if (!desiredDbMap.has(db)) {
          await this.query(pool, `REVOKE ALL PRIVILEGES ON ${qi(db)}.* FROM ${userRef}`)
        }
      }

      // Apply desired database privileges
      for (const [db, privs] of desiredDbMap) {
        await this.query(pool, `REVOKE ALL PRIVILEGES ON ${qi(db)}.* FROM ${userRef}`)
        if (privs.length > 0) {
          await this.query(pool, `GRANT ${privs.join(', ')} ON ${qi(db)}.* TO ${userRef}`)
        }
      }

      await this.query(pool, `FLUSH PRIVILEGES`)
      return { status: 'ok' }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async deleteMySqlUser(username: string, host: string): Promise<DeleteMySqlUserResult> {
    try {
      await this.query(
        this.adminPool,
        `DROP USER IF EXISTS ${qi(username)}@${qi(host)}`
      )
      await this.query(this.adminPool, `FLUSH PRIVILEGES`)
      return { status: 'ok' }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async saveMySqlDatabaseUserPrivileges(
    params: SaveMySqlDatabaseUserPrivilegesParams
  ): Promise<SaveMySqlDatabaseUserPrivilegesResult> {
    try {
      const pool = this.adminPool
      const userRef = `${qi(params.username)}@${qi(params.host)}`
      await this.query(pool, `REVOKE ALL PRIVILEGES ON ${qi(params.databaseName)}.* FROM ${userRef}`)
      if (params.privileges.length > 0) {
        await this.query(
          pool,
          `GRANT ${params.privileges.join(', ')} ON ${qi(params.databaseName)}.* TO ${userRef}`
        )
      }
      await this.query(pool, `FLUSH PRIVILEGES`)
      return { status: 'ok' }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  // ── Backup / Restore ──────────────────────────────────────────────────────

  /** Probes a CLI tool by running `<path> --version`. */
  private probeTool(binPath: string): Promise<MySqlToolInfo> {
    return new Promise((resolve) => {
      execFile(binPath, ['--version'], { timeout: 5000 }, (err, stdout) => {
        if (err) {
          resolve({ found: false })
          return
        }
        const version = String(stdout).trim()
        resolve({ found: true, path: binPath, version })
      })
    })
  }

  async getBackupToolStatus(paths?: {
    mysqlDumpPath?: string
    mysqlClientPath?: string
  }): Promise<MySqlBackupToolStatusResult> {
    try {
      const [mysqldump, mysql] = await Promise.all([
        this.probeTool(paths?.mysqlDumpPath?.trim() || 'mysqldump'),
        this.probeTool(paths?.mysqlClientPath?.trim() || 'mysql')
      ])
      return { status: 'ok', tools: { mysqldump, mysql } }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  /**
   * Builds the mysqldump argument list (excluding the password, which is passed
   * via the MYSQL_PWD environment variable at run time).
   */
  private buildBackupArgs(opts: MySqlBackupOptions): string[] {
    const r = this.record
    const args = [
      `--host=${r.host}`,
      `--port=${r.port}`,
      `--user=${r.username}`,
      `--default-character-set=${opts.charset || 'utf8mb4'}`
    ]
    if (opts.singleTransaction) args.push('--single-transaction')
    if (opts.includeRoutines) args.push('--routines')
    args.push(opts.includeTriggers ? '--triggers' : '--skip-triggers')
    if (opts.includeEvents) args.push('--events')
    if (opts.content === 'data-only') args.push('--no-create-info')
    if (opts.content === 'schema-only') args.push('--no-data')
    args.push(opts.addDropTable ? '--add-drop-table' : '--skip-add-drop-table')
    args.push(opts.extendedInsert ? '--extended-insert' : '--skip-extended-insert')

    const tables = opts.tables?.filter((t) => t.trim().length > 0) ?? []
    if (tables.length > 0) {
      // A table list is incompatible with --databases.
      args.push(opts.databaseName, ...tables)
    } else if (opts.addCreateDatabase) {
      args.push('--databases', opts.databaseName)
    } else {
      args.push(opts.databaseName)
    }
    return args
  }

  buildBackupCommandPreview(opts: MySqlBackupOptions): BuildMySqlBackupPreviewResult {
    try {
      const bin = opts.mysqlDumpPath?.trim() || 'mysqldump'
      const args = this.buildBackupArgs(opts)
      // Show a masked password flag for readability without leaking the secret.
      const shown = [bin, '--password=******', ...args].map((a) =>
        /\s/.test(a) ? `"${a}"` : a
      )
      const redirect = opts.compress ? ` | gzip > "${opts.filePath}"` : ` > "${opts.filePath}"`
      return { status: 'ok', command: shown.join(' ') + redirect }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async executeBackup(opts: MySqlBackupOptions): Promise<ExecuteMySqlBackupResult> {
    const start = Date.now()
    try {
      const bin = opts.mysqlDumpPath?.trim() || 'mysqldump'
      const tool = await this.probeTool(bin)
      if (tool.found) {
        await this.runMysqldump(bin, opts)
      } else {
        await this.jsBackup(opts)
      }
      const bytes = statSync(opts.filePath).size
      return {
        status: 'ok',
        filePath: opts.filePath,
        engine: tool.found ? 'mysqldump' : 'js',
        durationMs: Date.now() - start,
        bytes
      }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  /** Runs mysqldump, streaming stdout (optionally gzipped) to the target file. */
  private runMysqldump(bin: string, opts: MySqlBackupOptions): Promise<void> {
    return new Promise((resolve, reject) => {
      const args = this.buildBackupArgs(opts)
      const child = spawn(bin, args, {
        env: { ...process.env, MYSQL_PWD: this.record.password ?? '' }
      })
      const fileStream = createWriteStream(opts.filePath)
      let stderr = ''
      child.stderr.on('data', (d) => {
        stderr += String(d)
      })
      child.on('error', reject)
      const source = opts.compress ? child.stdout.pipe(createGzip()) : child.stdout
      source.pipe(fileStream)
      fileStream.on('error', reject)
      child.on('close', (code) => {
        if (code === 0) resolve()
        else reject(new Error(stderr.trim() || `mysqldump exited with code ${code}`))
      })
    })
  }

  /** Pure-JS backup fallback using the existing mysql2 connection. */
  private async jsBackup(opts: MySqlBackupOptions): Promise<void> {
    const pool = this.getPool(opts.databaseName)
    const query = async (sql: string): Promise<DumpRow[]> => {
      const rows = await this.query<RowDataPacket & DumpRow>(pool, sql)
      return rows as DumpRow[]
    }
    const fileStream = createWriteStream(opts.filePath)
    const out = opts.compress ? createGzip() : fileStream
    if (opts.compress) out.pipe(fileStream)
    const done = new Promise<void>((resolve, reject) => {
      fileStream.on('finish', resolve)
      fileStream.on('error', reject)
      out.on('error', reject)
    })
    try {
      await dumpDatabaseToFile(query, opts, out)
    } finally {
      out.end()
    }
    await done
  }

  async executeRestore(opts: MySqlRestoreOptions): Promise<ExecuteMySqlRestoreResult> {
    const start = Date.now()
    try {
      const bin = opts.mysqlClientPath?.trim() || 'mysql'
      const tool = await this.probeTool(bin)
      if (tool.found) {
        await this.runMysqlClient(bin, opts)
        return { status: 'ok', engine: 'mysqldump', durationMs: Date.now() - start }
      }
      const run = await this.jsRestore(opts)
      return { status: 'ok', engine: 'js', durationMs: Date.now() - start, statementsRun: run }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  /** Restores by piping the dump file into the mysql client over stdin. */
  private async runMysqlClient(bin: string, opts: MySqlRestoreOptions): Promise<void> {
    const env = { ...process.env, MYSQL_PWD: this.record.password ?? '' }
    const baseArgs = [`--host=${this.record.host}`, `--port=${this.record.port}`, `--user=${this.record.username}`]

    if (opts.createDatabaseIfNotExists) {
      await new Promise<void>((resolve, reject) => {
        execFile(
          bin,
          [...baseArgs, '-e', `CREATE DATABASE IF NOT EXISTS \`${opts.targetDatabaseName.replace(/`/g, '``')}\``],
          { env },
          (err, _stdout, stderr) => (err ? reject(new Error(stderr || err.message)) : resolve())
        )
      })
    }

    await new Promise<void>((resolve, reject) => {
      const args = [...baseArgs]
      if (!opts.stopOnError) args.push('--force')
      args.push(opts.targetDatabaseName)
      const child = spawn(bin, args, { env })
      let stderr = ''
      child.stderr.on('data', (d) => {
        stderr += String(d)
      })
      child.on('error', reject)
      const isGz = opts.filePath.toLowerCase().endsWith('.gz')
      const fileStream = createReadStream(opts.filePath)
      const source = isGz ? fileStream.pipe(createGunzip()) : fileStream
      source.on('error', reject)
      source.pipe(child.stdin)
      child.on('close', (code) => {
        if (code === 0) resolve()
        else reject(new Error(stderr.trim() || `mysql exited with code ${code}`))
      })
    })
  }

  /** Pure-JS restore fallback: reads the dump and runs statements via mysql2. */
  private async jsRestore(opts: MySqlRestoreOptions): Promise<number> {
    const isGz = opts.filePath.toLowerCase().endsWith('.gz')
    let sqlText: string
    if (isGz) {
      const buf = await readFile(opts.filePath)
      sqlText = gunzipSync(buf).toString('utf-8')
    } else {
      sqlText = await readFile(opts.filePath, 'utf-8')
    }
    const pool = this.getPool(opts.targetDatabaseName)
    const query = async (sql: string): Promise<DumpRow[]> => {
      const rows = await this.query<RowDataPacket & DumpRow>(pool, sql)
      return rows as DumpRow[]
    }
    return restoreFromText(query, sqlText, opts)
  }

  // ── Capabilities ──────────────────────────────────────────────────────────

  getCapabilities(): ProviderCapabilities {
    return {
      executionPlan: { kind: 'explain-text', buttonLabel: 'Explain Query' },
      clientStatistics: { kind: 'none' },
      hasCreateDatabase: true,
      hasStoredProcedures: true,
      hasFunctions: true,
      hasUserDefinedTypes: false,
      hasTableTypes: false,
      hasMemoryOptimizedTableTypes: false,
      hasStatistics: false,
      hasIndexRebuild: true,
      hasIndexReorganize: false,
      hasIndexDisable: false,
      hasProfiler: false,
      hasCreateTable: true,
      hasBackupRestore: true
    }
  }
}

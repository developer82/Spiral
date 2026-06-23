import { Pool, type PoolClient } from 'pg'
import { spawn, execFile } from 'node:child_process'
import { createReadStream, createWriteStream, statSync } from 'node:fs'
import { createGzip, createGunzip } from 'node:zlib'
import type { ConnectionRecord } from '../../store'
import type {
  PostgresBackupOptions,
  PostgresRestoreOptions,
  PostgresToolInfo,
  PostgresBackupToolStatusResult,
  BuildPostgresBackupPreviewResult,
  ExecutePostgresBackupResult,
  ExecutePostgresRestoreResult,
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
  StoredProcedureParameter,
  GetStoredProceduresResult,
  SaveStoredProcedureParams,
  SaveStoredProcedureResult,
  DeleteStoredProcedureResult,
  DataTypeDefinition,
  SaveDataTypeParams,
  GetDataTypesResult,
  SaveDataTypeResult,
  DeleteDataTypeResult,
  TableTypeDefinition,
  TableTypeColumnParam,
  SaveTableTypeParams,
  GetTableTypesResult,
  GetTableTypeResult,
  SaveTableTypeResult,
  DeleteTableTypeResult,
  GetMemoryOptimizedTableTypesResult,
  GetMemoryOptimizedTableTypeResult,
  SaveMemoryOptimizedTableTypeParams,
  SaveMemoryOptimizedTableTypeResult,
  DeleteMemoryOptimizedTableTypeResult,
  GenerateScriptResult,
  ProviderCapabilities
} from '../types'


/** System databases to filter when showSystemDatabases is false. */
const SYSTEM_DATABASES = new Set(['postgres', 'template0', 'template1'])

/**
 * PostgreSQL database provider.
 *
 * Unlike SQL Server, Postgres does not have a USE statement — each database
 * requires a separate connection.  This provider keeps one default Pool
 * (connected to the initial database) plus a per-database Pool cache that is
 * lazily created as the user navigates the tree.
 */
export class PostgresProvider implements DatabaseProvider {
  private defaultPool: Pool | null = null
  private dbPools = new Map<string, Pool>()
  private connectionRecord: ConnectionRecord | null = null

  // ── Connection ────────────────────────────────────────────────────────────

  async connect(record: ConnectionRecord): Promise<void> {
    this.connectionRecord = record
    this.defaultPool = new Pool({
      host: record.host,
      port: record.port,
      user: record.username,
      password: record.password,
      database: record.defaultDatabase || 'postgres',
      connectionTimeoutMillis: 10_000,
      max: 5
    })
    // Verify connectivity immediately
    const client = await this.defaultPool.connect()
    client.release()
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
    const defaultDb = this.record.defaultDatabase || 'postgres'
    if (databaseName === defaultDb && this.defaultPool) return this.defaultPool

    let pool = this.dbPools.get(databaseName)
    if (!pool) {
      pool = new Pool({
        host: this.record.host,
        port: this.record.port,
        user: this.record.username,
        password: this.record.password,
        database: databaseName,
        connectionTimeoutMillis: 10_000,
        max: 5
      })
      this.dbPools.set(databaseName, pool)
    }
    return pool
  }

  private async query<T extends Record<string, unknown>>(
    pool: Pool,
    sql: string,
    params?: unknown[]
  ): Promise<T[]> {
    const client: PoolClient = await pool.connect()
    try {
      const result = await client.query<T>(sql, params)
      return result.rows
    } finally {
      client.release()
    }
  }

  // ── Tree listing ──────────────────────────────────────────────────────────

  async listDatabases(showSystemDatabases: boolean): Promise<ExplorerNode[]> {
    const pool = this.defaultPool ?? this.getPool(this.record.defaultDatabase || 'postgres')
    const rows = await this.query<{ datname: string }>(pool, 'SELECT datname FROM pg_database ORDER BY datname')
    return rows
      .filter((r) => showSystemDatabases || !SYSTEM_DATABASES.has(r.datname))
      .map((r) => ({ id: `db:${r.datname}`, label: r.datname, kind: 'database' as const }))
  }

  listCategories(databaseName: string): ExplorerNode[] {
    return [
      { id: `db:${databaseName}:tables`, label: 'Tables', kind: 'tables-folder' as const },
      { id: `db:${databaseName}:views`, label: 'Views', kind: 'views-folder' as const },
      { id: `db:${databaseName}:stored-procedures`, label: 'Stored Procedures', kind: 'stored-procedures-folder' as const },
      { id: `db:${databaseName}:functions`, label: 'Functions', kind: 'functions-folder' as const },
      { id: `db:${databaseName}:types`, label: 'Types', kind: 'types-folder' as const },
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
    const pool = this.defaultPool ?? this.getPool(this.record.defaultDatabase || 'postgres')
    const rows = await this.query<{ rolname: string }>(
      pool,
      `SELECT rolname FROM pg_roles WHERE rolcanlogin = true ORDER BY rolname`
    )
    return rows.map((r) => ({
      id: `security:users:${r.rolname}`,
      label: r.rolname,
      kind: 'security-user' as const
    }))
  }

  async listServerRoles(): Promise<ExplorerNode[]> {
    const pool = this.defaultPool ?? this.getPool(this.record.defaultDatabase || 'postgres')
    const rows = await this.query<{ rolname: string }>(
      pool,
      `SELECT rolname FROM pg_roles WHERE rolcanlogin = false ORDER BY rolname`
    )
    return rows.map((r) => ({
      id: `security:roles:${r.rolname}`,
      label: r.rolname,
      kind: 'security-role' as const
    }))
  }

  async listServerSchemas(): Promise<ExplorerNode[]> {
    // Schemas are database-scoped in PostgreSQL; not applicable at server level
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
    const pool = this.getPool(databaseName)
    const rows = await this.query<{ rolname: string }>(
      pool,
      `SELECT rolname FROM pg_roles WHERE rolcanlogin = true ORDER BY rolname`
    )
    return rows.map((r) => ({
      id: `db:${databaseName}:security:users:${r.rolname}`,
      label: r.rolname,
      kind: 'security-user' as const
    }))
  }

  async listDatabaseRoles(databaseName: string): Promise<ExplorerNode[]> {
    const pool = this.getPool(databaseName)
    const rows = await this.query<{ rolname: string }>(
      pool,
      `SELECT rolname FROM pg_roles WHERE rolcanlogin = false ORDER BY rolname`
    )
    return rows.map((r) => ({
      id: `db:${databaseName}:security:roles:${r.rolname}`,
      label: r.rolname,
      kind: 'security-role' as const
    }))
  }

  async listDatabaseSchemas(databaseName: string): Promise<ExplorerNode[]> {
    const pool = this.getPool(databaseName)
    const rows = await this.query<{ schema_name: string }>(
      pool,
      `SELECT schema_name FROM information_schema.schemata
       WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
       ORDER BY schema_name`
    )
    return rows.map((r) => ({
      id: `db:${databaseName}:security:schemas:${r.schema_name}`,
      label: r.schema_name,
      kind: 'security-schema' as const
    }))
  }

  async listTables(databaseName: string): Promise<ExplorerNode[]> {
    const pool = this.getPool(databaseName)
    const rows = await this.query<{ table_schema: string; table_name: string }>(
      pool,
      `SELECT table_schema, table_name
       FROM information_schema.tables
       WHERE table_type = 'BASE TABLE'
         AND table_schema NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
       ORDER BY table_schema, table_name`
    )
    return rows.map((r) => ({
      id: `db:${databaseName}:tables:${r.table_schema}.${r.table_name}`,
      label: `${r.table_schema}.${r.table_name}`,
      kind: 'table' as const
    }))
  }

  async listViews(databaseName: string): Promise<ExplorerNode[]> {
    const pool = this.getPool(databaseName)
    const rows = await this.query<{ table_schema: string; table_name: string }>(
      pool,
      `SELECT table_schema, table_name
       FROM information_schema.views
       WHERE table_schema NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
       ORDER BY table_schema, table_name`
    )
    return rows.map((r) => ({
      id: `db:${databaseName}:views:${r.table_schema}.${r.table_name}`,
      label: `${r.table_schema}.${r.table_name}`,
      kind: 'view' as const
    }))
  }

  async listStoredProcedures(databaseName: string): Promise<ExplorerNode[]> {
    const pool = this.getPool(databaseName)
    const rows = await this.query<{ schema_name: string; proc_name: string }>(
      pool,
      `SELECT n.nspname AS schema_name, p.proname AS proc_name
       FROM pg_catalog.pg_proc p
       JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
       WHERE p.prokind = 'p'
         AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
       ORDER BY n.nspname, p.proname`
    )
    return rows.map((r) => ({
      id: `db:${databaseName}:stored-procedures:${r.schema_name}.${r.proc_name}`,
      label: `${r.schema_name}.${r.proc_name}`,
      kind: 'stored-procedure' as const
    }))
  }

  async listFunctions(databaseName: string): Promise<ExplorerNode[]> {
    const pool = this.getPool(databaseName)
    const rows = await this.query<{ schema_name: string; func_name: string }>(
      pool,
      `SELECT n.nspname AS schema_name, p.proname AS func_name
       FROM pg_catalog.pg_proc p
       JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
       WHERE p.prokind = 'f'
         AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
       ORDER BY n.nspname, p.proname`
    )
    return rows.map((r) => ({
      id: `db:${databaseName}:functions:${r.schema_name}.${r.func_name}`,
      label: `${r.schema_name}.${r.func_name}`,
      kind: 'function' as const
    }))
  }

  async listTypes(databaseName: string): Promise<ExplorerNode[]> {
    return this.listTypeCategories(databaseName)
  }

  listTypeCategories(databaseName: string): ExplorerNode[] {
    return [
      { id: `db:${databaseName}:types:enums`, label: 'Enums', kind: 'type-enums-folder' as const },
      { id: `db:${databaseName}:types:composites`, label: 'Composite Types', kind: 'type-composites-folder' as const }
    ]
  }

  async listTypeDataTypes(databaseName: string): Promise<ExplorerNode[]> {
    const pool = this.getPool(databaseName)
    const rows = await this.query<{ schema_name: string; type_name: string }>(
      pool,
      `SELECT n.nspname AS schema_name, t.typname AS type_name
       FROM pg_catalog.pg_type t
       JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
       WHERE t.typtype = 'e'
         AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
       ORDER BY n.nspname, t.typname`
    )
    return rows.map((r) => ({
      id: `db:${databaseName}:types:enums:${r.schema_name}.${r.type_name}`,
      label: `${r.schema_name}.${r.type_name}`,
      kind: 'type' as const
    }))
  }

  async listTypeTables(databaseName: string): Promise<ExplorerNode[]> {
    const pool = this.getPool(databaseName)
    const rows = await this.query<{ schema_name: string; type_name: string }>(
      pool,
      `SELECT n.nspname AS schema_name, t.typname AS type_name
       FROM pg_catalog.pg_type t
       JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
       WHERE t.typtype = 'c'
         AND t.typrelid != 0
         AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
       ORDER BY n.nspname, t.typname`
    )
    return rows.map((r) => ({
      id: `db:${databaseName}:types:composites:${r.schema_name}.${r.type_name}`,
      label: `${r.schema_name}.${r.type_name}`,
      kind: 'type' as const
    }))
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

  async listColumns(databaseName: string, schemaName: string, tableName: string): Promise<ExplorerNode[]> {
    const pool = this.getPool(databaseName)
    const rows = await this.query<{ column_name: string; data_type: string; is_nullable: string; pk: boolean }>(
      pool,
      `SELECT
         c.column_name,
         c.data_type,
         c.is_nullable,
         (
           SELECT COUNT(*) > 0
           FROM information_schema.table_constraints tc
           JOIN information_schema.key_column_usage kcu
             ON tc.constraint_name = kcu.constraint_name
             AND tc.table_schema = kcu.table_schema
             AND tc.table_name = kcu.table_name
           WHERE tc.constraint_type = 'PRIMARY KEY'
             AND tc.table_schema = $1
             AND tc.table_name = $2
             AND kcu.column_name = c.column_name
         ) AS pk
       FROM information_schema.columns c
       WHERE c.table_schema = $1 AND c.table_name = $2
       ORDER BY c.ordinal_position`,
      [schemaName, tableName]
    )
    return rows.map((r) => ({
      id: `db:${databaseName}:tables:${schemaName}.${tableName}:columns:${r.column_name}`,
      label: `${r.column_name} (${r.data_type}, ${r.is_nullable === 'YES' ? 'null' : 'not null'})`,
      kind: r.pk ? ('column-pk' as const) : ('column' as const)
    }))
  }

  async listKeys(databaseName: string, schemaName: string, tableName: string): Promise<ExplorerNode[]> {
    const pool = this.getPool(databaseName)
    const rows = await this.query<{ constraint_name: string; constraint_type: string }>(
      pool,
      `SELECT constraint_name, constraint_type
       FROM information_schema.table_constraints
       WHERE table_schema = $1 AND table_name = $2
         AND constraint_type IN ('PRIMARY KEY', 'FOREIGN KEY')
       ORDER BY constraint_type, constraint_name`,
      [schemaName, tableName]
    )
    return rows.map((r) => ({
      id: `db:${databaseName}:tables:${schemaName}.${tableName}:keys:${r.constraint_name}`,
      label: `${r.constraint_name} (${r.constraint_type})`,
      kind: 'key' as const
    }))
  }

  async listConstraints(databaseName: string, schemaName: string, tableName: string): Promise<ExplorerNode[]> {
    const pool = this.getPool(databaseName)
    const rows = await this.query<{ constraint_name: string }>(
      pool,
      `SELECT constraint_name
       FROM information_schema.table_constraints
       WHERE table_schema = $1 AND table_name = $2 AND constraint_type = 'CHECK'
       ORDER BY constraint_name`,
      [schemaName, tableName]
    )
    return rows.map((r) => ({
      id: `db:${databaseName}:tables:${schemaName}.${tableName}:constraints:${r.constraint_name}`,
      label: r.constraint_name,
      kind: 'constraint' as const
    }))
  }

  async listTriggers(databaseName: string, schemaName: string, tableName: string): Promise<ExplorerNode[]> {
    const pool = this.getPool(databaseName)
    const rows = await this.query<{ trigger_name: string }>(
      pool,
      `SELECT DISTINCT trigger_name
       FROM information_schema.triggers
       WHERE event_object_schema = $1 AND event_object_table = $2
       ORDER BY trigger_name`,
      [schemaName, tableName]
    )
    return rows.map((r) => ({
      id: `db:${databaseName}:tables:${schemaName}.${tableName}:triggers:${r.trigger_name}`,
      label: r.trigger_name,
      kind: 'trigger' as const
    }))
  }

  async listIndexes(databaseName: string, schemaName: string, tableName: string): Promise<ExplorerNode[]> {
    const pool = this.getPool(databaseName)
    const rows = await this.query<{ indexname: string }>(
      pool,
      `SELECT indexname FROM pg_indexes WHERE schemaname = $1 AND tablename = $2 ORDER BY indexname`,
      [schemaName, tableName]
    )
    return rows.map((r) => ({
      id: `db:${databaseName}:tables:${schemaName}.${tableName}:indexes:${r.indexname}`,
      label: r.indexname,
      kind: 'index' as const
    }))
  }

  async listStatistics(_databaseName: string, _schemaName: string, _tableName: string): Promise<ExplorerNode[]> {
    return []
  }

  // ── Table schema / detail ─────────────────────────────────────────────────

  async getTableSchema(databaseName: string, schemaName: string, tableName: string): Promise<GetTableSchemaResult> {
    try {
      const pool = this.getPool(databaseName)
      const rows = await this.query<{
        column_name: string
        udt_name: string
        character_maximum_length: number | null
        numeric_precision: number | null
        numeric_scale: number | null
        is_nullable: string
        column_default: string | null
        is_identity: string
        pk: boolean
      }>(
        pool,
        `SELECT
           c.column_name,
           c.udt_name,
           c.character_maximum_length,
           c.numeric_precision,
           c.numeric_scale,
           c.is_nullable,
           c.column_default,
           c.is_identity,
           (
             SELECT COUNT(*) > 0
             FROM information_schema.table_constraints tc
             JOIN information_schema.key_column_usage kcu
               ON tc.constraint_name = kcu.constraint_name
               AND tc.table_schema = kcu.table_schema
               AND tc.table_name = kcu.table_name
             WHERE tc.constraint_type = 'PRIMARY KEY'
               AND tc.table_schema = $1 AND tc.table_name = $2
               AND kcu.column_name = c.column_name
           ) AS pk
         FROM information_schema.columns c
         WHERE c.table_schema = $1 AND c.table_name = $2
         ORDER BY c.ordinal_position`,
        [schemaName, tableName]
      )
      const columns: TableColumnMeta[] = rows.map((r) => ({
        name: r.column_name,
        type: r.udt_name,
        maxLength: r.character_maximum_length,
        precision: r.numeric_precision,
        scale: r.numeric_scale,
        isNullable: r.is_nullable === 'YES',
        defaultValue: r.column_default,
        isIdentity: r.is_identity === 'YES' || r.is_identity === 'ALWAYS' || r.is_identity === 'BY DEFAULT',
        identitySeed: null,
        identityIncrement: null,
        isPrimaryKey: Boolean(r.pk)
      }))
      return { status: 'ok', columns }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async getForeignKeys(databaseName: string, schemaName: string, tableName: string): Promise<GetForeignKeysResult> {
    try {
      const pool = this.getPool(databaseName)
      const rows = await this.query<{
        constraint_name: string
        column_name: string
        foreign_table_schema: string
        foreign_table_name: string
        foreign_column_name: string
        delete_rule: string
        update_rule: string
      }>(
        pool,
        `SELECT
           kcu.constraint_name,
           kcu.column_name,
           ccu.table_schema AS foreign_table_schema,
           ccu.table_name AS foreign_table_name,
           ccu.column_name AS foreign_column_name,
           rc.delete_rule,
           rc.update_rule
         FROM information_schema.key_column_usage kcu
         JOIN information_schema.referential_constraints rc
           ON kcu.constraint_name = rc.constraint_name
           AND kcu.constraint_schema = rc.constraint_schema
         JOIN information_schema.constraint_column_usage ccu
           ON rc.unique_constraint_name = ccu.constraint_name
           AND rc.unique_constraint_schema = ccu.constraint_schema
         WHERE kcu.table_schema = $1 AND kcu.table_name = $2
         ORDER BY kcu.constraint_name, kcu.ordinal_position`,
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
        constraintName: r.constraint_name,
        columnName: r.column_name,
        referencedSchema: r.foreign_table_schema,
        referencedTable: r.foreign_table_name,
        referencedColumn: r.foreign_column_name,
        isEnabled: true,
        enforceForReplication: false,
        deleteRule: mapRule(r.delete_rule),
        updateRule: mapRule(r.update_rule)
      }))

      return { status: 'ok', foreignKeys }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async getCheckConstraints(databaseName: string, schemaName: string, tableName: string): Promise<GetCheckConstraintsResult> {
    try {
      const pool = this.getPool(databaseName)
      const rows = await this.query<{ constraint_name: string; check_clause: string }>(
        pool,
        `SELECT cc.constraint_name, cc.check_clause
         FROM information_schema.check_constraints cc
         JOIN information_schema.table_constraints tc
           ON cc.constraint_name = tc.constraint_name
           AND cc.constraint_schema = tc.constraint_schema
         WHERE tc.table_schema = $1 AND tc.table_name = $2
         ORDER BY cc.constraint_name`,
        [schemaName, tableName]
      )
      const constraints: CheckConstraintDefinition[] = rows.map((r) => ({
        constraintName: r.constraint_name,
        condition: r.check_clause,
        isEnabled: true,
        checkExistingData: true,
        enforceForReplication: false
      }))
      return { status: 'ok', constraints }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async getTriggers(databaseName: string, schemaName: string, tableName: string): Promise<GetTriggersResult> {
    try {
      const pool = this.getPool(databaseName)
      const rows = await this.query<{
        trigger_name: string
        event_manipulation: string
        action_timing: string
        action_statement: string
      }>(
        pool,
        `SELECT trigger_name, event_manipulation, action_timing, action_statement
         FROM information_schema.triggers
         WHERE event_object_schema = $1 AND event_object_table = $2
         ORDER BY trigger_name, event_manipulation`,
        [schemaName, tableName]
      )

      // Aggregate per trigger (multiple rows when INSERT/UPDATE/DELETE on same trigger)
      const map = new Map<string, TriggerDefinition>()
      for (const r of rows) {
        if (!map.has(r.trigger_name)) {
          map.set(r.trigger_name, {
            triggerName: r.trigger_name,
            isInsteadOf: r.action_timing === 'INSTEAD OF',
            isInsert: false,
            isUpdate: false,
            isDelete: false,
            body: r.action_statement
          })
        }
        const def = map.get(r.trigger_name)!
        if (r.event_manipulation === 'INSERT') def.isInsert = true
        if (r.event_manipulation === 'UPDATE') def.isUpdate = true
        if (r.event_manipulation === 'DELETE') def.isDelete = true
      }

      return { status: 'ok', triggers: [...map.values()] }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async saveTrigger(databaseName: string, params: SaveTriggerParams, originalTriggerName?: string): Promise<SaveTriggerResult> {
    try {
      const pool = this.getPool(databaseName)
      const events = [
        params.isInsert && 'INSERT',
        params.isUpdate && 'UPDATE',
        params.isDelete && 'DELETE'
      ].filter(Boolean).join(' OR ')
      const timing = params.isInsteadOf ? 'INSTEAD OF' : 'BEFORE'
      const schemaName = params.schemaName
      const tableName = params.tableName

      // Drop existing trigger if renaming or replacing
      const dropName = originalTriggerName ?? params.triggerName
      await this.query(pool, `DROP TRIGGER IF EXISTS "${dropName}" ON "${schemaName}"."${tableName}"`)

      // Create function for the trigger (PostgreSQL requires a trigger function)
      const funcName = `${params.triggerName}_fn`
      await this.query(
        pool,
        `CREATE OR REPLACE FUNCTION "${schemaName}"."${funcName}"()
         RETURNS trigger LANGUAGE plpgsql AS $$
         ${params.body}
         $$`
      )

      // Create the trigger
      await this.query(
        pool,
        `CREATE TRIGGER "${params.triggerName}"
         ${timing} ${events}
         ON "${schemaName}"."${tableName}"
         FOR EACH ROW EXECUTE FUNCTION "${schemaName}"."${funcName}"()`
      )

      return { status: 'ok' }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async deleteTrigger(databaseName: string, triggerName: string, schemaName: string): Promise<DeleteTriggerResult> {
    try {
      const pool = this.getPool(databaseName)
      // We need the table name to drop the trigger
      const rows = await this.query<{ event_object_table: string }>(
        pool,
        `SELECT DISTINCT event_object_table
         FROM information_schema.triggers
         WHERE trigger_schema = $1 AND trigger_name = $2
         LIMIT 1`,
        [schemaName, triggerName]
      )
      if (rows.length === 0) return { status: 'error', message: `Trigger "${triggerName}" not found` }
      const tableName = rows[0].event_object_table
      await this.query(pool, `DROP TRIGGER IF EXISTS "${triggerName}" ON "${schemaName}"."${tableName}"`)
      return { status: 'ok' }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  // ── Indexes ───────────────────────────────────────────────────────────────

  async getIndexes(databaseName: string, schemaName: string, tableName: string): Promise<GetIndexesResult> {
    try {
      const pool = this.getPool(databaseName)
      const rows = await this.query<{
        indexname: string
        indexdef: string
      }>(
        pool,
        `SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = $1 AND tablename = $2 ORDER BY indexname`,
        [schemaName, tableName]
      )

      // Query for column info
      const colRows = await this.query<{
        indexname: string
        attname: string
        attnum: number
        desc: boolean
      }>(
        pool,
        `SELECT i.relname AS indexname, a.attname, a.attnum, ix.indoption[array_position(ix.indkey, a.attnum)] & 1 != 0 AS desc
         FROM pg_index ix
         JOIN pg_class c ON c.oid = ix.indrelid
         JOIN pg_class i ON i.oid = ix.indexrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
         JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY(ix.indkey)
         WHERE n.nspname = $1 AND c.relname = $2
         ORDER BY i.relname, a.attnum`,
        [schemaName, tableName]
      )

      const colMap = new Map<string, IndexColumnEntry[]>()
      for (const r of colRows) {
        if (!colMap.has(r.indexname)) colMap.set(r.indexname, [])
        colMap.get(r.indexname)!.push({
          columnName: r.attname,
          keyOrdinal: r.attnum,
          isDescendingKey: r.desc,
          isIncludedColumn: false
        })
      }

      const indexes: IndexDefinition[] = rows.map((r) => {
        const def = r.indexdef.toUpperCase()
        const isUnique = def.includes('UNIQUE')
        const isPrimaryKey = r.indexname.endsWith('_pkey')
        return {
          name: r.indexname,
          schemaName,
          tableName,
          type: isUnique ? 'NONCLUSTERED' : 'NONCLUSTERED',
          isUnique,
          isPrimaryKey,
          isDisabled: false,
          columns: colMap.get(r.indexname) ?? []
        }
      })

      return { status: 'ok', indexes }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async saveIndex(databaseName: string, params: SaveIndexParams, originalIndexName?: string): Promise<SaveIndexResult> {
    try {
      const pool = this.getPool(databaseName)
      if (originalIndexName && originalIndexName !== params.name) {
        await this.query(pool, `DROP INDEX IF EXISTS "${params.schemaName}"."${originalIndexName}"`)
      }
      const unique = params.isUnique ? 'UNIQUE ' : ''
      const cols = params.columns
        .filter((c) => !c.isIncludedColumn)
        .sort((a, b) => a.keyOrdinal - b.keyOrdinal)
        .map((c) => `"${c.columnName}"${c.isDescendingKey ? ' DESC' : ''}`)
        .join(', ')
      const where = params.filterExpression ? ` WHERE ${params.filterExpression}` : ''
      await this.query(
        pool,
        `CREATE ${unique}INDEX "${params.name}" ON "${params.schemaName}"."${params.tableName}" (${cols})${where}`
      )
      return { status: 'ok' }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async deleteIndex(databaseName: string, indexName: string, schemaName: string, _tableName: string): Promise<DeleteIndexResult> {
    try {
      const pool = this.getPool(databaseName)
      await this.query(pool, `DROP INDEX IF EXISTS "${schemaName}"."${indexName}"`)
      return { status: 'ok' }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async rebuildIndex(databaseName: string, indexName: string, schemaName: string, _tableName: string): Promise<RebuildIndexResult> {
    try {
      const pool = this.getPool(databaseName)
      await this.query(pool, `REINDEX INDEX "${schemaName}"."${indexName}"`)
      return { status: 'ok' }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async reorganizeIndex(_databaseName: string, _indexName: string, _schemaName: string, _tableName: string): Promise<ReorganizeIndexResult> {
    return { status: 'error', message: 'Index reorganize is not supported for PostgreSQL' }
  }

  async disableIndex(_databaseName: string, _indexName: string, _schemaName: string, _tableName: string): Promise<DisableIndexResult> {
    return { status: 'error', message: 'Index disable is not supported for PostgreSQL' }
  }

  // ── ERD schema ────────────────────────────────────────────────────────────

  async getErdSchema(databaseName: string): Promise<GetErdSchemaResult> {
    try {
      const pool = this.getPool(databaseName)

      const tableRows = await this.query<{
        table_schema: string
        table_name: string
        column_name: string
        data_type: string
        character_maximum_length: number | null
        is_nullable: string
      }>(
        pool,
        `SELECT t.table_schema, t.table_name, c.column_name, c.data_type, c.character_maximum_length, c.is_nullable
         FROM information_schema.tables t
         JOIN information_schema.columns c
           ON c.table_schema = t.table_schema AND c.table_name = t.table_name
         WHERE t.table_type = 'BASE TABLE'
           AND t.table_schema NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
         ORDER BY t.table_schema, t.table_name, c.ordinal_position`
      )

      const pkRows = await this.query<{
        table_schema: string
        table_name: string
        column_name: string
      }>(
        pool,
        `SELECT kcu.table_schema, kcu.table_name, kcu.column_name
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON tc.constraint_name = kcu.constraint_name
           AND tc.table_schema = kcu.table_schema
         WHERE tc.constraint_type = 'PRIMARY KEY'
           AND tc.table_schema NOT IN ('pg_catalog', 'information_schema', 'pg_toast')`
      )

      const fkRows = await this.query<{
        constraint_name: string
        table_schema: string
        table_name: string
        column_name: string
        foreign_table_schema: string
        foreign_table_name: string
        foreign_column_name: string
      }>(
        pool,
        `SELECT
           kcu.constraint_name,
           kcu.table_schema, kcu.table_name, kcu.column_name,
           ccu.table_schema AS foreign_table_schema,
           ccu.table_name AS foreign_table_name,
           ccu.column_name AS foreign_column_name
         FROM information_schema.key_column_usage kcu
         JOIN information_schema.referential_constraints rc
           ON kcu.constraint_name = rc.constraint_name
           AND kcu.constraint_schema = rc.constraint_schema
         JOIN information_schema.constraint_column_usage ccu
           ON rc.unique_constraint_name = ccu.constraint_name
           AND rc.unique_constraint_schema = ccu.constraint_schema
         WHERE kcu.table_schema NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
         ORDER BY kcu.constraint_name`
      )

      const indexRows = await this.query<{
        schemaname: string
        tablename: string
        indexname: string
        indexdef: string
      }>(
        pool,
        `SELECT schemaname, tablename, indexname, indexdef
         FROM pg_indexes
         WHERE schemaname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
         ORDER BY schemaname, tablename, indexname`
      )

      const pkSet = new Set(pkRows.map((r) => `${r.table_schema}.${r.table_name}.${r.column_name}`))
      const fkSet = new Set(fkRows.map((r) => `${r.table_schema}.${r.table_name}.${r.column_name}`))

      // Build ErdTable map
      const tableMap = new Map<string, ErdTable>()
      for (const r of tableRows) {
        const key = `${r.table_schema}.${r.table_name}`
        if (!tableMap.has(key)) {
          tableMap.set(key, { schema: r.table_schema, name: r.table_name, columns: [] })
        }
        const fullCol = `${r.table_schema}.${r.table_name}.${r.column_name}`
        tableMap.get(key)!.columns.push({
          name: r.column_name,
          type: r.data_type,
          maxLength: r.character_maximum_length,
          isNullable: r.is_nullable === 'YES',
          isPrimaryKey: pkSet.has(fullCol),
          isForeignKey: fkSet.has(fullCol)
        })
      }

      const relationships: ErdRelationship[] = fkRows.map((r) => ({
        constraintName: r.constraint_name,
        fromSchema: r.table_schema,
        fromTable: r.table_name,
        fromColumn: r.column_name,
        toSchema: r.foreign_table_schema,
        toTable: r.foreign_table_name,
        toColumn: r.foreign_column_name
      }))

      const indexes: ErdIndex[] = indexRows.map((r) => ({
        schema: r.schemaname,
        table: r.tablename,
        name: r.indexname,
        typeDesc: 'NONCLUSTERED',
        isUnique: r.indexdef.toUpperCase().includes('UNIQUE'),
        isPrimaryKey: r.indexname.endsWith('_pkey')
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
      const rows = await this.query<{
        table_schema: string
        table_name: string
        view_definition: string
      }>(
        pool,
        `SELECT table_schema, table_name, view_definition
         FROM information_schema.views
         WHERE table_schema NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
         ORDER BY table_schema, table_name`
      )
      const views: ViewDefinition[] = rows.map((r) => ({
        schemaName: r.table_schema,
        viewName: r.table_name,
        definition: r.view_definition ?? '',
        isSchemabound: false,
        isEncrypted: false
      }))
      return { status: 'ok', views }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async saveView(databaseName: string, params: SaveViewParams, originalViewName?: string): Promise<SaveViewResult> {
    try {
      const pool = this.getPool(databaseName)
      if (originalViewName && originalViewName !== params.viewName) {
        await this.query(pool, `DROP VIEW IF EXISTS "${params.schemaName}"."${originalViewName}"`)
      }
      await this.query(
        pool,
        `CREATE OR REPLACE VIEW "${params.schemaName}"."${params.viewName}" AS ${params.definition}`
      )
      return { status: 'ok' }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async deleteView(databaseName: string, schemaName: string, viewName: string): Promise<DeleteViewResult> {
    try {
      const pool = this.getPool(databaseName)
      await this.query(pool, `DROP VIEW IF EXISTS "${schemaName}"."${viewName}"`)
      return { status: 'ok' }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  // ── Stored Procedures ─────────────────────────────────────────────────────

  async getStoredProcedures(databaseName: string): Promise<GetStoredProceduresResult> {
    try {
      const pool = this.getPool(databaseName)
      const rows = await this.query<{
        schema_name: string
        proc_name: string
        proc_body: string
      }>(
        pool,
        `SELECT
           n.nspname AS schema_name,
           p.proname AS proc_name,
           pg_get_functiondef(p.oid) AS proc_body
         FROM pg_catalog.pg_proc p
         JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
         WHERE p.prokind = 'p'
           AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
         ORDER BY n.nspname, p.proname`
      )
      const procedures: StoredProcedureDefinition[] = rows.map((r) => ({
        schemaName: r.schema_name,
        procedureName: r.proc_name,
        description: '',
        parameters: [],
        body: r.proc_body ?? ''
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
      if (originalProcedureName && originalProcedureName !== params.procedureName) {
        await this.query(pool, `DROP PROCEDURE IF EXISTS "${params.schemaName}"."${originalProcedureName}"`)
      }
      const paramList = params.parameters
        .map((p: StoredProcedureParameter) => `${p.name} ${p.type}${p.defaultValue ? ` DEFAULT ${p.defaultValue}` : ''}`)
        .join(', ')
      await this.query(
        pool,
        `CREATE OR REPLACE PROCEDURE "${params.schemaName}"."${params.procedureName}"(${paramList})
         LANGUAGE plpgsql AS $$
         ${params.body}
         $$`
      )
      return { status: 'ok' }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async deleteStoredProcedure(databaseName: string, schemaName: string, procedureName: string): Promise<DeleteStoredProcedureResult> {
    try {
      const pool = this.getPool(databaseName)
      await this.query(pool, `DROP PROCEDURE IF EXISTS "${schemaName}"."${procedureName}"`)
      return { status: 'ok' }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  // ── Data Types (Enums) ────────────────────────────────────────────────────

  async getDataTypes(databaseName: string): Promise<GetDataTypesResult> {
    try {
      const pool = this.getPool(databaseName)
      const rows = await this.query<{
        schema_name: string
        type_name: string
        enum_values: string
      }>(
        pool,
        `SELECT
           n.nspname AS schema_name,
           t.typname AS type_name,
           string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder) AS enum_values
         FROM pg_catalog.pg_type t
         JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
         LEFT JOIN pg_catalog.pg_enum e ON e.enumtypid = t.oid
         WHERE t.typtype = 'e'
           AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
         GROUP BY n.nspname, t.typname
         ORDER BY n.nspname, t.typname`
      )
      const dataTypes: DataTypeDefinition[] = rows.map((r) => ({
        schemaName: r.schema_name,
        typeName: r.type_name,
        baseType: `ENUM(${r.enum_values ?? ''})`,
        maxLength: 0,
        precision: 0,
        scale: 0,
        isNullable: true
      }))
      return { status: 'ok', dataTypes }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async saveDataType(
    databaseName: string,
    params: SaveDataTypeParams,
    originalTypeName?: string,
    originalSchemaName?: string
  ): Promise<SaveDataTypeResult> {
    try {
      const pool = this.getPool(databaseName)
      const schema = originalSchemaName ?? params.schemaName
      if (originalTypeName) {
        await this.query(pool, `DROP TYPE IF EXISTS "${schema}"."${originalTypeName}"`)
      }
      // baseType is expected to be comma-separated enum values
      const values = params.baseType.replace(/^ENUM\(|\)$/gi, '').split(',').map((v) => v.trim()).filter(Boolean)
      const valueList = values.map((v) => `'${v.replace(/'/g, "''")}'`).join(', ')
      await this.query(pool, `CREATE TYPE "${params.schemaName}"."${params.typeName}" AS ENUM (${valueList})`)
      return { status: 'ok' }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async deleteDataType(databaseName: string, schemaName: string, typeName: string): Promise<DeleteDataTypeResult> {
    try {
      const pool = this.getPool(databaseName)
      await this.query(pool, `DROP TYPE IF EXISTS "${schemaName}"."${typeName}"`)
      return { status: 'ok' }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  // ── Composite Types (Table Types) ─────────────────────────────────────────

  async getTableTypes(databaseName: string): Promise<GetTableTypesResult> {
    try {
      const pool = this.getPool(databaseName)
      const rows = await this.query<{ schema_name: string; type_name: string }>(
        pool,
        `SELECT n.nspname AS schema_name, t.typname AS type_name
         FROM pg_catalog.pg_type t
         JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
         WHERE t.typtype = 'c' AND t.typrelid != 0
           AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
         ORDER BY n.nspname, t.typname`
      )
      return { status: 'ok', tableTypes: rows.map((r) => ({ schemaName: r.schema_name, typeName: r.type_name })) }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async getTableType(databaseName: string, schemaName: string, typeName: string): Promise<GetTableTypeResult> {
    try {
      const pool = this.getPool(databaseName)
      const rows = await this.query<{
        attname: string
        typname: string
        atttypmod: number
        attnotnull: boolean
      }>(
        pool,
        `SELECT a.attname, tp.typname, a.atttypmod, a.attnotnull
         FROM pg_catalog.pg_type t
         JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
         JOIN pg_catalog.pg_attribute a ON a.attrelid = t.typrelid
         JOIN pg_catalog.pg_type tp ON tp.oid = a.atttypid
         WHERE t.typtype = 'c' AND n.nspname = $1 AND t.typname = $2
           AND a.attnum > 0
         ORDER BY a.attnum`,
        [schemaName, typeName]
      )
      const columns = rows.map((r) => ({
        name: r.attname,
        type: r.typname,
        maxLength: r.atttypmod > 0 ? r.atttypmod - 4 : 0,
        precision: 0,
        scale: 0,
        isNullable: !r.attnotnull
      }))
      return { status: 'ok', tableType: { schemaName, typeName, columns } as TableTypeDefinition }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async saveTableType(
    databaseName: string,
    params: SaveTableTypeParams,
    originalTypeName?: string,
    originalSchemaName?: string
  ): Promise<SaveTableTypeResult> {
    try {
      const pool = this.getPool(databaseName)
      const schema = originalSchemaName ?? params.schemaName
      if (originalTypeName) {
        await this.query(pool, `DROP TYPE IF EXISTS "${schema}"."${originalTypeName}"`)
      }
      const colDefs = params.columns.map((c: TableTypeColumnParam) => {
        const len = c.length === 'MAX' ? '' : c.length != null ? `(${c.length})` : ''
        return `"${c.name}" ${c.type}${len}${c.isNullable ? '' : ' NOT NULL'}`
      }).join(', ')
      await this.query(pool, `CREATE TYPE "${params.schemaName}"."${params.typeName}" AS (${colDefs})`)
      return { status: 'ok' }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async deleteTableType(databaseName: string, schemaName: string, typeName: string): Promise<DeleteTableTypeResult> {
    try {
      const pool = this.getPool(databaseName)
      await this.query(pool, `DROP TYPE IF EXISTS "${schemaName}"."${typeName}"`)
      return { status: 'ok' }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  // ── Memory Optimized (not supported) ──────────────────────────────────────

  async getMemoryOptimizedTableTypes(_databaseName: string): Promise<GetMemoryOptimizedTableTypesResult> {
    return { status: 'ok', tableTypes: [] }
  }

  async getMemoryOptimizedTableType(_databaseName: string, _schemaName: string, _typeName: string): Promise<GetMemoryOptimizedTableTypeResult> {
    return { status: 'error', message: 'Memory-optimized table types are not supported for PostgreSQL' }
  }

  async saveMemoryOptimizedTableType(_databaseName: string, _params: SaveMemoryOptimizedTableTypeParams): Promise<SaveMemoryOptimizedTableTypeResult> {
    return { status: 'error', message: 'Memory-optimized table types are not supported for PostgreSQL' }
  }

  async deleteMemoryOptimizedTableType(_databaseName: string, _schemaName: string, _typeName: string): Promise<DeleteMemoryOptimizedTableTypeResult> {
    return { status: 'error', message: 'Memory-optimized table types are not supported for PostgreSQL' }
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
    const client = await pool.connect()
    try {
      if (timeoutMs && timeoutMs > 0) {
        await client.query(`SET statement_timeout = ${timeoutMs}`)
      }

      if (withPlan) {
        // Return EXPLAIN ANALYZE output as a result set row
        const explainResult = await client.query(`EXPLAIN ANALYZE ${querySql}`)
        const rows = explainResult.rows as Record<string, unknown>[]
        const columns = explainResult.fields.map((f) => f.name)
        const durationMs = Date.now() - startTime
        return {
          status: 'ok',
          resultSets: [{ columns, rows, rowCount: rows.length }],
          messages: [],
          durationMs
        }
      }

      const messages: Array<{ type: 'info' | 'error'; text: string }> = []
      client.on('notice', (notice) => {
        messages.push({ type: 'info', text: notice.message ?? String(notice) })
      })

      // Split on semicolons to handle multi-statement batches
      const statements = querySql
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean)

      const resultSets: import('../types').QueryResultSet[] = []
      for (const stmt of statements) {
        const res = await client.query(stmt)
        const rows = res.rows as Record<string, unknown>[]
        if (res.fields && res.fields.length > 0) {
          resultSets.push({
            columns: res.fields.map((f) => f.name),
            rows,
            rowCount: rows.length
          })
        } else {
          messages.push({ type: 'info', text: `${res.command ?? 'OK'}: ${res.rowCount ?? 0} rows affected` })
        }
      }

      const durationMs = Date.now() - startTime
      return { status: 'ok', resultSets, messages, durationMs }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    } finally {
      client.release()
    }
  }

  async executeMonitoringQuery<T>(querySql: string): Promise<T[]> {
    const pool = this.defaultPool
    if (!pool) return []
    const client = await pool.connect()
    try {
      const result = await client.query(querySql)
      return result.rows as T[]
    } finally {
      client.release()
    }
  }

  // ── Script generation ─────────────────────────────────────────────────────

  async scriptTableCreate(databaseName: string, schemaName: string, tableName: string): Promise<GenerateScriptResult> {
    try {
      const schema = await this.getTableSchema(databaseName, schemaName, tableName)
      if (schema.status !== 'ok') return schema
      const cols = schema.columns.map((c) => {
        const nullable = c.isNullable ? '' : ' NOT NULL'
        const def = c.defaultValue ? ` DEFAULT ${c.defaultValue}` : ''
        return `  "${c.name}" ${c.type}${nullable}${def}`
      })
      const pks = schema.columns.filter((c) => c.isPrimaryKey).map((c) => `"${c.name}"`)
      const pkConstraint = pks.length > 0 ? `,\n  PRIMARY KEY (${pks.join(', ')})` : ''
      const script = `CREATE TABLE "${schemaName}"."${tableName}" (\n${cols.join(',\n')}${pkConstraint}\n);`
      return { status: 'ok', script }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async scriptTableAlter(_databaseName: string, schemaName: string, tableName: string): Promise<GenerateScriptResult> {
    const script = `-- ALTER TABLE "${schemaName}"."${tableName}"\n-- ADD COLUMN column_name data_type;`
    return { status: 'ok', script }
  }

  async scriptTableDrop(_databaseName: string, schemaName: string, tableName: string): Promise<GenerateScriptResult> {
    return { status: 'ok', script: `DROP TABLE IF EXISTS "${schemaName}"."${tableName}";` }
  }

  async scriptViewCreate(databaseName: string, schemaName: string, viewName: string): Promise<GenerateScriptResult> {
    try {
      const result = await this.getViews(databaseName)
      if (result.status !== 'ok') return result
      const view = result.views.find((v) => v.schemaName === schemaName && v.viewName === viewName)
      if (!view) return { status: 'error', message: `View "${schemaName}"."${viewName}" not found` }
      const script = `CREATE OR REPLACE VIEW "${schemaName}"."${viewName}" AS\n${view.definition};`
      return { status: 'ok', script }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async scriptViewAlter(_databaseName: string, schemaName: string, viewName: string): Promise<GenerateScriptResult> {
    return { status: 'ok', script: `CREATE OR REPLACE VIEW "${schemaName}"."${viewName}" AS\n-- SELECT ...;` }
  }

  async scriptViewDrop(_databaseName: string, schemaName: string, viewName: string): Promise<GenerateScriptResult> {
    return { status: 'ok', script: `DROP VIEW IF EXISTS "${schemaName}"."${viewName}";` }
  }

  async scriptStoredProcedureCreate(databaseName: string, schemaName: string, procedureName: string): Promise<GenerateScriptResult> {
    try {
      const result = await this.getStoredProcedures(databaseName)
      if (result.status !== 'ok') return result
      const proc = result.procedures.find((p) => p.schemaName === schemaName && p.procedureName === procedureName)
      if (!proc) return { status: 'error', message: `Procedure "${schemaName}"."${procedureName}" not found` }
      return { status: 'ok', script: proc.body }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async scriptStoredProcedureAlter(_databaseName: string, schemaName: string, procedureName: string): Promise<GenerateScriptResult> {
    return { status: 'ok', script: `CREATE OR REPLACE PROCEDURE "${schemaName}"."${procedureName}"()\nLANGUAGE plpgsql AS $$\nBEGIN\n  -- body\nEND;\n$$;` }
  }

  async scriptStoredProcedureDrop(_databaseName: string, schemaName: string, procedureName: string): Promise<GenerateScriptResult> {
    return { status: 'ok', script: `DROP PROCEDURE IF EXISTS "${schemaName}"."${procedureName}";` }
  }

  async scriptSelectTopRows(_databaseName: string, schemaName: string, tableName: string, count: number): Promise<GenerateScriptResult> {
    return { status: 'ok', script: `SELECT * FROM "${schemaName}"."${tableName}" LIMIT ${count};` }
  }

  async scriptDropDatabase(databaseName: string): Promise<GenerateScriptResult> {
    return { status: 'ok', script: `DROP DATABASE "${databaseName}";` }
  }

  // ── Capabilities ──────────────────────────────────────────────────────────

  getCapabilities(): ProviderCapabilities {
    return {
      executionPlan: { kind: 'explain-text', buttonLabel: 'Explain Query' },
      clientStatistics: { kind: 'none' },
      hasCreateDatabase: true,
      hasStoredProcedures: true,
      hasFunctions: true,
      hasUserDefinedTypes: true,
      hasTableTypes: true,
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

  // ── Backup / Restore ──────────────────────────────────────────────────────

  /** Probes a CLI tool by running `<path> --version`. */
  private probeTool(binPath: string): Promise<PostgresToolInfo> {
    return new Promise((resolve) => {
      execFile(binPath, ['--version'], { timeout: 5000 }, (err, stdout) => {
        if (err) {
          resolve({ found: false })
          return
        }
        resolve({ found: true, path: binPath, version: String(stdout).trim() })
      })
    })
  }

  async getBackupToolStatus(paths?: {
    pgDumpPath?: string
    pgRestorePath?: string
    psqlPath?: string
  }): Promise<PostgresBackupToolStatusResult> {
    try {
      const [pgDump, pgRestore, psql] = await Promise.all([
        this.probeTool(paths?.pgDumpPath?.trim() || 'pg_dump'),
        this.probeTool(paths?.pgRestorePath?.trim() || 'pg_restore'),
        this.probeTool(paths?.psqlPath?.trim() || 'psql')
      ])
      return { status: 'ok', tools: { pgDump, pgRestore, psql } }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  /** Maps a backup format to the pg_dump `--format` short flag. */
  private formatFlag(format: PostgresBackupOptions['format']): string {
    switch (format) {
      case 'custom':
        return 'c'
      case 'tar':
        return 't'
      case 'directory':
        return 'd'
      default:
        return 'p'
    }
  }

  /**
   * Builds the pg_dump argument list (excluding the password, which is passed
   * via the PGPASSWORD environment variable at run time).
   */
  private buildBackupArgs(opts: PostgresBackupOptions): string[] {
    const r = this.record
    const args = [
      `--host=${r.host}`,
      `--port=${r.port}`,
      `--username=${r.username}`,
      '--no-password',
      `--format=${this.formatFlag(opts.format)}`
    ]
    if (opts.content === 'schema-only') args.push('--schema-only')
    if (opts.content === 'data-only') args.push('--data-only')
    if (opts.noOwner) args.push('--no-owner')
    if (opts.noPrivileges) args.push('--no-acl')
    if (opts.clean) args.push('--clean', '--if-exists')
    if (opts.createDatabase) args.push('--create')
    if (opts.encoding?.trim()) args.push(`--encoding=${opts.encoding.trim()}`)
    if (
      typeof opts.compressionLevel === 'number' &&
      (opts.format === 'custom' || opts.format === 'directory')
    ) {
      args.push(`--compress=${opts.compressionLevel}`)
    }
    // Plain format streams to stdout; archive formats write the file directly.
    if (opts.format !== 'plain') args.push(`--file=${opts.filePath}`)
    args.push(`--dbname=${opts.databaseName}`)
    return args
  }

  buildBackupCommandPreview(opts: PostgresBackupOptions): BuildPostgresBackupPreviewResult {
    try {
      const bin = opts.pgDumpPath?.trim() || 'pg_dump'
      const args = this.buildBackupArgs(opts)
      const shown = [bin, ...args].map((a) => (/\s/.test(a) ? `"${a}"` : a))
      // Plain format redirects stdout to the file (optionally through gzip).
      const redirect =
        opts.format === 'plain'
          ? opts.compress
            ? ` | gzip > "${opts.filePath}"`
            : ` > "${opts.filePath}"`
          : ''
      const env = `PGPASSWORD=****** `
      return { status: 'ok', command: env + shown.join(' ') + redirect }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async executeBackup(opts: PostgresBackupOptions): Promise<ExecutePostgresBackupResult> {
    const start = Date.now()
    try {
      const bin = opts.pgDumpPath?.trim() || 'pg_dump'
      const tool = await this.probeTool(bin)
      if (!tool.found) {
        return { status: 'error', message: `pg_dump not found (looked for "${bin}")` }
      }
      await this.runPgDump(bin, opts)
      const bytes = statSync(opts.filePath).size
      return { status: 'ok', filePath: opts.filePath, durationMs: Date.now() - start, bytes }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  /**
   * Runs pg_dump. For plain format the SQL is streamed from stdout to the file
   * (optionally gzipped); archive formats write the file via --file themselves.
   */
  private runPgDump(bin: string, opts: PostgresBackupOptions): Promise<void> {
    return new Promise((resolve, reject) => {
      const args = this.buildBackupArgs(opts)
      const child = spawn(bin, args, {
        env: { ...process.env, PGPASSWORD: this.record.password ?? '' }
      })
      let stderr = ''
      child.stderr.on('data', (d) => {
        stderr += String(d)
      })
      child.on('error', reject)

      if (opts.format === 'plain') {
        const fileStream = createWriteStream(opts.filePath)
        const source = opts.compress ? child.stdout.pipe(createGzip()) : child.stdout
        source.pipe(fileStream)
        fileStream.on('error', reject)
      }

      child.on('close', (code) => {
        if (code === 0) resolve()
        else reject(new Error(stderr.trim() || `pg_dump exited with code ${code}`))
      })
    })
  }

  async executeRestore(opts: PostgresRestoreOptions): Promise<ExecutePostgresRestoreResult> {
    const start = Date.now()
    try {
      if (opts.format === 'plain') {
        await this.runPsqlRestore(opts)
      } else {
        await this.runPgRestore(opts)
      }
      return { status: 'ok', durationMs: Date.now() - start }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  /** Base connection args shared by psql/pg_restore (password via env). */
  private clientArgs(): string[] {
    const r = this.record
    return [`--host=${r.host}`, `--port=${r.port}`, `--username=${r.username}`, '--no-password']
  }

  /** Creates the target database via psql if it does not already exist. */
  private createTargetDatabase(opts: PostgresRestoreOptions): Promise<void> {
    const bin = opts.psqlPath?.trim() || 'psql'
    const env = { ...process.env, PGPASSWORD: this.record.password ?? '' }
    const maintenanceDb = this.record.defaultDatabase || 'postgres'
    const name = opts.targetDatabaseName.replace(/"/g, '""')
    return new Promise((resolve, reject) => {
      execFile(
        bin,
        [...this.clientArgs(), `--dbname=${maintenanceDb}`, '-c', `CREATE DATABASE "${name}"`],
        { env },
        (err, _stdout, stderr) => {
          // Ignore "already exists" so re-runs are idempotent.
          if (err && !/already exists/i.test(String(stderr))) {
            reject(new Error(String(stderr).trim() || err.message))
          } else {
            resolve()
          }
        }
      )
    })
  }

  /** Restores a plain-format dump by piping it into psql over stdin. */
  private async runPsqlRestore(opts: PostgresRestoreOptions): Promise<void> {
    if (opts.createDatabase) await this.createTargetDatabase(opts)
    const bin = opts.psqlPath?.trim() || 'psql'
    const env = { ...process.env, PGPASSWORD: this.record.password ?? '' }
    await new Promise<void>((resolve, reject) => {
      const args = [...this.clientArgs(), `--dbname=${opts.targetDatabaseName}`]
      if (opts.singleTransaction) args.push('--single-transaction')
      args.push('--set', 'ON_ERROR_STOP=on')
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
        else reject(new Error(stderr.trim() || `psql exited with code ${code}`))
      })
    })
  }

  /** Restores a custom/tar/directory archive via pg_restore. */
  private async runPgRestore(opts: PostgresRestoreOptions): Promise<void> {
    if (opts.createDatabase) await this.createTargetDatabase(opts)
    const bin = opts.pgRestorePath?.trim() || 'pg_restore'
    const env = { ...process.env, PGPASSWORD: this.record.password ?? '' }
    await new Promise<void>((resolve, reject) => {
      const args = [...this.clientArgs(), `--dbname=${opts.targetDatabaseName}`]
      if (opts.clean) args.push('--clean', '--if-exists')
      if (opts.noOwner) args.push('--no-owner')
      // --single-transaction and parallel jobs are mutually exclusive.
      if (opts.singleTransaction) args.push('--single-transaction')
      else if (typeof opts.jobs === 'number' && opts.jobs > 1) args.push(`--jobs=${opts.jobs}`)
      args.push(opts.filePath)
      const child = spawn(bin, args, { env })
      let stderr = ''
      child.stderr.on('data', (d) => {
        stderr += String(d)
      })
      child.on('error', reject)
      child.on('close', (code) => {
        if (code === 0) resolve()
        else reject(new Error(stderr.trim() || `pg_restore exited with code ${code}`))
      })
    })
  }
}

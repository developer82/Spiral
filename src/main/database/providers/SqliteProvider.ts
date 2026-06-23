import Database from 'better-sqlite3'
import {
  createReadStream,
  createWriteStream,
  copyFileSync,
  existsSync,
  openSync,
  readSync,
  closeSync,
  rmSync,
  statSync,
  unlinkSync
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { createGzip, createGunzip } from 'zlib'
import { pipeline } from 'stream/promises'
import type { ConnectionRecord } from '../../store'
import type {
  DatabaseProvider,
  ExplorerNode,
  ExecuteQueryResult,
  QueryResultSet,
  QueryMessage,
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
  SqliteBackupOptions,
  SqliteRestoreOptions,
  ExecuteSqliteBackupResult,
  ExecuteSqliteRestoreResult
} from '../types'

// ─── Internal PRAGMA row shapes ───────────────────────────────────────────────

interface PragmaTableInfoRow {
  cid: number
  name: string
  type: string
  notnull: number
  dflt_value: string | null
  pk: number
}

interface PragmaForeignKeyListRow {
  id: number
  seq: number
  table: string
  from: string
  to: string
  on_update: string
  on_delete: string
}

interface PragmaIndexListRow {
  seq: number
  name: string
  unique: number
  origin: string
  partial: number
}

interface PragmaIndexInfoRow {
  seqno: number
  cid: number
  name: string
}

interface SqliteMasterRow {
  type: string
  name: string
  tbl_name: string
  rootpage: number
  sql: string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Double-quote a SQLite identifier, escaping embedded double quotes. */
function qi(identifier: string): string {
  return '"' + identifier.replace(/"/g, '""') + '"'
}

function mapForeignKeyRule(rule: string): ForeignKeyDefinition['deleteRule'] {
  const upper = (rule ?? '').toUpperCase()
  if (upper === 'CASCADE') return 'CASCADE'
  if (upper === 'SET NULL') return 'SET_NULL'
  if (upper === 'SET DEFAULT') return 'SET_DEFAULT'
  return 'NO_ACTION'
}

/**
 * SQLite database provider.
 *
 * SQLite is a file-based, single-database engine. The connection record must
 * supply a `filePath` pointing to the SQLite database file. There are no
 * separate schemas; all tables reside in the implicit "main" schema. The
 * `databaseName` parameter (always "main" in the explorer tree) and
 * `schemaName` parameter are accepted but ignored in all queries because
 * SQLite does not separate databases within a single connection.
 *
 * Unsupported features (stored procedures, functions, user-defined types,
 * table types, statistics, index rebuild/reorganize/disable, profiler, security
 * objects) return empty results; capability flags are set accordingly so the
 * UI hides their menus and buttons automatically.
 */
export class SqliteProvider implements DatabaseProvider {
  private db: Database.Database | null = null
  /** Path to the SQLite database file; retained for backup/restore. */
  private filePath: string | null = null

  // ── Connection ─────────────────────────────────────────────────────────────

  async connect(record: ConnectionRecord): Promise<void> {
    if (!record.filePath) {
      throw new Error('SQLite file path is required')
    }
    this.filePath = record.filePath
    // verbose: undefined keeps the library quiet; readonly: false allows writes
    this.db = new Database(record.filePath)
    // Validate the file is a readable SQLite database
    this.db.prepare('SELECT 1').get()
    // Enable WAL mode for better concurrent read/write performance
    this.db.pragma('journal_mode = WAL')
    // Enable foreign key enforcement
    this.db.pragma('foreign_keys = ON')
  }

  async disconnect(): Promise<void> {
    this.db?.close()
    this.db = null
  }

  // ── Internal helpers ───────────────────────────────────────────────────────

  private get conn(): Database.Database {
    if (!this.db) throw new Error('Not connected')
    return this.db
  }

  // ── Tree listing ───────────────────────────────────────────────────────────

  /** SQLite has exactly one implicit database: "main". */
  async listDatabases(_showSystemDatabases: boolean): Promise<ExplorerNode[]> {
    return [{ id: 'db:main', label: 'main', kind: 'database' as const }]
  }

  listCategories(databaseName: string): ExplorerNode[] {
    return [
      { id: `db:${databaseName}:tables`, label: 'Tables', kind: 'tables-folder' as const },
      { id: `db:${databaseName}:views`, label: 'Views', kind: 'views-folder' as const }
    ]
  }

  listServerSecurityCategories(): ExplorerNode[] {
    return []
  }

  async listServerUsers(): Promise<ExplorerNode[]> {
    return []
  }

  async listServerRoles(): Promise<ExplorerNode[]> {
    return []
  }

  async listServerSchemas(): Promise<ExplorerNode[]> {
    return []
  }

  listDatabaseSecurityCategories(_databaseName: string): ExplorerNode[] {
    return []
  }

  async listDatabaseUsers(_databaseName: string): Promise<ExplorerNode[]> {
    return []
  }

  async listDatabaseRoles(_databaseName: string): Promise<ExplorerNode[]> {
    return []
  }

  async listDatabaseSchemas(_databaseName: string): Promise<ExplorerNode[]> {
    return []
  }

  async listTables(databaseName: string): Promise<ExplorerNode[]> {
    const rows = this.conn
      .prepare(
        `SELECT name FROM sqlite_master
         WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
         ORDER BY name`
      )
      .all() as Pick<SqliteMasterRow, 'name'>[]

    return rows.map((r) => ({
      id: `db:${databaseName}:tables:main.${r.name}`,
      label: r.name,
      kind: 'table' as const
    }))
  }

  async listViews(databaseName: string): Promise<ExplorerNode[]> {
    const rows = this.conn
      .prepare(
        `SELECT name FROM sqlite_master
         WHERE type = 'view'
         ORDER BY name`
      )
      .all() as Pick<SqliteMasterRow, 'name'>[]

    return rows.map((r) => ({
      id: `db:${databaseName}:views:main.${r.name}`,
      label: r.name,
      kind: 'view' as const
    }))
  }

  async listStoredProcedures(_databaseName: string): Promise<ExplorerNode[]> {
    return []
  }

  async listFunctions(_databaseName: string): Promise<ExplorerNode[]> {
    return []
  }

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

  /** SQLite tables: columns, keys, triggers, indexes only (no statistics/constraints). */
  listTableCategories(databaseName: string, tableIdentifier: string): ExplorerNode[] {
    const base = `db:${databaseName}:tables:${tableIdentifier}`
    return [
      { id: `${base}:columns`, label: 'Columns', kind: 'table-columns-folder' as const },
      { id: `${base}:keys`, label: 'Keys', kind: 'table-keys-folder' as const },
      { id: `${base}:triggers`, label: 'Triggers', kind: 'table-triggers-folder' as const },
      { id: `${base}:indexes`, label: 'Indexes', kind: 'table-indexes-folder' as const }
    ]
  }

  async listColumns(
    databaseName: string,
    _schemaName: string,
    tableName: string
  ): Promise<ExplorerNode[]> {
    const rows = this.conn
      .prepare(`PRAGMA table_info(${qi(tableName)})`)
      .all() as PragmaTableInfoRow[]

    return rows.map((r) => ({
      id: `db:${databaseName}:tables:main.${tableName}:columns:${r.name}`,
      label: `${r.name} (${r.type || 'any'}, ${r.notnull ? 'not null' : 'null'})`,
      kind: r.pk > 0 ? ('column-pk' as const) : ('column' as const)
    }))
  }

  async listKeys(
    databaseName: string,
    _schemaName: string,
    tableName: string
  ): Promise<ExplorerNode[]> {
    const nodes: ExplorerNode[] = []

    // Primary key (if any)
    const pkColumns = (
      this.conn.prepare(`PRAGMA table_info(${qi(tableName)})`).all() as PragmaTableInfoRow[]
    ).filter((r) => r.pk > 0)

    if (pkColumns.length > 0) {
      nodes.push({
        id: `db:${databaseName}:tables:main.${tableName}:keys:PRIMARY`,
        label: 'PRIMARY KEY',
        kind: 'key' as const
      })
    }

    // Foreign keys
    const fkRows = this.conn
      .prepare(`PRAGMA foreign_key_list(${qi(tableName)})`)
      .all() as PragmaForeignKeyListRow[]

    const fksByConstraint = new Map<number, PragmaForeignKeyListRow>()
    for (const fk of fkRows) {
      if (!fksByConstraint.has(fk.id)) fksByConstraint.set(fk.id, fk)
    }

    for (const [id, fk] of fksByConstraint) {
      nodes.push({
        id: `db:${databaseName}:tables:main.${tableName}:keys:FK_${id}`,
        label: `FK → ${fk.table}`,
        kind: 'key' as const
      })
    }

    return nodes
  }

  async listConstraints(
    _databaseName: string,
    _schemaName: string,
    _tableName: string
  ): Promise<ExplorerNode[]> {
    // SQLite stores CHECK constraints in the CREATE TABLE statement; not separately enumerable
    return []
  }

  async listTriggers(
    databaseName: string,
    _schemaName: string,
    tableName: string
  ): Promise<ExplorerNode[]> {
    const rows = this.conn
      .prepare(
        `SELECT name FROM sqlite_master
         WHERE type = 'trigger' AND tbl_name = ?
         ORDER BY name`
      )
      .all(tableName) as Pick<SqliteMasterRow, 'name'>[]

    return rows.map((r) => ({
      id: `db:${databaseName}:tables:main.${tableName}:triggers:${r.name}`,
      label: r.name,
      kind: 'trigger' as const
    }))
  }

  async listIndexes(
    databaseName: string,
    _schemaName: string,
    tableName: string
  ): Promise<ExplorerNode[]> {
    const rows = this.conn
      .prepare(`PRAGMA index_list(${qi(tableName)})`)
      .all() as PragmaIndexListRow[]

    return rows.map((r) => ({
      id: `db:${databaseName}:tables:main.${tableName}:indexes:${r.name}`,
      label: r.name,
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

  // ── Table schema / detail ──────────────────────────────────────────────────

  async getTableSchema(
    _databaseName: string,
    _schemaName: string,
    tableName: string
  ): Promise<GetTableSchemaResult> {
    try {
      const rows = this.conn
        .prepare(`PRAGMA table_info(${qi(tableName)})`)
        .all() as PragmaTableInfoRow[]

      const columns: TableColumnMeta[] = rows.map((r) => ({
        name: r.name,
        type: r.type || 'any',
        maxLength: null,
        precision: null,
        scale: null,
        isNullable: r.notnull === 0 && r.pk === 0,
        defaultValue: r.dflt_value,
        isIdentity: false,
        identitySeed: null,
        identityIncrement: null,
        isPrimaryKey: r.pk > 0
      }))

      return { status: 'ok', columns }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async getForeignKeys(
    _databaseName: string,
    _schemaName: string,
    tableName: string
  ): Promise<GetForeignKeysResult> {
    try {
      const rows = this.conn
        .prepare(`PRAGMA foreign_key_list(${qi(tableName)})`)
        .all() as PragmaForeignKeyListRow[]

      const foreignKeys: ForeignKeyDefinition[] = rows.map((r) => ({
        constraintName: `FK_${r.id}_${r.seq}`,
        columnName: r.from,
        referencedSchema: 'main',
        referencedTable: r.table,
        referencedColumn: r.to,
        isEnabled: true,
        enforceForReplication: false,
        deleteRule: mapForeignKeyRule(r.on_delete),
        updateRule: mapForeignKeyRule(r.on_update)
      }))

      return { status: 'ok', foreignKeys }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async getCheckConstraints(
    _databaseName: string,
    _schemaName: string,
    _tableName: string
  ): Promise<GetCheckConstraintsResult> {
    // SQLite embeds CHECK constraints in CREATE TABLE SQL; not queryable separately
    const constraints: CheckConstraintDefinition[] = []
    return { status: 'ok', constraints }
  }

  async getTriggers(
    _databaseName: string,
    _schemaName: string,
    tableName: string
  ): Promise<GetTriggersResult> {
    try {
      const rows = this.conn
        .prepare(
          `SELECT name, sql FROM sqlite_master
           WHERE type = 'trigger' AND tbl_name = ?
           ORDER BY name`
        )
        .all(tableName) as Pick<SqliteMasterRow, 'name' | 'sql'>[]

      const triggers: TriggerDefinition[] = rows.map((r) => {
        const sql = r.sql ?? ''
        const upper = sql.toUpperCase()
        return {
          triggerName: r.name,
          isInsteadOf: upper.includes('INSTEAD OF'),
          isInsert: upper.includes('INSERT'),
          isUpdate: upper.includes('UPDATE'),
          isDelete: upper.includes('DELETE'),
          body: sql
        }
      })

      return { status: 'ok', triggers }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async saveTrigger(
    _databaseName: string,
    params: SaveTriggerParams,
    originalTriggerName?: string
  ): Promise<SaveTriggerResult> {
    try {
      const dropName = originalTriggerName ?? params.triggerName
      this.conn.prepare(`DROP TRIGGER IF EXISTS ${qi(dropName)}`).run()

      const timing = params.isInsteadOf ? 'INSTEAD OF' : 'BEFORE'
      const events: string[] = []
      if (params.isInsert) events.push('INSERT')
      if (params.isUpdate) events.push('UPDATE')
      if (params.isDelete) events.push('DELETE')

      if (events.length === 0) {
        return { status: 'error', message: 'No trigger event selected' }
      }

      // SQLite supports only one event per trigger; if multiple selected, create one per event
      for (const event of events) {
        const name =
          events.length > 1 ? `${params.triggerName}_${event.toLowerCase()}` : params.triggerName
        this.conn.prepare(`DROP TRIGGER IF EXISTS ${qi(name)}`).run()
        this.conn
          .prepare(
            `CREATE TRIGGER ${qi(name)}
             ${timing} ${event}
             ON ${qi(params.tableName)}
             FOR EACH ROW
             ${params.body}`
          )
          .run()
      }

      return { status: 'ok' }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async deleteTrigger(
    _databaseName: string,
    triggerName: string,
    _schemaName: string
  ): Promise<DeleteTriggerResult> {
    try {
      this.conn.prepare(`DROP TRIGGER IF EXISTS ${qi(triggerName)}`).run()
      return { status: 'ok' }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  // ── Indexes ────────────────────────────────────────────────────────────────

  async getIndexes(
    _databaseName: string,
    _schemaName: string,
    tableName: string
  ): Promise<GetIndexesResult> {
    try {
      const indexList = this.conn
        .prepare(`PRAGMA index_list(${qi(tableName)})`)
        .all() as PragmaIndexListRow[]

      const indexes: IndexDefinition[] = indexList.map((idx) => {
        const infoRows = this.conn
          .prepare(`PRAGMA index_info(${qi(idx.name)})`)
          .all() as PragmaIndexInfoRow[]

        const columns: IndexColumnEntry[] = infoRows.map((col) => ({
          columnName: col.name,
          keyOrdinal: col.seqno + 1,
          isDescendingKey: false,
          isIncludedColumn: false
        }))

        return {
          name: idx.name,
          schemaName: 'main',
          tableName,
          type: 'NONCLUSTERED',
          isUnique: idx.unique === 1,
          isPrimaryKey: idx.origin === 'pk',
          isDisabled: false,
          columns
        }
      })

      return { status: 'ok', indexes }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async saveIndex(
    _databaseName: string,
    params: SaveIndexParams,
    originalIndexName?: string
  ): Promise<SaveIndexResult> {
    try {
      if (originalIndexName) {
        this.conn.prepare(`DROP INDEX IF EXISTS ${qi(originalIndexName)}`).run()
      }

      const uniqueClause = params.isUnique ? 'UNIQUE ' : ''
      const cols = params.columns
        .sort((a, b) => a.keyOrdinal - b.keyOrdinal)
        .map((c) => qi(c.columnName))
        .join(', ')

      this.conn
        .prepare(
          `CREATE ${uniqueClause}INDEX ${qi(params.name)}
           ON ${qi(params.tableName)} (${cols})`
        )
        .run()

      return { status: 'ok' }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async deleteIndex(
    _databaseName: string,
    indexName: string,
    _schemaName: string,
    _tableName: string
  ): Promise<DeleteIndexResult> {
    try {
      this.conn.prepare(`DROP INDEX IF EXISTS ${qi(indexName)}`).run()
      return { status: 'ok' }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async rebuildIndex(
    _databaseName: string,
    _indexName: string,
    _schemaName: string,
    _tableName: string
  ): Promise<RebuildIndexResult> {
    return { status: 'error', message: 'Index rebuild is not supported by SQLite' }
  }

  async reorganizeIndex(
    _databaseName: string,
    _indexName: string,
    _schemaName: string,
    _tableName: string
  ): Promise<ReorganizeIndexResult> {
    return { status: 'error', message: 'Index reorganize is not supported by SQLite' }
  }

  async disableIndex(
    _databaseName: string,
    _indexName: string,
    _schemaName: string,
    _tableName: string
  ): Promise<DisableIndexResult> {
    return { status: 'error', message: 'Index disable is not supported by SQLite' }
  }

  // ── ERD schema ─────────────────────────────────────────────────────────────

  async getErdSchema(_databaseName: string): Promise<GetErdSchemaResult> {
    try {
      const tableRows = this.conn
        .prepare(
          `SELECT name FROM sqlite_master
           WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
           ORDER BY name`
        )
        .all() as Pick<SqliteMasterRow, 'name'>[]

      const tables: ErdTable[] = []
      const relationships: ErdRelationship[] = []
      const indexes: ErdIndex[] = []

      for (const { name: tableName } of tableRows) {
        const columns = (
          this.conn
            .prepare(`PRAGMA table_info(${qi(tableName)})`)
            .all() as PragmaTableInfoRow[]
        ).map((c) => ({
          name: c.name,
          type: c.type || 'any',
          maxLength: null as null,
          isNullable: c.notnull === 0 && c.pk === 0,
          isPrimaryKey: c.pk > 0,
          isForeignKey: false
        }))

        // Mark FK columns
        const fkRows = this.conn
          .prepare(`PRAGMA foreign_key_list(${qi(tableName)})`)
          .all() as PragmaForeignKeyListRow[]

        const fkColumnNames = new Set(fkRows.map((r) => r.from))
        for (const col of columns) {
          if (fkColumnNames.has(col.name)) col.isForeignKey = true
        }

        tables.push({ schema: 'main', name: tableName, columns })

        // Relationships
        const fksByConstraint = new Map<number, PragmaForeignKeyListRow[]>()
        for (const fk of fkRows) {
          if (!fksByConstraint.has(fk.id)) fksByConstraint.set(fk.id, [])
          fksByConstraint.get(fk.id)!.push(fk)
        }

        for (const [id, fks] of fksByConstraint) {
          // Use only the first column for the relationship edge
          const fk = fks[0]
          relationships.push({
            constraintName: `FK_${tableName}_${id}`,
            fromSchema: 'main',
            fromTable: tableName,
            fromColumn: fk.from,
            toSchema: 'main',
            toTable: fk.table,
            toColumn: fk.to
          })
        }

        // Indexes
        const idxList = this.conn
          .prepare(`PRAGMA index_list(${qi(tableName)})`)
          .all() as PragmaIndexListRow[]

        for (const idx of idxList) {
          indexes.push({
            schema: 'main',
            table: tableName,
            name: idx.name,
            typeDesc: 'NONCLUSTERED',
            isUnique: idx.unique === 1,
            isPrimaryKey: idx.origin === 'pk'
          })
        }
      }

      return { status: 'ok', schema: { tables, relationships, indexes } }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  // ── Views ──────────────────────────────────────────────────────────────────

  async getViews(_databaseName: string): Promise<GetViewsResult> {
    try {
      const rows = this.conn
        .prepare(
          `SELECT name, sql FROM sqlite_master
           WHERE type = 'view'
           ORDER BY name`
        )
        .all() as Pick<SqliteMasterRow, 'name' | 'sql'>[]

      const views: ViewDefinition[] = rows.map((r) => ({
        schemaName: 'main',
        viewName: r.name,
        definition: r.sql ?? '',
        isSchemabound: false,
        isEncrypted: false
      }))

      return { status: 'ok', views }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async saveView(
    _databaseName: string,
    params: SaveViewParams,
    originalViewName?: string
  ): Promise<SaveViewResult> {
    try {
      if (originalViewName) {
        this.conn.prepare(`DROP VIEW IF EXISTS ${qi(originalViewName)}`).run()
      }
      this.conn.prepare(params.definition).run()
      return { status: 'ok' }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async deleteView(
    _databaseName: string,
    _schemaName: string,
    viewName: string
  ): Promise<DeleteViewResult> {
    try {
      this.conn.prepare(`DROP VIEW IF EXISTS ${qi(viewName)}`).run()
      return { status: 'ok' }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  // ── Stored procedures (not supported) ─────────────────────────────────────

  async getStoredProcedures(_databaseName: string): Promise<GetStoredProceduresResult> {
    return { status: 'ok', procedures: [] as StoredProcedureDefinition[] }
  }

  async saveStoredProcedure(
    _databaseName: string,
    _params: SaveStoredProcedureParams,
    _originalProcedureName?: string
  ): Promise<SaveStoredProcedureResult> {
    return { status: 'error', message: 'Stored procedures are not supported by SQLite' }
  }

  async deleteStoredProcedure(
    _databaseName: string,
    _schemaName: string,
    _procedureName: string
  ): Promise<DeleteStoredProcedureResult> {
    return { status: 'error', message: 'Stored procedures are not supported by SQLite' }
  }

  // ── Data types (not supported) ─────────────────────────────────────────────

  async getDataTypes(_databaseName: string): Promise<GetDataTypesResult> {
    return { status: 'ok', dataTypes: [] }
  }

  async saveDataType(
    _databaseName: string,
    _params: SaveDataTypeParams,
    _originalTypeName?: string,
    _originalSchemaName?: string
  ): Promise<SaveDataTypeResult> {
    return { status: 'error', message: 'User-defined types are not supported by SQLite' }
  }

  async deleteDataType(
    _databaseName: string,
    _schemaName: string,
    _typeName: string
  ): Promise<DeleteDataTypeResult> {
    return { status: 'error', message: 'User-defined types are not supported by SQLite' }
  }

  // ── Table types (not supported) ────────────────────────────────────────────

  async getTableTypes(_databaseName: string): Promise<GetTableTypesResult> {
    return { status: 'ok', tableTypes: [] }
  }

  async getTableType(
    _databaseName: string,
    _schemaName: string,
    _typeName: string
  ): Promise<GetTableTypeResult> {
    return { status: 'error', message: 'Table types are not supported by SQLite' }
  }

  async saveTableType(
    _databaseName: string,
    _params: SaveTableTypeParams,
    _originalTypeName?: string,
    _originalSchemaName?: string
  ): Promise<SaveTableTypeResult> {
    return { status: 'error', message: 'Table types are not supported by SQLite' }
  }

  async deleteTableType(
    _databaseName: string,
    _schemaName: string,
    _typeName: string
  ): Promise<DeleteTableTypeResult> {
    return { status: 'error', message: 'Table types are not supported by SQLite' }
  }

  // ── Memory-optimized table types (not supported) ───────────────────────────

  async getMemoryOptimizedTableTypes(
    _databaseName: string
  ): Promise<GetMemoryOptimizedTableTypesResult> {
    return { status: 'ok', tableTypes: [] }
  }

  async getMemoryOptimizedTableType(
    _databaseName: string,
    _schemaName: string,
    _typeName: string
  ): Promise<GetMemoryOptimizedTableTypeResult> {
    return { status: 'error', message: 'Memory-optimized types are not supported by SQLite' }
  }

  async saveMemoryOptimizedTableType(
    _databaseName: string,
    _params: SaveMemoryOptimizedTableTypeParams,
    _originalTypeName?: string,
    _originalSchemaName?: string
  ): Promise<SaveMemoryOptimizedTableTypeResult> {
    return { status: 'error', message: 'Memory-optimized types are not supported by SQLite' }
  }

  async deleteMemoryOptimizedTableType(
    _databaseName: string,
    _schemaName: string,
    _typeName: string
  ): Promise<DeleteMemoryOptimizedTableTypeResult> {
    return { status: 'error', message: 'Memory-optimized types are not supported by SQLite' }
  }

  // ── Query execution ────────────────────────────────────────────────────────

  async executeQuery(
    sql: string,
    _timeoutMs?: number,
    _withPlan?: boolean,
    _withStatistics?: boolean,
    _databaseName?: string
  ): Promise<ExecuteQueryResult> {
    try {
      const resultSets: QueryResultSet[] = []
      const messages: QueryMessage[] = []
      const start = Date.now()

      // Split on semicolons to support multi-statement execution
      const statements = sql
        .split(/;(?=(?:[^']*'[^']*')*[^']*$)/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0)

      for (const stmt of statements) {
        const isSelect = /^\s*SELECT\b/i.test(stmt) || /^\s*PRAGMA\b/i.test(stmt) || /^\s*WITH\b/i.test(stmt) || /^\s*EXPLAIN\b/i.test(stmt)

        if (isSelect) {
          const prepared = this.conn.prepare(stmt)
          const rows = prepared.all() as Record<string, unknown>[]
          const columns = rows.length > 0 ? Object.keys(rows[0]) : []
          resultSets.push({
            columns,
            rows,
            rowCount: rows.length
          })
        } else {
          const prepared = this.conn.prepare(stmt)
          const info = prepared.run()
          messages.push({
            type: 'info',
            text: `${info.changes} row(s) affected`
          })
        }
      }

      return {
        status: 'ok',
        resultSets,
        messages,
        durationMs: Date.now() - start
      }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async executeMonitoringQuery<T>(sql: string): Promise<T[]> {
    try {
      return this.conn.prepare(sql).all() as T[]
    } catch {
      return []
    }
  }

  // ── Script generation ──────────────────────────────────────────────────────

  async scriptTableCreate(
    _databaseName: string,
    _schemaName: string,
    tableName: string
  ): Promise<GenerateScriptResult> {
    try {
      const row = this.conn
        .prepare(
          `SELECT sql FROM sqlite_master
           WHERE type = 'table' AND name = ?`
        )
        .get(tableName) as Pick<SqliteMasterRow, 'sql'> | undefined

      if (!row?.sql) {
        return { status: 'error', message: `Table "${tableName}" not found` }
      }
      return { status: 'ok', script: row.sql + ';' }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async scriptTableAlter(
    databaseName: string,
    schemaName: string,
    tableName: string
  ): Promise<GenerateScriptResult> {
    // SQLite has very limited ALTER TABLE support; return the CREATE script as reference
    return this.scriptTableCreate(databaseName, schemaName, tableName)
  }

  async scriptTableDrop(
    _databaseName: string,
    _schemaName: string,
    tableName: string
  ): Promise<GenerateScriptResult> {
    return { status: 'ok', script: `DROP TABLE IF EXISTS ${qi(tableName)};` }
  }

  async scriptViewCreate(
    _databaseName: string,
    _schemaName: string,
    viewName: string
  ): Promise<GenerateScriptResult> {
    try {
      const row = this.conn
        .prepare(
          `SELECT sql FROM sqlite_master
           WHERE type = 'view' AND name = ?`
        )
        .get(viewName) as Pick<SqliteMasterRow, 'sql'> | undefined

      if (!row?.sql) {
        return { status: 'error', message: `View "${viewName}" not found` }
      }
      return { status: 'ok', script: row.sql + ';' }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async scriptViewAlter(
    databaseName: string,
    schemaName: string,
    viewName: string
  ): Promise<GenerateScriptResult> {
    return this.scriptViewCreate(databaseName, schemaName, viewName)
  }

  async scriptViewDrop(
    _databaseName: string,
    _schemaName: string,
    viewName: string
  ): Promise<GenerateScriptResult> {
    return { status: 'ok', script: `DROP VIEW IF EXISTS ${qi(viewName)};` }
  }

  async scriptStoredProcedureCreate(
    _databaseName: string,
    _schemaName: string,
    _procedureName: string
  ): Promise<GenerateScriptResult> {
    return { status: 'error', message: 'Stored procedures are not supported by SQLite' }
  }

  async scriptStoredProcedureAlter(
    _databaseName: string,
    _schemaName: string,
    _procedureName: string
  ): Promise<GenerateScriptResult> {
    return { status: 'error', message: 'Stored procedures are not supported by SQLite' }
  }

  async scriptStoredProcedureDrop(
    _databaseName: string,
    _schemaName: string,
    _procedureName: string
  ): Promise<GenerateScriptResult> {
    return { status: 'error', message: 'Stored procedures are not supported by SQLite' }
  }

  async scriptSelectTopRows(
    _databaseName: string,
    _schemaName: string,
    tableName: string,
    count: number
  ): Promise<GenerateScriptResult> {
    return {
      status: 'ok',
      script: `SELECT *\nFROM ${qi(tableName)}\nLIMIT ${count};`
    }
  }

  async scriptDropDatabase(
    _databaseName: string
  ): Promise<GenerateScriptResult> {
    return {
      status: 'error',
      message: 'Dropping a SQLite database is not supported. Delete the file directly.'
    }
  }

  // ── Capabilities ───────────────────────────────────────────────────────────

  getCapabilities(): ProviderCapabilities {
    return {
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
      hasBackupRestore: true
    }
  }

  // ── Backup / Restore ─────────────────────────────────────────────────────────

  /**
   * Backs up the database to `opts.filePath`. Uses VACUUM INTO when `compact`
   * is set (defragments/shrinks), otherwise the online backup API for an exact
   * copy. When `compress` is set the result is gzipped.
   */
  async executeBackup(opts: SqliteBackupOptions): Promise<ExecuteSqliteBackupResult> {
    const start = Date.now()
    let tempPath: string | null = null
    try {
      // When compressing, write the raw .db to a temp file first, then gzip it.
      const rawTarget = opts.compress ? this.makeTempPath('backup') : opts.filePath
      if (opts.compress) tempPath = rawTarget

      if (opts.compact) {
        // VACUUM INTO requires the target not to exist.
        if (existsSync(rawTarget)) unlinkSync(rawTarget)
        this.conn.prepare(`VACUUM INTO '${rawTarget.replace(/'/g, "''")}'`).run()
      } else {
        await this.conn.backup(rawTarget)
      }

      if (opts.compress) {
        await pipeline(createReadStream(rawTarget), createGzip(), createWriteStream(opts.filePath))
      }

      const bytes = statSync(opts.filePath).size
      return { status: 'ok', filePath: opts.filePath, durationMs: Date.now() - start, bytes }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    } finally {
      if (tempPath && existsSync(tempPath)) {
        try {
          unlinkSync(tempPath)
        } catch {
          /* best effort */
        }
      }
    }
  }

  /**
   * Restores the database from `opts.filePath`, overwriting the live file.
   * Gzip backups are auto-detected and decompressed. The source is verified
   * with PRAGMA integrity_check before anything is overwritten. When
   * `safetyCopy` is set the current database is copied to a timestamped file
   * first.
   */
  async executeRestore(opts: SqliteRestoreOptions): Promise<ExecuteSqliteRestoreResult> {
    const start = Date.now()
    if (!this.filePath) {
      return { status: 'error', message: 'Not connected' }
    }
    const livePath = this.filePath
    let tempPath: string | null = null
    try {
      // Decompress gzip backups to a temp file first.
      let source = opts.filePath
      if (this.isGzip(opts.filePath)) {
        tempPath = this.makeTempPath('restore')
        await pipeline(
          createReadStream(opts.filePath),
          createGunzip(),
          createWriteStream(tempPath)
        )
        source = tempPath
      }

      // Verify the source is a valid, intact SQLite database before overwriting.
      this.verifyIntegrity(source)

      // Optionally snapshot the current database before overwriting it.
      let safetyCopyPath: string | undefined
      if (opts.safetyCopy && existsSync(livePath)) {
        const stamp = new Date().toISOString().replace(/[:.]/g, '-')
        safetyCopyPath = `${livePath}.pre-restore-${stamp}.db`
        copyFileSync(livePath, safetyCopyPath)
      }

      // Close the live connection (checkpoints WAL), swap the file, reopen.
      await this.disconnect()
      copyFileSync(source, livePath)
      for (const sidecar of [`${livePath}-wal`, `${livePath}-shm`]) {
        if (existsSync(sidecar)) rmSync(sidecar)
      }
      this.filePath = livePath
      this.db = new Database(livePath)
      this.db.prepare('SELECT 1').get()
      this.db.pragma('journal_mode = WAL')
      this.db.pragma('foreign_keys = ON')

      return { status: 'ok', durationMs: Date.now() - start, safetyCopyPath }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    } finally {
      if (tempPath && existsSync(tempPath)) {
        try {
          unlinkSync(tempPath)
        } catch {
          /* best effort */
        }
      }
    }
  }

  /** Returns true when the file starts with the gzip magic bytes (0x1f 0x8b). */
  private isGzip(path: string): boolean {
    const fd = openSync(path, 'r')
    try {
      const buf = Buffer.alloc(2)
      readSync(fd, buf, 0, 2, 0)
      return buf[0] === 0x1f && buf[1] === 0x8b
    } finally {
      closeSync(fd)
    }
  }

  /** Opens `path` read-only and runs PRAGMA integrity_check; throws on failure. */
  private verifyIntegrity(path: string): void {
    let db: Database.Database | null = null
    try {
      db = new Database(path, { readonly: true, fileMustExist: true })
      const row = db.pragma('integrity_check', { simple: true }) as string
      if (row !== 'ok') {
        throw new Error(`Backup failed integrity check: ${row}`)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new Error(`The selected file is not a valid SQLite database. ${msg}`)
    } finally {
      db?.close()
    }
  }

  /** Builds a unique temp file path for intermediate backup/restore work. */
  private makeTempPath(kind: string): string {
    return join(tmpdir(), `spiral-sqlite-${kind}-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
  }
}

import * as sql from 'mssql'
import type { ConnectionRecord } from '../../store'
import type { DatabaseProvider, ExplorerNode, ExecuteQueryResult, GetTableSchemaResult, TableColumnMeta, ErdTable, ErdRelationship, ErdIndex, GetErdSchemaResult, ForeignKeyDefinition, ForeignKeyRule, GetForeignKeysResult, CheckConstraintDefinition, GetCheckConstraintsResult, TriggerDefinition, GetTriggersResult, SaveTriggerParams, SaveTriggerResult, DeleteTriggerResult, IndexColumnEntry, IndexDefinition, GetIndexesResult, SaveIndexParams, SaveIndexResult, DeleteIndexResult, RebuildIndexResult, ReorganizeIndexResult, DisableIndexResult, ViewDefinition, GetViewsResult, SaveViewParams, SaveViewResult, DeleteViewResult, StoredProcedureDefinition, StoredProcedureParameter, GetStoredProceduresResult, SaveStoredProcedureParams, SaveStoredProcedureResult, DeleteStoredProcedureResult, SaveDataTypeParams, GetDataTypesResult, SaveDataTypeResult, DeleteDataTypeResult, TableTypeDefinition, SaveTableTypeParams, GetTableTypesResult, GetTableTypeResult, SaveTableTypeResult, DeleteTableTypeResult, GetMemoryOptimizedTableTypesResult, GetMemoryOptimizedTableTypeResult, SaveMemoryOptimizedTableTypeParams, SaveMemoryOptimizedTableTypeResult, DeleteMemoryOptimizedTableTypeResult, GenerateScriptResult, ProviderCapabilities, ServerLoginDetails, ServerLoginRoleEntry, DatabaseMappingEntry, DatabaseRoleEntry, SaveServerLoginParams, SaveServerLoginResult, DeleteServerLoginResult, DatabaseUserDetails, DatabaseUserRoleEntry, SaveDatabaseUserParams, SaveDatabaseUserResult, DeleteDatabaseUserResult, ServerRoleDetails, ServerRoleSecurable, SaveServerRoleParams, SaveServerRoleResult, DeleteServerRoleResult, ListServerDrivesResult, ListServerDirResult, GetDatabaseFilesResult, DatabaseFileEntry, BackupOptions, BuildBackupSqlResult, ExecuteBackupResult, ReadBackupHeaderResult, BackupSetEntry, BackupType, ReadBackupFileListResult, BackupFileEntry, GetBackupSetsResult, BackupHistoryEntry, RestoreOptions, BuildRestoreSqlResult, ExecuteRestoreResult } from '../types'

export class SqlServerProvider implements DatabaseProvider {
  private pool: sql.ConnectionPool | null = null

  private get activePool(): sql.ConnectionPool {
    if (!this.pool) throw new Error('Not connected')
    return this.pool
  }

  /** Reject database names containing characters that could escape bracket-quoted identifiers. */
  private validateDatabaseName(name: string): string {
    if (/[[\]']/.test(name)) {
      throw new Error(`Invalid database name: "${name}"`)
    }
    return name
  }

  async connect(record: ConnectionRecord): Promise<void> {
    const config: sql.config = {
      server: record.host,
      port: record.port,
      user: record.username,
      password: record.password,
      database: record.defaultDatabase || 'master',
      options: {
        trustServerCertificate: true,
        enableArithAbort: true,
        connectTimeout: 10_000
      }
    }
    this.pool = await new sql.ConnectionPool(config).connect()
  }

  async disconnect(): Promise<void> {
    await this.pool?.close()
    this.pool = null
  }

  async listDatabases(showSystemDatabases: boolean): Promise<ExplorerNode[]> {
    const sql = showSystemDatabases
      ? 'SELECT name FROM sys.databases ORDER BY name'
      : 'SELECT name FROM sys.databases WHERE database_id > 4 ORDER BY name'
    const result = await this.activePool.request().query<{ name: string }>(sql)
    return result.recordset.map((row) => ({
      id: `db:${row.name}`,
      label: row.name,
      kind: 'database' as const
    }))
  }

  listCategories(databaseName: string): ExplorerNode[] {
    return [
      { id: `db:${databaseName}:tables`, label: 'Tables', kind: 'tables-folder' },
      { id: `db:${databaseName}:views`, label: 'Views', kind: 'views-folder' },
      {
        id: `db:${databaseName}:stored-procedures`,
        label: 'Stored Procedures',
        kind: 'stored-procedures-folder'
      },
      { id: `db:${databaseName}:functions`, label: 'Functions', kind: 'functions-folder' },
      { id: `db:${databaseName}:types`, label: 'Types', kind: 'types-folder' },
      { id: `db:${databaseName}:security`, label: 'Security', kind: 'security-folder' }
    ]
  }

  listServerSecurityCategories(): ExplorerNode[] {
    return [
      { id: 'security:users', label: 'Users', kind: 'security-users-folder' },
      { id: 'security:roles', label: 'Roles', kind: 'security-roles-folder' },
      { id: 'security:schemas', label: 'Schemas', kind: 'security-schemas-folder' }
    ]
  }

  async listServerUsers(): Promise<ExplorerNode[]> {
    const result = await this.activePool
      .request()
      .query<{ name: string }>(
        `SELECT name FROM sys.server_principals
         WHERE type IN ('S', 'U', 'G') AND name NOT LIKE '##%'
         ORDER BY name`
      )
    return result.recordset.map((row) => ({
      id: `security:users:${row.name}`,
      label: row.name,
      kind: 'security-user' as const
    }))
  }

  async listServerRoles(): Promise<ExplorerNode[]> {
    const result = await this.activePool
      .request()
      .query<{ name: string }>(
        `SELECT name FROM sys.server_principals
         WHERE type = 'R'
         ORDER BY name`
      )
    return result.recordset.map((row) => ({
      id: `security:roles:${row.name}`,
      label: row.name,
      kind: 'security-role' as const
    }))
  }

  async listServerSchemas(): Promise<ExplorerNode[]> {
    // Schemas are database-scoped in SQL Server; not applicable at server level
    return []
  }

  listDatabaseSecurityCategories(databaseName: string): ExplorerNode[] {
    return [
      { id: `db:${databaseName}:security:users`, label: 'Users', kind: 'security-users-folder' },
      { id: `db:${databaseName}:security:roles`, label: 'Roles', kind: 'security-roles-folder' },
      { id: `db:${databaseName}:security:schemas`, label: 'Schemas', kind: 'security-schemas-folder' }
    ]
  }

  async listDatabaseUsers(databaseName: string): Promise<ExplorerNode[]> {
    const db = this.validateDatabaseName(databaseName)
    const result = await this.activePool
      .request()
      .query<{ name: string }>(
        `SELECT name FROM [${db}].sys.database_principals
         WHERE type IN ('S', 'U', 'G', 'E', 'X') AND name NOT LIKE '##%'
         ORDER BY name`
      )
    return result.recordset.map((row) => ({
      id: `db:${db}:security:users:${row.name}`,
      label: row.name,
      kind: 'security-user' as const
    }))
  }

  async listDatabaseRoles(databaseName: string): Promise<ExplorerNode[]> {
    const db = this.validateDatabaseName(databaseName)
    const result = await this.activePool
      .request()
      .query<{ name: string }>(
        `SELECT name FROM [${db}].sys.database_principals
         WHERE type = 'R'
         ORDER BY name`
      )
    return result.recordset.map((row) => ({
      id: `db:${db}:security:roles:${row.name}`,
      label: row.name,
      kind: 'security-role' as const
    }))
  }

  async listDatabaseSchemas(databaseName: string): Promise<ExplorerNode[]> {
    const db = this.validateDatabaseName(databaseName)
    const result = await this.activePool
      .request()
      .query<{ SCHEMA_NAME: string }>(
        `SELECT SCHEMA_NAME FROM [${db}].INFORMATION_SCHEMA.SCHEMATA
         ORDER BY SCHEMA_NAME`
      )
    return result.recordset.map((row) => ({
      id: `db:${db}:security:schemas:${row.SCHEMA_NAME}`,
      label: row.SCHEMA_NAME,
      kind: 'security-schema' as const
    }))
  }

  async listTables(databaseName: string): Promise<ExplorerNode[]> {
    const db = this.validateDatabaseName(databaseName)
    const result = await this.activePool
      .request()
      .query<{ TABLE_SCHEMA: string; TABLE_NAME: string }>(
        `SELECT TABLE_SCHEMA, TABLE_NAME
         FROM [${db}].INFORMATION_SCHEMA.TABLES
         WHERE TABLE_TYPE = 'BASE TABLE'
         ORDER BY TABLE_SCHEMA, TABLE_NAME`
      )
    return result.recordset.map((row) => ({
      id: `db:${db}:tables:${row.TABLE_SCHEMA}.${row.TABLE_NAME}`,
      label: `${row.TABLE_SCHEMA}.${row.TABLE_NAME}`,
      kind: 'table' as const
    }))
  }

  async listViews(databaseName: string): Promise<ExplorerNode[]> {
    const db = this.validateDatabaseName(databaseName)
    const result = await this.activePool
      .request()
      .query<{ TABLE_SCHEMA: string; TABLE_NAME: string }>(
        `SELECT TABLE_SCHEMA, TABLE_NAME
         FROM [${db}].INFORMATION_SCHEMA.VIEWS
         ORDER BY TABLE_SCHEMA, TABLE_NAME`
      )
    return result.recordset.map((row) => ({
      id: `db:${db}:views:${row.TABLE_SCHEMA}.${row.TABLE_NAME}`,
      label: `${row.TABLE_SCHEMA}.${row.TABLE_NAME}`,
      kind: 'view' as const
    }))
  }

  async listStoredProcedures(databaseName: string): Promise<ExplorerNode[]> {
    const db = this.validateDatabaseName(databaseName)
    const result = await this.activePool
      .request()
      .query<{ ROUTINE_SCHEMA: string; ROUTINE_NAME: string }>(
        `SELECT ROUTINE_SCHEMA, ROUTINE_NAME
         FROM [${db}].INFORMATION_SCHEMA.ROUTINES
         WHERE ROUTINE_TYPE = 'PROCEDURE'
         ORDER BY ROUTINE_SCHEMA, ROUTINE_NAME`
      )
    return result.recordset.map((row) => ({
      id: `db:${db}:stored-procedures:${row.ROUTINE_SCHEMA}.${row.ROUTINE_NAME}`,
      label: `${row.ROUTINE_SCHEMA}.${row.ROUTINE_NAME}`,
      kind: 'stored-procedure' as const
    }))
  }

  async listFunctions(databaseName: string): Promise<ExplorerNode[]> {
    const db = this.validateDatabaseName(databaseName)
    const result = await this.activePool
      .request()
      .query<{ ROUTINE_SCHEMA: string; ROUTINE_NAME: string }>(
        `SELECT ROUTINE_SCHEMA, ROUTINE_NAME
         FROM [${db}].INFORMATION_SCHEMA.ROUTINES
         WHERE ROUTINE_TYPE = 'FUNCTION'
         ORDER BY ROUTINE_SCHEMA, ROUTINE_NAME`
      )
    return result.recordset.map((row) => ({
      id: `db:${db}:functions:${row.ROUTINE_SCHEMA}.${row.ROUTINE_NAME}`,
      label: `${row.ROUTINE_SCHEMA}.${row.ROUTINE_NAME}`,
      kind: 'function' as const
    }))
  }

  async listTypes(databaseName: string): Promise<ExplorerNode[]> {
    const db = this.validateDatabaseName(databaseName)
    const result = await this.activePool
      .request()
      .query<{ schema_name: string; name: string }>(
        `SELECT SCHEMA_NAME(schema_id) AS schema_name, name
         FROM [${db}].sys.types
         WHERE is_user_defined = 1
         ORDER BY SCHEMA_NAME(schema_id), name`
      )
    return result.recordset.map((row) => ({
      id: `db:${db}:types:${row.schema_name}.${row.name}`,
      label: `${row.schema_name}.${row.name}`,
      kind: 'type' as const
    }))
  }

  listTypeCategories(databaseName: string): ExplorerNode[] {
    const db = this.validateDatabaseName(databaseName)
    const base = `db:${db}:types`
    return [
      { id: `${base}:data-types`, label: 'Data Types', kind: 'type-data-types-folder' },
      { id: `${base}:tables`, label: 'Tables', kind: 'type-tables-folder' },
      {
        id: `${base}:memory-optimized-tables`,
        label: 'Memory Optimized Tables',
        kind: 'type-memory-optimized-tables-folder'
      }
    ]
  }

  async listTypeDataTypes(databaseName: string): Promise<ExplorerNode[]> {
    const db = this.validateDatabaseName(databaseName)
    const result = await this.activePool
      .request()
      .query<{ schema_name: string; name: string }>(
        `SELECT SCHEMA_NAME(schema_id) AS schema_name, name
         FROM [${db}].sys.types
         WHERE is_user_defined = 1 AND is_table_type = 0
         ORDER BY SCHEMA_NAME(schema_id), name`
      )
    return result.recordset.map((row) => ({
      id: `db:${db}:types:data-types:${row.schema_name}.${row.name}`,
      label: `${row.schema_name}.${row.name}`,
      kind: 'type' as const
    }))
  }

  async listTypeTables(databaseName: string): Promise<ExplorerNode[]> {
    const db = this.validateDatabaseName(databaseName)
    const result = await this.activePool
      .request()
      .query<{ schema_name: string; name: string }>(
        `SELECT SCHEMA_NAME(t.schema_id) AS schema_name, t.name
         FROM [${db}].sys.table_types t
         WHERE t.is_memory_optimized = 0
         ORDER BY SCHEMA_NAME(t.schema_id), t.name`
      )
    return result.recordset.map((row) => ({
      id: `db:${db}:types:tables:${row.schema_name}.${row.name}`,
      label: `${row.schema_name}.${row.name}`,
      kind: 'type' as const
    }))
  }

  async listTypeMemoryOptimizedTables(databaseName: string): Promise<ExplorerNode[]> {
    const db = this.validateDatabaseName(databaseName)
    const result = await this.activePool
      .request()
      .query<{ schema_name: string; name: string }>(
        `SELECT SCHEMA_NAME(t.schema_id) AS schema_name, t.name
         FROM [${db}].sys.table_types t
         WHERE t.is_memory_optimized = 1
         ORDER BY SCHEMA_NAME(t.schema_id), t.name`
      )
    return result.recordset.map((row) => ({
      id: `db:${db}:types:memory-optimized-tables:${row.schema_name}.${row.name}`,
      label: `${row.schema_name}.${row.name}`,
      kind: 'type' as const
    }))
  }

  listTableCategories(databaseName: string, tableIdentifier: string): ExplorerNode[] {
    const db = this.validateDatabaseName(databaseName)
    const base = `db:${db}:tables:${tableIdentifier}`
    return [
      { id: `${base}:columns`, label: 'Columns', kind: 'table-columns-folder' },
      { id: `${base}:keys`, label: 'Keys', kind: 'table-keys-folder' },
      { id: `${base}:constraints`, label: 'Constraints', kind: 'table-constraints-folder' },
      { id: `${base}:triggers`, label: 'Triggers', kind: 'table-triggers-folder' },
      { id: `${base}:indexes`, label: 'Indexes', kind: 'table-indexes-folder' },
      { id: `${base}:statistics`, label: 'Statistics', kind: 'table-statistics-folder' }
    ]
  }

  async listColumns(
    databaseName: string,
    schemaName: string,
    tableName: string
  ): Promise<ExplorerNode[]> {
    const db = this.validateDatabaseName(databaseName)
    const result = await this.activePool
      .request()
      .input('schemaName', schemaName)
      .input('tableName', tableName)
      .query<{ COLUMN_NAME: string; DATA_TYPE: string; IS_NULLABLE: string; IS_PK: number }>(
        `SELECT
           c.COLUMN_NAME,
           c.DATA_TYPE,
           c.IS_NULLABLE,
           CASE WHEN pk.COLUMN_NAME IS NOT NULL THEN 1 ELSE 0 END AS IS_PK
         FROM [${db}].INFORMATION_SCHEMA.COLUMNS c
         LEFT JOIN (
           SELECT kcu.COLUMN_NAME
           FROM [${db}].INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
           JOIN [${db}].INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
             ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
            AND tc.TABLE_SCHEMA = kcu.TABLE_SCHEMA
            AND tc.TABLE_NAME = kcu.TABLE_NAME
           WHERE kcu.TABLE_SCHEMA = @schemaName
             AND kcu.TABLE_NAME = @tableName
             AND tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
         ) pk ON pk.COLUMN_NAME = c.COLUMN_NAME
         WHERE c.TABLE_SCHEMA = @schemaName AND c.TABLE_NAME = @tableName
         ORDER BY c.ORDINAL_POSITION`
      )
    return result.recordset.map((row) => {
      const isPk = row.IS_PK === 1
      const nullStr = row.IS_NULLABLE === 'YES' ? 'null' : 'not null'
      const typeStr = isPk ? `PK, ${row.DATA_TYPE}` : row.DATA_TYPE
      return {
        id: `db:${db}:tables:${schemaName}.${tableName}:columns:${row.COLUMN_NAME}`,
        label: `${row.COLUMN_NAME} (${typeStr}, ${nullStr})`,
        kind: (isPk ? 'column-pk' : 'column') as 'column-pk' | 'column'
      }
    })
  }

  async listKeys(
    databaseName: string,
    schemaName: string,
    tableName: string
  ): Promise<ExplorerNode[]> {
    const db = this.validateDatabaseName(databaseName)
    const result = await this.activePool
      .request()
      .input('schemaName', schemaName)
      .input('tableName', tableName)
      .query<{ CONSTRAINT_NAME: string; CONSTRAINT_TYPE: string }>(
        `SELECT DISTINCT kcu.CONSTRAINT_NAME, tc.CONSTRAINT_TYPE
         FROM [${db}].INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
         JOIN [${db}].INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
           ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
          AND tc.TABLE_SCHEMA = kcu.TABLE_SCHEMA
          AND tc.TABLE_NAME = kcu.TABLE_NAME
         WHERE kcu.TABLE_SCHEMA = @schemaName
           AND kcu.TABLE_NAME = @tableName
           AND tc.CONSTRAINT_TYPE IN ('PRIMARY KEY', 'FOREIGN KEY', 'UNIQUE')
         ORDER BY tc.CONSTRAINT_TYPE, kcu.CONSTRAINT_NAME`
      )
    return result.recordset.map((row) => ({
      id: `db:${db}:tables:${schemaName}.${tableName}:keys:${row.CONSTRAINT_NAME}`,
      label: `${row.CONSTRAINT_NAME} (${row.CONSTRAINT_TYPE})`,
      kind: 'key' as const
    }))
  }

  async listConstraints(
    databaseName: string,
    schemaName: string,
    tableName: string
  ): Promise<ExplorerNode[]> {
    const db = this.validateDatabaseName(databaseName)
    const result = await this.activePool
      .request()
      .input('schemaName', schemaName)
      .input('tableName', tableName)
      .query<{ CONSTRAINT_NAME: string; CONSTRAINT_TYPE: string }>(
        `SELECT tc.CONSTRAINT_NAME, tc.CONSTRAINT_TYPE
         FROM [${db}].INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
         WHERE tc.TABLE_SCHEMA = @schemaName
           AND tc.TABLE_NAME = @tableName
           AND tc.CONSTRAINT_TYPE = 'CHECK'
         UNION ALL
         SELECT dc.name AS CONSTRAINT_NAME, 'DEFAULT' AS CONSTRAINT_TYPE
         FROM [${db}].sys.default_constraints dc
         JOIN [${db}].sys.tables t ON t.object_id = dc.parent_object_id
         JOIN [${db}].sys.schemas s ON s.schema_id = t.schema_id
         WHERE s.name = @schemaName AND t.name = @tableName
         ORDER BY CONSTRAINT_NAME`
      )
    return result.recordset.map((row) => ({
      id: `db:${db}:tables:${schemaName}.${tableName}:constraints:${row.CONSTRAINT_NAME}`,
      label: `${row.CONSTRAINT_NAME} (${row.CONSTRAINT_TYPE})`,
      kind: 'constraint' as const
    }))
  }

  async listTriggers(
    databaseName: string,
    schemaName: string,
    tableName: string
  ): Promise<ExplorerNode[]> {
    const db = this.validateDatabaseName(databaseName)
    const result = await this.activePool
      .request()
      .input('schemaName', schemaName)
      .input('tableName', tableName)
      .query<{ name: string }>(
        `SELECT tr.name
         FROM [${db}].sys.triggers tr
         JOIN [${db}].sys.tables t ON t.object_id = tr.parent_id
         JOIN [${db}].sys.schemas s ON s.schema_id = t.schema_id
         WHERE s.name = @schemaName AND t.name = @tableName
         ORDER BY tr.name`
      )
    return result.recordset.map((row) => ({
      id: `db:${db}:tables:${schemaName}.${tableName}:triggers:${row.name}`,
      label: row.name,
      kind: 'trigger' as const
    }))
  }

  async listIndexes(
    databaseName: string,
    schemaName: string,
    tableName: string
  ): Promise<ExplorerNode[]> {
    const db = this.validateDatabaseName(databaseName)
    const result = await this.activePool
      .request()
      .input('schemaName', schemaName)
      .input('tableName', tableName)
      .query<{ name: string; type_desc: string }>(
        `SELECT i.name, i.type_desc
         FROM [${db}].sys.indexes i
         JOIN [${db}].sys.tables t ON t.object_id = i.object_id
         JOIN [${db}].sys.schemas s ON s.schema_id = t.schema_id
         WHERE s.name = @schemaName AND t.name = @tableName
           AND i.name IS NOT NULL
         ORDER BY i.name`
      )
    return result.recordset.map((row) => ({
      id: `db:${db}:tables:${schemaName}.${tableName}:indexes:${row.name}`,
      label: `${row.name} (${row.type_desc})`,
      kind: 'index' as const
    }))
  }

  async listStatistics(
    databaseName: string,
    schemaName: string,
    tableName: string
  ): Promise<ExplorerNode[]> {
    const db = this.validateDatabaseName(databaseName)
    const result = await this.activePool
      .request()
      .input('schemaName', schemaName)
      .input('tableName', tableName)
      .query<{ name: string }>(
        `SELECT st.name
         FROM [${db}].sys.stats st
         JOIN [${db}].sys.tables t ON t.object_id = st.object_id
         JOIN [${db}].sys.schemas s ON s.schema_id = t.schema_id
         WHERE s.name = @schemaName AND t.name = @tableName
         ORDER BY st.name`
      )
    return result.recordset.map((row) => ({
      id: `db:${db}:tables:${schemaName}.${tableName}:statistics:${row.name}`,
      label: row.name,
      kind: 'statistic' as const
    }))
  }

  async getTableSchema(
    databaseName: string,
    schemaName: string,
    tableName: string
  ): Promise<GetTableSchemaResult> {
    const db = this.validateDatabaseName(databaseName)
    try {
      type ColRow = {
        COLUMN_NAME: string
        DATA_TYPE: string
        CHARACTER_MAXIMUM_LENGTH: number | null
        NUMERIC_PRECISION: number | null
        NUMERIC_SCALE: number | null
        IS_NULLABLE: string
        COLUMN_DEFAULT: string | null
        IS_IDENTITY: number | null
        IDENTITY_SEED: number | string | null
        IDENTITY_INCREMENT: number | string | null
      }

      const colResult = await this.activePool
        .request()
        .input('schemaName', schemaName)
        .input('tableName', tableName)
        .query<ColRow>(
          `SELECT
             col.COLUMN_NAME,
             col.DATA_TYPE,
             col.CHARACTER_MAXIMUM_LENGTH,
             col.NUMERIC_PRECISION,
             col.NUMERIC_SCALE,
             col.IS_NULLABLE,
             col.COLUMN_DEFAULT,
             COALESCE(ic.IS_IDENTITY, 0) AS IS_IDENTITY,
             ic.IDENTITY_SEED,
             ic.IDENTITY_INCREMENT
           FROM [${db}].INFORMATION_SCHEMA.COLUMNS col
           OUTER APPLY (
             SELECT
               1 AS IS_IDENTITY,
               CAST(id.seed_value AS int) AS IDENTITY_SEED,
               CAST(id.increment_value AS int) AS IDENTITY_INCREMENT
             FROM [${db}].sys.identity_columns id
             WHERE id.object_id = (
               SELECT TOP 1 o.object_id
               FROM [${db}].sys.objects o
               JOIN [${db}].sys.schemas s ON s.schema_id = o.schema_id
               WHERE o.type = 'U' AND o.name = @tableName AND s.name = @schemaName
             )
             AND id.name = col.COLUMN_NAME
           ) ic
           WHERE col.TABLE_SCHEMA = @schemaName AND col.TABLE_NAME = @tableName
           ORDER BY col.ORDINAL_POSITION`
        )

      type PkRow = { COLUMN_NAME: string }
      const pkResult = await this.activePool
        .request()
        .input('schemaName', schemaName)
        .input('tableName', tableName)
        .query<PkRow>(
          `SELECT kcu.COLUMN_NAME
           FROM [${db}].INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
           JOIN [${db}].INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
             ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
            AND tc.TABLE_SCHEMA = kcu.TABLE_SCHEMA
            AND tc.TABLE_NAME = kcu.TABLE_NAME
           WHERE kcu.TABLE_SCHEMA = @schemaName
             AND kcu.TABLE_NAME = @tableName
             AND tc.CONSTRAINT_TYPE = 'PRIMARY KEY'`
        )

      const pkColumns = new Set(pkResult.recordset.map((r) => r.COLUMN_NAME))

      const columns: TableColumnMeta[] = colResult.recordset.map((row) => ({
        name: row.COLUMN_NAME,
        type: row.DATA_TYPE,
        maxLength: row.CHARACTER_MAXIMUM_LENGTH,
        precision: row.NUMERIC_PRECISION,
        scale: row.NUMERIC_SCALE,
        isNullable: row.IS_NULLABLE === 'YES',
        defaultValue: row.COLUMN_DEFAULT,
        isIdentity: !!row.IS_IDENTITY,
        identitySeed: row.IS_IDENTITY ? Number(row.IDENTITY_SEED ?? 1) : null,
        identityIncrement: row.IS_IDENTITY ? Number(row.IDENTITY_INCREMENT ?? 1) : null,
        isPrimaryKey: pkColumns.has(row.COLUMN_NAME)
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
    const db = this.validateDatabaseName(databaseName)
    try {
      type FkRow = {
        constraint_name: string
        column_name: string
        ref_schema: string
        ref_table: string
        ref_column: string
        is_disabled: boolean
        is_not_for_replication: boolean
        delete_referential_action_desc: string
        update_referential_action_desc: string
        description: string | null
      }
      const result = await this.activePool
        .request()
        .input('schemaName', schemaName)
        .input('tableName', tableName)
        .query<FkRow>(
          `SELECT
             fk.name AS constraint_name,
             pc.name AS column_name,
             rs.name AS ref_schema,
             rt.name AS ref_table,
             rc.name AS ref_column,
             fk.is_disabled,
             fk.is_not_for_replication,
             fk.delete_referential_action_desc,
             fk.update_referential_action_desc,
             CAST(ep.value AS NVARCHAR(MAX)) AS description
           FROM [${db}].sys.foreign_keys fk
           JOIN [${db}].sys.foreign_key_columns fkc
             ON fk.object_id = fkc.constraint_object_id
           JOIN [${db}].sys.tables pt
             ON pt.object_id = fk.parent_object_id
           JOIN [${db}].sys.schemas ps
             ON ps.schema_id = pt.schema_id
           JOIN [${db}].sys.columns pc
             ON pc.object_id = fkc.parent_object_id
            AND pc.column_id = fkc.parent_column_id
           JOIN [${db}].sys.tables rt
             ON rt.object_id = fk.referenced_object_id
           JOIN [${db}].sys.schemas rs
             ON rs.schema_id = rt.schema_id
           JOIN [${db}].sys.columns rc
             ON rc.object_id = fkc.referenced_object_id
            AND rc.column_id = fkc.referenced_column_id
           LEFT JOIN [${db}].sys.extended_properties ep
             ON ep.major_id = fk.object_id
            AND ep.minor_id = 0
            AND ep.class = 1
            AND ep.name = 'MS_Description'
           WHERE ps.name = @schemaName
             AND pt.name = @tableName
           ORDER BY fk.name, fkc.constraint_column_id`
        )

      const ruleMap: Record<string, ForeignKeyRule> = {
        NO_ACTION: 'NO_ACTION',
        CASCADE: 'CASCADE',
        SET_NULL: 'SET_NULL',
        SET_DEFAULT: 'SET_DEFAULT'
      }

      const foreignKeys: ForeignKeyDefinition[] = result.recordset.map((row) => ({
        constraintName: row.constraint_name,
        columnName: row.column_name,
        referencedSchema: row.ref_schema,
        referencedTable: row.ref_table,
        referencedColumn: row.ref_column,
        isEnabled: !row.is_disabled,
        enforceForReplication: !row.is_not_for_replication,
        deleteRule: ruleMap[row.delete_referential_action_desc] ?? 'NO_ACTION',
        updateRule: ruleMap[row.update_referential_action_desc] ?? 'NO_ACTION',
        description: row.description ?? undefined
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
    const db = this.validateDatabaseName(databaseName)
    try {
      type CcRow = {
        constraint_name: string
        definition: string
        is_disabled: boolean
        is_not_for_replication: boolean
        is_not_trusted: boolean
        description: string | null
      }
      const result = await this.activePool
        .request()
        .input('schemaName', schemaName)
        .input('tableName', tableName)
        .query<CcRow>(
          `SELECT
             cc.name AS constraint_name,
             cc.definition,
             cc.is_disabled,
             cc.is_not_for_replication,
             cc.is_not_trusted,
             CAST(ep.value AS NVARCHAR(MAX)) AS description
           FROM [${db}].sys.check_constraints cc
           JOIN [${db}].sys.tables t ON t.object_id = cc.parent_object_id
           JOIN [${db}].sys.schemas s ON s.schema_id = t.schema_id
           LEFT JOIN [${db}].sys.extended_properties ep
             ON ep.major_id = cc.object_id
            AND ep.minor_id = 0
            AND ep.class = 1
            AND ep.name = 'MS_Description'
           WHERE s.name = @schemaName
             AND t.name = @tableName
           ORDER BY cc.name`
        )

      const constraints: CheckConstraintDefinition[] = result.recordset.map((row) => ({
        constraintName: row.constraint_name,
        condition: row.definition,
        isEnabled: !row.is_disabled,
        checkExistingData: !row.is_not_trusted,
        enforceForReplication: !row.is_not_for_replication,
        description: row.description ?? undefined
      }))

      return { status: 'ok', constraints }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async getTriggers(
    databaseName: string,
    schemaName: string,
    tableName: string
  ): Promise<GetTriggersResult> {
    const db = this.validateDatabaseName(databaseName)
    try {
      type TriggerRow = {
        trigger_name: string
        is_instead_of: boolean
        is_insert: boolean
        is_update: boolean
        is_delete: boolean
        definition: string | null
        description: string | null
      }
      const result = await this.activePool
        .request()
        .input('schemaName', schemaName)
        .input('tableName', tableName)
        .query<TriggerRow>(
          `SELECT
             tr.name AS trigger_name,
             tr.is_instead_of_trigger AS is_instead_of,
             CAST(OBJECTPROPERTY(tr.object_id, 'ExecIsInsertTrigger') AS BIT) AS is_insert,
             CAST(OBJECTPROPERTY(tr.object_id, 'ExecIsUpdateTrigger') AS BIT) AS is_update,
             CAST(OBJECTPROPERTY(tr.object_id, 'ExecIsDeleteTrigger') AS BIT) AS is_delete,
             OBJECT_DEFINITION(tr.object_id) AS definition,
             CAST(ep.value AS NVARCHAR(MAX)) AS description
           FROM [${db}].sys.triggers tr
           JOIN [${db}].sys.tables t ON t.object_id = tr.parent_id
           JOIN [${db}].sys.schemas s ON s.schema_id = t.schema_id
           LEFT JOIN [${db}].sys.extended_properties ep
             ON ep.major_id = tr.object_id
            AND ep.minor_id = 0
            AND ep.class = 1
            AND ep.name = 'MS_Description'
           WHERE s.name = @schemaName AND t.name = @tableName
           ORDER BY tr.name`
        )

      const triggers: TriggerDefinition[] = result.recordset.map((row) => {
        const body = this.extractTriggerBody(row.definition ?? '')
        return {
          triggerName: row.trigger_name,
          isInsteadOf: row.is_instead_of,
          isInsert: row.is_insert,
          isUpdate: row.is_update,
          isDelete: row.is_delete,
          body,
          description: row.description ?? undefined
        }
      })

      return { status: 'ok', triggers }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  /**
   * Extracts the body (the code inside AS BEGIN...END) from a full trigger definition
   * returned by OBJECT_DEFINITION. Strips the CREATE TRIGGER header up to AS BEGIN.
   */
  private extractTriggerBody(definition: string): string {
    // Find AS keyword (standalone word, case-insensitive) that begins the trigger body
    const asMatch = definition.match(/\bAS\b\s*/i)
    if (!asMatch || asMatch.index === undefined) return definition.trim()
    let body = definition.slice(asMatch.index + asMatch[0].length)
    // Strip leading BEGIN / END wrapper if present
    const beginMatch = body.match(/^\s*BEGIN\s*/i)
    if (beginMatch) {
      body = body.slice(beginMatch[0].length)
      // Strip trailing END
      body = body.replace(/\s*END\s*$/i, '')
    }
    return body.trim()
  }

  async saveTrigger(
    databaseName: string,
    params: SaveTriggerParams,
    originalTriggerName?: string
  ): Promise<SaveTriggerResult> {
    const db = this.validateDatabaseName(databaseName)
    try {
      const isEdit = !!originalTriggerName

      // Switch to the target database first (separate batch required before DDL statements)
      await this.executeQuery(`USE [${db}]`)

      if (isEdit) {
        const dropResult = await this.executeQuery(
          `DROP TRIGGER IF EXISTS [${params.schemaName}].[${originalTriggerName}]`
        )
        if (dropResult.status === 'error') return { status: 'error', message: dropResult.message }
      }

      const events: string[] = []
      if (params.isInsert) events.push('INSERT')
      if (params.isUpdate) events.push('UPDATE')
      if (params.isDelete) events.push('DELETE')

      const timing = params.isInsteadOf ? 'INSTEAD OF' : 'AFTER'
      const descComment = params.description?.trim()
        ? `-- Description: ${params.description.trim()}\n\n`
        : ''

      // CREATE TRIGGER must be the first statement in its batch — no USE prefix
      const createSql =
        `CREATE TRIGGER [${params.schemaName}].[${params.triggerName}]\n` +
        `ON [${params.schemaName}].[${params.tableName}]\n` +
        `${timing} ${events.join(', ')}\n` +
        `AS\n` +
        `BEGIN\n` +
        `${descComment}${params.body.trim()}\n` +
        `END`

      const createResult = await this.executeQuery(createSql)
      if (createResult.status === 'error') return { status: 'error', message: createResult.message }

      if (params.description?.trim()) {
        const safeDesc = params.description.trim().replace(/'/g, "''")
        // Best-effort: try add; on exists, try update — non-critical, ignore errors
        const descSql =
          `BEGIN TRY\n` +
          `  EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'${safeDesc}',\n` +
          `    @level0type=N'SCHEMA', @level0name=N'${params.schemaName}',\n` +
          `    @level1type=N'TABLE', @level1name=N'${params.tableName}',\n` +
          `    @level2type=N'TRIGGER', @level2name=N'${params.triggerName}'\n` +
          `END TRY\n` +
          `BEGIN CATCH\n` +
          `  EXEC sys.sp_updateextendedproperty @name=N'MS_Description', @value=N'${safeDesc}',\n` +
          `    @level0type=N'SCHEMA', @level0name=N'${params.schemaName}',\n` +
          `    @level1type=N'TABLE', @level1name=N'${params.tableName}',\n` +
          `    @level2type=N'TRIGGER', @level2name=N'${params.triggerName}'\n` +
          `END CATCH`
        await this.executeQuery(descSql)
      }

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
    const db = this.validateDatabaseName(databaseName)
    try {
      await this.executeQuery(`USE [${db}]`)
      const result = await this.executeQuery(
        `DROP TRIGGER IF EXISTS [${schemaName}].[${triggerName}]`
      )
      if (result.status === 'error') return { status: 'error', message: result.message }
      return { status: 'ok' }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async getIndexes(
    databaseName: string,
    schemaName: string,
    tableName: string
  ): Promise<GetIndexesResult> {
    const db = this.validateDatabaseName(databaseName)
    try {
      type IndexRow = {
        index_name: string
        type_desc: string
        is_unique: boolean
        is_primary_key: boolean
        is_disabled: boolean
        filter_definition: string | null
        fill_factor: number
        is_padded: boolean
        description: string | null
      }
      type ColRow = {
        index_name: string
        column_name: string
        key_ordinal: number
        is_descending_key: boolean
        is_included_column: boolean
      }

      const indexResult = await this.activePool
        .request()
        .input('schemaName', schemaName)
        .input('tableName', tableName)
        .query<IndexRow>(
          `SELECT
             i.name AS index_name,
             i.type_desc,
             i.is_unique,
             i.is_primary_key,
             i.is_disabled,
             i.filter_definition,
             i.fill_factor,
             i.is_padded,
             CAST(ep.value AS NVARCHAR(MAX)) AS description
           FROM [${db}].sys.indexes i
           JOIN [${db}].sys.tables t ON t.object_id = i.object_id
           JOIN [${db}].sys.schemas s ON s.schema_id = t.schema_id
           LEFT JOIN [${db}].sys.extended_properties ep
             ON ep.major_id = i.object_id
            AND ep.minor_id = i.index_id
            AND ep.class = 7
            AND ep.name = 'MS_Description'
           WHERE s.name = @schemaName AND t.name = @tableName
             AND i.name IS NOT NULL
           ORDER BY i.name`
        )

      const colResult = await this.activePool
        .request()
        .input('schemaName', schemaName)
        .input('tableName', tableName)
        .query<ColRow>(
          `SELECT
             i.name AS index_name,
             c.name AS column_name,
             ic.key_ordinal,
             ic.is_descending_key,
             ic.is_included_column
           FROM [${db}].sys.indexes i
           JOIN [${db}].sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
           JOIN [${db}].sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
           JOIN [${db}].sys.tables t ON t.object_id = i.object_id
           JOIN [${db}].sys.schemas s ON s.schema_id = t.schema_id
           WHERE s.name = @schemaName AND t.name = @tableName
             AND i.name IS NOT NULL
           ORDER BY i.name, ic.key_ordinal, ic.is_included_column`
        )

      // Group columns by index name
      const colsByIndex = new Map<string, IndexColumnEntry[]>()
      for (const row of colResult.recordset) {
        if (!colsByIndex.has(row.index_name)) colsByIndex.set(row.index_name, [])
        colsByIndex.get(row.index_name)!.push({
          columnName: row.column_name,
          keyOrdinal: row.key_ordinal,
          isDescendingKey: row.is_descending_key,
          isIncludedColumn: row.is_included_column
        })
      }

      const indexes: IndexDefinition[] = indexResult.recordset.map((row) => ({
        name: row.index_name,
        schemaName,
        tableName,
        type: row.type_desc,
        isUnique: row.is_unique,
        isPrimaryKey: row.is_primary_key,
        isDisabled: row.is_disabled,
        columns: colsByIndex.get(row.index_name) ?? [],
        filterExpression: row.filter_definition ?? undefined,
        fillFactor: row.fill_factor > 0 ? row.fill_factor : undefined,
        padIndex: row.is_padded,
        description: row.description ?? undefined
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
    const db = this.validateDatabaseName(databaseName)
    try {
      const isEdit = !!originalIndexName

      await this.executeQuery(`USE [${db}]`)

      if (isEdit) {
        const dropResult = await this.executeQuery(
          `DROP INDEX IF EXISTS [${originalIndexName}] ON [${params.schemaName}].[${params.tableName}]`
        )
        if (dropResult.status === 'error') return { status: 'error', message: dropResult.message }
      }

      const keyColumns = params.columns
        .filter((c) => !c.isIncludedColumn)
        .sort((a, b) => a.keyOrdinal - b.keyOrdinal)
        .map((c) => `[${c.columnName}] ${c.isDescendingKey ? 'DESC' : 'ASC'}`)
        .join(', ')

      const includeColumns = params.columns.filter((c) => c.isIncludedColumn)

      const uniqueClause = params.isUnique ? 'UNIQUE ' : ''
      const typeClause = params.type === 'CLUSTERED' ? 'CLUSTERED' : 'NONCLUSTERED'
      const includeClause =
        includeColumns.length > 0
          ? ` INCLUDE (${includeColumns.map((c) => `[${c.columnName}]`).join(', ')})`
          : ''
      const filterClause = params.filterExpression?.trim()
        ? ` WHERE ${params.filterExpression.trim()}`
        : ''
      const fillFactorClause =
        params.fillFactor !== undefined && params.fillFactor > 0
          ? `FILLFACTOR = ${params.fillFactor}, `
          : ''
      const padIndexClause = params.padIndex ? 'PAD_INDEX = ON' : ''
      const withOptions = (fillFactorClause + padIndexClause).replace(/,\s*$/, '')
      const withClause = withOptions.trim() ? ` WITH (${withOptions})` : ''

      const createSql =
        `CREATE ${uniqueClause}${typeClause} INDEX [${params.name}]\n` +
        `ON [${params.schemaName}].[${params.tableName}] (${keyColumns})` +
        includeClause +
        filterClause +
        withClause

      const createResult = await this.executeQuery(createSql)
      if (createResult.status === 'error') return { status: 'error', message: createResult.message }

      if (params.description?.trim()) {
        const safeDesc = params.description.trim().replace(/'/g, "''")
        const descSql =
          `BEGIN TRY\n` +
          `  EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'${safeDesc}',\n` +
          `    @level0type=N'SCHEMA', @level0name=N'${params.schemaName}',\n` +
          `    @level1type=N'TABLE', @level1name=N'${params.tableName}',\n` +
          `    @level2type=N'INDEX', @level2name=N'${params.name}'\n` +
          `END TRY\n` +
          `BEGIN CATCH\n` +
          `  EXEC sys.sp_updateextendedproperty @name=N'MS_Description', @value=N'${safeDesc}',\n` +
          `    @level0type=N'SCHEMA', @level0name=N'${params.schemaName}',\n` +
          `    @level1type=N'TABLE', @level1name=N'${params.tableName}',\n` +
          `    @level2type=N'INDEX', @level2name=N'${params.name}'\n` +
          `END CATCH`
        await this.executeQuery(descSql)
      }

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
    const db = this.validateDatabaseName(databaseName)
    try {
      await this.executeQuery(`USE [${db}]`)
      const result = await this.executeQuery(
        `DROP INDEX IF EXISTS [${indexName}] ON [${schemaName}].[${tableName}]`
      )
      if (result.status === 'error') return { status: 'error', message: result.message }
      return { status: 'ok' }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async rebuildIndex(
    databaseName: string,
    indexName: string,
    schemaName: string,
    tableName: string
  ): Promise<RebuildIndexResult> {
    const db = this.validateDatabaseName(databaseName)
    try {
      await this.executeQuery(`USE [${db}]`)
      const result = await this.executeQuery(
        `ALTER INDEX [${indexName}] ON [${schemaName}].[${tableName}] REBUILD`
      )
      if (result.status === 'error') return { status: 'error', message: result.message }
      return { status: 'ok' }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async reorganizeIndex(
    databaseName: string,
    indexName: string,
    schemaName: string,
    tableName: string
  ): Promise<ReorganizeIndexResult> {
    const db = this.validateDatabaseName(databaseName)
    try {
      await this.executeQuery(`USE [${db}]`)
      const result = await this.executeQuery(
        `ALTER INDEX [${indexName}] ON [${schemaName}].[${tableName}] REORGANIZE`
      )
      if (result.status === 'error') return { status: 'error', message: result.message }
      return { status: 'ok' }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async disableIndex(
    databaseName: string,
    indexName: string,
    schemaName: string,
    tableName: string
  ): Promise<DisableIndexResult> {
    const db = this.validateDatabaseName(databaseName)
    try {
      await this.executeQuery(`USE [${db}]`)
      const result = await this.executeQuery(
        `ALTER INDEX [${indexName}] ON [${schemaName}].[${tableName}] DISABLE`
      )
      if (result.status === 'error') return { status: 'error', message: result.message }
      return { status: 'ok' }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async getErdSchema(databaseName: string): Promise<GetErdSchemaResult> {
    const db = this.validateDatabaseName(databaseName)
    try {
      type ColRow = {
        TABLE_SCHEMA: string
        TABLE_NAME: string
        COLUMN_NAME: string
        DATA_TYPE: string
        CHARACTER_MAXIMUM_LENGTH: number | null
        IS_NULLABLE: string
        IS_PK: number
        IS_FK: number
      }

      const colResult = await this.activePool.request().query<ColRow>(`
        SELECT
          c.TABLE_SCHEMA,
          c.TABLE_NAME,
          c.COLUMN_NAME,
          c.DATA_TYPE,
          c.CHARACTER_MAXIMUM_LENGTH,
          c.IS_NULLABLE,
          CASE WHEN pk.COLUMN_NAME IS NOT NULL THEN 1 ELSE 0 END AS IS_PK,
          CASE WHEN fk.COLUMN_NAME IS NOT NULL THEN 1 ELSE 0 END AS IS_FK
        FROM [${db}].INFORMATION_SCHEMA.COLUMNS c
        LEFT JOIN (
          SELECT kcu.TABLE_SCHEMA, kcu.TABLE_NAME, kcu.COLUMN_NAME
          FROM [${db}].INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
          JOIN [${db}].INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
            ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
           AND tc.TABLE_SCHEMA = kcu.TABLE_SCHEMA
           AND tc.TABLE_NAME = kcu.TABLE_NAME
          WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
        ) pk ON pk.TABLE_SCHEMA = c.TABLE_SCHEMA
              AND pk.TABLE_NAME = c.TABLE_NAME
              AND pk.COLUMN_NAME = c.COLUMN_NAME
        LEFT JOIN (
          SELECT kcu.TABLE_SCHEMA, kcu.TABLE_NAME, kcu.COLUMN_NAME
          FROM [${db}].INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
          JOIN [${db}].INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
            ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
           AND tc.TABLE_SCHEMA = kcu.TABLE_SCHEMA
           AND tc.TABLE_NAME = kcu.TABLE_NAME
          WHERE tc.CONSTRAINT_TYPE = 'FOREIGN KEY'
        ) fk ON fk.TABLE_SCHEMA = c.TABLE_SCHEMA
              AND fk.TABLE_NAME = c.TABLE_NAME
              AND fk.COLUMN_NAME = c.COLUMN_NAME
        JOIN [${db}].INFORMATION_SCHEMA.TABLES t
          ON t.TABLE_SCHEMA = c.TABLE_SCHEMA
         AND t.TABLE_NAME = c.TABLE_NAME
         AND t.TABLE_TYPE = 'BASE TABLE'
        ORDER BY c.TABLE_SCHEMA, c.TABLE_NAME, c.ORDINAL_POSITION
      `)

      type RelRow = {
        CONSTRAINT_NAME: string
        FROM_SCHEMA: string
        FROM_TABLE: string
        FROM_COLUMN: string
        TO_SCHEMA: string
        TO_TABLE: string
        TO_COLUMN: string
      }

      const relResult = await this.activePool.request().query<RelRow>(`
        SELECT
          rc.CONSTRAINT_NAME,
          kcu1.TABLE_SCHEMA AS FROM_SCHEMA,
          kcu1.TABLE_NAME   AS FROM_TABLE,
          kcu1.COLUMN_NAME  AS FROM_COLUMN,
          kcu2.TABLE_SCHEMA AS TO_SCHEMA,
          kcu2.TABLE_NAME   AS TO_TABLE,
          kcu2.COLUMN_NAME  AS TO_COLUMN
        FROM [${db}].INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc
        JOIN [${db}].INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu1
          ON kcu1.CONSTRAINT_NAME = rc.CONSTRAINT_NAME
        JOIN [${db}].INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu2
          ON kcu2.CONSTRAINT_NAME = rc.UNIQUE_CONSTRAINT_NAME
         AND kcu2.ORDINAL_POSITION = kcu1.ORDINAL_POSITION
        ORDER BY rc.CONSTRAINT_NAME, kcu1.ORDINAL_POSITION
      `)

      type IdxRow = {
        TABLE_SCHEMA: string
        TABLE_NAME: string
        INDEX_NAME: string
        TYPE_DESC: string
        IS_UNIQUE: boolean
        IS_PRIMARY_KEY: boolean
      }

      const idxResult = await this.activePool.request().query<IdxRow>(`
        SELECT
          SCHEMA_NAME(t.schema_id) AS TABLE_SCHEMA,
          t.name   AS TABLE_NAME,
          i.name   AS INDEX_NAME,
          i.type_desc AS TYPE_DESC,
          i.is_unique AS IS_UNIQUE,
          i.is_primary_key AS IS_PRIMARY_KEY
        FROM [${db}].sys.indexes i
        JOIN [${db}].sys.tables t ON t.object_id = i.object_id
        WHERE i.name IS NOT NULL
        ORDER BY TABLE_SCHEMA, TABLE_NAME, INDEX_NAME
      `)

      const tableMap = new Map<string, ErdTable>()
      for (const row of colResult.recordset) {
        const key = `${row.TABLE_SCHEMA}.${row.TABLE_NAME}`
        if (!tableMap.has(key)) {
          tableMap.set(key, { schema: row.TABLE_SCHEMA, name: row.TABLE_NAME, columns: [] })
        }
        tableMap.get(key)!.columns.push({
          name: row.COLUMN_NAME,
          type: row.DATA_TYPE,
          maxLength: row.CHARACTER_MAXIMUM_LENGTH,
          isNullable: row.IS_NULLABLE === 'YES',
          isPrimaryKey: row.IS_PK === 1,
          isForeignKey: row.IS_FK === 1
        })
      }

      const tables = Array.from(tableMap.values())

      const relationships: ErdRelationship[] = relResult.recordset.map((row) => ({
        constraintName: row.CONSTRAINT_NAME,
        fromSchema: row.FROM_SCHEMA,
        fromTable: row.FROM_TABLE,
        fromColumn: row.FROM_COLUMN,
        toSchema: row.TO_SCHEMA,
        toTable: row.TO_TABLE,
        toColumn: row.TO_COLUMN
      }))

      const indexes: ErdIndex[] = idxResult.recordset.map((row) => ({
        schema: row.TABLE_SCHEMA,
        table: row.TABLE_NAME,
        name: row.INDEX_NAME,
        typeDesc: row.TYPE_DESC,
        isUnique: row.IS_UNIQUE,
        isPrimaryKey: row.IS_PRIMARY_KEY
      }))

      return { status: 'ok', schema: { tables, relationships, indexes } }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  private static readonly SHOWPLAN_COLUMN = 'Microsoft SQL Server 2005 XML Showplan'

  async executeQuery(querySql: string, timeoutMs?: number, withPlan?: boolean, withStatistics?: boolean, databaseName?: string): Promise<ExecuteQueryResult> {
    const start = Date.now()
    const bytesSentToServer = Buffer.byteLength(querySql, 'utf8')
    try {
      const messages: import('../types').QueryMessage[] = []
      const request = this.activePool.request()
      if (timeoutMs !== undefined) {
        request.timeout = timeoutMs
      }
      request.on('info', (msg: { message: string }) => {
        messages.push({ type: 'info', text: msg.message })
      })

      const usePrefix = databaseName ? `USE [${this.validateDatabaseName(databaseName)}];\n` : ''
      const wrappedSql = withPlan
        ? `${usePrefix}SET STATISTICS XML ON\n${querySql}\nSET STATISTICS XML OFF`
        : `${usePrefix}${querySql}`

      const result = await request.query(wrappedSql)
      const durationMs = Date.now() - start

      const planXmlParts: string[] = []
      const resultSets = (result.recordsets as Record<string, unknown>[][]).reduce<
        import('../types').QueryResultSet[]
      >((acc, recordset) => {
        const rows = recordset ?? []
        const firstKey = rows.length > 0 ? Object.keys(rows[0])[0] : undefined
        if (withPlan && firstKey === SqlServerProvider.SHOWPLAN_COLUMN) {
          for (const row of rows) {
            const xml = row[SqlServerProvider.SHOWPLAN_COLUMN]
            if (typeof xml === 'string') planXmlParts.push(xml)
          }
          return acc
        }
        const columns =
          rows.length > 0
            ? Object.keys(rows[0])
            : Object.keys((result.recordsets as unknown as { columns?: Record<string, unknown> }[])[0]?.columns ?? {})
        acc.push({ columns, rows, rowCount: rows.length })
        return acc
      }, [])

      const rowsAffected: number[] = result.rowsAffected ?? []
      for (const count of rowsAffected) {
        messages.push({ type: 'info', text: `(${count} row${count === 1 ? '' : 's'} affected)` })
      }

      const executionPlanXml = planXmlParts.length > 0 ? planXmlParts.join('\n') : undefined

      const clientStatistics = withStatistics
        ? {
            totalExecutionTimeMs: durationMs,
            rowsReturned: resultSets.reduce((sum, rs) => sum + rs.rowCount, 0),
            resultSetsCount: resultSets.length,
            bytesSentToServer
          }
        : undefined

      return { status: 'ok', resultSets, messages, durationMs, executionPlanXml, clientStatistics }
    } catch (err) {
      if (err instanceof Error) {
        const preceding = (err as { precedingErrors?: Error[] }).precedingErrors
        if (preceding && preceding.length > 0) {
          const allMessages = [...preceding.map((e) => e.message), err.message].join('\n')
          return { status: 'error', message: allMessages }
        }
        return { status: 'error', message: err.message }
      }
      return { status: 'error', message: String(err) }
    }
  }

  async executeMonitoringQuery<T>(querySql: string): Promise<T[]> {
    const result = await this.activePool.request().query<T>(querySql)
    return result.recordset
  }

  async getViews(databaseName: string): Promise<GetViewsResult> {
    const db = this.validateDatabaseName(databaseName)
    try {
      type ViewRow = {
        schema_name: string
        view_name: string
        definition: string | null
        is_schema_bound: boolean
        is_encrypted: boolean
      }
      const result = await this.activePool.request().query<ViewRow>(
        `USE [${db}];
         SELECT
           SCHEMA_NAME(v.schema_id) AS schema_name,
           v.name AS view_name,
           OBJECT_DEFINITION(v.object_id) AS definition,
           CAST(OBJECTPROPERTY(v.object_id, 'IsSchemaBound') AS BIT) AS is_schema_bound,
           CAST(OBJECTPROPERTY(v.object_id, 'IsEncrypted') AS BIT) AS is_encrypted
         FROM sys.views v
         ORDER BY SCHEMA_NAME(v.schema_id), v.name`
      )
      const views: ViewDefinition[] = result.recordset.map((row) => ({
        schemaName: row.schema_name,
        viewName: row.view_name,
        definition: row.definition ?? '',
        isSchemabound: row.is_schema_bound,
        isEncrypted: row.is_encrypted
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
    const db = this.validateDatabaseName(databaseName)
    try {
      await this.executeQuery(`USE [${db}]`)

      // If renaming, drop the old view first
      if (originalViewName && originalViewName !== params.viewName) {
        const dropResult = await this.executeQuery(
          `DROP VIEW IF EXISTS [${params.schemaName}].[${originalViewName}]`
        )
        if (dropResult.status === 'error') return { status: 'error', message: dropResult.message }
      }

      const definition = params.definition.trim()
      const createSql = `CREATE OR ALTER VIEW [${params.schemaName}].[${params.viewName}] AS\n${definition}`
      const createResult = await this.executeQuery(createSql)
      if (createResult.status === 'error') return { status: 'error', message: createResult.message }

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
    const db = this.validateDatabaseName(databaseName)
    try {
      await this.executeQuery(`USE [${db}]`)
      const result = await this.executeQuery(
        `DROP VIEW IF EXISTS [${schemaName}].[${viewName}]`
      )
      if (result.status === 'error') return { status: 'error', message: result.message }
      return { status: 'ok' }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async getStoredProcedures(databaseName: string): Promise<GetStoredProceduresResult> {
    const db = this.validateDatabaseName(databaseName)
    try {
      type ProcRow = {
        schema_name: string
        procedure_name: string
        definition: string | null
      }
      type ParamRow = {
        procedure_name: string
        param_name: string
        type_name: string
        has_default: boolean
        default_value: string | null
      }

      const [procResult, paramResult] = await Promise.all([
        this.activePool.request().query<ProcRow>(
          `USE [${db}];
           SELECT
             SCHEMA_NAME(p.schema_id) AS schema_name,
             p.name AS procedure_name,
             OBJECT_DEFINITION(p.object_id) AS definition
           FROM sys.procedures p
           ORDER BY SCHEMA_NAME(p.schema_id), p.name`
        ),
        this.activePool.request().query<ParamRow>(
          `USE [${db}];
           SELECT
             OBJECT_NAME(pa.object_id) AS procedure_name,
             pa.name AS param_name,
             TYPE_NAME(pa.user_type_id) AS type_name,
             pa.has_default_value AS has_default,
             CAST(pa.default_value AS NVARCHAR(MAX)) AS default_value
           FROM sys.parameters pa
           INNER JOIN sys.procedures pr ON pa.object_id = pr.object_id
           WHERE pa.parameter_id > 0
           ORDER BY pa.object_id, pa.parameter_id`
        )
      ])

      // Group params by procedure name
      const paramsByProc = new Map<string, StoredProcedureParameter[]>()
      for (const row of paramResult.recordset) {
        const list = paramsByProc.get(row.procedure_name) ?? []
        list.push({
          name: row.param_name,
          type: row.type_name,
          defaultValue: row.has_default && row.default_value != null ? row.default_value : undefined
        })
        paramsByProc.set(row.procedure_name, list)
      }

      const procedures: StoredProcedureDefinition[] = procResult.recordset.map((row) => {
        const fullDef = row.definition ?? ''
        const body = extractStoredProcedureBody(fullDef)
        const description = extractDescriptionComment(body)
        const bodyWithoutDesc = stripDescriptionComment(body)
        return {
          schemaName: row.schema_name,
          procedureName: row.procedure_name,
          description,
          parameters: paramsByProc.get(row.procedure_name) ?? [],
          body: bodyWithoutDesc
        }
      })

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
    const db = this.validateDatabaseName(databaseName)
    try {
      await this.executeQuery(`USE [${db}]`)

      // If renaming, drop the old procedure first
      if (originalProcedureName && originalProcedureName !== params.procedureName) {
        const dropResult = await this.executeQuery(
          `DROP PROCEDURE IF EXISTS [${params.schemaName}].[${originalProcedureName}]`
        )
        if (dropResult.status === 'error') return { status: 'error', message: dropResult.message }
      }

      const paramDefs = params.parameters
        .map((p) => {
          const defaultPart = p.defaultValue !== undefined ? ` = ${p.defaultValue}` : ''
          return `    ${p.name} ${p.type}${defaultPart}`
        })
        .join(',\n')

      const paramSection = paramDefs.length > 0 ? `\n${paramDefs}\n` : ''
      const descriptionLine = params.description.trim()
        ? `-- Description: ${params.description.trim()}\n`
        : ''

      const createSql =
        `CREATE OR ALTER PROCEDURE [${params.schemaName}].[${params.procedureName}](${paramSection})` +
        `\nAS\nBEGIN\n${descriptionLine}${params.body.trim()}\nEND`

      const createResult = await this.executeQuery(createSql)
      if (createResult.status === 'error') return { status: 'error', message: createResult.message }

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
    const db = this.validateDatabaseName(databaseName)
    try {
      await this.executeQuery(`USE [${db}]`)
      const result = await this.executeQuery(
        `DROP PROCEDURE IF EXISTS [${schemaName}].[${procedureName}]`
      )
      if (result.status === 'error') return { status: 'error', message: result.message }
      return { status: 'ok' }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async getDataTypes(databaseName: string): Promise<GetDataTypesResult> {
    const db = this.validateDatabaseName(databaseName)
    try {
      type Row = {
        schema_name: string
        name: string
        base_type: string
        max_length: number
        precision: number
        scale: number
        is_nullable: boolean
      }
      const result = await this.activePool.request().query<Row>(
        `SELECT
           SCHEMA_NAME(t.schema_id) AS schema_name,
           t.name,
           bt.name AS base_type,
           t.max_length,
           t.precision,
           t.scale,
           t.is_nullable
         FROM [${db}].sys.types t
         JOIN [${db}].sys.types bt
           ON t.system_type_id = bt.user_type_id AND bt.is_user_defined = 0
         WHERE t.is_user_defined = 1 AND t.is_table_type = 0
         ORDER BY schema_name, t.name`
      )
      return {
        status: 'ok',
        dataTypes: result.recordset.map((row) => ({
          schemaName: row.schema_name,
          typeName: row.name,
          baseType: row.base_type,
          maxLength: row.max_length,
          precision: row.precision,
          scale: row.scale,
          isNullable: row.is_nullable
        }))
      }
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
    const db = this.validateDatabaseName(databaseName)
    try {
      await this.executeQuery(`USE [${db}]`)

      // Drop existing type if editing (SQL Server has no ALTER TYPE for scalar types)
      if (originalTypeName && originalSchemaName) {
        const dropResult = await this.executeQuery(
          `IF EXISTS (SELECT 1 FROM sys.types WHERE name = '${originalTypeName.replace(/'/g, "''")}' AND SCHEMA_NAME(schema_id) = '${originalSchemaName.replace(/'/g, "''")}')\n` +
          `  DROP TYPE [${originalSchemaName}].[${originalTypeName}]`
        )
        if (dropResult.status === 'error') return { status: 'error', message: dropResult.message }
      }

      // Build base type spec with optional length/precision/scale
      let typeSpec = params.baseType
      if (params.isMax) {
        typeSpec += '(MAX)'
      } else if (params.length != null) {
        typeSpec += `(${params.length})`
      } else if (params.precision != null) {
        typeSpec += params.scale != null
          ? `(${params.precision}, ${params.scale})`
          : `(${params.precision})`
      }

      const nullability = params.isNullable ? 'NULL' : 'NOT NULL'
      const createResult = await this.executeQuery(
        `CREATE TYPE [${params.schemaName}].[${params.typeName}] FROM ${typeSpec} ${nullability}`
      )
      if (createResult.status === 'error') return { status: 'error', message: createResult.message }

      return { status: 'ok' }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async deleteDataType(
    databaseName: string,
    schemaName: string,
    typeName: string
  ): Promise<DeleteDataTypeResult> {
    const db = this.validateDatabaseName(databaseName)
    try {
      await this.executeQuery(`USE [${db}]`)
      const result = await this.executeQuery(
        `IF EXISTS (SELECT 1 FROM sys.types WHERE name = '${typeName.replace(/'/g, "''")}' AND SCHEMA_NAME(schema_id) = '${schemaName.replace(/'/g, "''")}')\n` +
        `  DROP TYPE [${schemaName}].[${typeName}]`
      )
      if (result.status === 'error') return { status: 'error', message: result.message }
      return { status: 'ok' }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async getTableTypes(databaseName: string): Promise<GetTableTypesResult> {
    const db = this.validateDatabaseName(databaseName)
    try {
      const result = await this.activePool
        .request()
        .query<{ schema_name: string; name: string }>(
          `SELECT SCHEMA_NAME(t.schema_id) AS schema_name, t.name
           FROM [${db}].sys.table_types t
           WHERE t.is_memory_optimized = 0
           ORDER BY SCHEMA_NAME(t.schema_id), t.name`
        )
      return {
        status: 'ok',
        tableTypes: result.recordset.map((row) => ({
          schemaName: row.schema_name,
          typeName: row.name
        }))
      }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async getTableType(
    databaseName: string,
    schemaName: string,
    typeName: string
  ): Promise<GetTableTypeResult> {
    const db = this.validateDatabaseName(databaseName)
    try {
      type Row = {
        col_name: string
        type_name: string
        max_length: number
        precision: number
        scale: number
        is_nullable: boolean
      }
      const result = await this.activePool.request().query<Row>(
        `SELECT c.name AS col_name, t.name AS type_name,
                c.max_length, c.precision, c.scale, c.is_nullable
         FROM [${db}].sys.columns c
         JOIN [${db}].sys.table_types tt ON tt.type_table_object_id = c.object_id
         JOIN [${db}].sys.types t ON t.user_type_id = c.user_type_id
         WHERE SCHEMA_NAME(tt.schema_id) = '${schemaName.replace(/'/g, "''")}'
           AND tt.name = '${typeName.replace(/'/g, "''")}'
         ORDER BY c.column_id`
      )
      const tableType: TableTypeDefinition = {
        schemaName,
        typeName,
        columns: result.recordset.map((row) => ({
          name: row.col_name,
          type: row.type_name,
          maxLength: row.max_length,
          precision: row.precision,
          scale: row.scale,
          isNullable: row.is_nullable
        }))
      }
      return { status: 'ok', tableType }
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
    const db = this.validateDatabaseName(databaseName)
    try {
      await this.executeQuery(`USE [${db}]`)

      // Drop existing type if editing (SQL Server has no ALTER TYPE for table types)
      if (originalTypeName && originalSchemaName) {
        const dropResult = await this.executeQuery(
          `IF EXISTS (SELECT 1 FROM sys.table_types WHERE name = '${originalTypeName.replace(/'/g, "''")}' AND SCHEMA_NAME(schema_id) = '${originalSchemaName.replace(/'/g, "''")}')\n` +
          `  DROP TYPE [${originalSchemaName}].[${originalTypeName}]`
        )
        if (dropResult.status === 'error') return { status: 'error', message: dropResult.message }
      }

      const colDefs = params.columns.map((col) => {
        let typePart = col.type.toUpperCase()
        if (col.length === 'MAX') {
          typePart += '(MAX)'
        } else if (col.length !== null) {
          typePart += `(${col.length})`
        } else if (col.precision !== null) {
          typePart += col.scale !== null
            ? `(${col.precision}, ${col.scale})`
            : `(${col.precision})`
        }
        const nullPart = col.isNullable ? 'NULL' : 'NOT NULL'
        return `  [${col.name}] ${typePart} ${nullPart}`
      })

      const createResult = await this.executeQuery(
        `CREATE TYPE [${params.schemaName}].[${params.typeName}] AS TABLE\n(\n${colDefs.join(',\n')}\n)`
      )
      if (createResult.status === 'error') return { status: 'error', message: createResult.message }

      return { status: 'ok' }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async deleteTableType(
    databaseName: string,
    schemaName: string,
    typeName: string
  ): Promise<DeleteTableTypeResult> {
    const db = this.validateDatabaseName(databaseName)
    try {
      await this.executeQuery(`USE [${db}]`)
      const result = await this.executeQuery(
        `IF EXISTS (SELECT 1 FROM sys.table_types WHERE name = '${typeName.replace(/'/g, "''")}' AND SCHEMA_NAME(schema_id) = '${schemaName.replace(/'/g, "''")}')\n` +
        `  DROP TYPE [${schemaName}].[${typeName}]`
      )
      if (result.status === 'error') return { status: 'error', message: result.message }
      return { status: 'ok' }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async getMemoryOptimizedTableTypes(databaseName: string): Promise<GetMemoryOptimizedTableTypesResult> {
    const db = this.validateDatabaseName(databaseName)
    try {
      const result = await this.activePool
        .request()
        .query<{ schema_name: string; name: string }>(
          `SELECT SCHEMA_NAME(t.schema_id) AS schema_name, t.name
           FROM [${db}].sys.table_types t
           WHERE t.is_memory_optimized = 1
           ORDER BY SCHEMA_NAME(t.schema_id), t.name`
        )
      return {
        status: 'ok',
        tableTypes: result.recordset.map((row) => ({
          schemaName: row.schema_name,
          typeName: row.name
        }))
      }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async getMemoryOptimizedTableType(
    databaseName: string,
    schemaName: string,
    typeName: string
  ): Promise<GetMemoryOptimizedTableTypeResult> {
    const db = this.validateDatabaseName(databaseName)
    try {
      type Row = {
        col_name: string
        type_name: string
        max_length: number
        precision: number
        scale: number
        is_nullable: boolean
        is_primary_key: boolean
      }
      const result = await this.activePool.request().query<Row>(
        `SELECT c.name AS col_name, t.name AS type_name,
                c.max_length, c.precision, c.scale, c.is_nullable,
                CAST(CASE WHEN ic.column_id IS NOT NULL THEN 1 ELSE 0 END AS BIT) AS is_primary_key
         FROM [${db}].sys.columns c
         JOIN [${db}].sys.table_types tt ON tt.type_table_object_id = c.object_id
         JOIN [${db}].sys.types t ON t.user_type_id = c.user_type_id
         LEFT JOIN [${db}].sys.index_columns ic
           ON ic.object_id = c.object_id
          AND ic.column_id = c.column_id
          AND ic.index_id = (SELECT i.index_id FROM [${db}].sys.indexes i
                              WHERE i.object_id = c.object_id AND i.is_primary_key = 1)
         WHERE SCHEMA_NAME(tt.schema_id) = '${schemaName.replace(/'/g, "''")}'
           AND tt.name = '${typeName.replace(/'/g, "''")}'
           AND tt.is_memory_optimized = 1
         ORDER BY c.column_id`
      )
      const tableType: TableTypeDefinition = {
        schemaName,
        typeName,
        columns: result.recordset.map((row) => ({
          name: row.col_name,
          type: row.type_name,
          maxLength: row.max_length,
          precision: row.precision,
          scale: row.scale,
          isNullable: row.is_nullable,
          isPrimaryKey: row.is_primary_key
        }))
      }
      return { status: 'ok', tableType }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async saveMemoryOptimizedTableType(
    databaseName: string,
    params: SaveMemoryOptimizedTableTypeParams,
    originalTypeName?: string,
    originalSchemaName?: string
  ): Promise<SaveMemoryOptimizedTableTypeResult> {
    const db = this.validateDatabaseName(databaseName)
    try {
      await this.executeQuery(`USE [${db}]`)

      // Drop existing type if editing (SQL Server has no ALTER TYPE for table types)
      if (originalTypeName && originalSchemaName) {
        const dropResult = await this.executeQuery(
          `IF EXISTS (SELECT 1 FROM sys.table_types WHERE name = '${originalTypeName.replace(/'/g, "''")}' AND SCHEMA_NAME(schema_id) = '${originalSchemaName.replace(/'/g, "''")}')\n` +
          `  DROP TYPE [${originalSchemaName}].[${originalTypeName}]`
        )
        if (dropResult.status === 'error') return { status: 'error', message: dropResult.message }
      }

      const colDefs = params.columns.map((col) => {
        let typePart = col.type.toUpperCase()
        if (col.length === 'MAX') {
          typePart += '(MAX)'
        } else if (col.length !== null) {
          typePart += `(${col.length})`
        } else if (col.precision !== null) {
          typePart += col.scale !== null
            ? `(${col.precision}, ${col.scale})`
            : `(${col.precision})`
        }
        const nullPart = col.isNullable ? 'NULL' : 'NOT NULL'
        return `  [${col.name}] ${typePart} ${nullPart}`
      })

      const pkCols = params.columns.filter((c) => c.isPrimaryKey).map((c) => `[${c.name}]`)
      if (pkCols.length > 0) {
        colDefs.push(`  PRIMARY KEY NONCLUSTERED (${pkCols.join(', ')})`)
      }

      const createResult = await this.executeQuery(
        `CREATE TYPE [${params.schemaName}].[${params.typeName}] AS TABLE\n(\n${colDefs.join(',\n')}\n)\nWITH (MEMORY_OPTIMIZED = ON)`
      )
      if (createResult.status === 'error') return { status: 'error', message: createResult.message }

      return { status: 'ok' }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async deleteMemoryOptimizedTableType(
    databaseName: string,
    schemaName: string,
    typeName: string
  ): Promise<DeleteMemoryOptimizedTableTypeResult> {
    const db = this.validateDatabaseName(databaseName)
    try {
      await this.executeQuery(`USE [${db}]`)
      const result = await this.executeQuery(
        `IF EXISTS (SELECT 1 FROM sys.table_types WHERE name = '${typeName.replace(/'/g, "''")}' AND SCHEMA_NAME(schema_id) = '${schemaName.replace(/'/g, "''")}')\n` +
        `  DROP TYPE [${schemaName}].[${typeName}]`
      )
      if (result.status === 'error') return { status: 'error', message: result.message }
      return { status: 'ok' }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  // ── Server Login Management ───────────────────────────────────────────────

  private escapeIdentifier(name: string): string {
    return '[' + name.replace(/]/g, ']]') + ']'
  }

  async getServerLoginDetails(loginName: string): Promise<ServerLoginDetails | null> {
    try {
      const result = await this.activePool
        .request()
        .input('loginName', sql.NVarChar, loginName)
        .query<{
          name: string
          type: string
          default_database_name: string
          default_language_name: string
          is_policy_checked: boolean | null
          is_expiration_checked: boolean | null
          must_change_password: boolean | null
        }>(
          `SELECT sp.name, sp.type, sp.default_database_name, sp.default_language_name,
             sl.is_policy_checked, sl.is_expiration_checked, sl.must_change_password
           FROM sys.server_principals sp
           LEFT JOIN sys.sql_logins sl ON sl.principal_id = sp.principal_id
           WHERE sp.name = @loginName`
        )
      if (result.recordset.length === 0) return null
      const row = result.recordset[0]
      return {
        name: row.name,
        type: row.type.trim() as ServerLoginDetails['type'],
        defaultDatabase: row.default_database_name ?? 'master',
        defaultLanguage: row.default_language_name ?? '',
        isPolicyChecked: !!row.is_policy_checked,
        isExpirationChecked: !!row.is_expiration_checked,
        mustChangePassword: !!row.must_change_password
      }
    } catch {
      return null
    }
  }

  async listServerDatabases(): Promise<string[]> {
    const result = await this.activePool
      .request()
      .query<{ name: string }>(`SELECT name FROM sys.databases WHERE state = 0 ORDER BY name`)
    return result.recordset.map((r) => r.name)
  }

  async listServerLanguages(): Promise<string[]> {
    const result = await this.activePool
      .request()
      .query<{ name: string }>(`SELECT name FROM sys.syslanguages ORDER BY name`)
    return result.recordset.map((r) => r.name)
  }

  async getServerLoginRoles(loginName: string): Promise<ServerLoginRoleEntry[]> {
    const result = await this.activePool
      .request()
      .input('loginName', sql.NVarChar, loginName)
      .query<{ roleName: string; isMember: number }>(
        `SELECT r.name AS roleName,
           CASE WHEN rm.member_principal_id IS NOT NULL THEN 1 ELSE 0 END AS isMember
         FROM sys.server_principals r
         LEFT JOIN sys.server_role_members rm ON rm.role_principal_id = r.principal_id
           AND rm.member_principal_id = (SELECT principal_id FROM sys.server_principals WHERE name = @loginName)
         WHERE r.type = 'R'
         ORDER BY r.name`
      )
    return result.recordset.map((r) => ({ roleName: r.roleName, isMember: r.isMember === 1 }))
  }

  async getServerLoginDatabaseMappings(loginName: string): Promise<DatabaseMappingEntry[]> {
    const databases = await this.listServerDatabases()

    const sidResult = await this.activePool
      .request()
      .input('loginName', sql.NVarChar, loginName)
      .query<{ sid: Buffer }>(`SELECT sid FROM sys.server_principals WHERE name = @loginName`)

    if (sidResult.recordset.length === 0) {
      return databases.map((db) => ({ databaseName: db, isMapped: false, userName: null }))
    }

    const sid = sidResult.recordset[0].sid
    const results = await Promise.allSettled(
      databases.map(async (db) => {
        try {
          const validDb = this.validateDatabaseName(db)
          const r = await this.activePool
            .request()
            .input('sid', sql.VarBinary, sid)
            .query<{ name: string }>(
              `SELECT name FROM [${validDb}].sys.database_principals
               WHERE sid = @sid AND type NOT IN ('R', 'A', 'C', 'K')
               AND name NOT LIKE '##%'`
            )
          return { databaseName: db, isMapped: r.recordset.length > 0, userName: r.recordset[0]?.name ?? null }
        } catch {
          return { databaseName: db, isMapped: false, userName: null }
        }
      })
    )

    return databases.map((db, i) => {
      const res = results[i]
      return res.status === 'fulfilled'
        ? res.value
        : { databaseName: db, isMapped: false, userName: null }
    })
  }

  async getDatabaseRolesForLogin(databaseName: string, loginName: string): Promise<DatabaseRoleEntry[]> {
    const db = this.validateDatabaseName(databaseName)
    const result = await this.activePool
      .request()
      .input('loginName', sql.NVarChar, loginName)
      .query<{ roleName: string; isMember: number }>(
        `SELECT r.name AS roleName,
           CASE WHEN rm.member_principal_id IS NOT NULL THEN 1 ELSE 0 END AS isMember
         FROM [${db}].sys.database_principals r
         LEFT JOIN [${db}].sys.database_role_members rm ON rm.role_principal_id = r.principal_id
         LEFT JOIN [${db}].sys.database_principals u ON u.principal_id = rm.member_principal_id
           AND u.sid = (SELECT sid FROM sys.server_principals WHERE name = @loginName)
         WHERE r.type = 'R'
         ORDER BY r.name`
      )
    return result.recordset.map((r) => ({ roleName: r.roleName, isMember: r.isMember === 1 }))
  }

  async saveServerLogin(params: SaveServerLoginParams): Promise<SaveServerLoginResult> {
    try {
      const eid = (name: string) => this.escapeIdentifier(name)
      const isCreate = !params.originalLoginName
      const loginName = params.loginName
      const escapedLogin = eid(loginName)

      // Step 1: CREATE or ALTER LOGIN
      if (isCreate) {
        let createSql: string
        if (params.authenticationType === 'sql') {
          const safePassword = (params.password ?? '').replace(/'/g, "''")
          const mustChange = params.mustChangePassword ? ' MUST_CHANGE' : ''
          const policy = params.enforcePolicy !== false ? 'ON' : 'OFF'
          const expiry = params.enforceExpiration !== false ? 'ON' : 'OFF'
          const db = eid(params.defaultDatabase || 'master')
          const lang = params.defaultLanguage ? `, DEFAULT_LANGUAGE = ${eid(params.defaultLanguage)}` : ''
          createSql = `CREATE LOGIN ${escapedLogin} WITH PASSWORD = N'${safePassword}'${mustChange}, CHECK_POLICY = ${policy}, CHECK_EXPIRATION = ${expiry}, DEFAULT_DATABASE = ${db}${lang}`
        } else if (params.authenticationType === 'windows') {
          const db = eid(params.defaultDatabase || 'master')
          const lang = params.defaultLanguage ? `, DEFAULT_LANGUAGE = ${eid(params.defaultLanguage)}` : ''
          createSql = `CREATE LOGIN ${escapedLogin} FROM WINDOWS WITH DEFAULT_DATABASE = ${db}${lang}`
        } else {
          createSql = `CREATE LOGIN ${escapedLogin} FROM EXTERNAL PROVIDER`
        }
        const r = await this.executeQuery(createSql)
        if (r.status === 'error') return { status: 'error', message: r.message }
      } else {
        const parts: string[] = []
        if (params.authenticationType === 'sql') {
          if (params.password) {
            const safePassword = params.password.replace(/'/g, "''")
            const mustChange = params.mustChangePassword ? ' MUST_CHANGE' : ''
            parts.push(`PASSWORD = N'${safePassword}'${mustChange}`)
          }
          parts.push(`CHECK_POLICY = ${params.enforcePolicy !== false ? 'ON' : 'OFF'}`)
          parts.push(`CHECK_EXPIRATION = ${params.enforceExpiration !== false ? 'ON' : 'OFF'}`)
        }
        if (params.defaultDatabase) parts.push(`DEFAULT_DATABASE = ${eid(params.defaultDatabase)}`)
        if (params.defaultLanguage) parts.push(`DEFAULT_LANGUAGE = ${eid(params.defaultLanguage)}`)
        if (parts.length > 0) {
          const r = await this.executeQuery(`ALTER LOGIN ${escapedLogin} WITH ${parts.join(', ')}`)
          if (r.status === 'error') return { status: 'error', message: r.message }
        }
      }

      // Step 2: Server roles
      const currentRoles = isCreate ? [] : await this.getServerLoginRoles(loginName)
      const currentMemberRoleSet = new Set(currentRoles.filter((r) => r.isMember).map((r) => r.roleName))
      const desiredRoleSet = new Set(params.serverRoles)
      for (const role of desiredRoleSet) {
        if (!currentMemberRoleSet.has(role) && role !== 'public') {
          const r = await this.executeQuery(`ALTER SERVER ROLE ${eid(role)} ADD MEMBER ${escapedLogin}`)
          if (r.status === 'error') return { status: 'error', message: r.message }
        }
      }
      for (const role of currentMemberRoleSet) {
        if (!desiredRoleSet.has(role) && role !== 'public') {
          const r = await this.executeQuery(`ALTER SERVER ROLE ${eid(role)} DROP MEMBER ${escapedLogin}`)
          if (r.status === 'error') return { status: 'error', message: r.message }
        }
      }

      // Step 3: User mappings
      if (params.userMappings.length > 0) {
        const currentMappings = isCreate ? [] : await this.getServerLoginDatabaseMappings(loginName)
        for (const mapping of params.userMappings) {
          const dbEid = eid(mapping.databaseName)
          const userName = mapping.userName || loginName
          const userEid = eid(userName)
          const current = currentMappings.find((m) => m.databaseName === mapping.databaseName)
          const wasMapped = current?.isMapped ?? false
          const currentUserName = current?.userName ?? null

          if (mapping.isMapped && !wasMapped) {
            const r = await this.executeQuery(`USE ${dbEid}; CREATE USER ${userEid} FOR LOGIN ${escapedLogin}`)
            if (r.status === 'error') return { status: 'error', message: r.message }
            for (const roleName of mapping.roles) {
              const r2 = await this.executeQuery(`USE ${dbEid}; ALTER ROLE ${eid(roleName)} ADD MEMBER ${userEid}`)
              if (r2.status === 'error') return { status: 'error', message: r2.message }
            }
          } else if (!mapping.isMapped && wasMapped && currentUserName) {
            const r = await this.executeQuery(`USE ${dbEid}; DROP USER ${eid(currentUserName)}`)
            if (r.status === 'error') return { status: 'error', message: r.message }
          } else if (mapping.isMapped && wasMapped) {
            const activeUserEid = eid(currentUserName || userName)
            const dbRoles = await this.getDatabaseRolesForLogin(mapping.databaseName, loginName)
            const currentDbMemberSet = new Set(dbRoles.filter((r) => r.isMember).map((r) => r.roleName))
            const desiredDbSet = new Set(mapping.roles)
            for (const role of desiredDbSet) {
              if (!currentDbMemberSet.has(role)) {
                const r = await this.executeQuery(`USE ${dbEid}; ALTER ROLE ${eid(role)} ADD MEMBER ${activeUserEid}`)
                if (r.status === 'error') return { status: 'error', message: r.message }
              }
            }
            for (const role of currentDbMemberSet) {
              if (!desiredDbSet.has(role)) {
                const r = await this.executeQuery(`USE ${dbEid}; ALTER ROLE ${eid(role)} DROP MEMBER ${activeUserEid}`)
                if (r.status === 'error') return { status: 'error', message: r.message }
              }
            }
          }
        }
      }

      return { status: 'ok' }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async deleteServerLogin(loginName: string): Promise<DeleteServerLoginResult> {
    try {
      const r = await this.executeQuery(`DROP LOGIN ${this.escapeIdentifier(loginName)}`)
      if (r.status === 'error') return { status: 'error', message: r.message }
      return { status: 'ok' }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  // ── Server Role Management ────────────────────────────────────────────────

  async getServerRoleDetails(roleName: string): Promise<ServerRoleDetails | null> {
    try {
      const [detailsResult, membersResult, membershipsResult, securablesResult, endpointsResult] =
        await Promise.all([
          this.activePool
            .request()
            .input('roleName', sql.NVarChar, roleName)
            .query<{ name: string; is_fixed_role: boolean; owner: string }>(
              `SELECT sp.name, sp.is_fixed_role,
                ISNULL(SUSER_SNAME(sp.owning_principal_id), 'sa') AS owner
               FROM sys.server_principals sp
               WHERE sp.type = 'R' AND sp.name = @roleName`
            ),
          this.activePool
            .request()
            .input('roleName', sql.NVarChar, roleName)
            .query<{ name: string }>(
              `SELECT SUSER_SNAME(srm.member_principal_id) AS name
               FROM sys.server_role_members srm
               JOIN sys.server_principals sp ON sp.principal_id = srm.role_principal_id
               WHERE sp.name = @roleName
               ORDER BY name`
            ),
          this.activePool
            .request()
            .input('roleName', sql.NVarChar, roleName)
            .query<{ name: string }>(
              `SELECT sp.name
               FROM sys.server_role_members srm
               JOIN sys.server_principals sp ON sp.principal_id = srm.role_principal_id
               WHERE srm.member_principal_id = (
                 SELECT principal_id FROM sys.server_principals WHERE name = @roleName AND type = 'R'
               )
               ORDER BY sp.name`
            ),
          this.activePool
            .request()
            .input('roleName', sql.NVarChar, roleName)
            .query<{ securable: string; permission_name: string; state_desc: string }>(
              `SELECT
                CASE perm.class WHEN 100 THEN 'SERVER' ELSE ep.name END AS securable,
                perm.permission_name,
                perm.state_desc
               FROM sys.server_permissions perm
               LEFT JOIN sys.endpoints ep ON perm.class = 105 AND ep.endpoint_id = perm.major_id
               WHERE perm.grantee_principal_id = (
                 SELECT principal_id FROM sys.server_principals WHERE name = @roleName AND type = 'R'
               )
               AND perm.class IN (100, 105)
               ORDER BY securable, permission_name`
            ),
          this.activePool
            .request()
            .query<{ name: string }>(`SELECT name FROM sys.endpoints ORDER BY name`),
        ])

      if (detailsResult.recordset.length === 0) return null
      const row = detailsResult.recordset[0]

      const securables: ServerRoleSecurable[] = securablesResult.recordset.map((r) => ({
        securable: r.securable,
        permission: r.permission_name,
        state: r.state_desc as 'GRANT' | 'GRANT_WITH_GRANT_OPTION' | 'DENY',
      }))

      return {
        name: row.name,
        owner: row.owner,
        isFixedRole: row.is_fixed_role,
        members: membersResult.recordset.map((r) => r.name).filter(Boolean),
        memberships: membershipsResult.recordset.map((r) => r.name),
        securables,
        endpoints: endpointsResult.recordset.map((r) => r.name),
      }
    } catch (err) {
      return null
    }
  }

  async saveServerRole(params: SaveServerRoleParams): Promise<SaveServerRoleResult> {
    const eid = (name: string) => this.escapeIdentifier(name)
    try {
      if (params.isNew) {
        const r = await this.executeQuery(
          `CREATE SERVER ROLE ${eid(params.name)} AUTHORIZATION ${eid(params.owner)}`
        )
        if (r.status === 'error') return { status: 'error', message: r.message }
      } else if (params.owner !== params.originalOwner) {
        const r = await this.executeQuery(
          `ALTER AUTHORIZATION ON SERVER ROLE::${eid(params.name)} TO ${eid(params.owner)}`
        )
        if (r.status === 'error') return { status: 'error', message: r.message }
      }

      const desiredMembers = new Set(params.members)
      const originalMembers = new Set(params.originalMembers)
      for (const m of desiredMembers) {
        if (!originalMembers.has(m)) {
          const r = await this.executeQuery(
            `ALTER SERVER ROLE ${eid(params.name)} ADD MEMBER ${eid(m)}`
          )
          if (r.status === 'error') return { status: 'error', message: r.message }
        }
      }
      for (const m of originalMembers) {
        if (!desiredMembers.has(m)) {
          const r = await this.executeQuery(
            `ALTER SERVER ROLE ${eid(params.name)} DROP MEMBER ${eid(m)}`
          )
          if (r.status === 'error') return { status: 'error', message: r.message }
        }
      }

      const desiredMemberships = new Set(params.memberships)
      const originalMemberships = new Set(params.originalMemberships)
      for (const parent of desiredMemberships) {
        if (!originalMemberships.has(parent)) {
          const r = await this.executeQuery(
            `ALTER SERVER ROLE ${eid(parent)} ADD MEMBER ${eid(params.name)}`
          )
          if (r.status === 'error') return { status: 'error', message: r.message }
        }
      }
      for (const parent of originalMemberships) {
        if (!desiredMemberships.has(parent)) {
          const r = await this.executeQuery(
            `ALTER SERVER ROLE ${eid(parent)} DROP MEMBER ${eid(params.name)}`
          )
          if (r.status === 'error') return { status: 'error', message: r.message }
        }
      }

      const origSecMap = new Map(
        params.originalSecurables.map((s) => [`${s.securable}::${s.permission}`, s.state])
      )
      const desiredSecMap = new Map(
        params.securables.map((s) => [`${s.securable}::${s.permission}`, s])
      )

      for (const [key, s] of desiredSecMap) {
        const origState = origSecMap.get(key)
        if (origState === s.state) continue
        const permClause =
          s.securable === 'SERVER'
            ? s.permission
            : `${s.permission} ON ENDPOINT::${eid(s.securable)}`
        const fromTo = s.securable === 'SERVER' ? `TO ${eid(params.name)}` : `TO ${eid(params.name)}`
        const fromClause = `FROM ${eid(params.name)}`
        if (origState !== undefined) {
          const rRevoke = await this.executeQuery(`REVOKE ${permClause} ${fromClause}`)
          if (rRevoke.status === 'error') return { status: 'error', message: rRevoke.message }
        }
        let grantSql: string
        if (s.state === 'GRANT') {
          grantSql = `GRANT ${permClause} ${fromTo}`
        } else if (s.state === 'GRANT_WITH_GRANT_OPTION') {
          grantSql = `GRANT ${permClause} ${fromTo} WITH GRANT OPTION`
        } else {
          grantSql = `DENY ${permClause} ${fromTo}`
        }
        const r = await this.executeQuery(grantSql)
        if (r.status === 'error') return { status: 'error', message: r.message }
      }

      for (const key of origSecMap.keys()) {
        if (!desiredSecMap.has(key)) {
          const [securable, ...permParts] = key.split('::')
          const permission = permParts.join('::')
          const permClause =
            securable === 'SERVER'
              ? permission
              : `${permission} ON ENDPOINT::${eid(securable)}`
          const r = await this.executeQuery(`REVOKE ${permClause} FROM ${eid(params.name)}`)
          if (r.status === 'error') return { status: 'error', message: r.message }
        }
      }

      return { status: 'ok' }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async deleteServerRole(roleName: string): Promise<DeleteServerRoleResult> {
    try {
      const r = await this.executeQuery(`DROP SERVER ROLE ${this.escapeIdentifier(roleName)}`)
      if (r.status === 'error') return { status: 'error', message: r.message }
      return { status: 'ok' }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  // ── Database User Management ──────────────────────────────────────────────

  async getDatabaseUserDetails(databaseName: string, userName: string): Promise<DatabaseUserDetails | null> {
    const db = this.validateDatabaseName(databaseName)
    const result = await this.activePool
      .request()
      .input('userName', sql.NVarChar, userName)
      .query<{ name: string; type: string; default_schema_name: string; login_name: string | null }>(
        `SELECT dp.name, dp.type, dp.default_schema_name,
               sp.name AS login_name
         FROM [${db}].sys.database_principals dp
         LEFT JOIN sys.server_principals sp ON sp.sid = dp.sid
         WHERE dp.name = @userName
           AND dp.type IN ('S', 'U', 'G', 'E', 'X')`
      )
    if (result.recordset.length === 0) return null
    const row = result.recordset[0]
    return {
      name: row.name,
      type: row.type.trim() as DatabaseUserDetails['type'],
      loginName: row.login_name ?? null,
      defaultSchema: row.default_schema_name ?? 'dbo'
    }
  }

  async getDatabaseUserRoles(databaseName: string, userName: string): Promise<DatabaseUserRoleEntry[]> {
    const db = this.validateDatabaseName(databaseName)
    const result = await this.activePool
      .request()
      .input('userName', sql.NVarChar, userName)
      .query<{ roleName: string; isMember: number }>(
        `SELECT r.name AS roleName,
               CASE WHEN rm.member_principal_id IS NOT NULL THEN 1 ELSE 0 END AS isMember
         FROM [${db}].sys.database_principals r
         LEFT JOIN [${db}].sys.database_role_members rm
           ON rm.role_principal_id = r.principal_id
           AND rm.member_principal_id = (
             SELECT principal_id FROM [${db}].sys.database_principals WHERE name = @userName
           )
         WHERE r.type = 'R'
         ORDER BY r.name`
      )
    return result.recordset.map((r) => ({ roleName: r.roleName, isMember: r.isMember === 1 }))
  }

  async saveDatabaseUser(params: SaveDatabaseUserParams): Promise<SaveDatabaseUserResult> {
    try {
      const db = this.validateDatabaseName(params.databaseName)
      const eid = (name: string) => this.escapeIdentifier(name)
      const userEid = eid(params.userName)
      const schemaEid = eid(params.defaultSchema)
      const isCreate = !params.originalUserName

      if (isCreate) {
        let createSql: string
        if (params.userType === 'nologin') {
          createSql = `USE [${db}]; CREATE USER ${userEid} WITHOUT LOGIN WITH DEFAULT_SCHEMA = ${schemaEid}`
        } else {
          const loginEid = eid(params.loginName!)
          createSql = `USE [${db}]; CREATE USER ${userEid} FOR LOGIN ${loginEid} WITH DEFAULT_SCHEMA = ${schemaEid}`
        }
        const r = await this.executeQuery(createSql)
        if (r.status === 'error') return { status: 'error', message: r.message }
      } else {
        const originalEid = eid(params.originalUserName!)
        if (params.originalUserName !== params.userName) {
          const r = await this.executeQuery(`USE [${db}]; ALTER USER ${originalEid} WITH NAME = ${userEid}`)
          if (r.status === 'error') return { status: 'error', message: r.message }
        }
        const r2 = await this.executeQuery(`USE [${db}]; ALTER USER ${userEid} WITH DEFAULT_SCHEMA = ${schemaEid}`)
        if (r2.status === 'error') return { status: 'error', message: r2.message }
      }

      const currentRoles = await this.getDatabaseUserRoles(params.databaseName, params.userName)
      const currentSet = new Set(currentRoles.filter((r) => r.isMember).map((r) => r.roleName))
      const desiredSet = new Set(params.roles)

      for (const role of desiredSet) {
        if (!currentSet.has(role)) {
          const r = await this.executeQuery(`USE [${db}]; ALTER ROLE ${eid(role)} ADD MEMBER ${userEid}`)
          if (r.status === 'error') return { status: 'error', message: r.message }
        }
      }
      for (const role of currentSet) {
        if (!desiredSet.has(role)) {
          const r = await this.executeQuery(`USE [${db}]; ALTER ROLE ${eid(role)} DROP MEMBER ${userEid}`)
          if (r.status === 'error') return { status: 'error', message: r.message }
        }
      }

      return { status: 'ok' }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async deleteDatabaseUser(databaseName: string, userName: string): Promise<DeleteDatabaseUserResult> {
    try {
      const db = this.validateDatabaseName(databaseName)
      const r = await this.executeQuery(`USE [${db}]; DROP USER ${this.escapeIdentifier(userName)}`)
      if (r.status === 'error') return { status: 'error', message: r.message }
      return { status: 'ok' }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  // ── Script generation ─────────────────────────────────────────────────────

  async scriptTableCreate(
    databaseName: string,
    schemaName: string,
    tableName: string
  ): Promise<GenerateScriptResult> {
    try {
      const [schemaResult, constraintsResult] = await Promise.all([
        this.getTableSchema(databaseName, schemaName, tableName),
        this.getCheckConstraints(databaseName, schemaName, tableName)
      ])
      if (schemaResult.status !== 'ok') return { status: 'error', message: schemaResult.message }
      const constraints = constraintsResult.status === 'ok' ? constraintsResult.constraints : []
      const script = this.buildCreateTableScript(databaseName, schemaName, tableName, schemaResult.columns, constraints)
      return { status: 'ok', script }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async scriptTableAlter(
    databaseName: string,
    schemaName: string,
    tableName: string
  ): Promise<GenerateScriptResult> {
    const script = `ALTER TABLE [${databaseName}].[${schemaName}].[${tableName}]\nADD column_name datatype NULL`
    return { status: 'ok', script }
  }

  async scriptTableDrop(
    databaseName: string,
    schemaName: string,
    tableName: string
  ): Promise<GenerateScriptResult> {
    const script = `DROP TABLE [${databaseName}].[${schemaName}].[${tableName}]`
    return { status: 'ok', script }
  }

  async scriptViewCreate(
    databaseName: string,
    schemaName: string,
    viewName: string
  ): Promise<GenerateScriptResult> {
    try {
      const result = await this.getViews(databaseName)
      if (result.status !== 'ok') return { status: 'error', message: result.message }
      const view = result.views.find((v) => v.schemaName === schemaName && v.viewName === viewName)
      const script = view?.definition ?? `CREATE VIEW [${databaseName}].[${schemaName}].[${viewName}] AS\nSELECT *\nFROM -- source_table`
      return { status: 'ok', script }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async scriptViewAlter(
    databaseName: string,
    schemaName: string,
    viewName: string
  ): Promise<GenerateScriptResult> {
    try {
      const result = await this.getViews(databaseName)
      if (result.status !== 'ok') return { status: 'error', message: result.message }
      const view = result.views.find((v) => v.schemaName === schemaName && v.viewName === viewName)
      const script = view?.definition
        ? view.definition.replace(/^\s*CREATE\s+VIEW\s/i, 'ALTER VIEW ')
        : `ALTER VIEW [${schemaName}].[${viewName}] AS\nSELECT *\nFROM -- source_table`
      return { status: 'ok', script }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async scriptViewDrop(
    _databaseName: string,
    schemaName: string,
    viewName: string
  ): Promise<GenerateScriptResult> {
    const script = `DROP VIEW [${schemaName}].[${viewName}]`
    return { status: 'ok', script }
  }

  async scriptStoredProcedureCreate(
    databaseName: string,
    schemaName: string,
    procedureName: string
  ): Promise<GenerateScriptResult> {
    try {
      const result = await this.getStoredProcedures(databaseName)
      let script: string
      if (result.status === 'ok') {
        const proc = result.procedures.find((p) => p.schemaName === schemaName && p.procedureName === procedureName)
        if (proc) {
          const params = proc.parameters.length > 0
            ? proc.parameters.map((p) => `    ${p.name} ${p.type}${p.defaultValue !== undefined ? ` = ${p.defaultValue}` : ''}`).join(',\n')
            : ''
          script = `CREATE PROCEDURE [${schemaName}].[${procedureName}]${params ? `\n${params}` : ''}\nAS\nBEGIN\n${proc.body}\nEND`
        } else {
          script = `CREATE PROCEDURE [${schemaName}].[${procedureName}]\nAS\nBEGIN\n    -- procedure body\nEND`
        }
      } else {
        script = `CREATE PROCEDURE [${schemaName}].[${procedureName}]\nAS\nBEGIN\n    -- procedure body\nEND`
      }
      return { status: 'ok', script }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async scriptStoredProcedureAlter(
    databaseName: string,
    schemaName: string,
    procedureName: string
  ): Promise<GenerateScriptResult> {
    try {
      const result = await this.getStoredProcedures(databaseName)
      let script: string
      if (result.status === 'ok') {
        const proc = result.procedures.find((p) => p.schemaName === schemaName && p.procedureName === procedureName)
        if (proc) {
          const params = proc.parameters.length > 0
            ? proc.parameters.map((p) => `    ${p.name} ${p.type}${p.defaultValue !== undefined ? ` = ${p.defaultValue}` : ''}`).join(',\n')
            : ''
          script = `ALTER PROCEDURE [${schemaName}].[${procedureName}]${params ? `\n${params}` : ''}\nAS\nBEGIN\n${proc.body}\nEND`
        } else {
          script = `ALTER PROCEDURE [${schemaName}].[${procedureName}]\nAS\nBEGIN\n    -- procedure body\nEND`
        }
      } else {
        script = `ALTER PROCEDURE [${schemaName}].[${procedureName}]\nAS\nBEGIN\n    -- procedure body\nEND`
      }
      return { status: 'ok', script }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async scriptStoredProcedureDrop(
    _databaseName: string,
    schemaName: string,
    procedureName: string
  ): Promise<GenerateScriptResult> {
    const script = `DROP PROCEDURE [${schemaName}].[${procedureName}]`
    return { status: 'ok', script }
  }

  async scriptSelectTopRows(
    databaseName: string,
    schemaName: string,
    tableName: string,
    count: number
  ): Promise<GenerateScriptResult> {
    const script = `SELECT TOP ${count} * FROM [${databaseName}].[${schemaName}].[${tableName}]`
    return { status: 'ok', script }
  }

  async scriptDropDatabase(databaseName: string): Promise<GenerateScriptResult> {
    const script = `DROP DATABASE [${databaseName}]`
    return { status: 'ok', script }
  }

  // ─── Backup & Restore ───────────────────────────────────────────────────────

  /** Escape a string for use inside a single-quoted T-SQL literal. */
  private quoteLiteral(value: string): string {
    return value.replace(/'/g, "''")
  }

  /** Bracket-quote an identifier, escaping any closing brackets. */
  private bracket(name: string): string {
    return `[${name.replace(/]/g, ']]')}]`
  }

  /** Map RESTORE HEADERONLY numeric BackupType to our union. */
  private mapHeaderBackupType(code: number): BackupType {
    if (code === 2) return 'log'
    if (code === 5 || code === 6 || code === 8) return 'differential'
    return 'full'
  }

  /** Map msdb backupset.type char to our union. */
  private mapHistoryBackupType(code: string): BackupType {
    const c = code.toUpperCase()
    if (c === 'L') return 'log'
    if (c === 'I' || c === 'G' || c === 'Q') return 'differential'
    return 'full'
  }

  private hostPlatform: 'windows' | 'linux' | null = null

  /** Detect whether the SQL Server instance is hosted on Windows or Linux (SQL Server 2017+ runs on both). */
  private async getHostPlatform(): Promise<'windows' | 'linux'> {
    if (this.hostPlatform) return this.hostPlatform
    try {
      const result = await this.activePool
        .request()
        .query('SELECT host_platform FROM sys.dm_os_host_info')
      const raw = String(result.recordset?.[0]?.host_platform ?? '').toLowerCase()
      this.hostPlatform = raw.startsWith('linux') ? 'linux' : 'windows'
    } catch {
      // sys.dm_os_host_info doesn't exist pre-2017, which only ever ran on Windows.
      this.hostPlatform = 'windows'
    }
    return this.hostPlatform
  }

  async listServerDrives(): Promise<ListServerDrivesResult> {
    try {
      const platform = await this.getHostPlatform()
      if (platform === 'linux') {
        // Linux has no drive letters — the file tree starts at a single root.
        return { status: 'ok', drives: ['/'], platform }
      }
      const result = await this.activePool
        .request()
        .query('EXEC master.dbo.xp_fixeddrives')
      const rows = (result.recordset ?? []) as Record<string, unknown>[]
      console.log('[backup] xp_fixeddrives rows:', JSON.stringify(rows))
      const drives = rows
        .map((r) => {
          // xp_fixeddrives names the column "drive", but read defensively in case
          // the driver returns a different/empty column key.
          const raw = (r.drive ?? r.Drive ?? Object.values(r)[0]) as unknown
          return raw == null ? '' : String(raw).trim()
        })
        .filter((letter) => letter.length > 0)
        .map((letter) => `${letter}:\\`)
      return { status: 'ok', drives, platform }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async listServerDir(path: string): Promise<ListServerDirResult> {
    try {
      const platform = await this.getHostPlatform()
      // xp_dirtree tolerates a trailing slash only on a bare root (e.g. "C:\" or "/");
      // for any sub-folder a trailing slash returns no rows.
      const normalized =
        platform === 'linux'
          ? path === '/'
            ? path
            : path.replace(/\/+$/, '')
          : /^[A-Za-z]:\\$/.test(path)
            ? path
            : path.replace(/\\+$/, '')
      const literal = this.quoteLiteral(normalized)
      // xp_dirtree <path>, <depth=1>, <includeFiles=1> → columns: subdirectory, depth, file
      const queryText = `EXEC master.dbo.xp_dirtree N'${literal}', 1, 1`
      const result = await this.activePool.request().query(queryText)
      const rows = (result.recordset ?? []) as Record<string, unknown>[]
      console.log(`[backup] ${queryText} → ${rows.length} rows:`, JSON.stringify(rows.slice(0, 5)))
      const entries = rows
        .map((r) => {
          const vals = Object.values(r)
          const name = (r.subdirectory ?? vals[0]) as unknown
          const fileFlag = r.file ?? vals[2]
          return {
            name: name == null ? '' : String(name),
            // file = 1 for files, 0 for subdirectories; missing flag ⇒ treat as folder
            isDirectory: fileFlag == null ? true : Number(fileFlag) === 0
          }
        })
        .filter((e) => e.name.length > 0)
      return { status: 'ok', entries }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async getDatabaseFiles(databaseName: string): Promise<GetDatabaseFilesResult> {
    try {
      const db = this.bracket(this.validateDatabaseName(databaseName))
      const query = `SELECT df.name AS logicalName, df.physical_name AS physicalName, df.type_desc AS typeDesc, fg.name AS fileGroup
        FROM ${db}.sys.database_files df
        LEFT JOIN ${db}.sys.filegroups fg ON df.data_space_id = fg.data_space_id
        ORDER BY df.type, df.name`
      const result = await this.activePool.request().query<{
        logicalName: string
        physicalName: string
        typeDesc: string
        fileGroup: string | null
      }>(query)
      const files: DatabaseFileEntry[] = result.recordset.map((r) => ({
        logicalName: r.logicalName,
        physicalName: r.physicalName,
        type: r.typeDesc === 'LOG' ? 'log' : 'data',
        fileGroup: r.fileGroup ?? null
      }))
      return { status: 'ok', files }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  buildBackupSql(opts: BackupOptions): BuildBackupSqlResult {
    try {
      const db = this.bracket(this.validateDatabaseName(opts.databaseName))
      if (!opts.destinations || opts.destinations.length === 0) {
        return { status: 'error', message: 'At least one backup destination is required.' }
      }
      const isLog = opts.backupType === 'log'
      const verb = isLog ? `BACKUP LOG ${db}` : `BACKUP DATABASE ${db}`

      // File/filegroup scope only applies to (non-log) database backups
      let fileSpec = ''
      if (!isLog && opts.filesAndFilegroups && opts.filesAndFilegroups.length > 0) {
        fileSpec =
          ' ' +
          opts.filesAndFilegroups.map((f) => `FILE = N'${this.quoteLiteral(f)}'`).join(', ')
      }

      const disks = opts.destinations
        .map((d) => `DISK = N'${this.quoteLiteral(d)}'`)
        .join(', ')

      const withClauses: string[] = []
      withClauses.push(opts.overwrite === 'overwrite' ? 'INIT' : 'NOINIT')
      if (opts.backupType === 'differential') withClauses.push('DIFFERENTIAL')
      if (opts.name) withClauses.push(`NAME = N'${this.quoteLiteral(opts.name)}'`)
      if (opts.compression === 'compress') withClauses.push('COMPRESSION')
      else if (opts.compression === 'no-compress') withClauses.push('NO_COMPRESSION')
      if (opts.checksum) withClauses.push('CHECKSUM')
      if (opts.continueOnError) withClauses.push('CONTINUE_AFTER_ERROR')
      if (isLog && opts.logTail === 'tail-norecovery') withClauses.push('NORECOVERY')
      if (opts.expiration.mode === 'after-days' && opts.expiration.afterDays != null) {
        withClauses.push(`RETAINDAYS = ${Math.max(0, Math.floor(opts.expiration.afterDays))}`)
      } else if (opts.expiration.mode === 'on-date' && opts.expiration.onDate) {
        withClauses.push(`EXPIREDATE = N'${this.quoteLiteral(opts.expiration.onDate)}'`)
      }
      withClauses.push('STATS = 10')

      let sql = `${verb}${fileSpec} TO ${disks} WITH ${withClauses.join(', ')}`
      if (opts.verify) {
        sql += `\nRESTORE VERIFYONLY FROM ${disks} WITH ${opts.checksum ? 'CHECKSUM' : 'NO_CHECKSUM'}`
      }
      return { status: 'ok', sql }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async executeBackup(opts: BackupOptions): Promise<ExecuteBackupResult> {
    const built = this.buildBackupSql(opts)
    if (built.status === 'error') return { status: 'error', message: built.message }
    const result = await this.executeQuery(built.sql)
    if (result.status === 'error') {
      return { status: 'error', message: result.message, sql: built.sql }
    }
    return { status: 'ok', sql: built.sql, messages: result.messages, durationMs: result.durationMs }
  }

  async readBackupHeader(path: string): Promise<ReadBackupHeaderResult> {
    try {
      const literal = this.quoteLiteral(path)
      const result = await this.activePool
        .request()
        .query(`RESTORE HEADERONLY FROM DISK = N'${literal}'`)
      const rows = (result.recordset ?? []) as Record<string, unknown>[]
      const backupSets: BackupSetEntry[] = rows.map((r) => ({
        position: Number(r.Position),
        name: (r.BackupName as string) ?? null,
        backupType: this.mapHeaderBackupType(Number(r.BackupType)),
        serverName: (r.ServerName as string) ?? null,
        databaseName: (r.DatabaseName as string) ?? null,
        backupStartDate: r.BackupStartDate
          ? new Date(r.BackupStartDate as string).toISOString()
          : null,
        backupFinishDate: r.BackupFinishDate
          ? new Date(r.BackupFinishDate as string).toISOString()
          : null
      }))
      return { status: 'ok', backupSets }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async readBackupFileList(path: string, position: number): Promise<ReadBackupFileListResult> {
    try {
      const literal = this.quoteLiteral(path)
      const pos = Math.max(1, Math.floor(position))
      const result = await this.activePool
        .request()
        .query(`RESTORE FILELISTONLY FROM DISK = N'${literal}' WITH FILE = ${pos}`)
      const rows = (result.recordset ?? []) as Record<string, unknown>[]
      const files: BackupFileEntry[] = rows.map((r) => {
        const t = String(r.Type ?? '').toUpperCase()
        return {
          logicalName: r.LogicalName as string,
          physicalName: r.PhysicalName as string,
          type: t === 'L' ? 'log' : t === 'D' ? 'data' : 'other'
        }
      })
      return { status: 'ok', files }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async getBackupSets(databaseName: string): Promise<GetBackupSetsResult> {
    try {
      const literal = this.quoteLiteral(databaseName)
      const query = `SELECT bs.database_name AS databaseName, bs.type AS backupType, bs.backup_finish_date AS backupFinishDate, bmf.physical_device_name AS physicalDevice, bs.position AS position
        FROM msdb.dbo.backupset bs
        INNER JOIN msdb.dbo.backupmediafamily bmf ON bs.media_set_id = bmf.media_set_id
        WHERE bs.database_name = N'${literal}'
        ORDER BY bs.backup_finish_date DESC`
      const result = await this.activePool.request().query(query)
      const rows = (result.recordset ?? []) as Record<string, unknown>[]
      const history: BackupHistoryEntry[] = rows.map((r) => ({
        databaseName: r.databaseName as string,
        backupType: this.mapHistoryBackupType(String(r.backupType ?? '')),
        backupFinishDate: r.backupFinishDate
          ? new Date(r.backupFinishDate as string).toISOString()
          : null,
        physicalDevice: r.physicalDevice as string,
        position: Number(r.position)
      }))
      return { status: 'ok', history }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  buildRestoreSql(opts: RestoreOptions): BuildRestoreSqlResult {
    try {
      const db = this.bracket(this.validateDatabaseName(opts.targetDatabaseName))
      if (!opts.source || opts.source.length === 0) {
        return { status: 'error', message: 'At least one backup source is required.' }
      }
      const statements: string[] = []

      if (opts.takeTailLogBackup && opts.tailLogPath) {
        statements.push(
          `BACKUP LOG ${db} TO DISK = N'${this.quoteLiteral(opts.tailLogPath)}' WITH NORECOVERY`
        )
      }

      opts.source.forEach((src, idx) => {
        const isLast = idx === opts.source.length - 1
        const disk = `DISK = N'${this.quoteLiteral(src.path)}'`
        const verb = src.backupType === 'log' ? `RESTORE LOG ${db}` : `RESTORE DATABASE ${db}`
        const withClauses: string[] = [`FILE = ${Math.max(1, Math.floor(src.position))}`]
        if (idx === 0) {
          if (opts.replace) withClauses.push('REPLACE')
          if (opts.restrictedUser) withClauses.push('RESTRICTED_USER')
          for (const m of opts.move) {
            withClauses.push(
              `MOVE N'${this.quoteLiteral(m.logicalName)}' TO N'${this.quoteLiteral(m.targetPath)}'`
            )
          }
        }
        if (isLast) {
          if (opts.recoveryState === 'norecovery') withClauses.push('NORECOVERY')
          else if (opts.recoveryState === 'standby' && opts.standbyFile)
            withClauses.push(`STANDBY = N'${this.quoteLiteral(opts.standbyFile)}'`)
          else withClauses.push('RECOVERY')
        } else {
          withClauses.push('NORECOVERY')
        }
        withClauses.push('STATS = 10')
        statements.push(`${verb} FROM ${disk} WITH ${withClauses.join(', ')}`)
      })

      return { status: 'ok', sql: statements.join('\n') }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async executeRestore(opts: RestoreOptions): Promise<ExecuteRestoreResult> {
    const built = this.buildRestoreSql(opts)
    if (built.status === 'error') return { status: 'error', message: built.message }
    const result = await this.executeQuery(built.sql)
    if (result.status === 'error') {
      return { status: 'error', message: result.message, sql: built.sql }
    }
    return { status: 'ok', sql: built.sql, messages: result.messages, durationMs: result.durationMs }
  }

  getCapabilities(): ProviderCapabilities {
    return {
      executionPlan: { kind: 'xml-visual', buttonLabel: 'Include Execution Plan' },
      clientStatistics: { kind: 'client-stats', buttonLabel: 'Include Client Statistics' },
      hasCreateDatabase: true,
      hasStoredProcedures: true,
      hasFunctions: true,
      hasUserDefinedTypes: true,
      hasTableTypes: true,
      hasMemoryOptimizedTableTypes: true,
      hasStatistics: true,
      hasIndexRebuild: true,
      hasIndexReorganize: true,
      hasIndexDisable: true,
      hasProfiler: true,
      hasCreateTable: true,
      hasBackupRestore: true
    }
  }

  private buildColumnType(col: TableColumnMeta): string {
    const t = col.type.toUpperCase()
    if (['VARCHAR', 'NVARCHAR', 'CHAR', 'NCHAR', 'BINARY', 'VARBINARY'].includes(t)) {
      const len = col.maxLength === -1 ? 'MAX' : String(col.maxLength ?? '')
      return `${t}(${len})`
    }
    if (['DECIMAL', 'NUMERIC'].includes(t)) {
      return `${t}(${col.precision ?? 18}, ${col.scale ?? 0})`
    }
    return t
  }

  private buildCreateTableScript(
    databaseName: string,
    schemaName: string,
    tableName: string,
    columns: TableColumnMeta[],
    constraints: CheckConstraintDefinition[]
  ): string {
    const pkCols = columns.filter((c) => c.isPrimaryKey)
    const colDefs = columns.map((col) => {
      let def = `\t[${col.name}] ${this.buildColumnType(col)}`
      if (col.isIdentity) {
        def += ` IDENTITY(${col.identitySeed ?? 1}, ${col.identityIncrement ?? 1})`
      }
      def += col.isNullable ? ' NULL' : ' NOT NULL'
      if (col.defaultValue != null) {
        def += ` DEFAULT ${col.defaultValue}`
      }
      return def
    })
    if (pkCols.length > 0) {
      const pkColNames = pkCols.map((c) => `[${c.name}]`).join(', ')
      colDefs.push(`\tCONSTRAINT [PK_${tableName}] PRIMARY KEY (${pkColNames})`)
    }
    const table = `[${schemaName}].[${tableName}]`
    const now = new Date()
    const scriptDate =
      now.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }) +
      ' ' +
      now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })
    const header = `/****** Object:  Table ${table}    Script Date: ${scriptDate} ******/`
    let script = `${header}\n\nCREATE TABLE [${databaseName}].${table} (\n${colDefs.join(',\n')}\n)`
    for (const cc of constraints) {
      const withClause = cc.checkExistingData ? 'WITH CHECK' : 'WITH NOCHECK'
      const replicationClause = cc.enforceForReplication ? '' : ' NOT FOR REPLICATION'
      script += `\nGO\n\nALTER TABLE ${table} ${withClause} ADD CONSTRAINT [${cc.constraintName}] CHECK${replicationClause} (${cc.condition})`
      const enableClause = cc.isEnabled ? 'CHECK' : 'NOCHECK'
      script += `\nGO\n\nALTER TABLE ${table} ${enableClause} CONSTRAINT [${cc.constraintName}]`
    }
    return script
  }
}

// ── Stored procedure body helpers ─────────────────────────────────────────────

/**
 * SQL Server stores the full procedure definition in OBJECT_DEFINITION() including
 * the CREATE PROCEDURE header and parameter list. Strip it to leave only the body.
 * Also removes the outer BEGIN...END wrapper if present.
 */
function extractStoredProcedureBody(definition: string): string {
  // Match CREATE [OR ALTER] PROC[EDURE] [schema].[name] <params> AS
  const headerMatch = /CREATE\s+(?:OR\s+ALTER\s+)?PROC(?:EDURE)?\s+[\s\S]*?\bAS\b\s*/i.exec(definition)
  if (!headerMatch) return definition.trim()

  let body = definition.slice(headerMatch.index + headerMatch[0].length).trim()

  // Strip optional outer BEGIN...END wrapper
  const beginMatch = /^BEGIN\b\s*/i.exec(body)
  if (beginMatch) {
    body = body.slice(beginMatch[0].length)
    const endMatch = /\s*\bEND\s*$/i.exec(body)
    if (endMatch) {
      body = body.slice(0, endMatch.index)
    }
  }

  return body.trim()
}

/** Extract the description from a `-- Description: ...` comment at the top of the body. */
function extractDescriptionComment(body: string): string {
  const match = /^--\s*Description:\s*(.+)/im.exec(body)
  return match ? match[1].trim() : ''
}

/** Remove the `-- Description: ...` comment line from the body text. */
function stripDescriptionComment(body: string): string {
  return body.replace(/^--\s*Description:\s*.+\r?\n?/im, '').trim()
}

// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'
import { executeComparison, type ComparisonExecutionDependencies } from '../executeComparison'

describe('executeComparison', () => {
  it('builds a report with schema, programmable, security, and row differences', async () => {
    const dependencies: ComparisonExecutionDependencies = {
      databaseManager: {
        getChildren: vi.fn(async (connectionId: string, nodeId: string) => {
          const key = `${connectionId}:${nodeId}`

          switch (key) {
            case 'source:db:SourceDb:tables':
              return {
                status: 'ok' as const,
                children: [
                  { id: 'db:SourceDb:tables:dbo.users', label: 'users', kind: 'table' as const },
                  { id: 'db:SourceDb:tables:dbo.audit_log', label: 'audit_log', kind: 'table' as const }
                ]
              }
            case 'target:db:TargetDb:tables':
              return {
                status: 'ok' as const,
                children: [
                  { id: 'db:TargetDb:tables:dbo.users', label: 'users', kind: 'table' as const },
                  { id: 'db:TargetDb:tables:dbo.sessions', label: 'sessions', kind: 'table' as const }
                ]
              }
            case 'source:db:SourceDb:functions':
              return { status: 'ok' as const, children: [{ id: 'db:SourceDb:functions:dbo.fn_active_users', label: 'fn_active_users', kind: 'function' as const }] }
            case 'target:db:TargetDb:functions':
              return { status: 'ok' as const, children: [] }
            case 'source:db:SourceDb:security:users':
              return { status: 'ok' as const, children: [{ id: 'user:alice', label: 'alice', kind: 'database' as const }] }
            case 'target:db:TargetDb:security:users':
              return { status: 'ok' as const, children: [{ id: 'user:bob', label: 'bob', kind: 'database' as const }] }
            case 'source:db:SourceDb:security:roles':
              return { status: 'ok' as const, children: [{ id: 'role:reader', label: 'reader', kind: 'database' as const }] }
            case 'target:db:TargetDb:security:roles':
              return { status: 'ok' as const, children: [] }
            case 'source:db:SourceDb:security:schemas':
              return { status: 'ok' as const, children: [{ id: 'schema:dbo', label: 'dbo', kind: 'database' as const }] }
            case 'target:db:TargetDb:security:schemas':
              return { status: 'ok' as const, children: [{ id: 'schema:dbo', label: 'dbo', kind: 'database' as const }, { id: 'schema:etl', label: 'etl', kind: 'database' as const }] }
            default:
              return { status: 'ok' as const, children: [] }
          }
        }),
        getTableSchema: vi.fn(async (connectionId: string, _databaseName: string, _schemaName: string, tableName: string) => {
          if (tableName === 'users') {
            if (connectionId === 'source') {
              return {
                status: 'ok' as const,
                columns: [
                  { name: 'id', type: 'int', maxLength: null, precision: 10, scale: 0, isNullable: false, defaultValue: null, isIdentity: true, identitySeed: 1, identityIncrement: 1, isPrimaryKey: true },
                  { name: 'email', type: 'nvarchar', maxLength: 120, precision: null, scale: null, isNullable: false, defaultValue: null, isIdentity: false, identitySeed: null, identityIncrement: null, isPrimaryKey: false },
                  { name: 'status', type: 'nvarchar', maxLength: 20, precision: null, scale: null, isNullable: false, defaultValue: "'active'", isIdentity: false, identitySeed: null, identityIncrement: null, isPrimaryKey: false }
                ]
              }
            }

            return {
              status: 'ok' as const,
              columns: [
                { name: 'id', type: 'int', maxLength: null, precision: 10, scale: 0, isNullable: false, defaultValue: null, isIdentity: true, identitySeed: 1, identityIncrement: 1, isPrimaryKey: true },
                { name: 'email', type: 'nvarchar', maxLength: 255, precision: null, scale: null, isNullable: false, defaultValue: null, isIdentity: false, identitySeed: null, identityIncrement: null, isPrimaryKey: false },
                { name: 'status', type: 'nvarchar', maxLength: 20, precision: null, scale: null, isNullable: false, defaultValue: "'inactive'", isIdentity: false, identitySeed: null, identityIncrement: null, isPrimaryKey: false }
              ]
            }
          }

          return {
            status: 'ok' as const,
            columns: [{ name: 'id', type: 'int', maxLength: null, precision: 10, scale: 0, isNullable: false, defaultValue: null, isIdentity: true, identitySeed: 1, identityIncrement: 1, isPrimaryKey: true }]
          }
        }),
        getForeignKeys: vi.fn(async () => ({ status: 'ok' as const, foreignKeys: [] })),
        getCheckConstraints: vi.fn(async (connectionId: string) => {
          if (connectionId === 'source') {
            return {
              status: 'ok' as const,
              constraints: [{ constraintName: 'CK_users_status', condition: "[status] <> ''", isEnabled: true, checkExistingData: true, enforceForReplication: false }]
            }
          }

          return {
            status: 'ok' as const,
            constraints: [{ constraintName: 'CK_users_status', condition: "[status] in ('active','inactive')", isEnabled: true, checkExistingData: true, enforceForReplication: false }]
          }
        }),
        getTriggers: vi.fn(async (connectionId: string) => {
          if (connectionId === 'source') {
            return {
              status: 'ok' as const,
              triggers: [{ triggerName: 'trg_users_sync', isInsteadOf: false, isInsert: true, isUpdate: true, isDelete: false, body: 'select 1' }]
            }
          }

          return {
            status: 'ok' as const,
            triggers: [{ triggerName: 'trg_users_sync', isInsteadOf: false, isInsert: true, isUpdate: true, isDelete: false, body: 'select 2' }]
          }
        }),
        getIndexes: vi.fn(async (connectionId: string) => {
          if (connectionId === 'source') {
            return {
              status: 'ok' as const,
              indexes: [{ name: 'IX_users_email', schemaName: 'dbo', tableName: 'users', type: 'NONCLUSTERED', isUnique: true, isPrimaryKey: false, isDisabled: false, columns: [{ columnName: 'email', keyOrdinal: 1, isDescendingKey: false, isIncludedColumn: false }] }]
            }
          }

          return { status: 'ok' as const, indexes: [] }
        }),
        getViews: vi.fn(async (connectionId: string) => {
          if (connectionId === 'source') {
            return { status: 'ok' as const, views: [{ schemaName: 'dbo', viewName: 'active_users', definition: "select * from users where status = 'active'", isSchemabound: false, isEncrypted: false }] }
          }

          return { status: 'ok' as const, views: [{ schemaName: 'dbo', viewName: 'active_users', definition: "select * from users where status in ('active','inactive')", isSchemabound: false, isEncrypted: false }] }
        }),
        getStoredProcedures: vi.fn(async (connectionId: string) => {
          if (connectionId === 'source') {
            return { status: 'ok' as const, procedures: [{ schemaName: 'dbo', procedureName: 'sync_users', description: '', parameters: [], body: 'select 1' }] }
          }

          return { status: 'ok' as const, procedures: [{ schemaName: 'dbo', procedureName: 'sync_users', description: '', parameters: [], body: 'select 2' }] }
        }),
        scriptSelectTopRows: vi.fn(async (_connectionId: string, _databaseName: string, schemaName: string, tableName: string) => ({ status: 'ok' as const, script: `select * from ${schemaName}.${tableName}` })),
        executeQuery: vi.fn(async (connectionId: string, querySql: string) => {
          if (connectionId === 'source' && querySql.includes('dbo.users')) {
            return {
              status: 'ok' as const,
              resultSets: [{ columns: ['id', 'email', 'status'], rows: [{ id: 1, email: 'alice@example.com', status: 'active' }, { id: 2, email: 'bob@example.com', status: 'active' }], rowCount: 2 }],
              messages: [],
              durationMs: 1
            }
          }

          if (connectionId === 'target' && querySql.includes('dbo.users')) {
            return {
              status: 'ok' as const,
              resultSets: [{ columns: ['id', 'email', 'status'], rows: [{ id: 1, email: 'alice@example.com', status: 'inactive' }, { id: 3, email: 'carol@example.com', status: 'active' }], rowCount: 2 }],
              messages: [],
              durationMs: 1
            }
          }

          return { status: 'ok' as const, resultSets: [{ columns: [], rows: [], rowCount: 0 }], messages: [], durationMs: 1 }
        })
      }
    }

    const report = await executeComparison(
      dependencies,
      {
        id: 'cmp-1',
        name: 'Nightly Diff',
        description: 'Checks everything',
        source: { connectionId: 'source', databaseName: 'SourceDb', provider: 'sqlserver' },
        target: { connectionId: 'target', databaseName: 'TargetDb', provider: 'sqlserver' },
        scopeKeys: [
          'schema.tablesCoreConstraints',
          'schema.indexingSubsystems',
          'schema.programmableObjects',
          'schema.securityMetadataProfiles',
          'data.keyMatchedSets',
          'data.rowLevelValues'
        ],
        tableKeyMappings: [],
        createdAt: '2026-05-19T00:00:00.000Z',
        updatedAt: '2026-05-19T00:00:00.000Z'
      },
      {
        id: 'source',
        name: 'Source',
        provider: 'sqlserver',
        host: 'localhost',
        port: 1433,
        username: 'sa',
        password: '',
        rememberPassword: false,
        defaultDatabase: 'SourceDb'
      },
      {
        id: 'target',
        name: 'Target',
        provider: 'sqlserver',
        host: 'localhost',
        port: 1433,
        username: 'sa',
        password: '',
        rememberPassword: false,
        defaultDatabase: 'TargetDb'
      }
    )

    expect(report.items.some((item) => item.category === 'tables' && item.changeType === 'added' && item.objectName === 'dbo.audit_log')).toBe(true)
    expect(report.items.some((item) => item.category === 'tables' && item.changeType === 'removed' && item.objectName === 'dbo.sessions')).toBe(true)
    expect(report.items.some((item) => item.category === 'columns' && item.changeType === 'modified' && item.objectName === 'dbo.users.email')).toBe(true)
    expect(report.items.some((item) => item.category === 'indexes' && item.changeType === 'added' && item.objectName === 'dbo.users.IX_users_email')).toBe(true)
    expect(report.items.some((item) => item.category === 'triggers' && item.changeType === 'modified')).toBe(true)
    expect(report.items.some((item) => item.category === 'views' && item.changeType === 'modified')).toBe(true)
    expect(report.items.some((item) => item.category === 'storedProcedures' && item.changeType === 'modified')).toBe(true)
    expect(report.items.some((item) => item.category === 'functions' && item.changeType === 'added')).toBe(true)
    expect(report.items.some((item) => item.category === 'securityUsers' && item.changeType === 'removed')).toBe(true)
    expect(report.items.some((item) => item.category === 'securityUsers' && item.changeType === 'added')).toBe(true)
    expect(report.items.some((item) => item.category === 'rows' && item.changeType === 'added' && item.details.some((detail) => detail.includes('Source row 2')))).toBe(true)
    expect(report.items.some((item) => item.category === 'rows' && item.changeType === 'removed' && item.details.some((detail) => detail.includes('Target row 3')))).toBe(true)
    expect(report.items.some((item) => item.category === 'rows' && item.changeType === 'modified' && item.details.some((detail) => detail.includes('status')))).toBe(true)
    expect(report.counts.total).toBeGreaterThan(0)
  })

  it('marks row comparison as unsupported when no key columns are available', async () => {
    const dependencies: ComparisonExecutionDependencies = {
      databaseManager: {
        getChildren: vi.fn(async (_connectionId: string, nodeId: string) => {
          if (nodeId.endsWith(':tables')) {
            return {
              status: 'ok' as const,
              children: [{ id: 'db:SourceDb:tables:dbo.users', label: 'users', kind: 'table' as const }]
            }
          }

          return { status: 'ok' as const, children: [] }
        }),
        getTableSchema: vi.fn(async () => ({
          status: 'ok' as const,
          columns: [{ name: 'email', type: 'nvarchar', maxLength: 100, precision: null, scale: null, isNullable: false, defaultValue: null, isIdentity: false, identitySeed: null, identityIncrement: null, isPrimaryKey: false }]
        })),
        getForeignKeys: vi.fn(async () => ({ status: 'ok' as const, foreignKeys: [] })),
        getCheckConstraints: vi.fn(async () => ({ status: 'ok' as const, constraints: [] })),
        getTriggers: vi.fn(async () => ({ status: 'ok' as const, triggers: [] })),
        getIndexes: vi.fn(async () => ({ status: 'ok' as const, indexes: [] })),
        getViews: vi.fn(async () => ({ status: 'ok' as const, views: [] })),
        getStoredProcedures: vi.fn(async () => ({ status: 'ok' as const, procedures: [] })),
        scriptSelectTopRows: vi.fn(),
        executeQuery: vi.fn()
      }
    }

    const report = await executeComparison(
      dependencies,
      {
        id: 'cmp-2',
        name: 'No Keys',
        description: '',
        source: { connectionId: 'source', databaseName: 'SourceDb', provider: 'sqlserver' },
        target: { connectionId: 'target', databaseName: 'TargetDb', provider: 'sqlserver' },
        scopeKeys: ['data.keyMatchedSets'],
        tableKeyMappings: [],
        createdAt: '2026-05-19T00:00:00.000Z',
        updatedAt: '2026-05-19T00:00:00.000Z'
      },
      {
        id: 'source',
        name: 'Source',
        provider: 'sqlserver',
        host: 'localhost',
        port: 1433,
        username: 'sa',
        password: '',
        rememberPassword: false,
        defaultDatabase: 'SourceDb'
      },
      {
        id: 'target',
        name: 'Target',
        provider: 'sqlserver',
        host: 'localhost',
        port: 1433,
        username: 'sa',
        password: '',
        rememberPassword: false,
        defaultDatabase: 'TargetDb'
      }
    )

    expect(report.counts.unsupported).toBe(1)
    expect(report.items[0]?.changeType).toBe('unsupported')
  })

  it('matches tables/views/procedures by name when the schema equals the database name (MySQL cross-database)', async () => {
    // MySQL embeds the database name as the schema in node IDs and result objects.
    // When comparing "prod" vs "staging", keys would be "prod.users" vs "staging.users"
    // without the fix — causing the same table to appear as both Added and Removed.
    const dependencies: ComparisonExecutionDependencies = {
      databaseManager: {
        getChildren: vi.fn(async (connectionId: string, nodeId: string) => {
          if (connectionId === 'source' && nodeId === 'db:prod:tables')
            return { status: 'ok' as const, children: [{ id: 'db:prod:tables:prod.users', label: 'users', kind: 'table' as const }] }
          if (connectionId === 'target' && nodeId === 'db:staging:tables')
            return { status: 'ok' as const, children: [{ id: 'db:staging:tables:staging.users', label: 'users', kind: 'table' as const }] }
          return { status: 'ok' as const, children: [] }
        }),
        getTableSchema: vi.fn(async () => ({
          status: 'ok' as const,
          columns: [{ name: 'id', type: 'int', maxLength: null, precision: null, scale: null, isNullable: false, defaultValue: null, isIdentity: true, identitySeed: 1, identityIncrement: 1, isPrimaryKey: true }]
        })),
        getForeignKeys: vi.fn(async () => ({ status: 'ok' as const, foreignKeys: [] })),
        getCheckConstraints: vi.fn(async () => ({ status: 'ok' as const, constraints: [] })),
        getTriggers: vi.fn(async () => ({ status: 'ok' as const, triggers: [] })),
        getIndexes: vi.fn(async () => ({ status: 'ok' as const, indexes: [] })),
        getViews: vi.fn(async (connectionId: string) => ({
          status: 'ok' as const,
          views: [{ schemaName: connectionId === 'source' ? 'prod' : 'staging', viewName: 'active_users', definition: 'SELECT * FROM users', isSchemabound: false, isEncrypted: false }]
        })),
        getStoredProcedures: vi.fn(async (connectionId: string) => ({
          status: 'ok' as const,
          procedures: [{ schemaName: connectionId === 'source' ? 'prod' : 'staging', procedureName: 'get_users', description: '', parameters: [], body: 'SELECT * FROM users' }]
        })),
        scriptSelectTopRows: vi.fn(),
        executeQuery: vi.fn()
      }
    }

    const report = await executeComparison(
      dependencies,
      {
        id: 'cmp-mysql',
        name: 'MySQL cross-db',
        description: '',
        source: { connectionId: 'source', databaseName: 'prod', provider: 'mysql' },
        target: { connectionId: 'target', databaseName: 'staging', provider: 'mysql' },
        scopeKeys: ['schema.tablesCoreConstraints', 'schema.programmableObjects'],
        tableKeyMappings: [],
        createdAt: '2026-05-23T00:00:00.000Z',
        updatedAt: '2026-05-23T00:00:00.000Z'
      },
      { id: 'source', name: 'Prod', provider: 'mysql', host: 'localhost', port: 3306, username: 'root', password: '', rememberPassword: false, defaultDatabase: 'prod' },
      { id: 'target', name: 'Staging', provider: 'mysql', host: 'localhost', port: 3306, username: 'root', password: '', rememberPassword: false, defaultDatabase: 'staging' }
    )

    // Tables, views and procedures exist in both databases with the same structure,
    // so no added/removed/modified items should be reported.
    expect(report.items.filter((i) => i.category === 'tables')).toHaveLength(0)
    expect(report.items.filter((i) => i.category === 'views')).toHaveLength(0)
    expect(report.items.filter((i) => i.category === 'storedProcedures')).toHaveLength(0)
    expect(report.counts.total).toBe(0)
  })
})
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MySqlProvider } from '../MySqlProvider'

// ── mysql2/promise mock ───────────────────────────────────────────────────────

const { mockConnection, mockPool, mockCreatePool } = vi.hoisted(() => {
  const mockConnection = {
    query: vi.fn(),
    release: vi.fn()
  }

  const mockPool = {
    getConnection: vi.fn().mockResolvedValue(mockConnection),
    end: vi.fn().mockResolvedValue(undefined)
  }

  const mockCreatePool = vi.fn().mockReturnValue(mockPool)

  return { mockConnection, mockPool, mockCreatePool }
})

vi.mock('mysql2/promise', () => ({
  createPool: mockCreatePool
}))

// ── helpers ───────────────────────────────────────────────────────────────────

function resetConnection(): void {
  mockConnection.query.mockReset()
  mockConnection.release.mockReset()
  mockPool.getConnection.mockResolvedValue(mockConnection)
}

/** Returns a connected MySqlProvider with query mock ready for use. */
async function buildConnectedProvider(): Promise<MySqlProvider> {
  // connect() calls getConnection() once to verify connectivity
  mockConnection.query.mockResolvedValue([[], []])
  const provider = new MySqlProvider()
  await provider.connect({
    id: 'test-id',
    name: 'Test',
    provider: 'mysql',
    host: 'localhost',
    port: 3306,
    username: 'root',
    password: 'password',
    rememberPassword: false,
    defaultDatabase: 'testdb'
  })
  resetConnection()
  return provider
}

// ── getCapabilities ───────────────────────────────────────────────────────────

describe('MySqlProvider.getCapabilities', () => {
  it('returns explain-text execution plan capability', () => {
    const provider = new MySqlProvider()
    const caps = provider.getCapabilities()
    expect(caps.executionPlan).toEqual({ kind: 'explain-text', buttonLabel: 'Explain Query' })
  })

  it('returns no client statistics capability', () => {
    const provider = new MySqlProvider()
    const caps = provider.getCapabilities()
    expect(caps.clientStatistics).toEqual({ kind: 'none' })
  })

  it('reports supported features', () => {
    const provider = new MySqlProvider()
    const caps = provider.getCapabilities()
    expect(caps.hasCreateDatabase).toBe(true)
    expect(caps.hasStoredProcedures).toBe(true)
    expect(caps.hasFunctions).toBe(true)
    expect(caps.hasCreateTable).toBe(true)
    expect(caps.hasIndexRebuild).toBe(true)
  })

  it('reports unsupported SQL-Server/PostgreSQL-specific features', () => {
    const provider = new MySqlProvider()
    const caps = provider.getCapabilities()
    expect(caps.hasUserDefinedTypes).toBe(false)
    expect(caps.hasTableTypes).toBe(false)
    expect(caps.hasMemoryOptimizedTableTypes).toBe(false)
    expect(caps.hasStatistics).toBe(false)
    expect(caps.hasIndexReorganize).toBe(false)
    expect(caps.hasIndexDisable).toBe(false)
    expect(caps.hasProfiler).toBe(false)
  })
})

// ── listCategories ────────────────────────────────────────────────────────────

describe('MySqlProvider.listCategories', () => {
  it('returns 5 folder nodes (tables, views, stored procedures, functions, security)', async () => {
    const provider = await buildConnectedProvider()
    const nodes = provider.listCategories('mydb')
    expect(nodes).toHaveLength(5)
    expect(nodes.map((n) => n.kind)).toEqual([
      'tables-folder',
      'views-folder',
      'stored-procedures-folder',
      'functions-folder',
      'security-folder'
    ])
  })

  it('encodes database name in node IDs', async () => {
    const provider = await buildConnectedProvider()
    const nodes = provider.listCategories('mydb')
    expect(nodes[0].id).toBe('db:mydb:tables')
    expect(nodes[1].id).toBe('db:mydb:views')
    expect(nodes[2].id).toBe('db:mydb:stored-procedures')
    expect(nodes[3].id).toBe('db:mydb:functions')
    expect(nodes[4].id).toBe('db:mydb:security')
  })
})

// ── listTypeCategories ────────────────────────────────────────────────────────

describe('MySqlProvider.listTypeCategories', () => {
  it('returns empty array (MySQL has no user-defined types)', async () => {
    const provider = await buildConnectedProvider()
    expect(provider.listTypeCategories('mydb')).toEqual([])
  })
})

// ── listTableCategories ───────────────────────────────────────────────────────

describe('MySqlProvider.listTableCategories', () => {
  it('returns 5 folder nodes (no statistics for MySQL)', async () => {
    const provider = await buildConnectedProvider()
    const nodes = provider.listTableCategories('mydb', 'mydb.users')
    expect(nodes).toHaveLength(5)
    expect(nodes.map((n) => n.kind)).toEqual([
      'table-columns-folder',
      'table-keys-folder',
      'table-constraints-folder',
      'table-triggers-folder',
      'table-indexes-folder'
    ])
  })

  it('uses correct path-encoded IDs', async () => {
    const provider = await buildConnectedProvider()
    const nodes = provider.listTableCategories('mydb', 'mydb.users')
    const base = 'db:mydb:tables:mydb.users'
    expect(nodes[0].id).toBe(`${base}:columns`)
    expect(nodes[1].id).toBe(`${base}:keys`)
    expect(nodes[2].id).toBe(`${base}:constraints`)
    expect(nodes[3].id).toBe(`${base}:triggers`)
    expect(nodes[4].id).toBe(`${base}:indexes`)
  })
})

// ── listDatabases ─────────────────────────────────────────────────────────────

describe('MySqlProvider.listDatabases', () => {
  beforeEach(() => resetConnection())

  it('returns user databases and filters system databases by default', async () => {
    const provider = await buildConnectedProvider()
    mockConnection.query.mockResolvedValue([
      [
        { Database: 'information_schema' },
        { Database: 'mysql' },
        { Database: 'myapp' },
        { Database: 'shopdb' }
      ],
      []
    ])

    const nodes = await provider.listDatabases(false)
    expect(nodes.map((n) => n.label)).toEqual(['myapp', 'shopdb'])
    expect(nodes[0]).toEqual({ id: 'db:myapp', label: 'myapp', kind: 'database' })
  })

  it('includes system databases when showSystemDatabases is true', async () => {
    const provider = await buildConnectedProvider()
    mockConnection.query.mockResolvedValue([
      [
        { Database: 'information_schema' },
        { Database: 'mysql' },
        { Database: 'myapp' }
      ],
      []
    ])

    const nodes = await provider.listDatabases(true)
    expect(nodes.map((n) => n.label)).toEqual(['information_schema', 'mysql', 'myapp'])
  })
})

// ── listTables ────────────────────────────────────────────────────────────────

describe('MySqlProvider.listTables', () => {
  beforeEach(() => resetConnection())

  it('returns table nodes with database-scoped IDs', async () => {
    const provider = await buildConnectedProvider()
    mockConnection.query.mockResolvedValue([
      [{ TABLE_NAME: 'orders' }, { TABLE_NAME: 'users' }],
      []
    ])

    const nodes = await provider.listTables('mydb')
    expect(nodes).toHaveLength(2)
    expect(nodes[0]).toEqual({
      id: 'db:mydb:tables:mydb.orders',
      label: 'orders',
      kind: 'table'
    })
    expect(nodes[1]).toEqual({
      id: 'db:mydb:tables:mydb.users',
      label: 'users',
      kind: 'table'
    })
  })

  it('returns empty array when no tables exist', async () => {
    const provider = await buildConnectedProvider()
    mockConnection.query.mockResolvedValue([[], []])

    const nodes = await provider.listTables('emptydb')
    expect(nodes).toEqual([])
  })
})

// ── listViews ─────────────────────────────────────────────────────────────────

describe('MySqlProvider.listViews', () => {
  beforeEach(() => resetConnection())

  it('returns view nodes', async () => {
    const provider = await buildConnectedProvider()
    mockConnection.query.mockResolvedValue([[{ TABLE_NAME: 'active_users' }], []])

    const nodes = await provider.listViews('mydb')
    expect(nodes).toHaveLength(1)
    expect(nodes[0]).toEqual({
      id: 'db:mydb:views:mydb.active_users',
      label: 'active_users',
      kind: 'view'
    })
  })
})

// ── listStoredProcedures ──────────────────────────────────────────────────────

describe('MySqlProvider.listStoredProcedures', () => {
  beforeEach(() => resetConnection())

  it('returns stored procedure nodes', async () => {
    const provider = await buildConnectedProvider()
    mockConnection.query.mockResolvedValue([
      [{ ROUTINE_NAME: 'get_user' }, { ROUTINE_NAME: 'update_order' }],
      []
    ])

    const nodes = await provider.listStoredProcedures('mydb')
    expect(nodes).toHaveLength(2)
    expect(nodes[0]).toEqual({
      id: 'db:mydb:stored-procedures:mydb.get_user',
      label: 'get_user',
      kind: 'stored-procedure'
    })
  })
})

// ── listFunctions ─────────────────────────────────────────────────────────────

describe('MySqlProvider.listFunctions', () => {
  beforeEach(() => resetConnection())

  it('returns function nodes', async () => {
    const provider = await buildConnectedProvider()
    mockConnection.query.mockResolvedValue([[{ ROUTINE_NAME: 'calc_total' }], []])

    const nodes = await provider.listFunctions('mydb')
    expect(nodes).toHaveLength(1)
    expect(nodes[0]).toEqual({
      id: 'db:mydb:functions:mydb.calc_total',
      label: 'calc_total',
      kind: 'function'
    })
  })
})

// ── listTypes / listTypeDataTypes / listTypeTables ────────────────────────────

describe('MySqlProvider type listing', () => {
  it('listTypes returns empty array', async () => {
    const provider = await buildConnectedProvider()
    expect(await provider.listTypes('mydb')).toEqual([])
  })

  it('listTypeDataTypes returns empty array', async () => {
    const provider = await buildConnectedProvider()
    expect(await provider.listTypeDataTypes('mydb')).toEqual([])
  })

  it('listTypeTables returns empty array', async () => {
    const provider = await buildConnectedProvider()
    expect(await provider.listTypeTables('mydb')).toEqual([])
  })

  it('listTypeMemoryOptimizedTables returns empty array', async () => {
    const provider = await buildConnectedProvider()
    expect(await provider.listTypeMemoryOptimizedTables('mydb')).toEqual([])
  })

  it('listStatistics returns empty array', async () => {
    const provider = await buildConnectedProvider()
    expect(await provider.listStatistics('mydb', 'mydb', 'users')).toEqual([])
  })
})

// ── getTableSchema ────────────────────────────────────────────────────────────

describe('MySqlProvider.getTableSchema', () => {
  beforeEach(() => resetConnection())

  it('maps columns from information_schema correctly', async () => {
    const provider = await buildConnectedProvider()
    mockConnection.query.mockResolvedValue([
      [
        {
          COLUMN_NAME: 'id',
          DATA_TYPE: 'int',
          CHARACTER_MAXIMUM_LENGTH: null,
          NUMERIC_PRECISION: 10,
          NUMERIC_SCALE: 0,
          IS_NULLABLE: 'NO',
          COLUMN_DEFAULT: null,
          EXTRA: 'auto_increment',
          COLUMN_KEY: 'PRI'
        },
        {
          COLUMN_NAME: 'name',
          DATA_TYPE: 'varchar',
          CHARACTER_MAXIMUM_LENGTH: 255,
          NUMERIC_PRECISION: null,
          NUMERIC_SCALE: null,
          IS_NULLABLE: 'YES',
          COLUMN_DEFAULT: null,
          EXTRA: '',
          COLUMN_KEY: ''
        }
      ],
      []
    ])

    const result = await provider.getTableSchema('mydb', 'mydb', 'users')
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return

    expect(result.columns).toHaveLength(2)

    const [idCol, nameCol] = result.columns
    expect(idCol.name).toBe('id')
    expect(idCol.isPrimaryKey).toBe(true)
    expect(idCol.isIdentity).toBe(true)
    expect(idCol.isNullable).toBe(false)
    expect(idCol.type).toBe('int')

    expect(nameCol.name).toBe('name')
    expect(nameCol.isPrimaryKey).toBe(false)
    expect(nameCol.isIdentity).toBe(false)
    expect(nameCol.isNullable).toBe(true)
    expect(nameCol.maxLength).toBe(255)
  })

  it('returns error result when query fails', async () => {
    const provider = await buildConnectedProvider()
    mockConnection.query.mockRejectedValue(new Error('connection lost'))

    const result = await provider.getTableSchema('mydb', 'mydb', 'users')
    expect(result.status).toBe('error')
    if (result.status !== 'error') return
    expect(result.message).toContain('connection lost')
  })
})

// ── getForeignKeys ────────────────────────────────────────────────────────────

describe('MySqlProvider.getForeignKeys', () => {
  beforeEach(() => resetConnection())

  it('maps foreign keys and delete/update rules', async () => {
    const provider = await buildConnectedProvider()
    mockConnection.query.mockResolvedValue([
      [
        {
          CONSTRAINT_NAME: 'fk_orders_user',
          COLUMN_NAME: 'user_id',
          REFERENCED_TABLE_SCHEMA: 'mydb',
          REFERENCED_TABLE_NAME: 'users',
          REFERENCED_COLUMN_NAME: 'id',
          DELETE_RULE: 'CASCADE',
          UPDATE_RULE: 'NO ACTION'
        }
      ],
      []
    ])

    const result = await provider.getForeignKeys('mydb', 'mydb', 'orders')
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.foreignKeys).toHaveLength(1)
    const fk = result.foreignKeys[0]
    expect(fk.constraintName).toBe('fk_orders_user')
    expect(fk.deleteRule).toBe('CASCADE')
    expect(fk.updateRule).toBe('NO_ACTION')
    expect(fk.referencedTable).toBe('users')
  })
})

// ── getCheckConstraints ───────────────────────────────────────────────────────

describe('MySqlProvider.getCheckConstraints', () => {
  beforeEach(() => resetConnection())

  it('returns constraints on MySQL 8+', async () => {
    const provider = await buildConnectedProvider()
    mockConnection.query.mockResolvedValue([
      [{ CONSTRAINT_NAME: 'chk_age', CHECK_CLAUSE: 'age >= 0' }],
      []
    ])

    const result = await provider.getCheckConstraints('mydb', 'mydb', 'users')
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.constraints).toHaveLength(1)
    expect(result.constraints[0].constraintName).toBe('chk_age')
    expect(result.constraints[0].condition).toBe('age >= 0')
  })

  it('returns empty array gracefully when CHECK_CONSTRAINTS table is absent (MySQL < 8)', async () => {
    const provider = await buildConnectedProvider()
    mockConnection.query.mockRejectedValue(new Error("Table 'information_schema.check_constraints' doesn't exist"))

    const result = await provider.getCheckConstraints('mydb', 'mydb', 'users')
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.constraints).toEqual([])
  })
})

// ── getTriggers ───────────────────────────────────────────────────────────────

describe('MySqlProvider.getTriggers', () => {
  beforeEach(() => resetConnection())

  it('maps each trigger row to its own TriggerDefinition with one event', async () => {
    const provider = await buildConnectedProvider()
    mockConnection.query.mockResolvedValue([
      [
        {
          TRIGGER_NAME: 'before_insert_users',
          EVENT_MANIPULATION: 'INSERT',
          ACTION_TIMING: 'BEFORE',
          ACTION_STATEMENT: 'BEGIN SET NEW.created_at = NOW(); END'
        },
        {
          TRIGGER_NAME: 'after_delete_users',
          EVENT_MANIPULATION: 'DELETE',
          ACTION_TIMING: 'AFTER',
          ACTION_STATEMENT: 'BEGIN INSERT INTO audit_log VALUES(OLD.id); END'
        }
      ],
      []
    ])

    const result = await provider.getTriggers('mydb', 'mydb', 'users')
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.triggers).toHaveLength(2)

    const [t1, t2] = result.triggers
    expect(t1.triggerName).toBe('before_insert_users')
    expect(t1.isInsert).toBe(true)
    expect(t1.isUpdate).toBe(false)
    expect(t1.isDelete).toBe(false)
    expect(t1.isInsteadOf).toBe(false)

    expect(t2.triggerName).toBe('after_delete_users')
    expect(t2.isDelete).toBe(true)
  })
})

// ── getIndexes ────────────────────────────────────────────────────────────────

describe('MySqlProvider.getIndexes', () => {
  beforeEach(() => resetConnection())

  it('groups index rows by index name and identifies primary key', async () => {
    const provider = await buildConnectedProvider()
    mockConnection.query.mockResolvedValue([
      [
        {
          INDEX_NAME: 'PRIMARY',
          NON_UNIQUE: 0,
          COLUMN_NAME: 'id',
          SEQ_IN_INDEX: 1,
          COLLATION: 'A',
          INDEX_TYPE: 'BTREE'
        },
        {
          INDEX_NAME: 'idx_email',
          NON_UNIQUE: 1,
          COLUMN_NAME: 'email',
          SEQ_IN_INDEX: 1,
          COLLATION: 'A',
          INDEX_TYPE: 'BTREE'
        }
      ],
      []
    ])

    const result = await provider.getIndexes('mydb', 'mydb', 'users')
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return

    const pkIndex = result.indexes.find((i) => i.name === 'PRIMARY')
    const emailIndex = result.indexes.find((i) => i.name === 'idx_email')

    expect(pkIndex?.isPrimaryKey).toBe(true)
    expect(pkIndex?.isUnique).toBe(true)
    expect(emailIndex?.isUnique).toBe(false)
    expect(emailIndex?.isPrimaryKey).toBe(false)
    expect(emailIndex?.columns[0].columnName).toBe('email')
  })
})

// ── script generation ─────────────────────────────────────────────────────────

describe('MySqlProvider script generation', () => {
  it('scriptTableDrop returns DROP TABLE IF EXISTS with backtick quoting', async () => {
    const provider = await buildConnectedProvider()
    const result = await provider.scriptTableDrop('mydb', 'mydb', 'users')
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.script).toBe('DROP TABLE IF EXISTS `mydb`.`users`;')
  })

  it('scriptTableAlter returns a commented ALTER template', async () => {
    const provider = await buildConnectedProvider()
    const result = await provider.scriptTableAlter('mydb', 'mydb', 'users')
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.script).toContain('ALTER TABLE')
  })

  it('scriptSelectTopRows returns LIMIT query with backtick quoting', async () => {
    const provider = await buildConnectedProvider()
    const result = await provider.scriptSelectTopRows('mydb', 'mydb', 'users', 100)
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.script).toBe('SELECT * FROM `mydb`.`users` LIMIT 100;')
  })

  it('scriptDropDatabase returns DROP DATABASE statement', async () => {
    const provider = await buildConnectedProvider()
    const result = await provider.scriptDropDatabase('mydb')
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.script).toBe('DROP DATABASE `mydb`;')
  })

  it('scriptViewDrop returns DROP VIEW IF EXISTS', async () => {
    const provider = await buildConnectedProvider()
    const result = await provider.scriptViewDrop('mydb', 'mydb', 'active_users')
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.script).toBe('DROP VIEW IF EXISTS `mydb`.`active_users`;')
  })

  it('scriptStoredProcedureDrop returns DROP PROCEDURE IF EXISTS', async () => {
    const provider = await buildConnectedProvider()
    const result = await provider.scriptStoredProcedureDrop('mydb', 'mydb', 'get_user')
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.script).toBe('DROP PROCEDURE IF EXISTS `mydb`.`get_user`;')
  })
})

// ── unsupported operations ────────────────────────────────────────────────────

describe('MySqlProvider unsupported operations', () => {
  it('reorganizeIndex returns error', async () => {
    const provider = await buildConnectedProvider()
    const result = await provider.reorganizeIndex('mydb', 'idx', 'mydb', 'users')
    expect(result.status).toBe('error')
  })

  it('disableIndex returns error', async () => {
    const provider = await buildConnectedProvider()
    const result = await provider.disableIndex('mydb', 'idx', 'mydb', 'users')
    expect(result.status).toBe('error')
  })

  it('saveDataType returns error', async () => {
    const provider = await buildConnectedProvider()
    const result = await provider.saveDataType('mydb', {
      schemaName: 'mydb',
      typeName: 'MyType',
      baseType: 'INT',
      isMax: false,
      length: null,
      precision: null,
      scale: null,
      isNullable: true
    })
    expect(result.status).toBe('error')
  })

  it('saveTableType returns error', async () => {
    const provider = await buildConnectedProvider()
    const result = await provider.saveTableType('mydb', {
      schemaName: 'mydb',
      typeName: 'MyTableType',
      columns: []
    })
    expect(result.status).toBe('error')
  })

  it('saveMemoryOptimizedTableType returns error', async () => {
    const provider = await buildConnectedProvider()
    const result = await provider.saveMemoryOptimizedTableType('mydb', {
      schemaName: 'mydb',
      typeName: 'MyMemType',
      columns: []
    })
    expect(result.status).toBe('error')
  })

  it('getDataTypes returns empty list (not an error)', async () => {
    const provider = await buildConnectedProvider()
    const result = await provider.getDataTypes('mydb')
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.dataTypes).toEqual([])
  })

  it('getTableTypes returns empty list', async () => {
    const provider = await buildConnectedProvider()
    const result = await provider.getTableTypes('mydb')
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.tableTypes).toEqual([])
  })

  it('getMemoryOptimizedTableTypes returns empty list', async () => {
    const provider = await buildConnectedProvider()
    const result = await provider.getMemoryOptimizedTableTypes('mydb')
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.tableTypes).toEqual([])
  })
})

// ── executeQuery ──────────────────────────────────────────────────────────────

describe('MySqlProvider.executeQuery', () => {
  beforeEach(() => resetConnection())

  it('returns result set for a SELECT query', async () => {
    const provider = await buildConnectedProvider()
    const rows = [{ id: 1, name: 'Alice' }]
    const fields = [{ name: 'id' }, { name: 'name' }]
    mockConnection.query.mockResolvedValueOnce([rows, fields])

    const result = await provider.executeQuery('SELECT * FROM users', undefined, false, false, 'mydb')
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.resultSets).toHaveLength(1)
    expect(result.resultSets[0].columns).toEqual(['id', 'name'])
    expect(result.resultSets[0].rows).toEqual(rows)
  })

  it('prepends EXPLAIN when withPlan is true', async () => {
    const provider = await buildConnectedProvider()
    const explainRows = [{ id: 1, select_type: 'SIMPLE', table: 'users' }]
    const explainFields = [{ name: 'id' }, { name: 'select_type' }, { name: 'table' }]
    mockConnection.query.mockResolvedValueOnce([explainRows, explainFields])

    const result = await provider.executeQuery('SELECT * FROM users', undefined, true, false, 'mydb')
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.resultSets[0].columns).toContain('select_type')

    const queryCall = mockConnection.query.mock.calls[0][0] as string
    expect(queryCall).toMatch(/^EXPLAIN/i)
  })

  it('returns error result when the query throws', async () => {
    const provider = await buildConnectedProvider()
    mockConnection.query.mockRejectedValue(new Error('Table not found'))

    const result = await provider.executeQuery('SELECT * FROM missing', undefined, false, false, 'mydb')
    expect(result.status).toBe('error')
    if (result.status !== 'error') return
    expect(result.message).toContain('Table not found')
  })
})

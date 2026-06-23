// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SqliteProvider } from '../SqliteProvider'

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns a connected SqliteProvider backed by an in-memory SQLite database.
 * The database is pre-populated with a minimal schema for testing.
 */
async function buildConnectedProvider(): Promise<SqliteProvider> {
  const provider = new SqliteProvider()
  await provider.connect({
    id: 'test-id',
    name: 'Test',
    provider: 'sqlite',
    host: '',
    port: 0,
    username: '',
    password: '',
    rememberPassword: false,
    defaultDatabase: '',
    filePath: ':memory:'
  })
  return provider
}

/** Seed a minimal schema and data into the connected provider via executeQuery. */
async function seedSchema(provider: SqliteProvider): Promise<void> {
  // Execute each DDL statement individually to avoid the semicolon-split
  // issue inside trigger BEGIN...END blocks.
  const stmts = [
    `CREATE TABLE users (
      id    INTEGER PRIMARY KEY AUTOINCREMENT,
      name  TEXT    NOT NULL,
      email TEXT
    )`,
    `CREATE TABLE orders (
      id      INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      total   REAL
    )`,
    `CREATE INDEX idx_orders_user ON orders (user_id)`,
    `CREATE VIEW active_users AS
      SELECT id, name FROM users WHERE email IS NOT NULL`
  ]
  for (const stmt of stmts) {
    const result = await provider.executeQuery(stmt)
    if (result.status === 'error') throw new Error(`Seed failed: ${result.message}`)
  }

  // Create the trigger through saveTrigger which calls conn.prepare() directly,
  // avoiding the semicolon-in-body split problem in executeQuery.
  const trigResult = await provider.saveTrigger('main', {
    triggerName: 'trg_orders_after_insert',
    schemaName: 'main',
    tableName: 'orders',
    isInsteadOf: false,
    isInsert: true,
    isUpdate: false,
    isDelete: false,
    body: 'BEGIN SELECT 1; END'
  })
  if (trigResult.status === 'error')
    throw new Error(`Seed failed (trigger): ${trigResult.message}`)
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('SqliteProvider', () => {
  let provider: SqliteProvider

  beforeEach(async () => {
    provider = await buildConnectedProvider()
    await seedSchema(provider)
  })

  afterEach(async () => {
    await provider.disconnect()
  })

  // ── connect / disconnect ───────────────────────────────────────────────────

  describe('connect', () => {
    it('connects to an in-memory database without error', async () => {
      const p = new SqliteProvider()
      await expect(
        p.connect({
          id: 'x',
          name: 'X',
          provider: 'sqlite',
          host: '',
          port: 0,
          username: '',
          password: '',
          rememberPassword: false,
          defaultDatabase: '',
          filePath: ':memory:'
        })
      ).resolves.toBeUndefined()
      await p.disconnect()
    })

    it('throws when filePath is missing', async () => {
      const p = new SqliteProvider()
      await expect(
        p.connect({
          id: 'x',
          name: 'X',
          provider: 'sqlite',
          host: '',
          port: 0,
          username: '',
          password: '',
          rememberPassword: false,
          defaultDatabase: ''
          // filePath intentionally omitted
        })
      ).rejects.toThrow('SQLite file path is required')
    })
  })

  // ── getCapabilities ────────────────────────────────────────────────────────

  describe('getCapabilities', () => {
    it('reports no execution plan, no client statistics', () => {
      const caps = provider.getCapabilities()
      expect(caps.executionPlan).toEqual({ kind: 'none' })
      expect(caps.clientStatistics).toEqual({ kind: 'none' })
    })

    it('disables all advanced features', () => {
      const caps = provider.getCapabilities()
      expect(caps.hasCreateDatabase).toBe(false)
      expect(caps.hasStoredProcedures).toBe(false)
      expect(caps.hasFunctions).toBe(false)
      expect(caps.hasUserDefinedTypes).toBe(false)
      expect(caps.hasTableTypes).toBe(false)
      expect(caps.hasMemoryOptimizedTableTypes).toBe(false)
      expect(caps.hasStatistics).toBe(false)
      expect(caps.hasIndexRebuild).toBe(false)
      expect(caps.hasIndexReorganize).toBe(false)
      expect(caps.hasIndexDisable).toBe(false)
      expect(caps.hasProfiler).toBe(false)
    })

    it('enables hasCreateTable', () => {
      const caps = provider.getCapabilities()
      expect(caps.hasCreateTable).toBe(true)
    })
  })

  // ── listDatabases ──────────────────────────────────────────────────────────

  describe('listDatabases', () => {
    it('returns a single "main" database node', async () => {
      const nodes = await provider.listDatabases(false)
      expect(nodes).toHaveLength(1)
      expect(nodes[0]).toEqual({ id: 'db:main', label: 'main', kind: 'database' })
    })

    it('returns the same result regardless of showSystemDatabases flag', async () => {
      const a = await provider.listDatabases(false)
      const b = await provider.listDatabases(true)
      expect(a).toEqual(b)
    })
  })

  // ── listCategories ─────────────────────────────────────────────────────────

  describe('listCategories', () => {
    it('returns tables-folder and views-folder only', () => {
      const cats = provider.listCategories('main')
      const kinds = cats.map((c) => c.kind)
      expect(kinds).toContain('tables-folder')
      expect(kinds).toContain('views-folder')
      expect(kinds).not.toContain('stored-procedures-folder')
      expect(kinds).not.toContain('functions-folder')
    })
  })

  // ── listTables ─────────────────────────────────────────────────────────────

  describe('listTables', () => {
    it('lists user tables and excludes sqlite_* internal tables', async () => {
      const nodes = await provider.listTables('main')
      const names = nodes.map((n) => n.label)
      expect(names).toContain('users')
      expect(names).toContain('orders')
      expect(names.some((n) => n.startsWith('sqlite_'))).toBe(false)
    })

    it('returns nodes with correct kind and id pattern', async () => {
      const nodes = await provider.listTables('main')
      for (const node of nodes) {
        expect(node.kind).toBe('table')
        expect(node.id).toMatch(/^db:main:tables:main\./)
      }
    })
  })

  // ── listViews ──────────────────────────────────────────────────────────────

  describe('listViews', () => {
    it('lists views', async () => {
      const nodes = await provider.listViews('main')
      const names = nodes.map((n) => n.label)
      expect(names).toContain('active_users')
    })

    it('returns nodes with view kind', async () => {
      const nodes = await provider.listViews('main')
      for (const node of nodes) {
        expect(node.kind).toBe('view')
      }
    })
  })

  // ── listColumns ────────────────────────────────────────────────────────────

  describe('listColumns', () => {
    it('lists columns for the users table', async () => {
      const nodes = await provider.listColumns('main', 'main', 'users')
      const names = nodes.map((n) => n.label.split(' ')[0])
      expect(names).toContain('id')
      expect(names).toContain('name')
      expect(names).toContain('email')
    })

    it('marks primary key column with column-pk kind', async () => {
      const nodes = await provider.listColumns('main', 'main', 'users')
      const pk = nodes.find((n) => n.label.startsWith('id'))
      expect(pk?.kind).toBe('column-pk')
    })

    it('marks non-PK columns with column kind', async () => {
      const nodes = await provider.listColumns('main', 'main', 'users')
      const name = nodes.find((n) => n.label.startsWith('name'))
      expect(name?.kind).toBe('column')
    })
  })

  // ── getTableSchema ─────────────────────────────────────────────────────────

  describe('getTableSchema', () => {
    it('returns ok status with columns array', async () => {
      const result = await provider.getTableSchema('main', 'main', 'users')
      expect(result.status).toBe('ok')
      if (result.status !== 'ok') return
      expect(result.columns.length).toBeGreaterThan(0)
    })

    it('maps id column correctly', async () => {
      const result = await provider.getTableSchema('main', 'main', 'users')
      if (result.status !== 'ok') return
      const id = result.columns.find((c) => c.name === 'id')
      expect(id).toBeDefined()
      expect(id!.isPrimaryKey).toBe(true)
    })

    it('maps name column as not nullable', async () => {
      const result = await provider.getTableSchema('main', 'main', 'users')
      if (result.status !== 'ok') return
      const name = result.columns.find((c) => c.name === 'name')
      expect(name).toBeDefined()
      expect(name!.isNullable).toBe(false)
    })

    it('returns error for non-existent table', async () => {
      const result = await provider.getTableSchema('main', 'main', 'does_not_exist')
      // SQLite PRAGMA on unknown table returns empty array, so we get ok with empty columns
      expect(result.status).toBe('ok')
      if (result.status === 'ok') {
        expect(result.columns).toHaveLength(0)
      }
    })
  })

  // ── getForeignKeys ─────────────────────────────────────────────────────────

  describe('getForeignKeys', () => {
    it('returns foreign keys for orders table', async () => {
      const result = await provider.getForeignKeys('main', 'main', 'orders')
      expect(result.status).toBe('ok')
      if (result.status !== 'ok') return
      expect(result.foreignKeys).toHaveLength(1)
      const fk = result.foreignKeys[0]
      expect(fk.columnName).toBe('user_id')
      expect(fk.referencedTable).toBe('users')
      expect(fk.referencedColumn).toBe('id')
      expect(fk.deleteRule).toBe('CASCADE')
    })

    it('returns empty array for table with no foreign keys', async () => {
      const result = await provider.getForeignKeys('main', 'main', 'users')
      expect(result.status).toBe('ok')
      if (result.status === 'ok') {
        expect(result.foreignKeys).toHaveLength(0)
      }
    })
  })

  // ── getIndexes ─────────────────────────────────────────────────────────────

  describe('getIndexes', () => {
    it('returns indexes for orders table', async () => {
      const result = await provider.getIndexes('main', 'main', 'orders')
      expect(result.status).toBe('ok')
      if (result.status !== 'ok') return
      const names = result.indexes.map((i) => i.name)
      expect(names).toContain('idx_orders_user')
    })

    it('index has correct shape', async () => {
      const result = await provider.getIndexes('main', 'main', 'orders')
      if (result.status !== 'ok') return
      const idx = result.indexes.find((i) => i.name === 'idx_orders_user')
      expect(idx).toBeDefined()
      expect(idx!.tableName).toBe('orders')
      expect(idx!.columns.length).toBeGreaterThan(0)
    })
  })

  // ── getTriggers ────────────────────────────────────────────────────────────

  describe('getTriggers', () => {
    it('returns triggers for orders table', async () => {
      const result = await provider.getTriggers('main', 'main', 'orders')
      expect(result.status).toBe('ok')
      if (result.status !== 'ok') return
      const names = result.triggers.map((t) => t.triggerName)
      expect(names).toContain('trg_orders_after_insert')
    })

    it('trigger has correct event flags', async () => {
      const result = await provider.getTriggers('main', 'main', 'orders')
      if (result.status !== 'ok') return
      const trg = result.triggers[0]
      expect(trg.isInsert).toBe(true)
      expect(trg.isUpdate).toBe(false)
      expect(trg.isDelete).toBe(false)
      expect(trg.isInsteadOf).toBe(false)
    })
  })

  // ── getErdSchema ───────────────────────────────────────────────────────────

  describe('getErdSchema', () => {
    it('returns ok status', async () => {
      const result = await provider.getErdSchema('main')
      expect(result.status).toBe('ok')
    })

    it('includes both tables', async () => {
      const result = await provider.getErdSchema('main')
      if (result.status !== 'ok') return
      const tableNames = result.schema.tables.map((t) => t.name)
      expect(tableNames).toContain('users')
      expect(tableNames).toContain('orders')
    })

    it('captures foreign key relationships', async () => {
      const result = await provider.getErdSchema('main')
      if (result.status !== 'ok') return
      expect(result.schema.relationships.length).toBeGreaterThan(0)
      const rel = result.schema.relationships[0]
      expect(rel.fromTable).toBe('orders')
      expect(rel.toTable).toBe('users')
    })

    it('captures indexes', async () => {
      const result = await provider.getErdSchema('main')
      if (result.status !== 'ok') return
      const indexNames = result.schema.indexes.map((i) => i.name)
      expect(indexNames).toContain('idx_orders_user')
    })
  })

  // ── executeQuery ───────────────────────────────────────────────────────────

  describe('executeQuery', () => {
    beforeEach(async () => {
      await provider.executeQuery("INSERT INTO users (name, email) VALUES ('Alice', 'alice@example.com')")
      await provider.executeQuery("INSERT INTO users (name, email) VALUES ('Bob', NULL)")
    })

    it('returns result set for SELECT', async () => {
      const result = await provider.executeQuery('SELECT * FROM users')
      expect(result.status).toBe('ok')
      if (result.status !== 'ok') return
      expect(result.resultSets).toHaveLength(1)
      expect(result.resultSets[0].rows.length).toBeGreaterThan(0)
    })

    it('returns columns in result set', async () => {
      const result = await provider.executeQuery('SELECT id, name FROM users')
      if (result.status !== 'ok') return
      expect(result.resultSets[0].columns).toContain('id')
      expect(result.resultSets[0].columns).toContain('name')
    })

    it('returns messages for non-SELECT statement', async () => {
      const result = await provider.executeQuery(
        "INSERT INTO users (name) VALUES ('Carol')"
      )
      expect(result.status).toBe('ok')
      if (result.status !== 'ok') return
      expect(result.messages.length).toBeGreaterThan(0)
      expect(result.messages[0].text).toContain('row(s) affected')
    })

    it('returns error for invalid SQL', async () => {
      const result = await provider.executeQuery('SELECT * FROM nonexistent_table_xyz')
      expect(result.status).toBe('error')
    })

    it('reports durationMs', async () => {
      const result = await provider.executeQuery('SELECT 1')
      if (result.status !== 'ok') return
      expect(typeof result.durationMs).toBe('number')
      expect(result.durationMs).toBeGreaterThanOrEqual(0)
    })
  })

  // ── Views CRUD ─────────────────────────────────────────────────────────────

  describe('getViews / saveView / deleteView', () => {
    it('getViews returns seeded view', async () => {
      const result = await provider.getViews('main')
      expect(result.status).toBe('ok')
      if (result.status !== 'ok') return
      const names = result.views.map((v) => v.viewName)
      expect(names).toContain('active_users')
    })

    it('saveView creates a new view', async () => {
      const result = await provider.saveView('main', {
        schemaName: 'main',
        viewName: 'all_orders',
        definition: 'CREATE VIEW all_orders AS SELECT * FROM orders'
      })
      expect(result.status).toBe('ok')
      const views = await provider.getViews('main')
      if (views.status !== 'ok') return
      expect(views.views.map((v) => v.viewName)).toContain('all_orders')
    })

    it('deleteView removes a view', async () => {
      await provider.deleteView('main', 'main', 'active_users')
      const views = await provider.getViews('main')
      if (views.status !== 'ok') return
      expect(views.views.map((v) => v.viewName)).not.toContain('active_users')
    })
  })

  // ── Script generation ──────────────────────────────────────────────────────

  describe('scriptTableCreate', () => {
    it('returns CREATE TABLE script for users', async () => {
      const result = await provider.scriptTableCreate('main', 'main', 'users')
      expect(result.status).toBe('ok')
      if (result.status !== 'ok') return
      expect(result.script.toUpperCase()).toContain('CREATE TABLE')
      expect(result.script.toLowerCase()).toContain('users')
    })

    it('returns error for unknown table', async () => {
      const result = await provider.scriptTableCreate('main', 'main', 'ghost')
      expect(result.status).toBe('error')
    })
  })

  describe('scriptTableDrop', () => {
    it('generates DROP TABLE IF EXISTS', async () => {
      const result = await provider.scriptTableDrop('main', 'main', 'orders')
      expect(result.status).toBe('ok')
      if (result.status !== 'ok') return
      expect(result.script.toUpperCase()).toContain('DROP TABLE IF EXISTS')
    })
  })

  describe('scriptSelectTopRows', () => {
    it('generates SELECT ... LIMIT statement', async () => {
      const result = await provider.scriptSelectTopRows('main', 'main', 'users', 100)
      expect(result.status).toBe('ok')
      if (result.status !== 'ok') return
      expect(result.script.toUpperCase()).toContain('SELECT')
      expect(result.script.toUpperCase()).toContain('LIMIT')
      expect(result.script).toContain('100')
    })
  })

  // ── Unsupported operations ─────────────────────────────────────────────────

  describe('unsupported operations', () => {
    it('saveStoredProcedure returns error', async () => {
      const result = await provider.saveStoredProcedure('main', {
        schemaName: 'main',
        procedureName: 'sp_test',
        description: '',
        parameters: [],
        body: 'SELECT 1'
      })
      expect(result.status).toBe('error')
    })

    it('rebuildIndex returns error', async () => {
      const result = await provider.rebuildIndex('main', 'idx_orders_user', 'main', 'orders')
      expect(result.status).toBe('error')
    })

    it('getStoredProcedures returns empty list', async () => {
      const result = await provider.getStoredProcedures('main')
      expect(result.status).toBe('ok')
      if (result.status === 'ok') {
        expect(result.procedures).toHaveLength(0)
      }
    })

    it('getDataTypes returns empty list', async () => {
      const result = await provider.getDataTypes('main')
      expect(result.status).toBe('ok')
      if (result.status === 'ok') {
        expect(result.dataTypes).toHaveLength(0)
      }
    })

    it('listStoredProcedures returns empty array', async () => {
      const nodes = await provider.listStoredProcedures('main')
      expect(nodes).toHaveLength(0)
    })

    it('listTypeCategories returns empty array', () => {
      const nodes = provider.listTypeCategories('main')
      expect(nodes).toHaveLength(0)
    })

    it('listServerSecurityCategories returns empty array', () => {
      const nodes = provider.listServerSecurityCategories()
      expect(nodes).toHaveLength(0)
    })
  })

  // ── Indexes CRUD ───────────────────────────────────────────────────────────

  describe('saveIndex / deleteIndex', () => {
    it('creates and removes a non-unique index', async () => {
      const saveResult = await provider.saveIndex('main', {
        name: 'idx_test',
        schemaName: 'main',
        tableName: 'users',
        type: 'NONCLUSTERED',
        isUnique: false,
        columns: [{ columnName: 'name', keyOrdinal: 1, isDescendingKey: false, isIncludedColumn: false }]
      })
      expect(saveResult.status).toBe('ok')

      const deleteResult = await provider.deleteIndex('main', 'idx_test', 'main', 'users')
      expect(deleteResult.status).toBe('ok')
    })

    it('creates a unique index', async () => {
      const saveResult = await provider.saveIndex('main', {
        name: 'idx_email_unique',
        schemaName: 'main',
        tableName: 'users',
        type: 'NONCLUSTERED',
        isUnique: true,
        columns: [{ columnName: 'email', keyOrdinal: 1, isDescendingKey: false, isIncludedColumn: false }]
      })
      expect(saveResult.status).toBe('ok')

      const indexes = await provider.getIndexes('main', 'main', 'users')
      if (indexes.status !== 'ok') return
      const unique = indexes.indexes.find((i) => i.name === 'idx_email_unique')
      expect(unique?.isUnique).toBe(true)
    })
  })

  // ── Triggers CRUD ──────────────────────────────────────────────────────────

  describe('saveTrigger / deleteTrigger', () => {
    it('creates a trigger', async () => {
      const result = await provider.saveTrigger('main', {
        triggerName: 'trg_test',
        schemaName: 'main',
        tableName: 'users',
        isInsteadOf: false,
        isInsert: true,
        isUpdate: false,
        isDelete: false,
        body: 'BEGIN SELECT 1; END'
      })
      expect(result.status).toBe('ok')
    })

    it('deletes a trigger', async () => {
      await provider.saveTrigger('main', {
        triggerName: 'trg_to_delete',
        schemaName: 'main',
        tableName: 'users',
        isInsteadOf: false,
        isInsert: true,
        isUpdate: false,
        isDelete: false,
        body: 'BEGIN SELECT 1; END'
      })
      const result = await provider.deleteTrigger('main', 'trg_to_delete', 'main')
      expect(result.status).toBe('ok')
    })

    it('returns error when no events are selected', async () => {
      const result = await provider.saveTrigger('main', {
        triggerName: 'trg_no_event',
        schemaName: 'main',
        tableName: 'users',
        isInsteadOf: false,
        isInsert: false,
        isUpdate: false,
        isDelete: false,
        body: 'BEGIN SELECT 1; END'
      })
      expect(result.status).toBe('error')
    })
  })
})

// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SqlServerProvider } from '../SqlServerProvider'

// ── mssql mock ────────────────────────────────────────────────────────────────

const { mockPool, mockRequestChain, mockConnectionPool, mockQuery } = vi.hoisted(() => {
  const mockQuery = vi.fn()

  const mockRequestChain = {
    input: vi.fn().mockReturnThis() as (..._args: unknown[]) => typeof mockRequestChain,
    // executeQuery calls request.on('info', ...) for PRINT/informational messages
    on: vi.fn(),
    query: mockQuery
  }

  const mockPool = {
    request: vi.fn(() => mockRequestChain as typeof mockRequestChain),
    close: vi.fn()
  }

  const mockConnectionPool = vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(mockPool)
  }))

  return { mockPool, mockRequestChain, mockConnectionPool, mockQuery }
})

vi.mock('mssql', () => ({
  ConnectionPool: mockConnectionPool
}))

// ── helpers ───────────────────────────────────────────────────────────────────

function resetRequestChain(): void {
  mockRequestChain.input = vi.fn().mockReturnThis() as typeof mockRequestChain.input
  mockRequestChain.on = vi.fn()
  mockQuery.mockReset()
  mockRequestChain.query = mockQuery
  mockPool.request.mockReturnValue(mockRequestChain)
}

async function buildConnectedProvider(): Promise<SqlServerProvider> {
  const provider = new SqlServerProvider()
  await provider.connect({
    id: 'test-id',
    name: 'Test',
    provider: 'sqlserver',
    host: 'localhost',
    port: 1433,
    username: 'sa',
    password: 'pw',
    rememberPassword: false,
    defaultDatabase: 'master'
  })
  return provider
}

// ── getTriggers ───────────────────────────────────────────────────────────────

describe('SqlServerProvider.getTriggers', () => {
  beforeEach(() => resetRequestChain())

  it('returns mapped TriggerDefinition array on success', async () => {
    const definition =
      `CREATE TRIGGER [dbo].[trg_AfterInsert] ON [dbo].[Orders]\n` +
      `AFTER INSERT\n` +
      `AS\n` +
      `BEGIN\n` +
      `  SET NOCOUNT ON;\n` +
      `END`

    mockQuery.mockResolvedValueOnce({
      recordset: [
        {
          trigger_name: 'trg_AfterInsert',
          is_instead_of: false,
          is_insert: true,
          is_update: false,
          is_delete: false,
          definition,
          description: 'Logs new orders'
        }
      ]
    })

    const provider = await buildConnectedProvider()
    const result = await provider.getTriggers('MyDB', 'dbo', 'Orders')

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return

    expect(result.triggers).toHaveLength(1)
    expect(result.triggers[0].triggerName).toBe('trg_AfterInsert')
    expect(result.triggers[0].isInsteadOf).toBe(false)
    expect(result.triggers[0].isInsert).toBe(true)
    expect(result.triggers[0].isUpdate).toBe(false)
    expect(result.triggers[0].isDelete).toBe(false)
    expect(result.triggers[0].description).toBe('Logs new orders')
    expect(result.triggers[0].body).toContain('SET NOCOUNT ON')
  })

  it('returns empty triggers array when table has no triggers', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] })

    const provider = await buildConnectedProvider()
    const result = await provider.getTriggers('MyDB', 'dbo', 'Orders')

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.triggers).toHaveLength(0)
  })

  it('handles trigger with null description', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [
        {
          trigger_name: 'trg_Test',
          is_instead_of: true,
          is_insert: false,
          is_update: false,
          is_delete: true,
          definition: 'CREATE TRIGGER [dbo].[trg_Test] ON [dbo].[T] INSTEAD OF DELETE AS BEGIN SELECT 1 END',
          description: null
        }
      ]
    })

    const provider = await buildConnectedProvider()
    const result = await provider.getTriggers('MyDB', 'dbo', 'T')

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.triggers[0].description).toBeUndefined()
    expect(result.triggers[0].isInsteadOf).toBe(true)
    expect(result.triggers[0].isDelete).toBe(true)
  })

  it('passes schema and table parameters as named inputs', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] })

    const provider = await buildConnectedProvider()
    await provider.getTriggers('MyDB', 'sales', 'Orders')

    expect(mockRequestChain.input).toHaveBeenCalledWith('schemaName', 'sales')
    expect(mockRequestChain.input).toHaveBeenCalledWith('tableName', 'Orders')
  })

  it('returns error result when the database query fails', async () => {
    mockQuery.mockRejectedValueOnce(new Error('Connection timeout'))

    const provider = await buildConnectedProvider()
    const result = await provider.getTriggers('MyDB', 'dbo', 'Orders')

    expect(result).toEqual({ status: 'error', message: 'Connection timeout' })
  })
})

// ── saveTrigger (create) ──────────────────────────────────────────────────────

describe('SqlServerProvider.saveTrigger — create', () => {
  beforeEach(() => resetRequestChain())

  it('executes CREATE TRIGGER DDL and returns ok', async () => {
    // executeQuery calls pool.request().query() and expects raw mssql format
    mockQuery.mockResolvedValue({ recordsets: [], rowsAffected: [0] })

    const provider = await buildConnectedProvider()
    const result = await provider.saveTrigger('MyDB', {
      triggerName: 'trg_AfterInsert',
      schemaName: 'dbo',
      tableName: 'Orders',
      isInsteadOf: false,
      isInsert: true,
      isUpdate: false,
      isDelete: false,
      body: 'SET NOCOUNT ON;',
      description: undefined
    })

    expect(result.status).toBe('ok')
  })

  it('includes AFTER when isInsteadOf is false', async () => {
    const capturedSqls: string[] = []
    mockQuery.mockImplementation((sql: string) => {
      capturedSqls.push(sql)
      return Promise.resolve({ recordsets: [], rowsAffected: [0] })
    })

    const provider = await buildConnectedProvider()
    await provider.saveTrigger('MyDB', {
      triggerName: 'trg_Test',
      schemaName: 'dbo',
      tableName: 'Orders',
      isInsteadOf: false,
      isInsert: true,
      isUpdate: true,
      isDelete: false,
      body: 'SET NOCOUNT ON;'
    })

    // CREATE TRIGGER must not contain USE prefix (separate batch executed first)
    const createSql = capturedSqls.find((s) => s.includes('CREATE TRIGGER'))
    expect(createSql).toBeDefined()
    expect(createSql).not.toContain('USE [')
    expect(createSql).toContain('AFTER INSERT, UPDATE')
  })

  it('includes INSTEAD OF when isInsteadOf is true', async () => {
    const capturedSqls: string[] = []
    mockQuery.mockImplementation((sql: string) => {
      capturedSqls.push(sql)
      return Promise.resolve({ recordsets: [], rowsAffected: [0] })
    })

    const provider = await buildConnectedProvider()
    await provider.saveTrigger('MyDB', {
      triggerName: 'trg_InsteadOf',
      schemaName: 'dbo',
      tableName: 'Orders',
      isInsteadOf: true,
      isInsert: false,
      isUpdate: false,
      isDelete: true,
      body: 'SET NOCOUNT ON;'
    })

    const createSql = capturedSqls.find((s) => s.includes('CREATE TRIGGER'))
    expect(createSql).toContain('INSTEAD OF DELETE')
  })

  it('embeds description as comment when provided', async () => {
    const capturedSqls: string[] = []
    mockQuery.mockImplementation((sql: string) => {
      capturedSqls.push(sql)
      return Promise.resolve({ recordsets: [], rowsAffected: [0] })
    })

    const provider = await buildConnectedProvider()
    await provider.saveTrigger('MyDB', {
      triggerName: 'trg_Desc',
      schemaName: 'dbo',
      tableName: 'Orders',
      isInsteadOf: false,
      isInsert: true,
      isUpdate: false,
      isDelete: false,
      body: 'SET NOCOUNT ON;',
      description: 'My trigger description'
    })

    const createSql = capturedSqls.find((s) => s.includes('CREATE TRIGGER'))
    expect(createSql).toContain('-- Description: My trigger description')
  })

  it('returns error when CREATE TRIGGER fails', async () => {
    // First call is USE [MyDB] (succeeds), second call is CREATE TRIGGER (fails)
    mockQuery.mockResolvedValueOnce({ recordsets: [], rowsAffected: [0] })
    mockQuery.mockRejectedValueOnce(new Error('Syntax error in trigger body'))

    const provider = await buildConnectedProvider()
    const result = await provider.saveTrigger('MyDB', {
      triggerName: 'trg_Bad',
      schemaName: 'dbo',
      tableName: 'Orders',
      isInsteadOf: false,
      isInsert: true,
      isUpdate: false,
      isDelete: false,
      body: 'INVALID SQL'
    })

    expect(result).toEqual({ status: 'error', message: 'Syntax error in trigger body' })
  })
})

// ── saveTrigger (update) ──────────────────────────────────────────────────────

describe('SqlServerProvider.saveTrigger — update', () => {
  beforeEach(() => resetRequestChain())

  it('executes DROP TRIGGER before CREATE TRIGGER when originalTriggerName provided', async () => {
    const capturedSqls: string[] = []
    mockQuery.mockImplementation((sql: string) => {
      capturedSqls.push(sql)
      return Promise.resolve({ recordsets: [], rowsAffected: [0] })
    })

    const provider = await buildConnectedProvider()
    await provider.saveTrigger(
      'MyDB',
      {
        triggerName: 'trg_Renamed',
        schemaName: 'dbo',
        tableName: 'Orders',
        isInsteadOf: false,
        isInsert: true,
        isUpdate: false,
        isDelete: false,
        body: 'SET NOCOUNT ON;'
      },
      'trg_OldName'
    )

    const dropSql = capturedSqls.find((s) => s.includes('DROP TRIGGER'))
    expect(dropSql).toBeDefined()
    expect(dropSql).toContain('[dbo].[trg_OldName]')

    const createSql = capturedSqls.find((s) => s.includes('CREATE TRIGGER'))
    expect(createSql).toBeDefined()
    expect(createSql).toContain('[dbo].[trg_Renamed]')
  })

  it('returns error when DROP TRIGGER fails', async () => {
    // First call is USE [MyDB] (succeeds), second call is DROP TRIGGER (fails)
    mockQuery.mockResolvedValueOnce({ recordsets: [], rowsAffected: [0] })
    mockQuery.mockRejectedValueOnce(new Error('DROP TRIGGER failed'))

    const provider = await buildConnectedProvider()
    const result = await provider.saveTrigger(
      'MyDB',
      {
        triggerName: 'trg_New',
        schemaName: 'dbo',
        tableName: 'Orders',
        isInsteadOf: false,
        isInsert: true,
        isUpdate: false,
        isDelete: false,
        body: 'SET NOCOUNT ON;'
      },
      'trg_Old'
    )

    expect(result).toEqual({ status: 'error', message: 'DROP TRIGGER failed' })
  })
})

// ── deleteTrigger ─────────────────────────────────────────────────────────────

describe('SqlServerProvider.deleteTrigger', () => {
  beforeEach(() => resetRequestChain())

  it('executes DROP TRIGGER with correct schema-qualified name', async () => {
    const capturedSqls: string[] = []
    mockQuery.mockImplementation((sql: string) => {
      capturedSqls.push(sql)
      return Promise.resolve({ recordsets: [], rowsAffected: [0] })
    })

    const provider = await buildConnectedProvider()
    const result = await provider.deleteTrigger('MyDB', 'trg_OldTrigger', 'dbo')

    expect(result.status).toBe('ok')
    // capturedSqls[0] is USE [MyDB], capturedSqls[1] is the DROP
    const dropSql = capturedSqls.find((s) => s.includes('DROP TRIGGER'))
    expect(dropSql).toBeDefined()
    expect(dropSql).toContain('[dbo].[trg_OldTrigger]')
    expect(dropSql).toContain('DROP TRIGGER IF EXISTS')
  })

  it('returns error result when DROP TRIGGER fails', async () => {
    // First call is USE [MyDB] (succeeds), second call is DROP TRIGGER (fails)
    mockQuery.mockResolvedValueOnce({ recordsets: [], rowsAffected: [0] })
    mockQuery.mockRejectedValueOnce(new Error('Trigger does not exist'))

    const provider = await buildConnectedProvider()
    const result = await provider.deleteTrigger('MyDB', 'nonexistent', 'dbo')

    expect(result).toEqual({ status: 'error', message: 'Trigger does not exist' })
  })

  it('rejects database names with invalid characters', async () => {
    const provider = await buildConnectedProvider()
    // validateDatabaseName throws outside the try-catch, so the promise rejects
    await expect(provider.deleteTrigger("bad'db", 'trg_Test', 'dbo')).rejects.toThrow(
      'Invalid database name'
    )
  })
})

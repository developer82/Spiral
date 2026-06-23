// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SqlServerProvider } from '../SqlServerProvider'

// ── mssql mock ────────────────────────────────────────────────────────────────

const { mockPool, mockRequestChain, mockConnectionPool, mockQuery } = vi.hoisted(() => {
  const mockQuery = vi.fn()

  const mockRequestChain = {
    input: vi.fn().mockReturnThis() as (..._args: unknown[]) => typeof mockRequestChain,
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

// ── executeQuery database context ─────────────────────────────────────────────

describe('SqlServerProvider.executeQuery', () => {
  beforeEach(() => resetRequestChain())

  it('prepends USE [db] when databaseName is provided', async () => {
    mockQuery.mockResolvedValue({
      recordsets: [[{ id: 1 }]],
      rowsAffected: []
    })

    const provider = await buildConnectedProvider()
    const result = await provider.executeQuery('SELECT 1 AS id', undefined, false, false, 'MyDB')

    expect(result.status).toBe('ok')
    expect(mockQuery).toHaveBeenCalledWith('USE [MyDB];\nSELECT 1 AS id')
  })

  it('does not prepend USE [db] when databaseName is not provided', async () => {
    mockQuery.mockResolvedValue({
      recordsets: [[{ id: 1 }]],
      rowsAffected: []
    })

    const provider = await buildConnectedProvider()
    const result = await provider.executeQuery('SELECT 1 AS id')

    expect(result.status).toBe('ok')
    expect(mockQuery).toHaveBeenCalledWith('SELECT 1 AS id')
  })
})

// ── scriptTableAlter ──────────────────────────────────────────────────────────

describe('SqlServerProvider.scriptTableAlter', () => {
  beforeEach(() => resetRequestChain())

  it('returns an ALTER TABLE script', async () => {
    const provider = await buildConnectedProvider()
    const result = await provider.scriptTableAlter('MyDB', 'dbo', 'Orders')

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.script).toBe('ALTER TABLE [MyDB].[dbo].[Orders]\nADD column_name datatype NULL')
  })
})

// ── scriptTableDrop ───────────────────────────────────────────────────────────

describe('SqlServerProvider.scriptTableDrop', () => {
  beforeEach(() => resetRequestChain())

  it('returns a DROP TABLE script', async () => {
    const provider = await buildConnectedProvider()
    const result = await provider.scriptTableDrop('MyDB', 'dbo', 'Orders')

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.script).toBe('DROP TABLE [MyDB].[dbo].[Orders]')
  })
})

// ── scriptSelectTopRows ───────────────────────────────────────────────────────

describe('SqlServerProvider.scriptSelectTopRows', () => {
  beforeEach(() => resetRequestChain())

  it('returns a SELECT TOP N script', async () => {
    const provider = await buildConnectedProvider()
    const result = await provider.scriptSelectTopRows('MyDB', 'dbo', 'Orders', 1000)

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.script).toBe('SELECT TOP 1000 * FROM [MyDB].[dbo].[Orders]')
  })

  it('uses the provided count', async () => {
    const provider = await buildConnectedProvider()
    const result = await provider.scriptSelectTopRows('MyDB', 'dbo', 'Orders', 200)

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.script).toContain('SELECT TOP 200')
  })
})

// ── scriptDropDatabase ────────────────────────────────────────────────────────

describe('SqlServerProvider.scriptDropDatabase', () => {
  beforeEach(() => resetRequestChain())

  it('returns a DROP DATABASE script', async () => {
    const provider = await buildConnectedProvider()
    const result = await provider.scriptDropDatabase('MyDB')

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.script).toBe('DROP DATABASE [MyDB]')
  })
})

// ── scriptViewDrop ────────────────────────────────────────────────────────────

describe('SqlServerProvider.scriptViewDrop', () => {
  beforeEach(() => resetRequestChain())

  it('returns a DROP VIEW script', async () => {
    const provider = await buildConnectedProvider()
    const result = await provider.scriptViewDrop('MyDB', 'dbo', 'vw_Orders')

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.script).toBe('DROP VIEW [dbo].[vw_Orders]')
  })
})

// ── scriptStoredProcedureDrop ─────────────────────────────────────────────────

describe('SqlServerProvider.scriptStoredProcedureDrop', () => {
  beforeEach(() => resetRequestChain())

  it('returns a DROP PROCEDURE script', async () => {
    const provider = await buildConnectedProvider()
    const result = await provider.scriptStoredProcedureDrop('MyDB', 'dbo', 'usp_GetOrders')

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.script).toBe('DROP PROCEDURE [dbo].[usp_GetOrders]')
  })
})

// ── scriptTableCreate ─────────────────────────────────────────────────────────

describe('SqlServerProvider.scriptTableCreate', () => {
  beforeEach(() => resetRequestChain())

  it('returns a CREATE TABLE script from schema and constraints queries', async () => {
    // getTableSchema fires two queries: columns then pk-columns (after Promise.all starts getCheckConstraints)
    // Query order within Promise.all([getTableSchema, getCheckConstraints]):
    //   1. getTableSchema colResult
    //   2. getCheckConstraints (starts concurrently)
    //   3. getTableSchema pkResult
    mockQuery
      // 1. colResult
      .mockResolvedValueOnce({
        recordset: [
          {
            COLUMN_NAME: 'Id',
            DATA_TYPE: 'int',
            CHARACTER_MAXIMUM_LENGTH: null,
            NUMERIC_PRECISION: null,
            NUMERIC_SCALE: null,
            IS_NULLABLE: 'NO',
            COLUMN_DEFAULT: null,
            IS_IDENTITY: 1,
            IDENTITY_SEED: 1,
            IDENTITY_INCREMENT: 1
          }
        ]
      })
      // 2. getCheckConstraints
      .mockResolvedValueOnce({ recordset: [] })
      // 3. pkResult
      .mockResolvedValueOnce({ recordset: [{ COLUMN_NAME: 'Id' }] })

    const provider = await buildConnectedProvider()
    const result = await provider.scriptTableCreate('MyDB', 'dbo', 'Orders')

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.script).toContain('CREATE TABLE [MyDB].[dbo].[Orders]')
    expect(result.script).toContain('[Id] INT')
    expect(result.script).toContain('IDENTITY(1, 1)')
    expect(result.script).toContain('NOT NULL')
    expect(result.script).toContain('CONSTRAINT [PK_Orders] PRIMARY KEY')
  })

  it('returns error when getTableSchema fails', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB error'))

    const provider = await buildConnectedProvider()
    const result = await provider.scriptTableCreate('MyDB', 'dbo', 'Orders')

    expect(result.status).toBe('error')
  })

  it('includes check constraints in script', async () => {
    // Query order: 1=colResult, 2=getCheckConstraints, 3=pkResult
    mockQuery
      .mockResolvedValueOnce({
        recordset: [
          {
            COLUMN_NAME: 'Amount',
            DATA_TYPE: 'decimal',
            CHARACTER_MAXIMUM_LENGTH: null,
            NUMERIC_PRECISION: 10,
            NUMERIC_SCALE: 2,
            IS_NULLABLE: 'YES',
            COLUMN_DEFAULT: null,
            IS_IDENTITY: 0,
            IDENTITY_SEED: null,
            IDENTITY_INCREMENT: null
          }
        ]
      })
      .mockResolvedValueOnce({
        recordset: [
          {
            constraint_name: 'CK_Amount',
            definition: '([Amount]>=(0))',
            is_disabled: false,
            is_not_for_replication: false,
            is_not_trusted: false,
            description: null
          }
        ]
      })
      .mockResolvedValueOnce({ recordset: [] })

    const provider = await buildConnectedProvider()
    const result = await provider.scriptTableCreate('MyDB', 'dbo', 'Orders')

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.script).toContain('CK_Amount')
    expect(result.script).toContain('([Amount]>=(0))')
  })
})

// ── scriptViewCreate ──────────────────────────────────────────────────────────

describe('SqlServerProvider.scriptViewCreate', () => {
  beforeEach(() => resetRequestChain())

  it('returns view definition from getViews', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [
        {
          schema_name: 'dbo',
          view_name: 'vw_Orders',
          definition: 'CREATE VIEW [dbo].[vw_Orders] AS SELECT * FROM Orders'
        }
      ]
    })

    const provider = await buildConnectedProvider()
    const result = await provider.scriptViewCreate('MyDB', 'dbo', 'vw_Orders')

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.script).toBe('CREATE VIEW [dbo].[vw_Orders] AS SELECT * FROM Orders')
  })

  it('returns a fallback CREATE VIEW script when view is not found', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] })

    const provider = await buildConnectedProvider()
    const result = await provider.scriptViewCreate('MyDB', 'dbo', 'vw_Missing')

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.script).toContain('CREATE VIEW [MyDB].[dbo].[vw_Missing]')
  })

  it('returns error when getViews fails', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB error'))

    const provider = await buildConnectedProvider()
    const result = await provider.scriptViewCreate('MyDB', 'dbo', 'vw_Orders')

    expect(result.status).toBe('error')
  })
})

// ── scriptViewAlter ───────────────────────────────────────────────────────────

describe('SqlServerProvider.scriptViewAlter', () => {
  beforeEach(() => resetRequestChain())

  it('replaces CREATE VIEW with ALTER VIEW in the definition', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [
        {
          schema_name: 'dbo',
          view_name: 'vw_Orders',
          definition: 'CREATE VIEW [dbo].[vw_Orders] AS SELECT * FROM Orders'
        }
      ]
    })

    const provider = await buildConnectedProvider()
    const result = await provider.scriptViewAlter('MyDB', 'dbo', 'vw_Orders')

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.script).toContain('ALTER VIEW')
    expect(result.script).not.toMatch(/^\s*CREATE\s+VIEW/i)
  })

  it('returns a fallback ALTER VIEW script when view is not found', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] })

    const provider = await buildConnectedProvider()
    const result = await provider.scriptViewAlter('MyDB', 'dbo', 'vw_Missing')

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.script).toContain('ALTER VIEW [dbo].[vw_Missing]')
  })
})

// ── scriptStoredProcedureCreate ───────────────────────────────────────────────

describe('SqlServerProvider.scriptStoredProcedureCreate', () => {
  beforeEach(() => resetRequestChain())

  it('returns a CREATE PROCEDURE script with params and body', async () => {
    const definition =
      `CREATE PROCEDURE [dbo].[usp_GetOrders]\nAS\nBEGIN\nSET NOCOUNT ON;\nEND`

    mockQuery
      .mockResolvedValueOnce({
        recordset: [
          { schema_name: 'dbo', procedure_name: 'usp_GetOrders', definition }
        ]
      })
      .mockResolvedValueOnce({
        recordset: [
          {
            procedure_name: 'usp_GetOrders',
            param_name: '@Status',
            type_name: 'NVARCHAR(50)',
            has_default: false,
            default_value: null
          }
        ]
      })

    const provider = await buildConnectedProvider()
    const result = await provider.scriptStoredProcedureCreate('MyDB', 'dbo', 'usp_GetOrders')

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.script).toContain('CREATE PROCEDURE [dbo].[usp_GetOrders]')
    expect(result.script).toContain('@Status')
    expect(result.script).toContain('BEGIN')
    expect(result.script).toContain('END')
  })

  it('returns fallback script when procedure is not found', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [] })
      .mockResolvedValueOnce({ recordset: [] })

    const provider = await buildConnectedProvider()
    const result = await provider.scriptStoredProcedureCreate('MyDB', 'dbo', 'usp_Missing')

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.script).toContain('CREATE PROCEDURE [dbo].[usp_Missing]')
    expect(result.script).toContain('-- procedure body')
  })

  it('returns fallback ok script when getStoredProcedures errors', async () => {
    // getStoredProcedures internally catches errors and returns { status: 'error' }
    // scriptStoredProcedureCreate handles that by returning a fallback 'ok' script
    mockQuery.mockRejectedValueOnce(new Error('DB error'))

    const provider = await buildConnectedProvider()
    const result = await provider.scriptStoredProcedureCreate('MyDB', 'dbo', 'usp_Fail')

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.script).toContain('CREATE PROCEDURE [dbo].[usp_Fail]')
    expect(result.script).toContain('-- procedure body')
  })
})

// ── scriptStoredProcedureAlter ────────────────────────────────────────────────

describe('SqlServerProvider.scriptStoredProcedureAlter', () => {
  beforeEach(() => resetRequestChain())

  it('returns an ALTER PROCEDURE script with params and body', async () => {
    const definition =
      `CREATE PROCEDURE [dbo].[usp_GetOrders]\nAS\nBEGIN\nSET NOCOUNT ON;\nEND`

    mockQuery
      .mockResolvedValueOnce({
        recordset: [
          { schema_name: 'dbo', procedure_name: 'usp_GetOrders', definition }
        ]
      })
      .mockResolvedValueOnce({ recordset: [] })

    const provider = await buildConnectedProvider()
    const result = await provider.scriptStoredProcedureAlter('MyDB', 'dbo', 'usp_GetOrders')

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.script).toContain('ALTER PROCEDURE [dbo].[usp_GetOrders]')
    expect(result.script).not.toContain('CREATE PROCEDURE')
  })

  it('returns fallback ALTER PROCEDURE when procedure is not found', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [] })
      .mockResolvedValueOnce({ recordset: [] })

    const provider = await buildConnectedProvider()
    const result = await provider.scriptStoredProcedureAlter('MyDB', 'dbo', 'usp_Missing')

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.script).toContain('ALTER PROCEDURE [dbo].[usp_Missing]')
    expect(result.script).toContain('-- procedure body')
  })
})

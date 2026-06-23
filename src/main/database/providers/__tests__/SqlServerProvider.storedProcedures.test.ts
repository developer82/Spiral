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

// ── getStoredProcedures ───────────────────────────────────────────────────────

describe('SqlServerProvider.getStoredProcedures', () => {
  beforeEach(() => resetRequestChain())

  it('returns mapped StoredProcedureDefinition array on success', async () => {
    const definition =
      `CREATE PROCEDURE [dbo].[usp_GetOrders]\n` +
      `AS\n` +
      `BEGIN\n` +
      `-- Description: Retrieves all orders\n` +
      `SET NOCOUNT ON;\n` +
      `SELECT * FROM Orders\n` +
      `END`

    // First query: procedures list
    mockQuery
      .mockResolvedValueOnce({
        recordset: [
          {
            schema_name: 'dbo',
            procedure_name: 'usp_GetOrders',
            definition
          }
        ]
      })
      // Second query: parameters list
      .mockResolvedValueOnce({
        recordset: [
          {
            procedure_name: 'usp_GetOrders',
            param_name: '@Status',
            type_name: 'NVARCHAR',
            has_default: true,
            default_value: 'NULL'
          }
        ]
      })

    const provider = await buildConnectedProvider()
    const result = await provider.getStoredProcedures('MyDB')

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return

    expect(result.procedures).toHaveLength(1)
    const proc = result.procedures[0]
    expect(proc.procedureName).toBe('usp_GetOrders')
    expect(proc.schemaName).toBe('dbo')
    expect(proc.description).toBe('Retrieves all orders')
    expect(proc.parameters).toHaveLength(1)
    expect(proc.parameters[0].name).toBe('@Status')
    expect(proc.parameters[0].type).toBe('NVARCHAR')
    expect(proc.parameters[0].defaultValue).toBe('NULL')
    // Body should not contain description comment or header
    expect(proc.body).not.toContain('Description:')
    expect(proc.body).not.toContain('CREATE PROCEDURE')
    expect(proc.body).toContain('SELECT * FROM Orders')
  })

  it('returns empty procedures array when database has no stored procedures', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [] })
      .mockResolvedValueOnce({ recordset: [] })

    const provider = await buildConnectedProvider()
    const result = await provider.getStoredProcedures('MyDB')

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.procedures).toHaveLength(0)
  })

  it('strips BEGIN/END wrapper from body correctly', async () => {
    const definition =
      `CREATE PROCEDURE [dbo].[usp_Test] AS\n` +
      `BEGIN\n` +
      `SET NOCOUNT ON;\n` +
      `END`

    mockQuery
      .mockResolvedValueOnce({
        recordset: [{ schema_name: 'dbo', procedure_name: 'usp_Test', definition }]
      })
      .mockResolvedValueOnce({ recordset: [] })

    const provider = await buildConnectedProvider()
    const result = await provider.getStoredProcedures('MyDB')

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.procedures[0].body).toBe('SET NOCOUNT ON;')
    expect(result.procedures[0].body).not.toContain('BEGIN')
    expect(result.procedures[0].body).not.toContain('END')
  })

  it('handles procedure with null description comment', async () => {
    const definition =
      `CREATE PROCEDURE [dbo].[usp_NoDesc] AS\n` +
      `BEGIN\n` +
      `SELECT 1\n` +
      `END`

    mockQuery
      .mockResolvedValueOnce({
        recordset: [{ schema_name: 'dbo', procedure_name: 'usp_NoDesc', definition }]
      })
      .mockResolvedValueOnce({ recordset: [] })

    const provider = await buildConnectedProvider()
    const result = await provider.getStoredProcedures('MyDB')

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.procedures[0].description).toBe('')
  })

  it('handles parameter without default value', async () => {
    const definition = `CREATE PROCEDURE [dbo].[usp_Param] AS BEGIN SELECT 1 END`

    mockQuery
      .mockResolvedValueOnce({
        recordset: [{ schema_name: 'dbo', procedure_name: 'usp_Param', definition }]
      })
      .mockResolvedValueOnce({
        recordset: [
          {
            procedure_name: 'usp_Param',
            param_name: '@Id',
            type_name: 'INT',
            has_default: false,
            default_value: null
          }
        ]
      })

    const provider = await buildConnectedProvider()
    const result = await provider.getStoredProcedures('MyDB')

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.procedures[0].parameters[0].defaultValue).toBeUndefined()
  })

  it('returns error result when the database query fails', async () => {
    mockQuery.mockRejectedValueOnce(new Error('Query timeout'))

    const provider = await buildConnectedProvider()
    const result = await provider.getStoredProcedures('MyDB')

    expect(result).toEqual({ status: 'error', message: 'Query timeout' })
  })

  it('rejects invalid database names', async () => {
    const provider = await buildConnectedProvider()
    await expect(provider.getStoredProcedures("bad'db")).rejects.toThrow('Invalid database name')
  })
})

// ── saveStoredProcedure (create) ──────────────────────────────────────────────

describe('SqlServerProvider.saveStoredProcedure — create', () => {
  beforeEach(() => resetRequestChain())

  it('executes CREATE OR ALTER PROCEDURE DDL and returns ok', async () => {
    mockQuery.mockResolvedValue({ recordsets: [], rowsAffected: [0] })

    const provider = await buildConnectedProvider()
    const result = await provider.saveStoredProcedure('MyDB', {
      schemaName: 'dbo',
      procedureName: 'usp_MyProc',
      description: '',
      parameters: [],
      body: 'SELECT 1'
    })

    expect(result.status).toBe('ok')
  })

  it('includes CREATE OR ALTER PROCEDURE with schema-qualified name', async () => {
    const capturedSqls: string[] = []
    mockQuery.mockImplementation((sql: string) => {
      capturedSqls.push(sql)
      return Promise.resolve({ recordsets: [], rowsAffected: [0] })
    })

    const provider = await buildConnectedProvider()
    await provider.saveStoredProcedure('MyDB', {
      schemaName: 'sales',
      procedureName: 'usp_GetSales',
      description: '',
      parameters: [],
      body: 'SELECT * FROM Sales'
    })

    const createSql = capturedSqls.find((s) => s.includes('CREATE OR ALTER PROCEDURE'))
    expect(createSql).toBeDefined()
    expect(createSql).toContain('[sales].[usp_GetSales]')
    expect(createSql).toContain('SELECT * FROM Sales')
  })

  it('includes parameters in CREATE PROCEDURE DDL', async () => {
    const capturedSqls: string[] = []
    mockQuery.mockImplementation((sql: string) => {
      capturedSqls.push(sql)
      return Promise.resolve({ recordsets: [], rowsAffected: [0] })
    })

    const provider = await buildConnectedProvider()
    await provider.saveStoredProcedure('MyDB', {
      schemaName: 'dbo',
      procedureName: 'usp_WithParams',
      description: '',
      parameters: [
        { name: '@Id', type: 'INT' },
        { name: '@Name', type: 'NVARCHAR(100)', defaultValue: 'NULL' }
      ],
      body: 'SELECT @Id, @Name'
    })

    const createSql = capturedSqls.find((s) => s.includes('CREATE OR ALTER PROCEDURE'))
    expect(createSql).toBeDefined()
    expect(createSql).toContain('@Id INT')
    expect(createSql).toContain('@Name NVARCHAR(100) = NULL')
  })

  it('embeds description as comment when provided', async () => {
    const capturedSqls: string[] = []
    mockQuery.mockImplementation((sql: string) => {
      capturedSqls.push(sql)
      return Promise.resolve({ recordsets: [], rowsAffected: [0] })
    })

    const provider = await buildConnectedProvider()
    await provider.saveStoredProcedure('MyDB', {
      schemaName: 'dbo',
      procedureName: 'usp_Desc',
      description: 'My stored procedure description',
      parameters: [],
      body: 'SELECT 1'
    })

    const createSql = capturedSqls.find((s) => s.includes('CREATE OR ALTER PROCEDURE'))
    expect(createSql).toContain('-- Description: My stored procedure description')
  })

  it('wraps body in BEGIN...END block', async () => {
    const capturedSqls: string[] = []
    mockQuery.mockImplementation((sql: string) => {
      capturedSqls.push(sql)
      return Promise.resolve({ recordsets: [], rowsAffected: [0] })
    })

    const provider = await buildConnectedProvider()
    await provider.saveStoredProcedure('MyDB', {
      schemaName: 'dbo',
      procedureName: 'usp_Test',
      description: '',
      parameters: [],
      body: 'SELECT 1'
    })

    const createSql = capturedSqls.find((s) => s.includes('CREATE OR ALTER PROCEDURE'))
    expect(createSql).toContain('BEGIN')
    expect(createSql).toContain('END')
  })

  it('returns error when CREATE PROCEDURE fails', async () => {
    // First call is USE [MyDB] (succeeds), second is CREATE (fails)
    mockQuery
      .mockResolvedValueOnce({ recordsets: [], rowsAffected: [0] })
      .mockRejectedValueOnce(new Error('Syntax error in procedure body'))

    const provider = await buildConnectedProvider()
    const result = await provider.saveStoredProcedure('MyDB', {
      schemaName: 'dbo',
      procedureName: 'usp_Bad',
      description: '',
      parameters: [],
      body: 'INVALID SQL'
    })

    expect(result).toEqual({ status: 'error', message: 'Syntax error in procedure body' })
  })
})

// ── saveStoredProcedure (rename) ──────────────────────────────────────────────

describe('SqlServerProvider.saveStoredProcedure — rename', () => {
  beforeEach(() => resetRequestChain())

  it('drops old procedure before creating when name changes', async () => {
    const capturedSqls: string[] = []
    mockQuery.mockImplementation((sql: string) => {
      capturedSqls.push(sql)
      return Promise.resolve({ recordsets: [], rowsAffected: [0] })
    })

    const provider = await buildConnectedProvider()
    await provider.saveStoredProcedure(
      'MyDB',
      {
        schemaName: 'dbo',
        procedureName: 'usp_NewName',
        description: '',
        parameters: [],
        body: 'SELECT 1'
      },
      'usp_OldName'
    )

    const dropSql = capturedSqls.find((s) => s.includes('DROP PROCEDURE'))
    expect(dropSql).toBeDefined()
    expect(dropSql).toContain('[dbo].[usp_OldName]')

    const createSql = capturedSqls.find((s) => s.includes('CREATE OR ALTER PROCEDURE'))
    expect(createSql).toBeDefined()
    expect(createSql).toContain('[dbo].[usp_NewName]')
  })

  it('does not drop when name is unchanged', async () => {
    const capturedSqls: string[] = []
    mockQuery.mockImplementation((sql: string) => {
      capturedSqls.push(sql)
      return Promise.resolve({ recordsets: [], rowsAffected: [0] })
    })

    const provider = await buildConnectedProvider()
    await provider.saveStoredProcedure(
      'MyDB',
      {
        schemaName: 'dbo',
        procedureName: 'usp_SameName',
        description: '',
        parameters: [],
        body: 'SELECT 1'
      },
      'usp_SameName'
    )

    const dropSql = capturedSqls.find((s) => s.includes('DROP PROCEDURE'))
    expect(dropSql).toBeUndefined()
  })

  it('returns error when DROP PROCEDURE fails during rename', async () => {
    // First call is USE [MyDB] (succeeds), second is DROP (fails)
    mockQuery
      .mockResolvedValueOnce({ recordsets: [], rowsAffected: [0] })
      .mockRejectedValueOnce(new Error('Drop failed'))

    const provider = await buildConnectedProvider()
    const result = await provider.saveStoredProcedure(
      'MyDB',
      {
        schemaName: 'dbo',
        procedureName: 'usp_New',
        description: '',
        parameters: [],
        body: 'SELECT 1'
      },
      'usp_Old'
    )

    expect(result).toEqual({ status: 'error', message: 'Drop failed' })
  })
})

// ── deleteStoredProcedure ─────────────────────────────────────────────────────

describe('SqlServerProvider.deleteStoredProcedure', () => {
  beforeEach(() => resetRequestChain())

  it('executes DROP PROCEDURE IF EXISTS with correct schema-qualified name', async () => {
    const capturedSqls: string[] = []
    mockQuery.mockImplementation((sql: string) => {
      capturedSqls.push(sql)
      return Promise.resolve({ recordsets: [], rowsAffected: [0] })
    })

    const provider = await buildConnectedProvider()
    const result = await provider.deleteStoredProcedure('MyDB', 'dbo', 'usp_OldProc')

    expect(result.status).toBe('ok')
    const dropSql = capturedSqls.find((s) => s.includes('DROP PROCEDURE'))
    expect(dropSql).toBeDefined()
    expect(dropSql).toContain('DROP PROCEDURE IF EXISTS')
    expect(dropSql).toContain('[dbo].[usp_OldProc]')
  })

  it('returns error result when DROP PROCEDURE fails', async () => {
    // First call is USE [MyDB] (succeeds), second is DROP (fails)
    mockQuery
      .mockResolvedValueOnce({ recordsets: [], rowsAffected: [0] })
      .mockRejectedValueOnce(new Error('Permission denied'))

    const provider = await buildConnectedProvider()
    const result = await provider.deleteStoredProcedure('MyDB', 'dbo', 'usp_Restricted')

    expect(result).toEqual({ status: 'error', message: 'Permission denied' })
  })

  it('rejects invalid database names', async () => {
    const provider = await buildConnectedProvider()
    await expect(provider.deleteStoredProcedure("bad'db", 'dbo', 'usp_Test')).rejects.toThrow(
      'Invalid database name'
    )
  })
})

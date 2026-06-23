// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SqlServerProvider } from '../SqlServerProvider'

// ── mssql mock ────────────────────────────────────────────────────────────────

const { mockPool, mockRequestChain, mockConnectionPool, mockQuery } = vi.hoisted(() => {
  const mockQuery = vi.fn()

  const mockRequestChain = {
    input: vi.fn().mockReturnThis() as (..._args: unknown[]) => typeof mockRequestChain,
    // executeQuery calls request.on('info', ...) for informational messages
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

// ── getTableTypes ─────────────────────────────────────────────────────────────

describe('SqlServerProvider.getTableTypes', () => {
  beforeEach(() => {
    resetRequestChain()
  })

  it('returns ok status with table types when query succeeds', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [
        { schema_name: 'dbo', name: 'CustomerType' },
        { schema_name: 'sales', name: 'OrderType' }
      ]
    })

    const provider = await buildConnectedProvider()
    const result = await provider.getTableTypes('MyDB')

    expect(result.status).toBe('ok')
    if (result.status === 'ok') {
      expect(result.tableTypes).toHaveLength(2)
      expect(result.tableTypes[0]).toEqual({ schemaName: 'dbo', typeName: 'CustomerType' })
      expect(result.tableTypes[1]).toEqual({ schemaName: 'sales', typeName: 'OrderType' })
    }
  })

  it('returns ok with empty array when no table types exist', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] })

    const provider = await buildConnectedProvider()
    const result = await provider.getTableTypes('MyDB')

    expect(result.status).toBe('ok')
    if (result.status === 'ok') {
      expect(result.tableTypes).toHaveLength(0)
    }
  })

  it('returns error status when query throws', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB connection lost'))

    const provider = await buildConnectedProvider()
    const result = await provider.getTableTypes('MyDB')

    expect(result.status).toBe('error')
    if (result.status === 'error') {
      expect(result.message).toContain('DB connection lost')
    }
  })
})

// ── getTableType ──────────────────────────────────────────────────────────────

describe('SqlServerProvider.getTableType', () => {
  beforeEach(() => {
    resetRequestChain()
  })

  it('returns columns for a given table type', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [
        {
          col_name: 'Id',
          type_name: 'int',
          max_length: null,
          precision: 10,
          scale: 0,
          is_nullable: false
        },
        {
          col_name: 'Name',
          type_name: 'nvarchar',
          max_length: 100,
          precision: null,
          scale: null,
          is_nullable: true
        }
      ]
    })

    const provider = await buildConnectedProvider()
    const result = await provider.getTableType('MyDB', 'dbo', 'CustomerType')

    expect(result.status).toBe('ok')
    if (result.status === 'ok') {
      expect(result.tableType.schemaName).toBe('dbo')
      expect(result.tableType.typeName).toBe('CustomerType')
      expect(result.tableType.columns).toHaveLength(2)
      expect(result.tableType.columns[0].name).toBe('Id')
      expect(result.tableType.columns[1].name).toBe('Name')
      expect(result.tableType.columns[1].maxLength).toBe(100)
    }
  })

  it('returns empty columns array when type has no columns', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] })

    const provider = await buildConnectedProvider()
    const result = await provider.getTableType('MyDB', 'dbo', 'EmptyType')

    expect(result.status).toBe('ok')
    if (result.status === 'ok') {
      expect(result.tableType.columns).toHaveLength(0)
    }
  })

  it('returns error when query throws', async () => {
    mockQuery.mockRejectedValueOnce(new Error('Timeout'))

    const provider = await buildConnectedProvider()
    const result = await provider.getTableType('MyDB', 'dbo', 'SomeType')

    expect(result.status).toBe('error')
  })
})

// ── saveTableType ─────────────────────────────────────────────────────────────

describe('SqlServerProvider.saveTableType', () => {
  beforeEach(() => {
    resetRequestChain()
  })

  it('returns ok when creating a new table type', async () => {
    const capturedSqls: string[] = []
    mockQuery.mockImplementation((sql: string) => {
      capturedSqls.push(sql)
      return Promise.resolve({ recordsets: [], rowsAffected: [0] })
    })

    const provider = await buildConnectedProvider()
    const result = await provider.saveTableType('MyDB', {
      schemaName: 'dbo',
      typeName: 'NewType',
      columns: [
        { name: 'Id', type: 'int', length: null, precision: null, scale: null, isNullable: false }
      ]
    })

    expect(result.status).toBe('ok')
    const createSql = capturedSqls.find((s) => s.includes('CREATE TYPE'))
    expect(createSql).toBeDefined()
    expect(createSql).toContain('[dbo].[NewType]')
    expect(createSql).toContain('[Id]')
  })

  it('includes DROP IF EXISTS when updating (originalTypeName provided)', async () => {
    const capturedSqls: string[] = []
    mockQuery.mockImplementation((sql: string) => {
      capturedSqls.push(sql)
      return Promise.resolve({ recordsets: [], rowsAffected: [0] })
    })

    const provider = await buildConnectedProvider()
    const result = await provider.saveTableType(
      'MyDB',
      {
        schemaName: 'dbo',
        typeName: 'RenamedType',
        columns: []
      },
      'OldType',
      'dbo'
    )

    expect(result.status).toBe('ok')
    const dropSql = capturedSqls.find((s) => s.includes('DROP TYPE'))
    expect(dropSql).toBeDefined()
    expect(dropSql).toContain('[dbo].[OldType]')
    const createSql = capturedSqls.find((s) => s.includes('CREATE TYPE'))
    expect(createSql).toBeDefined()
  })

  it('returns error when query throws', async () => {
    const capturedSqls: string[] = []
    mockQuery.mockImplementation((sql: string) => {
      capturedSqls.push(sql)
      if (sql.includes('CREATE TYPE')) {
        return Promise.reject(new Error('Permission denied'))
      }
      return Promise.resolve({ recordsets: [], rowsAffected: [0] })
    })

    const provider = await buildConnectedProvider()
    const result = await provider.saveTableType('MyDB', {
      schemaName: 'dbo',
      typeName: 'Type1',
      columns: []
    })

    expect(result.status).toBe('error')
    if (result.status === 'error') {
      expect(result.message).toContain('Permission denied')
    }
  })
})

// ── deleteTableType ───────────────────────────────────────────────────────────

describe('SqlServerProvider.deleteTableType', () => {
  beforeEach(() => {
    resetRequestChain()
  })

  it('returns ok when deletion succeeds', async () => {
    const capturedSqls: string[] = []
    mockQuery.mockImplementation((sql: string) => {
      capturedSqls.push(sql)
      return Promise.resolve({ recordsets: [], rowsAffected: [0] })
    })

    const provider = await buildConnectedProvider()
    const result = await provider.deleteTableType('MyDB', 'dbo', 'CustomerType')

    expect(result.status).toBe('ok')
    const dropSql = capturedSqls.find((s) => s.includes('DROP TYPE'))
    expect(dropSql).toBeDefined()
    expect(dropSql).toContain('[dbo].[CustomerType]')
  })

  it('returns error when deletion fails', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('DROP TYPE')) {
        return Promise.reject(new Error('Cannot drop type in use'))
      }
      return Promise.resolve({ recordsets: [], rowsAffected: [0] })
    })

    const provider = await buildConnectedProvider()
    const result = await provider.deleteTableType('MyDB', 'dbo', 'UsedType')

    expect(result.status).toBe('error')
    if (result.status === 'error') {
      expect(result.message).toContain('Cannot drop type in use')
    }
  })
})

// ── getMemoryOptimizedTableTypes ──────────────────────────────────────────────

describe('SqlServerProvider.getMemoryOptimizedTableTypes', () => {
  beforeEach(() => {
    resetRequestChain()
  })

  it('returns ok status with memory-optimized table types when query succeeds', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [
        { schema_name: 'dbo', name: 'MemType1' },
        { schema_name: 'sales', name: 'MemType2' }
      ]
    })

    const provider = await buildConnectedProvider()
    const result = await provider.getMemoryOptimizedTableTypes('MyDB')

    expect(result.status).toBe('ok')
    if (result.status === 'ok') {
      expect(result.tableTypes).toHaveLength(2)
      expect(result.tableTypes[0]).toEqual({ schemaName: 'dbo', typeName: 'MemType1' })
      expect(result.tableTypes[1]).toEqual({ schemaName: 'sales', typeName: 'MemType2' })
    }
  })

  it('filters to is_memory_optimized = 1 in query', async () => {
    let capturedSql = ''
    mockQuery.mockImplementation((sql: string) => {
      capturedSql = sql
      return Promise.resolve({ recordset: [] })
    })

    const provider = await buildConnectedProvider()
    await provider.getMemoryOptimizedTableTypes('MyDB')

    expect(capturedSql).toContain('is_memory_optimized = 1')
  })

  it('returns ok with empty array when no memory-optimized table types exist', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] })

    const provider = await buildConnectedProvider()
    const result = await provider.getMemoryOptimizedTableTypes('MyDB')

    expect(result.status).toBe('ok')
    if (result.status === 'ok') {
      expect(result.tableTypes).toHaveLength(0)
    }
  })

  it('returns error status when query throws', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB connection lost'))

    const provider = await buildConnectedProvider()
    const result = await provider.getMemoryOptimizedTableTypes('MyDB')

    expect(result.status).toBe('error')
    if (result.status === 'error') {
      expect(result.message).toContain('DB connection lost')
    }
  })
})

// ── getMemoryOptimizedTableType ───────────────────────────────────────────────

describe('SqlServerProvider.getMemoryOptimizedTableType', () => {
  beforeEach(() => {
    resetRequestChain()
  })

  it('returns columns for a given memory-optimized table type', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [
        {
          col_name: 'Id',
          type_name: 'int',
          max_length: null,
          precision: 10,
          scale: 0,
          is_nullable: false,
          is_primary_key: true
        },
        {
          col_name: 'Name',
          type_name: 'nvarchar',
          max_length: 100,
          precision: null,
          scale: null,
          is_nullable: true,
          is_primary_key: false
        }
      ]
    })

    const provider = await buildConnectedProvider()
    const result = await provider.getMemoryOptimizedTableType('MyDB', 'dbo', 'MemType1')

    expect(result.status).toBe('ok')
    if (result.status === 'ok') {
      expect(result.tableType.schemaName).toBe('dbo')
      expect(result.tableType.typeName).toBe('MemType1')
      expect(result.tableType.columns).toHaveLength(2)
      expect(result.tableType.columns[0].name).toBe('Id')
      expect(result.tableType.columns[0].isPrimaryKey).toBe(true)
      expect(result.tableType.columns[1].name).toBe('Name')
      expect(result.tableType.columns[1].isPrimaryKey).toBe(false)
    }
  })

  it('filters to is_memory_optimized = 1 in query', async () => {
    let capturedSql = ''
    mockQuery.mockImplementation((sql: string) => {
      capturedSql = sql
      return Promise.resolve({ recordset: [] })
    })

    const provider = await buildConnectedProvider()
    await provider.getMemoryOptimizedTableType('MyDB', 'dbo', 'MemType1')

    expect(capturedSql).toContain('is_memory_optimized = 1')
  })

  it('returns error when query throws', async () => {
    mockQuery.mockRejectedValueOnce(new Error('Timeout'))

    const provider = await buildConnectedProvider()
    const result = await provider.getMemoryOptimizedTableType('MyDB', 'dbo', 'SomeType')

    expect(result.status).toBe('error')
  })
})

// ── saveMemoryOptimizedTableType ──────────────────────────────────────────────

describe('SqlServerProvider.saveMemoryOptimizedTableType', () => {
  beforeEach(() => {
    resetRequestChain()
  })

  it('returns ok and includes MEMORY_OPTIMIZED = ON clause when creating', async () => {
    const capturedSqls: string[] = []
    mockQuery.mockImplementation((sql: string) => {
      capturedSqls.push(sql)
      return Promise.resolve({ recordsets: [], rowsAffected: [0] })
    })

    const provider = await buildConnectedProvider()
    const result = await provider.saveMemoryOptimizedTableType('MyDB', {
      schemaName: 'dbo',
      typeName: 'MemType1',
      columns: [
        { name: 'Id', type: 'int', length: null, precision: null, scale: null, isNullable: false, isPrimaryKey: true }
      ]
    })

    expect(result.status).toBe('ok')
    const createSql = capturedSqls.find((s) => s.includes('CREATE TYPE'))
    expect(createSql).toBeDefined()
    expect(createSql).toContain('[dbo].[MemType1]')
    expect(createSql).toContain('MEMORY_OPTIMIZED = ON')
    expect(createSql).toContain('PRIMARY KEY NONCLUSTERED')
  })

  it('does not include PRIMARY KEY NONCLUSTERED when no pk column is set', async () => {
    const capturedSqls: string[] = []
    mockQuery.mockImplementation((sql: string) => {
      capturedSqls.push(sql)
      return Promise.resolve({ recordsets: [], rowsAffected: [0] })
    })

    const provider = await buildConnectedProvider()
    const result = await provider.saveMemoryOptimizedTableType('MyDB', {
      schemaName: 'dbo',
      typeName: 'MemType1',
      columns: [
        { name: 'Id', type: 'int', length: null, precision: null, scale: null, isNullable: false }
      ]
    })

    expect(result.status).toBe('ok')
    const createSql = capturedSqls.find((s) => s.includes('CREATE TYPE'))
    expect(createSql).not.toContain('PRIMARY KEY NONCLUSTERED')
  })

  it('includes DROP IF EXISTS when updating (originalTypeName provided)', async () => {
    const capturedSqls: string[] = []
    mockQuery.mockImplementation((sql: string) => {
      capturedSqls.push(sql)
      return Promise.resolve({ recordsets: [], rowsAffected: [0] })
    })

    const provider = await buildConnectedProvider()
    const result = await provider.saveMemoryOptimizedTableType(
      'MyDB',
      {
        schemaName: 'dbo',
        typeName: 'RenamedMemType',
        columns: []
      },
      'OldMemType',
      'dbo'
    )

    expect(result.status).toBe('ok')
    const dropSql = capturedSqls.find((s) => s.includes('DROP TYPE'))
    expect(dropSql).toBeDefined()
    expect(dropSql).toContain('[dbo].[OldMemType]')
    const createSql = capturedSqls.find((s) => s.includes('CREATE TYPE'))
    expect(createSql).toBeDefined()
    expect(createSql).toContain('MEMORY_OPTIMIZED = ON')
  })

  it('returns error when CREATE TYPE query fails', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('CREATE TYPE')) {
        return Promise.reject(new Error('Permission denied'))
      }
      return Promise.resolve({ recordsets: [], rowsAffected: [0] })
    })

    const provider = await buildConnectedProvider()
    const result = await provider.saveMemoryOptimizedTableType('MyDB', {
      schemaName: 'dbo',
      typeName: 'MemType1',
      columns: []
    })

    expect(result.status).toBe('error')
    if (result.status === 'error') {
      expect(result.message).toContain('Permission denied')
    }
  })
})

// ── deleteMemoryOptimizedTableType ────────────────────────────────────────────

describe('SqlServerProvider.deleteMemoryOptimizedTableType', () => {
  beforeEach(() => {
    resetRequestChain()
  })

  it('returns ok when deletion succeeds', async () => {
    const capturedSqls: string[] = []
    mockQuery.mockImplementation((sql: string) => {
      capturedSqls.push(sql)
      return Promise.resolve({ recordsets: [], rowsAffected: [0] })
    })

    const provider = await buildConnectedProvider()
    const result = await provider.deleteMemoryOptimizedTableType('MyDB', 'dbo', 'MemType1')

    expect(result.status).toBe('ok')
    const dropSql = capturedSqls.find((s) => s.includes('DROP TYPE'))
    expect(dropSql).toBeDefined()
    expect(dropSql).toContain('[dbo].[MemType1]')
  })

  it('returns error when deletion fails', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('DROP TYPE')) {
        return Promise.reject(new Error('Cannot drop type in use'))
      }
      return Promise.resolve({ recordsets: [], rowsAffected: [0] })
    })

    const provider = await buildConnectedProvider()
    const result = await provider.deleteMemoryOptimizedTableType('MyDB', 'dbo', 'MemType1')

    expect(result.status).toBe('error')
    if (result.status === 'error') {
      expect(result.message).toContain('Cannot drop type in use')
    }
  })
})

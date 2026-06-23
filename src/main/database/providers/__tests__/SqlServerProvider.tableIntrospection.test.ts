// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SqlServerProvider } from '../SqlServerProvider'

// ── mssql mock ────────────────────────────────────────────────────────────────
// vi.hoisted ensures the mock state is initialised before any import is
// processed, which is required when the mock factory references outer vars.

const { mockRequestChain, mockConnectionPool, mockQuery } = vi.hoisted(() => {
  const mockQuery = vi.fn()

  // The request chain is mutable so individual tests can reset the query spy
  // and inspect input() calls.
  const mockRequestChain = {
    input: vi.fn().mockReturnThis() as (..._args: unknown[]) => typeof mockRequestChain,
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
  mockQuery.mockReset()
  mockRequestChain.query = mockQuery
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

// ── listTableCategories ───────────────────────────────────────────────────────

describe('SqlServerProvider.listTableCategories', () => {
  it('returns 6 folder nodes for a valid table identifier', async () => {
    const provider = await buildConnectedProvider()
    const nodes = provider.listTableCategories('AdventureWorks', 'dbo.Product')

    expect(nodes).toHaveLength(6)
    expect(nodes.map((n) => n.kind)).toEqual([
      'table-columns-folder',
      'table-keys-folder',
      'table-constraints-folder',
      'table-triggers-folder',
      'table-indexes-folder',
      'table-statistics-folder'
    ])
  })

  it('uses correct path-encoded IDs', async () => {
    const provider = await buildConnectedProvider()
    const nodes = provider.listTableCategories('AdventureWorks', 'dbo.Product')

    const base = 'db:AdventureWorks:tables:dbo.Product'
    expect(nodes[0].id).toBe(`${base}:columns`)
    expect(nodes[1].id).toBe(`${base}:keys`)
    expect(nodes[2].id).toBe(`${base}:constraints`)
    expect(nodes[3].id).toBe(`${base}:triggers`)
    expect(nodes[4].id).toBe(`${base}:indexes`)
    expect(nodes[5].id).toBe(`${base}:statistics`)
  })

  it('rejects database names with invalid characters', async () => {
    const provider = await buildConnectedProvider()
    expect(() => provider.listTableCategories("bad'db", 'dbo.Product')).toThrow()
  })
})

// ── listColumns ───────────────────────────────────────────────────────────────

describe('SqlServerProvider.listColumns', () => {
  beforeEach(() => resetRequestChain())

  it('returns column nodes with name (type, nullable) labels', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [
        { COLUMN_NAME: 'ProductID', DATA_TYPE: 'int', IS_NULLABLE: 'NO', IS_PK: 1 },
        { COLUMN_NAME: 'Name', DATA_TYPE: 'nvarchar', IS_NULLABLE: 'YES', IS_PK: 0 }
      ]
    })

    const provider = await buildConnectedProvider()
    const nodes = await provider.listColumns('AdventureWorks', 'dbo', 'Product')

    expect(nodes).toHaveLength(2)
    expect(nodes[0]).toMatchObject({
      id: 'db:AdventureWorks:tables:dbo.Product:columns:ProductID',
      label: 'ProductID (PK, int, not null)',
      kind: 'column-pk'
    })
    expect(nodes[1]).toMatchObject({
      id: 'db:AdventureWorks:tables:dbo.Product:columns:Name',
      label: 'Name (nvarchar, null)',
      kind: 'column'
    })
  })

  it('returns an empty array when the table has no columns', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] })
    const provider = await buildConnectedProvider()
    const nodes = await provider.listColumns('AdventureWorks', 'dbo', 'Product')
    expect(nodes).toHaveLength(0)
  })

  it('passes schemaName and tableName as query parameters', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] })
    const provider = await buildConnectedProvider()
    await provider.listColumns('MyDB', 'sales', 'Orders')

    // The .input() method was called with (@schemaName, 'sales') and (@tableName, 'Orders')
    const inputMock = mockRequestChain.input as ReturnType<typeof vi.fn>
    expect(inputMock).toHaveBeenCalledWith('schemaName', 'sales')
    expect(inputMock).toHaveBeenCalledWith('tableName', 'Orders')
  })
})

// ── listKeys ──────────────────────────────────────────────────────────────────

describe('SqlServerProvider.listKeys', () => {
  beforeEach(() => resetRequestChain())

  it('returns key nodes with name (type) labels', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [
        { CONSTRAINT_NAME: 'FK_Orders_Customer', CONSTRAINT_TYPE: 'FOREIGN KEY' },
        { CONSTRAINT_NAME: 'PK_Orders', CONSTRAINT_TYPE: 'PRIMARY KEY' }
      ]
    })

    const provider = await buildConnectedProvider()
    const nodes = await provider.listKeys('MyDB', 'dbo', 'Orders')

    expect(nodes).toHaveLength(2)
    expect(nodes[0]).toMatchObject({
      id: 'db:MyDB:tables:dbo.Orders:keys:FK_Orders_Customer',
      label: 'FK_Orders_Customer (FOREIGN KEY)',
      kind: 'key'
    })
    expect(nodes[1]).toMatchObject({
      id: 'db:MyDB:tables:dbo.Orders:keys:PK_Orders',
      label: 'PK_Orders (PRIMARY KEY)',
      kind: 'key'
    })
  })

  it('returns empty array when no keys exist', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] })
    const provider = await buildConnectedProvider()
    const nodes = await provider.listKeys('MyDB', 'dbo', 'Orders')
    expect(nodes).toHaveLength(0)
  })
})

// ── listConstraints ───────────────────────────────────────────────────────────

describe('SqlServerProvider.listConstraints', () => {
  beforeEach(() => resetRequestChain())

  it('returns constraint nodes with name (type) labels', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [
        { CONSTRAINT_NAME: 'CK_Product_Price', CONSTRAINT_TYPE: 'CHECK' },
        { CONSTRAINT_NAME: 'DF_Product_Status', CONSTRAINT_TYPE: 'DEFAULT' }
      ]
    })

    const provider = await buildConnectedProvider()
    const nodes = await provider.listConstraints('MyDB', 'dbo', 'Product')

    expect(nodes).toHaveLength(2)
    expect(nodes[0]).toMatchObject({
      id: 'db:MyDB:tables:dbo.Product:constraints:CK_Product_Price',
      label: 'CK_Product_Price (CHECK)',
      kind: 'constraint'
    })
    expect(nodes[1]).toMatchObject({
      id: 'db:MyDB:tables:dbo.Product:constraints:DF_Product_Status',
      label: 'DF_Product_Status (DEFAULT)',
      kind: 'constraint'
    })
  })

  it('returns empty array when no constraints exist', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] })
    const provider = await buildConnectedProvider()
    const nodes = await provider.listConstraints('MyDB', 'dbo', 'Product')
    expect(nodes).toHaveLength(0)
  })
})

// ── getCheckConstraints ───────────────────────────────────────────────────────

describe('SqlServerProvider.getCheckConstraints', () => {
  beforeEach(() => resetRequestChain())

  it('returns mapped CheckConstraintDefinition array on success', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [
        {
          constraint_name: 'CK_Product_Price',
          definition: '([Price]>(0))',
          is_disabled: false,
          is_not_for_replication: false,
          is_not_trusted: false,
          description: 'Price must be positive'
        },
        {
          constraint_name: 'CK_Product_Stock',
          definition: '([Stock]>=(0))',
          is_disabled: true,
          is_not_for_replication: true,
          is_not_trusted: true,
          description: null
        }
      ]
    })

    const provider = await buildConnectedProvider()
    const result = await provider.getCheckConstraints('MyDB', 'dbo', 'Product')

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return

    expect(result.constraints).toHaveLength(2)
    expect(result.constraints[0]).toEqual({
      constraintName: 'CK_Product_Price',
      condition: '([Price]>(0))',
      isEnabled: true,
      checkExistingData: true,
      enforceForReplication: true,
      description: 'Price must be positive'
    })
    expect(result.constraints[1]).toEqual({
      constraintName: 'CK_Product_Stock',
      condition: '([Stock]>=(0))',
      isEnabled: false,
      checkExistingData: false,
      enforceForReplication: false,
      description: undefined
    })
  })

  it('returns empty constraints array when table has no check constraints', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] })

    const provider = await buildConnectedProvider()
    const result = await provider.getCheckConstraints('MyDB', 'dbo', 'EmptyTable')

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.constraints).toHaveLength(0)
  })

  it('passes schema and table parameters as named inputs', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] })

    const provider = await buildConnectedProvider()
    await provider.getCheckConstraints('MyDB', 'sales', 'Order')

    expect(mockRequestChain.input).toHaveBeenCalledWith('schemaName', 'sales')
    expect(mockRequestChain.input).toHaveBeenCalledWith('tableName', 'Order')
  })

  it('returns error result when the database query fails', async () => {
    mockQuery.mockRejectedValueOnce(new Error('Connection lost'))

    const provider = await buildConnectedProvider()
    const result = await provider.getCheckConstraints('MyDB', 'dbo', 'Product')

    expect(result).toEqual({ status: 'error', message: 'Connection lost' })
  })
})

// ── listTriggers ──────────────────────────────────────────────────────────────

describe('SqlServerProvider.listTriggers', () => {
  beforeEach(() => resetRequestChain())

  it('returns trigger nodes with trigger name labels', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [{ name: 'tr_AuditInsert' }, { name: 'tr_AuditUpdate' }]
    })

    const provider = await buildConnectedProvider()
    const nodes = await provider.listTriggers('MyDB', 'dbo', 'Orders')

    expect(nodes).toHaveLength(2)
    expect(nodes[0]).toMatchObject({
      id: 'db:MyDB:tables:dbo.Orders:triggers:tr_AuditInsert',
      label: 'tr_AuditInsert',
      kind: 'trigger'
    })
  })

  it('returns empty array when no triggers exist', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] })
    const provider = await buildConnectedProvider()
    const nodes = await provider.listTriggers('MyDB', 'dbo', 'Orders')
    expect(nodes).toHaveLength(0)
  })
})

// ── listIndexes ───────────────────────────────────────────────────────────────

describe('SqlServerProvider.listIndexes', () => {
  beforeEach(() => resetRequestChain())

  it('returns index nodes with name (type_desc) labels', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [
        { name: 'PK_Product', type_desc: 'CLUSTERED' },
        { name: 'IX_Product_Name', type_desc: 'NONCLUSTERED' }
      ]
    })

    const provider = await buildConnectedProvider()
    const nodes = await provider.listIndexes('MyDB', 'dbo', 'Product')

    expect(nodes).toHaveLength(2)
    expect(nodes[0]).toMatchObject({
      id: 'db:MyDB:tables:dbo.Product:indexes:PK_Product',
      label: 'PK_Product (CLUSTERED)',
      kind: 'index'
    })
    expect(nodes[1]).toMatchObject({
      id: 'db:MyDB:tables:dbo.Product:indexes:IX_Product_Name',
      label: 'IX_Product_Name (NONCLUSTERED)',
      kind: 'index'
    })
  })

  it('returns empty array when no indexes exist', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] })
    const provider = await buildConnectedProvider()
    const nodes = await provider.listIndexes('MyDB', 'dbo', 'Product')
    expect(nodes).toHaveLength(0)
  })
})

// ── listStatistics ────────────────────────────────────────────────────────────

describe('SqlServerProvider.listStatistics', () => {
  beforeEach(() => resetRequestChain())

  it('returns statistic nodes with stat name labels', async () => {
    mockQuery.mockResolvedValueOnce({
      recordset: [{ name: '_WA_Sys_00000001' }, { name: 'ST_Product_Category' }]
    })

    const provider = await buildConnectedProvider()
    const nodes = await provider.listStatistics('MyDB', 'dbo', 'Product')

    expect(nodes).toHaveLength(2)
    expect(nodes[0]).toMatchObject({
      id: 'db:MyDB:tables:dbo.Product:statistics:_WA_Sys_00000001',
      label: '_WA_Sys_00000001',
      kind: 'statistic'
    })
  })

  it('returns empty array when no statistics exist', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [] })
    const provider = await buildConnectedProvider()
    const nodes = await provider.listStatistics('MyDB', 'dbo', 'Product')
    expect(nodes).toHaveLength(0)
  })
})

// ── getTableSchema ────────────────────────────────────────────────────────────

describe('SqlServerProvider.getTableSchema', () => {
  beforeEach(() => resetRequestChain())

  it('maps IS_IDENTITY=1 column to isIdentity=true with seed and increment', async () => {
    // First query: columns (OUTER APPLY with sys.identity_columns)
    mockQuery.mockResolvedValueOnce({
      recordset: [
        {
          COLUMN_NAME: 'Id',
          DATA_TYPE: 'int',
          CHARACTER_MAXIMUM_LENGTH: null,
          NUMERIC_PRECISION: 10,
          NUMERIC_SCALE: 0,
          IS_NULLABLE: 'NO',
          COLUMN_DEFAULT: null,
          IS_IDENTITY: 1,
          IDENTITY_SEED: 1,
          IDENTITY_INCREMENT: 1
        },
        {
          COLUMN_NAME: 'Name',
          DATA_TYPE: 'nvarchar',
          CHARACTER_MAXIMUM_LENGTH: 100,
          NUMERIC_PRECISION: null,
          NUMERIC_SCALE: null,
          IS_NULLABLE: 'YES',
          COLUMN_DEFAULT: null,
          IS_IDENTITY: 0,
          IDENTITY_SEED: null,
          IDENTITY_INCREMENT: null
        }
      ]
    })
    // Second query: primary keys
    mockQuery.mockResolvedValueOnce({ recordset: [{ COLUMN_NAME: 'Id' }] })

    const provider = await buildConnectedProvider()
    const result = await provider.getTableSchema('MyDB', 'dbo', 'Orders')

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return

    expect(result.columns).toHaveLength(2)

    const idCol = result.columns[0]
    expect(idCol.isIdentity).toBe(true)
    expect(idCol.identitySeed).toBe(1)
    expect(idCol.identityIncrement).toBe(1)
    expect(idCol.isPrimaryKey).toBe(true)

    const nameCol = result.columns[1]
    expect(nameCol.isIdentity).toBe(false)
    expect(nameCol.identitySeed).toBeNull()
    expect(nameCol.identityIncrement).toBeNull()
    expect(nameCol.isPrimaryKey).toBe(false)
  })

  it('handles IS_IDENTITY returned as boolean true (driver type coercion)', async () => {
    // Some driver configurations may return CASE/COALESCE results as booleans
    mockQuery.mockResolvedValueOnce({
      recordset: [
        {
          COLUMN_NAME: 'Id',
          DATA_TYPE: 'int',
          CHARACTER_MAXIMUM_LENGTH: null,
          NUMERIC_PRECISION: 10,
          NUMERIC_SCALE: 0,
          IS_NULLABLE: 'NO',
          COLUMN_DEFAULT: null,
          IS_IDENTITY: true as unknown as number,
          IDENTITY_SEED: 1,
          IDENTITY_INCREMENT: 1
        }
      ]
    })
    mockQuery.mockResolvedValueOnce({ recordset: [] })

    const provider = await buildConnectedProvider()
    const result = await provider.getTableSchema('MyDB', 'dbo', 'Orders')

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.columns[0].isIdentity).toBe(true)
  })

  it('returns error result when the database query fails', async () => {
    mockQuery.mockRejectedValueOnce(new Error('Timeout'))
    const provider = await buildConnectedProvider()
    const result = await provider.getTableSchema('MyDB', 'dbo', 'Orders')
    expect(result).toEqual({ status: 'error', message: 'Timeout' })
  })
})

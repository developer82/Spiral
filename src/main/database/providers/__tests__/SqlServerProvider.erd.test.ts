// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SqlServerProvider } from '../SqlServerProvider'

// ── mssql mock ────────────────────────────────────────────────────────────────

const { mockRequestChain, mockConnectionPool, mockQuery } = vi.hoisted(() => {
  const mockQuery = vi.fn()
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

vi.mock('mssql', () => ({ ConnectionPool: mockConnectionPool }))

function resetRequestChain(): void {
  mockRequestChain.input = vi.fn().mockReturnThis() as typeof mockRequestChain.input
  mockQuery.mockReset()
  mockRequestChain.query = mockQuery
}

async function buildConnectedProvider(): Promise<SqlServerProvider> {
  const provider = new SqlServerProvider()
  await provider.connect({
    id: 'test-erd',
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

// ── getErdSchema ──────────────────────────────────────────────────────────────

describe('SqlServerProvider.getErdSchema', () => {
  beforeEach(() => resetRequestChain())

  it('groups columns into tables correctly', async () => {
    const provider = await buildConnectedProvider()

    // Three sequential query calls: columns, relationships, indexes
    mockQuery
      .mockResolvedValueOnce({
        recordset: [
          { TABLE_SCHEMA: 'dbo', TABLE_NAME: 'Users',  COLUMN_NAME: 'Id',    DATA_TYPE: 'int',          CHARACTER_MAXIMUM_LENGTH: null, IS_NULLABLE: 'NO',  IS_PK: 1, IS_FK: 0 },
          { TABLE_SCHEMA: 'dbo', TABLE_NAME: 'Users',  COLUMN_NAME: 'Email', DATA_TYPE: 'varchar',      CHARACTER_MAXIMUM_LENGTH: 255,  IS_NULLABLE: 'NO',  IS_PK: 0, IS_FK: 0 },
          { TABLE_SCHEMA: 'dbo', TABLE_NAME: 'Orders', COLUMN_NAME: 'Id',    DATA_TYPE: 'int',          CHARACTER_MAXIMUM_LENGTH: null, IS_NULLABLE: 'NO',  IS_PK: 1, IS_FK: 0 },
          { TABLE_SCHEMA: 'dbo', TABLE_NAME: 'Orders', COLUMN_NAME: 'UserId',DATA_TYPE: 'int',          CHARACTER_MAXIMUM_LENGTH: null, IS_NULLABLE: 'NO',  IS_PK: 0, IS_FK: 1 }
        ]
      })
      .mockResolvedValueOnce({ recordset: [] })
      .mockResolvedValueOnce({ recordset: [] })

    const result = await provider.getErdSchema('TestDb')

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return

    expect(result.schema.tables).toHaveLength(2)

    const users = result.schema.tables.find((t) => t.name === 'Users')
    expect(users).toBeDefined()
    expect(users!.schema).toBe('dbo')
    expect(users!.columns).toHaveLength(2)
    expect(users!.columns[0]).toMatchObject({ name: 'Id', type: 'int', isPrimaryKey: true, isForeignKey: false })
    expect(users!.columns[1]).toMatchObject({ name: 'Email', type: 'varchar', maxLength: 255, isNullable: false })

    const orders = result.schema.tables.find((t) => t.name === 'Orders')
    expect(orders!.columns[1]).toMatchObject({ name: 'UserId', isForeignKey: true, isPrimaryKey: false })
  })

  it('maps FK relationships correctly', async () => {
    const provider = await buildConnectedProvider()

    mockQuery
      .mockResolvedValueOnce({ recordset: [] }) // columns
      .mockResolvedValueOnce({
        recordset: [
          {
            CONSTRAINT_NAME: 'FK_Orders_Users',
            FROM_SCHEMA: 'dbo', FROM_TABLE: 'Orders', FROM_COLUMN: 'UserId',
            TO_SCHEMA:   'dbo', TO_TABLE:   'Users',  TO_COLUMN:  'Id'
          }
        ]
      })
      .mockResolvedValueOnce({ recordset: [] }) // indexes

    const result = await provider.getErdSchema('TestDb')
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return

    expect(result.schema.relationships).toHaveLength(1)
    const rel = result.schema.relationships[0]
    expect(rel.constraintName).toBe('FK_Orders_Users')
    expect(rel.fromTable).toBe('Orders')
    expect(rel.fromColumn).toBe('UserId')
    expect(rel.toTable).toBe('Users')
    expect(rel.toColumn).toBe('Id')
  })

  it('maps indexes correctly', async () => {
    const provider = await buildConnectedProvider()

    mockQuery
      .mockResolvedValueOnce({ recordset: [] }) // columns
      .mockResolvedValueOnce({ recordset: [] }) // relationships
      .mockResolvedValueOnce({
        recordset: [
          { TABLE_SCHEMA: 'dbo', TABLE_NAME: 'Users', INDEX_NAME: 'IX_Users_Email', TYPE_DESC: 'NONCLUSTERED', IS_UNIQUE: true, IS_PRIMARY_KEY: false }
        ]
      })

    const result = await provider.getErdSchema('TestDb')
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return

    expect(result.schema.indexes).toHaveLength(1)
    expect(result.schema.indexes[0]).toMatchObject({
      schema: 'dbo',
      table: 'Users',
      name: 'IX_Users_Email',
      typeDesc: 'NONCLUSTERED',
      isUnique: true,
      isPrimaryKey: false
    })
  })

  it('returns error result when query throws', async () => {
    const provider = await buildConnectedProvider()
    mockQuery.mockRejectedValueOnce(new Error('Connection timeout'))

    const result = await provider.getErdSchema('TestDb')
    expect(result.status).toBe('error')
    if (result.status !== 'error') return
    expect(result.message).toContain('Connection timeout')
  })

  it('rejects database names with invalid characters', async () => {
    const provider = await buildConnectedProvider()
    await expect(provider.getErdSchema("bad'db")).rejects.toThrow()
  })

  it('preserves column order within a table', async () => {
    const provider = await buildConnectedProvider()

    mockQuery
      .mockResolvedValueOnce({
        recordset: [
          { TABLE_SCHEMA: 'dbo', TABLE_NAME: 'T', COLUMN_NAME: 'A', DATA_TYPE: 'int', CHARACTER_MAXIMUM_LENGTH: null, IS_NULLABLE: 'NO',  IS_PK: 1, IS_FK: 0 },
          { TABLE_SCHEMA: 'dbo', TABLE_NAME: 'T', COLUMN_NAME: 'B', DATA_TYPE: 'int', CHARACTER_MAXIMUM_LENGTH: null, IS_NULLABLE: 'YES', IS_PK: 0, IS_FK: 0 },
          { TABLE_SCHEMA: 'dbo', TABLE_NAME: 'T', COLUMN_NAME: 'C', DATA_TYPE: 'int', CHARACTER_MAXIMUM_LENGTH: null, IS_NULLABLE: 'YES', IS_PK: 0, IS_FK: 1 }
        ]
      })
      .mockResolvedValueOnce({ recordset: [] })
      .mockResolvedValueOnce({ recordset: [] })

    const result = await provider.getErdSchema('TestDb')
    if (result.status !== 'ok') throw new Error('expected ok')

    const cols = result.schema.tables[0].columns
    expect(cols.map((c) => c.name)).toEqual(['A', 'B', 'C'])
    expect(cols[1].isNullable).toBe(true)
    expect(cols[2].isForeignKey).toBe(true)
  })
})

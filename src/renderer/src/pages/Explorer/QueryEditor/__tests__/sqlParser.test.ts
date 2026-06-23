import { describe, it, expect } from 'vitest'
import { parseSQL } from '../sqlParser'
import type { ErdColumn } from '../../erd.types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function col(name: string, isPK = false, isFK = false): ErdColumn {
  return { name, type: 'int', maxLength: null, isNullable: false, isPrimaryKey: isPK, isForeignKey: isFK }
}

const availableTables = [
  { schema: 'dbo', name: 'Orders', columns: [col('Id', true), col('CustomerId', false, true), col('Status')] },
  { schema: 'dbo', name: 'Customers', columns: [col('Id', true), col('Name'), col('Email')] },
  { schema: 'sales', name: 'Products', columns: [col('ProductId', true), col('Title')] }
]

const relationships = [
  {
    constraintName: 'FK_Orders_Customers',
    fromSchema: 'dbo',
    fromTable: 'Orders',
    fromColumn: 'CustomerId',
    toSchema: 'dbo',
    toTable: 'Customers',
    toColumn: 'Id'
  }
]

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('parseSQL', () => {
  it('returns null for empty string', () => {
    expect(parseSQL('', availableTables, relationships)).toBeNull()
  })

  it('returns null for CTEs', () => {
    const sql = 'WITH cte AS (SELECT 1) SELECT * FROM cte'
    expect(parseSQL(sql, availableTables, relationships)).toBeNull()
  })

  it('returns null for UNION', () => {
    const sql = 'SELECT [Id] FROM [dbo].[Orders] UNION SELECT [Id] FROM [dbo].[Customers]'
    expect(parseSQL(sql, availableTables, relationships)).toBeNull()
  })

  it('returns null for subquery in FROM', () => {
    const sql = 'SELECT * FROM (SELECT * FROM [dbo].[Orders]) AS sub'
    expect(parseSQL(sql, availableTables, relationships)).toBeNull()
  })

  it('returns null for unknown table', () => {
    const sql = 'SELECT [t1].[Id] FROM [dbo].[NonExistentTable] AS [t1]'
    expect(parseSQL(sql, availableTables, relationships)).toBeNull()
  })

  it('parses single table SELECT', () => {
    const sql = 'SELECT [t1].[Id], [t1].[Status] FROM [dbo].[Orders] AS [t1]'
    const result = parseSQL(sql, availableTables, relationships)
    expect(result).not.toBeNull()
    expect(result!.tables).toHaveLength(1)
    expect(result!.tables[0].schema).toBe('dbo')
    expect(result!.tables[0].name).toBe('Orders')
    expect(result!.tables[0].alias).toBe('t1')
  })

  it('marks selected columns as output=true', () => {
    const sql = 'SELECT [t1].[Id], [t1].[Status] FROM [dbo].[Orders] AS [t1]'
    const result = parseSQL(sql, availableTables, relationships)
    expect(result).not.toBeNull()
    const idCol = result!.columnConfigs.find(
      (c) => c.tableName === 'Orders' && c.columnName === 'Id'
    )
    const statusCol = result!.columnConfigs.find(
      (c) => c.tableName === 'Orders' && c.columnName === 'Status'
    )
    expect(idCol?.output).toBe(true)
    expect(statusCol?.output).toBe(true)
  })

  it('marks unselected columns as output=false', () => {
    const sql = 'SELECT [t1].[Id] FROM [dbo].[Orders] AS [t1]'
    const result = parseSQL(sql, availableTables, relationships)
    expect(result).not.toBeNull()
    const customerIdCol = result!.columnConfigs.find(
      (c) => c.tableName === 'Orders' && c.columnName === 'CustomerId'
    )
    expect(customerIdCol?.output).toBe(false)
  })

  it('parses column alias', () => {
    const sql = 'SELECT [t1].[Id] AS [OrderId] FROM [dbo].[Orders] AS [t1]'
    const result = parseSQL(sql, availableTables, relationships)
    expect(result).not.toBeNull()
    const idCol = result!.columnConfigs.find(
      (c) => c.tableName === 'Orders' && c.columnName === 'Id'
    )
    expect(idCol?.alias).toBe('OrderId')
  })

  it('parses JOIN and returns multiple tables', () => {
    const sql =
      'SELECT [t1].[Id], [t2].[Name] FROM [dbo].[Orders] AS [t1] INNER JOIN [dbo].[Customers] AS [t2] ON [t1].[CustomerId] = [t2].[Id]'
    const result = parseSQL(sql, availableTables, relationships)
    expect(result).not.toBeNull()
    expect(result!.tables).toHaveLength(2)
    expect(result!.tables.map((t) => t.name)).toContain('Orders')
    expect(result!.tables.map((t) => t.name)).toContain('Customers')
  })

  it('parses ORDER BY into sort config', () => {
    const sql =
      'SELECT [t1].[Id], [t1].[Status] FROM [dbo].[Orders] AS [t1] ORDER BY [t1].[Id] DESC'
    const result = parseSQL(sql, availableTables, relationships)
    expect(result).not.toBeNull()
    const idCol = result!.columnConfigs.find(
      (c) => c.tableName === 'Orders' && c.columnName === 'Id'
    )
    expect(idCol?.sortType).toBe('DESC')
    expect(idCol?.sortOrder).toBe(1)
  })

  it('parses cross-schema table reference', () => {
    const sql = 'SELECT [t1].[ProductId] FROM [sales].[Products] AS [t1]'
    const result = parseSQL(sql, availableTables, relationships)
    expect(result).not.toBeNull()
    expect(result!.tables[0].schema).toBe('sales')
    expect(result!.tables[0].name).toBe('Products')
  })
})

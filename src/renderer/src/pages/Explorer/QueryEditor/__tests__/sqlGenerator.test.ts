import { describe, it, expect } from 'vitest'
import { generateSQL } from '../sqlGenerator'
import type { SelectedTable, ColumnConfig, ErdRelationship } from '../queryEditorTypes'
import type { ErdColumn } from '../../erd.types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function col(name: string, isPK = false, isFK = false): ErdColumn {
  return { name, type: 'int', maxLength: null, isNullable: false, isPrimaryKey: isPK, isForeignKey: isFK }
}

function table(schema: string, name: string, alias: string, cols: ErdColumn[]): SelectedTable {
  return { schema, name, alias, columns: cols }
}

function colConfig(
  tableAlias: string,
  tableSchema: string,
  tableName: string,
  columnName: string,
  opts: Partial<ColumnConfig> = {}
): ColumnConfig {
  return {
    tableSchema,
    tableName,
    tableAlias,
    columnName,
    alias: '',
    output: true,
    sortType: 'UNSORTED',
    sortOrder: 0,
    filter: '',
    ...opts
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('generateSQL', () => {
  it('returns empty string when no tables', () => {
    expect(generateSQL([], [], [])).toBe('')
  })

  it('generates SELECT * when no output columns', () => {
    const t1 = table('dbo', 'Orders', 't1', [col('Id')])
    const result = generateSQL([t1], [], [])
    expect(result).toContain('SELECT *')
    expect(result).toContain('FROM [dbo].[Orders] AS [t1]')
  })

  it('generates SELECT with specific columns', () => {
    const t1 = table('dbo', 'Orders', 't1', [col('Id'), col('Status')])
    const cols = [
      colConfig('t1', 'dbo', 'Orders', 'Id'),
      colConfig('t1', 'dbo', 'Orders', 'Status')
    ]
    const result = generateSQL([t1], cols, [])
    expect(result).toContain('[t1].[Id]')
    expect(result).toContain('[t1].[Status]')
    expect(result).not.toContain('SELECT *')
  })

  it('uses column alias when alias differs from column name', () => {
    const t1 = table('dbo', 'Orders', 't1', [col('OrderStatusCode')])
    const cols = [colConfig('t1', 'dbo', 'Orders', 'OrderStatusCode', { alias: 'Status' })]
    const result = generateSQL([t1], cols, [])
    expect(result).toContain('[t1].[OrderStatusCode] AS [Status]')
  })

  it('excludes non-output columns from SELECT', () => {
    const t1 = table('dbo', 'Orders', 't1', [col('Id'), col('InternalNote')])
    const cols = [
      colConfig('t1', 'dbo', 'Orders', 'Id', { output: true }),
      colConfig('t1', 'dbo', 'Orders', 'InternalNote', { output: false })
    ]
    const result = generateSQL([t1], cols, [])
    expect(result).toContain('[t1].[Id]')
    expect(result).not.toContain('[t1].[InternalNote]')
  })

  it('generates INNER JOIN when FK relationship exists', () => {
    const t1 = table('dbo', 'Orders', 't1', [col('CustomerId', false, true)])
    const t2 = table('dbo', 'Customers', 't2', [col('Id', true)])
    const rels: ErdRelationship[] = [
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
    const cols = [
      colConfig('t1', 'dbo', 'Orders', 'CustomerId'),
      colConfig('t2', 'dbo', 'Customers', 'Id')
    ]
    const result = generateSQL([t1, t2], cols, rels)
    expect(result).toContain('INNER JOIN [dbo].[Customers] AS [t2]')
    expect(result).toMatch(/ON \[t[12]\]\.\[(?:CustomerId|Id)\] = \[t[12]\]\.\[(?:Id|CustomerId)\]/)
  })

  it('generates CROSS JOIN when no FK relationship exists', () => {
    const t1 = table('dbo', 'Orders', 't1', [col('Id')])
    const t2 = table('dbo', 'Products', 't2', [col('Id')])
    const result = generateSQL([t1, t2], [], [])
    expect(result).toContain('CROSS JOIN [dbo].[Products] AS [t2]')
  })

  it('generates WHERE clause from column filters', () => {
    const t1 = table('dbo', 'Orders', 't1', [col('Status')])
    const cols = [colConfig('t1', 'dbo', 'Orders', 'Status', { filter: "= 'Active'" })]
    const result = generateSQL([t1], cols, [])
    expect(result).toContain("WHERE")
    expect(result).toContain("[t1].[Status] = 'Active'")
  })

  it('generates ORDER BY from sort config', () => {
    const t1 = table('dbo', 'Orders', 't1', [col('CreatedAt'), col('Total')])
    const cols = [
      colConfig('t1', 'dbo', 'Orders', 'CreatedAt', { sortType: 'DESC', sortOrder: 1 }),
      colConfig('t1', 'dbo', 'Orders', 'Total', { sortType: 'ASC', sortOrder: 2 })
    ]
    const result = generateSQL([t1], cols, [])
    expect(result).toContain('ORDER BY')
    expect(result).toContain('[t1].[CreatedAt] DESC')
    expect(result).toContain('[t1].[Total] ASC')
  })

  it('respects sort order position', () => {
    const t1 = table('dbo', 'Orders', 't1', [col('Total'), col('CreatedAt')])
    const cols = [
      colConfig('t1', 'dbo', 'Orders', 'Total', { sortType: 'ASC', sortOrder: 2 }),
      colConfig('t1', 'dbo', 'Orders', 'CreatedAt', { sortType: 'ASC', sortOrder: 1 })
    ]
    const result = generateSQL([t1], cols, [])
    const orderByIdx = result.indexOf('ORDER BY')
    const totalIdx = result.indexOf('[t1].[Total] ASC')
    const createdIdx = result.indexOf('[t1].[CreatedAt] ASC')
    expect(createdIdx).toBeGreaterThan(orderByIdx)
    expect(totalIdx).toBeGreaterThan(createdIdx)
  })

  it('handles reverse FK direction', () => {
    // Relationship fromTable=Customers.Id, toTable=Orders.CustomerId (reversed lookup)
    const t1 = table('dbo', 'Customers', 't1', [col('Id', true)])
    const t2 = table('dbo', 'Orders', 't2', [col('CustomerId', false, true)])
    const rels: ErdRelationship[] = [
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
    const result = generateSQL([t1, t2], [], rels)
    expect(result).toContain('INNER JOIN')
    expect(result).toContain('[Orders]')
  })
})

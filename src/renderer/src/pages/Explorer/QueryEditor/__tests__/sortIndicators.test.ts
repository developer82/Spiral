import { describe, it, expect } from 'vitest'
import { buildSortIndicators, parseSqlOrderBy, parseSqlTableRefs, parseSqlWhere, buildFilteredColumns, modifyOrderByInSql } from '../sortIndicators'
import type { ColumnConfig } from '../queryEditorTypes'

// ── Helpers ───────────────────────────────────────────────────────────────────

function colConfig(
  columnName: string,
  opts: Partial<ColumnConfig> = {}
): ColumnConfig {
  return {
    tableSchema: 'dbo',
    tableName: 'Users',
    tableAlias: 't1',
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

describe('buildSortIndicators', () => {
  it('returns empty object when no columns are sorted', () => {
    const configs = [colConfig('id'), colConfig('name')]
    expect(buildSortIndicators(configs, true)).toEqual({})
  })

  it('returns empty object when isSyncedWithUI is false, regardless of sort config', () => {
    const configs = [colConfig('id', { sortType: 'ASC', sortOrder: 1 })]
    expect(buildSortIndicators(configs, false)).toEqual({})
  })

  it('returns indicator for a single ASC sorted column using columnName when alias is empty', () => {
    const configs = [colConfig('CreatedAt', { sortType: 'ASC', sortOrder: 1 })]
    expect(buildSortIndicators(configs, true)).toEqual({
      CreatedAt: { sortType: 'ASC', sortOrder: 1 }
    })
  })

  it('returns indicator for a single DESC sorted column using columnName when alias is empty', () => {
    const configs = [colConfig('Score', { sortType: 'DESC', sortOrder: 1 })]
    expect(buildSortIndicators(configs, true)).toEqual({
      Score: { sortType: 'DESC', sortOrder: 1 }
    })
  })

  it('uses alias as the key when alias is set (non-empty, trimmed)', () => {
    const configs = [colConfig('CreatedAt', { alias: 'created', sortType: 'ASC', sortOrder: 1 })]
    expect(buildSortIndicators(configs, true)).toEqual({
      created: { sortType: 'ASC', sortOrder: 1 }
    })
  })

  it('uses alias with surrounding whitespace trimmed', () => {
    const configs = [colConfig('CreatedAt', { alias: '  created  ', sortType: 'DESC', sortOrder: 1 })]
    expect(buildSortIndicators(configs, true)).toEqual({
      created: { sortType: 'DESC', sortOrder: 1 }
    })
  })

  it('falls back to columnName when alias is only whitespace', () => {
    const configs = [colConfig('CreatedAt', { alias: '   ', sortType: 'ASC', sortOrder: 1 })]
    expect(buildSortIndicators(configs, true)).toEqual({
      CreatedAt: { sortType: 'ASC', sortOrder: 1 }
    })
  })

  it('returns indicators for multiple sorted columns with correct sortOrder values', () => {
    const configs = [
      colConfig('Name', { sortType: 'ASC', sortOrder: 1 }),
      colConfig('Age', { sortType: 'DESC', sortOrder: 2 }),
      colConfig('Id') // UNSORTED — should be excluded
    ]
    expect(buildSortIndicators(configs, true)).toEqual({
      Name: { sortType: 'ASC', sortOrder: 1 },
      Age: { sortType: 'DESC', sortOrder: 2 }
    })
  })

  it('does not include UNSORTED columns in the result', () => {
    const configs = [
      colConfig('id'),
      colConfig('name', { sortType: 'ASC', sortOrder: 1 }),
      colConfig('email')
    ]
    const result = buildSortIndicators(configs, true)
    expect(Object.keys(result)).toEqual(['name'])
  })

  it('returns empty object for an empty config array', () => {
    expect(buildSortIndicators([], true)).toEqual({})
  })
})

describe('parseSqlOrderBy', () => {
  it('returns empty object when there is no ORDER BY', () => {
    expect(parseSqlOrderBy('SELECT * FROM Orders')).toEqual({})
  })

  it('parses single ASC column (implicit)', () => {
    expect(parseSqlOrderBy('SELECT * FROM Orders ORDER BY CustomerName')).toEqual({
      CustomerName: { sortType: 'ASC', sortOrder: 1 }
    })
  })

  it('parses single explicit ASC column', () => {
    expect(parseSqlOrderBy('SELECT * FROM Orders ORDER BY CustomerName ASC')).toEqual({
      CustomerName: { sortType: 'ASC', sortOrder: 1 }
    })
  })

  it('parses single DESC column', () => {
    expect(parseSqlOrderBy('SELECT * FROM Orders ORDER BY OrderDate DESC')).toEqual({
      OrderDate: { sortType: 'DESC', sortOrder: 1 }
    })
  })

  it('parses multiple columns with correct sortOrder numbers', () => {
    expect(parseSqlOrderBy('SELECT * FROM Orders ORDER BY CustomerName ASC, OrderDate DESC')).toEqual({
      CustomerName: { sortType: 'ASC', sortOrder: 1 },
      OrderDate: { sortType: 'DESC', sortOrder: 2 }
    })
  })

  it('strips square bracket quoting from column names', () => {
    expect(parseSqlOrderBy('SELECT * FROM Orders ORDER BY [CustomerName] ASC')).toEqual({
      CustomerName: { sortType: 'ASC', sortOrder: 1 }
    })
  })

  it('strips table/alias prefix from column names', () => {
    expect(parseSqlOrderBy('SELECT * FROM Orders o ORDER BY o.CustomerName ASC')).toEqual({
      CustomerName: { sortType: 'ASC', sortOrder: 1 }
    })
  })

  it('strips fully qualified [schema].[table].[col] prefix', () => {
    expect(parseSqlOrderBy('SELECT * FROM Orders ORDER BY [dbo].[Orders].[CustomerName] DESC')).toEqual({
      CustomerName: { sortType: 'DESC', sortOrder: 1 }
    })
  })

  it('skips positional ORDER BY references', () => {
    expect(parseSqlOrderBy('SELECT name, age FROM Orders ORDER BY 1 ASC, 2 DESC')).toEqual({})
  })

  it('ignores ORDER BY inside a subquery', () => {
    const sql = `SELECT * FROM (SELECT id FROM t ORDER BY id) sub ORDER BY sub.name DESC`
    const result = parseSqlOrderBy(sql)
    expect(result).toEqual({ name: { sortType: 'DESC', sortOrder: 1 } })
  })

  it('handles USE [db]; prefix before the SQL', () => {
    expect(parseSqlOrderBy('USE [MyDB];\nSELECT * FROM Orders ORDER BY CustomerName DESC')).toEqual({
      CustomerName: { sortType: 'DESC', sortOrder: 1 }
    })
  })

  it('handles case-insensitive ORDER BY keyword', () => {
    expect(parseSqlOrderBy('select * from orders order by customername asc')).toEqual({
      customername: { sortType: 'ASC', sortOrder: 1 }
    })
  })

  it('returns empty object for empty string', () => {
    expect(parseSqlOrderBy('')).toEqual({})
  })
})

describe('parseSqlTableRefs', () => {
  it('returns empty array for a query with no FROM clause', () => {
    expect(parseSqlTableRefs('SELECT 1')).toEqual([])
  })

  it('parses a bare unqualified table name', () => {
    expect(parseSqlTableRefs('SELECT * FROM Orders')).toEqual([
      { schema: '', tableName: 'Orders' }
    ])
  })

  it('parses schema.table notation', () => {
    expect(parseSqlTableRefs('SELECT * FROM dbo.Orders')).toEqual([
      { schema: 'dbo', tableName: 'Orders' }
    ])
  })

  it('parses bracketed [schema].[table] notation', () => {
    expect(parseSqlTableRefs('SELECT * FROM [dbo].[Orders]')).toEqual([
      { schema: 'dbo', tableName: 'Orders' }
    ])
  })

  it('strips database prefix from three-part [db].[schema].[table] name', () => {
    expect(parseSqlTableRefs('SELECT * FROM [MyDB].[dbo].[Orders]')).toEqual([
      { schema: 'dbo', tableName: 'Orders' }
    ])
  })

  it('strips USE [db]; prefix and then parses correctly', () => {
    const sql = 'USE [MyDB];\nSELECT * FROM [dbo].[Orders]'
    expect(parseSqlTableRefs(sql)).toEqual([{ schema: 'dbo', tableName: 'Orders' }])
  })

  it('parses multiple tables from JOIN clauses', () => {
    const sql = 'SELECT * FROM [dbo].[Orders] o JOIN [dbo].[Customers] c ON o.CustomerId = c.Id'
    expect(parseSqlTableRefs(sql)).toEqual([
      { schema: 'dbo', tableName: 'Orders' },
      { schema: 'dbo', tableName: 'Customers' }
    ])
  })

  it('de-duplicates the same table appearing more than once', () => {
    const sql = 'SELECT * FROM dbo.Orders o1 JOIN dbo.Orders o2 ON o1.Id = o2.ParentId'
    expect(parseSqlTableRefs(sql)).toEqual([{ schema: 'dbo', tableName: 'Orders' }])
  })

  it('does not include tables inside subqueries', () => {
    const sql = 'SELECT * FROM (SELECT id FROM dbo.Inner) sub JOIN dbo.Outer o ON sub.id = o.id'
    const refs = parseSqlTableRefs(sql)
    expect(refs).toEqual([{ schema: 'dbo', tableName: 'Outer' }])
  })

  it('skips line comments', () => {
    const sql = '-- SELECT * FROM Ignored\nSELECT * FROM dbo.Orders'
    expect(parseSqlTableRefs(sql)).toEqual([{ schema: 'dbo', tableName: 'Orders' }])
  })

  it('skips block comments', () => {
    const sql = '/* FROM Ignored */ SELECT * FROM dbo.Orders'
    expect(parseSqlTableRefs(sql)).toEqual([{ schema: 'dbo', tableName: 'Orders' }])
  })

  it('skips table names inside string literals', () => {
    const sql = "SELECT 'FROM Ignored' AS x, * FROM dbo.Orders"
    expect(parseSqlTableRefs(sql)).toEqual([{ schema: 'dbo', tableName: 'Orders' }])
  })

  it('returns empty array for empty string', () => {
    expect(parseSqlTableRefs('')).toEqual([])
  })
})

// ── parseSqlWhere ─────────────────────────────────────────────────────────────

describe('parseSqlWhere', () => {
  it('returns empty set when there is no WHERE clause', () => {
    expect(parseSqlWhere('SELECT * FROM Orders')).toEqual(new Set())
  })

  it('returns empty set for an empty string', () => {
    expect(parseSqlWhere('')).toEqual(new Set())
  })

  it('detects a single equality filter column', () => {
    expect(parseSqlWhere('SELECT * FROM Orders WHERE Status = 1')).toEqual(new Set(['Status']))
  })

  it('detects a bracket-quoted column', () => {
    expect(parseSqlWhere('SELECT * FROM Orders WHERE [Status] = 1')).toEqual(new Set(['Status']))
  })

  it('detects a column with table alias prefix', () => {
    expect(parseSqlWhere('SELECT * FROM Orders o WHERE o.Status = 1')).toEqual(new Set(['Status']))
  })

  it('detects a column with bracketed table prefix', () => {
    expect(parseSqlWhere('SELECT * FROM Orders WHERE [t1].[Age] > 18')).toEqual(new Set(['Age']))
  })

  it('detects multiple filtered columns', () => {
    const sql = 'SELECT * FROM Orders WHERE Status = 1 AND Age > 18'
    expect(parseSqlWhere(sql)).toEqual(new Set(['Status', 'Age']))
  })

  it('detects LIKE filter', () => {
    expect(parseSqlWhere("SELECT * FROM Users WHERE Name LIKE '%John%'")).toEqual(new Set(['Name']))
  })

  it('detects IN filter', () => {
    expect(parseSqlWhere('SELECT * FROM Orders WHERE Status IN (1, 2, 3)')).toEqual(new Set(['Status']))
  })

  it('detects BETWEEN filter', () => {
    expect(parseSqlWhere('SELECT * FROM Orders WHERE Price BETWEEN 10 AND 100')).toEqual(new Set(['Price']))
  })

  it('detects IS NULL filter', () => {
    expect(parseSqlWhere('SELECT * FROM Orders WHERE DeletedAt IS NULL')).toEqual(new Set(['DeletedAt']))
  })

  it('detects NOT LIKE filter', () => {
    expect(parseSqlWhere("SELECT * FROM Users WHERE Email NOT LIKE '%@test.com'")).toEqual(new Set(['Email']))
  })

  it('does not include columns after ORDER BY', () => {
    const sql = 'SELECT * FROM Orders WHERE Status = 1 ORDER BY CreatedAt DESC'
    const result = parseSqlWhere(sql)
    expect(result.has('Status')).toBe(true)
    expect(result.has('CreatedAt')).toBe(false)
  })

  it('handles case-insensitive WHERE keyword', () => {
    const result = parseSqlWhere('select * from orders where status = 1')
    expect(result.has('status')).toBe(true)
  })

  it('handles query builder style [alias].[col] filter format', () => {
    const sql = "SELECT [t1].[Name], [t1].[Age] FROM [dbo].[Users] AS [t1]\nWHERE\n    [t1].[Age] > 18\n    AND [t1].[Name] LIKE '%John%'"
    expect(parseSqlWhere(sql)).toEqual(new Set(['Age', 'Name']))
  })

  it('returns empty set when WHERE clause is empty after stripping', () => {
    expect(parseSqlWhere('SELECT * FROM Orders WHERE ORDER BY Id')).toEqual(new Set())
  })
})

// ── buildFilteredColumns ──────────────────────────────────────────────────────

describe('buildFilteredColumns', () => {
  it('returns empty set when no columns have filters', () => {
    const configs = [colConfig('id'), colConfig('name')]
    expect(buildFilteredColumns(configs, true)).toEqual(new Set())
  })

  it('returns empty set when isSyncedWithUI is false', () => {
    const configs = [colConfig('id', { filter: '> 5' })]
    expect(buildFilteredColumns(configs, false)).toEqual(new Set())
  })

  it('returns column name for a filtered column', () => {
    const configs = [colConfig('Age', { filter: '> 18' })]
    expect(buildFilteredColumns(configs, true)).toEqual(new Set(['Age']))
  })

  it('uses alias as the key when alias is set', () => {
    const configs = [colConfig('Age', { alias: 'user_age', filter: '> 18' })]
    expect(buildFilteredColumns(configs, true)).toEqual(new Set(['user_age']))
  })

  it('falls back to columnName when alias is only whitespace', () => {
    const configs = [colConfig('Age', { alias: '   ', filter: '> 18' })]
    expect(buildFilteredColumns(configs, true)).toEqual(new Set(['Age']))
  })

  it('returns multiple filtered columns', () => {
    const configs = [
      colConfig('Age', { filter: '> 18' }),
      colConfig('Name', { filter: "LIKE '%John%'" }),
      colConfig('Id') // no filter
    ]
    expect(buildFilteredColumns(configs, true)).toEqual(new Set(['Age', 'Name']))
  })

  it('excludes columns with empty or whitespace-only filter', () => {
    const configs = [colConfig('Age', { filter: '   ' }), colConfig('Name', { filter: '' })]
    expect(buildFilteredColumns(configs, true)).toEqual(new Set())
  })

  it('returns empty set for empty config array', () => {
    expect(buildFilteredColumns([], true)).toEqual(new Set())
  })
})

// ── modifyOrderByInSql ────────────────────────────────────────────────────────

describe('modifyOrderByInSql – toggle (no existing ORDER BY)', () => {
  it('appends ORDER BY col ASC when there is no ORDER BY', () => {
    const sql = 'SELECT * FROM Orders'
    expect(modifyOrderByInSql(sql, 'Name', 'toggle')).toBe(
      'SELECT * FROM Orders\nORDER BY Name ASC'
    )
  })

  it('bracket-quotes column names that contain spaces', () => {
    const sql = 'SELECT * FROM Orders'
    expect(modifyOrderByInSql(sql, 'First Name', 'toggle')).toBe(
      'SELECT * FROM Orders\nORDER BY [First Name] ASC'
    )
  })

  it('does not bracket-quote plain identifiers', () => {
    const sql = 'SELECT * FROM Orders'
    expect(modifyOrderByInSql(sql, 'Age', 'toggle')).toBe(
      'SELECT * FROM Orders\nORDER BY Age ASC'
    )
  })

  it('strips trailing semicolon before appending ORDER BY', () => {
    const sql = 'SELECT * FROM Orders;'
    expect(modifyOrderByInSql(sql, 'Age', 'toggle')).toBe(
      'SELECT * FROM Orders\nORDER BY Age ASC'
    )
  })
})

describe('modifyOrderByInSql – toggle (existing ORDER BY)', () => {
  it('adds column as ASC when it is not already in ORDER BY', () => {
    const sql = 'SELECT * FROM Orders ORDER BY Name ASC'
    expect(modifyOrderByInSql(sql, 'Age', 'toggle')).toBe(
      'SELECT * FROM Orders ORDER BY Name ASC, Age ASC'
    )
  })

  it('flips ASC to DESC for a column already in ORDER BY', () => {
    const sql = 'SELECT * FROM Orders ORDER BY Name ASC'
    expect(modifyOrderByInSql(sql, 'Name', 'toggle')).toBe(
      'SELECT * FROM Orders ORDER BY Name DESC'
    )
  })

  it('flips DESC to ASC for a column already in ORDER BY', () => {
    const sql = 'SELECT * FROM Orders ORDER BY Name DESC'
    expect(modifyOrderByInSql(sql, 'Name', 'toggle')).toBe(
      'SELECT * FROM Orders ORDER BY Name ASC'
    )
  })

  it('treats implicit direction as ASC and changes to DESC', () => {
    const sql = 'SELECT * FROM Orders ORDER BY Name'
    expect(modifyOrderByInSql(sql, 'Name', 'toggle')).toBe(
      'SELECT * FROM Orders ORDER BY Name DESC'
    )
  })

  it('column matching is case-insensitive', () => {
    const sql = 'SELECT * FROM Orders ORDER BY name ASC'
    expect(modifyOrderByInSql(sql, 'NAME', 'toggle')).toBe(
      'SELECT * FROM Orders ORDER BY name DESC'
    )
  })

  it('handles bracket-quoted column names in existing ORDER BY', () => {
    const sql = 'SELECT * FROM Orders ORDER BY [Name] ASC'
    expect(modifyOrderByInSql(sql, 'Name', 'toggle')).toBe(
      'SELECT * FROM Orders ORDER BY [Name] DESC'
    )
  })

  it('preserves multiple columns and only modifies the target', () => {
    const sql = 'SELECT * FROM Orders ORDER BY Name ASC, Age DESC'
    expect(modifyOrderByInSql(sql, 'Age', 'toggle')).toBe(
      'SELECT * FROM Orders ORDER BY Name ASC, Age ASC'
    )
  })

  it('preserves trailing OFFSET clause', () => {
    const sql = 'SELECT * FROM Orders ORDER BY Name ASC OFFSET 0 ROWS FETCH NEXT 10 ROWS ONLY'
    expect(modifyOrderByInSql(sql, 'Age', 'toggle')).toBe(
      'SELECT * FROM Orders ORDER BY Name ASC, Age ASC OFFSET 0 ROWS FETCH NEXT 10 ROWS ONLY'
    )
  })

  it('preserves trailing OFFSET clause when toggling existing column', () => {
    const sql = 'SELECT * FROM Orders ORDER BY Name ASC OFFSET 0 ROWS FETCH NEXT 10 ROWS ONLY'
    expect(modifyOrderByInSql(sql, 'Name', 'toggle')).toBe(
      'SELECT * FROM Orders ORDER BY Name DESC OFFSET 0 ROWS FETCH NEXT 10 ROWS ONLY'
    )
  })
})

describe('modifyOrderByInSql – remove', () => {
  it('removes the specified column from ORDER BY', () => {
    const sql = 'SELECT * FROM Orders ORDER BY Name ASC, Age DESC'
    expect(modifyOrderByInSql(sql, 'Name', 'remove')).toBe(
      'SELECT * FROM Orders ORDER BY Age DESC'
    )
  })

  it('removes the last column and strips the entire ORDER BY clause', () => {
    const sql = 'SELECT * FROM Orders ORDER BY Name ASC'
    expect(modifyOrderByInSql(sql, 'Name', 'remove')).toBe(
      'SELECT * FROM Orders'
    )
  })

  it('returns sql unchanged when the column is not in ORDER BY', () => {
    const sql = 'SELECT * FROM Orders ORDER BY Name ASC'
    expect(modifyOrderByInSql(sql, 'Age', 'remove')).toBe(sql)
  })

  it('returns sql unchanged when there is no ORDER BY', () => {
    const sql = 'SELECT * FROM Orders'
    expect(modifyOrderByInSql(sql, 'Name', 'remove')).toBe(sql)
  })

  it('remove is case-insensitive', () => {
    const sql = 'SELECT * FROM Orders ORDER BY name ASC'
    expect(modifyOrderByInSql(sql, 'NAME', 'remove')).toBe(
      'SELECT * FROM Orders'
    )
  })

  it('preserves trailing OFFSET clause after removing one of multiple columns', () => {
    const sql = 'SELECT * FROM Orders ORDER BY Name ASC, Age DESC OFFSET 0 ROWS FETCH NEXT 10 ROWS ONLY'
    expect(modifyOrderByInSql(sql, 'Name', 'remove')).toBe(
      'SELECT * FROM Orders ORDER BY Age DESC OFFSET 0 ROWS FETCH NEXT 10 ROWS ONLY'
    )
  })

  it('preserves trailing OFFSET when removing the last column', () => {
    const sql = 'SELECT * FROM Orders ORDER BY Name ASC OFFSET 0 ROWS FETCH NEXT 10 ROWS ONLY'
    expect(modifyOrderByInSql(sql, 'Name', 'remove')).toBe(
      'SELECT * FROM Orders OFFSET 0 ROWS FETCH NEXT 10 ROWS ONLY'
    )
  })

  it('handles bracket-quoted column in ORDER BY during remove', () => {
    const sql = 'SELECT * FROM Orders ORDER BY [Name] ASC, Age DESC'
    expect(modifyOrderByInSql(sql, 'Name', 'remove')).toBe(
      'SELECT * FROM Orders ORDER BY Age DESC'
    )
  })
})

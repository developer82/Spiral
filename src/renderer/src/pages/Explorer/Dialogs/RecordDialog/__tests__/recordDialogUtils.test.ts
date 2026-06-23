import { describe, it, expect } from 'vitest'
import type { TableColumnMeta } from '../../../../../../../preload/index.d'
import { getFieldInputType, formatSqlValue, buildInsertSql, buildUpdateRowSql, quoteIdentifier, quoteTableRef } from '../recordDialogUtils'

function makeCol(overrides: Partial<TableColumnMeta> = {}): TableColumnMeta {
  return {
    name: 'Col',
    type: 'varchar',
    maxLength: 100,
    precision: null,
    scale: null,
    isNullable: false,
    defaultValue: null,
    isIdentity: false,
    identitySeed: null,
    identityIncrement: null,
    isPrimaryKey: false,
    ...overrides
  }
}

const sourceTable = { schema: 'dbo', table: 'Users' }

// ─── getFieldInputType ────────────────────────────────────────────────────────

describe('getFieldInputType', () => {
  it('maps bit to boolean', () => {
    expect(getFieldInputType(makeCol({ type: 'bit' }))).toBe('boolean')
  })

  it('maps boolean to boolean', () => {
    expect(getFieldInputType(makeCol({ type: 'boolean' }))).toBe('boolean')
  })

  it('maps int to number', () => {
    expect(getFieldInputType(makeCol({ type: 'int' }))).toBe('number')
  })

  it('maps decimal to number', () => {
    expect(getFieldInputType(makeCol({ type: 'decimal' }))).toBe('number')
  })

  it('maps float to number', () => {
    expect(getFieldInputType(makeCol({ type: 'float' }))).toBe('number')
  })

  it('maps date to date', () => {
    expect(getFieldInputType(makeCol({ type: 'date' }))).toBe('date')
  })

  it('maps datetime to datetime', () => {
    expect(getFieldInputType(makeCol({ type: 'datetime' }))).toBe('datetime')
  })

  it('maps datetime2 to datetime', () => {
    expect(getFieldInputType(makeCol({ type: 'datetime2' }))).toBe('datetime')
  })

  it('maps time to time', () => {
    expect(getFieldInputType(makeCol({ type: 'time' }))).toBe('time')
  })

  it('maps text to textarea', () => {
    expect(getFieldInputType(makeCol({ type: 'text', maxLength: null }))).toBe('textarea')
  })

  it('maps varchar(max) (maxLength -1) to textarea', () => {
    expect(getFieldInputType(makeCol({ type: 'varchar', maxLength: -1 }))).toBe('textarea')
  })

  it('maps nvarchar to text by default', () => {
    expect(getFieldInputType(makeCol({ type: 'nvarchar', maxLength: 255 }))).toBe('text')
  })

  it('maps varchar(100) to text', () => {
    expect(getFieldInputType(makeCol({ type: 'varchar', maxLength: 100 }))).toBe('text')
  })
})

// ─── formatSqlValue ───────────────────────────────────────────────────────────

describe('formatSqlValue', () => {
  it('returns NULL for null when nullable', () => {
    const col = makeCol({ isNullable: true })
    expect(formatSqlValue(col, null)).toBe('NULL')
  })

  it('returns NULL for undefined when nullable', () => {
    const col = makeCol({ isNullable: true })
    expect(formatSqlValue(col, undefined)).toBe('NULL')
  })

  it('returns empty string for empty string when not nullable', () => {
    const col = makeCol({ isNullable: false })
    expect(formatSqlValue(col, '')).toBe("''")
  })

  it('formats boolean true as 1 for bit', () => {
    const col = makeCol({ type: 'bit' })
    expect(formatSqlValue(col, true)).toBe('1')
  })

  it('formats boolean false as 0 for bit', () => {
    const col = makeCol({ type: 'bit' })
    expect(formatSqlValue(col, false)).toBe('0')
  })

  it('formats boolean string "true" as 1', () => {
    const col = makeCol({ type: 'bit' })
    expect(formatSqlValue(col, 'true')).toBe('1')
  })

  it('formats numbers as raw numeric', () => {
    const col = makeCol({ type: 'int' })
    expect(formatSqlValue(col, 42)).toBe('42')
    expect(formatSqlValue(col, '3.14')).toBe('3.14')
  })

  it('quotes string values', () => {
    const col = makeCol({ type: 'varchar' })
    expect(formatSqlValue(col, 'hello')).toBe("'hello'")
  })

  it('escapes single quotes in strings', () => {
    const col = makeCol({ type: 'varchar' })
    expect(formatSqlValue(col, "O'Brien")).toBe("'O''Brien'")
  })

  it('applies N prefix for nvarchar', () => {
    const col = makeCol({ type: 'nvarchar' })
    expect(formatSqlValue(col, 'hello')).toBe("N'hello'")
  })

  it('applies N prefix for nchar and escapes quotes', () => {
    const col = makeCol({ type: 'nchar' })
    expect(formatSqlValue(col, "O'Neill")).toBe("N'O''Neill'")
  })

  it('does NOT apply N prefix for nvarchar on sqlite', () => {
    const col = makeCol({ type: 'nvarchar' })
    expect(formatSqlValue(col, 'hello', 'sqlite')).toBe("'hello'")
  })

  it('does NOT apply N prefix for nvarchar on postgres', () => {
    const col = makeCol({ type: 'nvarchar' })
    expect(formatSqlValue(col, 'hello', 'postgres')).toBe("'hello'")
  })

  it('does NOT apply N prefix for nvarchar on mysql', () => {
    const col = makeCol({ type: 'nvarchar' })
    expect(formatSqlValue(col, 'hello', 'mysql')).toBe("'hello'")
  })

  it('quotes date values (no provider)', () => {
    const col = makeCol({ type: 'date' })
    expect(formatSqlValue(col, '2026-05-06')).toBe("'2026-05-06'")
  })

  it('quotes datetime values (no provider)', () => {
    const col = makeCol({ type: 'datetime' })
    expect(formatSqlValue(col, '2026-05-06T12:00')).toBe("'2026-05-06T12:00'")
  })
})

// ─── formatSqlValue – SQL Server date CONVERT ─────────────────────────────────

describe('formatSqlValue – sqlserver date CONVERT', () => {
  it('wraps date in CONVERT with style 23', () => {
    const col = makeCol({ type: 'date' })
    expect(formatSqlValue(col, '2026-05-06', 'sqlserver')).toBe("CONVERT(date, '2026-05-06', 23)")
  })

  it('wraps datetime in CONVERT with ODBC style 120 and normalizes to have seconds', () => {
    const col = makeCol({ type: 'datetime' })
    expect(formatSqlValue(col, '2026-05-06T12:00', 'sqlserver')).toBe("CONVERT(datetime, '2026-05-06 12:00:00', 120)")
  })

  it('wraps datetime in CONVERT and preserves seconds when already present', () => {
    const col = makeCol({ type: 'datetime' })
    expect(formatSqlValue(col, '2026-05-06T12:00:30', 'sqlserver')).toBe("CONVERT(datetime, '2026-05-06 12:00:30', 120)")
  })

  it('wraps datetime2 in CONVERT with ODBC style 120', () => {
    const col = makeCol({ type: 'datetime2' })
    expect(formatSqlValue(col, '2026-05-06T12:00:00', 'sqlserver')).toBe("CONVERT(datetime2, '2026-05-06 12:00:00', 120)")
  })

  it('wraps smalldatetime in CONVERT with ODBC style 120', () => {
    const col = makeCol({ type: 'smalldatetime' })
    expect(formatSqlValue(col, '2026-05-06T08:30', 'sqlserver')).toBe("CONVERT(smalldatetime, '2026-05-06 08:30:00', 120)")
  })

  it('wraps datetimeoffset in CONVERT with ODBC style 120', () => {
    const col = makeCol({ type: 'datetimeoffset' })
    expect(formatSqlValue(col, '2026-05-06T12:00', 'sqlserver')).toBe("CONVERT(datetimeoffset, '2026-05-06 12:00:00', 120)")
  })

  it('wraps time in CONVERT with style 8 and pads missing seconds', () => {
    const col = makeCol({ type: 'time' })
    expect(formatSqlValue(col, '14:30', 'sqlserver')).toBe("CONVERT(time, '14:30:00', 8)")
  })

  it('wraps time in CONVERT with style 8 and preserves seconds when present', () => {
    const col = makeCol({ type: 'time' })
    expect(formatSqlValue(col, '14:30:00', 'sqlserver')).toBe("CONVERT(time, '14:30:00', 8)")
  })

  it('does NOT use CONVERT for date when provider is postgres', () => {
    const col = makeCol({ type: 'date' })
    expect(formatSqlValue(col, '2026-05-06', 'postgres')).toBe("'2026-05-06'")
  })

  it('returns NULL for null date regardless of provider', () => {
    const col = makeCol({ type: 'date', isNullable: true })
    expect(formatSqlValue(col, null, 'sqlserver')).toBe('NULL')
  })
})

// ─── buildInsertSql – provider-aware dates ────────────────────────────────────

describe('buildInsertSql – sqlserver date CONVERT', () => {
  it('emits CONVERT for date column when provider is sqlserver', () => {
    const schema = [
      makeCol({ name: 'Id', type: 'int', isIdentity: true, isPrimaryKey: true }),
      makeCol({ name: 'BirthDate', type: 'date', isNullable: true })
    ]
    const values = { Id: null, BirthDate: '1990-03-15' }
    const sql = buildInsertSql(sourceTable, schema, values, 'sqlserver')
    expect(sql).toContain("CONVERT(date, '1990-03-15', 23)")
  })

  it('emits plain string for date column when provider is postgres', () => {
    const schema = [makeCol({ name: 'BirthDate', type: 'date', isNullable: true })]
    const values = { BirthDate: '1990-03-15' }
    const sql = buildInsertSql(sourceTable, schema, values, 'postgres')
    expect(sql).toContain("'1990-03-15'")
    expect(sql).not.toContain('CONVERT')
  })
})

// ─── buildUpdateRowSql – provider-aware dates ─────────────────────────────────

describe('buildUpdateRowSql – sqlserver date CONVERT', () => {
  it('emits CONVERT for datetime2 column in SET clause when provider is sqlserver', () => {
    const schema = [
      makeCol({ name: 'Id', type: 'int', isPrimaryKey: true }),
      makeCol({ name: 'UpdatedAt', type: 'datetime2' })
    ]
    const values = { Id: '1', UpdatedAt: '2026-05-06T10:00' }
    const sql = buildUpdateRowSql(sourceTable, schema, values, ['Id'], 'sqlserver')
    expect(sql).toContain("CONVERT(datetime2, '2026-05-06 10:00:00', 120)")
  })
})

// ─── buildInsertSql ───────────────────────────────────────────────────────────

describe('buildInsertSql', () => {
  it('generates a basic INSERT with bracketed identifiers', () => {
    const schema = [
      makeCol({ name: 'Name', type: 'varchar', maxLength: 100 }),
      makeCol({ name: 'Age', type: 'int' })
    ]
    const values = { Name: 'Alice', Age: '30' }
    const sql = buildInsertSql(sourceTable, schema, values)
    expect(sql).toBe("INSERT INTO [dbo].[Users] ([Name], [Age]) VALUES ('Alice', 30)")
  })

  it('skips identity columns', () => {
    const schema = [
      makeCol({ name: 'Id', type: 'int', isIdentity: true, isPrimaryKey: true }),
      makeCol({ name: 'Name', type: 'varchar' })
    ]
    const values = { Id: null, Name: 'Bob' }
    const sql = buildInsertSql(sourceTable, schema, values)
    expect(sql).not.toContain('[Id]')
    expect(sql).toContain('[Name]')
  })

  it('inserts NULL for nullable columns with null value', () => {
    const schema = [
      makeCol({ name: 'Name', type: 'varchar', isNullable: true })
    ]
    const values = { Name: null }
    const sql = buildInsertSql(sourceTable, schema, values)
    expect(sql).toContain('NULL')
  })

  it('uses N-prefix for nvarchar values (sqlserver default)', () => {
    const schema = [
      makeCol({ name: 'Title', type: 'nvarchar', maxLength: 200 })
    ]
    const values = { Title: 'héllo' }
    const sql = buildInsertSql(sourceTable, schema, values)
    expect(sql).toContain("N'héllo'")
  })

  it('does NOT use N-prefix for nvarchar values on sqlite', () => {
    const schema = [
      makeCol({ name: 'Title', type: 'nvarchar', maxLength: 200 })
    ]
    const values = { Title: 'héllo' }
    const sql = buildInsertSql({ schema: '', table: 'Items' }, schema, values, 'sqlite')
    expect(sql).toContain("'héllo'")
    expect(sql).not.toContain("N'")
  })
})

// ─── buildUpdateRowSql ────────────────────────────────────────────────────────

describe('buildUpdateRowSql', () => {
  it('generates a basic UPDATE with correct SET and WHERE', () => {
    const schema = [
      makeCol({ name: 'Id', type: 'int', isPrimaryKey: true }),
      makeCol({ name: 'Name', type: 'varchar' })
    ]
    const values = { Id: '1', Name: 'Carol' }
    const sql = buildUpdateRowSql(sourceTable, schema, values, ['Id'])
    expect(sql).toBe("UPDATE [dbo].[Users] SET [Name] = 'Carol' WHERE [Id] = 1")
  })

  it('excludes PK from SET clause', () => {
    const schema = [
      makeCol({ name: 'Id', type: 'int', isPrimaryKey: true }),
      makeCol({ name: 'Email', type: 'varchar' })
    ]
    const values = { Id: '5', Email: 'test@example.com' }
    const sql = buildUpdateRowSql(sourceTable, schema, values, ['Id'])
    expect(sql).not.toMatch(/SET \[Id\]/)
    expect(sql).toContain("SET [Email]")
  })

  it('excludes identity columns from SET clause', () => {
    const schema = [
      makeCol({ name: 'Id', type: 'int', isIdentity: true, isPrimaryKey: true }),
      makeCol({ name: 'Score', type: 'int' })
    ]
    const values = { Id: '10', Score: '99' }
    const sql = buildUpdateRowSql(sourceTable, schema, values, ['Id'])
    expect(sql).not.toMatch(/SET \[Id\]/)
    expect(sql).toContain('SET [Score] = 99')
  })

  it('handles composite primary key in WHERE', () => {
    const schema = [
      makeCol({ name: 'OrgId', type: 'int', isPrimaryKey: true }),
      makeCol({ name: 'UserId', type: 'int', isPrimaryKey: true }),
      makeCol({ name: 'Role', type: 'varchar' })
    ]
    const values = { OrgId: '3', UserId: '7', Role: 'admin' }
    const sql = buildUpdateRowSql(sourceTable, schema, values, ['OrgId', 'UserId'])
    expect(sql).toContain('[OrgId] = 3')
    expect(sql).toContain('[UserId] = 7')
    expect(sql).toContain("SET [Role] = 'admin'")
  })

  it('sets NULL in WHERE when PK value is null', () => {
    const schema = [
      makeCol({ name: 'Code', type: 'varchar', isPrimaryKey: true, isNullable: true }),
      makeCol({ name: 'Label', type: 'varchar' })
    ]
    const values = { Code: null, Label: 'test' }
    const sql = buildUpdateRowSql(sourceTable, schema, values, ['Code'])
    expect(sql).toContain('[Code] IS NULL')
  })
})

// ─── quoteIdentifier / quoteTableRef ─────────────────────────────────────────

describe('quoteIdentifier', () => {
  it('uses square brackets for sqlserver (default)', () => {
    expect(quoteIdentifier('Users', 'sqlserver')).toBe('[Users]')
    expect(quoteIdentifier('Users')).toBe('[Users]')
  })

  it('uses double quotes for sqlite', () => {
    expect(quoteIdentifier('Users', 'sqlite')).toBe('"Users"')
  })

  it('uses double quotes for postgres', () => {
    expect(quoteIdentifier('Users', 'postgres')).toBe('"Users"')
  })

  it('uses backticks for mysql', () => {
    expect(quoteIdentifier('Users', 'mysql')).toBe('`Users`')
  })

  it('escapes embedded double quotes for sqlite', () => {
    expect(quoteIdentifier('my"table', 'sqlite')).toBe('"my""table"')
  })
})

describe('quoteTableRef', () => {
  const table = { schema: 'dbo', table: 'Users' }

  it('returns schema.table with square brackets for sqlserver', () => {
    expect(quoteTableRef(table, 'sqlserver')).toBe('[dbo].[Users]')
  })

  it('returns only table name with double quotes for sqlite', () => {
    expect(quoteTableRef(table, 'sqlite')).toBe('"Users"')
  })

  it('returns schema.table with double quotes for postgres', () => {
    expect(quoteTableRef(table, 'postgres')).toBe('"dbo"."Users"')
  })

  it('returns only table name with backticks for mysql', () => {
    expect(quoteTableRef(table, 'mysql')).toBe('`Users`')
  })
})

// ─── buildInsertSql – SQLite ──────────────────────────────────────────────────

describe('buildInsertSql – sqlite', () => {
  const sqliteTable = { schema: '', table: 'Users' }

  it('generates INSERT with double-quoted identifiers and no schema prefix', () => {
    const schema = [
      makeCol({ name: 'Name', type: 'varchar', maxLength: 100 }),
      makeCol({ name: 'Age', type: 'int' })
    ]
    const values = { Name: 'Alice', Age: '30' }
    const sql = buildInsertSql(sqliteTable, schema, values, 'sqlite')
    expect(sql).toBe('INSERT INTO "Users" ("Name", "Age") VALUES (\'Alice\', 30)')
  })

  it('does not include schema prefix even when schema is provided', () => {
    const tableWithSchema = { schema: 'main', table: 'Orders' }
    const schema = [makeCol({ name: 'Id', type: 'int' })]
    const values = { Id: '1' }
    const sql = buildInsertSql(tableWithSchema, schema, values, 'sqlite')
    expect(sql).toMatch(/^INSERT INTO "Orders"/)
    expect(sql).not.toContain('main')
  })
})

// ─── buildUpdateRowSql – SQLite ───────────────────────────────────────────────

describe('buildUpdateRowSql – sqlite', () => {
  const sqliteTable = { schema: '', table: 'Users' }

  it('generates UPDATE with double-quoted identifiers and no schema prefix', () => {
    const schema = [
      makeCol({ name: 'Id', type: 'int', isPrimaryKey: true }),
      makeCol({ name: 'Name', type: 'varchar' })
    ]
    const values = { Id: '1', Name: 'Bob' }
    const sql = buildUpdateRowSql(sqliteTable, schema, values, ['Id'], 'sqlite')
    expect(sql).toBe('UPDATE "Users" SET "Name" = \'Bob\' WHERE "Id" = 1')
  })
})

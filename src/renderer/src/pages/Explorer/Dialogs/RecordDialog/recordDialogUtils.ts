import type { TableColumnMeta } from '../../../../../../preload/index.d'

// ─── Field type mapping ────────────────────────────────────────────────────────

export type FieldInputType = 'text' | 'textarea' | 'number' | 'boolean' | 'date' | 'datetime' | 'time'

const NUMBER_TYPES = new Set([
  'tinyint', 'smallint', 'int', 'bigint',
  'decimal', 'numeric', 'float', 'real', 'money', 'smallmoney',
  // PostgreSQL
  'integer', 'serial', 'bigserial', 'smallserial', 'double precision'
])

const DATE_TYPES = new Set(['date'])
const DATETIME_TYPES = new Set(['datetime', 'datetime2', 'smalldatetime', 'datetimeoffset', 'timestamp', 'timestamp without time zone', 'timestamp with time zone'])
const TIME_TYPES = new Set(['time', 'time without time zone', 'time with time zone'])
const BOOLEAN_TYPES = new Set(['bit', 'boolean', 'bool'])
const UNICODE_TYPES = new Set(['nvarchar', 'nchar', 'ntext'])

export function getFieldInputType(col: TableColumnMeta): FieldInputType {
  const t = col.type.toLowerCase()
  if (BOOLEAN_TYPES.has(t)) return 'boolean'
  if (NUMBER_TYPES.has(t)) return 'number'
  if (DATE_TYPES.has(t)) return 'date'
  if (DATETIME_TYPES.has(t)) return 'datetime'
  if (TIME_TYPES.has(t)) return 'time'
  // Long text: text/ntext/varchar(max) = maxLength -1
  if (t === 'text' || t === 'ntext' || col.maxLength === -1) return 'textarea'
  return 'text'
}

// ─── Value formatting ──────────────────────────────────────────────────────────

function isUnicodeType(type: string): boolean {
  return UNICODE_TYPES.has(type.toLowerCase())
}

/**
 * Converts a datetime-local value ('yyyy-MM-ddTHH:mm' or 'yyyy-MM-ddTHH:mm:ss')
 * to ODBC canonical format ('yyyy-mm-dd hh:mi:ss') required by SQL Server style 120.
 */
function toOdbcDatetime(v: string): string {
  // Replace ISO 'T' separator with space
  let s = v.replace('T', ' ')
  // Pad missing seconds: 'yyyy-mm-dd HH:mm' → 'yyyy-mm-dd HH:mm:00'
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(s)) s += ':00'
  return s
}

/**
 * Ensures a time value has seconds: 'HH:mm' → 'HH:mm:ss'.
 */
function normalizeTime(v: string): string {
  return /^\d{2}:\d{2}$/.test(v) ? v + ':00' : v
}

// SQL Server explicit CONVERT styles for unambiguous date/time parsing.
// - date:      style 23  = yyyy-mm-dd (ISO)
// - datetime*: style 120 = yyyy-mm-dd hh:mi:ss (ODBC canonical, no T separator required)
// - time:      style 8   = hh:mi:ss
// Values are normalized before embedding so seconds are always present.
const SQLSERVER_DATE_CONVERT: Partial<Record<string, (val: string) => string>> = {
  date:           (v) => `CONVERT(date, '${v}', 23)`,
  datetime:       (v) => `CONVERT(datetime, '${toOdbcDatetime(v)}', 120)`,
  datetime2:      (v) => `CONVERT(datetime2, '${toOdbcDatetime(v)}', 120)`,
  smalldatetime:  (v) => `CONVERT(smalldatetime, '${toOdbcDatetime(v)}', 120)`,
  datetimeoffset: (v) => `CONVERT(datetimeoffset, '${toOdbcDatetime(v)}', 120)`,
  time:           (v) => `CONVERT(time, '${normalizeTime(v)}', 8)`,
}

/**
 * Formats a value for embedding in a SQL statement.
 * Applies proper quoting, escaping, and unicode prefix where needed.
 * For SQL Server, date/time values are wrapped in CONVERT() with an explicit
 * style so the conversion is handled by the provider rather than relying on
 * session-level date-format settings.
 */
export function formatSqlValue(col: TableColumnMeta, value: unknown, provider?: string): string {
  if (value === null || value === undefined || value === '') {
    return col.isNullable ? 'NULL' : "''"
  }

  const type = col.type.toLowerCase()

  if (BOOLEAN_TYPES.has(type)) {
    if (typeof value === 'boolean') return value ? '1' : '0'
    const s = String(value).toLowerCase()
    if (s === 'true' || s === '1') return '1'
    return '0'
  }

  if (NUMBER_TYPES.has(type)) {
    const n = Number(value)
    if (isNaN(n)) return 'NULL'
    return String(n)
  }

  // Dates/datetimes/times — value comes in as ISO string from the input
  if (DATE_TYPES.has(type) || DATETIME_TYPES.has(type) || TIME_TYPES.has(type)) {
    const escaped = String(value).replace(/'/g, "''")
    if (provider === 'sqlserver') {
      const convertFn = SQLSERVER_DATE_CONVERT[type]
      if (convertFn) return convertFn(escaped)
    }
    return `'${escaped}'`
  }

  // String types — N-prefix is SQL Server-only; other providers use plain string literals
  const escaped = String(value).replace(/'/g, "''")
  if (isUnicodeType(type) && provider !== 'sqlite' && provider !== 'postgres' && provider !== 'mysql') {
    return `N'${escaped}'`
  }
  return `'${escaped}'`
}

// ─── Identifier quoting ────────────────────────────────────────────────────────

/**
 * Quotes a single identifier according to the target provider's syntax.
 */
export function quoteIdentifier(id: string, provider?: string): string {
  if (provider === 'sqlite' || provider === 'postgres') {
    return `"${id.replace(/"/g, '""')}"`
  }
  if (provider === 'mysql') {
    return `\`${id.replace(/`/g, '``')}\``
  }
  return `[${id}]`
}

/**
 * Quotes a table reference (schema + table) according to the target provider's syntax.
 * SQLite and MySQL do not use schema prefixes in DML statements.
 */
export function quoteTableRef(
  sourceTable: { schema: string; table: string },
  provider?: string
): string {
  const qi = (id: string): string => quoteIdentifier(id, provider)
  if (provider === 'sqlite' || provider === 'mysql') {
    return qi(sourceTable.table)
  }
  return `${qi(sourceTable.schema)}.${qi(sourceTable.table)}`
}

// ─── SQL builders ──────────────────────────────────────────────────────────────

/**
 * Builds an INSERT statement.
 * Identity columns are excluded from the INSERT.
 */
export function buildInsertSql(
  sourceTable: { schema: string; table: string },
  schema: TableColumnMeta[],
  values: Record<string, unknown>,
  provider?: string
): string {
  const quotedTable = quoteTableRef(sourceTable, provider)
  const qi = (id: string): string => quoteIdentifier(id, provider)
  const insertable = schema.filter((col) => !col.isIdentity)

  const cols = insertable.map((col) => qi(col.name)).join(', ')
  const vals = insertable.map((col) => formatSqlValue(col, values[col.name], provider)).join(', ')

  return `INSERT INTO ${quotedTable} (${cols}) VALUES (${vals})`
}

/**
 * Builds an UPDATE statement for a specific row identified by its PKs.
 * PK columns are excluded from the SET clause.
 */
export function buildUpdateRowSql(
  sourceTable: { schema: string; table: string },
  schema: TableColumnMeta[],
  values: Record<string, unknown>,
  pkColumns: string[],
  provider?: string
): string {
  const quotedTable = quoteTableRef(sourceTable, provider)
  const qi = (id: string): string => quoteIdentifier(id, provider)
  const pkSet = new Set(pkColumns)

  const setClauses = schema
    .filter((col) => !pkSet.has(col.name) && !col.isIdentity)
    .map((col) => `${qi(col.name)} = ${formatSqlValue(col, values[col.name], provider)}`)
    .join(', ')

  const whereClauses = schema
    .filter((col) => pkSet.has(col.name))
    .map((col) => {
      const v = values[col.name]
      if (v === null || v === undefined) return `${qi(col.name)} IS NULL`
      return `${qi(col.name)} = ${formatSqlValue(col, v, provider)}`
    })
    .join(' AND ')

  return `UPDATE ${quotedTable} SET ${setClauses} WHERE ${whereClauses}`
}

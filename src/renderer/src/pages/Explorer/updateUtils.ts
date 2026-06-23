import { quoteIdentifier, quoteTableRef } from './Dialogs/RecordDialog/recordDialogUtils'

/**
 * Escapes a value for use in a SQL WHERE clause condition.
 */
function escapeValue(v: unknown): string {
  if (v === null || v === undefined) return 'NULL'
  if (typeof v === 'boolean') return v ? '1' : '0'
  if (typeof v === 'number') return String(v)
  if (v instanceof Date) return `'${v.toISOString().replace(/'/g, "''")}'`
  return `'${String(v).replace(/'/g, "''")}'`
}

/**
 * Builds an UPDATE statement that sets a single boolean column to a new value
 * for the row identified by its primary key values.
 *
 * - `newValue === true`  → `SET [col] = 1`
 * - `newValue === false` → `SET [col] = 0`
 * - `newValue === null`  → `SET [col] = NULL`
 */
export function buildUpdateBooleanSql(
  row: Record<string, unknown>,
  sourceTable: { schema: string; table: string },
  pkColumns: string[],
  columnName: string,
  newValue: boolean | null,
  provider?: string
): string {
  const qi = (id: string): string => quoteIdentifier(id, provider)
  const quotedTable = quoteTableRef(sourceTable, provider)
  const quotedCol = qi(columnName)
  const newValueSql = newValue === null ? 'NULL' : newValue ? '1' : '0'
  const conditions = pkColumns.map((c) => `${qi(c)} = ${escapeValue(row[c])}`)
  return `UPDATE ${quotedTable} SET ${quotedCol} = ${newValueSql} WHERE ${conditions.join(' AND ')}`
}

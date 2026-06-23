import { quoteIdentifier, quoteTableRef } from './Dialogs/RecordDialog/recordDialogUtils'

/**
 * Builds a DELETE statement for a set of rows identified by their primary key values.
 *
 * - Single PK column + multiple rows → `DELETE … WHERE [pk] IN (v1, v2, …)`
 * - Composite PK or any scenario → `DELETE … WHERE (pk1=v1 AND pk2=v2) OR (…)`
 */
export function buildDeleteSql(
  rows: Record<string, unknown>[],
  sourceTable: { schema: string; table: string },
  pkColumns: string[],
  provider?: string
): string {
  function escapeValue(v: unknown): string {
    if (v === null || v === undefined) return 'NULL'
    if (typeof v === 'boolean') return v ? '1' : '0'
    if (typeof v === 'number') return String(v)
    if (v instanceof Date) return `'${v.toISOString().replace(/'/g, "''")}'`
    return `'${String(v).replace(/'/g, "''")}'`
  }

  const qi = (id: string): string => quoteIdentifier(id, provider)
  const quotedTable = quoteTableRef(sourceTable, provider)
  const quotedPks = pkColumns.map((c) => qi(c))

  if (pkColumns.length === 1) {
    const pk = pkColumns[0]
    const values = rows.map((row) => escapeValue(row[pk]))
    return `DELETE FROM ${quotedTable} WHERE ${quotedPks[0]} IN (${values.join(', ')})`
  }

  // Composite PK: (pk1 = v1 AND pk2 = v2) OR (…)
  const conditions = rows.map((row) => {
    const parts = pkColumns.map((c) => `${qi(c)} = ${escapeValue(row[c])}`)
    return `(${parts.join(' AND ')})`
  })
  return `DELETE FROM ${quotedTable} WHERE ${conditions.join(' OR ')}`
}

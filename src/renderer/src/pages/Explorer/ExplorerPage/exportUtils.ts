import type { QueryResultSet } from '../connections.types'

/**
 * Sets a value at a nested path within an object, building intermediate objects
 * as needed. If any path segment is occupied by a non-object value (conflict),
 * the value is stored under the full original dotted key instead.
 */
function setNestedValue(
  obj: Record<string, unknown>,
  originalKey: string,
  parts: string[],
  value: unknown
): void {
  let current = obj
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]
    const existing = current[key]
    if (existing === undefined) {
      current[key] = {}
      current = current[key] as Record<string, unknown>
    } else if (typeof existing === 'object' && existing !== null && !Array.isArray(existing)) {
      current = existing as Record<string, unknown>
    } else {
      // A primitive already occupies this segment – fall back to the flat original key
      obj[originalKey] = value
      return
    }
  }
  current[parts[parts.length - 1]] = value
}

/**
 * Converts a QueryResultSet into an array of plain objects suitable for JSON
 * serialisation. Column names that contain dots (e.g. `customer.id`) are
 * expanded into nested child objects. All other columns remain flat.
 *
 * Conflict rule: if a dotted column's first segment is already occupied by a
 * primitive value (e.g. a flat `customer` column was processed first), the
 * dotted column is stored under its full original name instead.
 */
export function buildJsonRows(rs: QueryResultSet): Record<string, unknown>[] {
  return rs.rows.map((row) => {
    const result: Record<string, unknown> = {}
    for (const col of rs.columns) {
      const value = row[col] ?? null
      if (col.includes('.')) {
        setNestedValue(result, col, col.split('.'), value)
      } else {
        result[col] = value
      }
    }
    return result
  })
}

/**
 * Serialises a QueryResultSet to CSV text (header row + data rows).
 * Values are JSON-stringified so commas and quotes inside cell values are safe.
 */
export function buildCsvContent(rs: QueryResultSet): string {
  const header = rs.columns.join(',')
  const body = rs.rows
    .map((row) => rs.columns.map((c) => JSON.stringify(row[c] ?? '')).join(','))
    .join('\n')
  return `${header}\n${body}`
}

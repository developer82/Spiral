import type { ErdColumn, ErdRelationship, ErdSchema, ErdTable } from '../erd.types'

/** Infinity glyph used to denote a "many" cardinality end. */
export const MANY = '∞'

type ColumnLookup = Map<string, Map<string, ErdColumn>>

function tableKey(schema: string, table: string): string {
  return `${schema}.${table}`
}

/** Build a `schema.table` → (columnName → column) lookup from the schema tables. */
function buildColumnLookup(tables: ErdTable[]): ColumnLookup {
  const lookup: ColumnLookup = new Map()
  for (const table of tables) {
    const columns = new Map<string, ErdColumn>()
    for (const column of table.columns) {
      columns.set(column.name, column)
    }
    lookup.set(tableKey(table.schema, table.name), columns)
  }
  return lookup
}

/**
 * A junction (link) table models a many-to-many relationship. We treat a table
 * as a junction when its primary key is composed solely of exactly two columns,
 * each of which is both a primary key and a foreign key.
 */
export function isJunctionTable(table: ErdTable): boolean {
  const pkColumns = table.columns.filter((col) => col.isPrimaryKey)
  return pkColumns.length === 2 && pkColumns.every((col) => col.isForeignKey)
}

/**
 * Format a relationship's cardinality symbol read along the edge direction
 * (`source = child/FK` → `target = parent/PK`): `<childEnd>:<parentEnd>`.
 *
 * - The parent (`to`) end is always `1` — a FK references a PK/unique column.
 * - The child (`from`) end is `1` when the FK column is unique on its table
 *   (→ one-to-one), otherwise `∞` (→ one-to-many).
 * - A nullable FK column adds a `0..` prefix to the child end (optional
 *   participation).
 */
export function formatCardinality(options: {
  childUnique: boolean
  childNullable: boolean
}): string {
  const { childUnique, childNullable } = options
  const childEnd = childUnique ? '1' : MANY
  const withMin = childNullable ? `0..${childEnd}` : childEnd
  return `${withMin}:1`
}

/**
 * Derive a cardinality symbol for every relationship in the schema, keyed by
 * `constraintName`.
 *
 * Junction tables produce a many-to-many (`∞:∞`) symbol on both of their FK
 * edges; all other relationships are classified from the FK column's primary-key
 * and nullability flags.
 */
export function deriveCardinality(schema: ErdSchema): Map<string, string> {
  const columnLookup = buildColumnLookup(schema.tables)

  const junctionTables = new Set<string>()
  for (const table of schema.tables) {
    if (isJunctionTable(table)) {
      junctionTables.add(tableKey(table.schema, table.name))
    }
  }

  const result = new Map<string, string>()
  for (const rel of schema.relationships) {
    if (result.has(rel.constraintName)) continue

    const fromKey = tableKey(rel.fromSchema, rel.fromTable)
    if (junctionTables.has(fromKey)) {
      result.set(rel.constraintName, `${MANY}:${MANY}`)
      continue
    }

    result.set(rel.constraintName, symbolForRelationship(rel, columnLookup))
  }
  return result
}

function symbolForRelationship(rel: ErdRelationship, columnLookup: ColumnLookup): string {
  const column = columnLookup.get(tableKey(rel.fromSchema, rel.fromTable))?.get(rel.fromColumn)
  // Missing column metadata → assume the common one-to-many case, never throw.
  const childUnique = column?.isPrimaryKey ?? false
  const childNullable = column?.isNullable ?? false
  return formatCardinality({ childUnique, childNullable })
}

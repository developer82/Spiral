import type { SelectedTable, ColumnConfig, ErdRelationship } from './queryEditorTypes'

/**
 * Generates a SELECT query from the current visual query builder state.
 * Auto-detects JOIN conditions from FK relationships between selected tables.
 */
export function generateSQL(
  tables: SelectedTable[],
  columns: ColumnConfig[],
  relationships: ErdRelationship[]
): string {
  if (tables.length === 0) return ''

  const outputColumns = columns.filter((c) => c.output)

  // SELECT clause
  let selectClause: string
  if (outputColumns.length === 0) {
    selectClause = 'SELECT *'
  } else {
    const selectParts = outputColumns.map((c) => {
      const ref = `[${c.tableAlias}].[${c.columnName}]`
      const alias = c.alias.trim()
      return alias && alias !== c.columnName ? `${ref} AS [${alias}]` : ref
    })
    selectClause = 'SELECT\n    ' + selectParts.join(',\n    ')
  }

  // FROM + JOIN clauses
  const [firstTable, ...restTables] = tables
  const fromClause = `FROM [${firstTable.schema}].[${firstTable.name}] AS [${firstTable.alias}]`

  const joinClauses = restTables.map((joinTable) => {
    // Find a FK relationship between joinTable and any already-placed table
    const placed = [firstTable, ...restTables.slice(0, restTables.indexOf(joinTable))]
    const rel = findRelationship(relationships, joinTable, placed)
    if (rel) {
      const { leftAlias, leftCol, rightAlias, rightCol } = rel
      return `INNER JOIN [${joinTable.schema}].[${joinTable.name}] AS [${joinTable.alias}]\n    ON [${leftAlias}].[${leftCol}] = [${rightAlias}].[${rightCol}]`
    }
    // No FK found — emit a CROSS JOIN (user can fix in SQL editor)
    return `CROSS JOIN [${joinTable.schema}].[${joinTable.name}] AS [${joinTable.alias}]`
  })

  // WHERE clause from column filters
  const filterParts = columns
    .filter((c) => c.filter.trim())
    .map((c) => `[${c.tableAlias}].[${c.columnName}] ${c.filter.trim()}`)
  const whereClause = filterParts.length > 0 ? 'WHERE\n    ' + filterParts.join('\n    AND ') : ''

  // ORDER BY clause
  const sortColumns = columns
    .filter((c) => c.sortType !== 'UNSORTED' && c.sortOrder > 0)
    .sort((a, b) => a.sortOrder - b.sortOrder)
  const orderParts = sortColumns.map((c) => `[${c.tableAlias}].[${c.columnName}] ${c.sortType}`)
  const orderClause = orderParts.length > 0 ? 'ORDER BY\n    ' + orderParts.join(',\n    ') : ''

  const parts = [selectClause, fromClause, ...joinClauses, whereClause, orderClause].filter(Boolean)
  return parts.join('\n')
}

interface JoinCondition {
  leftAlias: string
  leftCol: string
  rightAlias: string
  rightCol: string
}

function findRelationship(
  relationships: ErdRelationship[],
  target: SelectedTable,
  placed: SelectedTable[]
): JoinCondition | null {
  for (const rel of relationships) {
    const fromIsTarget =
      rel.fromSchema === target.schema && rel.fromTable === target.name
    const toIsTarget =
      rel.toSchema === target.schema && rel.toTable === target.name

    if (fromIsTarget) {
      const placedTable = placed.find(
        (p) => p.schema === rel.toSchema && p.name === rel.toTable
      )
      if (placedTable) {
        return {
          leftAlias: target.alias,
          leftCol: rel.fromColumn,
          rightAlias: placedTable.alias,
          rightCol: rel.toColumn
        }
      }
    }

    if (toIsTarget) {
      const placedTable = placed.find(
        (p) => p.schema === rel.fromSchema && p.name === rel.fromTable
      )
      if (placedTable) {
        return {
          leftAlias: target.alias,
          leftCol: rel.toColumn,
          rightAlias: placedTable.alias,
          rightCol: rel.fromColumn
        }
      }
    }
  }
  return null
}

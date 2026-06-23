import type { SelectedTable, ColumnConfig, SortType, ErdRelationship } from './queryEditorTypes'
import type { ErdColumn } from '../erd.types'

export interface ParsedQueryState {
  tables: SelectedTable[]
  columnConfigs: ColumnConfig[]
}

/**
 * Parses a SELECT SQL string back into the visual query builder state.
 * Returns null if the SQL is too complex to represent visually
 * (e.g., CTEs, subqueries, UNION, EXCEPT, INTERSECT, multiple tables with no alias).
 */
export function parseSQL(
  sql: string,
  availableTables: { schema: string; name: string; columns: ErdColumn[] }[],
  _relationships: ErdRelationship[]
): ParsedQueryState | null {
  // Reject unsupported constructs
  const upper = sql.toUpperCase()
  if (
    upper.includes('WITH ') ||
    /\bUNION\b/.test(upper) ||
    /\bEXCEPT\b/.test(upper) ||
    /\bINTERSECT\b/.test(upper) ||
    // Subqueries in FROM
    /FROM\s*\(/.test(upper)
  ) {
    return null
  }

  try {
    // Split into major clauses
    const clauses = splitClauses(sql)
    if (!clauses) return null

    const { selectPart, fromPart, joinParts, wherePart, orderByPart } = clauses

    // Parse FROM clause to get primary table + alias
    const tables = parseFromAndJoins(fromPart, joinParts, availableTables)
    if (!tables) return null

    // Parse SELECT columns
    const columnConfigs = parseSelectColumns(
      selectPart,
      tables,
      wherePart,
      orderByPart,
      availableTables
    )
    if (!columnConfigs) return null

    // Mark columns not in SELECT as not output
    const outputSet = new Set(
      columnConfigs.filter((c) => c.output).map((c) => `${c.tableAlias}.${c.columnName}`)
    )

    // Add any FK-related columns from tables that aren't in SELECT
    // (they come from getErdSchema which has the full column list)
    const allConfigs = buildAllColumnConfigs(tables, columnConfigs, outputSet, availableTables)

    return { tables, columnConfigs: allConfigs }
  } catch {
    return null
  }
}

// ─── Clause splitter ─────────────────────────────────────────────────────────

interface Clauses {
  selectPart: string
  fromPart: string
  joinParts: string[]
  wherePart: string
  orderByPart: string
}

function splitClauses(sql: string): Clauses | null {
  // Normalize whitespace
  const normalized = sql.replace(/\s+/g, ' ').trim()

  // Must start with SELECT
  if (!/^SELECT\s/i.test(normalized)) return null

  // Use a regex to extract major clause positions
  // We find the index of FROM, then consume JOIN..ON blocks, then WHERE, ORDER BY
  const fromMatch = /\bFROM\s+/i.exec(normalized)
  if (!fromMatch) return null

  const selectPart = normalized.slice('SELECT'.length, fromMatch.index).trim()
  let rest = normalized.slice(fromMatch.index + fromMatch[0].length)

  // Pull the first table (FROM clause ends at next keyword: JOIN/WHERE/ORDER/GROUP/HAVING)
  const firstTableEnd = /\b(INNER\s+JOIN|LEFT\s+(?:OUTER\s+)?JOIN|RIGHT\s+(?:OUTER\s+)?JOIN|CROSS\s+JOIN|JOIN|WHERE|ORDER\s+BY|GROUP\s+BY|HAVING)\b/i.exec(rest)
  const fromPart = firstTableEnd ? rest.slice(0, firstTableEnd.index).trim() : rest.trim()
  rest = firstTableEnd ? rest.slice(firstTableEnd.index) : ''

  // Collect JOIN blocks
  const joinParts: string[] = []
  const joinRegex = /\b((?:INNER\s+|LEFT\s+(?:OUTER\s+)?|RIGHT\s+(?:OUTER\s+)?|CROSS\s+)?JOIN)\s+([\s\S]*?)(?=\b(?:INNER\s+JOIN|LEFT\s+(?:OUTER\s+)?JOIN|RIGHT\s+(?:OUTER\s+)?JOIN|CROSS\s+JOIN|JOIN|WHERE|ORDER\s+BY|GROUP\s+BY|HAVING)\b|$)/gi
  let joinMatch: RegExpExecArray | null
  while ((joinMatch = joinRegex.exec(rest)) !== null) {
    joinParts.push(joinMatch[0].trim())
  }

  // WHERE
  const whereMatch = /\bWHERE\s+([\s\S]*?)(?=\b(?:ORDER\s+BY|GROUP\s+BY|HAVING)\b|$)/i.exec(rest)
  const wherePart = whereMatch ? whereMatch[1].trim() : ''

  // ORDER BY
  const orderMatch = /\bORDER\s+BY\s+([\s\S]*)$/i.exec(rest)
  const orderByPart = orderMatch ? orderMatch[1].trim() : ''

  return { selectPart, fromPart, joinParts, wherePart, orderByPart }
}

// ─── Table parsing ────────────────────────────────────────────────────────────

function parseFromAndJoins(
  fromPart: string,
  joinParts: string[],
  availableTables: { schema: string; name: string; columns: ErdColumn[] }[]
): SelectedTable[] | null {
  const tables: SelectedTable[] = []

  const firstTable = parseTableRef(fromPart, availableTables, tables.length)
  if (!firstTable) return null
  tables.push(firstTable)

  for (const joinStr of joinParts) {
    // Extract the table reference after JOIN keyword (before ON)
    const afterJoin = /JOIN\s+([\s\S]+?)(?:\s+ON\s+|$)/i.exec(joinStr)
    if (!afterJoin) continue
    const ref = parseTableRef(afterJoin[1].trim(), availableTables, tables.length)
    if (!ref) return null
    tables.push(ref)
  }

  return tables
}

function parseTableRef(
  ref: string,
  availableTables: { schema: string; name: string; columns: ErdColumn[] }[],
  index: number
): SelectedTable | null {
  // Match [schema].[table] AS [alias] or schema.table AS alias or just [schema].[table]
  const m =
    /^\[?(\w+)\]?\.\[?(\w+)\]?(?:\s+(?:AS\s+)?\[?(\w+)\]?)?$/i.exec(ref.trim())
  if (!m) return null

  const [, schema, name, aliasRaw] = m
  const foundTable = availableTables.find(
    (t) => t.schema.toLowerCase() === schema.toLowerCase() && t.name.toLowerCase() === name.toLowerCase()
  )
  if (!foundTable) return null

  const alias = aliasRaw ?? makeAlias(index)
  return { schema: foundTable.schema, name: foundTable.name, alias, columns: foundTable.columns }
}

function makeAlias(index: number): string {
  return `t${index + 1}`
}

// ─── SELECT column parsing ────────────────────────────────────────────────────

function parseSelectColumns(
  selectPart: string,
  tables: SelectedTable[],
  wherePart: string,
  orderByPart: string,
  _availableTables: { schema: string; name: string; columns: ErdColumn[] }[]
): ColumnConfig[] | null {
  if (selectPart.trim() === '*') {
    // SELECT * — all columns are output
    return tables.flatMap((t) =>
      t.columns.map((col) => makeColumnConfig(t, col.name, col.name, true, 'UNSORTED', 0, ''))
    )
  }

  const aliasByName = new Map(tables.map((t) => [t.alias.toLowerCase(), t]))

  const parts = splitSelectParts(selectPart)
  const configs: ColumnConfig[] = []

  for (const part of parts) {
    const trimmed = part.trim()
    // [alias].[col] AS [outputAlias]  or  [alias].[col]
    const m = /^\[?(\w+)\]?\.\[?(\w+)\]?(?:\s+AS\s+\[?(\w+)\]?)?$/i.exec(trimmed)
    if (!m) return null // Cannot parse — bail

    const [, tableRef, colName, outputAlias] = m
    const table = aliasByName.get(tableRef.toLowerCase())
    if (!table) return null

    // Parse filter from WHERE for this column
    const filter = extractFilter(wherePart, tableRef, colName)

    // Parse sort for this column
    const { sortType, sortOrder } = extractSort(orderByPart, tableRef, colName, configs)

    configs.push(
      makeColumnConfig(table, colName, outputAlias ?? colName, true, sortType, sortOrder, filter)
    )
  }

  // Extract ORDER BY columns not already in SELECT
  const orderItems = parseOrderByItems(orderByPart, aliasByName, configs)
  for (const item of orderItems) {
    const existing = configs.find(
      (c) => c.tableAlias === item.table.alias && c.columnName.toLowerCase() === item.colName.toLowerCase()
    )
    if (existing) {
      existing.sortType = item.sortType
      existing.sortOrder = item.sortOrder
    }
  }

  return configs
}

function splitSelectParts(selectStr: string): string[] {
  // Split on commas not inside brackets
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (const char of selectStr) {
    if (char === '[') depth++
    else if (char === ']') depth--
    else if (char === ',' && depth === 0) {
      parts.push(current.trim())
      current = ''
      continue
    }
    current += char
  }
  if (current.trim()) parts.push(current.trim())
  return parts
}

function extractFilter(wherePart: string, tableAlias: string, colName: string): string {
  if (!wherePart) return ''
  // Look for patterns like [alias].[col] op value  or alias.col op value
  const escaped = `\\[?${tableAlias}\\]?\\.\\[?${colName}\\]?`
  const re = new RegExp(escaped + '\\s*([^A]+(?:AND|$))', 'i')
  const m = re.exec(wherePart)
  if (!m) return ''
  return m[1].replace(/\s*AND\s*$/i, '').trim()
}

interface SortInfo {
  sortType: SortType
  sortOrder: number
}

function extractSort(
  orderByPart: string,
  tableAlias: string,
  colName: string,
  _existing: ColumnConfig[]
): SortInfo {
  if (!orderByPart) return { sortType: 'UNSORTED', sortOrder: 0 }

  const parts = orderByPart.split(',').map((p) => p.trim())
  for (let i = 0; i < parts.length; i++) {
    const escaped = `\\[?${tableAlias}\\]?\\.\\[?${colName}\\]?`
    const re = new RegExp('^' + escaped + '(?:\\s+(ASC|DESC))?$', 'i')
    if (re.test(parts[i])) {
      const dirMatch = /\b(ASC|DESC)\b$/i.exec(parts[i])
      const sortType: SortType = dirMatch ? (dirMatch[1].toUpperCase() as SortType) : 'ASC'
      return { sortType, sortOrder: i + 1 }
    }
  }
  return { sortType: 'UNSORTED', sortOrder: 0 }
}

interface OrderByItem {
  table: SelectedTable
  colName: string
  sortType: SortType
  sortOrder: number
}

function parseOrderByItems(
  orderByPart: string,
  aliasByName: Map<string, SelectedTable>,
  existingConfigs: ColumnConfig[]
): OrderByItem[] {
  if (!orderByPart) return []
  const parts = orderByPart.split(',').map((p) => p.trim())
  const result: OrderByItem[] = []
  for (let i = 0; i < parts.length; i++) {
    const m = /^\[?(\w+)\]?\.\[?(\w+)\]?(?:\s+(ASC|DESC))?$/i.exec(parts[i])
    if (!m) continue
    const [, alias, col, dir] = m
    const table = aliasByName.get(alias.toLowerCase())
    if (!table) continue
    const alreadyIn = existingConfigs.find(
      (c) => c.tableAlias === table.alias && c.columnName.toLowerCase() === col.toLowerCase()
    )
    if (alreadyIn) continue
    result.push({
      table,
      colName: col,
      sortType: dir ? (dir.toUpperCase() as SortType) : 'ASC',
      sortOrder: i + 1
    })
  }
  return result
}

// ─── Helper: build full column list for all selected tables ──────────────────

function buildAllColumnConfigs(
  tables: SelectedTable[],
  parsedConfigs: ColumnConfig[],
  _outputSet: Set<string>,
  availableTables: { schema: string; name: string; columns: ErdColumn[] }[]
): ColumnConfig[] {
  const result: ColumnConfig[] = [...parsedConfigs]
  const existingKeys = new Set(parsedConfigs.map((c) => `${c.tableAlias}.${c.columnName}`))

  for (const t of tables) {
    const found = availableTables.find(
      (at) => at.schema === t.schema && at.name === t.name
    )
    const allCols = found?.columns ?? t.columns
    for (const col of allCols) {
      const key = `${t.alias}.${col.name}`
      if (!existingKeys.has(key)) {
        result.push(makeColumnConfig(t, col.name, col.name, false, 'UNSORTED', 0, ''))
        existingKeys.add(key)
      }
    }
  }

  return result
}

function makeColumnConfig(
  table: SelectedTable,
  columnName: string,
  alias: string,
  output: boolean,
  sortType: SortType,
  sortOrder: number,
  filter: string
): ColumnConfig {
  return {
    tableSchema: table.schema,
    tableName: table.name,
    tableAlias: table.alias,
    columnName,
    alias: alias !== columnName ? alias : '',
    output,
    sortType,
    sortOrder,
    filter
  }
}

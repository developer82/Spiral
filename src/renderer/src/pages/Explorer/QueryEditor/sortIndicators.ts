import type { ColumnConfig } from './queryEditorTypes'

export interface SortIndicator {
  sortType: 'ASC' | 'DESC'
  sortOrder: number
}

export interface TableRef {
  /** Schema/owner name, e.g. "dbo". Empty string when not present in SQL. */
  schema: string
  tableName: string
}

/**
 * Builds a map from result-column-name → sort indicator for all sorted columns.
 * The result-column-name is the alias (trimmed) when set, otherwise the columnName.
 * Returns an empty map when `isSyncedWithUI` is false (SQL was manually edited).
 */
export function buildSortIndicators(
  configs: ColumnConfig[],
  isSyncedWithUI: boolean
): Record<string, SortIndicator> {
  if (!isSyncedWithUI) return {}
  const result: Record<string, SortIndicator> = {}
  for (const col of configs) {
    if (col.sortType === 'UNSORTED') continue
    const colKey = col.alias.trim() || col.columnName
    result[colKey] = { sortType: col.sortType, sortOrder: col.sortOrder }
  }
  return result
}

/**
 * Finds the index of the last "ORDER BY" at the outermost parenthesis depth.
 * Handles single/double-quoted strings and nested parentheses.
 */
function findOutermostOrderByIndex(sql: string): number {
  let depth = 0
  let inSingle = false
  let inDouble = false
  let lastAt = -1
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i]
    if (inSingle) {
      if (ch === "'" && sql[i + 1] === "'") { i++; continue } // escaped ''
      if (ch === "'") inSingle = false
      continue
    }
    if (inDouble) {
      if (ch === '"') inDouble = false
      continue
    }
    if (ch === "'") { inSingle = true; continue }
    if (ch === '"') { inDouble = true; continue }
    if (ch === '(') { depth++; continue }
    if (ch === ')') { depth--; continue }
    if (depth === 0 && (ch === 'O' || ch === 'o')) {
      const m = sql.slice(i, i + 20).match(/^ORDER\s+BY\b/i)
      if (m) {
        lastAt = i
        i += m[0].length - 1
      }
    }
  }
  return lastAt
}

/**
 * Parses the outermost ORDER BY clause from a SQL string.
 * Returns a map from bare column name → SortIndicator (best-effort, for display only).
 * Column names are extracted as the final identifier in each ORDER BY term,
 * stripping any table/schema prefix and square-bracket quoting.
 */
export function parseSqlOrderBy(sql: string): Record<string, SortIndicator> {
  const result: Record<string, SortIndicator> = {}
  const idx = findOutermostOrderByIndex(sql)
  if (idx === -1) return result

  // Extract everything after "ORDER BY"
  let clause = sql.slice(idx).replace(/^ORDER\s+BY\s*/i, '').trim()
  // Strip trailing OFFSET / OPTION / FOR / FETCH / semicolons
  clause = clause
    .replace(/\s*\b(OFFSET|OPTION|FOR\s|FETCH)\b[\s\S]*$/i, '')
    .replace(/\s*;[\s\S]*$/, '')
    .trim()
  if (!clause) return result

  clause.split(',').forEach((term, i) => {
    const t = term.trim()
    if (!t) return
    // Skip positional references (pure numbers like ORDER BY 1, 2)
    if (/^\d+\s*(ASC|DESC)?\s*$/i.test(t)) return
    // Match the last bracketed name: [schema].[table].[col] DESC → col
    const bracketedMatch = t.match(/(?:^|\.)\[([^\]]+)\]\s*(?:(ASC|DESC)\s*)?$/i)
    // Or last bare identifier: t1.colName DESC → colName
    const bareMatch = t.match(/(?:^|\.)(\w+)\s*(?:(ASC|DESC)\s*)?$/i)
    const m = bracketedMatch ?? bareMatch
    if (!m) return
    const colName = m[1]
    const dir = ((m[2] ?? 'ASC').toUpperCase()) as 'ASC' | 'DESC'
    result[colName] = { sortType: dir, sortOrder: i + 1 }
  })

  return result
}

// ── SQL keywords to filter out when parsing table references ──────────────────
const SQL_KEYWORDS = new Set([
  'select', 'where', 'set', 'values', 'with', 'update', 'insert', 'delete',
  'into', 'on', 'and', 'or', 'not', 'as', 'case', 'when', 'then', 'else',
  'end', 'null', 'true', 'false', 'top', 'distinct', 'all', 'exists', 'in',
  'between', 'like', 'is', 'having', 'group', 'order', 'by', 'limit',
  'offset', 'fetch', 'union', 'intersect', 'except', 'pivot', 'unpivot',
  'over', 'partition', 'output', 'returning'
])

/** Counts net open-parenthesis depth at the end of `s` (after stripping strings/comments). */
function countParenDepth(s: string): number {
  let d = 0
  for (const c of s) {
    if (c === '(') d++
    else if (c === ')') d--
  }
  return d < 0 ? 0 : d
}

/**
 * Parses one multi-part table name (possibly bracket-quoted) from the start of
 * `fragment`. Returns the TableRef and how many characters were consumed, or null.
 */
function extractTableRefAt(fragment: string): (TableRef & { len: number }) | null {
  const parts: string[] = []
  let i = 0

  while (i < fragment.length) {
    let name = ''
    if (fragment[i] === '[') {
      i++ // skip [
      while (i < fragment.length && fragment[i] !== ']') name += fragment[i++]
      if (fragment[i] === ']') i++ // skip ]
    } else if (/[A-Za-z_#@]/.test(fragment[i])) {
      while (i < fragment.length && /\w/.test(fragment[i])) name += fragment[i++]
    } else {
      break
    }
    if (!name) break
    // Stop on SQL keywords (only for bare first token, not after a dot)
    if (parts.length === 0 && SQL_KEYWORDS.has(name.toLowerCase())) return null
    parts.push(name)
    if (fragment[i] === '.') i++ // skip .
    else break
  }

  if (parts.length === 0) return null
  // Three-part: [db].[schema].[table] → take last two
  if (parts.length >= 3) return { schema: parts[parts.length - 2], tableName: parts[parts.length - 1], len: i }
  if (parts.length === 2) return { schema: parts[0], tableName: parts[1], len: i }
  return { schema: '', tableName: parts[0], len: i }
}

/**
 * Extracts table references from FROM and JOIN clauses in a SQL string.
 * Best-effort: handles bracket quoting, two/three-part names, and skips subqueries.
 * Safe to use for display-only purposes.
 */
export function parseSqlTableRefs(sql: string): TableRef[] {
  // Strip line comments, block comments, and string literals to avoid false matches
  const cleaned = sql
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/'(?:[^']|'')*'/g, "''")
    .replace(/"[^"]*"/g, '""')

  const refs: TableRef[] = []
  const seen = new Set<string>()

  // Find FROM/JOIN keywords (word boundary)
  const kwRe = /\b(FROM|JOIN)\s+/gi
  let m: RegExpExecArray | null

  while ((m = kwRe.exec(cleaned)) !== null) {
    // Skip if inside a parenthesised subquery (depth > 0)
    if (countParenDepth(cleaned.slice(0, m.index)) > 0) continue

    const after = cleaned.slice(m.index + m[0].length)
    // Skip subquery: FROM (SELECT ...)
    if (after.trimStart()[0] === '(') continue

    const ref = extractTableRefAt(after.trimStart())
    if (!ref) continue

    const key = `${ref.schema.toLowerCase()}\x00${ref.tableName.toLowerCase()}`
    if (!seen.has(key)) {
      seen.add(key)
      refs.push({ schema: ref.schema, tableName: ref.tableName })
    }
  }

  return refs
}

// ── WHERE clause filter parsing ───────────────────────────────────────────────

/**
 * Finds the index of the first "WHERE" keyword at the outermost parenthesis depth.
 */
function findOutermostWhereIndex(sql: string): number {
  let depth = 0
  let inSingle = false
  let inDouble = false
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i]
    if (inSingle) {
      if (ch === "'" && sql[i + 1] === "'") { i++; continue }
      if (ch === "'") inSingle = false
      continue
    }
    if (inDouble) {
      if (ch === '"') inDouble = false
      continue
    }
    if (ch === "'") { inSingle = true; continue }
    if (ch === '"') { inDouble = true; continue }
    if (ch === '(') { depth++; continue }
    if (ch === ')') { depth--; continue }
    if (depth === 0 && (ch === 'W' || ch === 'w')) {
      const m = sql.slice(i, i + 10).match(/^WHERE\b/i)
      if (m) return i
    }
  }
  return -1
}

/**
 * Parses the outermost WHERE clause from a SQL string.
 * Returns a Set of bare column names that appear as filter predicates
 * (i.e. on the left-hand side of a comparison operator).
 * Best-effort, for display only.
 */
export function parseSqlWhere(sql: string): Set<string> {
  const result = new Set<string>()
  const idx = findOutermostWhereIndex(sql)
  if (idx === -1) return result

  // Extract everything from WHERE up to the next major clause
  let clause = sql.slice(idx).replace(/^WHERE\s*/i, '').trim()
  clause = clause
    .replace(/\s*\b(ORDER\s+BY|GROUP\s+BY|HAVING|OPTION|FOR\s|FETCH)\b[\s\S]*$/i, '')
    .replace(/\s*;[\s\S]*$/, '')
    .trim()
  if (!clause) return result

  // Strip comments and string literals to avoid false matches
  const cleaned = clause
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/'(?:[^']|'')*'/g, "''")
    .replace(/"[^"]*"/g, '""')

  // Match column references (optional schema/table prefix) followed by a comparison operator.
  // Captures either a bracket-quoted name or a bare identifier.
  const colOpRe =
    /(?:(?:\[[^\]]+\]|\w+)\.)*(?:\[([^\]]+)\]|(\b[A-Za-z_]\w*\b))\s*(?:=|<>|!=|<=|>=|<|>|\bLIKE\b|\bNOT\s+LIKE\b|\bIN\b|\bNOT\s+IN\b|\bBETWEEN\b|\bNOT\s+BETWEEN\b|\bIS\b)/gi
  let m: RegExpExecArray | null
  while ((m = colOpRe.exec(cleaned)) !== null) {
    const colName = m[1] ?? m[2]
    if (colName && !SQL_KEYWORDS.has(colName.toLowerCase())) {
      result.add(colName)
    }
  }
  return result
}

// ── Interactive ORDER BY manipulation ────────────────────────────────────────

/**
 * Splits the body of an ORDER BY clause (the text after "ORDER BY") into
 * individual terms, respecting parentheses and quoted strings.
 */
function splitOrderByTerms(clause: string): string[] {
  const terms: string[] = []
  let depth = 0
  let inSingle = false
  let inDouble = false
  let start = 0

  for (let i = 0; i < clause.length; i++) {
    const ch = clause[i]
    if (inSingle) {
      if (ch === "'" && clause[i + 1] === "'") { i++; continue }
      if (ch === "'") { inSingle = false; continue }
      continue
    }
    if (inDouble) {
      if (ch === '"') { inDouble = false; continue }
      continue
    }
    if (ch === "'") { inSingle = true; continue }
    if (ch === '"') { inDouble = true; continue }
    if (ch === '(') { depth++; continue }
    if (ch === ')') { depth--; continue }
    if (depth === 0 && ch === ',') {
      terms.push(clause.slice(start, i).trim())
      start = i + 1
    }
  }
  const last = clause.slice(start).trim()
  if (last) terms.push(last)
  return terms
}

/**
 * Extracts the bare column name from a single ORDER BY term.
 * Returns null for positional references (e.g. "1") or unparseable terms.
 */
function extractColNameFromTerm(term: string): string | null {
  const t = term.trim().replace(/\s*(ASC|DESC)\s*$/i, '').trimEnd()
  if (/^\d+$/.test(t)) return null
  const bracketedMatch = t.match(/(?:^|\.)\[([^\]]+)\]\s*$/)
  const bareMatch = t.match(/(?:^|\.)(\w+)\s*$/)
  return (bracketedMatch ?? bareMatch)?.[1] ?? null
}

/**
 * Returns a safely bracket-quoted SQL identifier when the name contains
 * non-word characters (spaces, special chars). Otherwise returns the bare name.
 */
function quoteIdentifier(name: string): string {
  return /\W/.test(name) ? `[${name}]` : name
}

/**
 * Splits the string that follows "ORDER BY " into the terms body and any
 * trailing clause (OFFSET / FETCH / OPTION / FOR / semicolons) at outermost depth.
 */
function splitTrailingClause(afterKeyword: string): { termsStr: string; trailing: string } {
  let depth = 0
  let inSingle = false
  let inDouble = false

  for (let i = 0; i < afterKeyword.length; i++) {
    const ch = afterKeyword[i]
    if (inSingle) {
      if (ch === "'" && afterKeyword[i + 1] === "'") { i++; continue }
      if (ch === "'") { inSingle = false; continue }
      continue
    }
    if (inDouble) {
      if (ch === '"') { inDouble = false; continue }
      continue
    }
    if (ch === "'") { inSingle = true; continue }
    if (ch === '"') { inDouble = true; continue }
    if (ch === '(') { depth++; continue }
    if (ch === ')') { depth--; continue }
    if (depth === 0) {
      if (ch === ';') return { termsStr: afterKeyword.slice(0, i), trailing: afterKeyword.slice(i) }
      const rest = afterKeyword.slice(i)
      if (/^(OFFSET|OPTION|FETCH)\b/i.test(rest) || /^FOR\s/i.test(rest)) {
        // Walk back to include any preceding whitespace in the trailing portion
        let j = i - 1
        while (j >= 0 && (afterKeyword[j] === ' ' || afterKeyword[j] === '\t' || afterKeyword[j] === '\n' || afterKeyword[j] === '\r')) j--
        return { termsStr: afterKeyword.slice(0, j + 1), trailing: afterKeyword.slice(j + 1) }
      }
    }
  }
  return { termsStr: afterKeyword, trailing: '' }
}

/**
 * Modifies the outermost ORDER BY clause of a SQL statement.
 *
 * - `toggle`: If the column is not in ORDER BY, appends it as ASC. If it already
 *   appears, flips ASC ↔ DESC (implicit direction is treated as ASC).
 * - `remove`: Removes the column from ORDER BY. If no terms remain, removes the
 *   entire ORDER BY clause.
 *
 * Trailing OFFSET / FETCH / OPTION / FOR clauses are preserved unchanged.
 * Column matching is case-insensitive.
 */
export function modifyOrderByInSql(
  sql: string,
  columnName: string,
  action: 'toggle' | 'remove'
): string {
  const idx = findOutermostOrderByIndex(sql)

  if (idx === -1) {
    if (action === 'remove') return sql
    // No ORDER BY — append one
    const trimmed = sql.trimEnd().replace(/;+$/, '')
    return `${trimmed}\nORDER BY ${quoteIdentifier(columnName)} ASC`
  }

  const before = sql.slice(0, idx)
  const fromOrderBy = sql.slice(idx)
  const afterKeyword = fromOrderBy.replace(/^ORDER\s+BY\s*/i, '')
  const { termsStr, trailing } = splitTrailingClause(afterKeyword)
  const terms = splitOrderByTerms(termsStr)
  const colLower = columnName.toLowerCase()

  const existingIdx = terms.findIndex((term) => {
    const name = extractColNameFromTerm(term)
    return name !== null && name.toLowerCase() === colLower
  })

  if (action === 'remove') {
    if (existingIdx === -1) return sql
    terms.splice(existingIdx, 1)
    if (terms.length === 0) {
      return before.trimEnd() + trailing
    }
    return `${before}ORDER BY ${terms.join(', ')}${trailing}`
  }

  // action === 'toggle'
  if (existingIdx === -1) {
    terms.push(`${quoteIdentifier(columnName)} ASC`)
  } else {
    const t = terms[existingIdx]
    if (/\bDESC\s*$/i.test(t)) {
      terms[existingIdx] = t.replace(/\bDESC\s*$/i, 'ASC').trimEnd()
    } else if (/\bASC\s*$/i.test(t)) {
      terms[existingIdx] = t.replace(/\bASC\s*$/i, 'DESC').trimEnd()
    } else {
      // Implicit ASC → make DESC
      terms[existingIdx] = `${t.trimEnd()} DESC`
    }
  }
  return `${before}ORDER BY ${terms.join(', ')}${trailing}`
}

/**
 * Builds the set of filtered column names from ColumnConfig[].
 * The key is the alias (trimmed) when set, otherwise the columnName — matching
 * the result-column name that will appear in the query output.
 * Returns an empty Set when `isSyncedWithUI` is false (SQL was manually edited).
 */
export function buildFilteredColumns(
  configs: ColumnConfig[],
  isSyncedWithUI: boolean
): Set<string> {
  if (!isSyncedWithUI) return new Set()
  const result = new Set<string>()
  for (const col of configs) {
    if (col.filter.trim()) {
      result.add(col.alias.trim() || col.columnName)
    }
  }
  return result
}

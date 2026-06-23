/**
 * Utility functions for the Explorer page.
 * Extracted from ExplorerPage.tsx.
 */
import type { ExplorerNode } from './connections.types'
import type { QueryResultSet } from './connections.types'
import type { ProviderCapabilities } from './connections.types'
import { parseSqlTableRefs } from './QueryEditor/sortIndicators'

/**
 * Returns the SQL identifier text to insert when a tree node is dragged into
 * the query editor, or null if the node kind is not draggable.
 *
 * Label formats come from SqlServerProvider:
 *   database  → "AdventureWorks"
 *   table     → "dbo.Product"
 *   column    → "ProductID (int)"     ← strip trailing " (type)"
 *   view      → "dbo.SomeView"
 *   stored-procedure / function → "dbo.MySP"
 */
export function getNodeDragText(node: ExplorerNode): string | null {
  const { kind, label } = node
  switch (kind) {
    case 'database':
      return `[${label}]`
    case 'table': {
      const dotIdx = label.indexOf('.')
      if (dotIdx === -1) return `[${label}]`
      const schema = label.slice(0, dotIdx)
      const name = label.slice(dotIdx + 1)
      return `[${schema}].[${name}]`
    }
    case 'column':
    case 'column-pk': {
      // Strip trailing " (type, null)" — e.g. "ProductID (PK int, not null)" → "ProductID"
      const colName = label.replace(/ \([^)]+\)$/, '')
      return `[${colName}]`
    }
    case 'view':
    case 'stored-procedure':
    case 'function': {
      const dotIdx = label.lastIndexOf('.')
      const name = dotIdx === -1 ? label : label.slice(dotIdx + 1)
      return `[${name}]`
    }
    default:
      return null
  }
}

/**
 * Returns the folder-type keys (e.g. 'tables', 'views') that should be
 * refreshed in the tree after a DDL statement is executed.
 */
export function detectDdlFolderTypes(sql: string): string[] {
  const folderTypes = new Set<string>()
  const pattern = /\b(CREATE|DROP|ALTER)\s+(TABLE|VIEW|PROCEDURE|PROC|FUNCTION|TYPE)\b/gi
  let match: RegExpExecArray | null
  while ((match = pattern.exec(sql)) !== null) {
    const objectType = match[2].toUpperCase()
    if (objectType === 'TABLE') folderTypes.add('tables')
    else if (objectType === 'VIEW') folderTypes.add('views')
    else if (objectType === 'PROCEDURE' || objectType === 'PROC') folderTypes.add('stored-procedures')
    else if (objectType === 'FUNCTION') folderTypes.add('functions')
    else if (objectType === 'TYPE') folderTypes.add('types')
  }
  return Array.from(folderTypes)
}

/**
 * Populates `columnKeyMeta` on each result set based on the tables referenced
 * in the executed SQL. Best-effort — silently skips tables that can't be resolved.
 */
export async function applyKeyMetaToResults(
  connectionId: string,
  databaseName: string | undefined,
  sql: string,
  resultSets: QueryResultSet[],
  defaultSchema: string
): Promise<void> {
  if (!databaseName) return
  const tableRefs = parseSqlTableRefs(sql)
  if (tableRefs.length === 0) return

  const fetches = await Promise.allSettled(
    tableRefs.map(({ schema, tableName }) =>
      Promise.all([
        window.api.database.getTableSchema(connectionId, databaseName, schema || defaultSchema, tableName),
        window.api.database.getForeignKeys(connectionId, databaseName, schema || defaultSchema, tableName)
      ])
    )
  )

  const keyMap = new Map<string, { isPrimaryKey: boolean; isForeignKey: boolean; isNullable: boolean; isBoolean: boolean }>()
  for (const r of fetches) {
    if (r.status !== 'fulfilled') continue
    const [schemaResult, fkResult] = r.value
    if (schemaResult.status !== 'ok') continue
    const fkColumns = fkResult.status === 'ok'
      ? new Set(fkResult.foreignKeys.map((fk) => fk.columnName))
      : new Set<string>()
    for (const col of schemaResult.columns) {
      if (!keyMap.has(col.name)) {
        const colTypeLower = col.type.toLowerCase()
        keyMap.set(col.name, {
          isPrimaryKey: col.isPrimaryKey,
          isForeignKey: fkColumns.has(col.name),
          isNullable: col.isNullable,
          isBoolean: colTypeLower === 'bit' || colTypeLower === 'bool' || colTypeLower === 'boolean'
        })
      }
    }
  }

  if (keyMap.size === 0) return
  for (const rs of resultSets) {
    rs.columnKeyMeta = rs.columns.map((col) => keyMap.get(col) ?? null)
  }

  // Populate sourceTable only when the query references exactly one table
  if (tableRefs.length === 1) {
    const singleRef = tableRefs[0]
    const resolvedSchema = singleRef.schema || defaultSchema
    for (const rs of resultSets) {
      rs.sourceTable = { schema: resolvedSchema, table: singleRef.tableName }
    }
  }
}

/** Default capabilities when a connection has not yet reported its capabilities. */
export const DEFAULT_CAPABILITIES: ProviderCapabilities = {
  executionPlan: { kind: 'xml-visual', buttonLabel: 'Execution Plan' },
  clientStatistics: { kind: 'client-stats', buttonLabel: 'Client Statistics' },
  defaultSchema: 'dbo',
  hasCreateDatabase: true,
  hasStoredProcedures: true,
  hasFunctions: true,
  hasUserDefinedTypes: true,
  hasTableTypes: true,
  hasMemoryOptimizedTableTypes: true,
  hasStatistics: true,
  hasIndexRebuild: true,
  hasIndexReorganize: true,
  hasIndexDisable: true,
  hasProfiler: true,
  hasCreateTable: true,
  hasBackupRestore: true
}

import type { QueryTab } from '../explorer.types'
import type { ConnectionRecord } from '../connections.types'
import { PROVIDER_METADATA } from '../providerMetadata'
import { parseSqlTableRefs } from '../QueryEditor/sortIndicators'

export interface QueryContextInfo {
  /** Human-readable provider name, e.g. "SQL Server", "MongoDB". */
  providerLabel: string
  /** Display name of the connection. */
  connectionName: string
  /** Active database/schema name, or null when not applicable. */
  database: string | null
  /** Table, view, or collection name. "Multiple" when more than one SQL source
   *  is detected. null when no object context can be resolved. */
  objectName: string | null
  /** Contextual label for the object row: "Table", "Collection", etc. */
  objectLabel: string
  /** Human-readable syntax/language label: "SQL", "JSON", "Redis". */
  syntaxLabel: string
}

/**
 * Builds a QueryContextInfo from the given query tab and its associated
 * connection record. Returns null when no connection is available (e.g. the
 * tab has not yet been bound to a connection).
 */
export function buildQueryContext(
  tab: QueryTab,
  connection: ConnectionRecord | undefined
): QueryContextInfo | null {
  if (!connection) return null

  const providerLabel = PROVIDER_METADATA[connection.provider]?.label ?? connection.provider

  // Resolve database — prefer tab-scoped name, fall back to connection default
  const rawDatabase = tab.databaseName ?? (connection.defaultDatabase || null)
  const database = rawDatabase && rawDatabase.trim() ? rawDatabase : null

  let syntaxLabel: string
  let objectName: string | null = null
  let objectLabel = 'Table'

  if (connection.provider === 'mongodb') {
    syntaxLabel = 'JSON'
    objectLabel = 'Collection'
    if (tab.mongoCollection) {
      objectName = tab.mongoCollection
    }
  } else if (connection.provider === 'redis') {
    syntaxLabel = 'Redis'
    // Redis has no table/collection concept; leave objectName null
  } else {
    // SQL providers: sqlserver, postgres, mysql, sqlite
    syntaxLabel = 'SQL'
    objectLabel = 'Table'
    if (tab.content.trim()) {
      const refs = parseSqlTableRefs(tab.content)
      if (refs.length === 1) {
        const { schema, tableName } = refs[0]
        objectName = schema ? `${schema}.${tableName}` : tableName
      } else if (refs.length > 1) {
        objectName = 'Multiple'
      }
    }
  }

  return {
    providerLabel,
    connectionName: connection.name,
    database,
    objectName,
    objectLabel,
    syntaxLabel
  }
}

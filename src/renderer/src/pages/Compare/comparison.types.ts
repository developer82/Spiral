import type { ConnectionProvider } from '../Explorer/connections.types'

export type ComparisonSortField = 'name' | 'createdAt' | 'updatedAt' | 'sourceProvider' | 'targetProvider'

export type ComparisonScopeKey =
  | 'schema.tablesCoreConstraints'
  | 'schema.programmableObjects'
  | 'schema.indexingSubsystems'
  | 'schema.securityMetadataProfiles'
  | 'data.rowLevelValues'
  | 'data.keyMatchedSets'

export interface ComparisonEndpoint {
  connectionId: string
  databaseName: string
  provider: ConnectionProvider
}

export interface ComparisonTableKeyMapping {
  sourceTable: string
  targetTable: string
  sourceColumns: string[]
  targetColumns: string[]
}

export interface ComparisonRecord {
  id: string
  name: string
  description: string
  source: ComparisonEndpoint
  target: ComparisonEndpoint
  scopeKeys: ComparisonScopeKey[]
  tableKeyMappings: ComparisonTableKeyMapping[]
  createdAt: string
  updatedAt: string
}

export type ComparisonChangeType = 'added' | 'removed' | 'modified' | 'unsupported'

export type ComparisonReportCategory =
  | 'tables'
  | 'columns'
  | 'foreignKeys'
  | 'checkConstraints'
  | 'indexes'
  | 'triggers'
  | 'views'
  | 'storedProcedures'
  | 'functions'
  | 'securityUsers'
  | 'securityRoles'
  | 'securitySchemas'
  | 'rows'

export interface ComparisonReportItem {
  id: string
  scopeKey: ComparisonScopeKey
  category: ComparisonReportCategory
  changeType: ComparisonChangeType
  objectName: string
  details: string[]
  sourceValue?: string
  targetValue?: string
}

export interface ComparisonExecutionReport {
  comparisonId: string
  comparisonName: string
  generatedAt: string
  durationMs: number
  counts: {
    total: number
    added: number
    removed: number
    modified: number
    unsupported: number
  }
  items: ComparisonReportItem[]
  warnings: string[]
}

export type ComparisonDraft = Omit<ComparisonRecord, 'id' | 'createdAt' | 'updatedAt'>

export interface ComparisonConnectionSnapshot {
  id: string
  name: string
  provider: ConnectionProvider
  host: string
  port: number
  username: string
  password: string | null
  defaultDatabase: string
  databaseName: string
  filePath?: string
  color?: string
  environmentId?: string
}

export interface ComparisonExportPayload {
  exportVersion: 1
  exportedAt: string
  secretsIncluded: boolean
  comparison: {
    id: string
    name: string
    description: string
    scopeKeys: ComparisonScopeKey[]
    tableKeyMappings: ComparisonTableKeyMapping[]
    createdAt: string
    updatedAt: string
  }
  sourceConnection: ComparisonConnectionSnapshot
  targetConnection: ComparisonConnectionSnapshot
  report: ComparisonExecutionReport
}
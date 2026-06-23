import type { DatabaseManager } from '../database/DatabaseManager'
import type {
  CheckConstraintDefinition,
  ForeignKeyDefinition,
  IndexDefinition,
  StoredProcedureDefinition,
  TableColumnMeta,
  TriggerDefinition,
  ViewDefinition
} from '../database/types'
import type { ComparisonRecord, ComparisonScopeKey, ComparisonTableKeyMapping, ConnectionRecord } from '../store'

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

export interface ComparisonExecutionDependencies {
  databaseManager: Pick<
    DatabaseManager,
    | 'getChildren'
    | 'getTableSchema'
    | 'getForeignKeys'
    | 'getCheckConstraints'
    | 'getTriggers'
    | 'getIndexes'
    | 'getViews'
    | 'getStoredProcedures'
    | 'scriptSelectTopRows'
    | 'executeQuery'
  >
}

interface EndpointContext {
  side: 'source' | 'target'
  connectionId: string
  databaseName: string
}

interface TableReference {
  identifier: string
  schemaName: string
  tableName: string
}

interface TableSnapshot {
  ref: TableReference
  columns?: TableColumnMeta[]
  foreignKeys?: ForeignKeyDefinition[]
  checkConstraints?: CheckConstraintDefinition[]
  triggers?: TriggerDefinition[]
  indexes?: IndexDefinition[]
  rows?: Record<string, unknown>[]
}

interface TablePair {
  source: TableReference
  target: TableReference
  mapping?: ComparisonTableKeyMapping
}

const ALL_ROWS_LIMIT = 2147483647

function normalizeToken(value: string): string {
  return value.trim().replace(/[\[\]"`]/g, '').toLowerCase()
}

/**
 * Builds a key for schema-qualified object matching. When the schema name equals
 * the database name (MySQL convention — the database IS the schema), the schema
 * prefix is omitted so that comparisons across databases with different names still
 * match objects by their unqualified name.
 */
function buildSchemaObjectKey(schemaName: string, objectName: string, databaseName: string): string {
  return normalizeToken(schemaName) === normalizeToken(databaseName)
    ? objectName
    : `${schemaName}.${objectName}`
}

function stableStringify(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString()
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
      left.localeCompare(right)
    )
    return `{${entries.map(([key, entry]) => `${key}:${stableStringify(entry)}`).join(',')}}`
  }

  return String(value ?? 'null')
}

function splitQualifiedIdentifier(identifier: string, fallbackSchema: string): TableReference {
  const dotIndex = identifier.indexOf('.')
  if (dotIndex === -1) {
    return {
      identifier,
      schemaName: fallbackSchema,
      tableName: identifier
    }
  }

  return {
    identifier,
    schemaName: identifier.slice(0, dotIndex),
    tableName: identifier.slice(dotIndex + 1)
  }
}

function extractIdentifier(nodeId: string, segment: string): string {
  const marker = `:${segment}:`
  const markerIndex = nodeId.indexOf(marker)
  return markerIndex === -1 ? nodeId : nodeId.slice(markerIndex + marker.length)
}

function buildItem(
  scopeKey: ComparisonScopeKey,
  category: ComparisonReportCategory,
  changeType: ComparisonChangeType,
  objectName: string,
  details: string[] = [],
  sourceValue?: string,
  targetValue?: string
): ComparisonReportItem {
  return {
    id: `${scopeKey}:${category}:${changeType}:${objectName}`,
    scopeKey,
    category,
    changeType,
    objectName,
    details,
    sourceValue,
    targetValue
  }
}

function buildMapByKey<T>(items: T[], getKey: (item: T) => string): Map<string, T> {
  return new Map(items.map((item) => [normalizeToken(getKey(item)), item]))
}

function toColumnComparable(column: TableColumnMeta): Record<string, unknown> {
  return {
    type: column.type,
    maxLength: column.maxLength,
    precision: column.precision,
    scale: column.scale,
    nullable: column.isNullable,
    defaultValue: column.defaultValue,
    identity: column.isIdentity,
    identitySeed: column.identitySeed,
    identityIncrement: column.identityIncrement,
    primaryKey: column.isPrimaryKey
  }
}

function toForeignKeyComparable(foreignKey: ForeignKeyDefinition): Record<string, unknown> {
  return {
    columnName: foreignKey.columnName,
    referencedSchema: foreignKey.referencedSchema,
    referencedTable: foreignKey.referencedTable,
    referencedColumn: foreignKey.referencedColumn,
    isEnabled: foreignKey.isEnabled,
    enforceForReplication: foreignKey.enforceForReplication,
    deleteRule: foreignKey.deleteRule,
    updateRule: foreignKey.updateRule,
    description: foreignKey.description ?? ''
  }
}

function toConstraintComparable(constraint: CheckConstraintDefinition): Record<string, unknown> {
  return {
    condition: constraint.condition,
    isEnabled: constraint.isEnabled,
    checkExistingData: constraint.checkExistingData,
    enforceForReplication: constraint.enforceForReplication,
    description: constraint.description ?? ''
  }
}

function toIndexComparable(index: IndexDefinition): Record<string, unknown> {
  return {
    type: index.type,
    isUnique: index.isUnique,
    isPrimaryKey: index.isPrimaryKey,
    isDisabled: index.isDisabled,
    filterExpression: index.filterExpression ?? '',
    fillFactor: index.fillFactor ?? null,
    padIndex: index.padIndex ?? false,
    description: index.description ?? '',
    columns: index.columns.map((column) => ({
      columnName: column.columnName,
      keyOrdinal: column.keyOrdinal,
      isDescendingKey: column.isDescendingKey,
      isIncludedColumn: column.isIncludedColumn
    }))
  }
}

function toTriggerComparable(trigger: TriggerDefinition): Record<string, unknown> {
  return {
    isInsteadOf: trigger.isInsteadOf,
    isInsert: trigger.isInsert,
    isUpdate: trigger.isUpdate,
    isDelete: trigger.isDelete,
    body: trigger.body,
    description: trigger.description ?? ''
  }
}

function toViewComparable(view: ViewDefinition): Record<string, unknown> {
  return {
    definition: view.definition,
    isSchemabound: view.isSchemabound,
    isEncrypted: view.isEncrypted
  }
}

function toProcedureComparable(procedure: StoredProcedureDefinition): Record<string, unknown> {
  return {
    description: procedure.description,
    parameters: procedure.parameters,
    body: procedure.body
  }
}

function buildDiffDetails(
  sourceValue: Record<string, unknown>,
  targetValue: Record<string, unknown>,
  labels: Record<string, string>
): string[] {
  const keys = new Set([...Object.keys(sourceValue), ...Object.keys(targetValue)])
  const details: string[] = []

  for (const key of keys) {
    if (stableStringify(sourceValue[key]) === stableStringify(targetValue[key])) {
      continue
    }

    const label = labels[key] ?? key
    details.push(`${label}: ${stableStringify(sourceValue[key])} -> ${stableStringify(targetValue[key])}`)
  }

  return details
}

function formatLines(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }

  return JSON.stringify(value, null, 2)
}

function normalizeRow(row: Record<string, unknown>): Map<string, { key: string; value: unknown }> {
  return new Map(Object.keys(row).map((key) => [normalizeToken(key), { key, value: row[key] }]))
}

function getRowValue(row: Record<string, unknown>, columnName: string): unknown {
  const normalized = normalizeRow(row)
  return normalized.get(normalizeToken(columnName))?.value
}

function getPrimaryKeyColumns(columns: TableColumnMeta[]): string[] {
  return columns.filter((column) => column.isPrimaryKey).map((column) => column.name)
}

async function getChildrenOrThrow(
  dependencies: ComparisonExecutionDependencies,
  connectionId: string,
  nodeId: string
): Promise<Array<{ id: string; label: string }>> {
  const result = await dependencies.databaseManager.getChildren(connectionId, nodeId, {
    showSystemDatabases: false
  })
  if (result.status === 'error') {
    throw new Error(result.message)
  }
  return result.children
}

async function getTableReferences(
  dependencies: ComparisonExecutionDependencies,
  endpoint: EndpointContext
): Promise<Map<string, TableReference>> {
  const nodes = await getChildrenOrThrow(
    dependencies,
    endpoint.connectionId,
    `db:${endpoint.databaseName}:tables`
  )

  return new Map(
    nodes.map((node) => {
      const identifier = extractIdentifier(node.id, 'tables')
      const ref = splitQualifiedIdentifier(identifier, endpoint.databaseName)
      return [normalizeToken(buildSchemaObjectKey(ref.schemaName, ref.tableName, endpoint.databaseName)), ref]
    })
  )
}

function buildBareNameIndex(tableMap: Map<string, TableReference>): Map<string, TableReference[]> {
  const result = new Map<string, TableReference[]>()
  for (const ref of tableMap.values()) {
    const key = normalizeToken(ref.tableName)
    const existing = result.get(key) ?? []
    existing.push(ref)
    result.set(key, existing)
  }
  return result
}

function resolveMappedTable(
  rawValue: string,
  tableMap: Map<string, TableReference>,
  bareNameIndex: Map<string, TableReference[]>
): TableReference | null {
  const normalized = normalizeToken(rawValue)
  const direct = tableMap.get(normalized)
  if (direct) {
    return direct
  }

  const bareMatches = bareNameIndex.get(normalized) ?? []
  if (bareMatches.length === 1) {
    return bareMatches[0]
  }

  return null
}

async function executeNamedListComparison(
  items: ComparisonReportItem[],
  scopeKey: ComparisonScopeKey,
  category: ComparisonReportCategory,
  sourceNames: string[],
  targetNames: string[]
): Promise<void> {
  const sourceMap = new Map(sourceNames.map((name) => [normalizeToken(name), name]))
  const targetMap = new Map(targetNames.map((name) => [normalizeToken(name), name]))
  const keys = [...new Set([...sourceMap.keys(), ...targetMap.keys()])].sort()

  for (const key of keys) {
    if (!sourceMap.has(key)) {
      items.push(buildItem(scopeKey, category, 'removed', targetMap.get(key) ?? key))
      continue
    }

    if (!targetMap.has(key)) {
      items.push(buildItem(scopeKey, category, 'added', sourceMap.get(key) ?? key))
    }
  }
}

export async function executeComparison(
  dependencies: ComparisonExecutionDependencies,
  comparison: ComparisonRecord,
  _sourceConnection: ConnectionRecord,
  _targetConnection: ConnectionRecord
): Promise<ComparisonExecutionReport> {
  const startedAt = Date.now()
  const items: ComparisonReportItem[] = []
  const warnings: string[] = []

  const sourceEndpoint: EndpointContext = {
    side: 'source',
    connectionId: comparison.source.connectionId,
    databaseName: comparison.source.databaseName
  }
  const targetEndpoint: EndpointContext = {
    side: 'target',
    connectionId: comparison.target.connectionId,
    databaseName: comparison.target.databaseName
  }

  const tableCache = new Map<string, TableSnapshot>()

  function getTableSnapshot(endpoint: EndpointContext, ref: TableReference): TableSnapshot {
    const cacheKey = `${endpoint.side}:${normalizeToken(ref.identifier)}`
    const existing = tableCache.get(cacheKey) ?? { ref }
    tableCache.set(cacheKey, existing)

    return existing
  }

  async function ensureColumns(endpoint: EndpointContext, ref: TableReference): Promise<TableColumnMeta[]> {
    const snapshot = getTableSnapshot(endpoint, ref)
    if (snapshot.columns) {
      return snapshot.columns
    }

    const result = await dependencies.databaseManager.getTableSchema(
      endpoint.connectionId,
      endpoint.databaseName,
      ref.schemaName,
      ref.tableName
    )
    if (result.status === 'error') {
      throw new Error(result.message)
    }

    snapshot.columns = result.columns
    return snapshot.columns
  }

  async function ensureForeignKeys(endpoint: EndpointContext, ref: TableReference): Promise<ForeignKeyDefinition[]> {
    const snapshot = getTableSnapshot(endpoint, ref)
    if (snapshot.foreignKeys) {
      return snapshot.foreignKeys
    }

    const result = await dependencies.databaseManager.getForeignKeys(
      endpoint.connectionId,
      endpoint.databaseName,
      ref.schemaName,
      ref.tableName
    )
    if (result.status === 'error') {
      throw new Error(result.message)
    }

    snapshot.foreignKeys = result.foreignKeys
    return snapshot.foreignKeys
  }

  async function ensureCheckConstraints(
    endpoint: EndpointContext,
    ref: TableReference
  ): Promise<CheckConstraintDefinition[]> {
    const snapshot = getTableSnapshot(endpoint, ref)
    if (snapshot.checkConstraints) {
      return snapshot.checkConstraints
    }

    const result = await dependencies.databaseManager.getCheckConstraints(
      endpoint.connectionId,
      endpoint.databaseName,
      ref.schemaName,
      ref.tableName
    )
    if (result.status === 'error') {
      throw new Error(result.message)
    }

    snapshot.checkConstraints = result.constraints
    return snapshot.checkConstraints
  }

  async function ensureTriggers(endpoint: EndpointContext, ref: TableReference): Promise<TriggerDefinition[]> {
    const snapshot = getTableSnapshot(endpoint, ref)
    if (snapshot.triggers) {
      return snapshot.triggers
    }

    const result = await dependencies.databaseManager.getTriggers(
      endpoint.connectionId,
      endpoint.databaseName,
      ref.schemaName,
      ref.tableName
    )
    if (result.status === 'error') {
      throw new Error(result.message)
    }

    snapshot.triggers = result.triggers
    return snapshot.triggers
  }

  async function ensureIndexes(endpoint: EndpointContext, ref: TableReference): Promise<IndexDefinition[]> {
    const snapshot = getTableSnapshot(endpoint, ref)
    if (snapshot.indexes) {
      return snapshot.indexes
    }

    const result = await dependencies.databaseManager.getIndexes(
      endpoint.connectionId,
      endpoint.databaseName,
      ref.schemaName,
      ref.tableName
    )
    if (result.status === 'error') {
      throw new Error(result.message)
    }

    snapshot.indexes = result.indexes
    return snapshot.indexes
  }

  async function ensureRows(endpoint: EndpointContext, ref: TableReference): Promise<Record<string, unknown>[]> {
    const snapshot = getTableSnapshot(endpoint, ref)
    if (snapshot.rows) {
      return snapshot.rows
    }

    const scriptResult = await dependencies.databaseManager.scriptSelectTopRows(
      endpoint.connectionId,
      endpoint.databaseName,
      ref.schemaName,
      ref.tableName,
      ALL_ROWS_LIMIT
    )
    if (scriptResult.status === 'error') {
      throw new Error(scriptResult.message)
    }

    const queryResult = await dependencies.databaseManager.executeQuery(
      endpoint.connectionId,
      scriptResult.script,
      undefined,
      false,
      false,
      endpoint.databaseName
    )
    if (queryResult.status === 'error') {
      throw new Error(queryResult.message)
    }

    snapshot.rows = queryResult.resultSets[0]?.rows ?? []
    return snapshot.rows
  }

  const sourceTables = await getTableReferences(dependencies, sourceEndpoint)
  const targetTables = await getTableReferences(dependencies, targetEndpoint)

  if (comparison.scopeKeys.includes('schema.tablesCoreConstraints')) {
    const tableKeys = [...new Set([...sourceTables.keys(), ...targetTables.keys()])].sort()

    for (const tableKey of tableKeys) {
      const sourceRef = sourceTables.get(tableKey)
      const targetRef = targetTables.get(tableKey)
      const tableName = sourceRef?.identifier ?? targetRef?.identifier ?? tableKey

      if (!sourceRef) {
        items.push(buildItem('schema.tablesCoreConstraints', 'tables', 'removed', tableName))
        continue
      }

      if (!targetRef) {
        items.push(buildItem('schema.tablesCoreConstraints', 'tables', 'added', tableName))
        continue
      }

      const [sourceColumns, targetColumns, sourceForeignKeys, targetForeignKeys, sourceConstraints, targetConstraints] =
        await Promise.all([
          ensureColumns(sourceEndpoint, sourceRef),
          ensureColumns(targetEndpoint, targetRef),
          ensureForeignKeys(sourceEndpoint, sourceRef),
          ensureForeignKeys(targetEndpoint, targetRef),
          ensureCheckConstraints(sourceEndpoint, sourceRef),
          ensureCheckConstraints(targetEndpoint, targetRef)
        ])

      const sourceColumnMap = buildMapByKey(sourceColumns, (column) => column.name)
      const targetColumnMap = buildMapByKey(targetColumns, (column) => column.name)
      const columnKeys = [...new Set([...sourceColumnMap.keys(), ...targetColumnMap.keys()])].sort()

      for (const columnKey of columnKeys) {
        const sourceColumn = sourceColumnMap.get(columnKey)
        const targetColumn = targetColumnMap.get(columnKey)
        const objectName = `${tableName}.${sourceColumn?.name ?? targetColumn?.name ?? columnKey}`

        if (!sourceColumn) {
          items.push(buildItem('schema.tablesCoreConstraints', 'columns', 'removed', objectName))
          continue
        }

        if (!targetColumn) {
          items.push(buildItem('schema.tablesCoreConstraints', 'columns', 'added', objectName))
          continue
        }

        const sourceComparable = toColumnComparable(sourceColumn)
        const targetComparable = toColumnComparable(targetColumn)
        if (stableStringify(sourceComparable) !== stableStringify(targetComparable)) {
          items.push(
            buildItem(
              'schema.tablesCoreConstraints',
              'columns',
              'modified',
              objectName,
              buildDiffDetails(sourceComparable, targetComparable, {
                type: 'Type',
                maxLength: 'Max length',
                precision: 'Precision',
                scale: 'Scale',
                nullable: 'Nullable',
                defaultValue: 'Default value',
                identity: 'Identity',
                identitySeed: 'Identity seed',
                identityIncrement: 'Identity increment',
                primaryKey: 'Primary key'
              }),
              formatLines(sourceComparable),
              formatLines(targetComparable)
            )
          )
        }
      }

      const sourceForeignKeyMap = buildMapByKey(sourceForeignKeys, (foreignKey) => foreignKey.constraintName)
      const targetForeignKeyMap = buildMapByKey(targetForeignKeys, (foreignKey) => foreignKey.constraintName)
      const foreignKeyKeys = [...new Set([...sourceForeignKeyMap.keys(), ...targetForeignKeyMap.keys()])].sort()

      for (const foreignKeyKey of foreignKeyKeys) {
        const sourceForeignKey = sourceForeignKeyMap.get(foreignKeyKey)
        const targetForeignKey = targetForeignKeyMap.get(foreignKeyKey)
        const objectName = `${tableName}.${sourceForeignKey?.constraintName ?? targetForeignKey?.constraintName ?? foreignKeyKey}`

        if (!sourceForeignKey) {
          items.push(buildItem('schema.tablesCoreConstraints', 'foreignKeys', 'removed', objectName))
          continue
        }

        if (!targetForeignKey) {
          items.push(buildItem('schema.tablesCoreConstraints', 'foreignKeys', 'added', objectName))
          continue
        }

        const sourceComparable = toForeignKeyComparable(sourceForeignKey)
        const targetComparable = toForeignKeyComparable(targetForeignKey)
        if (stableStringify(sourceComparable) !== stableStringify(targetComparable)) {
          items.push(
            buildItem(
              'schema.tablesCoreConstraints',
              'foreignKeys',
              'modified',
              objectName,
              buildDiffDetails(sourceComparable, targetComparable, {
                columnName: 'Column',
                referencedSchema: 'Referenced schema',
                referencedTable: 'Referenced table',
                referencedColumn: 'Referenced column',
                isEnabled: 'Enabled',
                enforceForReplication: 'Replication enforced',
                deleteRule: 'Delete rule',
                updateRule: 'Update rule',
                description: 'Description'
              }),
              formatLines(sourceComparable),
              formatLines(targetComparable)
            )
          )
        }
      }

      const sourceConstraintMap = buildMapByKey(sourceConstraints, (constraint) => constraint.constraintName)
      const targetConstraintMap = buildMapByKey(targetConstraints, (constraint) => constraint.constraintName)
      const constraintKeys = [...new Set([...sourceConstraintMap.keys(), ...targetConstraintMap.keys()])].sort()

      for (const constraintKey of constraintKeys) {
        const sourceConstraint = sourceConstraintMap.get(constraintKey)
        const targetConstraint = targetConstraintMap.get(constraintKey)
        const objectName = `${tableName}.${sourceConstraint?.constraintName ?? targetConstraint?.constraintName ?? constraintKey}`

        if (!sourceConstraint) {
          items.push(buildItem('schema.tablesCoreConstraints', 'checkConstraints', 'removed', objectName))
          continue
        }

        if (!targetConstraint) {
          items.push(buildItem('schema.tablesCoreConstraints', 'checkConstraints', 'added', objectName))
          continue
        }

        const sourceComparable = toConstraintComparable(sourceConstraint)
        const targetComparable = toConstraintComparable(targetConstraint)
        if (stableStringify(sourceComparable) !== stableStringify(targetComparable)) {
          items.push(
            buildItem(
              'schema.tablesCoreConstraints',
              'checkConstraints',
              'modified',
              objectName,
              buildDiffDetails(sourceComparable, targetComparable, {
                condition: 'Condition',
                isEnabled: 'Enabled',
                checkExistingData: 'Check existing data',
                enforceForReplication: 'Replication enforced',
                description: 'Description'
              }),
              formatLines(sourceComparable),
              formatLines(targetComparable)
            )
          )
        }
      }
    }
  }

  if (comparison.scopeKeys.includes('schema.indexingSubsystems')) {
    const commonTableKeys = [...sourceTables.keys()].filter((key) => targetTables.has(key)).sort()

    for (const tableKey of commonTableKeys) {
      const sourceRef = sourceTables.get(tableKey)
      const targetRef = targetTables.get(tableKey)
      if (!sourceRef || !targetRef) {
        continue
      }

      const [sourceIndexes, targetIndexes] = await Promise.all([
        ensureIndexes(sourceEndpoint, sourceRef),
        ensureIndexes(targetEndpoint, targetRef)
      ])

      const sourceIndexMap = buildMapByKey(sourceIndexes, (index) => index.name)
      const targetIndexMap = buildMapByKey(targetIndexes, (index) => index.name)
      const indexKeys = [...new Set([...sourceIndexMap.keys(), ...targetIndexMap.keys()])].sort()

      for (const indexKey of indexKeys) {
        const sourceIndex = sourceIndexMap.get(indexKey)
        const targetIndex = targetIndexMap.get(indexKey)
        const objectName = `${sourceRef.identifier}.${sourceIndex?.name ?? targetIndex?.name ?? indexKey}`

        if (!sourceIndex) {
          items.push(buildItem('schema.indexingSubsystems', 'indexes', 'removed', objectName))
          continue
        }

        if (!targetIndex) {
          items.push(buildItem('schema.indexingSubsystems', 'indexes', 'added', objectName))
          continue
        }

        const sourceComparable = toIndexComparable(sourceIndex)
        const targetComparable = toIndexComparable(targetIndex)
        if (stableStringify(sourceComparable) !== stableStringify(targetComparable)) {
          items.push(
            buildItem(
              'schema.indexingSubsystems',
              'indexes',
              'modified',
              objectName,
              buildDiffDetails(sourceComparable, targetComparable, {
                type: 'Type',
                isUnique: 'Unique',
                isPrimaryKey: 'Primary key',
                isDisabled: 'Disabled',
                filterExpression: 'Filter',
                fillFactor: 'Fill factor',
                padIndex: 'Pad index',
                description: 'Description',
                columns: 'Columns'
              }),
              formatLines(sourceComparable),
              formatLines(targetComparable)
            )
          )
        }
      }
    }
  }

  if (comparison.scopeKeys.includes('schema.programmableObjects')) {
    const commonTableKeys = [...sourceTables.keys()].filter((key) => targetTables.has(key)).sort()

    for (const tableKey of commonTableKeys) {
      const sourceRef = sourceTables.get(tableKey)
      const targetRef = targetTables.get(tableKey)
      if (!sourceRef || !targetRef) {
        continue
      }

      const [sourceTriggers, targetTriggers] = await Promise.all([
        ensureTriggers(sourceEndpoint, sourceRef),
        ensureTriggers(targetEndpoint, targetRef)
      ])

      const sourceTriggerMap = buildMapByKey(sourceTriggers, (trigger) => trigger.triggerName)
      const targetTriggerMap = buildMapByKey(targetTriggers, (trigger) => trigger.triggerName)
      const triggerKeys = [...new Set([...sourceTriggerMap.keys(), ...targetTriggerMap.keys()])].sort()

      for (const triggerKey of triggerKeys) {
        const sourceTrigger = sourceTriggerMap.get(triggerKey)
        const targetTrigger = targetTriggerMap.get(triggerKey)
        const objectName = `${sourceRef.identifier}.${sourceTrigger?.triggerName ?? targetTrigger?.triggerName ?? triggerKey}`

        if (!sourceTrigger) {
          items.push(buildItem('schema.programmableObjects', 'triggers', 'removed', objectName))
          continue
        }

        if (!targetTrigger) {
          items.push(buildItem('schema.programmableObjects', 'triggers', 'added', objectName))
          continue
        }

        const sourceComparable = toTriggerComparable(sourceTrigger)
        const targetComparable = toTriggerComparable(targetTrigger)
        if (stableStringify(sourceComparable) !== stableStringify(targetComparable)) {
          items.push(
            buildItem(
              'schema.programmableObjects',
              'triggers',
              'modified',
              objectName,
              buildDiffDetails(sourceComparable, targetComparable, {
                isInsteadOf: 'INSTEAD OF',
                isInsert: 'INSERT event',
                isUpdate: 'UPDATE event',
                isDelete: 'DELETE event',
                body: 'Body',
                description: 'Description'
              }),
              sourceTrigger.body,
              targetTrigger.body
            )
          )
        }
      }
    }

    const [sourceViewsResult, targetViewsResult, sourceProceduresResult, targetProceduresResult, sourceFunctions, targetFunctions] =
      await Promise.all([
        dependencies.databaseManager.getViews(sourceEndpoint.connectionId, sourceEndpoint.databaseName),
        dependencies.databaseManager.getViews(targetEndpoint.connectionId, targetEndpoint.databaseName),
        dependencies.databaseManager.getStoredProcedures(sourceEndpoint.connectionId, sourceEndpoint.databaseName),
        dependencies.databaseManager.getStoredProcedures(targetEndpoint.connectionId, targetEndpoint.databaseName),
        getChildrenOrThrow(dependencies, sourceEndpoint.connectionId, `db:${sourceEndpoint.databaseName}:functions`),
        getChildrenOrThrow(dependencies, targetEndpoint.connectionId, `db:${targetEndpoint.databaseName}:functions`)
      ])

    if (sourceViewsResult.status === 'error') {
      throw new Error(sourceViewsResult.message)
    }
    if (targetViewsResult.status === 'error') {
      throw new Error(targetViewsResult.message)
    }
    if (sourceProceduresResult.status === 'error') {
      throw new Error(sourceProceduresResult.message)
    }
    if (targetProceduresResult.status === 'error') {
      throw new Error(targetProceduresResult.message)
    }

    const sourceViewMap = buildMapByKey(sourceViewsResult.views, (view) => buildSchemaObjectKey(view.schemaName, view.viewName, sourceEndpoint.databaseName))
    const targetViewMap = buildMapByKey(targetViewsResult.views, (view) => buildSchemaObjectKey(view.schemaName, view.viewName, targetEndpoint.databaseName))
    const viewKeys = [...new Set([...sourceViewMap.keys(), ...targetViewMap.keys()])].sort()

    for (const viewKey of viewKeys) {
      const sourceView = sourceViewMap.get(viewKey)
      const targetView = targetViewMap.get(viewKey)
      const objectName = `${sourceView?.schemaName ?? targetView?.schemaName}.${sourceView?.viewName ?? targetView?.viewName}`

      if (!sourceView) {
        items.push(buildItem('schema.programmableObjects', 'views', 'removed', objectName))
        continue
      }

      if (!targetView) {
        items.push(buildItem('schema.programmableObjects', 'views', 'added', objectName))
        continue
      }

      const sourceComparable = toViewComparable(sourceView)
      const targetComparable = toViewComparable(targetView)
      if (stableStringify(sourceComparable) !== stableStringify(targetComparable)) {
        items.push(
          buildItem(
            'schema.programmableObjects',
            'views',
            'modified',
            objectName,
            buildDiffDetails(sourceComparable, targetComparable, {
              definition: 'Definition',
              isSchemabound: 'Schema bound',
              isEncrypted: 'Encrypted'
            }),
            sourceView.definition,
            targetView.definition
          )
        )
      }
    }

    const sourceProcedureMap = buildMapByKey(
      sourceProceduresResult.procedures,
      (procedure) => buildSchemaObjectKey(procedure.schemaName, procedure.procedureName, sourceEndpoint.databaseName)
    )
    const targetProcedureMap = buildMapByKey(
      targetProceduresResult.procedures,
      (procedure) => buildSchemaObjectKey(procedure.schemaName, procedure.procedureName, targetEndpoint.databaseName)
    )
    const procedureKeys = [...new Set([...sourceProcedureMap.keys(), ...targetProcedureMap.keys()])].sort()

    for (const procedureKey of procedureKeys) {
      const sourceProcedure = sourceProcedureMap.get(procedureKey)
      const targetProcedure = targetProcedureMap.get(procedureKey)
      const objectName = `${sourceProcedure?.schemaName ?? targetProcedure?.schemaName}.${sourceProcedure?.procedureName ?? targetProcedure?.procedureName}`

      if (!sourceProcedure) {
        items.push(buildItem('schema.programmableObjects', 'storedProcedures', 'removed', objectName))
        continue
      }

      if (!targetProcedure) {
        items.push(buildItem('schema.programmableObjects', 'storedProcedures', 'added', objectName))
        continue
      }

      const sourceComparable = toProcedureComparable(sourceProcedure)
      const targetComparable = toProcedureComparable(targetProcedure)
      if (stableStringify(sourceComparable) !== stableStringify(targetComparable)) {
        items.push(
          buildItem(
            'schema.programmableObjects',
            'storedProcedures',
            'modified',
            objectName,
            buildDiffDetails(sourceComparable, targetComparable, {
              description: 'Description',
              parameters: 'Parameters',
              body: 'Body'
            }),
            sourceProcedure.body,
            targetProcedure.body
          )
        )
      }
    }

    await executeNamedListComparison(
      items,
      'schema.programmableObjects',
      'functions',
      sourceFunctions.map((node) => extractIdentifier(node.id, 'functions')),
      targetFunctions.map((node) => extractIdentifier(node.id, 'functions'))
    )
  }

  if (comparison.scopeKeys.includes('schema.securityMetadataProfiles')) {
    const [sourceUsers, targetUsers, sourceRoles, targetRoles, sourceSchemas, targetSchemas] = await Promise.all([
      getChildrenOrThrow(dependencies, sourceEndpoint.connectionId, `db:${sourceEndpoint.databaseName}:security:users`),
      getChildrenOrThrow(dependencies, targetEndpoint.connectionId, `db:${targetEndpoint.databaseName}:security:users`),
      getChildrenOrThrow(dependencies, sourceEndpoint.connectionId, `db:${sourceEndpoint.databaseName}:security:roles`),
      getChildrenOrThrow(dependencies, targetEndpoint.connectionId, `db:${targetEndpoint.databaseName}:security:roles`),
      getChildrenOrThrow(dependencies, sourceEndpoint.connectionId, `db:${sourceEndpoint.databaseName}:security:schemas`),
      getChildrenOrThrow(dependencies, targetEndpoint.connectionId, `db:${targetEndpoint.databaseName}:security:schemas`)
    ])

    await executeNamedListComparison(
      items,
      'schema.securityMetadataProfiles',
      'securityUsers',
      sourceUsers.map((node) => node.label),
      targetUsers.map((node) => node.label)
    )
    await executeNamedListComparison(
      items,
      'schema.securityMetadataProfiles',
      'securityRoles',
      sourceRoles.map((node) => node.label),
      targetRoles.map((node) => node.label)
    )
    await executeNamedListComparison(
      items,
      'schema.securityMetadataProfiles',
      'securitySchemas',
      sourceSchemas.map((node) => node.label),
      targetSchemas.map((node) => node.label)
    )
  }

  if (
    comparison.scopeKeys.includes('data.keyMatchedSets') ||
    comparison.scopeKeys.includes('data.rowLevelValues')
  ) {
    const sourceBareNameIndex = buildBareNameIndex(sourceTables)
    const targetBareNameIndex = buildBareNameIndex(targetTables)
    const pairedSourceKeys = new Set<string>()
    const pairedTargetKeys = new Set<string>()
    const tablePairs: TablePair[] = []

    for (const mapping of comparison.tableKeyMappings) {
      const sourceRef = resolveMappedTable(mapping.sourceTable, sourceTables, sourceBareNameIndex)
      const targetRef = resolveMappedTable(mapping.targetTable, targetTables, targetBareNameIndex)
      const displayName = `${mapping.sourceTable} -> ${mapping.targetTable}`

      if (!sourceRef || !targetRef) {
        items.push(
          buildItem(
            'data.keyMatchedSets',
            'rows',
            'unsupported',
            displayName,
            ['Unable to resolve one or both mapped tables for this logical-key override.']
          )
        )
        continue
      }

      const sourceKey = normalizeToken(sourceRef.identifier)
      const targetKey = normalizeToken(targetRef.identifier)
      pairedSourceKeys.add(sourceKey)
      pairedTargetKeys.add(targetKey)
      tablePairs.push({ source: sourceRef, target: targetRef, mapping })
    }

    for (const [tableKey, sourceRef] of sourceTables.entries()) {
      const targetRef = targetTables.get(tableKey)
      if (!targetRef || pairedSourceKeys.has(tableKey) || pairedTargetKeys.has(tableKey)) {
        continue
      }

      pairedSourceKeys.add(tableKey)
      pairedTargetKeys.add(tableKey)
      tablePairs.push({ source: sourceRef, target: targetRef })
    }

    for (const tablePair of tablePairs) {
      const objectName =
        normalizeToken(tablePair.source.identifier) === normalizeToken(tablePair.target.identifier)
          ? tablePair.source.identifier
          : `${tablePair.source.identifier} -> ${tablePair.target.identifier}`

      const [sourceColumns, targetColumns] = await Promise.all([
        ensureColumns(sourceEndpoint, tablePair.source),
        ensureColumns(targetEndpoint, tablePair.target)
      ])

      let sourceKeyColumns: string[]
      let targetKeyColumns: string[]

      if (tablePair.mapping) {
        sourceKeyColumns = tablePair.mapping.sourceColumns
        targetKeyColumns = tablePair.mapping.targetColumns
      } else {
        sourceKeyColumns = getPrimaryKeyColumns(sourceColumns)
        targetKeyColumns = getPrimaryKeyColumns(targetColumns)

        if (sourceKeyColumns.length === 0 || targetKeyColumns.length === 0) {
          items.push(
            buildItem(
              'data.keyMatchedSets',
              'rows',
              'unsupported',
              objectName,
              ['Skipping table because one side does not expose a primary key and no custom logical key mapping was provided.']
            )
          )
          continue
        }

        if (
          sourceKeyColumns.length !== targetKeyColumns.length ||
          sourceKeyColumns.some((column, index) => normalizeToken(column) !== normalizeToken(targetKeyColumns[index]))
        ) {
          items.push(
            buildItem(
              'data.keyMatchedSets',
              'rows',
              'unsupported',
              objectName,
              ['Skipping table because source and target primary-key columns do not line up. Add a custom logical-key mapping to compare row data.']
            )
          )
          continue
        }
      }

      const [sourceRows, targetRows] = await Promise.all([
        ensureRows(sourceEndpoint, tablePair.source),
        ensureRows(targetEndpoint, tablePair.target)
      ])

      const sourceRowMap = new Map<string, Record<string, unknown>>()
      const targetRowMap = new Map<string, Record<string, unknown>>()
      let hasDuplicateKeys = false

      for (const row of sourceRows) {
        const keyValues = sourceKeyColumns.map((columnName) => getRowValue(row, columnName))
        if (keyValues.some((value) => value === undefined)) {
          items.push(
            buildItem(
              'data.keyMatchedSets',
              'rows',
              'unsupported',
              objectName,
              ['Skipping table because one or more source key columns are missing from the returned row set.']
            )
          )
          hasDuplicateKeys = true
          break
        }

        const rowKey = keyValues.map((value) => stableStringify(value)).join(' | ')
        if (sourceRowMap.has(rowKey)) {
          hasDuplicateKeys = true
          items.push(
            buildItem(
              'data.keyMatchedSets',
              'rows',
              'unsupported',
              objectName,
              [`Skipping table because the source contains duplicate logical-key values (${rowKey}).`]
            )
          )
          break
        }

        sourceRowMap.set(rowKey, row)
      }

      if (hasDuplicateKeys) {
        continue
      }

      for (const row of targetRows) {
        const keyValues = targetKeyColumns.map((columnName) => getRowValue(row, columnName))
        if (keyValues.some((value) => value === undefined)) {
          items.push(
            buildItem(
              'data.keyMatchedSets',
              'rows',
              'unsupported',
              objectName,
              ['Skipping table because one or more target key columns are missing from the returned row set.']
            )
          )
          hasDuplicateKeys = true
          break
        }

        const rowKey = keyValues.map((value) => stableStringify(value)).join(' | ')
        if (targetRowMap.has(rowKey)) {
          hasDuplicateKeys = true
          items.push(
            buildItem(
              'data.keyMatchedSets',
              'rows',
              'unsupported',
              objectName,
              [`Skipping table because the target contains duplicate logical-key values (${rowKey}).`]
            )
          )
          break
        }

        targetRowMap.set(rowKey, row)
      }

      if (hasDuplicateKeys) {
        continue
      }

      const allKeys = [...new Set([...sourceRowMap.keys(), ...targetRowMap.keys()])].sort()
      const addedRows: string[] = []
      const removedRows: string[] = []
      const modifiedRows: string[] = []

      for (const rowKey of allKeys) {
        const sourceRow = sourceRowMap.get(rowKey)
        const targetRow = targetRowMap.get(rowKey)

        if (!sourceRow && targetRow) {
          removedRows.push(`Target row ${rowKey} does not exist in the source.`)
          continue
        }

        if (sourceRow && !targetRow) {
          addedRows.push(`Source row ${rowKey} does not exist in the target.`)
          continue
        }

        if (!sourceRow || !targetRow) {
          continue
        }

        const sourceNormalizedRow = normalizeRow(sourceRow)
        const targetNormalizedRow = normalizeRow(targetRow)
        const sharedColumns = [...sourceNormalizedRow.keys()].filter((column) => targetNormalizedRow.has(column))
        const changedColumns: string[] = []

        for (const sharedColumn of sharedColumns) {
          if (
            sourceKeyColumns.some((columnName) => normalizeToken(columnName) === sharedColumn) ||
            targetKeyColumns.some((columnName) => normalizeToken(columnName) === sharedColumn)
          ) {
            continue
          }

          const sourceValue = sourceNormalizedRow.get(sharedColumn)?.value
          const targetValue = targetNormalizedRow.get(sharedColumn)?.value
          if (stableStringify(sourceValue) !== stableStringify(targetValue)) {
            const label = sourceNormalizedRow.get(sharedColumn)?.key ?? targetNormalizedRow.get(sharedColumn)?.key ?? sharedColumn
            changedColumns.push(`${label}: ${stableStringify(sourceValue)} -> ${stableStringify(targetValue)}`)
          }
        }

        if (changedColumns.length > 0) {
          modifiedRows.push(`Row ${rowKey} changed. ${changedColumns.join('; ')}`)
        }
      }

      if (addedRows.length > 0) {
        items.push(buildItem('data.keyMatchedSets', 'rows', 'added', objectName, addedRows))
      }

      if (removedRows.length > 0) {
        items.push(buildItem('data.keyMatchedSets', 'rows', 'removed', objectName, removedRows))
      }

      if (modifiedRows.length > 0) {
        const scopeKey: ComparisonScopeKey = comparison.scopeKeys.includes('data.rowLevelValues')
          ? 'data.rowLevelValues'
          : 'data.keyMatchedSets'
        items.push(buildItem(scopeKey, 'rows', 'modified', objectName, modifiedRows))
      }
    }
  }

  const counts = {
    total: items.length,
    added: items.filter((item) => item.changeType === 'added').length,
    removed: items.filter((item) => item.changeType === 'removed').length,
    modified: items.filter((item) => item.changeType === 'modified').length,
    unsupported: items.filter((item) => item.changeType === 'unsupported').length
  }

  return {
    comparisonId: comparison.id,
    comparisonName: comparison.name,
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    counts,
    items,
    warnings
  }
}
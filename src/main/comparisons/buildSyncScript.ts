import type { DatabaseManager } from '../database/DatabaseManager'
import type {
  ComparisonSyncDirection,
  GenerateSyncScriptResult,
  SyncScriptSection
} from '../database/types'
import type {
  ComparisonExecutionReport,
  ComparisonReportItem
} from './executeComparison'
import type { ComparisonRecord } from '../store'
import { getComparisonItemSyncState } from '../../shared/comparisons/syncability'

interface BuildSyncScriptDependencies {
  databaseManager: Pick<
    DatabaseManager,
    | 'scriptTableCreate'
    | 'scriptTableAlter'
    | 'scriptTableDrop'
    | 'scriptViewCreate'
    | 'scriptViewAlter'
    | 'scriptViewDrop'
    | 'scriptStoredProcedureCreate'
    | 'scriptStoredProcedureAlter'
    | 'scriptStoredProcedureDrop'
  >
}

/** Split a "schema.objectName" or bare "objectName" identifier. */
function splitObjectName(objectName: string): { schemaName: string; localName: string } {
  const dot = objectName.indexOf('.')
  if (dot === -1) {
    return { schemaName: 'dbo', localName: objectName }
  }
  return {
    schemaName: objectName.slice(0, dot),
    localName: objectName.slice(dot + 1)
  }
}

async function buildSectionForward(
  deps: BuildSyncScriptDependencies,
  item: ComparisonReportItem,
  truthConnectionId: string,
  truthDatabaseName: string,
  receiverConnectionId: string,
  receiverDatabaseName: string
): Promise<SyncScriptSection> {
  const syncState = getComparisonItemSyncState(item)
  if (!syncState.isExecutable) {
    return buildSkipped(item, syncState.skipReason ?? 'No sync script is available for this finding')
  }

  const { schemaName, localName } = splitObjectName(item.objectName)

  try {
    if (item.category === 'tables') {
      if (item.changeType === 'added') {
        // Object in truth, not in receiver → CREATE on receiver using truth definition
        const result = await deps.databaseManager.scriptTableCreate(
          truthConnectionId, truthDatabaseName, schemaName, localName
        )
        if (result.status === 'error') return buildSkipped(item, result.message)
        return buildSection(item, result.script)
      }
      if (item.changeType === 'removed') {
        // Object in receiver, not in truth → DROP from receiver
        const result = await deps.databaseManager.scriptTableDrop(
          receiverConnectionId, receiverDatabaseName, schemaName, localName
        )
        if (result.status === 'error') return buildSkipped(item, result.message)
        return buildSection(item, result.script)
      }
    }

    if (item.category === 'views') {
      if (item.changeType === 'added') {
        const result = await deps.databaseManager.scriptViewCreate(
          truthConnectionId, truthDatabaseName, schemaName, localName
        )
        if (result.status === 'error') return buildSkipped(item, result.message)
        return buildSection(item, result.script)
      }
      if (item.changeType === 'removed') {
        const result = await deps.databaseManager.scriptViewDrop(
          receiverConnectionId, receiverDatabaseName, schemaName, localName
        )
        if (result.status === 'error') return buildSkipped(item, result.message)
        return buildSection(item, result.script)
      }
      if (item.changeType === 'modified') {
        const result = await deps.databaseManager.scriptViewAlter(
          truthConnectionId, truthDatabaseName, schemaName, localName
        )
        if (result.status === 'error') return buildSkipped(item, result.message)
        return buildSection(item, result.script)
      }
    }

    if (item.category === 'storedProcedures') {
      if (item.changeType === 'added') {
        const result = await deps.databaseManager.scriptStoredProcedureCreate(
          truthConnectionId, truthDatabaseName, schemaName, localName
        )
        if (result.status === 'error') return buildSkipped(item, result.message)
        return buildSection(item, result.script)
      }
      if (item.changeType === 'removed') {
        const result = await deps.databaseManager.scriptStoredProcedureDrop(
          receiverConnectionId, receiverDatabaseName, schemaName, localName
        )
        if (result.status === 'error') return buildSkipped(item, result.message)
        return buildSection(item, result.script)
      }
      if (item.changeType === 'modified') {
        const result = await deps.databaseManager.scriptStoredProcedureAlter(
          truthConnectionId, truthDatabaseName, schemaName, localName
        )
        if (result.status === 'error') return buildSkipped(item, result.message)
        return buildSection(item, result.script)
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return buildSkipped(item, message)
  }

  return buildSkipped(item, syncState.skipReason ?? 'No sync script is available for this finding')
}

/**
 * For the revert script we invert the operation:
 * - 'added' items (forward would CREATE on receiver) → revert = DROP from receiver
 * - 'removed' items (forward would DROP from receiver) → revert = CREATE on receiver using current receiver definition
 * - 'modified' items (forward would ALTER on receiver) → revert = ALTER on receiver back to its current definition
 *
 * truthConnectionId / receiverConnectionId are for the FORWARD direction.
 * Revert reads from receiver (current state) to undo forward changes.
 */
async function buildRevertSection(
  deps: BuildSyncScriptDependencies,
  item: ComparisonReportItem,
  receiverConnectionId: string,
  receiverDatabaseName: string
): Promise<SyncScriptSection> {
  const syncState = getComparisonItemSyncState(item)
  if (!syncState.isExecutable) {
    return buildSkipped(item, syncState.skipReason ?? 'No sync script is available for this finding')
  }

  const { schemaName, localName } = splitObjectName(item.objectName)

  try {
    if (item.category === 'tables') {
      if (item.changeType === 'added') {
        // Forward creates table on receiver → revert drops it
        const result = await deps.databaseManager.scriptTableDrop(
          receiverConnectionId, receiverDatabaseName, schemaName, localName
        )
        if (result.status === 'error') return buildSkipped(item, result.message)
        return buildSection(item, result.script)
      }
      if (item.changeType === 'removed') {
        // Forward drops table from receiver → revert recreates it (reading current receiver state)
        const result = await deps.databaseManager.scriptTableCreate(
          receiverConnectionId, receiverDatabaseName, schemaName, localName
        )
        if (result.status === 'error') return buildSkipped(item, result.message)
        return buildSection(item, result.script)
      }
    }

    if (item.category === 'views') {
      if (item.changeType === 'added') {
        const result = await deps.databaseManager.scriptViewDrop(
          receiverConnectionId, receiverDatabaseName, schemaName, localName
        )
        if (result.status === 'error') return buildSkipped(item, result.message)
        return buildSection(item, result.script)
      }
      if (item.changeType === 'removed') {
        const result = await deps.databaseManager.scriptViewCreate(
          receiverConnectionId, receiverDatabaseName, schemaName, localName
        )
        if (result.status === 'error') return buildSkipped(item, result.message)
        return buildSection(item, result.script)
      }
      if (item.changeType === 'modified') {
        // Forward alters view to match source → revert alters view back to original target definition
        const result = await deps.databaseManager.scriptViewAlter(
          receiverConnectionId, receiverDatabaseName, schemaName, localName
        )
        if (result.status === 'error') return buildSkipped(item, result.message)
        return buildSection(item, result.script)
      }
    }

    if (item.category === 'storedProcedures') {
      if (item.changeType === 'added') {
        const result = await deps.databaseManager.scriptStoredProcedureDrop(
          receiverConnectionId, receiverDatabaseName, schemaName, localName
        )
        if (result.status === 'error') return buildSkipped(item, result.message)
        return buildSection(item, result.script)
      }
      if (item.changeType === 'removed') {
        const result = await deps.databaseManager.scriptStoredProcedureCreate(
          receiverConnectionId, receiverDatabaseName, schemaName, localName
        )
        if (result.status === 'error') return buildSkipped(item, result.message)
        return buildSection(item, result.script)
      }
      if (item.changeType === 'modified') {
        const result = await deps.databaseManager.scriptStoredProcedureAlter(
          receiverConnectionId, receiverDatabaseName, schemaName, localName
        )
        if (result.status === 'error') return buildSkipped(item, result.message)
        return buildSection(item, result.script)
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return buildSkipped(item, message)
  }

  return buildSkipped(item, syncState.skipReason ?? 'No sync script is available for this finding')
}

function buildSection(item: ComparisonReportItem, sql: string): SyncScriptSection {
  return {
    itemId: item.id,
    objectName: item.objectName,
    category: item.category,
    changeType: item.changeType,
    sql,
    skipped: false
  }
}

function buildSkipped(item: ComparisonReportItem, skipReason: string): SyncScriptSection {
  return {
    itemId: item.id,
    objectName: item.objectName,
    category: item.category,
    changeType: item.changeType,
    sql: null,
    skipped: true,
    skipReason
  }
}

function sectionsToScript(
  sections: SyncScriptSection[],
  header: string
): string {
  const parts: string[] = [header, '']

  for (const section of sections) {
    parts.push(`-- [${section.category}] ${section.objectName} (${section.changeType})`)
    if (section.skipped) {
      parts.push(`-- SKIPPED: ${section.skipReason}`)
    } else if (section.sql) {
      parts.push(section.sql)
    }
    parts.push('')
  }

  return parts.join('\n')
}

function buildHeader(
  comparison: ComparisonRecord,
  direction: ComparisonSyncDirection,
  kind: 'forward' | 'revert',
  skippedCount: number
): string {
  const truthDb =
    direction === 'forward' ? comparison.source.databaseName : comparison.target.databaseName
  const receiverDb =
    direction === 'forward' ? comparison.target.databaseName : comparison.source.databaseName
  const lines = [
    `-- ============================================================`,
    `-- Comparison: ${comparison.name}`,
    `-- Script:     ${kind === 'revert' ? 'REVERT' : 'SYNC'}`,
    `-- Direction:  ${truthDb} → ${receiverDb}`,
    `-- Generated:  ${new Date().toISOString()}`,
    skippedCount > 0
      ? `-- Note: ${skippedCount} finding(s) were skipped (see inline comments).`
      : `-- All findings included.`,
    `-- ============================================================`
  ]
  return lines.join('\n')
}

export async function buildSyncScript(
  deps: BuildSyncScriptDependencies,
  comparison: ComparisonRecord,
  report: ComparisonExecutionReport,
  direction: ComparisonSyncDirection
): Promise<GenerateSyncScriptResult> {
  const truthConnectionId =
    direction === 'forward' ? comparison.source.connectionId : comparison.target.connectionId
  const truthDatabaseName =
    direction === 'forward' ? comparison.source.databaseName : comparison.target.databaseName
  const receiverConnectionId =
    direction === 'forward' ? comparison.target.connectionId : comparison.source.connectionId
  const receiverDatabaseName =
    direction === 'forward' ? comparison.target.databaseName : comparison.source.databaseName

  const scriptableItems = report.items.filter((i) => i.changeType !== 'unsupported')

  const sectionPromises = scriptableItems.map((item) => {
    // When swapped, flip added↔removed so buildSectionForward uses the correct operation
    const effectiveItem =
      direction === 'swapped' && (item.changeType === 'added' || item.changeType === 'removed')
        ? { ...item, changeType: item.changeType === 'added' ? ('removed' as const) : ('added' as const) }
        : item
    return buildSectionForward(
      deps,
      effectiveItem,
      truthConnectionId,
      truthDatabaseName,
      receiverConnectionId,
      receiverDatabaseName
    )
  })

  let sections: SyncScriptSection[]
  try {
    sections = await Promise.all(sectionPromises)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { status: 'error', message }
  }

  const skippedCount = sections.filter((s) => s.skipped).length
  const header = buildHeader(comparison, direction, 'forward', skippedCount)
  const script = sectionsToScript(sections, header)

  return { status: 'ok', script, sections, skippedCount }
}

export async function buildRevertScript(
  deps: BuildSyncScriptDependencies,
  comparison: ComparisonRecord,
  report: ComparisonExecutionReport,
  direction: ComparisonSyncDirection
): Promise<GenerateSyncScriptResult> {
  // Revert reads from the RECEIVER side (state before sync) to undo forward changes.
  const receiverConnectionId =
    direction === 'forward' ? comparison.target.connectionId : comparison.source.connectionId
  const receiverDatabaseName =
    direction === 'forward' ? comparison.target.databaseName : comparison.source.databaseName

  const scriptableItems = report.items.filter((i) => i.changeType !== 'unsupported')

  const sectionPromises = scriptableItems.map((item) => {
    // When swapped, flip added↔removed so buildRevertSection inverts the correct operation
    const effectiveItem =
      direction === 'swapped' && (item.changeType === 'added' || item.changeType === 'removed')
        ? { ...item, changeType: item.changeType === 'added' ? ('removed' as const) : ('added' as const) }
        : item
    return buildRevertSection(deps, effectiveItem, receiverConnectionId, receiverDatabaseName)
  })

  let sections: SyncScriptSection[]
  try {
    sections = await Promise.all(sectionPromises)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { status: 'error', message }
  }

  const skippedCount = sections.filter((s) => s.skipped).length
  const header = buildHeader(comparison, direction, 'revert', skippedCount)
  const script = sectionsToScript(sections, header)

  return { status: 'ok', script, sections, skippedCount }
}

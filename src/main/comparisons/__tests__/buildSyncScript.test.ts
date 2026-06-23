// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'
import { buildSyncScript, buildRevertScript } from '../buildSyncScript'
import type { ComparisonRecord } from '../../store'
import type { ComparisonExecutionReport } from '../executeComparison'

const baseComparison: ComparisonRecord = {
  id: 'cmp-1',
  name: 'Test Comparison',
  description: '',
  source: { connectionId: 'src-conn', databaseName: 'SourceDB', provider: 'sqlserver' },
  target: { connectionId: 'tgt-conn', databaseName: 'TargetDB', provider: 'sqlserver' },
  scopeKeys: ['schema.tablesCoreConstraints'],
  tableKeyMappings: [],
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z'
}

const baseReport: ComparisonExecutionReport = {
  comparisonId: 'cmp-1',
  comparisonName: 'Test Comparison',
  generatedAt: '2024-01-01T00:00:00Z',
  durationMs: 100,
  counts: { total: 0, added: 0, removed: 0, modified: 0, unsupported: 0 },
  items: [],
  warnings: []
}

function makeReport(items: ComparisonExecutionReport['items']): ComparisonExecutionReport {
  return {
    ...baseReport,
    items,
    counts: {
      total: items.length,
      added: items.filter((i) => i.changeType === 'added').length,
      removed: items.filter((i) => i.changeType === 'removed').length,
      modified: items.filter((i) => i.changeType === 'modified').length,
      unsupported: items.filter((i) => i.changeType === 'unsupported').length
    }
  }
}

function makeDeps(overrides?: Partial<Parameters<typeof buildSyncScript>[0]['databaseManager']>) {
  return {
    databaseManager: {
      scriptTableCreate: vi.fn(async () => ({ status: 'ok' as const, script: 'CREATE TABLE dbo.Orders (...)' })),
      scriptTableAlter: vi.fn(async () => ({ status: 'ok' as const, script: 'ALTER TABLE dbo.Orders ...' })),
      scriptTableDrop: vi.fn(async () => ({ status: 'ok' as const, script: 'DROP TABLE dbo.Orders' })),
      scriptViewCreate: vi.fn(async () => ({ status: 'ok' as const, script: 'CREATE VIEW dbo.vOrders AS ...' })),
      scriptViewAlter: vi.fn(async () => ({ status: 'ok' as const, script: 'ALTER VIEW dbo.vOrders AS ...' })),
      scriptViewDrop: vi.fn(async () => ({ status: 'ok' as const, script: 'DROP VIEW dbo.vOrders' })),
      scriptStoredProcedureCreate: vi.fn(async () => ({ status: 'ok' as const, script: 'CREATE PROC dbo.usp_Get AS ...' })),
      scriptStoredProcedureAlter: vi.fn(async () => ({ status: 'ok' as const, script: 'ALTER PROC dbo.usp_Get AS ...' })),
      scriptStoredProcedureDrop: vi.fn(async () => ({ status: 'ok' as const, script: 'DROP PROC dbo.usp_Get' })),
      ...overrides
    }
  }
}

describe('buildSyncScript', () => {
  it('returns ok with empty script when there are no items', async () => {
    const result = await buildSyncScript(makeDeps(), baseComparison, baseReport, 'forward')
    expect(result.status).toBe('ok')
    if (result.status === 'ok') {
      expect(result.script).toContain('SYNC')
      expect(result.sections).toHaveLength(0)
      expect(result.skippedCount).toBe(0)
    }
  })

  it('generates CREATE TABLE script for added table in forward direction', async () => {
    const deps = makeDeps()
    const report = makeReport([
      {
        id: 'item-1',
        scopeKey: 'schema.tablesCoreConstraints',
        category: 'tables',
        changeType: 'added',
        objectName: 'dbo.Orders',
        details: []
      }
    ])

    const result = await buildSyncScript(deps, baseComparison, report, 'forward')

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return

    // Should call scriptTableCreate on the TRUTH (source) connection
    expect(deps.databaseManager.scriptTableCreate).toHaveBeenCalledWith(
      'src-conn', 'SourceDB', 'dbo', 'Orders'
    )
    expect(result.sections).toHaveLength(1)
    expect(result.sections![0].skipped).toBe(false)
    expect(result.sections![0].sql).toContain('CREATE TABLE')
    expect(result.skippedCount).toBe(0)
  })

  it('generates DROP TABLE script for removed table in forward direction', async () => {
    const deps = makeDeps()
    const report = makeReport([
      {
        id: 'item-2',
        scopeKey: 'schema.tablesCoreConstraints',
        category: 'tables',
        changeType: 'removed',
        objectName: 'dbo.OldTable',
        details: []
      }
    ])

    const result = await buildSyncScript(deps, baseComparison, report, 'forward')

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return

    // For 'removed', reads DROP script from the RECEIVER (target) connection
    expect(deps.databaseManager.scriptTableDrop).toHaveBeenCalledWith(
      'tgt-conn', 'TargetDB', 'dbo', 'OldTable'
    )
    expect(result.sections![0].skipped).toBe(false)
  })

  it('uses swapped direction: truth is target, receiver is source', async () => {
    const deps = makeDeps()
    const report = makeReport([
      {
        id: 'item-3',
        scopeKey: 'schema.tablesCoreConstraints',
        category: 'tables',
        changeType: 'added',
        objectName: 'dbo.Orders',
        details: []
      }
    ])

    const result = await buildSyncScript(deps, baseComparison, report, 'swapped')

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return

    // 'added' means source has the table, target does not.
    // In swapped mode, truth=target, receiver=source.
    // target (truth) doesn't have the table → it should be DROPPED from source (receiver).
    // changeType is flipped to 'removed' before scripting.
    expect(deps.databaseManager.scriptTableDrop).toHaveBeenCalledWith(
      'src-conn', 'SourceDB', 'dbo', 'Orders'
    )
    expect(deps.databaseManager.scriptTableCreate).not.toHaveBeenCalled()
    expect(result.sections).toHaveLength(1)
    expect(result.sections![0].skipped).toBe(false)
  })

  it('generates scripts for views and stored procedures', async () => {
    const deps = makeDeps()
    const report = makeReport([
      {
        id: 'v-1',
        scopeKey: 'schema.programmableObjects',
        category: 'views',
        changeType: 'added',
        objectName: 'dbo.vOrders',
        details: []
      },
      {
        id: 'sp-1',
        scopeKey: 'schema.programmableObjects',
        category: 'storedProcedures',
        changeType: 'modified',
        objectName: 'dbo.usp_Get',
        details: []
      }
    ])

    const result = await buildSyncScript(deps, baseComparison, report, 'forward')

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return

    expect(deps.databaseManager.scriptViewCreate).toHaveBeenCalledWith(
      'src-conn', 'SourceDB', 'dbo', 'vOrders'
    )
    expect(deps.databaseManager.scriptStoredProcedureAlter).toHaveBeenCalledWith(
      'src-conn', 'SourceDB', 'dbo', 'usp_Get'
    )
    expect(result.sections).toHaveLength(2)
    expect(result.sections!.every((s) => !s.skipped)).toBe(true)
  })

  it('skips unsupported items and marks them in sections', async () => {
    const deps = makeDeps()
    const report = makeReport([
      {
        id: 'col-1',
        scopeKey: 'schema.tablesCoreConstraints',
        category: 'columns',
        changeType: 'modified',
        objectName: 'dbo.Users.email',
        details: []
      }
    ])

    const result = await buildSyncScript(deps, baseComparison, report, 'forward')

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return

    expect(result.sections).toHaveLength(1)
    expect(result.sections![0].skipped).toBe(true)
    expect(result.sections![0].skipReason).toBeTruthy()
    expect(result.skippedCount).toBe(1)
  })

  it('skips items with changeType unsupported entirely', async () => {
    const deps = makeDeps()
    const report = makeReport([
      {
        id: 'u-1',
        scopeKey: 'schema.tablesCoreConstraints',
        category: 'tables',
        changeType: 'unsupported',
        objectName: 'dbo.SomeTable',
        details: []
      }
    ])

    const result = await buildSyncScript(deps, baseComparison, report, 'forward')

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return

    // Unsupported items are filtered out entirely
    expect(result.sections).toHaveLength(0)
  })

  it('marks section as skipped when script API returns error', async () => {
    const deps = makeDeps({
      scriptTableCreate: vi.fn(async () => ({ status: 'error' as const, message: 'Provider error' }))
    })
    const report = makeReport([
      {
        id: 'item-err',
        scopeKey: 'schema.tablesCoreConstraints',
        category: 'tables',
        changeType: 'added',
        objectName: 'dbo.FailTable',
        details: []
      }
    ])

    const result = await buildSyncScript(deps, baseComparison, report, 'forward')

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return

    expect(result.sections![0].skipped).toBe(true)
    expect(result.sections![0].skipReason).toBe('Provider error')
    expect(result.skippedCount).toBe(1)
  })

  it('includes header with comparison name and direction in script', async () => {
    const result = await buildSyncScript(makeDeps(), baseComparison, baseReport, 'forward')
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.script).toContain('Test Comparison')
    expect(result.script).toContain('SourceDB')
    expect(result.script).toContain('TargetDB')
  })
})

describe('buildRevertScript', () => {
  it('generates DROP for items that would be CREATEd in forward sync (added)', async () => {
    const deps = makeDeps()
    const report = makeReport([
      {
        id: 'item-1',
        scopeKey: 'schema.tablesCoreConstraints',
        category: 'tables',
        changeType: 'added',
        objectName: 'dbo.Orders',
        details: []
      }
    ])

    const result = await buildRevertScript(deps, baseComparison, report, 'forward')

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return

    // Revert of "forward adds Orders on target" = DROP from target (receiver)
    expect(deps.databaseManager.scriptTableDrop).toHaveBeenCalledWith(
      'tgt-conn', 'TargetDB', 'dbo', 'Orders'
    )
  })

  it('generates CREATE for items that would be DROPped in forward sync (removed)', async () => {
    const deps = makeDeps()
    const report = makeReport([
      {
        id: 'item-2',
        scopeKey: 'schema.tablesCoreConstraints',
        category: 'tables',
        changeType: 'removed',
        objectName: 'dbo.OldTable',
        details: []
      }
    ])

    const result = await buildRevertScript(deps, baseComparison, report, 'forward')

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return

    // Revert of "forward drops OldTable from target" = CREATE on target (receiver)
    expect(deps.databaseManager.scriptTableCreate).toHaveBeenCalledWith(
      'tgt-conn', 'TargetDB', 'dbo', 'OldTable'
    )
  })

  it('generates ALTER using receiver state for modified items', async () => {
    const deps = makeDeps()
    const report = makeReport([
      {
        id: 'v-mod',
        scopeKey: 'schema.programmableObjects',
        category: 'views',
        changeType: 'modified',
        objectName: 'dbo.vReport',
        details: []
      }
    ])

    const result = await buildRevertScript(deps, baseComparison, report, 'forward')

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return

    // Revert reads from receiver (target) to restore original view
    expect(deps.databaseManager.scriptViewAlter).toHaveBeenCalledWith(
      'tgt-conn', 'TargetDB', 'dbo', 'vReport'
    )
  })

  it('includes REVERT in the script header', async () => {
    const result = await buildRevertScript(makeDeps(), baseComparison, baseReport, 'forward')
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.script).toContain('REVERT')
  })
})

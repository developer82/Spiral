// @vitest-environment jsdom

import '../../../../test-setup'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SettingsProvider } from '../../../../contexts/SettingsContext'
import ComparePage from '../ComparePage'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key
  })
}))

const baseComparison = {
  id: 'cmp-sync',
  name: 'Sync Test',
  description: '',
  source: { connectionId: 'conn-src', databaseName: 'SourceDB', provider: 'sqlserver' as const },
  target: { connectionId: 'conn-tgt', databaseName: 'TargetDB', provider: 'sqlserver' as const },
  scopeKeys: ['schema.tablesCoreConstraints' as const],
  tableKeyMappings: [],
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z'
}

const baseReport = {
  comparisonId: 'cmp-sync',
  comparisonName: 'Sync Test',
  generatedAt: '2024-01-01T00:00:00Z',
  durationMs: 50,
  counts: { total: 1, added: 1, removed: 0, modified: 0, unsupported: 0 },
  items: [
    {
      id: 'item-1',
      scopeKey: 'schema.tablesCoreConstraints' as const,
      category: 'tables' as const,
      changeType: 'added' as const,
      objectName: 'dbo.NewTable',
      details: []
    }
  ],
  warnings: []
}

function renderPage(): ReturnType<typeof render> {
  return render(<ComparePage />, { wrapper: SettingsProvider })
}

async function setupWithReport(): Promise<void> {
  vi.spyOn(window.api.connections, 'getAll').mockResolvedValue([])
  vi.spyOn(window.api.comparisons, 'getAll').mockResolvedValue([baseComparison])
  vi.spyOn(window.api.comparisons, 'execute').mockResolvedValue(baseReport)
  vi.spyOn(window.api.database, 'getDatabases').mockResolvedValue({ status: 'ok', databases: [] })

  renderPage()

  // Both sidebar item and detail heading show the comparison name
  await waitFor(() => {
    expect(screen.getAllByText('Sync Test')).toHaveLength(2)
  })

  const user = userEvent.setup()
  await user.click(screen.getByText('compare.actions.compare'))

  await waitFor(() => {
    expect(screen.getByText('compare.report.actions.swap')).toBeInTheDocument()
  })
}

describe('ComparePage sync actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  describe('Swap button', () => {
    it('toggles swap label when Swap button is clicked', async () => {
      await setupWithReport()
      const user = userEvent.setup()

      expect(screen.queryByText(/swapped/i)).not.toBeInTheDocument()

      await user.click(screen.getByText('compare.report.actions.swap'))

      await waitFor(() => {
        expect(screen.getByText(/swapped/i)).toBeInTheDocument()
      })
    })

    it('toggles back to non-swapped state on second click', async () => {
      await setupWithReport()
      const user = userEvent.setup()

      await user.click(screen.getByText('compare.report.actions.swap'))
      await waitFor(() => {
        expect(screen.getByText(/swapped/i)).toBeInTheDocument()
      })

      await user.click(screen.getByText(/compare\.report\.actions\.swap/))
      await waitFor(() => {
        expect(screen.queryByText(/\(compare\.report\.actions\.swapped\)/)).not.toBeInTheDocument()
      })
    })
  })

  describe('Create Script button', () => {
    it('calls generateSyncScript and dispatches explorer:open-script event', async () => {
      await setupWithReport()
      const user = userEvent.setup()

      const generateSpy = vi.spyOn(window.api.comparisons, 'generateSyncScript').mockResolvedValue({
        status: 'ok',
        script: '-- sync script content',
        sections: [],
        skippedCount: 0
      })
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent')

      await user.click(screen.getByText('compare.report.actions.createScript'))

      await waitFor(() => {
        expect(generateSpy).toHaveBeenCalledWith('cmp-sync', baseReport, 'forward')
      })

      await waitFor(() => {
        const openScriptCalls = dispatchSpy.mock.calls.filter(
          ([event]) => event instanceof CustomEvent && (event as CustomEvent).type === 'explorer:open-script'
        )
        expect(openScriptCalls.length).toBeGreaterThan(0)
        const detail = (openScriptCalls[0][0] as CustomEvent).detail
        expect(detail.content).toBe('-- sync script content')
        expect(detail.connectionId).toBe('conn-tgt')
        expect(detail.databaseName).toBe('TargetDB')
      })
    })

    it('calls generateSyncScript with swapped direction when swapped', async () => {
      await setupWithReport()
      const user = userEvent.setup()

      const generateSpy = vi.spyOn(window.api.comparisons, 'generateSyncScript').mockResolvedValue({
        status: 'ok',
        script: '-- swapped script',
        sections: [],
        skippedCount: 0
      })

      await user.click(screen.getByText('compare.report.actions.swap'))
      await user.click(screen.getByText(/compare\.report\.actions\.createScript/))

      await waitFor(() => {
        expect(generateSpy).toHaveBeenCalledWith('cmp-sync', baseReport, 'swapped')
      })
    })

    it('shows alert on script generation error', async () => {
      await setupWithReport()
      const user = userEvent.setup()

      vi.spyOn(window.api.comparisons, 'generateSyncScript').mockResolvedValue({
        status: 'error',
        message: 'Script generation failed'
      })
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})

      await user.click(screen.getByText('compare.report.actions.createScript'))

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith('Script generation failed')
      })
    })
  })

  describe('Sync All dialog', () => {
    it('opens sync confirm dialog when Sync All is clicked', async () => {
      await setupWithReport()
      const user = userEvent.setup()

      await user.click(screen.getByText('compare.report.actions.syncAll'))

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument()
      })
    })

    it('closes dialog on Cancel', async () => {
      await setupWithReport()
      const user = userEvent.setup()

      await user.click(screen.getByText('compare.report.actions.syncAll'))
      await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

      await user.click(screen.getByText('compare.syncConfirmDialog.cancel'))

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      })
    })

    it('calls executeSync and re-runs comparison after Sync All confirms', async () => {
      await setupWithReport()
      const user = userEvent.setup()

      const executeSyncSpy = vi.spyOn(window.api.comparisons, 'executeSync').mockResolvedValue({
        status: 'ok'
      })
      const executeCompareSpy = vi.spyOn(window.api.comparisons, 'execute').mockResolvedValue(baseReport)

      await user.click(screen.getByText('compare.report.actions.syncAll'))
      await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

      await user.click(screen.getByText('compare.syncConfirmDialog.confirm'))

      await waitFor(() => {
        expect(executeSyncSpy).toHaveBeenCalledWith('cmp-sync', baseReport, 'forward', false)
        expect(executeCompareSpy).toHaveBeenCalledWith('cmp-sync')
      })
    })

    it('opens sync confirm dialog when a row Sync button is clicked', async () => {
      await setupWithReport()
      const user = userEvent.setup()

      await user.click(screen.getByText('compare.report.actions.sync'))

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument()
      })
    })

    it('calls executeSync with a one-item report when row Sync confirms', async () => {
      await setupWithReport()
      const user = userEvent.setup()

      const executeSyncSpy = vi.spyOn(window.api.comparisons, 'executeSync').mockResolvedValue({
        status: 'ok'
      })
      const executeCompareSpy = vi.spyOn(window.api.comparisons, 'execute').mockResolvedValue(baseReport)

      await user.click(screen.getByText('compare.report.actions.sync'))
      await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

      await user.click(screen.getByText('compare.syncConfirmDialog.confirm'))

      await waitFor(() => {
        expect(executeSyncSpy).toHaveBeenCalledWith(
          'cmp-sync',
          expect.objectContaining({
            items: [baseReport.items[0]],
            counts: { total: 1, added: 1, removed: 0, modified: 0, unsupported: 0 }
          }),
          'forward',
          false
        )
        expect(executeCompareSpy).toHaveBeenCalledWith('cmp-sync')
      })
    })

    it('calls executeSync with swapped direction when row Sync confirms after swapping', async () => {
      await setupWithReport()
      const user = userEvent.setup()

      const executeSyncSpy = vi.spyOn(window.api.comparisons, 'executeSync').mockResolvedValue({
        status: 'ok'
      })
      vi.spyOn(window.api.comparisons, 'execute').mockResolvedValue(baseReport)

      await user.click(screen.getByText('compare.report.actions.swap'))
      await user.click(screen.getByText('compare.report.actions.sync'))
      await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

      await user.click(screen.getByText('compare.syncConfirmDialog.confirm'))

      await waitFor(() => {
        expect(executeSyncSpy).toHaveBeenCalledWith(
          'cmp-sync',
          expect.objectContaining({ items: [baseReport.items[0]] }),
          'swapped',
          false
        )
      })
    })

    it('disables row Sync for findings that cannot be scripted', async () => {
      vi.spyOn(window.api.connections, 'getAll').mockResolvedValue([])
      vi.spyOn(window.api.comparisons, 'getAll').mockResolvedValue([baseComparison])
      vi.spyOn(window.api.comparisons, 'execute').mockResolvedValue({
        ...baseReport,
        items: [
          {
            id: 'item-unsupported',
            scopeKey: 'schema.tablesCoreConstraints' as const,
            category: 'columns' as const,
            changeType: 'modified' as const,
            objectName: 'dbo.Users.Email',
            details: []
          }
        ],
        counts: { total: 1, added: 0, removed: 0, modified: 1, unsupported: 0 }
      })
      vi.spyOn(window.api.database, 'getDatabases').mockResolvedValue({ status: 'ok', databases: [] })

      renderPage()

      await waitFor(() => {
        expect(screen.getAllByText('Sync Test')).toHaveLength(2)
      })

      const user = userEvent.setup()
      await user.click(screen.getByText('compare.actions.compare'))

      await waitFor(() => {
        expect(screen.getByText('compare.report.actions.sync')).toBeDisabled()
      })
    })

    it('calls executeSync with createRevertScript=true when checkbox is checked', async () => {
      await setupWithReport()
      const user = userEvent.setup()

      vi.spyOn(window.api.comparisons, 'executeSync').mockResolvedValue({ status: 'ok' })
      vi.spyOn(window.api.comparisons, 'execute').mockResolvedValue(baseReport)
      const saveDialogSpy = vi
        .spyOn(window.api.file, 'saveDialog')
        .mockResolvedValue({ status: 'cancelled' })

      await user.click(screen.getByText('compare.report.actions.syncAll'))
      await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

      await user.click(screen.getByRole('checkbox'))
      await user.click(screen.getByText('compare.syncConfirmDialog.confirm'))

      await waitFor(() => {
        expect(window.api.comparisons.executeSync).toHaveBeenCalledWith(
          'cmp-sync', baseReport, 'forward', true
        )
        // No revert script returned, so saveDialog not called
        expect(saveDialogSpy).not.toHaveBeenCalled()
      })
    })

    it('prompts to save revert script when executeSync returns one', async () => {
      await setupWithReport()
      const user = userEvent.setup()

      vi.spyOn(window.api.comparisons, 'executeSync').mockResolvedValue({
        status: 'ok',
        revertScript: '-- revert content'
      })
      vi.spyOn(window.api.comparisons, 'execute').mockResolvedValue(baseReport)
      const saveDialogSpy = vi
        .spyOn(window.api.file, 'saveDialog')
        .mockResolvedValue({ status: 'cancelled' })

      await user.click(screen.getByText('compare.report.actions.syncAll'))
      await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

      await user.click(screen.getByText('compare.syncConfirmDialog.confirm'))

      await waitFor(() => {
        expect(saveDialogSpy).toHaveBeenCalledWith(
          '-- revert content',
          expect.objectContaining({ filters: expect.arrayContaining([expect.objectContaining({ extensions: ['sql'] })]) })
        )
      })
    })

    it('shows alert and does not re-run comparison on executeSync error', async () => {
      await setupWithReport()
      const user = userEvent.setup()

      vi.spyOn(window.api.comparisons, 'executeSync').mockResolvedValue({
        status: 'error',
        message: 'Connection failed'
      })
      const executeSpy = vi.spyOn(window.api.comparisons, 'execute')
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})

      await user.click(screen.getByText('compare.report.actions.syncAll'))
      await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

      await user.click(screen.getByText('compare.syncConfirmDialog.confirm'))

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith('Connection failed')
        // Should not re-run comparison after error
        expect(executeSpy).not.toHaveBeenCalled()
      })
    })
  })
})

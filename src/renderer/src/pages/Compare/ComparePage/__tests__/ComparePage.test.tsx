// @vitest-environment jsdom

import '../../../../test-setup'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SettingsProvider } from '../../../../contexts/SettingsContext'
import ComparePage from '../ComparePage'

function getDetailSection(title: string): HTMLElement {
  return screen.getByRole('heading', { name: new RegExp(`^${title}(?:\\s*\\([^)]*\\))?$`) }).closest('section') as HTMLElement
}

function renderComparePage(): ReturnType<typeof render> {
  return render(<ComparePage />, { wrapper: SettingsProvider })
}

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      if (key === 'compare.deleteConfirm') {
        return `delete ${params?.name as string}`
      }
      return key
    }
  })
}))

const mockTriggerConfetti = vi.fn()
vi.mock('../../../../hooks/useConfetti', () => ({
  useConfetti: () => ({ triggerConfetti: mockTriggerConfetti })
}))

describe('ComparePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(window.api.connections, 'getAll').mockResolvedValue([
      {
        id: 'conn-1',
        name: 'Source Connection',
        provider: 'sqlserver',
        host: 'localhost',
        port: 1433,
        username: 'sa',
        password: '',
        rememberPassword: false,
        defaultDatabase: 'SourceDb',
        environmentId: 'qa'
      },
      {
        id: 'conn-2',
        name: 'Target Connection',
        provider: 'postgres',
        host: 'localhost',
        port: 5432,
        username: 'postgres',
        password: '',
        rememberPassword: false,
        defaultDatabase: 'TargetDb',
        environmentId: 'production'
      }
    ])
    vi.spyOn(window.api.comparisons, 'getAll').mockResolvedValue([])
    vi.spyOn(window.api.database, 'getDatabases').mockImplementation(async (connectionId: string) => {
      if (connectionId === 'conn-1') {
        return { status: 'ok', databases: ['SourceDb'] }
      }
      return { status: 'ok', databases: ['TargetDb'] }
    })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
  })

  afterEach(() => {
    cleanup()
  })

  it('creates a comparison and renders it in the sidebar and detail view', async () => {
    const user = userEvent.setup()
    vi.spyOn(window.api.comparisons, 'create').mockResolvedValue({
      id: 'cmp-1',
      name: 'Nightly Diff',
      description: 'Checks schema drift',
      source: {
        connectionId: 'conn-1',
        databaseName: 'SourceDb',
        provider: 'sqlserver'
      },
      target: {
        connectionId: 'conn-2',
        databaseName: 'TargetDb',
        provider: 'postgres'
      },
      scopeKeys: ['schema.tablesCoreConstraints'],
      tableKeyMappings: [],
      createdAt: '2026-05-18T00:00:00.000Z',
      updatedAt: '2026-05-18T00:00:00.000Z'
    })

    renderComparePage()

    await user.click(screen.getByText('compare.addComparison'))
    await user.type(screen.getByLabelText('compare.dialog.fields.name'), 'Nightly Diff')
    await user.type(screen.getByLabelText('compare.dialog.fields.description'), 'Checks schema drift')
    await user.selectOptions(screen.getAllByLabelText('compare.dialog.fields.connection')[0], 'conn-1')
    await user.selectOptions(screen.getAllByLabelText('compare.dialog.fields.connection')[1], 'conn-2')

    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'SourceDb' })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: 'TargetDb' })).toBeInTheDocument()
    })

    await user.selectOptions(screen.getAllByLabelText('compare.dialog.fields.database')[0], 'SourceDb')
    await user.selectOptions(screen.getAllByLabelText('compare.dialog.fields.database')[1], 'TargetDb')
    await user.click(screen.getByText('compare.dialog.actions.save'))

    await waitFor(() => {
      expect(screen.getAllByText('Nightly Diff')).toHaveLength(2)
      expect(screen.getByText('Checks schema drift')).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: /^compare\.detail\.source\s*\(QA\)$/ })).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: /^compare\.detail\.target\s*\(Production\)$/ })).toBeInTheDocument()
      expect(screen.getByText('SourceDb')).toBeInTheDocument()
      expect(screen.getByText('TargetDb')).toBeInTheDocument()
      expect(window.api.comparisons.create).toHaveBeenCalled()
    })
  })

  it('executes a comparison and renders the results report', async () => {
    const user = userEvent.setup()
    vi.spyOn(window.api.comparisons, 'getAll').mockResolvedValue([
      {
        id: 'cmp-1',
        name: 'Nightly Diff',
        description: 'Checks schema drift',
        source: {
          connectionId: 'conn-1',
          databaseName: 'SourceDb',
          provider: 'sqlserver'
        },
        target: {
          connectionId: 'conn-2',
          databaseName: 'TargetDb',
          provider: 'postgres'
        },
        scopeKeys: ['schema.tablesCoreConstraints'],
        tableKeyMappings: [],
        createdAt: '2026-05-18T00:00:00.000Z',
        updatedAt: '2026-05-18T00:00:00.000Z'
      }
    ])
    vi.spyOn(window.api.comparisons, 'execute').mockResolvedValue({
      comparisonId: 'cmp-1',
      comparisonName: 'Nightly Diff',
      generatedAt: '2026-05-19T08:00:00.000Z',
      durationMs: 123,
      counts: {
        total: 2,
        added: 1,
        removed: 0,
        modified: 1,
        unsupported: 0
      },
      items: [
        {
          id: 'item-1',
          scopeKey: 'schema.tablesCoreConstraints',
          category: 'columns',
          changeType: 'modified',
          objectName: 'dbo.users.email',
          details: ['Max length: 120 -> 255']
        },
        {
          id: 'item-2',
          scopeKey: 'schema.tablesCoreConstraints',
          category: 'tables',
          changeType: 'added',
          objectName: 'dbo.sessions',
          details: []
        }
      ],
      warnings: []
    })

    renderComparePage()

    await waitFor(() => {
      expect(screen.getAllByText('Nightly Diff')).toHaveLength(2)
    })

    await user.click(screen.getByText('compare.actions.compare'))

    await waitFor(() => {
      expect(window.api.comparisons.execute).toHaveBeenCalledWith('cmp-1')
      expect(screen.getByText('compare.report.title')).toBeInTheDocument()
      expect(screen.getByText('dbo.users.email')).toBeInTheDocument()
      expect(screen.getByText('Max length: 120 -> 255')).toBeInTheDocument()
      expect(screen.getByText('dbo.sessions')).toBeInTheDocument()
    })
  })

  it('applies environment border colors to the source and target detail cards', async () => {
    vi.spyOn(window.api.comparisons, 'getAll').mockResolvedValue([
      {
        id: 'cmp-1',
        name: 'Nightly Diff',
        description: 'Checks schema drift',
        source: {
          connectionId: 'conn-1',
          databaseName: 'SourceDb',
          provider: 'sqlserver'
        },
        target: {
          connectionId: 'conn-2',
          databaseName: 'TargetDb',
          provider: 'postgres'
        },
        scopeKeys: ['schema.tablesCoreConstraints'],
        tableKeyMappings: [],
        createdAt: '2026-05-18T00:00:00.000Z',
        updatedAt: '2026-05-18T00:00:00.000Z'
      }
    ])

    renderComparePage()

    await waitFor(() => {
      expect(getDetailSection('compare.detail.source').style.getPropertyValue('--compare-detail-border-color')).toBe('#2e7d32')
      expect(getDetailSection('compare.detail.target').style.getPropertyValue('--compare-detail-border-color')).toBe('#ff3b30')
      expect(screen.getByRole('heading', { name: /^compare\.detail\.source\s*\(QA\)$/ })).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: /^compare\.detail\.target\s*\(Production\)$/ })).toBeInTheDocument()
      expect(screen.getByText('SourceDb')).toBeInTheDocument()
      expect(screen.getByText('TargetDb')).toBeInTheDocument()
    })
  })

  // ── Export ─────────────────────────────────────────────────────────────────

  describe('Save Comparison Report', () => {
    const baseComparison = {
      id: 'cmp-1',
      name: 'Nightly Diff',
      description: 'Checks schema drift',
      source: { connectionId: 'conn-1', databaseName: 'SourceDb', provider: 'sqlserver' as const },
      target: { connectionId: 'conn-2', databaseName: 'TargetDb', provider: 'postgres' as const },
      scopeKeys: ['schema.tablesCoreConstraints' as const],
      tableKeyMappings: [],
      createdAt: '2026-05-18T00:00:00.000Z',
      updatedAt: '2026-05-18T00:00:00.000Z'
    }

    const baseReport = {
      comparisonId: 'cmp-1',
      comparisonName: 'Nightly Diff',
      generatedAt: '2026-05-19T08:00:00.000Z',
      durationMs: 123,
      counts: { total: 1, added: 1, removed: 0, modified: 0, unsupported: 0 },
      items: [
        {
          id: 'item-1',
          scopeKey: 'schema.tablesCoreConstraints' as const,
          category: 'tables' as const,
          changeType: 'added' as const,
          objectName: 'dbo.sessions',
          details: []
        }
      ],
      warnings: []
    }

    beforeEach(() => {
      vi.spyOn(window.api.comparisons, 'getAll').mockResolvedValue([baseComparison])
    })

    it('Save button is disabled before a report is generated', async () => {
      renderComparePage()

      await waitFor(() => {
        expect(screen.getAllByText('Nightly Diff')).toHaveLength(2)
      })

      // report action buttons only appear when there is a report, so the
      // Save button should not be in the DOM yet
      expect(screen.queryByRole('button', { name: /compare\.report\.actions\.save/ })).not.toBeInTheDocument()
    })

    it('Save button opens the export secrets dialog when prompting is enabled', async () => {
      const user = userEvent.setup()
      vi.spyOn(window.api.comparisons, 'execute').mockResolvedValue(baseReport)

      renderComparePage()

      await waitFor(() => screen.getByText('compare.actions.compare'))
      await user.click(screen.getByText('compare.actions.compare'))

      await waitFor(() =>
        expect(screen.getByRole('button', { name: /compare\.report\.actions\.save/ })).toBeInTheDocument()
      )

      await user.click(screen.getByRole('button', { name: /compare\.report\.actions\.save/ }))

      expect(screen.getByRole('dialog', { name: 'compare.exportSecretsDialog.title' })).toBeInTheDocument()
    })

    it('confirming the export secrets dialog calls file.saveDialog with a JSON payload', async () => {
      const user = userEvent.setup()
      vi.spyOn(window.api.comparisons, 'execute').mockResolvedValue(baseReport)
      vi.spyOn(window.api.file, 'saveDialog').mockResolvedValue({ status: 'ok', filePath: '/tmp/out.json' })

      renderComparePage()

      await waitFor(() => screen.getByText('compare.actions.compare'))
      await user.click(screen.getByText('compare.actions.compare'))

      await waitFor(() =>
        expect(screen.getByRole('button', { name: /compare\.report\.actions\.save/ })).toBeInTheDocument()
      )

      await user.click(screen.getByRole('button', { name: /compare\.report\.actions\.save/ }))
      await waitFor(() => screen.getByRole('dialog', { name: 'compare.exportSecretsDialog.title' }))

      await user.click(screen.getByRole('button', { name: 'compare.exportSecretsDialog.save' }))

      await waitFor(() => {
        expect(window.api.file.saveDialog).toHaveBeenCalledOnce()
        const [content, options] = (window.api.file.saveDialog as ReturnType<typeof vi.fn>).mock.calls[0]
        const payload = JSON.parse(content as string)
        expect(payload.exportVersion).toBe(1)
        expect(payload.comparison.name).toBe('Nightly Diff')
        expect(payload.report.comparisonId).toBe('cmp-1')
        expect(payload.secretsIncluded).toBe(false)
        expect(payload.sourceConnection.databaseName).toBe('SourceDb')
        expect(payload.targetConnection.databaseName).toBe('TargetDb')
        expect((options as { filters: Array<{ extensions: string[] }> }).filters[0].extensions).toContain('json')
      })
    })

    it('when prompting is disabled, Save calls file.saveDialog immediately without opening dialog', async () => {
      const user = userEvent.setup()
      vi.spyOn(window.api.comparisons, 'execute').mockResolvedValue(baseReport)
      vi.spyOn(window.api.file, 'saveDialog').mockResolvedValue({ status: 'ok', filePath: '/tmp/out.json' })
      vi.spyOn(window.api.settings, 'set')

      // Override the initial settings to disable the prompt
      const original = window.api.settings.initial
      Object.assign(window.api.settings, {
        initial: { ...original, askBeforeIncludingSecretsInComparisonExport: false }
      })

      renderComparePage()

      await waitFor(() => screen.getByText('compare.actions.compare'))
      await user.click(screen.getByText('compare.actions.compare'))

      await waitFor(() =>
        expect(screen.getByRole('button', { name: /compare\.report\.actions\.save/ })).toBeInTheDocument()
      )

      await user.click(screen.getByRole('button', { name: /compare\.report\.actions\.save/ }))

      await waitFor(() => {
        expect(window.api.file.saveDialog).toHaveBeenCalledOnce()
        expect(screen.queryByRole('dialog', { name: 'compare.exportSecretsDialog.title' })).not.toBeInTheDocument()
      })

      // Restore
      Object.assign(window.api.settings, { initial: original })
    })

    it('checking Don\'t Ask Again persists both settings via window.api.settings.set', async () => {
      const user = userEvent.setup()
      vi.spyOn(window.api.comparisons, 'execute').mockResolvedValue(baseReport)
      vi.spyOn(window.api.file, 'saveDialog').mockResolvedValue({ status: 'ok', filePath: '/tmp/out.json' })
      vi.spyOn(window.api.settings, 'set')

      renderComparePage()

      await waitFor(() => screen.getByText('compare.actions.compare'))
      await user.click(screen.getByText('compare.actions.compare'))

      await waitFor(() =>
        expect(screen.getByRole('button', { name: /compare\.report\.actions\.save/ })).toBeInTheDocument()
      )

      await user.click(screen.getByRole('button', { name: /compare\.report\.actions\.save/ }))
      await waitFor(() => screen.getByRole('dialog', { name: 'compare.exportSecretsDialog.title' }))

      await user.click(screen.getByRole('checkbox', { name: 'compare.exportSecretsDialog.dontAskAgain' }))
      await user.click(screen.getByRole('button', { name: 'compare.exportSecretsDialog.save' }))

      await waitFor(() => {
        expect(window.api.settings.set).toHaveBeenCalledWith('askBeforeIncludingSecretsInComparisonExport', false)
        expect(window.api.settings.set).toHaveBeenCalledWith('includeSecretsInComparisonExportByDefault', false)
      })
    })
  })

  // ── Confetti ───────────────────────────────────────────────────────────────

  describe('confetti behavior', () => {
    const baseComparison = {
      id: 'cmp-1',
      name: 'Nightly Diff',
      description: '',
      source: { connectionId: 'conn-1', databaseName: 'SourceDb', provider: 'sqlserver' as const },
      target: { connectionId: 'conn-2', databaseName: 'TargetDb', provider: 'postgres' as const },
      scopeKeys: ['schema.tablesCoreConstraints' as const],
      tableKeyMappings: [],
      createdAt: '2026-05-18T00:00:00.000Z',
      updatedAt: '2026-05-18T00:00:00.000Z'
    }

    beforeEach(() => {
      vi.spyOn(window.api.comparisons, 'getAll').mockResolvedValue([baseComparison])
    })

    it('triggers confetti when the comparison result has no differences', async () => {
      const user = userEvent.setup()
      vi.spyOn(window.api.comparisons, 'execute').mockResolvedValue({
        comparisonId: 'cmp-1',
        comparisonName: 'Nightly Diff',
        generatedAt: '2026-05-19T08:00:00.000Z',
        durationMs: 50,
        counts: { total: 0, added: 0, removed: 0, modified: 0, unsupported: 0 },
        items: [],
        warnings: []
      })

      renderComparePage()

      await waitFor(() => screen.getByText('compare.actions.compare'))
      await user.click(screen.getByText('compare.actions.compare'))

      await waitFor(() => {
        expect(mockTriggerConfetti).toHaveBeenCalledOnce()
      })
    })

    it('does not trigger confetti when the comparison result has differences', async () => {
      const user = userEvent.setup()
      vi.spyOn(window.api.comparisons, 'execute').mockResolvedValue({
        comparisonId: 'cmp-1',
        comparisonName: 'Nightly Diff',
        generatedAt: '2026-05-19T08:00:00.000Z',
        durationMs: 50,
        counts: { total: 1, added: 1, removed: 0, modified: 0, unsupported: 0 },
        items: [
          {
            id: 'item-1',
            scopeKey: 'schema.tablesCoreConstraints' as const,
            category: 'tables' as const,
            changeType: 'added' as const,
            objectName: 'dbo.sessions',
            details: []
          }
        ],
        warnings: []
      })

      renderComparePage()

      await waitFor(() => screen.getByText('compare.actions.compare'))
      await user.click(screen.getByText('compare.actions.compare'))

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /compare\.report\.actions\.syncAll/ })).toBeInTheDocument()
      })
      expect(mockTriggerConfetti).not.toHaveBeenCalled()
    })

    it('triggers confetti after a successful sync', async () => {
      const user = userEvent.setup()
      const reportWithDiffs = {
        comparisonId: 'cmp-1',
        comparisonName: 'Nightly Diff',
        generatedAt: '2026-05-19T08:00:00.000Z',
        durationMs: 50,
        counts: { total: 1, added: 1, removed: 0, modified: 0, unsupported: 0 },
        items: [
          {
            id: 'item-1',
            scopeKey: 'schema.tablesCoreConstraints' as const,
            category: 'tables' as const,
            changeType: 'added' as const,
            objectName: 'dbo.sessions',
            details: []
          }
        ],
        warnings: []
      }
      vi.spyOn(window.api.comparisons, 'execute').mockResolvedValue(reportWithDiffs)
      vi.spyOn(window.api.comparisons, 'executeSync').mockResolvedValue({ status: 'ok' })

      renderComparePage()

      await waitFor(() => screen.getByText('compare.actions.compare'))
      await user.click(screen.getByText('compare.actions.compare'))

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /compare\.report\.actions\.syncAll/ })).toBeInTheDocument()
      })
      expect(mockTriggerConfetti).not.toHaveBeenCalled()

      await user.click(screen.getByRole('button', { name: /compare\.report\.actions\.syncAll/ }))

      await waitFor(() => {
        expect(screen.getByRole('dialog', { name: 'compare.syncConfirmDialog.title' })).toBeInTheDocument()
      })

      await user.click(screen.getByRole('button', { name: 'compare.syncConfirmDialog.confirm' }))

      await waitFor(() => {
        expect(mockTriggerConfetti).toHaveBeenCalledOnce()
      })
    })
  })
})
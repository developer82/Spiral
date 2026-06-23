// @vitest-environment jsdom

import '../../../../../test-setup'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConnectionRecord } from '../../../../Explorer/connections.types'
import type { EnvironmentDefinition } from '../../../../Settings/useSettings'
import ComparisonDialog from '../ComparisonDialog'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}))

const CONNECTIONS: ConnectionRecord[] = [
  {
    id: 'source-1',
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
    id: 'target-1',
    name: 'Target Connection',
    provider: 'postgres',
    host: 'localhost',
    port: 5432,
    username: 'postgres',
    password: '',
    rememberPassword: false,
    defaultDatabase: 'TargetDb',
    environmentId: 'production'
  },
  {
    id: 'neutral-1',
    name: 'Neutral Connection',
    provider: 'sqlite',
    host: '',
    port: 0,
    username: '',
    password: '',
    rememberPassword: false,
    defaultDatabase: 'NeutralDb'
  }
]

const ENVIRONMENTS: EnvironmentDefinition[] = [
  {
    id: 'production',
    name: 'Production',
    description: 'Live production environment.',
    critical: true,
    color: '#ff3b30'
  },
  {
    id: 'qa',
    name: 'QA',
    description: 'Quality assurance environment.',
    critical: false,
    color: '#2e7d32'
  }
]

function getEndpointSection(title: string): HTMLElement {
  return screen.getByRole('heading', { name: title }).closest('section') as HTMLElement
}

describe('ComparisonDialog', () => {
  const onSave = vi.fn()
  const onCancel = vi.fn()
  const onConnectionCreated = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(window.api.database, 'getDatabases').mockImplementation(async (connectionId: string) => {
      if (connectionId === 'source-1') {
        return { status: 'ok', databases: ['SourceDb', 'SourceArchive'] }
      }
      if (connectionId === 'target-1') {
        return { status: 'ok', databases: ['TargetDb'] }
      }
      if (connectionId === 'neutral-1') {
        return { status: 'ok', databases: ['NeutralDb'] }
      }
      return { status: 'ok', databases: ['NewDb'] }
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('shows validation errors when required fields are missing', async () => {
    const user = userEvent.setup()
    render(
      <ComparisonDialog
        connections={CONNECTIONS}
        environments={ENVIRONMENTS}
        onCancel={onCancel}
        onSave={onSave}
        onConnectionCreated={onConnectionCreated}
      />
    )

    await user.click(screen.getByText('compare.dialog.actions.save'))

    expect(screen.getByText('compare.dialog.validation.nameRequired')).toBeInTheDocument()
    expect(screen.getByText('compare.dialog.validation.sourceConnectionRequired')).toBeInTheDocument()
    expect(screen.getByText('compare.dialog.validation.targetConnectionRequired')).toBeInTheDocument()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('saves a comparison with source, target, scopes, and key mappings', async () => {
    const user = userEvent.setup()
    onSave.mockResolvedValue(undefined)

    render(
      <ComparisonDialog
        connections={CONNECTIONS}
        environments={ENVIRONMENTS}
        onCancel={onCancel}
        onSave={onSave}
        onConnectionCreated={onConnectionCreated}
      />
    )

    await user.type(screen.getByLabelText('compare.dialog.fields.name'), 'Nightly Diff')
    await user.type(screen.getByLabelText('compare.dialog.fields.description'), 'Compares production and staging')
    await user.selectOptions(screen.getAllByLabelText('compare.dialog.fields.connection')[0], 'source-1')
    await user.selectOptions(screen.getAllByLabelText('compare.dialog.fields.connection')[1], 'target-1')

    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'SourceDb' })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: 'TargetDb' })).toBeInTheDocument()
    })

    await user.selectOptions(screen.getAllByLabelText('compare.dialog.fields.database')[0], 'SourceDb')
    await user.selectOptions(screen.getAllByLabelText('compare.dialog.fields.database')[1], 'TargetDb')
    await user.click(screen.getByText('compare.scope.options.keyMatchedSets.label'))
    await user.click(screen.getByText('compare.dialog.actions.addMapping'))
    await user.type(screen.getByLabelText('compare.dialog.keyMappings.sourceTable'), 'dbo.Customers')
    await user.type(screen.getByLabelText('compare.dialog.keyMappings.targetTable'), 'public.customers')
    await user.type(screen.getByLabelText('compare.dialog.keyMappings.sourceColumns'), 'CustomerId, RegionId')
    await user.type(screen.getByLabelText('compare.dialog.keyMappings.targetColumns'), 'customer_id, region_id')

    await user.click(screen.getByText('compare.dialog.actions.save'))

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Nightly Diff',
          description: 'Compares production and staging',
          source: expect.objectContaining({
            connectionId: 'source-1',
            databaseName: 'SourceDb',
            provider: 'sqlserver'
          }),
          target: expect.objectContaining({
            connectionId: 'target-1',
            databaseName: 'TargetDb',
            provider: 'postgres'
          }),
          scopeKeys: expect.arrayContaining(['schema.tablesCoreConstraints', 'data.keyMatchedSets']),
          tableKeyMappings: [
            {
              sourceTable: 'dbo.Customers',
              targetTable: 'public.customers',
              sourceColumns: ['CustomerId', 'RegionId'],
              targetColumns: ['customer_id', 'region_id']
            }
          ]
        })
      )
    })
  })

  it('creates a nested connection and auto-selects it for the active side', async () => {
    const user = userEvent.setup()
    vi.spyOn(window.api.connections, 'create').mockResolvedValue({
      id: 'created-1',
      name: 'Created Connection',
      provider: 'mysql',
      host: 'localhost',
      port: 3306,
      username: 'root',
      password: '',
      rememberPassword: false,
      defaultDatabase: 'NewDb'
    })
    onSave.mockResolvedValue(undefined)

    render(
      <ComparisonDialog
        connections={[]}
        environments={ENVIRONMENTS}
        onCancel={onCancel}
        onSave={onSave}
        onConnectionCreated={onConnectionCreated}
      />
    )

    await user.click(screen.getAllByText('compare.dialog.actions.newConnection')[0])
    await user.type(screen.getByLabelText('explorer.dialog.fields.name'), 'Created Connection')
    await user.selectOptions(screen.getByLabelText('explorer.dialog.fields.provider'), 'mysql')
    await user.type(screen.getByLabelText('explorer.dialog.fields.host'), 'localhost')
    await user.clear(screen.getByLabelText('explorer.dialog.fields.port'))
    await user.type(screen.getByLabelText('explorer.dialog.fields.port'), '3306')
    await user.type(screen.getByLabelText('explorer.dialog.fields.username'), 'root')
    await user.type(screen.getByLabelText('explorer.dialog.fields.defaultDatabase'), 'NewDb')
    await user.click(screen.getByText('explorer.dialog.actions.save'))

    await waitFor(() => {
      expect(onConnectionCreated).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'created-1', name: 'Created Connection' })
      )
    })

    const sourceConnectionSelect = screen.getAllByLabelText('compare.dialog.fields.connection')[0] as HTMLSelectElement
    expect(sourceConnectionSelect.value).toBe('created-1')
  })

  it('swaps source and target when the swap button is clicked', async () => {
    const user = userEvent.setup()

    render(
      <ComparisonDialog
        connections={CONNECTIONS}
        environments={ENVIRONMENTS}
        onCancel={onCancel}
        onSave={onSave}
        onConnectionCreated={onConnectionCreated}
      />
    )

    const [sourceSelect, targetSelect] = screen.getAllByLabelText('compare.dialog.fields.connection') as HTMLSelectElement[]
    await user.selectOptions(sourceSelect, 'source-1')
    await user.selectOptions(targetSelect, 'target-1')

    await waitFor(() => {
      expect(sourceSelect.value).toBe('source-1')
      expect(targetSelect.value).toBe('target-1')
    })

    await user.click(screen.getByRole('button', { name: 'compare.dialog.actions.swapEndpoints' }))

    expect(sourceSelect.value).toBe('target-1')
    expect(targetSelect.value).toBe('source-1')

    await waitFor(() => {
      expect(getEndpointSection('compare.dialog.sections.source').style.getPropertyValue('--compare-dialog-endpoint-border')).toBe('#ff3b30')
      expect(getEndpointSection('compare.dialog.sections.target').style.getPropertyValue('--compare-dialog-endpoint-border')).toBe('#2e7d32')
    })
  })

  it('applies environment border colors independently for source and target endpoints', async () => {
    const user = userEvent.setup()

    render(
      <ComparisonDialog
        connections={CONNECTIONS}
        environments={ENVIRONMENTS}
        onCancel={onCancel}
        onSave={onSave}
        onConnectionCreated={onConnectionCreated}
      />
    )

    const [sourceSelect, targetSelect] = screen.getAllByLabelText('compare.dialog.fields.connection') as HTMLSelectElement[]

    await user.selectOptions(sourceSelect, 'source-1')
    await user.selectOptions(targetSelect, 'target-1')

    await waitFor(() => {
      expect(getEndpointSection('compare.dialog.sections.source').style.getPropertyValue('--compare-dialog-endpoint-border')).toBe('#2e7d32')
      expect(getEndpointSection('compare.dialog.sections.target').style.getPropertyValue('--compare-dialog-endpoint-border')).toBe('#ff3b30')
    })
  })

  it('removes the custom endpoint border color when the selected connection has no environment', async () => {
    const user = userEvent.setup()

    render(
      <ComparisonDialog
        connections={CONNECTIONS}
        environments={ENVIRONMENTS}
        onCancel={onCancel}
        onSave={onSave}
        onConnectionCreated={onConnectionCreated}
      />
    )

    const sourceSelect = screen.getAllByLabelText('compare.dialog.fields.connection')[0] as HTMLSelectElement
    const sourceSection = getEndpointSection('compare.dialog.sections.source')

    await user.selectOptions(sourceSelect, 'source-1')

    await waitFor(() => {
      expect(sourceSection.style.getPropertyValue('--compare-dialog-endpoint-border')).toBe('#2e7d32')
    })

    await user.selectOptions(sourceSelect, 'neutral-1')

    await waitFor(() => {
      expect(sourceSection.style.getPropertyValue('--compare-dialog-endpoint-border')).toBe('')
    })
  })
})
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const localStorageState = new Map<string, string>()

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => localStorageState.get(key) ?? null,
    setItem: (key: string, value: string) => {
      localStorageState.set(key, value)
    },
    removeItem: (key: string) => {
      localStorageState.delete(key)
    },
    clear: () => {
      localStorageState.clear()
    }
  }
})

vi.mock('react-i18next', () => ({
  initReactI18next: {
    type: '3rdParty',
    init: () => {}
  },
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}:${JSON.stringify(opts)}` : key
  })
}))

const mockChangeLanguage = vi.fn()

vi.mock('../../i18n', () => ({
  default: {
    language: 'en',
    changeLanguage: mockChangeLanguage
  }
}))

const mockUpdateSetting = vi.fn()
const mockResetSettings = vi.fn()

const defaultEnvironments = [
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
    description: 'Quality assurance and pre-release validation.',
    critical: false,
    color: '#2e7d32'
  },
  {
    id: 'development',
    name: 'Development',
    description: 'Local development and internal testing.',
    critical: false,
    color: '#6b7280'
  }
]

const mockSettings = {
  language: 'en',
  theme: 'dark' as const,
  showSideNavigationBar: true,
  syntaxHighlighting: true,
  showGridLines: false,
  fontScaling: 100,
  queryTimeout: 30,
  showSystemDatabases: false,
  selectTopRowsCount: 1000,
  defaultErdBackground: 'dots' as const,
  autoIncludeExecutionPlan: false,
  autoIncludeClientStatistics: false,
  customTitlebar: true,
  enableAnimations: true,
  uppercaseColumnHeaders: false,
  showKeyIconsInResults: false,
  useInteractiveTables: false,
  environments: defaultEnvironments,
  likeConfetti: false,
  showTipsAndTricks: true,
  glassEffectHour: -1
}

vi.mock('../useSettings', () => ({
  useSettings: () => ({
    settings: mockSettings,
    updateSetting: mockUpdateSetting,
    resetSettings: mockResetSettings
  })
}))

const mockTriggerConfetti = vi.fn()

vi.mock('../../../contexts/ConfettiContext', () => ({
  useConfettiContext: () => ({
    triggerConfetti: mockTriggerConfetti,
    bursts: []
  })
}))

const mockCheckForUpdates = vi.fn()
let mockUpdateStatus = 'idle'
let mockCurrentVersion = '1.0.0'

vi.mock('../../../contexts/UpdateContext', () => ({
  useUpdateContext: () => ({
    status: mockUpdateStatus,
    currentVersion: mockCurrentVersion,
    checkForUpdates: mockCheckForUpdates
  })
}))

const mockPreviewTip = vi.fn()

vi.mock('../../../contexts/TipsContext', () => ({
  useTipsContext: () => ({
    activeTip: null,
    dismissTip: vi.fn(),
    previewTip: mockPreviewTip,
    notifyNavigation: vi.fn()
  })
}))

const { default: GeneralSettings } = await import('../GeneralSettings')

describe('GeneralSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSettings.environments = defaultEnvironments.map((environment) => ({ ...environment }))
    mockSettings.likeConfetti = false
    mockUpdateStatus = 'idle'
    mockCurrentVersion = '1.0.0'
  })

  afterEach(() => {
    cleanup()
  })

  it('renders the Manage Environments card', () => {
    render(<GeneralSettings />)

    expect(screen.getByText('settings.general.environments.label')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'settings.general.environments.manage' })).toBeInTheDocument()
  })

  it('opens the environments dialog and shows the seeded environments', async () => {
    const user = userEvent.setup()
    render(<GeneralSettings />)

    await user.click(screen.getByRole('button', { name: 'settings.general.environments.manage' }))

    expect(screen.getByRole('dialog', { name: 'settings.general.environments.dialogTitle' })).toBeInTheDocument()
    expect(screen.getByText('Production')).toBeInTheDocument()
    expect(screen.getByText('QA')).toBeInTheDocument()
    expect(screen.getByText('Development')).toBeInTheDocument()
  })

  it('creates a new environment', async () => {
    const user = userEvent.setup()
    render(<GeneralSettings />)

    await user.click(screen.getByRole('button', { name: 'settings.general.environments.manage' }))
    await user.click(screen.getByRole('button', { name: 'settings.general.environments.actions.add' }))
    await user.type(screen.getByLabelText('settings.general.environments.fields.name'), 'Staging')
    await user.type(
      screen.getByLabelText('settings.general.environments.fields.description'),
      'Pre-production verification'
    )
    await user.click(screen.getByRole('button', { name: 'settings.general.environments.actions.create' }))

    expect(mockUpdateSetting).toHaveBeenCalledWith(
      'environments',
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Staging',
          description: 'Pre-production verification',
          critical: false
        })
      ])
    )
  })

  it('prevents duplicate environment names', async () => {
    const user = userEvent.setup()
    render(<GeneralSettings />)

    await user.click(screen.getByRole('button', { name: 'settings.general.environments.manage' }))
    await user.click(screen.getByRole('button', { name: 'settings.general.environments.actions.add' }))
    await user.type(screen.getByLabelText('settings.general.environments.fields.name'), 'production')
    await user.click(screen.getByRole('button', { name: 'settings.general.environments.actions.create' }))

    expect(mockUpdateSetting).not.toHaveBeenCalledWith(
      'environments',
      expect.arrayContaining([expect.objectContaining({ name: 'production' })])
    )
    expect(screen.getByText('settings.general.environments.validation.nameUnique')).toBeInTheDocument()
  })

  it('updates an existing environment', async () => {
    const user = userEvent.setup()
    render(<GeneralSettings />)

    await user.click(screen.getByRole('button', { name: 'settings.general.environments.manage' }))
    await user.clear(screen.getByLabelText('settings.general.environments.fields.name'))
    await user.type(screen.getByLabelText('settings.general.environments.fields.name'), 'Prod EU')
    await user.click(screen.getByRole('button', { name: 'settings.general.environments.actions.update' }))

    expect(mockUpdateSetting).toHaveBeenCalledWith(
      'environments',
      expect.arrayContaining([
        expect.objectContaining({ id: 'production', name: 'Prod EU' })
      ])
    )
  })

  it('clears assigned connections before deleting an in-use environment', async () => {
    const user = userEvent.setup()
    const getAll = vi.spyOn(window.api.connections, 'getAll').mockResolvedValue([
      {
        id: 'connection-1',
        name: 'Prod DB',
        provider: 'sqlserver',
        host: 'localhost',
        port: 1433,
        username: 'sa',
        password: '',
        rememberPassword: false,
        defaultDatabase: 'master',
        environmentId: 'production'
      }
    ])
    const update = vi.spyOn(window.api.connections, 'update').mockResolvedValue({
      id: 'connection-1',
      name: 'Prod DB',
      provider: 'sqlserver',
      host: 'localhost',
      port: 1433,
      username: 'sa',
      password: '',
      rememberPassword: false,
      defaultDatabase: 'master'
    })
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')

    render(<GeneralSettings />)

    await user.click(screen.getByRole('button', { name: 'settings.general.environments.manage' }))
    await user.click(screen.getAllByRole('button', { name: 'settings.general.environments.actions.delete' })[0])

    await waitFor(() => screen.getByRole('dialog', { name: 'settings.general.environments.deleteInUse.title' }))
    await user.click(screen.getByText('confirmDialog.delete'))

    await waitFor(() => {
      expect(getAll).toHaveBeenCalledOnce()
      expect(update).toHaveBeenCalledWith(expect.objectContaining({ environmentId: undefined }))
      expect(mockUpdateSetting).toHaveBeenCalledWith(
        'environments',
        expect.not.arrayContaining([expect.objectContaining({ id: 'production' })])
      )
      expect(dispatchSpy).toHaveBeenCalled()
    })
  })

  it('renders the default connection sort row', () => {
    render(<GeneralSettings />)
    expect(screen.getByText('settings.general.defaultConnectionSort.label')).toBeInTheDocument()
  })

  it('default sort field select defaults to "name" when setting is absent', () => {
    render(<GeneralSettings />)
    const selects = screen.getAllByRole('combobox', { name: 'settings.general.defaultConnectionSort.label' })
    expect(selects[0]).toHaveTextContent('settings.general.defaultConnectionSort.fields.name')
  })

  it('default sort direction select defaults to "asc" when setting is absent', () => {
    render(<GeneralSettings />)
    const selects = screen.getAllByRole('combobox', { name: 'settings.general.defaultConnectionSort.label' })
    expect(selects[1]).toHaveTextContent('settings.general.defaultConnectionSort.directions.asc')
  })

  it('calls updateSetting with new field when sort field changes', async () => {
    const user = userEvent.setup()
    render(<GeneralSettings />)
    const selects = screen.getAllByRole('combobox', { name: 'settings.general.defaultConnectionSort.label' })
    await user.click(selects[0])
    await user.click(screen.getByRole('option', { name: 'settings.general.defaultConnectionSort.fields.createdAt' }))
    expect(mockUpdateSetting).toHaveBeenCalledWith('defaultConnectionSort', { field: 'createdAt', direction: 'asc' })
  })

  it('calls updateSetting with new direction when sort direction changes', async () => {
    const user = userEvent.setup()
    render(<GeneralSettings />)
    const selects = screen.getAllByRole('combobox', { name: 'settings.general.defaultConnectionSort.label' })
    await user.click(selects[1])
    await user.click(screen.getByRole('option', { name: 'settings.general.defaultConnectionSort.directions.desc' }))
    expect(mockUpdateSetting).toHaveBeenCalledWith('defaultConnectionSort', { field: 'name', direction: 'desc' })
  })

  it('renders the "I like confetti" toggle', () => {
    render(<GeneralSettings />)
    expect(screen.getByText('settings.general.likeConfetti.label')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'settings.general.likeConfetti.label' })).toBeInTheDocument()
  })

  it('calls updateSetting and triggers confetti when the toggle is switched on', async () => {
    const user = userEvent.setup()
    render(<GeneralSettings />)
    const checkbox = screen.getByRole('checkbox', { name: 'settings.general.likeConfetti.label' })
    await user.click(checkbox)
    expect(mockUpdateSetting).toHaveBeenCalledWith('likeConfetti', true)
    expect(mockTriggerConfetti).toHaveBeenCalledOnce()
  })

  it('calls updateSetting but does not trigger confetti when the toggle is switched off', async () => {
    mockSettings.likeConfetti = true
    const user = userEvent.setup()
    render(<GeneralSettings />)
    const checkbox = screen.getByRole('checkbox', { name: 'settings.general.likeConfetti.label' })
    await user.click(checkbox)
    expect(mockUpdateSetting).toHaveBeenCalledWith('likeConfetti', false)
    expect(mockTriggerConfetti).not.toHaveBeenCalled()
  })

  describe('Application update card', () => {
    it('renders the update card with the current version and action buttons', () => {
      mockCurrentVersion = '2.3.4'
      render(<GeneralSettings />)

      expect(screen.getByText('settings.general.appUpdate.label')).toBeInTheDocument()
      expect(screen.getByText('settings.general.appUpdate.desc')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'settings.general.appUpdate.checkButton' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'settings.general.appUpdate.releaseNotesButton' })).toBeInTheDocument()
    })

    it('calls checkForUpdates when Check for Updates is clicked', async () => {
      const user = userEvent.setup()
      render(<GeneralSettings />)

      await user.click(screen.getByRole('button', { name: 'settings.general.appUpdate.checkButton' }))

      expect(mockCheckForUpdates).toHaveBeenCalledOnce()
    })

    it('disables the Check for Updates button while checking', () => {
      mockUpdateStatus = 'checking'
      render(<GeneralSettings />)

      const button = screen.getByRole('button', { name: 'settings.general.appUpdate.checking' })
      expect(button).toBeDisabled()
    })

    it('opens the Release Notes dialog when Release Notes is clicked', async () => {
      const user = userEvent.setup()
      render(<GeneralSettings />)

      await user.click(screen.getByRole('button', { name: 'settings.general.appUpdate.releaseNotesButton' }))

      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })
  })
})

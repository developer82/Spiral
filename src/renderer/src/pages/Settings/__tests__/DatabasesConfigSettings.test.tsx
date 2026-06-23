import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import DatabasesConfigSettings from '../DatabasesConfigSettings'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}:${JSON.stringify(opts)}` : key
  })
}))

const mockUpdateSetting = vi.fn()
const mockResetSettings = vi.fn()

vi.mock('../useSettings', () => ({
  useSettings: () => ({
    settings: {
      language: 'en',
      theme: 'dark',
      syntaxHighlighting: true,
      showGridLines: false,
      fontScaling: 100,
      queryTimeout: 30,
      showSystemDatabases: false,
      selectTopRowsCount: 1000,
      autoIncludeExecutionPlan: false,
      autoIncludeClientStatistics: false,
      askBeforeIncludingSecretsInComparisonExport: true,
      includeSecretsInComparisonExportByDefault: false,
      copyJsonFormatted: true,
      glassEffectHour: -1
    },
    updateSetting: mockUpdateSetting,
    resetSettings: mockResetSettings
  })
}))

describe('DatabasesConfigSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  // ── Rendering ─────────────────────────────────────────────────────────────

  it('renders the section title and subtitle', () => {
    render(<DatabasesConfigSettings />)

    expect(screen.getByText('settings.databasesConfig.title')).toBeInTheDocument()
    expect(screen.getByText('settings.databasesConfig.subtitle')).toBeInTheDocument()
  })

  it('renders the Reset Defaults button', () => {
    render(<DatabasesConfigSettings />)

    expect(screen.getByRole('button', { name: /settings\.resetDefaults/i })).toBeInTheDocument()
  })

  it('renders the Query Defaults section heading', () => {
    render(<DatabasesConfigSettings />)

    expect(screen.getByText('settings.databasesConfig.queryDefaults')).toBeInTheDocument()
  })

  it('renders the query timeout select', () => {
    render(<DatabasesConfigSettings />)

    expect(
      screen.getByRole('combobox', { name: 'settings.databasesConfig.queryTimeout.label' })
    ).toBeInTheDocument()
  })

  it('reflects the current queryTimeout setting as selected value', () => {
    render(<DatabasesConfigSettings />)

    const select = screen.getByRole('combobox', {
      name: 'settings.databasesConfig.queryTimeout.label'
    })

    expect(select).toHaveTextContent('settings.databasesConfig.queryTimeout.seconds:{"count":30}')
  })

  // ── Interactions ──────────────────────────────────────────────────────────

  it('calls updateSetting with "queryTimeout" when timeout select changes', async () => {
    const user = userEvent.setup()
    render(<DatabasesConfigSettings />)

    const select = screen.getByRole('combobox', {
      name: 'settings.databasesConfig.queryTimeout.label'
    })

    await user.click(select)
    await user.click(screen.getByRole('option', {
      name: 'settings.databasesConfig.queryTimeout.seconds:{"count":60}'
    }))

    expect(mockUpdateSetting).toHaveBeenCalledWith('queryTimeout', 60)
  })

  it('calls resetSettings when Reset Defaults is clicked', async () => {
    const user = userEvent.setup()
    render(<DatabasesConfigSettings />)

    await user.click(screen.getByRole('button', { name: /settings\.resetDefaults/i }))

    expect(mockResetSettings).toHaveBeenCalledOnce()
  })

  it('renders the Explorer section heading', () => {
    render(<DatabasesConfigSettings />)

    expect(screen.getByText('settings.databasesConfig.explorer')).toBeInTheDocument()
  })

  it('renders the Show System Databases toggle', () => {
    render(<DatabasesConfigSettings />)

    expect(
      screen.getByRole('checkbox', { name: 'settings.databasesConfig.showSystemDatabases.label' })
    ).toBeInTheDocument()
  })

  it('reflects the current showSystemDatabases setting on the toggle', () => {
    render(<DatabasesConfigSettings />)

    const toggle = screen.getByRole('checkbox', {
      name: 'settings.databasesConfig.showSystemDatabases.label'
    }) as HTMLInputElement

    expect(toggle.checked).toBe(false)
  })

  it('calls updateSetting with "showSystemDatabases" when toggle is clicked', async () => {
    const user = userEvent.setup()
    render(<DatabasesConfigSettings />)

    await user.click(
      screen.getByRole('checkbox', {
        name: 'settings.databasesConfig.showSystemDatabases.label'
      })
    )

    expect(mockUpdateSetting).toHaveBeenCalledWith('showSystemDatabases', true)
  })

  it('renders the Select Top Rows Count number input', () => {
    render(<DatabasesConfigSettings />)

    expect(
      screen.getByRole('spinbutton', { name: 'settings.databasesConfig.selectTopRowsCount.label' })
    ).toBeInTheDocument()
  })

  it('reflects the current selectTopRowsCount setting on the number input', () => {
    render(<DatabasesConfigSettings />)

    const input = screen.getByRole('spinbutton', {
      name: 'settings.databasesConfig.selectTopRowsCount.label'
    }) as HTMLInputElement

    expect(input.value).toBe('1000')
  })

  it('calls updateSetting with "selectTopRowsCount" when the number input changes', async () => {
    render(<DatabasesConfigSettings />)

    const input = screen.getByRole('spinbutton', {
      name: 'settings.databasesConfig.selectTopRowsCount.label'
    })

    fireEvent.change(input, { target: { value: '500' } })

    expect(mockUpdateSetting).toHaveBeenLastCalledWith('selectTopRowsCount', 500)
  })

  it('does not call updateSetting when selectTopRowsCount input is set to 0 or less', async () => {
    render(<DatabasesConfigSettings />)

    const input = screen.getByRole('spinbutton', {
      name: 'settings.databasesConfig.selectTopRowsCount.label'
    })

    fireEvent.change(input, { target: { value: '0' } })

    const calls = mockUpdateSetting.mock.calls.filter(([key]) => key === 'selectTopRowsCount')
    expect(calls.every(([, val]) => val >= 1)).toBe(true)
  })

  // ── Auto Include Execution Plan ────────────────────────────────────────────

  it('renders the Query Execution section heading', () => {
    render(<DatabasesConfigSettings />)
    expect(screen.getByText('settings.databasesConfig.queryExecution')).toBeInTheDocument()
  })

  it('renders the Auto Include Execution Plan toggle', () => {
    render(<DatabasesConfigSettings />)
    expect(
      screen.getByRole('checkbox', {
        name: 'settings.databasesConfig.autoIncludeExecutionPlan.label'
      })
    ).toBeInTheDocument()
  })

  it('reflects the current autoIncludeExecutionPlan setting on the toggle', () => {
    render(<DatabasesConfigSettings />)
    const toggle = screen.getByRole('checkbox', {
      name: 'settings.databasesConfig.autoIncludeExecutionPlan.label'
    }) as HTMLInputElement
    expect(toggle.checked).toBe(false)
  })

  it('calls updateSetting with "autoIncludeExecutionPlan" when toggle is clicked', async () => {
    const user = userEvent.setup()
    render(<DatabasesConfigSettings />)

    await user.click(
      screen.getByRole('checkbox', {
        name: 'settings.databasesConfig.autoIncludeExecutionPlan.label'
      })
    )

    expect(mockUpdateSetting).toHaveBeenCalledWith('autoIncludeExecutionPlan', true)
  })

  // ── Auto Include Client Statistics ────────────────────────────────────────

  it('renders the Auto Include Client Statistics toggle', () => {
    render(<DatabasesConfigSettings />)
    expect(
      screen.getByRole('checkbox', {
        name: 'settings.databasesConfig.autoIncludeClientStatistics.label'
      })
    ).toBeInTheDocument()
  })

  it('reflects the current autoIncludeClientStatistics setting on the toggle', () => {
    render(<DatabasesConfigSettings />)
    const toggle = screen.getByRole('checkbox', {
      name: 'settings.databasesConfig.autoIncludeClientStatistics.label'
    }) as HTMLInputElement
    expect(toggle.checked).toBe(false)
  })

  it('calls updateSetting with "autoIncludeClientStatistics" when toggle is clicked', async () => {
    const user = userEvent.setup()
    render(<DatabasesConfigSettings />)

    await user.click(
      screen.getByRole('checkbox', {
        name: 'settings.databasesConfig.autoIncludeClientStatistics.label'
      })
    )

    expect(mockUpdateSetting).toHaveBeenCalledWith('autoIncludeClientStatistics', true)
  })

  // ── Comparison Export ─────────────────────────────────────────────────────

  it('renders the Comparison Export section heading', () => {
    render(<DatabasesConfigSettings />)
    expect(screen.getByText('settings.databasesConfig.comparisonExport')).toBeInTheDocument()
  })

  it('renders the Ask Before Including Secrets toggle', () => {
    render(<DatabasesConfigSettings />)
    expect(
      screen.getByRole('checkbox', {
        name: 'settings.databasesConfig.askBeforeIncludingSecrets.label'
      })
    ).toBeInTheDocument()
  })

  it('reflects the current askBeforeIncludingSecretsInComparisonExport setting on the toggle', () => {
    render(<DatabasesConfigSettings />)
    const toggle = screen.getByRole('checkbox', {
      name: 'settings.databasesConfig.askBeforeIncludingSecrets.label'
    }) as HTMLInputElement
    expect(toggle.checked).toBe(true)
  })

  it('calls updateSetting with "askBeforeIncludingSecretsInComparisonExport" when toggle is clicked', async () => {
    const user = userEvent.setup()
    render(<DatabasesConfigSettings />)

    await user.click(
      screen.getByRole('checkbox', {
        name: 'settings.databasesConfig.askBeforeIncludingSecrets.label'
      })
    )

    expect(mockUpdateSetting).toHaveBeenCalledWith('askBeforeIncludingSecretsInComparisonExport', false)
  })

  it('renders the Include Secrets by Default toggle', () => {
    render(<DatabasesConfigSettings />)
    expect(
      screen.getByRole('checkbox', {
        name: 'settings.databasesConfig.includeSecretsByDefault.label'
      })
    ).toBeInTheDocument()
  })

  it('reflects the current includeSecretsInComparisonExportByDefault setting on the toggle', () => {
    render(<DatabasesConfigSettings />)
    const toggle = screen.getByRole('checkbox', {
      name: 'settings.databasesConfig.includeSecretsByDefault.label'
    }) as HTMLInputElement
    expect(toggle.checked).toBe(false)
  })

  it('calls updateSetting with "includeSecretsInComparisonExportByDefault" when toggle is clicked', async () => {
    const user = userEvent.setup()
    render(<DatabasesConfigSettings />)

    await user.click(
      screen.getByRole('checkbox', {
        name: 'settings.databasesConfig.includeSecretsByDefault.label'
      })
    )

    expect(mockUpdateSetting).toHaveBeenCalledWith('includeSecretsInComparisonExportByDefault', true)
  })

  // ── JSON Results ──────────────────────────────────────────────────────────

  it('renders the JSON Results section heading', () => {
    render(<DatabasesConfigSettings />)
    expect(screen.getByText('settings.databasesConfig.jsonResults')).toBeInTheDocument()
  })

  it('renders the Copy JSON as Formatted Text toggle', () => {
    render(<DatabasesConfigSettings />)
    expect(
      screen.getByRole('checkbox', {
        name: 'settings.databasesConfig.copyJsonFormatted.label'
      })
    ).toBeInTheDocument()
  })

  it('reflects the current copyJsonFormatted setting on the toggle', () => {
    render(<DatabasesConfigSettings />)
    const toggle = screen.getByRole('checkbox', {
      name: 'settings.databasesConfig.copyJsonFormatted.label'
    }) as HTMLInputElement
    expect(toggle.checked).toBe(true)
  })

  it('calls updateSetting with "copyJsonFormatted" when toggle is clicked', async () => {
    const user = userEvent.setup()
    render(<DatabasesConfigSettings />)

    await user.click(
      screen.getByRole('checkbox', {
        name: 'settings.databasesConfig.copyJsonFormatted.label'
      })
    )

    expect(mockUpdateSetting).toHaveBeenCalledWith('copyJsonFormatted', false)
  })
})

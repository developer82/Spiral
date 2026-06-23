import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import ResultsViewConfigSettings from '../ResultsViewConfigSettings'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key
  })
}))

const mockUpdateSetting = vi.fn()
const mockResetSettings = vi.fn()

const defaultSettings = {
  uppercaseColumnHeaders: false,
  showKeyIconsInResults: false,
  useInteractiveTables: false
}

vi.mock('../useSettings', () => ({
  useSettings: () => ({
    settings: defaultSettings,
    updateSetting: mockUpdateSetting,
    resetSettings: mockResetSettings
  })
}))

describe('ResultsViewConfigSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  // ── Rendering ─────────────────────────────────────────────────────────────

  it('renders the section title and subtitle', () => {
    render(<ResultsViewConfigSettings />)

    expect(screen.getByText('settings.resultsViewConfig.title')).toBeInTheDocument()
    expect(screen.getByText('settings.resultsViewConfig.subtitle')).toBeInTheDocument()
  })

  it('renders the Column Headers section heading', () => {
    render(<ResultsViewConfigSettings />)

    expect(screen.getByText('settings.resultsViewConfig.columnHeaders')).toBeInTheDocument()
  })

  it('renders the Uppercase Column Headers toggle', () => {
    render(<ResultsViewConfigSettings />)

    expect(
      screen.getByRole('checkbox', {
        name: 'settings.resultsViewConfig.uppercaseColumnHeaders.label'
      })
    ).toBeInTheDocument()
  })

  it('renders the Show Key Icons in Results toggle', () => {
    render(<ResultsViewConfigSettings />)

    expect(
      screen.getByRole('checkbox', {
        name: 'settings.resultsViewConfig.showKeyIconsInResults.label'
      })
    ).toBeInTheDocument()
  })

  it('renders the Table Options section heading', () => {
    render(<ResultsViewConfigSettings />)

    expect(screen.getByText('settings.resultsViewConfig.tableOptions')).toBeInTheDocument()
  })

  it('renders the Use Interactive Tables toggle', () => {
    render(<ResultsViewConfigSettings />)

    expect(
      screen.getByRole('checkbox', {
        name: 'settings.resultsViewConfig.useInteractiveTables.label'
      })
    ).toBeInTheDocument()
  })

  it('renders Use Interactive Tables label and description', () => {
    render(<ResultsViewConfigSettings />)

    expect(
      screen.getByText('settings.resultsViewConfig.useInteractiveTables.label')
    ).toBeInTheDocument()
    expect(
      screen.getByText('settings.resultsViewConfig.useInteractiveTables.desc')
    ).toBeInTheDocument()
  })

  it('reflects the current useInteractiveTables setting (unchecked)', () => {
    render(<ResultsViewConfigSettings />)

    const toggle = screen.getByRole('checkbox', {
      name: 'settings.resultsViewConfig.useInteractiveTables.label'
    }) as HTMLInputElement

    expect(toggle.checked).toBe(false)
  })

  // ── Interactions ──────────────────────────────────────────────────────────

  it('calls updateSetting with "useInteractiveTables" when the toggle is clicked', async () => {
    const user = userEvent.setup()
    render(<ResultsViewConfigSettings />)

    const toggle = screen.getByRole('checkbox', {
      name: 'settings.resultsViewConfig.useInteractiveTables.label'
    })

    await user.click(toggle)

    expect(mockUpdateSetting).toHaveBeenCalledWith('useInteractiveTables', true)
  })

  it('calls updateSetting with "uppercaseColumnHeaders" when its toggle is clicked', async () => {
    const user = userEvent.setup()
    render(<ResultsViewConfigSettings />)

    const toggle = screen.getByRole('checkbox', {
      name: 'settings.resultsViewConfig.uppercaseColumnHeaders.label'
    })

    await user.click(toggle)

    expect(mockUpdateSetting).toHaveBeenCalledWith('uppercaseColumnHeaders', true)
  })

  it('calls updateSetting with "showKeyIconsInResults" when its toggle is clicked', async () => {
    const user = userEvent.setup()
    render(<ResultsViewConfigSettings />)

    const toggle = screen.getByRole('checkbox', {
      name: 'settings.resultsViewConfig.showKeyIconsInResults.label'
    })

    await user.click(toggle)

    expect(mockUpdateSetting).toHaveBeenCalledWith('showKeyIconsInResults', true)
  })
})

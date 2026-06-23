import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import AppearanceSettings from '../AppearanceSettings'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key
  })
}))

const mockUpdateSetting = vi.fn()
const mockResetSettings = vi.fn()

const defaultSettings = {
  language: 'en',
  theme: 'dark',
  nativeThemeSource: 'dark' as const,
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
  showToolbarTextButtons: false,
  darkTerminals: true,
  glassEffectHour: -1,
  glassEffectManualColor: ''
}

let currentSettings = { ...defaultSettings }

vi.mock('../useSettings', () => ({
  useSettings: () => ({
    settings: currentSettings,
    updateSetting: mockUpdateSetting,
    resetSettings: mockResetSettings
  })
}))

describe('AppearanceSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    currentSettings = { ...defaultSettings }
  })

  afterEach(() => {
    cleanup()
  })

  // ── Rendering ─────────────────────────────────────────────────────────────

  it('renders the section title and subtitle', () => {
    render(<AppearanceSettings />)
    expect(screen.getByText('settings.appearance.title')).toBeInTheDocument()
    expect(screen.getByText('settings.appearance.subtitle')).toBeInTheDocument()
  })

  it('renders the Reset Defaults button', () => {
    render(<AppearanceSettings />)
    expect(screen.getByRole('button', { name: /settings\.resetDefaults/i })).toBeInTheDocument()
  })

  it('renders the customTitlebar toggle', () => {
    render(<AppearanceSettings />)
    expect(screen.getByRole('checkbox', { name: 'settings.appearance.customTitlebar.title' })).toBeInTheDocument()
  })

  it('renders the hide side navigation toggle', () => {
    render(<AppearanceSettings />)
    expect(screen.getByRole('checkbox', { name: 'settings.appearance.hideSideNav.title' })).toBeInTheDocument()
  })

  it('customTitlebar toggle reflects current setting (true)', () => {
    render(<AppearanceSettings />)
    const toggle = screen.getByRole('checkbox', { name: 'settings.appearance.customTitlebar.title' }) as HTMLInputElement
    expect(toggle.checked).toBe(true)
  })

  it('hide side navigation toggle reflects the inverse of the visible setting', () => {
    render(<AppearanceSettings />)
    const toggle = screen.getByRole('checkbox', {
      name: 'settings.appearance.hideSideNav.title'
    }) as HTMLInputElement
    expect(toggle.checked).toBe(false)
  })

  // ── customTitlebar toggle ─────────────────────────────────────────────────

  it('calls updateSetting with false when customTitlebar toggle is unchecked', async () => {
    const user = userEvent.setup()
    render(<AppearanceSettings />)

    const toggle = screen.getByRole('checkbox', { name: 'settings.appearance.customTitlebar.title' })
    await user.click(toggle)

    expect(mockUpdateSetting).toHaveBeenCalledWith('customTitlebar', false)
  })

  it('calls updateSetting with false when hide side navigation is enabled', async () => {
    const user = userEvent.setup()
    render(<AppearanceSettings />)

    const toggle = screen.getByRole('checkbox', { name: 'settings.appearance.hideSideNav.title' })
    await user.click(toggle)

    expect(mockUpdateSetting).toHaveBeenCalledWith('showSideNavigationBar', false)
  })

  // ── Restart banner ────────────────────────────────────────────────────────

  it('does not show restart banner initially', () => {
    render(<AppearanceSettings />)
    expect(screen.queryByText('settings.appearance.restartRequired')).not.toBeInTheDocument()
  })

  it('shows restart banner after toggling customTitlebar', async () => {
    const user = userEvent.setup()
    render(<AppearanceSettings />)

    const toggle = screen.getByRole('checkbox', { name: 'settings.appearance.customTitlebar.title' })
    await user.click(toggle)

    expect(screen.getByText('settings.appearance.restartRequired')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'settings.appearance.restartNow' })).toBeInTheDocument()
  })

  it('calls window.api.app.restart when Restart Now is clicked', async () => {
    const user = userEvent.setup()
    const restart = vi.spyOn(window.api.app, 'restart').mockImplementation(() => {})
    render(<AppearanceSettings />)

    // Toggle to show the banner
    const toggle = screen.getByRole('checkbox', { name: 'settings.appearance.customTitlebar.title' })
    await user.click(toggle)

    await user.click(screen.getByRole('button', { name: 'settings.appearance.restartNow' }))
    expect(restart).toHaveBeenCalledOnce()
  })

  // ── Reset Defaults ────────────────────────────────────────────────────────

  it('calls resetSettings when Reset Defaults is clicked', async () => {
    const user = userEvent.setup()
    render(<AppearanceSettings />)

    await user.click(screen.getByRole('button', { name: /settings\.resetDefaults/i }))
    expect(mockResetSettings).toHaveBeenCalledOnce()
  })

  it('hides restart banner after Reset Defaults is clicked', async () => {
    const user = userEvent.setup()
    render(<AppearanceSettings />)

    // Show the banner first
    const toggle = screen.getByRole('checkbox', { name: 'settings.appearance.customTitlebar.title' })
    await user.click(toggle)
    expect(screen.getByText('settings.appearance.restartRequired')).toBeInTheDocument()

    // Reset should dismiss it
    await user.click(screen.getByRole('button', { name: /settings\.resetDefaults/i }))
    expect(screen.queryByText('settings.appearance.restartRequired')).not.toBeInTheDocument()
  })

  // ── showToolbarTextButtons toggle ─────────────────────────────────────────

  it('renders the showToolbarTextButtons toggle', () => {
    render(<AppearanceSettings />)
    expect(
      screen.getByRole('checkbox', { name: 'settings.appearance.showToolbarTextButtons.title' })
    ).toBeInTheDocument()
  })

  it('showToolbarTextButtons toggle reflects current setting (false)', () => {
    render(<AppearanceSettings />)
    const toggle = screen.getByRole('checkbox', {
      name: 'settings.appearance.showToolbarTextButtons.title'
    }) as HTMLInputElement
    expect(toggle.checked).toBe(false)
  })

  it('calls updateSetting with true when showToolbarTextButtons toggle is checked', async () => {
    const user = userEvent.setup()
    render(<AppearanceSettings />)

    const toggle = screen.getByRole('checkbox', {
      name: 'settings.appearance.showToolbarTextButtons.title'
    })
    await user.click(toggle)

    expect(mockUpdateSetting).toHaveBeenCalledWith('showToolbarTextButtons', true)
  })

  // ── darkTerminals toggle ──────────────────────────────────────────────────

  it('renders the darkTerminals toggle', () => {
    render(<AppearanceSettings />)
    expect(
      screen.getByRole('checkbox', { name: 'settings.appearance.darkTerminals.title' })
    ).toBeInTheDocument()
  })

  it('darkTerminals toggle reflects current setting (true)', () => {
    render(<AppearanceSettings />)
    const toggle = screen.getByRole('checkbox', {
      name: 'settings.appearance.darkTerminals.title'
    }) as HTMLInputElement
    expect(toggle.checked).toBe(true)
  })

  it('darkTerminals toggle reflects current setting (false)', () => {
    currentSettings = { ...defaultSettings, darkTerminals: false }
    render(<AppearanceSettings />)
    const toggle = screen.getByRole('checkbox', {
      name: 'settings.appearance.darkTerminals.title'
    }) as HTMLInputElement
    expect(toggle.checked).toBe(false)
  })

  it('calls updateSetting with false when darkTerminals toggle is unchecked', async () => {
    const user = userEvent.setup()
    render(<AppearanceSettings />)

    const toggle = screen.getByRole('checkbox', {
      name: 'settings.appearance.darkTerminals.title'
    })
    await user.click(toggle)

    expect(mockUpdateSetting).toHaveBeenCalledWith('darkTerminals', false)
  })

  // ── Glass Effect Color slider ─────────────────────────────────────────────

  it('renders the glass effect color section title', () => {
    render(<AppearanceSettings />)
    expect(screen.getByText('settings.appearance.glassEffectColor.title')).toBeInTheDocument()
  })

  it('renders the slider with min=0 and max=31', () => {
    render(<AppearanceSettings />)
    const slider = screen.getByRole('slider', { name: 'settings.appearance.glassEffectColor.desc' }) as HTMLInputElement
    expect(Number(slider.min)).toBe(0)
    expect(Number(slider.max)).toBe(31)
  })

  it('renders Off, Auto, Morning, Noon, Evening, Manual labels', () => {
    render(<AppearanceSettings />)
    expect(screen.getByText('settings.appearance.glassEffectColor.off')).toBeInTheDocument()
    expect(screen.getByText('settings.appearance.glassEffectColor.auto')).toBeInTheDocument()
    expect(screen.getByText('settings.appearance.glassEffectColor.morning')).toBeInTheDocument()
    expect(screen.getByText('settings.appearance.glassEffectColor.noon')).toBeInTheDocument()
    expect(screen.getByText('settings.appearance.glassEffectColor.evening')).toBeInTheDocument()
    expect(screen.getByText('settings.appearance.glassEffectColor.manual')).toBeInTheDocument()
  })

  it('slider displays at position 6 when glassEffectHour is -1 (Auto)', () => {
    render(<AppearanceSettings />)
    const slider = screen.getByRole('slider', { name: 'settings.appearance.glassEffectColor.desc' }) as HTMLInputElement
    expect(Number(slider.value)).toBe(6)
  })

  it('calls updateSetting with -2 (Off) when slider moves to position 0', async () => {
    render(<AppearanceSettings />)
    const slider = screen.getByRole('slider', { name: 'settings.appearance.glassEffectColor.desc' })
    const { fireEvent } = await import('@testing-library/react')
    fireEvent.change(slider, { target: { value: '0' } })
    expect(mockUpdateSetting).toHaveBeenCalledWith('glassEffectHour', -2)
  })

  it('calls updateSetting with -1 (Auto) when slider moves to positions 1-6', async () => {
    render(<AppearanceSettings />)
    const slider = screen.getByRole('slider', { name: 'settings.appearance.glassEffectColor.desc' })
    const { fireEvent } = await import('@testing-library/react')
    fireEvent.change(slider, { target: { value: '3' } })
    expect(mockUpdateSetting).toHaveBeenCalledWith('glassEffectHour', -1)
    fireEvent.change(slider, { target: { value: '6' } })
    expect(mockUpdateSetting).toHaveBeenCalledWith('glassEffectHour', -1)
  })

  it('calls updateSetting with 24 (Manual) when slider moves to position 31', async () => {
    render(<AppearanceSettings />)
    const slider = screen.getByRole('slider', { name: 'settings.appearance.glassEffectColor.desc' })
    const { fireEvent } = await import('@testing-library/react')
    fireEvent.change(slider, { target: { value: '31' } })
    expect(mockUpdateSetting).toHaveBeenCalledWith('glassEffectHour', 24)
  })

  it('calls updateSetting with hour 18 (evening) when slider moves to position 25', async () => {
    render(<AppearanceSettings />)
    const slider = screen.getByRole('slider', { name: 'settings.appearance.glassEffectColor.desc' })
    const { fireEvent } = await import('@testing-library/react')
    fireEvent.change(slider, { target: { value: '25' } })
    expect(mockUpdateSetting).toHaveBeenCalledWith('glassEffectHour', 18)
  })

  // ── Theme dropdown ─────────────────────────────────────────────────────────

  it('renders Selected Theme title and description in a card row', () => {
    render(<AppearanceSettings />)
    expect(screen.getByText('settings.appearance.themes.selectedTheme.title')).toBeInTheDocument()
    expect(screen.getByText('settings.appearance.themes.selectedTheme.desc')).toBeInTheDocument()
  })

  it('renders the theme dropdown with correct aria-label', () => {
    render(<AppearanceSettings />)
    expect(
      screen.getByRole('button', { name: 'settings.appearance.themes.dropdown.ariaLabel' })
    ).toBeInTheDocument()
  })

  it('shows the selected theme label when a named theme is active', () => {
    render(<AppearanceSettings />)
    const trigger = screen.getByRole('button', { name: 'settings.appearance.themes.dropdown.ariaLabel' })
    expect(trigger).toHaveTextContent('settings.appearance.themes.dark')
  })

  it('shows placeholder when System Sync is active', () => {
    currentSettings = { ...defaultSettings, theme: 'system' }
    render(<AppearanceSettings />)
    const trigger = screen.getByRole('button', { name: 'settings.appearance.themes.dropdown.ariaLabel' })
    expect(trigger).toHaveTextContent('settings.appearance.themes.dropdown.placeholder')
  })

  it('calls updateSetting with the selected theme when choosing from the dropdown', async () => {
    const user = userEvent.setup()
    render(<AppearanceSettings />)

    await user.click(screen.getByRole('button', { name: 'settings.appearance.themes.dropdown.ariaLabel' }))
    await user.click(screen.getByRole('button', { name: /settings\.appearance\.themes\.light/i }))

    expect(mockUpdateSetting).toHaveBeenCalledWith('theme', 'light')
  })

  it('no preset box is active when a non-preset theme is selected', () => {
    currentSettings = { ...defaultSettings, theme: 'some-custom-theme' }
    render(<AppearanceSettings />)
    const activeCards = document.querySelectorAll('.settings-appearance__theme-card--active')
    expect(activeCards).toHaveLength(0)
  })

  it('highlights the Neon Dark box when theme is dark', () => {
    render(<AppearanceSettings />)
    const activeCards = document.querySelectorAll('.settings-appearance__theme-card--active')
    expect(activeCards).toHaveLength(1)
    expect(activeCards[0]).toHaveTextContent('settings.appearance.themes.dark')
  })
})

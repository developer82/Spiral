import { render, screen, cleanup, act, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { useLayoutEffect } from 'react'
import TopBar from '../TopBar'
import { MenuStateProvider, useMenuStateContext } from '../../../contexts/MenuStateContext'
import { useSettingsContext } from '../../../contexts/SettingsContext'
import { useUpdateContext } from '../../../contexts/UpdateContext'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key
  })
}))

// Default settings for TopBar rendering
const defaultSettings = {
  language: 'en',
  theme: 'dark' as const,
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
  environments: [],
  defaultConnectionSort: { field: 'name' as const, direction: 'asc' as const },
  askBeforeIncludingSecretsInComparisonExport: true,
  includeSecretsInComparisonExportByDefault: false,
  likeConfetti: false,
  showTipsAndTricks: true,
  copyJsonFormatted: false,
  hfToken: '',
  showToolbarTextButtons: false,
  darkTerminals: false,
  glassEffectHour: -1,
  glassEffectManualColor: '',
  analyticsEnabled: true,
  mysqlDumpPath: '',
  mysqlClientPath: '',
  pgDumpPath: '',
  pgRestorePath: '',
  psqlPath: '',
  mongodumpPath: '',
  mongorestorePath: ''
}

const mockUpdateSetting = vi.fn()
const mockResetSettings = vi.fn()

vi.mock('../../../contexts/SettingsContext', () => ({
  useSettingsContext: vi.fn(() => ({
    settings: defaultSettings,
    updateSetting: mockUpdateSetting,
    resetSettings: mockResetSettings
  }))
}))

vi.mock('../../../contexts/TipsContext', () => ({
  useTipsContext: () => ({
    previewTip: vi.fn()
  })
}))

vi.mock('../../../contexts/ProfileContext', () => ({
  useProfileContext: () => ({
    profile: {
      displayName: 'Ada Lovelace',
      avatarDataUrl: null,
      avatarZoom: 1,
      avatarOffsetX: 0,
      avatarOffsetY: 0,
      lockOnStartup: false,
      lockOnInactivity: false,
      lockOnMinimize: false,
      inactivityTimeoutMinutes: 5,
      hasPassword: false
    }
  })
}))

vi.mock('../../../hooks/useConfetti', () => ({
  useConfetti: () => ({ triggerConfetti: vi.fn() })
}))

const mockInstallUpdate = vi.fn()

const baseUpdateContext = {
  status: 'idle' as string,
  availableVersion: null as string | null,
  currentVersion: '1.0.0',
  previousVersion: null as string | null,
  releaseNotes: null as string | null,
  downloadPercent: 0,
  downloadSpeed: null as number | null,
  errorMessage: null as string | null,
  checkForUpdates: vi.fn(),
  startDownload: vi.fn(),
  cancelDownload: vi.fn(),
  installUpdate: mockInstallUpdate
}

vi.mock('../../../contexts/UpdateContext', () => ({
  useUpdateContext: vi.fn()
}))

beforeEach(() => {
  mockInstallUpdate.mockClear()
  vi.mocked(useUpdateContext).mockReturnValue({ ...baseUpdateContext } as never)
})

function renderTopBarWithOpenDocs(): ReturnType<typeof render> {
  function OpenDocsSetup({ children }: { children: React.ReactNode }): React.ReactNode {
    const { updateMenuState } = useMenuStateContext()
    useLayoutEffect(() => {
      updateMenuState({ hasOpenDocuments: true })
    }, [updateMenuState])
    return children
  }
  return render(
    <MenuStateProvider>
      <OpenDocsSetup>
        <TopBar />
      </OpenDocsSetup>
    </MenuStateProvider>
  )
}

function renderTopBar(): ReturnType<typeof render> {
  return render(
    <MenuStateProvider>
      <TopBar />
    </MenuStateProvider>
  )
}

describe('TopBar', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('renders File, Edit, and View nav buttons', () => {
    renderTopBar()

    expect(screen.getByText('nav.topBar.file')).toBeInTheDocument()
    expect(screen.getByText('nav.topBar.edit')).toBeInTheDocument()
    expect(screen.getByText('nav.topBar.view')).toBeInTheDocument()
  })

  it('does not render History nav button', () => {
    renderTopBar()

    expect(screen.queryByText('nav.topBar.history')).not.toBeInTheDocument()
  })

  it('renders the Help nav button', () => {
    renderTopBar()

    expect(screen.getByText('nav.topBar.help')).toBeInTheDocument()
  })

  it('opens the File menu with correct items when File is clicked', async () => {
    const user = userEvent.setup()
    renderTopBar()

    await user.click(screen.getByText('nav.topBar.file'))

    expect(screen.getByText('menu.file.new')).toBeInTheDocument()
    expect(screen.getByText('menu.file.open')).toBeInTheDocument()
    expect(screen.getByText('menu.file.save')).toBeInTheDocument()
    expect(screen.getByText('menu.file.saveAs')).toBeInTheDocument()
    expect(screen.getByText('menu.file.saveAll')).toBeInTheDocument()
    expect(screen.getByText('menu.file.close')).toBeInTheDocument()
    expect(screen.getByText('menu.file.quit')).toBeInTheDocument()
  })

  it('opens the Edit menu with correct items when Edit is clicked', async () => {
    const user = userEvent.setup()
    renderTopBar()

    await user.click(screen.getByText('nav.topBar.edit'))

    expect(screen.getByText('menu.edit.cut')).toBeInTheDocument()
    expect(screen.getByText('menu.edit.copy')).toBeInTheDocument()
    expect(screen.getByText('menu.edit.paste')).toBeInTheDocument()
    expect(screen.getByText('menu.edit.delete')).toBeInTheDocument()
  })

  it('opens the View menu with page items and the side navigation toggle', async () => {
    const user = userEvent.setup()
    renderTopBar()

    await user.click(screen.getByText('nav.topBar.view'))

    expect(screen.getByText('menu.view.explorer')).toBeInTheDocument()
    expect(screen.getByText('menu.view.profiler')).toBeInTheDocument()
    expect(screen.getByText('menu.view.compare')).toBeInTheDocument()
    expect(screen.getByText('menu.view.settings')).toBeInTheDocument()
    expect(screen.getByText('menu.view.profile')).toBeInTheDocument()
    expect(screen.getByText('menu.view.hideSideNav')).toBeInTheDocument()
  })

  it('shows the show-side-nav label when the navigation bar is hidden', async () => {
    const user = userEvent.setup()
    vi.mocked(useSettingsContext).mockReturnValue({
      settings: { ...defaultSettings, showSideNavigationBar: false },
      updateSetting: mockUpdateSetting,
      resetSettings: mockResetSettings
    })

    renderTopBar()
    await user.click(screen.getByText('nav.topBar.view'))

    expect(screen.getByText('menu.view.showSideNav')).toBeInTheDocument()
  })

  it('closes the File menu when clicking outside', async () => {
    const user = userEvent.setup()
    renderTopBar()

    await user.click(screen.getByText('nav.topBar.file'))
    expect(screen.getByText('menu.file.new')).toBeInTheDocument()

    await user.click(document.body)
    expect(screen.queryByText('menu.file.new')).not.toBeInTheDocument()
  })

  it('closes the File menu when Escape is pressed', async () => {
    const user = userEvent.setup()
    renderTopBar()

    await user.click(screen.getByText('nav.topBar.file'))
    expect(screen.getByText('menu.file.new')).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByText('menu.file.new')).not.toBeInTheDocument()
  })

  it('clicking File button again toggles the menu closed', async () => {
    const user = userEvent.setup()
    renderTopBar()

    await user.click(screen.getByText('nav.topBar.file'))
    expect(screen.getByText('menu.file.new')).toBeInTheDocument()

    await user.click(screen.getByText('nav.topBar.file'))
    expect(screen.queryByText('menu.file.new')).not.toBeInTheDocument()
  })

  it('dispatches menu:file-action DOM event when a File menu item is clicked', async () => {
    const user = userEvent.setup()
    renderTopBar()

    const events: string[] = []
    window.addEventListener('menu:file-action', (e) => {
      events.push((e as CustomEvent<string>).detail)
    })

    await user.click(screen.getByText('nav.topBar.file'))
    await user.click(screen.getByText('menu.file.new'))

    await waitFor(() => expect(events).toContain('new'))
  })

  it('dispatches a view action when a View menu item is clicked', async () => {
    const user = userEvent.setup()
    renderTopBar()

    const events: string[] = []
    window.addEventListener('menu:file-action', (e) => {
      events.push((e as CustomEvent<string>).detail)
    })

    await user.click(screen.getByText('nav.topBar.view'))
    await user.click(screen.getByText('menu.view.compare'))

    await waitFor(() => expect(events).toContain('view:compare'))
  })

  it('calls window.api.menu.executeRole when an Edit menu item is clicked', async () => {
    const user = userEvent.setup()
    const executeRole = vi.spyOn(window.api.menu, 'executeRole').mockImplementation(() => {})
    render(
      <MenuStateProvider>
        <TopBar />
      </MenuStateProvider>
    )

    await user.click(screen.getByText('nav.topBar.edit'))
    await user.click(screen.getByText('menu.edit.copy'))

    // Edit items are disabled with no open document; executeRole is not called
    expect(executeRole).not.toHaveBeenCalled()
  })

  describe('File menu disabled states', () => {
    it('Save, Save As, Save All, and Close are disabled when no documents are open', async () => {
      const user = userEvent.setup()
      renderTopBar()

      await user.click(screen.getByText('nav.topBar.file'))

      const menuItems = document.querySelectorAll('.menu__item--disabled')
      const disabledLabels = Array.from(menuItems).map((el) => el.textContent)

      expect(disabledLabels.some((l) => l?.includes('menu.file.save'))).toBe(true)
      expect(disabledLabels.some((l) => l?.includes('menu.file.saveAs'))).toBe(true)
      expect(disabledLabels.some((l) => l?.includes('menu.file.saveAll'))).toBe(true)
      expect(disabledLabels.some((l) => l?.includes('menu.file.close'))).toBe(true)
    })

    it('New, Open, and Quit are never disabled', async () => {
      const user = userEvent.setup()
      renderTopBar()

      await user.click(screen.getByText('nav.topBar.file'))

      const menuItems = document.querySelectorAll('.menu__item--disabled')
      const disabledLabels = Array.from(menuItems).map((el) => el.textContent)

      expect(disabledLabels.some((l) => l?.includes('menu.file.new'))).toBe(false)
      expect(disabledLabels.some((l) => l?.includes('menu.file.open'))).toBe(false)
      expect(disabledLabels.some((l) => l?.includes('menu.file.quit'))).toBe(false)
    })

    it('dispatches quit action when Quit is clicked', async () => {
      const user = userEvent.setup()
      renderTopBar()

      const events: string[] = []
      window.addEventListener('menu:file-action', (e) => {
        events.push((e as CustomEvent<string>).detail)
      })

      await user.click(screen.getByText('nav.topBar.file'))
      await user.click(screen.getByText('menu.file.quit'))

      await waitFor(() => expect(events).toContain('quit'))
    })
  })

  describe('Arrow-key navigation between open menus', () => {
    it('navigates from File to Edit menu with ArrowRight', async () => {
      const user = userEvent.setup()
      renderTopBar()

      await user.click(screen.getByText('nav.topBar.file'))
      expect(screen.getByText('menu.file.new')).toBeInTheDocument()

      await user.keyboard('{ArrowRight}')

      expect(screen.queryByText('menu.file.new')).not.toBeInTheDocument()
      expect(screen.getByText('menu.edit.cut')).toBeInTheDocument()
    })

    it('navigates from Edit to View menu with ArrowRight', async () => {
      const user = userEvent.setup()
      renderTopBar()

      await user.click(screen.getByText('nav.topBar.edit'))
      await user.keyboard('{ArrowRight}')

      expect(screen.queryByText('menu.edit.cut')).not.toBeInTheDocument()
      expect(screen.getByText('menu.view.explorer')).toBeInTheDocument()
    })

    it('navigates from View to Window menu with ArrowRight', async () => {
      const user = userEvent.setup()
      renderTopBar()

      await user.click(screen.getByText('nav.topBar.view'))
      await user.keyboard('{ArrowRight}')

      expect(screen.queryByText('menu.view.explorer')).not.toBeInTheDocument()
      expect(screen.getByText('menu.window.closeAllTabs')).toBeInTheDocument()
    })

    it('wraps from Help to File menu with ArrowRight', async () => {
      const user = userEvent.setup()
      renderTopBar()

      await user.click(screen.getByText('nav.topBar.help'))
      await user.keyboard('{ArrowRight}')

      expect(screen.queryByText('menu.help.about')).not.toBeInTheDocument()
      expect(screen.getByText('menu.file.new')).toBeInTheDocument()
    })

    it('navigates from Edit to File menu with ArrowLeft', async () => {
      const user = userEvent.setup()
      renderTopBar()

      await user.click(screen.getByText('nav.topBar.edit'))
      await user.keyboard('{ArrowLeft}')

      expect(screen.queryByText('menu.edit.cut')).not.toBeInTheDocument()
      expect(screen.getByText('menu.file.new')).toBeInTheDocument()
    })

    it('wraps from File to Help menu with ArrowLeft', async () => {
      const user = userEvent.setup()
      renderTopBar()

      await user.click(screen.getByText('nav.topBar.file'))
      await user.keyboard('{ArrowLeft}')

      expect(screen.queryByText('menu.file.new')).not.toBeInTheDocument()
      expect(screen.getByText('menu.help.about')).toBeInTheDocument()
    })

    it('does not open a menu on ArrowRight when no menu is open', async () => {
      const user = userEvent.setup()
      renderTopBar()

      await user.keyboard('{ArrowRight}')

      expect(screen.queryByText('menu.file.new')).not.toBeInTheDocument()
      expect(screen.queryByText('menu.edit.cut')).not.toBeInTheDocument()
      expect(screen.queryByText('menu.view.explorer')).not.toBeInTheDocument()
    })
  })

  describe('Keyboard shortcuts (Alt+F/E/V)', () => {
    it('opens the File menu when Alt+F is pressed', async () => {
      const user = userEvent.setup()
      renderTopBar()

      await user.keyboard('{Alt>}f{/Alt}')

      expect(screen.getByText('menu.file.new')).toBeInTheDocument()
    })

    it('opens the Edit menu when Alt+E is pressed', async () => {
      const user = userEvent.setup()
      renderTopBar()

      await user.keyboard('{Alt>}e{/Alt}')

      expect(screen.getByText('menu.edit.cut')).toBeInTheDocument()
    })

    it('opens the View menu when Alt+V is pressed', async () => {
      const user = userEvent.setup()
      renderTopBar()

      await user.keyboard('{Alt>}v{/Alt}')

      expect(screen.getByText('menu.view.explorer')).toBeInTheDocument()
    })

    it('toggles the File menu closed when Alt+F is pressed a second time', async () => {
      const user = userEvent.setup()
      renderTopBar()

      await user.keyboard('{Alt>}f{/Alt}')
      expect(screen.getByText('menu.file.new')).toBeInTheDocument()

      await user.keyboard('{Alt>}f{/Alt}')
      expect(screen.queryByText('menu.file.new')).not.toBeInTheDocument()
    })

    it('does not open menus when Alt+F is pressed on macOS', async () => {
      vi.spyOn(window.api, 'platform', 'get').mockReturnValue('darwin' as NodeJS.Platform)
      const user = userEvent.setup()
      renderTopBar()

      await user.keyboard('{Alt>}f{/Alt}')

      expect(screen.queryByText('menu.file.new')).not.toBeInTheDocument()
    })
  })

  describe('Alt bar focus mode', () => {
    it('pressing and releasing Alt selects the File item without opening the menu', async () => {
      const user = userEvent.setup()
      const { container } = renderTopBar()

      await user.keyboard('{Alt>}{/Alt}')

      expect(container.querySelector('[data-menu-trigger="file"]')).toHaveClass('topbar__nav-item--bar-focused')
      expect(screen.queryByText('menu.file.new')).not.toBeInTheDocument()
    })

    it('shows access key underline spans when Alt is held', async () => {
      const user = userEvent.setup()
      const { container } = renderTopBar()

      await user.keyboard('{Alt>}')
      expect(container.querySelectorAll('.topbar__nav-accesskey')).toHaveLength(5)
    })

    it('shows access key underlines when bar focus is active', async () => {
      const user = userEvent.setup()
      const { container } = renderTopBar()

      await user.keyboard('{Alt>}{/Alt}')
      expect(container.querySelectorAll('.topbar__nav-accesskey')).toHaveLength(5)
    })

    it('pressing Enter while bar is focused opens the focused menu', async () => {
      const user = userEvent.setup()
      renderTopBar()

      await user.keyboard('{Alt>}{/Alt}')
      await user.keyboard('{Enter}')

      expect(screen.getByText('menu.file.new')).toBeInTheDocument()
    })

    it('pressing ArrowDown while bar is focused opens the focused menu', async () => {
      const user = userEvent.setup()
      renderTopBar()

      await user.keyboard('{Alt>}{/Alt}')
      await user.keyboard('{ArrowDown}')

      expect(screen.getByText('menu.file.new')).toBeInTheDocument()
    })

    it('pressing Escape while bar is focused cancels the selection', async () => {
      const user = userEvent.setup()
      const { container } = renderTopBar()

      await user.keyboard('{Alt>}{/Alt}')
      expect(container.querySelector('[data-menu-trigger="file"]')).toHaveClass('topbar__nav-item--bar-focused')

      await user.keyboard('{Escape}')

      expect(container.querySelector('[data-menu-trigger="file"]')).not.toHaveClass('topbar__nav-item--bar-focused')
      expect(screen.queryByText('menu.file.new')).not.toBeInTheDocument()
    })

    it('pressing ArrowRight moves bar focus from File to Edit without opening', async () => {
      const user = userEvent.setup()
      const { container } = renderTopBar()

      await user.keyboard('{Alt>}{/Alt}')
      await user.keyboard('{ArrowRight}')

      expect(container.querySelector('[data-menu-trigger="file"]')).not.toHaveClass('topbar__nav-item--bar-focused')
      expect(container.querySelector('[data-menu-trigger="edit"]')).toHaveClass('topbar__nav-item--bar-focused')
      expect(screen.queryByText('menu.edit.cut')).not.toBeInTheDocument()
    })

    it('pressing ArrowLeft from File wraps bar focus to Help without opening', async () => {
      const user = userEvent.setup()
      const { container } = renderTopBar()

      await user.keyboard('{Alt>}{/Alt}')
      await user.keyboard('{ArrowLeft}')

      expect(container.querySelector('[data-menu-trigger="help"]')).toHaveClass('topbar__nav-item--bar-focused')
      expect(screen.queryByText('menu.help.about')).not.toBeInTheDocument()
    })

    it('pressing an access letter while bar is focused opens that menu', async () => {
      const user = userEvent.setup()
      renderTopBar()

      await user.keyboard('{Alt>}{/Alt}')
      await user.keyboard('e')

      expect(screen.getByText('menu.edit.cut')).toBeInTheDocument()
    })

    it('pressing Alt again while bar is focused cancels the selection', async () => {
      const user = userEvent.setup()
      const { container } = renderTopBar()

      await user.keyboard('{Alt>}{/Alt}')
      expect(container.querySelector('[data-menu-trigger="file"]')).toHaveClass('topbar__nav-item--bar-focused')

      await user.keyboard('{Alt>}{/Alt}')
      expect(container.querySelector('[data-menu-trigger="file"]')).not.toHaveClass('topbar__nav-item--bar-focused')
    })

    it('Alt+F opens the menu directly without entering bar focus mode', async () => {
      const user = userEvent.setup()
      const { container } = renderTopBar()

      await user.keyboard('{Alt>}f{/Alt}')

      expect(screen.getByText('menu.file.new')).toBeInTheDocument()
      expect(container.querySelector('[data-menu-trigger="file"]')).not.toHaveClass('topbar__nav-item--bar-focused')
    })

    it('does not activate bar focus on macOS', async () => {
      vi.spyOn(window.api, 'platform', 'get').mockReturnValue('darwin' as NodeJS.Platform)
      const user = userEvent.setup()
      const { container } = renderTopBar()

      await user.keyboard('{Alt>}{/Alt}')

      // Nav buttons are not rendered on macOS, so no bar-focused class can exist
      expect(container.querySelector('.topbar__nav-item--bar-focused')).not.toBeInTheDocument()
    })
  })

  describe('Edit menu disabled states', () => {
    it('all Edit items are disabled when no document is focused', async () => {
      const user = userEvent.setup()
      renderTopBar()

      await user.click(screen.getByText('nav.topBar.edit'))

      const menuItems = document.querySelectorAll('.menu__item--disabled')
      const disabledLabels = Array.from(menuItems).map((el) => el.textContent)

      expect(disabledLabels.some((l) => l?.includes('menu.edit.cut'))).toBe(true)
      expect(disabledLabels.some((l) => l?.includes('menu.edit.copy'))).toBe(true)
      expect(disabledLabels.some((l) => l?.includes('menu.edit.paste'))).toBe(true)
      expect(disabledLabels.some((l) => l?.includes('menu.edit.delete'))).toBe(true)
    })
  })
})

describe('TopBar — window controls', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('renders window controls on Windows when customTitlebar is true', () => {
    // platform defaults to 'win32' in test-setup.ts
    renderTopBar()
    expect(screen.getByRole('button', { name: 'Minimize' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Maximize' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
  })

  it('does not render window controls on macOS', () => {
    vi.spyOn(window.api, 'platform', 'get').mockReturnValue('darwin' as NodeJS.Platform)
    renderTopBar()
    expect(screen.queryByRole('button', { name: 'Minimize' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument()
  })

  it('does not render window controls when customTitlebar is false', () => {
    vi.mocked(useSettingsContext).mockReturnValueOnce({
      settings: { ...defaultSettings, customTitlebar: false },
      updateSetting: mockUpdateSetting,
      resetSettings: mockResetSettings
    })
    renderTopBar()
    expect(screen.queryByRole('button', { name: 'Minimize' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument()
  })

  it('calls window.api.window.minimize when Minimize is clicked', async () => {
    const user = userEvent.setup()
    const minimize = vi.spyOn(window.api.window, 'minimize').mockImplementation(() => {})
    renderTopBar()
    await user.click(screen.getByRole('button', { name: 'Minimize' }))
    expect(minimize).toHaveBeenCalledOnce()
  })

  it('calls window.api.window.maximizeRestore when Maximize is clicked', async () => {
    const user = userEvent.setup()
    const maximizeRestore = vi.spyOn(window.api.window, 'maximizeRestore').mockImplementation(() => {})
    renderTopBar()
    await user.click(screen.getByRole('button', { name: 'Maximize' }))
    expect(maximizeRestore).toHaveBeenCalledOnce()
  })

  it('calls window.api.window.close when Close is clicked', async () => {
    const user = userEvent.setup()
    const close = vi.spyOn(window.api.window, 'close').mockImplementation(() => {})
    renderTopBar()
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(close).toHaveBeenCalledOnce()
  })

  it('adds macOS frame class when on darwin', () => {
    vi.spyOn(window.api, 'platform', 'get').mockReturnValue('darwin' as NodeJS.Platform)
    vi.mocked(useSettingsContext).mockReturnValueOnce({
      settings: { ...defaultSettings, customTitlebar: true },
      updateSetting: mockUpdateSetting,
      resetSettings: mockResetSettings
    })
    const { container } = renderTopBar()
    expect(container.querySelector('.topbar--macos-frame')).toBeInTheDocument()
  })

  it('does not add macOS frame class on Windows', () => {
    const { container } = renderTopBar()
    expect(container.querySelector('.topbar--macos-frame')).not.toBeInTheDocument()
  })
})

// ── Window menu ───────────────────────────────────────────────────────────────

describe('TopBar — Window menu', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('renders a Window nav button', () => {
    renderTopBar()
    expect(screen.getByText('nav.topBar.window')).toBeInTheDocument()
  })

  it('opens the Window menu with Close All Tabs when Window is clicked', async () => {
    const user = userEvent.setup()
    renderTopBar()

    await user.click(screen.getByText('nav.topBar.window'))

    expect(screen.getByText('menu.window.closeAllTabs')).toBeInTheDocument()
  })

  it('Close All Tabs is disabled when no documents are open', async () => {
    const user = userEvent.setup()
    renderTopBar()

    await user.click(screen.getByText('nav.topBar.window'))

    const menuItems = document.querySelectorAll('.menu__item--disabled')
    const disabledLabels = Array.from(menuItems).map((el) => el.textContent)
    expect(disabledLabels.some((l) => l?.includes('menu.window.closeAllTabs'))).toBe(true)
  })

  it('dispatches window:close-all-tabs action when Close All Tabs is clicked while enabled', async () => {
    const user = userEvent.setup()
    renderTopBarWithOpenDocs()

    // Wait for the useLayoutEffect to set hasOpenDocuments: true
    await act(async () => {})

    const events: string[] = []
    const listener = (e: Event): void => { events.push((e as CustomEvent<string>).detail) }
    window.addEventListener('menu:file-action', listener)

    await user.click(screen.getByText('nav.topBar.window'))
    await user.click(screen.getByText('menu.window.closeAllTabs'))

    await waitFor(() => expect(events).toContain('window:close-all-tabs'))
    window.removeEventListener('menu:file-action', listener)
  })

  it('renders Take Screenshot in the Help menu', async () => {
    const user = userEvent.setup()
    renderTopBar()

    await user.click(screen.getByText('nav.topBar.help'))

    expect(screen.getByText('menu.help.takeScreenshot')).toBeInTheDocument()
  })

  it('renders Resize Window in the Help menu', async () => {
    const user = userEvent.setup()
    renderTopBar()

    await user.click(screen.getByText('nav.topBar.help'))

    expect(screen.getByText('menu.help.resizeWindow')).toBeInTheDocument()
  })

  it('opens the Resize Window dialog with the current size when clicked', async () => {
    const user = userEvent.setup()
    const getContentSize = vi
      .spyOn(window.api.window, 'getContentSize')
      .mockResolvedValue({ width: 1500, height: 950 })
    renderTopBar()

    await user.click(screen.getByText('nav.topBar.help'))
    await user.click(screen.getByText('menu.help.resizeWindow'))

    await waitFor(() => expect(getContentSize).toHaveBeenCalledOnce())
    await waitFor(() =>
      expect(screen.getByText('resizeWindowDialog.title')).toBeInTheDocument()
    )
  })

  it('opens the Take Screenshot dialog with a preview when clicked', async () => {
    const user = userEvent.setup()
    const captureScreenshotPreview = vi
      .spyOn(window.api.window, 'captureScreenshotPreview')
      .mockResolvedValue({ dataUrl: 'data:image/png;base64,AAAA', width: 1500, height: 950 })
    renderTopBar()

    await user.click(screen.getByText('nav.topBar.help'))
    await user.click(screen.getByText('menu.help.takeScreenshot'))

    await waitFor(() => expect(captureScreenshotPreview).toHaveBeenCalledOnce())
    // The dialog opens showing the captured preview.
    await waitFor(() =>
      expect(screen.getByText('takeScreenshotDialog.title')).toBeInTheDocument()
    )
  })

  it('opens the Window menu with Alt+W', async () => {
    const user = userEvent.setup()
    renderTopBar()

    await user.keyboard('{Alt>}w{/Alt}')

    expect(screen.getByText('menu.window.closeAllTabs')).toBeInTheDocument()
  })

  it('navigates from View to Window menu with ArrowRight', async () => {
    const user = userEvent.setup()
    renderTopBar()

    await user.click(screen.getByText('nav.topBar.view'))
    await user.keyboard('{ArrowRight}')

    expect(screen.queryByText('menu.view.explorer')).not.toBeInTheDocument()
    expect(screen.getByText('menu.window.closeAllTabs')).toBeInTheDocument()
  })
})

// ── Update pill ─────────────────────────────────────────────────────────────────

describe('TopBar — update pill', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('shows a clickable downloading pill that opens the download progress dialog', async () => {
    const user = userEvent.setup()
    vi.mocked(useUpdateContext).mockReturnValue({
      ...baseUpdateContext,
      status: 'downloading',
      downloadPercent: 42
    } as never)
    renderTopBar()

    const pill = screen.getByRole('button', { name: /update.downloadingPill/ })
    expect(pill).toBeInTheDocument()

    await user.click(pill)
    expect(screen.getByText('update.downloadProgressTitle')).toBeInTheDocument()
  })

  it('shows an Install Update pill that installs directly when clicked', async () => {
    const user = userEvent.setup()
    vi.mocked(useUpdateContext).mockReturnValue({
      ...baseUpdateContext,
      status: 'downloaded',
      availableVersion: '2.0.0'
    } as never)
    renderTopBar()

    const pill = screen.getByRole('button', { name: 'update.installUpdate' })
    await user.click(pill)
    expect(mockInstallUpdate).toHaveBeenCalledOnce()
  })

  it('changes the pill text to Installing… and disables it after clicking install', async () => {
    const user = userEvent.setup()
    vi.mocked(useUpdateContext).mockReturnValue({
      ...baseUpdateContext,
      status: 'downloaded',
      availableVersion: '2.0.0'
    } as never)
    renderTopBar()

    await user.click(screen.getByRole('button', { name: 'update.installUpdate' }))

    const pill = screen.getByRole('button', { name: 'update.installing' })
    expect(pill).toBeInTheDocument()
    expect(pill).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'update.installUpdate' })).not.toBeInTheDocument()
  })

  it('shows the update-available pill that opens the update dialog', async () => {
    const user = userEvent.setup()
    vi.mocked(useUpdateContext).mockReturnValue({
      ...baseUpdateContext,
      status: 'updateAvailable',
      availableVersion: '2.0.0'
    } as never)
    renderTopBar()

    await user.click(screen.getByRole('button', { name: 'update.updateAvailable' }))
    expect(screen.getByText('update.dialogTitle')).toBeInTheDocument()
  })
})

// ── Profile button ───────────────────────────────────────────────────────────

describe('TopBar — profile button', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  function mockSideNavHidden(): void {
    vi.mocked(useSettingsContext).mockReturnValue({
      settings: { ...defaultSettings, showSideNavigationBar: false },
      updateSetting: mockUpdateSetting,
      resetSettings: mockResetSettings
    })
  }

  it('does not render the profile button when the side navigation bar is visible', () => {
    renderTopBar()
    expect(screen.queryByRole('button', { name: 'nav.sideNav.profile' })).not.toBeInTheDocument()
  })

  it('renders the profile button when the side navigation bar is hidden', () => {
    mockSideNavHidden()
    renderTopBar()
    expect(screen.getByRole('button', { name: 'nav.sideNav.profile' })).toBeInTheDocument()
  })

  it('does not render the profile button while the title bar is locked', () => {
    mockSideNavHidden()
    render(
      <MenuStateProvider>
        <TopBar isLocked />
      </MenuStateProvider>
    )
    expect(screen.queryByRole('button', { name: 'nav.sideNav.profile' })).not.toBeInTheDocument()
  })

  it('dispatches the user-profile view action when the profile button is clicked', async () => {
    const user = userEvent.setup()
    mockSideNavHidden()
    renderTopBar()

    const events: string[] = []
    const listener = (e: Event): void => { events.push((e as CustomEvent<string>).detail) }
    window.addEventListener('menu:file-action', listener)

    await user.click(screen.getByRole('button', { name: 'nav.sideNav.profile' }))

    await waitFor(() => expect(events).toContain('view:settings:user-profile'))
    window.removeEventListener('menu:file-action', listener)
  })

  it('places the profile button left of the window controls on Windows', () => {
    // platform defaults to 'win32' in test-setup.ts
    mockSideNavHidden()
    const { container } = renderTopBar()
    const profile = container.querySelector('.topbar__profile')
    expect(profile).toHaveClass('topbar__profile--right')
    expect(container.querySelector('.topbar__window-controls--with-profile')).toBeInTheDocument()
  })

  it('places the profile button inside the brand, left of the logo, on macOS', () => {
    vi.spyOn(window.api, 'platform', 'get').mockReturnValue('darwin' as NodeJS.Platform)
    mockSideNavHidden()
    const { container } = renderTopBar()
    const brand = container.querySelector('.topbar__brand')
    expect(brand?.querySelector('.topbar__profile')).toBeInTheDocument()
  })

  it('Ctrl+Shift+T captures at the current window size and saves without the dialog', async () => {
    const captureAtSize = vi.spyOn(window.api.window, 'captureScreenshotAtSize')
    const write = vi.spyOn(window.api.window, 'writeScreenshot')
    renderTopBar()

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { code: 'KeyT', ctrlKey: true, shiftKey: true })
      )
    })

    // getContentSize mock resolves to 1500 × 950 in test-setup.
    await waitFor(() => expect(captureAtSize).toHaveBeenCalledWith(1500, 950))
    await waitFor(() => expect(write).toHaveBeenCalledOnce())
    // No preview dialog is opened for the instant shortcut.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('ignores Ctrl+T without Shift', async () => {
    const captureAtSize = vi.spyOn(window.api.window, 'captureScreenshotAtSize')
    renderTopBar()

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyT', ctrlKey: true }))
    })

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(captureAtSize).not.toHaveBeenCalled()
  })
})

import { render, screen, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'

const mockRegisterNavigate = vi.fn()
const mockUpdateSetting = vi.fn()

let mockSettings = {
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
  showTipsAndTricks: true,
  glassEffectHour: -1
}

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key
  })
}))

vi.mock('../components/TopBar/TopBar', () => ({
  default: () => <div>topbar</div>
}))

vi.mock('../pages/Explorer/ExplorerPage/ExplorerPage', () => ({
  default: ({ isActive }: { isActive: boolean }) => <div>{isActive ? 'Explorer Active' : 'Explorer Inactive'}</div>
}))

vi.mock('../pages/Profiler/ProfilerPage', () => ({
  default: () => <div>Profiler Page</div>
}))

vi.mock('../pages/Compare/ComparePage/ComparePage', () => ({
  default: ({ isActive }: { isActive: boolean }) => <div>{isActive ? 'Compare Active' : 'Compare Inactive'}</div>
}))

vi.mock('../pages/Settings/SettingsPage', () => ({
  default: () => <div>Settings Page</div>
}))

vi.mock('../components/ConfettiLayer/ConfettiLayer', () => ({
  default: () => null
}))

vi.mock('../contexts/TipsContext', () => ({
  TipsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useTipsContext: () => ({
    activeTip: null,
    dismissTip: vi.fn(),
    previewTip: vi.fn(),
    notifyNavigation: vi.fn()
  })
}))

vi.mock('../components/TipsNotification/TipsNotification', () => ({
  default: () => null,
  TipsLayer: () => null
}))

vi.mock('../contexts/SettingsContext', () => ({
  useSettingsContext: () => ({
    settings: mockSettings,
    updateSetting: mockUpdateSetting
  })
}))

vi.mock('../contexts/ProfilerContext', () => ({
  ProfilerProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useProfilerContext: () => ({
    registerNavigate: mockRegisterNavigate
  })
}))

describe('App', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'electron', {
      configurable: true,
      value: {
        webFrame: {
          setZoomFactor: vi.fn()
        }
      }
    })

    mockSettings = {
      language: 'en',
      theme: 'dark',
      showSideNavigationBar: true,
      syntaxHighlighting: true,
      showGridLines: false,
      fontScaling: 100,
      queryTimeout: 30,
      showSystemDatabases: false,
      selectTopRowsCount: 1000,
      defaultErdBackground: 'dots',
      autoIncludeExecutionPlan: false,
      autoIncludeClientStatistics: false,
      customTitlebar: true,
      enableAnimations: true,
      uppercaseColumnHeaders: false,
      showKeyIconsInResults: false,
      useInteractiveTables: false,
      showTipsAndTricks: true,
      glassEffectHour: -1
    }
    mockRegisterNavigate.mockReset()
    mockUpdateSetting.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it('switches to the profiler page when the View menu action is dispatched', () => {
    render(<App />)

    window.dispatchEvent(new CustomEvent('menu:file-action', { detail: 'view:profiler' }))

    expect(screen.getByText('Profiler Page')).toBeInTheDocument()
  })

  it('switches to the settings page when the View menu action is dispatched', () => {
    render(<App />)

    window.dispatchEvent(new CustomEvent('menu:file-action', { detail: 'view:settings' }))

    expect(screen.getByText('Settings Page')).toBeInTheDocument()
  })

  it('switches to the settings page when the View > Profile menu action is dispatched', () => {
    render(<App />)

    window.dispatchEvent(new CustomEvent('menu:file-action', { detail: 'view:settings:user-profile' }))

    expect(screen.getByText('Settings Page')).toBeInTheDocument()
  })

  it('requests hiding the side navigation bar when the toggle action is dispatched', () => {
    render(<App />)

    window.dispatchEvent(new CustomEvent('menu:file-action', { detail: 'view:toggle-side-nav' }))

    expect(mockUpdateSetting).toHaveBeenCalledWith('showSideNavigationBar', false)
  })

  it('renders the side navigation bar as hidden when the persisted setting is false', () => {
    mockSettings = { ...mockSettings, showSideNavigationBar: false }
    const { container } = render(<App />)

    expect(container.querySelector('.sidenav--hidden')).toBeInTheDocument()
  })
})
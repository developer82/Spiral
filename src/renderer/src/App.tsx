import { useCallback, useEffect, useState } from 'react'
import TopBar from './components/TopBar/TopBar'
import NavController from './components/NavController/NavController'
import ExplorerPage from './pages/Explorer/ExplorerPage/ExplorerPage'
import SettingsPage from './pages/Settings/SettingsPage'
import type { SettingsSectionId } from './pages/Settings/SettingsPage'
import ProfilerPage from './pages/Profiler/ProfilerPage'
import ComparePage from './pages/Compare/ComparePage/ComparePage'
import DocsPage from './pages/Docs/DocsPage'
import { useSettingsContext } from './contexts/SettingsContext'
import { ProfilerProvider, useProfilerContext } from './contexts/ProfilerContext'
import { MenuStateProvider } from './contexts/MenuStateContext'
import { UpdateProvider } from './contexts/UpdateContext'
import { ProfileProvider } from './contexts/ProfileContext'
import ConfettiLayer from './components/ConfettiLayer/ConfettiLayer'
import { TipsLayer } from './components/TipsNotification/TipsNotification'
import { useTipsContext } from './contexts/TipsContext'
import AppLockGate from './components/AppLockGate/AppLockGate'
import { trackPageView } from './analytics/track'
import './App.css'

export type PageId = 'explorer' | 'settings' | 'profiler' | 'compare' | 'docs'
type ViewMenuAction = 'view:explorer' | 'view:settings' | 'view:profiler' | 'view:compare' | 'view:toggle-side-nav' | 'view:settings:user-profile' | 'view:docs'

function AppInner(): React.JSX.Element {
  const [activePage, setActivePage] = useState<PageId>('explorer')
  const [activeSettingsSection, setActiveSettingsSection] = useState<SettingsSectionId>('general')
  const { settings, updateSetting } = useSettingsContext()
  const { registerNavigate } = useProfilerContext()
  const { notifyNavigation } = useTipsContext()

  const navigateTo = useCallback((page: PageId): void => {
    setActivePage(page)
  }, [])

  const navigateToSettings = useCallback((section: SettingsSectionId = 'general'): void => {
    setActiveSettingsSection(section)
    setActivePage('settings')
  }, [])

  useEffect(() => {
    notifyNavigation(activePage)
    trackPageView(activePage === 'settings' ? `settings/${activeSettingsSection}` : activePage)
  }, [activePage, activeSettingsSection, notifyNavigation])

  useEffect(() => {
    registerNavigate((page) => navigateTo(page as PageId))
  }, [navigateTo, registerNavigate])

  useEffect(() => {
    function onMenuAction(event: Event): void {
      const action = (event as CustomEvent<string>).detail as ViewMenuAction | string

      if (action === 'view:explorer') navigateTo('explorer')
      else if (action === 'view:profiler') navigateTo('profiler')
      else if (action === 'view:compare') navigateTo('compare')
      else if (action === 'view:settings') navigateToSettings('general')
      else if (action === 'view:settings:user-profile') navigateToSettings('user-profile')
      else if (action === 'view:settings:general') navigateToSettings('general')
      else if (action === 'view:settings:appearance') navigateToSettings('appearance')
      else if (action === 'view:settings:databases-config') navigateToSettings('databases-config')
      else if (action === 'view:settings:results-view-config') navigateToSettings('results-view-config')
      else if (action === 'view:docs') navigateTo('docs')
      else if (action === 'view:toggle-side-nav') {
        updateSetting('showSideNavigationBar', !settings.showSideNavigationBar)
      }
    }

    window.addEventListener('menu:file-action', onMenuAction)
    return () => window.removeEventListener('menu:file-action', onMenuAction)
  }, [navigateTo, navigateToSettings, settings.showSideNavigationBar, updateSetting])

  useEffect(() => {
    const scale = settings.fontScaling
    document.documentElement.style.zoom = ''
    window.electron.webFrame.setZoomFactor(scale / 100)
  }, [settings.fontScaling])

  const PAGES: Record<PageId, React.JSX.Element> = {
    explorer: <ExplorerPage isActive={activePage === 'explorer'} />,
    settings: <SettingsPage section={activeSettingsSection} onSectionChange={(id) => setActiveSettingsSection(id)} isActive={activePage === 'settings'} />,
    profiler: <ProfilerPage />,
    compare: <ComparePage isActive={activePage === 'compare'} />,
    docs: <DocsPage isActive={activePage === 'docs'} />
  }

  return (
    <AppLockGate titleBar={<TopBar isLocked />}>
      <div className="app">
        <TopBar />
        <NavController
          activeItem={activePage}
          isVisible={settings.showSideNavigationBar}
          onNavigate={(id) => navigateTo(id as PageId)}
          onNavigateToProfile={() => navigateToSettings('user-profile')}
        >
          <main className="app__content">
            {(Object.keys(PAGES) as PageId[]).map((pageId) => (
              <div key={pageId} className={`app__page${pageId === activePage ? ' app__page--active' : ''}`}>
                {PAGES[pageId]}
              </div>
            ))}
          </main>
        </NavController>
      </div>
    </AppLockGate>
  )
}

function App(): React.JSX.Element {
  return (
    <UpdateProvider>
      <ProfilerProvider>
        <MenuStateProvider>
          <ProfileProvider>
            <AppInner />
            <ConfettiLayer />
            <TipsLayer />
          </ProfileProvider>
        </MenuStateProvider>
      </ProfilerProvider>
    </UpdateProvider>
  )
}

export default App

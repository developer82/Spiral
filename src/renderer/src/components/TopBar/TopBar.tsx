import { useState, useCallback, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Activity,
  BookOpen,
  Camera,
  Clipboard,
  Copy,
  Database,
  Download,
  FilePlus,
  FolderOpen,
  GitCompareArrows,
  Loader,
  Lock,
  LogOut,
  Save,
  SaveAll,
  Scaling,
  Scissors,
  Settings as SettingsIcon,
  Trash2,
  Upload,
  User,
  X
} from 'lucide-react'
import Menu, { type MenuItem, type MenuPosition } from '../Menu/Menu'
import AboutDialog from '../AboutDialog/AboutDialog'
import AppUpdateDialog from '../AppUpdateDialog/AppUpdateDialog'
import DownloadProgressDialog from '../DownloadProgressDialog/DownloadProgressDialog'
import ReleaseNotesDialog from '../ReleaseNotesDialog/ReleaseNotesDialog'
import ExportEnvironmentDialog from '../ExportEnvironmentDialog/ExportEnvironmentDialog'
import ImportEnvironmentDialog from '../ImportEnvironmentDialog/ImportEnvironmentDialog'
import TakeScreenshotDialog, {
  type ScreenshotPreview
} from '../TakeScreenshotDialog/TakeScreenshotDialog'
import { composeScreenshotWithTrafficLights } from '../TakeScreenshotDialog/trafficLights'
import ResizeWindowDialog from '../ResizeWindowDialog/ResizeWindowDialog'
import { useMenuStateContext } from '../../contexts/MenuStateContext'
import { useSettingsContext } from '../../contexts/SettingsContext'
import { useUpdateContext } from '../../contexts/UpdateContext'
import { useTipsContext } from '../../contexts/TipsContext'
import { useProfileContext } from '../../contexts/ProfileContext'
import ProfileAvatar from '../ProfileAvatar/ProfileAvatar'
import logoUrl from '../../assets/logo.png'
import './TopBar.css'

type MenuKey = 'file' | 'edit' | 'view' | 'window' | 'help'

interface MenuState {
  key: MenuKey
  position: MenuPosition
}

function dispatchMenuAction(action: string): void {
  window.dispatchEvent(new CustomEvent('menu:file-action', { detail: action }))
}

// SVG icons for window controls (renders inline to avoid any icon library dependency)
function MinimizeIcon(): React.JSX.Element {
  return (
    <svg width="10" height="1" viewBox="0 0 10 1" fill="none" aria-hidden="true">
      <rect width="10" height="1" fill="currentColor" />
    </svg>
  )
}

function MaximizeIcon(): React.JSX.Element {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <rect x="0.5" y="0.5" width="9" height="9" stroke="currentColor" />
    </svg>
  )
}

function RestoreIcon(): React.JSX.Element {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <rect x="2.5" y="0.5" width="7" height="7" stroke="currentColor" />
      <path d="M0 2.5H1.5V9.5H8.5V8H0V2.5Z" fill="currentColor" />
    </svg>
  )
}

function CloseIcon(): React.JSX.Element {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <line x1="0" y1="0" x2="10" y2="10" stroke="currentColor" strokeWidth="1.2" />
      <line x1="10" y1="0" x2="0" y2="10" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}

/**
 * Resolve after the browser has committed and painted a frame. Waiting two
 * animation frames guarantees a full render+paint cycle has elapsed, so a DOM
 * change (e.g. unmounting the screenshot dialog) is actually reflected on screen
 * before we capture the window.
 */
function waitForNextPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  })
}

interface WindowControlsProps {
  isMaximized: boolean
  /** When the profile button sits immediately to the left, drop the auto left margin. */
  hasProfile?: boolean
}

function WindowControls({ isMaximized, hasProfile = false }: WindowControlsProps): React.JSX.Element {
  const isLinux = window.api.platform === 'linux'

  return (
    <div
      className={[
        'topbar__window-controls',
        isLinux ? 'topbar__window-controls--linux' : '',
        hasProfile ? 'topbar__window-controls--with-profile' : ''
      ].filter(Boolean).join(' ')}
      aria-label="Window controls"
    >
      <button
        className="topbar__wc-btn topbar__wc-btn--minimize"
        aria-label="Minimize"
        onClick={() => window.api.window.minimize()}
      >
        <MinimizeIcon />
      </button>
      <button
        className="topbar__wc-btn topbar__wc-btn--maximize"
        aria-label={isMaximized ? 'Restore' : 'Maximize'}
        onClick={() => window.api.window.maximizeRestore()}
      >
        {isMaximized ? <RestoreIcon /> : <MaximizeIcon />}
      </button>
      <button
        className="topbar__wc-btn topbar__wc-btn--close"
        aria-label="Close"
        onClick={() => window.api.window.close()}
      >
        <CloseIcon />
      </button>
    </div>
  )
}

// Profile button shown in the title bar when the side navigation bar is hidden.
// Mirrors the side-nav profile entry: shows the avatar and opens the User
// Profile settings section on click.
function TopBarProfileButton({ className = '' }: { className?: string }): React.JSX.Element {
  const { t } = useTranslation()
  const { profile } = useProfileContext()

  return (
    <button
      className={`topbar__profile${className ? ` ${className}` : ''}`}
      title={profile.displayName || t('nav.sideNav.profile')}
      aria-label={t('nav.sideNav.profile')}
      onClick={() => dispatchMenuAction('view:settings:user-profile')}
    >
      <ProfileAvatar size={24} />
    </button>
  )
}

const MENU_KEYS: MenuKey[] = ['file', 'edit', 'view', 'window', 'help']
const ACCESS_KEY_MAP: Record<string, MenuKey> = { f: 'file', e: 'edit', v: 'view', w: 'window', h: 'help' }
const MENU_ACCESS_LETTERS: Record<MenuKey, string> = { file: 'F', edit: 'E', view: 'V', window: 'W', help: 'H' }

function TopBar({ isLocked = false }: { isLocked?: boolean }): React.JSX.Element {
  const { t } = useTranslation()
  const [menuState, setMenuState] = useState<MenuState | null>(null)
  const [altActive, setAltActive] = useState(false)
  const [barFocusKey, setBarFocusKey] = useState<MenuKey | null>(null)
  const buttonRefs = useRef<Map<MenuKey, HTMLButtonElement>>(new Map())
  const altPressedAloneRef = useRef(false)
  const [showAboutDialog, setShowAboutDialog] = useState(false)
  const [showUpdateDialog, setShowUpdateDialog] = useState(false)
  const [showDownloadDialog, setShowDownloadDialog] = useState(false)
  const [showReleaseNotes, setShowReleaseNotes] = useState(false)
  const [showExportDialog, setShowExportDialog] = useState(false)
  const [showImportDialog, setShowImportDialog] = useState(false)
  const [screenshotPreview, setScreenshotPreview] = useState<ScreenshotPreview | null>(null)
  const [resizeWindowSize, setResizeWindowSize] = useState<{ width: number; height: number } | null>(
    null
  )
  const { hasOpenDocuments, canSaveActive, isDocumentFocused } = useMenuStateContext()
  const { settings, resetSettings } = useSettingsContext()
  const { status, downloadPercent, previousVersion, installUpdate } = useUpdateContext()
  const { previewTip } = useTipsContext()

  const customTitlebar = settings.customTitlebar
  const platform = window.api.platform

  // When the side navigation bar is hidden, surface the user profile in the
  // title bar instead (not while the screen is locked).
  const showProfile = !isLocked && !settings.showSideNavigationBar

  const [isMaximized, setIsMaximized] = useState(false)
  const [isInstalling, setIsInstalling] = useState(false)

  // On macOS with a hidden (custom) title bar the window "traffic light"
  // buttons are a native layer that `capturePage` doesn't include, so we paint
  // artificial ones onto the screenshot to match the real window.
  const showTrafficLights = platform === 'darwin' && customTitlebar

  // Capture the current window and open the Take Screenshot dialog with it as
  // a preview. The size picker in the dialog decides the saved file's size.
  const openScreenshotDialog = useCallback(async () => {
    const preview = await window.api.window.captureScreenshotPreview()
    if (preview) setScreenshotPreview(preview)
  }, [])

  // Capture at the chosen size, overlay traffic lights when needed, then save.
  const saveScreenshot = useCallback(
    async (width: number, height: number) => {
      // The dialog is dismissed just before this runs; wait for the window to
      // repaint without it so the capture doesn't include the dialog itself
      // (the resize path already reflows, but a same-size capture would not).
      await waitForNextPaint()
      const captured = await window.api.window.captureScreenshotAtSize(width, height)
      if (!captured) return
      const dataUrl = showTrafficLights
        ? await composeScreenshotWithTrafficLights(captured.dataUrl, width)
        : captured.dataUrl
      await window.api.window.writeScreenshot(dataUrl)
    },
    [showTrafficLights]
  )

  // Read the current window content size and open the Resize Window dialog with
  // it as the "Current" baseline. The size picker decides the new window size.
  const openResizeDialog = useCallback(async () => {
    const size = await window.api.window.getContentSize()
    if (size) setResizeWindowSize(size)
  }, [])

  useEffect(() => {
    if (platform !== 'darwin') return
    return window.api.menu.onNativeAction((action) => {
      if (action === 'quit') {
        dispatchMenuAction('quit')
      } else if (action === 'about') {
        setShowAboutDialog(true)
      } else if (action === 'help:show-tip') {
        previewTip()
      } else if (action === 'help:take-screenshot') {
        void openScreenshotDialog()
      } else if (action === 'help:resize-window') {
        void openResizeDialog()
      } else {
        dispatchMenuAction(action)
      }
    })
  }, [platform, previewTip, openScreenshotDialog, openResizeDialog])

  useEffect(() => {
    function onMenuAction(e: Event): void {
      const action = (e as CustomEvent<string>).detail
      if (action === 'file:export-environment') setShowExportDialog(true)
      else if (action === 'file:import-environment') setShowImportDialog(true)
    }
    window.addEventListener('menu:file-action', onMenuAction)
    return () => window.removeEventListener('menu:file-action', onMenuAction)
  }, [])

  useEffect(() => {
    if (!customTitlebar) return

    // Sync initial maximized state
    window.api.window.isMaximized().then(setIsMaximized).catch(() => {})

    const unsubMax = window.api.window.onMaximize(() => setIsMaximized(true))
    const unsubUnmax = window.api.window.onUnmaximize(() => setIsMaximized(false))

    return () => {
      unsubMax()
      unsubUnmax()
    }
  }, [customTitlebar])

  const closeMenu = useCallback(() => setMenuState(null), [])

  const openMenuByKey = useCallback((key: MenuKey): void => {
    const btn = buttonRefs.current.get(key)
    if (!btn) return
    const rect = btn.getBoundingClientRect()
    setMenuState((prev) => {
      if (prev?.key === key) return null
      return { key, position: { x: rect.left, y: rect.bottom + 2 } }
    })
  }, [])

  const navigateMenu = useCallback((direction: 1 | -1): void => {
    setMenuState((prev) => {
      if (!prev) return null
      const keys: MenuKey[] = MENU_KEYS
      const currentIndex = keys.indexOf(prev.key)
      const nextKey = keys[(currentIndex + direction + keys.length) % keys.length]
      const btn = buttonRefs.current.get(nextKey)
      if (!btn) return prev
      const rect = btn.getBoundingClientRect()
      return { key: nextKey, position: { x: rect.left, y: rect.bottom + 2 } }
    })
  }, [])

  const navigateToPrev = useCallback(() => navigateMenu(-1), [navigateMenu])
  const navigateToNext = useCallback(() => navigateMenu(1), [navigateMenu])

  useEffect(() => {
    if (platform === 'darwin') return

    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Alt' && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        altPressedAloneRef.current = true
        setAltActive(true)
        return
      }

      if (e.altKey && e.key !== 'Alt') {
        altPressedAloneRef.current = false
        if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
          const menuKey = ACCESS_KEY_MAP[e.key.toLowerCase()]
          if (menuKey) {
            e.preventDefault()
            setBarFocusKey(null)
            openMenuByKey(menuKey)
          }
        }
        return
      }

      if (barFocusKey !== null && menuState === null) {
        if (e.key === 'Escape') {
          e.preventDefault()
          setBarFocusKey(null)
          return
        }
        if (e.key === 'Enter' || e.key === 'ArrowDown') {
          e.preventDefault()
          const key = barFocusKey
          setBarFocusKey(null)
          openMenuByKey(key)
          return
        }
        if (e.key === 'ArrowLeft') {
          e.preventDefault()
          const idx = MENU_KEYS.indexOf(barFocusKey)
          setBarFocusKey(MENU_KEYS[(idx - 1 + MENU_KEYS.length) % MENU_KEYS.length])
          return
        }
        if (e.key === 'ArrowRight') {
          e.preventDefault()
          const idx = MENU_KEYS.indexOf(barFocusKey)
          setBarFocusKey(MENU_KEYS[(idx + 1) % MENU_KEYS.length])
          return
        }
        const menuKey = ACCESS_KEY_MAP[e.key.toLowerCase()]
        if (menuKey) {
          e.preventDefault()
          setBarFocusKey(null)
          openMenuByKey(menuKey)
          return
        }
        setBarFocusKey(null)
      }
    }

    function handleKeyUp(e: KeyboardEvent): void {
      if (e.key !== 'Alt') return
      setAltActive(false)
      if (!altPressedAloneRef.current) return
      altPressedAloneRef.current = false
      if (menuState !== null) return
      setBarFocusKey((prev) => (prev !== null ? null : 'file'))
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [platform, barFocusKey, menuState, openMenuByKey])

  useEffect(() => {
    if (barFocusKey === null) return
    function handleMouseDown(): void {
      setBarFocusKey(null)
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [barFocusKey])

  function renderNavLabel(key: MenuKey): React.ReactNode {
    const label = t(`nav.topBar.${key}`)
    if (!altActive && barFocusKey === null) return label
    const letter = MENU_ACCESS_LETTERS[key]
    const idx = label.toUpperCase().indexOf(letter)
    if (idx === -1) return label
    return (
      <>
        {label.slice(0, idx)}
        <span className="topbar__nav-accesskey">{label[idx]}</span>
        {label.slice(idx + 1)}
      </>
    )
  }

  function handleTopBarDoubleClick(e: React.MouseEvent<HTMLElement>): void {
    if (!customTitlebar) return
    // Only trigger on the topbar itself (not buttons/nav inside it)
    if (e.target !== e.currentTarget) return
    window.api.window.maximizeRestore()
  }

  function openMenu(key: MenuKey, e: React.MouseEvent<HTMLButtonElement>): void {
    const rect = e.currentTarget.getBoundingClientRect()
    if (menuState?.key === key) {
      setMenuState(null)
      return
    }
    setMenuState({ key, position: { x: rect.left, y: rect.bottom + 2 } })
  }

  const fileItems: MenuItem[] = [
    {
      id: 'new',
      label: t('menu.file.new'),
      icon: <FilePlus size={13} />,
      shortcut: 'Ctrl+N',
      onClick: () => dispatchMenuAction('new')
    },
    {
      id: 'open',
      label: t('menu.file.open'),
      icon: <FolderOpen size={13} />,
      shortcut: 'Ctrl+O',
      onClick: () => dispatchMenuAction('open')
    },
    { id: 'sep1', separator: true },
    {
      id: 'save',
      label: t('menu.file.save'),
      icon: <Save size={13} />,
      shortcut: 'Ctrl+S',
      disabled: !canSaveActive,
      onClick: () => dispatchMenuAction('save')
    },
    {
      id: 'save-as',
      label: t('menu.file.saveAs'),
      icon: <Save size={13} />,
      disabled: !hasOpenDocuments,
      onClick: () => dispatchMenuAction('save-as')
    },
    {
      id: 'save-all',
      label: t('menu.file.saveAll'),
      icon: <SaveAll size={13} />,
      disabled: !hasOpenDocuments,
      onClick: () => dispatchMenuAction('save-all')
    },
    { id: 'sep2', separator: true },
    {
      id: 'close',
      label: t('menu.file.close'),
      icon: <X size={13} />,
      disabled: !hasOpenDocuments,
      onClick: () => dispatchMenuAction('close')
    },
    { id: 'sep3', separator: true },
    {
      id: 'import-environment',
      label: t('menu.file.importEnvironment'),
      icon: <Download size={13} />,
      onClick: () => dispatchMenuAction('file:import-environment')
    },
    {
      id: 'export-environment',
      label: t('menu.file.exportEnvironment'),
      icon: <Upload size={13} />,
      onClick: () => dispatchMenuAction('file:export-environment')
    },
    { id: 'sep4', separator: true },
    {
      id: 'quit',
      label: t('menu.file.quit'),
      icon: <LogOut size={13} />,
      onClick: () => dispatchMenuAction('quit')
    }
  ]

  const editItems: MenuItem[] = [
    {
      id: 'cut',
      label: t('menu.edit.cut'),
      icon: <Scissors size={13} />,
      shortcut: 'Ctrl+X',
      disabled: !isDocumentFocused,
      onClick: () => window.api.menu.executeRole('cut')
    },
    {
      id: 'copy',
      label: t('menu.edit.copy'),
      icon: <Copy size={13} />,
      shortcut: 'Ctrl+C',
      disabled: !isDocumentFocused,
      onClick: () => window.api.menu.executeRole('copy')
    },
    {
      id: 'paste',
      label: t('menu.edit.paste'),
      icon: <Clipboard size={13} />,
      shortcut: 'Ctrl+V',
      disabled: !isDocumentFocused,
      onClick: () => window.api.menu.executeRole('paste')
    },
    {
      id: 'delete',
      label: t('menu.edit.delete'),
      icon: <Trash2 size={13} />,
      disabled: !isDocumentFocused,
      onClick: () => window.api.menu.executeRole('delete')
    }
  ]

  const viewItems: MenuItem[] = [
    {
      id: 'explorer',
      label: t('menu.view.explorer'),
      icon: <Database size={13} />,
      onClick: () => dispatchMenuAction('view:explorer')
    },
    {
      id: 'profiler',
      label: t('menu.view.profiler'),
      icon: <Activity size={13} />,
      onClick: () => dispatchMenuAction('view:profiler')
    },
    {
      id: 'compare',
      label: t('menu.view.compare'),
      icon: <GitCompareArrows size={13} />,
      onClick: () => dispatchMenuAction('view:compare')
    },
    {
      id: 'settings',
      label: t('menu.view.settings'),
      icon: <SettingsIcon size={13} />,
      onClick: () => dispatchMenuAction('view:settings')
    },
    {
      id: 'profile',
      label: t('menu.view.profile'),
      icon: <User size={13} />,
      onClick: () => dispatchMenuAction('view:settings:user-profile')
    },
    { id: 'sep1', separator: true },
    {
      id: 'toggle-side-nav',
      label: settings.showSideNavigationBar ? t('menu.view.hideSideNav') : t('menu.view.showSideNav'),
      onClick: () => dispatchMenuAction('view:toggle-side-nav')
    }
  ]

  const windowItems: MenuItem[] = [
    {
      id: 'close-all-tabs',
      label: t('menu.window.closeAllTabs'),
      icon: <X size={13} />,
      disabled: !hasOpenDocuments,
      onClick: () => dispatchMenuAction('window:close-all-tabs')
    },
    { id: 'window-sep1', separator: true },
    {
      id: 'lock-screen',
      label: t('menu.window.lockScreen'),
      icon: <Lock size={13} />,
      shortcut: 'Ctrl+Shift+L',
      onClick: () => void window.api.auth.lockNow()
    }
  ]

  const helpItems: MenuItem[] = [
    {
      id: 'documentation',
      label: t('menu.help.documentation'),
      icon: <BookOpen size={13} />,
      onClick: () => dispatchMenuAction('view:docs')
    },
    { id: 'help-sep-screenshot', separator: true },
    {
      id: 'resize-window',
      label: t('menu.help.resizeWindow'),
      icon: <Scaling size={13} />,
      onClick: () => void openResizeDialog()
    },
    {
      id: 'take-screenshot',
      label: t('menu.help.takeScreenshot'),
      icon: <Camera size={13} />,
      onClick: () => void openScreenshotDialog()
    },
    { id: 'help-sep1', separator: true },
    {
      id: 'show-tip',
      label: t('menu.help.showTip'),
      onClick: () => previewTip()
    },
    ...(window.api.isDev ? [
      { id: 'help-sep-dev', separator: true } as MenuItem,
      {
        id: 'developer-tools',
        label: t('menu.help.developerTools'),
        onClick: () => window.api.app.openDevTools()
      } as MenuItem
    ] : []),
    { id: 'help-sep2', separator: true },
    {
      id: 'check-updates',
      label: t('menu.help.checkForUpdates'),
      onClick: () => window.api.updater.checkForUpdates()
    },
    { id: 'help-sep3', separator: true },
    {
      id: 'about',
      label: t('menu.help.about'),
      onClick: () => setShowAboutDialog(true)
    }
  ]

  const activeItems =
    menuState?.key === 'file' ? fileItems :
    menuState?.key === 'edit' ? editItems :
    menuState?.key === 'window' ? windowItems :
    menuState?.key === 'help' ? helpItems :
    viewItems

  function renderUpdatePill(): React.ReactNode {
    if (status === 'checking') {
      return (
        <span className="topbar__update-pill topbar__update-pill--checking">
          <span className="topbar__update-spinner"><Loader size={12} strokeWidth={2} /></span>
          {t('update.checking')}
        </span>
      )
    }
    if (status === 'downloading') {
      return (
        <button
          className="topbar__update-pill topbar__update-pill--checking"
          onClick={() => setShowDownloadDialog(true)}
        >
          <span className="topbar__update-spinner"><Loader size={12} strokeWidth={2} /></span>
          {t('update.downloadingPill', { percent: downloadPercent ?? 0 })}
        </button>
      )
    }
    if (status === 'downloaded') {
      return (
        <button
          className="topbar__update-pill topbar__update-pill--update"
          onClick={() => {
            setIsInstalling(true)
            installUpdate()
          }}
          disabled={isInstalling}
        >
          {isInstalling ? t('update.installing') : t('update.installUpdate')}
        </button>
      )
    }
    if (status === 'updateAvailable') {
      return (
        <button
          className="topbar__update-pill topbar__update-pill--update"
          onClick={() => setShowUpdateDialog(true)}
        >
          {t('update.updateAvailable')}
        </button>
      )
    }
    if (status === 'upToDate') {
      return (
        <span className="topbar__update-pill topbar__update-pill--success topbar__update-pill--fading-10">
          {t('update.upToDate')}
        </span>
      )
    }
    if (status === 'updated') {
      return (
        <button
          className="topbar__update-pill topbar__update-pill--success topbar__update-pill--success-clickable topbar__update-pill--fading-60"
          onClick={() => setShowReleaseNotes(true)}
        >
          {t('update.updated')}
        </button>
      )
    }
    return null
  }

  const updatePill = renderUpdatePill()

  return (
    <header
      className={`topbar${customTitlebar && platform === 'darwin' ? ' topbar--macos-frame' : ''}`}
      onDoubleClick={handleTopBarDoubleClick}
    >
      <div className={`topbar__brand${platform === 'darwin' ? ' topbar__brand--macos' : ''}`}>
        {platform === 'darwin' && updatePill}
        {platform === 'darwin' && showProfile && <TopBarProfileButton />}
        <div className="topbar__logo-icon">
          <img src={logoUrl} alt="Spiral" className="topbar__logo-svg" />
        </div>
        <span className="topbar__app-name">SPIRAL</span>
      </div>
      {platform !== 'darwin' && !isLocked && (
        <nav className="topbar__nav" aria-label={t('nav.topBar.ariaLabel')}>
          {(['file', 'edit', 'view', 'window', 'help'] as MenuKey[]).map((key) => (
            <button
              key={key}
              ref={(el) => {
                if (el) buttonRefs.current.set(key, el)
              }}
              className={[
                'topbar__nav-item',
                menuState?.key === key ? 'topbar__nav-item--active' : '',
                barFocusKey === key && menuState === null ? 'topbar__nav-item--bar-focused' : ''
              ].filter(Boolean).join(' ')}
              onClick={(e) => openMenu(key, e)}
              onMouseEnter={(e) => {
                if (menuState && menuState.key !== key) {
                  const rect = e.currentTarget.getBoundingClientRect()
                  setMenuState({ key, position: { x: rect.left, y: rect.bottom + 2 } })
                }
              }}
              data-menu-trigger={key}
              aria-haspopup="menu"
              aria-expanded={menuState?.key === key ? 'true' : 'false'}
            >
              {renderNavLabel(key)}
            </button>
          ))}
        </nav>
      )}

      {platform !== 'darwin' && !isLocked && (
        <Menu
          items={menuState ? activeItems : []}
          position={menuState?.position ?? null}
          onClose={closeMenu}
          onNavigatePrev={navigateToPrev}
          onNavigateNext={navigateToNext}
        />
      )}

      {platform !== 'darwin' && !isLocked && updatePill}

      {platform !== 'darwin' && showProfile && (
        <TopBarProfileButton className="topbar__profile--right" />
      )}

      {customTitlebar && platform !== 'darwin' && (
        <WindowControls isMaximized={isMaximized} hasProfile={showProfile} />
      )}

      {showAboutDialog && (
        <AboutDialog onClose={() => setShowAboutDialog(false)} />
      )}

      {showUpdateDialog && (
        <AppUpdateDialog onClose={() => setShowUpdateDialog(false)} />
      )}

      {showDownloadDialog && (
        <DownloadProgressDialog onClose={() => setShowDownloadDialog(false)} />
      )}

      {showReleaseNotes && (
        <ReleaseNotesDialog
          fromVersion={previousVersion ?? undefined}
          onClose={() => setShowReleaseNotes(false)}
        />
      )}

      {showExportDialog && (
        <ExportEnvironmentDialog onClose={() => setShowExportDialog(false)} />
      )}

      {showImportDialog && (
        <ImportEnvironmentDialog
          onClose={() => setShowImportDialog(false)}
          onSettingsImported={resetSettings}
        />
      )}

      <TakeScreenshotDialog
        open={!!screenshotPreview}
        preview={screenshotPreview}
        showTrafficLights={showTrafficLights}
        onCancel={() => setScreenshotPreview(null)}
        onConfirm={(width, height) => {
          setScreenshotPreview(null)
          void saveScreenshot(width, height)
        }}
      />

      <ResizeWindowDialog
        open={!!resizeWindowSize}
        currentWidth={resizeWindowSize?.width ?? 0}
        currentHeight={resizeWindowSize?.height ?? 0}
        onCancel={() => setResizeWindowSize(null)}
        onResize={(width, height) => {
          setResizeWindowSize(null)
          void window.api.window.resizeWindow(width, height)
        }}
      />
    </header>
  )
}

export default TopBar
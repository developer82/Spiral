import {
  app,
  shell,
  BrowserWindow,
  ipcMain,
  nativeTheme,
  dialog,
  Menu,
  powerMonitor,
  nativeImage
} from 'electron'
import { join, extname, basename } from 'path'
import { readFile, writeFile, copyFile, unlink, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { randomUUID } from 'crypto'
import { execFile } from 'node:child_process'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

import store, {
  comparisonsStore,
  connectionsStore,
  profileStore,
  DEFAULT_SETTINGS,
  type AppSettings,
  type ComparisonRecord,
  type ConnectionRecord
} from './store'
import { hashPassword, verifyPassword } from './profileAuth'
import { checkLockout, recordFailedAttempt, clearLockoutState } from './lockout'
import {
  clearSessionKey,
  decryptAllConnections,
  decryptPassword,
  decryptProfilePasswords,
  deriveEncryptionKey,
  encryptAllConnections,
  encryptPassword,
  encryptProfilePasswords,
  generateEncryptionSalt,
  getSessionKey,
  isEncrypted,
  loadPersistedKey,
  persistSessionKey,
  resolveConnectionPassword,
  setSessionKey
} from './connectionEncryption'
import {
  initAutoUpdater,
  registerUpdaterIpcHandlers,
  checkForUpdates,
  getPendingInstallVersion,
  isUpdating
} from './updater'
import { trackAppOpen, trackEvent, trackPageView } from './analytics/analytics'
import {
  readAndConsumeAutosave,
  writeAutosave,
  clearAutosave,
  clearAutosaveSync,
  type DraftDocument
} from './autosave'
import { databaseManager } from './database/DatabaseManager'
import { executeComparison } from './comparisons/executeComparison'
import { buildSyncScript, buildRevertScript } from './comparisons/buildSyncScript'
import type { ComparisonSyncDirection, BackupOptions, RestoreOptions, MySqlBackupOptions, MySqlRestoreOptions, PostgresBackupOptions, PostgresRestoreOptions, SqliteBackupOptions, SqliteRestoreOptions, RedisBackupOptions, RedisRestoreOptions, MongoBackupOptions, MongoRestoreOptions } from './database/types'
import { profilerManager, type ProfilerSessionConfig } from './profiler/ProfilerManager'
import { ModelManager, DEFAULT_MODEL_ID } from './ai/ModelManager'
import { AiService } from './ai/AiService'
import type { AiChatRequest } from '../shared/ai.types'

let aiService: AiService | null = null

// Tracks renderer menu state for enabling/disabling macOS native menu items
let macMenuState = {
  hasOpenDocuments: false,
  canSaveActive: false,
  isDocumentFocused: false
}

function getMacSideNavigationBarLabel(): string {
  return store.get('showSideNavigationBar') ? 'Hide Side Navigation Bar' : 'Show Side Navigation Bar'
}

function buildMacMenu(): void {
  app.name = 'Spiral'

  const send = (action: string) => BrowserWindow.getAllWindows()[0]?.webContents.send('menu:native-action', action)
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'Spiral',
      submenu: [
        {
          label: 'About Spiral',
          click: () => send('about')
        },
        {
          id: 'mac-spiral-check-updates',
          label: 'Check for Updates...',
          click: () => send('updater:check-for-updates-menu')
        },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        {
          label: 'Quit Spiral',
          accelerator: 'CmdOrCtrl+Q',
          click: () => {
            markUserInitiatedQuit()
            app.quit()
          }
        }
      ]
    },
    {
      label: 'File',
      submenu: [
        {
          id: 'mac-file-new',
          label: 'New',
          accelerator: 'CmdOrCtrl+N',
          click: () => send('new')
        },
        {
          id: 'mac-file-open',
          label: 'Open...',
          accelerator: 'CmdOrCtrl+O',
          click: () => send('open')
        },
        { type: 'separator' },
        {
          id: 'mac-file-save',
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          enabled: macMenuState.hasOpenDocuments && macMenuState.canSaveActive,
          click: () => send('save')
        },
        {
          id: 'mac-file-save-as',
          label: 'Save As...',
          enabled: macMenuState.hasOpenDocuments,
          click: () => send('save-as')
        },
        {
          id: 'mac-file-save-all',
          label: 'Save All',
          enabled: macMenuState.hasOpenDocuments,
          click: () => send('save-all')
        },
        { type: 'separator' },
        {
          id: 'mac-file-close',
          label: 'Close Tab',
          enabled: macMenuState.hasOpenDocuments,
          click: () => send('close')
        },
        { type: 'separator' },
        {
          id: 'mac-file-import-environment',
          label: 'Import Environment',
          click: () => send('file:import-environment')
        },
        {
          id: 'mac-file-export-environment',
          label: 'Export Environment',
          click: () => send('file:export-environment')
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'delete' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          id: 'mac-view-explorer',
          label: 'Explorer',
          click: () => send('view:explorer')
        },
        {
          id: 'mac-view-profiler',
          label: 'Profiler',
          click: () => send('view:profiler')
        },
        {
          id: 'mac-view-compare',
          label: 'Compare',
          click: () => send('view:compare')
        },
        {
          id: 'mac-view-settings',
          label: 'Settings',
          click: () => send('view:settings')
        },
        {
          id: 'mac-view-profile',
          label: 'Profile',
          click: () => send('view:settings:user-profile')
        },
        { type: 'separator' },
        {
          id: 'mac-view-toggle-side-nav',
          label: getMacSideNavigationBarLabel(),
          click: () => send('view:toggle-side-nav')
        },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        {
          id: 'mac-window-close-all-tabs',
          label: 'Close All Tabs',
          enabled: macMenuState.hasOpenDocuments,
          click: () => send('window:close-all-tabs')
        },
        { type: 'separator' },
        { role: 'front' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          id: 'mac-help-documentation',
          label: 'Documentation',
          click: () => send('view:docs')
        },
        { type: 'separator' },
        {
          id: 'mac-help-resize-window',
          label: 'Resize Window',
          click: () => send('help:resize-window')
        },
        {
          id: 'mac-help-take-screenshot',
          label: 'Take Screenshot',
          click: () => send('help:take-screenshot')
        },
        { type: 'separator' },
        {
          id: 'mac-help-show-tip',
          label: 'Show Tip',
          click: () => send('help:show-tip')
        },
        ...(is.dev ? [
          { type: 'separator' as const },
          {
            id: 'mac-help-developer-tools',
            label: 'Show Developer Tools',
            click: () => BrowserWindow.getAllWindows()[0]?.webContents.openDevTools()
          }
        ] : [])
      ]
    }
  ]
  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

function updateMacMenuState(): void {
  const menu = Menu.getApplicationMenu()
  if (!menu) return
  const saveItem = menu.getMenuItemById('mac-file-save')
  const saveAsItem = menu.getMenuItemById('mac-file-save-as')
  const saveAllItem = menu.getMenuItemById('mac-file-save-all')
  const closeItem = menu.getMenuItemById('mac-file-close')
  const sideNavToggleItem = menu.getMenuItemById('mac-view-toggle-side-nav')
  if (saveItem) saveItem.enabled = macMenuState.hasOpenDocuments && macMenuState.canSaveActive
  if (saveAsItem) saveAsItem.enabled = macMenuState.hasOpenDocuments
  if (saveAllItem) saveAllItem.enabled = macMenuState.hasOpenDocuments
  if (closeItem) closeItem.enabled = macMenuState.hasOpenDocuments
  const closeAllItem = menu.getMenuItemById('mac-window-close-all-tabs')
  if (closeAllItem) closeAllItem.enabled = macMenuState.hasOpenDocuments
  if (sideNavToggleItem) sideNavToggleItem.label = getMacSideNavigationBarLabel()
}

/**
 * Capture the rendered app UI at its current size, returning a PNG data URL
 * alongside the current content dimensions. Used to populate the preview in the
 * renderer's Take Screenshot dialog before the user picks an output size.
 */
async function captureCurrentWindow(
  win: BrowserWindow | null
): Promise<{ dataUrl: string; width: number; height: number } | null> {
  if (!win) return null
  const image = await win.webContents.capturePage()
  const { width, height } = win.getContentBounds()
  return { dataUrl: image.toDataURL(), width, height }
}

/**
 * Capture the rendered app UI at the requested size and return it as a PNG data
 * URL. When the target differs from the current content size the window is
 * briefly resized so the UI reflows at that resolution, then restored to its
 * original bounds (and re-maximized if it was maximized).
 *
 * The captured image only contains the web layer; on macOS the native window
 * "traffic light" buttons live in a separate layer and are not included, so the
 * renderer composites artificial ones on before saving. See the renderer's
 * `trafficLights` helper.
 */
async function captureScreenshotAtSize(
  win: BrowserWindow | null,
  targetWidth: number,
  targetHeight: number
): Promise<{ dataUrl: string } | null> {
  if (!win) return null
  // Remember the current window state so we can restore it after resizing.
  const bounds = win.getBounds()
  const wasMaximized = win.isMaximized()
  const { width: curWidth, height: curHeight } = win.getContentBounds()
  const needsResize = targetWidth !== curWidth || targetHeight !== curHeight

  if (needsResize) {
    // Maximized windows ignore size changes, so leave that state first.
    if (wasMaximized) win.unmaximize()
    win.setContentSize(targetWidth, targetHeight)
    // Wait briefly so the resize re-renders before we capture.
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
  const image = await win.webContents.capturePage()

  // Snap the window back to its original size/position, so the resize is barely
  // noticeable.
  if (needsResize) {
    win.setBounds(bounds)
    if (wasMaximized) win.maximize()
  }

  return { dataUrl: image.toDataURL() }
}

/**
 * Prompt for a destination and write a PNG (provided as a data URL) to disk.
 * Used to save a screenshot after the renderer has composited any overlays
 * (e.g. macOS traffic lights) onto the captured image. Returns whether a file
 * was written.
 */
async function saveScreenshotToFile(win: BrowserWindow | null, dataUrl: string): Promise<boolean> {
  if (!win) return false
  const image = nativeImage.createFromDataURL(dataUrl)
  if (image.isEmpty()) return false

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const result = await dialog.showSaveDialog(win, {
    defaultPath: `Spiral-Screenshot-${timestamp}.png`,
    filters: [
      { name: 'PNG Images', extensions: ['png'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  })
  if (result.canceled || !result.filePath) return false
  await writeFile(result.filePath, image.toPNG())
  return true
}

/** Send a lock request to all renderer windows. */
function sendLockRequest(): void {
  clearSessionKey()
  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send('auth:lock')
  })
}

function createWindow(): void {
  const customTitlebar: boolean = store.get('customTitlebar')
  const isMac = process.platform === 'darwin'

  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    title: 'SPIRAL',
    autoHideMenuBar: true,
    icon,
    // Remove native titlebar when custom titlebar is enabled
    ...(customTitlebar && isMac
      ? { titleBarStyle: 'hidden', trafficLightPosition: { x: 12, y: 11 } }
      : {}),
    ...(customTitlebar && !isMac ? { frame: false } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  // Push maximize/unmaximize events to renderer
  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('window:maximized')
  })
  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window:unmaximized')
  })
  mainWindow.on('minimize', () => {
    if (profileStore.get('passwordMeta') && profileStore.get('lockOnMinimize')) {
      sendLockRequest()
    }
  })

  const showMainWindow = (): void => {
    if (mainWindow.isDestroyed() || mainWindow.isVisible()) return
    mainWindow.maximize()
    mainWindow.show()
  }

  mainWindow.on('ready-to-show', showMainWindow)

  // Fallback: on some Linux/Wayland sessions the GPU process crash-loops and the
  // renderer never paints, so `ready-to-show` never fires and the window stays
  // hidden. Force it visible once the page has loaded so the app always opens.
  mainWindow.webContents.once('did-finish-load', () => {
    setTimeout(showMainWindow, 1000)
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Block in-window navigation. A drag-and-drop that lands outside a drop zone
  // otherwise makes Chromium navigate the window to the dropped data, blanking
  // the app. The app is a SPA and never navigates the top frame intentionally.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const currentUrl = mainWindow.webContents.getURL()
    if (url !== currentUrl) event.preventDefault()
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
/**
 * Drafts recovered from a previous unclean shutdown, read once at startup.
 * Exposed to the renderer via the `autosave:get-recovered` IPC channel.
 */
let recoveredDrafts: DraftDocument[] = []

/**
 * True once the user has deliberately quit Spiral through one of the app's own
 * affordances (the Quit menu item / Cmd+Q, the titlebar close/quit buttons, or
 * closing the last window on Windows/Linux). Only a deliberate quit clears the
 * autosave manifest; any other path into `before-quit` — a macOS "Force Quit",
 * a dock Quit, or an OS shutdown — leaves the manifest so the documents can be
 * recovered on the next launch. A genuine crash never reaches `before-quit` at
 * all, so its manifest is likewise preserved.
 */
let userInitiatedQuit = false

/** Marks the current quit as a deliberate, user-initiated shutdown. */
function markUserInitiatedQuit(): void {
  userInitiatedQuit = true
}

app.whenReady().then(async () => {
  // Read (and delete) any autosave manifest left behind by an unclean shutdown
  // before anything else can overwrite it.
  recoveredDrafts = await readAndConsumeAutosave()

  // Load persisted connection encryption key from OS-native secure storage
  const connectionKeyEncrypted = profileStore.get('connectionKeyEncrypted')
  if (connectionKeyEncrypted) {
    const key = loadPersistedKey(connectionKeyEncrypted)
    if (key) setSessionKey(key)
  }

  // Set app user model id for windows
  electronApp.setAppUserModelId('com.spiral')

  // Set dock icon on macOS (important in development mode)
  if (process.platform === 'darwin') {
    app.dock?.setIcon(icon)
  }

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  ipcMain.on('settings:get-all-sync', (event) => {
    event.returnValue = store.store
  })

  ipcMain.handle('settings:get-all', () => store.store)

  ipcMain.handle('settings:set', <K extends keyof AppSettings>(_event: Electron.IpcMainInvokeEvent, key: K, value: AppSettings[K]) => {
    store.set(key, value)
    if (key === 'nativeThemeSource') {
      nativeTheme.themeSource = value as 'dark' | 'light' | 'system'
    }
    if (key === 'showSideNavigationBar') {
      updateMacMenuState()
    }
  })

  ipcMain.handle('settings:reset', () => {
    store.set(DEFAULT_SETTINGS)
    nativeTheme.themeSource = DEFAULT_SETTINGS.nativeThemeSource
    updateMacMenuState()
  })

  ipcMain.handle(
    'analytics:track',
    (_event: Electron.IpcMainInvokeEvent, name: string, params?: Record<string, unknown>) => {
      trackEvent(name, params)
    }
  )

  ipcMain.handle('analytics:page-view', (_event: Electron.IpcMainInvokeEvent, pageId: string) => {
    trackPageView(pageId)
  })

  ipcMain.handle('connections:get-all', () => {
    const connections = connectionsStore.get('connections')
    // Filter out ERD file references where the file no longer exists on disk
    let changed = false
    const cleaned = connections.map((conn) => {
      if (!conn.erdFiles || conn.erdFiles.length === 0) return conn
      const validFiles = conn.erdFiles.filter((f) => existsSync(f.filePath))
      if (validFiles.length !== conn.erdFiles.length) {
        changed = true
        return { ...conn, erdFiles: validFiles }
      }
      return conn
    })
    if (changed) connectionsStore.set('connections', cleaned)
    const key = getSessionKey()
    if (!key) {
      // Without the session key we cannot decrypt — blank out any encrypted
      // passwords (main and per-profile) so the renderer never sees ciphertext.
      return cleaned.map((conn) => ({
        ...conn,
        password: isEncrypted(conn.password) ? '' : conn.password,
        additionalUsers: conn.additionalUsers?.map((u) => ({
          ...u,
          password: u.password && isEncrypted(u.password) ? '' : u.password
        }))
      }))
    }
    return cleaned.map((conn) => ({
      ...conn,
      password: isEncrypted(conn.password) ? decryptPassword(conn.password, key) : conn.password,
      additionalUsers: decryptProfilePasswords(conn.additionalUsers, key)
    }))
  })

  ipcMain.handle(
    'connections:create',
    (_event: Electron.IpcMainInvokeEvent, record: Omit<ConnectionRecord, 'id'>) => {
      const key = getSessionKey()
      const storedPassword =
        record.rememberPassword && record.password
          ? key
            ? encryptPassword(record.password, key)
            : record.password
          : ''
      const newRecord: ConnectionRecord = {
        ...record,
        id: randomUUID(),
        password: storedPassword,
        additionalUsers: key
          ? encryptProfilePasswords(record.additionalUsers, key)
          : record.additionalUsers,
        createdAt: new Date().toISOString()
      }
      const existing = connectionsStore.get('connections')
      connectionsStore.set('connections', [...existing, newRecord])
      // Return plaintext to the renderer so it retains usable credentials.
      return {
        ...newRecord,
        password: record.rememberPassword ? record.password : '',
        additionalUsers: record.additionalUsers
      }
    }
  )

  ipcMain.handle(
    'connections:update',
    (_event: Electron.IpcMainInvokeEvent, record: ConnectionRecord) => {
      const key = getSessionKey()
      const storedPassword =
        record.rememberPassword && record.password
          ? key
            ? encryptPassword(record.password, key)
            : record.password
          : ''
      const updated: ConnectionRecord = {
        ...record,
        password: storedPassword,
        additionalUsers: key
          ? encryptProfilePasswords(record.additionalUsers, key)
          : record.additionalUsers
      }
      const existing = connectionsStore.get('connections')
      connectionsStore.set(
        'connections',
        existing.map((c) => (c.id === record.id ? updated : c))
      )
      // Return plaintext to the renderer so it retains usable credentials.
      return {
        ...updated,
        password: record.rememberPassword ? record.password : '',
        additionalUsers: record.additionalUsers
      }
    }
  )

  ipcMain.handle('connections:delete', (_event: Electron.IpcMainInvokeEvent, connectionId: string) => {
    databaseManager.stopWatch(connectionId)
    const existing = connectionsStore.get('connections')
    connectionsStore.set('connections', existing.filter((c) => c.id !== connectionId))
  })

  ipcMain.handle('comparisons:get-all', () => comparisonsStore.get('comparisons'))

  ipcMain.handle(
    'comparisons:create',
    (
      _event: Electron.IpcMainInvokeEvent,
      record: Omit<ComparisonRecord, 'id' | 'createdAt' | 'updatedAt'>
    ) => {
      const timestamp = new Date().toISOString()
      const newRecord: ComparisonRecord = {
        ...record,
        id: randomUUID(),
        createdAt: timestamp,
        updatedAt: timestamp
      }
      const existing = comparisonsStore.get('comparisons')
      comparisonsStore.set('comparisons', [...existing, newRecord])
      return newRecord
    }
  )

  ipcMain.handle(
    'comparisons:update',
    (_event: Electron.IpcMainInvokeEvent, record: ComparisonRecord) => {
      const updated: ComparisonRecord = {
        ...record,
        updatedAt: new Date().toISOString()
      }
      const existing = comparisonsStore.get('comparisons')
      comparisonsStore.set(
        'comparisons',
        existing.map((comparison) => (comparison.id === record.id ? updated : comparison))
      )
      return updated
    }
  )

  ipcMain.handle('comparisons:delete', (_event: Electron.IpcMainInvokeEvent, comparisonId: string) => {
    const existing = comparisonsStore.get('comparisons')
    comparisonsStore.set(
      'comparisons',
      existing.filter((comparison) => comparison.id !== comparisonId)
    )
  })

  ipcMain.handle('comparisons:execute', async (_event: Electron.IpcMainInvokeEvent, comparisonId: string) => {
    const comparisons = comparisonsStore.get('comparisons')
    const comparison = comparisons.find((item) => item.id === comparisonId)
    if (!comparison) {
      throw new Error('Comparison not found')
    }

    const connections = connectionsStore.get('connections')
    const sourceConnection = connections.find((item) => item.id === comparison.source.connectionId)
    const targetConnection = connections.find((item) => item.id === comparison.target.connectionId)

    if (!sourceConnection || !targetConnection) {
      throw new Error('One or more comparison connections could not be found')
    }

    const [sourceConnectResult, targetConnectResult] = await Promise.all([
      databaseManager.connect(resolveConnectionPassword(sourceConnection)),
      databaseManager.connect(resolveConnectionPassword(targetConnection))
    ])

    if (sourceConnectResult.status === 'error') {
      throw new Error(sourceConnectResult.message)
    }

    if (targetConnectResult.status === 'error') {
      throw new Error(targetConnectResult.message)
    }

    try {
      // Clear stale explorer cache so the comparison always reads fresh data from the database
      databaseManager.clearConnectionCache(comparison.source.connectionId)
      databaseManager.clearConnectionCache(comparison.target.connectionId)
      return await executeComparison(
        { databaseManager },
        comparison,
        sourceConnection,
        targetConnection
      )
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message || err.name || 'An unexpected error occurred during the comparison'
          : String(err) || 'An unexpected error occurred during the comparison'
      throw new Error(message)
    }
  })

  ipcMain.handle(
    'comparisons:generate-sync-script',
    async (
      _event: Electron.IpcMainInvokeEvent,
      comparisonId: string,
      report: unknown,
      direction: ComparisonSyncDirection
    ) => {
      const comparisons = comparisonsStore.get('comparisons')
      const comparison = comparisons.find((item) => item.id === comparisonId)
      if (!comparison) {
        return { status: 'error', message: 'Comparison not found' }
      }
      return buildSyncScript({ databaseManager }, comparison, report as Parameters<typeof buildSyncScript>[2], direction)
    }
  )

  ipcMain.handle(
    'comparisons:execute-sync',
    async (
      _event: Electron.IpcMainInvokeEvent,
      comparisonId: string,
      report: unknown,
      direction: ComparisonSyncDirection,
      generateRevertScript: boolean
    ) => {
      const comparisons = comparisonsStore.get('comparisons')
      const comparison = comparisons.find((item) => item.id === comparisonId)
      if (!comparison) {
        return { status: 'error', message: 'Comparison not found' }
      }

      const typedReport = report as Parameters<typeof buildSyncScript>[2]

      // Optionally generate the revert script BEFORE executing the forward script
      let revertScript: string | undefined
      if (generateRevertScript) {
        const revertResult = await buildRevertScript({ databaseManager }, comparison, typedReport, direction)
        if (revertResult.status === 'ok') {
          revertScript = revertResult.script
        }
      }

      const scriptResult = await buildSyncScript({ databaseManager }, comparison, typedReport, direction)
      if (scriptResult.status === 'error') {
        return { status: 'error', message: scriptResult.message }
      }

      const receiverConnectionId =
        direction === 'forward' ? comparison.target.connectionId : comparison.source.connectionId
      const receiverDatabaseName =
        direction === 'forward' ? comparison.target.databaseName : comparison.source.databaseName

      // Only execute the non-skipped sections
      const executableSections = (scriptResult.sections ?? []).filter((s) => !s.skipped && s.sql)
      for (const section of executableSections) {
        const execResult = await databaseManager.executeQuery(
          receiverConnectionId,
          section.sql!,
          undefined,
          false,
          false,
          receiverDatabaseName
        )
        if (execResult.status === 'error') {
          return {
            status: 'error',
            message: `Failed to apply "${section.objectName}": ${execResult.message}`
          }
        }
      }

      return { status: 'ok', revertScript }
    }
  )

  ipcMain.handle('database:disconnect', async (_event: Electron.IpcMainInvokeEvent, connectionId: string) => {
    await databaseManager.disconnect(connectionId)
  })

  ipcMain.handle('database:connect', async (
    event: Electron.IpcMainInvokeEvent,
    connectionId: string,
    credentials?: { username?: string; password: string }
  ) => {
    const connections = connectionsStore.get('connections')
    const record = connections.find((c) => c.id === connectionId)
    if (!record) {
      return { status: 'error', message: 'Connection not found' }
    }
    // When credentials are supplied (password not saved on the profile), use them
    // for this connect only — they are never persisted here.
    const resolved = resolveConnectionPassword(record)
    const recordToConnect = credentials
      ? { ...resolved, username: credentials.username ?? resolved.username, password: credentials.password }
      : resolved
    const result = await databaseManager.connect(recordToConnect)
    if (result.status === 'connected') {
      const lastUsedAt = new Date().toISOString()
      const updatedRecord: ConnectionRecord = { ...record, lastUsedAt }
      connectionsStore.set(
        'connections',
        connectionsStore.get('connections').map((c) => (c.id === connectionId ? updatedRecord : c))
      )
      if (record.eagerLoading) {
        const showSystemDatabases: boolean = store.get('showSystemDatabases')
        event.sender.send('database:eager-load-status', { connectionId, status: 'loading' })
        databaseManager.startEagerLoad(connectionId, showSystemDatabases)
          .then(() => event.sender.send('database:eager-load-status', { connectionId, status: 'complete' }))
          .catch(() => event.sender.send('database:eager-load-status', { connectionId, status: 'error' }))
      }
    }
    return result
  })

  ipcMain.handle(
    'database:get-children',
    async (_event: Electron.IpcMainInvokeEvent, connectionId: string, nodeId: string) => {
      const showSystemDatabases: boolean = store.get('showSystemDatabases')
      return databaseManager.getChildren(connectionId, nodeId, { showSystemDatabases })
    }
  )

  ipcMain.handle(
    'database:get-databases',
    async (_event: Electron.IpcMainInvokeEvent, connectionId: string) => {
      const connections = connectionsStore.get('connections')
      const record = connections.find((connection) => connection.id === connectionId)
      if (!record) {
        return { status: 'error', message: 'Connection not found' }
      }

      const connectResult = await databaseManager.connect(resolveConnectionPassword(record))
      if (connectResult.status === 'error') {
        return connectResult
      }

      const showSystemDatabases: boolean = store.get('showSystemDatabases')
      const result = await databaseManager.getChildren(connectionId, 'databases', {
        showSystemDatabases
      })

      if (result.status === 'error') {
        return { status: 'error', message: result.message }
      }

      return {
        status: 'ok',
        databases: result.children.map((database) => database.label)
      }
    }
  )

  ipcMain.handle(
    'database:execute-query',
    async (_event: Electron.IpcMainInvokeEvent, connectionId: string, querySql: string, withPlan?: boolean, withStatistics?: boolean, databaseName?: string) => {
      const queryTimeoutSeconds: number = store.get('queryTimeout')
      const timeoutMs = queryTimeoutSeconds > 0 ? queryTimeoutSeconds * 1000 : 0
      return databaseManager.executeQuery(connectionId, querySql, timeoutMs, withPlan, withStatistics, databaseName)
    }
  )

  ipcMain.handle(
    'database:create-database',
    async (_event: Electron.IpcMainInvokeEvent, connectionId: string, databaseName: string) => {
      return databaseManager.createDatabase(connectionId, databaseName)
    }
  )

  ipcMain.handle(
    'database:list-server-drives',
    async (_event: Electron.IpcMainInvokeEvent, connectionId: string) => {
      return databaseManager.listServerDrives(connectionId)
    }
  )

  ipcMain.handle(
    'database:list-server-dir',
    async (_event: Electron.IpcMainInvokeEvent, connectionId: string, path: string) => {
      return databaseManager.listServerDir(connectionId, path)
    }
  )

  ipcMain.handle(
    'database:get-database-files',
    async (_event: Electron.IpcMainInvokeEvent, connectionId: string, databaseName: string) => {
      return databaseManager.getDatabaseFiles(connectionId, databaseName)
    }
  )

  ipcMain.handle(
    'database:build-backup-sql',
    async (_event: Electron.IpcMainInvokeEvent, connectionId: string, opts: BackupOptions) => {
      return databaseManager.buildBackupSql(connectionId, opts)
    }
  )

  ipcMain.handle(
    'database:execute-backup',
    async (_event: Electron.IpcMainInvokeEvent, connectionId: string, opts: BackupOptions) => {
      return databaseManager.executeBackup(connectionId, opts)
    }
  )

  ipcMain.handle(
    'database:read-backup-header',
    async (_event: Electron.IpcMainInvokeEvent, connectionId: string, path: string) => {
      return databaseManager.readBackupHeader(connectionId, path)
    }
  )

  ipcMain.handle(
    'database:read-backup-file-list',
    async (_event: Electron.IpcMainInvokeEvent, connectionId: string, path: string, position: number) => {
      return databaseManager.readBackupFileList(connectionId, path, position)
    }
  )

  ipcMain.handle(
    'database:get-backup-sets',
    async (_event: Electron.IpcMainInvokeEvent, connectionId: string, databaseName: string) => {
      return databaseManager.getBackupSets(connectionId, databaseName)
    }
  )

  ipcMain.handle(
    'database:build-restore-sql',
    async (_event: Electron.IpcMainInvokeEvent, connectionId: string, opts: RestoreOptions) => {
      return databaseManager.buildRestoreSql(connectionId, opts)
    }
  )

  ipcMain.handle(
    'database:execute-restore',
    async (_event: Electron.IpcMainInvokeEvent, connectionId: string, opts: RestoreOptions) => {
      return databaseManager.executeRestore(connectionId, opts)
    }
  )

  // ─── MySQL Backup & Restore (local) ───────────────────────────────────────

  ipcMain.handle(
    'mysql:get-backup-tools',
    async (
      _event: Electron.IpcMainInvokeEvent,
      connectionId: string,
      paths?: { mysqlDumpPath?: string; mysqlClientPath?: string }
    ) => {
      return databaseManager.mysqlGetBackupTools(connectionId, paths)
    }
  )

  ipcMain.handle(
    'mysql:build-backup-preview',
    async (_event: Electron.IpcMainInvokeEvent, connectionId: string, opts: MySqlBackupOptions) => {
      return databaseManager.mysqlBuildBackupPreview(connectionId, opts)
    }
  )

  ipcMain.handle(
    'mysql:execute-backup',
    async (_event: Electron.IpcMainInvokeEvent, connectionId: string, opts: MySqlBackupOptions) => {
      return databaseManager.mysqlExecuteBackup(connectionId, opts)
    }
  )

  ipcMain.handle(
    'mysql:execute-restore',
    async (_event: Electron.IpcMainInvokeEvent, connectionId: string, opts: MySqlRestoreOptions) => {
      return databaseManager.mysqlExecuteRestore(connectionId, opts)
    }
  )

  ipcMain.handle(
    'mysql:pick-backup-path',
    async (
      event: Electron.IpcMainInvokeEvent,
      options?: { defaultFileName?: string; compress?: boolean }
    ) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      const ext = options?.compress ? 'sql.gz' : 'sql'
      const result = await dialog.showSaveDialog(win ?? BrowserWindow.getFocusedWindow()!, {
        defaultPath: options?.defaultFileName,
        filters: [
          { name: 'SQL Dump', extensions: ['sql'] },
          { name: 'Gzipped SQL Dump', extensions: ['sql.gz', 'gz'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      })
      if (result.canceled || !result.filePath) {
        return { status: 'cancelled' }
      }
      let filePath = result.filePath
      // Ensure the chosen path carries the expected extension.
      if (options?.compress && !/\.gz$/i.test(filePath)) {
        filePath = /\.sql$/i.test(filePath) ? `${filePath}.gz` : `${filePath}.${ext}`
      } else if (!options?.compress && !/\.sql$/i.test(filePath)) {
        filePath = `${filePath}.sql`
      }
      return { status: 'ok', filePath }
    }
  )

  ipcMain.handle('mysql:pick-restore-file', async (event: Electron.IpcMainInvokeEvent) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(win ?? BrowserWindow.getFocusedWindow()!, {
      filters: [
        { name: 'SQL Dump', extensions: ['sql', 'sql.gz', 'gz'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      properties: ['openFile']
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { status: 'cancelled' }
    }
    return { status: 'ok', filePath: result.filePaths[0] }
  })

  ipcMain.handle(
    'mongo:get-backup-tools',
    async (
      _event: Electron.IpcMainInvokeEvent,
      connectionId: string,
      paths?: { mongodumpPath?: string; mongorestorePath?: string }
    ) => {
      return databaseManager.mongoGetBackupTools(connectionId, paths)
    }
  )

  ipcMain.handle(
    'mongo:build-backup-preview',
    async (_event: Electron.IpcMainInvokeEvent, connectionId: string, opts: MongoBackupOptions) => {
      return databaseManager.mongoBuildBackupPreview(connectionId, opts)
    }
  )

  ipcMain.handle(
    'mongo:execute-backup',
    async (_event: Electron.IpcMainInvokeEvent, connectionId: string, opts: MongoBackupOptions) => {
      return databaseManager.mongoExecuteBackup(connectionId, opts)
    }
  )

  ipcMain.handle(
    'mongo:execute-restore',
    async (_event: Electron.IpcMainInvokeEvent, connectionId: string, opts: MongoRestoreOptions) => {
      return databaseManager.mongoExecuteRestore(connectionId, opts)
    }
  )

  ipcMain.handle(
    'mongo:pick-backup-path',
    async (
      event: Electron.IpcMainInvokeEvent,
      options?: { defaultFileName?: string; gzip?: boolean; engine?: 'mongodump' | 'js' }
    ) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      // The JS engine writes EJSON (.json); mongodump writes a BSON archive (.archive).
      const isArchive = options?.engine !== 'js'
      const base = isArchive ? 'archive' : 'json'
      const ext = options?.gzip ? `${base}.gz` : base
      const filters = isArchive
        ? [
            { name: 'MongoDB Archive', extensions: ['archive'] },
            { name: 'Gzipped MongoDB Archive', extensions: ['archive.gz', 'gz'] },
            { name: 'All Files', extensions: ['*'] }
          ]
        : [
            { name: 'MongoDB EJSON Backup', extensions: ['json'] },
            { name: 'Gzipped EJSON Backup', extensions: ['json.gz', 'gz'] },
            { name: 'All Files', extensions: ['*'] }
          ]
      const result = await dialog.showSaveDialog(win ?? BrowserWindow.getFocusedWindow()!, {
        defaultPath: options?.defaultFileName,
        filters
      })
      if (result.canceled || !result.filePath) {
        return { status: 'cancelled' }
      }
      let filePath = result.filePath
      const baseRe = isArchive ? /\.archive$/i : /\.json$/i
      // Ensure the chosen path carries the expected extension.
      if (options?.gzip && !/\.gz$/i.test(filePath)) {
        filePath = baseRe.test(filePath) ? `${filePath}.gz` : `${filePath}.${ext}`
      } else if (!options?.gzip && !baseRe.test(filePath)) {
        filePath = `${filePath}.${base}`
      }
      return { status: 'ok', filePath }
    }
  )

  ipcMain.handle('mongo:pick-restore-file', async (event: Electron.IpcMainInvokeEvent) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(win ?? BrowserWindow.getFocusedWindow()!, {
      filters: [
        { name: 'MongoDB Backup', extensions: ['archive', 'archive.gz', 'json', 'json.gz', 'gz'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      properties: ['openFile']
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { status: 'cancelled' }
    }
    return { status: 'ok', filePath: result.filePaths[0] }
  })

  ipcMain.handle(
    'redis:execute-backup',
    async (_event: Electron.IpcMainInvokeEvent, connectionId: string, opts: RedisBackupOptions) => {
      return databaseManager.redisBackup(connectionId, opts)
    }
  )

  ipcMain.handle(
    'redis:execute-restore',
    async (
      _event: Electron.IpcMainInvokeEvent,
      connectionId: string,
      opts: RedisRestoreOptions
    ) => {
      return databaseManager.redisRestore(connectionId, opts)
    }
  )

  ipcMain.handle(
    'redis:pick-backup-path',
    async (
      event: Electron.IpcMainInvokeEvent,
      options?: { defaultFileName?: string; compress?: boolean }
    ) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      const ext = options?.compress ? 'json.gz' : 'json'
      const result = await dialog.showSaveDialog(win ?? BrowserWindow.getFocusedWindow()!, {
        defaultPath: options?.defaultFileName,
        filters: [
          { name: 'Redis Backup', extensions: ['json'] },
          { name: 'Gzipped Redis Backup', extensions: ['json.gz', 'gz'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      })
      if (result.canceled || !result.filePath) {
        return { status: 'cancelled' }
      }
      let filePath = result.filePath
      // Ensure the chosen path carries the expected extension.
      if (options?.compress && !/\.gz$/i.test(filePath)) {
        filePath = /\.json$/i.test(filePath) ? `${filePath}.gz` : `${filePath}.${ext}`
      } else if (!options?.compress && !/\.json$/i.test(filePath)) {
        filePath = `${filePath}.json`
      }
      return { status: 'ok', filePath }
    }
  )

  ipcMain.handle('redis:pick-restore-file', async (event: Electron.IpcMainInvokeEvent) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(win ?? BrowserWindow.getFocusedWindow()!, {
      filters: [
        { name: 'Redis Backup', extensions: ['json', 'json.gz', 'gz'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      properties: ['openFile']
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { status: 'cancelled' }
    }
    return { status: 'ok', filePath: result.filePaths[0] }
  })

  // Connection-independent probe used by the Settings page to verify the
  // mysqldump / mysql client binaries (no active MySQL session required).
  ipcMain.handle(
    'mysql:probe-tools',
    async (
      _event: Electron.IpcMainInvokeEvent,
      paths?: { mysqlDumpPath?: string; mysqlClientPath?: string }
    ) => {
      const probe = (bin: string): Promise<{ found: boolean; path?: string; version?: string }> =>
        new Promise((resolve) => {
          execFile(bin, ['--version'], { timeout: 5000 }, (err, stdout) => {
            if (err) resolve({ found: false })
            else resolve({ found: true, path: bin, version: String(stdout).trim() })
          })
        })
      const [mysqldump, mysql] = await Promise.all([
        probe(paths?.mysqlDumpPath?.trim() || 'mysqldump'),
        probe(paths?.mysqlClientPath?.trim() || 'mysql')
      ])
      return { status: 'ok', tools: { mysqldump, mysql } }
    }
  )

  // ─── PostgreSQL Backup & Restore (local) ──────────────────────────────────

  ipcMain.handle(
    'postgres:get-backup-tools',
    async (
      _event: Electron.IpcMainInvokeEvent,
      connectionId: string,
      paths?: { pgDumpPath?: string; pgRestorePath?: string; psqlPath?: string }
    ) => {
      return databaseManager.postgresGetBackupTools(connectionId, paths)
    }
  )

  ipcMain.handle(
    'postgres:build-backup-preview',
    async (
      _event: Electron.IpcMainInvokeEvent,
      connectionId: string,
      opts: PostgresBackupOptions
    ) => {
      return databaseManager.postgresBuildBackupPreview(connectionId, opts)
    }
  )

  ipcMain.handle(
    'postgres:execute-backup',
    async (
      _event: Electron.IpcMainInvokeEvent,
      connectionId: string,
      opts: PostgresBackupOptions
    ) => {
      return databaseManager.postgresExecuteBackup(connectionId, opts)
    }
  )

  ipcMain.handle(
    'postgres:execute-restore',
    async (
      _event: Electron.IpcMainInvokeEvent,
      connectionId: string,
      opts: PostgresRestoreOptions
    ) => {
      return databaseManager.postgresExecuteRestore(connectionId, opts)
    }
  )

  ipcMain.handle(
    'postgres:pick-backup-path',
    async (
      event: Electron.IpcMainInvokeEvent,
      options?: { defaultFileName?: string; compress?: boolean; format?: string }
    ) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      // Directory format writes to a folder; everything else to a file.
      if (options?.format === 'directory') {
        const result = await dialog.showOpenDialog(win ?? BrowserWindow.getFocusedWindow()!, {
          defaultPath: options?.defaultFileName,
          properties: ['openDirectory', 'createDirectory', 'promptToCreate']
        })
        if (result.canceled || result.filePaths.length === 0) {
          return { status: 'cancelled' }
        }
        return { status: 'ok', filePath: result.filePaths[0] }
      }
      const result = await dialog.showSaveDialog(win ?? BrowserWindow.getFocusedWindow()!, {
        defaultPath: options?.defaultFileName,
        filters: [
          { name: 'SQL Dump', extensions: ['sql'] },
          { name: 'Gzipped SQL Dump', extensions: ['sql.gz', 'gz'] },
          { name: 'Custom/Tar Archive', extensions: ['dump', 'backup', 'tar'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      })
      if (result.canceled || !result.filePath) {
        return { status: 'cancelled' }
      }
      let filePath = result.filePath
      // For plain format, ensure the chosen path carries the expected extension.
      if (options?.format === 'plain' || options?.format === undefined) {
        if (options?.compress && !/\.gz$/i.test(filePath)) {
          filePath = /\.sql$/i.test(filePath) ? `${filePath}.gz` : `${filePath}.sql.gz`
        } else if (!options?.compress && !/\.sql$/i.test(filePath)) {
          filePath = `${filePath}.sql`
        }
      }
      return { status: 'ok', filePath }
    }
  )

  ipcMain.handle('postgres:pick-restore-file', async (event: Electron.IpcMainInvokeEvent) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(win ?? BrowserWindow.getFocusedWindow()!, {
      filters: [
        { name: 'Postgres Dump', extensions: ['sql', 'sql.gz', 'gz', 'dump', 'backup', 'tar'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      properties: ['openFile']
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { status: 'cancelled' }
    }
    return { status: 'ok', filePath: result.filePaths[0] }
  })

  // ─── SQLite Backup & Restore (local file operations) ───────────────────────

  ipcMain.handle(
    'sqlite:execute-backup',
    async (
      _event: Electron.IpcMainInvokeEvent,
      connectionId: string,
      opts: SqliteBackupOptions
    ) => {
      return databaseManager.sqliteExecuteBackup(connectionId, opts)
    }
  )

  ipcMain.handle(
    'sqlite:execute-restore',
    async (
      _event: Electron.IpcMainInvokeEvent,
      connectionId: string,
      opts: SqliteRestoreOptions
    ) => {
      return databaseManager.sqliteExecuteRestore(connectionId, opts)
    }
  )

  ipcMain.handle(
    'sqlite:pick-backup-path',
    async (
      event: Electron.IpcMainInvokeEvent,
      options?: { defaultFileName?: string; compress?: boolean }
    ) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      const result = await dialog.showSaveDialog(win ?? BrowserWindow.getFocusedWindow()!, {
        defaultPath: options?.defaultFileName,
        filters: [
          { name: 'SQLite Database', extensions: ['db', 'sqlite', 'sqlite3'] },
          { name: 'Gzipped SQLite Database', extensions: ['db.gz', 'gz'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      })
      if (result.canceled || !result.filePath) {
        return { status: 'cancelled' }
      }
      let filePath = result.filePath
      // Ensure the chosen path carries the expected extension.
      if (options?.compress && !/\.gz$/i.test(filePath)) {
        filePath = /\.(db|sqlite|sqlite3)$/i.test(filePath) ? `${filePath}.gz` : `${filePath}.db.gz`
      } else if (!options?.compress && !/\.(db|sqlite|sqlite3)$/i.test(filePath)) {
        filePath = `${filePath}.db`
      }
      return { status: 'ok', filePath }
    }
  )

  ipcMain.handle('sqlite:pick-restore-file', async (event: Electron.IpcMainInvokeEvent) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(win ?? BrowserWindow.getFocusedWindow()!, {
      filters: [
        { name: 'SQLite Database', extensions: ['db', 'sqlite', 'sqlite3', 'db.gz', 'gz'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      properties: ['openFile']
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { status: 'cancelled' }
    }
    return { status: 'ok', filePath: result.filePaths[0] }
  })

  // Connection-independent probe used by the Settings page to verify the
  // pg_dump / pg_restore / psql binaries (no active Postgres session required).
  ipcMain.handle(
    'postgres:probe-tools',
    async (
      _event: Electron.IpcMainInvokeEvent,
      paths?: { pgDumpPath?: string; pgRestorePath?: string; psqlPath?: string }
    ) => {
      const probe = (bin: string): Promise<{ found: boolean; path?: string; version?: string }> =>
        new Promise((resolve) => {
          execFile(bin, ['--version'], { timeout: 5000 }, (err, stdout) => {
            if (err) resolve({ found: false })
            else resolve({ found: true, path: bin, version: String(stdout).trim() })
          })
        })
      const [pgDump, pgRestore, psql] = await Promise.all([
        probe(paths?.pgDumpPath?.trim() || 'pg_dump'),
        probe(paths?.pgRestorePath?.trim() || 'pg_restore'),
        probe(paths?.psqlPath?.trim() || 'psql')
      ])
      return { status: 'ok', tools: { pgDump, pgRestore, psql } }
    }
  )

  ipcMain.handle(
    'database:create-collection',
    async (_event: Electron.IpcMainInvokeEvent, connectionId: string, databaseName: string, collectionName: string) => {
      return databaseManager.createCollection(connectionId, databaseName, collectionName)
    }
  )

  ipcMain.handle(
    'database:rename-collection',
    async (_event: Electron.IpcMainInvokeEvent, connectionId: string, databaseName: string, oldName: string, newName: string) => {
      return databaseManager.renameCollection(connectionId, databaseName, oldName, newName)
    }
  )

  ipcMain.handle(
    'database:drop-collection',
    async (_event: Electron.IpcMainInvokeEvent, connectionId: string, databaseName: string, collectionName: string) => {
      return databaseManager.dropCollection(connectionId, databaseName, collectionName)
    }
  )

  ipcMain.handle(
    'database:insert-mongo-document',
    async (_event: Electron.IpcMainInvokeEvent, connectionId: string, databaseName: string, collectionName: string, ejsonDocString: string) => {
      return databaseManager.insertMongoDocument(connectionId, databaseName, collectionName, ejsonDocString)
    }
  )

  ipcMain.handle(
    'database:replace-mongo-document',
    async (_event: Electron.IpcMainInvokeEvent, connectionId: string, databaseName: string, collectionName: string, ejsonDocString: string) => {
      return databaseManager.replaceMongoDocument(connectionId, databaseName, collectionName, ejsonDocString)
    }
  )

  ipcMain.handle(
    'database:delete-mongo-document',
    async (_event: Electron.IpcMainInvokeEvent, connectionId: string, databaseName: string, collectionName: string, ejsonDocString: string) => {
      return databaseManager.deleteMongoDocument(connectionId, databaseName, collectionName, ejsonDocString)
    }
  )

  ipcMain.handle(
    'database:execute-mongo-shell-command',
    async (_event: Electron.IpcMainInvokeEvent, connectionId: string, command: string, currentDb: string) => {
      return databaseManager.executeMongoShellCommand(connectionId, command, currentDb)
    }
  )

  ipcMain.handle(
    'database:execute-redis-shell-command',
    async (_event: Electron.IpcMainInvokeEvent, connectionId: string, command: string, databaseIndex: number) => {
      return databaseManager.executeRedisShellCommand(connectionId, command, databaseIndex)
    }
  )

  ipcMain.handle(
    'database:get-mongo-indexes',
    async (_event: Electron.IpcMainInvokeEvent, connectionId: string, databaseName: string, collectionName: string) => {
      return databaseManager.getMongoIndexes(connectionId, databaseName, collectionName)
    }
  )

  ipcMain.handle(
    'database:save-mongo-index',
    async (_event: Electron.IpcMainInvokeEvent, connectionId: string, databaseName: string, collectionName: string, params: unknown, originalName?: string) => {
      return databaseManager.saveMongoIndex(connectionId, databaseName, collectionName, params as import('./database/types').SaveMongoIndexParams, originalName)
    }
  )

  ipcMain.handle(
    'database:drop-mongo-index',
    async (_event: Electron.IpcMainInvokeEvent, connectionId: string, databaseName: string, collectionName: string, indexName: string) => {
      return databaseManager.dropMongoIndex(connectionId, databaseName, collectionName, indexName)
    }
  )

  ipcMain.handle(
    'database:get-collection-fields',
    async (_event: Electron.IpcMainInvokeEvent, connectionId: string, databaseName: string, collectionName: string) => {
      return databaseManager.getCollectionFields(connectionId, databaseName, collectionName)
    }
  )

  ipcMain.handle(
    'database:get-mongo-aggregations',
    async (_event: Electron.IpcMainInvokeEvent, connectionId: string, databaseName: string, collectionName: string) => {
      return databaseManager.getMongoAggregations(connectionId, databaseName, collectionName)
    }
  )

  ipcMain.handle(
    'database:save-mongo-aggregation',
    async (_event: Electron.IpcMainInvokeEvent, connectionId: string, databaseName: string, collectionName: string, params: unknown, originalId?: string) => {
      return databaseManager.saveMongoAggregation(connectionId, databaseName, collectionName, params as import('./database/types').SaveMongoAggregationParams, originalId)
    }
  )

  ipcMain.handle(
    'database:delete-mongo-aggregation',
    async (_event: Electron.IpcMainInvokeEvent, connectionId: string, databaseName: string, collectionName: string, aggregationId: string) => {
      return databaseManager.deleteMongoAggregation(connectionId, databaseName, collectionName, aggregationId)
    }
  )

  ipcMain.handle(
    'database:run-mongo-aggregation',
    async (_event: Electron.IpcMainInvokeEvent, connectionId: string, databaseName: string, collectionName: string, pipeline: unknown[]) => {
      return databaseManager.runMongoAggregation(connectionId, databaseName, collectionName, pipeline)
    }
  )

  ipcMain.handle(
    'database:get-mongo-aggregation-sample',
    async (_event: Electron.IpcMainInvokeEvent, connectionId: string, databaseName: string, collectionName: string, limit?: number) => {
      return databaseManager.getMongoAggregationSample(connectionId, databaseName, collectionName, limit)
    }
  )

  ipcMain.handle(
    'database:get-mongo-validation',
    async (_event: Electron.IpcMainInvokeEvent, connectionId: string, databaseName: string, collectionName: string) => {
      return databaseManager.getMongoValidation(connectionId, databaseName, collectionName)
    }
  )

  ipcMain.handle(
    'database:save-mongo-validation',
    async (_event: Electron.IpcMainInvokeEvent, connectionId: string, databaseName: string, collectionName: string, validator: unknown, validationAction: string, validationLevel: string) => {
      return databaseManager.saveMongoValidation(connectionId, databaseName, collectionName, validator as Record<string, unknown>, validationAction, validationLevel)
    }
  )

  ipcMain.handle(
    'database:test-mongo-validation',
    async (_event: Electron.IpcMainInvokeEvent, connectionId: string, databaseName: string, collectionName: string, validator: unknown) => {
      return databaseManager.testMongoValidation(connectionId, databaseName, collectionName, validator as Record<string, unknown>)
    }
  )

  ipcMain.handle(
    'database:generate-mongo-validation-rules',
    async (_event: Electron.IpcMainInvokeEvent, connectionId: string, databaseName: string, collectionName: string) => {
      return databaseManager.generateMongoValidationRules(connectionId, databaseName, collectionName)
    }
  )

  ipcMain.handle(
    'database:invalidate-cache',
    (_event: Electron.IpcMainInvokeEvent, connectionId: string, nodeId: string) => {
      databaseManager.invalidateCacheEntry(connectionId, nodeId)
    }
  )

  ipcMain.handle(
    'database:delete-redis-key',
    async (_event: Electron.IpcMainInvokeEvent, connectionId: string, databaseIndex: string, keyName: string) => {
      return databaseManager.deleteRedisKey(connectionId, databaseIndex, keyName)
    }
  )

  ipcMain.handle(
    'database:delete-redis-prefix',
    async (_event: Electron.IpcMainInvokeEvent, connectionId: string, databaseIndex: string, prefix: string) => {
      return databaseManager.deleteRedisPrefix(connectionId, databaseIndex, prefix)
    }
  )

  ipcMain.handle(
    'database:get-redis-db-keys',
    async (_event: Electron.IpcMainInvokeEvent, connectionId: string, databaseIndex: string) => {
      return databaseManager.getRedisDbKeys(connectionId, databaseIndex)
    }
  )

  ipcMain.handle(
    'database:get-redis-key-value',
    async (_event: Electron.IpcMainInvokeEvent, connectionId: string, databaseIndex: string, keyName: string) => {
      return databaseManager.getRedisKeyValue(connectionId, databaseIndex, keyName)
    }
  )

  ipcMain.handle(
    'database:save-redis-key',
    async (_event: Electron.IpcMainInvokeEvent, connectionId: string, databaseIndex: string, params: unknown) => {
      return databaseManager.saveRedisKey(connectionId, databaseIndex, params as import('./database/types').SaveRedisKeyParams)
    }
  )

  ipcMain.handle(
    'database:get-redis-dashboard',
    async (_event: Electron.IpcMainInvokeEvent, connectionId: string) => {
      return databaseManager.getRedisDashboard(connectionId)
    }
  )

  ipcMain.handle(
    'database:execute-redis-dashboard-command',
    async (_event: Electron.IpcMainInvokeEvent, connectionId: string, command: string, databaseIndex?: number) => {
      return databaseManager.executeRedisDashboardCommand(connectionId, command as import('./database/types').RedisDashboardCommand, databaseIndex)
    }
  )

  ipcMain.handle(
    'database:sync-watch-state',
    (
      event: Electron.IpcMainInvokeEvent,
      connectionId: string,
      enabled: boolean,
      appFocused: boolean,
      watchedNodes: string[],
      showSystemDatabases: boolean
    ) => {
      databaseManager.syncWatchState(connectionId, enabled, appFocused, watchedNodes, showSystemDatabases, event.sender)
    }
  )

  ipcMain.handle(
    'database:get-table-schema',
    async (
      _event: Electron.IpcMainInvokeEvent,
      connectionId: string,
      databaseName: string,
      schemaName: string,
      tableName: string
    ) => {
      return databaseManager.getTableSchema(connectionId, databaseName, schemaName, tableName)
    }
  )

  ipcMain.handle(
    'database:get-foreign-keys',
    async (
      _event: Electron.IpcMainInvokeEvent,
      connectionId: string,
      databaseName: string,
      schemaName: string,
      tableName: string
    ) => {
      return databaseManager.getForeignKeys(connectionId, databaseName, schemaName, tableName)
    }
  )

  ipcMain.handle(
    'database:get-check-constraints',
    async (
      _event: Electron.IpcMainInvokeEvent,
      connectionId: string,
      databaseName: string,
      schemaName: string,
      tableName: string
    ) => {
      return databaseManager.getCheckConstraints(connectionId, databaseName, schemaName, tableName)
    }
  )

  ipcMain.handle(
    'database:get-triggers',
    async (
      _event: Electron.IpcMainInvokeEvent,
      connectionId: string,
      databaseName: string,
      schemaName: string,
      tableName: string
    ) => {
      return databaseManager.getTriggers(connectionId, databaseName, schemaName, tableName)
    }
  )

  ipcMain.handle(
    'database:save-trigger',
    async (
      _event: Electron.IpcMainInvokeEvent,
      connectionId: string,
      databaseName: string,
      params: unknown,
      originalTriggerName?: string
    ) => {
      return databaseManager.saveTrigger(connectionId, databaseName, params as Parameters<typeof databaseManager.saveTrigger>[2], originalTriggerName)
    }
  )

  ipcMain.handle(
    'database:delete-trigger',
    async (
      _event: Electron.IpcMainInvokeEvent,
      connectionId: string,
      databaseName: string,
      triggerName: string,
      schemaName: string
    ) => {
      return databaseManager.deleteTrigger(connectionId, databaseName, triggerName, schemaName)
    }
  )

  ipcMain.handle(
    'database:get-indexes',
    async (
      _event: Electron.IpcMainInvokeEvent,
      connectionId: string,
      databaseName: string,
      schemaName: string,
      tableName: string
    ) => {
      return databaseManager.getIndexes(connectionId, databaseName, schemaName, tableName)
    }
  )

  ipcMain.handle(
    'database:save-index',
    async (
      _event: Electron.IpcMainInvokeEvent,
      connectionId: string,
      databaseName: string,
      params: unknown,
      originalIndexName?: string
    ) => {
      return databaseManager.saveIndex(connectionId, databaseName, params as Parameters<typeof databaseManager.saveIndex>[2], originalIndexName)
    }
  )

  ipcMain.handle(
    'database:delete-index',
    async (
      _event: Electron.IpcMainInvokeEvent,
      connectionId: string,
      databaseName: string,
      indexName: string,
      schemaName: string,
      tableName: string
    ) => {
      return databaseManager.deleteIndex(connectionId, databaseName, indexName, schemaName, tableName)
    }
  )

  ipcMain.handle(
    'database:rebuild-index',
    async (
      _event: Electron.IpcMainInvokeEvent,
      connectionId: string,
      databaseName: string,
      indexName: string,
      schemaName: string,
      tableName: string
    ) => {
      return databaseManager.rebuildIndex(connectionId, databaseName, indexName, schemaName, tableName)
    }
  )

  ipcMain.handle(
    'database:reorganize-index',
    async (
      _event: Electron.IpcMainInvokeEvent,
      connectionId: string,
      databaseName: string,
      indexName: string,
      schemaName: string,
      tableName: string
    ) => {
      return databaseManager.reorganizeIndex(connectionId, databaseName, indexName, schemaName, tableName)
    }
  )

  ipcMain.handle(
    'database:disable-index',
    async (
      _event: Electron.IpcMainInvokeEvent,
      connectionId: string,
      databaseName: string,
      indexName: string,
      schemaName: string,
      tableName: string
    ) => {
      return databaseManager.disableIndex(connectionId, databaseName, indexName, schemaName, tableName)
    }
  )

  ipcMain.handle(
    'database:get-erd-schema',
    async (_event: Electron.IpcMainInvokeEvent, connectionId: string, databaseName: string) => {
      return databaseManager.getErdSchema(connectionId, databaseName)
    }
  )

  ipcMain.handle(
    'database:get-views',
    async (_event: Electron.IpcMainInvokeEvent, connectionId: string, databaseName: string) => {
      return databaseManager.getViews(connectionId, databaseName)
    }
  )

  ipcMain.handle(
    'database:save-view',
    async (
      _event: Electron.IpcMainInvokeEvent,
      connectionId: string,
      databaseName: string,
      params: unknown,
      originalViewName?: string
    ) => {
      return databaseManager.saveView(
        connectionId,
        databaseName,
        params as Parameters<typeof databaseManager.saveView>[2],
        originalViewName
      )
    }
  )

  ipcMain.handle(
    'database:delete-view',
    async (
      _event: Electron.IpcMainInvokeEvent,
      connectionId: string,
      databaseName: string,
      schemaName: string,
      viewName: string
    ) => {
      return databaseManager.deleteView(connectionId, databaseName, schemaName, viewName)
    }
  )

  ipcMain.handle(
    'database:get-stored-procedures',
    async (_event: Electron.IpcMainInvokeEvent, connectionId: string, databaseName: string) => {
      return databaseManager.getStoredProcedures(connectionId, databaseName)
    }
  )

  ipcMain.handle(
    'database:save-stored-procedure',
    async (
      _event: Electron.IpcMainInvokeEvent,
      connectionId: string,
      databaseName: string,
      params: unknown,
      originalProcedureName?: string
    ) => {
      return databaseManager.saveStoredProcedure(
        connectionId,
        databaseName,
        params as Parameters<typeof databaseManager.saveStoredProcedure>[2],
        originalProcedureName
      )
    }
  )

  ipcMain.handle(
    'database:delete-stored-procedure',
    async (
      _event: Electron.IpcMainInvokeEvent,
      connectionId: string,
      databaseName: string,
      schemaName: string,
      procedureName: string
    ) => {
      return databaseManager.deleteStoredProcedure(connectionId, databaseName, schemaName, procedureName)
    }
  )

  ipcMain.handle(
    'database:get-data-types',
    async (_event: Electron.IpcMainInvokeEvent, connectionId: string, databaseName: string) => {
      return databaseManager.getDataTypes(connectionId, databaseName)
    }
  )

  ipcMain.handle(
    'database:save-data-type',
    async (
      _event: Electron.IpcMainInvokeEvent,
      connectionId: string,
      databaseName: string,
      params: unknown,
      originalTypeName?: string,
      originalSchemaName?: string
    ) => {
      return databaseManager.saveDataType(
        connectionId,
        databaseName,
        params as Parameters<typeof databaseManager.saveDataType>[2],
        originalTypeName,
        originalSchemaName
      )
    }
  )

  ipcMain.handle(
    'database:delete-data-type',
    async (
      _event: Electron.IpcMainInvokeEvent,
      connectionId: string,
      databaseName: string,
      schemaName: string,
      typeName: string
    ) => {
      return databaseManager.deleteDataType(connectionId, databaseName, schemaName, typeName)
    }
  )

  ipcMain.handle(
    'database:get-table-types',
    async (_event: Electron.IpcMainInvokeEvent, connectionId: string, databaseName: string) => {
      return databaseManager.getTableTypes(connectionId, databaseName)
    }
  )

  ipcMain.handle(
    'database:get-table-type',
    async (
      _event: Electron.IpcMainInvokeEvent,
      connectionId: string,
      databaseName: string,
      schemaName: string,
      typeName: string
    ) => {
      return databaseManager.getTableType(connectionId, databaseName, schemaName, typeName)
    }
  )

  ipcMain.handle(
    'database:save-table-type',
    async (
      _event: Electron.IpcMainInvokeEvent,
      connectionId: string,
      databaseName: string,
      params: unknown,
      originalTypeName?: string,
      originalSchemaName?: string
    ) => {
      return databaseManager.saveTableType(
        connectionId,
        databaseName,
        params as Parameters<typeof databaseManager.saveTableType>[2],
        originalTypeName,
        originalSchemaName
      )
    }
  )

  ipcMain.handle(
    'database:delete-table-type',
    async (
      _event: Electron.IpcMainInvokeEvent,
      connectionId: string,
      databaseName: string,
      schemaName: string,
      typeName: string
    ) => {
      return databaseManager.deleteTableType(connectionId, databaseName, schemaName, typeName)
    }
  )

  ipcMain.handle(
    'database:get-memory-optimized-table-types',
    async (_event: Electron.IpcMainInvokeEvent, connectionId: string, databaseName: string) => {
      return databaseManager.getMemoryOptimizedTableTypes(connectionId, databaseName)
    }
  )

  ipcMain.handle(
    'database:get-memory-optimized-table-type',
    async (
      _event: Electron.IpcMainInvokeEvent,
      connectionId: string,
      databaseName: string,
      schemaName: string,
      typeName: string
    ) => {
      return databaseManager.getMemoryOptimizedTableType(connectionId, databaseName, schemaName, typeName)
    }
  )

  ipcMain.handle(
    'database:save-memory-optimized-table-type',
    async (
      _event: Electron.IpcMainInvokeEvent,
      connectionId: string,
      databaseName: string,
      params: unknown,
      originalTypeName?: string,
      originalSchemaName?: string
    ) => {
      return databaseManager.saveMemoryOptimizedTableType(
        connectionId,
        databaseName,
        params as Parameters<typeof databaseManager.saveMemoryOptimizedTableType>[2],
        originalTypeName,
        originalSchemaName
      )
    }
  )

  ipcMain.handle(
    'database:delete-memory-optimized-table-type',
    async (
      _event: Electron.IpcMainInvokeEvent,
      connectionId: string,
      databaseName: string,
      schemaName: string,
      typeName: string
    ) => {
      return databaseManager.deleteMemoryOptimizedTableType(connectionId, databaseName, schemaName, typeName)
    }
  )

  ipcMain.handle(
    'database:test-connection',
    async (_event: Electron.IpcMainInvokeEvent, record: Omit<ConnectionRecord, 'id'>) => {
      return databaseManager.testConnection(record)
    }
  )

  ipcMain.handle(
    'database:script-table-create',
    async (_event: Electron.IpcMainInvokeEvent, connectionId: string, databaseName: string, schemaName: string, tableName: string) => {
      return databaseManager.scriptTableCreate(connectionId, databaseName, schemaName, tableName)
    }
  )

  ipcMain.handle(
    'database:script-table-alter',
    async (_event: Electron.IpcMainInvokeEvent, connectionId: string, databaseName: string, schemaName: string, tableName: string) => {
      return databaseManager.scriptTableAlter(connectionId, databaseName, schemaName, tableName)
    }
  )

  ipcMain.handle(
    'database:script-table-drop',
    async (_event: Electron.IpcMainInvokeEvent, connectionId: string, databaseName: string, schemaName: string, tableName: string) => {
      return databaseManager.scriptTableDrop(connectionId, databaseName, schemaName, tableName)
    }
  )

  ipcMain.handle(
    'database:script-view-create',
    async (_event: Electron.IpcMainInvokeEvent, connectionId: string, databaseName: string, schemaName: string, viewName: string) => {
      return databaseManager.scriptViewCreate(connectionId, databaseName, schemaName, viewName)
    }
  )

  ipcMain.handle(
    'database:script-view-alter',
    async (_event: Electron.IpcMainInvokeEvent, connectionId: string, databaseName: string, schemaName: string, viewName: string) => {
      return databaseManager.scriptViewAlter(connectionId, databaseName, schemaName, viewName)
    }
  )

  ipcMain.handle(
    'database:script-view-drop',
    async (_event: Electron.IpcMainInvokeEvent, connectionId: string, databaseName: string, schemaName: string, viewName: string) => {
      return databaseManager.scriptViewDrop(connectionId, databaseName, schemaName, viewName)
    }
  )

  ipcMain.handle(
    'database:script-stored-procedure-create',
    async (_event: Electron.IpcMainInvokeEvent, connectionId: string, databaseName: string, schemaName: string, procedureName: string) => {
      return databaseManager.scriptStoredProcedureCreate(connectionId, databaseName, schemaName, procedureName)
    }
  )

  ipcMain.handle(
    'database:script-stored-procedure-alter',
    async (_event: Electron.IpcMainInvokeEvent, connectionId: string, databaseName: string, schemaName: string, procedureName: string) => {
      return databaseManager.scriptStoredProcedureAlter(connectionId, databaseName, schemaName, procedureName)
    }
  )

  ipcMain.handle(
    'database:script-stored-procedure-drop',
    async (_event: Electron.IpcMainInvokeEvent, connectionId: string, databaseName: string, schemaName: string, procedureName: string) => {
      return databaseManager.scriptStoredProcedureDrop(connectionId, databaseName, schemaName, procedureName)
    }
  )

  ipcMain.handle(
    'database:script-select-top-rows',
    async (_event: Electron.IpcMainInvokeEvent, connectionId: string, databaseName: string, schemaName: string, tableName: string, count: number) => {
      return databaseManager.scriptSelectTopRows(connectionId, databaseName, schemaName, tableName, count)
    }
  )

  ipcMain.handle(
    'database:script-drop-database',
    async (_event: Electron.IpcMainInvokeEvent, connectionId: string, databaseName: string) => {
      return databaseManager.scriptDropDatabase(connectionId, databaseName)
    }
  )

  ipcMain.handle(
    'database:get-capabilities',
    (_event: Electron.IpcMainInvokeEvent, connectionId: string) => {
      return databaseManager.getCapabilities(connectionId)
    }
  )

  ipcMain.handle(
    'database:get-server-login-details',
    (_event: Electron.IpcMainInvokeEvent, connectionId: string, loginName: string) => {
      return databaseManager.getServerLoginDetails(connectionId, loginName)
    }
  )

  ipcMain.handle(
    'database:list-server-databases',
    (_event: Electron.IpcMainInvokeEvent, connectionId: string) => {
      return databaseManager.listServerDatabases(connectionId)
    }
  )

  ipcMain.handle(
    'database:list-server-languages',
    (_event: Electron.IpcMainInvokeEvent, connectionId: string) => {
      return databaseManager.listServerLanguages(connectionId)
    }
  )

  ipcMain.handle(
    'database:get-server-login-roles',
    (_event: Electron.IpcMainInvokeEvent, connectionId: string, loginName: string) => {
      return databaseManager.getServerLoginRoles(connectionId, loginName)
    }
  )

  ipcMain.handle(
    'database:get-server-login-database-mappings',
    (_event: Electron.IpcMainInvokeEvent, connectionId: string, loginName: string) => {
      return databaseManager.getServerLoginDatabaseMappings(connectionId, loginName)
    }
  )

  ipcMain.handle(
    'database:get-database-roles-for-login',
    (_event: Electron.IpcMainInvokeEvent, connectionId: string, databaseName: string, loginName: string) => {
      return databaseManager.getDatabaseRolesForLogin(connectionId, databaseName, loginName)
    }
  )

  ipcMain.handle(
    'database:save-server-login',
    async (_event: Electron.IpcMainInvokeEvent, connectionId: string, params: unknown) => {
      return databaseManager.saveServerLogin(connectionId, params as Parameters<typeof databaseManager.saveServerLogin>[1])
    }
  )

  ipcMain.handle(
    'database:delete-server-login',
    async (_event: Electron.IpcMainInvokeEvent, connectionId: string, loginName: string) => {
      return databaseManager.deleteServerLogin(connectionId, loginName)
    }
  )

  ipcMain.handle(
    'database:get-server-role-details',
    async (_event: Electron.IpcMainInvokeEvent, connectionId: string, roleName: string) => {
      return databaseManager.getServerRoleDetails(connectionId, roleName)
    }
  )

  ipcMain.handle(
    'database:save-server-role',
    async (_event: Electron.IpcMainInvokeEvent, connectionId: string, params: unknown) => {
      return databaseManager.saveServerRole(connectionId, params as Parameters<typeof databaseManager.saveServerRole>[1])
    }
  )

  ipcMain.handle(
    'database:delete-server-role',
    async (_event: Electron.IpcMainInvokeEvent, connectionId: string, roleName: string) => {
      return databaseManager.deleteServerRole(connectionId, roleName)
    }
  )

  ipcMain.handle(
    'database:get-database-user-details',
    async (_event: Electron.IpcMainInvokeEvent, connectionId: string, databaseName: string, userName: string) => {
      return databaseManager.getDatabaseUserDetails(connectionId, databaseName, userName)
    }
  )

  ipcMain.handle(
    'database:get-database-user-roles',
    async (_event: Electron.IpcMainInvokeEvent, connectionId: string, databaseName: string, userName: string) => {
      return databaseManager.getDatabaseUserRoles(connectionId, databaseName, userName)
    }
  )

  ipcMain.handle(
    'database:save-database-user',
    async (_event: Electron.IpcMainInvokeEvent, connectionId: string, params: unknown) => {
      return databaseManager.saveDatabaseUser(connectionId, params as import('./database/types').SaveDatabaseUserParams)
    }
  )

  ipcMain.handle(
    'database:delete-database-user',
    async (_event: Electron.IpcMainInvokeEvent, connectionId: string, databaseName: string, userName: string) => {
      return databaseManager.deleteDatabaseUser(connectionId, databaseName, userName)
    }
  )

  ipcMain.handle(
    'database:get-mysql-user-details',
    async (_event: Electron.IpcMainInvokeEvent, connectionId: string, username: string, host: string) => {
      return databaseManager.getMySqlUserDetails(connectionId, username, host)
    }
  )

  ipcMain.handle(
    'database:get-mysql-user-global-privileges',
    async (_event: Electron.IpcMainInvokeEvent, connectionId: string, username: string, host: string) => {
      return databaseManager.getMySqlUserGlobalPrivileges(connectionId, username, host)
    }
  )

  ipcMain.handle(
    'database:get-mysql-user-database-privileges',
    async (_event: Electron.IpcMainInvokeEvent, connectionId: string, username: string, host: string) => {
      return databaseManager.getMySqlUserDatabasePrivileges(connectionId, username, host)
    }
  )

  ipcMain.handle(
    'database:get-mysql-database-list',
    async (_event: Electron.IpcMainInvokeEvent, connectionId: string) => {
      return databaseManager.getMySqlDatabaseList(connectionId)
    }
  )

  ipcMain.handle(
    'database:get-mysql-database-users',
    async (_event: Electron.IpcMainInvokeEvent, connectionId: string, databaseName: string) => {
      return databaseManager.getMySqlDatabaseUsers(connectionId, databaseName)
    }
  )

  ipcMain.handle(
    'database:save-mysql-user',
    async (_event: Electron.IpcMainInvokeEvent, connectionId: string, params: unknown) => {
      return databaseManager.saveMySqlUser(connectionId, params as import('./database/types').SaveMySqlUserParams)
    }
  )

  ipcMain.handle(
    'database:delete-mysql-user',
    async (_event: Electron.IpcMainInvokeEvent, connectionId: string, username: string, host: string) => {
      return databaseManager.deleteMySqlUser(connectionId, username, host)
    }
  )

  ipcMain.handle(
    'database:save-mysql-database-user-privileges',
    async (_event: Electron.IpcMainInvokeEvent, connectionId: string, params: unknown) => {
      return databaseManager.saveMySqlDatabaseUserPrivileges(connectionId, params as import('./database/types').SaveMySqlDatabaseUserPrivilegesParams)
    }
  )

  ipcMain.handle(
    'database:get-redis-acl-user-details',
    async (_event: Electron.IpcMainInvokeEvent, connectionId: string, username: string) => {
      return databaseManager.getRedisAclUserDetails(connectionId, username)
    }
  )

  ipcMain.handle(
    'database:save-redis-acl-user',
    async (_event: Electron.IpcMainInvokeEvent, connectionId: string, params: unknown) => {
      return databaseManager.saveRedisAclUser(connectionId, params as import('./database/types').SaveRedisAclUserParams)
    }
  )

  ipcMain.handle(
    'database:delete-redis-acl-user',
    async (_event: Electron.IpcMainInvokeEvent, connectionId: string, username: string) => {
      return databaseManager.deleteRedisAclUser(connectionId, username)
    }
  )

  ipcMain.handle(
    'database:get-mongo-user-details',
    async (_event: Electron.IpcMainInvokeEvent, connectionId: string, username: string) => {
      return databaseManager.getMongoUserDetails(connectionId, username)
    }
  )

  ipcMain.handle(
    'database:save-mongo-user',
    async (_event: Electron.IpcMainInvokeEvent, connectionId: string, params: unknown) => {
      return databaseManager.saveMongoUser(connectionId, params as import('./database/types').SaveMongoUserParams)
    }
  )

  ipcMain.handle(
    'database:delete-mongo-user',
    async (_event: Electron.IpcMainInvokeEvent, connectionId: string, username: string) => {
      return databaseManager.deleteMongoUser(connectionId, username)
    }
  )

  ipcMain.handle('file:save', async (_event: Electron.IpcMainInvokeEvent, filePath: string, content: string) => {
    await writeFile(filePath, content, 'utf-8')
    return { status: 'ok' }
  })

  ipcMain.handle('file:save-dialog', async (
    event: Electron.IpcMainInvokeEvent,
    content: string,
    options?: { defaultPath?: string; filters?: { name: string; extensions: string[] }[] }
  ) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const defaultFilters = [
      { name: 'SQL Files', extensions: ['sql'] },
      { name: 'All Files', extensions: ['*'] }
    ]
    const result = await dialog.showSaveDialog(win ?? BrowserWindow.getFocusedWindow()!, {
      defaultPath: options?.defaultPath,
      filters: options?.filters ?? defaultFilters
    })
    if (result.canceled || !result.filePath) {
      return { status: 'cancelled' }
    }
    await writeFile(result.filePath, content, 'utf-8')
    return { status: 'ok', filePath: result.filePath }
  })

  ipcMain.handle('file:open-dialog', async (event: Electron.IpcMainInvokeEvent) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(win ?? BrowserWindow.getFocusedWindow()!, {
      filters: [
        { name: 'SQL Files', extensions: ['sql'] },
        { name: 'ERD Files', extensions: ['erd'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      properties: ['openFile']
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { status: 'cancelled' }
    }
    const filePath = result.filePaths[0]
    const content = await readFile(filePath, 'utf-8')
    return { status: 'ok', filePath, content }
  })

  ipcMain.handle('file:save-erd-dialog', async (event: Electron.IpcMainInvokeEvent, content: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showSaveDialog(win ?? BrowserWindow.getFocusedWindow()!, {
      filters: [
        { name: 'ERD Files', extensions: ['erd'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })
    if (result.canceled || !result.filePath) {
      return { status: 'cancelled' }
    }
    await writeFile(result.filePath, content, 'utf-8')
    return { status: 'ok', filePath: result.filePath }
  })

  ipcMain.handle('file:open-erd-dialog', async (event: Electron.IpcMainInvokeEvent) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(win ?? BrowserWindow.getFocusedWindow()!, {
      filters: [
        { name: 'ERD Files', extensions: ['erd'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      properties: ['openFile']
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { status: 'cancelled' }
    }
    const filePath = result.filePaths[0]
    const content = await readFile(filePath, 'utf-8')
    return { status: 'ok', filePath, content }
  })

  ipcMain.handle('file:check-exists', (_event: Electron.IpcMainInvokeEvent, filePath: string) => {
    return existsSync(filePath)
  })

  ipcMain.handle('file:open-sqlite-dialog', async (event: Electron.IpcMainInvokeEvent) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(win ?? BrowserWindow.getFocusedWindow()!, {
      title: 'Open SQLite Database',
      filters: [
        { name: 'SQLite Databases', extensions: ['db', 'sqlite', 'sqlite3', 'db3'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      properties: ['openFile']
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { status: 'cancelled' }
    }
    return { status: 'ok', filePath: result.filePaths[0] }
  })

  ipcMain.handle('file:open-file-dialog', async (event: Electron.IpcMainInvokeEvent) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(win ?? BrowserWindow.getFocusedWindow()!, {
      filters: [
        { name: 'All Files', extensions: ['*'] }
      ],
      properties: ['openFile']
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { status: 'cancelled' }
    }
    return { status: 'ok', filePath: result.filePaths[0] }
  })

  ipcMain.handle('file:read', async (_event: Electron.IpcMainInvokeEvent, filePath: string) => {
    try {
      const content = await readFile(filePath, 'utf-8')
      return { status: 'ok', content }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to read file'
      return { status: 'error', message }
    }
  })

  ipcMain.handle('autosave:get-recovered', () => recoveredDrafts)

  ipcMain.handle(
    'autosave:write',
    async (_event: Electron.IpcMainInvokeEvent, drafts: DraftDocument[]) => {
      await writeAutosave(drafts)
    }
  )

  ipcMain.handle('autosave:clear', async () => {
    await clearAutosave()
  })

  interface EnvironmentExportOptions {
    connections: boolean
    comparisons: boolean
    passwords: boolean
    settings: boolean
  }

  ipcMain.handle(
    'environment:export',
    async (event: Electron.IpcMainInvokeEvent, options: EnvironmentExportOptions) => {
      const data: Record<string, unknown> = {
        version: '1.0',
        exportedAt: new Date().toISOString()
      }

      if (options.connections) {
        let connections = connectionsStore.get('connections')
        if (!options.passwords) {
          connections = connections.map((c) => ({
            ...c,
            password: '',
            sshPassword: '',
            sshPassphrase: '',
            tlsCertificateKeyFilePassword: ''
          }))
        }
        data.connections = connections
      }

      if (options.comparisons) {
        data.comparisons = comparisonsStore.get('comparisons')
      }

      if (options.settings) {
        data.settings = store.store
      }

      const win = BrowserWindow.fromWebContents(event.sender)
      const result = await dialog.showSaveDialog(win ?? BrowserWindow.getFocusedWindow()!, {
        defaultPath: 'spiral-environment.json',
        filters: [{ name: 'JSON Files', extensions: ['json'] }]
      })

      if (result.canceled || !result.filePath) return { cancelled: true }

      await writeFile(result.filePath, JSON.stringify(data, null, 2), 'utf-8')
      return { success: true }
    }
  )

  ipcMain.handle('environment:import', async (event: Electron.IpcMainInvokeEvent) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(win ?? BrowserWindow.getFocusedWindow()!, {
      filters: [{ name: 'JSON Files', extensions: ['json'] }],
      properties: ['openFile']
    })

    if (result.canceled || !result.filePaths[0]) return { cancelled: true }

    try {
      const raw = await readFile(result.filePaths[0], 'utf-8')
      const data = JSON.parse(raw) as Record<string, unknown>

      event.sender.send('environment:import-progress', { step: 'validating' })

      if (typeof data !== 'object' || !data.version) {
        throw new Error('Invalid environment file format.')
      }

      let connectionsImported = 0
      let comparisonsImported = 0

      if (Array.isArray(data.connections)) {
        event.sender.send('environment:import-progress', {
          step: 'connections',
          total: data.connections.length
        })
        const existing = connectionsStore.get('connections')
        const updated = [...existing]
        for (const conn of data.connections as ConnectionRecord[]) {
          const idx = updated.findIndex((c) => c.id === conn.id)
          if (idx >= 0) updated[idx] = conn
          else updated.push(conn)
          connectionsImported++
        }
        connectionsStore.set('connections', updated)
      }

      if (Array.isArray(data.comparisons)) {
        event.sender.send('environment:import-progress', {
          step: 'comparisons',
          total: data.comparisons.length
        })
        const existing = comparisonsStore.get('comparisons')
        const updated = [...existing]
        for (const comp of data.comparisons as ComparisonRecord[]) {
          const idx = updated.findIndex((c) => c.id === comp.id)
          if (idx >= 0) updated[idx] = comp
          else updated.push(comp)
          comparisonsImported++
        }
        comparisonsStore.set('comparisons', updated)
      }

      if (data.settings !== null && typeof data.settings === 'object') {
        event.sender.send('environment:import-progress', { step: 'settings' })
        for (const [key, value] of Object.entries(data.settings as Record<string, unknown>)) {
          if (key in DEFAULT_SETTINGS) {
            store.set(key as keyof AppSettings, value as AppSettings[keyof AppSettings])
          }
        }
      }

      return {
        success: true,
        connectionsImported,
        comparisonsImported,
        settingsImported: data.settings !== undefined && data.settings !== null
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Import failed' }
    }
  })

  ipcMain.handle(
    'connections:add-erd-file',
    (_event: Electron.IpcMainInvokeEvent, connectionId: string, databaseName: string, filePath: string) => {
      const connections = connectionsStore.get('connections')
      const updated = connections.map((conn) => {
        if (conn.id !== connectionId) return conn
        const existing = conn.erdFiles ?? []
        if (existing.some((f) => f.filePath === filePath)) return conn
        return { ...conn, erdFiles: [...existing, { databaseName, filePath }] }
      })
      connectionsStore.set('connections', updated)
    }
  )

  ipcMain.handle(
    'connections:remove-erd-file',
    (_event: Electron.IpcMainInvokeEvent, connectionId: string, filePath: string) => {
      const connections = connectionsStore.get('connections')
      const updated = connections.map((conn) => {
        if (conn.id !== connectionId) return conn
        return { ...conn, erdFiles: (conn.erdFiles ?? []).filter((f) => f.filePath !== filePath) }
      })
      connectionsStore.set('connections', updated)
    }
  )

  ipcMain.handle(
    'profiler:start',
    async (event: Electron.IpcMainInvokeEvent, config: ProfilerSessionConfig) => {
      const sessionId = await profilerManager.startSession(config, event.sender)
      return sessionId
    }
  )

  ipcMain.handle('profiler:stop', (_event: Electron.IpcMainInvokeEvent, sessionId: string) => {
    profilerManager.stopSession(sessionId)
  })

  ipcMain.handle('profiler:pause', (_event: Electron.IpcMainInvokeEvent, sessionId: string) => {
    profilerManager.pauseSession(sessionId)
  })

  ipcMain.handle('profiler:resume', (_event: Electron.IpcMainInvokeEvent, sessionId: string) => {
    profilerManager.resumeSession(sessionId)
  })

  ipcMain.on('menu:execute-role', (event: Electron.IpcMainEvent, role: string) => {
    const webContents = event.sender as unknown as Record<string, (() => void) | undefined>
    if (typeof webContents[role] === 'function') {
      webContents[role]()
    }
  })

  ipcMain.on('app:is-dev', (event) => {
    event.returnValue = is.dev
  })

  ipcMain.on('app:quit', () => {
    markUserInitiatedQuit()
    app.quit()
  })

  ipcMain.on('app:restart', () => {
    markUserInitiatedQuit()
    app.relaunch()
    app.quit()
  })

  ipcMain.on('app:open-dev-tools', (event) => {
    if (is.dev) {
      event.sender.openDevTools()
    }
  })

  ipcMain.handle('window:is-maximized', (event: Electron.IpcMainInvokeEvent) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    return win?.isMaximized() ?? false
  })

  ipcMain.on('window:minimize', (event: Electron.IpcMainEvent) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    win?.minimize()
  })

  ipcMain.on('window:maximize-restore', (event: Electron.IpcMainEvent) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    if (win.isMaximized()) {
      win.restore()
    } else {
      win.maximize()
    }
  })

  ipcMain.on('window:close', (event: Electron.IpcMainEvent) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    win?.close()
  })

  ipcMain.handle('window:screenshot-preview', async (event: Electron.IpcMainInvokeEvent) => {
    return captureCurrentWindow(BrowserWindow.fromWebContents(event.sender))
  })

  ipcMain.handle(
    'window:screenshot-capture',
    async (
      event: Electron.IpcMainInvokeEvent,
      { width, height }: { width: number; height: number }
    ) => {
      return captureScreenshotAtSize(BrowserWindow.fromWebContents(event.sender), width, height)
    }
  )

  ipcMain.handle(
    'window:screenshot-write',
    async (event: Electron.IpcMainInvokeEvent, { dataUrl }: { dataUrl: string }) => {
      return saveScreenshotToFile(BrowserWindow.fromWebContents(event.sender), dataUrl)
    }
  )

  ipcMain.handle('window:get-content-size', (event: Electron.IpcMainInvokeEvent) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return null
    const { width, height } = win.getContentBounds()
    return { width, height }
  })

  ipcMain.handle(
    'window:resize',
    (
      event: Electron.IpcMainInvokeEvent,
      { width, height }: { width: number; height: number }
    ) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (!win) return
      // Maximized windows ignore size changes, so leave that state first.
      if (win.isMaximized()) win.unmaximize()
      win.setContentSize(width, height)
      win.center()
    }
  )

  nativeTheme.themeSource = (store.get('nativeThemeSource') ?? 'dark') as 'dark' | 'light' | 'system'

  ipcMain.on('menu:update-state', (_event, state: Partial<typeof macMenuState>) => {
    macMenuState = { ...macMenuState, ...state }
    updateMacMenuState()
  })

  // ── Profile & Auth IPC ────────────────────────────────────────────────────

  function getAvatarsDir(): string {
    return join(app.getPath('userData'), 'profile', 'avatars')
  }

  ipcMain.handle('profile:get', () => profileStore.store)

  ipcMain.handle('profile:set-name', (_event, name: string) => {
    profileStore.set('displayName', String(name).slice(0, 100))
  })

  ipcMain.handle('profile:pick-avatar', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(win ?? BrowserWindow.getFocusedWindow()!, {
      title: 'Choose Profile Picture',
      filters: [
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }
      ],
      properties: ['openFile']
    })
    if (result.canceled || result.filePaths.length === 0) return { status: 'cancelled' as const }

    const src = result.filePaths[0]
    const ext = extname(src).toLowerCase() || '.png'
    const dest = join(getAvatarsDir(), `avatar${ext}`)

    await mkdir(getAvatarsDir(), { recursive: true })

    // Remove any previously managed avatar first
    const prev = profileStore.get('avatarFile')
    if (prev) {
      const prevPath = join(getAvatarsDir(), prev)
      if (existsSync(prevPath)) await unlink(prevPath).catch(() => {})
    }

    await copyFile(src, dest)
    const managed = basename(dest)
    profileStore.set('avatarFile', managed)
    return { status: 'ok' as const, avatarFile: managed }
  })

  ipcMain.handle('profile:remove-avatar', async () => {
    const prev = profileStore.get('avatarFile')
    if (prev) {
      const prevPath = join(getAvatarsDir(), prev)
      if (existsSync(prevPath)) await unlink(prevPath).catch(() => {})
    }
    profileStore.set('avatarFile', null)
  })

  ipcMain.handle('profile:get-avatar-data-url', async () => {
    const file = profileStore.get('avatarFile')
    if (!file) return null
    const filePath = join(getAvatarsDir(), file)
    if (!existsSync(filePath)) return null
    try {
      const buf = await readFile(filePath)
      const ext = extname(file).replace('.', '') || 'png'
      const mime = ext === 'jpg' ? 'jpeg' : ext
      return `data:image/${mime};base64,${buf.toString('base64')}`
    } catch {
      return null
    }
  })

  ipcMain.handle('profile:set-avatar-transform', (_event, zoom: number, offsetX: number, offsetY: number) => {
    profileStore.set('avatarZoom', Math.max(1, Math.min(4, Number(zoom) || 1)))
    profileStore.set('avatarOffsetX', Number(offsetX) || 0)
    profileStore.set('avatarOffsetY', Number(offsetY) || 0)
  })

  ipcMain.handle('profile:set-lock-settings', (_event, settings: {
    lockOnStartup: boolean
    lockOnInactivity: boolean
    lockOnMinimize: boolean
    inactivityTimeoutMinutes: number
  }) => {
    profileStore.set('lockOnStartup', Boolean(settings.lockOnStartup))
    profileStore.set('lockOnInactivity', Boolean(settings.lockOnInactivity))
    profileStore.set('lockOnMinimize', Boolean(settings.lockOnMinimize))
    profileStore.set('inactivityTimeoutMinutes', Math.max(1, Math.min(120, Number(settings.inactivityTimeoutMinutes) || 5)))
  })

  ipcMain.handle('auth:set-password', async (_event, plaintext: string) => {
    if (!plaintext || typeof plaintext !== 'string' || plaintext.length < 1) {
      return { status: 'error' as const, message: 'Password cannot be empty' }
    }
    const meta = await hashPassword(plaintext)
    profileStore.set('passwordMeta', meta)
    clearLockoutState()
    const salt = generateEncryptionSalt()
    const key = await deriveEncryptionKey(plaintext, salt)
    profileStore.set('connectionEncryptionSalt', salt)
    const persistedKey = persistSessionKey(key)
    profileStore.set('connectionKeyEncrypted', persistedKey)
    setSessionKey(key)
    const connections = connectionsStore.get('connections')
    connectionsStore.set('connections', encryptAllConnections(connections, key))
    return { status: 'ok' as const }
  })

  ipcMain.handle('auth:change-password', async (_event, currentPlaintext: string, newPlaintext: string) => {
    const meta = profileStore.get('passwordMeta')
    const valid = await verifyPassword(currentPlaintext, meta)
    if (!valid) return { status: 'error' as const, message: 'Current password is incorrect' }
    if (!newPlaintext || typeof newPlaintext !== 'string' || newPlaintext.length < 1) {
      return { status: 'error' as const, message: 'New password cannot be empty' }
    }
    const currentSalt = profileStore.get('connectionEncryptionSalt')
    const currentKey = currentSalt
      ? (getSessionKey() ?? (await deriveEncryptionKey(currentPlaintext, currentSalt)))
      : null
    const connections = connectionsStore.get('connections')
    const connectionsWithPlaintext = currentKey
      ? decryptAllConnections(connections, currentKey)
      : connections
    const newMeta = await hashPassword(newPlaintext)
    profileStore.set('passwordMeta', newMeta)
    const newSalt = generateEncryptionSalt()
    const newKey = await deriveEncryptionKey(newPlaintext, newSalt)
    profileStore.set('connectionEncryptionSalt', newSalt)
    const persistedKey = persistSessionKey(newKey)
    profileStore.set('connectionKeyEncrypted', persistedKey)
    setSessionKey(newKey)
    connectionsStore.set('connections', encryptAllConnections(connectionsWithPlaintext, newKey))
    return { status: 'ok' as const }
  })

  ipcMain.handle('auth:remove-password', async (_event, currentPlaintext: string) => {
    const meta = profileStore.get('passwordMeta')
    const valid = await verifyPassword(currentPlaintext, meta)
    if (!valid) return { status: 'error' as const, message: 'Current password is incorrect' }
    const currentSalt = profileStore.get('connectionEncryptionSalt')
    const currentKey = currentSalt
      ? (getSessionKey() ?? (await deriveEncryptionKey(currentPlaintext, currentSalt)))
      : null
    if (currentKey) {
      const connections = connectionsStore.get('connections')
      connectionsStore.set('connections', decryptAllConnections(connections, currentKey))
    }
    profileStore.set('passwordMeta', null)
    profileStore.set('connectionEncryptionSalt', null)
    profileStore.set('connectionKeyEncrypted', null)
    profileStore.set('lockOnStartup', false)
    profileStore.set('lockOnInactivity', false)
    profileStore.set('lockOnMinimize', false)
    clearLockoutState()
    clearSessionKey()
    return { status: 'ok' as const }
  })

  ipcMain.handle('auth:verify', async (_event, plaintext: string) => {
    const { isLockedOut, lockedUntilMs } = checkLockout()
    if (isLockedOut) {
      return { valid: false, lockedOut: true, lockedUntilMs }
    }
    const meta = profileStore.get('passwordMeta')
    const valid = await verifyPassword(plaintext, meta)
    if (valid) {
      clearLockoutState()
      const salt = profileStore.get('connectionEncryptionSalt')
      if (salt) {
        const key = await deriveEncryptionKey(plaintext, salt)
        setSessionKey(key)
      }
      return { valid: true }
    }
    const { lockedOut, lockedUntilMs: lockUntil, attemptsRemaining } = recordFailedAttempt()
    return { valid: false, lockedOut, lockedUntilMs: lockUntil, attemptsRemaining }
  })

  ipcMain.handle('auth:clear-session-key', () => {
    clearSessionKey()
  })

  ipcMain.handle('auth:lock-now', () => {
    if (!profileStore.get('passwordMeta')) return
    sendLockRequest()
  })

  /** Returns minimal auth bootstrap data the renderer needs at startup. */
  ipcMain.handle('auth:get-state', () => {
    const meta = profileStore.get('passwordMeta')
    return {
      hasPassword: Boolean(meta),
      lockOnStartup: profileStore.get('lockOnStartup'),
      lockOnInactivity: profileStore.get('lockOnInactivity'),
      lockOnMinimize: profileStore.get('lockOnMinimize'),
      inactivityTimeoutMinutes: profileStore.get('inactivityTimeoutMinutes'),
      lockout: checkLockout()
    }
  })

  // Power monitor events → lock renderer when system sleeps or locks
  powerMonitor.on('suspend', () => {
    if (profileStore.get('passwordMeta') && profileStore.get('lockOnInactivity')) {
      sendLockRequest()
    }
  })

  powerMonitor.on('lock-screen', () => {
    if (profileStore.get('passwordMeta') && profileStore.get('lockOnInactivity')) {
      sendLockRequest()
    }
  })

  // ── AI ────────────────────────────────────────────────────────────────────

  const modelManager = new ModelManager(join(app.getPath('userData'), 'models'))
  const localAiService = new AiService(databaseManager)
  aiService = localAiService

  ipcMain.handle('ai:check-model', async (_event, modelId: string) => {
    return modelManager.checkModel(modelId)
  })

  ipcMain.handle('ai:list-models', async () => {
    return modelManager.listModels()
  })

  ipcMain.handle('ai:download-model', async (event, modelId: string) => {
    const hfToken = store.get('hfToken') as string | undefined
    return modelManager.downloadModel(event, modelId, hfToken || undefined)
  })

  ipcMain.handle('ai:cancel-download', (_event, modelId: string) => {
    modelManager.cancelDownload(modelId)
  })

  ipcMain.handle('ai:delete-model', async (_event, modelId: string) => {
    return modelManager.deleteModel(modelId)
  })

  ipcMain.handle('ai:get-schema-context', async (_event, connectionId: string, databaseName: string, provider: string) => {
    return localAiService.extractSchemaContext(connectionId, databaseName, provider)
  })

  ipcMain.handle('ai:chat-stream', async (event, request: AiChatRequest, sessionId: string) => {
    const modelCheck = await modelManager.checkModel(DEFAULT_MODEL_ID)
    if (!modelCheck.exists) {
      return { status: 'error' as const, message: 'Model not downloaded' }
    }
    const schema = await localAiService.extractSchemaContext(request.connectionId, request.databaseName, request.provider)
    const prompt = localAiService.buildPrompt(request.message, schema, request.conversationHistory)
    await localAiService.streamCompletion(event, sessionId, modelCheck.filePath, prompt)
    return { status: 'ok' as const }
  })

  ipcMain.handle('ai:abort-completion', (_event, sessionId: string) => {
    localAiService.abortCompletion(sessionId)
  })

  // ─────────────────────────────────────────────────────────────────────────

  if (process.platform === 'darwin') {
    app.setName('Spiral')
    buildMacMenu()
  }

  createWindow()

  // Record that the app launched (no-ops if analytics is disabled).
  trackAppOpen()

  // Initialise and background-check for updates after the window is ready.
  try {
    initAutoUpdater()
    registerUpdaterIpcHandlers()
    // Skip the startup check when an already-downloaded update is pending
    // install — the "Install Update" pill will be restored, so re-checking
    // would only risk overwriting it with a redundant "checking"/"up to date"
    // state for an update the user can already install.
    if (getPendingInstallVersion()) {
      console.log('Pending update install detected — skipping startup update check.')
    } else {
      // Delay the startup check slightly so the window has time to render first.
      setTimeout(() => {
        try {
          checkForUpdates()
        } catch (err) {
          console.error('Failed to run initial background update check:', err)
        }
      }, 5000)
    }
  } catch (err) {
    console.error('Failed to initialize auto-updater during app launch:', err)
  }

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // Closing the last window on Windows/Linux is a deliberate quit.
    markUserInitiatedQuit()
    app.quit()
  }
})

app.on('before-quit', (event) => {
  // Quit-and-install is a deliberate shutdown; drop the manifest and let the
  // installer run without the async cleanup path.
  if (isUpdating()) {
    markUserInitiatedQuit()
    clearAutosaveSync()
    return
  }
  event.preventDefault()
  Promise.all([databaseManager.closeAll(), aiService?.dispose()]).finally(() => {
    // Only a deliberate, user-initiated quit clears the autosave manifest. Any
    // other route into before-quit (macOS Force Quit / dock Quit / OS shutdown)
    // preserves it so the unsaved documents are offered for recovery next
    // launch; a genuine crash never reaches this handler and preserves it too.
    //
    // Cleared synchronously right before exit: while the async cleanup above ran
    // the (still-alive) renderer could have re-snapshotted its dirty tabs, so we
    // remove the manifest as the very last step, leaving no window for it to be
    // recreated after clearing.
    if (userInitiatedQuit) clearAutosaveSync()
    app.exit(0)
  })
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.

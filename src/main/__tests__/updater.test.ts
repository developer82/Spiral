// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BrowserWindow, ipcMain } from 'electron'
import { autoUpdater } from 'electron-updater'
import { existsSync } from 'fs'
import {
  initAutoUpdater,
  checkForUpdates,
  startDownload,
  cancelDownload,
  installUpdate,
  registerUpdaterIpcHandlers,
  getPendingInstallVersion
} from '../updater'
import { updaterStore } from '../store'

vi.mock('electron', () => ({
  app: {
    getAppPath: vi.fn(() => '/mock/app/path'),
    getVersion: vi.fn(() => '1.0.0'),
    on: vi.fn()
  },
  BrowserWindow: {
    getAllWindows: vi.fn(() => [])
  },
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn()
  }
}))

const { mockCancel, MockCancellationToken } = vi.hoisted(() => {
  const mockCancel = vi.fn()
  class MockCancellationToken {
    cancelled = false
    cancel = mockCancel
  }
  return { mockCancel, MockCancellationToken }
})

vi.mock('electron-updater', () => ({
  autoUpdater: {
    autoDownload: false,
    autoInstallOnAppQuit: false,
    on: vi.fn(),
    once: vi.fn(),
    checkForUpdates: vi.fn().mockResolvedValue({}),
    downloadUpdate: vi.fn().mockResolvedValue({}),
    quitAndInstall: vi.fn()
  },
  CancellationToken: MockCancellationToken
}))

vi.mock('fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(() => true)
}))

vi.mock('@electron-toolkit/utils', () => ({
  is: {
    dev: false
  }
}))

vi.mock('../store', () => ({
  updaterStore: {
    set: vi.fn(),
    get: vi.fn(),
    delete: vi.fn()
  }
}))

describe('updater', () => {
  const mockWebContents = {
    send: vi.fn()
  }
  const mockWindow = {
    webContents: mockWebContents
  }

  beforeEach(() => {
    vi.clearAllMocks()
    ;(BrowserWindow.getAllWindows as any).mockReturnValue([mockWindow])
  })

  describe('initAutoUpdater', () => {
    it('sets initial config and registers event listeners', () => {
      initAutoUpdater()
      expect(autoUpdater.autoDownload).toBe(false)
      expect(autoUpdater.autoInstallOnAppQuit).toBe(false)
      expect(autoUpdater.on).toHaveBeenCalledWith('checking-for-update', expect.any(Function))
      expect(autoUpdater.on).toHaveBeenCalledWith('update-available', expect.any(Function))
      expect(autoUpdater.on).toHaveBeenCalledWith('update-not-available', expect.any(Function))
      expect(autoUpdater.on).toHaveBeenCalledWith('download-progress', expect.any(Function))
      expect(autoUpdater.on).toHaveBeenCalledWith('update-downloaded', expect.any(Function))
      expect(autoUpdater.on).toHaveBeenCalledWith('error', expect.any(Function))
    })

    it('sends events to main window on updater events', () => {
      initAutoUpdater()
      
      // Get the callbacks registered with autoUpdater.on
      const callbacks: Record<string, Function> = {}
      ;(autoUpdater.on as any).mock.calls.forEach(([event, cb]: [string, Function]) => {
        callbacks[event] = cb
      })

      callbacks['checking-for-update']()
      expect(mockWebContents.send).toHaveBeenCalledWith('updater:checking')

      callbacks['update-available']({ version: '1.1.0', releaseNotes: 'New stuff', releaseDate: '2026-05-27' })
      expect(mockWebContents.send).toHaveBeenCalledWith('updater:update-available', {
        version: '1.1.0',
        releaseNotes: 'New stuff',
        releaseDate: '2026-05-27'
      })

      callbacks['update-not-available']()
      expect(mockWebContents.send).toHaveBeenCalledWith('updater:not-available')

      callbacks['download-progress']({ percent: 50, bytesPerSecond: 12345 })
      expect(mockWebContents.send).toHaveBeenCalledWith('updater:download-progress', {
        percent: 50,
        bytesPerSecond: 12345
      })

      callbacks['update-downloaded']({ version: '1.1.0', releaseNotes: 'New stuff', releaseDate: '2026-05-27', downloadedFile: '/tmp/Spiral-setup.exe' })
      expect(updaterStore.set).toHaveBeenCalledWith('downloadedVersion', '1.1.0')
      expect(updaterStore.set).toHaveBeenCalledWith('downloadedFile', '/tmp/Spiral-setup.exe')
      expect(mockWebContents.send).toHaveBeenCalledWith('updater:downloaded', {
        version: '1.1.0',
        releaseNotes: 'New stuff',
        releaseDate: '2026-05-27'
      })

      const error = new Error('Update failed')
      callbacks['error'](error)
      expect(mockWebContents.send).toHaveBeenCalledWith('updater:error', 'Update failed')
    })
  })

  describe('checkForUpdates', () => {
    it('calls autoUpdater.checkForUpdates', async () => {
      checkForUpdates()
      expect(autoUpdater.checkForUpdates).toHaveBeenCalled()
    })

    it('sends error to renderer if checkForUpdates fails', async () => {
      ;(autoUpdater.checkForUpdates as any).mockRejectedValueOnce(new Error('Network error'))
      checkForUpdates()
      // Wait for the promise to resolve internally
      await new Promise(process.nextTick)
      expect(mockWebContents.send).toHaveBeenCalledWith('updater:error', 'Network error')
    })
  })

  describe('startDownload', () => {
    it('calls downloadUpdate with a cancellation token and does not install', async () => {
      startDownload()
      expect(autoUpdater.downloadUpdate).toHaveBeenCalledWith(expect.any(Object))
      expect(autoUpdater.quitAndInstall).not.toHaveBeenCalled()
    })

    it('sends error to renderer if downloadUpdate fails', async () => {
      ;(autoUpdater.downloadUpdate as any).mockRejectedValueOnce(new Error('Download failed'))
      startDownload()
      await new Promise(process.nextTick)
      expect(mockWebContents.send).toHaveBeenCalledWith('updater:error', 'Download failed')
    })

    it('sends download-cancelled when the download is cancelled', async () => {
      ;(autoUpdater.downloadUpdate as any).mockRejectedValueOnce(new Error('cancelled'))
      startDownload()
      await new Promise(process.nextTick)
      expect(mockWebContents.send).toHaveBeenCalledWith('updater:download-cancelled')
      expect(mockWebContents.send).not.toHaveBeenCalledWith('updater:error', expect.anything())
    })
  })

  describe('cancelDownload', () => {
    it('cancels the active download token', () => {
      startDownload()
      cancelDownload()
      expect(mockCancel).toHaveBeenCalled()
    })

    it('is a no-op when there is no active download', () => {
      cancelDownload()
      expect(mockCancel).not.toHaveBeenCalled()
    })
  })

  describe('installUpdate', () => {
    /** Drive the registered `update-downloaded` callback so the in-process
     *  download flag is set, mimicking a download completed this session. */
    function markDownloadedThisSession(): void {
      initAutoUpdater()
      const cb = (autoUpdater.on as any).mock.calls.find(
        ([event]: [string]) => event === 'update-downloaded'
      )[1]
      cb({ version: '2.0.0', releaseNotes: null, downloadedFile: '/tmp/Spiral-setup.exe' })
    }

    it('persists the previous version and quits to install when downloaded this session', async () => {
      markDownloadedThisSession()
      vi.clearAllMocks()
      ;(BrowserWindow.getAllWindows as any).mockReturnValue([mockWindow])

      await installUpdate()
      expect(updaterStore.set).toHaveBeenCalledWith('previousVersion', '1.0.0')
      expect(autoUpdater.quitAndInstall).toHaveBeenCalledWith(false, true)
      // No re-hydration needed — the installer path is already in memory.
      expect(autoUpdater.checkForUpdates).not.toHaveBeenCalled()
      expect(autoUpdater.downloadUpdate).not.toHaveBeenCalled()
    })

    it('re-hydrates the cached installer before installing a pending update from a previous session', async () => {
      // Fresh process: no in-process download recorded.
      initAutoUpdater()
      vi.clearAllMocks()
      ;(BrowserWindow.getAllWindows as any).mockReturnValue([mockWindow])

      await installUpdate()
      // Re-check + (cache-)download to restore electron-updater's installer path,
      // then install.
      expect(autoUpdater.checkForUpdates).toHaveBeenCalled()
      expect(autoUpdater.downloadUpdate).toHaveBeenCalledWith()
      expect(autoUpdater.quitAndInstall).toHaveBeenCalledWith(false, true)
    })

    it('reports an error if re-hydration fails', async () => {
      initAutoUpdater()
      vi.clearAllMocks()
      ;(BrowserWindow.getAllWindows as any).mockReturnValue([mockWindow])
      ;(autoUpdater.checkForUpdates as any).mockRejectedValueOnce(new Error('offline'))

      await installUpdate()
      expect(mockWebContents.send).toHaveBeenCalledWith('updater:error', 'offline')
      expect(autoUpdater.quitAndInstall).not.toHaveBeenCalled()
    })

    it('reports an error if quitAndInstall throws', async () => {
      markDownloadedThisSession()
      vi.clearAllMocks()
      ;(BrowserWindow.getAllWindows as any).mockReturnValue([mockWindow])
      ;(autoUpdater.quitAndInstall as any).mockImplementationOnce(() => {
        throw new Error('no cached installer')
      })

      await installUpdate()
      expect(mockWebContents.send).toHaveBeenCalledWith('updater:error', 'no cached installer')
    })
  })

  describe('registerUpdaterIpcHandlers', () => {
    it('registers handlers for all updater IPC events', () => {
      registerUpdaterIpcHandlers()
      expect(ipcMain.handle).toHaveBeenCalledWith('updater:check-for-updates', expect.any(Function))
      expect(ipcMain.handle).toHaveBeenCalledWith('updater:start-download', expect.any(Function))
      expect(ipcMain.handle).toHaveBeenCalledWith('updater:cancel-download', expect.any(Function))
      expect(ipcMain.handle).toHaveBeenCalledWith('updater:install-update', expect.any(Function))
      expect(ipcMain.handle).toHaveBeenCalledWith('updater:get-version', expect.any(Function))
      expect(ipcMain.handle).toHaveBeenCalledWith('updater:get-previous-version', expect.any(Function))
      expect(ipcMain.handle).toHaveBeenCalledWith('updater:clear-previous-version', expect.any(Function))
      expect(ipcMain.handle).toHaveBeenCalledWith('updater:get-downloaded-version', expect.any(Function))
      expect(ipcMain.handle).toHaveBeenCalledWith('updater:clear-downloaded-version', expect.any(Function))
      expect(ipcMain.handle).toHaveBeenCalledWith('updater:get-release-notes', expect.any(Function))
    })
  })

  describe('getPendingInstallVersion', () => {
    it('returns null when no version is stored', () => {
      ;(updaterStore.get as any).mockReturnValue(undefined)
      expect(getPendingInstallVersion()).toBeNull()
    })

    it('returns null and clears state when the installer file is gone', () => {
      ;(updaterStore.get as any).mockImplementation((key: string) =>
        key === 'downloadedVersion' ? '2.0.0' : '/tmp/Spiral-setup.exe'
      )
      ;(existsSync as any).mockReturnValue(false)

      expect(getPendingInstallVersion()).toBeNull()
      expect(updaterStore.delete).toHaveBeenCalledWith('downloadedVersion')
      expect(updaterStore.delete).toHaveBeenCalledWith('downloadedFile')
    })

    it('returns the pending version when the installer file still exists', () => {
      ;(updaterStore.get as any).mockImplementation((key: string) =>
        key === 'downloadedVersion' ? '2.0.0' : '/tmp/Spiral-setup.exe'
      )
      ;(existsSync as any).mockReturnValue(true)

      expect(getPendingInstallVersion()).toBe('2.0.0')
    })
  })

  describe('updater:get-downloaded-version handler', () => {
    function getHandler(): () => unknown {
      registerUpdaterIpcHandlers()
      return (ipcMain.handle as any).mock.calls.find(
        ([channel]: [string]) => channel === 'updater:get-downloaded-version'
      )[1]
    }

    it('returns null when no version is stored', () => {
      ;(updaterStore.get as any).mockReturnValue(undefined)
      expect(getHandler()()).toBeNull()
    })

    it('returns null and clears state when the installer file is gone', () => {
      ;(updaterStore.get as any).mockImplementation((key: string) =>
        key === 'downloadedVersion' ? '2.0.0' : '/tmp/Spiral-setup.exe'
      )
      ;(existsSync as any).mockReturnValue(false)

      expect(getHandler()()).toBeNull()
      expect(updaterStore.delete).toHaveBeenCalledWith('downloadedVersion')
      expect(updaterStore.delete).toHaveBeenCalledWith('downloadedFile')
    })

    it('returns the version when the installer file still exists', () => {
      ;(updaterStore.get as any).mockImplementation((key: string) =>
        key === 'downloadedVersion' ? '2.0.0' : '/tmp/Spiral-setup.exe'
      )
      ;(existsSync as any).mockReturnValue(true)

      expect(getHandler()()).toBe('2.0.0')
    })
  })
})

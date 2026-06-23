import { app, BrowserWindow, ipcMain } from 'electron'
import { autoUpdater, CancellationToken } from 'electron-updater'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { updaterStore } from './store'

export interface UpdateInfo {
  version: string
  releaseNotes: string | null
  releaseDate?: string
}

export interface ReleaseNote {
  version: string
  body: string
  publishedAt: string
}

interface GithubRelease {
  tag_name: string
  name: string
  body: string
  published_at: string
  prerelease: boolean
  draft: boolean
}

/** Flag set during quit-and-install so the before-quit handler allows it through. */
let isInstallingUpdate = false

/** Token for the in-flight download, used to cancel it on request. */
let activeCancellationToken: CancellationToken | null = null

/**
 * True once an update has finished downloading *in the current process*.
 * electron-updater only knows the installer path after its own `update-downloaded`
 * event fires this session; when the pill is restored from disk after a restart
 * this is false, so we must re-hydrate that state before installing.
 */
let hasInProcessDownload = false

function getMainWindow(): BrowserWindow | null {
  return BrowserWindow.getAllWindows()[0] ?? null
}

function send(channel: string, ...args: unknown[]): void {
  getMainWindow()?.webContents.send(channel, ...args)
}

function normaliseReleaseNotes(notes: unknown): string | null {
  if (typeof notes === 'string') return notes
  if (Array.isArray(notes)) {
    return notes
      .map((r: { version?: string; note?: string }) =>
        r.version ? `## ${r.version}\n${r.note ?? ''}` : (r.note ?? '')
      )
      .join('\n\n')
  }
  return null
}

/** Parse the update config YAML to extract owner and repo. */
function readUpdateConfig(): { owner: string; repo: string } | null {
  try {
    const configPath = is.dev
      ? join(app.getAppPath(), 'dev-app-update.yml')
      : join(process.resourcesPath, 'app-update.yml')
    const content = readFileSync(configPath, 'utf-8')
    const result: Record<string, string> = {}
    for (const line of content.split('\n')) {
      const match = line.match(/^(\w+):\s*(.+)$/)
      if (match) {
        result[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '')
      }
    }
    if (result.owner && result.repo) {
      return { owner: result.owner, repo: result.repo }
    }
  } catch {
    // config unavailable in this context
  }
  return null
}

export function initAutoUpdater(): void {
  try {
    hasInProcessDownload = false
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = false

    autoUpdater.on('checking-for-update', () => {
      // The check/download triggered by re-hydration during install is internal —
      // keep the UI on its "installing" state instead of flashing the pill back
      // through checking → available → downloaded.
      if (isInstallingUpdate) return
      send('updater:checking')
    })

    autoUpdater.on('update-available', (info) => {
      // Drop any previously-downloaded installer that no longer matches the newest
      // available version, so we never offer to install a stale cached build.
      const downloaded = updaterStore.get('downloadedVersion')
      if (downloaded && downloaded !== info.version) {
        updaterStore.delete('downloadedVersion')
        updaterStore.delete('downloadedFile')
      }
      if (isInstallingUpdate) return
      send('updater:update-available', {
        version: info.version,
        releaseNotes: normaliseReleaseNotes(info.releaseNotes),
        releaseDate: info.releaseDate
      } satisfies UpdateInfo)
    })

    autoUpdater.on('update-not-available', () => {
      if (isInstallingUpdate) return
      send('updater:not-available')
    })

    autoUpdater.on('download-progress', (progress) => {
      if (isInstallingUpdate) return
      send('updater:download-progress', {
        percent: Math.round(progress.percent),
        bytesPerSecond: progress.bytesPerSecond
      })
    })

    autoUpdater.on('update-downloaded', (info) => {
      activeCancellationToken = null
      hasInProcessDownload = true
      // Persist version + installer path so the "Install Update" pill can be
      // restored on the next launch — but only while the installer still exists
      // (see the get-downloaded-version handler).
      updaterStore.set('downloadedVersion', info.version)
      if (info.downloadedFile) {
        updaterStore.set('downloadedFile', info.downloadedFile)
      }
      if (isInstallingUpdate) return
      send('updater:downloaded', {
        version: info.version,
        releaseNotes: normaliseReleaseNotes(info.releaseNotes),
        releaseDate: info.releaseDate
      } satisfies UpdateInfo)
    })

    autoUpdater.on('error', (err) => {
      if (!isInstallingUpdate) {
        send('updater:error', (err as Error).message)
      }
    })
  } catch (err) {
    console.error('Failed to initialize auto updater:', err)
  }
}

export function checkForUpdates(): void {
  try {
    autoUpdater.checkForUpdates().catch((err) => {
      console.error('Failed to check for updates (async):', err)
      send('updater:error', (err as Error).message)
    })
  } catch (err) {
    console.error('Failed to check for updates (sync):', err)
    send('updater:error', err instanceof Error ? err.message : String(err))
  }
}

/** Begin downloading the available update. Does not install — the renderer drives
 *  installation separately via {@link installUpdate}. */
export function startDownload(): void {
  try {
    const token = new CancellationToken()
    activeCancellationToken = token
    autoUpdater.downloadUpdate(token).catch((err) => {
      activeCancellationToken = null
      if (token.cancelled || (err as Error)?.message?.includes('cancelled')) {
        send('updater:download-cancelled')
        return
      }
      console.error('Failed to download update (async):', err)
      send('updater:error', (err as Error).message)
    })
  } catch (err) {
    activeCancellationToken = null
    console.error('Failed to download update (sync):', err)
    send('updater:error', err instanceof Error ? err.message : String(err))
  }
}

/** Cancel the in-flight download, if any. */
export function cancelDownload(): void {
  try {
    activeCancellationToken?.cancel()
  } catch (err) {
    console.error('Failed to cancel download:', err)
  } finally {
    activeCancellationToken = null
  }
}

/**
 * Re-hydrate electron-updater's in-memory download state from the cached installer.
 * `downloadUpdate` reuses the on-disk file when its sha512 matches the latest
 * release, so this is near-instant and does not re-download. Required before
 * installing a pending update that was downloaded in a previous session.
 */
async function rehydrateDownload(): Promise<void> {
  await autoUpdater.checkForUpdates()
  await autoUpdater.downloadUpdate()
}

/** Install a previously-downloaded update and restart. */
export async function installUpdate(): Promise<void> {
  try {
    isInstallingUpdate = true
    // Persist the current version before the restart so the renderer can
    // detect the "Application Updated" state on the next launch.
    updaterStore.set('previousVersion', app.getVersion())

    // When the download happened in a previous session the pill was restored
    // from disk, but electron-updater has no installer path yet — so
    // `quitAndInstall` would fail with "No update filepath provided". Re-hydrate
    // from the cached installer first (no re-download when the checksum matches).
    if (!hasInProcessDownload) {
      await rehydrateDownload()
    }

    autoUpdater.quitAndInstall(false, true)
  } catch (err) {
    isInstallingUpdate = false
    console.error('Failed to install update:', err)
    send('updater:error', err instanceof Error ? err.message : String(err))
  }
}

export function isUpdating(): boolean {
  return isInstallingUpdate
}

/**
 * Returns the version of a previously-downloaded update that is still pending
 * installation (its installer remains on disk), or null when there is none.
 * Stale entries — where the installer no longer exists — are forgotten.
 *
 * Mirrors the `updater:get-downloaded-version` IPC handler so the main process
 * can decide, at startup, whether the "Install Update" pill will be restored
 * and the background update check can therefore be skipped.
 */
export function getPendingInstallVersion(): string | null {
  const version = updaterStore.get('downloadedVersion')
  if (!version) return null
  const file = updaterStore.get('downloadedFile')
  if (!file || !existsSync(file)) {
    updaterStore.delete('downloadedVersion')
    updaterStore.delete('downloadedFile')
    return null
  }
  return version
}

async function fetchGithubReleases(owner: string, repo: string): Promise<GithubRelease[]> {
  const url = `https://api.github.com/repos/${owner}/${repo}/releases?per_page=100`
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'Spiral-Updater'
    }
  })
  if (!response.ok) {
    throw new Error(`GitHub API responded with ${response.status}`)
  }
  return response.json() as Promise<GithubRelease[]>
}

/** Returns release notes for all non-draft, non-prerelease versions, optionally filtered to those
 *  newer than fromVersion (exclusive). Sorted newest first. */
async function getReleaseNotes(fromVersion?: string | null): Promise<ReleaseNote[]> {
  const config = readUpdateConfig()
  if (!config) {
    return []
  }
  const releases = await fetchGithubReleases(config.owner, config.repo)
  const results: ReleaseNote[] = []
  for (const release of releases) {
    if (release.draft || release.prerelease) continue
    const tagVersion = release.tag_name.replace(/^v/, '')
    if (fromVersion) {
      // Include only versions strictly greater than fromVersion
      if (!isVersionGreater(tagVersion, fromVersion)) continue
    }
    results.push({
      version: tagVersion,
      body: release.body ?? '',
      publishedAt: release.published_at
    })
  }
  // newest first (GitHub already returns newest first, but sort to be safe)
  results.sort((a, b) => compareVersions(b.version, a.version))
  return results
}

/** Simple semver comparison — returns true if versionA > versionB. */
function isVersionGreater(versionA: string, versionB: string): boolean {
  return compareVersions(versionA, versionB) > 0
}

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] ?? 0
    const nb = pb[i] ?? 0
    if (na !== nb) return na - nb
  }
  return 0
}

export function registerUpdaterIpcHandlers(): void {
  ipcMain.handle('updater:check-for-updates', () => {
    checkForUpdates()
  })

  ipcMain.handle('updater:start-download', () => {
    startDownload()
  })

  ipcMain.handle('updater:cancel-download', () => {
    cancelDownload()
  })

  ipcMain.handle('updater:install-update', () => {
    installUpdate()
  })

  ipcMain.handle('updater:get-downloaded-version', () => {
    // Only reports a pending install if its installer actually still exists.
    // The cache may have been cleaned, the update already installed elsewhere,
    // or the pending folder wiped — in which case we forget it.
    return getPendingInstallVersion()
  })

  ipcMain.handle('updater:clear-downloaded-version', () => {
    updaterStore.delete('downloadedVersion')
    updaterStore.delete('downloadedFile')
  })

  ipcMain.handle('updater:get-version', () => app.getVersion())

  ipcMain.handle('updater:get-previous-version', () => {
    return updaterStore.get('previousVersion') ?? null
  })

  ipcMain.handle('updater:clear-previous-version', () => {
    updaterStore.delete('previousVersion')
  })

  ipcMain.handle('updater:get-release-notes', async (_event, fromVersion?: string) => {
    try {
      const notes = await getReleaseNotes(fromVersion)
      return { status: 'ok' as const, notes }
    } catch (err) {
      return { status: 'error' as const, message: (err as Error).message }
    }
  })
}

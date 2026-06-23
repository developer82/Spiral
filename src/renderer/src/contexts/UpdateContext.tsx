import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'updateAvailable'
  | 'downloading'
  | 'downloaded'
  | 'upToDate'
  | 'updated'
  | 'error'

interface UpdateInfo {
  version: string
  releaseNotes: string | null
  releaseDate?: string
}

interface UpdateState {
  status: UpdateStatus
  availableVersion: string | null
  currentVersion: string
  previousVersion: string | null
  releaseNotes: string | null
  downloadPercent: number | null
  downloadSpeed: number | null
  errorMessage: string | null
}

interface UpdateContextValue extends UpdateState {
  checkForUpdates: () => void
  startDownload: () => void
  cancelDownload: () => void
  installUpdate: () => void
}

const UpdateContext = createContext<UpdateContextValue | null>(null)

export function UpdateProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [state, setState] = useState<UpdateState>({
    status: 'idle',
    availableVersion: null,
    currentVersion: '',
    previousVersion: null,
    releaseNotes: null,
    downloadPercent: null,
    downloadSpeed: null,
    errorMessage: null
  })

  // Refs to let timeout callbacks read current state without re-registering effects.
  const upToDateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const updatedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Initial version fetch ────────────────────────────────────────────────
  useEffect(() => {
    void (async () => {
      try {
        const [currentVersion, previousVersion, downloadedVersion] = await Promise.all([
          window.api.updater.getVersion(),
          window.api.updater.getPreviousVersion(),
          window.api.updater.getDownloadedVersion()
        ])

        // If the app just updated (previous version stored and differs), show
        // the "Application Updated" pill.
        const justUpdated = previousVersion !== null && previousVersion !== currentVersion

        // If an update finished downloading in a previous session but was never
        // installed, restore the "Install Update" pill.
        const hasPendingInstall =
          !justUpdated && downloadedVersion !== null && downloadedVersion !== currentVersion

        setState((s) => ({
          ...s,
          currentVersion,
          previousVersion,
          availableVersion: hasPendingInstall ? downloadedVersion : s.availableVersion,
          status: justUpdated ? 'updated' : hasPendingInstall ? 'downloaded' : s.status
        }))

        // Clear the persisted state immediately so the pill is shown only on the
        // first launch after an update — even if the app is closed before the
        // 60 s hide timer fires. The timer below only hides the pill from view.
        if (justUpdated) {
          void window.api.updater.clearPreviousVersion()
          void window.api.updater.clearDownloadedVersion()
          updatedTimerRef.current = setTimeout(() => {
            setState((s) => (s.status === 'updated' ? { ...s, status: 'idle' } : s))
          }, 60_000)
        }
      } catch (err) {
        console.error('Failed to retrieve application version information:', err)
      }
    })()

    return () => {
      if (upToDateTimerRef.current) clearTimeout(upToDateTimerRef.current)
      if (updatedTimerRef.current) clearTimeout(updatedTimerRef.current)
    }
  }, [])

  // ── IPC event subscriptions ──────────────────────────────────────────────
  useEffect(() => {
    const unChecking = window.api.updater.onChecking(() => {
      setState((s) => ({ ...s, status: 'checking', errorMessage: null }))
    })

    const unAvailable = window.api.updater.onUpdateAvailable((info: UpdateInfo) => {
      setState((s) => ({
        ...s,
        status: 'updateAvailable',
        availableVersion: info.version,
        releaseNotes: info.releaseNotes
      }))
    })

    const unNotAvailable = window.api.updater.onNotAvailable(() => {
      setState((s) => ({ ...s, status: 'upToDate' }))
      // Hide "Up to date" pill after 10 seconds
      if (upToDateTimerRef.current) clearTimeout(upToDateTimerRef.current)
      upToDateTimerRef.current = setTimeout(() => {
        setState((s) => (s.status === 'upToDate' ? { ...s, status: 'idle' } : s))
      }, 10_000)
    })

    const unProgress = window.api.updater.onDownloadProgress(
      ({ percent, bytesPerSecond }: { percent: number; bytesPerSecond: number }) => {
        setState((s) => ({
          ...s,
          status: 'downloading',
          downloadPercent: percent,
          downloadSpeed: bytesPerSecond
        }))
      }
    )

    const unCancelled = window.api.updater.onDownloadCancelled(() => {
      setState((s) => ({
        ...s,
        status: 'updateAvailable',
        downloadPercent: null,
        downloadSpeed: null
      }))
    })

    const unDownloaded = window.api.updater.onDownloaded((info: UpdateInfo) => {
      setState((s) => ({
        ...s,
        status: 'downloaded',
        availableVersion: info.version,
        releaseNotes: info.releaseNotes,
        downloadPercent: null,
        downloadSpeed: null
      }))
    })

    const unError = window.api.updater.onError((message: string) => {
      setState((s) => ({ ...s, status: 'error', errorMessage: message }))
    })

    const unMenu = window.api.updater.onCheckForUpdatesMenu(() => {
      void window.api.updater.checkForUpdates()
    })

    return () => {
      unChecking()
      unAvailable()
      unNotAvailable()
      unProgress()
      unCancelled()
      unDownloaded()
      unError()
      unMenu()
    }
  }, [])

  const checkForUpdates = useCallback(() => {
    void window.api.updater.checkForUpdates()
  }, [])

  const startDownload = useCallback(() => {
    setState((s) => ({ ...s, status: 'downloading', downloadPercent: 0, downloadSpeed: null }))
    void window.api.updater.startDownload()
  }, [])

  const cancelDownload = useCallback(() => {
    void window.api.updater.cancelDownload()
  }, [])

  const installUpdate = useCallback(() => {
    void window.api.updater.installUpdate()
  }, [])

  return (
    <UpdateContext.Provider
      value={{ ...state, checkForUpdates, startDownload, cancelDownload, installUpdate }}
    >
      {children}
    </UpdateContext.Provider>
  )
}

export function useUpdateContext(): UpdateContextValue {
  const ctx = useContext(UpdateContext)
  if (!ctx) throw new Error('useUpdateContext must be used inside UpdateProvider')
  return ctx
}

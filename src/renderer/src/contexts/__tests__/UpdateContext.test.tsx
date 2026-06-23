// @vitest-environment jsdom
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UpdateProvider, useUpdateContext } from '../UpdateContext'

type UpdaterApi = typeof window.api.updater

/** Captured event callbacks so tests can drive IPC events manually. */
interface Captured {
  progress?: (data: { percent: number; bytesPerSecond: number }) => void
  cancelled?: () => void
  downloaded?: (info: { version: string; releaseNotes: string | null }) => void
}

function buildUpdaterMock(captured: Captured, overrides: Partial<UpdaterApi> = {}): UpdaterApi {
  return {
    checkForUpdates: vi.fn(() => Promise.resolve()),
    startDownload: vi.fn(() => Promise.resolve()),
    cancelDownload: vi.fn(() => Promise.resolve()),
    installUpdate: vi.fn(() => Promise.resolve()),
    getVersion: vi.fn(() => Promise.resolve('1.0.0')),
    getPreviousVersion: vi.fn(() => Promise.resolve(null)),
    clearPreviousVersion: vi.fn(() => Promise.resolve()),
    getDownloadedVersion: vi.fn(() => Promise.resolve(null)),
    clearDownloadedVersion: vi.fn(() => Promise.resolve()),
    getReleaseNotes: vi.fn(() => Promise.resolve({ status: 'ok' as const, notes: [] })),
    onChecking: vi.fn(() => () => {}),
    onUpdateAvailable: vi.fn(() => () => {}),
    onNotAvailable: vi.fn(() => () => {}),
    onDownloadProgress: vi.fn((cb) => {
      captured.progress = cb
      return () => {}
    }),
    onDownloadCancelled: vi.fn((cb) => {
      captured.cancelled = cb
      return () => {}
    }),
    onDownloaded: vi.fn((cb) => {
      captured.downloaded = cb
      return () => {}
    }),
    onError: vi.fn(() => () => {}),
    onCheckForUpdatesMenu: vi.fn(() => () => {}),
    ...overrides
  } as UpdaterApi
}

function TestConsumer({
  onRender
}: {
  onRender: (value: ReturnType<typeof useUpdateContext>) => void
}): null {
  onRender(useUpdateContext())
  return null
}

describe('UpdateContext', () => {
  let captured: Captured
  let latest: ReturnType<typeof useUpdateContext>

  function renderProvider(): void {
    render(
      <UpdateProvider>
        <TestConsumer
          onRender={(v) => {
            latest = v
          }}
        />
      </UpdateProvider>
    )
  }

  beforeEach(() => {
    captured = {}
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('shows the "downloaded" status on init when a download is pending from a prior session', async () => {
    window.api.updater = buildUpdaterMock(captured, {
      getVersion: vi.fn(() => Promise.resolve('1.0.0')),
      getDownloadedVersion: vi.fn(() => Promise.resolve('2.0.0'))
    })
    renderProvider()

    await waitFor(() => expect(latest.status).toBe('downloaded'))
    expect(latest.availableVersion).toBe('2.0.0')
  })

  it('shows the "updated" pill and clears persisted state immediately on first launch after an update', async () => {
    window.api.updater = buildUpdaterMock(captured, {
      getVersion: vi.fn(() => Promise.resolve('2.0.0')),
      getPreviousVersion: vi.fn(() => Promise.resolve('1.0.0'))
    })
    renderProvider()

    await waitFor(() => expect(latest.status).toBe('updated'))
    // Persisted state cleared right away so the pill never re-shows on later launches.
    expect(window.api.updater.clearPreviousVersion).toHaveBeenCalled()
    expect(window.api.updater.clearDownloadedVersion).toHaveBeenCalled()
  })

  it('stays idle on init when there is no pending download', async () => {
    window.api.updater = buildUpdaterMock(captured)
    renderProvider()

    await waitFor(() => expect(window.api.updater.getDownloadedVersion).toHaveBeenCalled())
    expect(latest.status).toBe('idle')
  })

  it('updates percent and speed on download-progress events', async () => {
    window.api.updater = buildUpdaterMock(captured)
    renderProvider()
    await waitFor(() => expect(captured.progress).toBeDefined())

    act(() => captured.progress!({ percent: 73, bytesPerSecond: 2_000_000 }))

    expect(latest.status).toBe('downloading')
    expect(latest.downloadPercent).toBe(73)
    expect(latest.downloadSpeed).toBe(2_000_000)
  })

  it('reverts to updateAvailable when the download is cancelled', async () => {
    window.api.updater = buildUpdaterMock(captured)
    renderProvider()
    await waitFor(() => expect(captured.cancelled).toBeDefined())

    act(() => captured.progress!({ percent: 40, bytesPerSecond: 1000 }))
    act(() => captured.cancelled!())

    expect(latest.status).toBe('updateAvailable')
    expect(latest.downloadPercent).toBeNull()
    expect(latest.downloadSpeed).toBeNull()
  })

  it('startDownload optimistically enters the downloading state', async () => {
    window.api.updater = buildUpdaterMock(captured)
    renderProvider()
    await waitFor(() => expect(latest).toBeDefined())

    act(() => latest.startDownload())

    expect(latest.status).toBe('downloading')
    expect(latest.downloadPercent).toBe(0)
    expect(window.api.updater.startDownload).toHaveBeenCalled()
  })
})

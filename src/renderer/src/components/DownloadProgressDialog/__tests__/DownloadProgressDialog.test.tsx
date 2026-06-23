// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import DownloadProgressDialog from '../DownloadProgressDialog'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}))

const mockCancelDownload = vi.fn()
const mockInstallUpdate = vi.fn()
const mockTriggerConfetti = vi.fn()

let mockUpdateState: Record<string, unknown>

vi.mock('../../../contexts/UpdateContext', () => ({
  useUpdateContext: () => mockUpdateState
}))

vi.mock('../../../hooks/useConfetti', () => ({
  useConfetti: () => ({ triggerConfetti: mockTriggerConfetti })
}))

function baseState(): Record<string, unknown> {
  return {
    status: 'downloading',
    downloadPercent: 50,
    downloadSpeed: 2_000_000,
    availableVersion: '2.0.0',
    cancelDownload: mockCancelDownload,
    installUpdate: mockInstallUpdate
  }
}

describe('DownloadProgressDialog', () => {
  beforeEach(() => {
    mockCancelDownload.mockClear()
    mockInstallUpdate.mockClear()
    mockTriggerConfetti.mockClear()
    mockUpdateState = baseState()
  })

  afterEach(() => cleanup())

  it('shows progress text and a Cancel Download button while downloading', () => {
    render(<DownloadProgressDialog onClose={vi.fn()} />)

    expect(screen.getByText('update.downloadProgressTitle')).toBeInTheDocument()
    expect(screen.getByText('update.downloadProgressText')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'update.cancelDownload' })).toBeInTheDocument()
  })

  it('asks for confirmation before cancelling, then cancels and closes', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<DownloadProgressDialog onClose={onClose} />)

    await user.click(screen.getByRole('button', { name: 'update.cancelDownload' }))

    // Confirm dialog now visible
    expect(screen.getByText('update.cancelDownloadConfirmMessage')).toBeInTheDocument()
    expect(mockCancelDownload).not.toHaveBeenCalled()

    // The confirm button is the second one with this label (inside the confirm dialog)
    const confirmButtons = screen.getAllByRole('button', { name: 'update.cancelDownload' })
    await user.click(confirmButtons[confirmButtons.length - 1])

    expect(mockCancelDownload).toHaveBeenCalledOnce()
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('hides the dialog without cancelling when "Continue in Background" is clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<DownloadProgressDialog onClose={onClose} />)

    await user.click(screen.getByRole('button', { name: 'update.hideDownload' }))

    expect(onClose).toHaveBeenCalledOnce()
    expect(mockCancelDownload).not.toHaveBeenCalled()
  })

  it('shows Download Complete, fires confetti, and installs on confirm when downloaded', async () => {
    const user = userEvent.setup()
    mockUpdateState = { ...baseState(), status: 'downloaded' }
    render(<DownloadProgressDialog onClose={vi.fn()} />)

    expect(screen.getByText('update.downloadComplete')).toBeInTheDocument()
    expect(mockTriggerConfetti).toHaveBeenCalledOnce()
    // Cancel option is gone
    expect(screen.queryByRole('button', { name: 'update.cancelDownload' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'update.installNow' }))
    expect(mockInstallUpdate).toHaveBeenCalledOnce()
  })
})

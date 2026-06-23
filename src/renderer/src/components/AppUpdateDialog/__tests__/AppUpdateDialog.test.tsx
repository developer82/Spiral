// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AppUpdateDialog from '../AppUpdateDialog'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}))

const mockStartDownload = vi.fn()

vi.mock('../../../contexts/UpdateContext', () => ({
  useUpdateContext: () => ({
    currentVersion: '1.0.0',
    availableVersion: '2.0.0',
    releaseNotes: null,
    startDownload: mockStartDownload
  })
}))

describe('AppUpdateDialog', () => {
  beforeEach(() => mockStartDownload.mockClear())
  afterEach(() => cleanup())

  it('shows the current and new versions', () => {
    render(<AppUpdateDialog onClose={vi.fn()} />)
    expect(screen.getByText('1.0.0')).toBeInTheDocument()
    expect(screen.getByText('2.0.0')).toBeInTheDocument()
  })

  it('starts the download and closes when Update Now is clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<AppUpdateDialog onClose={onClose} />)

    await user.click(screen.getByRole('button', { name: 'update.updateNowButton' }))

    expect(mockStartDownload).toHaveBeenCalledOnce()
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('closes without downloading when Later is clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<AppUpdateDialog onClose={onClose} />)

    await user.click(screen.getByRole('button', { name: 'update.laterButton' }))

    expect(mockStartDownload).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledOnce()
  })
})

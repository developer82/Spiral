// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AppLockGate from '../AppLockGate'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}))

function renderGate(children: React.ReactNode = <div>App Content</div>) {
  return render(<AppLockGate>{children}</AppLockGate>)
}

describe('AppLockGate', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    cleanup()
  })

  it('renders children when no password is set', async () => {
    vi.spyOn(window.api.auth, 'getState').mockResolvedValue({
      hasPassword: false,
      lockOnStartup: false,
      lockOnInactivity: false,
      lockOnMinimize: false,
      inactivityTimeoutMinutes: 5,
      lockout: { isLockedOut: false, lockedUntilMs: null }
    })

    renderGate()
    await waitFor(() => expect(screen.getByText('App Content')).toBeInTheDocument())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders children when password set but lockOnStartup is false', async () => {
    vi.spyOn(window.api.auth, 'getState').mockResolvedValue({
      hasPassword: true,
      lockOnStartup: false,
      lockOnInactivity: false,
      lockOnMinimize: false,
      inactivityTimeoutMinutes: 5,
      lockout: { isLockedOut: false, lockedUntilMs: null }
    })

    renderGate()
    await waitFor(() => expect(screen.getByText('App Content')).toBeInTheDocument())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows lock screen when password set and lockOnStartup is true', async () => {
    vi.spyOn(window.api.auth, 'getState').mockResolvedValue({
      hasPassword: true,
      lockOnStartup: true,
      lockOnInactivity: false,
      lockOnMinimize: false,
      inactivityTimeoutMinutes: 5,
      lockout: { isLockedOut: false, lockedUntilMs: null }
    })

    renderGate()
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    expect(screen.getByText('Application Locked')).toBeInTheDocument()
    expect(screen.queryByText('App Content')).not.toBeInTheDocument()
  })

  it('unlocks the app on correct password', async () => {
    vi.spyOn(window.api.auth, 'getState').mockResolvedValue({
      hasPassword: true,
      lockOnStartup: true,
      lockOnInactivity: false,
      lockOnMinimize: false,
      inactivityTimeoutMinutes: 5,
      lockout: { isLockedOut: false, lockedUntilMs: null }
    })
    vi.spyOn(window.api.auth, 'verify').mockResolvedValue({ valid: true })

    renderGate()
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

    await userEvent.type(screen.getByPlaceholderText('Password'), 'secret')
    await userEvent.click(screen.getByText('Unlock'))

    await waitFor(() => expect(screen.getByText('App Content')).toBeInTheDocument())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows error on wrong password', async () => {
    vi.spyOn(window.api.auth, 'getState').mockResolvedValue({
      hasPassword: true,
      lockOnStartup: true,
      lockOnInactivity: false,
      lockOnMinimize: false,
      inactivityTimeoutMinutes: 5,
      lockout: { isLockedOut: false, lockedUntilMs: null }
    })
    vi.spyOn(window.api.auth, 'verify').mockResolvedValue({ valid: false })

    renderGate()
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

    await userEvent.type(screen.getByPlaceholderText('Password'), 'wrong')
    await userEvent.click(screen.getByText('Unlock'))

    await waitFor(() => expect(screen.getByText('Incorrect password. Please try again.')).toBeInTheDocument())
    expect(screen.queryByText('App Content')).not.toBeInTheDocument()
  })

  it('unlock button is disabled when password input is empty', async () => {
    vi.spyOn(window.api.auth, 'getState').mockResolvedValue({
      hasPassword: true,
      lockOnStartup: true,
      lockOnInactivity: false,
      lockOnMinimize: false,
      inactivityTimeoutMinutes: 5,
      lockout: { isLockedOut: false, lockedUntilMs: null }
    })

    renderGate()
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

    expect(screen.getByText('Unlock')).toBeDisabled()
  })

  it('shows generic error on first wrong password (no count)', async () => {
    vi.spyOn(window.api.auth, 'getState').mockResolvedValue({
      hasPassword: true,
      lockOnStartup: true,
      lockOnInactivity: false,
      lockOnMinimize: false,
      inactivityTimeoutMinutes: 5,
      lockout: { isLockedOut: false, lockedUntilMs: null }
    })
    vi.spyOn(window.api.auth, 'verify').mockResolvedValue({ valid: false, attemptsRemaining: null })

    renderGate()
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

    await userEvent.type(screen.getByPlaceholderText('Password'), 'wrong')
    await userEvent.click(screen.getByText('Unlock'))

    await waitFor(() => expect(screen.getByText('Incorrect password. Please try again.')).toBeInTheDocument())
  })

  it('shows remaining tries count from 2nd wrong attempt onward', async () => {
    vi.spyOn(window.api.auth, 'getState').mockResolvedValue({
      hasPassword: true,
      lockOnStartup: true,
      lockOnInactivity: false,
      lockOnMinimize: false,
      inactivityTimeoutMinutes: 5,
      lockout: { isLockedOut: false, lockedUntilMs: null }
    })
    vi.spyOn(window.api.auth, 'verify').mockResolvedValue({ valid: false, attemptsRemaining: 3 })

    renderGate()
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

    await userEvent.type(screen.getByPlaceholderText('Password'), 'wrong')
    await userEvent.click(screen.getByText('Unlock'))

    await waitFor(() => expect(screen.getByText('Incorrect password. 3 tries remaining.')).toBeInTheDocument())
  })

  it('uses singular "try" when 1 attempt remaining', async () => {
    vi.spyOn(window.api.auth, 'getState').mockResolvedValue({
      hasPassword: true,
      lockOnStartup: true,
      lockOnInactivity: false,
      lockOnMinimize: false,
      inactivityTimeoutMinutes: 5,
      lockout: { isLockedOut: false, lockedUntilMs: null }
    })
    vi.spyOn(window.api.auth, 'verify').mockResolvedValue({ valid: false, attemptsRemaining: 1 })

    renderGate()
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

    await userEvent.type(screen.getByPlaceholderText('Password'), 'wrong')
    await userEvent.click(screen.getByText('Unlock'))

    await waitFor(() => expect(screen.getByText('Incorrect password. 1 try remaining.')).toBeInTheDocument())
  })

  it('shows lockout countdown message when verify returns lockedOut', async () => {
    vi.spyOn(window.api.auth, 'getState').mockResolvedValue({
      hasPassword: true,
      lockOnStartup: true,
      lockOnInactivity: false,
      lockOnMinimize: false,
      inactivityTimeoutMinutes: 5,
      lockout: { isLockedOut: false, lockedUntilMs: null }
    })
    vi.spyOn(window.api.auth, 'verify').mockResolvedValue({
      valid: false,
      lockedOut: true,
      lockedUntilMs: Date.now() + 60_000
    })

    renderGate()
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

    await userEvent.type(screen.getByPlaceholderText('Password'), 'wrong')
    await userEvent.click(screen.getByText('Unlock'))

    await waitFor(() => expect(screen.getByText(/Too many failed attempts/)).toBeInTheDocument())
  })

  it('disables input and button when locked out', async () => {
    const lockedUntilMs = Date.now() + 60_000
    vi.spyOn(window.api.auth, 'getState').mockResolvedValue({
      hasPassword: true,
      lockOnStartup: true,
      lockOnInactivity: false,
      lockOnMinimize: false,
      inactivityTimeoutMinutes: 5,
      lockout: { isLockedOut: true, lockedUntilMs }
    })

    renderGate()
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Password')).toBeDisabled()
      expect(screen.getByText('Unlock')).toBeDisabled()
    })
  })

  it('shows lockout message on open when already locked out', async () => {
    const lockedUntilMs = Date.now() + 60_000
    vi.spyOn(window.api.auth, 'getState').mockResolvedValue({
      hasPassword: true,
      lockOnStartup: true,
      lockOnInactivity: false,
      lockOnMinimize: false,
      inactivityTimeoutMinutes: 5,
      lockout: { isLockedOut: true, lockedUntilMs }
    })

    renderGate()
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

    await waitFor(() => expect(screen.getByText(/Too many failed attempts/)).toBeInTheDocument())
  })

  it('locks when main process sends auth:lock event', async () => {
    let lockCb: (() => void) | null = null
    vi.spyOn(window.api.auth, 'getState').mockResolvedValue({
      hasPassword: true,
      lockOnStartup: false,
      lockOnInactivity: false,
      lockOnMinimize: false,
      inactivityTimeoutMinutes: 5,
      lockout: { isLockedOut: false, lockedUntilMs: null }
    })
    vi.spyOn(window.api.auth, 'onLock').mockImplementation((cb) => {
      lockCb = cb
      return () => { lockCb = null }
    })

    renderGate()
    await waitFor(() => expect(screen.getByText('App Content')).toBeInTheDocument())

    expect(lockCb).not.toBeNull()
    lockCb!()

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
  })
})

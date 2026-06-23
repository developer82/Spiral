// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import UserProfileSettings from '../UserProfileSettings'
import { ProfileProvider } from '../../../contexts/ProfileContext'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}))

function renderSettings() {
  return render(
    <ProfileProvider>
      <UserProfileSettings />
    </ProfileProvider>
  )
}

describe('UserProfileSettings', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    cleanup()
  })

  it('renders identity section with display name input', async () => {
    renderSettings()
    await waitFor(() => {
      // i18n returns the key, so the label text is the key
      expect(screen.getByLabelText('settings.userProfile.displayName')).toBeInTheDocument()
    })
  })

  it('shows "No Password Set" card when there is no password', async () => {
    vi.spyOn(window.api.auth, 'getState').mockResolvedValue({
      hasPassword: false,
      lockOnStartup: false,
      lockOnInactivity: false,
      lockOnMinimize: false,
      inactivityTimeoutMinutes: 5,
      lockout: { isLockedOut: false, lockedUntilMs: null }
    })

    renderSettings()

    await waitFor(() => {
      expect(screen.getByText('settings.userProfile.password.noPasswordTitle')).toBeInTheDocument()
    })
  })

  it('shows "Password Set" card when password exists', async () => {
    vi.spyOn(window.api.auth, 'getState').mockResolvedValue({
      hasPassword: true,
      lockOnStartup: false,
      lockOnInactivity: false,
      lockOnMinimize: false,
      inactivityTimeoutMinutes: 5,
      lockout: { isLockedOut: false, lockedUntilMs: null }
    })

    renderSettings()

    await waitFor(() => {
      expect(screen.getByText('settings.userProfile.password.hasPasswordTitle')).toBeInTheDocument()
    })
  })

  it('shows lock settings section only when password is set', async () => {
    vi.spyOn(window.api.auth, 'getState').mockResolvedValue({
      hasPassword: true,
      lockOnStartup: false,
      lockOnInactivity: false,
      lockOnMinimize: false,
      inactivityTimeoutMinutes: 5,
      lockout: { isLockedOut: false, lockedUntilMs: null }
    })

    renderSettings()

    await waitFor(() => {
      expect(screen.getByText('settings.userProfile.lockSection')).toBeInTheDocument()
    })
  })

  it('does not show lock settings when no password', async () => {
    vi.spyOn(window.api.auth, 'getState').mockResolvedValue({
      hasPassword: false,
      lockOnStartup: false,
      lockOnInactivity: false,
      lockOnMinimize: false,
      inactivityTimeoutMinutes: 5,
      lockout: { isLockedOut: false, lockedUntilMs: null }
    })

    renderSettings()

    await waitFor(() => screen.getByText('settings.userProfile.password.noPasswordTitle'))
    expect(screen.queryByText('settings.userProfile.lockSection')).not.toBeInTheDocument()
  })

  it('shows the set password form when clicking Set Password button', async () => {
    vi.spyOn(window.api.auth, 'getState').mockResolvedValue({
      hasPassword: false,
      lockOnStartup: false,
      lockOnInactivity: false,
      lockOnMinimize: false,
      inactivityTimeoutMinutes: 5,
      lockout: { isLockedOut: false, lockedUntilMs: null }
    })

    renderSettings()

    await waitFor(() => screen.getByText('settings.userProfile.password.setButton'))
    await userEvent.click(screen.getByText('settings.userProfile.password.setButton'))

    expect(screen.getByPlaceholderText('settings.userProfile.password.newPlaceholder')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('settings.userProfile.password.confirmPlaceholder')).toBeInTheDocument()
  })

  it('shows mismatch error when new passwords do not match', async () => {
    vi.spyOn(window.api.auth, 'getState').mockResolvedValue({
      hasPassword: false,
      lockOnStartup: false,
      lockOnInactivity: false,
      lockOnMinimize: false,
      inactivityTimeoutMinutes: 5,
      lockout: { isLockedOut: false, lockedUntilMs: null }
    })

    renderSettings()

    await waitFor(() => screen.getByText('settings.userProfile.password.setButton'))
    await userEvent.click(screen.getByText('settings.userProfile.password.setButton'))

    await userEvent.type(screen.getByPlaceholderText('settings.userProfile.password.newPlaceholder'), 'abc')
    await userEvent.type(screen.getByPlaceholderText('settings.userProfile.password.confirmPlaceholder'), 'xyz')
    await userEvent.click(screen.getByText('settings.userProfile.password.setConfirm'))

    await waitFor(() => {
      expect(screen.getByText('settings.userProfile.password.errorMismatch')).toBeInTheDocument()
    })
  })

  it('calls setPassword API with matching passwords', async () => {
    vi.spyOn(window.api.auth, 'getState').mockResolvedValue({
      hasPassword: false,
      lockOnStartup: false,
      lockOnInactivity: false,
      lockOnMinimize: false,
      inactivityTimeoutMinutes: 5,
      lockout: { isLockedOut: false, lockedUntilMs: null }
    })
    vi.spyOn(window.api.auth, 'setPassword').mockResolvedValue({ status: 'ok' })

    renderSettings()

    await waitFor(() => screen.getByText('settings.userProfile.password.setButton'))
    await userEvent.click(screen.getByText('settings.userProfile.password.setButton'))

    await userEvent.type(screen.getByPlaceholderText('settings.userProfile.password.newPlaceholder'), 'secret')
    await userEvent.type(screen.getByPlaceholderText('settings.userProfile.password.confirmPlaceholder'), 'secret')
    await userEvent.click(screen.getByText('settings.userProfile.password.setConfirm'))

    await waitFor(() => {
      expect(window.api.auth.setPassword).toHaveBeenCalledWith('secret')
    })
  })

  it('populates display name input from profile on mount', async () => {
    vi.spyOn(window.api.profile, 'get').mockResolvedValue({
      displayName: 'Charlie',
      avatarFile: null,
      avatarZoom: 1,
      avatarOffsetX: 0,
      avatarOffsetY: 0,
      lockOnStartup: false,
      lockOnInactivity: false,
      inactivityTimeoutMinutes: 5,
      passwordMeta: null
    })

    renderSettings()

    await waitFor(() => {
      const input = screen.getByLabelText('settings.userProfile.displayName') as HTMLInputElement
      expect(input.value).toBe('Charlie')
    })
  })

  it('shows avatar image when avatarDataUrl is available', async () => {
    vi.spyOn(window.api.profile, 'getAvatarDataUrl').mockResolvedValue('data:image/png;base64,TEST')

    renderSettings()

    await waitFor(() => {
      const img = screen.getByAltText('settings.userProfile.avatarAlt') as HTMLImageElement
      expect(img.src).toContain('data:image/png;base64,TEST')
    })
  })
})

// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ProfileProvider, useProfileContext } from '../ProfileContext'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}))

function ProfileConsumer(): React.JSX.Element {
  const { profile, setDisplayName, pickAvatar, removeAvatar } = useProfileContext()
  return (
    <div>
      <span data-testid="name">{profile.displayName}</span>
      <span data-testid="has-password">{String(profile.hasPassword)}</span>
      <span data-testid="avatar">{profile.avatarDataUrl ?? 'null'}</span>
      <button onClick={() => void setDisplayName('Alice')}>Set Name</button>
      <button onClick={() => void pickAvatar()}>Pick Avatar</button>
      <button onClick={() => void removeAvatar()}>Remove Avatar</button>
    </div>
  )
}

describe('ProfileContext', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    cleanup()
  })

  it('loads profile data on mount', async () => {
    vi.spyOn(window.api.profile, 'get').mockResolvedValue({
      displayName: 'Bob',
      avatarFile: null,
      avatarZoom: 1,
      avatarOffsetX: 0,
      avatarOffsetY: 0,
      lockOnStartup: false,
      lockOnInactivity: false,
      inactivityTimeoutMinutes: 5,
      passwordMeta: null
    })
    vi.spyOn(window.api.auth, 'getState').mockResolvedValue({
      hasPassword: true,
      lockOnStartup: false,
      lockOnInactivity: false,
      lockOnMinimize: false,
      inactivityTimeoutMinutes: 5,
      lockout: { isLockedOut: false, lockedUntilMs: null }
    })
    vi.spyOn(window.api.profile, 'getAvatarDataUrl').mockResolvedValue('data:image/png;base64,ABC')

    render(<ProfileProvider><ProfileConsumer /></ProfileProvider>)

    await waitFor(() => {
      expect(screen.getByTestId('name').textContent).toBe('Bob')
      expect(screen.getByTestId('has-password').textContent).toBe('true')
      expect(screen.getByTestId('avatar').textContent).toBe('data:image/png;base64,ABC')
    })
  })

  it('updates display name optimistically', async () => {
    vi.spyOn(window.api.profile, 'setName').mockResolvedValue()
    render(<ProfileProvider><ProfileConsumer /></ProfileProvider>)

    await userEvent.click(screen.getByText('Set Name'))

    await waitFor(() => {
      expect(screen.getByTestId('name').textContent).toBe('Alice')
      expect(window.api.profile.setName).toHaveBeenCalledWith('Alice')
    })
  })

  it('calls pickAvatar and refreshes avatar data URL', async () => {
    vi.spyOn(window.api.profile, 'pickAvatar').mockResolvedValue({ status: 'ok', avatarFile: 'avatar.png' })
    vi.spyOn(window.api.profile, 'getAvatarDataUrl').mockResolvedValue('data:image/png;base64,NEW')

    render(<ProfileProvider><ProfileConsumer /></ProfileProvider>)

    await userEvent.click(screen.getByText('Pick Avatar'))

    await waitFor(() => {
      expect(screen.getByTestId('avatar').textContent).toBe('data:image/png;base64,NEW')
    })
  })

  it('clears avatar data URL when removed', async () => {
    vi.spyOn(window.api.profile, 'getAvatarDataUrl').mockResolvedValue('data:image/png;base64,EXISTING')
    vi.spyOn(window.api.profile, 'removeAvatar').mockResolvedValue()

    render(<ProfileProvider><ProfileConsumer /></ProfileProvider>)

    await waitFor(() => expect(screen.getByTestId('avatar').textContent).toBe('data:image/png;base64,EXISTING'))

    await userEvent.click(screen.getByText('Remove Avatar'))

    await waitFor(() => {
      expect(screen.getByTestId('avatar').textContent).toBe('null')
    })
  })

  it('throws when used outside ProfileProvider', () => {
    const err = console.error
    console.error = vi.fn()
    expect(() => render(<ProfileConsumer />)).toThrow()
    cleanup()
    console.error = err
  })

  it('returns default profile state before async load', () => {
    vi.spyOn(window.api.profile, 'get').mockReturnValue(new Promise(() => {}))
    vi.spyOn(window.api.auth, 'getState').mockReturnValue(new Promise(() => {}))
    vi.spyOn(window.api.profile, 'getAvatarDataUrl').mockReturnValue(new Promise(() => {}))

    render(<ProfileProvider><ProfileConsumer /></ProfileProvider>)

    expect(screen.getByTestId('name').textContent).toBe('')
    expect(screen.getByTestId('has-password').textContent).toBe('false')
    expect(screen.getByTestId('avatar').textContent).toBe('null')
  })
})

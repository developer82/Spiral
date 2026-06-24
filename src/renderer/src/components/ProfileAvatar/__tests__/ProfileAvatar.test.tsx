import { render, screen, cleanup } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import ProfileAvatar from '../ProfileAvatar'

const mockProfile = {
  displayName: 'Ada Lovelace',
  avatarDataUrl: null as string | null,
  avatarZoom: 1,
  avatarOffsetX: 0,
  avatarOffsetY: 0,
  lockOnStartup: false,
  lockOnInactivity: false,
  lockOnMinimize: false,
  inactivityTimeoutMinutes: 5,
  hasPassword: false
}

vi.mock('../../../contexts/ProfileContext', () => ({
  useProfileContext: () => ({ profile: mockProfile })
}))

afterEach(() => {
  cleanup()
  mockProfile.displayName = 'Ada Lovelace'
  mockProfile.avatarDataUrl = null
  mockProfile.avatarZoom = 1
  mockProfile.avatarOffsetX = 0
  mockProfile.avatarOffsetY = 0
})

describe('ProfileAvatar', () => {
  it('renders a placeholder with initials when no avatar image is set', () => {
    render(<ProfileAvatar />)
    expect(screen.getByText('AL')).toBeInTheDocument()
    expect(document.querySelector('.profile-avatar__img')).not.toBeInTheDocument()
  })

  it('renders the avatar image with the stored zoom/offset transform when set', () => {
    mockProfile.avatarDataUrl = 'data:image/png;base64,abc'
    mockProfile.avatarZoom = 1.5
    mockProfile.avatarOffsetX = 10
    mockProfile.avatarOffsetY = -5

    render(<ProfileAvatar size={24} />)

    const img = document.querySelector('.profile-avatar__img') as HTMLImageElement
    expect(img).toBeInTheDocument()
    expect(img.getAttribute('src')).toBe('data:image/png;base64,abc')
    expect(img.style.transform).toBe('translate(10%, -5%) scale(1.5)')
  })

  it('applies the requested size to the image clip container', () => {
    mockProfile.avatarDataUrl = 'data:image/png;base64,abc'

    render(<ProfileAvatar size={40} />)

    const clip = document.querySelector('.profile-avatar__clip') as HTMLElement
    expect(clip.style.width).toBe('40px')
    expect(clip.style.height).toBe('40px')
  })
})

import { createContext, useCallback, useContext, useEffect, useState } from 'react'

export interface ProfileState {
  displayName: string
  avatarDataUrl: string | null
  avatarZoom: number
  avatarOffsetX: number
  avatarOffsetY: number
  lockOnStartup: boolean
  lockOnInactivity: boolean
  lockOnMinimize: boolean
  inactivityTimeoutMinutes: number
  hasPassword: boolean
}

interface ProfileContextValue {
  profile: ProfileState
  refreshProfile: () => Promise<void>
  setDisplayName: (name: string) => Promise<void>
  pickAvatar: () => Promise<void>
  removeAvatar: () => Promise<void>
  setAvatarTransform: (zoom: number, offsetX: number, offsetY: number) => Promise<void>
}

const ProfileContext = createContext<ProfileContextValue | null>(null)

const DEFAULT_PROFILE_STATE: ProfileState = {
  displayName: '',
  avatarDataUrl: null,
  avatarZoom: 1,
  avatarOffsetX: 0,
  avatarOffsetY: 0,
  lockOnStartup: false,
  lockOnInactivity: false,
  lockOnMinimize: false,
  inactivityTimeoutMinutes: 5,
  hasPassword: false
}

export function ProfileProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [profile, setProfile] = useState<ProfileState>(DEFAULT_PROFILE_STATE)

  const refreshProfile = useCallback(async (): Promise<void> => {
    const [data, avatarDataUrl, authState] = await Promise.all([
      window.api.profile.get(),
      window.api.profile.getAvatarDataUrl(),
      window.api.auth.getState()
    ])
    setProfile({
      displayName: data.displayName,
      avatarDataUrl,
      avatarZoom: data.avatarZoom ?? 1,
      avatarOffsetX: data.avatarOffsetX ?? 0,
      avatarOffsetY: data.avatarOffsetY ?? 0,
      lockOnStartup: authState.lockOnStartup,
      lockOnInactivity: authState.lockOnInactivity,
      lockOnMinimize: authState.lockOnMinimize,
      inactivityTimeoutMinutes: authState.inactivityTimeoutMinutes,
      hasPassword: authState.hasPassword
    })
  }, [])

  useEffect(() => {
    void refreshProfile()
  }, [refreshProfile])

  const setDisplayName = useCallback(async (name: string): Promise<void> => {
    await window.api.profile.setName(name)
    setProfile((prev) => ({ ...prev, displayName: name }))
  }, [])

  const pickAvatar = useCallback(async (): Promise<void> => {
    const result = await window.api.profile.pickAvatar()
    if (result.status === 'ok') {
      // Reset transform when a new avatar is chosen
      await window.api.profile.setAvatarTransform(1, 0, 0)
      const url = await window.api.profile.getAvatarDataUrl()
      setProfile((prev) => ({ ...prev, avatarDataUrl: url, avatarZoom: 1, avatarOffsetX: 0, avatarOffsetY: 0 }))
    }
  }, [])

  const removeAvatar = useCallback(async (): Promise<void> => {
    await window.api.profile.removeAvatar()
    setProfile((prev) => ({ ...prev, avatarDataUrl: null, avatarZoom: 1, avatarOffsetX: 0, avatarOffsetY: 0 }))
  }, [])

  const setAvatarTransform = useCallback(async (zoom: number, offsetX: number, offsetY: number): Promise<void> => {
    await window.api.profile.setAvatarTransform(zoom, offsetX, offsetY)
    setProfile((prev) => ({ ...prev, avatarZoom: zoom, avatarOffsetX: offsetX, avatarOffsetY: offsetY }))
  }, [])

  return (
    <ProfileContext.Provider value={{ profile, refreshProfile, setDisplayName, pickAvatar, removeAvatar, setAvatarTransform }}>
      {children}
    </ProfileContext.Provider>
  )
}

export function useProfileContext(): ProfileContextValue {
  const ctx = useContext(ProfileContext)
  if (!ctx) throw new Error('useProfileContext must be used inside ProfileProvider')
  return ctx
}

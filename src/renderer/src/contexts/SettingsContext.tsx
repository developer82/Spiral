import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { AppSettings } from '../pages/Settings/useSettings'
import { resolveNativeThemeSource } from '../themes'
import { trackEvent } from '../analytics/track'

// Settings whose *values* must never be sent to analytics (free-form text,
// secrets, or large/structured values). The setting key itself is still useful
// to know it changed, so we track these without their value.
const ANALYTICS_VALUE_DENYLIST: ReadonlySet<keyof AppSettings> = new Set<keyof AppSettings>([
  'hfToken',
  'glassEffectManualColor',
  'environments',
  'defaultConnectionSort'
])

function trackSettingChange<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void {
  if (ANALYTICS_VALUE_DENYLIST.has(key)) {
    trackEvent('setting_changed', { setting: key })
    return
  }
  // Only forward safe primitive values; skip anything structured.
  if (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
    trackEvent('setting_changed', { setting: key, value })
  } else {
    trackEvent('setting_changed', { setting: key })
  }
}

interface SettingsContextValue {
  settings: AppSettings
  updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void
  resetSettings: () => void
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

function resolveAppliedThemeId(themeId: string): string {
  if (themeId === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return themeId
}

function applyTheme(themeId: string): void {
  const root = document.documentElement
  root.classList.add('theme-transitioning')
  root.setAttribute('data-theme', resolveAppliedThemeId(themeId))
  window.setTimeout(() => root.classList.remove('theme-transitioning'), 350)
}

export function SettingsProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [settings, setSettings] = useState<AppSettings>(() => window.api.settings.initial)

  useEffect(() => {
    if (!settings) return

    applyTheme(settings.theme)

    if (settings.theme !== 'system') return

    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = (): void => applyTheme('system')
    mq.addEventListener('change', handleChange)
    return () => mq.removeEventListener('change', handleChange)
  }, [settings?.theme])

  useEffect(() => {
    document.documentElement.setAttribute(
      'data-animations',
      settings?.enableAnimations === false ? 'off' : 'on'
    )
  }, [settings?.enableAnimations])

  const updateSetting = useCallback(
    <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
      setSettings((prev) => (prev ? { ...prev, [key]: value } : prev))
      window.api.settings.set(key, value)
      trackSettingChange(key, value)
      if (key === 'theme') {
        const themeId = value as string
        const nativeSource: 'dark' | 'light' | 'system' =
          themeId === 'system' ? 'system' : resolveNativeThemeSource(themeId)
        window.api.settings.set('nativeThemeSource', nativeSource)
      }
    },
    []
  )

  const resetSettings = useCallback(() => {
    window.api.settings.reset().then(() => {
      window.api.settings.getAll().then(setSettings)
    })
  }, [])

  return (
    <SettingsContext.Provider value={{ settings, updateSetting, resetSettings }}>
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettingsContext(): SettingsContextValue {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettingsContext must be used inside SettingsProvider')
  return ctx
}

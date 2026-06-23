export interface ThemeDefinition {
  id: string
  labelKey: string
  isDark: boolean
}

export const THEME_REGISTRY: ThemeDefinition[] = [
  { id: 'dark',        labelKey: 'settings.appearance.themes.dark',        isDark: true  },
  { id: 'light',       labelKey: 'settings.appearance.themes.light',       isDark: false },
  { id: 'glass-light', labelKey: 'settings.appearance.themes.glassLight',  isDark: false },
]

export function resolveNativeThemeSource(themeId: string): 'dark' | 'light' {
  const theme = THEME_REGISTRY.find((t) => t.id === themeId)
  return theme?.isDark === false ? 'light' : 'dark'
}

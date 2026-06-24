import { useSettingsContext } from '../../contexts/SettingsContext'

export type ErdBackground = 'none' | 'dots' | 'grid'

export interface EnvironmentDefinition {
  id: string
  name: string
  description: string
  critical: boolean
  color: string
}

export type ConnectionSortField = 'name' | 'createdAt' | 'lastUsedAt' | 'provider' | 'environment' | 'status'
export type SortDirection = 'asc' | 'desc'

export interface ConnectionSortOrder {
  field: ConnectionSortField
  direction: SortDirection
}

export interface AppSettings {
  language: string
  theme: string
  nativeThemeSource: 'dark' | 'light' | 'system'
  showSideNavigationBar: boolean
  syntaxHighlighting: boolean
  showGridLines: boolean
  fontScaling: number
  queryTimeout: number
  showSystemDatabases: boolean
  selectTopRowsCount: number
  defaultErdBackground: ErdBackground
  autoIncludeExecutionPlan: boolean
  autoIncludeClientStatistics: boolean
  customTitlebar: boolean
  enableAnimations: boolean
  uppercaseColumnHeaders: boolean
  showKeyIconsInResults: boolean
  useInteractiveTables: boolean
  environments: EnvironmentDefinition[]
  defaultConnectionSort: ConnectionSortOrder
  askBeforeIncludingSecretsInComparisonExport: boolean
  includeSecretsInComparisonExportByDefault: boolean
  likeConfetti: boolean
  showTipsAndTricks: boolean
  copyJsonFormatted: boolean
  hfToken: string
  showToolbarTextButtons: boolean
  darkTerminals: boolean
  glassEffectHour: number
  glassEffectManualColor: string
  analyticsEnabled: boolean
  mysqlDumpPath: string
  mysqlClientPath: string
  pgDumpPath: string
  pgRestorePath: string
  psqlPath: string
  mongodumpPath: string
  mongorestorePath: string
}

type UseSettingsReturn = {
  settings: AppSettings
  updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void
  resetSettings: () => void
}

export function useSettings(): UseSettingsReturn {
  return useSettingsContext()
}

import { Settings2, Palette, Database, LayoutList, UserRound, Bot } from 'lucide-react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useScreenNav } from '../../components/NavController/NavController'
import GeneralSettings from './GeneralSettings'
import AppearanceSettings from './AppearanceSettings'
import DatabasesConfigSettings from './DatabasesConfigSettings'
import ResultsViewConfigSettings from './ResultsViewConfigSettings'
import UserProfileSettings from './UserProfileSettings'
import AiSettings from './AiSettings'
import './SettingsPage.css'

export type SettingsSectionId = 'general' | 'appearance' | 'databases-config' | 'results-view-config' | 'user-profile' | 'ai'

interface SettingsNavItem {
  id: SettingsSectionId
  icon: React.ElementType
  labelKey: string
}

const APP_SETTINGS_ITEMS: SettingsNavItem[] = [
  { id: 'user-profile', icon: UserRound, labelKey: 'settings.sections.userProfile' },
  { id: 'general', icon: Settings2, labelKey: 'settings.sections.general' },
  { id: 'appearance', icon: Palette, labelKey: 'settings.sections.appearance' }
]

const DEVELOPER_ITEMS: SettingsNavItem[] = [
  { id: 'databases-config', icon: Database, labelKey: 'settings.sections.databasesConfig' },
  { id: 'results-view-config', icon: LayoutList, labelKey: 'settings.sections.resultsViewConfig' },
  { id: 'ai', icon: Bot, labelKey: 'settings.sections.ai' }
]

interface SettingsPageProps {
  section: SettingsSectionId
  onSectionChange: (id: SettingsSectionId) => void
  isActive?: boolean
}

function SettingsPage({ section, onSectionChange, isActive = false }: SettingsPageProps): React.JSX.Element {
  const { t } = useTranslation()
  const screenNavSlot = useScreenNav()

  const displaySection = section

  function renderSettingsNav(): React.JSX.Element {
    return (
      <aside className="settings__sidebar" aria-label={t('settings.navAriaLabel')}>
        <div className="settings__sidebar-inner">
          <div className="settings__nav-group">
            <p className="settings__nav-label">{t('settings.groups.application')}</p>
            <nav>
              {APP_SETTINGS_ITEMS.map(({ id, icon: Icon, labelKey }) => (
                <button
                  key={id}
                  className={`settings__nav-item${displaySection === id ? ' settings__nav-item--active' : ''}`}
                  aria-current={displaySection === id ? 'page' : undefined}
                  onClick={() => onSectionChange(id)}
                >
                  <Icon className="settings__nav-icon" strokeWidth={1.5} />
                  <span>{t(labelKey)}</span>
                </button>
              ))}
            </nav>
          </div>

          <div className="settings__nav-group">
            <p className="settings__nav-label">{t('settings.groups.developer')}</p>
            <nav>
              {DEVELOPER_ITEMS.map(({ id, icon: Icon, labelKey }) => (
                <button
                  key={id}
                  className={`settings__nav-item${displaySection === id ? ' settings__nav-item--active' : ''}`}
                  aria-current={displaySection === id ? 'page' : undefined}
                  onClick={() => onSectionChange(id)}
                >
                  <Icon className="settings__nav-icon" strokeWidth={1.5} />
                  <span>{t(labelKey)}</span>
                </button>
              ))}
            </nav>
          </div>
        </div>
      </aside>
    )
  }

  return (
    <>
      {screenNavSlot
        ? (isActive && createPortal(renderSettingsNav(), screenNavSlot))
        : renderSettingsNav()
      }
      <div className="settings">
        <div className="settings__content">
          {displaySection === 'user-profile' && <UserProfileSettings />}
          {displaySection === 'general' && <GeneralSettings />}
          {displaySection === 'appearance' && <AppearanceSettings />}
          {displaySection === 'databases-config' && <DatabasesConfigSettings />}
          {displaySection === 'results-view-config' && <ResultsViewConfigSettings />}
          {displaySection === 'ai' && <AiSettings />}
        </div>
      </div>
    </>
  )
}

export default SettingsPage

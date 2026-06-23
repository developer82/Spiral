import { useTranslation } from 'react-i18next'
import Toggle from '../../components/Toggle/Toggle'
import { useSettings } from './useSettings'
import Button from '../../components/Button/Button'

function ResultsViewConfigSettings(): React.JSX.Element {
  const { t } = useTranslation()
  const { settings, updateSetting, resetSettings } = useSettings()

  return (
    <div className="settings-page">
      <div className="settings-page__header">
        <div>
          <h1 className="settings-page__title">
            {t('settings.resultsViewConfig.title')}
          </h1>
          <p className="settings-page__subtitle">
            {t('settings.resultsViewConfig.subtitle')}
          </p>
        </div>
        <Button
              variant="ghost"
              size="lg" onClick={resetSettings}>
          {t('settings.resetDefaults')}
        </Button>
      </div>

      <div className="settings-page__section">
        <h2 className="settings-page__section-title">
          {t('settings.resultsViewConfig.columnHeaders')}
        </h2>
        <div className="settings-card-group">
          <div className="settings-card-group__row">
            <div className="settings-card__info">
              <p className="settings-card__title">
                {t('settings.resultsViewConfig.uppercaseColumnHeaders.label')}
              </p>
              <p className="settings-card__desc">
                {t('settings.resultsViewConfig.uppercaseColumnHeaders.desc')}
              </p>
            </div>
            <Toggle
              id="uppercase-column-headers"
              label={t('settings.resultsViewConfig.uppercaseColumnHeaders.label')}
              checked={settings.uppercaseColumnHeaders}
              onChange={(checked) => updateSetting('uppercaseColumnHeaders', checked)}
            />
          </div>
          <div className="settings-card-group__row">
            <div className="settings-card__info">
              <p className="settings-card__title">
                {t('settings.resultsViewConfig.showKeyIconsInResults.label')}
              </p>
              <p className="settings-card__desc">
                {t('settings.resultsViewConfig.showKeyIconsInResults.desc')}
              </p>
            </div>
            <Toggle
              id="show-key-icons-in-results"
              label={t('settings.resultsViewConfig.showKeyIconsInResults.label')}
              checked={settings.showKeyIconsInResults}
              onChange={(checked) => updateSetting('showKeyIconsInResults', checked)}
            />
          </div>
        </div>
      </div>

      <div className="settings-page__section">
        <h2 className="settings-page__section-title">
          {t('settings.resultsViewConfig.tableOptions')}
        </h2>
        <div className="settings-card-group">
          <div className="settings-card-group__row">
            <div className="settings-card__info">
              <p className="settings-card__title">
                {t('settings.resultsViewConfig.useInteractiveTables.label')}
              </p>
              <p className="settings-card__desc">
                {t('settings.resultsViewConfig.useInteractiveTables.desc')}
              </p>
            </div>
            <Toggle
              id="use-interactive-tables"
              label={t('settings.resultsViewConfig.useInteractiveTables.label')}
              checked={settings.useInteractiveTables}
              onChange={(checked) => updateSetting('useInteractiveTables', checked)}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

export default ResultsViewConfigSettings

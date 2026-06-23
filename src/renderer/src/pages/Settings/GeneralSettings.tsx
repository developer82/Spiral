import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import i18n from '../../i18n'
import { dispatchConnectionsUpdated } from '../../events/connectionEvents'
import ManageEnvironmentsDialog from './ManageEnvironmentsDialog'
import ConfirmDialog from '../../components/ConfirmDialog/ConfirmDialog'
import ReleaseNotesDialog from '../../components/ReleaseNotesDialog/ReleaseNotesDialog'
import Toggle from '../../components/Toggle/Toggle'
import { useSettings } from './useSettings'
import { useConfettiContext } from '../../contexts/ConfettiContext'
import { useUpdateContext } from '../../contexts/UpdateContext'
import { useTipsContext } from '../../contexts/TipsContext'
import type { ConnectionSortField, SortDirection, ConnectionSortOrder } from './useSettings'
import Button from '../../components/Button/Button'
import { SelectField } from '../../components/Field'

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'he', label: 'עברית' }
]

const SORT_FIELDS: Array<{ value: ConnectionSortField; labelKey: string }> = [
  { value: 'name', labelKey: 'settings.general.defaultConnectionSort.fields.name' },
  { value: 'createdAt', labelKey: 'settings.general.defaultConnectionSort.fields.createdAt' },
  { value: 'lastUsedAt', labelKey: 'settings.general.defaultConnectionSort.fields.lastUsedAt' },
  { value: 'provider', labelKey: 'settings.general.defaultConnectionSort.fields.provider' },
  { value: 'environment', labelKey: 'settings.general.defaultConnectionSort.fields.environment' }
]

const SORT_DIRECTIONS: Array<{ value: SortDirection; labelKey: string }> = [
  { value: 'asc', labelKey: 'settings.general.defaultConnectionSort.directions.asc' },
  { value: 'desc', labelKey: 'settings.general.defaultConnectionSort.directions.desc' }
]

const DEFAULT_CONNECTION_SORT: ConnectionSortOrder = { field: 'name', direction: 'asc' }

function GeneralSettings(): React.JSX.Element {
  const { t } = useTranslation()
  const { settings, updateSetting, resetSettings } = useSettings()
  const { triggerConfetti } = useConfettiContext()
  const { status, currentVersion, checkForUpdates } = useUpdateContext()
  const { previewTip } = useTipsContext()
  const [showReleaseNotes, setShowReleaseNotes] = useState(false)
  const [isManageEnvironmentsOpen, setIsManageEnvironmentsOpen] = useState(false)
  const [pendingConfirm, setPendingConfirm] = useState<{
    title: string
    message: string
    resolve: (confirmed: boolean) => void
  } | null>(null)

  function requestConfirm(title: string, message: string): Promise<boolean> {
    return new Promise((resolve) => setPendingConfirm({ title, message, resolve }))
  }

  useEffect(() => {
    if (settings && settings.language !== i18n.language) {
      i18n.changeLanguage(settings.language)
    }
  }, [settings?.language])

  function handleLanguageChange(lang: string): void {
    i18n.changeLanguage(lang)
    updateSetting('language', lang)
  }

  function handleReset(): void {
    resetSettings()
    i18n.changeLanguage('en')
  }

  function handleSortFieldChange(value: string): void {
    const field = value as ConnectionSortField
    const current = settings.defaultConnectionSort ?? DEFAULT_CONNECTION_SORT
    updateSetting('defaultConnectionSort', { ...current, field })
  }

  function handleSortDirectionChange(value: string): void {
    const direction = value as SortDirection
    const current = settings.defaultConnectionSort ?? DEFAULT_CONNECTION_SORT
    updateSetting('defaultConnectionSort', { ...current, direction })
  }

  function handleLikeConfettiChange(value: boolean): void {
    updateSetting('likeConfetti', value)
    if (value) triggerConfetti()
  }

  function handleSaveEnvironment(nextEnvironment: (typeof settings.environments)[number]): void {
    const exists = settings.environments.some((environment) => environment.id === nextEnvironment.id)

    updateSetting(
      'environments',
      exists
        ? settings.environments.map((environment) =>
            environment.id === nextEnvironment.id ? nextEnvironment : environment
          )
        : [...settings.environments, nextEnvironment]
    )
  }

  async function handleDeleteEnvironment(environmentId: string): Promise<boolean> {
    const target = settings.environments.find((environment) => environment.id === environmentId)
    if (!target) return false

    const connections = await window.api.connections.getAll()
    const affectedConnections = connections.filter((connection) => connection.environmentId === environmentId)

    if (affectedConnections.length > 0) {
      const confirmed = await requestConfirm(
        t('settings.general.environments.deleteInUse.title'),
        t('settings.general.environments.deleteInUse.message', {
          count: affectedConnections.length,
          name: target.name
        })
      )

      if (!confirmed) return false

      await Promise.all(
        affectedConnections.map((connection) =>
          window.api.connections.update({ ...connection, environmentId: undefined })
        )
      )
      dispatchConnectionsUpdated()
    }

    updateSetting(
      'environments',
      settings.environments.filter((environment) => environment.id !== environmentId)
    )
    return true
  }

  return (
    <>
      <div className="settings-page">
        <div className="settings-page__header">
          <div>
            <h1 className="settings-page__title">{t('settings.general.title')}</h1>
            <p className="settings-page__subtitle">{t('settings.general.subtitle')}</p>
          </div>
          <Button
              variant="ghost"
              size="lg" onClick={handleReset}>
            {t('settings.resetDefaults')}
          </Button>
        </div>

        <div className="settings-card-group">
          <div className="settings-card-group__row">
            <div className="settings-card__info">
              <p className="settings-card__title">{t('settings.general.language.label')}</p>
              <p className="settings-card__desc">{t('settings.general.language.desc')}</p>
            </div>
            <SelectField
              className="settings-field-select"
              value={settings.language}
              onChange={handleLanguageChange}
              ariaLabel={t('settings.general.language.label')}
              options={LANGUAGES.map(({ code, label }) => ({ value: code, label }))}
            />
          </div>

          <div className="settings-card-group__row">
            <div className="settings-card__info">
              <p className="settings-card__title">{t('settings.general.environments.label')}</p>
              <p className="settings-card__desc">{t('settings.general.environments.desc')}</p>
            </div>
            <div className="settings-card__actions">
              <span className="settings-card__meta">
                {t('settings.general.environments.count', { count: settings.environments.length })}
              </span>
              <Button
              variant="primary"
              size="sm"
                onClick={() => setIsManageEnvironmentsOpen(true)}
              >
                {t('settings.general.environments.manage')}
              </Button>
            </div>
          </div>

          <div className="settings-card-group__row">
            <div className="settings-card__info">
              <p className="settings-card__title">{t('settings.general.defaultConnectionSort.label')}</p>
              <p className="settings-card__desc">{t('settings.general.defaultConnectionSort.desc')}</p>
            </div>
            <div className="settings-card__actions">
              <SelectField
                className="settings-field-select"
                value={(settings.defaultConnectionSort ?? DEFAULT_CONNECTION_SORT).field}
                onChange={handleSortFieldChange}
                ariaLabel={t('settings.general.defaultConnectionSort.label')}
                options={SORT_FIELDS.map(({ value, labelKey }) => ({ value, label: t(labelKey) }))}
              />
              <SelectField
                className="settings-field-select"
                value={(settings.defaultConnectionSort ?? DEFAULT_CONNECTION_SORT).direction}
                onChange={handleSortDirectionChange}
                ariaLabel={t('settings.general.defaultConnectionSort.label')}
                options={SORT_DIRECTIONS.map(({ value, labelKey }) => ({ value, label: t(labelKey) }))}
              />
            </div>
          </div>

          <div className="settings-card-group__row">
            <div className="settings-card__info">
              <p className="settings-card__title">{t('settings.general.likeConfetti.label')}</p>
              <p className="settings-card__desc">{t('settings.general.likeConfetti.desc')}</p>
            </div>
            <Toggle
              id="likeConfetti"
              label={t('settings.general.likeConfetti.label')}
              checked={settings.likeConfetti ?? false}
              onChange={handleLikeConfettiChange}
            />
          </div>

          <div className="settings-card-group__row">
            <div className="settings-card__info">
              <p className="settings-card__title">{t('settings.general.tipsAndTricks.label')}</p>
              <p className="settings-card__desc">{t('settings.general.tipsAndTricks.desc')}</p>
            </div>
            <div className="settings-card__actions">
              <Button
              variant="primary"
              size="sm"
                onClick={previewTip}
              >
                {t('settings.general.tipsAndTricks.preview')}
              </Button>
              <Toggle
                id="showTipsAndTricks"
                label={t('settings.general.tipsAndTricks.label')}
                checked={settings.showTipsAndTricks ?? true}
                onChange={(v) => updateSetting('showTipsAndTricks', v)}
              />
            </div>
          </div>
        </div>

        <div className="settings-card settings-spacer">
          <div className="settings-card__info">
            <p className="settings-card__title">
              {t('settings.general.appUpdate.label')}
              <span style={{ fontWeight: 400, opacity: 0.65, marginLeft: '0.5rem' }}>v{currentVersion}</span>
            </p>
            <p className="settings-card__desc">{t('settings.general.appUpdate.desc')}</p>
          </div>
          <div className="settings-card__actions">
            <Button
              variant="primary"
              size="sm"
              analyticsId="check_for_updates"
              disabled={status === 'checking'}
              onClick={checkForUpdates}
            >
              {status === 'checking'
                ? t('settings.general.appUpdate.checking')
                : t('settings.general.appUpdate.checkButton')}
            </Button>
            <Button
              variant="ghost"
              size="lg"
              onClick={() => setShowReleaseNotes(true)}
            >
              {t('settings.general.appUpdate.releaseNotesButton')}
            </Button>
          </div>
        </div>

        <div className="settings-card settings-spacer">
          <div className="settings-card__info">
            <p className="settings-card__title">{t('settings.general.analytics.label')}</p>
            <p className="settings-card__desc">{t('settings.general.analytics.desc')}</p>
          </div>
          <div className="settings-card__actions">
            <Toggle
              id="analyticsEnabled"
              label={t('settings.general.analytics.toggleLabel')}
              checked={settings.analyticsEnabled ?? true}
              onChange={(v) => updateSetting('analyticsEnabled', v)}
            />
          </div>
        </div>
      </div>

      {isManageEnvironmentsOpen && (
        <ManageEnvironmentsDialog
          environments={settings.environments}
          onClose={() => setIsManageEnvironmentsOpen(false)}
          onSaveEnvironment={handleSaveEnvironment}
          onDeleteEnvironment={(environment) => handleDeleteEnvironment(environment.id)}
        />
      )}

      {pendingConfirm && (
        <ConfirmDialog
          title={pendingConfirm.title}
          message={pendingConfirm.message}
          icon={<Trash2 size={16} />}
          iconColor="#ff6464"
          variant="danger"
          confirmLabel={t('confirmDialog.delete')}
          onConfirm={() => {
            pendingConfirm.resolve(true)
            setPendingConfirm(null)
          }}
          onClose={() => {
            pendingConfirm.resolve(false)
            setPendingConfirm(null)
          }}
        />
      )}

      {showReleaseNotes && (
        <ReleaseNotesDialog onClose={() => setShowReleaseNotes(false)} />
      )}
    </>
  )
}

export default GeneralSettings

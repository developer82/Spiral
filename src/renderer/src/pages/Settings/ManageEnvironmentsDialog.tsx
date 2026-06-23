import { useEffect, useMemo, useState } from 'react'
import { PencilLine, Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import BaseDialog from '../../components/BaseDialog/BaseDialog'
import type { EnvironmentDefinition } from './useSettings'
import Button from '../../components/Button/Button'

interface ManageEnvironmentsDialogProps {
  environments: EnvironmentDefinition[]
  onClose: () => void
  onSaveEnvironment: (environment: EnvironmentDefinition) => void
  onDeleteEnvironment: (environment: EnvironmentDefinition) => Promise<boolean>
}

function createDraftEnvironment(): EnvironmentDefinition {
  return {
    id:
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `environment-${Date.now()}`,
    name: '',
    description: '',
    critical: false,
    color: '#6b7280'
  }
}

export default function ManageEnvironmentsDialog({
  environments,
  onClose,
  onSaveEnvironment,
  onDeleteEnvironment
}: ManageEnvironmentsDialogProps): React.JSX.Element {
  const { t } = useTranslation()
  const [selectedId, setSelectedId] = useState<string | null>(environments[0]?.id ?? null)
  const [draft, setDraft] = useState<EnvironmentDefinition>(() => environments[0] ?? createDraftEnvironment())
  const [validationError, setValidationError] = useState<string | null>(null)

  const selectedEnvironment = useMemo(
    () => environments.find((environment) => environment.id === draft.id) ?? null,
    [draft.id, environments]
  )

  useEffect(() => {
    if (selectedId === null) return

    const current = environments.find((environment) => environment.id === selectedId)
    if (current) {
      setDraft(current)
      return
    }

    if (environments.length > 0) {
      setSelectedId(environments[0].id)
      setDraft(environments[0])
      return
    }

    setSelectedId(null)
    setDraft(createDraftEnvironment())
  }, [environments, selectedId])

  function startAddEnvironment(): void {
    setSelectedId(null)
    setDraft(createDraftEnvironment())
    setValidationError(null)
  }

  function handleSelectEnvironment(environment: EnvironmentDefinition): void {
    setSelectedId(environment.id)
    setDraft(environment)
    setValidationError(null)
  }

  function handleFieldChange<K extends keyof EnvironmentDefinition>(
    key: K,
    value: EnvironmentDefinition[K]
  ): void {
    setDraft((prev) => ({ ...prev, [key]: value }))
    if (validationError) {
      setValidationError(null)
    }
  }

  function handleSave(): void {
    const trimmedName = draft.name.trim()
    const trimmedDescription = draft.description.trim()

    if (!trimmedName) {
      setValidationError(t('settings.general.environments.validation.nameRequired'))
      return
    }

    const duplicateName = environments.some(
      (environment) =>
        environment.id !== draft.id &&
        environment.name.trim().toLocaleLowerCase() === trimmedName.toLocaleLowerCase()
    )

    if (duplicateName) {
      setValidationError(t('settings.general.environments.validation.nameUnique'))
      return
    }

    const nextEnvironment: EnvironmentDefinition = {
      ...draft,
      name: trimmedName,
      description: trimmedDescription
    }

    onSaveEnvironment(nextEnvironment)
    setSelectedId(nextEnvironment.id)
    setDraft(nextEnvironment)
    setValidationError(null)
  }

  async function handleDelete(): Promise<void> {
    if (!selectedEnvironment) return

    const deleted = await onDeleteEnvironment(selectedEnvironment)
    if (!deleted) return

    setValidationError(null)
  }

  return (
    <BaseDialog
      analyticsId="manage_environments"
      title={t('settings.general.environments.dialogTitle')}
      onClose={onClose}
      maxWidth="70rem"
      maxHeight="min(48rem, calc(100vh - 3.3rem))"
      zIndex={40}
      footerSpaceBetween
      footer={
        <>
          <Button
              variant="ghost"
              size="lg" onClick={onClose}>
            {t('settings.general.environments.actions.close')}
          </Button>
          <div className="dialog__footer-right">
            {selectedEnvironment && (
              <Button
              variant="danger"
              size="lg"
                onClick={() => { void handleDelete() }}
              >
                {t('settings.general.environments.actions.delete')}
              </Button>
            )}
            <Button
              variant="primary"
              size="lg" onClick={handleSave}>
              {selectedEnvironment
                ? t('settings.general.environments.actions.update')
                : t('settings.general.environments.actions.create')}
            </Button>
          </div>
        </>
      }
    >
        <div className="settings-environments-dialog__body">
          <div className="settings-environments-dialog__table-panel">
            <div className="settings-environments-dialog__table-header">
              <div>
                <p className="settings-environments-dialog__section-title">
                  {t('settings.general.environments.tableTitle')}
                </p>
                <p className="settings-environments-dialog__section-subtitle">
                  {t('settings.general.environments.tableSubtitle')}
                </p>
              </div>
              <Button
              variant="primary"
              size="lg"
              className="settings-environments-dialog__add-btn"
                onClick={startAddEnvironment}
              >
                <Plus size={14} />
                {t('settings.general.environments.actions.add')}
              </Button>
            </div>

            <div className="settings-environments-dialog__table-wrap">
              <table className="settings-environments-dialog__table">
                <thead>
                  <tr>
                    <th>{t('settings.general.environments.columns.color')}</th>
                    <th>{t('settings.general.environments.columns.name')}</th>
                    <th>{t('settings.general.environments.columns.description')}</th>
                    <th>{t('settings.general.environments.columns.critical')}</th>
                    <th>{t('settings.general.environments.columns.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {environments.map((environment) => {
                    const isActive = environment.id === selectedId

                    return (
                      <tr
                        key={environment.id}
                        className={isActive ? 'settings-environments-dialog__row settings-environments-dialog__row--active' : 'settings-environments-dialog__row'}
                        onClick={() => handleSelectEnvironment(environment)}
                      >
                        <td>
                          <svg
                            className="settings-environments-dialog__color-dot"
                            viewBox="0 0 12 12"
                            aria-hidden="true"
                          >
                            <circle cx="6" cy="6" r="5" fill={environment.color} />
                          </svg>
                        </td>
                        <td>{environment.name}</td>
                        <td>{environment.description || t('settings.general.environments.emptyDescription')}</td>
                        <td>
                          {environment.critical
                            ? t('settings.general.environments.values.critical')
                            : t('settings.general.environments.values.standard')}
                        </td>
                        <td>
                          <div className="settings-environments-dialog__row-actions">
                            <button
                              type="button"
                              className="settings-environments-dialog__icon-btn"
                              aria-label={t('settings.general.environments.actions.edit')}
                              onClick={(event) => {
                                event.stopPropagation()
                                handleSelectEnvironment(environment)
                              }}
                            >
                              <PencilLine size={14} />
                            </button>
                            <button
                              type="button"
                              className="settings-environments-dialog__icon-btn settings-environments-dialog__icon-btn--danger"
                              aria-label={t('settings.general.environments.actions.delete')}
                              onClick={(event) => {
                                event.stopPropagation()
                                handleSelectEnvironment(environment)
                                void onDeleteEnvironment(environment)
                              }}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="settings-environments-dialog__editor-panel">
            <div>
              <p className="settings-environments-dialog__section-title">
                {selectedEnvironment
                  ? t('settings.general.environments.editor.editTitle')
                  : t('settings.general.environments.editor.addTitle')}
              </p>
              <p className="settings-environments-dialog__section-subtitle">
                {t('settings.general.environments.editor.subtitle')}
              </p>
            </div>

            <div className="settings-environments-dialog__form">
              <label className="settings-environments-dialog__field">
                <span className="settings-environments-dialog__label">
                  {t('settings.general.environments.fields.name')}
                </span>
                <input
                  className="settings-environments-dialog__text-input"
                  type="text"
                  value={draft.name}
                  onChange={(event) => handleFieldChange('name', event.target.value)}
                  placeholder={t('settings.general.environments.fields.namePlaceholder')}
                />
              </label>

              <label className="settings-environments-dialog__field">
                <span className="settings-environments-dialog__label">
                  {t('settings.general.environments.fields.description')}
                </span>
                <textarea
                  className="settings-environments-dialog__textarea"
                  value={draft.description}
                  onChange={(event) => handleFieldChange('description', event.target.value)}
                  placeholder={t('settings.general.environments.fields.descriptionPlaceholder')}
                  rows={4}
                />
              </label>

              <label className="settings-environments-dialog__checkbox-row">
                <input
                  type="checkbox"
                  checked={draft.critical}
                  onChange={(event) => handleFieldChange('critical', event.target.checked)}
                />
                <span>
                  <span className="settings-environments-dialog__label">
                    {t('settings.general.environments.fields.critical')}
                  </span>
                  <span className="settings-environments-dialog__hint">
                    {t('settings.general.environments.fields.criticalHint')}
                  </span>
                </span>
              </label>

              <label className="settings-environments-dialog__field settings-environments-dialog__field--color">
                <span className="settings-environments-dialog__label">
                  {t('settings.general.environments.fields.color')}
                </span>
                <div className="settings-environments-dialog__color-picker-row">
                  <input
                    type="color"
                    value={draft.color}
                    onChange={(event) => handleFieldChange('color', event.target.value)}
                    aria-label={t('settings.general.environments.fields.color')}
                    className="settings-environments-dialog__color-input"
                  />
                  <span className="settings-environments-dialog__color-value">{draft.color}</span>
                </div>
              </label>

              {validationError && (
                <p className="settings-environments-dialog__error">{validationError}</p>
              )}
            </div>
          </div>
        </div>
    </BaseDialog>
  )
}
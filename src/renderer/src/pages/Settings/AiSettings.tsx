import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AiDownloadProgress, AiModelListItem } from '../../../../shared/ai.types'
import { useSettings } from './useSettings'
import './AiSettings.css'
import Button from '../../components/Button/Button'

function formatBytes(bytes: number): string {
  if (bytes < 1e9) return `${(bytes / 1e6).toFixed(0)} MB`
  return `${(bytes / 1e9).toFixed(1)} GB`
}

function AiSettings(): React.JSX.Element {
  const { t } = useTranslation()
  const { settings, updateSetting } = useSettings()
  const [models, setModels] = useState<AiModelListItem[]>([])
  const [downloadingModels, setDownloadingModels] = useState<Set<string>>(new Set())
  const [downloadProgress, setDownloadProgress] = useState<Record<string, AiDownloadProgress>>({})
  const [downloadErrors, setDownloadErrors] = useState<Record<string, string>>({})
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null)

  const loadModels = useCallback(async () => {
    const list = (await window.api.ai.listModels()) as AiModelListItem[]
    setModels(list)
  }, [])

  useEffect(() => {
    void loadModels()
  }, [loadModels])

  useEffect(() => {
    const unsub = window.api.ai.onDownloadProgress((data) => {
      const progress = data as AiDownloadProgress
      setDownloadProgress((prev) => ({ ...prev, [progress.modelId]: progress }))
    })
    return unsub
  }, [])

  const handleDownload = useCallback(
    async (modelId: string) => {
      setDownloadingModels((prev) => new Set([...prev, modelId]))
      setDownloadErrors((prev) => {
        const next = { ...prev }
        delete next[modelId]
        return next
      })

      const result = (await window.api.ai.downloadModel(modelId)) as {
        status: string
        message?: string
      }

      setDownloadingModels((prev) => {
        const next = new Set(prev)
        next.delete(modelId)
        return next
      })
      setDownloadProgress((prev) => {
        const next = { ...prev }
        delete next[modelId]
        return next
      })

      if (result.status === 'error') {
        setDownloadErrors((prev) => ({
          ...prev,
          [modelId]: result.message ?? 'Download failed'
        }))
      }

      await loadModels()
    },
    [loadModels]
  )

  const handleCancelDownload = useCallback((modelId: string) => {
    void window.api.ai.cancelDownload(modelId)
  }, [])

  const handleDeleteConfirm = useCallback(
    async (modelId: string) => {
      await window.api.ai.deleteModel(modelId)
      setConfirmingDelete(null)
      await loadModels()
    },
    [loadModels]
  )

  return (
    <div className="settings-page">
      <div className="settings-page__header">
        <div>
          <h1 className="settings-page__title">{t('settings.ai.title')}</h1>
          <p className="settings-page__subtitle">{t('settings.ai.subtitle')}</p>
        </div>
      </div>

      <div className="settings-page__section">
        <h2 className="settings-page__section-title">{t('settings.ai.hfToken.sectionTitle')}</h2>
        <div className="settings-card-group">
          <div className="settings-card-group__row">
            <div className="settings-card__info">
              <p className="settings-card__title">{t('settings.ai.hfToken.label')}</p>
              <p className="settings-card__desc">{t('settings.ai.hfToken.desc')}</p>
            </div>
            <input
              type="password"
              className="settings-input settings-input--wide"
              value={settings.hfToken ?? ''}
              placeholder={t('settings.ai.hfToken.placeholder')}
              onChange={(e) => updateSetting('hfToken', e.target.value)}
              aria-label={t('settings.ai.hfToken.label')}
            />
          </div>
        </div>
      </div>

      <div className="settings-page__section">
        <h2 className="settings-page__section-title">{t('settings.ai.models.title')}</h2>
        <div className="settings-card-group">
          {models.map((model) => {
            const isDownloading = downloadingModels.has(model.modelId)
            const progress = downloadProgress[model.modelId]
            const error = downloadErrors[model.modelId]
            const isConfirmingDelete = confirmingDelete === model.modelId

            if (isDownloading) {
              return (
                <div
                  key={model.modelId}
                  className="settings-card-group__row ai-settings__model-row--downloading"
                >
                  <div className="ai-settings__model-download">
                    <div className="ai-settings__model-download-header">
                      <span className="settings-card__title">{model.displayName}</span>
                      <span className="settings-card__desc">{t('settings.ai.models.downloading')}</span>
                    </div>
                    <div className="ai-settings__progress-bar-track">
                      <div
                        className="ai-settings__progress-bar-fill"
                        style={{ width: progress ? `${progress.percent}%` : '0%' }}
                      />
                    </div>
                    {progress ? (
                      <p className="ai-settings__progress-text">
                        {formatBytes(progress.downloaded)} / {formatBytes(progress.total)} &mdash;{' '}
                        {progress.percent}%
                      </p>
                    ) : (
                      <p className="ai-settings__progress-text">
                        {t('settings.ai.models.startingDownload')}
                      </p>
                    )}
                    <Button
              variant="secondary"
              size="sm"
                      onClick={() => handleCancelDownload(model.modelId)}
                    >
                      {t('settings.ai.models.cancel')}
                    </Button>
                  </div>
                </div>
              )
            }

            return (
              <div key={model.modelId} className="settings-card-group__row">
                <div className="settings-card__info">
                  <p className="settings-card__title">{model.displayName}</p>
                  <p className="settings-card__desc">{model.description}</p>
                  {error && (
                    <p className="ai-settings__error">
                      {error}
                      {error.includes('401') && (
                        <span> {t('settings.ai.models.authHint')}</span>
                      )}
                    </p>
                  )}
                </div>
                <div className="settings-card__actions">
                  {model.status === 'ready' ? (
                    <>
                      {model.sizeOnDisk !== undefined && (
                        <span className="settings-card__meta">
                          {t('settings.ai.models.sizeOnDisk', {
                            size: formatBytes(model.sizeOnDisk)
                          })}
                        </span>
                      )}
                      {isConfirmingDelete ? (
                        <>
                          <Button
              variant="danger"
              size="sm"
                            onClick={() => void handleDeleteConfirm(model.modelId)}
                          >
                            {t('settings.ai.models.confirmDelete')}
                          </Button>
                          <Button
              variant="ghost"
              size="sm"
                            onClick={() => setConfirmingDelete(null)}
                          >
                            {t('settings.ai.models.cancelDelete')}
                          </Button>
                        </>
                      ) : (
                        <Button
              variant="danger"
              size="sm"
                          onClick={() => setConfirmingDelete(model.modelId)}
                        >
                          {t('settings.ai.models.delete')}
                        </Button>
                      )}
                    </>
                  ) : (
                    <>
                      <span className="settings-card__meta">
                        {t('settings.ai.models.notDownloaded')}
                      </span>
                      <Button
              variant="primary"
              size="sm"
                        onClick={() => void handleDownload(model.modelId)}
                      >
                        {t('settings.ai.models.download')}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default AiSettings

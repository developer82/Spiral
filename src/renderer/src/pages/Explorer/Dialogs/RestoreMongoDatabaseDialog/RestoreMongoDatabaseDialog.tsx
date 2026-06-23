import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Upload, FolderOpen, Check } from 'lucide-react'
import BaseDialog from '../../../../components/BaseDialog/BaseDialog'
import ErrorBox from '../../../../components/ErrorBox/ErrorBox'
import Button from '../../../../components/Button/Button'
import Toggle from '../../../../components/Toggle/Toggle'
import { useSettings } from '../../../Settings/useSettings'
import type { MongoRestoreOptions } from '../../../../../../preload/index.d'
import './RestoreMongoDatabaseDialog.css'

interface RestoreMongoDatabaseDialogProps {
  connectionId: string
  databaseName: string
  onClose: () => void
}

function RestoreMongoDatabaseDialog({
  connectionId,
  databaseName,
  onClose
}: RestoreMongoDatabaseDialogProps): React.JSX.Element {
  const { t } = useTranslation()
  const { settings } = useSettings()

  const [filePath, setFilePath] = useState('')
  const [targetDb, setTargetDb] = useState(databaseName)
  const [drop, setDrop] = useState(false)
  const [stopOnError, setStopOnError] = useState(true)

  const [validationError, setValidationError] = useState<string | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  function buildOptions(): MongoRestoreOptions {
    return {
      filePath,
      sourceDatabaseName: databaseName,
      targetDatabaseName: targetDb.trim(),
      drop,
      stopOnError,
      mongorestorePath: settings.mongorestorePath || undefined
    }
  }

  async function handleChooseFile(): Promise<void> {
    const result = await window.api.database.mongoPickRestoreFile()
    if (result.status === 'ok') {
      setFilePath(result.filePath)
      if (validationError) setValidationError(null)
    }
  }

  async function handleSubmit(): Promise<void> {
    setValidationError(null)
    setServerError(null)
    setSuccessMessage(null)
    if (!filePath) {
      setValidationError(t('explorer.mongoRestore.validation.fileRequired'))
      return
    }
    if (!targetDb.trim()) {
      setValidationError(t('explorer.mongoRestore.validation.targetRequired'))
      return
    }
    setIsSubmitting(true)
    try {
      const result = await window.api.database.mongoExecuteRestore(connectionId, buildOptions())
      if (result.status === 'error') {
        setServerError(result.message)
        return
      }
      setSuccessMessage(
        t('explorer.mongoRestore.success', {
          seconds: (result.durationMs / 1000).toFixed(1),
          engine: result.engine === 'mongodump' ? 'mongorestore' : 'JSON',
          count: result.collectionsRestored ?? 0
        })
      )
    } catch (err) {
      setServerError(err instanceof Error ? err.message : t('explorer.mongoRestore.unknownError'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <BaseDialog
      title={t('explorer.mongoRestore.dialogTitle')}
      icon={<Upload size={16} />}
      onClose={onClose}
      closeDisabled={isSubmitting}
      maxWidth="34rem"
      width="34rem"
      analyticsId="mongo_restore_database"
      footer={
        <div className="mongors__footer">
          <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
            {t('explorer.mongoRestore.cancel')}
          </Button>
          <Button variant="primary" onClick={() => void handleSubmit()} disabled={isSubmitting}>
            {isSubmitting
              ? t('explorer.mongoRestore.restoring')
              : t('explorer.mongoRestore.restore')}
          </Button>
        </div>
      }
    >
      <div className="mongors__body dialog__scroll-area">
        {/* ─── Source ─────────────────────────────────────────────── */}
        <section className="mongors__section">
          <h3 className="mongors__section-title">{t('explorer.mongoRestore.source')}</h3>
          <div className="mongors__file-row">
            <span
              className={`mongors__file-path ${filePath ? '' : 'mongors__file-path--empty'}`}
              title={filePath}
            >
              {filePath || t('explorer.mongoRestore.noFile')}
            </span>
            <Button variant="secondary" size="sm" onClick={() => void handleChooseFile()}>
              <FolderOpen size={14} /> {t('explorer.mongoRestore.chooseFile')}
            </Button>
          </div>
        </section>

        {/* ─── Target ─────────────────────────────────────────────── */}
        <section className="mongors__section">
          <h3 className="mongors__section-title">{t('explorer.mongoRestore.target')}</h3>
          <div className="mongors__field">
            <label className="mongors__field-label" htmlFor="mongors-target">
              {t('explorer.mongoRestore.targetDatabase')}
            </label>
            <input
              id="mongors-target"
              className="mongors__input"
              type="text"
              value={targetDb}
              onChange={(e) => setTargetDb(e.target.value)}
            />
          </div>
          <div className="mongors__toggle-row">
            <span>{t('explorer.mongoRestore.drop')}</span>
            <Toggle
              id="mongors-drop"
              label={t('explorer.mongoRestore.drop')}
              checked={drop}
              onChange={setDrop}
            />
          </div>
          <div className="mongors__toggle-row">
            <span>{t('explorer.mongoRestore.stopOnError')}</span>
            <Toggle
              id="mongors-stop"
              label={t('explorer.mongoRestore.stopOnError')}
              checked={stopOnError}
              onChange={setStopOnError}
            />
          </div>
        </section>

        {validationError && <span className="mongors__error">{validationError}</span>}
        {serverError && <ErrorBox error={serverError} />}
        {successMessage && (
          <div className="mongors__success">
            <Check size={15} /> {successMessage}
          </div>
        )}
      </div>
    </BaseDialog>
  )
}

export default RestoreMongoDatabaseDialog

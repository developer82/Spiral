import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Upload, FolderOpen, Check } from 'lucide-react'
import BaseDialog from '../../../../components/BaseDialog/BaseDialog'
import ErrorBox from '../../../../components/ErrorBox/ErrorBox'
import Button from '../../../../components/Button/Button'
import Toggle from '../../../../components/Toggle/Toggle'
import { useSettings } from '../../../Settings/useSettings'
import type { MySqlRestoreOptions } from '../../../../../../preload/index.d'
import './RestoreMySqlDatabaseDialog.css'

interface RestoreMySqlDatabaseDialogProps {
  connectionId: string
  databaseName: string
  onClose: () => void
}

function RestoreMySqlDatabaseDialog({
  connectionId,
  databaseName,
  onClose
}: RestoreMySqlDatabaseDialogProps): React.JSX.Element {
  const { t } = useTranslation()
  const { settings } = useSettings()

  const [filePath, setFilePath] = useState('')
  const [targetDb, setTargetDb] = useState(databaseName)
  const [createIfNotExists, setCreateIfNotExists] = useState(false)
  const [stopOnError, setStopOnError] = useState(true)

  const [validationError, setValidationError] = useState<string | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  function buildOptions(): MySqlRestoreOptions {
    return {
      filePath,
      targetDatabaseName: targetDb.trim(),
      createDatabaseIfNotExists: createIfNotExists,
      stopOnError,
      mysqlClientPath: settings.mysqlClientPath || undefined
    }
  }

  async function handleChooseFile(): Promise<void> {
    const result = await window.api.database.mysqlPickRestoreFile()
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
      setValidationError(t('explorer.mysqlRestore.validation.fileRequired'))
      return
    }
    if (!targetDb.trim()) {
      setValidationError(t('explorer.mysqlRestore.validation.targetRequired'))
      return
    }
    setIsSubmitting(true)
    try {
      const result = await window.api.database.mysqlExecuteRestore(connectionId, buildOptions())
      if (result.status === 'error') {
        setServerError(result.message)
        return
      }
      setSuccessMessage(
        t('explorer.mysqlRestore.success', {
          seconds: (result.durationMs / 1000).toFixed(1),
          engine: result.engine === 'mysqldump' ? 'mysql' : 'JS',
          count: result.statementsRun ?? 0
        })
      )
    } catch (err) {
      setServerError(err instanceof Error ? err.message : t('explorer.mysqlRestore.unknownError'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <BaseDialog
      title={t('explorer.mysqlRestore.dialogTitle')}
      icon={<Upload size={16} />}
      onClose={onClose}
      closeDisabled={isSubmitting}
      maxWidth="34rem"
      width="34rem"
      analyticsId="mysql_restore_database"
      footer={
        <div className="mysqlrs__footer">
          <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
            {t('explorer.mysqlRestore.cancel')}
          </Button>
          <Button variant="primary" onClick={() => void handleSubmit()} disabled={isSubmitting}>
            {isSubmitting
              ? t('explorer.mysqlRestore.restoring')
              : t('explorer.mysqlRestore.restore')}
          </Button>
        </div>
      }
    >
      <div className="mysqlrs__body dialog__scroll-area">
        {/* ─── Source ─────────────────────────────────────────────── */}
        <section className="mysqlrs__section">
          <h3 className="mysqlrs__section-title">{t('explorer.mysqlRestore.source')}</h3>
          <div className="mysqlrs__file-row">
            <span
              className={`mysqlrs__file-path ${filePath ? '' : 'mysqlrs__file-path--empty'}`}
              title={filePath}
            >
              {filePath || t('explorer.mysqlRestore.noFile')}
            </span>
            <Button variant="secondary" size="sm" onClick={() => void handleChooseFile()}>
              <FolderOpen size={14} /> {t('explorer.mysqlRestore.chooseFile')}
            </Button>
          </div>
        </section>

        {/* ─── Target ─────────────────────────────────────────────── */}
        <section className="mysqlrs__section">
          <h3 className="mysqlrs__section-title">{t('explorer.mysqlRestore.target')}</h3>
          <div className="mysqlrs__field">
            <label className="mysqlrs__field-label" htmlFor="mysqlrs-target">
              {t('explorer.mysqlRestore.targetDatabase')}
            </label>
            <input
              id="mysqlrs-target"
              className="mysqlrs__input"
              type="text"
              value={targetDb}
              onChange={(e) => setTargetDb(e.target.value)}
            />
          </div>
          <div className="mysqlrs__toggle-row">
            <span>{t('explorer.mysqlRestore.createIfNotExists')}</span>
            <Toggle
              id="mysqlrs-create"
              label={t('explorer.mysqlRestore.createIfNotExists')}
              checked={createIfNotExists}
              onChange={setCreateIfNotExists}
            />
          </div>
          <div className="mysqlrs__toggle-row">
            <span>{t('explorer.mysqlRestore.stopOnError')}</span>
            <Toggle
              id="mysqlrs-stop"
              label={t('explorer.mysqlRestore.stopOnError')}
              checked={stopOnError}
              onChange={setStopOnError}
            />
          </div>
        </section>

        {validationError && <span className="mysqlrs__error">{validationError}</span>}
        {serverError && <ErrorBox error={serverError} />}
        {successMessage && (
          <div className="mysqlrs__success">
            <Check size={15} /> {successMessage}
          </div>
        )}
      </div>
    </BaseDialog>
  )
}

export default RestoreMySqlDatabaseDialog

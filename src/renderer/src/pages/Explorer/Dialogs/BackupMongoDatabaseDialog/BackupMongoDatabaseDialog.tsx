import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DatabaseBackup, FolderOpen, Check, Cpu, Terminal } from 'lucide-react'
import BaseDialog from '../../../../components/BaseDialog/BaseDialog'
import ErrorBox from '../../../../components/ErrorBox/ErrorBox'
import Button from '../../../../components/Button/Button'
import Toggle from '../../../../components/Toggle/Toggle'
import { useSettings } from '../../../Settings/useSettings'
import type { MongoBackupOptions } from '../../../../../../preload/index.d'
import './BackupMongoDatabaseDialog.css'

interface BackupMongoDatabaseDialogProps {
  connectionId: string
  databaseName: string
  onClose: () => void
}

function BackupMongoDatabaseDialog({
  connectionId,
  databaseName,
  onClose
}: BackupMongoDatabaseDialogProps): React.JSX.Element {
  const { t } = useTranslation()
  const { settings } = useSettings()

  const [gzip, setGzip] = useState(false)
  const [filePath, setFilePath] = useState('')

  const [cliAvailable, setCliAvailable] = useState<boolean | null>(null)
  const [previewCommand, setPreviewCommand] = useState<string | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Detect whether mongodump is available to pick the engine badge and file format.
  useEffect(() => {
    let cancelled = false
    void window.api.database
      .mongoGetBackupTools(connectionId, { mongodumpPath: settings.mongodumpPath })
      .then((result) => {
        if (cancelled) return
        setCliAvailable(result.status === 'ok' ? result.tools.mongodump.found : false)
      })
    return () => {
      cancelled = true
    }
  }, [connectionId, settings.mongodumpPath])

  // The engine determines the on-disk format: mongodump → .archive, JS → .json.
  const engine: 'mongodump' | 'js' = cliAvailable ? 'mongodump' : 'js'

  function buildOptions(): MongoBackupOptions {
    return {
      databaseName,
      filePath,
      gzip,
      mongodumpPath: settings.mongodumpPath || undefined
    }
  }

  function clearMessages(): void {
    setValidationError(null)
    setServerError(null)
    setSuccessMessage(null)
  }

  async function handleChoosePath(): Promise<void> {
    const base = engine === 'mongodump' ? 'archive' : 'json'
    const result = await window.api.database.mongoPickBackupPath({
      defaultFileName: `${databaseName}.${base}${gzip ? '.gz' : ''}`,
      gzip,
      engine
    })
    if (result.status === 'ok') {
      setFilePath(result.filePath)
      if (validationError) setValidationError(null)
    }
  }

  async function handlePreview(): Promise<void> {
    clearMessages()
    const result = await window.api.database.mongoBuildBackupPreview(connectionId, buildOptions())
    if (result.status === 'error') {
      setServerError(result.message)
      return
    }
    setPreviewCommand((prev) => (prev === result.command ? null : result.command))
  }

  async function handleSubmit(): Promise<void> {
    clearMessages()
    if (!filePath) {
      setValidationError(t('explorer.mongoBackup.validation.fileRequired'))
      return
    }
    setIsSubmitting(true)
    try {
      const result = await window.api.database.mongoExecuteBackup(connectionId, buildOptions())
      if (result.status === 'error') {
        setServerError(result.message)
        return
      }
      const kb = (result.bytes / 1024).toFixed(1)
      setSuccessMessage(
        t('explorer.mongoBackup.success', {
          seconds: (result.durationMs / 1000).toFixed(1),
          size: kb,
          engine: result.engine === 'mongodump' ? 'mongodump' : 'JSON'
        })
      )
    } catch (err) {
      setServerError(err instanceof Error ? err.message : t('explorer.mongoBackup.unknownError'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <BaseDialog
      title={t('explorer.mongoBackup.dialogTitle')}
      icon={<DatabaseBackup size={16} />}
      onClose={onClose}
      closeDisabled={isSubmitting}
      maxWidth="38rem"
      width="38rem"
      analyticsId="mongo_backup_database"
      footer={
        <div className="mongobk__footer">
          <Button
            variant="ghost"
            onClick={() => void handlePreview()}
            disabled={isSubmitting || !cliAvailable}
          >
            {previewCommand
              ? t('explorer.mongoBackup.hideCommand')
              : t('explorer.mongoBackup.previewCommand')}
          </Button>
          <div className="mongobk__footer-right">
            <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
              {t('explorer.mongoBackup.cancel')}
            </Button>
            <Button variant="primary" onClick={() => void handleSubmit()} disabled={isSubmitting}>
              {isSubmitting
                ? t('explorer.mongoBackup.backingUp')
                : t('explorer.mongoBackup.backUp')}
            </Button>
          </div>
        </div>
      }
    >
      <div className="mongobk__body dialog__scroll-area">
        {cliAvailable !== null && (
          <div
            className={`mongobk__engine-banner ${cliAvailable ? 'mongobk__engine-banner--cli' : 'mongobk__engine-banner--js'}`}
          >
            {cliAvailable ? <Terminal size={14} /> : <Cpu size={14} />}
            {cliAvailable
              ? t('explorer.mongoBackup.engineCli')
              : t('explorer.mongoBackup.engineJs')}
          </div>
        )}

        {/* ─── Source ─────────────────────────────────────────────── */}
        <section className="mongobk__section">
          <h3 className="mongobk__section-title">{t('explorer.mongoBackup.source')}</h3>
          <div className="mongobk__row">
            <span className="mongobk__label">{t('explorer.mongoBackup.databaseLabel')}</span>
            <span className="mongobk__value">{databaseName}</span>
          </div>
        </section>

        {/* ─── Destination ────────────────────────────────────────── */}
        <section className="mongobk__section">
          <h3 className="mongobk__section-title">{t('explorer.mongoBackup.destination')}</h3>
          <div className="mongobk__file-row">
            <span
              className={`mongobk__file-path ${filePath ? '' : 'mongobk__file-path--empty'}`}
              title={filePath}
            >
              {filePath || t('explorer.mongoBackup.noFile')}
            </span>
            <Button variant="secondary" size="sm" onClick={() => void handleChoosePath()}>
              <FolderOpen size={14} /> {t('explorer.mongoBackup.chooseFile')}
            </Button>
          </div>
          <div className="mongobk__toggle-row">
            <span>{t('explorer.mongoBackup.compress')}</span>
            <Toggle
              id="mongobk-compress"
              label={t('explorer.mongoBackup.compress')}
              checked={gzip}
              onChange={(value) => {
                setGzip(value)
                // The extension changes with compression; force re-pick.
                setFilePath('')
              }}
            />
          </div>
        </section>

        {validationError && <span className="mongobk__error">{validationError}</span>}
        {serverError && <ErrorBox error={serverError} />}
        {successMessage && (
          <div className="mongobk__success">
            <Check size={15} /> {successMessage}
          </div>
        )}
        {previewCommand && (
          <pre className="mongobk__preview">
            <code>{previewCommand}</code>
          </pre>
        )}
      </div>
    </BaseDialog>
  )
}

export default BackupMongoDatabaseDialog

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DatabaseBackup, FolderOpen, Check } from 'lucide-react'
import BaseDialog from '../../../../components/BaseDialog/BaseDialog'
import ErrorBox from '../../../../components/ErrorBox/ErrorBox'
import Button from '../../../../components/Button/Button'
import Toggle from '../../../../components/Toggle/Toggle'
import type { SqliteBackupOptions } from '../../../../../../preload/index.d'
import './BackupSqliteDatabaseDialog.css'

interface BackupSqliteDatabaseDialogProps {
  connectionId: string
  databaseName: string
  onClose: () => void
}

function BackupSqliteDatabaseDialog({
  connectionId,
  databaseName,
  onClose
}: BackupSqliteDatabaseDialogProps): React.JSX.Element {
  const { t } = useTranslation()

  const [filePath, setFilePath] = useState('')
  const [compact, setCompact] = useState(false)
  const [compress, setCompress] = useState(false)

  const [validationError, setValidationError] = useState<string | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  function buildOptions(): SqliteBackupOptions {
    return { filePath, compact, compress }
  }

  async function handleChoosePath(): Promise<void> {
    const result = await window.api.database.sqlitePickBackupPath({
      defaultFileName: `${databaseName}.db${compress ? '.gz' : ''}`,
      compress
    })
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
      setValidationError(t('explorer.sqliteBackup.validation.fileRequired'))
      return
    }
    setIsSubmitting(true)
    try {
      const result = await window.api.database.sqliteExecuteBackup(connectionId, buildOptions())
      if (result.status === 'error') {
        setServerError(result.message)
        return
      }
      setSuccessMessage(
        t('explorer.sqliteBackup.success', {
          seconds: (result.durationMs / 1000).toFixed(1),
          size: (result.bytes / 1024).toFixed(1)
        })
      )
    } catch (err) {
      setServerError(err instanceof Error ? err.message : t('explorer.sqliteBackup.unknownError'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <BaseDialog
      title={t('explorer.sqliteBackup.dialogTitle')}
      icon={<DatabaseBackup size={16} />}
      onClose={onClose}
      closeDisabled={isSubmitting}
      maxWidth="34rem"
      width="34rem"
      analyticsId="sqlite_backup_database"
      footer={
        <div className="sqlitebk__footer">
          <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
            {t('explorer.sqliteBackup.cancel')}
          </Button>
          <Button variant="primary" onClick={() => void handleSubmit()} disabled={isSubmitting}>
            {isSubmitting
              ? t('explorer.sqliteBackup.backingUp')
              : t('explorer.sqliteBackup.backUp')}
          </Button>
        </div>
      }
    >
      <div className="sqlitebk__body dialog__scroll-area">
        {/* ─── Source ─────────────────────────────────────────────── */}
        <section className="sqlitebk__section">
          <h3 className="sqlitebk__section-title">{t('explorer.sqliteBackup.source')}</h3>
          <div className="sqlitebk__row">
            <span className="sqlitebk__label">{t('explorer.sqliteBackup.databaseLabel')}</span>
            <span className="sqlitebk__value">{databaseName}</span>
          </div>
        </section>

        {/* ─── Destination ────────────────────────────────────────── */}
        <section className="sqlitebk__section">
          <h3 className="sqlitebk__section-title">{t('explorer.sqliteBackup.destination')}</h3>
          <div className="sqlitebk__file-row">
            <span
              className={`sqlitebk__file-path ${filePath ? '' : 'sqlitebk__file-path--empty'}`}
              title={filePath}
            >
              {filePath || t('explorer.sqliteBackup.noFile')}
            </span>
            <Button variant="secondary" size="sm" onClick={() => void handleChoosePath()}>
              <FolderOpen size={14} /> {t('explorer.sqliteBackup.chooseFile')}
            </Button>
          </div>
          <div className="sqlitebk__toggle-row">
            <span>{t('explorer.sqliteBackup.compact')}</span>
            <Toggle
              id="sqlitebk-compact"
              label={t('explorer.sqliteBackup.compact')}
              checked={compact}
              onChange={setCompact}
            />
          </div>
          <div className="sqlitebk__toggle-row">
            <span>{t('explorer.sqliteBackup.compress')}</span>
            <Toggle
              id="sqlitebk-compress"
              label={t('explorer.sqliteBackup.compress')}
              checked={compress}
              onChange={setCompress}
            />
          </div>
        </section>

        {validationError && <span className="sqlitebk__error">{validationError}</span>}
        {serverError && <ErrorBox error={serverError} />}
        {successMessage && (
          <div className="sqlitebk__success">
            <Check size={15} /> {successMessage}
          </div>
        )}
      </div>
    </BaseDialog>
  )
}

export default BackupSqliteDatabaseDialog

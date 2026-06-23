import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Upload, FolderOpen, Check } from 'lucide-react'
import BaseDialog from '../../../../components/BaseDialog/BaseDialog'
import ErrorBox from '../../../../components/ErrorBox/ErrorBox'
import Button from '../../../../components/Button/Button'
import Toggle from '../../../../components/Toggle/Toggle'
import type { SqliteRestoreOptions } from '../../../../../../preload/index.d'
import './RestoreSqliteDatabaseDialog.css'

interface RestoreSqliteDatabaseDialogProps {
  connectionId: string
  databaseName: string
  onClose: () => void
}

function RestoreSqliteDatabaseDialog({
  connectionId,
  databaseName,
  onClose
}: RestoreSqliteDatabaseDialogProps): React.JSX.Element {
  const { t } = useTranslation()

  const [filePath, setFilePath] = useState('')
  const [safetyCopy, setSafetyCopy] = useState(true)

  const [validationError, setValidationError] = useState<string | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  function buildOptions(): SqliteRestoreOptions {
    return { filePath, safetyCopy }
  }

  async function handleChooseFile(): Promise<void> {
    const result = await window.api.database.sqlitePickRestoreFile()
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
      setValidationError(t('explorer.sqliteRestore.validation.fileRequired'))
      return
    }
    setIsSubmitting(true)
    try {
      const result = await window.api.database.sqliteExecuteRestore(connectionId, buildOptions())
      if (result.status === 'error') {
        setServerError(result.message)
        return
      }
      const base = t('explorer.sqliteRestore.success', {
        seconds: (result.durationMs / 1000).toFixed(1)
      })
      setSuccessMessage(
        result.safetyCopyPath
          ? `${base} ${t('explorer.sqliteRestore.safetyCopySaved', { path: result.safetyCopyPath })}`
          : base
      )
    } catch (err) {
      setServerError(err instanceof Error ? err.message : t('explorer.sqliteRestore.unknownError'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <BaseDialog
      title={t('explorer.sqliteRestore.dialogTitle')}
      icon={<Upload size={16} />}
      onClose={onClose}
      closeDisabled={isSubmitting}
      maxWidth="34rem"
      width="34rem"
      analyticsId="sqlite_restore_database"
      footer={
        <div className="sqliterse__footer">
          <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
            {t('explorer.sqliteRestore.cancel')}
          </Button>
          <Button variant="primary" onClick={() => void handleSubmit()} disabled={isSubmitting}>
            {isSubmitting
              ? t('explorer.sqliteRestore.restoring')
              : t('explorer.sqliteRestore.restore')}
          </Button>
        </div>
      }
    >
      <div className="sqliterse__body dialog__scroll-area">
        {/* ─── Source ─────────────────────────────────────────────── */}
        <section className="sqliterse__section">
          <h3 className="sqliterse__section-title">{t('explorer.sqliteRestore.source')}</h3>
          <div className="sqliterse__file-row">
            <span
              className={`sqliterse__file-path ${filePath ? '' : 'sqliterse__file-path--empty'}`}
              title={filePath}
            >
              {filePath || t('explorer.sqliteRestore.noFile')}
            </span>
            <Button variant="secondary" size="sm" onClick={() => void handleChooseFile()}>
              <FolderOpen size={14} /> {t('explorer.sqliteRestore.chooseFile')}
            </Button>
          </div>
        </section>

        {/* ─── Target ─────────────────────────────────────────────── */}
        <section className="sqliterse__section">
          <h3 className="sqliterse__section-title">{t('explorer.sqliteRestore.target')}</h3>
          <div className="sqliterse__row">
            <span className="sqliterse__label">{t('explorer.sqliteRestore.databaseLabel')}</span>
            <span className="sqliterse__value">{databaseName}</span>
          </div>
          <p className="sqliterse__hint">{t('explorer.sqliteRestore.overwriteWarning')}</p>
          <div className="sqliterse__toggle-row">
            <span>{t('explorer.sqliteRestore.safetyCopy')}</span>
            <Toggle
              id="sqliterse-safety"
              label={t('explorer.sqliteRestore.safetyCopy')}
              checked={safetyCopy}
              onChange={setSafetyCopy}
            />
          </div>
        </section>

        {validationError && <span className="sqliterse__error">{validationError}</span>}
        {serverError && <ErrorBox error={serverError} />}
        {successMessage && (
          <div className="sqliterse__success">
            <Check size={15} /> {successMessage}
          </div>
        )}
      </div>
    </BaseDialog>
  )
}

export default RestoreSqliteDatabaseDialog

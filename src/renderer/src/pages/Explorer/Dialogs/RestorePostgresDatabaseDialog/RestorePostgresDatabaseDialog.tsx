import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Upload, FolderOpen, Check } from 'lucide-react'
import BaseDialog from '../../../../components/BaseDialog/BaseDialog'
import ErrorBox from '../../../../components/ErrorBox/ErrorBox'
import Button from '../../../../components/Button/Button'
import Toggle from '../../../../components/Toggle/Toggle'
import { useSettings } from '../../../Settings/useSettings'
import type {
  PostgresBackupFormat,
  PostgresRestoreOptions
} from '../../../../../../preload/index.d'
import './RestorePostgresDatabaseDialog.css'

interface RestorePostgresDatabaseDialogProps {
  connectionId: string
  databaseName: string
  onClose: () => void
}

/** Guesses the archive format from a dump file's extension. */
function guessFormat(filePath: string): PostgresBackupFormat {
  const lower = filePath.toLowerCase()
  if (lower.endsWith('.dump') || lower.endsWith('.backup')) return 'custom'
  if (lower.endsWith('.tar')) return 'tar'
  return 'plain'
}

function RestorePostgresDatabaseDialog({
  connectionId,
  databaseName,
  onClose
}: RestorePostgresDatabaseDialogProps): React.JSX.Element {
  const { t } = useTranslation()
  const { settings } = useSettings()

  const [filePath, setFilePath] = useState('')
  const [format, setFormat] = useState<PostgresBackupFormat>('custom')
  const [targetDb, setTargetDb] = useState(databaseName)
  const [createDatabase, setCreateDatabase] = useState(false)
  const [clean, setClean] = useState(false)
  const [noOwner, setNoOwner] = useState(false)
  const [singleTransaction, setSingleTransaction] = useState(false)
  const [jobs, setJobs] = useState(1)

  const [validationError, setValidationError] = useState<string | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const isPlain = format === 'plain'
  const supportsJobs = (format === 'custom' || format === 'directory') && !singleTransaction

  function buildOptions(): PostgresRestoreOptions {
    return {
      filePath,
      format,
      targetDatabaseName: targetDb.trim(),
      createDatabase,
      clean: !isPlain && clean,
      noOwner: !isPlain && noOwner,
      singleTransaction,
      jobs: supportsJobs ? jobs : undefined,
      pgRestorePath: settings.pgRestorePath || undefined,
      psqlPath: settings.psqlPath || undefined
    }
  }

  async function handleChooseFile(): Promise<void> {
    const result = await window.api.database.postgresPickRestoreFile()
    if (result.status === 'ok') {
      setFilePath(result.filePath)
      setFormat(guessFormat(result.filePath))
      if (validationError) setValidationError(null)
    }
  }

  async function handleSubmit(): Promise<void> {
    setValidationError(null)
    setServerError(null)
    setSuccessMessage(null)
    if (!filePath) {
      setValidationError(t('explorer.postgresRestore.validation.fileRequired'))
      return
    }
    if (!targetDb.trim()) {
      setValidationError(t('explorer.postgresRestore.validation.targetRequired'))
      return
    }
    setIsSubmitting(true)
    try {
      const result = await window.api.database.postgresExecuteRestore(connectionId, buildOptions())
      if (result.status === 'error') {
        setServerError(result.message)
        return
      }
      setSuccessMessage(
        t('explorer.postgresRestore.success', {
          seconds: (result.durationMs / 1000).toFixed(1)
        })
      )
    } catch (err) {
      setServerError(
        err instanceof Error ? err.message : t('explorer.postgresRestore.unknownError')
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <BaseDialog
      title={t('explorer.postgresRestore.dialogTitle')}
      icon={<Upload size={16} />}
      onClose={onClose}
      closeDisabled={isSubmitting}
      maxWidth="34rem"
      width="34rem"
      analyticsId="postgres_restore_database"
      footer={
        <div className="pgrs__footer">
          <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
            {t('explorer.postgresRestore.cancel')}
          </Button>
          <Button variant="primary" onClick={() => void handleSubmit()} disabled={isSubmitting}>
            {isSubmitting
              ? t('explorer.postgresRestore.restoring')
              : t('explorer.postgresRestore.restore')}
          </Button>
        </div>
      }
    >
      <div className="pgrs__body dialog__scroll-area">
        {/* ─── Source ─────────────────────────────────────────────── */}
        <section className="pgrs__section">
          <h3 className="pgrs__section-title">{t('explorer.postgresRestore.source')}</h3>
          <div className="pgrs__file-row">
            <span
              className={`pgrs__file-path ${filePath ? '' : 'pgrs__file-path--empty'}`}
              title={filePath}
            >
              {filePath || t('explorer.postgresRestore.noFile')}
            </span>
            <Button variant="secondary" size="sm" onClick={() => void handleChooseFile()}>
              <FolderOpen size={14} /> {t('explorer.postgresRestore.chooseFile')}
            </Button>
          </div>
          <div className="pgrs__field">
            <label className="pgrs__field-label" htmlFor="pgrs-format">
              {t('explorer.postgresRestore.format')}
            </label>
            <select
              id="pgrs-format"
              className="pgrs__select"
              value={format}
              onChange={(e) => setFormat(e.target.value as PostgresBackupFormat)}
            >
              <option value="plain">{t('explorer.postgresRestore.formatPlain')}</option>
              <option value="custom">{t('explorer.postgresRestore.formatCustom')}</option>
              <option value="tar">{t('explorer.postgresRestore.formatTar')}</option>
              <option value="directory">{t('explorer.postgresRestore.formatDirectory')}</option>
            </select>
          </div>
        </section>

        {/* ─── Target ─────────────────────────────────────────────── */}
        <section className="pgrs__section">
          <h3 className="pgrs__section-title">{t('explorer.postgresRestore.target')}</h3>
          <div className="pgrs__field">
            <label className="pgrs__field-label" htmlFor="pgrs-target">
              {t('explorer.postgresRestore.targetDatabase')}
            </label>
            <input
              id="pgrs-target"
              className="pgrs__input"
              type="text"
              value={targetDb}
              onChange={(e) => setTargetDb(e.target.value)}
            />
          </div>
          <div className="pgrs__toggle-row">
            <span>{t('explorer.postgresRestore.createDatabase')}</span>
            <Toggle
              id="pgrs-create"
              label={t('explorer.postgresRestore.createDatabase')}
              checked={createDatabase}
              onChange={setCreateDatabase}
            />
          </div>
          <div className="pgrs__toggle-row">
            <span>{t('explorer.postgresRestore.singleTransaction')}</span>
            <Toggle
              id="pgrs-single"
              label={t('explorer.postgresRestore.singleTransaction')}
              checked={singleTransaction}
              onChange={setSingleTransaction}
            />
          </div>
          {!isPlain && (
            <>
              <div className="pgrs__toggle-row">
                <span>{t('explorer.postgresRestore.clean')}</span>
                <Toggle
                  id="pgrs-clean"
                  label={t('explorer.postgresRestore.clean')}
                  checked={clean}
                  onChange={setClean}
                />
              </div>
              <div className="pgrs__toggle-row">
                <span>{t('explorer.postgresRestore.noOwner')}</span>
                <Toggle
                  id="pgrs-noowner"
                  label={t('explorer.postgresRestore.noOwner')}
                  checked={noOwner}
                  onChange={setNoOwner}
                />
              </div>
              {supportsJobs && (
                <div className="pgrs__field">
                  <label className="pgrs__field-label" htmlFor="pgrs-jobs">
                    {t('explorer.postgresRestore.jobs')}
                  </label>
                  <input
                    id="pgrs-jobs"
                    className="pgrs__input"
                    type="number"
                    min={1}
                    value={jobs}
                    onChange={(e) => {
                      const v = Number(e.target.value)
                      if (v >= 1) setJobs(v)
                    }}
                  />
                </div>
              )}
            </>
          )}
        </section>

        {validationError && <span className="pgrs__error">{validationError}</span>}
        {serverError && <ErrorBox error={serverError} />}
        {successMessage && (
          <div className="pgrs__success">
            <Check size={15} /> {successMessage}
          </div>
        )}
      </div>
    </BaseDialog>
  )
}

export default RestorePostgresDatabaseDialog

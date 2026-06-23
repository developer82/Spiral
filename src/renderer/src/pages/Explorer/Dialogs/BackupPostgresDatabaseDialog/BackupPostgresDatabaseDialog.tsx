import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DatabaseBackup, FolderOpen, Check, Cpu, Terminal } from 'lucide-react'
import BaseDialog from '../../../../components/BaseDialog/BaseDialog'
import ErrorBox from '../../../../components/ErrorBox/ErrorBox'
import Button from '../../../../components/Button/Button'
import Toggle from '../../../../components/Toggle/Toggle'
import { useSettings } from '../../../Settings/useSettings'
import type {
  PostgresBackupContent,
  PostgresBackupFormat,
  PostgresBackupOptions
} from '../../../../../../preload/index.d'
import './BackupPostgresDatabaseDialog.css'

interface BackupPostgresDatabaseDialogProps {
  connectionId: string
  databaseName: string
  onClose: () => void
}

/** Default file extension suggested for each pg_dump output format. */
function extensionFor(format: PostgresBackupFormat, compress: boolean): string {
  switch (format) {
    case 'custom':
      return 'dump'
    case 'tar':
      return 'tar'
    case 'directory':
      return ''
    default:
      return compress ? 'sql.gz' : 'sql'
  }
}

function BackupPostgresDatabaseDialog({
  connectionId,
  databaseName,
  onClose
}: BackupPostgresDatabaseDialogProps): React.JSX.Element {
  const { t } = useTranslation()
  const { settings } = useSettings()

  const [format, setFormat] = useState<PostgresBackupFormat>('custom')
  const [content, setContent] = useState<PostgresBackupContent>('schema-and-data')
  const [noOwner, setNoOwner] = useState(false)
  const [noPrivileges, setNoPrivileges] = useState(false)
  const [clean, setClean] = useState(false)
  const [createDatabase, setCreateDatabase] = useState(false)
  const [compress, setCompress] = useState(false)
  const [compressionLevel, setCompressionLevel] = useState(6)
  const [encoding, setEncoding] = useState('')
  const [filePath, setFilePath] = useState('')

  const [cliAvailable, setCliAvailable] = useState<boolean | null>(null)
  const [previewCommand, setPreviewCommand] = useState<string | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const isPlain = format === 'plain'
  const supportsLevel = format === 'custom' || format === 'directory'

  // Detect whether pg_dump is available to pick the engine badge.
  useEffect(() => {
    let cancelled = false
    void window.api.database
      .postgresGetBackupTools(connectionId, { pgDumpPath: settings.pgDumpPath })
      .then((result) => {
        if (cancelled) return
        setCliAvailable(result.status === 'ok' ? result.tools.pgDump.found : false)
      })
    return () => {
      cancelled = true
    }
  }, [connectionId, settings.pgDumpPath])

  function buildOptions(): PostgresBackupOptions {
    return {
      databaseName,
      filePath,
      format,
      content,
      noOwner,
      noPrivileges,
      clean,
      createDatabase,
      compressionLevel: supportsLevel ? compressionLevel : undefined,
      encoding: encoding.trim() || undefined,
      compress: isPlain && compress,
      pgDumpPath: settings.pgDumpPath || undefined
    }
  }

  function clearMessages(): void {
    setValidationError(null)
    setServerError(null)
    setSuccessMessage(null)
  }

  async function handleChoosePath(): Promise<void> {
    const ext = extensionFor(format, compress)
    const result = await window.api.database.postgresPickBackupPath({
      defaultFileName: ext ? `${databaseName}.${ext}` : databaseName,
      compress: isPlain && compress,
      format
    })
    if (result.status === 'ok') {
      setFilePath(result.filePath)
      if (validationError) setValidationError(null)
    }
  }

  async function handlePreview(): Promise<void> {
    clearMessages()
    const result = await window.api.database.postgresBuildBackupPreview(
      connectionId,
      buildOptions()
    )
    if (result.status === 'error') {
      setServerError(result.message)
      return
    }
    setPreviewCommand((prev) => (prev === result.command ? null : result.command))
  }

  async function handleSubmit(): Promise<void> {
    clearMessages()
    if (!filePath) {
      setValidationError(t('explorer.postgresBackup.validation.fileRequired'))
      return
    }
    setIsSubmitting(true)
    try {
      const result = await window.api.database.postgresExecuteBackup(connectionId, buildOptions())
      if (result.status === 'error') {
        setServerError(result.message)
        return
      }
      const kb = (result.bytes / 1024).toFixed(1)
      setSuccessMessage(
        t('explorer.postgresBackup.success', {
          seconds: (result.durationMs / 1000).toFixed(1),
          size: kb
        })
      )
    } catch (err) {
      setServerError(err instanceof Error ? err.message : t('explorer.postgresBackup.unknownError'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <BaseDialog
      title={t('explorer.postgresBackup.dialogTitle')}
      icon={<DatabaseBackup size={16} />}
      onClose={onClose}
      closeDisabled={isSubmitting}
      maxWidth="38rem"
      width="38rem"
      analyticsId="postgres_backup_database"
      footer={
        <div className="pgbk__footer">
          <Button variant="ghost" onClick={() => void handlePreview()} disabled={isSubmitting}>
            {previewCommand
              ? t('explorer.postgresBackup.hideCommand')
              : t('explorer.postgresBackup.previewCommand')}
          </Button>
          <div className="pgbk__footer-right">
            <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
              {t('explorer.postgresBackup.cancel')}
            </Button>
            <Button variant="primary" onClick={() => void handleSubmit()} disabled={isSubmitting}>
              {isSubmitting
                ? t('explorer.postgresBackup.backingUp')
                : t('explorer.postgresBackup.backUp')}
            </Button>
          </div>
        </div>
      }
    >
      <div className="pgbk__body dialog__scroll-area">
        {cliAvailable !== null && (
          <div
            className={`pgbk__engine-banner ${cliAvailable ? 'pgbk__engine-banner--cli' : 'pgbk__engine-banner--js'}`}
          >
            {cliAvailable ? <Terminal size={14} /> : <Cpu size={14} />}
            {cliAvailable
              ? t('explorer.postgresBackup.engineCli')
              : t('explorer.postgresBackup.engineMissing')}
          </div>
        )}

        {/* ─── Source ─────────────────────────────────────────────── */}
        <section className="pgbk__section">
          <h3 className="pgbk__section-title">{t('explorer.postgresBackup.source')}</h3>
          <div className="pgbk__row">
            <span className="pgbk__label">{t('explorer.postgresBackup.databaseLabel')}</span>
            <span className="pgbk__value">{databaseName}</span>
          </div>
          <div className="pgbk__field">
            <label className="pgbk__field-label" htmlFor="pgbk-content">
              {t('explorer.postgresBackup.content')}
            </label>
            <select
              id="pgbk-content"
              className="pgbk__select"
              value={content}
              onChange={(e) => setContent(e.target.value as PostgresBackupContent)}
            >
              <option value="schema-and-data">{t('explorer.postgresBackup.contentBoth')}</option>
              <option value="schema-only">{t('explorer.postgresBackup.contentSchema')}</option>
              <option value="data-only">{t('explorer.postgresBackup.contentData')}</option>
            </select>
          </div>
        </section>

        {/* ─── Destination ────────────────────────────────────────── */}
        <section className="pgbk__section">
          <h3 className="pgbk__section-title">{t('explorer.postgresBackup.destination')}</h3>
          <div className="pgbk__field">
            <label className="pgbk__field-label" htmlFor="pgbk-format">
              {t('explorer.postgresBackup.format')}
            </label>
            <select
              id="pgbk-format"
              className="pgbk__select"
              value={format}
              onChange={(e) => {
                setFormat(e.target.value as PostgresBackupFormat)
                setFilePath('')
              }}
            >
              <option value="plain">{t('explorer.postgresBackup.formatPlain')}</option>
              <option value="custom">{t('explorer.postgresBackup.formatCustom')}</option>
              <option value="tar">{t('explorer.postgresBackup.formatTar')}</option>
              <option value="directory">{t('explorer.postgresBackup.formatDirectory')}</option>
            </select>
          </div>
          <div className="pgbk__file-row">
            <span
              className={`pgbk__file-path ${filePath ? '' : 'pgbk__file-path--empty'}`}
              title={filePath}
            >
              {filePath || t('explorer.postgresBackup.noFile')}
            </span>
            <Button variant="secondary" size="sm" onClick={() => void handleChoosePath()}>
              <FolderOpen size={14} />{' '}
              {format === 'directory'
                ? t('explorer.postgresBackup.chooseFolder')
                : t('explorer.postgresBackup.chooseFile')}
            </Button>
          </div>
          {isPlain && (
            <div className="pgbk__toggle-row">
              <span>{t('explorer.postgresBackup.compress')}</span>
              <Toggle
                id="pgbk-compress"
                label={t('explorer.postgresBackup.compress')}
                checked={compress}
                onChange={setCompress}
              />
            </div>
          )}
          {supportsLevel && (
            <div className="pgbk__field">
              <label className="pgbk__field-label" htmlFor="pgbk-level">
                {t('explorer.postgresBackup.compressionLevel')}
              </label>
              <input
                id="pgbk-level"
                className="pgbk__input"
                type="number"
                min={0}
                max={9}
                value={compressionLevel}
                onChange={(e) => {
                  const v = Number(e.target.value)
                  if (v >= 0 && v <= 9) setCompressionLevel(v)
                }}
              />
            </div>
          )}
        </section>

        {/* ─── Options ────────────────────────────────────────────── */}
        <section className="pgbk__section">
          <h3 className="pgbk__section-title">{t('explorer.postgresBackup.options')}</h3>
          {(
            [
              ['noOwner', noOwner, setNoOwner],
              ['noPrivileges', noPrivileges, setNoPrivileges],
              ['clean', clean, setClean],
              ['createDatabase', createDatabase, setCreateDatabase]
            ] as [string, boolean, (v: boolean) => void][]
          ).map(([key, value, setter]) => (
            <div key={key} className="pgbk__toggle-row">
              <span>{t(`explorer.postgresBackup.opt.${key}`)}</span>
              <Toggle
                id={`pgbk-${key}`}
                label={t(`explorer.postgresBackup.opt.${key}`)}
                checked={value}
                onChange={setter}
              />
            </div>
          ))}
          <div className="pgbk__field">
            <label className="pgbk__field-label" htmlFor="pgbk-encoding">
              {t('explorer.postgresBackup.encoding')}
            </label>
            <input
              id="pgbk-encoding"
              className="pgbk__input"
              type="text"
              value={encoding}
              onChange={(e) => setEncoding(e.target.value)}
              placeholder="UTF8"
            />
          </div>
        </section>

        {validationError && <span className="pgbk__error">{validationError}</span>}
        {serverError && <ErrorBox error={serverError} />}
        {successMessage && (
          <div className="pgbk__success">
            <Check size={15} /> {successMessage}
          </div>
        )}
        {previewCommand && (
          <pre className="pgbk__preview">
            <code>{previewCommand}</code>
          </pre>
        )}
      </div>
    </BaseDialog>
  )
}

export default BackupPostgresDatabaseDialog

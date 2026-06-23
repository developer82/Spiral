import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DatabaseBackup, FolderOpen, Check, Cpu, Terminal } from 'lucide-react'
import BaseDialog from '../../../../components/BaseDialog/BaseDialog'
import ErrorBox from '../../../../components/ErrorBox/ErrorBox'
import Button from '../../../../components/Button/Button'
import Toggle from '../../../../components/Toggle/Toggle'
import { useSettings } from '../../../Settings/useSettings'
import type { MySqlBackupContent, MySqlBackupOptions } from '../../../../../../preload/index.d'
import './BackupMySqlDatabaseDialog.css'

interface BackupMySqlDatabaseDialogProps {
  connectionId: string
  databaseName: string
  onClose: () => void
}

function BackupMySqlDatabaseDialog({
  connectionId,
  databaseName,
  onClose
}: BackupMySqlDatabaseDialogProps): React.JSX.Element {
  const { t } = useTranslation()
  const { settings } = useSettings()

  const [content, setContent] = useState<MySqlBackupContent>('schema-and-data')
  const [addDropTable, setAddDropTable] = useState(true)
  const [singleTransaction, setSingleTransaction] = useState(true)
  const [includeRoutines, setIncludeRoutines] = useState(true)
  const [includeTriggers, setIncludeTriggers] = useState(true)
  const [includeEvents, setIncludeEvents] = useState(false)
  const [extendedInsert, setExtendedInsert] = useState(true)
  const [addCreateDatabase, setAddCreateDatabase] = useState(false)
  const [charset, setCharset] = useState('utf8mb4')
  const [compress, setCompress] = useState(false)
  const [filePath, setFilePath] = useState('')

  const [cliAvailable, setCliAvailable] = useState<boolean | null>(null)
  const [previewCommand, setPreviewCommand] = useState<string | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Detect whether mysqldump is available to pick the engine badge.
  useEffect(() => {
    let cancelled = false
    void window.api.database
      .mysqlGetBackupTools(connectionId, { mysqlDumpPath: settings.mysqlDumpPath })
      .then((result) => {
        if (cancelled) return
        setCliAvailable(result.status === 'ok' ? result.tools.mysqldump.found : false)
      })
    return () => {
      cancelled = true
    }
  }, [connectionId, settings.mysqlDumpPath])

  function buildOptions(): MySqlBackupOptions {
    return {
      databaseName,
      filePath,
      content,
      addDropTable,
      singleTransaction,
      includeRoutines,
      includeTriggers,
      includeEvents,
      extendedInsert,
      addCreateDatabase,
      charset: charset.trim() || 'utf8mb4',
      compress,
      mysqlDumpPath: settings.mysqlDumpPath || undefined
    }
  }

  function clearMessages(): void {
    setValidationError(null)
    setServerError(null)
    setSuccessMessage(null)
  }

  async function handleChoosePath(): Promise<void> {
    const result = await window.api.database.mysqlPickBackupPath({
      defaultFileName: `${databaseName}.sql${compress ? '.gz' : ''}`,
      compress
    })
    if (result.status === 'ok') {
      setFilePath(result.filePath)
      if (validationError) setValidationError(null)
    }
  }

  async function handlePreview(): Promise<void> {
    clearMessages()
    const result = await window.api.database.mysqlBuildBackupPreview(connectionId, buildOptions())
    if (result.status === 'error') {
      setServerError(result.message)
      return
    }
    setPreviewCommand((prev) => (prev === result.command ? null : result.command))
  }

  async function handleSubmit(): Promise<void> {
    clearMessages()
    if (!filePath) {
      setValidationError(t('explorer.mysqlBackup.validation.fileRequired'))
      return
    }
    setIsSubmitting(true)
    try {
      const result = await window.api.database.mysqlExecuteBackup(connectionId, buildOptions())
      if (result.status === 'error') {
        setServerError(result.message)
        return
      }
      const kb = (result.bytes / 1024).toFixed(1)
      setSuccessMessage(
        t('explorer.mysqlBackup.success', {
          seconds: (result.durationMs / 1000).toFixed(1),
          size: kb,
          engine: result.engine === 'mysqldump' ? 'mysqldump' : 'JS'
        })
      )
    } catch (err) {
      setServerError(err instanceof Error ? err.message : t('explorer.mysqlBackup.unknownError'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <BaseDialog
      title={t('explorer.mysqlBackup.dialogTitle')}
      icon={<DatabaseBackup size={16} />}
      onClose={onClose}
      closeDisabled={isSubmitting}
      maxWidth="38rem"
      width="38rem"
      analyticsId="mysql_backup_database"
      footer={
        <div className="mysqlbk__footer">
          <Button variant="ghost" onClick={() => void handlePreview()} disabled={isSubmitting}>
            {previewCommand
              ? t('explorer.mysqlBackup.hideCommand')
              : t('explorer.mysqlBackup.previewCommand')}
          </Button>
          <div className="mysqlbk__footer-right">
            <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
              {t('explorer.mysqlBackup.cancel')}
            </Button>
            <Button variant="primary" onClick={() => void handleSubmit()} disabled={isSubmitting}>
              {isSubmitting
                ? t('explorer.mysqlBackup.backingUp')
                : t('explorer.mysqlBackup.backUp')}
            </Button>
          </div>
        </div>
      }
    >
      <div className="mysqlbk__body dialog__scroll-area">
        {cliAvailable !== null && (
          <div
            className={`mysqlbk__engine-banner ${cliAvailable ? 'mysqlbk__engine-banner--cli' : 'mysqlbk__engine-banner--js'}`}
          >
            {cliAvailable ? <Terminal size={14} /> : <Cpu size={14} />}
            {cliAvailable
              ? t('explorer.mysqlBackup.engineCli')
              : t('explorer.mysqlBackup.engineJs')}
          </div>
        )}

        {/* ─── Source ─────────────────────────────────────────────── */}
        <section className="mysqlbk__section">
          <h3 className="mysqlbk__section-title">{t('explorer.mysqlBackup.source')}</h3>
          <div className="mysqlbk__row">
            <span className="mysqlbk__label">{t('explorer.mysqlBackup.databaseLabel')}</span>
            <span className="mysqlbk__value">{databaseName}</span>
          </div>
          <div className="mysqlbk__field">
            <label className="mysqlbk__field-label" htmlFor="mysqlbk-content">
              {t('explorer.mysqlBackup.content')}
            </label>
            <select
              id="mysqlbk-content"
              className="mysqlbk__select"
              value={content}
              onChange={(e) => setContent(e.target.value as MySqlBackupContent)}
            >
              <option value="schema-and-data">{t('explorer.mysqlBackup.contentBoth')}</option>
              <option value="schema-only">{t('explorer.mysqlBackup.contentSchema')}</option>
              <option value="data-only">{t('explorer.mysqlBackup.contentData')}</option>
            </select>
          </div>
        </section>

        {/* ─── Destination ────────────────────────────────────────── */}
        <section className="mysqlbk__section">
          <h3 className="mysqlbk__section-title">{t('explorer.mysqlBackup.destination')}</h3>
          <div className="mysqlbk__file-row">
            <span
              className={`mysqlbk__file-path ${filePath ? '' : 'mysqlbk__file-path--empty'}`}
              title={filePath}
            >
              {filePath || t('explorer.mysqlBackup.noFile')}
            </span>
            <Button variant="secondary" size="sm" onClick={() => void handleChoosePath()}>
              <FolderOpen size={14} /> {t('explorer.mysqlBackup.chooseFile')}
            </Button>
          </div>
          <div className="mysqlbk__toggle-row">
            <span>{t('explorer.mysqlBackup.compress')}</span>
            <Toggle
              id="mysqlbk-compress"
              label={t('explorer.mysqlBackup.compress')}
              checked={compress}
              onChange={setCompress}
            />
          </div>
        </section>

        {/* ─── Options ────────────────────────────────────────────── */}
        <section className="mysqlbk__section">
          <h3 className="mysqlbk__section-title">{t('explorer.mysqlBackup.options')}</h3>
          {(
            [
              ['addDropTable', addDropTable, setAddDropTable],
              ['singleTransaction', singleTransaction, setSingleTransaction],
              ['includeRoutines', includeRoutines, setIncludeRoutines],
              ['includeTriggers', includeTriggers, setIncludeTriggers],
              ['includeEvents', includeEvents, setIncludeEvents],
              ['extendedInsert', extendedInsert, setExtendedInsert],
              ['addCreateDatabase', addCreateDatabase, setAddCreateDatabase]
            ] as [string, boolean, (v: boolean) => void][]
          ).map(([key, value, setter]) => (
            <div key={key} className="mysqlbk__toggle-row">
              <span>{t(`explorer.mysqlBackup.opt.${key}`)}</span>
              <Toggle
                id={`mysqlbk-${key}`}
                label={t(`explorer.mysqlBackup.opt.${key}`)}
                checked={value}
                onChange={setter}
              />
            </div>
          ))}
          <div className="mysqlbk__field">
            <label className="mysqlbk__field-label" htmlFor="mysqlbk-charset">
              {t('explorer.mysqlBackup.charset')}
            </label>
            <input
              id="mysqlbk-charset"
              className="mysqlbk__input"
              type="text"
              value={charset}
              onChange={(e) => setCharset(e.target.value)}
              placeholder="utf8mb4"
            />
          </div>
        </section>

        {validationError && <span className="mysqlbk__error">{validationError}</span>}
        {serverError && <ErrorBox error={serverError} />}
        {successMessage && (
          <div className="mysqlbk__success">
            <Check size={15} /> {successMessage}
          </div>
        )}
        {previewCommand && (
          <pre className="mysqlbk__preview">
            <code>{previewCommand}</code>
          </pre>
        )}
      </div>
    </BaseDialog>
  )
}

export default BackupMySqlDatabaseDialog

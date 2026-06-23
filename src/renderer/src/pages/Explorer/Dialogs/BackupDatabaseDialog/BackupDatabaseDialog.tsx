import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DatabaseBackup, Plus, Trash2, Check } from 'lucide-react'
import BaseDialog from '../../../../components/BaseDialog/BaseDialog'
import ErrorBox from '../../../../components/ErrorBox/ErrorBox'
import Button from '../../../../components/Button/Button'
import ServerFileBrowserDialog from '../ServerFileBrowserDialog/ServerFileBrowserDialog'
import FilesAndFilegroupsDialog from './FilesAndFilegroupsDialog'
import type {
  BackupType,
  BackupOverwrite,
  BackupCompression,
  LogTailAction,
  BackupOptions
} from '../../../../../../preload/index.d'
import './BackupDatabaseDialog.css'

interface BackupDatabaseDialogProps {
  connectionId: string
  databaseName: string
  onClose: () => void
}

type ExpirationMode = 'none' | 'after-days' | 'on-date'

function BackupDatabaseDialog({
  connectionId,
  databaseName,
  onClose
}: BackupDatabaseDialogProps): React.JSX.Element {
  const { t } = useTranslation()

  const [backupType, setBackupType] = useState<BackupType>('full')
  const [component, setComponent] = useState<'database' | 'files'>('database')
  const [selectedFiles, setSelectedFiles] = useState<string[]>([])
  const [destinations, setDestinations] = useState<string[]>([])
  const [overwrite, setOverwrite] = useState<BackupOverwrite>('append')
  const [verify, setVerify] = useState(false)
  const [checksum, setChecksum] = useState(false)
  const [continueOnError, setContinueOnError] = useState(false)
  const [logTail, setLogTail] = useState<LogTailAction>('truncate')
  const [expirationMode, setExpirationMode] = useState<ExpirationMode>('none')
  const [afterDays, setAfterDays] = useState('0')
  const [onDate, setOnDate] = useState('')
  const [compression, setCompression] = useState<BackupCompression>('default')
  const [backupName, setBackupName] = useState('')

  const [showBrowser, setShowBrowser] = useState(false)
  const [showFilesDialog, setShowFilesDialog] = useState(false)
  const [previewSql, setPreviewSql] = useState<string | null>(null)

  const [validationError, setValidationError] = useState<string | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)
  const [errorSql, setErrorSql] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const isLog = backupType === 'log'

  function buildOptions(): BackupOptions {
    return {
      databaseName,
      backupType,
      filesAndFilegroups: component === 'files' ? selectedFiles : undefined,
      destinations,
      overwrite,
      verify,
      checksum,
      continueOnError,
      logTail: isLog ? logTail : undefined,
      expiration: {
        mode: expirationMode,
        afterDays: expirationMode === 'after-days' ? Number(afterDays) || 0 : undefined,
        onDate: expirationMode === 'on-date' ? onDate : undefined
      },
      compression,
      name: backupName.trim() || undefined
    }
  }

  function validate(): string | null {
    if (destinations.length === 0) return t('explorer.backup.validation.destinationRequired')
    if (component === 'files' && selectedFiles.length === 0) {
      return t('explorer.backup.validation.filesRequired')
    }
    if (expirationMode === 'on-date' && !onDate) {
      return t('explorer.backup.validation.expirationDateRequired')
    }
    return null
  }

  function clearMessages(): void {
    setValidationError(null)
    setServerError(null)
    setErrorSql(null)
    setSuccessMessage(null)
  }

  function addDestination(fullPath: string): void {
    setShowBrowser(false)
    setDestinations((prev) => (prev.includes(fullPath) ? prev : [...prev, fullPath]))
    if (validationError) setValidationError(null)
  }

  function removeDestination(path: string): void {
    setDestinations((prev) => prev.filter((p) => p !== path))
  }

  async function handlePreview(): Promise<void> {
    clearMessages()
    const error = validate()
    if (error) {
      setValidationError(error)
      return
    }
    const result = await window.api.database.buildBackupSql(connectionId, buildOptions())
    if (result.status === 'error') {
      setServerError(result.message)
      return
    }
    setPreviewSql((prev) => (prev === result.sql ? null : result.sql))
  }

  async function handleSubmit(): Promise<void> {
    clearMessages()
    const error = validate()
    if (error) {
      setValidationError(error)
      return
    }
    setIsSubmitting(true)
    try {
      const result = await window.api.database.executeBackup(connectionId, buildOptions())
      if (result.status === 'error') {
        setServerError(result.message)
        setErrorSql(result.sql ?? null)
        return
      }
      setSuccessMessage(
        t('explorer.backup.success', { seconds: (result.durationMs / 1000).toFixed(1) })
      )
    } catch (err) {
      setServerError(err instanceof Error ? err.message : t('explorer.backup.unknownError'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <BaseDialog
      title={t('explorer.backup.dialogTitle')}
      icon={<DatabaseBackup size={16} />}
      onClose={onClose}
      closeDisabled={isSubmitting}
      maxWidth="40rem"
      width="40rem"
      analyticsId="backup_database"
      footer={
        <div className="backup-dialog__footer">
          <Button variant="ghost" onClick={() => void handlePreview()} disabled={isSubmitting}>
            {previewSql ? t('explorer.backup.hideScript') : t('explorer.backup.previewScript')}
          </Button>
          <div className="backup-dialog__footer-right">
            <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
              {t('explorer.backup.cancel')}
            </Button>
            <Button variant="primary" onClick={() => void handleSubmit()} disabled={isSubmitting}>
              {isSubmitting ? t('explorer.backup.backingUp') : t('explorer.backup.backUp')}
            </Button>
          </div>
        </div>
      }
    >
      <div className="backup-dialog__body dialog__scroll-area">
        {/* ─── Source ─────────────────────────────────────────────── */}
        <section className="backup-dialog__section">
          <h3 className="backup-dialog__section-title">{t('explorer.backup.source')}</h3>
          <div className="backup-dialog__row">
            <span className="backup-dialog__label">{t('explorer.backup.databaseLabel')}</span>
            <span className="backup-dialog__value">{databaseName}</span>
          </div>
          <div className="backup-dialog__field">
            <label className="conn-dialog__label" htmlFor="backup-name">
              {t('explorer.backup.nameLabel')}
            </label>
            <input
              id="backup-name"
              className="conn-dialog__input"
              type="text"
              value={backupName}
              onChange={(e) => setBackupName(e.target.value)}
              placeholder={t('explorer.backup.namePlaceholder')}
            />
          </div>
          <div className="backup-dialog__field">
            <label className="conn-dialog__label" htmlFor="backup-type">
              {t('explorer.backup.backupType')}
            </label>
            <select
              id="backup-type"
              className="conn-dialog__select"
              value={backupType}
              onChange={(e) => setBackupType(e.target.value as BackupType)}
            >
              <option value="full">{t('explorer.backup.types.full')}</option>
              <option value="differential">{t('explorer.backup.types.differential')}</option>
              <option value="log">{t('explorer.backup.types.log')}</option>
            </select>
          </div>
          <div className="backup-dialog__field">
            <span className="conn-dialog__label">{t('explorer.backup.backupComponent')}</span>
            <div className="backup-dialog__radio-group">
              <label className="backup-dialog__radio">
                <input
                  type="radio"
                  name="backup-component"
                  checked={component === 'database'}
                  onChange={() => setComponent('database')}
                  disabled={isLog}
                />
                {t('explorer.backup.componentDatabase')}
              </label>
              <label className="backup-dialog__radio">
                <input
                  type="radio"
                  name="backup-component"
                  checked={component === 'files'}
                  onChange={() => {
                    setComponent('files')
                    setShowFilesDialog(true)
                  }}
                  disabled={isLog}
                />
                {t('explorer.backup.componentFiles')}
              </label>
              {component === 'files' && (
                <button
                  type="button"
                  className="backup-dialog__link"
                  onClick={() => setShowFilesDialog(true)}
                >
                  {selectedFiles.length > 0
                    ? t('explorer.backup.filesSelected', { count: selectedFiles.length })
                    : t('explorer.backup.chooseFiles')}
                </button>
              )}
            </div>
          </div>
        </section>

        {/* ─── Destination ────────────────────────────────────────── */}
        <section className="backup-dialog__section">
          <h3 className="backup-dialog__section-title">{t('explorer.backup.destination')}</h3>
          <div className="backup-dialog__dest-list">
            {destinations.length === 0 && (
              <div className="backup-dialog__muted">{t('explorer.backup.noDestinations')}</div>
            )}
            {destinations.map((path) => (
              <div key={path} className="backup-dialog__dest-row">
                <span className="backup-dialog__dest-path" title={path}>
                  {path}
                </span>
                <button
                  type="button"
                  className="backup-dialog__icon-btn"
                  onClick={() => removeDestination(path)}
                  aria-label={t('explorer.backup.removeDestination')}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
          <Button variant="secondary" size="sm" onClick={() => setShowBrowser(true)}>
            <Plus size={14} /> {t('explorer.backup.addDestination')}
          </Button>
        </section>

        {/* ─── Media / Overwrite ──────────────────────────────────── */}
        <section className="backup-dialog__section">
          <h3 className="backup-dialog__section-title">{t('explorer.backup.media')}</h3>
          <div className="backup-dialog__radio-group backup-dialog__radio-group--col">
            <label className="backup-dialog__radio">
              <input
                type="radio"
                name="backup-overwrite"
                checked={overwrite === 'append'}
                onChange={() => setOverwrite('append')}
              />
              {t('explorer.backup.appendExisting')}
            </label>
            <label className="backup-dialog__radio">
              <input
                type="radio"
                name="backup-overwrite"
                checked={overwrite === 'overwrite'}
                onChange={() => setOverwrite('overwrite')}
              />
              {t('explorer.backup.overwriteExisting')}
            </label>
          </div>
        </section>

        {/* ─── Reliability ────────────────────────────────────────── */}
        <section className="backup-dialog__section">
          <h3 className="backup-dialog__section-title">{t('explorer.backup.reliability')}</h3>
          <label className="conn-dialog__checkbox-row">
            <input
              type="checkbox"
              className="conn-dialog__checkbox"
              checked={verify}
              onChange={(e) => setVerify(e.target.checked)}
            />
            <span className="conn-dialog__checkbox-label">{t('explorer.backup.verify')}</span>
          </label>
          <label className="conn-dialog__checkbox-row">
            <input
              type="checkbox"
              className="conn-dialog__checkbox"
              checked={checksum}
              onChange={(e) => setChecksum(e.target.checked)}
            />
            <span className="conn-dialog__checkbox-label">{t('explorer.backup.checksum')}</span>
          </label>
          <label className="conn-dialog__checkbox-row">
            <input
              type="checkbox"
              className="conn-dialog__checkbox"
              checked={continueOnError}
              onChange={(e) => setContinueOnError(e.target.checked)}
            />
            <span className="conn-dialog__checkbox-label">
              {t('explorer.backup.continueOnError')}
            </span>
          </label>
        </section>

        {/* ─── Transaction log ────────────────────────────────────── */}
        {isLog && (
          <section className="backup-dialog__section">
            <h3 className="backup-dialog__section-title">{t('explorer.backup.transactionLog')}</h3>
            <div className="backup-dialog__radio-group backup-dialog__radio-group--col">
              <label className="backup-dialog__radio">
                <input
                  type="radio"
                  name="backup-logtail"
                  checked={logTail === 'truncate'}
                  onChange={() => setLogTail('truncate')}
                />
                {t('explorer.backup.truncateLog')}
              </label>
              <label className="backup-dialog__radio">
                <input
                  type="radio"
                  name="backup-logtail"
                  checked={logTail === 'tail-norecovery'}
                  onChange={() => setLogTail('tail-norecovery')}
                />
                {t('explorer.backup.tailLog')}
              </label>
            </div>
          </section>
        )}

        {/* ─── Expiration ─────────────────────────────────────────── */}
        <section className="backup-dialog__section">
          <h3 className="backup-dialog__section-title">{t('explorer.backup.expiration')}</h3>
          <div className="backup-dialog__radio-group backup-dialog__radio-group--col">
            <label className="backup-dialog__radio">
              <input
                type="radio"
                name="backup-expiration"
                checked={expirationMode === 'none'}
                onChange={() => setExpirationMode('none')}
              />
              {t('explorer.backup.expirationNone')}
            </label>
            <label className="backup-dialog__radio">
              <input
                type="radio"
                name="backup-expiration"
                checked={expirationMode === 'after-days'}
                onChange={() => setExpirationMode('after-days')}
              />
              {t('explorer.backup.expirationAfter')}
              <input
                type="number"
                min="0"
                className="conn-dialog__input backup-dialog__inline-input"
                value={afterDays}
                onChange={(e) => setAfterDays(e.target.value)}
                onFocus={() => setExpirationMode('after-days')}
              />
              {t('explorer.backup.days')}
            </label>
            <label className="backup-dialog__radio">
              <input
                type="radio"
                name="backup-expiration"
                checked={expirationMode === 'on-date'}
                onChange={() => setExpirationMode('on-date')}
              />
              {t('explorer.backup.expirationOn')}
              <input
                type="date"
                className="conn-dialog__input backup-dialog__inline-input"
                value={onDate}
                onChange={(e) => setOnDate(e.target.value)}
                onFocus={() => setExpirationMode('on-date')}
              />
            </label>
          </div>
        </section>

        {/* ─── Compression ────────────────────────────────────────── */}
        <section className="backup-dialog__section">
          <h3 className="backup-dialog__section-title">{t('explorer.backup.compression')}</h3>
          <select
            className="conn-dialog__select"
            value={compression}
            onChange={(e) => setCompression(e.target.value as BackupCompression)}
          >
            <option value="default">{t('explorer.backup.compressionDefault')}</option>
            <option value="compress">{t('explorer.backup.compressionCompress')}</option>
            <option value="no-compress">{t('explorer.backup.compressionNone')}</option>
          </select>
        </section>

        {validationError && <span className="conn-dialog__error">{validationError}</span>}
        {serverError && <ErrorBox error={serverError} statement={errorSql ?? undefined} />}
        {successMessage && (
          <div className="backup-dialog__success">
            <Check size={15} /> {successMessage}
          </div>
        )}
        {previewSql && (
          <pre className="backup-dialog__preview">
            <code>{previewSql}</code>
          </pre>
        )}
      </div>

      {showBrowser && (
        <ServerFileBrowserDialog
          connectionId={connectionId}
          mode="save"
          defaultFileName={`${databaseName}.bak`}
          onSelect={addDestination}
          onClose={() => setShowBrowser(false)}
          zIndex={200}
        />
      )}
      {showFilesDialog && (
        <FilesAndFilegroupsDialog
          connectionId={connectionId}
          databaseName={databaseName}
          initialSelected={selectedFiles}
          onConfirm={(files) => {
            setSelectedFiles(files)
            setShowFilesDialog(false)
          }}
          onClose={() => setShowFilesDialog(false)}
          zIndex={200}
        />
      )}
    </BaseDialog>
  )
}

export default BackupDatabaseDialog

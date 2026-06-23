import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DatabaseBackup, FolderOpen, Check } from 'lucide-react'
import BaseDialog from '../../../../components/BaseDialog/BaseDialog'
import ErrorBox from '../../../../components/ErrorBox/ErrorBox'
import Button from '../../../../components/Button/Button'
import Toggle from '../../../../components/Toggle/Toggle'
import type { RedisBackupOptions, RedisBackupScope } from '../../../../../../preload/index.d'
import './BackupRedisDatabaseDialog.css'

interface BackupRedisDatabaseDialogProps {
  connectionId: string
  scope: RedisBackupScope
  onClose: () => void
}

function BackupRedisDatabaseDialog({
  connectionId,
  scope,
  onClose
}: BackupRedisDatabaseDialogProps): React.JSX.Element {
  const { t } = useTranslation()

  const [compress, setCompress] = useState(false)
  const [filePath, setFilePath] = useState('')

  const [validationError, setValidationError] = useState<string | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const scopeLabel =
    scope.kind === 'database'
      ? t('explorer.redisBackup.scopeDatabase', { index: scope.databaseIndex })
      : t('explorer.redisBackup.scopeAll')

  function buildTimestamp(): string {
    const now = new Date()
    const pad = (n: number): string => String(n).padStart(2, '0')
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`
  }

  const defaultBaseName = `${scope.kind === 'database' ? `redis-db${scope.databaseIndex}` : 'redis-all'}_${buildTimestamp()}`

  function buildOptions(): RedisBackupOptions {
    return { filePath, scope, compress }
  }

  function handleCompressToggle(next: boolean): void {
    setCompress(next)
    setFilePath((prev) => {
      if (!prev) return prev
      if (next) {
        return prev.toLowerCase().endsWith('.gz') ? prev : `${prev}.gz`
      }
      return prev.toLowerCase().endsWith('.gz') ? prev.slice(0, -3) : prev
    })
  }

  async function handleChoosePath(): Promise<void> {
    const result = await window.api.database.redisPickBackupPath({
      defaultFileName: `${defaultBaseName}.json${compress ? '.gz' : ''}`,
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
      setValidationError(t('explorer.redisBackup.validation.fileRequired'))
      return
    }
    setIsSubmitting(true)
    try {
      const result = await window.api.database.redisExecuteBackup(connectionId, buildOptions())
      if (result.status === 'error') {
        setServerError(result.message)
        return
      }
      setSuccessMessage(
        t('explorer.redisBackup.success', {
          seconds: (result.durationMs / 1000).toFixed(1),
          keys: result.keyCount,
          databases: result.databaseCount,
          size: (result.bytes / 1024).toFixed(1)
        })
      )
    } catch (err) {
      setServerError(err instanceof Error ? err.message : t('explorer.redisBackup.unknownError'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <BaseDialog
      title={
        scope.kind === 'all'
          ? t('explorer.redisBackup.dialogTitleAll')
          : t('explorer.redisBackup.dialogTitle')
      }
      icon={<DatabaseBackup size={16} />}
      onClose={onClose}
      closeDisabled={isSubmitting}
      maxWidth="34rem"
      width="34rem"
      analyticsId="redis_backup_database"
      footer={
        <div className="redisbk__footer">
          <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
            {t('explorer.redisBackup.cancel')}
          </Button>
          <Button variant="primary" onClick={() => void handleSubmit()} disabled={isSubmitting}>
            {isSubmitting ? t('explorer.redisBackup.backingUp') : t('explorer.redisBackup.backUp')}
          </Button>
        </div>
      }
    >
      <div className="redisbk__body dialog__scroll-area">
        {/* ─── Source ─────────────────────────────────────────────── */}
        <section className="redisbk__section">
          <h3 className="redisbk__section-title">{t('explorer.redisBackup.scope')}</h3>
          <div className="redisbk__row">
            <span className="redisbk__label">{t('explorer.redisBackup.scope')}</span>
            <span className="redisbk__value">{scopeLabel}</span>
          </div>
        </section>

        {/* ─── Destination ────────────────────────────────────────── */}
        <section className="redisbk__section">
          <h3 className="redisbk__section-title">{t('explorer.redisBackup.destination')}</h3>
          <div className="redisbk__file-row">
            <span
              className={`redisbk__file-path ${filePath ? '' : 'redisbk__file-path--empty'}`}
              title={filePath}
            >
              {filePath || t('explorer.redisBackup.noFile')}
            </span>
            <Button variant="secondary" size="sm" onClick={() => void handleChoosePath()}>
              <FolderOpen size={14} /> {t('explorer.redisBackup.chooseFile')}
            </Button>
          </div>
          <div className="redisbk__toggle-row">
            <span>{t('explorer.redisBackup.compress')}</span>
            <Toggle
              id="redisbk-compress"
              label={t('explorer.redisBackup.compress')}
              checked={compress}
              onChange={handleCompressToggle}
            />
          </div>
        </section>

        {validationError && <span className="redisbk__error">{validationError}</span>}
        {serverError && <ErrorBox error={serverError} />}
        {successMessage && (
          <div className="redisbk__success">
            <Check size={15} /> {successMessage}
          </div>
        )}
      </div>
    </BaseDialog>
  )
}

export default BackupRedisDatabaseDialog

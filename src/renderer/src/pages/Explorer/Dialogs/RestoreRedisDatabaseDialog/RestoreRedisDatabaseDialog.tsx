import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Upload, FolderOpen, Check } from 'lucide-react'
import BaseDialog from '../../../../components/BaseDialog/BaseDialog'
import ErrorBox from '../../../../components/ErrorBox/ErrorBox'
import Button from '../../../../components/Button/Button'
import type {
  RedisBackupScope,
  RedisRestoreConflict,
  RedisRestoreOptions
} from '../../../../../../preload/index.d'
import './RestoreRedisDatabaseDialog.css'

interface RestoreRedisDatabaseDialogProps {
  connectionId: string
  scope: RedisBackupScope
  onClose: () => void
}

function RestoreRedisDatabaseDialog({
  connectionId,
  scope,
  onClose
}: RestoreRedisDatabaseDialogProps): React.JSX.Element {
  const { t } = useTranslation()

  const isSingleDb = scope.kind === 'database'

  const [filePath, setFilePath] = useState('')
  const [conflict, setConflict] = useState<RedisRestoreConflict>('replace')
  const [targetIndex, setTargetIndex] = useState(isSingleDb ? String(scope.databaseIndex) : '0')

  const [validationError, setValidationError] = useState<string | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  function buildOptions(): RedisRestoreOptions {
    const parsed = parseInt(targetIndex, 10)
    return {
      filePath,
      conflict,
      targetDatabaseIndex: isSingleDb && !isNaN(parsed) ? parsed : undefined
    }
  }

  async function handleChooseFile(): Promise<void> {
    const result = await window.api.database.redisPickRestoreFile()
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
      setValidationError(t('explorer.redisRestore.validation.fileRequired'))
      return
    }
    if (isSingleDb) {
      const parsed = parseInt(targetIndex, 10)
      if (isNaN(parsed) || parsed < 0) {
        setValidationError(t('explorer.redisRestore.validation.targetRequired'))
        return
      }
    }
    setIsSubmitting(true)
    try {
      const result = await window.api.database.redisExecuteRestore(connectionId, buildOptions())
      if (result.status === 'error') {
        setServerError(result.message)
        return
      }
      setSuccessMessage(
        t('explorer.redisRestore.success', {
          seconds: (result.durationMs / 1000).toFixed(1),
          restored: result.keysRestored,
          skipped: result.keysSkipped,
          databases: result.databaseCount
        })
      )
    } catch (err) {
      setServerError(err instanceof Error ? err.message : t('explorer.redisRestore.unknownError'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <BaseDialog
      title={
        scope.kind === 'all'
          ? t('explorer.redisRestore.dialogTitleAll')
          : t('explorer.redisRestore.dialogTitle')
      }
      icon={<Upload size={16} />}
      onClose={onClose}
      closeDisabled={isSubmitting}
      maxWidth="34rem"
      width="34rem"
      analyticsId="redis_restore_database"
      footer={
        <div className="redisrs__footer">
          <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
            {t('explorer.redisRestore.cancel')}
          </Button>
          <Button variant="primary" onClick={() => void handleSubmit()} disabled={isSubmitting}>
            {isSubmitting
              ? t('explorer.redisRestore.restoring')
              : t('explorer.redisRestore.restore')}
          </Button>
        </div>
      }
    >
      <div className="redisrs__body dialog__scroll-area">
        {/* ─── Source ─────────────────────────────────────────────── */}
        <section className="redisrs__section">
          <h3 className="redisrs__section-title">{t('explorer.redisRestore.source')}</h3>
          <div className="redisrs__file-row">
            <span
              className={`redisrs__file-path ${filePath ? '' : 'redisrs__file-path--empty'}`}
              title={filePath}
            >
              {filePath || t('explorer.redisRestore.noFile')}
            </span>
            <Button variant="secondary" size="sm" onClick={() => void handleChooseFile()}>
              <FolderOpen size={14} /> {t('explorer.redisRestore.chooseFile')}
            </Button>
          </div>
        </section>

        {/* ─── Target ─────────────────────────────────────────────── */}
        <section className="redisrs__section">
          <h3 className="redisrs__section-title">{t('explorer.redisRestore.target')}</h3>
          {isSingleDb && (
            <div className="redisrs__field">
              <label className="redisrs__field-label" htmlFor="redisrs-target">
                {t('explorer.redisRestore.targetDatabaseIndex')}
              </label>
              <input
                id="redisrs-target"
                className="redisrs__input"
                type="number"
                min={0}
                value={targetIndex}
                onChange={(e) => setTargetIndex(e.target.value)}
              />
            </div>
          )}
          <div className="redisrs__field">
            <label className="redisrs__field-label" htmlFor="redisrs-conflict">
              {t('explorer.redisRestore.conflict')}
            </label>
            <select
              id="redisrs-conflict"
              className="redisrs__select"
              value={conflict}
              onChange={(e) => setConflict(e.target.value as RedisRestoreConflict)}
            >
              <option value="replace">{t('explorer.redisRestore.conflictReplace')}</option>
              <option value="flush">{t('explorer.redisRestore.conflictFlush')}</option>
              <option value="skip">{t('explorer.redisRestore.conflictSkip')}</option>
            </select>
          </div>
        </section>

        {validationError && <span className="redisrs__error">{validationError}</span>}
        {serverError && <ErrorBox error={serverError} />}
        {successMessage && (
          <div className="redisrs__success">
            <Check size={15} /> {successMessage}
          </div>
        )}
      </div>
    </BaseDialog>
  )
}

export default RestoreRedisDatabaseDialog

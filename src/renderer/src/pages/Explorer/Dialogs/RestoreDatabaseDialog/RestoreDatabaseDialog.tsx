import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DatabaseBackup, Plus, Check, RefreshCw } from 'lucide-react'
import BaseDialog from '../../../../components/BaseDialog/BaseDialog'
import ErrorBox from '../../../../components/ErrorBox/ErrorBox'
import Button from '../../../../components/Button/Button'
import ServerFileBrowserDialog from '../ServerFileBrowserDialog/ServerFileBrowserDialog'
import type {
  BackupType,
  RestoreRecoveryState,
  RestoreMoveEntry,
  RestoreOptions
} from '../../../../../../preload/index.d'
import './RestoreDatabaseDialog.css'

interface RestoreDatabaseDialogProps {
  connectionId: string
  databaseName: string
  onClose: () => void
}

interface RestorePlanRow {
  id: string
  path: string
  position: number
  backupType: BackupType
  name: string | null
  databaseName: string | null
  date: string | null
  selected: boolean
}

const TYPE_RANK: Record<BackupType, number> = { full: 0, differential: 1, log: 2 }

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString()
}

function RestoreDatabaseDialog({
  connectionId,
  databaseName,
  onClose
}: RestoreDatabaseDialogProps): React.JSX.Element {
  const { t } = useTranslation()

  const [sourceMode, setSourceMode] = useState<'database' | 'device'>('database')
  const [sourceDb] = useState(databaseName)
  const [rows, setRows] = useState<RestorePlanRow[]>([])
  const [showBrowser, setShowBrowser] = useState(false)
  const [loadingPlan, setLoadingPlan] = useState(false)

  const [targetDb, setTargetDb] = useState(databaseName)
  const [replace, setReplace] = useState(false)
  const [takeTailLog, setTakeTailLog] = useState(false)
  const [restrictedUser, setRestrictedUser] = useState(false)
  const [recoveryState, setRecoveryState] = useState<RestoreRecoveryState>('recovery')
  const [moveEntries, setMoveEntries] = useState<RestoreMoveEntry[]>([])

  const [previewSql, setPreviewSql] = useState<string | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)
  const [errorSql, setErrorSql] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const loadFromHistory = useCallback(async (): Promise<void> => {
    setLoadingPlan(true)
    setServerError(null)
    const result = await window.api.database.getBackupSets(connectionId, sourceDb)
    setLoadingPlan(false)
    if (result.status === 'error') {
      setServerError(result.message)
      return
    }
    const planRows: RestorePlanRow[] = result.history.map((h, i) => ({
      id: `${h.physicalDevice}#${h.position}#${i}`,
      path: h.physicalDevice,
      position: h.position,
      backupType: h.backupType,
      name: null,
      databaseName: h.databaseName,
      date: h.backupFinishDate,
      selected: true
    }))
    setRows(planRows)
  }, [connectionId, sourceDb])

  useEffect(() => {
    if (sourceMode === 'database') void loadFromHistory()
    else setRows([])
  }, [sourceMode, loadFromHistory])

  async function addDeviceFile(path: string): Promise<void> {
    setShowBrowser(false)
    setServerError(null)
    const result = await window.api.database.readBackupHeader(connectionId, path)
    if (result.status === 'error') {
      setServerError(result.message)
      return
    }
    const newRows: RestorePlanRow[] = result.backupSets.map((s, i) => ({
      id: `${path}#${s.position}#${i}`,
      path,
      position: s.position,
      backupType: s.backupType,
      name: s.name,
      databaseName: s.databaseName,
      date: s.backupFinishDate,
      selected: true
    }))
    setRows((prev) => [...prev, ...newRows])
  }

  function toggleRow(id: string): void {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, selected: !r.selected } : r)))
  }

  function getSelectedSorted(): RestorePlanRow[] {
    return rows
      .filter((r) => r.selected)
      .slice()
      .sort((a, b) => {
        if (TYPE_RANK[a.backupType] !== TYPE_RANK[b.backupType]) {
          return TYPE_RANK[a.backupType] - TYPE_RANK[b.backupType]
        }
        return (a.date ?? '').localeCompare(b.date ?? '')
      })
  }

  async function loadMoveFiles(): Promise<void> {
    const selected = getSelectedSorted()
    const first = selected.find((r) => r.backupType === 'full') ?? selected[0]
    if (!first) {
      setValidationError(t('explorer.restore.validation.sourceRequired'))
      return
    }
    setValidationError(null)
    const result = await window.api.database.readBackupFileList(
      connectionId,
      first.path,
      first.position
    )
    if (result.status === 'error') {
      setServerError(result.message)
      return
    }
    setMoveEntries(
      result.files.map((f) => ({ logicalName: f.logicalName, targetPath: f.physicalName }))
    )
  }

  function updateMoveTarget(logicalName: string, targetPath: string): void {
    setMoveEntries((prev) =>
      prev.map((m) => (m.logicalName === logicalName ? { ...m, targetPath } : m))
    )
  }

  function buildOptions(): RestoreOptions {
    return {
      targetDatabaseName: targetDb.trim(),
      source: getSelectedSorted().map((r) => ({
        path: r.path,
        position: r.position,
        backupType: r.backupType
      })),
      replace,
      takeTailLogBackup: takeTailLog,
      restrictedUser,
      recoveryState,
      move: moveEntries.filter((m) => m.targetPath.trim())
    }
  }

  function validate(): string | null {
    if (!targetDb.trim()) return t('explorer.restore.validation.targetRequired')
    if (getSelectedSorted().length === 0) return t('explorer.restore.validation.sourceRequired')
    return null
  }

  function clearMessages(): void {
    setValidationError(null)
    setServerError(null)
    setErrorSql(null)
    setSuccessMessage(null)
  }

  async function handlePreview(): Promise<void> {
    clearMessages()
    const error = validate()
    if (error) {
      setValidationError(error)
      return
    }
    const result = await window.api.database.buildRestoreSql(connectionId, buildOptions())
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
      const result = await window.api.database.executeRestore(connectionId, buildOptions())
      if (result.status === 'error') {
        setServerError(result.message)
        setErrorSql(result.sql ?? null)
        return
      }
      setSuccessMessage(
        t('explorer.restore.success', { seconds: (result.durationMs / 1000).toFixed(1) })
      )
    } catch (err) {
      setServerError(err instanceof Error ? err.message : t('explorer.restore.unknownError'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <BaseDialog
      title={t('explorer.restore.dialogTitle')}
      icon={<DatabaseBackup size={16} />}
      onClose={onClose}
      closeDisabled={isSubmitting}
      maxWidth="48rem"
      width="48rem"
      analyticsId="restore_database"
      footer={
        <div className="restore-dialog__footer">
          <Button variant="ghost" onClick={() => void handlePreview()} disabled={isSubmitting}>
            {previewSql ? t('explorer.restore.hideScript') : t('explorer.restore.previewScript')}
          </Button>
          <div className="restore-dialog__footer-right">
            <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
              {t('explorer.restore.cancel')}
            </Button>
            <Button variant="primary" onClick={() => void handleSubmit()} disabled={isSubmitting}>
              {isSubmitting ? t('explorer.restore.restoring') : t('explorer.restore.restore')}
            </Button>
          </div>
        </div>
      }
    >
      <div className="restore-dialog__body dialog__scroll-area">
        {/* ─── Source ─────────────────────────────────────────────── */}
        <section className="restore-dialog__section">
          <h3 className="restore-dialog__section-title">{t('explorer.restore.source')}</h3>
          <div className="restore-dialog__radio-group">
            <label className="restore-dialog__radio">
              <input
                type="radio"
                name="restore-source"
                checked={sourceMode === 'database'}
                onChange={() => setSourceMode('database')}
              />
              {t('explorer.restore.sourceDatabase')}
            </label>
            <label className="restore-dialog__radio">
              <input
                type="radio"
                name="restore-source"
                checked={sourceMode === 'device'}
                onChange={() => setSourceMode('device')}
              />
              {t('explorer.restore.sourceDevice')}
            </label>
            {sourceMode === 'database' ? (
              <span className="restore-dialog__source-db">{sourceDb}</span>
            ) : (
              <Button variant="secondary" size="sm" onClick={() => setShowBrowser(true)}>
                <Plus size={14} /> {t('explorer.restore.addDevice')}
              </Button>
            )}
          </div>
        </section>

        {/* ─── Restore plan ───────────────────────────────────────── */}
        <section className="restore-dialog__section">
          <div className="restore-dialog__section-head">
            <h3 className="restore-dialog__section-title">{t('explorer.restore.restorePlan')}</h3>
            {sourceMode === 'database' && (
              <button
                type="button"
                className="restore-dialog__icon-btn"
                onClick={() => void loadFromHistory()}
                aria-label={t('explorer.restore.refresh')}
              >
                <RefreshCw size={14} />
              </button>
            )}
          </div>
          <div className="restore-dialog__plan">
            <table className="restore-dialog__table">
              <thead>
                <tr>
                  <th />
                  <th>{t('explorer.restore.colType')}</th>
                  <th>{t('explorer.restore.colDatabase')}</th>
                  <th>{t('explorer.restore.colDate')}</th>
                  <th>{t('explorer.restore.colPosition')}</th>
                  <th>{t('explorer.restore.colFile')}</th>
                </tr>
              </thead>
              <tbody>
                {loadingPlan && (
                  <tr>
                    <td colSpan={6} className="restore-dialog__muted">
                      {t('explorer.restore.loading')}
                    </td>
                  </tr>
                )}
                {!loadingPlan && rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="restore-dialog__muted">
                      {t('explorer.restore.noBackupSets')}
                    </td>
                  </tr>
                )}
                {!loadingPlan &&
                  rows.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={row.selected}
                          onChange={() => toggleRow(row.id)}
                        />
                      </td>
                      <td>{t(`explorer.backup.types.${row.backupType}`)}</td>
                      <td>{row.databaseName ?? '—'}</td>
                      <td>{formatDate(row.date)}</td>
                      <td>{row.position}</td>
                      <td className="restore-dialog__path" title={row.path}>
                        {row.path}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ─── Destination ────────────────────────────────────────── */}
        <section className="restore-dialog__section">
          <h3 className="restore-dialog__section-title">{t('explorer.restore.destination')}</h3>
          <div className="restore-dialog__field">
            <label className="conn-dialog__label" htmlFor="restore-target-db">
              {t('explorer.restore.targetDatabase')}
            </label>
            <input
              id="restore-target-db"
              className="conn-dialog__input"
              type="text"
              value={targetDb}
              onChange={(e) => {
                setTargetDb(e.target.value)
                if (validationError) setValidationError(null)
              }}
            />
          </div>
        </section>

        {/* ─── Options ────────────────────────────────────────────── */}
        <section className="restore-dialog__section">
          <h3 className="restore-dialog__section-title">{t('explorer.restore.options')}</h3>
          <label className="conn-dialog__checkbox-row">
            <input
              type="checkbox"
              className="conn-dialog__checkbox"
              checked={replace}
              onChange={(e) => setReplace(e.target.checked)}
            />
            <span className="conn-dialog__checkbox-label">{t('explorer.restore.replace')}</span>
          </label>
          <label className="conn-dialog__checkbox-row">
            <input
              type="checkbox"
              className="conn-dialog__checkbox"
              checked={takeTailLog}
              onChange={(e) => setTakeTailLog(e.target.checked)}
            />
            <span className="conn-dialog__checkbox-label">{t('explorer.restore.takeTailLog')}</span>
          </label>
          <label className="conn-dialog__checkbox-row">
            <input
              type="checkbox"
              className="conn-dialog__checkbox"
              checked={restrictedUser}
              onChange={(e) => setRestrictedUser(e.target.checked)}
            />
            <span className="conn-dialog__checkbox-label">
              {t('explorer.restore.restrictedUser')}
            </span>
          </label>
          <div className="restore-dialog__field">
            <label className="conn-dialog__label" htmlFor="restore-recovery">
              {t('explorer.restore.recoveryState')}
            </label>
            <select
              id="restore-recovery"
              className="conn-dialog__select"
              value={recoveryState}
              onChange={(e) => setRecoveryState(e.target.value as RestoreRecoveryState)}
            >
              <option value="recovery">{t('explorer.restore.recovery')}</option>
              <option value="norecovery">{t('explorer.restore.norecovery')}</option>
              <option value="standby">{t('explorer.restore.standby')}</option>
            </select>
          </div>
        </section>

        {/* ─── Relocate files (MOVE) ──────────────────────────────── */}
        <section className="restore-dialog__section">
          <div className="restore-dialog__section-head">
            <h3 className="restore-dialog__section-title">{t('explorer.restore.relocate')}</h3>
            <Button variant="secondary" size="sm" onClick={() => void loadMoveFiles()}>
              {t('explorer.restore.loadFileList')}
            </Button>
          </div>
          {moveEntries.length === 0 && (
            <div className="restore-dialog__muted">{t('explorer.restore.noMoveFiles')}</div>
          )}
          {moveEntries.map((m) => (
            <div key={m.logicalName} className="restore-dialog__move-row">
              <span className="restore-dialog__move-logical" title={m.logicalName}>
                {m.logicalName}
              </span>
              <input
                className="conn-dialog__input"
                type="text"
                value={m.targetPath}
                onChange={(e) => updateMoveTarget(m.logicalName, e.target.value)}
              />
            </div>
          ))}
        </section>

        {validationError && <span className="conn-dialog__error">{validationError}</span>}
        {serverError && <ErrorBox error={serverError} statement={errorSql ?? undefined} />}
        {successMessage && (
          <div className="restore-dialog__success">
            <Check size={15} /> {successMessage}
          </div>
        )}
        {previewSql && (
          <pre className="restore-dialog__preview">
            <code>{previewSql}</code>
          </pre>
        )}
      </div>

      {showBrowser && (
        <ServerFileBrowserDialog
          connectionId={connectionId}
          mode="open"
          onSelect={(path) => void addDeviceFile(path)}
          onClose={() => setShowBrowser(false)}
          zIndex={200}
        />
      )}
    </BaseDialog>
  )
}

export default RestoreDatabaseDialog

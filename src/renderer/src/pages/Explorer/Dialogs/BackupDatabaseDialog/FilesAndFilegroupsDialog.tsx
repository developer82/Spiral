import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Files } from 'lucide-react'
import BaseDialog from '../../../../components/BaseDialog/BaseDialog'
import ErrorBox from '../../../../components/ErrorBox/ErrorBox'
import Button from '../../../../components/Button/Button'
import type { DatabaseFileEntry } from '../../../../../../preload/index.d'

interface FilesAndFilegroupsDialogProps {
  connectionId: string
  databaseName: string
  initialSelected: string[]
  onConfirm: (selected: string[]) => void
  onClose: () => void
  zIndex?: number
}

function FilesAndFilegroupsDialog({
  connectionId,
  databaseName,
  initialSelected,
  onConfirm,
  onClose,
  zIndex
}: FilesAndFilegroupsDialogProps): React.JSX.Element {
  const { t } = useTranslation()
  const [files, setFiles] = useState<DatabaseFileEntry[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSelected))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load(): Promise<void> {
      setLoading(true)
      const result = await window.api.database.getDatabaseFiles(connectionId, databaseName)
      if (cancelled) return
      setLoading(false)
      if (result.status === 'error') {
        setError(result.message)
        return
      }
      setFiles(result.files)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [connectionId, databaseName])

  function toggle(logicalName: string): void {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(logicalName)) next.delete(logicalName)
      else next.add(logicalName)
      return next
    })
  }

  return (
    <BaseDialog
      title={t('explorer.backup.filesAndFilegroups.title')}
      icon={<Files size={16} />}
      onClose={onClose}
      maxWidth="32rem"
      width="32rem"
      zIndex={zIndex}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('explorer.backup.filesAndFilegroups.cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={() => onConfirm(Array.from(selected))}
            disabled={selected.size === 0}
          >
            {t('explorer.backup.filesAndFilegroups.confirm')}
          </Button>
        </>
      }
    >
      <div className="backup-dialog__files">
        {loading && <div className="backup-dialog__muted">{t('explorer.backup.loading')}</div>}
        {!loading && error && <ErrorBox error={error} />}
        {!loading && !error && files.length === 0 && (
          <div className="backup-dialog__muted">
            {t('explorer.backup.filesAndFilegroups.empty')}
          </div>
        )}
        {!loading &&
          !error &&
          files.map((file) => (
            <label key={file.logicalName} className="conn-dialog__checkbox-row">
              <input
                type="checkbox"
                className="conn-dialog__checkbox"
                checked={selected.has(file.logicalName)}
                onChange={() => toggle(file.logicalName)}
              />
              <span className="conn-dialog__checkbox-label">
                {file.logicalName}
                <span className="backup-dialog__file-meta">
                  {' '}
                  (
                  {file.type === 'log'
                    ? t('explorer.backup.filesAndFilegroups.log')
                    : (file.fileGroup ?? t('explorer.backup.filesAndFilegroups.data'))}
                  )
                </span>
              </span>
            </label>
          ))}
      </div>
    </BaseDialog>
  )
}

export default FilesAndFilegroupsDialog

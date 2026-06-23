import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import BaseDialog from '../BaseDialog/BaseDialog'
import Button from '../Button/Button'
import './ReleaseNotesDialog.css'

interface ReleaseNote {
  version: string
  body: string
  publishedAt: string
}

interface ReleaseNotesDialogProps {
  fromVersion?: string
  onClose: () => void
}

export default function ReleaseNotesDialog({
  fromVersion,
  onClose
}: ReleaseNotesDialogProps): React.JSX.Element {
  const { t } = useTranslation()
  const [notes, setNotes] = useState<ReleaseNote[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    window.api.updater.getReleaseNotes(fromVersion).then((result) => {
      if (cancelled) return
      if (result.status === 'ok') {
        setNotes(result.notes)
      } else {
        setError(result.message)
      }
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [fromVersion])

  function formatDate(iso: string): string {
    try {
      return new Date(iso).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })
    } catch {
      return iso
    }
  }

  return (
    <BaseDialog
      analyticsId="release_notes"
      title={t('update.releaseNotesTitle')}
      onClose={onClose}
      maxWidth="44rem"
      zIndex={150}
      footer={
        <Button variant="ghost" onClick={onClose}>
          {t('update.close')}
        </Button>
      }
    >
      <div className="release-notes-dialog__body">
        {loading && (
          <p className="release-notes-dialog__status">{t('update.loadingNotes')}</p>
        )}
        {!loading && error && (
          <p className="release-notes-dialog__status release-notes-dialog__status--error">
            {error}
          </p>
        )}
        {!loading && !error && notes.length === 0 && (
          <p className="release-notes-dialog__status">{t('update.noNotes')}</p>
        )}
        {!loading &&
          !error &&
          notes.map((note) => (
            <div key={note.version} className="release-notes-dialog__release">
              <div className="release-notes-dialog__release-header">
                <span className="release-notes-dialog__release-version">v{note.version}</span>
                <span className="release-notes-dialog__release-date">
                  {formatDate(note.publishedAt)}
                </span>
              </div>
              {note.body && (
                <div className="release-notes-dialog__release-body">{note.body}</div>
              )}
            </div>
          ))}
      </div>
    </BaseDialog>
  )
}

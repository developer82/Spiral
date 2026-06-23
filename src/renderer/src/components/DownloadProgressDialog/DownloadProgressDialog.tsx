import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2 } from 'lucide-react'
import { useUpdateContext } from '../../contexts/UpdateContext'
import { useConfetti } from '../../hooks/useConfetti'
import BaseDialog from '../BaseDialog/BaseDialog'
import Button from '../Button/Button'
import ConfirmDialog from '../ConfirmDialog/ConfirmDialog'
import './DownloadProgressDialog.css'

interface DownloadProgressDialogProps {
  onClose: () => void
}

/** Format a download speed in bytes/second into a human-readable string. */
function formatSpeed(bytesPerSecond: number | null): string {
  if (!bytesPerSecond || bytesPerSecond <= 0) return '—'
  if (bytesPerSecond < 1e6) return `${(bytesPerSecond / 1e3).toFixed(0)} KB/s`
  return `${(bytesPerSecond / 1e6).toFixed(1)} MB/s`
}

export default function DownloadProgressDialog({
  onClose
}: DownloadProgressDialogProps): React.JSX.Element {
  const { t } = useTranslation()
  const {
    status,
    downloadPercent,
    downloadSpeed,
    availableVersion,
    cancelDownload,
    installUpdate
  } = useUpdateContext()
  const { triggerConfetti } = useConfetti()

  const [showCancelConfirm, setShowCancelConfirm] = useState(false)

  const isComplete = status === 'downloaded'
  const percent = downloadPercent ?? 0

  // Fire confetti once when the download finishes while this dialog is open.
  const celebratedRef = useRef(false)
  useEffect(() => {
    if (isComplete && !celebratedRef.current) {
      celebratedRef.current = true
      triggerConfetti()
    }
  }, [isComplete, triggerConfetti])

  // If the download is cancelled elsewhere or errors out, dismiss the dialog.
  useEffect(() => {
    if (status !== 'downloading' && status !== 'downloaded') onClose()
  }, [status, onClose])

  function handleConfirmCancel(): void {
    cancelDownload()
    setShowCancelConfirm(false)
    onClose()
  }

  return (
    <>
      <BaseDialog
        analyticsId="download_progress"
        title={isComplete ? t('update.downloadComplete') : t('update.downloadProgressTitle')}
        icon={isComplete ? <CheckCircle2 size={16} /> : undefined}
        onClose={onClose}
        maxWidth="32rem"
        zIndex={150}
        footer={
          isComplete ? (
            <>
              <Button variant="ghost" onClick={onClose}>
                {t('update.laterButton')}
              </Button>
              <Button variant="primary" onClick={installUpdate}>
                {t('update.installNow')}
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={onClose}>
                {t('update.hideDownload')}
              </Button>
              <Button variant="danger" onClick={() => setShowCancelConfirm(true)}>
                {t('update.cancelDownload')}
              </Button>
            </>
          )
        }
      >
        <div className="download-progress-dialog__body">
          {isComplete ? (
            <p className="download-progress-dialog__complete-text">
              {t('update.downloadCompleteText', { version: availableVersion ?? '' })}
            </p>
          ) : (
            <>
              <div className="download-progress-dialog__bar-track">
                <div
                  className="download-progress-dialog__bar-fill"
                  style={{ width: `${percent}%` }}
                />
              </div>
              <p className="download-progress-dialog__text">
                {t('update.downloadProgressText', {
                  percent,
                  speed: formatSpeed(downloadSpeed)
                })}
              </p>
            </>
          )}
        </div>
      </BaseDialog>

      {showCancelConfirm && (
        <ConfirmDialog
          title={t('update.cancelDownloadConfirmTitle')}
          message={t('update.cancelDownloadConfirmMessage')}
          variant="danger"
          confirmLabel={t('update.cancelDownload')}
          zIndex={160}
          onConfirm={handleConfirmCancel}
          onClose={() => setShowCancelConfirm(false)}
        />
      )}
    </>
  )
}

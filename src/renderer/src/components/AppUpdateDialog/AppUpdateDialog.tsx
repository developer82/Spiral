import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import DOMPurify from 'dompurify'
import { useUpdateContext } from '../../contexts/UpdateContext'
import BaseDialog from '../BaseDialog/BaseDialog'
import Button from '../Button/Button'
import './AppUpdateDialog.css'

interface AppUpdateDialogProps {
  onClose: () => void
}

export default function AppUpdateDialog({ onClose }: AppUpdateDialogProps): React.JSX.Element {
  const { t } = useTranslation()
  const { currentVersion, availableVersion, releaseNotes, startDownload } = useUpdateContext()

  const sanitizedReleaseNotes = useMemo(
    () => (releaseNotes ? DOMPurify.sanitize(releaseNotes) : null),
    [releaseNotes]
  )

  function handleUpdateNow(): void {
    startDownload()
    onClose()
  }

  return (
    <BaseDialog
      analyticsId="app_update"
      title={t('update.dialogTitle')}
      onClose={onClose}
      maxWidth="36rem"
      zIndex={150}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('update.laterButton')}
          </Button>
          <Button variant="primary" onClick={handleUpdateNow}>
            {t('update.updateNowButton')}
          </Button>
        </>
      }
    >
      <div className="app-update-dialog__body">
        <div className="app-update-dialog__versions">
          <div className="app-update-dialog__version-item">
            <span className="app-update-dialog__version-label">{t('update.currentVersion')}</span>
            <span className="app-update-dialog__version-value">{currentVersion}</span>
          </div>
          {availableVersion && (
            <div className="app-update-dialog__version-item">
              <span className="app-update-dialog__version-label">{t('update.newVersion')}</span>
              <span className="app-update-dialog__version-value app-update-dialog__version-value--new">
                {availableVersion}
              </span>
            </div>
          )}
        </div>

        {sanitizedReleaseNotes && (
          <>
            <p className="app-update-dialog__notes-label">{t('update.releaseNotes')}</p>
            <div
              className="app-update-dialog__notes"
              dangerouslySetInnerHTML={{ __html: sanitizedReleaseNotes }}
            />
          </>
        )}
      </div>
    </BaseDialog>
  )
}

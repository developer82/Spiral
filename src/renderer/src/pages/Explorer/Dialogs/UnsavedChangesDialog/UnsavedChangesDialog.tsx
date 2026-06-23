import { useTranslation } from 'react-i18next'
import BaseDialog from '../../../../components/BaseDialog/BaseDialog'
import './UnsavedChangesDialog.css'
import Button from '../../../../components/Button/Button'

interface UnsavedChangesDialogProps {
  fileName: string
  onSave: () => void
  onDiscard: () => void
  onCancel: () => void
}

function UnsavedChangesDialog({
  fileName,
  onSave,
  onDiscard,
  onCancel
}: UnsavedChangesDialogProps): React.JSX.Element {
  const { t } = useTranslation()

  return (
    <BaseDialog
      title={t('explorer.unsavedChanges.dialogTitle')}
      onClose={onCancel}
      maxWidth="26rem"
      footerSpaceBetween
      footer={
        <>
          <div className="dialog__footer-left">
            <Button
              variant="ghost"
              onClick={onCancel}
            >
              {t('explorer.unsavedChanges.cancelButton')}
            </Button>
          </div>
          <div className="dialog__footer-right">
            <Button
              variant="secondary"
              onClick={onDiscard}
            >
              {t('explorer.unsavedChanges.discardButton')}
            </Button>
            <Button
              variant="primary"
              onClick={onSave}
            >
              {t('explorer.unsavedChanges.saveButton')}
            </Button>
          </div>
        </>
      }
    >
      <div className="dialog__scroll-area">
        <p className="unsaved-dialog__message">
          {t('explorer.unsavedChanges.message', { fileName })}
        </p>
      </div>
    </BaseDialog>
  )
}

export default UnsavedChangesDialog

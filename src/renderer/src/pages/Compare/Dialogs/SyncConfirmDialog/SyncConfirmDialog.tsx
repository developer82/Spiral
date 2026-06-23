import { useState } from 'react'
import { AlertTriangle, ArrowRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import BaseDialog from '../../../../components/BaseDialog/BaseDialog'
import './SyncConfirmDialog.css'
import Button from '../../../../components/Button/Button'

interface SyncConfirmDialogProps {
  sourceName: string
  targetName: string
  isSwapped: boolean
  findingName?: string
  onConfirm: (createRevertScript: boolean) => void
  onClose: () => void
}

export default function SyncConfirmDialog({
  sourceName,
  targetName,
  isSwapped,
  findingName,
  onConfirm,
  onClose
}: SyncConfirmDialogProps): React.JSX.Element {
  const { t } = useTranslation()
  const [createRevertScript, setCreateRevertScript] = useState(false)

  const truthName = isSwapped ? targetName : sourceName
  const receiverName = isSwapped ? sourceName : targetName

  return (
    <BaseDialog
      title={t('compare.syncConfirmDialog.title')}
      icon={<AlertTriangle size={16} style={{ color: '#ff9d5c' }} />}
      onClose={onClose}
      maxWidth="34rem"
      zIndex={120}
      footer={
        <>
          <Button
              variant="ghost"
            onClick={onClose}
          >
            {t('compare.syncConfirmDialog.cancel')}
          </Button>
          <Button
              variant="danger"
            onClick={() => onConfirm(createRevertScript)}
          >
            {t('compare.syncConfirmDialog.confirm')}
          </Button>
        </>
      }
    >
      <div className="dialog__scroll-area">
        <div className="sync-confirm-dialog__direction">
          <span className="sync-confirm-dialog__db-name">{truthName}</span>
          <ArrowRight size={14} className="sync-confirm-dialog__arrow" />
          <span className="sync-confirm-dialog__db-name">{receiverName}</span>
        </div>

        <p className="sync-confirm-dialog__warning">
          {findingName
            ? t('compare.syncConfirmDialog.warningSingle', { findingName, receiverName })
            : t('compare.syncConfirmDialog.warningAll', { receiverName })}
        </p>

        {findingName && (
          <p className="sync-confirm-dialog__finding">
            {t('compare.syncConfirmDialog.selectedFinding', { findingName })}
          </p>
        )}

        <label className="sync-confirm-dialog__checkbox-row">
          <input
            type="checkbox"
            checked={createRevertScript}
            onChange={(event) => setCreateRevertScript(event.target.checked)}
          />
          <span>{t('compare.syncConfirmDialog.createRevertScript')}</span>
        </label>

        {createRevertScript && (
          <p className="sync-confirm-dialog__revert-note">
            {t('compare.syncConfirmDialog.revertScriptNote')}
          </p>
        )}
      </div>
    </BaseDialog>
  )
}

import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import BaseDialog from '../../../../components/BaseDialog/BaseDialog'
import './CriticalEnvironmentConfirmDialog.css'
import Button from '../../../../components/Button/Button'

interface CriticalEnvironmentConfirmDialogProps {
  environmentName: string
  onConfirm: (skipForTab: boolean) => void
  onClose: () => void
}

export default function CriticalEnvironmentConfirmDialog({
  environmentName,
  onConfirm,
  onClose
}: CriticalEnvironmentConfirmDialogProps): React.JSX.Element {
  const { t } = useTranslation()
  const [skipForTab, setSkipForTab] = useState(false)

  useEffect(() => {
    setSkipForTab(false)
  }, [environmentName])

  return (
    <BaseDialog
      title={t('explorer.criticalEnvironmentConfirm.title')}
      icon={<AlertTriangle size={16} style={{ color: '#ff9d5c' }} />}
      onClose={onClose}
      maxWidth="30rem"
      zIndex={120}
      footer={
        <>
          <Button
              variant="ghost"
            onClick={onClose}
          >
            {t('explorer.criticalEnvironmentConfirm.cancel')}
          </Button>
          <Button
              variant="danger"
            onClick={() => onConfirm(skipForTab)}
          >
            {t('explorer.criticalEnvironmentConfirm.confirm')}
          </Button>
        </>
      }
    >
      <div className="dialog__scroll-area">
        <p className="critical-env-dialog__message">
          {t('explorer.criticalEnvironmentConfirm.message', { environmentName })}
        </p>
        <label className="critical-env-dialog__checkbox-row">
          <input
            type="checkbox"
            checked={skipForTab}
            onChange={(event) => setSkipForTab(event.target.checked)}
          />
          <span>{t('explorer.criticalEnvironmentConfirm.skipForTab')}</span>
        </label>
      </div>
    </BaseDialog>
  )
}

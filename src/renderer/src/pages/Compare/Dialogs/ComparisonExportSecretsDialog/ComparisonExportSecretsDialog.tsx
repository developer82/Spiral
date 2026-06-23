import { useState } from 'react'
import { ShieldAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import BaseDialog from '../../../../components/BaseDialog/BaseDialog'
import './ComparisonExportSecretsDialog.css'
import Button from '../../../../components/Button/Button'

interface ComparisonExportSecretsDialogProps {
  defaultIncludeSecrets: boolean
  onConfirm: (includeSecrets: boolean, dontAskAgain: boolean) => void
  onClose: () => void
}

export default function ComparisonExportSecretsDialog({
  defaultIncludeSecrets,
  onConfirm,
  onClose
}: ComparisonExportSecretsDialogProps): React.JSX.Element {
  const { t } = useTranslation()
  const [includeSecrets, setIncludeSecrets] = useState(defaultIncludeSecrets)
  const [dontAskAgain, setDontAskAgain] = useState(false)

  return (
    <BaseDialog
      title={t('compare.exportSecretsDialog.title')}
      icon={<ShieldAlert size={16} style={{ color: '#ff9d5c' }} />}
      onClose={onClose}
      maxWidth="32rem"
      zIndex={120}
      footer={
        <>
          <Button
              variant="ghost"
            onClick={onClose}
          >
            {t('compare.exportSecretsDialog.cancel')}
          </Button>
          <Button
              variant="primary"
            onClick={() => onConfirm(includeSecrets, dontAskAgain)}
          >
            {t('compare.exportSecretsDialog.save')}
          </Button>
        </>
      }
    >
      <div className="dialog__scroll-area">
        <p className="export-secrets-dialog__message">
          {t('compare.exportSecretsDialog.message')}
        </p>
        <p className="export-secrets-dialog__warning">
          {t('compare.exportSecretsDialog.warning')}
        </p>
        <label className="export-secrets-dialog__checkbox-row">
          <input
            type="checkbox"
            checked={includeSecrets}
            onChange={(event) => setIncludeSecrets(event.target.checked)}
          />
          <span>{t('compare.exportSecretsDialog.includeSecrets')}</span>
        </label>
        <label className="export-secrets-dialog__checkbox-row">
          <input
            type="checkbox"
            checked={dontAskAgain}
            onChange={(event) => setDontAskAgain(event.target.checked)}
          />
          <span>{t('compare.exportSecretsDialog.dontAskAgain')}</span>
        </label>
      </div>
    </BaseDialog>
  )
}

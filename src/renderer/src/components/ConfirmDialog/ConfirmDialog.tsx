import type { ReactNode } from 'react'
import { AlertCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import BaseDialog from '../BaseDialog/BaseDialog'
import Button from '../Button/Button'
import './ConfirmDialog.css'

interface ConfirmDialogProps {
  title: string
  message: string
  icon?: ReactNode
  iconColor?: string
  variant?: 'primary' | 'danger'
  confirmLabel?: string
  zIndex?: number
  onConfirm: () => void
  onClose: () => void
}

export default function ConfirmDialog({
  title,
  message,
  icon,
  iconColor,
  variant = 'primary',
  confirmLabel,
  zIndex = 120,
  onConfirm,
  onClose
}: ConfirmDialogProps): React.JSX.Element {
  const { t } = useTranslation()

  return (
    <BaseDialog
      title={title}
      icon={
        <span style={iconColor ? { color: iconColor } : undefined}>
          {icon ?? <AlertCircle size={16} />}
        </span>
      }
      onClose={onClose}
      maxWidth="28rem"
      zIndex={zIndex}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('confirmDialog.cancel')}
          </Button>
          <Button variant={variant} onClick={onConfirm} autoFocus>
            {confirmLabel ?? t('confirmDialog.confirm')}
          </Button>
        </>
      }
    >
      <div className="dialog__scroll-area">
        <p className="confirm-dialog__message">{message}</p>
      </div>
    </BaseDialog>
  )
}

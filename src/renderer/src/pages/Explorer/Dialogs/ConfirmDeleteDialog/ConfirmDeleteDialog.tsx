import { type JSX } from 'react'
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react'
import BaseDialog from '../../../../components/BaseDialog/BaseDialog'
import './ConfirmDeleteDialog.css'
import Button from '../../../../components/Button/Button'

interface ConfirmDeleteDialogProps {
  rowCount: number
  tableName: string
  isDeleting?: boolean
  onConfirm: () => void
  onClose: () => void
}

export default function ConfirmDeleteDialog({
  rowCount,
  tableName,
  isDeleting = false,
  onConfirm,
  onClose
}: ConfirmDeleteDialogProps): JSX.Element {
  const rowLabel = rowCount === 1 ? '1 row' : `${rowCount} rows`

  return (
    <BaseDialog
      title="Confirm Delete"
      icon={<AlertTriangle size={16} style={{ color: 'var(--color-error, #fc8181)' }} />}
      onClose={onClose}
      closeDisabled={isDeleting}
      maxWidth="420px"
      zIndex={200}
      footer={
        <>
          <Button
              variant="ghost"
            onClick={onClose}
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button
              variant="danger"
            onClick={onConfirm}
            disabled={isDeleting}
          >
            {isDeleting ? <Loader2 size={13} className="dialog__spinner" /> : <Trash2 size={13} />}
            {isDeleting ? 'Deleting…' : `Delete ${rowLabel}`}
          </Button>
        </>
      }
    >
      <div className="dialog__scroll-area">
        <div className="confirm-delete-dialog__content">
          <p className="confirm-delete-dialog__message">
            Are you sure you want to delete <strong>{rowLabel}</strong> from{' '}
            <strong className="confirm-delete-dialog__table-name">{tableName}</strong>?
          </p>
          <p className="confirm-delete-dialog__warning">This action cannot be undone.</p>
        </div>
      </div>
    </BaseDialog>
  )
}

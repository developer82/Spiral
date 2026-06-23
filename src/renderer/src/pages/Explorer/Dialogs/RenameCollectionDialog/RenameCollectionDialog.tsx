import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import BaseDialog from '../../../../components/BaseDialog/BaseDialog'
import ErrorBox from '../../../../components/ErrorBox/ErrorBox'
import Button from '../../../../components/Button/Button'

interface RenameCollectionDialogProps {
  currentName: string
  onSubmit: (newName: string) => Promise<void>
  onClose: () => void
}

function validateName(name: string, currentName: string, t: (key: string) => string): string | null {
  if (!name.trim()) return t('explorer.renameCollection.validation.nameRequired')
  if (name.trim() === currentName) return t('explorer.renameCollection.validation.sameName')
  if (name.startsWith('system.')) return t('explorer.renameCollection.validation.systemPrefix')
  return null
}

function RenameCollectionDialog({ currentName, onSubmit, onClose }: RenameCollectionDialogProps): React.JSX.Element {
  const { t } = useTranslation()
  const [name, setName] = useState(currentName)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    const error = validateName(name, currentName, t)
    if (error) {
      setValidationError(error)
      return
    }
    setValidationError(null)
    setServerError(null)
    setIsSubmitting(true)
    try {
      await onSubmit(name.trim())
    } catch (err) {
      setServerError(err instanceof Error ? err.message : t('explorer.renameCollection.unknownError'))
    } finally {
      setIsSubmitting(false)
    }
  }

  function handleNameChange(e: React.ChangeEvent<HTMLInputElement>): void {
    setName(e.target.value)
    if (validationError) setValidationError(null)
    if (serverError) setServerError(null)
  }

  return (
    <BaseDialog
      title={t('explorer.renameCollection.dialogTitle')}
      onClose={onClose}
      closeDisabled={isSubmitting}
      maxWidth="26rem"
      footer={
        <>
          <Button
              variant="ghost"
            onClick={onClose}
            disabled={isSubmitting}
          >
            {t('explorer.renameCollection.cancelButton')}
          </Button>
          <Button
            type="submit"
            form="rename-collection-form"
              variant="primary"
            disabled={isSubmitting}
          >
            {isSubmitting
              ? t('explorer.renameCollection.renamingButton')
              : t('explorer.renameCollection.renameButton')}
          </Button>
        </>
      }
    >
      <form id="rename-collection-form" className="dialog__scroll-area" onSubmit={handleSubmit} noValidate>
        <div className="conn-dialog__field">
          <label className="conn-dialog__label" htmlFor="rename-collection-name">
            {t('explorer.renameCollection.nameLabel')}
          </label>
          <input
            id="rename-collection-name"
            className={`conn-dialog__input${validationError ? ' conn-dialog__input--error' : ''}`}
            type="text"
            value={name}
            onChange={handleNameChange}
            autoFocus
            disabled={isSubmitting}
          />
          {validationError && <span className="conn-dialog__error">{validationError}</span>}
          {serverError && <ErrorBox error={serverError} />}
        </div>
      </form>
    </BaseDialog>
  )
}

export default RenameCollectionDialog

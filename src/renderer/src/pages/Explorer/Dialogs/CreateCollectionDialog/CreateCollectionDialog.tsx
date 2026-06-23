import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import BaseDialog from '../../../../components/BaseDialog/BaseDialog'
import ErrorBox from '../../../../components/ErrorBox/ErrorBox'
import Button from '../../../../components/Button/Button'

interface CreateCollectionDialogProps {
  onSubmit: (name: string) => Promise<void>
  onClose: () => void
}

function validateName(name: string, t: (key: string) => string): string | null {
  if (!name.trim()) return t('explorer.createCollection.validation.nameRequired')
  if (name.startsWith('system.')) return t('explorer.createCollection.validation.systemPrefix')
  return null
}

function CreateCollectionDialog({ onSubmit, onClose }: CreateCollectionDialogProps): React.JSX.Element {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    const error = validateName(name, t)
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
      setServerError(err instanceof Error ? err.message : t('explorer.createCollection.unknownError'))
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
      title={t('explorer.createCollection.dialogTitle')}
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
            {t('explorer.createCollection.cancelButton')}
          </Button>
          <Button
            type="submit"
            form="create-collection-form"
              variant="primary"
            disabled={isSubmitting}
          >
            {isSubmitting
              ? t('explorer.createCollection.creatingButton')
              : t('explorer.createCollection.createButton')}
          </Button>
        </>
      }
    >
      <form id="create-collection-form" className="dialog__scroll-area" onSubmit={handleSubmit} noValidate>
        <div className="conn-dialog__field">
          <label className="conn-dialog__label" htmlFor="create-collection-name">
            {t('explorer.createCollection.nameLabel')}
          </label>
          <input
            id="create-collection-name"
            className={`conn-dialog__input${validationError ? ' conn-dialog__input--error' : ''}`}
            type="text"
            value={name}
            onChange={handleNameChange}
            placeholder={t('explorer.createCollection.namePlaceholder')}
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

export default CreateCollectionDialog

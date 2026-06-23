import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import BaseDialog from '../../../../components/BaseDialog/BaseDialog'
import ErrorBox from '../../../../components/ErrorBox/ErrorBox'
import './CreateDatabaseDialog.css'
import Button from '../../../../components/Button/Button'

interface CreateDatabaseDialogProps {
  onSubmit: (name: string) => Promise<void>
  onClose: () => void
}

function validateName(name: string, t: (key: string) => string): string | null {
  if (!name.trim()) return t('explorer.createDatabase.validation.nameRequired')
  if (/[[\]']/.test(name)) return t('explorer.createDatabase.validation.nameInvalidChars')
  return null
}

function CreateDatabaseDialog({ onSubmit, onClose }: CreateDatabaseDialogProps): React.JSX.Element {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)
  const [submitSql, setSubmitSql] = useState<string | null>(null)
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
    setSubmitSql(null)
    setIsSubmitting(true)
    try {
      await onSubmit(name.trim())
    } catch (err) {
      setServerError(
        err instanceof Error ? err.message : t('explorer.createDatabase.unknownError')
      )
      setSubmitSql(
        err instanceof Error && 'sql' in err
          ? String((err as { sql?: string }).sql ?? '') || null
          : null
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  function handleNameChange(e: React.ChangeEvent<HTMLInputElement>): void {
    setName(e.target.value)
    if (validationError) setValidationError(null)
    if (serverError) {
      setServerError(null)
      setSubmitSql(null)
    }
  }

  return (
    <BaseDialog
      title={t('explorer.createDatabase.dialogTitle')}
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
            {t('explorer.createDatabase.cancelButton')}
          </Button>
          <Button
            type="submit"
            form="create-db-form"
              variant="primary"
            disabled={isSubmitting}
          >
            {isSubmitting
              ? t('explorer.createDatabase.creatingButton')
              : t('explorer.createDatabase.createButton')}
          </Button>
        </>
      }
    >
      <form id="create-db-form" className="dialog__scroll-area" onSubmit={handleSubmit} noValidate>
        <div className="conn-dialog__field">
          <label className="conn-dialog__label" htmlFor="create-db-name">
            {t('explorer.createDatabase.nameLabel')}
          </label>
          <input
            id="create-db-name"
            className={`conn-dialog__input${validationError ? ' conn-dialog__input--error' : ''}`}
            type="text"
            value={name}
            onChange={handleNameChange}
            placeholder={t('explorer.createDatabase.namePlaceholder')}
            autoFocus
            disabled={isSubmitting}
          />
          {validationError && <span className="conn-dialog__error">{validationError}</span>}
          {serverError && <ErrorBox error={serverError} statement={submitSql ?? undefined} />}
        </div>
      </form>
    </BaseDialog>
  )
}

export default CreateDatabaseDialog

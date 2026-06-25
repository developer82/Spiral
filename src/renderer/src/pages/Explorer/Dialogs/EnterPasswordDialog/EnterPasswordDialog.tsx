import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import BaseDialog from '../../../../components/BaseDialog/BaseDialog'
import ErrorBox from '../../../../components/ErrorBox/ErrorBox'
import Button from '../../../../components/Button/Button'
import type { ConnectionRecord } from '../../connections.types'
import './EnterPasswordDialog.css'

interface EnterPasswordDialogProps {
  connection: ConnectionRecord
  onConnect: (username: string, password: string, remember: boolean) => Promise<void>
  onCancel: () => void
}

function EnterPasswordDialog({
  connection,
  onConnect,
  onCancel
}: EnterPasswordDialogProps): React.JSX.Element {
  const { t } = useTranslation()
  const [username, setUsername] = useState(connection.username ?? '')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    if (!password) {
      setValidationError(t('explorer.enterPassword.validation.passwordRequired'))
      return
    }
    setValidationError(null)
    setServerError(null)
    setIsSubmitting(true)
    try {
      await onConnect(username, password, remember)
    } catch (err) {
      setServerError(err instanceof Error ? err.message : t('explorer.enterPassword.unknownError'))
    } finally {
      setIsSubmitting(false)
    }
  }

  function handleUsernameChange(e: React.ChangeEvent<HTMLInputElement>): void {
    setUsername(e.target.value)
    if (serverError) setServerError(null)
  }

  function handlePasswordChange(e: React.ChangeEvent<HTMLInputElement>): void {
    setPassword(e.target.value)
    if (validationError) setValidationError(null)
    if (serverError) setServerError(null)
  }

  return (
    <BaseDialog
      title={t('explorer.enterPassword.dialogTitle')}
      onClose={onCancel}
      closeDisabled={isSubmitting}
      maxWidth="26rem"
      analyticsId="enter_password"
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={isSubmitting}>
            {t('explorer.enterPassword.cancelButton')}
          </Button>
          <Button
            type="submit"
            form="enter-password-form"
            variant="primary"
            disabled={isSubmitting}
          >
            {isSubmitting
              ? t('explorer.enterPassword.connectingButton')
              : t('explorer.enterPassword.connectButton')}
          </Button>
        </>
      }
    >
      <form
        id="enter-password-form"
        className="dialog__scroll-area"
        onSubmit={handleSubmit}
        noValidate
      >
        <div className="conn-dialog__field">
          <label className="conn-dialog__label" htmlFor="enter-password-username">
            {t('explorer.enterPassword.usernameLabel')}
          </label>
          <input
            id="enter-password-username"
            className="conn-dialog__input"
            type="text"
            value={username}
            onChange={handleUsernameChange}
            placeholder={t('explorer.enterPassword.usernamePlaceholder')}
            autoFocus={!connection.username}
            disabled={isSubmitting}
          />
        </div>
        <div className="conn-dialog__field">
          <label className="conn-dialog__label" htmlFor="enter-password-password">
            {t('explorer.enterPassword.passwordLabel')}
          </label>
          <input
            id="enter-password-password"
            className={`conn-dialog__input${validationError ? ' conn-dialog__input--error' : ''}`}
            type="password"
            value={password}
            onChange={handlePasswordChange}
            placeholder={t('explorer.enterPassword.passwordPlaceholder')}
            autoFocus={!!connection.username}
            disabled={isSubmitting}
          />
          {validationError && <span className="conn-dialog__error">{validationError}</span>}
        </div>
        <div className="conn-dialog__field">
          <label className="conn-dialog__checkbox-row">
            <input
              type="checkbox"
              className="conn-dialog__checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              disabled={isSubmitting}
            />
            <span className="conn-dialog__checkbox-label">
              {t('explorer.enterPassword.rememberLabel')}
            </span>
          </label>
        </div>
        {serverError && <ErrorBox error={serverError} />}
      </form>
    </BaseDialog>
  )
}

export default EnterPasswordDialog

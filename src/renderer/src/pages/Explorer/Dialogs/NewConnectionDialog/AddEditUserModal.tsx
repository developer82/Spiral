import { useState } from 'react'
import { Pencil } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ConnectionUserProfile } from '../../connections.types'
import BaseDialog from '../../../../components/BaseDialog/BaseDialog'
import Button from '../../../../components/Button/Button'
import { ConnectionInput } from './NewConnectionDialog'
import './NewConnectionDialog.css'

interface AddEditUserModalProps {
  /** Existing profile to edit; undefined means "add new" mode. */
  user?: ConnectionUserProfile
  /** Receives a fully-formed profile; parent merges it into form state. No IPC calls here. */
  onSave: (profile: ConnectionUserProfile) => void
  onClose: () => void
}

export default function AddEditUserModal({
  user,
  onSave,
  onClose
}: AddEditUserModalProps): React.JSX.Element {
  const { t } = useTranslation()
  const isEdit = user !== undefined
  const [profileName, setProfileName] = useState(user?.profileName ?? '')
  const [username, setUsername] = useState(user?.username ?? '')
  const [password, setPassword] = useState(user?.password ?? '')

  function handleSave(): void {
    if (!username.trim()) return
    onSave({
      id: user?.id ?? crypto.randomUUID(),
      profileName: profileName.trim() || undefined,
      username: username.trim(),
      password: password || undefined
    })
    onClose()
  }

  return (
    <BaseDialog
      title={isEdit ? t('explorer.dialog.users.editTitle') : t('explorer.dialog.users.add')}
      icon={<Pencil size={14} />}
      onClose={onClose}
      width="440px"
      maxWidth="92vw"
      zIndex={200}
      analyticsId={isEdit ? 'edit_connection_user' : 'add_connection_user'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('explorer.dialog.actions.cancel')}
          </Button>
          <Button variant="primary" onClick={handleSave} disabled={!username.trim()}>
            {t('explorer.dialog.actions.save')}
          </Button>
        </>
      }
    >
      <div className="conn-dialog__user-modal-body">
        <div className="conn-dialog__field">
          <label className="conn-dialog__label" htmlFor="user-modal-profile-name">
            {t('explorer.dialog.users.profileName')}
          </label>
          <ConnectionInput
            id="user-modal-profile-name"
            className="conn-dialog__input"
            type="text"
            value={profileName}
            onChange={(e) => setProfileName(e.target.value)}
            placeholder={t('explorer.dialog.users.profileNamePlaceholder')}
            autoFocus
          />
        </div>
        <div className="conn-dialog__field">
          <label className="conn-dialog__label" htmlFor="user-modal-username">
            {t('explorer.dialog.users.username')}
          </label>
          <ConnectionInput
            id="user-modal-username"
            className="conn-dialog__input"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder={t('explorer.dialog.users.usernamePlaceholder')}
          />
        </div>
        <div className="conn-dialog__field">
          <label className="conn-dialog__label" htmlFor="user-modal-password">
            {t('explorer.dialog.users.password')}
          </label>
          <ConnectionInput
            id="user-modal-password"
            className="conn-dialog__input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t('explorer.dialog.users.passwordPlaceholder')}
            autoComplete="off"
          />
        </div>
      </div>
    </BaseDialog>
  )
}

import { useState, useEffect } from 'react'
import { Plus, User, ShieldCheck, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { MongoUserDetails } from '../../../../../../preload/index.d'
import './ManageMongoUsersDialog.css'
import BaseDialog from '../../../../components/BaseDialog/BaseDialog'
import ErrorBox from '../../../../components/ErrorBox/ErrorBox'
import Button from '../../../../components/Button/Button'

interface ManageMongoUsersDialogProps {
  connectionId: string
  initialUsername?: string
  openOnNew?: boolean
  onClose: () => void
  onSuccess: () => void
}

type ActiveTab = 'general' | 'roles'

const PASSWORD_SENTINEL = '•••__unchanged__•••'

const MONGO_BUILT_IN_ROLES = [
  'read',
  'readWrite',
  'dbAdmin',
  'dbOwner',
  'userAdmin',
  'readAnyDatabase',
  'readWriteAnyDatabase',
  'dbAdminAnyDatabase',
  'userAdminAnyDatabase',
  'clusterAdmin',
  'clusterManager',
  'clusterMonitor',
  'hostManager',
  'backup',
  'restore',
  'root'
]

export default function ManageMongoUsersDialog({
  connectionId,
  initialUsername,
  openOnNew,
  onClose,
  onSuccess
}: ManageMongoUsersDialogProps): React.JSX.Element {
  const { t } = useTranslation()

  // ── List ──────────────────────────────────────────────────────────────────
  const [users, setUsers] = useState<string[]>([])
  const [loadingUsers, setLoadingUsers] = useState(true)

  // ── Selection ─────────────────────────────────────────────────────────────
  const [selectedUsername, setSelectedUsername] = useState<string | null>(null)
  const [isAddingNew, setIsAddingNew] = useState(false)
  const [loadingDetails, setLoadingDetails] = useState(false)

  // ── Active tab ────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<ActiveTab>('general')

  // ── General tab ───────────────────────────────────────────────────────────
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  // ── Roles tab ─────────────────────────────────────────────────────────────
  const [roles, setRoles] = useState<{ role: string; db: string }[]>([])

  // ── Action state ──────────────────────────────────────────────────────────
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ── Mount ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    void (async () => {
      const result = await window.api.database.getChildren(connectionId, 'security:users')
      const userNodes = result.status === 'ok' ? result.children : []
      setUsers(userNodes.map((n) => n.label))
      setLoadingUsers(false)

      if (initialUsername) {
        await selectUser(initialUsername)
      } else if (openOnNew) {
        startAddNew()
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId])

  async function selectUser(name: string): Promise<void> {
    setIsAddingNew(false)
    setSelectedUsername(name)
    setError(null)
    setLoadingDetails(true)
    setActiveTab('general')
    setPassword(PASSWORD_SENTINEL)
    setConfirmPassword(PASSWORD_SENTINEL)

    try {
      const details: MongoUserDetails | null = await window.api.database.getMongoUserDetails(connectionId, name)
      if (details) {
        setUsername(details.username)
        setRoles(details.roles)
      }
      setLoadingDetails(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setLoadingDetails(false)
    }
  }

  function startAddNew(): void {
    setSelectedUsername(null)
    setIsAddingNew(true)
    setError(null)
    setUsername('')
    setPassword('')
    setConfirmPassword('')
    setRoles([])
    setActiveTab('general')
  }

  async function reloadUsers(): Promise<void> {
    const result = await window.api.database.getChildren(connectionId, 'security:users')
    if (result.status === 'ok') {
      setUsers(result.children.map((n) => n.label))
    }
  }

  function validate(): string | null {
    if (!username.trim()) return t('explorer.manageMongoUsers.usernameRequired')
    if (isAddingNew) {
      if (password && password !== confirmPassword) return t('explorer.manageMongoUsers.passwordMismatch')
    } else {
      const pwdChanged = !!password && password !== PASSWORD_SENTINEL
      const confirmChanged = !!confirmPassword && confirmPassword !== PASSWORD_SENTINEL
      if ((pwdChanged || confirmChanged) && password !== confirmPassword)
        return t('explorer.manageMongoUsers.passwordMismatch')
    }
    return null
  }

  async function handleSave(): Promise<void> {
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }

    setIsSaving(true)
    setError(null)

    const result = await window.api.database.saveMongoUser(connectionId, {
      originalUsername: isAddingNew ? undefined : selectedUsername ?? undefined,
      username: username.trim(),
      password: password && password !== PASSWORD_SENTINEL ? password : undefined,
      roles
    })

    setIsSaving(false)

    if (result.status === 'error') {
      setError(result.message)
      return
    }

    await reloadUsers()
    if (isAddingNew) setSelectedUsername(username.trim())
    setIsAddingNew(false)
    onSuccess()
  }

  async function handleDelete(): Promise<void> {
    if (!selectedUsername) return
    setIsDeleting(true)
    setError(null)

    const result = await window.api.database.deleteMongoUser(connectionId, selectedUsername)
    setIsDeleting(false)

    if (result.status === 'error') {
      setError(result.message)
      return
    }

    await reloadUsers()
    setSelectedUsername(null)
    setIsAddingNew(false)
    onSuccess()
  }

  function addRole(): void {
    setRoles((prev) => [...prev, { role: 'read', db: 'admin' }])
  }

  function updateRole(index: number, field: 'role' | 'db', value: string): void {
    setRoles((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)))
  }

  function removeRole(index: number): void {
    setRoles((prev) => prev.filter((_, i) => i !== index))
  }

  // ── Render helpers ─────────────────────────────────────────────────────────
  const isEditing = !!selectedUsername && !isAddingNew
  const showEditor = isAddingNew || !!selectedUsername
  const canDelete = isEditing && !isSaving && !isDeleting

  function renderGeneralTab(): React.JSX.Element {
    return (
      <>
        <div className="manage-users-dialog__field">
          <label className="manage-users-dialog__label">
            {t('explorer.manageMongoUsers.usernameLabel')}
          </label>
          <input
            className="manage-users-dialog__input"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder={t('explorer.manageMongoUsers.usernamePlaceholder')}
            disabled={isEditing}
            autoFocus={!isEditing}
          />
        </div>

        <div className="manage-users-dialog__field">
          <label className="manage-users-dialog__label">
            {t('explorer.manageMongoUsers.passwordLabel')}
          </label>
          <input
            className="manage-users-dialog__input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={
              isEditing
                ? t('explorer.manageMongoUsers.passwordEditPlaceholder')
                : t('explorer.manageMongoUsers.passwordPlaceholder')
            }
            autoComplete="new-password"
            onFocus={() => {
              if (password === PASSWORD_SENTINEL) {
                setPassword('')
                setConfirmPassword('')
              }
            }}
            onBlur={() => {
              if (isEditing && !password && !confirmPassword) {
                setPassword(PASSWORD_SENTINEL)
                setConfirmPassword(PASSWORD_SENTINEL)
              }
            }}
          />
        </div>

        <div className="manage-users-dialog__field">
          <label className="manage-users-dialog__label">
            {t('explorer.manageMongoUsers.confirmPasswordLabel')}
          </label>
          <input
            className="manage-users-dialog__input"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder={t('explorer.manageMongoUsers.confirmPasswordPlaceholder')}
            autoComplete="new-password"
            onFocus={() => {
              if (confirmPassword === PASSWORD_SENTINEL) {
                setPassword('')
                setConfirmPassword('')
              }
            }}
            onBlur={() => {
              if (isEditing && !password && !confirmPassword) {
                setPassword(PASSWORD_SENTINEL)
                setConfirmPassword(PASSWORD_SENTINEL)
              }
            }}
          />
        </div>
      </>
    )
  }

  function renderRolesTab(): React.JSX.Element {
    return (
      <>
        {roles.length === 0 ? (
          <div className="mongo-users__empty-roles">
            {t('explorer.manageMongoUsers.noRoles')}
          </div>
        ) : (
          <table className="mongo-users__roles-table">
            <thead>
              <tr>
                <th>{t('explorer.manageMongoUsers.roleLabel')}</th>
                <th>{t('explorer.manageMongoUsers.databaseLabel')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {roles.map((r, i) => (
                <tr key={i}>
                  <td>
                    <select
                      className="mongo-users__role-select"
                      value={r.role}
                      onChange={(e) => updateRole(i, 'role', e.target.value)}
                    >
                      {MONGO_BUILT_IN_ROLES.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                      {!MONGO_BUILT_IN_ROLES.includes(r.role) && (
                        <option value={r.role}>{r.role}</option>
                      )}
                    </select>
                  </td>
                  <td>
                    <input
                      className="mongo-users__db-input"
                      type="text"
                      value={r.db}
                      onChange={(e) => updateRole(i, 'db', e.target.value)}
                      placeholder="admin"
                    />
                  </td>
                  <td>
                    <button
                      className="mongo-users__remove-btn"
                      onClick={() => removeRole(i)}
                      title="Remove role"
                    >
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="mongo-users__add-role-row">
          <button className="mongo-users__add-role-btn" onClick={addRole}>
            <Plus size={13} />
            {t('explorer.manageMongoUsers.addRoleButton')}
          </button>
        </div>
      </>
    )
  }

  const footerLeft = error ? <ErrorBox error={error} /> : <span />

  const footerRight = (
    <div className="dialog__footer-right">
      {canDelete && (
        <Button
              variant="danger"
          onClick={() => void handleDelete()}
          disabled={isDeleting || isSaving}
        >
          {isDeleting
            ? t('common.deleting', 'Deleting…')
            : t('explorer.manageMongoUsers.deleteButton')}
        </Button>
      )}
      {showEditor && (
        <Button
              variant="primary"
          onClick={() => void handleSave()}
          disabled={isSaving || isDeleting}
        >
          {isSaving
            ? t('common.saving', 'Saving…')
            : t('explorer.manageMongoUsers.saveButton')}
        </Button>
      )}
    </div>
  )

  return (
    <BaseDialog
      title={t('explorer.manageMongoUsers.dialogTitle')}
      icon={<ShieldCheck size={16} />}
      onClose={onClose}
      width="90vw"
      maxWidth="860px"
      height="90vh"
      maxHeight="680px"
      minWidth="640px"
      minHeight="440px"
      footerSpaceBetween
      footer={showEditor ? <>{footerLeft}{footerRight}</> : undefined}
    >
      <div className="manage-users-dialog__body">
        {/* Left panel */}
        <div className="manage-users-dialog__list-panel">
          <div className="manage-users-dialog__list-header">
            {t('explorer.manageMongoUsers.listHeader')}
          </div>
          <div className="manage-users-dialog__list">
            {loadingUsers ? (
              <div className="manage-users-dialog__empty-state">
                {t('common.loading', 'Loading…')}
              </div>
            ) : (
              <>
                {users.map((name) => (
                  <div
                    key={name}
                    className={[
                      'manage-users-dialog__list-item',
                      selectedUsername === name && !isAddingNew
                        ? 'manage-users-dialog__list-item--selected'
                        : ''
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => void selectUser(name)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') void selectUser(name)
                    }}
                  >
                    <User size={12} style={{ flexShrink: 0 }} />
                    {name}
                  </div>
                ))}
                {isAddingNew && (
                  <div className="manage-users-dialog__list-item manage-users-dialog__list-item--selected">
                    <User size={12} style={{ flexShrink: 0 }} />
                    {username || t('explorer.manageMongoUsers.newUser')}
                  </div>
                )}
              </>
            )}
          </div>
          <button className="manage-users-dialog__list-add" onClick={() => startAddNew()}>
            <Plus size={13} />
            {t('explorer.manageMongoUsers.addButton')}
          </button>
        </div>

        {/* Right panel */}
        <div className="manage-users-dialog__editor-panel">
          {!showEditor ? (
            <div className="manage-users-dialog__empty-state">
              {t('explorer.manageMongoUsers.selectOrAdd')}
            </div>
          ) : loadingDetails ? (
            <div className="manage-users-dialog__empty-state">
              {t('common.loading', 'Loading…')}
            </div>
          ) : (
            <>
              <div className="manage-users-dialog__tabs">
                {(['general', 'roles'] as ActiveTab[]).map((tab) => (
                  <button
                    key={tab}
                    className={`manage-users-dialog__tab${activeTab === tab ? ' manage-users-dialog__tab--active' : ''}`}
                    onClick={() => setActiveTab(tab)}
                  >
                    {t(`explorer.manageMongoUsers.tab_${tab}`)}
                  </button>
                ))}
              </div>

              <div className="manage-users-dialog__tab-content">
                {activeTab === 'general' && renderGeneralTab()}
                {activeTab === 'roles' && renderRolesTab()}
              </div>
            </>
          )}
        </div>
      </div>
    </BaseDialog>
  )
}

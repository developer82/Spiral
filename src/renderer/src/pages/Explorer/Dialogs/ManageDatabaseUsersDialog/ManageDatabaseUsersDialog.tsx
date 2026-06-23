import { useState, useEffect } from 'react'
import { Plus, User, ShieldCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type {
  ExplorerNode,
  DatabaseUserDetails,
  DatabaseUserRoleEntry
} from '../../../../../../preload/index.d'
import './ManageDatabaseUsersDialog.css'
import BaseDialog from '../../../../components/BaseDialog/BaseDialog'
import ErrorBox from '../../../../components/ErrorBox/ErrorBox'
import Button from '../../../../components/Button/Button'

interface ManageDatabaseUsersDialogProps {
  connectionId: string
  databaseName: string
  initialUserName?: string
  openOnNew?: boolean
  onClose: () => void
  onSuccess: () => void
}

type UserType = 'sql' | 'windows' | 'external' | 'nologin'
type ActiveTab = 'general' | 'membership'

function userTypeFromCode(code: DatabaseUserDetails['type']): UserType {
  if (code === 'S') return 'sql'
  if (code === 'U') return 'windows'
  if (code === 'G') return 'windows'
  if (code === 'E' || code === 'X') return 'external'
  return 'nologin'
}

export default function ManageDatabaseUsersDialog({
  connectionId,
  databaseName,
  initialUserName,
  openOnNew,
  onClose,
  onSuccess
}: ManageDatabaseUsersDialogProps): React.JSX.Element {
  const { t } = useTranslation()

  // ── List ──────────────────────────────────────────────────────────────────
  const [users, setUsers] = useState<ExplorerNode[]>([])
  const [loadingUsers, setLoadingUsers] = useState(true)

  // ── Selection ─────────────────────────────────────────────────────────────
  const [selectedUserName, setSelectedUserName] = useState<string | null>(null)
  const [isAddingNew, setIsAddingNew] = useState(false)
  const [loadingDetails, setLoadingDetails] = useState(false)

  // ── Active tab ────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<ActiveTab>('general')

  // ── General tab form ──────────────────────────────────────────────────────
  const [userName, setUserName] = useState('')
  const [userType, setUserType] = useState<UserType>('sql')
  const [loginName, setLoginName] = useState('')
  const [defaultSchema, setDefaultSchema] = useState('dbo')

  // ── Supplementary data ────────────────────────────────────────────────────
  const [availableLogins, setAvailableLogins] = useState<ExplorerNode[]>([])
  const [availableSchemas, setAvailableSchemas] = useState<string[]>([])

  // ── Membership tab ────────────────────────────────────────────────────────
  const [allDbRoles, setAllDbRoles] = useState<DatabaseUserRoleEntry[]>([])
  const [checkedRoles, setCheckedRoles] = useState<Set<string>>(new Set())
  const [loadingRoles, setLoadingRoles] = useState(false)

  // ── Action state ──────────────────────────────────────────────────────────
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ── Mount: load list + supplementary data ─────────────────────────────────
  useEffect(() => {
    void (async () => {
      const [usersResult, loginsResult, schemasResult] = await Promise.all([
        window.api.database.getChildren(connectionId, `db:${databaseName}:security:users`),
        window.api.database.getChildren(connectionId, 'security:users'),
        window.api.database.getChildren(connectionId, `db:${databaseName}:security:schemas`)
      ])

      const userNodes = usersResult.status === 'ok' ? usersResult.children : []
      const loginNodes = loginsResult.status === 'ok' ? loginsResult.children : []
      const schemaNames =
        schemasResult.status === 'ok' ? schemasResult.children.map((n) => n.label) : []

      setUsers(userNodes)
      setAvailableLogins(loginNodes)
      setAvailableSchemas(schemaNames)
      setLoadingUsers(false)

      if (initialUserName) {
        await selectUser(initialUserName)
      } else if (openOnNew) {
        startAddNew()
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId, databaseName])

  // ── Select an existing user ────────────────────────────────────────────────
  async function selectUser(name: string): Promise<void> {
    setIsAddingNew(false)
    setSelectedUserName(name)
    setError(null)
    setLoadingDetails(true)
    setActiveTab('general')

    try {
      const [details, roles] = await Promise.all([
        window.api.database.getDatabaseUserDetails(connectionId, databaseName, name),
        window.api.database.getDatabaseUserRoles(connectionId, databaseName, name)
      ])

      if (details) {
        setUserName(details.name)
        setUserType(userTypeFromCode(details.type))
        setLoginName(details.loginName ?? '')
        setDefaultSchema(details.defaultSchema || 'dbo')
      } else {
        setUserName(name)
        setUserType('sql')
        setLoginName('')
        setDefaultSchema('dbo')
      }

      setAllDbRoles(roles)
      setCheckedRoles(new Set(roles.filter((r) => r.isMember).map((r) => r.roleName)))
      setLoadingDetails(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setLoadingDetails(false)
    }
  }

  // ── Start add-new mode ─────────────────────────────────────────────────────
  function startAddNew(): void {
    setSelectedUserName(null)
    setIsAddingNew(true)
    setError(null)
    setUserName('')
    setUserType('sql')
    setLoginName('')
    setDefaultSchema('dbo')
    setActiveTab('general')
    setCheckedRoles(new Set())
    setLoadingRoles(false)

    void (async () => {
      setLoadingRoles(true)
      try {
        const roles = await window.api.database.getDatabaseUserRoles(connectionId, databaseName, '')
        setAllDbRoles(roles)
      } catch {
        // roles list will be empty; not fatal
      } finally {
        setLoadingRoles(false)
      }
    })()
  }

  // ── Reload users list ──────────────────────────────────────────────────────
  async function reloadUsers(): Promise<void> {
    const result = await window.api.database.getChildren(
      connectionId,
      `db:${databaseName}:security:users`
    )
    if (result.status === 'ok') setUsers(result.children)
  }

  // ── Validation ─────────────────────────────────────────────────────────────
  function validate(): string | null {
    if (!userName.trim()) return t('explorer.manageDatabaseUsers.userNameRequired')
    if (userType !== 'nologin' && !loginName)
      return t('explorer.manageDatabaseUsers.loginRequired')
    return null
  }

  // ── Save ───────────────────────────────────────────────────────────────────
  async function handleSave(): Promise<void> {
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }

    setIsSaving(true)
    setError(null)

    const result = await window.api.database.saveDatabaseUser(connectionId, {
      databaseName,
      originalUserName: selectedUserName ?? undefined,
      userName: userName.trim(),
      userType,
      loginName: userType !== 'nologin' ? loginName : undefined,
      defaultSchema,
      roles: [...checkedRoles]
    })

    setIsSaving(false)

    if (result.status === 'error') {
      setError(result.message)
      return
    }

    await reloadUsers()
    if (isAddingNew) setSelectedUserName(userName.trim())
    setIsAddingNew(false)
    onSuccess()
  }

  // ── Delete ─────────────────────────────────────────────────────────────────
  async function handleDelete(): Promise<void> {
    if (!selectedUserName) return
    setIsDeleting(true)
    setError(null)

    const result = await window.api.database.deleteDatabaseUser(
      connectionId,
      databaseName,
      selectedUserName
    )
    setIsDeleting(false)

    if (result.status === 'error') {
      setError(result.message)
      return
    }

    await reloadUsers()
    setSelectedUserName(null)
    setIsAddingNew(false)
    onSuccess()
  }

  // ── Render helpers ─────────────────────────────────────────────────────────
  const isEditing = !!selectedUserName && !isAddingNew
  const showEditor = isAddingNew || !!selectedUserName
  const canDelete = isEditing && !isSaving && !isDeleting

  function renderGeneralTab(): React.JSX.Element {
    return (
      <>
        <div className="manage-users-dialog__field">
          <label className="manage-users-dialog__label">
            {t('explorer.manageDatabaseUsers.userNameLabel')}
          </label>
          <input
            className="manage-users-dialog__input"
            type="text"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            placeholder={t('explorer.manageDatabaseUsers.userNamePlaceholder')}
            disabled={isEditing}
            autoFocus={!isEditing}
          />
        </div>

        <div className="manage-users-dialog__field">
          <label className="manage-users-dialog__label">
            {t('explorer.manageDatabaseUsers.userTypeLabel')}
          </label>
          <div className="manage-users-dialog__radio-group">
            {(['sql', 'windows', 'external', 'nologin'] as UserType[]).map((type) => (
              <label
                key={type}
                className={`manage-users-dialog__radio-label${
                  isEditing ? ' manage-users-dialog__radio-label--disabled' : ''
                }`}
              >
                <input
                  type="radio"
                  name="user-type"
                  value={type}
                  checked={userType === type}
                  disabled={isEditing}
                  onChange={() => {
                    setUserType(type)
                    if (type === 'nologin') setLoginName('')
                  }}
                />
                {t(`explorer.manageDatabaseUsers.userType_${type}`)}
              </label>
            ))}
          </div>
        </div>

        {userType !== 'nologin' && (
          <div className="manage-users-dialog__field">
            <label className="manage-users-dialog__label">
              {t('explorer.manageDatabaseUsers.loginLabel')}
            </label>
            <select
              className="manage-users-dialog__select"
              value={loginName}
              disabled={isEditing}
              onChange={(e) => setLoginName(e.target.value)}
            >
              <option value="">{t('explorer.manageDatabaseUsers.loginPlaceholder')}</option>
              {availableLogins.map((login) => (
                <option key={login.id} value={login.label}>
                  {login.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="manage-users-dialog__field">
          <label className="manage-users-dialog__label">
            {t('explorer.manageDatabaseUsers.defaultSchemaLabel')}
          </label>
          <select
            className="manage-users-dialog__select"
            value={defaultSchema}
            onChange={(e) => setDefaultSchema(e.target.value)}
          >
            {availableSchemas.length === 0 && (
              <option value={defaultSchema}>{defaultSchema}</option>
            )}
            {availableSchemas.map((schema) => (
              <option key={schema} value={schema}>
                {schema}
              </option>
            ))}
          </select>
        </div>
      </>
    )
  }

  function renderMembershipTab(): React.JSX.Element {
    if (loadingRoles || (isAddingNew && allDbRoles.length === 0 && loadingRoles)) {
      return (
        <div className="manage-users-dialog__empty-state">
          {t('common.loading', 'Loading…')}
        </div>
      )
    }
    return (
      <div className="manage-users-dialog__roles-list">
        {allDbRoles.map((role) => (
          <label key={role.roleName} className="manage-users-dialog__checkbox-field">
            <input
              type="checkbox"
              checked={checkedRoles.has(role.roleName)}
              disabled={role.roleName === 'public'}
              onChange={() => {
                setCheckedRoles((prev) => {
                  const next = new Set(prev)
                  if (next.has(role.roleName)) next.delete(role.roleName)
                  else next.add(role.roleName)
                  return next
                })
              }}
            />
            <span className="manage-users-dialog__checkbox-label">{role.roleName}</span>
          </label>
        ))}
      </div>
    )
  }

  // ── Footer ─────────────────────────────────────────────────────────────────
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
            : t('explorer.manageDatabaseUsers.deleteButton')}
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
            : t('explorer.manageDatabaseUsers.saveButton')}
        </Button>
      )}
    </div>
  )

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <BaseDialog
      title={`${t('explorer.manageDatabaseUsers.dialogTitle')} — ${databaseName}`}
      icon={<ShieldCheck size={16} />}
      onClose={onClose}
      width="90vw"
      maxWidth="1000px"
      height="90vh"
      maxHeight="780px"
      minWidth="780px"
      minHeight="520px"
      footerSpaceBetween
      footer={showEditor ? <>{footerLeft}{footerRight}</> : undefined}
    >
      <div className="manage-users-dialog__body">
        {/* Left panel */}
        <div className="manage-users-dialog__list-panel">
          <div className="manage-users-dialog__list-header">
            {t('explorer.manageDatabaseUsers.listHeader')}
          </div>
          <div className="manage-users-dialog__list">
            {loadingUsers ? (
              <div className="manage-users-dialog__empty-state">
                {t('common.loading', 'Loading…')}
              </div>
            ) : (
              <>
                {users.map((user) => (
                  <div
                    key={user.id}
                    className={[
                      'manage-users-dialog__list-item',
                      selectedUserName === user.label && !isAddingNew
                        ? 'manage-users-dialog__list-item--selected'
                        : ''
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => void selectUser(user.label)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') void selectUser(user.label)
                    }}
                  >
                    <User size={12} style={{ flexShrink: 0 }} />
                    {user.label}
                  </div>
                ))}
                {isAddingNew && (
                  <div className="manage-users-dialog__list-item manage-users-dialog__list-item--selected">
                    <User size={12} style={{ flexShrink: 0 }} />
                    {userName || t('explorer.manageDatabaseUsers.newUser')}
                  </div>
                )}
              </>
            )}
          </div>
          <button className="manage-users-dialog__list-add" onClick={() => startAddNew()}>
            <Plus size={13} />
            {t('explorer.manageDatabaseUsers.addButton')}
          </button>
        </div>

        {/* Right panel */}
        <div className="manage-users-dialog__editor-panel">
          {!showEditor ? (
            <div className="manage-users-dialog__empty-state">
              {t('explorer.manageDatabaseUsers.selectOrAdd')}
            </div>
          ) : loadingDetails ? (
            <div className="manage-users-dialog__empty-state">
              {t('common.loading', 'Loading…')}
            </div>
          ) : (
            <>
              {/* Tab bar */}
              <div className="manage-users-dialog__tabs">
                {(['general', 'membership'] as ActiveTab[]).map((tab) => (
                  <button
                    key={tab}
                    className={`manage-users-dialog__tab${activeTab === tab ? ' manage-users-dialog__tab--active' : ''}`}
                    onClick={() => setActiveTab(tab)}
                  >
                    {t(`explorer.manageDatabaseUsers.tab_${tab}`)}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              <div className="manage-users-dialog__tab-content">
                {activeTab === 'general' && renderGeneralTab()}
                {activeTab === 'membership' && renderMembershipTab()}
              </div>
            </>
          )}
        </div>
      </div>
    </BaseDialog>
  )
}

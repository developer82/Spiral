import { useState, useEffect } from 'react'
import { Plus, User, ShieldCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type {
  MySqlGlobalPrivilegeEntry,
  MySqlDatabasePrivilegeEntry
} from '../../../../../../preload/index.d'
import './ManageMySqlUsersDialog.css'
import BaseDialog from '../../../../components/BaseDialog/BaseDialog'
import ErrorBox from '../../../../components/ErrorBox/ErrorBox'
import Button from '../../../../components/Button/Button'

interface ManageMySqlUsersDialogProps {
  connectionId: string
  initialUserKey?: string
  openOnNew?: boolean
  onClose: () => void
  onSuccess: () => void
}

type ActiveTab = 'general' | 'globalPrivileges' | 'databasePrivileges'

const PLUGINS = [
  'mysql_native_password',
  'caching_sha2_password',
  'sha256_password',
  'auth_socket'
]

const GLOBAL_PRIVILEGES = [
  'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP', 'RELOAD',
  'PROCESS', 'FILE', 'REFERENCES', 'INDEX', 'ALTER', 'SHOW DATABASES',
  'SUPER', 'CREATE TEMPORARY TABLES', 'LOCK TABLES', 'EXECUTE',
  'REPLICATION SLAVE', 'REPLICATION CLIENT', 'CREATE VIEW', 'SHOW VIEW',
  'CREATE ROUTINE', 'ALTER ROUTINE', 'CREATE USER', 'EVENT', 'TRIGGER'
]

const DATABASE_PRIVILEGES = [
  'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP',
  'ALTER', 'INDEX', 'CREATE VIEW', 'SHOW VIEW'
]

function pluginNeedsPassword(plugin: string): boolean {
  return !plugin.includes('socket') && !plugin.includes('pam') && !plugin.includes('windows')
}

export default function ManageMySqlUsersDialog({
  connectionId,
  initialUserKey,
  openOnNew,
  onClose,
  onSuccess
}: ManageMySqlUsersDialogProps): React.JSX.Element {
  const { t } = useTranslation()

  // ── List ──────────────────────────────────────────────────────────────────
  const [users, setUsers] = useState<{ username: string; host: string }[]>([])
  const [loadingUsers, setLoadingUsers] = useState(true)

  // ── Selection ─────────────────────────────────────────────────────────────
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [isAddingNew, setIsAddingNew] = useState(false)
  const [loadingDetails, setLoadingDetails] = useState(false)

  // ── Active tab ────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<ActiveTab>('general')

  // ── General tab form ──────────────────────────────────────────────────────
  const [username, setUsername] = useState('')
  const [host, setHost] = useState('%')
  const [plugin, setPlugin] = useState('mysql_native_password')
  const [password, setPassword] = useState('')
  const [accountLocked, setAccountLocked] = useState(false)
  const [passwordExpired, setPasswordExpired] = useState(false)

  // ── Global privileges ─────────────────────────────────────────────────────
  const [globalPrivileges, setGlobalPrivileges] = useState<MySqlGlobalPrivilegeEntry[]>(
    GLOBAL_PRIVILEGES.map((p) => ({ privilege: p, isGranted: false }))
  )

  // ── Database privileges ───────────────────────────────────────────────────
  const [databases, setDatabases] = useState<string[]>([])
  const [dbPrivileges, setDbPrivileges] = useState<MySqlDatabasePrivilegeEntry[]>([])
  const [expandedDb, setExpandedDb] = useState<string | null>(null)

  // ── Action state ──────────────────────────────────────────────────────────
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ── Mount: load list + database list ─────────────────────────────────────
  useEffect(() => {
    void (async () => {
      const [usersResult, dbList] = await Promise.all([
        window.api.database.getChildren(connectionId, 'security:users'),
        window.api.database.getMySqlDatabaseList(connectionId)
      ])

      const userNodes = usersResult.status === 'ok' ? usersResult.children : []
      const parsed = userNodes.map((n) => {
        const at = n.label.lastIndexOf('@')
        return { username: n.label.slice(0, at), host: n.label.slice(at + 1) }
      })

      setUsers(parsed)
      setDatabases(dbList)
      setLoadingUsers(false)

      if (initialUserKey) {
        const at = initialUserKey.lastIndexOf('@')
        await selectUser(initialUserKey.slice(0, at), initialUserKey.slice(at + 1))
      } else if (openOnNew) {
        startAddNew()
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId])

  function makeKey(u: string, h: string): string {
    return `${u}@${h}`
  }

  async function selectUser(u: string, h: string): Promise<void> {
    const key = makeKey(u, h)
    setIsAddingNew(false)
    setSelectedKey(key)
    setError(null)
    setLoadingDetails(true)
    setActiveTab('general')
    setPassword('')

    try {
      const [details, globalPrivs, dbPrivs] = await Promise.all([
        window.api.database.getMySqlUserDetails(connectionId, u, h),
        window.api.database.getMySqlUserGlobalPrivileges(connectionId, u, h),
        window.api.database.getMySqlUserDatabasePrivileges(connectionId, u, h)
      ])

      if (details) {
        setUsername(details.username)
        setHost(details.host)
        setPlugin(details.plugin)
        setAccountLocked(details.accountLocked)
        setPasswordExpired(details.passwordExpired)
      }

      setGlobalPrivileges(
        globalPrivs.length > 0
          ? globalPrivs
          : GLOBAL_PRIVILEGES.map((p) => ({ privilege: p, isGranted: false }))
      )

      setDbPrivileges(dbPrivs)
      setLoadingDetails(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setLoadingDetails(false)
    }
  }

  function startAddNew(): void {
    setSelectedKey(null)
    setIsAddingNew(true)
    setError(null)
    setUsername('')
    setHost('%')
    setPlugin('mysql_native_password')
    setPassword('')
    setAccountLocked(false)
    setPasswordExpired(false)
    setGlobalPrivileges(GLOBAL_PRIVILEGES.map((p) => ({ privilege: p, isGranted: false })))
    setDbPrivileges([])
    setActiveTab('general')
  }

  async function reloadUsers(): Promise<void> {
    const result = await window.api.database.getChildren(connectionId, 'security:users')
    if (result.status === 'ok') {
      setUsers(
        result.children.map((n) => {
          const at = n.label.lastIndexOf('@')
          return { username: n.label.slice(0, at), host: n.label.slice(at + 1) }
        })
      )
    }
  }

  function validate(): string | null {
    if (!username.trim()) return t('explorer.manageMySqlUsers.usernameRequired')
    if (isAddingNew && pluginNeedsPassword(plugin) && !password)
      return t('explorer.manageMySqlUsers.passwordRequired')
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

    const selectedGranted = globalPrivileges
      .filter((p) => p.isGranted)
      .map((p) => p.privilege)

    const result = await window.api.database.saveMySqlUser(connectionId, {
      originalUsername: isAddingNew ? undefined : users.find((u) => makeKey(u.username, u.host) === selectedKey)?.username,
      originalHost: isAddingNew ? undefined : users.find((u) => makeKey(u.username, u.host) === selectedKey)?.host,
      username: username.trim(),
      host: host.trim() || '%',
      plugin,
      password: password || undefined,
      accountLocked,
      passwordExpired,
      globalPrivileges: selectedGranted,
      databasePrivileges: dbPrivileges.map((d) => ({
        databaseName: d.databaseName,
        privileges: d.privileges.filter((p) => p.isGranted).map((p) => p.privilege)
      }))
    })

    setIsSaving(false)

    if (result.status === 'error') {
      setError(result.message)
      return
    }

    await reloadUsers()
    const newKey = makeKey(username.trim(), host.trim() || '%')
    if (isAddingNew) setSelectedKey(newKey)
    setIsAddingNew(false)
    onSuccess()
  }

  async function handleDelete(): Promise<void> {
    const user = users.find((u) => makeKey(u.username, u.host) === selectedKey)
    if (!user) return
    setIsDeleting(true)
    setError(null)

    const result = await window.api.database.deleteMySqlUser(
      connectionId,
      user.username,
      user.host
    )
    setIsDeleting(false)

    if (result.status === 'error') {
      setError(result.message)
      return
    }

    await reloadUsers()
    setSelectedKey(null)
    setIsAddingNew(false)
    onSuccess()
  }

  function toggleGlobalPrivilege(privilege: string): void {
    setGlobalPrivileges((prev) =>
      prev.map((p) => (p.privilege === privilege ? { ...p, isGranted: !p.isGranted } : p))
    )
  }

  function toggleDbPrivilege(dbName: string, privilege: string): void {
    setDbPrivileges((prev) =>
      prev.map((d) =>
        d.databaseName === dbName
          ? {
              ...d,
              privileges: d.privileges.map((p) =>
                p.privilege === privilege ? { ...p, isGranted: !p.isGranted } : p
              )
            }
          : d
      )
    )
  }

  function addDatabase(dbName: string): void {
    if (dbPrivileges.some((d) => d.databaseName === dbName)) return
    setDbPrivileges((prev) => [
      ...prev,
      {
        databaseName: dbName,
        privileges: DATABASE_PRIVILEGES.map((p) => ({ privilege: p, isGranted: false }))
      }
    ])
    setExpandedDb(dbName)
  }

  function removeDatabase(dbName: string): void {
    setDbPrivileges((prev) => prev.filter((d) => d.databaseName !== dbName))
    if (expandedDb === dbName) setExpandedDb(null)
  }

  // ── Render helpers ─────────────────────────────────────────────────────────
  const isEditing = !!selectedKey && !isAddingNew
  const showEditor = isAddingNew || !!selectedKey
  const canDelete = isEditing && !isSaving && !isDeleting
  const showPassword = pluginNeedsPassword(plugin)

  function renderGeneralTab(): React.JSX.Element {
    return (
      <>
        <div className="manage-users-dialog__field">
          <label className="manage-users-dialog__label">
            {t('explorer.manageMySqlUsers.usernameLabel')}
          </label>
          <input
            className="manage-users-dialog__input"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder={t('explorer.manageMySqlUsers.usernamePlaceholder')}
            disabled={isEditing}
            autoFocus={!isEditing}
          />
        </div>

        <div className="manage-users-dialog__field">
          <label className="manage-users-dialog__label">
            {t('explorer.manageMySqlUsers.hostLabel')}
          </label>
          <input
            className="manage-users-dialog__input"
            type="text"
            value={host}
            onChange={(e) => setHost(e.target.value)}
            placeholder={t('explorer.manageMySqlUsers.hostPlaceholder')}
            disabled={isEditing}
          />
        </div>

        <div className="manage-users-dialog__field">
          <label className="manage-users-dialog__label">
            {t('explorer.manageMySqlUsers.pluginLabel')}
          </label>
          <select
            className="manage-users-dialog__select"
            value={plugin}
            onChange={(e) => {
              setPlugin(e.target.value)
              setPassword('')
            }}
          >
            {PLUGINS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>

        {showPassword && (
          <div className="manage-users-dialog__field">
            <label className="manage-users-dialog__label">
              {t('explorer.manageMySqlUsers.passwordLabel')}
            </label>
            <input
              className="manage-users-dialog__input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={
                isEditing
                  ? t('explorer.manageMySqlUsers.passwordEditPlaceholder')
                  : t('explorer.manageMySqlUsers.passwordPlaceholder')
              }
              autoComplete="new-password"
            />
          </div>
        )}

        <div className="manage-users-dialog__mysql-flags">
          <label className="manage-users-dialog__checkbox-field">
            <input
              type="checkbox"
              checked={accountLocked}
              onChange={(e) => setAccountLocked(e.target.checked)}
            />
            <span className="manage-users-dialog__checkbox-label">
              {t('explorer.manageMySqlUsers.accountLockedLabel')}
            </span>
          </label>

          <label className="manage-users-dialog__checkbox-field">
            <input
              type="checkbox"
              checked={passwordExpired}
              onChange={(e) => setPasswordExpired(e.target.checked)}
            />
            <span className="manage-users-dialog__checkbox-label">
              {t('explorer.manageMySqlUsers.passwordExpiredLabel')}
            </span>
          </label>
        </div>
      </>
    )
  }

  function renderGlobalPrivilegesTab(): React.JSX.Element {
    return (
      <div className="manage-users-dialog__privileges-grid">
        {globalPrivileges.map((p) => (
          <label key={p.privilege} className="manage-users-dialog__checkbox-field">
            <input
              type="checkbox"
              checked={p.isGranted}
              onChange={() => toggleGlobalPrivilege(p.privilege)}
            />
            <span className="manage-users-dialog__checkbox-label">{p.privilege}</span>
          </label>
        ))}
      </div>
    )
  }

  function renderDatabasePrivilegesTab(): React.JSX.Element {
    const unaddedDbs = databases.filter(
      (db) => !dbPrivileges.some((d) => d.databaseName === db)
    )

    return (
      <div className="manage-users-dialog__db-privs">
        {dbPrivileges.map((dbEntry) => (
          <div key={dbEntry.databaseName} className="manage-users-dialog__db-priv-entry">
            <div
              className="manage-users-dialog__db-priv-header"
              onClick={() =>
                setExpandedDb((prev) => (prev === dbEntry.databaseName ? null : dbEntry.databaseName))
              }
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ')
                  setExpandedDb((prev) =>
                    prev === dbEntry.databaseName ? null : dbEntry.databaseName
                  )
              }}
            >
              <span className="manage-users-dialog__db-priv-name">{dbEntry.databaseName}</span>
              <span className="manage-users-dialog__db-priv-count">
                {dbEntry.privileges.filter((p) => p.isGranted).length} / {dbEntry.privileges.length}
              </span>
              <button
                className="manage-users-dialog__db-priv-remove"
                onClick={(e) => {
                  e.stopPropagation()
                  removeDatabase(dbEntry.databaseName)
                }}
                title="Remove database"
              >
                ×
              </button>
            </div>
            {expandedDb === dbEntry.databaseName && (
              <div className="manage-users-dialog__db-priv-checkboxes">
                {dbEntry.privileges.map((p) => (
                  <label key={p.privilege} className="manage-users-dialog__checkbox-field">
                    <input
                      type="checkbox"
                      checked={p.isGranted}
                      onChange={() => toggleDbPrivilege(dbEntry.databaseName, p.privilege)}
                    />
                    <span className="manage-users-dialog__checkbox-label">{p.privilege}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        ))}

        {unaddedDbs.length > 0 && (
          <div className="manage-users-dialog__db-priv-add-row">
            <select
              className="manage-users-dialog__select"
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) addDatabase(e.target.value)
                e.target.value = ''
              }}
            >
              <option value="" disabled>Add database…</option>
              {unaddedDbs.map((db) => (
                <option key={db} value={db}>{db}</option>
              ))}
            </select>
          </div>
        )}

        {dbPrivileges.length === 0 && unaddedDbs.length === 0 && (
          <div className="manage-users-dialog__empty-state">
            {t('explorer.manageMySqlUsers.dbPrivilegesEmpty')}
          </div>
        )}
      </div>
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
            : t('explorer.manageMySqlUsers.deleteButton')}
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
            : t('explorer.manageMySqlUsers.saveButton')}
        </Button>
      )}
    </div>
  )

  return (
    <BaseDialog
      title={t('explorer.manageMySqlUsers.dialogTitle')}
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
            {t('explorer.manageMySqlUsers.listHeader')}
          </div>
          <div className="manage-users-dialog__list">
            {loadingUsers ? (
              <div className="manage-users-dialog__empty-state">
                {t('common.loading', 'Loading…')}
              </div>
            ) : (
              <>
                {users.map((u) => {
                  const key = makeKey(u.username, u.host)
                  return (
                    <div
                      key={key}
                      className={[
                        'manage-users-dialog__list-item',
                        selectedKey === key && !isAddingNew
                          ? 'manage-users-dialog__list-item--selected'
                          : ''
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onClick={() => void selectUser(u.username, u.host)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ')
                          void selectUser(u.username, u.host)
                      }}
                    >
                      <User size={12} style={{ flexShrink: 0 }} />
                      {key}
                    </div>
                  )
                })}
                {isAddingNew && (
                  <div className="manage-users-dialog__list-item manage-users-dialog__list-item--selected">
                    <User size={12} style={{ flexShrink: 0 }} />
                    {username && host ? makeKey(username, host) : t('explorer.manageMySqlUsers.newUser')}
                  </div>
                )}
              </>
            )}
          </div>
          <button className="manage-users-dialog__list-add" onClick={() => startAddNew()}>
            <Plus size={13} />
            {t('explorer.manageMySqlUsers.addButton')}
          </button>
        </div>

        {/* Right panel */}
        <div className="manage-users-dialog__editor-panel">
          {!showEditor ? (
            <div className="manage-users-dialog__empty-state">
              {t('explorer.manageMySqlUsers.selectOrAdd')}
            </div>
          ) : loadingDetails ? (
            <div className="manage-users-dialog__empty-state">
              {t('common.loading', 'Loading…')}
            </div>
          ) : (
            <>
              <div className="manage-users-dialog__tabs">
                {(['general', 'globalPrivileges', 'databasePrivileges'] as ActiveTab[]).map(
                  (tab) => (
                    <button
                      key={tab}
                      className={`manage-users-dialog__tab${activeTab === tab ? ' manage-users-dialog__tab--active' : ''}`}
                      onClick={() => setActiveTab(tab)}
                    >
                      {t(`explorer.manageMySqlUsers.tab_${tab}`)}
                    </button>
                  )
                )}
              </div>

              <div className="manage-users-dialog__tab-content">
                {activeTab === 'general' && renderGeneralTab()}
                {activeTab === 'globalPrivileges' && renderGlobalPrivilegesTab()}
                {activeTab === 'databasePrivileges' && renderDatabasePrivilegesTab()}
              </div>
            </>
          )}
        </div>
      </div>
    </BaseDialog>
  )
}

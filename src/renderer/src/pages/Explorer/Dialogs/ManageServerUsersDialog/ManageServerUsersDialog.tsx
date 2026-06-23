import { useState, useEffect } from 'react'
import { Plus, User, ShieldCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type {
  ExplorerNode,
  ServerLoginDetails,
  DatabaseMappingEntry,
  DatabaseRoleEntry
} from '../../../../../../preload/index.d'
import './ManageServerUsersDialog.css'
import BaseDialog from '../../../../components/BaseDialog/BaseDialog'
import ErrorBox from '../../../../components/ErrorBox/ErrorBox'
import Button from '../../../../components/Button/Button'

interface ManageServerUsersDialogProps {
  connectionId: string
  initialLoginName?: string
  openOnNew?: boolean
  onClose: () => void
  onSuccess: () => void
}

type AuthType = 'sql' | 'windows' | 'entra'
type ActiveTab = 'general' | 'serverRoles' | 'userMapping'

const PASSWORD_SENTINEL = '•••__unchanged__•••'

function authTypeFromCode(code: ServerLoginDetails['type']): AuthType {
  if (code === 'S') return 'sql'
  if (code === 'E' || code === 'X') return 'entra'
  return 'windows'
}

export default function ManageServerUsersDialog({
  connectionId,
  initialLoginName,
  openOnNew,
  onClose,
  onSuccess
}: ManageServerUsersDialogProps): React.JSX.Element {
  const { t } = useTranslation()

  // ── List ──────────────────────────────────────────────────────────────────
  const [logins, setLogins] = useState<ExplorerNode[]>([])
  const [loadingLogins, setLoadingLogins] = useState(true)

  // ── Selection ─────────────────────────────────────────────────────────────
  const [selectedLoginName, setSelectedLoginName] = useState<string | null>(null)
  const [isAddingNew, setIsAddingNew] = useState(false)
  const [loadingDetails, setLoadingDetails] = useState(false)

  // ── Active tab ────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<ActiveTab>('general')

  // ── General tab form ──────────────────────────────────────────────────────
  const [loginName, setLoginName] = useState('')
  const [authenticationType, setAuthenticationType] = useState<AuthType>('sql')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [mustChangePassword, setMustChangePassword] = useState(false)
  const [enforcePolicy, setEnforcePolicy] = useState(true)
  const [enforceExpiration, setEnforceExpiration] = useState(true)
  const [defaultDatabase, setDefaultDatabase] = useState('master')
  const [defaultLanguage, setDefaultLanguage] = useState('')

  // ── Supplementary data ────────────────────────────────────────────────────
  const [databases, setDatabases] = useState<string[]>([])
  const [languages, setLanguages] = useState<string[]>([])
  const [allServerRoles, setAllServerRoles] = useState<string[]>([])

  // ── Server roles tab ──────────────────────────────────────────────────────
  const [checkedServerRoles, setCheckedServerRoles] = useState<Set<string>>(new Set(['public']))

  // ── User mapping tab ──────────────────────────────────────────────────────
  const [originalMappings, setOriginalMappings] = useState<DatabaseMappingEntry[]>([])
  const [displayMappings, setDisplayMappings] = useState<DatabaseMappingEntry[]>([])
  const [loadingMappings, setLoadingMappings] = useState(false)
  const [loadedDbRoles, setLoadedDbRoles] = useState<Record<string, DatabaseRoleEntry[]>>({})
  const [desiredDbRoles, setDesiredDbRoles] = useState<Record<string, string[]>>({})
  const [dirtyDbs, setDirtyDbs] = useState<Set<string>>(new Set())
  const [selectedMappingDb, setSelectedMappingDb] = useState<string | null>(null)
  const [loadingRolesDbs, setLoadingRolesDbs] = useState<Set<string>>(new Set())

  // ── Action state ──────────────────────────────────────────────────────────
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ── Mount: load list + supplementary data ─────────────────────────────────
  useEffect(() => {
    void (async () => {
      const [loginsResult, dbs, langs, rolesResult] = await Promise.all([
        window.api.database.getChildren(connectionId, 'security:users'),
        window.api.database.listServerDatabases(connectionId),
        window.api.database.listServerLanguages(connectionId),
        window.api.database.getChildren(connectionId, 'security:roles')
      ])

      const loginNodes = loginsResult.status === 'ok' ? loginsResult.children : []
      const roleNames =
        rolesResult.status === 'ok' ? rolesResult.children.map((n) => n.label) : []

      setLogins(loginNodes)
      setDatabases(dbs)
      setLanguages(langs)
      setAllServerRoles(roleNames)
      setLoadingLogins(false)

      if (initialLoginName) {
        await selectLogin(initialLoginName, loginNodes, dbs, roleNames)
      } else if (openOnNew) {
        startAddNew(dbs)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId])

  // ── Select an existing login ───────────────────────────────────────────────
  async function selectLogin(
    name: string,
    loginList?: ExplorerNode[],
    dbList?: string[],
    roleList?: string[]
  ): Promise<void> {
    setIsAddingNew(false)
    setSelectedLoginName(name)
    setError(null)
    setLoadingDetails(true)
    setActiveTab('general')
    resetMappingState()

    void loginList
    void roleList

    try {
      // Load General + Server Roles first so the form shows immediately
      const [details, roles] = await Promise.all([
        window.api.database.getServerLoginDetails(connectionId, name),
        window.api.database.getServerLoginRoles(connectionId, name)
      ])

      if (details) {
        setLoginName(details.name)
        setAuthenticationType(authTypeFromCode(details.type))
        setMustChangePassword(details.mustChangePassword)
        setEnforcePolicy(details.isPolicyChecked)
        setEnforceExpiration(details.isExpirationChecked)
        setDefaultDatabase(details.defaultDatabase || 'master')
        setDefaultLanguage(details.defaultLanguage || '')
        if (details.type === 'S') {
          setPassword(PASSWORD_SENTINEL)
          setConfirmPassword(PASSWORD_SENTINEL)
        } else {
          setPassword('')
          setConfirmPassword('')
        }
      } else {
        setLoginName(name)
        setPassword(PASSWORD_SENTINEL)
        setConfirmPassword(PASSWORD_SENTINEL)
      }
      setCheckedServerRoles(new Set(roles.filter((r) => r.isMember).map((r) => r.roleName)))
      setLoadingDetails(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setLoadingDetails(false)
      return
    }

    // Load User Mapping data in the background (may be slow for many databases)
    setLoadingMappings(true)
    void (async () => {
      try {
        const allDbs = dbList ?? databases
        const mappings = await window.api.database.getServerLoginDatabaseMappings(connectionId, name)

        const mappingsByDb: Record<string, DatabaseMappingEntry> = {}
        for (const m of mappings) mappingsByDb[m.databaseName] = m
        const fullMappings: DatabaseMappingEntry[] = allDbs.map((db) =>
          mappingsByDb[db] ?? { databaseName: db, isMapped: false, userName: null }
        )
        setOriginalMappings(fullMappings)
        // Only update displayMappings if the user hasn't already made changes
        setDirtyDbs((prev) => {
          if (prev.size === 0) setDisplayMappings(fullMappings.map((m) => ({ ...m })))
          return prev
        })
      } catch {
        // Mapping tab will show empty list; user can still save General/Roles changes
      } finally {
        setLoadingMappings(false)
      }
    })()
  }

  // ── Start add-new mode ─────────────────────────────────────────────────────
  function startAddNew(dbList?: string[]): void {
    setSelectedLoginName(null)
    setIsAddingNew(true)
    setError(null)
    setLoginName('')
    setAuthenticationType('sql')
    setPassword('')
    setConfirmPassword('')
    setMustChangePassword(false)
    setEnforcePolicy(true)
    setEnforceExpiration(true)
    setDefaultDatabase('master')
    setDefaultLanguage('')
    setActiveTab('general')

    setCheckedServerRoles(new Set(['public']))

    const allDbs = dbList ?? databases
    const emptyMappings: DatabaseMappingEntry[] = allDbs.map((db) => ({
      databaseName: db,
      isMapped: false,
      userName: null
    }))
    setOriginalMappings(emptyMappings)
    setDisplayMappings(emptyMappings.map((m) => ({ ...m })))
    resetMappingState()
  }

  function resetMappingState(): void {
    setLoadedDbRoles({})
    setDesiredDbRoles({})
    setDirtyDbs(new Set())
    setSelectedMappingDb(null)
    setLoadingRolesDbs(new Set())
    setOriginalMappings([])
    setDisplayMappings([])
    setLoadingMappings(false)
  }

  // ── Reload logins list ─────────────────────────────────────────────────────
  async function reloadLogins(): Promise<void> {
    const result = await window.api.database.getChildren(connectionId, 'security:users')
    if (result.status === 'ok') setLogins(result.children)
  }

  // ── Mapping handlers ───────────────────────────────────────────────────────
  function toggleDbMapping(dbName: string): void {
    const currentMapping = displayMappings.find((m) => m.databaseName === dbName)
    if (!currentMapping) return
    const newMapped = !currentMapping.isMapped
    const originalMapping = originalMappings.find((m) => m.databaseName === dbName)

    setDisplayMappings((prev) =>
      prev.map((m) => (m.databaseName === dbName ? { ...m, isMapped: newMapped } : m))
    )
    setDirtyDbs((prev) => {
      const next = new Set(prev)
      if (newMapped !== (originalMapping?.isMapped ?? false)) next.add(dbName)
      else next.delete(dbName)
      return next
    })
    if (!newMapped) {
      setSelectedMappingDb((prev) => (prev === dbName ? null : prev))
    }
  }

  function handleMappingDbClick(dbName: string): void {
    const mapping = displayMappings.find((m) => m.databaseName === dbName)
    if (!mapping?.isMapped) return
    setSelectedMappingDb(dbName)

    if (loadedDbRoles[dbName] !== undefined || loadingRolesDbs.has(dbName)) return

    setLoadingRolesDbs((prev) => new Set([...prev, dbName]))
    void (async () => {
      const name = selectedLoginName ?? loginName
      const roles = await window.api.database.getDatabaseRolesForLogin(connectionId, dbName, name)
      setLoadedDbRoles((prev) => ({ ...prev, [dbName]: roles }))
      setDesiredDbRoles((prev) => {
        if (prev[dbName] !== undefined) return prev
        return { ...prev, [dbName]: roles.filter((r) => r.isMember).map((r) => r.roleName) }
      })
      setLoadingRolesDbs((prev) => {
        const next = new Set(prev)
        next.delete(dbName)
        return next
      })
    })()
  }

  function toggleDbRole(dbName: string, roleName: string): void {
    setDesiredDbRoles((prev) => {
      const current = prev[dbName] ?? []
      const next = current.includes(roleName)
        ? current.filter((r) => r !== roleName)
        : [...current, roleName]
      return { ...prev, [dbName]: next }
    })
    setDirtyDbs((prev) => new Set([...prev, dbName]))
  }

  // ── Validation ─────────────────────────────────────────────────────────────
  function validate(): string | null {
    if (!loginName.trim()) return t('explorer.manageServerUsers.loginNameRequired')
    if (authenticationType === 'sql') {
      if (isAddingNew) {
        if (!password) return t('explorer.manageServerUsers.passwordRequired')
        if (password !== confirmPassword) return t('explorer.manageServerUsers.passwordMismatch')
      } else if (isEditing) {
        const pwdChanged = !!password && password !== PASSWORD_SENTINEL
        const confirmChanged = !!confirmPassword && confirmPassword !== PASSWORD_SENTINEL
        if (pwdChanged || confirmChanged) {
          if (password !== confirmPassword) return t('explorer.manageServerUsers.passwordMismatch')
        }
      }
    }
    return null
  }

  // ── Save ───────────────────────────────────────────────────────────────────
  async function handleSave(): Promise<void> {
    const validationError = validate()
    if (validationError) { setError(validationError); return }

    setIsSaving(true)
    setError(null)

    const userMappings = [...dirtyDbs].map((dbName) => {
      const mapping = displayMappings.find((m) => m.databaseName === dbName)!
      const originalMapping = originalMappings.find((m) => m.databaseName === dbName)
      return {
        databaseName: dbName,
        isMapped: mapping.isMapped,
        userName: originalMapping?.userName ?? loginName.trim(),
        roles: desiredDbRoles[dbName] ?? []
      }
    })

    const result = await window.api.database.saveServerLogin(connectionId, {
      originalLoginName: selectedLoginName ?? undefined,
      loginName: loginName.trim(),
      authenticationType,
      password:
        authenticationType === 'sql' && password && password !== PASSWORD_SENTINEL
          ? password
          : undefined,
      mustChangePassword: authenticationType === 'sql' ? mustChangePassword : undefined,
      enforcePolicy: authenticationType === 'sql' ? enforcePolicy : undefined,
      enforceExpiration: authenticationType === 'sql' ? enforceExpiration : undefined,
      defaultDatabase,
      defaultLanguage,
      serverRoles: [...checkedServerRoles],
      userMappings
    })

    setIsSaving(false)

    if (result.status === 'error') {
      setError(result.message)
      return
    }

    await reloadLogins()
    if (isAddingNew) setSelectedLoginName(loginName.trim())
    setIsAddingNew(false)
    onSuccess()
  }

  // ── Delete ─────────────────────────────────────────────────────────────────
  async function handleDelete(): Promise<void> {
    if (!selectedLoginName) return
    setIsDeleting(true)
    setError(null)

    const result = await window.api.database.deleteServerLogin(connectionId, selectedLoginName)
    setIsDeleting(false)

    if (result.status === 'error') {
      setError(result.message)
      return
    }

    await reloadLogins()
    setSelectedLoginName(null)
    setIsAddingNew(false)
    onSuccess()
  }

  // ── Render helpers ─────────────────────────────────────────────────────────
  const isEditing = !!selectedLoginName && !isAddingNew
  const showEditor = isAddingNew || !!selectedLoginName
  const canDelete = isEditing && !isSaving && !isDeleting

  function renderGeneralTab(): React.JSX.Element {
    return (
      <>
        <div className="manage-users-dialog__field">
          <label className="manage-users-dialog__label">
            {t('explorer.manageServerUsers.loginNameLabel')}
          </label>
          <input
            className="manage-users-dialog__input"
            type="text"
            value={loginName}
            onChange={(e) => setLoginName(e.target.value)}
            placeholder={t('explorer.manageServerUsers.loginNamePlaceholder')}
            disabled={isEditing}
            autoFocus={!isEditing}
          />
        </div>

        <div className="manage-users-dialog__field">
          <label className="manage-users-dialog__label">
            {t('explorer.manageServerUsers.authTypeLabel')}
          </label>
          <div className="manage-users-dialog__radio-group">
            {(['sql', 'windows', 'entra'] as AuthType[]).map((type) => (
              <label
                key={type}
                className={`manage-users-dialog__radio-label${
                  isEditing ? ' manage-users-dialog__radio-label--disabled' : ''
                }`}
              >
                <input
                  type="radio"
                  name="auth-type"
                  value={type}
                  checked={authenticationType === type}
                  disabled={isEditing}
                  onChange={() => setAuthenticationType(type)}
                />
                {t(`explorer.manageServerUsers.authType_${type}`)}
              </label>
            ))}
          </div>
        </div>

        {authenticationType === 'sql' && (
          <div className="manage-users-dialog__sql-auth-section">
            <div className="manage-users-dialog__field">
              <label className="manage-users-dialog__label">
                {t('explorer.manageServerUsers.passwordLabel')}
              </label>
              <input
                className="manage-users-dialog__input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
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
                placeholder={isEditing ? t('explorer.manageServerUsers.passwordEditPlaceholder') : ''}
                autoComplete="new-password"
              />
            </div>
            <div className="manage-users-dialog__field">
              <label className="manage-users-dialog__label">
                {t('explorer.manageServerUsers.confirmPasswordLabel')}
              </label>
              <input
                className="manage-users-dialog__input"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
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
                autoComplete="new-password"
              />
            </div>
            <label className="manage-users-dialog__checkbox-field">
              <input
                type="checkbox"
                checked={enforcePolicy}
                onChange={(e) => setEnforcePolicy(e.target.checked)}
              />
              <span className="manage-users-dialog__checkbox-label">
                {t('explorer.manageServerUsers.enforcePolicyLabel')}
              </span>
            </label>
            <label className="manage-users-dialog__checkbox-field">
              <input
                type="checkbox"
                checked={enforceExpiration}
                disabled={!enforcePolicy}
                onChange={(e) => setEnforceExpiration(e.target.checked)}
              />
              <span className="manage-users-dialog__checkbox-label">
                {t('explorer.manageServerUsers.enforceExpirationLabel')}
              </span>
            </label>
            <label className="manage-users-dialog__checkbox-field">
              <input
                type="checkbox"
                checked={mustChangePassword}
                disabled={!enforcePolicy}
                onChange={(e) => setMustChangePassword(e.target.checked)}
              />
              <span className="manage-users-dialog__checkbox-label">
                {t('explorer.manageServerUsers.mustChangeLabel')}
              </span>
            </label>
          </div>
        )}

        <div className="manage-users-dialog__field">
          <label className="manage-users-dialog__label">
            {t('explorer.manageServerUsers.defaultDatabaseLabel')}
          </label>
          <select
            className="manage-users-dialog__select"
            value={defaultDatabase}
            onChange={(e) => setDefaultDatabase(e.target.value)}
          >
            {databases.map((db) => (
              <option key={db} value={db}>
                {db}
              </option>
            ))}
          </select>
        </div>

        <div className="manage-users-dialog__field">
          <label className="manage-users-dialog__label">
            {t('explorer.manageServerUsers.defaultLanguageLabel')}
          </label>
          <select
            className="manage-users-dialog__select"
            value={defaultLanguage}
            onChange={(e) => setDefaultLanguage(e.target.value)}
          >
            <option value="">{t('explorer.manageServerUsers.defaultLanguageDefault')}</option>
            {languages.map((lang) => (
              <option key={lang} value={lang}>
                {lang}
              </option>
            ))}
          </select>
        </div>
      </>
    )
  }

  function renderServerRolesTab(): React.JSX.Element {
    if (allServerRoles.length === 0) {
      return (
        <div className="manage-users-dialog__empty-state">
          {t('common.loading', 'Loading…')}
        </div>
      )
    }
    return (
      <div className="manage-users-dialog__roles-list">
        {allServerRoles.map((role) => (
          <label key={role} className="manage-users-dialog__checkbox-field">
            <input
              type="checkbox"
              checked={checkedServerRoles.has(role)}
              disabled={role === 'public'}
              onChange={() => {
                setCheckedServerRoles((prev) => {
                  const next = new Set(prev)
                  if (next.has(role)) next.delete(role)
                  else next.add(role)
                  return next
                })
              }}
            />
            <span className="manage-users-dialog__checkbox-label">{role}</span>
          </label>
        ))}
      </div>
    )
  }

  function renderUserMappingTab(): React.JSX.Element {
    const selectedRoles = selectedMappingDb ? loadedDbRoles[selectedMappingDb] : undefined
    const isLoadingRoles = selectedMappingDb ? loadingRolesDbs.has(selectedMappingDb) : false
    const selectedMapping = selectedMappingDb
      ? displayMappings.find((m) => m.databaseName === selectedMappingDb)
      : null

    if (loadingMappings && displayMappings.length === 0) {
      return (
        <div className="manage-users-dialog__empty-state">
          {t('common.loading', 'Loading…')}
        </div>
      )
    }

    return (
      <div className="manage-users-dialog__mapping-body">
        <div className="manage-users-dialog__mapping-dbs">
          <div className="manage-users-dialog__mapping-header">
            <span />
            <span>{t('explorer.manageServerUsers.databaseColumn')}</span>
          </div>
          {displayMappings.map((mapping) => (
            <div
              key={mapping.databaseName}
              className={[
                'manage-users-dialog__mapping-row',
                selectedMappingDb === mapping.databaseName
                  ? 'manage-users-dialog__mapping-row--selected'
                  : ''
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => handleMappingDbClick(mapping.databaseName)}
              role="row"
            >
              <input
                type="checkbox"
                checked={mapping.isMapped}
                onChange={(e) => {
                  e.stopPropagation()
                  toggleDbMapping(mapping.databaseName)
                }}
                onClick={(e) => e.stopPropagation()}
              />
              <span>{mapping.databaseName}</span>
            </div>
          ))}
        </div>

        {selectedMappingDb && selectedMapping?.isMapped && (
          <div className="manage-users-dialog__roles-panel">
            <div className="manage-users-dialog__roles-panel-header">
              {t('explorer.manageServerUsers.rolesForDatabase', { database: selectedMappingDb })}
            </div>
            <div className="manage-users-dialog__roles-panel-body">
              {isLoadingRoles ? (
                <div className="manage-users-dialog__roles-panel-empty">
                  {t('common.loading', 'Loading…')}
                </div>
              ) : selectedRoles && selectedRoles.length > 0 ? (
                selectedRoles.map((role) => (
                  <label key={role.roleName} className="manage-users-dialog__checkbox-field">
                    <input
                      type="checkbox"
                      checked={
                        desiredDbRoles[selectedMappingDb]?.includes(role.roleName) ?? false
                      }
                      onChange={() => toggleDbRole(selectedMappingDb, role.roleName)}
                    />
                    <span className="manage-users-dialog__checkbox-label">{role.roleName}</span>
                  </label>
                ))
              ) : (
                <div className="manage-users-dialog__roles-panel-empty">
                  {t('explorer.manageServerUsers.noRolesAvailable')}
                </div>
              )}
            </div>
          </div>
        )}

        {(!selectedMappingDb || !selectedMapping?.isMapped) && (
          <div className="manage-users-dialog__roles-panel-empty" style={{ borderTop: '0.0625rem solid var(--color-border)', padding: '1rem' }}>
            {t('explorer.manageServerUsers.selectMappedDatabase')}
          </div>
        )}
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
            : t('explorer.manageServerUsers.deleteButton')}
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
            : t('explorer.manageServerUsers.saveButton')}
        </Button>
      )}
    </div>
  )

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <BaseDialog
      title={t('explorer.manageServerUsers.dialogTitle')}
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
            {t('explorer.manageServerUsers.listHeader')}
          </div>
          <div className="manage-users-dialog__list">
            {loadingLogins ? (
              <div className="manage-users-dialog__empty-state">
                {t('common.loading', 'Loading…')}
              </div>
            ) : (
              <>
                {logins.map((login) => (
                  <div
                    key={login.id}
                    className={[
                      'manage-users-dialog__list-item',
                      selectedLoginName === login.label && !isAddingNew
                        ? 'manage-users-dialog__list-item--selected'
                        : ''
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => void selectLogin(login.label)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') void selectLogin(login.label)
                    }}
                  >
                    <User size={12} style={{ flexShrink: 0 }} />
                    {login.label}
                  </div>
                ))}
                {isAddingNew && (
                  <div className="manage-users-dialog__list-item manage-users-dialog__list-item--selected">
                    <User size={12} style={{ flexShrink: 0 }} />
                    {loginName || t('explorer.manageServerUsers.newLogin')}
                  </div>
                )}
              </>
            )}
          </div>
          <button
            className="manage-users-dialog__list-add"
            onClick={() => startAddNew()}
          >
            <Plus size={13} />
            {t('explorer.manageServerUsers.addButton')}
          </button>
        </div>

        {/* Right panel */}
        <div className="manage-users-dialog__editor-panel">
          {!showEditor ? (
            <div className="manage-users-dialog__empty-state">
              {t('explorer.manageServerUsers.selectOrAdd')}
            </div>
          ) : loadingDetails ? (
            <div className="manage-users-dialog__empty-state">
              {t('common.loading', 'Loading…')}
            </div>
          ) : (
            <>
              {/* Tab bar */}
              <div className="manage-users-dialog__tabs">
                {(['general', 'serverRoles', 'userMapping'] as ActiveTab[]).map((tab) => (
                  <button
                    key={tab}
                    className={`manage-users-dialog__tab${activeTab === tab ? ' manage-users-dialog__tab--active' : ''}`}
                    onClick={() => setActiveTab(tab)}
                  >
                    {t(`explorer.manageServerUsers.tab_${tab}`)}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              <div
                className={`manage-users-dialog__tab-content${activeTab === 'userMapping' ? ' manage-users-dialog__tab-content--mapping' : ''}`}
              >
                {activeTab === 'general' && renderGeneralTab()}
                {activeTab === 'serverRoles' && renderServerRolesTab()}
                {activeTab === 'userMapping' && renderUserMappingTab()}
              </div>
            </>
          )}
        </div>
      </div>
    </BaseDialog>
  )
}

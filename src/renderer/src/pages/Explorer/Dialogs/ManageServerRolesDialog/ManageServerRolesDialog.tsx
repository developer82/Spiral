import { useState, useEffect } from 'react'
import { Plus, Shield } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ExplorerNode, ServerRoleSecurable } from '../../../../../../preload/index.d'
import './ManageServerRolesDialog.css'
import BaseDialog from '../../../../components/BaseDialog/BaseDialog'
import ErrorBox from '../../../../components/ErrorBox/ErrorBox'
import Button from '../../../../components/Button/Button'

interface ManageServerRolesDialogProps {
  connectionId: string
  initialRoleName?: string
  openOnNew?: boolean
  onClose: () => void
  onSuccess: () => void
}

type ActiveTab = 'general' | 'members' | 'memberships'
type PermissionState = 'GRANT' | 'GRANT_WITH_GRANT_OPTION' | 'DENY' | 'NONE'

const SERVER_PERMISSIONS = [
  'ADMINISTER BULK OPERATIONS',
  'ALTER ANY CONNECTION',
  'ALTER ANY CREDENTIAL',
  'ALTER ANY DATABASE',
  'ALTER ANY ENDPOINT',
  'ALTER ANY EVENT NOTIFICATION',
  'ALTER ANY EVENT SESSION',
  'ALTER ANY LINKED SERVER',
  'ALTER ANY LOGIN',
  'ALTER ANY SERVER AUDIT',
  'ALTER ANY SERVER ROLE',
  'ALTER RESOURCES',
  'ALTER SERVER STATE',
  'ALTER SETTINGS',
  'ALTER TRACE',
  'AUTHENTICATE SERVER',
  'CONNECT SQL',
  'CONTROL SERVER',
  'CREATE ANY DATABASE',
  'CREATE AVAILABILITY GROUP',
  'CREATE DDL EVENT NOTIFICATION',
  'CREATE ENDPOINT',
  'CREATE SERVER ROLE',
  'CREATE TRACE EVENT NOTIFICATION',
  'EXTERNAL ACCESS ASSEMBLY',
  'SHUTDOWN',
  'UNSAFE ASSEMBLY',
  'VIEW ANY DATABASE',
  'VIEW ANY DEFINITION',
  'VIEW SERVER STATE',
]

const ENDPOINT_PERMISSIONS = ['ALTER', 'CONNECT', 'CONTROL', 'TAKE OWNERSHIP', 'VIEW DEFINITION']

function permKey(securable: string, permission: string): string {
  return `${securable}::${permission}`
}

export default function ManageServerRolesDialog({
  connectionId,
  initialRoleName,
  openOnNew,
  onClose,
  onSuccess,
}: ManageServerRolesDialogProps): React.JSX.Element {
  const { t } = useTranslation()

  // ── List ──────────────────────────────────────────────────────────────────
  const [roles, setRoles] = useState<ExplorerNode[]>([])
  const [loadingRoles, setLoadingRoles] = useState(true)

  // ── Selection ─────────────────────────────────────────────────────────────
  const [selectedRoleName, setSelectedRoleName] = useState<string | null>(null)
  const [isAddingNew, setIsAddingNew] = useState(false)
  const [loadingDetails, setLoadingDetails] = useState(false)

  // ── Active tab ────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<ActiveTab>('general')

  // ── General tab ───────────────────────────────────────────────────────────
  const [roleName, setRoleName] = useState('')
  const [owner, setOwner] = useState('')
  const [originalOwner, setOriginalOwner] = useState('')
  const [isFixedRole, setIsFixedRole] = useState(false)

  // ── Securables ────────────────────────────────────────────────────────────
  const [selectedSecurable, setSelectedSecurable] = useState<string | null>(null)
  const [permState, setPermState] = useState<Record<string, PermissionState>>({})
  const [originalPermState, setOriginalPermState] = useState<Record<string, PermissionState>>({})
  const [availableEndpoints, setAvailableEndpoints] = useState<string[]>([])

  // ── Members tab ───────────────────────────────────────────────────────────
  const [members, setMembers] = useState<string[]>([])
  const [originalMembers, setOriginalMembers] = useState<string[]>([])
  const [addMemberValue, setAddMemberValue] = useState('')

  // ── Memberships tab ───────────────────────────────────────────────────────
  const [memberships, setMemberships] = useState<string[]>([])
  const [originalMemberships, setOriginalMemberships] = useState<string[]>([])
  const [addMembershipValue, setAddMembershipValue] = useState('')

  // ── Supplementary data ────────────────────────────────────────────────────
  const [availableLogins, setAvailableLogins] = useState<string[]>([])
  const [allRoleNames, setAllRoleNames] = useState<string[]>([])

  // ── Action state ──────────────────────────────────────────────────────────
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ── Mount ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    void (async () => {
      const [rolesResult, loginsResult] = await Promise.all([
        window.api.database.getChildren(connectionId, 'security:roles'),
        window.api.database.getChildren(connectionId, 'security:users'),
      ])

      const roleNodes = rolesResult.status === 'ok' ? rolesResult.children : []
      const loginNames =
        loginsResult.status === 'ok' ? loginsResult.children.map((n) => n.label) : []
      const roleNames = roleNodes.map((n) => n.label)

      setRoles(roleNodes)
      setAvailableLogins(loginNames)
      setAllRoleNames(roleNames)
      setLoadingRoles(false)

      if (initialRoleName) {
        await selectRole(initialRoleName)
      } else if (openOnNew) {
        startAddNew(loginNames[0] ?? 'sa')
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId])

  // ── Select an existing role ───────────────────────────────────────────────
  async function selectRole(name: string): Promise<void> {
    setIsAddingNew(false)
    setSelectedRoleName(name)
    setError(null)
    setLoadingDetails(true)
    setActiveTab('general')
    setSelectedSecurable(null)

    const details = await window.api.database.getServerRoleDetails(connectionId, name)
    if (!details) {
      setLoadingDetails(false)
      return
    }

    setRoleName(details.name)
    setOwner(details.owner)
    setOriginalOwner(details.owner)
    setIsFixedRole(details.isFixedRole)
    setMembers([...details.members])
    setOriginalMembers([...details.members])
    setMemberships([...details.memberships])
    setOriginalMemberships([...details.memberships])
    setAvailableEndpoints(details.endpoints)
    setAddMemberValue('')
    setAddMembershipValue('')

    const newPermState: Record<string, PermissionState> = {}
    for (const s of details.securables) {
      newPermState[permKey(s.securable, s.permission)] = s.state
    }
    setPermState(newPermState)
    setOriginalPermState({ ...newPermState })

    setLoadingDetails(false)
  }

  // ── Start add-new mode ─────────────────────────────────────────────────────
  function startAddNew(defaultOwner: string): void {
    setSelectedRoleName(null)
    setIsAddingNew(true)
    setError(null)
    setRoleName('')
    setOwner(defaultOwner)
    setOriginalOwner('')
    setIsFixedRole(false)
    setMembers([])
    setOriginalMembers([])
    setMemberships([])
    setOriginalMemberships([])
    setPermState({})
    setOriginalPermState({})
    setSelectedSecurable(null)
    setAvailableEndpoints([])
    setAddMemberValue('')
    setAddMembershipValue('')
    setActiveTab('general')
  }

  // ── Reload roles list ─────────────────────────────────────────────────────
  async function reloadRoles(): Promise<void> {
    const result = await window.api.database.getChildren(connectionId, 'security:roles')
    if (result.status === 'ok') {
      setRoles(result.children)
      setAllRoleNames(result.children.map((n) => n.label))
    }
  }

  // ── Save ───────────────────────────────────────────────────────────────────
  async function handleSave(): Promise<void> {
    if (!roleName.trim()) {
      setError(t('explorer.manageServerRoles.roleNameRequired'))
      return
    }

    setIsSaving(true)
    setError(null)

    const securables: ServerRoleSecurable[] = Object.entries(permState)
      .filter(([, state]) => state !== 'NONE')
      .map(([key, state]) => {
        const sepIdx = key.indexOf('::')
        return {
          securable: key.substring(0, sepIdx),
          permission: key.substring(sepIdx + 2),
          state: state as ServerRoleSecurable['state'],
        }
      })

    const originalSecurables: ServerRoleSecurable[] = Object.entries(originalPermState)
      .filter(([, state]) => state !== 'NONE')
      .map(([key, state]) => {
        const sepIdx = key.indexOf('::')
        return {
          securable: key.substring(0, sepIdx),
          permission: key.substring(sepIdx + 2),
          state: state as ServerRoleSecurable['state'],
        }
      })

    const result = await window.api.database.saveServerRole(connectionId, {
      isNew: isAddingNew,
      name: roleName.trim(),
      owner,
      originalOwner,
      members,
      originalMembers,
      memberships,
      originalMemberships,
      securables,
      originalSecurables,
    })

    setIsSaving(false)

    if (result.status === 'error') {
      setError(result.message)
      return
    }

    await reloadRoles()
    if (isAddingNew) {
      setSelectedRoleName(roleName.trim())
      setOriginalOwner(owner)
      setOriginalMembers([...members])
      setOriginalMemberships([...memberships])
      setOriginalPermState({ ...permState })
    }
    setIsAddingNew(false)
    onSuccess()
  }

  // ── Delete ─────────────────────────────────────────────────────────────────
  async function handleDelete(): Promise<void> {
    if (!selectedRoleName) return
    setIsDeleting(true)
    setError(null)

    const result = await window.api.database.deleteServerRole(connectionId, selectedRoleName)
    setIsDeleting(false)

    if (result.status === 'error') {
      setError(result.message)
      return
    }

    await reloadRoles()
    setSelectedRoleName(null)
    setIsAddingNew(false)
    onSuccess()
  }

  // ── Securable helpers ─────────────────────────────────────────────────────
  const securableItems = ['SERVER', ...availableEndpoints]

  function getPermissionsFor(securable: string): string[] {
    return securable === 'SERVER' ? SERVER_PERMISSIONS : ENDPOINT_PERMISSIONS
  }

  function getPermState(securable: string, permission: string): PermissionState {
    return permState[permKey(securable, permission)] ?? 'NONE'
  }

  function setPermForKey(key: string, state: PermissionState): void {
    setPermState((prev) => {
      if (state === 'NONE') {
        const next = { ...prev }
        delete next[key]
        return next
      }
      return { ...prev, [key]: state }
    })
  }

  // ── Member helpers ────────────────────────────────────────────────────────
  const isPublicRole = selectedRoleName?.toLowerCase() === 'public'

  const availableToAddAsMembers = availableLogins.filter((l) => !members.includes(l))
  const availableToAddAsMemberships = allRoleNames.filter(
    (r) => r !== roleName && !memberships.includes(r)
  )

  function addMember(): void {
    if (!addMemberValue || members.includes(addMemberValue)) return
    setMembers((prev) => [...prev, addMemberValue])
    setAddMemberValue('')
  }

  function removeMember(name: string): void {
    setMembers((prev) => prev.filter((m) => m !== name))
  }

  function addMembership(): void {
    if (!addMembershipValue || memberships.includes(addMembershipValue)) return
    setMemberships((prev) => [...prev, addMembershipValue])
    setAddMembershipValue('')
  }

  function removeMembership(name: string): void {
    setMemberships((prev) => prev.filter((m) => m !== name))
  }

  // ── Render helpers ─────────────────────────────────────────────────────────
  const isEditing = !!selectedRoleName && !isAddingNew
  const showEditor = isAddingNew || !!selectedRoleName
  const canDelete = isEditing && !isFixedRole && !isSaving && !isDeleting
  const canSave = showEditor && !isPublicRole
  const ownerOptions = [...new Set([...availableLogins, owner].filter(Boolean))]

  function renderGeneralTab(): React.JSX.Element {
    return (
      <>
        <div className="manage-roles-dialog__field">
          <label className="manage-roles-dialog__label">
            {t('explorer.manageServerRoles.roleNameLabel')}
          </label>
          <input
            className="manage-roles-dialog__input"
            type="text"
            value={roleName}
            onChange={(e) => setRoleName(e.target.value)}
            placeholder={t('explorer.manageServerRoles.roleNamePlaceholder')}
            disabled={isEditing}
            autoFocus={!isEditing}
          />
        </div>

        <div className="manage-roles-dialog__field">
          <label className="manage-roles-dialog__label">
            {t('explorer.manageServerRoles.ownerLabel')}
          </label>
          <select
            className="manage-roles-dialog__select"
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            disabled={isFixedRole || isAddingNew && ownerOptions.length === 0}
          >
            {ownerOptions.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
            {ownerOptions.length === 0 && (
              <option value="sa">sa</option>
            )}
          </select>
        </div>

        {isFixedRole && (
          <div className="manage-roles-dialog__fixed-notice">
            {t('explorer.manageServerRoles.fixedRoleReadOnly')}
          </div>
        )}

        <div className="manage-roles-dialog__securables-wrap">
          <label className="manage-roles-dialog__label">
            {t('explorer.manageServerRoles.secureablesLabel')}
          </label>
          <div className="manage-roles-dialog__securables-body">
            <div className="manage-roles-dialog__securables-list">
              {securableItems.map((sec) => (
                <div
                  key={sec}
                  className={[
                    'manage-roles-dialog__securable-item',
                    selectedSecurable === sec
                      ? 'manage-roles-dialog__securable-item--selected'
                      : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => setSelectedSecurable(sec)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') setSelectedSecurable(sec)
                  }}
                >
                  {sec}
                </div>
              ))}
            </div>

            <div className="manage-roles-dialog__perms-panel">
              {!selectedSecurable ? (
                <div className="manage-roles-dialog__perms-empty">
                  {t('explorer.manageServerRoles.selectSecurable')}
                </div>
              ) : (
                <>
                  <div className="manage-roles-dialog__perms-header">
                    <span>{t('explorer.manageServerRoles.permColumn')}</span>
                    <span>{t('common.state', 'State')}</span>
                  </div>
                  {getPermissionsFor(selectedSecurable).map((perm) => {
                    const key = permKey(selectedSecurable, perm)
                    const currentState = getPermState(selectedSecurable, perm)
                    return (
                      <div key={perm} className="manage-roles-dialog__perms-row">
                        <span>{perm}</span>
                        <select
                          className="manage-roles-dialog__perms-select"
                          value={currentState}
                          onChange={(e) =>
                            setPermForKey(key, e.target.value as PermissionState)
                          }
                          disabled={isFixedRole}
                        >
                          <option value="NONE">None</option>
                          <option value="GRANT">
                            {t('explorer.manageServerRoles.grantColumn')}
                          </option>
                          <option value="GRANT_WITH_GRANT_OPTION">
                            {t('explorer.manageServerRoles.withGrantColumn')}
                          </option>
                          <option value="DENY">
                            {t('explorer.manageServerRoles.denyColumn')}
                          </option>
                        </select>
                      </div>
                    )
                  })}
                </>
              )}
            </div>
          </div>
        </div>
      </>
    )
  }

  function renderMembersTab(): React.JSX.Element {
    const canEditMembers = !isPublicRole

    if (isPublicRole) {
      return (
        <div className="manage-roles-dialog__public-notice">
          All server principals are automatically members of the public role. Membership cannot be
          modified.
        </div>
      )
    }

    return (
      <div className="manage-roles-dialog__members-body">
        <div className="manage-roles-dialog__member-list">
          <div className="manage-roles-dialog__member-header">
            {t('explorer.manageServerRoles.membersHeader')}
          </div>
          {members.length === 0 ? (
            <div className="manage-roles-dialog__member-empty">
              {t('explorer.manageServerRoles.noMembers')}
            </div>
          ) : (
            members.map((m) => (
              <div key={m} className="manage-roles-dialog__member-row">
                <span>{m}</span>
                <button
                  className="manage-roles-dialog__member-remove"
                  onClick={() => removeMember(m)}
                  disabled={!canEditMembers}
                  title={t('common.remove', 'Remove')}
                >
                  ✕
                </button>
              </div>
            ))
          )}
        </div>
        <div className="manage-roles-dialog__member-add-row">
          <select
            className="manage-roles-dialog__select"
            value={addMemberValue}
            onChange={(e) => setAddMemberValue(e.target.value)}
            disabled={!canEditMembers || availableToAddAsMembers.length === 0}
          >
            <option value="">{t('explorer.manageServerRoles.addMemberPlaceholder')}</option>
            {availableToAddAsMembers.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
          <button
            className="manage-roles-dialog__member-add-btn"
            onClick={addMember}
            disabled={!canEditMembers || !addMemberValue}
          >
            <Plus size={13} />
          </button>
        </div>
      </div>
    )
  }

  function renderMembershipsTab(): React.JSX.Element {
    const canEditMemberships = !isFixedRole

    return (
      <div className="manage-roles-dialog__members-body">
        <div className="manage-roles-dialog__member-list">
          <div className="manage-roles-dialog__member-header">
            {t('explorer.manageServerRoles.membershipsHeader')}
          </div>
          {memberships.length === 0 ? (
            <div className="manage-roles-dialog__member-empty">
              {t('explorer.manageServerRoles.noMemberships')}
            </div>
          ) : (
            memberships.map((m) => (
              <div key={m} className="manage-roles-dialog__member-row">
                <span>{m}</span>
                <button
                  className="manage-roles-dialog__member-remove"
                  onClick={() => removeMembership(m)}
                  disabled={!canEditMemberships}
                  title={t('common.remove', 'Remove')}
                >
                  ✕
                </button>
              </div>
            ))
          )}
        </div>
        <div className="manage-roles-dialog__member-add-row">
          <select
            className="manage-roles-dialog__select"
            value={addMembershipValue}
            onChange={(e) => setAddMembershipValue(e.target.value)}
            disabled={!canEditMemberships || availableToAddAsMemberships.length === 0}
          >
            <option value="">{t('explorer.manageServerRoles.addMembershipPlaceholder')}</option>
            {availableToAddAsMemberships.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <button
            className="manage-roles-dialog__member-add-btn"
            onClick={addMembership}
            disabled={!canEditMemberships || !addMembershipValue}
          >
            <Plus size={13} />
          </button>
        </div>
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
            : t('explorer.manageServerRoles.deleteButton')}
        </Button>
      )}
      {canSave && (
        <Button
              variant="primary"
          onClick={() => void handleSave()}
          disabled={isSaving || isDeleting}
        >
          {isSaving
            ? t('common.saving', 'Saving…')
            : t('explorer.manageServerRoles.saveButton')}
        </Button>
      )}
    </div>
  )

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <BaseDialog
      title={t('explorer.manageServerRoles.dialogTitle')}
      icon={<Shield size={16} />}
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
      <div className="manage-roles-dialog__body">
        {/* Left panel */}
        <div className="manage-roles-dialog__list-panel">
          <div className="manage-roles-dialog__list-header">
            {t('explorer.manageServerRoles.listHeader')}
          </div>
          <div className="manage-roles-dialog__list">
            {loadingRoles ? (
              <div className="manage-roles-dialog__empty-state">
                {t('common.loading', 'Loading…')}
              </div>
            ) : (
              <>
                {roles.map((role) => (
                  <div
                    key={role.id}
                    className={[
                      'manage-roles-dialog__list-item',
                      selectedRoleName === role.label && !isAddingNew
                        ? 'manage-roles-dialog__list-item--selected'
                        : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => void selectRole(role.label)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') void selectRole(role.label)
                    }}
                  >
                    <Shield size={12} style={{ flexShrink: 0 }} />
                    {role.label}
                  </div>
                ))}
                {isAddingNew && (
                  <div className="manage-roles-dialog__list-item manage-roles-dialog__list-item--selected">
                    <Shield size={12} style={{ flexShrink: 0 }} />
                    {roleName || t('explorer.manageServerRoles.newRole')}
                  </div>
                )}
              </>
            )}
          </div>
          <button
            className="manage-roles-dialog__list-add"
            onClick={() => startAddNew(availableLogins[0] ?? 'sa')}
          >
            <Plus size={13} />
            {t('explorer.manageServerRoles.addButton')}
          </button>
        </div>

        {/* Right panel */}
        <div className="manage-roles-dialog__editor-panel">
          {!showEditor ? (
            <div className="manage-roles-dialog__empty-state">
              {t('explorer.manageServerRoles.selectOrAdd')}
            </div>
          ) : loadingDetails ? (
            <div className="manage-roles-dialog__empty-state">
              {t('common.loading', 'Loading…')}
            </div>
          ) : (
            <>
              {/* Tab bar */}
              <div className="manage-roles-dialog__tabs">
                {(['general', 'members', 'memberships'] as ActiveTab[]).map((tab) => (
                  <button
                    key={tab}
                    className={`manage-roles-dialog__tab${activeTab === tab ? ' manage-roles-dialog__tab--active' : ''}`}
                    onClick={() => setActiveTab(tab)}
                  >
                    {t(`explorer.manageServerRoles.tab_${tab}`)}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              <div
                className={`manage-roles-dialog__tab-content${
                  activeTab !== 'general' ? ' manage-roles-dialog__tab-content--members' : ''
                }`}
              >
                {activeTab === 'general' && renderGeneralTab()}
                {activeTab === 'members' && renderMembersTab()}
                {activeTab === 'memberships' && renderMembershipsTab()}
              </div>
            </>
          )}
        </div>
      </div>
    </BaseDialog>
  )
}

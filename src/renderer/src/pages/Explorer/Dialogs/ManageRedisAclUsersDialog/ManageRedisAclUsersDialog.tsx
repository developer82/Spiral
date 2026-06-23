import { useState, useEffect, useRef } from 'react'
import { Plus, User, ShieldCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type {
  RedisAclUserDetails
} from '../../../../../../preload/index.d'
import './ManageRedisAclUsersDialog.css'
import BaseDialog from '../../../../components/BaseDialog/BaseDialog'
import ErrorBox from '../../../../components/ErrorBox/ErrorBox'
import Button from '../../../../components/Button/Button'

interface ManageRedisAclUsersDialogProps {
  connectionId: string
  initialUsername?: string
  openOnNew?: boolean
  onClose: () => void
  onSuccess: () => void
}

type ActiveTab = 'general' | 'commands' | 'keys'

const PASSWORD_SENTINEL = '•••__unchanged__•••'

const ACL_CATEGORIES = [
  '@read', '@write', '@string', '@hash', '@list', '@set', '@sortedset',
  '@geo', '@stream', '@pubsub', '@admin', '@dangerous', '@scripting', '@transactions'
]

export default function ManageRedisAclUsersDialog({
  connectionId,
  initialUsername,
  openOnNew,
  onClose,
  onSuccess
}: ManageRedisAclUsersDialogProps): React.JSX.Element {
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
  const [enabled, setEnabled] = useState(true)
  const [nopass, setNopass] = useState(false)

  // ── Commands tab ──────────────────────────────────────────────────────────
  const [allCommands, setAllCommands] = useState(false)
  const [categories, setCategories] = useState<string[]>([])

  // ── Keys & Channels tab ───────────────────────────────────────────────────
  const [allKeys, setAllKeys] = useState(false)
  const [keyPatterns, setKeyPatterns] = useState<string[]>([])
  const [newKeyPattern, setNewKeyPattern] = useState('')
  const [allChannels, setAllChannels] = useState(false)
  const [channelPatterns, setChannelPatterns] = useState<string[]>([])
  const [newChannelPattern, setNewChannelPattern] = useState('')

  // ── Action state ──────────────────────────────────────────────────────────
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const keyInputRef = useRef<HTMLInputElement>(null)
  const channelInputRef = useRef<HTMLInputElement>(null)

  // ── Mount ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    void (async () => {
      const result = await window.api.database.getChildren(connectionId, 'security:users')
      const userNodes = result.status === 'ok' ? result.children : []
      const names = userNodes.map((n) => n.label)
      setUsers(names)
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
      const details: RedisAclUserDetails | null = await window.api.database.getRedisAclUserDetails(connectionId, name)
      if (details) {
        applyDetails(details)
      }
      setLoadingDetails(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setLoadingDetails(false)
    }
  }

  function applyDetails(details: RedisAclUserDetails): void {
    setUsername(details.username)
    setEnabled(details.enabled)
    setNopass(details.nopass)
    setAllCommands(details.allCommands)
    setCategories(details.categories)
    setAllKeys(details.allKeys)
    setKeyPatterns(details.keyPatterns)
    setAllChannels(details.allChannels)
    setChannelPatterns(details.channelPatterns)
  }

  function startAddNew(): void {
    setSelectedUsername(null)
    setIsAddingNew(true)
    setError(null)
    setUsername('')
    setPassword('')
    setConfirmPassword('')
    setEnabled(true)
    setNopass(false)
    setAllCommands(false)
    setCategories([])
    setAllKeys(false)
    setKeyPatterns([])
    setNewKeyPattern('')
    setAllChannels(false)
    setChannelPatterns([])
    setNewChannelPattern('')
    setActiveTab('general')
  }

  async function reloadUsers(): Promise<void> {
    const result = await window.api.database.getChildren(connectionId, 'security:users')
    if (result.status === 'ok') {
      setUsers(result.children.map((n) => n.label))
    }
  }

  function validate(): string | null {
    if (!username.trim()) return t('explorer.manageRedisAclUsers.usernameRequired')
    if (isAddingNew) {
      if (password && password !== confirmPassword) return t('explorer.manageRedisAclUsers.passwordMismatch')
    } else {
      const pwdChanged = !!password && password !== PASSWORD_SENTINEL
      const confirmChanged = !!confirmPassword && confirmPassword !== PASSWORD_SENTINEL
      if ((pwdChanged || confirmChanged) && password !== confirmPassword)
        return t('explorer.manageRedisAclUsers.passwordMismatch')
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

    const result = await window.api.database.saveRedisAclUser(connectionId, {
      originalUsername: isAddingNew ? undefined : selectedUsername ?? undefined,
      username: username.trim(),
      password: password && password !== PASSWORD_SENTINEL ? password : undefined,
      enabled,
      nopass,
      allCommands,
      categories,
      allKeys,
      keyPatterns,
      allChannels,
      channelPatterns
    })

    setIsSaving(false)

    if (result.status === 'error') {
      setError(result.message)
      return
    }

    await reloadUsers()
    const newName = username.trim()
    if (isAddingNew) setSelectedUsername(newName)
    setIsAddingNew(false)
    onSuccess()
  }

  async function handleDelete(): Promise<void> {
    if (!selectedUsername) return
    setIsDeleting(true)
    setError(null)

    const result = await window.api.database.deleteRedisAclUser(connectionId, selectedUsername)
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

  function toggleCategory(cat: string): void {
    setCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    )
  }

  function addKeyPattern(): void {
    const p = newKeyPattern.trim()
    if (!p || keyPatterns.includes(p)) return
    setKeyPatterns((prev) => [...prev, p])
    setNewKeyPattern('')
    keyInputRef.current?.focus()
  }

  function addChannelPattern(): void {
    const p = newChannelPattern.trim()
    if (!p || channelPatterns.includes(p)) return
    setChannelPatterns((prev) => [...prev, p])
    setNewChannelPattern('')
    channelInputRef.current?.focus()
  }

  // ── Render helpers ─────────────────────────────────────────────────────────
  const isEditing = !!selectedUsername && !isAddingNew
  const showEditor = isAddingNew || !!selectedUsername
  const canDelete = isEditing && !isSaving && !isDeleting && selectedUsername !== 'default'

  function renderGeneralTab(): React.JSX.Element {
    return (
      <>
        <div className="manage-users-dialog__field">
          <label className="manage-users-dialog__label">
            {t('explorer.manageRedisAclUsers.usernameLabel')}
          </label>
          <input
            className="manage-users-dialog__input"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder={t('explorer.manageRedisAclUsers.usernamePlaceholder')}
            disabled={isEditing}
            autoFocus={!isEditing}
          />
        </div>

        <div className="manage-users-dialog__field">
          <label className="manage-users-dialog__label">
            {t('explorer.manageRedisAclUsers.passwordLabel')}
          </label>
          <input
            className="manage-users-dialog__input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={isEditing ? t('explorer.manageRedisAclUsers.passwordEditPlaceholder') : t('explorer.manageRedisAclUsers.passwordPlaceholder')}
            disabled={nopass}
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
            {t('explorer.manageRedisAclUsers.confirmPasswordLabel')}
          </label>
          <input
            className="manage-users-dialog__input"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder={t('explorer.manageRedisAclUsers.confirmPasswordPlaceholder')}
            disabled={nopass}
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

        <div className="manage-users-dialog__field">
          <label className="manage-users-dialog__checkbox-field">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            <span className="manage-users-dialog__checkbox-label">
              {t('explorer.manageRedisAclUsers.enabledLabel')}
            </span>
          </label>
        </div>

        <div className="manage-users-dialog__field">
          <label className="manage-users-dialog__checkbox-field">
            <input
              type="checkbox"
              checked={nopass}
              onChange={(e) => {
                setNopass(e.target.checked)
                if (e.target.checked) {
                  setPassword('')
                  setConfirmPassword('')
                } else if (isEditing) {
                  setPassword(PASSWORD_SENTINEL)
                  setConfirmPassword(PASSWORD_SENTINEL)
                }
              }}
            />
            <span className="manage-users-dialog__checkbox-label">
              {t('explorer.manageRedisAclUsers.nopassLabel')}
            </span>
          </label>
        </div>
      </>
    )
  }

  function renderCommandsTab(): React.JSX.Element {
    return (
      <>
        <div className="manage-users-dialog__field">
          <label className="manage-users-dialog__checkbox-field">
            <input
              type="checkbox"
              checked={allCommands}
              onChange={(e) => {
                setAllCommands(e.target.checked)
                if (e.target.checked) setCategories([])
              }}
            />
            <span className="manage-users-dialog__checkbox-label">
              {t('explorer.manageRedisAclUsers.allCommandsLabel')}
            </span>
          </label>
        </div>

        {!allCommands && (
          <div className="redis-acl__categories-grid">
            {ACL_CATEGORIES.map((cat) => (
              <label key={cat} className="manage-users-dialog__checkbox-field">
                <input
                  type="checkbox"
                  checked={categories.includes(cat)}
                  onChange={() => toggleCategory(cat)}
                />
                <span className="manage-users-dialog__checkbox-label">{cat}</span>
              </label>
            ))}
          </div>
        )}
      </>
    )
  }

  function renderKeysTab(): React.JSX.Element {
    return (
      <>
        <div className="redis-acl__section">
          <div className="redis-acl__section-title">
            {t('explorer.manageRedisAclUsers.keyPatternsLabel')}
          </div>

          <label className="manage-users-dialog__checkbox-field">
            <input
              type="checkbox"
              checked={allKeys}
              onChange={(e) => {
                setAllKeys(e.target.checked)
                if (e.target.checked) setKeyPatterns([])
              }}
            />
            <span className="manage-users-dialog__checkbox-label">
              {t('explorer.manageRedisAclUsers.allKeysLabel')}
            </span>
          </label>

          {!allKeys && (
            <>
              <div className="redis-acl__patterns">
                {keyPatterns.map((p) => (
                  <span key={p} className="redis-acl__chip">
                    {p}
                    <button
                      className="redis-acl__chip-remove"
                      onClick={() => setKeyPatterns((prev) => prev.filter((x) => x !== p))}
                      title="Remove"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <div className="redis-acl__add-row">
                <input
                  ref={keyInputRef}
                  className="redis-acl__add-input"
                  type="text"
                  value={newKeyPattern}
                  onChange={(e) => setNewKeyPattern(e.target.value)}
                  placeholder={t('explorer.manageRedisAclUsers.addKeyPatternPlaceholder')}
                  onKeyDown={(e) => { if (e.key === 'Enter') addKeyPattern() }}
                />
                <button className="redis-acl__add-btn" onClick={addKeyPattern}>
                  {t('explorer.manageRedisAclUsers.addPatternButton')}
                </button>
              </div>
            </>
          )}
        </div>

        <div className="redis-acl__section">
          <div className="redis-acl__section-title">
            {t('explorer.manageRedisAclUsers.channelPatternsLabel')}
          </div>

          <label className="manage-users-dialog__checkbox-field">
            <input
              type="checkbox"
              checked={allChannels}
              onChange={(e) => {
                setAllChannels(e.target.checked)
                if (e.target.checked) setChannelPatterns([])
              }}
            />
            <span className="manage-users-dialog__checkbox-label">
              {t('explorer.manageRedisAclUsers.allChannelsLabel')}
            </span>
          </label>

          {!allChannels && (
            <>
              <div className="redis-acl__patterns">
                {channelPatterns.map((p) => (
                  <span key={p} className="redis-acl__chip">
                    {p}
                    <button
                      className="redis-acl__chip-remove"
                      onClick={() => setChannelPatterns((prev) => prev.filter((x) => x !== p))}
                      title="Remove"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <div className="redis-acl__add-row">
                <input
                  ref={channelInputRef}
                  className="redis-acl__add-input"
                  type="text"
                  value={newChannelPattern}
                  onChange={(e) => setNewChannelPattern(e.target.value)}
                  placeholder={t('explorer.manageRedisAclUsers.addChannelPatternPlaceholder')}
                  onKeyDown={(e) => { if (e.key === 'Enter') addChannelPattern() }}
                />
                <button className="redis-acl__add-btn" onClick={addChannelPattern}>
                  {t('explorer.manageRedisAclUsers.addPatternButton')}
                </button>
              </div>
            </>
          )}
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
            : t('explorer.manageRedisAclUsers.deleteButton')}
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
            : t('explorer.manageRedisAclUsers.saveButton')}
        </Button>
      )}
    </div>
  )

  return (
    <BaseDialog
      title={t('explorer.manageRedisAclUsers.dialogTitle')}
      icon={<ShieldCheck size={16} />}
      onClose={onClose}
      width="90vw"
      maxWidth="900px"
      height="90vh"
      maxHeight="720px"
      minWidth="720px"
      minHeight="480px"
      footerSpaceBetween
      footer={showEditor ? <>{footerLeft}{footerRight}</> : undefined}
    >
      <div className="manage-users-dialog__body">
        {/* Left panel */}
        <div className="manage-users-dialog__list-panel">
          <div className="manage-users-dialog__list-header">
            {t('explorer.manageRedisAclUsers.listHeader')}
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
                    {username || t('explorer.manageRedisAclUsers.newUser')}
                  </div>
                )}
              </>
            )}
          </div>
          <button className="manage-users-dialog__list-add" onClick={() => startAddNew()}>
            <Plus size={13} />
            {t('explorer.manageRedisAclUsers.addButton')}
          </button>
        </div>

        {/* Right panel */}
        <div className="manage-users-dialog__editor-panel">
          {!showEditor ? (
            <div className="manage-users-dialog__empty-state">
              {t('explorer.manageRedisAclUsers.selectOrAdd')}
            </div>
          ) : loadingDetails ? (
            <div className="manage-users-dialog__empty-state">
              {t('common.loading', 'Loading…')}
            </div>
          ) : (
            <>
              <div className="manage-users-dialog__tabs">
                {(['general', 'commands', 'keys'] as ActiveTab[]).map((tab) => (
                  <button
                    key={tab}
                    className={`manage-users-dialog__tab${activeTab === tab ? ' manage-users-dialog__tab--active' : ''}`}
                    onClick={() => setActiveTab(tab)}
                  >
                    {t(`explorer.manageRedisAclUsers.tab_${tab}`)}
                  </button>
                ))}
              </div>

              <div className="manage-users-dialog__tab-content">
                {activeTab === 'general' && renderGeneralTab()}
                {activeTab === 'commands' && renderCommandsTab()}
                {activeTab === 'keys' && renderKeysTab()}
              </div>
            </>
          )}
        </div>
      </div>
    </BaseDialog>
  )
}

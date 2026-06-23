import { useState, useEffect } from 'react'
import { User, ShieldCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import './ManageMySqlDatabaseUsersDialog.css'
import BaseDialog from '../../../../components/BaseDialog/BaseDialog'
import ErrorBox from '../../../../components/ErrorBox/ErrorBox'
import Button from '../../../../components/Button/Button'

interface ManageMySqlDatabaseUsersDialogProps {
  connectionId: string
  databaseName: string
  initialUserKey?: string
  onClose: () => void
  onSuccess: () => void
}

const DATABASE_PRIVILEGES = [
  'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP',
  'ALTER', 'INDEX', 'CREATE VIEW', 'SHOW VIEW'
]

export default function ManageMySqlDatabaseUsersDialog({
  connectionId,
  databaseName,
  initialUserKey,
  onClose,
  onSuccess
}: ManageMySqlDatabaseUsersDialogProps): React.JSX.Element {
  const { t } = useTranslation()

  // ── List ──────────────────────────────────────────────────────────────────
  const [users, setUsers] = useState<{ username: string; host: string }[]>([])
  const [loadingUsers, setLoadingUsers] = useState(true)

  // ── Selection ─────────────────────────────────────────────────────────────
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [loadingPrivileges, setLoadingPrivileges] = useState(false)

  // ── Privileges for selected user on this database ─────────────────────────
  const [checkedPrivileges, setCheckedPrivileges] = useState<Set<string>>(new Set())

  // ── Action state ──────────────────────────────────────────────────────────
  const [isSaving, setIsSaving] = useState(false)
  const [isRevoking, setIsRevoking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ── Mount: load users with access to this database ────────────────────────
  useEffect(() => {
    void (async () => {
      const result = await window.api.database.getMySqlDatabaseUsers(connectionId, databaseName)
      setUsers(result)
      setLoadingUsers(false)

      if (initialUserKey) {
        const at = initialUserKey.lastIndexOf('@')
        await selectUser(initialUserKey.slice(0, at), initialUserKey.slice(at + 1))
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId, databaseName])

  function makeKey(u: string, h: string): string {
    return `${u}@${h}`
  }

  async function selectUser(u: string, h: string): Promise<void> {
    const key = makeKey(u, h)
    setSelectedKey(key)
    setError(null)
    setLoadingPrivileges(true)

    try {
      const dbPrivs = await window.api.database.getMySqlUserDatabasePrivileges(
        connectionId,
        u,
        h
      )
      const entry = dbPrivs.find((d) => d.databaseName === databaseName)
      const granted = new Set(
        entry ? entry.privileges.filter((p) => p.isGranted).map((p) => p.privilege) : []
      )
      setCheckedPrivileges(granted)
      setLoadingPrivileges(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setLoadingPrivileges(false)
    }
  }

  async function reloadUsers(): Promise<void> {
    const result = await window.api.database.getMySqlDatabaseUsers(connectionId, databaseName)
    setUsers(result)
  }

  async function handleSave(): Promise<void> {
    const user = users.find((u) => makeKey(u.username, u.host) === selectedKey)
    if (!user) return

    setIsSaving(true)
    setError(null)

    const result = await window.api.database.saveMySqlDatabaseUserPrivileges(connectionId, {
      username: user.username,
      host: user.host,
      databaseName,
      privileges: [...checkedPrivileges]
    })

    setIsSaving(false)

    if (result.status === 'error') {
      setError(result.message)
      return
    }

    await reloadUsers()
    onSuccess()
  }

  async function handleRevokeAll(): Promise<void> {
    const user = users.find((u) => makeKey(u.username, u.host) === selectedKey)
    if (!user) return

    setIsRevoking(true)
    setError(null)

    const result = await window.api.database.saveMySqlDatabaseUserPrivileges(connectionId, {
      username: user.username,
      host: user.host,
      databaseName,
      privileges: []
    })

    setIsRevoking(false)

    if (result.status === 'error') {
      setError(result.message)
      return
    }

    await reloadUsers()
    setSelectedKey(null)
    setCheckedPrivileges(new Set())
    onSuccess()
  }

  const showEditor = !!selectedKey
  const canRevoke = showEditor && !isSaving && !isRevoking

  const footerLeft = error ? <ErrorBox error={error} /> : <span />

  const footerRight = (
    <div className="dialog__footer-right">
      {canRevoke && (
        <Button
              variant="danger"
          onClick={() => void handleRevokeAll()}
          disabled={isRevoking || isSaving}
        >
          {isRevoking
            ? t('common.deleting', 'Revoking…')
            : t('explorer.manageMySqlDatabaseUsers.deleteButton')}
        </Button>
      )}
      {showEditor && (
        <Button
              variant="primary"
          onClick={() => void handleSave()}
          disabled={isSaving || isRevoking}
        >
          {isSaving
            ? t('common.saving', 'Saving…')
            : t('explorer.manageMySqlDatabaseUsers.saveButton')}
        </Button>
      )}
    </div>
  )

  return (
    <BaseDialog
      title={`${t('explorer.manageMySqlDatabaseUsers.dialogTitle')} — ${databaseName}`}
      icon={<ShieldCheck size={16} />}
      onClose={onClose}
      width="70vw"
      maxWidth="780px"
      height="80vh"
      maxHeight="640px"
      minWidth="580px"
      minHeight="400px"
      footerSpaceBetween
      footer={showEditor ? <>{footerLeft}{footerRight}</> : undefined}
    >
      <div className="manage-users-dialog__body">
        {/* Left panel */}
        <div className="manage-users-dialog__list-panel">
          <div className="manage-users-dialog__list-header">
            {t('explorer.manageMySqlDatabaseUsers.listHeader')}
          </div>
          <div className="manage-users-dialog__list">
            {loadingUsers ? (
              <div className="manage-users-dialog__empty-state">
                {t('common.loading', 'Loading…')}
              </div>
            ) : users.length === 0 ? (
              <div className="manage-users-dialog__empty-state">
                {t('explorer.manageMySqlDatabaseUsers.noUsers')}
              </div>
            ) : (
              users.map((u) => {
                const key = makeKey(u.username, u.host)
                return (
                  <div
                    key={key}
                    className={[
                      'manage-users-dialog__list-item',
                      selectedKey === key ? 'manage-users-dialog__list-item--selected' : ''
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
              })
            )}
          </div>
        </div>

        {/* Right panel */}
        <div className="manage-users-dialog__editor-panel">
          {!showEditor ? (
            <div className="manage-users-dialog__empty-state">
              {t('explorer.manageMySqlDatabaseUsers.selectOrAdd')}
            </div>
          ) : loadingPrivileges ? (
            <div className="manage-users-dialog__empty-state">
              {t('common.loading', 'Loading…')}
            </div>
          ) : (
            <>
              <div className="manage-users-dialog__tabs">
                <button className="manage-users-dialog__tab manage-users-dialog__tab--active">
                  {t('explorer.manageMySqlDatabaseUsers.tab_privileges')}
                </button>
              </div>

              <div className="manage-users-dialog__tab-content">
                <div className="manage-users-dialog__privileges-grid">
                  {DATABASE_PRIVILEGES.map((p) => (
                    <label key={p} className="manage-users-dialog__checkbox-field">
                      <input
                        type="checkbox"
                        checked={checkedPrivileges.has(p)}
                        onChange={() => {
                          setCheckedPrivileges((prev) => {
                            const next = new Set(prev)
                            if (next.has(p)) next.delete(p)
                            else next.add(p)
                            return next
                          })
                        }}
                      />
                      <span className="manage-users-dialog__checkbox-label">{p}</span>
                    </label>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </BaseDialog>
  )
}

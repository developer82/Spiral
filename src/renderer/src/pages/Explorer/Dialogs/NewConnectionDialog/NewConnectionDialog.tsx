import { useState, useEffect } from 'react'
import type { ChangeEvent, InputHTMLAttributes } from 'react'
import { CheckCircle, FolderOpen, FolderKey, Pencil, Trash2, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ConnectionRecord, ConnectionUserProfile } from '../../connections.types'
import { PROVIDER_LIST, PROVIDER_METADATA } from '../../providerMetadata'
import SearchableSelect from '../../../../components/SearchableSelect/SearchableSelect'
import Toggle from '../../../../components/Toggle/Toggle'
import type { EnvironmentDefinition } from '../../../Settings/useSettings'
import BaseDialog from '../../../../components/BaseDialog/BaseDialog'
import Button from '../../../../components/Button/Button'
import ErrorBox from '../../../../components/ErrorBox/ErrorBox'
import { useConfetti } from '../../../../hooks/useConfetti'
import AddEditUserModal from './AddEditUserModal'
import './NewConnectionDialog.css'

type FormData = Omit<ConnectionRecord, 'id'>
type FormErrors = Partial<Record<keyof FormData, string>>

type TestStatus = 'idle' | 'testing' | 'success' | 'error'

type ConnectionDialogTab = 'details' | 'connectionString' | 'options' | 'users'

type ConnectionInputProps = InputHTMLAttributes<HTMLInputElement>

export function ConnectionInput({
  className = '',
  type = 'text',
  value,
  disabled,
  readOnly,
  onChange,
  ...props
}: ConnectionInputProps): React.JSX.Element {
  const stringValue = String(value ?? '')
  const isClearableType = type === 'text' || type === 'password' || type === 'search'
  const showClear = isClearableType && !disabled && !readOnly && stringValue.length > 0

  function handleClear(): void {
    onChange?.({
      target: { value: '' },
      currentTarget: { value: '' }
    } as ChangeEvent<HTMLInputElement>)
  }

  return (
    <div className="conn-dialog__input-wrap">
      <input
        {...props}
        className={className}
        type={type}
        value={value}
        disabled={disabled}
        readOnly={readOnly}
        onChange={onChange}
      />
      {showClear && (
        <button
          type="button"
          className="conn-dialog__input-clear"
          aria-label="Clear"
          onMouseDown={(event) => event.preventDefault()}
          onClick={handleClear}
        >
          <X size={13} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}

const EMPTY_FORM: FormData = {
  name: '',
  provider: PROVIDER_LIST[0].value,
  host: '',
  port: PROVIDER_LIST[0].meta.defaultPort ?? 1433,
  username: '',
  password: '',
  rememberPassword: false,
  defaultDatabase: '',
  filePath: '',
  color: '',
  environmentId: undefined,
  autoConnect: false,
  eagerLoading: false,
  backgroundAutoRefresh: false,
  additionalUsers: [],
  // Redis defaults
  redisMode: 'standalone',
  sentinelMasterName: '',
  sentinelNodes: '',
  tlsEnabled: false,
  tlsServername: '',
  tlsRejectUnauthorized: true,
  sshEnabled: false,
  sshHost: '',
  sshPort: 22,
  sshUsername: '',
  sshAuthMode: 'password',
  sshPassword: '',
  sshPrivateKeyPath: '',
  sshPassphrase: '',
  redisHideEmptyDatabases: false,
  // MongoDB defaults
  mongodbSrv: false,
  mongodbUri: '',
  mongodbAuthMechanism: 'SCRAM-SHA-256',
  mongodbAuthSource: '',
  mongodbAuthMechanismProperties: '',
  mongodbReplicaSet: '',
  mongodbDirectConnection: false,
  tlsCAFile: '',
  tlsCertificateKeyFile: '',
  tlsCertificateKeyFilePassword: '',
  tlsAllowInvalidHostnames: false,
  tlsAllowInvalidCertificates: false,
  // PostgreSQL defaults
  postgresSslMode: 'prefer'
}

function validate(form: FormData, t: (key: string) => string): FormErrors {
  const errors: FormErrors = {}
  if (!form.name.trim()) errors.name = t('explorer.dialog.validation.nameRequired')
  if (form.provider === 'sqlite') {
    if (!form.filePath?.trim()) errors.filePath = t('explorer.dialog.validation.filePathRequired')
  } else if (form.provider === 'redis') {
    if (form.redisMode !== 'sentinel') {
      if (!form.host.trim()) errors.host = t('explorer.dialog.validation.hostRequired')
      if (!Number.isInteger(form.port) || form.port < 1 || form.port > 65535) {
        errors.port = t('explorer.dialog.validation.portInvalid')
      }
    } else {
      if (!form.sentinelNodes?.trim())
        errors.sentinelNodes = t('explorer.dialog.validation.sentinelNodesRequired')
      if (!form.sentinelMasterName?.trim())
        errors.sentinelMasterName = t('explorer.dialog.validation.sentinelMasterNameRequired')
    }
    if (form.sshEnabled) {
      if (!form.sshHost?.trim()) errors.sshHost = t('explorer.dialog.validation.sshHostRequired')
      if (!form.sshUsername?.trim())
        errors.sshUsername = t('explorer.dialog.validation.sshUsernameRequired')
      if (form.sshAuthMode === 'privateKey' && !form.sshPrivateKeyPath?.trim())
        errors.sshPrivateKeyPath = t('explorer.dialog.validation.sshPrivateKeyRequired')
    }
  } else if (form.provider === 'mongodb') {
    if (!form.host.trim()) {
      errors.host = t('explorer.dialog.validation.hostRequired')
    }
    if (form.mongodbAuthMechanism === 'MONGODB-X509' && !form.tlsCertificateKeyFile?.trim()) {
      errors.tlsCertificateKeyFile = t('explorer.dialog.validation.x509CertRequired')
    }
    if (form.sshEnabled) {
      if (!form.sshHost?.trim()) errors.sshHost = t('explorer.dialog.validation.sshHostRequired')
      if (!form.sshUsername?.trim())
        errors.sshUsername = t('explorer.dialog.validation.sshUsernameRequired')
      if (form.sshAuthMode === 'privateKey' && !form.sshPrivateKeyPath?.trim())
        errors.sshPrivateKeyPath = t('explorer.dialog.validation.sshPrivateKeyRequired')
    }
  } else {
    if (!Number.isInteger(form.port) || form.port < 1 || form.port > 65535) {
      errors.port = t('explorer.dialog.validation.portInvalid')
    }
  }
  // Additional user profiles: username is the only required field per row.
  if (form.additionalUsers?.some((u) => !u.username.trim())) {
    errors.additionalUsers = t('explorer.dialog.validation.userUsernameRequired')
  }
  return errors
}

// ── Connection-string utilities ────────────────────────────────────────────────

const CONNECTION_STRING_FIELDS = new Set<keyof FormData>([
  'host',
  'port',
  'username',
  'password',
  'defaultDatabase',
  'mongodbSrv'
])

function buildConnectionString(
  form: Pick<
    FormData,
    'host' | 'port' | 'username' | 'password' | 'defaultDatabase' | 'mongodbSrv'
  >,
  provider: FormData['provider']
): string {
  if (provider === 'mongodb') {
    const userPart = form.username
      ? `${encodeURIComponent(form.username)}${form.password ? ':' + encodeURIComponent(form.password) : ''}@`
      : ''
    const dbPart = form.defaultDatabase ? `/${encodeURIComponent(form.defaultDatabase)}` : ''
    if (form.mongodbSrv) {
      return `mongodb+srv://${userPart}${form.host || 'localhost'}${dbPart}`
    }
    return `mongodb://${userPart}${form.host || 'localhost'}:${form.port || 27017}${dbPart}`
  }
  if (provider === 'redis') {
    const pass = form.password ? `:${encodeURIComponent(form.password)}` : ''
    const user = form.username
      ? `${encodeURIComponent(form.username)}${pass}@`
      : form.password
        ? `:${encodeURIComponent(form.password)}@`
        : ''
    const db = form.defaultDatabase ? `/${form.defaultDatabase}` : ''
    return `redis://${user}${form.host}:${form.port}${db}`
  }
  if (provider === 'postgres') {
    const db = form.defaultDatabase || 'postgres'
    const user = encodeURIComponent(form.username)
    const pass = form.password ? `:${encodeURIComponent(form.password)}` : ''
    return `postgresql://${user}${pass}@${form.host}:${form.port}/${db}`
  }
  if (provider === 'mysql') {
    const db = form.defaultDatabase || ''
    const user = encodeURIComponent(form.username)
    const pass = form.password ? `:${encodeURIComponent(form.password)}` : ''
    const dbPart = db ? `/${db}` : ''
    return `mysql://${user}${pass}@${form.host}:${form.port}${dbPart}`
  }
  return (
    [
      `Server=${form.host},${form.port}`,
      `Database=${form.defaultDatabase}`,
      `User Id=${form.username}`,
      `Password=${form.password}`,
      'TrustServerCertificate=True'
    ].join(';') + ';'
  )
}

type ParsedConnectionFields = Pick<
  FormData,
  'host' | 'port' | 'username' | 'password' | 'defaultDatabase' | 'mongodbSrv' | 'provider'
>

function parseConnectionString(str: string): Partial<ParsedConnectionFields> | null {
  const trimmed = str.trim()

  // Try MongoDB URI: mongodb://... or mongodb+srv://...
  if (/^mongodb(?:\+srv)?:\/\//i.test(trimmed)) {
    try {
      const isSrv = /^mongodb\+srv:\/\//i.test(trimmed)
      const url = new URL(trimmed)
      const port = url.port ? parseInt(url.port, 10) : 27017
      return {
        provider: 'mongodb',
        host: url.hostname,
        port: isNaN(port) ? 27017 : port,
        username: url.username ? decodeURIComponent(url.username) : '',
        password: url.password ? decodeURIComponent(url.password) : '',
        defaultDatabase: url.pathname.replace(/^\//, ''),
        mongodbSrv: isSrv
      }
    } catch {
      return null
    }
  }

  // Try Redis URI: redis://[:password@]host:port[/db] or rediss://...
  if (/^rediss?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed)
      const port = url.port ? parseInt(url.port, 10) : 6379
      if (isNaN(port) || port < 1 || port > 65535) return null
      const dbIndex = url.pathname.replace(/^\//, '')
      return {
        provider: 'redis',
        host: url.hostname,
        port,
        username: url.username ? decodeURIComponent(url.username) : '',
        password: url.password ? decodeURIComponent(url.password) : '',
        defaultDatabase: dbIndex
      }
    } catch {
      return null
    }
  }

  // Try Postgres URI: postgresql://user:pass@host:port/db or postgres://...
  if (/^(?:postgresql|postgres):\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed)
      const port = url.port ? parseInt(url.port, 10) : 5432
      if (isNaN(port) || port < 1 || port > 65535) return null
      return {
        provider: 'postgres',
        host: url.hostname,
        port,
        username: url.username ? decodeURIComponent(url.username) : '',
        password: url.password ? decodeURIComponent(url.password) : '',
        defaultDatabase: url.pathname.replace(/^\//, '')
      }
    } catch {
      return null
    }
  }

  // Try MySQL URI: mysql://user:pass@host:port/db or mysql2://...
  if (/^(?:mysql2?):\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed)
      const port = url.port ? parseInt(url.port, 10) : 3306
      if (isNaN(port) || port < 1 || port > 65535) return null
      return {
        provider: 'mysql',
        host: url.hostname,
        port,
        username: url.username ? decodeURIComponent(url.username) : '',
        password: url.password ? decodeURIComponent(url.password) : '',
        defaultDatabase: url.pathname.replace(/^\//, '')
      }
    } catch {
      return null
    }
  }

  // Fall back to SQL Server semicolon-separated format
  const pairs: Record<string, string> = {}
  for (const part of trimmed.split(';')) {
    const t = part.trim()
    if (!t) continue
    const eqIdx = t.indexOf('=')
    if (eqIdx === -1) continue
    pairs[t.slice(0, eqIdx).trim().toLowerCase()] = t.slice(eqIdx + 1).trim()
  }

  const serverVal = pairs['server']
  if (!serverVal) return null

  const commaIdx = serverVal.lastIndexOf(',')
  let host: string
  let port: number
  if (commaIdx !== -1) {
    host = serverVal.slice(0, commaIdx).trim()
    port = parseInt(serverVal.slice(commaIdx + 1).trim(), 10)
    if (isNaN(port) || port < 1 || port > 65535) return null
  } else {
    host = serverVal.trim()
    port = 1433
  }

  return {
    provider: 'sqlserver',
    host,
    port,
    username: pairs['user id'] ?? pairs['uid'] ?? pairs['user'] ?? '',
    password: pairs['password'] ?? pairs['pwd'] ?? '',
    defaultDatabase: pairs['database'] ?? pairs['initial catalog'] ?? ''
  }
}

interface NewConnectionDialogProps {
  onSave: (record: FormData) => Promise<void>
  onCancel: () => void
  initialValues?: ConnectionRecord
  /** Tab to open on initially. Defaults to 'details'. */
  initialTab?: ConnectionDialogTab
}

function NewConnectionDialog({
  onSave,
  onCancel,
  initialValues,
  initialTab
}: NewConnectionDialogProps): React.JSX.Element {
  const { t } = useTranslation()
  const { triggerConfetti } = useConfetti()
  const isEdit = !!initialValues
  const [form, setForm] = useState<FormData>(
    initialValues
      ? {
          name: initialValues.name,
          provider: initialValues.provider,
          host: initialValues.host,
          port: initialValues.port,
          username: initialValues.username,
          password: initialValues.password,
          rememberPassword: initialValues.rememberPassword,
          defaultDatabase: initialValues.defaultDatabase,
          filePath: initialValues.filePath ?? '',
          color: initialValues.color ?? '',
          environmentId: initialValues.environmentId,
          autoConnect: initialValues.autoConnect ?? false,
          eagerLoading: initialValues.eagerLoading ?? false,
          backgroundAutoRefresh: initialValues.backgroundAutoRefresh ?? false,
          additionalUsers: initialValues.additionalUsers ?? [],
          // Redis fields
          redisMode: initialValues.redisMode ?? 'standalone',
          sentinelMasterName: initialValues.sentinelMasterName ?? '',
          sentinelNodes: initialValues.sentinelNodes ?? '',
          tlsEnabled: initialValues.tlsEnabled ?? false,
          tlsServername: initialValues.tlsServername ?? '',
          tlsRejectUnauthorized: initialValues.tlsRejectUnauthorized ?? true,
          sshEnabled: initialValues.sshEnabled ?? false,
          sshHost: initialValues.sshHost ?? '',
          sshPort: initialValues.sshPort ?? 22,
          sshUsername: initialValues.sshUsername ?? '',
          sshAuthMode: initialValues.sshAuthMode ?? 'password',
          sshPassword: initialValues.sshPassword ?? '',
          sshPrivateKeyPath: initialValues.sshPrivateKeyPath ?? '',
          sshPassphrase: initialValues.sshPassphrase ?? '',
          redisHideEmptyDatabases: initialValues.redisHideEmptyDatabases ?? false,
          // MongoDB fields
          mongodbSrv: initialValues.mongodbSrv ?? false,
          mongodbUri: initialValues.mongodbUri ?? '',
          mongodbAuthMechanism: initialValues.mongodbAuthMechanism ?? 'SCRAM-SHA-256',
          mongodbAuthSource: initialValues.mongodbAuthSource ?? '',
          mongodbAuthMechanismProperties: initialValues.mongodbAuthMechanismProperties ?? '',
          mongodbReplicaSet: initialValues.mongodbReplicaSet ?? '',
          mongodbDirectConnection: initialValues.mongodbDirectConnection ?? false,
          tlsCAFile: initialValues.tlsCAFile ?? '',
          tlsCertificateKeyFile: initialValues.tlsCertificateKeyFile ?? '',
          tlsCertificateKeyFilePassword: initialValues.tlsCertificateKeyFilePassword ?? '',
          tlsAllowInvalidHostnames: initialValues.tlsAllowInvalidHostnames ?? false,
          tlsAllowInvalidCertificates: initialValues.tlsAllowInvalidCertificates ?? false,
          // PostgreSQL fields — fall back to the legacy TLS toggles when unset
          postgresSslMode:
            initialValues.postgresSslMode ??
            (initialValues.tlsEnabled
              ? initialValues.tlsRejectUnauthorized === false
                ? 'require'
                : 'verify-full'
              : 'prefer')
        }
      : EMPTY_FORM
  )
  const [availableEnvironments, setAvailableEnvironments] = useState<EnvironmentDefinition[]>(
    () => window.api.settings.initial.environments ?? []
  )
  const isSqlite = form.provider === 'sqlite'
  const isRedis = form.provider === 'redis'
  const isMongoDB = form.provider === 'mongodb'
  const isPostgres = form.provider === 'postgres'
  const [errors, setErrors] = useState<FormErrors>({})
  const [isSaving, setIsSaving] = useState(false)
  const [showCreatePrompt, setShowCreatePrompt] = useState(false)
  const [testStatus, setTestStatus] = useState<TestStatus>('idle')
  const [testMessage, setTestMessage] = useState<string | undefined>(undefined)
  const [activeTab, setActiveTab] = useState<ConnectionDialogTab>(initialTab ?? 'details')
  const [connectionString, setConnectionString] = useState<string>(() => {
    if (!initialValues) return ''
    if (initialValues.provider === 'mongodb' && initialValues.mongodbUri?.trim()) {
      return initialValues.mongodbUri.trim()
    }
    return buildConnectionString(initialValues, initialValues.provider)
  })
  const [connectionStringError, setConnectionStringError] = useState<string>('')

  useEffect(() => {
    window.api.settings
      .getAll()
      .then((allSettings) => {
        setAvailableEnvironments(allSettings.environments ?? [])
      })
      .catch(() => {
        setAvailableEnvironments(window.api.settings.initial.environments ?? [])
      })
  }, [])

  function setField<K extends keyof FormData>(key: K, value: FormData[K]): void {
    setForm((prev) => {
      let next = { ...prev, [key]: value }
      // When provider changes, reset port to that provider's default (skip for SQLite)
      if (key === 'provider') {
        const newMeta = PROVIDER_METADATA[value as FormData['provider']]
        const oldMeta = PROVIDER_METADATA[prev.provider]
        if (
          newMeta?.defaultPort !== undefined &&
          oldMeta?.defaultPort !== undefined &&
          prev.port === oldMeta.defaultPort
        ) {
          next = { ...next, port: newMeta.defaultPort }
        }
      }
      // When a connection-detail field changes for MongoDB, clear the raw URI so the
      // backend uses the individual fields rather than a potentially stale URI string
      if (prev.provider === 'mongodb' && CONNECTION_STRING_FIELDS.has(key as keyof FormData)) {
        next = { ...next, mongodbUri: '' }
      }
      return next
    })
    if (CONNECTION_STRING_FIELDS.has(key) || key === 'provider') {
      setConnectionString(
        buildConnectionString(
          { ...form, [key]: value },
          key === 'provider' ? (value as FormData['provider']) : form.provider
        )
      )
      setConnectionStringError('')
    }
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }))
    if (key === 'filePath') setShowCreatePrompt(false)
    setTestStatus('idle')
    setTestMessage(undefined)
  }

  // ── Additional user profiles ("Users" tab) ─────────────────────────────────
  type UserModalState = { mode: 'add' } | { mode: 'edit'; user: ConnectionUserProfile }
  const [userModal, setUserModal] = useState<UserModalState | null>(null)

  function openAddUserModal(): void {
    setUserModal({ mode: 'add' })
  }

  function openEditUserModal(user: ConnectionUserProfile): void {
    setUserModal({ mode: 'edit', user })
  }

  function closeUserModal(): void {
    setUserModal(null)
  }

  function saveUserFromModal(profile: ConnectionUserProfile): void {
    setForm((prev) => {
      const existing = prev.additionalUsers ?? []
      const isReplacing = existing.some((u) => u.id === profile.id)
      return {
        ...prev,
        additionalUsers: isReplacing
          ? existing.map((u) => (u.id === profile.id ? profile : u))
          : [...existing, profile]
      }
    })
    if (errors.additionalUsers) setErrors((prev) => ({ ...prev, additionalUsers: undefined }))
  }

  function removeUser(id: string): void {
    setForm((prev) => ({
      ...prev,
      additionalUsers: (prev.additionalUsers ?? []).filter((u) => u.id !== id)
    }))
    if (errors.additionalUsers) setErrors((prev) => ({ ...prev, additionalUsers: undefined }))
  }

  function handleConnectionStringChange(value: string): void {
    setConnectionString(value)
    const parsed = parseConnectionString(value)
    if (parsed !== null) {
      setForm((prev) => ({
        ...prev,
        ...parsed,
        // For MongoDB, preserve the raw URI so the backend can use it directly
        // (important for mongodb+srv:// and query params that can't be reconstructed)
        ...(prev.provider === 'mongodb' || parsed.provider === 'mongodb'
          ? { mongodbUri: value }
          : {})
      }))
      setConnectionStringError('')
    } else {
      setConnectionStringError(t('explorer.dialog.connectionStringTab.parseError'))
    }
  }

  async function handleTestConnection(skipExistenceCheck = false): Promise<void> {
    const newErrors = validate(form, t)
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }
    if (isSqlite && !skipExistenceCheck) {
      const exists = await window.api.file.checkFileExists(form.filePath!)
      if (!exists) {
        setShowCreatePrompt(true)
        return
      }
    }
    setShowCreatePrompt(false)
    setTestStatus('testing')
    setTestMessage(undefined)
    try {
      const result = await window.api.database.testConnection(form)
      if (result.status === 'connected') {
        setTestStatus('success')
        setTestMessage(t('explorer.dialog.testResult.success'))
        triggerConfetti()
      } else {
        setTestStatus('error')
        setTestMessage(result.message)
      }
    } catch (err) {
      setTestStatus('error')
      setTestMessage(err instanceof Error ? err.message : String(err))
    }
  }

  function handleConfirmCreate(): void {
    void handleTestConnection(true)
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    const newErrors = validate(form, t)
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }
    setIsSaving(true)
    try {
      await onSave(form)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <>
      <BaseDialog
        analyticsId={isEdit ? 'edit_connection' : 'new_connection'}
        title={isEdit ? t('explorer.dialog.editTitle') : t('explorer.dialog.title')}
        onClose={onCancel}
        closeDisabled={isSaving}
      >
        <form className="conn-dialog__body" onSubmit={handleSubmit} noValidate>
          <div className="conn-dialog__scroll-area">
            {/* Name – always visible above the tabs */}
            <div className="conn-dialog__field">
              <label className="conn-dialog__label" htmlFor="conn-name">
                {t('explorer.dialog.fields.name')}
              </label>
              <ConnectionInput
                id="conn-name"
                className={`conn-dialog__input${errors.name ? ' conn-dialog__input--error' : ''}`}
                type="text"
                value={form.name}
                onChange={(e) => setField('name', e.target.value)}
                placeholder="My SQL Server"
                autoFocus
              />
              {errors.name && <span className="conn-dialog__error">{errors.name}</span>}
            </div>

            {/* Tab bar */}
            <div className="conn-dialog__tabs-section">
              <div className="conn-dialog__tabs" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'details'}
                  className={`conn-dialog__tab${activeTab === 'details' ? ' conn-dialog__tab--active' : ''}`}
                  onClick={() => setActiveTab('details')}
                >
                  {t('explorer.dialog.tabs.connectionDetails')}
                </button>
                {!isSqlite && (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === 'connectionString'}
                    className={`conn-dialog__tab${activeTab === 'connectionString' ? ' conn-dialog__tab--active' : ''}`}
                    onClick={() => setActiveTab('connectionString')}
                  >
                    {t('explorer.dialog.tabs.connectionString')}
                  </button>
                )}
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'options'}
                  className={`conn-dialog__tab${activeTab === 'options' ? ' conn-dialog__tab--active' : ''}`}
                  onClick={() => setActiveTab('options')}
                >
                  {t('explorer.dialog.tabs.options')}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'users'}
                  className={`conn-dialog__tab${activeTab === 'users' ? ' conn-dialog__tab--active' : ''}`}
                  onClick={() => setActiveTab('users')}
                >
                  {t('explorer.dialog.tabs.users')}
                </button>
              </div>

              {/* Connection Details tab panel */}
              {activeTab === 'details' && (
                <div className="conn-dialog__tab-panel" role="tabpanel">
                  <div className="conn-dialog__form-grid">
                    {/* Provider – full width */}
                    <div className="conn-dialog__field conn-dialog__field--span">
                      <label className="conn-dialog__label" htmlFor="conn-provider">
                        {t('explorer.dialog.fields.provider')}
                      </label>
                      <select
                        id="conn-provider"
                        className="conn-dialog__select"
                        value={form.provider}
                        onChange={(e) =>
                          setField('provider', e.target.value as FormData['provider'])
                        }
                      >
                        {PROVIDER_LIST.map(({ value, meta }) => (
                          <option key={value} value={value}>
                            {meta.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {isRedis ? (
                      /* Redis: mode, auth, TLS, SSH tunnel */
                      <>
                        {/* Deployment mode */}
                        <div className="conn-dialog__field conn-dialog__field--span">
                          <label className="conn-dialog__label" htmlFor="conn-redis-mode">
                            {t('explorer.dialog.fields.redisMode')}
                          </label>
                          <select
                            id="conn-redis-mode"
                            className="conn-dialog__select"
                            value={form.redisMode ?? 'standalone'}
                            onChange={(e) =>
                              setField(
                                'redisMode',
                                e.target.value as 'standalone' | 'cluster' | 'sentinel'
                              )
                            }
                          >
                            <option value="standalone">
                              {t('explorer.dialog.fields.redisModeStandalone')}
                            </option>
                            <option value="cluster">
                              {t('explorer.dialog.fields.redisModeCluster')}
                            </option>
                            <option value="sentinel">
                              {t('explorer.dialog.fields.redisModeSentinel')}
                            </option>
                          </select>
                        </div>

                        {form.redisMode !== 'sentinel' ? (
                          <>
                            {/* Standalone / Cluster: host + port */}
                            <div className="conn-dialog__field">
                              <label className="conn-dialog__label" htmlFor="conn-host">
                                {t('explorer.dialog.fields.host')}
                              </label>
                              <ConnectionInput
                                id="conn-host"
                                className={`conn-dialog__input${errors.host ? ' conn-dialog__input--error' : ''}`}
                                type="text"
                                value={form.host}
                                onChange={(e) => setField('host', e.target.value)}
                                placeholder="localhost"
                              />
                              {errors.host && (
                                <span className="conn-dialog__error">{errors.host}</span>
                              )}
                            </div>
                            <div className="conn-dialog__field">
                              <label className="conn-dialog__label" htmlFor="conn-port">
                                {t('explorer.dialog.fields.port')}
                              </label>
                              <ConnectionInput
                                id="conn-port"
                                className={`conn-dialog__input${errors.port ? ' conn-dialog__input--error' : ''}`}
                                type="number"
                                min={1}
                                max={65535}
                                value={form.port}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value, 10)
                                  setField('port', isNaN(val) ? 0 : val)
                                }}
                              />
                              {errors.port && (
                                <span className="conn-dialog__error">{errors.port}</span>
                              )}
                            </div>
                          </>
                        ) : (
                          <>
                            {/* Sentinel: master name + node list */}
                            <div className="conn-dialog__field conn-dialog__field--span">
                              <label className="conn-dialog__label" htmlFor="conn-sentinel-master">
                                {t('explorer.dialog.fields.sentinelMasterName')}
                              </label>
                              <ConnectionInput
                                id="conn-sentinel-master"
                                className={`conn-dialog__input${errors.sentinelMasterName ? ' conn-dialog__input--error' : ''}`}
                                type="text"
                                value={form.sentinelMasterName ?? ''}
                                onChange={(e) => setField('sentinelMasterName', e.target.value)}
                                placeholder="mymaster"
                              />
                              {errors.sentinelMasterName && (
                                <span className="conn-dialog__error">
                                  {errors.sentinelMasterName}
                                </span>
                              )}
                            </div>
                            <div className="conn-dialog__field conn-dialog__field--span">
                              <label className="conn-dialog__label" htmlFor="conn-sentinel-nodes">
                                {t('explorer.dialog.fields.sentinelNodes')}
                              </label>
                              <ConnectionInput
                                id="conn-sentinel-nodes"
                                className={`conn-dialog__input${errors.sentinelNodes ? ' conn-dialog__input--error' : ''}`}
                                type="text"
                                value={form.sentinelNodes ?? ''}
                                onChange={(e) => setField('sentinelNodes', e.target.value)}
                                placeholder="host1:26379,host2:26379"
                              />
                              {errors.sentinelNodes && (
                                <span className="conn-dialog__error">{errors.sentinelNodes}</span>
                              )}
                            </div>
                          </>
                        )}

                        {/* Auth: ACL username (optional) + password */}
                        <div className="conn-dialog__field">
                          <label className="conn-dialog__label" htmlFor="conn-username">
                            {t('explorer.dialog.fields.redisUsername')}
                          </label>
                          <ConnectionInput
                            id="conn-username"
                            className="conn-dialog__input"
                            type="text"
                            value={form.username}
                            onChange={(e) => setField('username', e.target.value)}
                            placeholder="default"
                          />
                        </div>
                        <div className="conn-dialog__field">
                          <label className="conn-dialog__label" htmlFor="conn-password">
                            {t('explorer.dialog.fields.password')}
                          </label>
                          <ConnectionInput
                            id="conn-password"
                            className="conn-dialog__input"
                            type="password"
                            value={form.password}
                            onChange={(e) => setField('password', e.target.value)}
                            placeholder="••••••••"
                          />
                          <label className="conn-dialog__checkbox-row">
                            <input
                              type="checkbox"
                              className="conn-dialog__checkbox"
                              checked={form.rememberPassword}
                              onChange={(e) => setField('rememberPassword', e.target.checked)}
                            />
                            <span className="conn-dialog__checkbox-label">
                              {t('explorer.dialog.fields.rememberPassword')}
                            </span>
                          </label>
                        </div>

                        {/* Default DB index (standalone only) */}
                        {form.redisMode !== 'cluster' && (
                          <div className="conn-dialog__field conn-dialog__field--span">
                            <label className="conn-dialog__label" htmlFor="conn-default-db">
                              {t('explorer.dialog.fields.redisDatabaseIndex')}
                            </label>
                            <ConnectionInput
                              id="conn-default-db"
                              className="conn-dialog__input"
                              type="number"
                              min={0}
                              max={15}
                              value={form.defaultDatabase}
                              onChange={(e) => setField('defaultDatabase', e.target.value)}
                              placeholder="0"
                            />
                          </div>
                        )}

                        {/* ── TLS / SSL ── */}
                        <div className="conn-dialog__field conn-dialog__field--span">
                          <label className="conn-dialog__label">
                            {t('explorer.dialog.fields.redisTls')}
                          </label>
                          <label className="conn-dialog__checkbox-row">
                            <input
                              type="checkbox"
                              className="conn-dialog__checkbox"
                              checked={form.tlsEnabled ?? false}
                              onChange={(e) => setField('tlsEnabled', e.target.checked)}
                            />
                            <span className="conn-dialog__checkbox-label">
                              {t('explorer.dialog.fields.redisTlsEnable')}
                            </span>
                          </label>
                        </div>
                        {form.tlsEnabled && (
                          <>
                            <div className="conn-dialog__field">
                              <label className="conn-dialog__label" htmlFor="conn-tls-servername">
                                {t('explorer.dialog.fields.redisTlsServername')}
                              </label>
                              <ConnectionInput
                                id="conn-tls-servername"
                                className="conn-dialog__input"
                                type="text"
                                value={form.tlsServername ?? ''}
                                onChange={(e) => setField('tlsServername', e.target.value)}
                                placeholder={form.host || 'optional'}
                              />
                            </div>
                            <div className="conn-dialog__field">
                              <label className="conn-dialog__label">
                                {t('explorer.dialog.fields.redisTlsValidation')}
                              </label>
                              <label className="conn-dialog__checkbox-row">
                                <input
                                  type="checkbox"
                                  className="conn-dialog__checkbox"
                                  checked={form.tlsRejectUnauthorized ?? true}
                                  onChange={(e) =>
                                    setField('tlsRejectUnauthorized', e.target.checked)
                                  }
                                />
                                <span className="conn-dialog__checkbox-label">
                                  {t('explorer.dialog.fields.redisTlsRejectUnauthorized')}
                                </span>
                              </label>
                            </div>
                          </>
                        )}

                        {/* ── SSH Tunnel ── */}
                        <div className="conn-dialog__field conn-dialog__field--span">
                          <label className="conn-dialog__label">
                            {t('explorer.dialog.fields.sshTunnel')}
                          </label>
                          <label className="conn-dialog__checkbox-row">
                            <input
                              type="checkbox"
                              className="conn-dialog__checkbox"
                              checked={form.sshEnabled ?? false}
                              onChange={(e) => setField('sshEnabled', e.target.checked)}
                            />
                            <span className="conn-dialog__checkbox-label">
                              {t('explorer.dialog.fields.sshTunnelEnable')}
                            </span>
                          </label>
                        </div>
                        {form.sshEnabled && (
                          <>
                            <div className="conn-dialog__field">
                              <label className="conn-dialog__label" htmlFor="conn-ssh-host">
                                {t('explorer.dialog.fields.sshHost')}
                              </label>
                              <ConnectionInput
                                id="conn-ssh-host"
                                className={`conn-dialog__input${errors.sshHost ? ' conn-dialog__input--error' : ''}`}
                                type="text"
                                value={form.sshHost ?? ''}
                                onChange={(e) => setField('sshHost', e.target.value)}
                                placeholder="bastion.example.com"
                              />
                              {errors.sshHost && (
                                <span className="conn-dialog__error">{errors.sshHost}</span>
                              )}
                            </div>
                            <div className="conn-dialog__field">
                              <label className="conn-dialog__label" htmlFor="conn-ssh-port">
                                {t('explorer.dialog.fields.sshPort')}
                              </label>
                              <ConnectionInput
                                id="conn-ssh-port"
                                className="conn-dialog__input"
                                type="number"
                                min={1}
                                max={65535}
                                value={form.sshPort ?? 22}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value, 10)
                                  setField('sshPort', isNaN(val) ? 22 : val)
                                }}
                              />
                            </div>
                            <div className="conn-dialog__field">
                              <label className="conn-dialog__label" htmlFor="conn-ssh-username">
                                {t('explorer.dialog.fields.sshUsername')}
                              </label>
                              <ConnectionInput
                                id="conn-ssh-username"
                                className={`conn-dialog__input${errors.sshUsername ? ' conn-dialog__input--error' : ''}`}
                                type="text"
                                value={form.sshUsername ?? ''}
                                onChange={(e) => setField('sshUsername', e.target.value)}
                                placeholder="ec2-user"
                              />
                              {errors.sshUsername && (
                                <span className="conn-dialog__error">{errors.sshUsername}</span>
                              )}
                            </div>
                            <div className="conn-dialog__field">
                              <label className="conn-dialog__label" htmlFor="conn-ssh-auth-mode">
                                {t('explorer.dialog.fields.sshAuthMode')}
                              </label>
                              <select
                                id="conn-ssh-auth-mode"
                                className="conn-dialog__select"
                                value={form.sshAuthMode ?? 'password'}
                                onChange={(e) =>
                                  setField(
                                    'sshAuthMode',
                                    e.target.value as 'password' | 'privateKey'
                                  )
                                }
                              >
                                <option value="password">
                                  {t('explorer.dialog.fields.sshAuthModePassword')}
                                </option>
                                <option value="privateKey">
                                  {t('explorer.dialog.fields.sshAuthModeKey')}
                                </option>
                              </select>
                            </div>
                            {form.sshAuthMode === 'password' ? (
                              <div className="conn-dialog__field conn-dialog__field--span">
                                <label className="conn-dialog__label" htmlFor="conn-ssh-password">
                                  {t('explorer.dialog.fields.sshPassword')}
                                </label>
                                <ConnectionInput
                                  id="conn-ssh-password"
                                  className="conn-dialog__input"
                                  type="password"
                                  value={form.sshPassword ?? ''}
                                  onChange={(e) => setField('sshPassword', e.target.value)}
                                  placeholder="••••••••"
                                />
                              </div>
                            ) : (
                              <>
                                <div className="conn-dialog__field conn-dialog__field--span">
                                  <label className="conn-dialog__label" htmlFor="conn-ssh-key-path">
                                    {t('explorer.dialog.fields.sshPrivateKeyPath')}
                                  </label>
                                  <div className="conn-dialog__file-row">
                                    <ConnectionInput
                                      id="conn-ssh-key-path"
                                      className={`conn-dialog__input${errors.sshPrivateKeyPath ? ' conn-dialog__input--error' : ''}`}
                                      type="text"
                                      value={form.sshPrivateKeyPath ?? ''}
                                      onChange={(e) =>
                                        setField('sshPrivateKeyPath', e.target.value)
                                      }
                                      placeholder="~/.ssh/id_rsa"
                                    />
                                    <Button
                                      variant="secondary"
                                      size="lg"
                                      className="conn-dialog__file-browse"
                                      onClick={async () => {
                                        const result = await window.api.file.openFileDialog()
                                        if (result.status === 'ok') {
                                          setField('sshPrivateKeyPath', result.filePath)
                                        }
                                      }}
                                    >
                                      <FolderKey size={14} />
                                      {t('explorer.dialog.fields.browseFile')}
                                    </Button>
                                  </div>
                                  {errors.sshPrivateKeyPath && (
                                    <span className="conn-dialog__error">
                                      {errors.sshPrivateKeyPath}
                                    </span>
                                  )}
                                </div>
                                <div className="conn-dialog__field conn-dialog__field--span">
                                  <label
                                    className="conn-dialog__label"
                                    htmlFor="conn-ssh-passphrase"
                                  >
                                    {t('explorer.dialog.fields.sshPassphrase')}
                                  </label>
                                  <ConnectionInput
                                    id="conn-ssh-passphrase"
                                    className="conn-dialog__input"
                                    type="password"
                                    value={form.sshPassphrase ?? ''}
                                    onChange={(e) => setField('sshPassphrase', e.target.value)}
                                    placeholder={t(
                                      'explorer.dialog.fields.sshPassphrasePlaceholder'
                                    )}
                                  />
                                </div>
                              </>
                            )}
                          </>
                        )}
                      </>
                    ) : isSqlite ? (
                      /* SQLite: file path picker instead of host/port/credentials */
                      <div className="conn-dialog__field conn-dialog__field--span">
                        <label className="conn-dialog__label" htmlFor="conn-filepath">
                          {t('explorer.dialog.fields.filePath')}
                        </label>
                        <div className="conn-dialog__file-row">
                          <ConnectionInput
                            id="conn-filepath"
                            className={`conn-dialog__input${errors.filePath ? ' conn-dialog__input--error' : ''}`}
                            type="text"
                            value={form.filePath ?? ''}
                            onChange={(e) => setField('filePath', e.target.value)}
                            placeholder="/path/to/database.db"
                          />
                          <Button
                            variant="secondary"
                            size="lg"
                            className="conn-dialog__file-browse"
                            onClick={async () => {
                              const result = await window.api.file.openSqliteDialog()
                              if (result.status === 'ok') {
                                setField('filePath', result.filePath)
                              }
                            }}
                          >
                            <FolderOpen size={14} />
                            {t('explorer.dialog.fields.browseFile')}
                          </Button>
                        </div>
                        {errors.filePath && (
                          <span className="conn-dialog__error">{errors.filePath}</span>
                        )}
                        {showCreatePrompt && (
                          <div className="conn-dialog__create-prompt">
                            <span className="conn-dialog__create-prompt-message">
                              {t('explorer.dialog.createPrompt.message')}
                            </span>
                            <div className="conn-dialog__create-prompt-actions">
                              <Button variant="primary" size="lg" onClick={handleConfirmCreate}>
                                {t('explorer.dialog.createPrompt.confirm')}
                              </Button>
                              <Button
                                variant="ghost"
                                size="lg"
                                onClick={() => setShowCreatePrompt(false)}
                              >
                                {t('explorer.dialog.createPrompt.cancel')}
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : isMongoDB ? (
                      /* MongoDB: host/port, auth mechanism, TLS certs, SSH tunnel */
                      <>
                        {/* SRV toggle */}
                        <div className="conn-dialog__field conn-dialog__field--span">
                          <label className="conn-dialog__label">
                            {t('explorer.dialog.fields.mongodbSrv')}
                          </label>
                          <label className="conn-dialog__checkbox-row">
                            <input
                              type="checkbox"
                              className="conn-dialog__checkbox"
                              checked={form.mongodbSrv ?? false}
                              onChange={(e) => setField('mongodbSrv', e.target.checked)}
                            />
                            <span className="conn-dialog__checkbox-label">
                              {t('explorer.dialog.fields.mongodbSrvEnable')}
                            </span>
                          </label>
                        </div>

                        {/* Host + Port */}
                        <div className="conn-dialog__field">
                          <label className="conn-dialog__label" htmlFor="conn-host">
                            {t('explorer.dialog.fields.host')}
                          </label>
                          <ConnectionInput
                            id="conn-host"
                            className={`conn-dialog__input${errors.host ? ' conn-dialog__input--error' : ''}`}
                            type="text"
                            value={form.host}
                            onChange={(e) => setField('host', e.target.value)}
                            placeholder={
                              form.mongodbSrv ? 'cluster.example.mongodb.net' : 'localhost'
                            }
                          />
                          {errors.host && <span className="conn-dialog__error">{errors.host}</span>}
                        </div>
                        {!form.mongodbSrv && (
                          <div className="conn-dialog__field">
                            <label className="conn-dialog__label" htmlFor="conn-port">
                              {t('explorer.dialog.fields.port')}
                            </label>
                            <ConnectionInput
                              id="conn-port"
                              className={`conn-dialog__input${errors.port ? ' conn-dialog__input--error' : ''}`}
                              type="number"
                              min={1}
                              max={65535}
                              value={form.port}
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10)
                                setField('port', isNaN(val) ? 0 : val)
                              }}
                            />
                            {errors.port && (
                              <span className="conn-dialog__error">{errors.port}</span>
                            )}
                          </div>
                        )}

                        {/* Auth Mechanism */}
                        <div className="conn-dialog__field">
                          <label
                            className="conn-dialog__label"
                            htmlFor="conn-mongodb-auth-mechanism"
                          >
                            {t('explorer.dialog.fields.mongodbAuthMechanism')}
                          </label>
                          <select
                            id="conn-mongodb-auth-mechanism"
                            className="conn-dialog__select"
                            value={form.mongodbAuthMechanism ?? 'SCRAM-SHA-256'}
                            onChange={(e) =>
                              setField(
                                'mongodbAuthMechanism',
                                e.target.value as FormData['mongodbAuthMechanism']
                              )
                            }
                          >
                            <option value="SCRAM-SHA-256">SCRAM-SHA-256 (default)</option>
                            <option value="SCRAM-SHA-1">SCRAM-SHA-1</option>
                            <option value="MONGODB-X509">X.509 Certificate</option>
                            <option value="GSSAPI">Kerberos (GSSAPI)</option>
                            <option value="PLAIN">LDAP (PLAIN)</option>
                            <option value="MONGODB-AWS">AWS IAM</option>
                          </select>
                        </div>

                        {/* Auth Source */}
                        <div className="conn-dialog__field">
                          <label className="conn-dialog__label" htmlFor="conn-mongodb-auth-source">
                            {t('explorer.dialog.fields.mongodbAuthSource')}
                          </label>
                          <ConnectionInput
                            id="conn-mongodb-auth-source"
                            className="conn-dialog__input"
                            type="text"
                            value={form.mongodbAuthSource ?? ''}
                            onChange={(e) => setField('mongodbAuthSource', e.target.value)}
                            placeholder="admin"
                          />
                        </div>

                        {/* Username + Password (not needed for X.509) */}
                        {form.mongodbAuthMechanism !== 'MONGODB-X509' && (
                          <>
                            <div className="conn-dialog__field">
                              <label className="conn-dialog__label" htmlFor="conn-username">
                                {t('explorer.dialog.fields.username')}
                              </label>
                              <ConnectionInput
                                id="conn-username"
                                className="conn-dialog__input"
                                type="text"
                                value={form.username}
                                onChange={(e) => setField('username', e.target.value)}
                                placeholder="admin"
                              />
                            </div>
                            <div className="conn-dialog__field">
                              <label className="conn-dialog__label" htmlFor="conn-password">
                                {t('explorer.dialog.fields.password')}
                              </label>
                              <ConnectionInput
                                id="conn-password"
                                className="conn-dialog__input"
                                type="password"
                                value={form.password}
                                onChange={(e) => setField('password', e.target.value)}
                                placeholder="••••••••"
                              />
                              <label className="conn-dialog__checkbox-row">
                                <input
                                  type="checkbox"
                                  className="conn-dialog__checkbox"
                                  checked={form.rememberPassword}
                                  onChange={(e) => setField('rememberPassword', e.target.checked)}
                                />
                                <span className="conn-dialog__checkbox-label">
                                  {t('explorer.dialog.fields.rememberPassword')}
                                </span>
                              </label>
                            </div>
                          </>
                        )}

                        {/* Default Database */}
                        <div className="conn-dialog__field conn-dialog__field--span">
                          <label className="conn-dialog__label" htmlFor="conn-default-db">
                            {t('explorer.dialog.fields.defaultDatabase')}
                          </label>
                          <ConnectionInput
                            id="conn-default-db"
                            className="conn-dialog__input"
                            type="text"
                            value={form.defaultDatabase}
                            onChange={(e) => setField('defaultDatabase', e.target.value)}
                            placeholder="admin"
                          />
                        </div>

                        {/* Replica Set */}
                        <div className="conn-dialog__field">
                          <label className="conn-dialog__label" htmlFor="conn-mongodb-replica-set">
                            {t('explorer.dialog.fields.mongodbReplicaSet')}
                          </label>
                          <ConnectionInput
                            id="conn-mongodb-replica-set"
                            className="conn-dialog__input"
                            type="text"
                            value={form.mongodbReplicaSet ?? ''}
                            onChange={(e) => setField('mongodbReplicaSet', e.target.value)}
                            placeholder="rs0"
                          />
                        </div>

                        {/* Direct Connection */}
                        <div className="conn-dialog__field">
                          <label className="conn-dialog__label">
                            {t('explorer.dialog.fields.mongodbDirectConnection')}
                          </label>
                          <label className="conn-dialog__checkbox-row">
                            <input
                              type="checkbox"
                              className="conn-dialog__checkbox"
                              checked={form.mongodbDirectConnection ?? false}
                              onChange={(e) =>
                                setField('mongodbDirectConnection', e.target.checked)
                              }
                            />
                            <span className="conn-dialog__checkbox-label">
                              {t('explorer.dialog.fields.mongodbDirectConnectionEnable')}
                            </span>
                          </label>
                        </div>

                        {/* ── TLS / SSL ── */}
                        <div className="conn-dialog__field conn-dialog__field--span">
                          <label className="conn-dialog__label">
                            {t('explorer.dialog.fields.mongodbTls')}
                          </label>
                          <label className="conn-dialog__checkbox-row">
                            <input
                              type="checkbox"
                              className="conn-dialog__checkbox"
                              checked={form.tlsEnabled ?? false}
                              onChange={(e) => setField('tlsEnabled', e.target.checked)}
                            />
                            <span className="conn-dialog__checkbox-label">
                              {t('explorer.dialog.fields.mongodbTlsEnable')}
                            </span>
                          </label>
                        </div>
                        {form.tlsEnabled && (
                          <>
                            {/* CA Certificate */}
                            <div className="conn-dialog__field conn-dialog__field--span">
                              <label className="conn-dialog__label" htmlFor="conn-tls-ca-file">
                                {t('explorer.dialog.fields.mongodbTlsCAFile')}
                              </label>
                              <div className="conn-dialog__file-row">
                                <ConnectionInput
                                  id="conn-tls-ca-file"
                                  className="conn-dialog__input"
                                  type="text"
                                  value={form.tlsCAFile ?? ''}
                                  onChange={(e) => setField('tlsCAFile', e.target.value)}
                                  placeholder="/path/to/ca.pem"
                                />
                                <Button
                                  variant="secondary"
                                  size="lg"
                                  className="conn-dialog__file-browse"
                                  onClick={async () => {
                                    const result = await window.api.file.openFileDialog()
                                    if (result.status === 'ok')
                                      setField('tlsCAFile', result.filePath)
                                  }}
                                >
                                  <FolderOpen size={14} />
                                  {t('explorer.dialog.fields.browseFile')}
                                </Button>
                              </div>
                            </div>

                            {/* Client Certificate / Key */}
                            <div className="conn-dialog__field conn-dialog__field--span">
                              <label
                                className="conn-dialog__label"
                                htmlFor="conn-tls-cert-key-file"
                              >
                                {t('explorer.dialog.fields.mongodbTlsCertKeyFile')}
                              </label>
                              <div className="conn-dialog__file-row">
                                <ConnectionInput
                                  id="conn-tls-cert-key-file"
                                  className={`conn-dialog__input${errors.tlsCertificateKeyFile ? ' conn-dialog__input--error' : ''}`}
                                  type="text"
                                  value={form.tlsCertificateKeyFile ?? ''}
                                  onChange={(e) =>
                                    setField('tlsCertificateKeyFile', e.target.value)
                                  }
                                  placeholder="/path/to/client.pem"
                                />
                                <Button
                                  variant="secondary"
                                  size="lg"
                                  className="conn-dialog__file-browse"
                                  onClick={async () => {
                                    const result = await window.api.file.openFileDialog()
                                    if (result.status === 'ok')
                                      setField('tlsCertificateKeyFile', result.filePath)
                                  }}
                                >
                                  <FolderKey size={14} />
                                  {t('explorer.dialog.fields.browseFile')}
                                </Button>
                              </div>
                              {errors.tlsCertificateKeyFile && (
                                <span className="conn-dialog__error">
                                  {errors.tlsCertificateKeyFile}
                                </span>
                              )}
                            </div>

                            {/* Cert Key Passphrase */}
                            <div className="conn-dialog__field conn-dialog__field--span">
                              <label
                                className="conn-dialog__label"
                                htmlFor="conn-tls-cert-key-password"
                              >
                                {t('explorer.dialog.fields.mongodbTlsCertKeyPassword')}
                              </label>
                              <ConnectionInput
                                id="conn-tls-cert-key-password"
                                className="conn-dialog__input"
                                type="password"
                                value={form.tlsCertificateKeyFilePassword ?? ''}
                                onChange={(e) =>
                                  setField('tlsCertificateKeyFilePassword', e.target.value)
                                }
                                placeholder="••••••••"
                              />
                            </div>

                            {/* Validation options */}
                            <div className="conn-dialog__field conn-dialog__field--span">
                              <label className="conn-dialog__checkbox-row">
                                <input
                                  type="checkbox"
                                  className="conn-dialog__checkbox"
                                  checked={form.tlsAllowInvalidHostnames ?? false}
                                  onChange={(e) =>
                                    setField('tlsAllowInvalidHostnames', e.target.checked)
                                  }
                                />
                                <span className="conn-dialog__checkbox-label">
                                  {t('explorer.dialog.fields.mongodbTlsAllowInvalidHostnames')}
                                </span>
                              </label>
                            </div>
                            <div className="conn-dialog__field conn-dialog__field--span">
                              <label className="conn-dialog__checkbox-row">
                                <input
                                  type="checkbox"
                                  className="conn-dialog__checkbox"
                                  checked={form.tlsAllowInvalidCertificates ?? false}
                                  onChange={(e) =>
                                    setField('tlsAllowInvalidCertificates', e.target.checked)
                                  }
                                />
                                <span className="conn-dialog__checkbox-label">
                                  {t('explorer.dialog.fields.mongodbTlsAllowInvalidCerts')}
                                </span>
                              </label>
                            </div>
                          </>
                        )}

                        {/* ── SSH Tunnel ── */}
                        <div className="conn-dialog__field conn-dialog__field--span">
                          <label className="conn-dialog__label">
                            {t('explorer.dialog.fields.sshTunnel')}
                          </label>
                          <label className="conn-dialog__checkbox-row">
                            <input
                              type="checkbox"
                              className="conn-dialog__checkbox"
                              checked={form.sshEnabled ?? false}
                              onChange={(e) => setField('sshEnabled', e.target.checked)}
                            />
                            <span className="conn-dialog__checkbox-label">
                              {t('explorer.dialog.fields.sshTunnelEnable')}
                            </span>
                          </label>
                        </div>
                        {form.sshEnabled && (
                          <>
                            <div className="conn-dialog__field">
                              <label className="conn-dialog__label" htmlFor="conn-ssh-host">
                                {t('explorer.dialog.fields.sshHost')}
                              </label>
                              <ConnectionInput
                                id="conn-ssh-host"
                                className={`conn-dialog__input${errors.sshHost ? ' conn-dialog__input--error' : ''}`}
                                type="text"
                                value={form.sshHost ?? ''}
                                onChange={(e) => setField('sshHost', e.target.value)}
                                placeholder="bastion.example.com"
                              />
                              {errors.sshHost && (
                                <span className="conn-dialog__error">{errors.sshHost}</span>
                              )}
                            </div>
                            <div className="conn-dialog__field">
                              <label className="conn-dialog__label" htmlFor="conn-ssh-port">
                                {t('explorer.dialog.fields.sshPort')}
                              </label>
                              <ConnectionInput
                                id="conn-ssh-port"
                                className="conn-dialog__input"
                                type="number"
                                min={1}
                                max={65535}
                                value={form.sshPort ?? 22}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value, 10)
                                  setField('sshPort', isNaN(val) ? 22 : val)
                                }}
                              />
                            </div>
                            <div className="conn-dialog__field">
                              <label className="conn-dialog__label" htmlFor="conn-ssh-username">
                                {t('explorer.dialog.fields.sshUsername')}
                              </label>
                              <ConnectionInput
                                id="conn-ssh-username"
                                className={`conn-dialog__input${errors.sshUsername ? ' conn-dialog__input--error' : ''}`}
                                type="text"
                                value={form.sshUsername ?? ''}
                                onChange={(e) => setField('sshUsername', e.target.value)}
                                placeholder="ec2-user"
                              />
                              {errors.sshUsername && (
                                <span className="conn-dialog__error">{errors.sshUsername}</span>
                              )}
                            </div>
                            <div className="conn-dialog__field">
                              <label className="conn-dialog__label" htmlFor="conn-ssh-auth-mode">
                                {t('explorer.dialog.fields.sshAuthMode')}
                              </label>
                              <select
                                id="conn-ssh-auth-mode"
                                className="conn-dialog__select"
                                value={form.sshAuthMode ?? 'password'}
                                onChange={(e) =>
                                  setField(
                                    'sshAuthMode',
                                    e.target.value as 'password' | 'privateKey'
                                  )
                                }
                              >
                                <option value="password">
                                  {t('explorer.dialog.fields.sshAuthModePassword')}
                                </option>
                                <option value="privateKey">
                                  {t('explorer.dialog.fields.sshAuthModeKey')}
                                </option>
                              </select>
                            </div>
                            {form.sshAuthMode === 'password' ? (
                              <div className="conn-dialog__field conn-dialog__field--span">
                                <label className="conn-dialog__label" htmlFor="conn-ssh-password">
                                  {t('explorer.dialog.fields.sshPassword')}
                                </label>
                                <ConnectionInput
                                  id="conn-ssh-password"
                                  className="conn-dialog__input"
                                  type="password"
                                  value={form.sshPassword ?? ''}
                                  onChange={(e) => setField('sshPassword', e.target.value)}
                                  placeholder="••••••••"
                                />
                              </div>
                            ) : (
                              <>
                                <div className="conn-dialog__field conn-dialog__field--span">
                                  <label className="conn-dialog__label" htmlFor="conn-ssh-key-path">
                                    {t('explorer.dialog.fields.sshPrivateKeyPath')}
                                  </label>
                                  <div className="conn-dialog__file-row">
                                    <ConnectionInput
                                      id="conn-ssh-key-path"
                                      className={`conn-dialog__input${errors.sshPrivateKeyPath ? ' conn-dialog__input--error' : ''}`}
                                      type="text"
                                      value={form.sshPrivateKeyPath ?? ''}
                                      onChange={(e) =>
                                        setField('sshPrivateKeyPath', e.target.value)
                                      }
                                      placeholder="~/.ssh/id_rsa"
                                    />
                                    <Button
                                      variant="secondary"
                                      size="lg"
                                      className="conn-dialog__file-browse"
                                      onClick={async () => {
                                        const result = await window.api.file.openFileDialog()
                                        if (result.status === 'ok')
                                          setField('sshPrivateKeyPath', result.filePath)
                                      }}
                                    >
                                      <FolderKey size={14} />
                                      {t('explorer.dialog.fields.browseFile')}
                                    </Button>
                                  </div>
                                  {errors.sshPrivateKeyPath && (
                                    <span className="conn-dialog__error">
                                      {errors.sshPrivateKeyPath}
                                    </span>
                                  )}
                                </div>
                                <div className="conn-dialog__field conn-dialog__field--span">
                                  <label
                                    className="conn-dialog__label"
                                    htmlFor="conn-ssh-passphrase"
                                  >
                                    {t('explorer.dialog.fields.sshPassphrase')}
                                  </label>
                                  <ConnectionInput
                                    id="conn-ssh-passphrase"
                                    className="conn-dialog__input"
                                    type="password"
                                    value={form.sshPassphrase ?? ''}
                                    onChange={(e) => setField('sshPassphrase', e.target.value)}
                                    placeholder={t(
                                      'explorer.dialog.fields.sshPassphrasePlaceholder'
                                    )}
                                  />
                                </div>
                              </>
                            )}
                          </>
                        )}
                      </>
                    ) : (
                      <>
                        {/* Host */}
                        <div className="conn-dialog__field">
                          <label className="conn-dialog__label" htmlFor="conn-host">
                            {t('explorer.dialog.fields.host')}
                          </label>
                          <ConnectionInput
                            id="conn-host"
                            className={`conn-dialog__input${errors.host ? ' conn-dialog__input--error' : ''}`}
                            type="text"
                            value={form.host}
                            onChange={(e) => setField('host', e.target.value)}
                            placeholder="localhost"
                          />
                          {errors.host && <span className="conn-dialog__error">{errors.host}</span>}
                        </div>

                        {/* Port */}
                        <div className="conn-dialog__field">
                          <label className="conn-dialog__label" htmlFor="conn-port">
                            {t('explorer.dialog.fields.port')}
                          </label>
                          <ConnectionInput
                            id="conn-port"
                            className={`conn-dialog__input${errors.port ? ' conn-dialog__input--error' : ''}`}
                            type="number"
                            min={1}
                            max={65535}
                            value={form.port}
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10)
                              setField('port', isNaN(val) ? 0 : val)
                            }}
                          />
                          {errors.port && <span className="conn-dialog__error">{errors.port}</span>}
                        </div>

                        {/* Username */}
                        <div className="conn-dialog__field">
                          <label className="conn-dialog__label" htmlFor="conn-username">
                            {t('explorer.dialog.fields.username')}
                          </label>
                          <ConnectionInput
                            id="conn-username"
                            className={`conn-dialog__input${errors.username ? ' conn-dialog__input--error' : ''}`}
                            type="text"
                            value={form.username}
                            onChange={(e) => setField('username', e.target.value)}
                            placeholder="sa"
                          />
                          {errors.username && (
                            <span className="conn-dialog__error">{errors.username}</span>
                          )}
                        </div>

                        {/* Password + Remember Password */}
                        <div className="conn-dialog__field">
                          <label className="conn-dialog__label" htmlFor="conn-password">
                            {t('explorer.dialog.fields.password')}
                          </label>
                          <ConnectionInput
                            id="conn-password"
                            className="conn-dialog__input"
                            type="password"
                            value={form.password}
                            onChange={(e) => setField('password', e.target.value)}
                            placeholder="••••••••"
                          />
                          <label className="conn-dialog__checkbox-row">
                            <input
                              type="checkbox"
                              className="conn-dialog__checkbox"
                              checked={form.rememberPassword}
                              onChange={(e) => setField('rememberPassword', e.target.checked)}
                            />
                            <span className="conn-dialog__checkbox-label">
                              {t('explorer.dialog.fields.rememberPassword')}
                            </span>
                          </label>
                        </div>

                        {/* Default Database – full width */}
                        <div className="conn-dialog__field conn-dialog__field--span">
                          <label className="conn-dialog__label" htmlFor="conn-default-db">
                            {t('explorer.dialog.fields.defaultDatabase')}
                          </label>
                          <ConnectionInput
                            id="conn-default-db"
                            className="conn-dialog__input"
                            type="text"
                            value={form.defaultDatabase}
                            onChange={(e) => setField('defaultDatabase', e.target.value)}
                            placeholder="master"
                          />
                        </div>

                        {/* ── SSL / TLS (PostgreSQL) ── */}
                        {isPostgres && (
                          <>
                            {/* SSL Mode */}
                            <div className="conn-dialog__field conn-dialog__field--span">
                              <label className="conn-dialog__label" htmlFor="conn-pg-ssl-mode">
                                {t('explorer.dialog.fields.postgresSslMode')}
                              </label>
                              <select
                                id="conn-pg-ssl-mode"
                                className="conn-dialog__select"
                                value={form.postgresSslMode ?? 'prefer'}
                                onChange={(e) =>
                                  setField(
                                    'postgresSslMode',
                                    e.target.value as NonNullable<FormData['postgresSslMode']>
                                  )
                                }
                              >
                                <option value="disable">
                                  {t('explorer.dialog.fields.postgresSslModeDisable')}
                                </option>
                                <option value="allow">
                                  {t('explorer.dialog.fields.postgresSslModeAllow')}
                                </option>
                                <option value="prefer">
                                  {t('explorer.dialog.fields.postgresSslModePrefer')}
                                </option>
                                <option value="require">
                                  {t('explorer.dialog.fields.postgresSslModeRequire')}
                                </option>
                                <option value="verify-ca">
                                  {t('explorer.dialog.fields.postgresSslModeVerifyCa')}
                                </option>
                                <option value="verify-full">
                                  {t('explorer.dialog.fields.postgresSslModeVerifyFull')}
                                </option>
                              </select>
                            </div>

                            {/* CA Certificate – only for verify-ca / verify-full */}
                            {(form.postgresSslMode === 'verify-ca' ||
                              form.postgresSslMode === 'verify-full') && (
                              <div className="conn-dialog__field conn-dialog__field--span">
                                <label className="conn-dialog__label" htmlFor="conn-pg-tls-ca-file">
                                  {t('explorer.dialog.fields.postgresTlsCAFile')}
                                </label>
                                <div className="conn-dialog__file-row">
                                  <ConnectionInput
                                    id="conn-pg-tls-ca-file"
                                    className="conn-dialog__input"
                                    type="text"
                                    value={form.tlsCAFile ?? ''}
                                    onChange={(e) => setField('tlsCAFile', e.target.value)}
                                    placeholder="/path/to/ca.pem"
                                  />
                                  <Button
                                    variant="secondary"
                                    size="lg"
                                    className="conn-dialog__file-browse"
                                    onClick={async () => {
                                      const result = await window.api.file.openFileDialog()
                                      if (result.status === 'ok')
                                        setField('tlsCAFile', result.filePath)
                                    }}
                                  >
                                    <FolderOpen size={14} />
                                    {t('explorer.dialog.fields.browseFile')}
                                  </Button>
                                </div>
                              </div>
                            )}

                            {/* Server Name (SNI) – any encrypted mode */}
                            {form.postgresSslMode && form.postgresSslMode !== 'disable' && (
                              <div className="conn-dialog__field conn-dialog__field--span">
                                <label
                                  className="conn-dialog__label"
                                  htmlFor="conn-pg-tls-servername"
                                >
                                  {t('explorer.dialog.fields.postgresTlsServername')}
                                </label>
                                <ConnectionInput
                                  id="conn-pg-tls-servername"
                                  className="conn-dialog__input"
                                  type="text"
                                  value={form.tlsServername ?? ''}
                                  onChange={(e) => setField('tlsServername', e.target.value)}
                                  placeholder={form.host || 'optional'}
                                />
                              </div>
                            )}
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Connection String tab panel */}
              {activeTab === 'connectionString' && (
                <div className="conn-dialog__tab-panel" role="tabpanel">
                  <textarea
                    className="conn-dialog__conn-string-area"
                    value={connectionString}
                    onChange={(e) => handleConnectionStringChange(e.target.value)}
                    spellCheck={false}
                    aria-label={t('explorer.dialog.tabs.connectionString')}
                  />
                  {connectionStringError && (
                    <span className="conn-dialog__conn-string-error">{connectionStringError}</span>
                  )}
                </div>
              )}

              {/* Options tab panel */}
              {activeTab === 'options' && (
                <div className="conn-dialog__tab-panel conn-dialog__options" role="tabpanel">
                  {/* Icon Color */}
                  <div className="conn-dialog__options-row">
                    <div className="conn-dialog__options-row-info">
                      <span className="conn-dialog__options-label">
                        {t('explorer.dialog.fields.color')}
                      </span>
                    </div>
                    <div className="conn-dialog__color-field">
                      <input
                        id="conn-color"
                        type="color"
                        className="conn-dialog__color-input"
                        value={form.color || PROVIDER_METADATA[form.provider].color}
                        onChange={(e) => setField('color', e.target.value)}
                        aria-label={t('explorer.dialog.fields.color')}
                      />
                      <Button
                        variant="ghost"
                        size="lg"
                        className="conn-dialog__color-reset"
                        onClick={() => setField('color', '')}
                        disabled={!form.color}
                      >
                        {t('explorer.dialog.fields.colorResetDefault')}
                      </Button>
                    </div>
                  </div>

                  <div className="conn-dialog__options-row conn-dialog__options-row--stacked">
                    <div className="conn-dialog__options-row-info">
                      <span className="conn-dialog__options-label">
                        {t('explorer.dialog.fields.environment')}
                      </span>
                      <span className="conn-dialog__options-desc">
                        {t('explorer.dialog.fields.environmentDesc')}
                      </span>
                    </div>
                    <SearchableSelect
                      ariaLabel={t('explorer.dialog.fields.environment')}
                      value={form.environmentId ?? ''}
                      onChange={(value) => setField('environmentId', value || undefined)}
                      emptyOptionLabel={t('explorer.dialog.fields.environmentUnset')}
                      searchPlaceholder={t('explorer.dialog.fields.environmentSearchPlaceholder')}
                      noResultsLabel={t('explorer.dialog.fields.environmentNoResults')}
                      options={availableEnvironments.map((environment) => ({
                        value: environment.id,
                        label: environment.name,
                        description: environment.description
                      }))}
                    />
                  </div>

                  {/* Auto Connect */}
                  <div className="conn-dialog__options-row">
                    <div className="conn-dialog__options-row-info">
                      <span className="conn-dialog__options-label">
                        {t('explorer.dialog.fields.autoConnect')}
                      </span>
                      <span className="conn-dialog__options-desc">
                        {t('explorer.dialog.fields.autoConnectDesc')}
                      </span>
                    </div>
                    <Toggle
                      id="conn-auto-connect"
                      label={t('explorer.dialog.fields.autoConnect')}
                      checked={form.autoConnect ?? false}
                      onChange={(checked) => setField('autoConnect', checked)}
                      size="sm"
                    />
                  </div>

                  {/* Eager Loading */}
                  <div className="conn-dialog__options-row">
                    <div className="conn-dialog__options-row-info">
                      <span className="conn-dialog__options-label">
                        {t('explorer.dialog.fields.eagerLoading')}
                      </span>
                      <span className="conn-dialog__options-desc">
                        {t('explorer.dialog.fields.eagerLoadingDesc')}
                      </span>
                    </div>
                    <Toggle
                      id="conn-eager-loading"
                      label={t('explorer.dialog.fields.eagerLoading')}
                      checked={form.eagerLoading ?? false}
                      onChange={(checked) => setField('eagerLoading', checked)}
                      size="sm"
                    />
                  </div>

                  {/* Background Auto Refresh */}
                  <div className="conn-dialog__options-row">
                    <div className="conn-dialog__options-row-info">
                      <span className="conn-dialog__options-label">
                        {t('explorer.dialog.fields.backgroundAutoRefresh')}
                      </span>
                      <span className="conn-dialog__options-desc">
                        {t('explorer.dialog.fields.backgroundAutoRefreshDesc')}
                      </span>
                    </div>
                    <Toggle
                      id="conn-background-auto-refresh"
                      label={t('explorer.dialog.fields.backgroundAutoRefresh')}
                      checked={form.backgroundAutoRefresh ?? false}
                      onChange={(checked) => setField('backgroundAutoRefresh', checked)}
                      size="sm"
                    />
                  </div>

                  {/* Hide Empty Logical Databases (Redis only) */}
                  {isRedis && (
                    <div className="conn-dialog__options-row">
                      <div className="conn-dialog__options-row-info">
                        <span className="conn-dialog__options-label">
                          {t('explorer.dialog.fields.redisHideEmptyDatabases')}
                        </span>
                        <span className="conn-dialog__options-desc">
                          {t('explorer.dialog.fields.redisHideEmptyDatabasesDesc')}
                        </span>
                      </div>
                      <Toggle
                        id="conn-redis-hide-empty-databases"
                        label={t('explorer.dialog.fields.redisHideEmptyDatabases')}
                        checked={form.redisHideEmptyDatabases ?? false}
                        onChange={(checked) => setField('redisHideEmptyDatabases', checked)}
                        size="sm"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Users tab panel */}
              {activeTab === 'users' && (
                <div className="conn-dialog__tab-panel conn-dialog__users" role="tabpanel">
                  <p className="conn-dialog__users-intro">{t('explorer.dialog.users.intro')}</p>
                  {(form.additionalUsers ?? []).length === 0 ? (
                    <p className="conn-dialog__users-empty">{t('explorer.dialog.users.empty')}</p>
                  ) : (
                    <div className="conn-dialog__users-table-wrap">
                      <table className="conn-dialog__users-table">
                        <thead>
                          <tr>
                            <th>{t('explorer.dialog.users.profileName')}</th>
                            <th>{t('explorer.dialog.users.username')}</th>
                            <th>{t('explorer.dialog.users.password')}</th>
                            <th aria-hidden="true"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {(form.additionalUsers ?? []).map((user) => (
                            <tr key={user.id} className="conn-dialog__users-row">
                              <td>{user.profileName?.trim() || user.username}</td>
                              <td>{user.username}</td>
                              <td>{user.password ? '••••••••' : '—'}</td>
                              <td>
                                <div className="conn-dialog__user-actions">
                                  <button
                                    type="button"
                                    className="conn-dialog__user-action-btn"
                                    aria-label={t('explorer.dialog.users.edit')}
                                    onClick={() => openEditUserModal(user)}
                                  >
                                    <Pencil size={13} aria-hidden="true" />
                                  </button>
                                  <button
                                    type="button"
                                    className="conn-dialog__user-action-btn conn-dialog__user-action-btn--danger"
                                    aria-label={t('explorer.dialog.users.remove')}
                                    onClick={() => removeUser(user.id)}
                                  >
                                    <Trash2 size={13} aria-hidden="true" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {errors.additionalUsers && (
                    <span className="conn-dialog__error">{errors.additionalUsers}</span>
                  )}
                  <Button
                    variant="secondary"
                    size="lg"
                    className="conn-dialog__users-add"
                    onClick={openAddUserModal}
                  >
                    {t('explorer.dialog.users.add')}
                  </Button>
                </div>
              )}
            </div>
          </div>
          {/* end conn-dialog__scroll-area */}

          <div className="conn-dialog__footer">
            <div className="conn-dialog__actions">
              <div className="conn-dialog__actions-left">
                <Button
                  variant="secondary"
                  size="lg"
                  onClick={() => {
                    void handleTestConnection()
                  }}
                  isLoading={testStatus === 'testing'}
                  disabled={
                    testStatus === 'testing' ||
                    isSaving ||
                    (isSqlite
                      ? !form.filePath?.trim()
                      : isRedis
                        ? form.redisMode !== 'sentinel'
                          ? !form.host.trim()
                          : !form.sentinelNodes?.trim()
                        : isMongoDB
                          ? !form.host.trim()
                          : !form.host.trim() || !form.username.trim())
                  }
                >
                  {testStatus === 'testing'
                    ? t('explorer.dialog.actions.testingConnection')
                    : t('explorer.dialog.actions.testConnection')}
                </Button>
              </div>
              <div className="conn-dialog__actions-right">
                <Button variant="ghost" size="lg" onClick={onCancel}>
                  {t('explorer.dialog.actions.cancel')}
                </Button>
                <Button type="submit" variant="primary" size="lg" disabled={isSaving}>
                  {isEdit ? t('explorer.dialog.actions.update') : t('explorer.dialog.actions.save')}
                </Button>
              </div>
            </div>
            {testStatus === 'success' && (
              <div className="conn-dialog__test-result conn-dialog__test-result--success">
                <CheckCircle size={14} className="conn-dialog__test-result-icon" />
                <span>{testMessage}</span>
              </div>
            )}
            {testStatus === 'error' && testMessage && <ErrorBox error={testMessage} />}
          </div>
          {/* end conn-dialog__footer */}
        </form>
      </BaseDialog>
      {userModal && (
        <AddEditUserModal
          user={userModal.mode === 'edit' ? userModal.user : undefined}
          onSave={saveUserFromModal}
          onClose={closeUserModal}
        />
      )}
    </>
  )
}

export default NewConnectionDialog

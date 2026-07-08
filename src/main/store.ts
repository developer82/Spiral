import ElectronStore from 'electron-store'

export type ErdBackground = 'none' | 'dots' | 'grid'

export interface EnvironmentDefinition {
  id: string
  name: string
  description: string
  critical: boolean
  color: string
}

export type ConnectionSortField = 'name' | 'createdAt' | 'lastUsedAt' | 'provider' | 'environment'
export type SortDirection = 'asc' | 'desc'

export interface ConnectionSortOrder {
  field: ConnectionSortField
  direction: SortDirection
}

export interface AppSettings {
  language: string
  theme: string
  nativeThemeSource: 'dark' | 'light' | 'system'
  showSideNavigationBar: boolean
  syntaxHighlighting: boolean
  showGridLines: boolean
  fontScaling: number
  queryTimeout: number
  showSystemDatabases: boolean
  selectTopRowsCount: number
  defaultErdBackground: ErdBackground
  autoIncludeExecutionPlan: boolean
  autoIncludeClientStatistics: boolean
  customTitlebar: boolean
  enableAnimations: boolean
  uppercaseColumnHeaders: boolean
  showKeyIconsInResults: boolean
  useInteractiveTables: boolean
  environments: EnvironmentDefinition[]
  defaultConnectionSort: ConnectionSortOrder
  askBeforeIncludingSecretsInComparisonExport: boolean
  includeSecretsInComparisonExportByDefault: boolean
  likeConfetti: boolean
  showTipsAndTricks: boolean
  copyJsonFormatted: boolean
  hfToken: string
  showToolbarTextButtons: boolean
  darkTerminals: boolean
  glassEffectHour: number
  glassEffectManualColor: string
  analyticsEnabled: boolean
  mysqlDumpPath: string
  mysqlClientPath: string
  pgDumpPath: string
  pgRestorePath: string
  psqlPath: string
  mongodumpPath: string
  mongorestorePath: string
}

const DEFAULT_PRODUCTION_ENVIRONMENT_COLOR = '#ff3b30'

export const DEFAULT_ENVIRONMENTS: EnvironmentDefinition[] = [
  {
    id: 'production',
    name: 'Production',
    description: 'Live production environment.',
    critical: true,
    color: DEFAULT_PRODUCTION_ENVIRONMENT_COLOR
  },
  {
    id: 'qa',
    name: 'QA',
    description: 'Quality assurance and pre-release validation.',
    critical: false,
    color: '#2e7d32'
  },
  {
    id: 'development',
    name: 'Development',
    description: 'Local development and internal testing.',
    critical: false,
    color: '#6b7280'
  }
]

export const DEFAULT_SETTINGS: AppSettings = {
  language: 'en',
  theme: 'dark',
  nativeThemeSource: 'dark',
  showSideNavigationBar: true,
  syntaxHighlighting: true,
  showGridLines: false,
  fontScaling: 100,
  queryTimeout: 30,
  showSystemDatabases: false,
  selectTopRowsCount: 1000,
  defaultErdBackground: 'dots',
  autoIncludeExecutionPlan: false,
  autoIncludeClientStatistics: false,
  customTitlebar: true,
  enableAnimations: true,
  uppercaseColumnHeaders: false,
  showKeyIconsInResults: false,
  useInteractiveTables: false,
  environments: DEFAULT_ENVIRONMENTS,
  defaultConnectionSort: { field: 'name', direction: 'asc' },
  askBeforeIncludingSecretsInComparisonExport: true,
  includeSecretsInComparisonExportByDefault: false,
  likeConfetti: false,
  showTipsAndTricks: true,
  copyJsonFormatted: true,
  hfToken: '',
  showToolbarTextButtons: process.platform !== 'darwin',
  darkTerminals: true,
  glassEffectHour: -1,
  glassEffectManualColor: '',
  analyticsEnabled: true,
  mysqlDumpPath: '',
  mysqlClientPath: '',
  pgDumpPath: '',
  pgRestorePath: '',
  psqlPath: '',
  mongodumpPath: '',
  mongorestorePath: ''
}

export type ConnectionProvider = 'sqlserver' | 'postgres' | 'mysql' | 'sqlite' | 'redis' | 'mongodb'

/**
 * An additional user account configured for a connection ("Connect As…").
 * Only `username` is required; `password` is optional and encrypted at rest
 * exactly like the main connection password. Mirrors the renderer type in
 * `src/renderer/src/pages/Explorer/connections.types.ts`.
 */
export interface ConnectionUserProfile {
  id: string
  profileName?: string
  username: string
  password?: string
}

export type ComparisonScopeKey =
  | 'schema.tablesCoreConstraints'
  | 'schema.programmableObjects'
  | 'schema.indexingSubsystems'
  | 'schema.securityMetadataProfiles'
  | 'data.rowLevelValues'
  | 'data.keyMatchedSets'

export interface ComparisonEndpoint {
  connectionId: string
  databaseName: string
  provider: ConnectionProvider
}

export interface ComparisonTableKeyMapping {
  sourceTable: string
  targetTable: string
  sourceColumns: string[]
  targetColumns: string[]
}

export interface ComparisonRecord {
  id: string
  name: string
  description: string
  source: ComparisonEndpoint
  target: ComparisonEndpoint
  scopeKeys: ComparisonScopeKey[]
  tableKeyMappings: ComparisonTableKeyMapping[]
  createdAt: string
  updatedAt: string
}

export interface ConnectionRecord {
  id: string
  name: string
  provider: ConnectionProvider
  host: string
  port: number
  username: string
  password: string
  rememberPassword: boolean
  /** When true, connect anonymously — no username/password persisted or sent. */
  anonymousLogin?: boolean
  defaultDatabase: string
  /** Path to the SQLite database file (used when provider === 'sqlite'). */
  filePath?: string
  color?: string
  environmentId?: string
  autoConnect?: boolean
  eagerLoading?: boolean
  backgroundAutoRefresh?: boolean
  erdFiles?: { databaseName: string; filePath: string }[]
  /** Additional user accounts available via the "Connect As…" context menu. */
  additionalUsers?: ConnectionUserProfile[]
  createdAt?: string
  lastUsedAt?: string
  // ── Redis-specific fields ─────────────────────────────────────────────────
  /** Deployment mode for Redis connections. Defaults to 'standalone'. */
  redisMode?: 'standalone' | 'cluster' | 'sentinel'
  /** Sentinel master name (required when redisMode === 'sentinel'). */
  sentinelMasterName?: string
  /** Comma-separated list of sentinel node addresses, e.g. "host1:26379,host2:26379". */
  sentinelNodes?: string
  /** Whether to connect using TLS/SSL. */
  tlsEnabled?: boolean
  /** Override the hostname used for TLS SNI (optional). */
  tlsServername?: string
  /** Whether to reject unauthorised TLS certificates. Defaults to true. */
  tlsRejectUnauthorized?: boolean
  /** Whether to connect via an SSH tunnel. */
  sshEnabled?: boolean
  /** SSH server hostname. */
  sshHost?: string
  /** SSH server port. Defaults to 22. */
  sshPort?: number
  /** SSH login username. */
  sshUsername?: string
  /** Authentication method for the SSH tunnel. */
  sshAuthMode?: 'password' | 'privateKey'
  /** SSH password (used when sshAuthMode === 'password'). */
  sshPassword?: string
  /** Absolute path to the SSH private key file (used when sshAuthMode === 'privateKey'). */
  sshPrivateKeyPath?: string
  /** Passphrase to decrypt the SSH private key (optional). */
  sshPassphrase?: string
  /** When true, only Redis logical databases that contain at least one key are shown in the tree. */
  redisHideEmptyDatabases?: boolean
  // ── MongoDB-specific fields ───────────────────────────────────────────────
  /** When true, connect via DNS Seedlist (SRV) — generates mongodb+srv:// URI. */
  mongodbSrv?: boolean
  /** Full MongoDB connection URI (overrides individual host/port/auth fields when set). */
  mongodbUri?: string
  /** Authentication mechanism for MongoDB. Defaults to SCRAM-SHA-256 when not specified. */
  mongodbAuthMechanism?: 'SCRAM-SHA-1' | 'SCRAM-SHA-256' | 'MONGODB-X509' | 'GSSAPI' | 'PLAIN' | 'MONGODB-AWS'
  /** Authentication database. Defaults to 'admin'; use '$external' for X.509/Kerberos/LDAP/AWS. */
  mongodbAuthSource?: string
  /** Comma-separated mechanism properties, e.g. "SERVICE_NAME:mongodb,CANONICALIZE_HOST_NAME:none" */
  mongodbAuthMechanismProperties?: string
  /** Replica set name for replica set connections (e.g. "rs0"). */
  mongodbReplicaSet?: string
  /** Direct connection flag — bypasses SRV and topology discovery. */
  mongodbDirectConnection?: boolean
  /** Path to a CA certificate PEM file for TLS verification. */
  tlsCAFile?: string
  /** Path to the client certificate/key PEM file for TLS or X.509 auth. */
  tlsCertificateKeyFile?: string
  /** Passphrase for the client certificate/key file (if encrypted). */
  tlsCertificateKeyFilePassword?: string
  /** Whether to skip hostname verification on the TLS certificate. */
  tlsAllowInvalidHostnames?: boolean
  /** Whether to skip certificate validation entirely. */
  tlsAllowInvalidCertificates?: boolean
  // ── PostgreSQL-specific fields ────────────────────────────────────────────
  /**
   * PostgreSQL SSL negotiation mode, mirroring libpq's `sslmode`.
   * When unset, the provider falls back to the legacy `tlsEnabled` toggle.
   */
  postgresSslMode?: 'disable' | 'allow' | 'prefer' | 'require' | 'verify-ca' | 'verify-full'
}

interface ConnectionsData {
  connections: ConnectionRecord[]
}

interface ComparisonsData {
  comparisons: ComparisonRecord[]
}

const store = new ElectronStore<AppSettings>({
  defaults: DEFAULT_SETTINGS
})

export const connectionsStore = new ElectronStore<ConnectionsData>({
  name: 'connections',
  defaults: { connections: [] }
})

export const comparisonsStore = new ElectronStore<ComparisonsData>({
  name: 'comparisons',
  defaults: { comparisons: [] }
})

interface UpdaterState {
  previousVersion?: string
  /** Version of an update that finished downloading but has not been installed yet. */
  downloadedVersion?: string
  /** Absolute path to the downloaded installer, used to verify it still exists. */
  downloadedFile?: string
}

export const updaterStore = new ElectronStore<UpdaterState>({
  name: 'updater-state',
  defaults: {}
})

interface AnalyticsState {
  clientId: string
}

export const analyticsStore = new ElectronStore<AnalyticsState>({
  name: 'analytics-state',
  defaults: { clientId: '' }
})

// ── MongoDB Aggregations ──────────────────────────────────────────────────────

export interface MongoAggregationStage {
  id: string
  stageType: string
  json: string
  enabled: boolean
  collapsed: boolean
}

export interface MongoAggregationDefinition {
  id: string
  connectionId: string
  databaseName: string
  collectionName: string
  name: string
  stages: MongoAggregationStage[]
  createdAt: string
  updatedAt: string
}

interface AggregationsData {
  aggregations: MongoAggregationDefinition[]
}

export const aggregationsStore = new ElectronStore<AggregationsData>({
  name: 'mongo-aggregations',
  defaults: { aggregations: [] }
})

// ── User Profile & Auth ───────────────────────────────────────────────────────

export interface ProfileData {
  displayName: string
  /** Filename of the managed avatar image (relative to the profile avatars folder). */
  avatarFile: string | null
  /** Avatar zoom level (1 = fill, >1 = zoomed in). */
  avatarZoom: number
  /** Avatar horizontal pan offset as a percentage of the container width. */
  avatarOffsetX: number
  /** Avatar vertical pan offset as a percentage of the container height. */
  avatarOffsetY: number
  /** Whether startup password lock is enabled. */
  lockOnStartup: boolean
  /** Whether inactivity-based locking is enabled. */
  lockOnInactivity: boolean
  /** Whether minimizing the window locks the app. */
  lockOnMinimize: boolean
  /** Inactivity lock timeout in minutes. */
  inactivityTimeoutMinutes: number
  /** Argon2-style versioned metadata: "v1:<salt>:<hash>" using Node scrypt. */
  passwordMeta: string | null
  /** scrypt salt used to derive the AES-256 connection encryption key from the user password. */
  connectionEncryptionSalt: string | null
  /** safeStorage-encrypted (base64) copy of the derived connection encryption key for startup use. */
  connectionKeyEncrypted: string | null
  /** safeStorage-encrypted JSON blob tracking brute-force lockout state. null = no history. */
  lockoutStateEncrypted: string | null
}

const DEFAULT_PROFILE: ProfileData = {
  displayName: '',
  avatarFile: null,
  avatarZoom: 1,
  avatarOffsetX: 0,
  avatarOffsetY: 0,
  lockOnStartup: false,
  lockOnInactivity: false,
  lockOnMinimize: false,
  inactivityTimeoutMinutes: 5,
  passwordMeta: null,
  connectionEncryptionSalt: null,
  connectionKeyEncrypted: null,
  lockoutStateEncrypted: null
}

export const profileStore = new ElectronStore<ProfileData>({
  name: 'profile',
  defaults: DEFAULT_PROFILE
})

// ── AI State ──────────────────────────────────────────────────────────────────

export interface AiState {
  activeModelId: string | null
  aiPanelOpen: boolean
  aiPanelWidth: number
}

export const aiStore = new ElectronStore<AiState>({
  name: 'ai-state',
  defaults: {
    activeModelId: null,
    aiPanelOpen: false,
    aiPanelWidth: 380
  }
})

export default store

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  RefreshCw,
  Copy,
  ExternalLink,
  Loader2,
  Server,
  MemoryStick,
  Activity,
  Database,
  HardDrive,
  GitBranch,
  Zap,
  Search,
  ChevronDown,
  ChevronRight,
  Trash2,
  TriangleAlert
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useSettingsContext } from '../../../contexts/SettingsContext'
import type { DashboardTab } from '../explorer.types'
import type { ConnectionRecord } from '../connections.types'
import type { RedisDashboardSnapshot, RedisDashboardCommand } from '../../../../../preload/index.d'
import ConfirmDialog from '../../../components/ConfirmDialog/ConfirmDialog'
import ErrorDialog from '../../../components/ErrorDialog/ErrorDialog'
import './RedisDashboardTab.css'

interface RedisDashboardTabProps {
  tab: DashboardTab
  connection: ConnectionRecord | undefined
  backgroundAutoRefresh: boolean
  onOpenQueryTab: (content: string) => void
}

type CommandConfirm = {
  command: RedisDashboardCommand
  databaseIndex?: number
  title: string
  message: string
  variant: 'primary' | 'danger'
}

const AUTO_REFRESH_INTERVAL_MS = 30_000

function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined) return '—'
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log2(Math.max(1, bytes)) / 10)
  const idx = Math.min(i, units.length - 1)
  const val = bytes / Math.pow(1024, idx)
  return `${val % 1 === 0 ? val : val.toFixed(2)} ${units[idx]}`
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (d > 0) return `${d}d ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m ${s}s`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function formatTimestamp(unixSec: number | undefined): string {
  if (unixSec === undefined || unixSec <= 0) return '—'
  return new Date(unixSec * 1000).toLocaleString()
}

function StatRow({ label, value }: { label: string; value: React.ReactNode }): React.JSX.Element {
  return (
    <div className="redis-dashboard__stat-row">
      <span className="redis-dashboard__stat-label">{label}</span>
      <span className="redis-dashboard__stat-value">{value ?? '—'}</span>
    </div>
  )
}

function ServerProp({ label, value }: { label: string; value: React.ReactNode }): React.JSX.Element {
  return (
    <span className="redis-dashboard__server-prop">
      <span className="redis-dashboard__server-prop-label">{label}</span>
      <strong className="redis-dashboard__server-prop-value">{value ?? '—'}</strong>
    </span>
  )
}

interface SectionProps {
  icon: React.ReactNode
  title: string
  defaultOpen?: boolean
  collapsible?: boolean
  children: React.ReactNode
}

interface PrimaryMetric {
  label: string
  value: React.ReactNode
  dotColor: string
}

interface SecondaryMetric {
  label: string
  value: React.ReactNode
}

function PremiumMetricCard({
  icon,
  title,
  className,
  primaryMetrics,
  secondaryMetrics
}: {
  icon: React.ReactNode
  title: string
  className?: string
  primaryMetrics: PrimaryMetric[]
  secondaryMetrics: (SecondaryMetric | null)[]
}): React.JSX.Element {
  const filtered = secondaryMetrics.filter(Boolean) as SecondaryMetric[]
  return (
    <div className={`redis-dashboard__premium-card${className ? ` ${className}` : ''}`}>
      <div className="redis-dashboard__premium-card-header">
        <span className="redis-dashboard__premium-card-icon">{icon}</span>
        <span className="redis-dashboard__premium-card-title">{title}</span>
      </div>
      <div className="redis-dashboard__premium-card-primary">
        {primaryMetrics.map((m, i) => (
          <div key={i} className="redis-dashboard__premium-metric">
            <div className="redis-dashboard__premium-metric-header">
              <span className="redis-dashboard__premium-metric-dot" style={{ background: m.dotColor }} />
              <span className="redis-dashboard__premium-metric-label">{m.label}</span>
            </div>
            <div className="redis-dashboard__premium-metric-value">{m.value}</div>
          </div>
        ))}
      </div>
      <div className="redis-dashboard__premium-card-divider" />
      <div className="redis-dashboard__premium-card-secondary">
        {filtered.map((m, i) => (
          <div key={i} className="redis-dashboard__premium-secondary-metric">
            <span className="redis-dashboard__premium-secondary-label">{m.label}</span>
            <span className="redis-dashboard__premium-secondary-value">{m.value ?? '—'}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function Section({ icon, title, defaultOpen = true, collapsible = true, children }: SectionProps): React.JSX.Element {
  const [open, setOpen] = useState(defaultOpen)
  if (!collapsible) {
    return (
      <div className="redis-dashboard__section">
        <div className="redis-dashboard__section-header redis-dashboard__section-header--static">
          <span className="redis-dashboard__section-icon">{icon}</span>
          <span className="redis-dashboard__section-title">{title}</span>
        </div>
        <div className="redis-dashboard__section-body">{children}</div>
      </div>
    )
  }
  return (
    <div className="redis-dashboard__section">
      <button
        className="redis-dashboard__section-header"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open ? 'true' : 'false'}
      >
        <span className="redis-dashboard__section-icon">{icon}</span>
        <span className="redis-dashboard__section-title">{title}</span>
        <span className="redis-dashboard__section-chevron">
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </span>
      </button>
      {open && <div className="redis-dashboard__section-body">{children}</div>}
    </div>
  )
}

export default function RedisDashboardTab({
  tab,
  connection,
  backgroundAutoRefresh,
  onOpenQueryTab
}: RedisDashboardTabProps): React.JSX.Element {
  const { t } = useTranslation()
  const { settings } = useSettingsContext()

  const connectionEnvironment = connection?.environmentId
    ? (settings.environments.find((e) => e.id === connection.environmentId) ?? null)
    : null

  const [snapshot, setSnapshot] = useState<RedisDashboardSnapshot | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [infoSearch, setInfoSearch] = useState('')
  const [commandConfirm, setCommandConfirm] = useState<CommandConfirm | null>(null)
  const [commandRunning, setCommandRunning] = useState(false)
  const [commandResult, setCommandResult] = useState<{ status: 'ok' | 'error'; message: string } | null>(null)
  const [flashKey, setFlashKey] = useState(0)
  const [errorDialog, setErrorDialog] = useState<string | null>(null)

  const autoRefreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    setCommandResult(null)
    try {
      const result = await window.api.database.getRedisDashboard(tab.connectionId)
      if (result.status === 'ok') {
        setSnapshot(result.snapshot)
      } else {
        setError(result.message)
      }
    } finally {
      setLoading(false)
    }
  }, [tab.connectionId])

  // Initial load
  useEffect(() => {
    void refresh()
  }, [refresh])

  // Auto-refresh on interval
  useEffect(() => {
    if (autoRefreshTimerRef.current) {
      clearInterval(autoRefreshTimerRef.current)
      autoRefreshTimerRef.current = null
    }
    autoRefreshTimerRef.current = setInterval(() => {
      void refresh()
    }, AUTO_REFRESH_INTERVAL_MS)
    return () => {
      if (autoRefreshTimerRef.current) {
        clearInterval(autoRefreshTimerRef.current)
        autoRefreshTimerRef.current = null
      }
    }
  }, [refresh])

  // Also refresh when background refresh events fire (if backgroundAutoRefresh is on)
  useEffect(() => {
    if (!backgroundAutoRefresh) return
    const unsub = window.api.database.onBackgroundRefresh((payload: { connectionId: string }) => {
      if (payload.connectionId === tab.connectionId) {
        void refresh()
      }
    })
    return unsub
  }, [backgroundAutoRefresh, tab.connectionId, refresh])

  // Restart flash animation on each new error
  useEffect(() => {
    if (error) setFlashKey(k => k + 1)
  }, [error])

  function handleCopySnapshot(): void {
    if (!snapshot) return
    void navigator.clipboard.writeText(JSON.stringify(snapshot, null, 2))
  }

  function handleOpenRawInfo(): void {
    if (!snapshot) return
    const lines = snapshot.rawInfo.map((r) => `# ${r.section}\n${r.key}:${r.value}`).join('\n')
    onOpenQueryTab(`INFO all\n\n/* Raw INFO output:\n${lines}\n*/`)
  }

  async function executeCommand(cmd: RedisDashboardCommand, databaseIndex?: number): Promise<void> {
    setCommandRunning(true)
    setCommandResult(null)
    try {
      const result = await window.api.database.executeRedisDashboardCommand(tab.connectionId, cmd, databaseIndex)
      setCommandResult({ status: result.status, message: result.status === 'ok' ? (result.message ?? t('explorer.redisDashboard.commandSuccess')) : result.message })
      if (result.status === 'ok') {
        setTimeout(() => { void refresh() }, 500)
      }
    } finally {
      setCommandRunning(false)
    }
  }

  function requestCommand(conf: CommandConfirm): void {
    setCommandConfirm(conf)
  }


  function handleCommandConfirmed(): void {
    if (!commandConfirm) return
    const { command, databaseIndex } = commandConfirm
    setCommandConfirm(null)
    void executeCommand(command, databaseIndex)
  }

  const filteredInfo = snapshot?.rawInfo.filter(
    (r) =>
      !infoSearch ||
      r.key.toLowerCase().includes(infoSearch.toLowerCase()) ||
      r.value.toLowerCase().includes(infoSearch.toLowerCase()) ||
      r.section.toLowerCase().includes(infoSearch.toLowerCase())
  ) ?? []

  const lastRefreshedLabel = snapshot
    ? new Date(snapshot.fetchedAt).toLocaleTimeString()
    : null

  return (
    <div className="redis-dashboard">
      {/* Header */}
      <div className="redis-dashboard__header">
        <div className="redis-dashboard__header-left">
          <h2 className="redis-dashboard__title">
            {connection?.name ?? tab.connectionId}
            {connectionEnvironment && (
              <span
                className="redis-dashboard__title-env"
                style={{ color: connectionEnvironment.color }}
              >
                ({connectionEnvironment.name})
              </span>
            )}
          </h2>
          {snapshot && (
            <span className="redis-dashboard__mode-badge redis-dashboard__mode-badge--{snapshot.mode}">
              {snapshot.mode}
            </span>
          )}
        </div>
        <div className="redis-dashboard__header-right">
          {lastRefreshedLabel && (
            <span className="redis-dashboard__last-refreshed">
              {t('explorer.redisDashboard.lastRefreshed')}: {lastRefreshedLabel}
            </span>
          )}
          {backgroundAutoRefresh && (
            <span className="redis-dashboard__auto-refresh-badge" title={t('explorer.redisDashboard.autoRefreshOn')}>
              {t('explorer.redisDashboard.autoRefreshOn')}
            </span>
          )}
          <button
            className="redis-dashboard__action-btn redis-dashboard__action-btn--primary"
            onClick={() => void refresh()}
            disabled={loading}
            title={t('explorer.redisDashboard.actions.refresh')}
          >
            {loading ? <Loader2 size={14} className="redis-dashboard__spinner" /> : <RefreshCw size={14} />}
            <span>{t('explorer.redisDashboard.actions.refresh')}</span>
          </button>
          {snapshot && (
            <>
              <button
                className="redis-dashboard__action-btn redis-dashboard__action-btn--ghost"
                onClick={handleCopySnapshot}
                title={t('explorer.redisDashboard.actions.copySnapshot')}
              >
                <Copy size={14} />
                <span>{t('explorer.redisDashboard.actions.copySnapshot')}</span>
              </button>
              <button
                className="redis-dashboard__action-btn redis-dashboard__action-btn--ghost"
                onClick={handleOpenRawInfo}
                title={t('explorer.redisDashboard.actions.openRawInfo')}
              >
                <ExternalLink size={14} />
                <span>{t('explorer.redisDashboard.actions.openRawInfo')}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="redis-dashboard__body">
        {/* Server bar — always visible, shows online/offline status */}
        <div className="redis-dashboard__server-bar">
          <span className={`redis-dashboard__server-status ${
            error ? 'redis-dashboard__server-status--offline' :
            snapshot ? 'redis-dashboard__server-status--online' :
            'redis-dashboard__server-status--unknown'
          }`} />
          <span className="redis-dashboard__server-bar-icon"><Server size={15} /></span>
          <span className="redis-dashboard__server-bar-title">{t('explorer.redisDashboard.sections.server')}</span>
          {snapshot && (
            <>
              <span className="redis-dashboard__server-bar-divider" />
              <div className="redis-dashboard__server-inline">
                <ServerProp label={t('explorer.redisDashboard.fields.redisVersion')} value={snapshot.server.redisVersion} />
                <ServerProp label={t('explorer.redisDashboard.fields.mode')} value={snapshot.server.redisMode} />
                <ServerProp label={t('explorer.redisDashboard.fields.os')} value={snapshot.server.os} />
                <ServerProp label={t('explorer.redisDashboard.fields.processId')} value={snapshot.server.processId} />
                <ServerProp label={t('explorer.redisDashboard.fields.port')} value={snapshot.server.tcpPort} />
                <ServerProp label={t('explorer.redisDashboard.fields.uptime')} value={formatUptime(snapshot.server.uptimeInSeconds)} />
                <ServerProp label={t('explorer.redisDashboard.fields.hz')} value={snapshot.server.hz} />
                {snapshot.server.configFile && (
                  <ServerProp label={t('explorer.redisDashboard.fields.configFile')} value={snapshot.server.configFile} />
                )}
              </div>
            </>
          )}
          {error && (
            <button
              className="redis-dashboard__warn-btn"
              onClick={() => setErrorDialog(error)}
              title="View connection error"
            >
              <span key={flashKey} className="redis-dashboard__warn-icon">
                <TriangleAlert size={17} />
              </span>
            </button>
          )}
        </div>

        {commandResult && (
          <div className={`redis-dashboard__command-result redis-dashboard__command-result--${commandResult.status}`}>
            {commandResult.message}
          </div>
        )}

        {snapshot && (
          <>
            {/* Memory + Stats row */}
            <div className="redis-dashboard__memory-stats-row">
            {/* Memory */}
            <PremiumMetricCard
              icon={<MemoryStick size={15} />}
              title={t('explorer.redisDashboard.sections.memory')}
              primaryMetrics={[
                { label: t('explorer.redisDashboard.fields.usedMemory'), value: snapshot.memory.usedMemoryHuman, dotColor: '#60a5fa' },
                {
                  label: t('explorer.redisDashboard.fields.peakMemory'),
                  value: (
                    <>
                      {snapshot.memory.usedMemoryPeakHuman}
                      {snapshot.memory.usedMemoryPeakPercentage && (
                        <span className="redis-dashboard__premium-metric-value-suffix">
                          {' '}({snapshot.memory.usedMemoryPeakPercentage})
                        </span>
                      )}
                    </>
                  ),
                  dotColor: '#f472b6'
                }
              ]}
              secondaryMetrics={[
                snapshot.memory.usedMemoryRssHuman ? { label: t('explorer.redisDashboard.fields.rssMemory'), value: snapshot.memory.usedMemoryRssHuman } : null,
                snapshot.memory.usedMemoryLuaHuman ? { label: t('explorer.redisDashboard.fields.luaMemory'), value: snapshot.memory.usedMemoryLuaHuman } : null,
                { label: t('explorer.redisDashboard.fields.maxMemory'), value: snapshot.memory.maxMemoryBytes === 0 ? t('explorer.redisDashboard.fields.noLimit') : (snapshot.memory.maxMemoryHuman ?? formatBytes(snapshot.memory.maxMemoryBytes)) },
                snapshot.memory.maxMemoryPolicy ? { label: t('explorer.redisDashboard.fields.evictionPolicy'), value: snapshot.memory.maxMemoryPolicy } : null,
                snapshot.memory.memFragmentationRatio !== undefined ? { label: t('explorer.redisDashboard.fields.fragmentationRatio'), value: snapshot.memory.memFragmentationRatio.toFixed(2) } : null,
                snapshot.memory.memAllocator ? { label: t('explorer.redisDashboard.fields.allocator'), value: snapshot.memory.memAllocator } : null,
              ]}
            />

            {/* Stats / Clients */}
            <PremiumMetricCard
              icon={<Activity size={15} />}
              title={t('explorer.redisDashboard.sections.stats')}
              className="redis-dashboard__premium-card--stats"
              primaryMetrics={[
                { label: t('explorer.redisDashboard.fields.connectedClients'), value: snapshot.stats.connectedClients, dotColor: '#34d399' },
                { label: t('explorer.redisDashboard.fields.totalCommands'), value: snapshot.stats.totalCommandsProcessed.toLocaleString(), dotColor: '#fb923c' }
              ]}
              secondaryMetrics={[
                { label: t('explorer.redisDashboard.fields.blockedClients'), value: snapshot.stats.blockedClients },
                { label: t('explorer.redisDashboard.fields.totalConnections'), value: snapshot.stats.totalConnectionsReceived.toLocaleString() },
                { label: t('explorer.redisDashboard.fields.opsPerSec'), value: snapshot.stats.instantaneousOpsPerSec },
                { label: t('explorer.redisDashboard.fields.rejectedConnections'), value: snapshot.stats.rejectedConnections },
                snapshot.stats.totalNetInputBytes !== undefined ? { label: t('explorer.redisDashboard.fields.netIn'), value: formatBytes(snapshot.stats.totalNetInputBytes) } : null,
                snapshot.stats.totalNetOutputBytes !== undefined ? { label: t('explorer.redisDashboard.fields.netOut'), value: formatBytes(snapshot.stats.totalNetOutputBytes) } : null,
                snapshot.stats.pubsubChannels !== undefined ? { label: t('explorer.redisDashboard.fields.pubsubChannels'), value: snapshot.stats.pubsubChannels } : null,
              ]}
            />
            </div>

            {/* Cache Efficiency + Persistence + Replication row */}
            <div className="redis-dashboard__triple-row">
            {/* Cache Efficiency */}
            <Section icon={<Zap size={15} />} title={t('explorer.redisDashboard.sections.cacheEfficiency')} collapsible={false}>
              <div className="redis-dashboard__grid">
                <StatRow label={t('explorer.redisDashboard.fields.keyspaceHits')} value={snapshot.stats.keyspaceHits.toLocaleString()} />
                <StatRow label={t('explorer.redisDashboard.fields.keyspaceMisses')} value={snapshot.stats.keyspaceMisses.toLocaleString()} />
                <StatRow label={t('explorer.redisDashboard.fields.hitRatio')} value={snapshot.stats.keyspaceHitRatio !== undefined ? `${snapshot.stats.keyspaceHitRatio}%` : '—'} />
                <StatRow label={t('explorer.redisDashboard.fields.expiredKeys')} value={snapshot.stats.expiredKeys.toLocaleString()} />
                <StatRow label={t('explorer.redisDashboard.fields.evictedKeys')} value={snapshot.stats.evictedKeys.toLocaleString()} />
              </div>
            </Section>

            {/* Persistence */}
            <Section icon={<HardDrive size={15} />} title={t('explorer.redisDashboard.sections.persistence')} collapsible={false}>
              <div className="redis-dashboard__grid">
                <StatRow label={t('explorer.redisDashboard.fields.rdbChanges')} value={snapshot.persistence.rdbChangesSinceLastSave.toLocaleString()} />
                <StatRow label={t('explorer.redisDashboard.fields.rdbSaveInProgress')} value={snapshot.persistence.rdbBgsaveInProgress ? t('explorer.redisDashboard.fields.yes') : t('explorer.redisDashboard.fields.no')} />
                <StatRow label={t('explorer.redisDashboard.fields.rdbLastStatus')} value={snapshot.persistence.rdbLastBgsaveStatus} />
                {snapshot.persistence.rdbLastSaveTime && (
                  <StatRow label={t('explorer.redisDashboard.fields.rdbLastSave')} value={formatTimestamp(snapshot.persistence.rdbLastSaveTime)} />
                )}
                <StatRow label={t('explorer.redisDashboard.fields.aofEnabled')} value={snapshot.persistence.aofEnabled ? t('explorer.redisDashboard.fields.yes') : t('explorer.redisDashboard.fields.no')} />
                {snapshot.persistence.aofEnabled && snapshot.persistence.aofLastBgrewriteStatus && (
                  <StatRow label={t('explorer.redisDashboard.fields.aofLastStatus')} value={snapshot.persistence.aofLastBgrewriteStatus} />
                )}
                {snapshot.persistence.aofCurrentSize !== undefined && (
                  <StatRow label={t('explorer.redisDashboard.fields.aofSize')} value={formatBytes(snapshot.persistence.aofCurrentSize)} />
                )}
              </div>
            </Section>

            {/* Replication */}
            <Section icon={<GitBranch size={15} />} title={t('explorer.redisDashboard.sections.replication')} collapsible={false}>
              <div className="redis-dashboard__grid">
                <StatRow label={t('explorer.redisDashboard.fields.role')} value={snapshot.replication.role} />
                {snapshot.replication.connectedSlaves !== undefined && (
                  <StatRow label={t('explorer.redisDashboard.fields.connectedSlaves')} value={snapshot.replication.connectedSlaves} />
                )}
                {snapshot.replication.masterHost && (
                  <StatRow label={t('explorer.redisDashboard.fields.masterHost')} value={`${snapshot.replication.masterHost}:${snapshot.replication.masterPort ?? ''}`} />
                )}
                {snapshot.replication.masterLinkStatus && (
                  <StatRow label={t('explorer.redisDashboard.fields.masterLinkStatus')} value={snapshot.replication.masterLinkStatus} />
                )}
                {snapshot.replication.replicationOffset !== undefined && (
                  <StatRow label={t('explorer.redisDashboard.fields.replicationOffset')} value={snapshot.replication.replicationOffset.toLocaleString()} />
                )}
                {snapshot.replication.replicationId && (
                  <StatRow label={t('explorer.redisDashboard.fields.replicationId')} value={<span className="redis-dashboard__monospace">{snapshot.replication.replicationId}</span>} />
                )}
              </div>
              {snapshot.replication.nodes && snapshot.replication.nodes.length > 0 && (
                <div className="redis-dashboard__nodes-table-wrap">
                  <table className="redis-dashboard__nodes-table">
                    <thead>
                      <tr>
                        <th>{t('explorer.redisDashboard.fields.nodeAddr')}</th>
                        <th>{t('explorer.redisDashboard.fields.nodeRole')}</th>
                        <th>{t('explorer.redisDashboard.fields.nodeStatus')}</th>
                        <th>{t('explorer.redisDashboard.fields.nodeFlags')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {snapshot.replication.nodes.map((node) => (
                        <tr key={node.id}>
                          <td className="redis-dashboard__monospace">{node.addr}</td>
                          <td>{node.role}</td>
                          <td>
                            <span className={`redis-dashboard__node-status redis-dashboard__node-status--${node.connected ? 'connected' : 'disconnected'}`}>
                              {node.connected ? t('explorer.redisDashboard.fields.connected') : t('explorer.redisDashboard.fields.disconnected')}
                            </span>
                          </td>
                          <td className="redis-dashboard__monospace redis-dashboard__muted">{node.flags}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>
            </div>

            {/* Key Statistics */}
            <Section icon={<Database size={15} />} title={t('explorer.redisDashboard.sections.keyStats')}>
              {snapshot.keyspaces.length === 0 ? (
                <p className="redis-dashboard__empty-msg">{t('explorer.redisDashboard.noKeys')}</p>
              ) : (
                <table className="redis-dashboard__keyspace-table">
                  <thead>
                    <tr>
                      <th>{t('explorer.redisDashboard.fields.database')}</th>
                      <th>{t('explorer.redisDashboard.fields.keys')}</th>
                      <th>{t('explorer.redisDashboard.fields.expires')}</th>
                      <th>{t('explorer.redisDashboard.fields.avgTtl')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.keyspaces.map((ks) => (
                      <tr key={ks.dbIndex}>
                        <td>DB {ks.dbIndex}</td>
                        <td>{ks.keyCount.toLocaleString()}</td>
                        <td>{ks.expiresCount?.toLocaleString() ?? '—'}</td>
                        <td>{ks.avgTtl !== undefined ? `${ks.avgTtl} ms` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Section>

            {/* Maintenance */}
            <Section icon={<Zap size={15} />} title={t('explorer.redisDashboard.sections.maintenance')} defaultOpen={false}>
              <p className="redis-dashboard__maintenance-note">{t('explorer.redisDashboard.maintenanceNote')}</p>
              <div className="redis-dashboard__maintenance-actions">
                <button
                  className="redis-dashboard__maint-btn"
                  disabled={commandRunning}
                  onClick={() => requestCommand({
                    command: 'BGSAVE',
                    title: t('explorer.redisDashboard.commands.bgsave.confirmTitle'),
                    message: t('explorer.redisDashboard.commands.bgsave.confirmMessage'),
                    variant: 'primary' as const
                  })}
                >
                  {t('explorer.redisDashboard.commands.bgsave.label')}
                </button>
                <button
                  className="redis-dashboard__maint-btn"
                  disabled={commandRunning}
                  onClick={() => requestCommand({
                    command: 'BGREWRITEAOF',
                    title: t('explorer.redisDashboard.commands.bgrewriteaof.confirmTitle'),
                    message: t('explorer.redisDashboard.commands.bgrewriteaof.confirmMessage'),
                    variant: 'primary' as const
                  })}
                >
                  {t('explorer.redisDashboard.commands.bgrewriteaof.label')}
                </button>
                <button
                  className="redis-dashboard__maint-btn"
                  disabled={commandRunning}
                  onClick={() => requestCommand({
                    command: 'MEMORY_PURGE',
                    title: t('explorer.redisDashboard.commands.memoryPurge.confirmTitle'),
                    message: t('explorer.redisDashboard.commands.memoryPurge.confirmMessage'),
                    variant: 'primary' as const
                  })}
                >
                  {t('explorer.redisDashboard.commands.memoryPurge.label')}
                </button>
                <button
                  className="redis-dashboard__maint-btn"
                  disabled={commandRunning}
                  onClick={() => requestCommand({
                    command: 'SLOWLOG_RESET',
                    title: t('explorer.redisDashboard.commands.slowlogReset.confirmTitle'),
                    message: t('explorer.redisDashboard.commands.slowlogReset.confirmMessage'),
                    variant: 'primary' as const
                  })}
                >
                  {t('explorer.redisDashboard.commands.slowlogReset.label')}
                </button>
              </div>
              <div className="redis-dashboard__maintenance-actions redis-dashboard__maintenance-actions--danger">
                <p className="redis-dashboard__danger-label">
                  <Trash2 size={13} />
                  {t('explorer.redisDashboard.dangerZone')}
                </p>
                {snapshot.keyspaces.map((ks) => (
                  <button
                    key={ks.dbIndex}
                    className="redis-dashboard__maint-btn redis-dashboard__maint-btn--danger"
                    disabled={commandRunning}
                    onClick={() => requestCommand({
                      command: 'FLUSHDB',
                      databaseIndex: ks.dbIndex,
                      title: t('explorer.redisDashboard.commands.flushdb.confirmTitle'),
                      message: t('explorer.redisDashboard.commands.flushdb.confirmMessage', { dbIndex: ks.dbIndex }),
                      variant: 'danger' as const
                    })}
                  >
                    {t('explorer.redisDashboard.commands.flushdb.label', { dbIndex: ks.dbIndex })}
                  </button>
                ))}
                <button
                  className="redis-dashboard__maint-btn redis-dashboard__maint-btn--danger"
                  disabled={commandRunning}
                  onClick={() => requestCommand({
                    command: 'FLUSHALL',
                    title: t('explorer.redisDashboard.commands.flushall.confirmTitle'),
                    message: t('explorer.redisDashboard.commands.flushall.confirmMessage'),
                    variant: 'danger' as const
                  })}
                >
                  {t('explorer.redisDashboard.commands.flushall.label')}
                </button>
              </div>
            </Section>

            {/* All Redis Info */}
            <Section icon={<Search size={15} />} title={t('explorer.redisDashboard.sections.allInfo')} defaultOpen={false}>
              <div className="redis-dashboard__info-search-wrap">
                <Search size={13} className="redis-dashboard__info-search-icon" />
                <input
                  type="text"
                  className="redis-dashboard__info-search"
                  placeholder={t('explorer.redisDashboard.searchPlaceholder')}
                  value={infoSearch}
                  onChange={(e) => setInfoSearch(e.target.value)}
                />
              </div>
              <div className="redis-dashboard__info-table-wrap">
                <table className="redis-dashboard__info-table">
                  <thead>
                    <tr>
                      <th>{t('explorer.redisDashboard.fields.infoSection')}</th>
                      <th>{t('explorer.redisDashboard.fields.infoKey')}</th>
                      <th>{t('explorer.redisDashboard.fields.infoValue')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredInfo.map((row) => (
                      <tr key={`${row.section}:${row.key}`}>
                        <td className="redis-dashboard__muted">{row.section}</td>
                        <td>{row.key}</td>
                        <td className="redis-dashboard__monospace">{row.value}</td>
                      </tr>
                    ))}
                    {filteredInfo.length === 0 && (
                      <tr>
                        <td colSpan={3} className="redis-dashboard__empty-msg">{t('explorer.redisDashboard.noInfoResults')}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Section>
          </>
        )}

        {!snapshot && !loading && !error && (
          <div className="redis-dashboard__empty">
            {t('explorer.redisDashboard.noData')}
          </div>
        )}
      </div>

      {/* Command confirmation dialog */}
      {commandConfirm && (
        <ConfirmDialog
          title={commandConfirm.title}
          message={commandConfirm.message}
          confirmLabel={t('explorer.redisDashboard.commands.confirm')}
          variant={commandConfirm.variant}
          onConfirm={handleCommandConfirmed}
          onClose={() => setCommandConfirm(null)}
        />
      )}

      {/* Error details dialog */}
      {errorDialog && (
        <ErrorDialog
          title={t('explorer.redisDashboard.errorDialog.title')}
          error={errorDialog}
          onClose={() => setErrorDialog(null)}
        />
      )}
    </div>
  )
}

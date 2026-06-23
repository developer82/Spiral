import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import {
  RefreshCw,
  Pencil,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  Loader2,
  Database,
  Folder,
  FolderOpen,
  Type,
  List,
  Braces,
  ListOrdered,
  Hash,
  Activity,
  Dot
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { RedisDbExplorerTab as RedisDbExplorerTabType } from '../explorer.types'
import type { ConnectionRecord } from '../connections.types'
import type {
  RedisKeyEntry,
  RedisKeyType,
  RedisKeyFullValue,
  GetRedisDbKeysResult,
  GetRedisKeyValueResult
} from '../../../../../preload/index.d'
import ConfirmDialog from '../../../components/ConfirmDialog/ConfirmDialog'
import RedisKeyEditDialog from './RedisKeyEditDialog'
import { buildKeyTree, countLeafNodes } from './redisKeyTree'
import type { FolderNode, TreeNode } from './redisKeyTree'
import './RedisDbExplorerTab.css'

interface RedisDbExplorerTabProps {
  tab: RedisDbExplorerTabType
  connection: ConnectionRecord | undefined
  backgroundAutoRefresh: boolean
}

type SortColumn = 'keyName' | 'ttl' | 'type' | 'sizeBytes'
type SortDirection = 'asc' | 'desc'

const PAGE_SIZES = [10, 25, 50, 100, 250]

const CONTAINER_TYPES: RedisKeyType[] = ['list', 'set', 'zset', 'hash', 'stream']

const REDIS_TYPE_ICONS: Record<RedisKeyType, LucideIcon> = {
  string: Type,
  list: List,
  set: Braces,
  zset: ListOrdered,
  hash: Hash,
  stream: Activity
}

function formatBytes(bytes: number | null): string {
  if (bytes === null) return '—'
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(Math.floor(Math.log2(Math.max(1, bytes)) / 10), units.length - 1)
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

function formatTtl(ttl: number): string {
  if (ttl === -1) return 'no expiry'
  if (ttl === -2) return 'expired'
  const d = Math.floor(ttl / 86400)
  const h = Math.floor((ttl % 86400) / 3600)
  const m = Math.floor((ttl % 3600) / 60)
  const s = ttl % 60
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function expiryDatetime(ttl: number): string | null {
  if (ttl <= 0) return null
  return new Date(Date.now() + ttl * 1000).toLocaleString()
}

const AUTO_REFRESH_INTERVAL_MS = 30_000

export default function RedisDbExplorerTab({
  tab,
  connection,
  backgroundAutoRefresh
}: RedisDbExplorerTabProps): React.JSX.Element {
  const { t } = useTranslation()
  const { connectionId, dbIndex } = tab

  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle')
  const [keys, setKeys] = useState<RedisKeyEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortColumn, setSortColumn] = useState<SortColumn>('keyName')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(25)
  const [editKey, setEditKey] = useState<string | null>(null)
  const [showNewKeyDialog, setShowNewKeyDialog] = useState(false)
  const [deleteConfirmKey, setDeleteConfirmKey] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set())
  const [keyValueCache, setKeyValueCache] = useState<Map<string, RedisKeyFullValue>>(new Map())
  const [loadingKeys, setLoadingKeys] = useState<Set<string>>(new Set())

  const autoRefreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadKeys = useCallback((silent = false): void => {
    if (!silent) setLoadState('loading')
    setError(null)
    void window.api.database
      .getRedisDbKeys(connectionId, String(dbIndex))
      .then((result: GetRedisDbKeysResult) => {
        if (result.status === 'error') {
          if (!silent) {
            setError(result.message)
            setLoadState('error')
          }
          return
        }
        setKeys(result.keys)
        if (!silent) {
          setLoadState('loaded')
          setPage(0)
        }
      })
  }, [connectionId, dbIndex])

  useEffect(() => {
    loadKeys()
  }, [loadKeys])

  useEffect(() => {
    if (!backgroundAutoRefresh) return
    if (autoRefreshTimerRef.current) {
      clearInterval(autoRefreshTimerRef.current)
    }
    autoRefreshTimerRef.current = setInterval(() => {
      loadKeys(true)
    }, AUTO_REFRESH_INTERVAL_MS)
    return () => {
      if (autoRefreshTimerRef.current) {
        clearInterval(autoRefreshTimerRef.current)
        autoRefreshTimerRef.current = null
      }
    }
  }, [backgroundAutoRefresh, loadKeys])

  useEffect(() => {
    if (!backgroundAutoRefresh) return
    const unsub = window.api.database.onBackgroundRefresh((payload: { connectionId: string }) => {
      if (payload.connectionId === connectionId) {
        loadKeys(true)
      }
    })
    return unsub
  }, [backgroundAutoRefresh, connectionId, loadKeys])

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return keys
    const q = searchQuery.toLowerCase()
    return keys.filter(
      (k) => k.keyName.toLowerCase().includes(q) || k.valuePreview.toLowerCase().includes(q)
    )
  }, [keys, searchQuery])

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let cmp = 0
      switch (sortColumn) {
        case 'keyName':
          cmp = a.keyName.localeCompare(b.keyName)
          break
        case 'ttl':
          cmp = a.ttl - b.ttl
          break
        case 'type':
          cmp = a.type.localeCompare(b.type)
          break
        case 'sizeBytes':
          cmp = (a.sizeBytes ?? -1) - (b.sizeBytes ?? -1)
          break
      }
      return sortDirection === 'asc' ? cmp : -cmp
    })
  }, [filtered, sortColumn, sortDirection])

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const currentPage = Math.min(page, totalPages - 1)
  const pageItems = sorted.slice(currentPage * pageSize, (currentPage + 1) * pageSize)

  function handleSort(col: SortColumn): void {
    if (sortColumn === col) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortColumn(col)
      setSortDirection('asc')
    }
    setPage(0)
  }

  async function handleDeleteKey(keyName: string): Promise<void> {
    setDeleting(true)
    try {
      const result = await window.api.database.deleteRedisKey(connectionId, String(dbIndex), keyName)
      if (result.status === 'error') {
        setError(result.message)
        return
      }
      setKeys((prev) => prev.filter((k) => k.keyName !== keyName))
    } finally {
      setDeleting(false)
      setDeleteConfirmKey(null)
    }
  }

  function toggleFolder(prefix: string): void {
    setExpandedFolders((prev) => {
      const next = new Set(prev)
      if (next.has(prefix)) next.delete(prefix)
      else next.add(prefix)
      return next
    })
  }

  async function toggleKey(keyName: string, type: RedisKeyType): Promise<void> {
    if (!CONTAINER_TYPES.includes(type)) return

    if (expandedKeys.has(keyName)) {
      setExpandedKeys((prev) => {
        const next = new Set(prev)
        next.delete(keyName)
        return next
      })
      return
    }

    setExpandedKeys((prev) => new Set(prev).add(keyName))

    if (!keyValueCache.has(keyName)) {
      setLoadingKeys((prev) => new Set(prev).add(keyName))
      void window.api.database
        .getRedisKeyValue(connectionId, String(dbIndex), keyName)
        .then((result: GetRedisKeyValueResult) => {
          if (result.status === 'ok') {
            setKeyValueCache((prev) => new Map(prev).set(keyName, result.value))
          }
        })
        .finally(() => {
          setLoadingKeys((prev) => {
            const next = new Set(prev)
            next.delete(keyName)
            return next
          })
        })
    }
  }

  function SortIcon({ col }: { col: SortColumn }): React.JSX.Element | null {
    if (sortColumn !== col) return null
    return <span className="redis-explorer__sort-icon">{sortDirection === 'asc' ? '▲' : '▼'}</span>
  }

  function renderChildItemRow(
    rowKey: string,
    depth: number,
    label: string,
    value: string
  ): React.JSX.Element {
    return (
      <tr key={rowKey} className="redis-explorer__child-row">
        <td className="redis-explorer__td redis-explorer__td--num" />
        <td className="redis-explorer__td redis-explorer__td--icon">
          <div className="redis-explorer__icon-cell">
            <Dot size={10} className="redis-explorer__child-bullet" />
          </div>
        </td>
        <td className="redis-explorer__td redis-explorer__td--key">
          <div className="redis-explorer__key-cell">
            <span
              className="redis-explorer__tree-indent"
              style={{ '--depth': depth } as React.CSSProperties}
            />
            <span className="redis-explorer__child-label">{label}</span>
          </div>
        </td>
        <td className="redis-explorer__td redis-explorer__td--ttl" />
        <td className="redis-explorer__td redis-explorer__td--value">
          <span className="redis-explorer__child-value" title={value}>
            {value.length > 100 ? `${value.slice(0, 100)}…` : value}
          </span>
        </td>
        <td className="redis-explorer__td redis-explorer__td--type" />
        <td className="redis-explorer__td redis-explorer__td--size" />
        <td className="redis-explorer__td redis-explorer__td--actions" />
      </tr>
    )
  }

  function renderChildRows(keyName: string, depth: number): React.JSX.Element[] {
    const value = keyValueCache.get(keyName)
    if (!value) return []

    const rows: React.JSX.Element[] = []

    if (value.type === 'list') {
      value.items.forEach((item, i) => {
        rows.push(renderChildItemRow(`${keyName}::item::${i}`, depth, String(i), item))
      })
    } else if (value.type === 'set') {
      value.members.forEach((member, i) => {
        rows.push(renderChildItemRow(`${keyName}::item::${i}`, depth, '•', member))
      })
    } else if (value.type === 'zset') {
      value.members.forEach(({ member, score }, i) => {
        rows.push(renderChildItemRow(`${keyName}::item::${i}`, depth, String(score), member))
      })
    } else if (value.type === 'hash') {
      value.fields.forEach(({ field, value: v }, i) => {
        rows.push(renderChildItemRow(`${keyName}::item::${i}`, depth, field, v))
      })
    } else if (value.type === 'stream') {
      value.entries.forEach(({ id, fields }, i) => {
        rows.push(
          renderChildItemRow(`${keyName}::item::${i}`, depth, id, JSON.stringify(fields))
        )
      })
    }

    return rows
  }

  function renderKeyRow(
    entry: RedisKeyEntry,
    rowNum: number,
    depth: number,
    displayName: string
  ): React.JSX.Element {
    const expiry = expiryDatetime(entry.ttl)
    const TypeIcon = REDIS_TYPE_ICONS[entry.type]
    const isContainer = CONTAINER_TYPES.includes(entry.type)
    const isKeyExpanded = expandedKeys.has(entry.keyName)
    const isKeyLoading = loadingKeys.has(entry.keyName)

    return (
      <tr key={entry.keyName} className="redis-explorer__row">
        <td className="redis-explorer__td redis-explorer__td--num">{rowNum}</td>
        <td className="redis-explorer__td redis-explorer__td--icon">
          <div className="redis-explorer__icon-cell">
            {isContainer && (
              <button
                type="button"
                className="redis-explorer__key-chevron-btn"
                onClick={(e) => {
                  e.stopPropagation()
                  void toggleKey(entry.keyName, entry.type)
                }}
                disabled={isKeyLoading}
                title={isKeyExpanded ? 'Collapse' : 'Expand'}
              >
                {isKeyLoading ? (
                  <Loader2 size={10} className="redis-explorer__spin" />
                ) : isKeyExpanded ? (
                  <ChevronDown size={10} />
                ) : (
                  <ChevronRight size={10} />
                )}
              </button>
            )}
            <TypeIcon
              size={12}
              className={`redis-explorer__type-icon redis-explorer__type-icon--${entry.type}`}
            />
          </div>
        </td>
        <td className="redis-explorer__td redis-explorer__td--key">
          <div className="redis-explorer__key-cell">
            <span
              className="redis-explorer__tree-indent"
              style={{ '--depth': depth } as React.CSSProperties}
            />
            <span className="redis-explorer__key-name" title={entry.keyName}>
              {displayName}
            </span>
          </div>
        </td>
        <td
          className="redis-explorer__td redis-explorer__td--ttl"
          title={expiry ?? undefined}
        >
          {entry.ttl === -1 ? (
            <span className="redis-explorer__no-expiry">
              {t('explorer.redisDbExplorer.noExpiry')}
            </span>
          ) : (
            <span>{formatTtl(entry.ttl)}</span>
          )}
        </td>
        <td className="redis-explorer__td redis-explorer__td--value">
          <span className="redis-explorer__value-preview" title={entry.valuePreview}>
            {entry.valuePreview.length > 80
              ? `${entry.valuePreview.slice(0, 80)}…`
              : entry.valuePreview}
          </span>
        </td>
        <td className="redis-explorer__td redis-explorer__td--type">
          <span className={`redis-type-badge redis-type-badge--${entry.type}`}>
            {entry.type}
          </span>
        </td>
        <td className="redis-explorer__td redis-explorer__td--size">
          {formatBytes(entry.sizeBytes)}
        </td>
        <td className="redis-explorer__td redis-explorer__td--actions">
          <div className="redis-explorer__actions">
            <button
              type="button"
              className="redis-explorer__action-btn"
              onClick={() => setEditKey(entry.keyName)}
              title="Edit"
            >
              <Pencil size={12} />
            </button>
            <button
              type="button"
              className="redis-explorer__action-btn redis-explorer__action-btn--danger"
              onClick={() => setDeleteConfirmKey(entry.keyName)}
              title="Delete"
              disabled={deleting}
            >
              <Trash2 size={12} />
            </button>
          </div>
        </td>
      </tr>
    )
  }

  function renderFolderRow(node: FolderNode): React.JSX.Element {
    const isExpanded = expandedFolders.has(node.prefix)
    const count = countLeafNodes(node)
    return (
      <tr
        key={`folder:${node.prefix}`}
        className="redis-explorer__folder-row"
        onClick={() => toggleFolder(node.prefix)}
      >
        <td className="redis-explorer__td redis-explorer__td--num" />
        <td className="redis-explorer__td redis-explorer__td--key" colSpan={7}>
          <div className="redis-explorer__key-cell">
            <span
              className="redis-explorer__tree-indent"
              style={{ '--depth': node.depth } as React.CSSProperties}
            />
            {isExpanded ? (
              <ChevronDown size={11} className="redis-explorer__folder-chevron" />
            ) : (
              <ChevronRight size={11} className="redis-explorer__folder-chevron" />
            )}
            {isExpanded ? (
              <FolderOpen size={13} className="redis-explorer__folder-icon" />
            ) : (
              <Folder size={13} className="redis-explorer__folder-icon" />
            )}
            <span className="redis-explorer__folder-label">{node.label}</span>
            <span className="redis-explorer__folder-count">
              {count} {count === 1 ? 'key' : 'keys'}
            </span>
          </div>
        </td>
      </tr>
    )
  }

  function renderTreeNodes(nodes: TreeNode[], counter: { n: number }): React.JSX.Element[] {
    const rows: React.JSX.Element[] = []
    for (const node of nodes) {
      if (node.kind === 'folder') {
        rows.push(renderFolderRow(node))
        if (expandedFolders.has(node.prefix)) {
          rows.push(...renderTreeNodes(node.children, counter))
        }
      } else {
        counter.n++
        rows.push(renderKeyRow(node.entry, counter.n, node.depth, node.displayName))
        if (CONTAINER_TYPES.includes(node.entry.type) && expandedKeys.has(node.entry.keyName)) {
          if (loadingKeys.has(node.entry.keyName)) {
            rows.push(
              <tr key={`${node.entry.keyName}:loading`} className="redis-explorer__child-row">
                <td className="redis-explorer__td" />
                <td className="redis-explorer__td" colSpan={7}>
                  <span
                    className="redis-explorer__tree-indent"
                    style={{ '--depth': node.depth + 1 } as React.CSSProperties}
                  />
                  <Loader2 size={10} className="redis-explorer__spin" />
                </td>
              </tr>
            )
          } else {
            rows.push(...renderChildRows(node.entry.keyName, node.depth + 1))
          }
        }
      }
    }
    return rows
  }

  const keyTree = useMemo(() => {
    if (searchQuery.trim()) return null
    return buildKeyTree(pageItems)
  }, [pageItems, searchQuery])

  const totalMemoryBytes = useMemo(
    () => keys.reduce((sum, k) => sum + (k.sizeBytes ?? 0), 0),
    [keys]
  )

  const expiringCount = useMemo(
    () => keys.filter((k) => k.ttl >= 0).length,
    [keys]
  )

  const connLabel = connection?.name ?? `DB ${dbIndex}`

  return (
    <div className="redis-explorer">
      <div className="redis-explorer__stats-bar">
        <div className="redis-explorer__stats-bar-left">
          <Database size={14} className="redis-explorer__stats-bar-icon" />
          <span className="redis-explorer__stats-bar-title">{connLabel} — DB {dbIndex}</span>
        </div>

        <span className="redis-explorer__stats-bar-divider" />

        {loadState === 'loaded' && (
          <div className="redis-explorer__stats-bar-meta">
            <span>{keys.length} {t('explorer.redisDbExplorer.keys')}</span>
            <span className="redis-explorer__stats-dot">·</span>
            <span>{formatBytes(totalMemoryBytes)}</span>
            {expiringCount > 0 && (
              <>
                <span className="redis-explorer__stats-dot">·</span>
                <span>{expiringCount} {t('explorer.redisDbExplorer.expiring')}</span>
              </>
            )}
          </div>
        )}

        <div className="redis-explorer__toolbar">
          <input
            className="redis-explorer__search"
            type="search"
            placeholder={t('explorer.redisDbExplorer.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value)
              setPage(0)
            }}
          />
          <button
            type="button"
            className="redis-explorer__btn redis-explorer__btn--add"
            onClick={() => setShowNewKeyDialog(true)}
            title={t('explorer.redisDbExplorer.addKey', 'Add Key')}
          >
            <Plus size={13} />
          </button>
          <button
            type="button"
            className="redis-explorer__btn"
            onClick={() => loadKeys()}
            disabled={loadState === 'loading'}
            title={t('explorer.redisDbExplorer.refresh')}
          >
            <RefreshCw size={13} className={loadState === 'loading' ? 'redis-explorer__spin' : ''} />
          </button>
          <div className="redis-explorer__pagination">
            <label className="redis-explorer__page-size-label">
              {t('explorer.redisDbExplorer.pageSizeLabel')}
              <select
                className="redis-explorer__page-size-select"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value))
                  setPage(0)
                }}
              >
                {PAGE_SIZES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="redis-explorer__btn"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={currentPage === 0}
            >
              ‹
            </button>
            <span className="redis-explorer__page-info">
              {t('explorer.redisDbExplorer.pageOf', {
                page: currentPage + 1,
                total: totalPages
              })}
            </span>
            <button
              type="button"
              className="redis-explorer__btn"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={currentPage >= totalPages - 1}
            >
              ›
            </button>
          </div>
        </div>
      </div>

      <div className="redis-explorer__table-wrap">
        {loadState === 'loading' && (
          <div className="redis-explorer__state-overlay">
            <Loader2 size={20} className="redis-explorer__spin" />
            <span>Loading keys…</span>
          </div>
        )}
        {loadState === 'error' && (
          <div className="redis-explorer__state-overlay redis-explorer__state-overlay--error">
            {error ?? t('explorer.redisDbExplorer.loadError')}
          </div>
        )}
        {(loadState === 'loaded' || loadState === 'idle') && (
          <table className="redis-explorer__table">
            <thead>
              <tr>
                <th className="redis-explorer__th redis-explorer__th--num">
                  {t('explorer.redisDbExplorer.columns.rowNumber')}
                </th>
                <th className="redis-explorer__th redis-explorer__th--icon" />
                <th
                  className="redis-explorer__th redis-explorer__th--sortable"
                  onClick={() => handleSort('keyName')}
                >
                  {t('explorer.redisDbExplorer.columns.keyName')} <SortIcon col="keyName" />
                </th>
                <th
                  className="redis-explorer__th redis-explorer__th--sortable redis-explorer__th--ttl"
                  onClick={() => handleSort('ttl')}
                >
                  {t('explorer.redisDbExplorer.columns.ttl')} <SortIcon col="ttl" />
                </th>
                <th className="redis-explorer__th redis-explorer__th--value">
                  {t('explorer.redisDbExplorer.columns.value')}
                </th>
                <th
                  className="redis-explorer__th redis-explorer__th--sortable redis-explorer__th--type"
                  onClick={() => handleSort('type')}
                >
                  {t('explorer.redisDbExplorer.columns.type')} <SortIcon col="type" />
                </th>
                <th
                  className="redis-explorer__th redis-explorer__th--sortable redis-explorer__th--size"
                  onClick={() => handleSort('sizeBytes')}
                >
                  {t('explorer.redisDbExplorer.columns.size')} <SortIcon col="sizeBytes" />
                </th>
                <th className="redis-explorer__th redis-explorer__th--actions" />
              </tr>
            </thead>
            <tbody>
              {pageItems.length === 0 ? (
                <tr>
                  <td colSpan={8} className="redis-explorer__empty">
                    {searchQuery
                      ? 'No keys match your search'
                      : t('explorer.redisDbExplorer.noKeys')}
                  </td>
                </tr>
              ) : keyTree !== null ? (
                renderTreeNodes(keyTree, { n: 0 })
              ) : (
                pageItems.map((entry, i) => {
                  const rowNum = currentPage * pageSize + i + 1
                  return renderKeyRow(entry, rowNum, 0, entry.keyName)
                })
              )}
            </tbody>
          </table>
        )}
      </div>

      {showNewKeyDialog && (
        <RedisKeyEditDialog
          connectionId={connectionId}
          dbIndex={dbIndex}
          onClose={() => setShowNewKeyDialog(false)}
          onSaved={() => {
            setShowNewKeyDialog(false)
            loadKeys()
          }}
          onDeleted={() => setShowNewKeyDialog(false)}
        />
      )}

      {editKey && (
        <RedisKeyEditDialog
          connectionId={connectionId}
          dbIndex={dbIndex}
          keyName={editKey}
          onClose={() => setEditKey(null)}
          onSaved={() => loadKeys()}
          onDeleted={() => {
            setKeys((prev) => prev.filter((k) => k.keyName !== editKey))
            setEditKey(null)
          }}
        />
      )}

      {deleteConfirmKey && (
        <ConfirmDialog
          title={t('explorer.redisDbExplorer.deleteConfirmTitle')}
          message={t('explorer.redisDbExplorer.deleteConfirmMessage', {
            keyName: deleteConfirmKey
          })}
          variant="danger"
          confirmLabel="Delete"
          onConfirm={() => void handleDeleteKey(deleteConfirmKey)}
          onClose={() => setDeleteConfirmKey(null)}
        />
      )}
    </div>
  )
}

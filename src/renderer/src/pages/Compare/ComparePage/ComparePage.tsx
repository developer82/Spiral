import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useScreenNav } from '../../../components/NavController/NavController'
import { ArrowUpDown, Check, Pencil, Play, Plus, SlidersHorizontal, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useMenuStateContext } from '../../../contexts/MenuStateContext'
import { useSettingsContext } from '../../../contexts/SettingsContext'
import { useConfetti } from '../../../hooks/useConfetti'
import type { ConnectionProvider, ConnectionRecord } from '../../Explorer/connections.types'
import { resolveConnectionEnvironment } from '../../Explorer/environmentUtils'
import { PROVIDER_LIST, PROVIDER_METADATA } from '../../Explorer/providerMetadata'
import type { SortDirection } from '../../Settings/useSettings'
import SearchField from '../../../components/SearchField/SearchField'
import ComparisonDialog from '../Dialogs/ComparisonDialog/ComparisonDialog'
import ComparisonExportSecretsDialog from '../Dialogs/ComparisonExportSecretsDialog/ComparisonExportSecretsDialog'
import SyncConfirmDialog from '../Dialogs/SyncConfirmDialog/SyncConfirmDialog'
import Button from '../../../components/Button/Button'
import ConfirmDialog from '../../../components/ConfirmDialog/ConfirmDialog'
import ComparisonResultsReport from './ComparisonResultsReport'
import {
  COMPARISONS_UPDATED_EVENT,
  dispatchExplorerOpenScript,
  dispatchExplorerRefreshDatabase
} from '../../../events/connectionEvents'
import type {
  ComparisonConnectionSnapshot,
  ComparisonDraft,
  ComparisonExportPayload,
  ComparisonExecutionReport,
  ComparisonReportItem,
  ComparisonRecord,
  ComparisonSortField
} from '../comparison.types'
import { useComparisonList } from '../hooks/useComparisonList'
import '../../pages.css'
import './ComparePage.css'
import { getComparisonItemSyncState } from '../../../../../shared/comparisons/syncability'

interface ComparePageProps {
  isActive?: boolean
}

function syncDetailBorderColor(element: HTMLElement | null, color: string | undefined): void {
  if (!element) {
    return
  }

  if (color) {
    element.style.setProperty('--compare-detail-border-color', color)
    return
  }

  element.style.removeProperty('--compare-detail-border-color')
}

type CompareSyncTarget = { kind: 'all' } | { kind: 'item'; item: ComparisonReportItem }

function buildScopedComparisonReport(
  report: ComparisonExecutionReport,
  items: ComparisonReportItem[]
): ComparisonExecutionReport {
  return {
    ...report,
    items,
    counts: {
      total: items.length,
      added: items.filter((item) => item.changeType === 'added').length,
      removed: items.filter((item) => item.changeType === 'removed').length,
      modified: items.filter((item) => item.changeType === 'modified').length,
      unsupported: items.filter((item) => item.changeType === 'unsupported').length
    }
  }
}

function ComparePage({ isActive = false }: ComparePageProps): React.JSX.Element {
  const { t } = useTranslation()
  const { settings, updateSetting } = useSettingsContext()
  const screenNavSlot = useScreenNav()
  const { updateMenuState } = useMenuStateContext()
  const { triggerConfetti } = useConfetti()
  const [comparisons, setComparisons] = useState<ComparisonRecord[]>([])
  const [connections, setConnections] = useState<ConnectionRecord[]>([])
  const [selectedComparisonId, setSelectedComparisonId] = useState<string | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingComparison, setEditingComparison] = useState<ComparisonRecord | undefined>(undefined)
  const [comparisonReports, setComparisonReports] = useState<Record<string, ComparisonExecutionReport>>({})
  const [comparisonErrors, setComparisonErrors] = useState<Record<string, string>>({})
  const [runningComparisonId, setRunningComparisonId] = useState<string | null>(null)
  const [isSavingReport, setIsSavingReport] = useState(false)
  const [isExportSecretsDialogOpen, setIsExportSecretsDialogOpen] = useState(false)
  const [isSwapped, setIsSwapped] = useState<Record<string, boolean>>({})
  const [syncTarget, setSyncTarget] = useState<CompareSyncTarget | null>(null)
  const [isSyncing, setIsSyncing] = useState(false)
  const [isGeneratingScript, setIsGeneratingScript] = useState(false)
  const handleSaveReportRef = useRef<() => void>(() => {})
  const [pendingConfirm, setPendingConfirm] = useState<{
    title: string
    message: string
    resolve: (confirmed: boolean) => void
  } | null>(null)

  // ── Side nav search / filter / sort ──────────────────────────────────────
  const [comparisonSearch, setComparisonSearch] = useState('')
  const [filterProviders, setFilterProviders] = useState<Set<ConnectionProvider>>(new Set())
  const [sortField, setSortField] = useState<ComparisonSortField>('name')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [isSortOpen, setIsSortOpen] = useState(false)
  const filterBtnRef = useRef<HTMLButtonElement>(null)
  const sortBtnRef = useRef<HTMLButtonElement>(null)
  const filterPanelRef = useRef<HTMLDivElement>(null)
  const sortPanelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isFilterOpen && !isSortOpen) return
    function handleOutsideClick(e: MouseEvent): void {
      const target = e.target as Node
      if (
        filterPanelRef.current?.contains(target) ||
        filterBtnRef.current?.contains(target) ||
        sortPanelRef.current?.contains(target) ||
        sortBtnRef.current?.contains(target)
      ) return
      setIsFilterOpen(false)
      setIsSortOpen(false)
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [isFilterOpen, isSortOpen])

  function toggleFilterProvider(provider: ConnectionProvider): void {
    setFilterProviders((prev) => {
      const next = new Set(prev)
      if (next.has(provider)) next.delete(provider)
      else next.add(provider)
      return next
    })
  }

  function getFilterPanelPosition(): { top: number; left: number } {
    const btn = filterBtnRef.current
    if (!btn) return { top: 0, left: 0 }
    const rect = btn.getBoundingClientRect()
    return { top: rect.bottom + 4, left: rect.left }
  }

  function getSortPanelPosition(): { top: number; left: number } {
    const btn = sortBtnRef.current
    if (!btn) return { top: 0, left: 0 }
    const rect = btn.getBoundingClientRect()
    return { top: rect.bottom + 4, left: Math.max(0, rect.right - 176) }
  }

  const { comparisons: filteredComparisons, hasActiveFilters } = useComparisonList({
    comparisons,
    searchText: comparisonSearch,
    filterProviders,
    sortField,
    sortDirection
  })

  function requestConfirm(title: string, message: string): Promise<boolean> {
    return new Promise((resolve) => setPendingConfirm({ title, message, resolve }))
  }

  useEffect(() => {
    let cancelled = false

    async function load(): Promise<void> {
      const [savedComparisons, savedConnections] = await Promise.all([
        window.api.comparisons.getAll(),
        window.api.connections.getAll()
      ])

      if (cancelled) {
        return
      }

      setComparisons(savedComparisons as ComparisonRecord[])
      setConnections(savedConnections)
      if (savedComparisons.length > 0) {
        setSelectedComparisonId(savedComparisons[0].id)
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    function handleComparisonsUpdated(): void {
      window.api.comparisons.getAll().then((updated) => {
        setComparisons(updated as ComparisonRecord[])
      })
    }
    window.addEventListener(COMPARISONS_UPDATED_EVENT, handleComparisonsUpdated)
    return () => window.removeEventListener(COMPARISONS_UPDATED_EVENT, handleComparisonsUpdated)
  }, [])

  useEffect(() => {
    if (comparisons.length === 0) {
      setSelectedComparisonId(null)
      return
    }

    if (!selectedComparisonId || !comparisons.some((comparison) => comparison.id === selectedComparisonId)) {
      setSelectedComparisonId(comparisons[0].id)
    }
  }, [comparisons, selectedComparisonId])

  const selectedComparison = useMemo(
    () => comparisons.find((comparison) => comparison.id === selectedComparisonId) ?? null,
    [comparisons, selectedComparisonId]
  )
  const sourceEnvironment = selectedComparison
    ? resolveConnectionEnvironment(connections, settings.environments, selectedComparison.source.connectionId)
    : null
  const targetEnvironment = selectedComparison
    ? resolveConnectionEnvironment(connections, settings.environments, selectedComparison.target.connectionId)
    : null
  const sourceEnvironmentColor = sourceEnvironment?.color
  const targetEnvironmentColor = targetEnvironment?.color
  const selectedReport = selectedComparison ? comparisonReports[selectedComparison.id] ?? null : null
  const selectedError = selectedComparison ? comparisonErrors[selectedComparison.id] ?? null : null

  // Sync File > Save menu item state
  useEffect(() => {
    if (!isActive) {
      updateMenuState({ canSaveActive: false, hasOpenDocuments: false })
      return
    }
    updateMenuState({ canSaveActive: !!selectedReport })
  }, [isActive, selectedReport, updateMenuState])

  // Handle File > Save from the menu bar
  useEffect(() => {
    function onFileAction(e: Event): void {
      if ((e as CustomEvent<string>).detail === 'save' && isActive && selectedReport) {
        handleSaveReportRef.current()
      }
    }
    window.addEventListener('menu:file-action', onFileAction)
    return () => window.removeEventListener('menu:file-action', onFileAction)
  }, [isActive, selectedReport])

  async function handleSaveComparison(record: ComparisonDraft): Promise<void> {
    if (editingComparison) {
      const updated = await window.api.comparisons.update({
        ...editingComparison,
        ...record
      })
      setComparisonReports((prev) => {
        const next = { ...prev }
        delete next[updated.id]
        return next
      })
      setComparisonErrors((prev) => {
        const next = { ...prev }
        delete next[updated.id]
        return next
      })
      setComparisons((prev) =>
        prev.map((comparison) => (comparison.id === updated.id ? (updated as ComparisonRecord) : comparison))
      )
      setSelectedComparisonId(updated.id)
    } else {
      const created = await window.api.comparisons.create(record)
      setComparisons((prev) => [...prev, created as ComparisonRecord])
      setSelectedComparisonId(created.id)
    }

    setIsDialogOpen(false)
    setEditingComparison(undefined)
  }

  async function handleDeleteComparison(comparisonId: string): Promise<void> {
    const comparison = comparisons.find((item) => item.id === comparisonId)
    if (!comparison) {
      return
    }

    if (!await requestConfirm(t('compare.deleteConfirmTitle'), t('compare.deleteConfirm', { name: comparison.name }))) {
      return
    }

    await window.api.comparisons.delete(comparisonId)
    setComparisons((prev) => prev.filter((item) => item.id !== comparisonId))
    setComparisonReports((prev) => {
      const next = { ...prev }
      delete next[comparisonId]
      return next
    })
    setComparisonErrors((prev) => {
      const next = { ...prev }
      delete next[comparisonId]
      return next
    })
  }

  async function handleExecuteComparison(
    comparison: ComparisonRecord,
    triggerOnClean: boolean = false
  ): Promise<void> {
    setRunningComparisonId(comparison.id)
    setComparisonErrors((prev) => {
      const next = { ...prev }
      delete next[comparison.id]
      return next
    })

    try {
      const report = await window.api.comparisons.execute(comparison.id)
      setComparisonReports((prev) => ({
        ...prev,
        [comparison.id]: report
      }))
      if (triggerOnClean && report.counts.total === 0) {
        triggerConfetti()
      }
    } catch (error) {
      let message: string
      if (error instanceof Error) {
        // Strip Electron's IPC wrapper prefix: "Error invoking remote method '<channel>': <actual error>"
        const ipcMatch = error.message.match(/^Error invoking remote method '[^']+': ([\s\S]+)$/)
        message = ipcMatch ? ipcMatch[1] : error.message
      } else {
        message = String(error)
      }
      if (!message || message === 'Error') {
        message = t('compare.report.executionFailed')
      }
      setComparisonErrors((prev) => ({
        ...prev,
        [comparison.id]: message
      }))
    } finally {
      setRunningComparisonId(null)
    }
  }

  function buildConnectionSnapshot(
    connectionId: string,
    databaseName: string,
    includeSecrets: boolean
  ): ComparisonConnectionSnapshot | null {
    const connection = connections.find((c) => c.id === connectionId)
    if (!connection) {
      return null
    }

    return {
      id: connection.id,
      name: connection.name,
      provider: connection.provider,
      host: connection.host,
      port: connection.port,
      username: connection.username,
      password: includeSecrets ? connection.password : null,
      defaultDatabase: connection.defaultDatabase,
      databaseName,
      filePath: includeSecrets ? connection.filePath : undefined,
      color: connection.color,
      environmentId: connection.environmentId
    }
  }

  async function performExport(includeSecrets: boolean): Promise<void> {
    if (!selectedComparison || !selectedReport) {
      return
    }

    const sourceSnapshot = buildConnectionSnapshot(selectedComparison.source.connectionId, selectedComparison.source.databaseName, includeSecrets)
    const targetSnapshot = buildConnectionSnapshot(selectedComparison.target.connectionId, selectedComparison.target.databaseName, includeSecrets)

    if (!sourceSnapshot || !targetSnapshot) {
      return
    }

    const payload: ComparisonExportPayload = {
      exportVersion: 1,
      exportedAt: new Date().toISOString(),
      secretsIncluded: includeSecrets,
      comparison: {
        id: selectedComparison.id,
        name: selectedComparison.name,
        description: selectedComparison.description,
        scopeKeys: selectedComparison.scopeKeys,
        tableKeyMappings: selectedComparison.tableKeyMappings,
        createdAt: selectedComparison.createdAt,
        updatedAt: selectedComparison.updatedAt
      },
      sourceConnection: sourceSnapshot,
      targetConnection: targetSnapshot,
      report: selectedReport
    }

    const safeFilename = selectedComparison.name.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-')
    const timestamp = new Date().toISOString().slice(0, 10)
    const defaultPath = `${safeFilename}-${timestamp}.json`

    setIsSavingReport(true)
    try {
      await window.api.file.saveDialog(JSON.stringify(payload, null, 2), {
        defaultPath,
        filters: [{ name: 'JSON', extensions: ['json'] }]
      })
    } finally {
      setIsSavingReport(false)
    }
  }

  function handleSaveReport(): void {
    if (!selectedComparison || !selectedReport) {
      return
    }

    if (settings.askBeforeIncludingSecretsInComparisonExport) {
      setIsExportSecretsDialogOpen(true)
    } else {
      void performExport(settings.includeSecretsInComparisonExportByDefault)
    }
  }

  handleSaveReportRef.current = handleSaveReport

  function handleExportSecretsConfirm(includeSecrets: boolean, dontAskAgain: boolean): void {
    setIsExportSecretsDialogOpen(false)

    if (dontAskAgain) {
      updateSetting('askBeforeIncludingSecretsInComparisonExport', false)
      updateSetting('includeSecretsInComparisonExportByDefault', includeSecrets)
    }

    void performExport(includeSecrets)
  }

  function handleSwap(): void {
    if (!selectedComparisonId) return
    setIsSwapped((prev) => ({ ...prev, [selectedComparisonId]: !prev[selectedComparisonId] }))
  }

  function canSyncReportItem(item: ComparisonReportItem): boolean {
    return getComparisonItemSyncState(item).isExecutable
  }

  function openSyncAllConfirm(): void {
    setSyncTarget({ kind: 'all' })
  }

  function openSyncItemConfirm(item: ComparisonReportItem): void {
    if (!canSyncReportItem(item)) {
      return
    }

    setSyncTarget({ kind: 'item', item })
  }

  async function handleCreateScript(): Promise<void> {
    if (!selectedComparison || !selectedReport) return
    const swapped = isSwapped[selectedComparison.id] ?? false
    const direction = swapped ? 'swapped' : 'forward'
    const receiverConnectionId = swapped
      ? selectedComparison.source.connectionId
      : selectedComparison.target.connectionId
    const receiverDatabaseName = swapped
      ? selectedComparison.source.databaseName
      : selectedComparison.target.databaseName

    setIsGeneratingScript(true)
    try {
      const result = await window.api.comparisons.generateSyncScript(
        selectedComparison.id,
        selectedReport,
        direction
      )
      if (result.status === 'error') {
        alert(result.message)
        return
      }
      const timestamp = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '-')
      const title = `Sync — ${selectedComparison.name} — ${timestamp}`
      dispatchExplorerOpenScript({
        title,
        content: result.script,
        connectionId: receiverConnectionId,
        databaseName: receiverDatabaseName
      })
      window.dispatchEvent(new CustomEvent('menu:file-action', { detail: 'view:explorer' }))
    } finally {
      setIsGeneratingScript(false)
    }
  }

  async function handleSyncConfirm(createRevertScript: boolean): Promise<void> {
    if (!selectedComparison || !selectedReport || !syncTarget) return

    const reportToSync =
      syncTarget.kind === 'item'
        ? buildScopedComparisonReport(selectedReport, [syncTarget.item])
        : selectedReport

    setSyncTarget(null)
    const swapped = isSwapped[selectedComparison.id] ?? false
    const direction = swapped ? 'swapped' : 'forward'
    setIsSyncing(true)
    try {
      const result = await window.api.comparisons.executeSync(
        selectedComparison.id,
        reportToSync,
        direction,
        createRevertScript
      )
      if (result.status === 'error') {
        alert(result.message)
        return
      }
      triggerConfetti()
      if (result.revertScript) {
        const safeFilename = selectedComparison.name.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-')
        const timestamp = new Date().toISOString().slice(0, 10)
        await window.api.file.saveDialog(result.revertScript, {
          defaultPath: `${safeFilename}-${timestamp}-revert.sql`,
          filters: [{ name: 'SQL Script', extensions: ['sql'] }]
        })
      }
      // Clear swapped state for this comparison
      setIsSwapped((prev) => {
        const next = { ...prev }
        delete next[selectedComparison.id]
        return next
      })
      // Notify Explorer pages to refresh their node trees for both databases
      dispatchExplorerRefreshDatabase({
        connectionId: selectedComparison.source.connectionId,
        databaseName: selectedComparison.source.databaseName
      })
      dispatchExplorerRefreshDatabase({
        connectionId: selectedComparison.target.connectionId,
        databaseName: selectedComparison.target.databaseName
      })
      // Re-run comparison to reflect the updated state
      await handleExecuteComparison(selectedComparison)
    } finally {
      setIsSyncing(false)
    }
  }

  function openCreateDialog(): void {
    setEditingComparison(undefined)
    setIsDialogOpen(true)
  }

  function openEditDialog(comparison: ComparisonRecord): void {
    setEditingComparison(comparison)
    setIsDialogOpen(true)
  }

  function handleConnectionCreated(connection: ConnectionRecord): void {
    setConnections((prev) => [...prev, connection])
  }

  function getProviderSummary(comparison: ComparisonRecord): string {
    const sourceProvider = PROVIDER_METADATA[comparison.source.provider]?.label ?? comparison.source.provider
    const targetProvider = PROVIDER_METADATA[comparison.target.provider]?.label ?? comparison.target.provider
    return `${sourceProvider} -> ${targetProvider}`
  }

  function renderComparisonPanel(): React.JSX.Element {
    return (
      <aside className="compare__panel" aria-label={t('compare.panelAriaLabel')}>
        <div className="compare__resize-handle" />
        <div className="compare__panel-header">
          <Button variant="primary" size="sm" onClick={openCreateDialog} style={{ width: '100%', justifyContent: 'center' }}>
            <Plus size={13} />
            {t('compare.addComparison')}
          </Button>
        </div>
        <div className="compare__panel-toolbar">
          <SearchField
            value={comparisonSearch}
            onChange={setComparisonSearch}
            placeholder={t('compare.search.placeholder')}
            ariaLabel={t('compare.search.ariaLabel')}
            buttons={[
              {
                icon: <SlidersHorizontal size={14} />,
                ariaLabel: t('compare.filter.ariaLabel'),
                onClick: () => { setIsFilterOpen((v) => !v); setIsSortOpen(false) },
                active: hasActiveFilters,
                buttonRef: filterBtnRef,
              },
              {
                icon: <ArrowUpDown size={14} />,
                ariaLabel: t('compare.sort.ariaLabel'),
                onClick: () => { setIsSortOpen((v) => !v); setIsFilterOpen(false) },
                buttonRef: sortBtnRef,
              },
            ]}
          />
        </div>
        <div className="compare__list">
          {comparisons.length === 0 ? (
            <p className="compare__empty">{t('compare.emptyState')}</p>
          ) : filteredComparisons.length === 0 ? (
            <p className="compare__empty">{t('compare.emptySearch')}</p>
          ) : (
            filteredComparisons.map((comparison) => (
              <button
                key={comparison.id}
                type="button"
                className={`compare__list-item${comparison.id === selectedComparisonId ? ' compare__list-item--active' : ''}`}
                onClick={() => setSelectedComparisonId(comparison.id)}
              >
                <span className="compare__list-item-name">{comparison.name}</span>
                <span className="compare__list-item-meta">{getProviderSummary(comparison)}</span>
              </button>
            ))
          )}
        </div>
      </aside>
    )
  }

  return (
    <>
      {screenNavSlot
        ? (isActive && createPortal(renderComparisonPanel(), screenNavSlot))
        : renderComparisonPanel()
      }
      <div className="compare">
      {isFilterOpen && (() => {
        const pos = getFilterPanelPosition()
        return (
          <div
            ref={filterPanelRef}
            className="compare__dropdown-panel"
            style={{ top: pos.top, left: pos.left }}
            role="dialog"
            aria-label={t('compare.filter.title')}
          >
            <div className="compare__dropdown-section">{t('compare.filter.provider')}</div>
            {PROVIDER_LIST.map(({ value, meta }) => {
              const active = filterProviders.has(value)
              return (
                <button
                  key={value}
                  className={`compare__dropdown-item${active ? ' compare__dropdown-item--active' : ''}`}
                  onClick={() => toggleFilterProvider(value)}
                >
                  <Check size={12} className="compare__dropdown-check" />
                  {meta.label}
                </button>
              )
            })}
          </div>
        )
      })()}

      {isSortOpen && (() => {
        const pos = getSortPanelPosition()
        const SORT_FIELDS: Array<{ field: ComparisonSortField; label: string }> = [
          { field: 'name', label: t('compare.sort.fields.name') },
          { field: 'createdAt', label: t('compare.sort.fields.createdAt') },
          { field: 'updatedAt', label: t('compare.sort.fields.updatedAt') },
          { field: 'sourceProvider', label: t('compare.sort.fields.sourceProvider') },
          { field: 'targetProvider', label: t('compare.sort.fields.targetProvider') },
        ]
        return (
          <div
            ref={sortPanelRef}
            className="compare__dropdown-panel"
            style={{ top: pos.top, left: pos.left, minWidth: '11rem' }}
            role="dialog"
            aria-label={t('compare.sort.title')}
          >
            <div className="compare__dropdown-section">{t('compare.sort.title')}</div>
            {SORT_FIELDS.map(({ field, label }) => {
              const active = sortField === field
              return (
                <button
                  key={field}
                  className={`compare__dropdown-item${active ? ' compare__dropdown-item--active' : ''}`}
                  onClick={() => setSortField(field)}
                >
                  <Check size={12} className="compare__dropdown-check" />
                  {label}
                </button>
              )
            })}
            <div className="compare__dropdown-separator" />
            <div className="compare__dropdown-section">
              {sortDirection === 'asc' ? t('compare.sort.directions.asc') : t('compare.sort.directions.desc')}
            </div>
            {(['asc', 'desc'] as const).map((dir) => {
              const active = sortDirection === dir
              return (
                <button
                  key={dir}
                  className={`compare__dropdown-item${active ? ' compare__dropdown-item--active' : ''}`}
                  onClick={() => setSortDirection(dir)}
                >
                  <Check size={12} className="compare__dropdown-check" />
                  {t(`compare.sort.directions.${dir}`)}
                </button>
              )
            })}
          </div>
        )
      })()}

      <div className="compare__content">
        {selectedComparison ? (
          <div className="compare__detail-card">
            <div className="compare__detail-header">
              <div>
                <h2 className="compare__detail-title">{selectedComparison.name}</h2>
                <p className="compare__detail-copy">
                  {selectedComparison.description || t('compare.detail.noDescription')}
                </p>
              </div>
              <div className="compare__detail-actions">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => void handleExecuteComparison(selectedComparison, true)}
                  isLoading={runningComparisonId === selectedComparison.id}
                >
                  <Play size={14} />
                  {runningComparisonId === selectedComparison.id
                    ? t('compare.actions.comparing')
                    : t('compare.actions.compare')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => openEditDialog(selectedComparison)}
                >
                  <Pencil size={14} /> {t('compare.actions.edit')}
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => void handleDeleteComparison(selectedComparison.id)}
                >
                  <Trash2 size={14} /> {t('compare.actions.delete')}
                </Button>
              </div>
            </div>

            <div className="compare__detail-grid">
              <section
                className="compare__detail-section"
                ref={(element) => syncDetailBorderColor(element, sourceEnvironmentColor)}
              >
                <h3 className="compare__detail-section-title">
                  {t('compare.detail.source')}
                  {sourceEnvironment ? (
                    <span className="compare__detail-section-title-meta"> ({sourceEnvironment.name})</span>
                  ) : null}
                </h3>
                <p className="compare__detail-copy">{selectedComparison.source.databaseName}</p>
              </section>
              <section
                className="compare__detail-section"
                ref={(element) => syncDetailBorderColor(element, targetEnvironmentColor)}
              >
                <h3 className="compare__detail-section-title">
                  {t('compare.detail.target')}
                  {targetEnvironment ? (
                    <span className="compare__detail-section-title-meta"> ({targetEnvironment.name})</span>
                  ) : null}
                </h3>
                <p className="compare__detail-copy">{selectedComparison.target.databaseName}</p>
              </section>
              <section className="compare__detail-section">
                <h3 className="compare__detail-section-title">{t('compare.detail.providers')}</h3>
                <p className="compare__detail-copy">{getProviderSummary(selectedComparison)}</p>
              </section>
              <section className="compare__detail-section">
                <h3 className="compare__detail-section-title">{t('compare.detail.scope')}</h3>
                <ul className="compare__scope-list">
                  {selectedComparison.scopeKeys.map((scopeKey) => (
                    <li key={scopeKey}>{t(`compare.scopeLabels.${scopeKey}`)}</li>
                  ))}
                </ul>
              </section>
            </div>

            <section className="compare__detail-section compare__detail-section--full">
              <h3 className="compare__detail-section-title">{t('compare.detail.keyMappings')}</h3>
              {selectedComparison.tableKeyMappings.length > 0 ? (
                <div className="compare__mapping-list">
                  {selectedComparison.tableKeyMappings.map((mapping, index) => (
                    <div key={`${mapping.sourceTable}-${mapping.targetTable}-${index}`} className="compare__mapping-item">
                      <strong>{mapping.sourceTable || t('compare.detail.unmapped')}</strong>
                      <span>{mapping.sourceColumns.join(', ') || t('compare.detail.unmapped')}</span>
                      <span className="compare__mapping-arrow">→</span>
                      <strong>{mapping.targetTable || t('compare.detail.unmapped')}</strong>
                      <span>{mapping.targetColumns.join(', ') || t('compare.detail.unmapped')}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="compare__detail-copy">{t('compare.detail.noKeyMappings')}</p>
              )}
            </section>

            <ComparisonResultsReport
              report={selectedReport}
              error={selectedError}
              isRunning={runningComparisonId === selectedComparison.id}
              onSave={handleSaveReport}
              isSaving={isSavingReport}
              isSwapped={isSwapped[selectedComparison.id] ?? false}
              isSyncing={isSyncing}
              isGeneratingScript={isGeneratingScript}
              onSwap={handleSwap}
              onCreateScript={() => void handleCreateScript()}
              onSyncAll={openSyncAllConfirm}
              onSyncItem={openSyncItemConfirm}
              canSyncItem={canSyncReportItem}
              sourceName={selectedComparison.source.databaseName}
              targetName={selectedComparison.target.databaseName}
            />
          </div>
        ) : (
          <p className="compare__content-empty">{t('compare.emptySelection')}</p>
        )}
      </div>

      {isDialogOpen ? (
        <ComparisonDialog
          connections={connections}
          environments={settings.environments}
          initialValue={editingComparison}
          onCancel={() => {
            setIsDialogOpen(false)
            setEditingComparison(undefined)
          }}
          onSave={handleSaveComparison}
          onConnectionCreated={handleConnectionCreated}
        />
      ) : null}

      {isExportSecretsDialogOpen ? (
        <ComparisonExportSecretsDialog
          defaultIncludeSecrets={settings.includeSecretsInComparisonExportByDefault}
          onConfirm={handleExportSecretsConfirm}
          onClose={() => setIsExportSecretsDialogOpen(false)}
        />
      ) : null}

      {syncTarget && selectedComparison ? (
        <SyncConfirmDialog
          sourceName={selectedComparison.source.databaseName}
          targetName={selectedComparison.target.databaseName}
          isSwapped={isSwapped[selectedComparison.id] ?? false}
          findingName={syncTarget.kind === 'item' ? syncTarget.item.objectName : undefined}
          onConfirm={(createRevertScript) => void handleSyncConfirm(createRevertScript)}
          onClose={() => setSyncTarget(null)}
        />
      ) : null}

      {pendingConfirm && (
        <ConfirmDialog
          title={pendingConfirm.title}
          message={pendingConfirm.message}
          icon={<Trash2 size={16} />}
          iconColor="#ff6464"
          variant="danger"
          confirmLabel={t('confirmDialog.delete')}
          onConfirm={() => {
            pendingConfirm.resolve(true)
            setPendingConfirm(null)
          }}
          onClose={() => {
            pendingConfirm.resolve(false)
            setPendingConfirm(null)
          }}
        />
      )}
      </div>
    </>
  )
}

export default ComparePage

import { useState, useRef, useEffect } from 'react'
import { ArrowLeftRight, ArrowUpDown, Check, Download, FileCode, Printer, RefreshCw, SlidersHorizontal } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type {
  ComparisonChangeType,
  ComparisonExecutionReport,
  ComparisonReportItem
} from '../comparison.types'
import ErrorBox from '../../../components/ErrorBox/ErrorBox'
import SearchField from '../../../components/SearchField/SearchField'
import StatBox from './StatBox'
import { useComparisonReport, type ComparisonSortDirection } from './useComparisonReport'

interface ComparisonResultsReportProps {
  report: ComparisonExecutionReport | null
  error: string | null
  isRunning: boolean
  onSave: () => void
  isSaving: boolean
  isSwapped?: boolean
  isSyncing?: boolean
  isGeneratingScript?: boolean
  onSwap?: () => void
  onCreateScript?: () => void
  onSyncAll?: () => void
  onSyncItem?: (item: ComparisonReportItem) => void
  canSyncItem?: (item: ComparisonReportItem) => boolean
  sourceName?: string
  targetName?: string
}

const CHANGE_TYPES: ComparisonChangeType[] = ['added', 'removed', 'modified', 'unsupported']

function ComparisonResultsReport({
  report,
  error,
  isRunning,
  onSave,
  isSaving,
  isSwapped = false,
  isSyncing = false,
  isGeneratingScript = false,
  onSwap,
  onCreateScript,
  onSyncAll,
  onSyncItem,
  canSyncItem,
  sourceName,
  targetName
}: ComparisonResultsReportProps): React.JSX.Element {
  const { t } = useTranslation()

  const [searchText, setSearchText] = useState('')
  const [filterChangeTypes, setFilterChangeTypes] = useState<Set<ComparisonChangeType>>(new Set())
  const [sortDirection, setSortDirection] = useState<ComparisonSortDirection>('asc')
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [isSortOpen, setIsSortOpen] = useState(false)

  const filterBtnRef = useRef<HTMLButtonElement>(null)
  const sortBtnRef = useRef<HTMLButtonElement>(null)
  const filterPanelRef = useRef<HTMLDivElement>(null)
  const sortPanelRef = useRef<HTMLDivElement>(null)

  const { groupedItems, hasActiveFilters } = useComparisonReport({
    items: report?.items ?? [],
    searchText,
    filterChangeTypes,
    sortDirection
  })

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
    return { top: rect.bottom + 4, left: rect.left }
  }

  function toggleFilterChangeType(type: ComparisonChangeType): void {
    setFilterChangeTypes((prev) => {
      const next = new Set(prev)
      if (next.has(type)) next.delete(type)
      else next.add(type)
      return next
    })
  }

  function handlePrint(): void {
    window.print()
  }

  return (
    <section className="compare__report">
      <div className="compare__report-header">
        <div>
          <h3 className="compare__detail-section-title">{t('compare.report.title')}</h3>
          <p className="compare__detail-copy">
            {isRunning
              ? t('compare.actions.comparing')
              : report
                ? t('compare.report.generatedAt', {
                    timestamp: new Date(report.generatedAt).toLocaleString()
                  })
                : t('compare.report.empty')}
          </p>
        </div>
        {report ? (
          <div className="compare__report-actions">
            <button type="button" className="compare__report-action-btn" onClick={handlePrint}>
              <Printer size={14} />
              {t('compare.report.actions.print')}
            </button>
            <button
              type="button"
              className="compare__report-action-btn"
              onClick={onSave}
              disabled={isSaving}
            >
              <Download size={14} />
              {isSaving ? t('compare.report.actions.saving') : t('compare.report.actions.save')}
            </button>
            <button
              type="button"
              className="compare__report-action-btn"
              onClick={onSyncAll}
              disabled={isSyncing || isRunning}
            >
              <RefreshCw size={14} />
              {isSyncing ? t('compare.report.actions.syncing') : t('compare.report.actions.syncAll')}
            </button>
            <button
              type="button"
              className="compare__report-action-btn"
              onClick={onCreateScript}
              disabled={isGeneratingScript || isSyncing}
            >
              <FileCode size={14} />
              {isGeneratingScript
                ? t('compare.report.actions.generatingScript')
                : t('compare.report.actions.createScript')}
            </button>
            <button
              type="button"
              className={`compare__report-action-btn${isSwapped ? ' compare__report-action-btn--active' : ''}`}
              onClick={onSwap}
              disabled={isSyncing}
            >
              <ArrowLeftRight size={14} />
              {t('compare.report.actions.swap')}
              {isSwapped ? ` (${t('compare.report.actions.swapped')})` : ''}
            </button>
          </div>
        ) : null}
      </div>

      {error ? <ErrorBox error={error} /> : null}

      {report ? (
        <>
          {isSwapped ? (
            <div className="compare__report-direction">
              <ArrowLeftRight size={12} />
              {t('compare.report.swapDirectionIndicator', {
                truth: targetName ?? t('compare.report.target'),
                receiver: sourceName ?? t('compare.report.source')
              })}
            </div>
          ) : null}
          <div className="compare__report-summary">
            <StatBox
              title={t('compare.report.summary.total')}
              value={report.counts.total}
              mainColor="var(--compare-stat-total-main, #d9dde4)"
              backgroundColor="var(--compare-stat-total-bg, #5b616d)"
            />
            <StatBox
              title={t('compare.report.summary.added')}
              value={isSwapped ? report.counts.removed : report.counts.added}
              mainColor="#54b98b"
            />
            <StatBox
              title={t('compare.report.summary.removed')}
              value={isSwapped ? report.counts.added : report.counts.removed}
              mainColor="#d5585a"
            />
            <StatBox
              title={t('compare.report.summary.modified')}
              value={report.counts.modified}
              mainColor="#468ad5"
            />
            <StatBox
              title={t('compare.report.summary.unsupported')}
              value={report.counts.unsupported}
              mainColor="#a3abb6"
            />
          </div>

          {report.counts.total === 0 ? <p className="compare__detail-copy">{t('compare.report.noDifferences')}</p> : null}

          <div className="compare__report-search">
              <SearchField
                value={searchText}
                onChange={setSearchText}
                placeholder={t('compare.report.search.placeholder')}
                ariaLabel={t('compare.report.search.ariaLabel')}
                buttons={[
                  {
                    icon: <SlidersHorizontal size={14} />,
                    ariaLabel: t('compare.report.filter.ariaLabel'),
                    onClick: () => { setIsFilterOpen((v) => !v); setIsSortOpen(false) },
                    active: hasActiveFilters,
                    buttonRef: filterBtnRef
                  },
                  {
                    icon: <ArrowUpDown size={14} />,
                    ariaLabel: t('compare.report.sort.ariaLabel'),
                    onClick: () => { setIsSortOpen((v) => !v); setIsFilterOpen(false) },
                    buttonRef: sortBtnRef
                  }
                ]}
              />
            </div>

          {isFilterOpen ? (() => {
            const pos = getFilterPanelPosition()
            return (
              <div
                ref={filterPanelRef}
                className="compare__dropdown-panel"
                style={{ top: pos.top, left: pos.left }}
                role="dialog"
                aria-label={t('compare.report.filter.ariaLabel')}
              >
                <div className="compare__dropdown-section">{t('compare.report.filter.title')}</div>
                {CHANGE_TYPES.map((type) => {
                  const active = filterChangeTypes.has(type)
                  return (
                    <button
                      key={type}
                      type="button"
                      className={`compare__dropdown-item${active ? ' compare__dropdown-item--active' : ''}`}
                      onClick={() => toggleFilterChangeType(type)}
                    >
                      <Check size={12} className="compare__dropdown-check" />
                      {t(`compare.report.changeTypes.${type}`)}
                    </button>
                  )
                })}
              </div>
            )
          })() : null}

          {isSortOpen ? (() => {
            const pos = getSortPanelPosition()
            return (
              <div
                ref={sortPanelRef}
                className="compare__dropdown-panel"
                style={{ top: pos.top, left: pos.left }}
                role="dialog"
                aria-label={t('compare.report.sort.ariaLabel')}
              >
                <div className="compare__dropdown-section">{t('compare.report.sort.title')}</div>
                {(['asc', 'desc'] as const).map((dir) => {
                  const active = sortDirection === dir
                  return (
                    <button
                      key={dir}
                      type="button"
                      className={`compare__dropdown-item${active ? ' compare__dropdown-item--active' : ''}`}
                      onClick={() => setSortDirection(dir)}
                    >
                      <Check size={12} className="compare__dropdown-check" />
                      {t(`compare.report.sort.directions.${dir}`)}
                    </button>
                  )
                })}
              </div>
            )
          })() : null}

          {groupedItems.map((group) => (
            <div key={group.category} className="compare__report-group">
              <h4 className="compare__report-group-title">{t(`compare.report.categories.${group.category}`)}</h4>
              <div className="compare__report-items">
                {group.items.map((item) => {
                  const displayChangeType = isSwapped
                    ? item.changeType === 'added' ? 'removed' : item.changeType === 'removed' ? 'added' : item.changeType
                    : item.changeType
                  const displaySourceValue = isSwapped ? item.targetValue : item.sourceValue
                  const displayTargetValue = isSwapped ? item.sourceValue : item.targetValue
                  const isSyncActionEnabled = canSyncItem?.(item) ?? false
                  return (
                    <article key={item.id} className="compare__report-item">
                      <div className="compare__report-item-header">
                        <strong>{item.objectName}</strong>
                        <div className="compare__report-item-actions">
                          <span className={`compare__report-badge compare__report-badge--${displayChangeType}`}>
                            {t(`compare.report.changeTypes.${displayChangeType}`)}
                          </span>
                          <button
                            type="button"
                            className="compare__report-sync-btn"
                            onClick={() => onSyncItem?.(item)}
                            disabled={isSyncing || isRunning || !isSyncActionEnabled}
                          >
                            <RefreshCw size={12} />
                            {t('compare.report.actions.sync')}
                          </button>
                        </div>
                      </div>
                      {item.details.length > 0 ? (
                        <ul className="compare__report-details">
                          {item.details.map((detail, index) => (
                            <li key={`${item.id}-${index}`}>{detail}</li>
                          ))}
                        </ul>
                      ) : null}
                      {displaySourceValue || displayTargetValue ? (
                        <div className="compare__report-values">
                          {displaySourceValue ? (
                            <div className="compare__report-value-block">
                              <span className="compare__report-value-label">{t('compare.report.source')}</span>
                              <pre>{displaySourceValue}</pre>
                            </div>
                          ) : null}
                          {displayTargetValue ? (
                            <div className="compare__report-value-block">
                              <span className="compare__report-value-label">{t('compare.report.target')}</span>
                              <pre>{displayTargetValue}</pre>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </article>
                  )
                })}
              </div>
            </div>
          ))}

          {hasActiveFilters && groupedItems.length === 0 && report.counts.total > 0 ? (
            <p className="compare__report-no-results compare__detail-copy">
              {t('compare.report.search.noResults')}
            </p>
          ) : null}

          {report.warnings.length > 0 ? (
            <div className="compare__report-warnings">
              <h4 className="compare__report-group-title">{t('compare.report.warnings')}</h4>
              <ul className="compare__report-details">
                {report.warnings.map((warning, index) => (
                  <li key={`${warning}-${index}`}>{warning}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  )
}

export default ComparisonResultsReport

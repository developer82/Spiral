import { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, Trash2, Eye, TableProperties } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ViewDefinition } from '../../../../../../preload/index.d'
import QueryEditor from '../../QueryEditor/QueryEditor'
import './ManageViewsDialog.css'
import BaseDialog from '../../../../components/BaseDialog/BaseDialog'
import ErrorBox from '../../../../components/ErrorBox/ErrorBox'
import Button from '../../../../components/Button/Button'

interface ManageViewsDialogProps {
  connectionId: string
  databaseName: string
  /** Pre-select this view when dialog opens (for "Edit View") */
  initialViewName?: string
  /** Open immediately in create-new mode */
  openOnNew?: boolean
  onClose: () => void
  onSuccess: () => void
}

export default function ManageViewsDialog({
  connectionId,
  databaseName,
  initialViewName,
  openOnNew = false,
  onClose,
  onSuccess
}: ManageViewsDialogProps): React.JSX.Element {
  const { t } = useTranslation()

  // ── Data state ──────────────────────────────────────────────────────────────
  const [views, setViews] = useState<ViewDefinition[]>([])
  const [schemas, setSchemas] = useState<string[]>(['dbo'])
  const [loadingViews, setLoadingViews] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // ── Selection state ─────────────────────────────────────────────────────────
  const [selectedViewName, setSelectedViewName] = useState<string | null>(null)
  const [isAddingNew, setIsAddingNew] = useState(openOnNew)

  // ── Edit state ──────────────────────────────────────────────────────────────
  const [editViewName, setEditViewName] = useState('')
  const [editSchemaName, setEditSchemaName] = useState('dbo')
  const [showAddTablePanel, setShowAddTablePanel] = useState(false)
  const [editSQL, setEditSQL] = useState('')
  const [originalViewName, setOriginalViewName] = useState<string | undefined>(undefined)

  // ── Action state ────────────────────────────────────────────────────────────
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  // ── Load views ───────────────────────────────────────────────────────────────
  const initialSelectionDoneRef = useRef(false)

  const loadViews = useCallback(async (selectInitial = false) => {
    setLoadingViews(true)
    setError(null)
    const result = await window.api.database.getViews(connectionId, databaseName)
    if (result.status === 'ok') {
      setViews(result.views)
      if (selectInitial && !initialSelectionDoneRef.current) {
        initialSelectionDoneRef.current = true
        const fresh = result.views
        if (openOnNew && fresh.length === 0) {
          setIsAddingNew(true)
        } else if (initialViewName) {
          const found = fresh.find((v) => v.viewName === initialViewName)
          if (found) {
            setSelectedViewName(found.viewName)
            setIsAddingNew(false)
            setEditViewName(found.viewName)
            setEditSchemaName(found.schemaName)
            setOriginalViewName(found.viewName)
            setEditSQL(stripCreateViewHeader(found.definition ?? ''))
            setActionError(null)
          }
        } else if (!openOnNew && fresh.length > 0) {
          const first = fresh[0]
          setSelectedViewName(first.viewName)
          setIsAddingNew(false)
          setEditViewName(first.viewName)
          setEditSchemaName(first.schemaName)
          setOriginalViewName(first.viewName)
          setEditSQL(stripCreateViewHeader(first.definition ?? ''))
          setActionError(null)
        }
      }
    } else {
      setError(result.message)
    }
    setLoadingViews(false)
  }, [connectionId, databaseName, initialViewName, openOnNew])

  // Load schemas
  useEffect(() => {
    void (async () => {
      const result = await window.api.database.executeQuery(
        connectionId,
        `SELECT SCHEMA_NAME FROM [${databaseName}].INFORMATION_SCHEMA.SCHEMATA ORDER BY SCHEMA_NAME`
      )
      if (result.status === 'ok' && result.resultSets[0]) {
        const names = result.resultSets[0].rows.map((r) => String(r['SCHEMA_NAME']))
        setSchemas(names.length > 0 ? names : ['dbo'])
      }
    })()
  }, [connectionId, databaseName])

  useEffect(() => {
    void loadViews(true)
  }, [loadViews])

  // ── Helper: populate edit fields ────────────────────────────────────────────
  function selectView(view: ViewDefinition) {
    setSelectedViewName(view.viewName)
    setIsAddingNew(false)
    setEditViewName(view.viewName)
    setEditSchemaName(view.schemaName)
    setOriginalViewName(view.viewName)
    // Strip CREATE VIEW header to expose only the body in the editor
    const body = stripCreateViewHeader(view.definition ?? '')
    setEditSQL(body)
    setActionError(null)
  }

  function handleNewView() {
    setSelectedViewName(null)
    setIsAddingNew(true)
    setEditViewName('')
    setEditSchemaName(schemas[0] ?? 'dbo')
    setEditSQL('')
    setOriginalViewName(undefined)
    setActionError(null)
  }

  // ── Save ────────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!editViewName.trim()) {
      setActionError(t('explorer.manageViews.errorNoName'))
      return
    }
    if (!editSQL.trim()) {
      setActionError(t('explorer.manageViews.errorNoSQL'))
      return
    }

    setIsSaving(true)
    setActionError(null)

    const result = await window.api.database.saveView(
      connectionId,
      databaseName,
      {
        schemaName: editSchemaName,
        viewName: editViewName.trim(),
        definition: editSQL
      },
      isAddingNew ? undefined : originalViewName
    )

    setIsSaving(false)

    if (result.status === 'error') {
      setActionError(result.message)
      return
    }

    await loadViews()
    setSelectedViewName(editViewName.trim())
    setOriginalViewName(editViewName.trim())
    setIsAddingNew(false)
    onSuccess()
  }, [
    connectionId,
    databaseName,
    editSchemaName,
    editViewName,
    editSQL,
    isAddingNew,
    originalViewName,
    t,
    loadViews,
    onSuccess
  ])

  // ── Delete ──────────────────────────────────────────────────────────────────
  const handleDelete = useCallback(async () => {
    if (!selectedViewName || isAddingNew) return
    const view = views.find((v) => v.viewName === selectedViewName)
    if (!view) return

    setIsDeleting(true)
    setActionError(null)

    const result = await window.api.database.deleteView(
      connectionId,
      databaseName,
      view.schemaName,
      view.viewName
    )

    setIsDeleting(false)

    if (result.status === 'error') {
      setActionError(result.message)
      return
    }

    await loadViews()
    setSelectedViewName(null)
    setIsAddingNew(false)
    setEditViewName('')
    setEditSQL('')
    onSuccess()
  }, [connectionId, databaseName, selectedViewName, isAddingNew, views, loadViews, onSuccess])

  // ─── Render ──────────────────────────────────────────────────────────────────

  const selectedView = views.find((v) => v.viewName === selectedViewName)
  const showViewEditor = isAddingNew || !!selectedViewName

  const viewsFooter = showViewEditor ? (
    <>
      {!isAddingNew && selectedViewName ? (
        <Button
              variant="danger"
          onClick={handleDelete}
          disabled={isDeleting || isSaving}
          aria-label={t('explorer.manageViews.deleteView')}
        >
          <Trash2 size={13} />
          {isDeleting ? t('common.deleting') : t('explorer.manageViews.deleteView')}
        </Button>
      ) : <span />}
      <div className="dialog__footer-right">
        <Button
              variant="primary"
          onClick={handleSave}
          disabled={isSaving || isDeleting}
          aria-label={t('common.save')}
        >
          {isSaving ? t('common.saving') : t('common.save')}
        </Button>
      </div>
    </>
  ) : undefined

  return (
    <BaseDialog
      title={`${t('explorer.manageViews.title')} — ${databaseName}`}
      icon={<Eye size={16} />}
      onClose={onClose}
      width="90vw"
      maxWidth="1280px"
      height="90vh"
      minWidth="800px"
      minHeight="560px"
      footerSpaceBetween
      footer={viewsFooter}
    >
        <div className="views-dialog__body">

          {/* ── Left: view list ── */}
          <div className="views-dialog__list-panel">
            <div className="views-dialog__list-header">
              {t('explorer.manageViews.viewsListHeader')}
            </div>
            <div className="views-dialog__list">
              {loadingViews ? (
                <div className="views-dialog__list-loading">{t('common.loading')}</div>
              ) : error ? (
                <div className="views-dialog__list-error">{error}</div>
              ) : views.length === 0 && !isAddingNew ? (
                <div className="views-dialog__list-empty">{t('explorer.manageViews.noViews')}</div>
              ) : (
                views.map((v) => (
                  <button
                    key={v.viewName}
                    className={`views-dialog__list-item${selectedViewName === v.viewName && !isAddingNew ? ' views-dialog__list-item--active' : ''}`}
                    onClick={() => selectView(v)}
                    title={`${v.schemaName}.${v.viewName}`}
                  >
                    <Eye size={13} className="views-dialog__list-icon" />
                    <span className="views-dialog__list-name">{v.viewName}</span>
                  </button>
                ))
              )}
            </div>
            <div className="views-dialog__list-footer">
              <button className="views-dialog__new-btn" onClick={handleNewView}>
                <Plus size={13} />
                {t('explorer.manageViews.newView')}
              </button>
            </div>
          </div>

          {/* ── Right: editor ── */}
          <div className="views-dialog__editor-panel">
            {loadingViews ? (
              <div className="views-dialog__editor-empty">{t('common.loading')}</div>
            ) : !isAddingNew && !selectedViewName ? (
              <div className="views-dialog__editor-empty">
                {t('explorer.manageViews.selectOrCreate')}
              </div>
            ) : (
              <>
                {/* View name + schema row */}
                <div className="views-dialog__meta-row">
                  <div className="views-dialog__meta-field">
                    <label className="views-dialog__meta-label">
                      {t('explorer.manageViews.viewNameLabel')}
                    </label>
                    <input
                      type="text"
                      className="views-dialog__meta-input"
                      value={editViewName}
                      placeholder={t('explorer.manageViews.viewNamePlaceholder')}
                      onChange={(e) => setEditViewName(e.target.value)}
                      aria-label={t('explorer.manageViews.viewNameLabel')}
                    />
                  </div>
                  <div className="views-dialog__meta-field views-dialog__meta-field--schema">
                    <label className="views-dialog__meta-label">
                      {t('explorer.manageViews.schemaLabel')}
                    </label>
                    <select
                      className="views-dialog__meta-select"
                      value={editSchemaName}
                      onChange={(e) => setEditSchemaName(e.target.value)}
                      aria-label={t('explorer.manageViews.schemaLabel')}
                    >
                      {schemas.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  {selectedView?.isSchemabound && (
                    <span className="views-dialog__badge views-dialog__badge--schemabound">
                      SCHEMABINDING
                    </span>
                  )}
                  {selectedView?.isEncrypted && (
                    <span className="views-dialog__badge views-dialog__badge--encrypted">
                      ENCRYPTED
                    </span>
                  )}
                  <button
                    className="views-dialog__add-table-btn"
                    onClick={() => setShowAddTablePanel((v) => !v)}
                    title={t('explorer.manageViews.queryEditor.addTable')}
                  >
                    <TableProperties size={13} />
                    {t('explorer.manageViews.queryEditor.addTable')}
                  </button>
                </div>

                {/* Query editor */}
                <div className="views-dialog__qe-wrap">
                  <QueryEditor
                    key={isAddingNew ? '__new__' : (selectedViewName ?? '__none__')}
                    connectionId={connectionId}
                    databaseName={databaseName}
                    initialSQL={editSQL}
                    onChange={setEditSQL}
                    addTablePanelOpen={showAddTablePanel}
                    onAddTablePanelOpenChange={setShowAddTablePanel}
                    showSort={false}
                  />
                </div>

                {/* Error banner */}
                {actionError && <ErrorBox error={actionError} />}
              </>
            )}
          </div>
        </div>
    </BaseDialog>
  )
}

// ── Utility ───────────────────────────────────────────────────────────────────

/**
 * SQL Server stores the full view definition in sys.views including
 * the CREATE VIEW ... AS header. Strip it to leave only the SELECT body.
 */
function stripCreateViewHeader(definition: string): string {
  // Match: CREATE [OR ALTER] VIEW [schema].[name] [WITH ...] AS
  const match = /CREATE\s+(?:OR\s+ALTER\s+)?VIEW\s+[\s\S]*?\bAS\b\s*/i.exec(definition)
  if (match) {
    return definition.slice(match.index + match[0].length).trim()
  }
  return definition.trim()
}

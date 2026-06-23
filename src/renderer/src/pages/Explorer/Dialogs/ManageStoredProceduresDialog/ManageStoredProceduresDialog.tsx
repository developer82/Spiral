import { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, Trash2, Code } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import MonacoEditor, { type BeforeMount } from '@monaco-editor/react'
import type { StoredProcedureDefinition, StoredProcedureParameter, SaveStoredProcedureParams } from '../../../../../../preload/index.d'
import '../../MonacoEditor/monacoSetup'
import './ManageStoredProceduresDialog.css'
import BaseDialog from '../../../../components/BaseDialog/BaseDialog'
import ErrorBox from '../../../../components/ErrorBox/ErrorBox'
import Button from '../../../../components/Button/Button'

interface ManageStoredProceduresDialogProps {
  connectionId: string
  databaseName: string
  /** Pre-select this procedure when dialog opens (for "Edit Stored Procedure") */
  initialProcedureName?: string
  /** Open immediately in create-new mode */
  openOnNew?: boolean
  onClose: () => void
  onSuccess: () => void
}

interface EditState {
  procedureName: string
  schemaName: string
  description: string
  parameters: StoredProcedureParameter[]
  body: string
}

const DEFAULT_BODY =
  `-- SET NOCOUNT ON added to prevent extra result sets from\n` +
  `-- interfering with SELECT statements.\n` +
  `SET NOCOUNT ON;\n\n` +
  `-- Insert stored procedure logic here`

const handleBeforeMount: BeforeMount = (monaco) => {
  monaco.editor.defineTheme('spiral-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#1e1e1e',
      'editorGutter.background': '#141414'
    }
  })
  monaco.editor.defineTheme('spiral-light', {
    base: 'vs',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#ffffff',
      'editorGutter.background': '#e8e8e8'
    }
  })
}

function resolveMonacoTheme(): string {
  if (typeof document !== 'undefined') {
    return document.documentElement.getAttribute('data-theme') === 'light'
      ? 'spiral-light'
      : 'spiral-dark'
  }
  return 'spiral-dark'
}

function makeDefaultEditState(schemas: string[]): EditState {
  return {
    procedureName: '',
    schemaName: schemas[0] ?? 'dbo',
    description: '',
    parameters: [],
    body: DEFAULT_BODY
  }
}

export default function ManageStoredProceduresDialog({
  connectionId,
  databaseName,
  initialProcedureName,
  openOnNew = false,
  onClose,
  onSuccess
}: ManageStoredProceduresDialogProps): React.JSX.Element {
  const { t } = useTranslation()

  // ── Data state ──────────────────────────────────────────────────────────────
  const [procedures, setProcedures] = useState<StoredProcedureDefinition[]>([])
  const [schemas, setSchemas] = useState<string[]>(['dbo'])
  const [loadingProcedures, setLoadingProcedures] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // ── Selection state ─────────────────────────────────────────────────────────
  const [selectedProcedureName, setSelectedProcedureName] = useState<string | null>(null)
  const [isAddingNew, setIsAddingNew] = useState(openOnNew)

  // ── Edit state ──────────────────────────────────────────────────────────────
  const [editState, setEditState] = useState<EditState>(makeDefaultEditState(['dbo']))
  const [originalProcedureName, setOriginalProcedureName] = useState<string | undefined>(undefined)

  // ── Action state ────────────────────────────────────────────────────────────
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const initialSelectionDoneRef = useRef(false)

  // ── Load schemas ─────────────────────────────────────────────────────────────
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

  // ── Load procedures ──────────────────────────────────────────────────────────
  const loadProcedures = useCallback(async (selectInitial = false) => {
    setLoadingProcedures(true)
    setError(null)
    const result = await window.api.database.getStoredProcedures(connectionId, databaseName)
    if (result.status === 'ok') {
      setProcedures(result.procedures)
      if (selectInitial && !initialSelectionDoneRef.current) {
        initialSelectionDoneRef.current = true
        const fresh = result.procedures
        if (openOnNew) {
          setIsAddingNew(true)
        } else if (initialProcedureName) {
          const found = fresh.find((p) => p.procedureName === initialProcedureName)
          if (found) {
            selectProcedureInto(found)
          }
        } else if (fresh.length > 0) {
          selectProcedureInto(fresh[0])
        }
      }
    } else {
      setError(result.message)
    }
    setLoadingProcedures(false)
  }, [connectionId, databaseName, initialProcedureName, openOnNew]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void loadProcedures(true)
  }, [loadProcedures])

  // ── Helpers ──────────────────────────────────────────────────────────────────
  function selectProcedureInto(proc: StoredProcedureDefinition) {
    setSelectedProcedureName(proc.procedureName)
    setIsAddingNew(false)
    setEditState({
      procedureName: proc.procedureName,
      schemaName: proc.schemaName,
      description: proc.description,
      parameters: proc.parameters.map((p) => ({ ...p })),
      body: proc.body
    })
    setOriginalProcedureName(proc.procedureName)
    setActionError(null)
  }

  function handleSelectProcedure(proc: StoredProcedureDefinition) {
    selectProcedureInto(proc)
  }

  function handleNewProcedure() {
    setSelectedProcedureName(null)
    setIsAddingNew(true)
    setEditState(makeDefaultEditState(schemas))
    setOriginalProcedureName(undefined)
    setActionError(null)
  }

  // ── Parameters ───────────────────────────────────────────────────────────────
  function handleAddParameter() {
    setEditState((prev) => ({
      ...prev,
      parameters: [...prev.parameters, { name: '', type: 'INT', defaultValue: undefined }]
    }))
  }

  function handleParameterChange(index: number, field: keyof StoredProcedureParameter, value: string) {
    setEditState((prev) => {
      const updated = prev.parameters.map((p, i) => {
        if (i !== index) return p
        if (field === 'defaultValue') {
          return { ...p, defaultValue: value === '' ? undefined : value }
        }
        return { ...p, [field]: value }
      })
      return { ...prev, parameters: updated }
    })
  }

  function handleDeleteParameter(index: number) {
    setEditState((prev) => ({
      ...prev,
      parameters: prev.parameters.filter((_, i) => i !== index)
    }))
  }

  // ── Save ────────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!editState.procedureName.trim()) {
      setActionError(t('explorer.manageStoredProcedures.errorNoName'))
      return
    }
    if (!editState.body.trim()) {
      setActionError(t('explorer.manageStoredProcedures.errorNoBody'))
      return
    }

    setIsSaving(true)
    setActionError(null)

    const params: SaveStoredProcedureParams = {
      schemaName: editState.schemaName,
      procedureName: editState.procedureName.trim(),
      description: editState.description,
      parameters: editState.parameters,
      body: editState.body
    }

    const result = await window.api.database.saveStoredProcedure(
      connectionId,
      databaseName,
      params,
      isAddingNew ? undefined : originalProcedureName
    )

    setIsSaving(false)

    if (result.status === 'error') {
      setActionError(result.message)
      return
    }

    await loadProcedures()
    setSelectedProcedureName(editState.procedureName.trim())
    setOriginalProcedureName(editState.procedureName.trim())
    setIsAddingNew(false)
    onSuccess()
  }, [editState, connectionId, databaseName, isAddingNew, originalProcedureName, t, loadProcedures, onSuccess])

  // ── Delete ──────────────────────────────────────────────────────────────────
  const handleDelete = useCallback(async () => {
    if (!selectedProcedureName || isAddingNew) return
    const proc = procedures.find((p) => p.procedureName === selectedProcedureName)
    if (!proc) return

    setIsDeleting(true)
    setActionError(null)

    const result = await window.api.database.deleteStoredProcedure(
      connectionId,
      databaseName,
      proc.schemaName,
      proc.procedureName
    )

    setIsDeleting(false)

    if (result.status === 'error') {
      setActionError(result.message)
      return
    }

    await loadProcedures()
    setSelectedProcedureName(null)
    setIsAddingNew(false)
    setEditState(makeDefaultEditState(schemas))
    onSuccess()
  }, [connectionId, databaseName, selectedProcedureName, isAddingNew, procedures, schemas, loadProcedures, onSuccess])

  // ── Render ───────────────────────────────────────────────────────────────────
  const showEditor = isAddingNew || selectedProcedureName !== null

  const spFooter = showEditor ? (
    <>
      {!isAddingNew && selectedProcedureName ? (
        <Button
              variant="danger"
          onClick={handleDelete}
          disabled={isDeleting || isSaving}
          aria-label={t('explorer.manageStoredProcedures.deleteProcedure')}
        >
          <Trash2 size={13} />
          {isDeleting ? t('common.deleting') : t('explorer.manageStoredProcedures.deleteProcedure')}
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
      title={`${t('explorer.manageStoredProcedures.title')} — ${databaseName}`}
      icon={<Code size={16} />}
      onClose={onClose}
      width="90vw"
      maxWidth="1280px"
      height="90vh"
      minWidth="800px"
      minHeight="560px"
      footerSpaceBetween
      footer={spFooter}
    >
        <div className="sp-dialog__body">

          {/* ── Left: procedure list ── */}
          <div className="sp-dialog__list-panel">
            <div className="sp-dialog__list-header">
              {t('explorer.manageStoredProcedures.listHeader')}
            </div>
            <div className="sp-dialog__list">
              {loadingProcedures ? (
                <div className="sp-dialog__list-loading">{t('common.loading')}</div>
              ) : error ? (
                <div className="sp-dialog__list-error">{error}</div>
              ) : procedures.length === 0 && !isAddingNew ? (
                <div className="sp-dialog__list-empty">{t('explorer.manageStoredProcedures.noItems')}</div>
              ) : (
                procedures.map((proc) => (
                  <button
                    key={proc.procedureName}
                    className={`sp-dialog__list-item${selectedProcedureName === proc.procedureName && !isAddingNew ? ' sp-dialog__list-item--active' : ''}`}
                    onClick={() => handleSelectProcedure(proc)}
                    title={`${proc.schemaName}.${proc.procedureName}`}
                  >
                    <Code size={13} className="sp-dialog__list-icon" />
                    <span className="sp-dialog__list-name">{proc.procedureName}</span>
                  </button>
                ))
              )}
            </div>
            <div className="sp-dialog__list-footer">
              <button className="sp-dialog__new-btn" onClick={handleNewProcedure}>
                <Plus size={13} />
                {t('explorer.manageStoredProcedures.newItem')}
              </button>
            </div>
          </div>

          {/* ── Right: editor ── */}
          <div className="sp-dialog__editor-panel">
            {loadingProcedures ? (
              <div className="sp-dialog__editor-empty">{t('common.loading')}</div>
            ) : !showEditor ? (
              <div className="sp-dialog__editor-empty">
                {t('explorer.manageStoredProcedures.selectOrCreate')}
              </div>
            ) : (
              <>
                {/* ── Properties section ── */}
                <div className="sp-dialog__section sp-dialog__section--properties">
                  <div className="sp-dialog__section-header">
                    {t('explorer.manageStoredProcedures.propertiesHeader')}
                  </div>
                  <div className="sp-dialog__properties-row">
                    <div className="sp-dialog__field">
                      <label className="sp-dialog__field-label">
                        {t('explorer.manageStoredProcedures.nameLabel')}
                      </label>
                      <input
                        type="text"
                        className="sp-dialog__field-input"
                        value={editState.procedureName}
                        placeholder={t('explorer.manageStoredProcedures.namePlaceholder')}
                        onChange={(e) => setEditState((prev) => ({ ...prev, procedureName: e.target.value }))}
                        aria-label={t('explorer.manageStoredProcedures.nameLabel')}
                      />
                    </div>
                    <div className="sp-dialog__field sp-dialog__field--schema">
                      <label className="sp-dialog__field-label">
                        {t('explorer.manageStoredProcedures.schemaLabel')}
                      </label>
                      <select
                        className="sp-dialog__field-select"
                        value={editState.schemaName}
                        onChange={(e) => setEditState((prev) => ({ ...prev, schemaName: e.target.value }))}
                        aria-label={t('explorer.manageStoredProcedures.schemaLabel')}
                      >
                        {schemas.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                    <div className="sp-dialog__field sp-dialog__field--description">
                      <label className="sp-dialog__field-label">
                        {t('explorer.manageStoredProcedures.descriptionLabel')}
                      </label>
                      <input
                        type="text"
                        className="sp-dialog__field-input"
                        value={editState.description}
                        placeholder={t('explorer.manageStoredProcedures.descriptionPlaceholder')}
                        onChange={(e) => setEditState((prev) => ({ ...prev, description: e.target.value }))}
                        aria-label={t('explorer.manageStoredProcedures.descriptionLabel')}
                      />
                    </div>
                  </div>
                </div>

                {/* ── Parameters section ── */}
                <div className="sp-dialog__section sp-dialog__section--parameters">
                  <div className="sp-dialog__section-header sp-dialog__section-header--with-action">
                    <span>{t('explorer.manageStoredProcedures.parametersHeader')}</span>
                    <button
                      className="sp-dialog__add-param-btn"
                      onClick={handleAddParameter}
                      title={t('explorer.manageStoredProcedures.addParameter')}
                    >
                      <Plus size={12} />
                      {t('explorer.manageStoredProcedures.addParameter')}
                    </button>
                  </div>
                  <div className="sp-dialog__params-table-wrap">
                    {editState.parameters.length === 0 ? (
                      <div className="sp-dialog__params-empty">
                        {t('explorer.manageStoredProcedures.noParameters')}
                      </div>
                    ) : (
                      <table className="sp-dialog__params-table">
                        <thead>
                          <tr>
                            <th className="sp-dialog__params-th">{t('explorer.manageStoredProcedures.colParamName')}</th>
                            <th className="sp-dialog__params-th">{t('explorer.manageStoredProcedures.colParamType')}</th>
                            <th className="sp-dialog__params-th">{t('explorer.manageStoredProcedures.colParamDefault')}</th>
                            <th className="sp-dialog__params-th sp-dialog__params-th--action" />
                          </tr>
                        </thead>
                        <tbody>
                          {editState.parameters.map((param, i) => (
                            <tr key={i} className="sp-dialog__params-row">
                              <td className="sp-dialog__params-td">
                                <input
                                  type="text"
                                  className="sp-dialog__params-input"
                                  value={param.name}
                                  placeholder={t('explorer.manageStoredProcedures.paramNamePlaceholder')}
                                  onChange={(e) => handleParameterChange(i, 'name', e.target.value)}
                                  aria-label={`${t('explorer.manageStoredProcedures.colParamName')} ${i + 1}`}
                                />
                              </td>
                              <td className="sp-dialog__params-td">
                                <input
                                  type="text"
                                  className="sp-dialog__params-input"
                                  value={param.type}
                                  placeholder={t('explorer.manageStoredProcedures.paramTypePlaceholder')}
                                  onChange={(e) => handleParameterChange(i, 'type', e.target.value)}
                                  aria-label={`${t('explorer.manageStoredProcedures.colParamType')} ${i + 1}`}
                                />
                              </td>
                              <td className="sp-dialog__params-td">
                                <input
                                  type="text"
                                  className="sp-dialog__params-input"
                                  value={param.defaultValue ?? ''}
                                  placeholder={t('explorer.manageStoredProcedures.paramDefaultPlaceholder')}
                                  onChange={(e) => handleParameterChange(i, 'defaultValue', e.target.value)}
                                  aria-label={`${t('explorer.manageStoredProcedures.colParamDefault')} ${i + 1}`}
                                />
                              </td>
                              <td className="sp-dialog__params-td sp-dialog__params-td--action">
                                <button
                                  className="sp-dialog__params-delete-btn"
                                  onClick={() => handleDeleteParameter(i)}
                                  title={t('common.delete')}
                                  aria-label={t('common.delete')}
                                >
                                  <Trash2 size={12} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>

                {/* ── SQL Body section ── */}
                <div className="sp-dialog__section sp-dialog__section--body">
                  <div className="sp-dialog__section-header">
                    {t('explorer.manageStoredProcedures.bodyHeader')}
                  </div>
                  <div className="sp-dialog__monaco-wrap">
                    <MonacoEditor
                      key={isAddingNew ? '__new__' : (selectedProcedureName ?? '__none__')}
                      language="sql"
                      defaultValue={editState.body}
                      theme={resolveMonacoTheme()}
                      beforeMount={handleBeforeMount}
                      onChange={(val) => setEditState((prev) => ({ ...prev, body: val ?? '' }))}
                      options={{
                        minimap: { enabled: false },
                        fontSize: 13,
                        lineNumbers: 'on',
                        wordWrap: 'off',
                        scrollBeyondLastLine: false,
                        renderLineHighlight: 'gutter',
                        overviewRulerLanes: 0,
                        hideCursorInOverviewRuler: true,
                        scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 }
                      }}
                    />
                  </div>
                </div>

                {/* ── Error banner ── */}
                {actionError && <ErrorBox error={actionError} />}
              </>
            )}
          </div>
        </div>
    </BaseDialog>
  )
}

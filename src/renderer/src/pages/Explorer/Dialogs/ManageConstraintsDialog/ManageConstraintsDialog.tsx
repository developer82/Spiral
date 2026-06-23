import { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, Trash2, Lock } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import MonacoEditor, { type BeforeMount, type OnMount } from '@monaco-editor/react'
import type * as Monaco from 'monaco-editor'
import type { CheckConstraintDefinition } from '../../../../../../preload/index.d'
import '../../MonacoEditor/monacoSetup'
import './ManageConstraintsDialog.css'
import BaseDialog from '../../../../components/BaseDialog/BaseDialog'
import ErrorBox from '../../../../components/ErrorBox/ErrorBox'
import Button from '../../../../components/Button/Button'

interface ManageConstraintsDialogProps {
  connectionId: string
  databaseName: string
  schema: string
  tableName: string
  initialConstraintName?: string
  openAddNew?: boolean
  onClose: () => void
  onSuccess: () => void
}

interface EditState {
  constraintName: string
  condition: string
  checkExistingData: boolean
  enforceInsertsAndUpdates: boolean
  enforceForReplication: boolean
  description: string
}

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

function buildDropDdl(
  schema: string,
  tableName: string,
  databaseName: string,
  constraintName: string
): string {
  return `USE [${databaseName}]\nALTER TABLE [${schema}].[${tableName}] DROP CONSTRAINT [${constraintName}]`
}

function buildAddDdl(schema: string, tableName: string, databaseName: string, edit: EditState): string {
  const table = `[${schema}].[${tableName}]`
  const withClause = edit.checkExistingData ? 'WITH CHECK' : 'WITH NOCHECK'
  const replicationClause = edit.enforceForReplication ? '' : ' NOT FOR REPLICATION'
  const lines: string[] = [
    `USE [${databaseName}]`,
    `ALTER TABLE ${table} ${withClause}`,
    `  ADD CONSTRAINT [${edit.constraintName}] CHECK${replicationClause} (${edit.condition})`
  ]
  const ddl = lines.join('\n')

  if (!edit.enforceInsertsAndUpdates) {
    return `${ddl}\n\nUSE [${databaseName}]\nALTER TABLE ${table} NOCHECK CONSTRAINT [${edit.constraintName}]`
  }
  return ddl
}

export default function ManageConstraintsDialog({
  connectionId,
  databaseName,
  schema,
  tableName,
  initialConstraintName,
  openAddNew,
  onClose,
  onSuccess
}: ManageConstraintsDialogProps): React.JSX.Element {
  const { t } = useTranslation()

  const [constraints, setConstraints] = useState<CheckConstraintDefinition[]>([])
  const [selectedConstraintName, setSelectedConstraintName] = useState<string | null>(
    initialConstraintName ?? null
  )
  const [isAddingNew, setIsAddingNew] = useState(() => openAddNew ?? false)

  const [editState, setEditState] = useState<EditState>({
    constraintName: '',
    condition: '',
    checkExistingData: true,
    enforceInsertsAndUpdates: true,
    enforceForReplication: true,
    description: ''
  })

  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const conditionEditorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null)
  const lastConditionRef = useRef('')
  const isExternalConditionUpdateRef = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [errorSql, setErrorSql] = useState<string | null>(null)
  const [loadingConstraints, setLoadingConstraints] = useState(true)
  const [monacoTheme, setMonacoTheme] = useState(resolveMonacoTheme)

  // Keep Monaco theme in sync with app theme
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setMonacoTheme(resolveMonacoTheme())
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])

  // ──────────────────────────────────────────────
  //  Load constraints
  // ──────────────────────────────────────────────
  const loadConstraints = useCallback(async () => {
    setLoadingConstraints(true)
    const result = await window.api.database.getCheckConstraints(
      connectionId,
      databaseName,
      schema,
      tableName
    )
    setLoadingConstraints(false)
    if (result.status === 'ok') {
      setConstraints(result.constraints)
    }
  }, [connectionId, databaseName, schema, tableName])

  useEffect(() => {
    void loadConstraints()
  }, [loadConstraints])

  // Pre-select the initial constraint once loaded
  useEffect(() => {
    if (initialConstraintName && constraints.length > 0 && !isAddingNew) {
      const cc = constraints.find((c) => c.constraintName === initialConstraintName)
      if (cc) selectConstraint(cc)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialConstraintName, constraints])

  // ──────────────────────────────────────────────
  //  Selection helpers
  // ──────────────────────────────────────────────
  function selectConstraint(cc: CheckConstraintDefinition): void {
    setSelectedConstraintName(cc.constraintName)
    setIsAddingNew(false)
    setEditState({
      constraintName: cc.constraintName,
      condition: cc.condition,
      checkExistingData: cc.checkExistingData,
      enforceInsertsAndUpdates: cc.isEnabled,
      enforceForReplication: cc.enforceForReplication,
      description: cc.description ?? ''
    })
    setError(null)
    setErrorSql(null)
  }

  function startAddNew(): void {
    setSelectedConstraintName(null)
    setIsAddingNew(true)
    setEditState({
      constraintName: '',
      condition: '',
      checkExistingData: true,
      enforceInsertsAndUpdates: true,
      enforceForReplication: true,
      description: ''
    })
    setError(null)
    setErrorSql(null)
  }

  // Apply external condition changes (selecting a different constraint, add new) to the editor imperatively.
  useEffect(() => {
    const editor = conditionEditorRef.current
    if (!editor) return
    if (editState.condition === lastConditionRef.current) return
    lastConditionRef.current = editState.condition
    isExternalConditionUpdateRef.current = true
    editor.setValue(editState.condition)
    isExternalConditionUpdateRef.current = false
  }, [editState.condition])

  const handleConditionMount: OnMount = (editor) => {
    conditionEditorRef.current = editor
    lastConditionRef.current = editor.getValue()
  }

  // ──────────────────────────────────────────────
  //  Save / Delete
  // ──────────────────────────────────────────────
  async function handleSave(): Promise<void> {
    if (!editState.constraintName.trim()) {
      setError(t('explorer.checkConstraints.validation.nameRequired', 'Constraint name is required.'))
      return
    }
    if (!editState.condition.trim()) {
      setError(t('explorer.checkConstraints.validation.conditionRequired', 'Condition is required.'))
      return
    }

    setIsSaving(true)
    setError(null)
    setErrorSql(null)

    try {
      // If editing existing: drop first
      if (!isAddingNew && selectedConstraintName) {
        const dropSql = buildDropDdl(schema, tableName, databaseName, selectedConstraintName)
        const dropResult = await window.api.database.executeQuery(connectionId, dropSql)
        if (dropResult.status === 'error') {
          setError(dropResult.message)
          setErrorSql(dropSql)
          setIsSaving(false)
          return
        }
      }

      // Create the constraint
      const addSql = buildAddDdl(schema, tableName, databaseName, editState)
      const addResult = await window.api.database.executeQuery(connectionId, addSql)
      if (addResult.status === 'error') {
        setError(addResult.message)
        setErrorSql(addSql)
        setIsSaving(false)
        return
      }

      // Description via extended properties (best-effort — may already exist on edit)
      if (editState.description.trim()) {
        const safeDesc = editState.description.replace(/'/g, "''")
        const descSql =
          `USE [${databaseName}]\n` +
          `EXEC sys.sp_addextendedproperty @name=N'MS_Description', ` +
          `@value=N'${safeDesc}', ` +
          `@level0type=N'SCHEMA', @level0name=N'${schema}', ` +
          `@level1type=N'TABLE', @level1name=N'${tableName}', ` +
          `@level2type=N'CONSTRAINT', @level2name=N'${editState.constraintName}'`
        await window.api.database.executeQuery(connectionId, descSql)
      }

      await loadConstraints()
      setSelectedConstraintName(editState.constraintName)
      setIsAddingNew(false)
      onSuccess()
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDelete(): Promise<void> {
    if (!selectedConstraintName) return
    setIsDeleting(true)
    setError(null)
    setErrorSql(null)
    const dropSql = buildDropDdl(schema, tableName, databaseName, selectedConstraintName)
    const result = await window.api.database.executeQuery(connectionId, dropSql)
    setIsDeleting(false)
    if (result.status === 'error') {
      setError(result.message)
      setErrorSql(dropSql)
      return
    }
    await loadConstraints()
    setSelectedConstraintName(null)
    setIsAddingNew(false)
    setEditState({
      constraintName: '',
      condition: '',
      checkExistingData: true,
      enforceInsertsAndUpdates: true,
      enforceForReplication: true,
      description: ''
    })
    onSuccess()
  }

  const isEditing = isAddingNew || selectedConstraintName !== null

  const constraintFooter = isEditing ? (
    <>
      <div>
        {!isAddingNew && selectedConstraintName && (
          <Button
              variant="danger"
            onClick={() => void handleDelete()}
            disabled={isDeleting || isSaving}
          >
            <Trash2 size={13} />
            {isDeleting
              ? t('common.deleting', 'Deleting…')
              : t('explorer.checkConstraints.deleteButton', 'Delete Constraint')}
          </Button>
        )}
      </div>
      <div className="dialog__footer-right">
        {error && <ErrorBox error={error} statement={errorSql ?? undefined} />}
        <Button
              variant="ghost"
          onClick={onClose}
          disabled={isSaving || isDeleting}
        >
          {t('common.close', 'Close')}
        </Button>
        <Button
              variant="primary"
          onClick={() => void handleSave()}
          disabled={isSaving || isDeleting}
        >
          {isSaving
            ? t('common.saving', 'Saving…')
            : t('explorer.checkConstraints.saveButton', 'Save Constraint')}
        </Button>
      </div>
    </>
  ) : undefined

  return (
    <BaseDialog
      title={t('explorer.checkConstraints.dialogTitle', {
        table: `${schema}.${tableName}`,
        defaultValue: `Manage Constraints — ${schema}.${tableName}`
      })}
      icon={<Lock size={16} />}
      onClose={onClose}
      width="90vw"
      maxWidth="860px"
      height="90vh"
      maxHeight="660px"
      minWidth="680px"
      minHeight="460px"
      footerSpaceBetween
      footer={constraintFooter}
    >
        <div className="constraint-dialog__body">
          {/* Left panel: constraint list */}
          <div className="constraint-dialog__list-panel">
            <div className="constraint-dialog__list-header">
              {t('explorer.checkConstraints.listHeader', 'Constraints')}
            </div>
            <div className="constraint-dialog__list">
              {loadingConstraints ? (
                <div className="constraint-dialog__empty-state">
                  {t('common.loading', 'Loading…')}
                </div>
              ) : constraints.length === 0 && !isAddingNew ? (
                <div className="constraint-dialog__empty-state constraint-dialog__empty-state--list">
                  {t('explorer.checkConstraints.noConstraints', 'No check constraints')}
                </div>
              ) : (
                <>
                  {constraints.map((cc) => (
                    <div
                      key={cc.constraintName}
                      className={`constraint-dialog__list-item${
                        selectedConstraintName === cc.constraintName && !isAddingNew
                          ? ' constraint-dialog__list-item--selected'
                          : ''
                      }`}
                      onClick={() => selectConstraint(cc)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') selectConstraint(cc)
                      }}
                    >
                      <Lock size={12} style={{ flexShrink: 0 }} />
                      {cc.constraintName}
                    </div>
                  ))}
                  {isAddingNew && (
                    <div className="constraint-dialog__list-item constraint-dialog__list-item--selected">
                      <Lock size={12} style={{ flexShrink: 0 }} />
                      {editState.constraintName ||
                        t('explorer.checkConstraints.newConstraint', '(new)')}
                    </div>
                  )}
                </>
              )}
            </div>
            <button className="constraint-dialog__list-add" onClick={startAddNew}>
              <Plus size={13} />
              {t('explorer.checkConstraints.addButton', 'Add Constraint')}
            </button>
          </div>

          {/* Right panel: editor */}
          <div className="constraint-dialog__editor-panel">
            {!isEditing ? (
              <div className="constraint-dialog__empty-state">
                {t(
                  'explorer.checkConstraints.selectOrAdd',
                  'Select a constraint or add a new one'
                )}
              </div>
            ) : (
              <>
                <div className="constraint-dialog__editor-body">
                  {/* Condition */}
                  <div>
                    <div className="constraint-dialog__section-label constraint-dialog__section-label--spaced">
                      {t('explorer.checkConstraints.condition', 'Condition')}
                    </div>
                    <div className="constraint-dialog__condition-editor">
                      <MonacoEditor
                        height="120px"
                        language="sql"
                        theme={monacoTheme}
                        beforeMount={handleBeforeMount}
                        defaultValue={editState.condition}
                        onMount={handleConditionMount}
                        onChange={(value) => {
                          if (isExternalConditionUpdateRef.current) return
                          const condition = value ?? ''
                          lastConditionRef.current = condition
                          setEditState((p) => ({ ...p, condition }))
                        }}
                        options={{
                          minimap: { enabled: false },
                          lineNumbers: 'off',
                          scrollBeyondLastLine: false,
                          wordWrap: 'on',
                          fontSize: 13,
                          automaticLayout: true,
                          scrollbar: { vertical: 'hidden', horizontal: 'hidden' },
                          overviewRulerLanes: 0,
                          hideCursorInOverviewRuler: true,
                          renderLineHighlight: 'none',
                          contextmenu: false,
                          padding: { top: 8, bottom: 8 }
                        }}
                      />
                    </div>
                  </div>

                  {/* Properties */}
                  <div>
                    <div className="constraint-dialog__section-label constraint-dialog__section-label--spaced">
                      {t('explorer.checkConstraints.properties', 'Properties')}
                    </div>

                    {/* Name */}
                    <div className="constraint-dialog__field constraint-dialog__field--spaced">
                      <label className="constraint-dialog__label">
                        {t('explorer.checkConstraints.name', 'Name')}
                      </label>
                      <input
                        className="constraint-dialog__input"
                        type="text"
                        value={editState.constraintName}
                        onChange={(e) =>
                          setEditState((p) => ({ ...p, constraintName: e.target.value }))
                        }
                        placeholder="CK_TableName_Condition"
                      />
                    </div>

                    {/* Description */}
                    <div className="constraint-dialog__field constraint-dialog__field--spaced">
                      <label className="constraint-dialog__label">
                        {t('explorer.checkConstraints.description', 'Description')}
                      </label>
                      <textarea
                        className="constraint-dialog__textarea"
                        value={editState.description}
                        onChange={(e) =>
                          setEditState((p) => ({ ...p, description: e.target.value }))
                        }
                        placeholder={t(
                          'explorer.checkConstraints.descriptionPlaceholder',
                          'Optional description…'
                        )}
                      />
                    </div>

                    {/* Checkboxes */}
                    <div className="constraint-dialog__checkboxes-row constraint-dialog__checkboxes-row--spaced">
                      <label className="constraint-dialog__checkbox-field">
                        <input
                          type="checkbox"
                          checked={editState.checkExistingData}
                          onChange={(e) =>
                            setEditState((p) => ({ ...p, checkExistingData: e.target.checked }))
                          }
                        />
                        <span className="constraint-dialog__checkbox-label">
                          {t('explorer.checkConstraints.checkExistingData', 'Check existing data')}
                        </span>
                      </label>
                      <label className="constraint-dialog__checkbox-field">
                        <input
                          type="checkbox"
                          checked={editState.enforceInsertsAndUpdates}
                          onChange={(e) =>
                            setEditState((p) => ({
                              ...p,
                              enforceInsertsAndUpdates: e.target.checked
                            }))
                          }
                        />
                        <span className="constraint-dialog__checkbox-label">
                          {t(
                            'explorer.checkConstraints.enforceInsertsAndUpdates',
                            'Enforce INSERTs and UPDATEs'
                          )}
                        </span>
                      </label>
                      <label className="constraint-dialog__checkbox-field">
                        <input
                          type="checkbox"
                          checked={editState.enforceForReplication}
                          onChange={(e) =>
                            setEditState((p) => ({
                              ...p,
                              enforceForReplication: e.target.checked
                            }))
                          }
                        />
                        <span className="constraint-dialog__checkbox-label">
                          {t(
                            'explorer.checkConstraints.enforceForReplication',
                            'Enforce for replication'
                          )}
                        </span>
                      </label>
                    </div>
                  </div>
                </div>

              </>
            )}
          </div>
        </div>
    </BaseDialog>
  )
}

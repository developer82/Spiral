import { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, Trash2, Bell } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import MonacoEditor, { type BeforeMount, type OnMount } from '@monaco-editor/react'
import type * as Monaco from 'monaco-editor'
import type { TriggerDefinition, SaveTriggerParams } from '../../../../../../preload/index.d'
import '../../MonacoEditor/monacoSetup'
import './ManageTriggersDialog.css'
import BaseDialog from '../../../../components/BaseDialog/BaseDialog'
import ErrorBox from '../../../../components/ErrorBox/ErrorBox'
import Button from '../../../../components/Button/Button'

interface ManageTriggersDialogProps {
  connectionId: string
  databaseName: string
  schema: string
  tableName: string
  initialTriggerName?: string
  openOnNew?: boolean
  onClose: () => void
  onSuccess: () => void
}

interface TableEntry {
  schema: string
  name: string
}

interface EditState {
  triggerName: string
  schemaName: string
  tableName: string
  isInsteadOf: boolean
  isInsert: boolean
  isUpdate: boolean
  isDelete: boolean
  body: string
  description: string
}

const DEFAULT_BODY =
  `-- SET NOCOUNT ON added to prevent extra result sets from\n` +
  `-- interfering with SELECT statements.\n` +
  `SET NOCOUNT ON;\n\n` +
  `-- Insert statements for trigger here`

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

function makeDefaultEditState(schema: string, tableName: string): EditState {
  return {
    triggerName: '',
    schemaName: schema,
    tableName,
    isInsteadOf: false,
    isInsert: true,
    isUpdate: false,
    isDelete: false,
    body: DEFAULT_BODY,
    description: ''
  }
}

export default function ManageTriggersDialog({
  connectionId,
  databaseName,
  schema,
  tableName,
  initialTriggerName,
  openOnNew,
  onClose,
  onSuccess
}: ManageTriggersDialogProps): React.JSX.Element {
  const { t } = useTranslation()

  const [triggers, setTriggers] = useState<TriggerDefinition[]>([])
  const [selectedTriggerName, setSelectedTriggerName] = useState<string | null>(
    initialTriggerName ?? null
  )
  const [isAddingNew, setIsAddingNew] = useState(false)
  const [editState, setEditState] = useState<EditState>(makeDefaultEditState(schema, tableName))
  const [allTables, setAllTables] = useState<TableEntry[]>([])
  const [loadingTables, setLoadingTables] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [loadingTriggers, setLoadingTriggers] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [monacoTheme, setMonacoTheme] = useState(resolveMonacoTheme)

  const triggerBodyEditorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null)
  const lastTriggerBodyRef = useRef(editState.body)
  const isExternalBodyUpdateRef = useRef(false)

  // Watch for theme changes
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setMonacoTheme(resolveMonacoTheme())
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])

  const loadTriggers = useCallback(async () => {
    setLoadingTriggers(true)
    const result = await window.api.database.getTriggers(
      connectionId,
      databaseName,
      schema,
      tableName
    )
    setLoadingTriggers(false)
    if (result.status === 'ok') {
      setTriggers(result.triggers)
    }
  }, [connectionId, databaseName, schema, tableName])

  // Load tables for dropdown
  useEffect(() => {
    void (async () => {
      setLoadingTables(true)
      const result = await window.api.database.executeQuery(
        connectionId,
        `SELECT TABLE_SCHEMA, TABLE_NAME FROM [${databaseName}].INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_SCHEMA, TABLE_NAME`
      )
      setLoadingTables(false)
      if (result.status === 'ok' && result.resultSets[0]) {
        const entries: TableEntry[] = result.resultSets[0].rows.map((r) => ({
          schema: String(r['TABLE_SCHEMA']),
          name: String(r['TABLE_NAME'])
        }))
        setAllTables(entries)
      }
    })()
  }, [connectionId, databaseName])

  // Load triggers on mount
  useEffect(() => {
    void loadTriggers()
  }, [loadTriggers])

  // When triggers are loaded, select initial trigger or enter add-new mode
  useEffect(() => {
    if (loadingTriggers) return
    if (initialTriggerName) {
      const found = triggers.find((t) => t.triggerName === initialTriggerName)
      if (found) selectTrigger(found)
    } else if (openOnNew) {
      startAddNew()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingTriggers])

  function selectTrigger(trigger: TriggerDefinition): void {
    setIsAddingNew(false)
    setSelectedTriggerName(trigger.triggerName)
    setError(null)
    setEditState({
      triggerName: trigger.triggerName,
      schemaName: schema,
      tableName,
      isInsteadOf: trigger.isInsteadOf,
      isInsert: trigger.isInsert,
      isUpdate: trigger.isUpdate,
      isDelete: trigger.isDelete,
      body: trigger.body,
      description: trigger.description ?? ''
    })
  }

  function startAddNew(): void {
    setSelectedTriggerName(null)
    setIsAddingNew(true)
    setError(null)
    setEditState(makeDefaultEditState(schema, tableName))
  }

  function updateEdit<K extends keyof EditState>(key: K, value: EditState[K]): void {
    setEditState((prev) => ({ ...prev, [key]: value }))
  }

  // Apply external body changes (selecting a different trigger, add new) to the editor imperatively.
  useEffect(() => {
    const editor = triggerBodyEditorRef.current
    if (!editor) return
    if (editState.body === lastTriggerBodyRef.current) return
    lastTriggerBodyRef.current = editState.body
    isExternalBodyUpdateRef.current = true
    editor.setValue(editState.body)
    isExternalBodyUpdateRef.current = false
  }, [editState.body])

  const handleBodyMount: OnMount = (editor) => {
    triggerBodyEditorRef.current = editor
    lastTriggerBodyRef.current = editor.getValue()
  }

  async function handleSave(): Promise<void> {
    if (!editState.triggerName.trim()) {
      setError(t('explorer.manageTriggers.validation.nameRequired'))
      return
    }
    if (!editState.isInsert && !editState.isUpdate && !editState.isDelete) {
      setError(t('explorer.manageTriggers.validation.eventRequired'))
      return
    }
    if (!editState.body.trim()) {
      setError(t('explorer.manageTriggers.validation.codeRequired'))
      return
    }

    setIsSaving(true)
    setError(null)

    const params: SaveTriggerParams = {
      triggerName: editState.triggerName.trim(),
      schemaName: editState.schemaName,
      tableName: editState.tableName,
      isInsteadOf: editState.isInsteadOf,
      isInsert: editState.isInsert,
      isUpdate: editState.isUpdate,
      isDelete: editState.isDelete,
      body: editState.body,
      description: editState.description.trim() || undefined
    }

    const originalName = isAddingNew ? undefined : (selectedTriggerName ?? undefined)
    const result = await window.api.database.saveTrigger(connectionId, databaseName, params, originalName)
    setIsSaving(false)

    if (result.status === 'error') {
      setError(result.message)
      return
    }

    await loadTriggers()
    setSelectedTriggerName(params.triggerName)
    setIsAddingNew(false)
    onSuccess()
  }

  async function handleDelete(): Promise<void> {
    if (!selectedTriggerName) return
    setIsDeleting(true)
    setError(null)

    const result = await window.api.database.deleteTrigger(
      connectionId,
      databaseName,
      selectedTriggerName,
      schema
    )
    setIsDeleting(false)

    if (result.status === 'error') {
      setError(result.message)
      return
    }

    await loadTriggers()
    setSelectedTriggerName(null)
    setIsAddingNew(false)
    setEditState(makeDefaultEditState(schema, tableName))
    onSuccess()
  }

  const hasSelection = !!selectedTriggerName && !isAddingNew
  const showEditor = isAddingNew || !!selectedTriggerName

  const triggerFooter = showEditor ? (
    <>
      {error ? <ErrorBox error={error} /> : <span />}
      <div className="dialog__footer-right">
        {hasSelection && (
          <Button
              variant="danger"
            onClick={() => void handleDelete()}
            disabled={isDeleting || isSaving}
          >
            <Trash2 size={13} />
            {isDeleting
              ? t('common.deleting', 'Deleting…')
              : t('explorer.manageTriggers.deleteButton')}
          </Button>
        )}
        <Button
              variant="primary"
          onClick={() => void handleSave()}
          disabled={isSaving || isDeleting}
        >
          {isSaving
            ? t('common.saving', 'Saving…')
            : t('explorer.manageTriggers.saveButton')}
        </Button>
      </div>
    </>
  ) : undefined

  return (
    <BaseDialog
      title={t('explorer.manageTriggers.dialogTitle', { table: `${schema}.${tableName}` })}
      icon={<Bell size={16} />}
      onClose={onClose}
      width="90vw"
      maxWidth="940px"
      height="90vh"
      maxHeight="720px"
      minWidth="720px"
      minHeight="480px"
      footerSpaceBetween
      footer={triggerFooter}
    >
        <div className="trigger-dialog__body">
          {/* Left panel */}
          <div className="trigger-dialog__list-panel">
            <div className="trigger-dialog__list-header">
              {t('explorer.manageTriggers.listHeader')}
            </div>
            <div className="trigger-dialog__list">
              {loadingTriggers ? (
                <div className="trigger-dialog__empty-state">
                  {t('common.loading', 'Loading…')}
                </div>
              ) : triggers.length === 0 && !isAddingNew ? (
                <div className="trigger-dialog__empty-state trigger-dialog__empty-state--list">
                  {t('explorer.manageTriggers.noTriggers')}
                </div>
              ) : (
                <>
                  {triggers.map((tr) => (
                    <div
                      key={tr.triggerName}
                      className={`trigger-dialog__list-item${
                        selectedTriggerName === tr.triggerName && !isAddingNew
                          ? ' trigger-dialog__list-item--selected'
                          : ''
                      }`}
                      onClick={() => selectTrigger(tr)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') selectTrigger(tr)
                      }}
                    >
                      <Bell size={12} style={{ flexShrink: 0 }} />
                      {tr.triggerName}
                    </div>
                  ))}
                  {isAddingNew && (
                    <div className="trigger-dialog__list-item trigger-dialog__list-item--selected">
                      <Bell size={12} style={{ flexShrink: 0 }} />
                      {editState.triggerName || t('explorer.manageTriggers.newTrigger')}
                    </div>
                  )}
                </>
              )}
            </div>
            <button className="trigger-dialog__list-add" onClick={startAddNew}>
              <Plus size={13} />
              {t('explorer.manageTriggers.addButton')}
            </button>
          </div>

          {/* Right panel: editor */}
          <div className="trigger-dialog__editor-panel">
            {!showEditor ? (
              <div className="trigger-dialog__empty-state">
                {t('explorer.manageTriggers.selectOrAdd')}
              </div>
            ) : (
              <>
                <div className="trigger-dialog__editor-body">
                  {/* Name */}
                  <div className="trigger-dialog__field">
                    <label className="trigger-dialog__label">
                      {t('explorer.manageTriggers.nameLabel')}
                    </label>
                    <input
                      className="trigger-dialog__input"
                      type="text"
                      value={editState.triggerName}
                      onChange={(e) => updateEdit('triggerName', e.target.value)}
                      placeholder={t('explorer.manageTriggers.namePlaceholder', 'trg_MyTrigger')}
                    />
                  </div>

                  {/* Description */}
                  <div className="trigger-dialog__field">
                    <label className="trigger-dialog__label">
                      {t('explorer.manageTriggers.descriptionLabel')}
                    </label>
                    <input
                      className="trigger-dialog__input"
                      type="text"
                      value={editState.description}
                      onChange={(e) => updateEdit('description', e.target.value)}
                      placeholder={t('explorer.manageTriggers.descriptionPlaceholder', 'Optional description…')}
                    />
                  </div>

                  {/* Table (dropdown — disabled when editing) */}
                  <div className="trigger-dialog__field">
                    <label className="trigger-dialog__label">
                      {t('explorer.manageTriggers.tableLabel')}
                    </label>
                    <select
                      className="trigger-dialog__select"
                      value={`${editState.schemaName}|${editState.tableName}`}
                      onChange={(e) => {
                        const [sc, tbl] = e.target.value.split('|')
                        updateEdit('schemaName', sc)
                        updateEdit('tableName', tbl)
                      }}
                      disabled={!isAddingNew || loadingTables}
                    >
                      {loadingTables ? (
                        <option value="">{t('common.loading', 'Loading…')}</option>
                      ) : (
                        allTables.map((tbl) => (
                          <option
                            key={`${tbl.schema}.${tbl.name}`}
                            value={`${tbl.schema}|${tbl.name}`}
                          >
                            {tbl.schema}.{tbl.name}
                          </option>
                        ))
                      )}
                    </select>
                  </div>

                  {/* Timing: AFTER vs INSTEAD OF */}
                  <div className="trigger-dialog__field">
                    <label className="trigger-dialog__label">
                      {t('explorer.manageTriggers.timingLabel')}
                    </label>
                    <div className="trigger-dialog__radio-row">
                      <label className="trigger-dialog__radio-label">
                        <input
                          type="radio"
                          name="trigger-timing"
                          value="after"
                          checked={!editState.isInsteadOf}
                          onChange={() => updateEdit('isInsteadOf', false)}
                        />
                        {t('explorer.manageTriggers.after')}
                      </label>
                      <label className="trigger-dialog__radio-label">
                        <input
                          type="radio"
                          name="trigger-timing"
                          value="instead-of"
                          checked={editState.isInsteadOf}
                          onChange={() => updateEdit('isInsteadOf', true)}
                        />
                        {t('explorer.manageTriggers.insteadOf')}
                      </label>
                    </div>
                  </div>

                  {/* Events */}
                  <div className="trigger-dialog__field">
                    <label className="trigger-dialog__label">
                      {t('explorer.manageTriggers.eventsLabel')}
                    </label>
                    <div className="trigger-dialog__checkboxes-row">
                      <label className="trigger-dialog__checkbox-field">
                        <input
                          type="checkbox"
                          checked={editState.isInsert}
                          onChange={(e) => updateEdit('isInsert', e.target.checked)}
                        />
                        <span className="trigger-dialog__checkbox-label">
                          {t('explorer.manageTriggers.insertEvent')}
                        </span>
                      </label>
                      <label className="trigger-dialog__checkbox-field">
                        <input
                          type="checkbox"
                          checked={editState.isUpdate}
                          onChange={(e) => updateEdit('isUpdate', e.target.checked)}
                        />
                        <span className="trigger-dialog__checkbox-label">
                          {t('explorer.manageTriggers.updateEvent')}
                        </span>
                      </label>
                      <label className="trigger-dialog__checkbox-field">
                        <input
                          type="checkbox"
                          checked={editState.isDelete}
                          onChange={(e) => updateEdit('isDelete', e.target.checked)}
                        />
                        <span className="trigger-dialog__checkbox-label">
                          {t('explorer.manageTriggers.deleteEvent')}
                        </span>
                      </label>
                    </div>
                  </div>

                  {/* Code editor */}
                  <div className="trigger-dialog__field trigger-dialog__field--grow">
                    <label className="trigger-dialog__label">
                      {t('explorer.manageTriggers.codeLabel')}
                    </label>
                    <div className="trigger-dialog__code-editor">
                      <MonacoEditor
                        language="sql"
                        defaultValue={editState.body}
                        theme={monacoTheme}
                        beforeMount={handleBeforeMount}
                        onMount={handleBodyMount}
                        onChange={(val) => {
                          if (isExternalBodyUpdateRef.current) return
                          const body = val ?? ''
                          lastTriggerBodyRef.current = body
                          updateEdit('body', body)
                        }}
                        options={{
                          lineNumbers: 'on',
                          minimap: { enabled: false },
                          fontSize: 13,
                          wordWrap: 'on',
                          automaticLayout: true,
                          tabSize: 2,
                          scrollBeyondLastLine: false
                        }}
                      />
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

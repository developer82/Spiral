import { useState, useCallback, useEffect, useRef, type JSX, type ChangeEvent } from 'react'
import { Plus, Trash2, PenLine, FilePlus } from 'lucide-react'
import MonacoEditor, { type BeforeMount, type OnMount } from '@monaco-editor/react'
import type * as Monaco from 'monaco-editor'
import BaseDialog from '../../../../components/BaseDialog/BaseDialog'
import ErrorBox from '../../../../components/ErrorBox/ErrorBox'
import JsonViewer from '../../../../components/JsonViewer/JsonViewer'
import '../../MonacoEditor/monacoSetup'
import {
  type BsonFieldType,
  type DocumentField,
  BSON_TYPE_OPTIONS,
  createDefaultField,
  convertFieldType,
  createInitialAddFields,
  ejsonStringToFields,
  fieldsToEjsonString,
  resetFieldValuesForNewDocument,
} from './mongoDocumentUtils'
import './MongoDocumentDialog.css'
import Button from '../../../../components/Button/Button'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MongoDocumentDialogProps {
  mode: 'add' | 'edit'
  connectionId: string
  databaseName: string
  collectionName: string
  /** EJSON string of the document to edit (undefined in add mode). */
  documentJson?: string
  onClose: () => void
  onSuccess: () => void
  /** Called instead of onSuccess when "Add another document" is checked — refreshes without closing. */
  onSuccessKeepOpen?: () => void
}

// ─── Monaco theme helpers ─────────────────────────────────────────────────────

const handleBeforeMount: BeforeMount = (monaco) => {
  monaco.editor.defineTheme('spiral-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: { 'editor.background': '#1a1a1a', 'editorGutter.background': '#141414' },
  })
  monaco.editor.defineTheme('spiral-light', {
    base: 'vs',
    inherit: true,
    rules: [],
    colors: { 'editor.background': '#ffffff', 'editorGutter.background': '#e8e8e8' },
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

// ─── Main dialog component ────────────────────────────────────────────────────

export default function MongoDocumentDialog({
  mode,
  connectionId,
  databaseName,
  collectionName,
  documentJson,
  onClose,
  onSuccess,
  onSuccessKeepOpen,
}: MongoDocumentDialogProps): JSX.Element {
  const [fields, setFields] = useState<DocumentField[]>(() => {
    if (mode === 'edit' && documentJson) {
      try {
        return ejsonStringToFields(documentJson)
      } catch {
        return createInitialAddFields()
      }
    }
    return createInitialAddFields()
  })

  const [jsonText, setJsonText] = useState<string>(() => {
    if (mode === 'edit' && documentJson) {
      try {
        // Re-format the incoming EJSON with 2-space indent
        return JSON.stringify(JSON.parse(documentJson) as unknown, null, 2)
      } catch {
        return documentJson
      }
    }
    return fieldsToEjsonString(fields)
  })

  const [jsonError, setJsonError] = useState<string | null>(null)
  const [jsonPreview, setJsonPreview] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [addAnother, setAddAnother] = useState(false)
  const [keepStructure, setKeepStructure] = useState(true)

  // ── Monaco editor refs (imperative sync pattern) ───────────────────────────
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null)
  const lastJsonTextRef = useRef(jsonText)
  const isExternalEditorUpdateRef = useRef(false)

  // Push jsonText changes originating from the fields panel into Monaco imperatively.
  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    if (jsonText === lastJsonTextRef.current) return
    lastJsonTextRef.current = jsonText
    isExternalEditorUpdateRef.current = true
    editor.setValue(jsonText)
    isExternalEditorUpdateRef.current = false
  }, [jsonText])

  const handleEditorMount: OnMount = (editor) => {
    editorRef.current = editor
    lastJsonTextRef.current = editor.getValue()
  }

  // ── Form → JSON sync ───────────────────────────────────────────────────────
  const handleFieldsChange = useCallback((newFields: DocumentField[]) => {
    setFields(newFields)
    setJsonText(fieldsToEjsonString(newFields))
    setJsonError(null)
  }, [])

  // ── JSON → Form sync ───────────────────────────────────────────────────────
  const handleJsonChange = useCallback((newText: string | undefined) => {
    if (isExternalEditorUpdateRef.current) return
    if (newText === undefined) return
    lastJsonTextRef.current = newText
    setJsonText(newText)
    try {
      const newFields = ejsonStringToFields(newText)
      setFields(newFields)
      setJsonError(null)
    } catch {
      setJsonError('Invalid JSON — fix the editor to update the fields panel')
    }
  }, [])

  // ── Save ───────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    setIsSaving(true)
    setSaveError(null)
    try {
      let result: { status: string; message?: string }
      if (mode === 'add') {
        result = await window.api.database.insertMongoDocument(
          connectionId,
          databaseName,
          collectionName,
          jsonText
        )
      } else {
        result = await window.api.database.replaceMongoDocument(
          connectionId,
          databaseName,
          collectionName,
          jsonText
        )
      }
      if (result.status === 'ok') {
        if (mode === 'add' && addAnother) {
          onSuccessKeepOpen?.()
          const newFields = keepStructure
            ? resetFieldValuesForNewDocument(fields)
            : createInitialAddFields()
          setFields(newFields)
          setJsonText(fieldsToEjsonString(newFields))
          setSaveError(null)
        } else {
          onSuccess()
        }
      } else {
        setSaveError((result as { message: string }).message)
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'An unexpected error occurred')
    } finally {
      setIsSaving(false)
    }
  }, [mode, connectionId, databaseName, collectionName, jsonText, onSuccess, onSuccessKeepOpen, addAnother, keepStructure, fields])

  const title = mode === 'add'
    ? `Add Document — ${collectionName}`
    : `Edit Document — ${collectionName}`

  const icon = mode === 'add'
    ? <FilePlus size={15} className="mongo-doc-dialog__title-icon" />
    : <PenLine  size={15} className="mongo-doc-dialog__title-icon" />

  const submitLabel = isSaving
    ? (mode === 'add' ? 'Inserting…' : 'Saving…')
    : (mode === 'add' ? 'Insert Document' : 'Save Changes')

  return (
    <BaseDialog
      title={title}
      icon={icon}
      onClose={onClose}
      closeDisabled={isSaving}
      width="90vw"
      maxWidth="1100px"
      height="90vh"
      maxHeight="820px"
      minWidth="720px"
      minHeight="580px"
      zIndex={200}
      footerSpaceBetween
      footer={
        <>
          <div className="mongo-doc-dialog__footer-left">
            {mode === 'add' && (
              <>
                <label className="mongo-doc-dialog__footer-check-label">
                  <input
                    type="checkbox"
                    className="mongo-doc-dialog__footer-check"
                    checked={addAnother}
                    onChange={(e) => setAddAnother(e.target.checked)}
                  />
                  Add another document
                </label>
                {addAnother && (
                  <label className="mongo-doc-dialog__footer-check-label">
                    <input
                      type="checkbox"
                      className="mongo-doc-dialog__footer-check"
                      checked={keepStructure}
                      onChange={(e) => setKeepStructure(e.target.checked)}
                    />
                    Keep document structure
                  </label>
                )}
              </>
            )}
          </div>
          <div className="dialog__footer-right">
            <Button
              variant="ghost"
              onClick={onClose}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => { void handleSave() }}
              disabled={isSaving || !!jsonError}
            >
              {submitLabel}
            </Button>
          </div>
        </>
      }
    >
      <div className="mongo-doc-dialog__body">
        {/* Fields section */}
        <div className="mongo-doc-dialog__fields-section">
          <div className="mongo-doc-dialog__panel-header">
            <h3 className="mongo-doc-dialog__panel-title">Fields</h3>
            <button
              type="button"
              className="mongo-doc-dialog__add-field-btn"
              onClick={() => handleFieldsChange([...fields, createDefaultField('string')])}
            >
              <Plus size={12} />
              Add Field
            </button>
          </div>
          <div className="mongo-doc-dialog__fields-scroll">
            <DocumentFieldEditor
              fields={fields}
              onChange={handleFieldsChange}
              mode={mode}
            />
          </div>
        </div>

        {/* JSON section */}
        <div className="mongo-doc-dialog__json-section">
          <div className="mongo-doc-dialog__panel-header">
            <h3 className="mongo-doc-dialog__panel-title">JSON</h3>
            <button
              className="mongo-doc-dialog__panel-header-btn"
              type="button"
              onClick={() => setJsonPreview((p) => !p)}
            >
              {jsonPreview ? 'Edit JSON' : 'Preview'}
            </button>
          </div>

          {jsonPreview ? (
            <div className="mongo-doc-dialog__json-preview-wrap">
              <JsonViewer
                json={jsonText}
                collapsible
                expandAllByDefault
              />
            </div>
          ) : (
            <div className="mongo-doc-dialog__monaco-wrap">
              <MonacoEditor
                height="100%"
                language="json"
                theme={resolveMonacoTheme()}
                defaultValue={jsonText}
                onMount={handleEditorMount}
                onChange={handleJsonChange}
                beforeMount={handleBeforeMount}
                options={{
                  minimap: { enabled: false },
                  lineNumbers: 'off',
                  folding: true,
                  scrollBeyondLastLine: false,
                  fontSize: 12,
                  fontFamily: '"JetBrains Mono", "Consolas", monospace',
                  tabSize: 2,
                  wordWrap: 'off',
                  formatOnPaste: true,
                  automaticLayout: true,
                }}
              />
            </div>
          )}

          {jsonError && (
            <div className="mongo-doc-dialog__json-error">{jsonError}</div>
          )}
        </div>

        {saveError && (
          <div className="mongo-doc-dialog__save-error">
            <ErrorBox error={saveError} />
          </div>
        )}
      </div>
    </BaseDialog>
  )
}

// ─── DocumentFieldEditor ──────────────────────────────────────────────────────

interface DocumentFieldEditorProps {
  fields: DocumentField[]
  onChange: (fields: DocumentField[]) => void
  mode: 'add' | 'edit'
}

function DocumentFieldEditor({ fields, onChange, mode }: DocumentFieldEditorProps): JSX.Element {
  function addField(): void {
    onChange([...fields, createDefaultField('string')])
  }

  return (
    <div className="mdf-table-wrap">
      <table className="mdf-table">
        <thead>
          <tr>
            <th className="mdf-th-name">Name</th>
            <th className="mdf-th-type">Type</th>
            <th className="mdf-th-value">Value</th>
            <th className="mdf-th-del" />
          </tr>
        </thead>
        <tbody>
          {fields.map((field, idx) => (
            <FieldNode
              key={field.id}
              field={field}
              isId={field.name === '_id'}
              mode={mode}
              depth={0}
              onUpdate={(updated) => {
                const next = [...fields]
                next[idx] = updated
                onChange(next)
              }}
              onRemove={() => onChange(fields.filter((_, i) => i !== idx))}
            />
          ))}
        </tbody>
      </table>
      <button type="button" className="mdf-add-field-btn" onClick={addField}>
        <Plus size={11} />
        Add Field
      </button>
    </div>
  )
}

// ─── FieldNode ────────────────────────────────────────────────────────────────

interface FieldNodeProps {
  field: DocumentField
  isId: boolean
  mode: 'add' | 'edit'
  depth: number
  onUpdate: (updated: DocumentField) => void
  onRemove: () => void
}

function FieldNode({ field, isId, mode, depth, onUpdate, onRemove }: FieldNodeProps): JSX.Element {
  const canEditName  = !isId
  const canEditType  = !isId
  const canEditValue = !(isId && mode === 'edit')
  const canRemove    = !isId

  const nameHasDot    = !isId && field.name.includes('.')
  const nameHasDollar = !isId && field.name.startsWith('$')
  const nameWarning   = nameHasDot ? 'Dots in field names may cause issues'
                      : nameHasDollar ? 'Field names starting with $ may cause issues'
                      : null

  function handleNameChange(e: ChangeEvent<HTMLInputElement>): void {
    onUpdate({ ...field, name: e.target.value })
  }

  function handleTypeChange(e: ChangeEvent<HTMLSelectElement>): void {
    onUpdate(convertFieldType(field, e.target.value as BsonFieldType))
  }

  function handleValueChange(e: ChangeEvent<HTMLInputElement | HTMLSelectElement>): void {
    onUpdate({ ...field, value: e.target.value })
  }

  function handleExtraChange(e: ChangeEvent<HTMLInputElement>): void {
    onUpdate({ ...field, extra: e.target.value })
  }

  function handleChildrenChange(children: DocumentField[]): void {
    onUpdate({ ...field, children })
  }

  function addChildField(): void {
    const childName = field.type === 'array' ? String(field.children?.length ?? 0) : ''
    handleChildrenChange([...(field.children ?? []), createDefaultField('string', childName)])
  }

  function removeChildField(idx: number): void {
    const next = (field.children ?? []).filter((_, i) => i !== idx)
    const renumbered = field.type === 'array'
      ? next.map((c, i) => ({ ...c, name: String(i) }))
      : next
    handleChildrenChange(renumbered)
  }

  function updateChildField(idx: number, updated: DocumentField): void {
    const next = [...(field.children ?? [])]
    next[idx] = updated
    handleChildrenChange(next)
  }

  const namePadding = depth * 1.25

  return (
    <>
      <tr className="mdf-row">
        {/* NAME */}
        <td className="mdf-td-name">
          <div className="mdf-name-cell" style={{ paddingLeft: `${namePadding}rem` }}>
            <input
              className={`mdf-col-input${nameWarning ? ' mdf-col-input--error' : ''}`}
              type="text"
              value={field.name}
              onChange={handleNameChange}
              disabled={!canEditName}
              placeholder="field_name"
              title={nameWarning ?? undefined}
              aria-label="field name"
            />
            {nameWarning && (
              <span className="mdf-name-warning" title={nameWarning}>⚠</span>
            )}
          </div>
        </td>

        {/* TYPE */}
        <td className="mdf-td-type">
          <select
            className="mdf-col-select"
            value={field.type}
            onChange={handleTypeChange}
            disabled={!canEditType}
            aria-label="field type"
          >
            {BSON_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </td>

        {/* VALUE */}
        <td className="mdf-td-value">
          {renderValueCell(field, canEditValue, handleValueChange, handleExtraChange)}
        </td>

        {/* DELETE */}
        <td className="mdf-td-del">
          {canRemove && (
            <button
              type="button"
              className="mdf-col-delete"
              onClick={onRemove}
              title="Remove field"
              aria-label="Remove field"
            >
              <Trash2 size={13} />
            </button>
          )}
        </td>
      </tr>

      {/* Children rows + add-child row for object / array */}
      {(field.type === 'object' || field.type === 'array') && (
        <>
          {(field.children ?? []).map((child, idx) => (
            <FieldNode
              key={child.id}
              field={child}
              isId={false}
              mode={mode}
              depth={depth + 1}
              onUpdate={(updated) => updateChildField(idx, updated)}
              onRemove={() => removeChildField(idx)}
            />
          ))}
          <tr className="mdf-add-child-row">
            <td colSpan={4}>
              <button
                type="button"
                className="mdf-add-child-btn"
                style={{ paddingLeft: `${(depth + 1) * 1.25 + 0.1}rem` }}
                onClick={addChildField}
              >
                <Plus size={10} />
                {field.type === 'array' ? 'Add Item' : 'Add Field'}
              </button>
            </td>
          </tr>
        </>
      )}
    </>
  )
}

// ─── Value cell renderer ──────────────────────────────────────────────────────

function renderValueCell(
  field: DocumentField,
  canEdit: boolean,
  onValue: (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void,
  onExtra: (e: ChangeEvent<HTMLInputElement>) => void
): JSX.Element | null {
  switch (field.type) {
    case 'null':
    case 'minKey':
    case 'maxKey':
      return <span className="mdf-badge">{field.type}</span>

    case 'object':
      return <span className="mdf-badge">{`{${field.children?.length ?? 0}}`}</span>

    case 'array':
      return <span className="mdf-badge">{`[${field.children?.length ?? 0}]`}</span>

    case 'boolean':
      return (
        <select
          className="mdf-col-select"
          value={field.value}
          onChange={onValue}
          disabled={!canEdit}
          aria-label="boolean value"
        >
          <option value="false">false</option>
          <option value="true">true</option>
        </select>
      )

    case 'regex':
      return (
        <div className="mdf-value-cell">
          <input className="mdf-col-input" type="text" value={field.value} onChange={onValue} disabled={!canEdit} placeholder="pattern" aria-label="regex pattern" />
          <input className="mdf-col-input mdf-col-input--extra" type="text" value={field.extra ?? ''} onChange={onExtra} disabled={!canEdit} placeholder="flags" aria-label="regex flags" />
        </div>
      )

    case 'timestamp':
      return (
        <div className="mdf-value-cell">
          <input className="mdf-col-input" type="number" value={field.value} onChange={onValue} disabled={!canEdit} placeholder="t" aria-label="timestamp t" min="0" step="1" />
          <input className="mdf-col-input mdf-col-input--extra" type="number" value={field.extra ?? '0'} onChange={onExtra} disabled={!canEdit} placeholder="i" aria-label="timestamp i" min="0" step="1" />
        </div>
      )

    case 'binary':
      return (
        <div className="mdf-value-cell">
          <input className="mdf-col-input" type="text" value={field.value} onChange={onValue} disabled={!canEdit} placeholder="base64" aria-label="binary base64" />
          <input className="mdf-col-input mdf-col-input--extra" type="text" value={field.extra ?? '00'} onChange={onExtra} disabled={!canEdit} placeholder="subType" aria-label="binary subType" maxLength={2} />
        </div>
      )

    case 'int32':
    case 'double':
      return (
        <input className="mdf-col-input" type="number" value={field.value} onChange={onValue} disabled={!canEdit} aria-label="numeric value" step={field.type === 'int32' ? '1' : 'any'} />
      )

    default:
      // string, int64, decimal128, date, objectId
      return (
        <input className="mdf-col-input" type="text" value={field.value} onChange={onValue} disabled={!canEdit} placeholder={getValuePlaceholder(field.type)} aria-label="field value" />
      )
  }
}

function getValuePlaceholder(type: BsonFieldType): string {
  switch (type) {
    case 'date':       return 'ISO 8601 e.g. 2024-01-01T00:00:00.000Z'
    case 'objectId':   return '24-char hex'
    case 'int64':      return 'integer'
    case 'decimal128': return 'decimal'
    default:           return ''
  }
}


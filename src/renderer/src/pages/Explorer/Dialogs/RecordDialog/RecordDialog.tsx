import { useState, useEffect, useCallback, type JSX, type ChangeEvent } from 'react'
import { Loader2, PenLine, Plus } from 'lucide-react'
import type { TableColumnMeta } from '../../../../../../preload/index.d'
import { getFieldInputType, buildInsertSql, buildUpdateRowSql } from './recordDialogUtils'
import BaseDialog from '../../../../components/BaseDialog/BaseDialog'
import ErrorBox from '../../../../components/ErrorBox/ErrorBox'
import './RecordDialog.css'
import Button from '../../../../components/Button/Button'

interface RecordDialogProps {
  mode: 'add' | 'edit'
  connectionId: string
  databaseName: string | undefined
  provider: string
  sourceTable: { schema: string; table: string }
  row?: Record<string, unknown>
  pkColumns: string[]
  onClose: () => void
  onSuccess: () => void
  onAddAnotherSuccess?: () => void
}

function formatDatetimeLocal(val: unknown): string {
  if (!val) return ''
  const d = val instanceof Date ? val : new Date(String(val))
  if (isNaN(d.getTime())) return String(val)
  return d.toISOString().slice(0, 16)
}

function formatDateInput(val: unknown): string {
  if (!val) return ''
  const d = val instanceof Date ? val : new Date(String(val))
  if (isNaN(d.getTime())) return String(val)
  return d.toISOString().slice(0, 10)
}

function formatTimeInput(val: unknown): string {
  if (!val) return ''
  const s = String(val)
  return s.slice(0, 5)
}

function initValues(
  schema: TableColumnMeta[],
  row?: Record<string, unknown>
): Record<string, string | boolean | null> {
  const vals: Record<string, string | boolean | null> = {}
  for (const col of schema) {
    if (row !== undefined) {
      const raw = row[col.name]
      const inputType = getFieldInputType(col)
      if (raw === null || raw === undefined) {
        vals[col.name] = col.isNullable ? null : ''
      } else if (inputType === 'boolean') {
        vals[col.name] =
          raw === true ||
          raw === 1 ||
          String(raw).toLowerCase() === 'true' ||
          String(raw) === '1'
      } else if (inputType === 'datetime') {
        vals[col.name] = formatDatetimeLocal(raw)
      } else if (inputType === 'date') {
        vals[col.name] = formatDateInput(raw)
      } else if (inputType === 'time') {
        vals[col.name] = formatTimeInput(raw)
      } else {
        vals[col.name] = raw === null ? null : String(raw)
      }
    } else {
      const inputType = getFieldInputType(col)
      if (col.isIdentity) {
        vals[col.name] = null
      } else if (inputType === 'boolean') {
        vals[col.name] = false
      } else {
        vals[col.name] = col.isNullable ? null : ''
      }
    }
  }
  return vals
}

export default function RecordDialog({
  mode,
  connectionId,
  databaseName,
  provider,
  sourceTable,
  row,
  pkColumns,
  onClose,
  onSuccess,
  onAddAnotherSuccess
}: RecordDialogProps): JSX.Element {
  const [schema, setSchema] = useState<TableColumnMeta[] | null>(null)
  const [schemaError, setSchemaError] = useState<string | null>(null)
  const [values, setValues] = useState<Record<string, string | boolean | null>>({})
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitSql, setSubmitSql] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [addAnother, setAddAnother] = useState(false)

  useEffect(() => {
    let cancelled = false
    const dbName = databaseName ?? ''
    window.api.database
      .getTableSchema(connectionId, dbName, sourceTable.schema, sourceTable.table)
      .then((result) => {
        if (cancelled) return
        if (result.status === 'ok') {
          setSchema(result.columns)
          setValues(initValues(result.columns, row))
        } else {
          setSchemaError(result.message)
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setSchemaError(
          err instanceof Error ? err.message : 'Failed to load table schema'
        )
      })
    return () => {
      cancelled = true
    }
  }, [connectionId, databaseName, sourceTable.schema, sourceTable.table, row])

  const handleChange = useCallback(
    (colName: string, value: string | boolean | null) => {
      setValues((prev) => ({ ...prev, [colName]: value }))
      setValidationErrors((prev) => {
        if (!prev[colName]) return prev
        const next = { ...prev }
        delete next[colName]
        return next
      })
    },
    []
  )

  const validate = useCallback(
    (cols: TableColumnMeta[], vals: Record<string, string | boolean | null>): boolean => {
      const errors: Record<string, string> = {}
      for (const col of cols) {
        if (col.isIdentity && mode === 'add') continue
        const v = vals[col.name]
        if (!col.isNullable && (v === null || v === '')) {
          errors[col.name] = 'This field is required'
        }
      }
      setValidationErrors(errors)
      return Object.keys(errors).length === 0
    },
    [mode]
  )

  const handleSubmit = useCallback(async () => {
    if (!schema) return
    if (!validate(schema, values)) return

    setIsSubmitting(true)
    setSubmitError(null)
    setSubmitSql(null)

    try {
      const rawValues: Record<string, unknown> = {}
      for (const col of schema) {
        rawValues[col.name] = values[col.name]
      }

      let rawSql: string
      if (mode === 'add') {
        rawSql = buildInsertSql(sourceTable, schema, rawValues, provider)
      } else {
        rawSql = buildUpdateRowSql(sourceTable, schema, rawValues, pkColumns, provider)
      }

      const sql =
        provider === 'sqlserver' && databaseName ? `USE [${databaseName}];\n${rawSql}` : rawSql

      const result = await window.api.database.executeQuery(
        connectionId,
        sql,
        false,
        false,
        databaseName
      )
      if (result.status === 'ok') {
        if (mode === 'add' && addAnother) {
          onAddAnotherSuccess?.()
          setValues(initValues(schema, undefined))
          setValidationErrors({})
          setSubmitError(null)
          setSubmitSql(null)
        } else {
          onSuccess()
        }
      } else {
        setSubmitError(result.message)
        setSubmitSql(rawSql)
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'An unexpected error occurred')
    } finally {
      setIsSubmitting(false)
    }
  }, [
    schema,
    values,
    validate,
    mode,
    sourceTable,
    pkColumns,
    provider,
    databaseName,
    connectionId,
    onSuccess,
    onAddAnotherSuccess,
    addAnother
  ])

  const tableLabel = `[${sourceTable.schema}].[${sourceTable.table}]`
  const title = mode === 'add' ? `Add Record — ${tableLabel}` : `Edit Record — ${tableLabel}`
  const submitLabel = mode === 'add' ? 'Add' : 'Save'

  const icon =
    mode === 'add' ? (
      <Plus size={15} style={{ color: 'var(--color-accent, #a1faff)' }} />
    ) : (
      <PenLine size={15} style={{ color: 'var(--color-accent, #a1faff)' }} />
    )

  return (
    <BaseDialog
      title={title}
      icon={icon}
      onClose={onClose}
      closeDisabled={isSubmitting}
      maxWidth="560px"
      zIndex={200}
      footerSpaceBetween
      footer={
        <>
          <div className="dialog__footer-left">
            {mode === 'add' && (
              <label className="record-dialog__add-another">
                <input
                  type="checkbox"
                  checked={addAnother}
                  onChange={(e) => setAddAnother(e.target.checked)}
                  disabled={isSubmitting}
                />
                Add another record
              </label>
            )}
          </div>
          <div className="dialog__footer-right">
            <Button
              variant="ghost"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                void handleSubmit()
              }}
              disabled={isSubmitting || !schema || !!schemaError}
              isLoading={isSubmitting}
            >
              {isSubmitting ? (mode === 'add' ? 'Adding…' : 'Saving…') : submitLabel}
            </Button>
          </div>
        </>
      }
    >
      <div className="record-dialog__body">
        {schemaError && <div className="record-dialog__schema-error">{schemaError}</div>}

        {!schemaError && !schema && (
          <div className="record-dialog__loading">
            <Loader2 size={16} className="record-dialog__loading-spinner" />
            <span>Loading schema…</span>
          </div>
        )}

        {schema && (
          <div className="record-dialog__fields">
            {schema.map((col) => (
              <FieldRow
                key={col.name}
                col={col}
                mode={mode}
                value={values[col.name] ?? null}
                error={validationErrors[col.name]}
                onChange={handleChange}
              />
            ))}
          </div>
        )}

        {submitError && <ErrorBox error={submitError} statement={submitSql ?? undefined} />}
      </div>
    </BaseDialog>
  )
}

// ─── Field row ────────────────────────────────────────────────────────────────

interface FieldRowProps {
  col: TableColumnMeta
  mode: 'add' | 'edit'
  value: string | boolean | null
  error?: string
  onChange: (colName: string, value: string | boolean | null) => void
}

function FieldRow({ col, mode, value, error, onChange }: FieldRowProps): JSX.Element {
  const inputType = getFieldInputType(col)
  const isDisabled =
    (mode === 'add' && col.isIdentity) || (mode === 'edit' && col.isPrimaryKey)

  const label = (
    <label className="record-dialog__field-label" htmlFor={`rdf-${col.name}`}>
      <span className="record-dialog__field-name">{col.name}</span>
      <span className="record-dialog__field-type">
        {col.type}
        {col.maxLength && col.maxLength > 0 ? `(${col.maxLength})` : ''}
      </span>
      {!col.isNullable && !col.isIdentity && (
        <span className="record-dialog__field-required" aria-label="required">
          *
        </span>
      )}
      {col.isPrimaryKey && (
        <span className="record-dialog__field-pk" title="Primary Key">
          PK
        </span>
      )}
    </label>
  )

  let input: JSX.Element

  if (isDisabled) {
    const disabledVal =
      mode === 'add' && col.isIdentity ? '(auto)' : value === null ? 'NULL' : String(value)
    input = (
      <input
        id={`rdf-${col.name}`}
        className="record-dialog__input record-dialog__input--disabled"
        type="text"
        value={disabledVal}
        readOnly
        disabled
        title={
          mode === 'add'
            ? 'Auto-generated by the database'
            : 'Primary key — cannot be changed'
        }
      />
    )
  } else if (inputType === 'boolean') {
    input = (
      <div className="record-dialog__checkbox-row">
        <input
          id={`rdf-${col.name}`}
          className="record-dialog__checkbox"
          type="checkbox"
          checked={value === true}
          onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(col.name, e.target.checked)}
        />
        {col.isNullable && (
          <button
            className="record-dialog__null-btn"
            type="button"
            onClick={() => onChange(col.name, null)}
            title="Set to NULL"
          >
            NULL
          </button>
        )}
      </div>
    )
  } else if (inputType === 'textarea') {
    input = (
      <textarea
        id={`rdf-${col.name}`}
        className={`record-dialog__textarea${error ? ' record-dialog__input--error' : ''}`}
        value={value === null ? '' : String(value)}
        placeholder={col.isNullable ? 'NULL' : ''}
        onChange={(e: ChangeEvent<HTMLTextAreaElement>) => onChange(col.name, e.target.value)}
        rows={3}
      />
    )
  } else {
    const htmlInputType =
      inputType === 'number'
        ? 'number'
        : inputType === 'date'
          ? 'date'
          : inputType === 'datetime'
            ? 'datetime-local'
            : inputType === 'time'
              ? 'time'
              : 'text'

    const maxLenAttr =
      inputType === 'text' && col.maxLength && col.maxLength > 0 ? col.maxLength : undefined

    input = (
      <input
        id={`rdf-${col.name}`}
        className={`record-dialog__input${error ? ' record-dialog__input--error' : ''}`}
        type={htmlInputType}
        value={value === null ? '' : String(value)}
        placeholder={col.isNullable ? 'NULL' : ''}
        maxLength={maxLenAttr}
        step={
          inputType === 'datetime' || inputType === 'time'
            ? 1
            : inputType === 'number' && col.scale && col.scale > 0
              ? Math.pow(10, -col.scale)
              : undefined
        }
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(col.name, e.target.value)}
      />
    )
  }

  return (
    <div className={`record-dialog__field${error ? ' record-dialog__field--invalid' : ''}`}>
      {label}
      <div className="record-dialog__field-input-wrap">
        {input}
        {col.isNullable && inputType !== 'boolean' && !isDisabled && value !== null && (
          <button
            className="record-dialog__null-btn"
            type="button"
            onClick={() => onChange(col.name, null)}
            title="Set to NULL"
          >
            NULL
          </button>
        )}
      </div>
      {error && <span className="record-dialog__field-error">{error}</span>}
    </div>
  )
}

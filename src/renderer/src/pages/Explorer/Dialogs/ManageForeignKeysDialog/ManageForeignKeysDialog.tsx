import { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, Trash2, Link } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ForeignKeyDefinition, ForeignKeyRule } from '../../../../../../preload/index.d'
import './ManageForeignKeysDialog.css'
import BaseDialog from '../../../../components/BaseDialog/BaseDialog'
import ErrorBox from '../../../../components/ErrorBox/ErrorBox'
import Button from '../../../../components/Button/Button'

interface TableEntry {
  schema: string
  name: string
}

interface ManageForeignKeysDialogProps {
  connectionId: string
  databaseName: string
  schema: string
  tableName: string
  initialFkName?: string
  onClose: () => void
  onSuccess: () => void
}

type RuleOption = { value: ForeignKeyRule; label: string }

const RULE_OPTIONS: RuleOption[] = [
  { value: 'NO_ACTION', label: 'No Action' },
  { value: 'CASCADE', label: 'Cascade' },
  { value: 'SET_NULL', label: 'Set Null' },
  { value: 'SET_DEFAULT', label: 'Set Default' }
]

interface EditState {
  constraintName: string
  columnName: string
  referencedSchema: string
  referencedTable: string
  referencedColumn: string
  isEnabled: boolean
  enforceForReplication: boolean
  deleteRule: ForeignKeyRule
  updateRule: ForeignKeyRule
  description: string
}

function buildDefaultName(tableName: string, referencedTable: string): string {
  if (!referencedTable) return ''
  return `FK_${tableName}_${referencedTable}`
}

function buildCreateDdl(
  schema: string,
  tableName: string,
  databaseName: string,
  edit: EditState
): string {
  const db = `[${databaseName}]`
  const fkTable = `[${schema}].[${tableName}]`
  const refTable = `[${edit.referencedSchema}].[${edit.referencedTable}]`
  const checkClause = edit.isEnabled ? 'WITH CHECK' : 'WITH NOCHECK'
  const deleteAction = edit.deleteRule.replace('_', ' ')
  const updateAction = edit.updateRule.replace('_', ' ')

  const lines: string[] = [
    `USE ${db}`,
    `ALTER TABLE ${fkTable} ${checkClause}`,
    `  ADD CONSTRAINT [${edit.constraintName}]`,
    `  FOREIGN KEY ([${edit.columnName}])`,
    `  REFERENCES ${refTable} ([${edit.referencedColumn}])`,
    `  ON DELETE ${deleteAction}`,
    `  ON UPDATE ${updateAction}`
  ]

  if (!edit.enforceForReplication) {
    lines.push(`  NOT FOR REPLICATION`)
  }

  lines[lines.length - 1] = lines[lines.length - 1]

  const alterCheck = edit.isEnabled
    ? `ALTER TABLE ${fkTable} CHECK CONSTRAINT [${edit.constraintName}]`
    : `ALTER TABLE ${fkTable} NOCHECK CONSTRAINT [${edit.constraintName}]`

  return `${lines.join('\n')}\n\nUSE ${db}\n${alterCheck}`
}

function buildDropDdl(schema: string, tableName: string, databaseName: string, constraintName: string): string {
  return `USE [${databaseName}]\nALTER TABLE [${schema}].[${tableName}] DROP CONSTRAINT [${constraintName}]`
}

export default function ManageForeignKeysDialog({
  connectionId,
  databaseName,
  schema,
  tableName,
  initialFkName,
  onClose,
  onSuccess
}: ManageForeignKeysDialogProps): React.JSX.Element {
  const { t } = useTranslation()

  const [foreignKeys, setForeignKeys] = useState<ForeignKeyDefinition[]>([])
  const [selectedFkName, setSelectedFkName] = useState<string | null>(initialFkName ?? null)
  const [isAddingNew, setIsAddingNew] = useState(false)

  const [allTables, setAllTables] = useState<TableEntry[]>([])
  const [destColumns, setDestColumns] = useState<string[]>([])
  const [sourceColumns, setSourceColumns] = useState<string[]>([])

  const [editState, setEditState] = useState<EditState>({
    constraintName: '',
    columnName: '',
    referencedSchema: '',
    referencedTable: '',
    referencedColumn: '',
    isEnabled: true,
    enforceForReplication: true,
    deleteRule: 'NO_ACTION',
    updateRule: 'NO_ACTION',
    description: ''
  })

  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errorSql, setErrorSql] = useState<string | null>(null)
  const [loadingFks, setLoadingFks] = useState(true)
  const [loadingTables, setLoadingTables] = useState(true)

  // Track if the user manually typed the constraint name so we don't override it
  const nameManuallyEdited = useRef(false)

  // ─────────────────────────────────────────────
  //  Load FKs + destination columns + all tables
  // ─────────────────────────────────────────────
  const loadForeignKeys = useCallback(async () => {
    setLoadingFks(true)
    const result = await window.api.database.getForeignKeys(
      connectionId,
      databaseName,
      schema,
      tableName
    )
    setLoadingFks(false)
    if (result.status === 'ok') {
      setForeignKeys(result.foreignKeys)
    }
  }, [connectionId, databaseName, schema, tableName])

  useEffect(() => {
    void loadForeignKeys()
  }, [loadForeignKeys])

  // Load destination (current table) columns
  useEffect(() => {
    void (async () => {
      const result = await window.api.database.getTableSchema(
        connectionId,
        databaseName,
        schema,
        tableName
      )
      if (result.status === 'ok') {
        setDestColumns(result.columns.map((c) => c.name))
      }
    })()
  }, [connectionId, databaseName, schema, tableName])

  // Load all tables in the database for the source dropdown
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

  // Pre-select the initial FK once both FKs and the list are loaded
  useEffect(() => {
    if (initialFkName && foreignKeys.length > 0 && !isAddingNew) {
      const fk = foreignKeys.find((f) => f.constraintName === initialFkName)
      if (fk) {
        selectFk(fk)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFkName, foreignKeys])

  // Load source columns when source table changes
  useEffect(() => {
    if (!editState.referencedSchema || !editState.referencedTable) {
      setSourceColumns([])
      return
    }
    void (async () => {
      const result = await window.api.database.getTableSchema(
        connectionId,
        databaseName,
        editState.referencedSchema,
        editState.referencedTable
      )
      if (result.status === 'ok') {
        setSourceColumns(result.columns.map((c) => c.name))
      }
    })()
  }, [connectionId, databaseName, editState.referencedSchema, editState.referencedTable])

  // ─────────────────────────────────────────────
  //  Selection helpers
  // ─────────────────────────────────────────────
  function selectFk(fk: ForeignKeyDefinition): void {
    setSelectedFkName(fk.constraintName)
    setIsAddingNew(false)
    nameManuallyEdited.current = true // existing FK — treat name as manual
    setEditState({
      constraintName: fk.constraintName,
      columnName: fk.columnName,
      referencedSchema: fk.referencedSchema,
      referencedTable: fk.referencedTable,
      referencedColumn: fk.referencedColumn,
      isEnabled: fk.isEnabled,
      enforceForReplication: fk.enforceForReplication,
      deleteRule: fk.deleteRule,
      updateRule: fk.updateRule,
      description: fk.description ?? ''
    })
    setError(null)
    setErrorSql(null)
  }

  function startAddNew(): void {
    setSelectedFkName(null)
    setIsAddingNew(true)
    nameManuallyEdited.current = false
    setEditState({
      constraintName: '',
      columnName: destColumns[0] ?? '',
      referencedSchema: '',
      referencedTable: '',
      referencedColumn: '',
      isEnabled: true,
      enforceForReplication: true,
      deleteRule: 'NO_ACTION',
      updateRule: 'NO_ACTION',
      description: ''
    })
    setError(null)
    setErrorSql(null)
  }

  // ─────────────────────────────────────────────
  //  Handlers
  // ─────────────────────────────────────────────
  function handleSourceTableChange(value: string): void {
    const [refSchema, refTable] = value.split('|')
    const newName = nameManuallyEdited.current
      ? editState.constraintName
      : buildDefaultName(tableName, refTable ?? '')

    setEditState((prev) => ({
      ...prev,
      referencedSchema: refSchema ?? '',
      referencedTable: refTable ?? '',
      referencedColumn: '', // reset column when table changes
      constraintName: newName
    }))
  }

  function handleConstraintNameChange(value: string): void {
    nameManuallyEdited.current = true
    setEditState((prev) => ({ ...prev, constraintName: value }))
  }

  async function handleSave(): Promise<void> {
    if (!editState.constraintName.trim()) {
      setError('Constraint name is required.')
      return
    }
    if (!editState.referencedTable) {
      setError('Source (referenced) table is required.')
      return
    }
    if (!editState.columnName) {
      setError('Destination column is required.')
      return
    }
    if (!editState.referencedColumn) {
      setError('Source column is required.')
      return
    }

    setIsSaving(true)
    setError(null)
    setErrorSql(null)

    try {
      // If editing existing: drop first
      if (!isAddingNew && selectedFkName) {
        const dropSql = buildDropDdl(schema, tableName, databaseName, selectedFkName)
        const dropResult = await window.api.database.executeQuery(connectionId, dropSql)
        if (dropResult.status === 'error') {
          setError(dropResult.message)
          setErrorSql(dropSql)
          setIsSaving(false)
          return
        }
      }

      // Create the FK
      const createSql = buildCreateDdl(schema, tableName, databaseName, editState)
      const createResult = await window.api.database.executeQuery(connectionId, createSql)
      if (createResult.status === 'error') {
        setError(createResult.message)
        setErrorSql(createSql)
        setIsSaving(false)
        return
      }

      // Handle description via extended properties
      if (editState.description.trim()) {
        const descSql = `USE [${databaseName}]\n` +
          `EXEC sys.sp_addextendedproperty @name=N'MS_Description', ` +
          `@value=N'${editState.description.replace(/'/g, "''")}', ` +
          `@level0type=N'SCHEMA', @level0name=N'${schema}', ` +
          `@level1type=N'TABLE', @level1name=N'${tableName}', ` +
          `@level2type=N'CONSTRAINT', @level2name=N'${editState.constraintName}'`
        // Best-effort — ignore failure (might already exist or not supported)
        await window.api.database.executeQuery(connectionId, descSql)
      }

      await loadForeignKeys()
      setSelectedFkName(editState.constraintName)
      setIsAddingNew(false)
      onSuccess()
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDelete(): Promise<void> {
    if (!selectedFkName) return
    setIsDeleting(true)
    setError(null)
    setErrorSql(null)
    const dropSql = buildDropDdl(schema, tableName, databaseName, selectedFkName)
    const result = await window.api.database.executeQuery(connectionId, dropSql)
    setIsDeleting(false)
    if (result.status === 'error') {
      setError(result.message)
      setErrorSql(dropSql)
      return
    }
    await loadForeignKeys()
    setSelectedFkName(null)
    setIsAddingNew(false)
    setEditState({
      constraintName: '',
      columnName: '',
      referencedSchema: '',
      referencedTable: '',
      referencedColumn: '',
      isEnabled: true,
      enforceForReplication: true,
      deleteRule: 'NO_ACTION',
      updateRule: 'NO_ACTION',
      description: ''
    })
    onSuccess()
  }

  const isEditing = isAddingNew || selectedFkName !== null

  const fkFooter = isEditing ? (
    <>
      <div>
        {!isAddingNew && selectedFkName && (
          <Button
              variant="danger"
            onClick={() => void handleDelete()}
            disabled={isDeleting || isSaving}
          >
            <Trash2 size={13} />
            {isDeleting
              ? t('common.deleting', 'Deleting…')
              : t('explor.foreignKeys.deleteButton', 'Delete')}
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
            : t('explor.foreignKeys.saveButton', 'Save')}
        </Button>
      </div>
    </>
  ) : undefined

  return (
    <BaseDialog
      title={t('explorer.foreignKeys.dialogTitle', { table: `${schema}.${tableName}`, defaultValue: `Manage Foreign Keys — ${schema}.${tableName}` })}
      icon={<Link size={16} />}
      onClose={onClose}
      width="90vw"
      maxWidth="980px"
      height="90vh"
      maxHeight="700px"
      minWidth="760px"
      minHeight="480px"
      footerSpaceBetween
      footer={fkFooter}
    >
        <div className="fk-dialog__body">
          {/* Left panel: FK list */}
          <div className="fk-dialog__list-panel">
            <div className="fk-dialog__list-header">
              {t('explorer.foreignKeys.listHeader', 'Foreign Keys')}
            </div>
            <div className="fk-dialog__list">
              {loadingFks ? (
                <div className="fk-dialog__empty-state">{t('common.loading', 'Loading…')}</div>
              ) : foreignKeys.length === 0 && !isAddingNew ? (
                <div className="fk-dialog__empty-state fk-dialog__empty-state--list">
                  {t('explorer.foreignKeys.noKeys', 'No foreign keys')}
                </div>
              ) : (
                <>
                  {foreignKeys.map((fk) => (
                    <div
                      key={fk.constraintName}
                      className={`fk-dialog__list-item${selectedFkName === fk.constraintName && !isAddingNew ? ' fk-dialog__list-item--selected' : ''}`}
                      onClick={() => selectFk(fk)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') selectFk(fk) }}
                    >
                      <Link size={12} style={{ flexShrink: 0 }} />
                      {fk.constraintName}
                    </div>
                  ))}
                  {isAddingNew && (
                    <div className="fk-dialog__list-item fk-dialog__list-item--selected">
                      <Link size={12} style={{ flexShrink: 0 }} />
                      {editState.constraintName || t('explorer.foreignKeys.newKey', '(new)')}
                    </div>
                  )}
                </>
              )}
            </div>
            <button className="fk-dialog__list-add" onClick={startAddNew}>
              <Plus size={13} />
              {t('explorer.foreignKeys.addButton', 'Add Foreign Key')}
            </button>
          </div>

          {/* Right panel: editor */}
          <div className="fk-dialog__editor-panel">
            {!isEditing ? (
              <div className="fk-dialog__empty-state">
                {t('explorer.foreignKeys.selectOrAdd', 'Select a foreign key or add a new one')}
              </div>
            ) : (
              <>
                <div className="fk-dialog__editor-body">
                  {/* Source / Destination table + column row */}
                  <div>
                    <div className="fk-dialog__section-label fk-dialog__section-label--spaced">
                      {t('explorer.foreignKeys.tableMapping', 'Table Mapping')}
                    </div>
                    <div className="fk-dialog__table-row">
                      {/* Source (referenced parent) */}
                      <div className="fk-dialog__table-group">
                        <div className="fk-dialog__label">
                          {t('explorer.foreignKeys.sourceTable', 'Source Table (Referenced)')}
                        </div>
                        <div className="fk-dialog__table-selectors">
                          <select
                            className="fk-dialog__select"
                            title={t('explor.foreignKeys.sourceTable', 'Source Table')}
                            value={
                              editState.referencedTable
                                ? `${editState.referencedSchema}|${editState.referencedTable}`
                                : ''
                            }
                            onChange={(e) => handleSourceTableChange(e.target.value)}
                            disabled={loadingTables}
                          >
                            <option value="">
                              {loadingTables
                                ? t('common.loading', 'Loading…')
                                : t('explorer.foreignKeys.selectTable', '— Select table —')}
                            </option>
                            {allTables.map((tbl) => (
                              <option key={`${tbl.schema}.${tbl.name}`} value={`${tbl.schema}|${tbl.name}`}>
                                {tbl.schema}.{tbl.name}
                              </option>
                            ))}
                          </select>
                          <select
                            className="fk-dialog__select"
                            title={t('explor.foreignKeys.sourceColumn', 'Source Column')}
                            value={editState.referencedColumn}
                            onChange={(e) => setEditState((p) => ({ ...p, referencedColumn: e.target.value }))}
                            disabled={sourceColumns.length === 0}
                          >
                            <option value="">
                              {t('explor.foreignKeys.selectColumn', '— Select column —')}
                            </option>
                            {sourceColumns.map((col) => (
                              <option key={col} value={col}>{col}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Destination (current FK-holding table) */}
                      <div className="fk-dialog__table-group">
                        <div className="fk-dialog__label">
                          {t('explor.foreignKeys.destinationTable', 'Destination Table (FK Holder)')}
                        </div>
                        <div className="fk-dialog__table-selectors">
                          <select className="fk-dialog__select" title={`${schema}.${tableName}`} disabled value="">
                            <option value="">{schema}.{tableName}</option>
                          </select>
                          <select
                            className="fk-dialog__select"
                            title={t('explor.foreignKeys.destinationColumn', 'Destination Column')}
                            value={editState.columnName}
                            onChange={(e) => setEditState((p) => ({ ...p, columnName: e.target.value }))}
                            disabled={destColumns.length === 0}
                          >
                            <option value="">
                              {t('explor.foreignKeys.selectColumn', '— Select column —')}
                            </option>
                            {destColumns.map((col) => (
                              <option key={col} value={col}>{col}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Properties section */}
                  <div>
                    <div className="fk-dialog__section-label fk-dialog__section-label--spaced">
                      {t('explor.foreignKeys.properties', 'Properties')}
                    </div>

                    {/* Name */}
                    <div className="fk-dialog__field fk-dialog__field--spaced">
                      <label className="fk-dialog__label">
                        {t('explor.foreignKeys.name', 'Name')}
                      </label>
                      <input
                        className="fk-dialog__input"
                        type="text"
                        value={editState.constraintName}
                        onChange={(e) => handleConstraintNameChange(e.target.value)}
                        placeholder="FK_TableName_ReferencedTable"
                      />
                    </div>

                    {/* Description */}
                    <div className="fk-dialog__field fk-dialog__field--spaced">
                      <label className="fk-dialog__label">
                        {t('explor.foreignKeys.description', 'Description')}
                      </label>
                      <textarea
                        className="fk-dialog__textarea"
                        value={editState.description}
                        onChange={(e) => setEditState((p) => ({ ...p, description: e.target.value }))}
                        placeholder={t('explor.foreignKeys.descriptionPlaceholder', 'Optional description…')}
                      />
                    </div>

                    {/* Checkboxes */}
                    <div className="fk-dialog__checkboxes-row fk-dialog__checkboxes-row--spaced">
                      <label className="fk-dialog__checkbox-field">
                        <input
                          type="checkbox"
                          checked={editState.enforceForReplication}
                          onChange={(e) => setEditState((p) => ({ ...p, enforceForReplication: e.target.checked }))}
                        />
                        <span className="fk-dialog__checkbox-label">
                          {t('explor.foreignKeys.enforceForReplication', 'Enforce for Replication')}
                        </span>
                      </label>
                      <label className="fk-dialog__checkbox-field">
                        <input
                          type="checkbox"
                          checked={editState.isEnabled}
                          onChange={(e) => setEditState((p) => ({ ...p, isEnabled: e.target.checked }))}
                        />
                        <span className="fk-dialog__checkbox-label">
                          {t('explor.foreignKeys.enforceFkConstraints', 'Enforce Foreign Key Constraints')}
                        </span>
                      </label>
                    </div>

                    {/* Delete / Update rules */}
                    <div className="fk-dialog__rules-row">
                      <div className="fk-dialog__field">
                        <label className="fk-dialog__label">
                          {t('explor.foreignKeys.deleteRule', 'Delete Rule')}
                        </label>
                        <select
                          className="fk-dialog__select"
                          title={t('explor.foreignKeys.deleteRule', 'Delete Rule')}
                          value={editState.deleteRule}
                          onChange={(e) => setEditState((p) => ({ ...p, deleteRule: e.target.value as ForeignKeyRule }))}
                        >
                          {RULE_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="fk-dialog__field">
                        <label className="fk-dialog__label">
                          {t('explor.foreignKeys.updateRule', 'Update Rule')}
                        </label>
                        <select
                          className="fk-dialog__select"
                          title={t('explor.foreignKeys.updateRule', 'Update Rule')}
                          value={editState.updateRule}
                          onChange={(e) => setEditState((p) => ({ ...p, updateRule: e.target.value as ForeignKeyRule }))}
                        >
                          {RULE_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </div>
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

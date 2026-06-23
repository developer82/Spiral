import { useState, useEffect, useCallback } from 'react'
import { Plus, Trash2, Tag } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import TableColumnsEditor, { type TableField, newFieldId } from '../../TableColumnsEditor/TableColumnsEditor'
import './ManageTableTypesDialog.css'
import BaseDialog from '../../../../components/BaseDialog/BaseDialog'
import ErrorBox from '../../../../components/ErrorBox/ErrorBox'
import Button from '../../../../components/Button/Button'

interface ManageTableTypesDialogProps {
  connectionId: string
  databaseName: string
  initialTypeName?: string
  openOnNew?: boolean
  onClose: () => void
  onSuccess: () => void
}

interface TypeListItem {
  schemaName: string
  typeName: string
}

interface EditState {
  schemaName: string
  typeName: string
  columns: TableField[]
}

function makeDefaultEditState(defaultSchema: string): EditState {
  return {
    schemaName: defaultSchema,
    typeName: '',
    columns: []
  }
}

export default function ManageTableTypesDialog({
  connectionId,
  databaseName,
  initialTypeName,
  openOnNew,
  onClose,
  onSuccess
}: ManageTableTypesDialogProps): React.JSX.Element {
  const { t } = useTranslation()

  const [tableTypes, setTableTypes] = useState<TypeListItem[]>([])
  const [selectedKey, setSelectedKey] = useState<string | null>(initialTypeName ?? null)
  const [isAddingNew, setIsAddingNew] = useState(openOnNew ?? false)
  const [schemas, setSchemas] = useState<string[]>(['dbo'])
  const [loadingTypes, setLoadingTypes] = useState(true)
  const [loadingColumns, setLoadingColumns] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editState, setEditState] = useState<EditState>(makeDefaultEditState('dbo'))

  // Load schemas
  useEffect(() => {
    void (async () => {
      const result = await window.api.database.executeQuery(
        connectionId,
        `SELECT name FROM [${databaseName}].sys.schemas WHERE name NOT IN ('sys','INFORMATION_SCHEMA','guest') ORDER BY name`
      )
      if (result.status === 'ok' && result.resultSets[0]) {
        const names = result.resultSets[0].rows.map((r) => String(r['name']))
        if (names.length > 0) {
          setSchemas(names)
          setEditState((prev) => ({
            ...prev,
            schemaName: names.includes('dbo') ? 'dbo' : names[0]
          }))
        }
      }
    })()
  }, [connectionId, databaseName])

  const loadTableTypes = useCallback(async () => {
    setLoadingTypes(true)
    try {
      const result = await window.api.database.getTableTypes(connectionId, databaseName)
      if (result.status === 'ok') {
        setTableTypes(result.tableTypes)
      }
    } finally {
      setLoadingTypes(false)
    }
  }, [connectionId, databaseName])

  useEffect(() => {
    void loadTableTypes()
  }, [loadTableTypes])

  // After initial load, select the type specified by initialTypeName (if any)
  useEffect(() => {
    if (loadingTypes || !initialTypeName) return
    const found = tableTypes.find(
      (tt) => `${tt.schemaName}.${tt.typeName}` === initialTypeName
    )
    if (found) void selectTableType(found)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingTypes])

  async function selectTableType(tt: TypeListItem): Promise<void> {
    setIsAddingNew(false)
    const key = `${tt.schemaName}.${tt.typeName}`
    setSelectedKey(key)
    setError(null)
    setLoadingColumns(true)
    try {
      const result = await window.api.database.getTableType(
        connectionId,
        databaseName,
        tt.schemaName,
        tt.typeName
      )
      if (result.status === 'ok') {
        const columns: TableField[] = result.tableType.columns.map((col) => {
          let length: number | 'MAX' | null = null
          if (col.maxLength !== null) {
            length = col.maxLength === -1 ? 'MAX' : col.maxLength
          }
          return {
            id: newFieldId(),
            name: col.name,
            type: col.type,
            length,
            precision: col.precision,
            scale: col.scale,
            isNullable: col.isNullable,
            defaultValue: '',
            isPrimaryKey: false,
            isIdentity: false,
            identitySeed: 1,
            identityIncrement: 1
          }
        })
        setEditState({
          schemaName: result.tableType.schemaName,
          typeName: result.tableType.typeName,
          columns
        })
      } else {
        setError(result.message)
      }
    } finally {
      setLoadingColumns(false)
    }
  }

  function startAddNew(): void {
    setSelectedKey(null)
    setIsAddingNew(true)
    setError(null)
    setEditState(makeDefaultEditState(schemas[0] ?? 'dbo'))
  }

  async function handleSave(): Promise<void> {
    if (!editState.typeName.trim()) {
      setError(t('explorer.manageTableTypes.validation.nameRequired'))
      return
    }
    if (!editState.schemaName) {
      setError(t('explorer.manageTableTypes.validation.schemaRequired'))
      return
    }

    setIsSaving(true)
    setError(null)

    try {
      const isEdit = !isAddingNew && selectedKey !== null
      const [origSchema, origName] = isEdit ? selectedKey!.split('.') : [undefined, undefined]

      const params = {
        schemaName: editState.schemaName,
        typeName: editState.typeName.trim(),
        columns: editState.columns.map((col) => ({
          name: col.name,
          type: col.type,
          length: col.length,
          precision: col.precision,
          scale: col.scale,
          isNullable: col.isNullable
        }))
      }

      const result = await window.api.database.saveTableType(
        connectionId,
        databaseName,
        params,
        origName,
        origSchema
      )

      if (result.status === 'error') {
        setError(result.message)
        return
      }

      await loadTableTypes()
      setSelectedKey(`${params.schemaName}.${params.typeName}`)
      setIsAddingNew(false)
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDelete(): Promise<void> {
    if (!selectedKey) return
    setIsDeleting(true)
    setError(null)

    try {
      const dotIndex = selectedKey.indexOf('.')
      const schemaName = selectedKey.slice(0, dotIndex)
      const typeName = selectedKey.slice(dotIndex + 1)

      const result = await window.api.database.deleteTableType(
        connectionId,
        databaseName,
        schemaName,
        typeName
      )

      if (result.status === 'error') {
        setError(result.message)
        return
      }

      await loadTableTypes()
      setSelectedKey(null)
      setIsAddingNew(false)
      setEditState(makeDefaultEditState(schemas[0] ?? 'dbo'))
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsDeleting(false)
    }
  }

  const hasSelection = !!selectedKey && !isAddingNew
  const showEditor = isAddingNew || !!selectedKey
  const isBusy = isSaving || isDeleting || loadingColumns

  const mttFooter = showEditor ? (
    <>
      <div className="mtt-dialog__error-area">{error && <ErrorBox error={error} />}</div>
      <div className="dialog__footer-right">
        {hasSelection && (
          <Button
              variant="danger"
            onClick={() => void handleDelete()}
            disabled={isBusy}
          >
            <Trash2 size={13} />
            {t('explorer.manageTableTypes.deleteButton')}
          </Button>
        )}
        <Button
              variant="primary"
          onClick={() => void handleSave()}
          disabled={isBusy}
        >
          {isAddingNew
            ? t('explorer.manageTableTypes.saveButton')
            : t('explorer.manageTableTypes.updateButton')}
        </Button>
      </div>
    </>
  ) : undefined

  return (
    <BaseDialog
      title={t('explorer.manageTableTypes.dialogTitle')}
      icon={<Tag size={16} />}
      onClose={onClose}
      width="90vw"
      maxWidth="900px"
      height="90vh"
      maxHeight="680px"
      minWidth="680px"
      minHeight="480px"
      footerSpaceBetween
      footer={mttFooter}
    >
        <div className="mtt-dialog__body">
          {/* Left panel: list */}
          <div className="mtt-dialog__list-panel">
            <div className="mtt-dialog__list-header">
              {t('explorer.manageTableTypes.listHeader')}
            </div>
            <div className="mtt-dialog__list">
              {loadingTypes ? (
                <div className="mtt-dialog__empty-state">
                  {t('common.loading', 'Loading…')}
                </div>
              ) : tableTypes.length === 0 && !isAddingNew ? (
                <div className="mtt-dialog__empty-state mtt-dialog__empty-state--list">
                  {t('explorer.manageTableTypes.noItems')}
                </div>
              ) : (
                <>
                  {tableTypes.map((tt) => {
                    const key = `${tt.schemaName}.${tt.typeName}`
                    return (
                      <div
                        key={key}
                        className={`mtt-dialog__list-item${
                          selectedKey === key && !isAddingNew
                            ? ' mtt-dialog__list-item--selected'
                            : ''
                        }`}
                        onClick={() => void selectTableType(tt)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') void selectTableType(tt)
                        }}
                      >
                        <Tag size={12} style={{ flexShrink: 0 }} />
                        {key}
                      </div>
                    )
                  })}
                  {isAddingNew && (
                    <div className="mtt-dialog__list-item mtt-dialog__list-item--selected">
                      <Tag size={12} style={{ flexShrink: 0 }} />
                      {editState.typeName
                        ? `${editState.schemaName}.${editState.typeName}`
                        : t('explorer.manageTableTypes.newItem')}
                    </div>
                  )}
                </>
              )}
            </div>
            <button className="mtt-dialog__list-add" onClick={startAddNew} disabled={isBusy}>
              <Plus size={13} />
              {t('explorer.manageTableTypes.addButton')}
            </button>
          </div>

          {/* Right panel: editor */}
          <div className="mtt-dialog__editor-panel">
            {!showEditor ? (
              <div className="mtt-dialog__empty-state">
                {t('explorer.manageTableTypes.selectOrAdd')}
              </div>
            ) : (
              <>
                {/* Schema + Name row */}
                <div className="mtt-dialog__editor-header">
                  <div className="mtt-dialog__field">
                    <label className="mtt-dialog__label" htmlFor="mtt-schema">
                      {t('explorer.manageTableTypes.schemaLabel')}
                    </label>
                    <select
                      id="mtt-schema"
                      className="mtt-dialog__select"
                      value={editState.schemaName}
                      onChange={(e) =>
                        setEditState((prev) => ({ ...prev, schemaName: e.target.value }))
                      }
                      disabled={!isAddingNew || isBusy}
                    >
                      {schemas.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="mtt-dialog__field">
                    <label className="mtt-dialog__label">
                      {t('explorer.manageTableTypes.nameLabel')}
                    </label>
                    <input
                      className="mtt-dialog__input"
                      type="text"
                      value={editState.typeName}
                      onChange={(e) =>
                        setEditState((prev) => ({ ...prev, typeName: e.target.value }))
                      }
                      placeholder={t('explorer.manageTableTypes.namePlaceholder')}
                      disabled={!isAddingNew || isBusy}
                      autoFocus={isAddingNew}
                    />
                  </div>
                </div>

                {/* Columns editor */}
                {loadingColumns ? (
                  <div className="mtt-dialog__columns-loading">
                    {t('common.loading', 'Loading…')}
                  </div>
                ) : (
                  <TableColumnsEditor
                    fields={editState.columns}
                    onFieldsChange={(cols) =>
                      setEditState((prev) => ({ ...prev, columns: cols }))
                    }
                    provider="sqlserver"
                    showPrimaryKey={false}
                    showDefaultValue={false}
                    showIdentity={false}
                    disabled={isBusy}
                  />
                )}

              </>
            )}
          </div>
        </div>
    </BaseDialog>
  )
}

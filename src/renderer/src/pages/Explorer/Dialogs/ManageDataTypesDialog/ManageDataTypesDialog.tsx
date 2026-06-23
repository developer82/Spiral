import { useState, useEffect, useCallback } from 'react'
import { Plus, Trash2, Tag } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { DataTypeDefinition, SaveDataTypeParams } from '../../../../../../preload/index.d'
import { SQL_SERVER_TYPES, SQL_SERVER_TYPE_CONFIGS } from '../../tableTypes'
import './ManageDataTypesDialog.css'
import BaseDialog from '../../../../components/BaseDialog/BaseDialog'
import ErrorBox from '../../../../components/ErrorBox/ErrorBox'
import Button from '../../../../components/Button/Button'

interface ManageDataTypesDialogProps {
  connectionId: string
  databaseName: string
  initialTypeName?: string
  openOnNew?: boolean
  onClose: () => void
  onSuccess: () => void
}

interface EditState {
  schemaName: string
  typeName: string
  baseType: string
  isMax: boolean
  length: string
  precision: string
  scale: string
  isNullable: boolean
}

const UNICODE_TYPES = new Set(['nchar', 'nvarchar'])

function makeDefaultEditState(defaultSchema: string): EditState {
  return {
    schemaName: defaultSchema,
    typeName: '',
    baseType: 'varchar',
    isMax: false,
    length: '50',
    precision: '18',
    scale: '0',
    isNullable: true
  }
}

function computeStorage(
  baseType: string,
  isMax: boolean,
  length: string,
  precision: string
): string {
  if (isMax) return 'Varies (up to 2 GB)'
  const len = parseInt(length, 10)
  const prec = parseInt(precision, 10)

  switch (baseType) {
    case 'tinyint': return '1 byte'
    case 'smallint': return '2 bytes'
    case 'int': return '4 bytes'
    case 'bigint': return '8 bytes'
    case 'bit': return '1 bit'
    case 'decimal':
    case 'numeric': {
      if (isNaN(prec)) return '5–17 bytes'
      if (prec <= 9) return '5 bytes'
      if (prec <= 19) return '9 bytes'
      if (prec <= 28) return '13 bytes'
      return '17 bytes'
    }
    case 'money': return '8 bytes'
    case 'smallmoney': return '4 bytes'
    case 'float': return '8 bytes'
    case 'real': return '4 bytes'
    case 'date': return '3 bytes'
    case 'time': return '3–5 bytes'
    case 'datetime': return '8 bytes'
    case 'datetime2': return '6–8 bytes'
    case 'smalldatetime': return '4 bytes'
    case 'datetimeoffset': return '8–10 bytes'
    case 'char':
    case 'binary': {
      const n = isNaN(len) ? 1 : len
      return `${n} byte${n !== 1 ? 's' : ''}`
    }
    case 'varchar':
    case 'varbinary': {
      const n = isNaN(len) ? 1 : len
      return `Up to ${n} + 2 bytes`
    }
    case 'nchar': {
      const n = isNaN(len) ? 1 : len
      return `${n * 2} bytes`
    }
    case 'nvarchar': {
      const n = isNaN(len) ? 1 : len
      return `Up to ${n * 2} + 2 bytes`
    }
    case 'text':
    case 'ntext':
    case 'image': return 'Varies (up to 2 GB)'
    case 'uniqueidentifier': return '16 bytes'
    case 'xml': return 'Varies'
    case 'rowversion':
    case 'timestamp': return '8 bytes'
    case 'sql_variant': return 'Up to 8,016 bytes'
    case 'hierarchyid': return 'Up to 892 bytes'
    case 'geography':
    case 'geometry': return 'Varies'
    default: return '—'
  }
}

/** Derive EditState from a DataTypeDefinition returned by the server. */
function stateFromDefinition(def: DataTypeDefinition): EditState {
  const config = SQL_SERVER_TYPE_CONFIGS[def.baseType]
  let isMax = false
  let length = ''
  let precision = ''
  let scale = ''

  if (config?.hasLength) {
    if (def.maxLength === -1) {
      isMax = true
    } else {
      // unicode types: max_length is in bytes (2 per char)
      const charLen = UNICODE_TYPES.has(def.baseType)
        ? def.maxLength / 2
        : def.maxLength
      length = String(charLen)
    }
  } else if (config?.hasPrecisionScale) {
    precision = String(def.precision)
    scale = String(def.scale)
  }

  return {
    schemaName: def.schemaName,
    typeName: def.typeName,
    baseType: def.baseType,
    isMax,
    length,
    precision,
    scale,
    isNullable: def.isNullable
  }
}

export default function ManageDataTypesDialog({
  connectionId,
  databaseName,
  initialTypeName,
  openOnNew,
  onClose,
  onSuccess
}: ManageDataTypesDialogProps): React.JSX.Element {
  const { t } = useTranslation()

  const [dataTypes, setDataTypes] = useState<DataTypeDefinition[]>([])
  const [selectedKey, setSelectedKey] = useState<string | null>(initialTypeName ?? null)
  const [isAddingNew, setIsAddingNew] = useState(openOnNew ?? false)
  const [schemas, setSchemas] = useState<string[]>(['dbo'])
  const [loadingDataTypes, setLoadingDataTypes] = useState(true)
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
          setEditState((prev) => ({ ...prev, schemaName: names.includes('dbo') ? 'dbo' : names[0] }))
        }
      }
    })()
  }, [connectionId, databaseName])

  const loadDataTypes = useCallback(async () => {
    setLoadingDataTypes(true)
    try {
      const result = await window.api.database.getDataTypes(connectionId, databaseName)
      if (result.status === 'ok') {
        setDataTypes(result.dataTypes)
      }
    } finally {
      setLoadingDataTypes(false)
    }
  }, [connectionId, databaseName])

  useEffect(() => {
    void loadDataTypes()
  }, [loadDataTypes])

  // After initial load, select the type specified by initialTypeName (if any)
  useEffect(() => {
    if (loadingDataTypes || !initialTypeName) return
    const found = dataTypes.find((dt) => `${dt.schemaName}.${dt.typeName}` === initialTypeName)
    if (found) selectDataType(found)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingDataTypes])

  function selectDataType(dt: DataTypeDefinition): void {
    setIsAddingNew(false)
    setSelectedKey(`${dt.schemaName}.${dt.typeName}`)
    setError(null)
    setEditState(stateFromDefinition(dt))
  }

  function startAddNew(): void {
    setSelectedKey(null)
    setIsAddingNew(true)
    setError(null)
    setEditState(makeDefaultEditState(schemas[0] ?? 'dbo'))
  }

  function updateEdit<K extends keyof EditState>(key: K, value: EditState[K]): void {
    setEditState((prev) => ({ ...prev, [key]: value }))
  }

  function handleBaseTypeChange(baseType: string): void {
    const config = SQL_SERVER_TYPE_CONFIGS[baseType]
    setEditState((prev) => ({
      ...prev,
      baseType,
      isMax: false,
      length: config?.hasLength ? '50' : '',
      precision: config?.hasPrecisionScale ? '18' : '',
      scale: config?.hasPrecisionScale ? '0' : ''
    }))
  }

  async function handleSave(): Promise<void> {
    if (!editState.typeName.trim()) {
      setError(t('explorer.manageDataTypes.validation.nameRequired'))
      return
    }
    if (!editState.schemaName) {
      setError(t('explorer.manageDataTypes.validation.schemaRequired'))
      return
    }

    setIsSaving(true)
    setError(null)

    try {
      const config = SQL_SERVER_TYPE_CONFIGS[editState.baseType]

      const params: SaveDataTypeParams = {
        schemaName: editState.schemaName,
        typeName: editState.typeName.trim(),
        baseType: editState.baseType,
        isMax: config?.hasLength ? editState.isMax : false,
        length: config?.hasLength && !editState.isMax && editState.length
          ? parseInt(editState.length, 10)
          : null,
        precision: config?.hasPrecisionScale && editState.precision
          ? parseInt(editState.precision, 10)
          : null,
        scale: config?.hasPrecisionScale && editState.scale !== ''
          ? parseInt(editState.scale, 10)
          : null,
        isNullable: editState.isNullable
      }

      const isEdit = !isAddingNew && selectedKey !== null
      const [origSchema, origName] = isEdit ? selectedKey!.split('.') : [undefined, undefined]

      const result = await window.api.database.saveDataType(
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

      await loadDataTypes()
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
      const [schemaName, typeName] = selectedKey.split('.')
      const result = await window.api.database.deleteDataType(
        connectionId,
        databaseName,
        schemaName,
        typeName
      )

      if (result.status === 'error') {
        setError(result.message)
        return
      }

      await loadDataTypes()
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

  const typeConfig = SQL_SERVER_TYPE_CONFIGS[editState.baseType]
  const hasSelection = !!selectedKey && !isAddingNew
  const showEditor = isAddingNew || !!selectedKey

  const dtFooter = showEditor ? (
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
              : t('explorer.manageDataTypes.deleteButton')}
          </Button>
        )}
        {isAddingNew && (
          <Button
              variant="primary"
            onClick={() => void handleSave()}
            disabled={isSaving || isDeleting}
          >
            {isSaving
              ? t('common.saving', 'Saving…')
              : t('explorer.manageDataTypes.saveButton')}
          </Button>
        )}
      </div>
    </>
  ) : undefined

  return (
    <BaseDialog
      title={t('explorer.manageDataTypes.dialogTitle')}
      icon={<Tag size={16} />}
      onClose={onClose}
      width="90vw"
      maxWidth="820px"
      height="90vh"
      maxHeight="600px"
      minWidth="640px"
      minHeight="420px"
      footerSpaceBetween
      footer={dtFooter}
    >
        <div className="data-type-dialog__body">
          {/* Left panel */}
          <div className="data-type-dialog__list-panel">
            <div className="data-type-dialog__list-header">
              {t('explorer.manageDataTypes.listHeader')}
            </div>
            <div className="data-type-dialog__list">
              {loadingDataTypes ? (
                <div className="data-type-dialog__empty-state">
                  {t('common.loading', 'Loading…')}
                </div>
              ) : dataTypes.length === 0 && !isAddingNew ? (
                <div className="data-type-dialog__empty-state data-type-dialog__empty-state--list">
                  {t('explorer.manageDataTypes.noDataTypes')}
                </div>
              ) : (
                <>
                  {dataTypes.map((dt) => {
                    const key = `${dt.schemaName}.${dt.typeName}`
                    return (
                      <div
                        key={key}
                        className={`data-type-dialog__list-item${
                          selectedKey === key && !isAddingNew
                            ? ' data-type-dialog__list-item--selected'
                            : ''
                        }`}
                        onClick={() => selectDataType(dt)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') selectDataType(dt)
                        }}
                      >
                        <Tag size={12} style={{ flexShrink: 0 }} />
                        {key}
                      </div>
                    )
                  })}
                  {isAddingNew && (
                    <div className="data-type-dialog__list-item data-type-dialog__list-item--selected">
                      <Tag size={12} style={{ flexShrink: 0 }} />
                      {editState.typeName
                        ? `${editState.schemaName}.${editState.typeName}`
                        : t('explorer.manageDataTypes.newDataType')}
                    </div>
                  )}
                </>
              )}
            </div>
            <button className="data-type-dialog__list-add" onClick={startAddNew}>
              <Plus size={13} />
              {t('explorer.manageDataTypes.addButton')}
            </button>
          </div>

          {/* Right panel: editor */}
          <div className="data-type-dialog__editor-panel">
            {!showEditor ? (
              <div className="data-type-dialog__empty-state">
                {t('explorer.manageDataTypes.selectOrAdd')}
              </div>
            ) : (
              <>
                <div className="data-type-dialog__editor-body">
                  {/* Schema + Name */}
                  <div className="data-type-dialog__row">
                    <div className="data-type-dialog__field">
                      <label className="data-type-dialog__label">
                        {t('explorer.manageDataTypes.schemaLabel')}
                      </label>
                      <select
                        className="data-type-dialog__select"
                        value={editState.schemaName}
                        onChange={(e) => updateEdit('schemaName', e.target.value)}
                        disabled={!isAddingNew}
                      >
                        {schemas.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                    <div className="data-type-dialog__field">
                      <label className="data-type-dialog__label">
                        {t('explorer.manageDataTypes.nameLabel')}
                      </label>
                      <input
                        className="data-type-dialog__input"
                        type="text"
                        value={editState.typeName}
                        onChange={(e) => updateEdit('typeName', e.target.value)}
                        placeholder={t('explorer.manageDataTypes.namePlaceholder')}
                        disabled={!isAddingNew}
                      />
                    </div>
                  </div>

                  {/* Data Type */}
                  <div className="data-type-dialog__field">
                    <label className="data-type-dialog__label">
                      {t('explorer.manageDataTypes.dataTypeLabel')}
                    </label>
                    <select
                      className="data-type-dialog__select"
                      value={editState.baseType}
                      onChange={(e) => handleBaseTypeChange(e.target.value)}
                      disabled={!isAddingNew}
                    >
                      {SQL_SERVER_TYPES.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>

                  {/* Length (conditional) */}
                  {typeConfig?.hasLength && (
                    <div className="data-type-dialog__field">
                      <label className="data-type-dialog__label">
                        {t('explorer.manageDataTypes.lengthLabel')}
                      </label>
                      <div className="data-type-dialog__length-group">
                        <input
                          className="data-type-dialog__input"
                          type="number"
                          min={1}
                          max={typeConfig.hasMaxOption ? 8000 : 8000}
                          value={editState.length}
                          onChange={(e) => updateEdit('length', e.target.value)}
                          disabled={editState.isMax || !isAddingNew}
                          placeholder="50"
                        />
                        {typeConfig.hasMaxOption && (
                          <label className="data-type-dialog__max-label">
                            <input
                              type="checkbox"
                              checked={editState.isMax}
                              onChange={(e) => updateEdit('isMax', e.target.checked)}
                              disabled={!isAddingNew}
                            />
                            MAX
                          </label>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Precision + Scale (conditional) */}
                  {typeConfig?.hasPrecisionScale && (
                    <div className="data-type-dialog__row">
                      <div className="data-type-dialog__field">
                        <label className="data-type-dialog__label">
                          {t('explorer.manageDataTypes.precisionLabel')}
                        </label>
                        <input
                          className="data-type-dialog__input"
                          type="number"
                          min={1}
                          max={38}
                          value={editState.precision}
                          onChange={(e) => updateEdit('precision', e.target.value)}
                          disabled={!isAddingNew}
                        />
                      </div>
                      <div className="data-type-dialog__field">
                        <label className="data-type-dialog__label">
                          {t('explorer.manageDataTypes.scaleLabel')}
                        </label>
                        <input
                          className="data-type-dialog__input"
                          type="number"
                          min={0}
                          max={38}
                          value={editState.scale}
                          onChange={(e) => updateEdit('scale', e.target.value)}
                          disabled={!isAddingNew}
                        />
                      </div>
                    </div>
                  )}

                  {/* Allow NULLs + Storage */}
                  <div className="data-type-dialog__row">
                    <div className="data-type-dialog__field">
                      <label className="data-type-dialog__label">
                        {t('explorer.manageDataTypes.nullableLabel')}
                      </label>
                      <label className="data-type-dialog__checkbox-field">
                        <input
                          type="checkbox"
                          checked={editState.isNullable}
                          onChange={(e) => updateEdit('isNullable', e.target.checked)}
                          disabled={!isAddingNew}
                        />
                        <span className="data-type-dialog__checkbox-label">
                          {t('explorer.manageDataTypes.allowNulls')}
                        </span>
                      </label>
                    </div>
                    <div className="data-type-dialog__field">
                      <label className="data-type-dialog__label">
                        {t('explorer.manageDataTypes.storageLabel')}
                      </label>
                      <div className="data-type-dialog__storage-value">
                        {computeStorage(editState.baseType, editState.isMax, editState.length, editState.precision)}
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

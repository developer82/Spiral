import { useState, useEffect, useCallback } from 'react'
import { Plus, Trash2, ListOrdered } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { IndexDefinition, IndexColumnEntry, SaveIndexParams } from '../../../../../../preload/index.d'
import './ManageIndexesDialog.css'
import BaseDialog from '../../../../components/BaseDialog/BaseDialog'
import ErrorBox from '../../../../components/ErrorBox/ErrorBox'
import Button from '../../../../components/Button/Button'

interface ManageIndexesDialogProps {
  connectionId: string
  databaseName: string
  schema: string
  tableName: string
  initialIndexName?: string
  openOnNew?: boolean
  onClose: () => void
  onSuccess: () => void
}

interface ColumnEntry {
  columnName: string
  isDescendingKey: boolean
  isIncludedColumn: boolean
}

interface EditState {
  name: string
  type: 'CLUSTERED' | 'NONCLUSTERED'
  isUnique: boolean
  columns: ColumnEntry[]
  filterExpression: string
  fillFactor: string
  description: string
}

function makeDefaultEditState(): EditState {
  return {
    name: '',
    type: 'NONCLUSTERED',
    isUnique: false,
    columns: [{ columnName: '', isDescendingKey: false, isIncludedColumn: false }],
    filterExpression: '',
    fillFactor: '',
    description: ''
  }
}

function indexToEditState(index: IndexDefinition): EditState {
  return {
    name: index.name,
    type: index.type === 'CLUSTERED' ? 'CLUSTERED' : 'NONCLUSTERED',
    isUnique: index.isUnique,
    columns: index.columns.length > 0
      ? index.columns.map((c) => ({
          columnName: c.columnName,
          isDescendingKey: c.isDescendingKey,
          isIncludedColumn: c.isIncludedColumn
        }))
      : [{ columnName: '', isDescendingKey: false, isIncludedColumn: false }],
    filterExpression: index.filterExpression ?? '',
    fillFactor: index.fillFactor !== undefined ? String(index.fillFactor) : '',
    description: index.description ?? ''
  }
}

export default function ManageIndexesDialog({
  connectionId,
  databaseName,
  schema,
  tableName,
  initialIndexName,
  openOnNew,
  onClose,
  onSuccess
}: ManageIndexesDialogProps): React.JSX.Element {
  const { t } = useTranslation()

  const [indexes, setIndexes] = useState<IndexDefinition[]>([])
  const [selectedIndexName, setSelectedIndexName] = useState<string | null>(
    initialIndexName ?? null
  )
  const [isAddingNew, setIsAddingNew] = useState(false)
  const [editState, setEditState] = useState<EditState>(makeDefaultEditState())
  const [tableColumns, setTableColumns] = useState<string[]>([])
  const [loadingIndexes, setLoadingIndexes] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)

  // Load table columns for the column dropdowns
  useEffect(() => {
    void (async () => {
      const result = await window.api.database.getTableSchema(
        connectionId,
        databaseName,
        schema,
        tableName
      )
      if (result.status === 'ok') {
        setTableColumns(result.columns.map((c) => c.name))
      }
    })()
  }, [connectionId, databaseName, schema, tableName])

  const loadIndexes = useCallback(async () => {
    setLoadingIndexes(true)
    const result = await window.api.database.getIndexes(
      connectionId,
      databaseName,
      schema,
      tableName
    )
    setLoadingIndexes(false)
    if (result.status === 'ok') {
      setIndexes(result.indexes)
    }
  }, [connectionId, databaseName, schema, tableName])

  useEffect(() => {
    void loadIndexes()
  }, [loadIndexes])

  // When indexes load, select initial or enter add-new mode
  useEffect(() => {
    if (loadingIndexes) return
    if (initialIndexName) {
      const found = indexes.find((i) => i.name === initialIndexName)
      if (found) selectIndex(found)
    } else if (openOnNew) {
      startAddNew()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingIndexes])

  function selectIndex(index: IndexDefinition): void {
    setIsAddingNew(false)
    setSelectedIndexName(index.name)
    setError(null)
    setStatusMessage(null)
    setEditState(indexToEditState(index))
  }

  function startAddNew(): void {
    setSelectedIndexName(null)
    setIsAddingNew(true)
    setError(null)
    setStatusMessage(null)
    setEditState(makeDefaultEditState())
  }

  function updateEdit<K extends keyof EditState>(key: K, value: EditState[K]): void {
    setEditState((prev) => ({ ...prev, [key]: value }))
  }

  function updateColumn(index: number, field: keyof ColumnEntry, value: boolean | string): void {
    setEditState((prev) => {
      const cols = prev.columns.map((c, i) =>
        i === index ? { ...c, [field]: value } : c
      )
      return { ...prev, columns: cols }
    })
  }

  function addColumn(): void {
    setEditState((prev) => ({
      ...prev,
      columns: [
        ...prev.columns,
        { columnName: '', isDescendingKey: false, isIncludedColumn: false }
      ]
    }))
  }

  function removeColumn(index: number): void {
    setEditState((prev) => ({
      ...prev,
      columns: prev.columns.filter((_, i) => i !== index)
    }))
  }

  /** True if the table already has a clustered index (excluding the currently selected one, so editing a clustered index is still allowed). */
  function hasExistingClusteredIndex(): boolean {
    return indexes.some(
      (ix) =>
        ix.type === 'CLUSTERED' &&
        !ix.isPrimaryKey &&
        ix.name !== selectedIndexName
    )
  }

  /** True if any primary-key index exists (PK is always clustered). */
  function hasPrimaryKeyIndex(): boolean {
    return indexes.some((ix) => ix.isPrimaryKey)
  }

  const clusterDisabled = hasExistingClusteredIndex() || hasPrimaryKeyIndex()

  async function handleSave(): Promise<void> {
    if (!editState.name.trim()) {
      setError(t('explorer.manageIndexes.validation.nameRequired'))
      return
    }
    const keyColumns = editState.columns.filter((c) => !c.isIncludedColumn && c.columnName.trim())
    if (keyColumns.length === 0) {
      setError(t('explorer.manageIndexes.validation.columnsRequired'))
      return
    }

    setIsSaving(true)
    setError(null)
    setStatusMessage(null)

    const fillFactor = parseInt(editState.fillFactor, 10)
    const params: SaveIndexParams = {
      name: editState.name.trim(),
      schemaName: schema,
      tableName,
      type: editState.type,
      isUnique: editState.isUnique,
      columns: editState.columns
        .filter((c) => c.columnName.trim())
        .map((c, idx) => ({
          columnName: c.columnName,
          keyOrdinal: idx,
          isDescendingKey: c.isDescendingKey,
          isIncludedColumn: c.isIncludedColumn
        } satisfies IndexColumnEntry)),
      filterExpression: editState.filterExpression.trim() || undefined,
      fillFactor: !isNaN(fillFactor) && fillFactor > 0 ? fillFactor : undefined,
      description: editState.description.trim() || undefined
    }

    const originalName = isAddingNew ? undefined : (selectedIndexName ?? undefined)
    const result = await window.api.database.saveIndex(connectionId, databaseName, params, originalName)
    setIsSaving(false)

    if (result.status === 'error') {
      setError(result.message)
      return
    }

    await loadIndexes()
    setSelectedIndexName(params.name)
    setIsAddingNew(false)
    onSuccess()
  }

  async function handleDelete(): Promise<void> {
    if (!selectedIndexName) return
    setIsDeleting(true)
    setError(null)
    setStatusMessage(null)

    const result = await window.api.database.deleteIndex(
      connectionId,
      databaseName,
      selectedIndexName,
      schema,
      tableName
    )
    setIsDeleting(false)

    if (result.status === 'error') {
      setError(result.message)
      return
    }

    await loadIndexes()
    setSelectedIndexName(null)
    setIsAddingNew(false)
    setEditState(makeDefaultEditState())
    onSuccess()
  }

  async function handleRebuild(): Promise<void> {
    if (!selectedIndexName) return
    setError(null)
    setStatusMessage(t('explorer.manageIndexes.rebuilding'))

    const result = await window.api.database.rebuildIndex(
      connectionId,
      databaseName,
      selectedIndexName,
      schema,
      tableName
    )

    if (result.status === 'error') {
      setStatusMessage(null)
      setError(result.message)
    } else {
      setStatusMessage(t('explorer.manageIndexes.rebuildSuccess'))
    }
  }

  async function handleReorganize(): Promise<void> {
    if (!selectedIndexName) return
    setError(null)
    setStatusMessage(t('explorer.manageIndexes.reorganizing'))

    const result = await window.api.database.reorganizeIndex(
      connectionId,
      databaseName,
      selectedIndexName,
      schema,
      tableName
    )

    if (result.status === 'error') {
      setStatusMessage(null)
      setError(result.message)
    } else {
      setStatusMessage(t('explorer.manageIndexes.reorganizeSuccess'))
    }
  }

  async function handleDisable(): Promise<void> {
    if (!selectedIndexName) return
    setError(null)
    setStatusMessage(t('explorer.manageIndexes.disabling'))

    const result = await window.api.database.disableIndex(
      connectionId,
      databaseName,
      selectedIndexName,
      schema,
      tableName
    )

    if (result.status === 'error') {
      setStatusMessage(null)
      setError(result.message)
    } else {
      setStatusMessage(t('explorer.manageIndexes.disableSuccess'))
      await loadIndexes()
      onSuccess()
    }
  }

  const selectedIndex = indexes.find((i) => i.name === selectedIndexName) ?? null
  const isPrimaryKey = selectedIndex?.isPrimaryKey ?? false
  const hasSelection = !!selectedIndexName && !isAddingNew
  const showEditor = isAddingNew || !!selectedIndexName
  const isReadOnly = isPrimaryKey && hasSelection

  const footerLeft = error ? (
    <ErrorBox error={error} />
  ) : statusMessage ? (
    <span className="index-dialog__status">{statusMessage}</span>
  ) : (
    <span />
  )

  const footerRight = (
    <div className="dialog__footer-right">
      {hasSelection && !isPrimaryKey && (
        <>
          <Button
              variant="ghost"
            onClick={() => void handleRebuild()}
            disabled={isSaving || isDeleting}
          >
            {t('explorer.manageIndexes.rebuild')}
          </Button>
          <Button
              variant="ghost"
            onClick={() => void handleReorganize()}
            disabled={isSaving || isDeleting}
          >
            {t('explorer.manageIndexes.reorganize')}
          </Button>
          <Button
              variant="ghost"
            onClick={() => void handleDisable()}
            disabled={isSaving || isDeleting}
          >
            {t('explorer.manageIndexes.disable')}
          </Button>
        </>
      )}
      {hasSelection && !isPrimaryKey && (
        <Button
              variant="danger"
          onClick={() => void handleDelete()}
          disabled={isDeleting || isSaving}
        >
          <Trash2 size={13} />
          {isDeleting
            ? t('common.deleting', 'Deleting…')
            : t('explorer.manageIndexes.deleteButton')}
        </Button>
      )}
      {!isReadOnly && (
        <Button
              variant="primary"
          onClick={() => void handleSave()}
          disabled={isSaving || isDeleting}
        >
          {isSaving
            ? t('common.saving', 'Saving…')
            : t('explorer.manageIndexes.saveButton')}
        </Button>
      )}
    </div>
  )

  return (
    <BaseDialog
      title={t('explorer.manageIndexes.dialogTitle', { table: `${schema}.${tableName}` })}
      icon={<ListOrdered size={16} />}
      onClose={onClose}
      width="90vw"
      maxWidth="980px"
      height="90vh"
      maxHeight="740px"
      minWidth="720px"
      minHeight="480px"
      footerSpaceBetween
      footer={showEditor ? <>{footerLeft}{footerRight}</> : undefined}
    >
        <div className="index-dialog__body">
          {/* Left panel */}
          <div className="index-dialog__list-panel">
            <div className="index-dialog__list-header">
              {t('explorer.manageIndexes.listHeader')}
            </div>
            <div className="index-dialog__list">
              {loadingIndexes ? (
                <div className="index-dialog__empty-state">
                  {t('common.loading', 'Loading…')}
                </div>
              ) : indexes.length === 0 && !isAddingNew ? (
                <div className="index-dialog__empty-state index-dialog__empty-state--list">
                  {t('explorer.manageIndexes.noIndexes')}
                </div>
              ) : (
                <>
                  {indexes.map((ix) => (
                    <div
                      key={ix.name}
                      className={[
                        'index-dialog__list-item',
                        selectedIndexName === ix.name && !isAddingNew
                          ? 'index-dialog__list-item--selected'
                          : '',
                        ix.isDisabled ? 'index-dialog__list-item--disabled' : ''
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onClick={() => selectIndex(ix)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') selectIndex(ix)
                      }}
                    >
                      <ListOrdered size={12} style={{ flexShrink: 0 }} />
                      {ix.name}
                    </div>
                  ))}
                  {isAddingNew && (
                    <div className="index-dialog__list-item index-dialog__list-item--selected">
                      <ListOrdered size={12} style={{ flexShrink: 0 }} />
                      {editState.name || t('explorer.manageIndexes.newIndex')}
                    </div>
                  )}
                </>
              )}
            </div>
            <button className="index-dialog__list-add" onClick={startAddNew}>
              <Plus size={13} />
              {t('explorer.manageIndexes.addButton')}
            </button>
          </div>

          {/* Right panel: editor */}
          <div className="index-dialog__editor-panel">
            {!showEditor ? (
              <div className="index-dialog__empty-state">
                {t('explorer.manageIndexes.selectOrAdd')}
              </div>
            ) : (
              <>
                <div className="index-dialog__editor-body">
                  {/* Primary key notice */}
                  {isReadOnly && (
                    <div className="index-dialog__note">
                      {t('explorer.manageIndexes.primaryKeyNote')}
                    </div>
                  )}

                  {/* Name */}
                  <div className="index-dialog__field">
                    <label className="index-dialog__label">
                      {t('explorer.manageIndexes.nameLabel')}
                    </label>
                    <input
                      className="index-dialog__input"
                      type="text"
                      value={editState.name}
                      onChange={(e) => updateEdit('name', e.target.value)}
                      placeholder={t('explorer.manageIndexes.namePlaceholder')}
                      disabled={isReadOnly}
                    />
                  </div>

                  {/* Type */}
                  <div className="index-dialog__field">
                    <label className="index-dialog__label">
                      {t('explorer.manageIndexes.typeLabel')}
                    </label>
                    <div className="index-dialog__type-row">
                      <label
                        className={`index-dialog__radio-label${
                          clusterDisabled && editState.type !== 'CLUSTERED'
                            ? ' index-dialog__radio-label--disabled'
                            : ''
                        }`}
                      >
                        <input
                          type="radio"
                          name="index-type"
                          value="CLUSTERED"
                          checked={editState.type === 'CLUSTERED'}
                          disabled={
                            isReadOnly ||
                            (clusterDisabled && editState.type !== 'CLUSTERED')
                          }
                          onChange={() => updateEdit('type', 'CLUSTERED')}
                        />
                        {clusterDisabled && editState.type !== 'CLUSTERED'
                          ? t('explorer.manageIndexes.typeClusteredDisabled')
                          : t('explorer.manageIndexes.typeClustered')}
                      </label>
                      <label className="index-dialog__radio-label">
                        <input
                          type="radio"
                          name="index-type"
                          value="NONCLUSTERED"
                          checked={editState.type === 'NONCLUSTERED'}
                          disabled={isReadOnly}
                          onChange={() => updateEdit('type', 'NONCLUSTERED')}
                        />
                        {t('explorer.manageIndexes.typeNonClustered')}
                      </label>
                    </div>
                  </div>

                  {/* Unique */}
                  <div className="index-dialog__field">
                    <label className="index-dialog__checkbox-field">
                      <input
                        type="checkbox"
                        checked={editState.isUnique}
                        onChange={(e) => updateEdit('isUnique', e.target.checked)}
                        disabled={isReadOnly}
                      />
                      <span className="index-dialog__checkbox-label">
                        {t('explorer.manageIndexes.uniqueLabel')}
                      </span>
                    </label>
                  </div>

                  {/* Columns table */}
                  <div className="index-dialog__field">
                    <label className="index-dialog__label">
                      {t('explorer.manageIndexes.columnsLabel')}
                    </label>
                    <div className="index-dialog__columns-table">
                      <div className="index-dialog__columns-header">
                        <span>{t('explorer.manageIndexes.columnHeader')}</span>
                        <span>{t('explorer.manageIndexes.sortHeader')}</span>
                        <span>{t('explorer.manageIndexes.includeHeader')}</span>
                        <span />
                      </div>
                      {editState.columns.map((col, idx) => (
                        <div key={idx} className="index-dialog__column-row">
                          <select
                            className="index-dialog__select"
                            value={col.columnName}
                            onChange={(e) => updateColumn(idx, 'columnName', e.target.value)}
                            disabled={isReadOnly}
                          >
                            <option value="">—</option>
                            {tableColumns.map((colName) => (
                              <option key={colName} value={colName}>
                                {colName}
                              </option>
                            ))}
                          </select>
                          <button
                            className="index-dialog__sort-toggle"
                            type="button"
                            onClick={() =>
                              updateColumn(idx, 'isDescendingKey', !col.isDescendingKey)
                            }
                            disabled={isReadOnly || col.isIncludedColumn}
                            title={
                              col.isDescendingKey
                                ? t('explorer.manageIndexes.descending')
                                : t('explorer.manageIndexes.ascending')
                            }
                          >
                            {col.isDescendingKey
                              ? t('explorer.manageIndexes.descending')
                              : t('explorer.manageIndexes.ascending')}
                          </button>
                          <div className="index-dialog__include-cell">
                            <input
                              type="checkbox"
                              checked={col.isIncludedColumn}
                              onChange={(e) =>
                                updateColumn(idx, 'isIncludedColumn', e.target.checked)
                              }
                              disabled={isReadOnly}
                              title={t('explorer.manageIndexes.includeHeader')}
                            />
                          </div>
                          <button
                            className="index-dialog__remove-btn"
                            type="button"
                            onClick={() => removeColumn(idx)}
                            disabled={isReadOnly || editState.columns.length <= 1}
                            title="Remove"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      ))}
                      {!isReadOnly && (
                        <button
                          className="index-dialog__add-column-btn"
                          type="button"
                          onClick={addColumn}
                        >
                          <Plus size={12} />
                          {t('explorer.manageIndexes.addColumn')}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Filter Expression */}
                  <div className="index-dialog__field">
                    <label className="index-dialog__label">
                      {t('explorer.manageIndexes.filterLabel')}
                    </label>
                    <input
                      className="index-dialog__input"
                      type="text"
                      value={editState.filterExpression}
                      onChange={(e) => updateEdit('filterExpression', e.target.value)}
                      placeholder={t('explorer.manageIndexes.filterPlaceholder')}
                      disabled={isReadOnly}
                    />
                  </div>

                  {/* Fill Factor */}
                  <div className="index-dialog__field">
                    <label className="index-dialog__label">
                      {t('explorer.manageIndexes.fillFactorLabel')}
                    </label>
                    <input
                      className="index-dialog__input index-dialog__input--number"
                      type="number"
                      min={0}
                      max={100}
                      value={editState.fillFactor}
                      onChange={(e) => updateEdit('fillFactor', e.target.value)}
                      placeholder={t('explorer.manageIndexes.fillFactorPlaceholder')}
                      disabled={isReadOnly}
                    />
                  </div>

                  {/* Description */}
                  <div className="index-dialog__field">
                    <label className="index-dialog__label">
                      {t('explorer.manageIndexes.descriptionLabel')}
                    </label>
                    <input
                      className="index-dialog__input"
                      type="text"
                      value={editState.description}
                      onChange={(e) => updateEdit('description', e.target.value)}
                      placeholder={t('explorer.manageIndexes.descriptionPlaceholder')}
                      disabled={isReadOnly}
                    />
                  </div>
                </div>

              </>
            )}
          </div>
        </div>
    </BaseDialog>
  )
}

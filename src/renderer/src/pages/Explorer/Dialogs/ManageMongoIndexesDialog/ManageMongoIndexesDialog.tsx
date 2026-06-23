import { useState, useEffect, useCallback } from 'react'
import { Plus, Trash2, ListOrdered } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { MongoIndexDefinition, MongoIndexField, SaveMongoIndexParams } from '../../../../../../preload/index.d'
import './ManageMongoIndexesDialog.css'
import BaseDialog from '../../../../components/BaseDialog/BaseDialog'
import ErrorBox from '../../../../components/ErrorBox/ErrorBox'
import Button from '../../../../components/Button/Button'

interface ManageMongoIndexesDialogProps {
  connectionId: string
  databaseName: string
  collectionName: string
  initialIndexName?: string
  openOnNew?: boolean
  onClose: () => void
  onSuccess: () => void
}

interface FieldEntry {
  fieldName: string
  indexType: 1 | -1 | '2dsphere' | 'text'
}

interface EditState {
  name: string
  fields: FieldEntry[]
  unique: boolean
  sparse: boolean
  expireAfterSeconds: string
  partialFilterExpression: string
  wildcardProjection: string
  collation: string
}

function makeDefaultEditState(): EditState {
  return {
    name: '',
    fields: [{ fieldName: '', indexType: 1 }],
    unique: false,
    sparse: false,
    expireAfterSeconds: '',
    partialFilterExpression: '',
    wildcardProjection: '',
    collation: ''
  }
}

function indexToEditState(index: MongoIndexDefinition): EditState {
  return {
    name: index.name === '_id_' ? '' : index.name,
    fields:
      index.fields.length > 0
        ? index.fields.map((f) => ({ fieldName: f.fieldName, indexType: f.indexType }))
        : [{ fieldName: '', indexType: 1 as const }],
    unique: index.unique ?? false,
    sparse: index.sparse ?? false,
    expireAfterSeconds:
      index.expireAfterSeconds !== undefined ? String(index.expireAfterSeconds) : '',
    partialFilterExpression:
      index.partialFilterExpression !== undefined
        ? JSON.stringify(index.partialFilterExpression, null, 2)
        : '',
    wildcardProjection:
      index.wildcardProjection !== undefined
        ? JSON.stringify(index.wildcardProjection, null, 2)
        : '',
    collation:
      index.collation !== undefined ? JSON.stringify(index.collation, null, 2) : ''
  }
}

function tryParseJson(value: string): { ok: true } | { ok: false; field: string } {
  try {
    JSON.parse(value)
    return { ok: true }
  } catch {
    return { ok: false, field: value }
  }
}

export default function ManageMongoIndexesDialog({
  connectionId,
  databaseName,
  collectionName,
  initialIndexName,
  openOnNew,
  onClose,
  onSuccess
}: ManageMongoIndexesDialogProps): React.JSX.Element {
  const { t } = useTranslation()

  const [indexes, setIndexes] = useState<MongoIndexDefinition[]>([])
  const [selectedIndexName, setSelectedIndexName] = useState<string | null>(
    initialIndexName ?? null
  )
  const [isAddingNew, setIsAddingNew] = useState(false)
  const [editState, setEditState] = useState<EditState>(makeDefaultEditState())
  const [collectionFields, setCollectionFields] = useState<string[]>([])
  const [loadingIndexes, setLoadingIndexes] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const datalistId = `mongo-fields-${collectionName}`

  useEffect(() => {
    void (async () => {
      const result = await window.api.database.getCollectionFields(
        connectionId,
        databaseName,
        collectionName
      )
      if (result.status === 'ok') {
        setCollectionFields(result.fields)
      }
    })()
  }, [connectionId, databaseName, collectionName])

  const loadIndexes = useCallback(async () => {
    setLoadingIndexes(true)
    const result = await window.api.database.getMongoIndexes(
      connectionId,
      databaseName,
      collectionName
    )
    setLoadingIndexes(false)
    if (result.status === 'ok') {
      setIndexes(result.indexes)
    }
  }, [connectionId, databaseName, collectionName])

  useEffect(() => {
    void loadIndexes()
  }, [loadIndexes])

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

  function selectIndex(index: MongoIndexDefinition): void {
    setIsAddingNew(false)
    setSelectedIndexName(index.name)
    setError(null)
    setEditState(indexToEditState(index))
  }

  function startAddNew(): void {
    setSelectedIndexName(null)
    setIsAddingNew(true)
    setError(null)
    setEditState(makeDefaultEditState())
  }

  function updateEdit<K extends keyof EditState>(key: K, value: EditState[K]): void {
    setEditState((prev) => ({ ...prev, [key]: value }))
  }

  function updateField(index: number, key: keyof FieldEntry, value: string | number): void {
    setEditState((prev) => {
      const fields = prev.fields.map((f, i) => (i === index ? { ...f, [key]: value } : f))
      return { ...prev, fields }
    })
  }

  function addField(): void {
    setEditState((prev) => ({
      ...prev,
      fields: [...prev.fields, { fieldName: '', indexType: 1 as const }]
    }))
  }

  function removeField(index: number): void {
    setEditState((prev) => ({
      ...prev,
      fields: prev.fields.filter((_, i) => i !== index)
    }))
  }

  async function handleSave(): Promise<void> {
    const filledFields = editState.fields.filter((f) => f.fieldName.trim())
    if (filledFields.length === 0) {
      setError(t('explorer.manageMongoIndexes.validation.fieldsRequired'))
      return
    }

    if (editState.partialFilterExpression.trim()) {
      const check = tryParseJson(editState.partialFilterExpression.trim())
      if (!check.ok) {
        setError(
          t('explorer.manageMongoIndexes.validation.invalidJson', {
            field: t('explorer.manageMongoIndexes.partialFilterLabel')
          })
        )
        return
      }
    }
    if (editState.wildcardProjection.trim()) {
      const check = tryParseJson(editState.wildcardProjection.trim())
      if (!check.ok) {
        setError(
          t('explorer.manageMongoIndexes.validation.invalidJson', {
            field: t('explorer.manageMongoIndexes.wildcardProjectionLabel')
          })
        )
        return
      }
    }
    if (editState.collation.trim()) {
      const check = tryParseJson(editState.collation.trim())
      if (!check.ok) {
        setError(
          t('explorer.manageMongoIndexes.validation.invalidJson', {
            field: t('explorer.manageMongoIndexes.collationLabel')
          })
        )
        return
      }
    }

    const ttl =
      editState.expireAfterSeconds.trim() !== ''
        ? parseInt(editState.expireAfterSeconds.trim(), 10)
        : undefined

    const params: SaveMongoIndexParams = {
      collectionName,
      name: editState.name.trim() || undefined,
      fields: filledFields.map((f) => ({
        fieldName: f.fieldName.trim(),
        indexType: f.indexType
      })) as MongoIndexField[],
      unique: editState.unique || undefined,
      sparse: editState.sparse || undefined,
      expireAfterSeconds: ttl !== undefined && !isNaN(ttl) ? ttl : undefined,
      partialFilterExpression: editState.partialFilterExpression.trim() || undefined,
      wildcardProjection: editState.wildcardProjection.trim() || undefined,
      collation: editState.collation.trim() || undefined
    }

    const originalName = isAddingNew ? undefined : (selectedIndexName ?? undefined)

    setIsSaving(true)
    setError(null)
    const result = await window.api.database.saveMongoIndex(
      connectionId,
      databaseName,
      collectionName,
      params,
      originalName
    )
    setIsSaving(false)

    if (result.status === 'error') {
      setError(result.message)
      return
    }

    await loadIndexes()
    setIsAddingNew(false)
    if (editState.name.trim()) {
      setSelectedIndexName(editState.name.trim())
    }
    onSuccess()
  }

  async function handleDelete(): Promise<void> {
    if (!selectedIndexName) return
    setIsDeleting(true)
    setError(null)

    const result = await window.api.database.dropMongoIndex(
      connectionId,
      databaseName,
      collectionName,
      selectedIndexName
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

  const selectedIndex = indexes.find((i) => i.name === selectedIndexName) ?? null
  const isIdIndex = selectedIndex?.isIdIndex ?? false
  const hasSelection = !!selectedIndexName && !isAddingNew
  const showEditor = isAddingNew || !!selectedIndexName
  const isReadOnly = isIdIndex && hasSelection

  const footerLeft = error ? (
    <ErrorBox error={error} />
  ) : (
    <span />
  )

  const footerRight = (
    <div className="dialog__footer-right">
      {hasSelection && !isIdIndex && (
        <Button
              variant="danger"
          onClick={() => void handleDelete()}
          disabled={isDeleting || isSaving}
        >
          <Trash2 size={13} />
          {isDeleting
            ? t('common.deleting', 'Deleting…')
            : t('explorer.manageMongoIndexes.deleteButton')}
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
            : t('explorer.manageMongoIndexes.saveButton')}
        </Button>
      )}
    </div>
  )

  return (
    <BaseDialog
      title={t('explorer.manageMongoIndexes.dialogTitle', { collection: collectionName })}
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
      <datalist id={datalistId}>
        {collectionFields.map((f) => (
          <option key={f} value={f} />
        ))}
      </datalist>

      <div className="mongo-index-dialog__body">
        {/* Left panel */}
        <div className="index-dialog__list-panel">
          <div className="index-dialog__list-header">
            {t('explorer.manageMongoIndexes.listHeader')}
          </div>
          <div className="index-dialog__list">
            {loadingIndexes ? (
              <div className="index-dialog__empty-state">
                {t('common.loading', 'Loading…')}
              </div>
            ) : indexes.length === 0 && !isAddingNew ? (
              <div className="index-dialog__empty-state index-dialog__empty-state--list">
                {t('explorer.manageMongoIndexes.noIndexes')}
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
                      ix.isIdIndex ? 'index-dialog__list-item--disabled' : ''
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => !ix.isIdIndex && selectIndex(ix)}
                    role={ix.isIdIndex ? undefined : 'button'}
                    tabIndex={ix.isIdIndex ? undefined : 0}
                    onKeyDown={(e) => {
                      if (!ix.isIdIndex && (e.key === 'Enter' || e.key === ' ')) selectIndex(ix)
                    }}
                  >
                    <ListOrdered size={12} style={{ flexShrink: 0 }} />
                    <span className="mongo-index-dialog__list-name">
                      {ix.name}
                      {ix.isIdIndex && (
                        <span className="mongo-index-dialog__list-default"> (default)</span>
                      )}
                    </span>
                  </div>
                ))}
                {isAddingNew && (
                  <div className="index-dialog__list-item index-dialog__list-item--selected">
                    <ListOrdered size={12} style={{ flexShrink: 0 }} />
                    {editState.name || t('explorer.manageMongoIndexes.newIndex')}
                  </div>
                )}
              </>
            )}
          </div>
          <button className="index-dialog__list-add" onClick={startAddNew}>
            <Plus size={13} />
            {t('explorer.manageMongoIndexes.addButton')}
          </button>
        </div>

        {/* Right panel: editor */}
        <div className="index-dialog__editor-panel">
          {!showEditor ? (
            <div className="index-dialog__empty-state">
              {t('explorer.manageMongoIndexes.selectOrAdd')}
            </div>
          ) : (
            <div className="index-dialog__editor-body">
              {/* _id notice */}
              {isReadOnly && (
                <div className="index-dialog__note">
                  {t('explorer.manageMongoIndexes.idIndexNote')}
                </div>
              )}

              {/* Name */}
              <div className="index-dialog__field">
                <label className="index-dialog__label">
                  {t('explorer.manageMongoIndexes.nameLabel')}
                </label>
                <input
                  className="index-dialog__input"
                  type="text"
                  value={editState.name}
                  onChange={(e) => updateEdit('name', e.target.value)}
                  placeholder={t('explorer.manageMongoIndexes.namePlaceholder')}
                  disabled={isReadOnly}
                />
              </div>

              {/* Fields table */}
              <div className="index-dialog__field">
                <label className="index-dialog__label">
                  {t('explorer.manageMongoIndexes.fieldsLabel')}
                </label>
                <div className="mongo-index-dialog__fields-table">
                  <div className="mongo-index-dialog__fields-header">
                    <span>{t('explorer.manageMongoIndexes.fieldNameHeader')}</span>
                    <span>{t('explorer.manageMongoIndexes.fieldTypeHeader')}</span>
                    <span />
                  </div>
                  {editState.fields.map((field, idx) => (
                    <div key={idx} className="mongo-index-dialog__field-row">
                      <input
                        className="index-dialog__input"
                        type="text"
                        list={datalistId}
                        value={field.fieldName}
                        onChange={(e) => updateField(idx, 'fieldName', e.target.value)}
                        placeholder="field name"
                        disabled={isReadOnly}
                      />
                      <select
                        className="index-dialog__select"
                        value={String(field.indexType)}
                        onChange={(e) => {
                          const raw = e.target.value
                          const val: MongoIndexField['indexType'] =
                            raw === '1' ? 1 : raw === '-1' ? -1 : (raw as '2dsphere' | 'text')
                          updateField(idx, 'indexType', val)
                        }}
                        disabled={isReadOnly}
                      >
                        <option value="1">Ascending (1)</option>
                        <option value="-1">Descending (-1)</option>
                        <option value="2dsphere">2dsphere</option>
                        <option value="text">Text</option>
                      </select>
                      <button
                        className="index-dialog__remove-btn"
                        type="button"
                        onClick={() => removeField(idx)}
                        disabled={isReadOnly || editState.fields.length <= 1}
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
                      onClick={addField}
                    >
                      <Plus size={12} />
                      {t('explorer.manageMongoIndexes.addField')}
                    </button>
                  )}
                </div>
              </div>

              {/* Options */}
              <div className="index-dialog__field">
                <label className="index-dialog__checkbox-field">
                  <input
                    type="checkbox"
                    checked={editState.unique}
                    onChange={(e) => updateEdit('unique', e.target.checked)}
                    disabled={isReadOnly}
                  />
                  <span className="index-dialog__checkbox-label">
                    {t('explorer.manageMongoIndexes.uniqueLabel')}
                  </span>
                </label>
              </div>

              <div className="index-dialog__field">
                <label className="index-dialog__checkbox-field">
                  <input
                    type="checkbox"
                    checked={editState.sparse}
                    onChange={(e) => updateEdit('sparse', e.target.checked)}
                    disabled={isReadOnly}
                  />
                  <span className="index-dialog__checkbox-label">
                    {t('explorer.manageMongoIndexes.sparseLabel')}
                  </span>
                </label>
              </div>

              {/* TTL */}
              <div className="index-dialog__field">
                <label className="index-dialog__label">
                  {t('explorer.manageMongoIndexes.ttlLabel')}
                </label>
                <input
                  className="index-dialog__input index-dialog__input--number"
                  type="number"
                  min={0}
                  value={editState.expireAfterSeconds}
                  onChange={(e) => updateEdit('expireAfterSeconds', e.target.value)}
                  placeholder={t('explorer.manageMongoIndexes.ttlPlaceholder')}
                  disabled={isReadOnly}
                />
              </div>

              {/* Partial Filter Expression */}
              <div className="index-dialog__field">
                <label className="index-dialog__label">
                  {t('explorer.manageMongoIndexes.partialFilterLabel')}
                </label>
                <textarea
                  className="mongo-index-dialog__textarea"
                  value={editState.partialFilterExpression}
                  onChange={(e) => updateEdit('partialFilterExpression', e.target.value)}
                  placeholder={t('explorer.manageMongoIndexes.partialFilterPlaceholder')}
                  disabled={isReadOnly}
                  spellCheck={false}
                />
              </div>

              {/* Wildcard Projection */}
              <div className="index-dialog__field">
                <label className="index-dialog__label">
                  {t('explorer.manageMongoIndexes.wildcardProjectionLabel')}
                </label>
                <textarea
                  className="mongo-index-dialog__textarea"
                  value={editState.wildcardProjection}
                  onChange={(e) => updateEdit('wildcardProjection', e.target.value)}
                  placeholder={t('explorer.manageMongoIndexes.wildcardProjectionPlaceholder')}
                  disabled={isReadOnly}
                  spellCheck={false}
                />
              </div>

              {/* Collation */}
              <div className="index-dialog__field">
                <label className="index-dialog__label">
                  {t('explorer.manageMongoIndexes.collationLabel')}
                </label>
                <textarea
                  className="mongo-index-dialog__textarea"
                  value={editState.collation}
                  onChange={(e) => updateEdit('collation', e.target.value)}
                  placeholder={t('explorer.manageMongoIndexes.collationPlaceholder')}
                  disabled={isReadOnly}
                  spellCheck={false}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </BaseDialog>
  )
}

import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ConnectionProvider } from '../connections.types'
import { getProviderTypes, getTypeConfig } from '../tableTypes'
import './TableColumnsEditor.css'

// ── Types ──────────────────────────────────────────────────────────

export interface TableField {
  id: string
  name: string
  type: string
  length: number | 'MAX' | null
  precision: number | null
  scale: number | null
  isNullable: boolean
  defaultValue: string
  isPrimaryKey: boolean
  isIdentity: boolean
  identitySeed: number
  identityIncrement: number
}

export interface TableColumnsEditorProps {
  fields: TableField[]
  onFieldsChange: (fields: TableField[]) => void
  provider: ConnectionProvider
  /** Show the PK column and Primary Key property. Default: true */
  showPrimaryKey?: boolean
  /** Show the Default Value property. Default: true */
  showDefaultValue?: boolean
  /** Show the Identity property. Default: true */
  showIdentity?: boolean
  disabled?: boolean
}

// ── Helpers ────────────────────────────────────────────────────────

let fieldCounter = 0
export function newFieldId(): string {
  fieldCounter += 1
  return `field-${Date.now()}-${fieldCounter}`
}

export function makeDefaultField(provider: ConnectionProvider): TableField {
  const defaultType = provider === 'sqlserver' ? 'int' : 'int'
  return {
    id: newFieldId(),
    name: '',
    type: defaultType,
    length: null,
    precision: null,
    scale: null,
    isNullable: true,
    defaultValue: '',
    isPrimaryKey: false,
    isIdentity: false,
    identitySeed: 1,
    identityIncrement: 1
  }
}

// ── Component ──────────────────────────────────────────────────────

export default function TableColumnsEditor({
  fields,
  onFieldsChange,
  provider,
  showPrimaryKey = true,
  showDefaultValue = true,
  showIdentity = true,
  disabled = false
}: TableColumnsEditorProps): React.JSX.Element {
  const { t } = useTranslation()
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null)

  const providerTypes = getProviderTypes(provider)
  const selectedField = fields.find((f) => f.id === selectedFieldId) ?? null
  const typeConfig = selectedField ? getTypeConfig(provider, selectedField.type) : null

  function addColumn(): void {
    const field = makeDefaultField(provider)
    onFieldsChange([...fields, field])
    setSelectedFieldId(field.id)
  }

  function deleteColumn(id: string): void {
    const next = fields.filter((f) => f.id !== id)
    if (selectedFieldId === id) {
      setSelectedFieldId(next.length > 0 ? next[next.length - 1].id : null)
    }
    onFieldsChange(next)
  }

  function updateField<K extends keyof TableField>(id: string, key: K, value: TableField[K]): void {
    onFieldsChange(fields.map((f) => (f.id === id ? { ...f, [key]: value } : f)))
  }

  function handleTypeChange(id: string, newType: string): void {
    const cfg = getTypeConfig(provider, newType)
    onFieldsChange(
      fields.map((f) => {
        if (f.id !== id) return f
        return {
          ...f,
          type: newType,
          length: cfg.hasLength ? (f.length ?? 255) : null,
          precision: cfg.hasPrecisionScale ? (f.precision ?? 18) : null,
          scale: cfg.hasPrecisionScale ? (f.scale ?? 0) : null,
          isIdentity: cfg.hasIdentity ? f.isIdentity : false
        }
      })
    )
  }

  return (
    <div className="tce">
      {/* Columns panel */}
      <div className="tce__columns-panel">
        <div className="tce__columns-panel-header">
          <h3 className="tce__columns-panel-title">
            {t('explorer.createTable.columnsTitle')}
          </h3>
          <button
            className="tce__add-column-btn"
            onClick={addColumn}
            disabled={disabled}
          >
            <Plus size={12} />
            {t('explorer.createTable.addColumnButton')}
          </button>
        </div>

        <div className="tce__columns-scroll">
          {fields.length === 0 ? (
            <div className="tce__empty-columns">
              {t('explorer.createTable.noColumns')}
            </div>
          ) : (
            <table className="tce__col-table">
              <thead>
                <tr>
                  {showPrimaryKey && <th className="th-pk">PK</th>}
                  <th className="th-name">{t('explorer.createTable.colHeader.name')}</th>
                  <th className="th-type">{t('explorer.createTable.colHeader.type')}</th>
                  <th className="th-null">{t('explorer.createTable.colHeader.null')}</th>
                  <th className="th-del" />
                </tr>
              </thead>
              <tbody>
                {fields.map((field) => (
                  <FieldRow
                    key={field.id}
                    field={field}
                    providerTypes={providerTypes}
                    isSelected={field.id === selectedFieldId}
                    isDisabled={disabled}
                    showPrimaryKey={showPrimaryKey}
                    onSelect={() => setSelectedFieldId(field.id)}
                    onNameChange={(v) => updateField(field.id, 'name', v)}
                    onTypeChange={(v) => handleTypeChange(field.id, v)}
                    onNullableChange={(v) => updateField(field.id, 'isNullable', v)}
                    onPkChange={(v) => {
                      onFieldsChange(
                        fields.map((f) =>
                          f.id === field.id
                            ? { ...f, isPrimaryKey: v, isNullable: v ? false : f.isNullable }
                            : f
                        )
                      )
                    }}
                    onDelete={() => deleteColumn(field.id)}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Properties panel */}
      <div className="tce__props-panel">
        <div className="tce__props-panel-header">
          <h3 className="tce__props-panel-title">
            {t('explorer.createTable.propertiesTitle')}
          </h3>
        </div>

        {selectedField && typeConfig ? (
          <div className="tce__props-scroll">
            {/* Length */}
            {typeConfig.hasLength && (
              <div className="tce__prop-field">
                <label className="tce__prop-label" htmlFor="tce-prop-length">
                  {t('explorer.createTable.props.length')}
                </label>
                {typeConfig.hasMaxOption ? (
                  <select
                    id="tce-prop-length"
                    className="tce__prop-select"
                    value={selectedField.length === 'MAX' ? 'MAX' : 'custom'}
                    onChange={(e) => {
                      if (e.target.value === 'MAX') {
                        updateField(selectedField.id, 'length', 'MAX')
                      } else {
                        const cur = selectedField.length
                        updateField(
                          selectedField.id,
                          'length',
                          typeof cur === 'number' ? cur : 255
                        )
                      }
                    }}
                    disabled={disabled}
                  >
                    <option value="custom">
                      {t('explorer.createTable.props.lengthCustom')}
                    </option>
                    <option value="MAX">MAX</option>
                  </select>
                ) : null}
                {selectedField.length !== 'MAX' && (
                  <input
                    type="number"
                    className="tce__prop-input"
                    value={selectedField.length ?? 255}
                    min={1}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10)
                      if (!isNaN(v) && v > 0) {
                        updateField(selectedField.id, 'length', v)
                      }
                    }}
                    disabled={disabled}
                    placeholder="255"
                  />
                )}
              </div>
            )}

            {/* Precision + Scale */}
            {typeConfig.hasPrecisionScale && (
              <div className="tce__prop-field">
                <span className="tce__prop-label">
                  {t('explorer.createTable.props.precisionScale')}
                </span>
                <div className="tce__prop-row">
                  <input
                    type="number"
                    className="tce__prop-input"
                    value={selectedField.precision ?? 18}
                    min={1}
                    max={38}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10)
                      if (!isNaN(v)) updateField(selectedField.id, 'precision', v)
                    }}
                    disabled={disabled}
                    title={t('explorer.createTable.props.precision')}
                    placeholder="18"
                  />
                  <input
                    type="number"
                    className="tce__prop-input"
                    value={selectedField.scale ?? 0}
                    min={0}
                    max={38}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10)
                      if (!isNaN(v)) updateField(selectedField.id, 'scale', v)
                    }}
                    disabled={disabled}
                    title={t('explorer.createTable.props.scale')}
                    placeholder="0"
                  />
                </div>
              </div>
            )}

            {/* Default Value */}
            {showDefaultValue && (
              <div className="tce__prop-field">
                <label className="tce__prop-label" htmlFor="tce-prop-default">
                  {t('explorer.createTable.props.defaultValue')}
                </label>
                <input
                  id="tce-prop-default"
                  type="text"
                  className="tce__prop-input"
                  value={selectedField.defaultValue}
                  onChange={(e) =>
                    updateField(selectedField.id, 'defaultValue', e.target.value)
                  }
                  disabled={disabled}
                  placeholder={t('explorer.createTable.props.defaultValuePlaceholder')}
                />
              </div>
            )}

            {/* Primary Key */}
            {showPrimaryKey && (
              <div className="tce__prop-field">
                <label className="tce__prop-checkbox-row">
                  <input
                    type="checkbox"
                    className="tce__prop-checkbox"
                    checked={selectedField.isPrimaryKey}
                    onChange={(e) => {
                      const checked = e.target.checked
                      onFieldsChange(
                        fields.map((f) =>
                          f.id === selectedField.id
                            ? { ...f, isPrimaryKey: checked, isNullable: checked ? false : f.isNullable }
                            : f
                        )
                      )
                    }}
                    disabled={disabled}
                  />
                  <span className="tce__prop-checkbox-label">
                    {t('explorer.createTable.props.primaryKey')}
                  </span>
                </label>
              </div>
            )}

            {(showDefaultValue || showPrimaryKey) && (showIdentity && (typeConfig.hasIdentity || selectedField.isIdentity)) && (
              <hr className="tce__prop-divider" />
            )}

            {/* Identity */}
            {showIdentity && (typeConfig.hasIdentity || selectedField.isIdentity) && (
              <>
                <div className="tce__prop-field">
                  <label className="tce__prop-checkbox-row">
                    <input
                      type="checkbox"
                      className="tce__prop-checkbox"
                      checked={selectedField.isIdentity}
                      onChange={(e) => {
                        const checked = e.target.checked
                        onFieldsChange(
                          fields.map((f) =>
                            f.id === selectedField.id
                              ? {
                                  ...f,
                                  isIdentity: checked,
                                  isNullable: checked ? false : f.isNullable
                                }
                              : f
                          )
                        )
                      }}
                      disabled={disabled}
                    />
                    <span className="tce__prop-checkbox-label">
                      {t('explorer.createTable.props.identity')}
                    </span>
                  </label>
                </div>

                {selectedField.isIdentity && (
                  <div className="tce__prop-field">
                    <span className="tce__prop-label">
                      {t('explorer.createTable.props.identitySeedIncrement')}
                    </span>
                    <div className="tce__prop-row">
                      <input
                        type="number"
                        className="tce__prop-input"
                        value={selectedField.identitySeed}
                        onChange={(e) => {
                          const v = parseInt(e.target.value, 10)
                          if (!isNaN(v)) updateField(selectedField.id, 'identitySeed', v)
                        }}
                        disabled={disabled}
                        title={t('explorer.createTable.props.identitySeed')}
                        placeholder="1"
                      />
                      <input
                        type="number"
                        className="tce__prop-input"
                        value={selectedField.identityIncrement}
                        onChange={(e) => {
                          const v = parseInt(e.target.value, 10)
                          if (!isNaN(v))
                            updateField(selectedField.id, 'identityIncrement', v)
                        }}
                        disabled={disabled}
                        title={t('explorer.createTable.props.identityIncrement')}
                        placeholder="1"
                      />
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          <div className="tce__props-empty">
            {t('explorer.createTable.propertiesEmpty')}
          </div>
        )}
      </div>
    </div>
  )
}

// ── FieldRow sub-component ─────────────────────────────────────────

interface FieldRowProps {
  field: TableField
  providerTypes: string[]
  isSelected: boolean
  isDisabled: boolean
  showPrimaryKey: boolean
  onSelect: () => void
  onNameChange: (v: string) => void
  onTypeChange: (v: string) => void
  onNullableChange: (v: boolean) => void
  onPkChange: (v: boolean) => void
  onDelete: () => void
}

function FieldRow({
  field,
  providerTypes,
  isSelected,
  isDisabled,
  showPrimaryKey,
  onSelect,
  onNameChange,
  onTypeChange,
  onNullableChange,
  onPkChange,
  onDelete
}: FieldRowProps): React.JSX.Element {
  return (
    <tr
      className={`tce__col-row${isSelected ? ' tce__col-row--selected' : ''}`}
      onClick={onSelect}
    >
      {showPrimaryKey && (
        <td className="td-center">
          <input
            type="checkbox"
            className="tce__col-checkbox"
            checked={field.isPrimaryKey}
            onChange={(e) => {
              e.stopPropagation()
              onPkChange(e.target.checked)
            }}
            onClick={(e) => { onSelect(); e.stopPropagation() }}
            disabled={isDisabled}
            aria-label="Primary key"
            title="Primary key"
          />
        </td>
      )}
      <td>
        <input
          type="text"
          className="tce__col-input"
          value={field.name}
          onChange={(e) => onNameChange(e.target.value)}
          onClick={(e) => { onSelect(); e.stopPropagation() }}
          disabled={isDisabled}
          placeholder="column_name"
        />
      </td>
      <td>
        <select
          className="tce__col-select"
          value={field.type}
          aria-label="Column type"
          onChange={(e) => {
            e.stopPropagation()
            onTypeChange(e.target.value)
          }}
          onClick={(e) => { onSelect(); e.stopPropagation() }}
          disabled={isDisabled}
        >
          {providerTypes.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </td>
      <td className="td-center">
        <input
          type="checkbox"
          className="tce__col-checkbox"
          checked={field.isNullable}
          onChange={(e) => {
            e.stopPropagation()
            onNullableChange(e.target.checked)
          }}
          onClick={(e) => { onSelect(); e.stopPropagation() }}
          disabled={isDisabled}
          aria-label="Nullable"
          title="Nullable"
        />
      </td>
      <td>
        <button
          className="tce__col-delete"
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          disabled={isDisabled}
          aria-label="Delete column"
          title="Delete column"
        >
          <Trash2 size={13} />
        </button>
      </td>
    </tr>
  )
}

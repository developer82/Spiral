import { useEffect, useState } from 'react'
import { ArrowLeftRight, Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import BaseDialog from '../../../../components/BaseDialog/BaseDialog'
import NewConnectionDialog from '../../../Explorer/Dialogs/NewConnectionDialog/NewConnectionDialog'
import type { ConnectionProvider, ConnectionRecord } from '../../../Explorer/connections.types'
import { resolveConnectionEnvironment } from '../../../Explorer/environmentUtils'
import { PROVIDER_METADATA } from '../../../Explorer/providerMetadata'
import type { EnvironmentDefinition } from '../../../Settings/useSettings'
import { COMPARISON_SCOPE_GROUPS } from '../../comparisonScope'
import type {
  ComparisonDraft,
  ComparisonRecord,
  ComparisonScopeKey,
  ComparisonTableKeyMapping
} from '../../comparison.types'
import './ComparisonDialog.css'
import Button from '../../../../components/Button/Button'

type Side = 'source' | 'target'

interface ComparisonDialogProps {
  connections: ConnectionRecord[]
  environments: EnvironmentDefinition[]
  initialValue?: ComparisonRecord
  onCancel: () => void
  onSave: (record: ComparisonDraft) => Promise<void>
  onConnectionCreated: (record: ConnectionRecord) => void
}

interface FormErrors {
  name?: string
  sourceConnectionId?: string
  sourceDatabaseName?: string
  targetConnectionId?: string
  targetDatabaseName?: string
  scopeKeys?: string
}

function buildEmptyDraft(): ComparisonDraft {
  return {
    name: '',
    description: '',
    source: {
      connectionId: '',
      databaseName: '',
      provider: 'sqlserver'
    },
    target: {
      connectionId: '',
      databaseName: '',
      provider: 'sqlserver'
    },
    scopeKeys: ['schema.tablesCoreConstraints'],
    tableKeyMappings: []
  }
}

function parseCsvList(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function formatCsvList(values: string[]): string {
  return values.join(', ')
}

function validate(form: ComparisonDraft, t: (key: string) => string): FormErrors {
  const errors: FormErrors = {}

  if (!form.name.trim()) {
    errors.name = t('compare.dialog.validation.nameRequired')
  }
  if (!form.source.connectionId) {
    errors.sourceConnectionId = t('compare.dialog.validation.sourceConnectionRequired')
  }
  if (!form.source.databaseName.trim()) {
    errors.sourceDatabaseName = t('compare.dialog.validation.sourceDatabaseRequired')
  }
  if (!form.target.connectionId) {
    errors.targetConnectionId = t('compare.dialog.validation.targetConnectionRequired')
  }
  if (!form.target.databaseName.trim()) {
    errors.targetDatabaseName = t('compare.dialog.validation.targetDatabaseRequired')
  }
  if (form.scopeKeys.length === 0) {
    errors.scopeKeys = t('compare.dialog.validation.scopeRequired')
  }

  return errors
}

function getProviderLabel(provider?: ConnectionProvider): string {
  if (!provider) return '—'
  return PROVIDER_METADATA[provider].label
}

function getProviderSummary(form: ComparisonDraft, t: (key: string) => string): string {
  if (!form.source.connectionId && !form.target.connectionId) {
    return t('compare.dialog.providerSummary.empty')
  }

  return `${getProviderLabel(form.source.provider)} -> ${getProviderLabel(form.target.provider)}`
}

function normalizeMapping(mapping: ComparisonTableKeyMapping): ComparisonTableKeyMapping {
  return {
    sourceTable: mapping.sourceTable.trim(),
    targetTable: mapping.targetTable.trim(),
    sourceColumns: mapping.sourceColumns.map((column) => column.trim()).filter(Boolean),
    targetColumns: mapping.targetColumns.map((column) => column.trim()).filter(Boolean)
  }
}

function syncEndpointBorderColor(element: HTMLElement | null, color: string | undefined): void {
  if (!element) {
    return
  }

  if (color) {
    element.style.setProperty('--compare-dialog-endpoint-border', color)
    return
  }

  element.style.removeProperty('--compare-dialog-endpoint-border')
}

function ComparisonDialog({
  connections,
  environments,
  initialValue,
  onCancel,
  onSave,
  onConnectionCreated
}: ComparisonDialogProps): React.JSX.Element {
  const { t } = useTranslation()
  const isEdit = !!initialValue
  const [form, setForm] = useState<ComparisonDraft>(initialValue ?? buildEmptyDraft())
  const [availableConnections, setAvailableConnections] = useState(connections)
  const [errors, setErrors] = useState<FormErrors>({})
  const [databaseOptions, setDatabaseOptions] = useState<Record<Side, string[]>>({
    source: [],
    target: []
  })
  const [databaseLoadErrors, setDatabaseLoadErrors] = useState<Record<Side, string | undefined>>({
    source: undefined,
    target: undefined
  })
  const [databaseLoading, setDatabaseLoading] = useState<Record<Side, boolean>>({
    source: false,
    target: false
  })
  const [isSaving, setIsSaving] = useState(false)
  const [newConnectionSide, setNewConnectionSide] = useState<Side | null>(null)
  const [mappingInputs, setMappingInputs] = useState(
    () =>
      (initialValue?.tableKeyMappings ?? []).map((mapping) => ({
        sourceColumns: formatCsvList(mapping.sourceColumns),
        targetColumns: formatCsvList(mapping.targetColumns)
      }))
  )

  useEffect(() => {
    setAvailableConnections(connections)
  }, [connections])

  async function loadDatabases(side: Side, connectionId: string): Promise<void> {
    if (!connectionId) {
      setDatabaseOptions((prev) => ({ ...prev, [side]: [] }))
      setDatabaseLoadErrors((prev) => ({ ...prev, [side]: undefined }))
      return
    }

    setDatabaseLoading((prev) => ({ ...prev, [side]: true }))
    const result = await window.api.database.getDatabases(connectionId)
    setDatabaseLoading((prev) => ({ ...prev, [side]: false }))

    if (result.status === 'error') {
      setDatabaseLoadErrors((prev) => ({ ...prev, [side]: result.message }))
      return
    }

    setDatabaseLoadErrors((prev) => ({ ...prev, [side]: undefined }))
    setDatabaseOptions((prev) => ({ ...prev, [side]: result.databases }))
    setForm((prev) => {
      const endpoint = prev[side]
      const connection = availableConnections.find((item) => item.id === connectionId)
      const nextOptions = result.databases.includes(endpoint.databaseName)
        ? result.databases
        : endpoint.databaseName.trim()
          ? [endpoint.databaseName, ...result.databases]
          : result.databases
      const preferredDatabase =
        endpoint.databaseName || connection?.defaultDatabase || nextOptions[0] || ''

      return {
        ...prev,
        [side]: {
          ...endpoint,
          databaseName: preferredDatabase
        }
      }
    })
  }

  useEffect(() => {
    void loadDatabases('source', form.source.connectionId)
  }, [form.source.connectionId])

  useEffect(() => {
    void loadDatabases('target', form.target.connectionId)
  }, [form.target.connectionId])

  function setField<K extends keyof ComparisonDraft>(key: K, value: ComparisonDraft[K]): void {
    setForm((prev) => ({ ...prev, [key]: value }))
    if (key === 'name' && errors.name) {
      setErrors((prev) => ({ ...prev, name: undefined }))
    }
  }

  function setEndpoint(side: Side, value: Partial<ComparisonDraft[Side]>): void {
    setForm((prev) => ({
      ...prev,
      [side]: {
        ...prev[side],
        ...value
      }
    }))

    setErrors((prev) => ({
      ...prev,
      [side === 'source' ? 'sourceConnectionId' : 'targetConnectionId']: undefined,
      [side === 'source' ? 'sourceDatabaseName' : 'targetDatabaseName']: undefined
    }))
  }

  function handleConnectionChange(side: Side, connectionId: string): void {
    const connection = availableConnections.find((item) => item.id === connectionId)
    setDatabaseOptions((prev) => ({ ...prev, [side]: [] }))
    setEndpoint(side, {
      connectionId,
      provider: connection?.provider ?? form[side].provider,
      databaseName: connection?.defaultDatabase ?? ''
    })
  }

  function toggleScope(scopeKey: ComparisonScopeKey): void {
    setForm((prev) => {
      const exists = prev.scopeKeys.includes(scopeKey)
      return {
        ...prev,
        scopeKeys: exists
          ? prev.scopeKeys.filter((key) => key !== scopeKey)
          : [...prev.scopeKeys, scopeKey]
      }
    })
    if (errors.scopeKeys) {
      setErrors((prev) => ({ ...prev, scopeKeys: undefined }))
    }
  }

  function swapEndpoints(): void {
    setForm((prev) => ({
      ...prev,
      source: prev.target,
      target: prev.source
    }))
    setDatabaseOptions((prev) => ({
      source: prev.target,
      target: prev.source
    }))
    setDatabaseLoadErrors((prev) => ({
      source: prev.target,
      target: prev.source
    }))
    setDatabaseLoading((prev) => ({
      source: prev.target,
      target: prev.source
    }))
    setErrors((prev) => ({
      ...prev,
      sourceConnectionId: prev.targetConnectionId,
      sourceDatabaseName: prev.targetDatabaseName,
      targetConnectionId: prev.sourceConnectionId,
      targetDatabaseName: prev.sourceDatabaseName
    }))
  }

  function updateMapping(index: number, nextMapping: ComparisonTableKeyMapping): void {
    setForm((prev) => ({
      ...prev,
      tableKeyMappings: prev.tableKeyMappings.map((mapping, mappingIndex) =>
        mappingIndex === index ? normalizeMapping(nextMapping) : mapping
      )
    }))
  }

  function addMapping(): void {
    setForm((prev) => ({
      ...prev,
      tableKeyMappings: [
        ...prev.tableKeyMappings,
        {
          sourceTable: '',
          targetTable: '',
          sourceColumns: [],
          targetColumns: []
        }
      ]
    }))
    setMappingInputs((prev) => [...prev, { sourceColumns: '', targetColumns: '' }])
  }

  function removeMapping(index: number): void {
    setForm((prev) => ({
      ...prev,
      tableKeyMappings: prev.tableKeyMappings.filter((_, mappingIndex) => mappingIndex !== index)
    }))
    setMappingInputs((prev) => prev.filter((_, mappingIndex) => mappingIndex !== index))
  }

  function updateMappingInput(
    index: number,
    field: 'sourceColumns' | 'targetColumns',
    value: string
  ): void {
    setMappingInputs((prev) =>
      prev.map((input, inputIndex) =>
        inputIndex === index ? { ...input, [field]: value } : input
      )
    )
  }

  async function handleSubmit(): Promise<void> {
    const nextErrors = validate(form, t)
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      return
    }

    setIsSaving(true)
    const submittedMappings = form.tableKeyMappings
      .map((mapping, index) =>
        normalizeMapping({
          ...mapping,
          sourceColumns: parseCsvList(mappingInputs[index]?.sourceColumns ?? ''),
          targetColumns: parseCsvList(mappingInputs[index]?.targetColumns ?? '')
        })
      )
      .filter(
        (mapping) =>
          mapping.sourceTable ||
          mapping.targetTable ||
          mapping.sourceColumns.length > 0 ||
          mapping.targetColumns.length > 0
      )

    await onSave({
      ...form,
      name: form.name.trim(),
      description: form.description.trim(),
      tableKeyMappings: submittedMappings
    })
    setIsSaving(false)
  }

  async function handleSaveNewConnection(record: Omit<ConnectionRecord, 'id'>): Promise<void> {
    if (!newConnectionSide) {
      return
    }

    const saved = await window.api.connections.create(record)
    setAvailableConnections((prev) => [...prev, saved])
    onConnectionCreated(saved)
    setEndpoint(newConnectionSide, {
      connectionId: saved.id,
      provider: saved.provider,
      databaseName: saved.defaultDatabase
    })
    setNewConnectionSide(null)
  }

  function renderEndpoint(side: Side, titleKey: string): React.JSX.Element {
    const endpoint = form[side]
    const connection = availableConnections.find((item) => item.id === endpoint.connectionId)
    const environment = resolveConnectionEnvironment(availableConnections, environments, endpoint.connectionId)
    const connectionError = side === 'source' ? errors.sourceConnectionId : errors.targetConnectionId
    const databaseError = side === 'source' ? errors.sourceDatabaseName : errors.targetDatabaseName

    return (
      <section
        className="compare-dialog__endpoint"
        ref={(element) => syncEndpointBorderColor(element, environment?.color)}
      >
        <div className="compare-dialog__endpoint-title-row">
          <h3 className="compare-dialog__endpoint-title">{t(titleKey)}</h3>
          <span className="compare-dialog__provider-pill">{getProviderLabel(connection?.provider ?? endpoint.provider)}</span>
        </div>

        <div className="compare-dialog__field">
          <label className="compare-dialog__label" htmlFor={`${side}-connection`}>
            {t('compare.dialog.fields.connection')}
          </label>
          <select
            id={`${side}-connection`}
            className={`compare-dialog__select${connectionError ? ' compare-dialog__select--error' : ''}`}
            value={endpoint.connectionId}
            onChange={(event) => handleConnectionChange(side, event.target.value)}
          >
            <option value="">{t('compare.dialog.placeholders.selectConnection')}</option>
            {availableConnections.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          {connectionError ? <span className="compare-dialog__error">{connectionError}</span> : null}
        </div>

        <div className="compare-dialog__endpoint-actions">
          <button
            type="button"
            className="compare-dialog__link-btn"
            onClick={() => setNewConnectionSide(side)}
          >
            {t('compare.dialog.actions.newConnection')}
          </button>
        </div>

        <div className="compare-dialog__field">
          <label className="compare-dialog__label" htmlFor={`${side}-database`}>
            {t('compare.dialog.fields.database')}
          </label>
          <select
            id={`${side}-database`}
            className={`compare-dialog__select${databaseError ? ' compare-dialog__select--error' : ''}`}
            value={endpoint.databaseName}
            onChange={(event) => setEndpoint(side, { databaseName: event.target.value })}
            disabled={!endpoint.connectionId || databaseLoading[side]}
          >
            <option value="">{databaseLoading[side] ? t('compare.dialog.loadingDatabases') : t('compare.dialog.placeholders.selectDatabase')}</option>
            {databaseOptions[side].map((databaseName) => (
              <option key={databaseName} value={databaseName}>
                {databaseName}
              </option>
            ))}
          </select>
          {databaseLoadErrors[side] ? (
            <span className="compare-dialog__error">{databaseLoadErrors[side]}</span>
          ) : null}
          {databaseError ? <span className="compare-dialog__error">{databaseError}</span> : null}
        </div>
      </section>
    )
  }

  return (
    <>
    <BaseDialog
      title={isEdit ? t('compare.dialog.titleEdit') : t('compare.dialog.titleNew')}
      onClose={onCancel}
      closeDisabled={isSaving}
      maxWidth="70rem"
      maxHeight="min(90vh, 58rem)"
      zIndex={120}
      footer={
        <>
          <Button
              variant="ghost"
            onClick={onCancel}
            disabled={isSaving}
          >
            {t('compare.dialog.actions.cancel')}
          </Button>
          <Button
              variant="primary"
            onClick={() => void handleSubmit()}
            disabled={isSaving}
          >
            {isEdit ? t('compare.dialog.actions.update') : t('compare.dialog.actions.save')}
          </Button>
        </>
      }
    >
        <div className="compare-dialog__body">
          <section className="compare-dialog__section">
            <h3 className="compare-dialog__section-title">{t('compare.dialog.sections.general')}</h3>
            <div className="compare-dialog__form-grid">
              <div className="compare-dialog__field">
                <label className="compare-dialog__label" htmlFor="comparison-name">
                  {t('compare.dialog.fields.name')}
                </label>
                <input
                  id="comparison-name"
                  className={`compare-dialog__input${errors.name ? ' compare-dialog__input--error' : ''}`}
                  value={form.name}
                  onChange={(event) => setField('name', event.target.value)}
                />
                {errors.name ? <span className="compare-dialog__error">{errors.name}</span> : null}
              </div>

              <div className="compare-dialog__field">
                <span className="compare-dialog__label">{t('compare.dialog.fields.providers')}</span>
                <div className="compare-dialog__provider-summary">{getProviderSummary(form, t)}</div>
              </div>

              <div className="compare-dialog__field compare-dialog__field--span">
                <label className="compare-dialog__label" htmlFor="comparison-description">
                  {t('compare.dialog.fields.description')}
                </label>
                <textarea
                  id="comparison-description"
                  className="compare-dialog__textarea"
                  value={form.description}
                  onChange={(event) => setField('description', event.target.value)}
                />
              </div>
            </div>
          </section>

          <section className="compare-dialog__section">
            <h3 className="compare-dialog__section-title">{t('compare.dialog.sections.endpoints')}</h3>
            <p className="compare-dialog__section-copy">{t('compare.dialog.sections.endpointsHelp')}</p>
            <div className="compare-dialog__split">
              {renderEndpoint('source', 'compare.dialog.sections.source')}
              <div className="compare-dialog__split-divider">
                <button
                  type="button"
                  className="compare-dialog__swap-btn"
                  aria-label={t('compare.dialog.actions.swapEndpoints')}
                  title={t('compare.dialog.actions.swapEndpoints')}
                  onClick={swapEndpoints}
                >
                  <ArrowLeftRight size={14} />
                </button>
              </div>
              {renderEndpoint('target', 'compare.dialog.sections.target')}
            </div>
          </section>

          <section className="compare-dialog__section">
            <h3 className="compare-dialog__section-title">{t('compare.dialog.sections.scope')}</h3>
            <div className="compare-dialog__scope-groups">
              {COMPARISON_SCOPE_GROUPS.map((group) => (
                <section key={group.id} className="compare-dialog__scope-group">
                  <div>
                    <h4 className="compare-dialog__scope-group-title">{t(group.titleKey)}</h4>
                    <p className="compare-dialog__section-copy">{t(group.descriptionKey)}</p>
                  </div>
                  {group.options.map((option) => {
                    const checked = form.scopeKeys.includes(option.key)
                    return (
                      <label key={option.key} className="compare-dialog__scope-option">
                        <input
                          className="compare-dialog__checkbox"
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleScope(option.key)}
                        />
                        <span>
                          <span className="compare-dialog__scope-option-label">{t(option.labelKey)}</span>
                          <p className="compare-dialog__scope-option-copy">{t(option.descriptionKey)}</p>
                        </span>
                      </label>
                    )
                  })}
                </section>
              ))}
            </div>
            {errors.scopeKeys ? <span className="compare-dialog__error">{errors.scopeKeys}</span> : null}
          </section>

          {form.scopeKeys.includes('data.keyMatchedSets') ? (
            <section className="compare-dialog__section">
              <h3 className="compare-dialog__section-title">{t('compare.dialog.sections.keyMappings')}</h3>
              <p className="compare-dialog__helper">{t('compare.dialog.keyMappings.help')}</p>
              <div className="compare-dialog__mappings">
                {form.tableKeyMappings.length === 0 ? (
                  <p className="compare-dialog__helper">{t('compare.dialog.keyMappings.empty')}</p>
                ) : null}
                {form.tableKeyMappings.map((mapping, index) => (
                  <div key={`mapping-${index}`} className="compare-dialog__mapping-row">
                    <div className="compare-dialog__field">
                      <label className="compare-dialog__label" htmlFor={`source-table-${index}`}>
                        {t('compare.dialog.keyMappings.sourceTable')}
                      </label>
                      <input
                        id={`source-table-${index}`}
                        className="compare-dialog__input"
                        value={mapping.sourceTable}
                        onChange={(event) =>
                          updateMapping(index, { ...mapping, sourceTable: event.target.value })
                        }
                      />
                    </div>
                    <div className="compare-dialog__field">
                      <label className="compare-dialog__label" htmlFor={`target-table-${index}`}>
                        {t('compare.dialog.keyMappings.targetTable')}
                      </label>
                      <input
                        id={`target-table-${index}`}
                        className="compare-dialog__input"
                        value={mapping.targetTable}
                        onChange={(event) =>
                          updateMapping(index, { ...mapping, targetTable: event.target.value })
                        }
                      />
                    </div>
                    <div className="compare-dialog__field">
                      <label className="compare-dialog__label" htmlFor={`source-columns-${index}`}>
                        {t('compare.dialog.keyMappings.sourceColumns')}
                      </label>
                      <input
                        id={`source-columns-${index}`}
                        className="compare-dialog__input"
                        value={mappingInputs[index]?.sourceColumns ?? formatCsvList(mapping.sourceColumns)}
                        onChange={(event) =>
                          updateMappingInput(index, 'sourceColumns', event.target.value)
                        }
                      />
                    </div>
                    <div className="compare-dialog__field">
                      <label className="compare-dialog__label" htmlFor={`target-columns-${index}`}>
                        {t('compare.dialog.keyMappings.targetColumns')}
                      </label>
                      <input
                        id={`target-columns-${index}`}
                        className="compare-dialog__input"
                        value={mappingInputs[index]?.targetColumns ?? formatCsvList(mapping.targetColumns)}
                        onChange={(event) =>
                          updateMappingInput(index, 'targetColumns', event.target.value)
                        }
                      />
                    </div>
                    <button
                      type="button"
                      className="compare-dialog__mapping-remove"
                      aria-label={t('compare.dialog.actions.removeMapping')}
                      onClick={() => removeMapping(index)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
              <button type="button" className="compare-dialog__secondary-btn" onClick={addMapping}>
                <Plus size={14} /> {t('compare.dialog.actions.addMapping')}
              </button>
            </section>
          ) : null}
        </div>
    </BaseDialog>
    {newConnectionSide ? (
      <NewConnectionDialog
        onCancel={() => setNewConnectionSide(null)}
        onSave={handleSaveNewConnection}
      />
    ) : null}
    </>
  )
}

export default ComparisonDialog
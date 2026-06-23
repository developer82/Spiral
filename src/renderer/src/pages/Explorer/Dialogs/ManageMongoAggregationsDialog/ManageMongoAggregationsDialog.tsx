import '../../MonacoEditor/monacoSetup'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Trash2, GitMerge, ChevronDown, ChevronRight, GripVertical, Play, Eye, EyeOff } from 'lucide-react'
import MonacoEditor, { type BeforeMount, type OnMount } from '@monaco-editor/react'
import type * as Monaco from 'monaco-editor'
import type { MongoAggregationDefinition, QueryResultSet } from '../../../../../../preload/index.d'
import './ManageMongoAggregationsDialog.css'
import BaseDialog from '../../../../components/BaseDialog/BaseDialog'
import ErrorBox from '../../../../components/ErrorBox/ErrorBox'
import SearchableSelect, { type SearchableSelectOption } from '../../../../components/SearchableSelect/SearchableSelect'
import Button from '../../../../components/Button/Button'

// ── Stage type catalogue ──────────────────────────────────────────────────────

const AGGREGATION_STAGES: SearchableSelectOption[] = [
  { value: '$match',           label: '$match',           description: 'Filters documents matching a condition' },
  { value: '$group',           label: '$group',           description: 'Groups documents by a key and computes aggregates' },
  { value: '$project',         label: '$project',         description: 'Reshapes documents by including, excluding, or adding fields' },
  { value: '$sort',            label: '$sort',            description: 'Sorts documents by one or more fields' },
  { value: '$limit',           label: '$limit',           description: 'Passes the first N documents to the next stage' },
  { value: '$skip',            label: '$skip',            description: 'Skips the first N documents' },
  { value: '$lookup',          label: '$lookup',          description: 'Left outer join with another collection' },
  { value: '$unwind',          label: '$unwind',          description: 'Deconstructs an array field into one document per element' },
  { value: '$addFields',       label: '$addFields',       description: 'Adds new fields to documents' },
  { value: '$set',             label: '$set',             description: 'Alias for $addFields — adds or overwrites fields' },
  { value: '$unset',           label: '$unset',           description: 'Removes specified fields from documents' },
  { value: '$replaceRoot',     label: '$replaceRoot',     description: 'Replaces the root document with a nested document' },
  { value: '$replaceWith',     label: '$replaceWith',     description: 'Alias for $replaceRoot with $replaceRoot.newRoot' },
  { value: '$count',           label: '$count',           description: 'Returns a single document with the total document count' },
  { value: '$sample',          label: '$sample',          description: 'Randomly selects N documents from the input' },
  { value: '$sortByCount',     label: '$sortByCount',     description: 'Groups by a field value and sorts by count descending' },
  { value: '$facet',           label: '$facet',           description: 'Runs multiple sub-pipelines and merges their results' },
  { value: '$bucket',          label: '$bucket',          description: 'Categorizes documents into ranges defined by boundaries' },
  { value: '$bucketAuto',      label: '$bucketAuto',      description: 'Automatically distributes documents into N equal buckets' },
  { value: '$out',             label: '$out',             description: 'Writes the aggregation result to a new collection' },
  { value: '$merge',           label: '$merge',           description: 'Merges results into a collection with conflict control' },
  { value: '$geoNear',         label: '$geoNear',         description: 'Returns documents ordered by distance to a geo point' },
  { value: '$graphLookup',     label: '$graphLookup',     description: 'Recursive graph traversal across a collection' },
  { value: '$unionWith',       label: '$unionWith',       description: 'Combines pipeline results with another collection' },
  { value: '$densify',         label: '$densify',         description: 'Creates documents to fill gaps in a time series' },
  { value: '$fill',            label: '$fill',            description: 'Fills null/missing fields using linear or locf interpolation' },
  { value: '$setWindowFields', label: '$setWindowFields', description: 'Computes rolling/cumulative values over a window of documents' },
  { value: '$redact',          label: '$redact',          description: 'Restricts document content based on embedded access rules' },
  { value: '$indexStats',      label: '$indexStats',      description: 'Returns usage statistics for each collection index' },
  { value: '$collStats',       label: '$collStats',       description: 'Returns storage and latency statistics for the collection' },
  { value: '$planCacheStats',  label: '$planCacheStats',  description: 'Returns plan cache information for the collection' },
]

const STAGE_TEMPLATES: Record<string, string> = {
  '$match':           '{\n  "field": "value"\n}',
  '$group':           '{\n  "_id": "$field",\n  "count": { "$sum": 1 }\n}',
  '$project':         '{\n  "field": 1,\n  "_id": 0\n}',
  '$sort':            '{\n  "field": 1\n}',
  '$limit':           '10',
  '$skip':            '0',
  '$lookup':          '{\n  "from": "otherCollection",\n  "localField": "localField",\n  "foreignField": "foreignField",\n  "as": "result"\n}',
  '$unwind':          '{\n  "path": "$arrayField",\n  "preserveNullAndEmptyArrays": false\n}',
  '$addFields':       '{\n  "newField": "value"\n}',
  '$set':             '{\n  "newField": "value"\n}',
  '$unset':           '["field1", "field2"]',
  '$replaceRoot':     '{\n  "newRoot": "$embeddedDocument"\n}',
  '$replaceWith':     '"$embeddedDocument"',
  '$count':           '"count"',
  '$sample':          '{\n  "size": 5\n}',
  '$sortByCount':     '"$field"',
  '$facet':           '{\n  "pipeline1": [],\n  "pipeline2": []\n}',
  '$bucket':          '{\n  "groupBy": "$price",\n  "boundaries": [0, 100, 200],\n  "default": "Other",\n  "output": {\n    "count": { "$sum": 1 }\n  }\n}',
  '$bucketAuto':      '{\n  "groupBy": "$price",\n  "buckets": 4\n}',
  '$out':             '"newCollectionName"',
  '$merge':           '{\n  "into": "targetCollection",\n  "whenMatched": "replace",\n  "whenNotMatched": "insert"\n}',
  '$geoNear':         '{\n  "near": { "type": "Point", "coordinates": [0, 0] },\n  "distanceField": "distance",\n  "spherical": true\n}',
  '$graphLookup':     '{\n  "from": "collection",\n  "startWith": "$field",\n  "connectFromField": "from",\n  "connectToField": "_id",\n  "as": "result"\n}',
  '$unionWith':       '{\n  "coll": "otherCollection",\n  "pipeline": []\n}',
  '$densify':         '{\n  "field": "timestamp",\n  "range": {\n    "step": 1,\n    "unit": "day",\n    "bounds": "full"\n  }\n}',
  '$fill':            '{\n  "output": {\n    "field": { "method": "linear" }\n  }\n}',
  '$setWindowFields': '{\n  "partitionBy": "$field",\n  "sortBy": { "date": 1 },\n  "output": {\n    "result": {\n      "$sum": "$amount",\n      "window": { "documents": ["unbounded", "current"] }\n    }\n  }\n}',
  '$redact':          '"$$DESCEND"',
  '$indexStats':      '{}',
  '$collStats':       '{\n  "latencyStats": {},\n  "storageStats": {}\n}',
  '$planCacheStats':  '{}',
}

// ── Monaco theme ──────────────────────────────────────────────────────────────

const DARK_THEME = 'spiral-dark'
const LIGHT_THEME = 'spiral-light'

const handleBeforeMount: BeforeMount = (monaco) => {
  monaco.editor.defineTheme(DARK_THEME, {
    base: 'vs-dark', inherit: true, rules: [],
    colors: { 'editor.background': '#1a1a1a', 'editorGutter.background': '#141414' }
  })
  monaco.editor.defineTheme(LIGHT_THEME, {
    base: 'vs', inherit: true, rules: [],
    colors: { 'editor.background': '#ffffff', 'editorGutter.background': '#e8e8e8' }
  })
}

function resolveMonacoTheme(): string {
  if (typeof document !== 'undefined') {
    return document.documentElement.getAttribute('data-theme') === 'light' ? LIGHT_THEME : DARK_THEME
  }
  return DARK_THEME
}

// ── Pipeline builder ──────────────────────────────────────────────────────────

function buildPipelineUpTo(stages: AggStageState[], toIndex: number): unknown[] | null {
  const pipeline: unknown[] = []
  for (let i = 0; i <= toIndex; i++) {
    const s = stages[i]
    if (!s.enabled || !s.stageType) continue
    try {
      const body = JSON.parse(s.json)
      pipeline.push({ [s.stageType]: body })
    } catch {
      return null
    }
  }
  return pipeline
}

// ── Types ─────────────────────────────────────────────────────────────────────

type PreviewResult =
  | { status: 'ok'; resultSet: QueryResultSet }
  | { status: 'error'; message: string }

interface AggStageState {
  id: string
  stageType: string
  json: string
  enabled: boolean
  collapsed: boolean
  jsonError: string | null
  previewResult: PreviewResult | null
  isRunningPreview: boolean
  autoRefresh: boolean
}

interface EditState {
  id: string | null
  name: string
  stages: AggStageState[]
}

function makeStageId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function makeDefaultStage(): AggStageState {
  return {
    id: makeStageId(),
    stageType: '$match',
    json: STAGE_TEMPLATES['$match'],
    enabled: true,
    collapsed: false,
    jsonError: null,
    previewResult: null,
    isRunningPreview: false,
    autoRefresh: false
  }
}

function aggDefToEditState(agg: MongoAggregationDefinition): EditState {
  return {
    id: agg.id,
    name: agg.name,
    stages: agg.stages.map((s) => ({
      id: s.id,
      stageType: s.stageType,
      json: s.json,
      enabled: s.enabled,
      collapsed: s.collapsed,
      jsonError: null,
      previewResult: null,
      isRunningPreview: false,
      autoRefresh: false
    }))
  }
}

// ── Sub-component: mini preview table ────────────────────────────────────────

interface PreviewTableProps {
  resultSet: QueryResultSet
}

function PreviewTable({ resultSet }: PreviewTableProps): React.JSX.Element {
  if (resultSet.rows.length === 0) {
    return <div className="agg-dialog__preview-empty">No results</div>
  }
  return (
    <table className="agg-dialog__preview-table">
      <thead>
        <tr>
          {resultSet.columns.map((col) => (
            <th key={col}>{col}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {resultSet.rows.slice(0, 20).map((row, rowIdx) => (
          <tr key={rowIdx}>
            {resultSet.columns.map((col) => (
              <td key={col} title={String(row[col] ?? '')}>
                {String(row[col] ?? '')}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ── Sub-component: JSON syntax highlighter ───────────────────────────────────

const JSON_TOKEN_RE = /("(?:\\u[0-9a-fA-F]{4}|\\[^u]|[^\\"])*"(?:\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g

function JsonHighlight({ json }: { json: string }): React.JSX.Element {
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  const re = new RegExp(JSON_TOKEN_RE.source, 'g')

  while ((match = re.exec(json)) !== null) {
    if (match.index > lastIndex) parts.push(json.slice(lastIndex, match.index))
    const token = match[0]
    let cls: string
    if (token.trimEnd().endsWith(':')) cls = 'json-hl-key'
    else if (token.startsWith('"')) cls = 'json-hl-string'
    else if (token === 'true' || token === 'false') cls = 'json-hl-bool'
    else if (token === 'null') cls = 'json-hl-null'
    else cls = 'json-hl-number'
    parts.push(<span key={match.index} className={cls}>{token}</span>)
    lastIndex = re.lastIndex
  }
  if (lastIndex < json.length) parts.push(json.slice(lastIndex))
  return <>{parts}</>
}

// ── Sub-component: stage card ─────────────────────────────────────────────────

interface StageCardProps {
  stage: AggStageState
  stageIndex: number
  totalStages: number
  allStages: AggStageState[]
  connectionId: string
  databaseName: string
  collectionName: string
  onUpdate: (stageId: string, patch: Partial<AggStageState>) => void
  onDelete: (stageId: string) => void
  onDragStart: (index: number) => void
  onDragOver: (index: number) => void
  onDrop: () => void
  isDragTarget: boolean
  onMonacoReady: (monaco: typeof Monaco) => void
}

function StageCard({
  stage,
  stageIndex,
  allStages,
  connectionId,
  databaseName,
  collectionName,
  onUpdate,
  onDelete,
  onDragStart,
  onDragOver,
  onDrop,
  isDragTarget,
  onMonacoReady
}: StageCardProps): React.JSX.Element {
  const autoRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const runPreview = useCallback(async () => {
    const pipeline = buildPipelineUpTo(allStages, stageIndex)
    if (pipeline === null) {
      onUpdate(stage.id, { previewResult: { status: 'error', message: 'Invalid JSON in one or more enabled stages above this one' } })
      return
    }
    onUpdate(stage.id, { isRunningPreview: true })
    const result = await window.api.database.runMongoAggregation(connectionId, databaseName, collectionName, pipeline)
    if (result.status === 'ok') {
      onUpdate(stage.id, { previewResult: { status: 'ok', resultSet: result.resultSet }, isRunningPreview: false })
    } else {
      onUpdate(stage.id, { previewResult: { status: 'error', message: result.message }, isRunningPreview: false })
    }
  }, [allStages, stageIndex, connectionId, databaseName, collectionName, onUpdate, stage.id])

  function handleJsonChange(value: string | undefined): void {
    const json = value ?? ''
    let jsonError: string | null = null
    try {
      JSON.parse(json)
    } catch (e) {
      jsonError = e instanceof Error ? e.message : 'Invalid JSON'
    }
    onUpdate(stage.id, { json, jsonError })
    if (stage.autoRefresh && !jsonError) {
      if (autoRefreshTimerRef.current) clearTimeout(autoRefreshTimerRef.current)
      autoRefreshTimerRef.current = setTimeout(() => { void runPreview() }, 600)
    }
  }

  function handleStageTypeChange(value: string): void {
    const template = STAGE_TEMPLATES[value] ?? '{}'
    onUpdate(stage.id, { stageType: value, json: template, jsonError: null })
  }

  const handleMount: OnMount = (_editor, monacoInst) => {
    onMonacoReady(monacoInst)
  }

  const cardClasses = [
    'agg-dialog__stage-card',
    stage.collapsed ? 'agg-dialog__stage-card--collapsed' : '',
    !stage.enabled ? 'agg-dialog__stage-card--disabled' : '',
    isDragTarget ? 'agg-dialog__stage-card--dragover' : ''
  ].filter(Boolean).join(' ')

  return (
    <div
      className={cardClasses}
      draggable
      onDragStart={() => onDragStart(stageIndex)}
      onDragOver={(e) => { e.preventDefault(); onDragOver(stageIndex) }}
      onDrop={(e) => { e.preventDefault(); onDrop() }}
    >
      <div className="agg-dialog__stage-header">
        <span className="agg-dialog__drag-handle" title="Drag to reorder">
          <GripVertical size={14} />
        </span>
        <span className="agg-dialog__stage-number">#{stageIndex + 1}</span>
        <div className="agg-dialog__stage-type">
          <SearchableSelect
            options={AGGREGATION_STAGES}
            value={stage.stageType}
            onChange={handleStageTypeChange}
            ariaLabel="Stage type"
            emptyOptionLabel="Select stage..."
            searchPlaceholder="Search stages..."
            noResultsLabel="No matching stages"
          />
        </div>
        <div className="agg-dialog__stage-actions">
          <button
            className={`agg-dialog__stage-toggle ${stage.enabled ? 'agg-dialog__stage-toggle--enabled' : ''}`}
            onClick={() => onUpdate(stage.id, { enabled: !stage.enabled })}
            title={stage.enabled ? 'Disable stage' : 'Enable stage'}
          >
            {stage.enabled ? <Eye size={13} /> : <EyeOff size={13} />}
            {stage.enabled ? 'On' : 'Off'}
          </button>
          <button
            className="agg-dialog__stage-icon-btn"
            onClick={() => onUpdate(stage.id, { collapsed: !stage.collapsed })}
            title={stage.collapsed ? 'Expand' : 'Collapse'}
          >
            {stage.collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          </button>
          <button
            className="agg-dialog__stage-icon-btn agg-dialog__stage-icon-btn--danger"
            onClick={() => onDelete(stage.id)}
            title="Delete stage"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {!stage.collapsed && (
        <div className="agg-dialog__stage-body">
          <div className="agg-dialog__stage-split">
            <div className="agg-dialog__stage-editor-wrap">
              <MonacoEditor
                height="160px"
                language="json"
                value={stage.json}
                theme={resolveMonacoTheme()}
                beforeMount={handleBeforeMount}
                onMount={handleMount}
                onChange={handleJsonChange}
                options={{
                  minimap: { enabled: false },
                  lineNumbers: 'off',
                  folding: false,
                  scrollBeyondLastLine: false,
                  fontSize: 12,
                  fontFamily: '"JetBrains Mono", "Consolas", monospace',
                  tabSize: 2,
                  automaticLayout: true,
                  wordWrap: 'on',
                  overviewRulerLanes: 0,
                  hideCursorInOverviewRuler: true,
                  overviewRulerBorder: false,
                  scrollbar: { vertical: 'auto', horizontal: 'auto' }
                }}
              />
            </div>

            <div className="agg-dialog__preview-pane">
              <div className="agg-dialog__preview-header">
                <span className="agg-dialog__preview-label">Preview</span>
                <label className="agg-dialog__preview-toggle">
                  <input
                    type="checkbox"
                    checked={stage.autoRefresh}
                    onChange={(e) => onUpdate(stage.id, { autoRefresh: e.target.checked })}
                  />
                  Auto
                </label>
                <button
                  className="agg-dialog__preview-run-btn"
                  onClick={() => void runPreview()}
                  disabled={stage.isRunningPreview}
                  title="Run preview"
                >
                  <Play size={11} />
                  {stage.isRunningPreview ? 'Running…' : 'Run'}
                </button>
              </div>
              <div className="agg-dialog__preview-body">
                {stage.previewResult === null && !stage.isRunningPreview && (
                  <div className="agg-dialog__preview-empty">Click Run to preview</div>
                )}
                {stage.isRunningPreview && (
                  <div className="agg-dialog__preview-empty">Running…</div>
                )}
                {stage.previewResult !== null && !stage.isRunningPreview && (
                  stage.previewResult.status === 'error'
                    ? <div className="agg-dialog__preview-error">{stage.previewResult.message}</div>
                    : <PreviewTable resultSet={stage.previewResult.resultSet} />
                )}
              </div>
            </div>
          </div>

          {stage.jsonError && (
            <div className="agg-dialog__stage-error">{stage.jsonError}</div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main dialog ───────────────────────────────────────────────────────────────

interface ManageMongoAggregationsDialogProps {
  connectionId: string
  databaseName: string
  collectionName: string
  initialAggregationId?: string
  openOnNew?: boolean
  onClose: () => void
  onSuccess: () => void
}

export default function ManageMongoAggregationsDialog({
  connectionId,
  databaseName,
  collectionName,
  initialAggregationId,
  openOnNew,
  onClose,
  onSuccess
}: ManageMongoAggregationsDialogProps): React.JSX.Element {
  const { t } = useTranslation()
  const [aggregations, setAggregations] = useState<MongoAggregationDefinition[]>([])
  const [editState, setEditState] = useState<EditState | null>(null)
  const [loadingList, setLoadingList] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sampleDocs, setSampleDocs] = useState<string[]>([])
  const [examplesExpanded, setExamplesExpanded] = useState(false)
  const [collectionFields, setCollectionFields] = useState<string[]>([])
  const [monacoInstance, setMonacoInstance] = useState<typeof Monaco | null>(null)
  const completionProviderRef = useRef<Monaco.IDisposable | null>(null)
  const dragIndexRef = useRef<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  // Load aggregations
  const loadAggregations = useCallback(async () => {
    setLoadingList(true)
    const result = await window.api.database.getMongoAggregations(connectionId, databaseName, collectionName)
    setLoadingList(false)
    if (result.status === 'ok') setAggregations(result.aggregations)
  }, [connectionId, databaseName, collectionName])

  useEffect(() => { void loadAggregations() }, [loadAggregations])

  // Load collection fields for intellisense
  useEffect(() => {
    void (async () => {
      const result = await window.api.database.getCollectionFields(connectionId, databaseName, collectionName)
      if (result.status === 'ok') setCollectionFields(result.fields)
    })()
  }, [connectionId, databaseName, collectionName])

  // Load sample documents
  useEffect(() => {
    void (async () => {
      const result = await window.api.database.getMongoAggregationSample(connectionId, databaseName, collectionName, 3)
      if (result.status === 'ok') setSampleDocs(result.documents)
    })()
  }, [connectionId, databaseName, collectionName])

  // Register Monaco completion provider for field intellisense
  useEffect(() => {
    if (!monacoInstance || collectionFields.length === 0) return
    completionProviderRef.current?.dispose()
    completionProviderRef.current = monacoInstance.languages.registerCompletionItemProvider('json', {
      triggerCharacters: ['$', '"'],
      provideCompletionItems: (_model, position, _context, _token) => {
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: position.column,
          endColumn: position.column
        }
        const suggestions: Monaco.languages.CompletionItem[] = collectionFields.map((field) => ({
          label: `$${field}`,
          kind: monacoInstance.languages.CompletionItemKind.Field,
          insertText: `$${field}`,
          documentation: `Field: ${field}`,
          range
        }))
        return { suggestions }
      }
    })
    return () => { completionProviderRef.current?.dispose() }
  }, [monacoInstance, collectionFields])

  const handleMonacoReady = useCallback((monaco: typeof Monaco) => {
    setMonacoInstance((prev) => prev ?? monaco)
  }, [])

  // Select initial aggregation after list loads
  useEffect(() => {
    if (loadingList) return
    if (initialAggregationId) {
      const found = aggregations.find((a) => a.id === initialAggregationId)
      if (found) { setEditState(aggDefToEditState(found)); return }
    }
    if (openOnNew) startAddNew()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingList])

  function startAddNew(): void {
    setError(null)
    setEditState({ id: null, name: 'New Aggregation', stages: [] })
  }

  function selectAggregation(agg: MongoAggregationDefinition): void {
    setError(null)
    setEditState(aggDefToEditState(agg))
  }

  function updateStage(stageId: string, patch: Partial<AggStageState>): void {
    setEditState((prev) => {
      if (!prev) return prev
      return { ...prev, stages: prev.stages.map((s) => s.id === stageId ? { ...s, ...patch } : s) }
    })
  }

  function deleteStage(stageId: string): void {
    setEditState((prev) => {
      if (!prev) return prev
      return { ...prev, stages: prev.stages.filter((s) => s.id !== stageId) }
    })
  }

  function addStage(): void {
    setEditState((prev) => {
      if (!prev) return prev
      return { ...prev, stages: [...prev.stages, makeDefaultStage()] }
    })
  }

  function handleDragStart(index: number): void {
    dragIndexRef.current = index
  }

  function handleDragOver(index: number): void {
    setDragOverIndex(index)
  }

  function handleDrop(): void {
    const from = dragIndexRef.current
    const to = dragOverIndex
    if (from === null || to === null || from === to) {
      dragIndexRef.current = null
      setDragOverIndex(null)
      return
    }
    setEditState((prev) => {
      if (!prev) return prev
      const stages = [...prev.stages]
      const [moved] = stages.splice(from, 1)
      stages.splice(to, 0, moved)
      return { ...prev, stages }
    })
    dragIndexRef.current = null
    setDragOverIndex(null)
  }

  async function handleSave(): Promise<void> {
    if (!editState) return
    const name = editState.name.trim()
    if (!name) { setError('Name is required'); return }

    for (const stage of editState.stages) {
      if (!stage.stageType) { setError(`Stage #${editState.stages.indexOf(stage) + 1} has no stage type`); return }
      if (stage.jsonError) { setError(`Stage #${editState.stages.indexOf(stage) + 1} has invalid JSON`); return }
      try { JSON.parse(stage.json) } catch {
        setError(`Stage #${editState.stages.indexOf(stage) + 1} has invalid JSON`)
        return
      }
    }

    setIsSaving(true)
    setError(null)
    const params = {
      name,
      stages: editState.stages.map((s) => ({
        id: s.id, stageType: s.stageType, json: s.json, enabled: s.enabled, collapsed: s.collapsed
      }))
    }
    const result = await window.api.database.saveMongoAggregation(
      connectionId, databaseName, collectionName, params, editState.id ?? undefined
    )
    setIsSaving(false)
    if (result.status === 'error') { setError(result.message); return }
    await loadAggregations()
    setEditState((prev) => prev ? { ...prev, id: result.id } : prev)
    onSuccess()
  }

  async function handleDelete(): Promise<void> {
    if (!editState?.id) return
    setIsDeleting(true)
    setError(null)
    const result = await window.api.database.deleteMongoAggregation(
      connectionId, databaseName, collectionName, editState.id
    )
    setIsDeleting(false)
    if (result.status === 'error') { setError(result.message); return }
    setEditState(null)
    await loadAggregations()
    onSuccess()
  }

  const isBusy = isSaving || isDeleting

  const footerLeft = editState?.id
    ? (
      <Button
              variant="danger"
        onClick={() => void handleDelete()}
        disabled={isBusy}
      >
        {isDeleting ? t('explorer.manageAggregations.deletingButton') : t('explorer.manageAggregations.deleteButton')}
      </Button>
    )
    : null

  const footerRight = (
    <>
      <Button
              variant="ghost"
        onClick={onClose}
        disabled={isBusy}
      >
        {t('explorer.manageAggregations.cancelButton')}
      </Button>
      <Button
              variant="primary"
        onClick={() => void handleSave()}
        disabled={isBusy || !editState}
      >
        {isSaving ? t('explorer.manageAggregations.savingButton') : editState?.id ? t('explorer.manageAggregations.saveButton') : t('explorer.manageAggregations.createButton')}
      </Button>
    </>
  )

  return (
    <BaseDialog
      title="Manage Aggregations"
      icon={<GitMerge size={16} />}
      onClose={onClose}
      closeDisabled={isBusy}
      width="1200px"
      height="720px"
      minWidth="900px"
      minHeight="500px"
      footerSpaceBetween={!!editState?.id}
      footer={
        <>
          {footerLeft}
          {footerRight}
        </>
      }
    >
      <div className="agg-dialog__body">
        {/* ── Left panel ── */}
        <div className="agg-dialog__list-panel">
          <div className="agg-dialog__list-header">Aggregations</div>
          <div className="agg-dialog__list">
            {loadingList ? (
              <div className="agg-dialog__empty-state">Loading…</div>
            ) : aggregations.length === 0 ? (
              <div className="agg-dialog__empty-state" style={{ padding: '1.5rem 1rem' }}>No aggregations yet</div>
            ) : (
              aggregations.map((agg) => (
                <div
                  key={agg.id}
                  className={`agg-dialog__list-item ${editState?.id === agg.id ? 'agg-dialog__list-item--selected' : ''}`}
                  onClick={() => selectAggregation(agg)}
                >
                  {agg.name || <span style={{ fontStyle: 'italic', opacity: 0.6 }}>Unnamed</span>}
                </div>
              ))
            )}
          </div>
          <button className="agg-dialog__list-add" onClick={startAddNew}>
            <Plus size={13} /> Add
          </button>
        </div>

        {/* ── Right panel ── */}
        <div className="agg-dialog__editor-panel">
          {editState === null ? (
            <div className="agg-dialog__empty-state">
              Select an aggregation or click Add to create one.
            </div>
          ) : (
            <div className="agg-dialog__editor-body">
              {error && <ErrorBox error={error} />}

              {/* Name */}
              <div className="agg-dialog__field">
                <label className="agg-dialog__label">Name</label>
                <input
                  className="agg-dialog__input"
                  type="text"
                  value={editState.name}
                  onChange={(e) => setEditState((prev) => prev ? { ...prev, name: e.target.value } : prev)}
                  placeholder="Aggregation name…"
                />
              </div>

              {/* Document examples */}
              <div className="agg-dialog__examples-section">
                <button
                  className="agg-dialog__examples-toggle"
                  onClick={() => setExamplesExpanded((v) => !v)}
                >
                  {examplesExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                  Document Examples ({sampleDocs.length})
                </button>
                {examplesExpanded && (
                  <div className="agg-dialog__examples-body">
                    {sampleDocs.length === 0
                      ? <div style={{ color: 'var(--color-muted)', fontSize: 'var(--font-xs)' }}>No documents</div>
                      : sampleDocs.map((doc, i) => (
                          <pre key={i} className="agg-dialog__example-doc"><JsonHighlight json={doc} /></pre>
                        ))
                    }
                  </div>
                )}
              </div>

              {/* Stages */}
              <div>
                <div className="agg-dialog__stages-header">
                  <span className="agg-dialog__stages-title">Pipeline Stages</span>
                  <button className="agg-dialog__add-stage-btn" onClick={addStage}>
                    <Plus size={12} /> Add Stage
                  </button>
                </div>

                {editState.stages.length === 0 ? (
                  <div className="agg-dialog__stages-empty">
                    No stages yet. Click "Add Stage" to build your pipeline.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {editState.stages.map((stage, idx) => (
                      <StageCard
                        key={stage.id}
                        stage={stage}
                        stageIndex={idx}
                        totalStages={editState.stages.length}
                        allStages={editState.stages}
                        connectionId={connectionId}
                        databaseName={databaseName}
                        collectionName={collectionName}
                        onUpdate={updateStage}
                        onDelete={deleteStage}
                        onDragStart={handleDragStart}
                        onDragOver={handleDragOver}
                        onDrop={handleDrop}
                        isDragTarget={dragOverIndex === idx}
                        onMonacoReady={handleMonacoReady}
                      />
                    ))}
                  </div>
                )}
              </div>

            </div>
          )}
        </div>
      </div>
    </BaseDialog>
  )
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  type Edge,
  useNodesState,
  useEdgesState,
  type NodeTypes
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useTranslation } from 'react-i18next'
import type { SelectedTable, ErdRelationship } from './queryEditorTypes'
import type { ErdTable } from '../erd.types'
import QueryTableNode, { type QueryTableNodeType } from './QueryTableNode'
import './QueryTableCanvas.css'

interface QueryTableCanvasProps {
  tables: SelectedTable[]
  allTables: ErdTable[]
  relationships: ErdRelationship[]
  onAddTables: (tables: ErdTable[]) => void
  onRemoveTable: (schema: string, name: string) => void
  onColumnToggle: (tableSchema: string, tableName: string, columnName: string, checked: boolean) => void
  checkedColumns: Set<string>
  addPanelOpen: boolean
  onAddPanelOpenChange: (open: boolean) => void
}

const NODE_TYPES: NodeTypes = {
  queryTableNode: QueryTableNode
}

function buildNodes(
  tables: SelectedTable[],
  checkedColumns: Set<string>,
  onRemove: (schema: string, name: string) => void,
  onColumnToggle: (tableSchema: string, tableName: string, columnName: string, checked: boolean) => void,
  existingPositions?: Map<string, { x: number; y: number }>
): QueryTableNodeType[] {
  return tables.map((t, i) => ({
    id: `${t.schema}.${t.name}`,
    type: 'queryTableNode' as const,
    position: existingPositions?.get(`${t.schema}.${t.name}`) ?? { x: i * 280, y: 20 },
    data: {
      schema: t.schema,
      name: t.name,
      alias: t.alias,
      columns: t.columns,
      checkedColumns,
      onRemove,
      onColumnToggle
    }
  }))
}

function buildEdges(tables: SelectedTable[], relationships: ErdRelationship[]): Edge[] {
  const tableKeys = new Set(tables.map((t) => `${t.schema}.${t.name}`))
  const seen = new Set<string>()
  const edges: Edge[] = []

  for (const rel of relationships) {
    const fromKey = `${rel.fromSchema}.${rel.fromTable}`
    const toKey = `${rel.toSchema}.${rel.toTable}`
    if (!tableKeys.has(fromKey) || !tableKeys.has(toKey)) continue
    const edgeKey = [fromKey, toKey].sort().join('--')
    if (seen.has(edgeKey)) continue
    seen.add(edgeKey)
    edges.push({
      id: `edge-${rel.constraintName}`,
      source: fromKey,
      target: toKey,
      style: { stroke: 'var(--color-muted)', strokeDasharray: '4 3', strokeWidth: 1 },
      animated: false
    })
  }
  return edges
}

interface AddTablesPanelProps {
  allTables: ErdTable[]
  selectedTables: SelectedTable[]
  onAdd: (tables: ErdTable[]) => void
  onClose: () => void
}

function AddTablesPanel({ allTables, selectedTables, onAdd, onClose }: AddTablesPanelProps) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const selectedKeys = new Set(selectedTables.map((t) => `${t.schema}.${t.name}`))
  const available = allTables.filter((t) => !selectedKeys.has(`${t.schema}.${t.name}`))
  const filtered = search.trim()
    ? available.filter(
        (t) =>
          t.name.toLowerCase().includes(search.toLowerCase()) ||
          t.schema.toLowerCase().includes(search.toLowerCase())
      )
    : available

  return (
    <div className="qtc-add-panel" role="dialog" aria-label={t('explorer.manageViews.queryEditor.addTable')}>
      <div className="qtc-add-panel__header">
        <span>{t('explorer.manageViews.queryEditor.addTable')}</span>
        <button className="qtc-add-panel__close" onClick={onClose} aria-label="Close">×</button>
      </div>
      <input
        className="qtc-add-panel__search"
        placeholder="Filter tables…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        autoFocus
      />
      <div className="qtc-add-panel__list">
        {filtered.length === 0 ? (
          <div className="qtc-add-panel__empty">No tables available</div>
        ) : (
          filtered.map((tbl) => (
            <button
              key={`${tbl.schema}.${tbl.name}`}
              className="qtc-add-panel__item"
              onClick={() => {
                onAdd([tbl])
              }}
            >
              {tbl.schema}.{tbl.name}
            </button>
          ))
        )}
      </div>
    </div>
  )
}

function QueryTableCanvasInner({
  tables,
  allTables,
  relationships,
  onAddTables,
  onRemoveTable,
  onColumnToggle,
  checkedColumns,
  addPanelOpen,
  onAddPanelOpenChange
}: QueryTableCanvasProps) {
  const { t } = useTranslation()

  const initialNodes = useMemo(
    () => buildNodes(tables, checkedColumns, onRemoveTable, onColumnToggle),
    [] // eslint-disable-line react-hooks/exhaustive-deps
  )
  const initialEdges = useMemo(() => buildEdges(tables, relationships), []) // eslint-disable-line react-hooks/exhaustive-deps

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  // Keep refs to the latest callbacks so node data stays up to date without
  // recreating nodeTypes (which would cause React Flow to remount all nodes)
  const onRemoveRef = useRef(onRemoveTable)
  const onColumnToggleRef = useRef(onColumnToggle)
  onRemoveRef.current = onRemoveTable
  onColumnToggleRef.current = onColumnToggle

  // Sync nodes when tables or checked columns change
  useEffect(() => {
    setNodes((prev) => {
      const posMap = new Map(prev.map((n) => [n.id, n.position]))
      return buildNodes(tables, checkedColumns, onRemoveRef.current, onColumnToggleRef.current, posMap)
    })
    setEdges(buildEdges(tables, relationships))
  }, [tables, relationships, checkedColumns, setNodes, setEdges])

  const handleAddTables = useCallback(
    (newTables: ErdTable[]) => {
      onAddTables(newTables)
      onAddPanelOpenChange(false)
    },
    [onAddTables, onAddPanelOpenChange]
  )

  return (
    <div className="qtc">

      <div className="qtc__canvas">
        {tables.length === 0 ? (
          <div className="qtc__empty">{t('explorer.manageViews.queryEditor.canvasEmpty')}</div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={NODE_TYPES}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.3}
            maxZoom={2}
            nodesDraggable
            nodesConnectable={false}
            elementsSelectable={false}
            panOnDrag
            zoomOnScroll
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="var(--color-border)" />
          </ReactFlow>
        )}
      </div>

      {addPanelOpen && (
        <div className="qtc__add-panel-overlay">
          <AddTablesPanel
            allTables={allTables}
            selectedTables={tables}
            onAdd={handleAddTables}
            onClose={() => onAddPanelOpenChange(false)}
          />
        </div>
      )}
    </div>
  )
}

export default function QueryTableCanvas(props: QueryTableCanvasProps) {
  return (
    <ReactFlowProvider>
      <QueryTableCanvasInner {...props} />
    </ReactFlowProvider>
  )
}

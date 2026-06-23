import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  useReactFlow,
  Background,
  MiniMap,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeProps
} from '@xyflow/react'
import dagre from '@dagrejs/dagre'
import {
  Table2,
  Search,
  ArrowUpDown,
  Repeat,
  Filter,
  ArrowUp,
  Layers,
  GitMerge,
  Zap,
  TrendingUp,
  ScanLine,
  Hash,
  Database,
  AlertCircle
} from 'lucide-react'
import './ExecutionPlanCanvas.css'

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export interface PlanNode {
  id: string
  physicalOp: string
  logicalOp: string
  estimateRows: number
  estimatedTotalSubtreeCost: number
  estimateCPU: number
  estimateIO: number
  tableRef?: string
  indexRef?: string
  parallelism?: number
  outputColumnCount: number
  /** Computed: node's own cost (subtree cost – sum of children's subtree costs) */
  individualCost: number
  /** Computed: individual cost / root's subtree cost * 100  */
  costPercent: number
  childIds: string[]
}

// --------------------------------------------------------------------------
// XML Parsing
// --------------------------------------------------------------------------

const SHOWPLAN_NS = 'http://schemas.microsoft.com/sqlserver/2004/07/showplan'

function attr(el: Element, name: string): string {
  return el.getAttribute(name) ?? ''
}

function floatAttr(el: Element, name: string): number {
  return parseFloat(el.getAttribute(name) ?? '0') || 0
}

/** Returns direct child RelOp elements of `el` (does not recurse through nested RelOps). */
function getDirectChildRelOps(el: Element): Element[] {
  const children: Element[] = []
  function walk(node: Element): void {
    for (const child of Array.from(node.children)) {
      if (child.localName === 'RelOp') {
        children.push(child)
      } else {
        walk(child)
      }
    }
  }
  walk(el)
  return children
}

/** Extract table / index references if present. */
function getObjectRef(relOpEl: Element): { tableRef?: string; indexRef?: string } {
  const objectEl = relOpEl.querySelector('Object') ??
    relOpEl.querySelector('[localName="Object"]')
  if (!objectEl) {
    // try namespace-aware
    const objs = relOpEl.getElementsByTagNameNS(SHOWPLAN_NS, 'Object')
    if (objs.length === 0) return {}
    const obj = objs[0]
    return {
      tableRef: obj.getAttribute('Table') ?? undefined,
      indexRef: obj.getAttribute('Index') ?? undefined
    }
  }
  return {
    tableRef: objectEl.getAttribute('Table') ?? undefined,
    indexRef: objectEl.getAttribute('Index') ?? undefined
  }
}

let nodeIdCounter = 0

function parseRelOp(
  el: Element,
  nodesMap: Map<string, PlanNode>
): string {
  const id = String(nodeIdCounter++)
  const { tableRef, indexRef } = getObjectRef(el)

  const outputCols = el.getElementsByTagNameNS(SHOWPLAN_NS, 'ColumnReference').length

  const childEls = getDirectChildRelOps(el)
  const childIds: string[] = childEls.map((c) => parseRelOp(c, nodesMap))

  const node: PlanNode = {
    id,
    physicalOp: attr(el, 'PhysicalOp'),
    logicalOp: attr(el, 'LogicalOp'),
    estimateRows: floatAttr(el, 'EstimateRows'),
    estimatedTotalSubtreeCost: floatAttr(el, 'EstimatedTotalSubtreeCost'),
    estimateCPU: floatAttr(el, 'EstimateCPU'),
    estimateIO: floatAttr(el, 'EstimateIO'),
    tableRef: tableRef ? tableRef.replace(/^\[|\]$/g, '') : undefined,
    indexRef: indexRef ? indexRef.replace(/^\[|\]$/g, '') : undefined,
    parallelism: floatAttr(el, 'Parallel') || undefined,
    outputColumnCount: outputCols,
    childIds,
    individualCost: 0,
    costPercent: 0
  }

  nodesMap.set(id, node)
  return id
}

function computeCosts(rootId: string, nodesMap: Map<string, PlanNode>): void {
  const root = nodesMap.get(rootId)!
  const totalCost = root.estimatedTotalSubtreeCost || 1

  function visit(id: string): void {
    const node = nodesMap.get(id)!
    const childrenSubtreeCost = node.childIds.reduce((sum, cid) => {
      const c = nodesMap.get(cid)!
      return sum + c.estimatedTotalSubtreeCost
    }, 0)
    node.individualCost = Math.max(0, node.estimatedTotalSubtreeCost - childrenSubtreeCost)
    node.costPercent = (node.individualCost / totalCost) * 100
    for (const cid of node.childIds) visit(cid)
  }
  visit(rootId)
}

/**
 * Split a string that may contain multiple concatenated ShowPlanXML documents
 * into an array of individual XML document strings.
 */
function splitShowPlanDocuments(xml: string): string[] {
  const docs: string[] = []
  const regex = /<ShowPlanXML[\s\S]*?<\/ShowPlanXML>/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(xml)) !== null) {
    docs.push(match[0])
  }
  return docs.length > 0 ? docs : [xml]
}

/**
 * Parse a SQL Server XML showplan string (one or more `<ShowPlanXML>` roots)
 * into an array of root PlanNode IDs + the complete nodes map.
 */
function parsePlan(xml: string): {
  rootIds: string[]
  nodesMap: Map<string, PlanNode>
} | null {
  nodeIdCounter = 0
  try {
    const xmlDocStrings = splitShowPlanDocuments(xml)
    const nodesMap = new Map<string, PlanNode>()
    const rootIds: string[] = []

    for (const xmlDocStr of xmlDocStrings) {
      const parser = new DOMParser()
      const doc = parser.parseFromString(xmlDocStr, 'text/xml')
      const parseError = doc.querySelector('parsererror')
      if (parseError) continue

      // Collect all root RelOp elements (one per statement)
      const queryPlanEls = doc.getElementsByTagNameNS(SHOWPLAN_NS, 'QueryPlan')

      const target = queryPlanEls.length > 0
        ? Array.from(queryPlanEls)
        : Array.from(doc.getElementsByTagName('QueryPlan'))

      for (const qpEl of target) {
        const relOps = qpEl.getElementsByTagNameNS(SHOWPLAN_NS, 'RelOp').length > 0
          ? Array.from(qpEl.children).filter((c) => c.localName === 'RelOp')
          : Array.from(qpEl.children).filter((c) => c.tagName === 'RelOp')

        if (relOps.length > 0) {
          const rootId = parseRelOp(relOps[0], nodesMap)
          computeCosts(rootId, nodesMap)
          rootIds.push(rootId)
        }
      }
    }

    return rootIds.length > 0 ? { rootIds, nodesMap } : null
  } catch {
    return null
  }
}

// --------------------------------------------------------------------------
// Graph layout helpers
// --------------------------------------------------------------------------

const NODE_WIDTH = 168
const NODE_HEIGHT = 80

function buildDagreLayout(
  rootIds: string[],
  nodesMap: Map<string, PlanNode>
): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir: 'LR', nodesep: 24, ranksep: 48, marginx: 16, marginy: 16 })
  g.setDefaultEdgeLabel(() => ({}))

  // Add all nodes
  for (const [id] of nodesMap) {
    g.setNode(id, { width: NODE_WIDTH, height: NODE_HEIGHT })
  }

  // Add edges (parent → child), offset roots if multiple
  const edges: Edge[] = []
  let stmtOffset = 0
  for (const rootId of rootIds) {
    function addEdges(id: string): void {
      const node = nodesMap.get(id)!
      for (const cid of node.childIds) {
        g.setEdge(id, cid)
        edges.push({
          id: `e-${id}-${cid}`,
          source: id,
          target: cid,
          label: nodesMap.get(cid)!.estimateRows > 0
            ? formatRows(nodesMap.get(cid)!.estimateRows)
            : undefined,
          type: 'smoothstep',
          style: { stroke: 'var(--color-border-accent)', strokeWidth: 1.5 },
          labelStyle: { fill: 'var(--color-muted)', fontSize: 10 },
          labelBgStyle: { fill: 'var(--color-bg)', fillOpacity: 0.8 }
        })
        addEdges(cid)
      }
    }
    addEdges(rootId)
    stmtOffset++
  }

  dagre.layout(g)

  const nodes: Node[] = []
  for (const [id, planNode] of nodesMap) {
    const pos = g.node(id)
    nodes.push({
      id,
      type: 'executionPlanNode',
      position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 },
      data: { planNode }
    })
  }

  return { nodes, edges }
}

// --------------------------------------------------------------------------
// Formatting helpers
// --------------------------------------------------------------------------

function formatRows(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return value.toFixed(value < 1 ? 2 : 0)
}

function formatCost(value: number): string {
  if (value === 0) return '0'
  if (value < 0.001) return value.toExponential(2)
  return value.toFixed(4)
}

/** Returns a CSS class suffix based on cost percentage. */
function costClass(pct: number): string {
  if (pct >= 50) return 'critical'
  if (pct >= 25) return 'high'
  if (pct >= 10) return 'medium'
  if (pct >= 3) return 'low'
  return 'minimal'
}

// --------------------------------------------------------------------------
// Operator icon mapping
// --------------------------------------------------------------------------

const OPERATOR_ICONS: Record<string, React.ElementType> = {
  'clustered index scan': Table2,
  'clustered index seek': Search,
  'index scan': ScanLine,
  'index seek': Search,
  'table scan': Table2,
  sort: ArrowUpDown,
  'hash match': Hash,
  'merge join': GitMerge,
  'nested loops': Repeat,
  filter: Filter,
  top: ArrowUp,
  'compute scalar': Zap,
  'stream aggregate': TrendingUp,
  'hash aggregate': TrendingUp,
  'parallelism': Layers,
  'remote query': Database
}

function getOperatorIcon(physicalOp: string): React.ElementType {
  const key = physicalOp.toLowerCase()
  for (const [pattern, Icon] of Object.entries(OPERATOR_ICONS)) {
    if (key.includes(pattern)) return Icon
  }
  return Layers
}

// --------------------------------------------------------------------------
// Custom React Flow node
// --------------------------------------------------------------------------

interface ExecutionPlanNodeData {
  planNode: PlanNode
  [key: string]: unknown
}

function ExecutionPlanNode({ data }: NodeProps<Node<ExecutionPlanNodeData>>): React.JSX.Element {
  const { planNode } = data
  const [hovered, setHovered] = useState(false)
  const Icon = getOperatorIcon(planNode.physicalOp)
  const cls = costClass(planNode.costPercent)
  const pctDisplay = planNode.costPercent < 0.1 ? '<0.1%' : `${planNode.costPercent.toFixed(1)}%`

  return (
    <div
      className={`ep-node ep-node--${cls}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Handle type="target" position={Position.Left} className="ep-node__handle" />

      <div className="ep-node__cost-bar">
        <div
          className={`ep-node__cost-fill ep-node__cost-fill--${cls}`}
          style={{ width: `${Math.min(100, planNode.costPercent)}%` }}
        />
      </div>

      <div className="ep-node__content">
        <div className={`ep-node__icon-wrap ep-node__icon-wrap--${cls}`}>
          <Icon size={14} strokeWidth={1.5} />
        </div>
        <div className="ep-node__info">
          <p className="ep-node__op">{planNode.physicalOp}</p>
          {planNode.tableRef && (
            <p className="ep-node__table">{planNode.tableRef}</p>
          )}
          <p className="ep-node__stats">
            <span className={`ep-node__cost-pct ep-node__cost-pct--${cls}`}>{pctDisplay}</span>
            <span className="ep-node__separator"> · </span>
            <span>{formatRows(planNode.estimateRows)} rows</span>
          </p>
        </div>
      </div>

      {hovered && (
        <div className="ep-node__tooltip">
          <p className="ep-node__tooltip-title">{planNode.physicalOp}</p>
          {planNode.logicalOp && planNode.logicalOp !== planNode.physicalOp && (
            <p className="ep-node__tooltip-logical">Logical: {planNode.logicalOp}</p>
          )}
          <div className="ep-node__tooltip-grid">
            <span>Cost</span>
            <span>{pctDisplay} of query</span>
            <span>Estimated Rows</span>
            <span>{formatRows(planNode.estimateRows)}</span>
            <span>CPU Cost</span>
            <span>{formatCost(planNode.estimateCPU)}</span>
            <span>I/O Cost</span>
            <span>{formatCost(planNode.estimateIO)}</span>
            <span>Subtree Cost</span>
            <span>{formatCost(planNode.estimatedTotalSubtreeCost)}</span>
            {planNode.tableRef && (
              <>
                <span>Table</span>
                <span>{planNode.tableRef}</span>
              </>
            )}
            {planNode.indexRef && (
              <>
                <span>Index</span>
                <span>{planNode.indexRef}</span>
              </>
            )}
          </div>
        </div>
      )}

      <Handle type="source" position={Position.Right} className="ep-node__handle" />
    </div>
  )
}

const NODE_TYPES = { executionPlanNode: ExecutionPlanNode }

// --------------------------------------------------------------------------
// Statement selector
// --------------------------------------------------------------------------

interface StatementSelectorProps {
  count: number
  active: number
  onChange: (index: number) => void
}

function StatementSelector({ count, active, onChange }: StatementSelectorProps): React.JSX.Element {
  return (
    <div className="ep-stmt-selector">
      {Array.from({ length: count }, (_, i) => (
        <button
          key={i}
          className={`ep-stmt-selector__btn${active === i ? ' ep-stmt-selector__btn--active' : ''}`}
          onClick={() => onChange(i)}
        >
          Statement {i + 1}
        </button>
      ))}
    </div>
  )
}

// --------------------------------------------------------------------------
// Inner canvas (needs ReactFlow context)
// --------------------------------------------------------------------------

interface InnerCanvasProps {
  nodes: Node[]
  edges: Edge[]
}

function InnerCanvas({ nodes: initialNodes, edges: initialEdges }: InnerCanvasProps): React.JSX.Element {
  const [nodes, , onNodesChange] = useNodesState(initialNodes)
  const [edges, , onEdgesChange] = useEdgesState(initialEdges)
  const { fitView } = useReactFlow()
  const fitted = useRef(false)

  useEffect(() => {
    if (!fitted.current) {
      fitted.current = true
      requestAnimationFrame(() => {
        fitView({ padding: 0.15, duration: 300 })
      })
    }
  }, [fitView])

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={NODE_TYPES}
      minZoom={0.1}
      maxZoom={2}
      fitView
      proOptions={{ hideAttribution: true }}
    >
      <Background color="var(--color-border)" gap={20} style={{ opacity: 0.4 }} />
      <MiniMap
        nodeColor={(n) => {
          const pn = (n.data as ExecutionPlanNodeData).planNode
          const cls = costClass(pn.costPercent)
          if (cls === 'critical') return '#ff4444'
          if (cls === 'high') return '#ff8c00'
          if (cls === 'medium') return '#e0c030'
          if (cls === 'low') return '#7cbf5a'
          return '#3a3a3a'
        }}
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
        maskColor="rgba(0,0,0,0.4)"
      />
    </ReactFlow>
  )
}

// --------------------------------------------------------------------------
// Main exported component
// --------------------------------------------------------------------------

interface ExecutionPlanCanvasProps {
  planXml: string
}

function ExecutionPlanCanvasInner({ planXml }: ExecutionPlanCanvasProps): React.JSX.Element {
  const [activeStatement, setActiveStatement] = useState(0)

  const parsed = useMemo(() => parsePlan(planXml), [planXml])

  const { nodes, edges } = useMemo(() => {
    if (!parsed) return { nodes: [], edges: [] }
    const safeParsed = parsed
    const rootId = safeParsed.rootIds[activeStatement]
    if (!rootId) return { nodes: [], edges: [] }

    // Build sub-map for only the active statement's subtree
    const subMap = new Map<string, PlanNode>()
    function collect(id: string): void {
      const n = safeParsed.nodesMap.get(id)
      if (n) {
        subMap.set(id, n)
        n.childIds.forEach(collect)
      }
    }
    collect(rootId)

    return buildDagreLayout([rootId], subMap)
  }, [parsed, activeStatement])

  if (!parsed) {
    return (
      <div className="ep-error">
        <AlertCircle size={16} />
        <span>Could not parse execution plan XML.</span>
      </div>
    )
  }

  return (
    <div className="ep-canvas">
      {parsed.rootIds.length > 1 && (
        <StatementSelector
          count={parsed.rootIds.length}
          active={activeStatement}
          onChange={setActiveStatement}
        />
      )}
      <ReactFlowProvider>
        <InnerCanvas nodes={nodes} edges={edges} />
      </ReactFlowProvider>
    </div>
  )
}

export default function ExecutionPlanCanvas(props: ExecutionPlanCanvasProps): React.JSX.Element {
  return <ExecutionPlanCanvasInner {...props} />
}

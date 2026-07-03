import Dagre from '@dagrejs/dagre'
import { useCallback, useEffect, useMemo, useRef, useState, memo } from 'react'
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  getNodesBounds,
  ReactFlowProvider,
  MarkerType,
  type Node,
  type Edge,
  type Connection
} from '@xyflow/react'
import { toPng } from 'html-to-image'
import '@xyflow/react/dist/style.css'
import {
  GitBranch,
  Minus,
  ArrowRight,
  Type,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Loader2,
  AlertCircle,
  Square,
  CircleDot,
  Grid2X2,
  Trash2,
  TableProperties
} from 'lucide-react'
import { useSettingsContext } from '../../../contexts/SettingsContext'
import Menu, { type MenuItem } from '../../../components/Menu/Menu'
import ErdTableNode, { type ErdTableNodeData } from '../ErdTableNode/ErdTableNode'
import ErdTextNode, { type ErdTextNodeData } from '../ErdTextNode/ErdTextNode'
import ErdArrowNode, { type ErdArrowNodeData, ARROW_NODE_PADDING } from '../ErdArrowNode/ErdArrowNode'
import type { ErdSchema, ErdTable, ErdCanvasSerializedState } from '../erd.types'
import type { ErdExportOptions } from '../Dialogs/ErdExportDialog/ErdExportDialog'
import AddTablesDialog from '../Dialogs/AddTablesDialog/AddTablesDialog'
import { deriveCardinality } from './deriveCardinality'
import './ErdCanvas.css'

export type ErdBackground = 'none' | 'dots' | 'grid'

const NODE_TYPES = {
  tableNode: ErdTableNode,
  textNode: ErdTextNode,
  arrowNode: ErdArrowNode
}

const NODE_WIDTH = 260
const HEADER_HEIGHT = 40
const COL_ROW_HEIGHT = 26
const NODE_PADDING = 20

const EDGE_PRESET_COLORS = ['#8892aa', '#a1faff', '#d575ff', '#bcff5f', '#ff6b6b', '#ffb347', '#ffffff'] as const

/** Compose an edge label from the FK column name and its cardinality symbol. */
function edgeLabel(fromColumn: string, cardinality: string | undefined): string {
  return cardinality ? `${fromColumn} · ${cardinality}` : fromColumn
}

function estimateTableHeight(colCount: number): number {
  return HEADER_HEIGHT + Math.min(colCount, 20) * COL_ROW_HEIGHT + NODE_PADDING
}

function buildInitialLayout(
  schema: ErdSchema,
  edgeType: 'default' | 'smoothstep'
): { nodes: Node[]; edges: Edge[] } {
  // Deduplicate edges — one edge per FK constraint
  const cardinality = deriveCardinality(schema)
  const edgeMap = new Map<string, Edge>()
  for (const rel of schema.relationships) {
    if (!edgeMap.has(rel.constraintName)) {
      edgeMap.set(rel.constraintName, {
        id: `rel-${rel.constraintName}`,
        source: `table-${rel.fromSchema}.${rel.fromTable}`,
        target: `table-${rel.toSchema}.${rel.toTable}`,
        type: edgeType,
        markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--color-muted)' },
        style: { stroke: 'var(--color-muted)', strokeWidth: 1.5 },
        animated: false,
        label: edgeLabel(rel.fromColumn, cardinality.get(rel.constraintName)),
        labelStyle: { fontSize: 9, fill: 'var(--color-text)' },
        labelBgStyle: { fill: 'var(--color-bg)', rx: 3, ry: 3 },
        labelBgPadding: [4, 2] as [number, number]
      })
    }
  }

  const edges = Array.from(edgeMap.values())

  // Build node list with placeholder positions
  const rawNodes: Node[] = schema.tables.map((table) => ({
    id: `table-${table.schema}.${table.name}`,
    type: 'tableNode' as const,
    position: { x: 0, y: 0 },
    data: {
      schema: table.schema,
      name: table.name,
      columns: table.columns
    } as ErdTableNodeData
  }))

  // Run dagre layout to position nodes with minimal edge crossings
  const g = new Dagre.graphlib.Graph({ multigraph: true })
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({
    rankdir: 'LR',
    ranksep: 120,
    nodesep: 60,
    edgesep: 30,
    marginx: 40,
    marginy: 40
  })

  rawNodes.forEach((node) => {
    const h = estimateTableHeight((node.data as ErdTableNodeData).columns.length)
    g.setNode(node.id, { width: NODE_WIDTH, height: h })
  })

  edges.forEach((edge) => {
    g.setEdge(edge.source, edge.target, {}, edge.id)
  })

  Dagre.layout(g)

  const nodes = rawNodes.map((node) => {
    const pos = g.node(node.id)
    const h = estimateTableHeight((node.data as ErdTableNodeData).columns.length)
    return {
      ...node,
      position: {
        x: pos.x - NODE_WIDTH / 2,
        y: pos.y - h / 2
      }
    }
  })

  return { nodes, edges }
}

let textNodeCounter = 0
let arrowNodeCounter = 0

interface ErdCanvasInnerProps {
  schema?: ErdSchema
  databaseName: string
  background: ErdBackground
  onBackgroundChange: (bg: ErdBackground) => void
  exportTrigger?: ErdExportOptions | null
  onExportComplete?: () => void
  initialNodes?: Node[]
  initialEdges?: Edge[]
  initialCurveType?: 'default' | 'smoothstep'
  initialViewport?: { x: number; y: number; zoom: number }
  saveTrigger?: boolean
  onSaveComplete?: (state: ErdCanvasSerializedState) => void
}

function ErdCanvasInner({ schema, databaseName, background, onBackgroundChange, exportTrigger, onExportComplete, initialNodes, initialEdges, initialCurveType, initialViewport, saveTrigger, onSaveComplete }: ErdCanvasInnerProps) {
  const { screenToFlowPosition, getNodes, getViewport, setViewport } = useReactFlow()
  const { settings } = useSettingsContext()
  const isGlassLight = settings.theme === 'glass-light'
  const isLightTheme = settings.theme === 'light' || isGlassLight || (settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: light)').matches)
  const containerRef = useRef<HTMLDivElement>(null)
  const [curveType, setCurveType] = useState<'default' | 'smoothstep'>(initialCurveType ?? 'smoothstep')
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [isArrowMode, setIsArrowMode] = useState(false)
  const [isEdgeColorPickerOpen, setIsEdgeColorPickerOpen] = useState(false)
  const [isTextColorPickerOpen, setIsTextColorPickerOpen] = useState(false)
  const [nodeContextMenu, setNodeContextMenu] = useState<{ nodeId: string; position: { x: number; y: number } } | null>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [drawStartFlow, setDrawStartFlow] = useState<{ x: number; y: number } | null>(null)
  const [drawStartScreen, setDrawStartScreen] = useState<{ x: number; y: number } | null>(null)
  const [drawCurrentScreen, setDrawCurrentScreen] = useState<{ x: number; y: number } | null>(
    null
  )
  const [isAddTablesDialogOpen, setIsAddTablesDialogOpen] = useState(false)

  // Compute tables that are not yet rendered as nodes in the canvas
  const hiddenTables = useMemo(() => {
    if (!schema) return []
    const visibleIds = new Set(
      nodes.filter((n) => n.type === 'tableNode').map((n) => n.id)
    )
    return schema.tables.filter(
      (t) => !visibleIds.has(`table-${t.schema}.${t.name}`)
    )
  }, [nodes, schema])

  // Initialize layout when schema loads, or restore from saved state
  useEffect(() => {
    if (initialNodes !== undefined) {
      setNodes(initialNodes)
      setEdges(initialEdges ?? [])
      return
    }
    if (!schema) return
    const { nodes: initNodes, edges: initEdges } = buildInitialLayout(schema, 'smoothstep')
    setNodes(initNodes)
    setEdges(initEdges)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schema])

  // Restore saved viewport after mount
  useEffect(() => {
    if (!initialViewport) return
    setViewport(initialViewport)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Derive selected text node from node state
  const selectedTextNodeId = useMemo(() => {
    const selected = nodes.filter((n) => n.selected && n.type === 'textNode')
    return selected.length === 1 ? selected[0].id : null
  }, [nodes])

  const selectedTextNodeData = useMemo(() => {
    if (!selectedTextNodeId) return null
    const node = nodes.find((n) => n.id === selectedTextNodeId)
    return (node?.data as ErdTextNodeData) ?? null
  }, [nodes, selectedTextNodeId])

  // Derive selected edge from edge state (for edge color/style controls)
  const selectedEdge = useMemo(() => edges.find((e) => e.selected) ?? null, [edges])

  const totalColumns = useMemo(
    () => schema
      ? schema.tables.reduce((sum, t) => sum + t.columns.length, 0)
      : nodes
          .filter((n) => n.type === 'tableNode')
          .reduce((sum, n) => sum + ((n.data as ErdTableNodeData).columns?.length ?? 0), 0),
    [schema, nodes]
  )

  const toggleCurveType = useCallback(() => {
    const next = curveType === 'default' ? 'smoothstep' : 'default'
    setCurveType(next)
    setEdges((prev) => prev.map((e) => ({ ...e, type: next })))
  }, [curveType, setEdges])

  const closeNodeContextMenu = useCallback(() => setNodeContextMenu(null), [])

  const handleRemoveNode = useCallback(
    (nodeId: string) => {
      setNodes((prev) => prev.filter((n) => n.id !== nodeId))
      setEdges((prev) => prev.filter((e) => e.source !== nodeId && e.target !== nodeId))
      setNodeContextMenu(null)
    },
    [setNodes, setEdges]
  )

  const onNodeContextMenu = useCallback(
    (e: React.MouseEvent, node: Node) => {
      if (node.type !== 'tableNode') return
      e.preventDefault()
      setNodeContextMenu({ nodeId: node.id, position: { x: e.clientX, y: e.clientY } })
    },
    []
  )

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((prev) =>
        addEdge(
          {
            ...connection,
            type: curveType,
            style: { stroke: '#d575ff', strokeDasharray: '5 5', strokeWidth: 1.5 },
            markerEnd: { type: MarkerType.ArrowClosed, color: '#d575ff' },
            animated: false
          },
          prev
        )
      )
    },
    [curveType, setEdges]
  )

  const handleAddTables = useCallback(
    (tablesToAdd: ErdTable[]) => {
      if (tablesToAdd.length === 0) return

      // Find the rightmost X boundary of existing nodes to position new ones beside them
      const existingTableNodes = nodes.filter((n) => n.type === 'tableNode')
      const rightmostX =
        existingTableNodes.length > 0
          ? Math.max(...existingTableNodes.map((n) => n.position.x + NODE_WIDTH))
          : 0

      const startX = rightmostX + 80
      let currentY = 40

      const newNodes: Node[] = tablesToAdd.map((table) => {
        const h = estimateTableHeight(table.columns.length)
        const node: Node = {
          id: `table-${table.schema}.${table.name}`,
          type: 'tableNode' as const,
          position: { x: startX, y: currentY },
          data: {
            schema: table.schema,
            name: table.name,
            columns: table.columns
          } as ErdTableNodeData
        }
        currentY += h + 40
        return node
      })

      const newNodeIds = new Set(newNodes.map((n) => n.id))
      const existingNodeIds = new Set(nodes.map((n) => n.id))
      const existingEdgeConstraints = new Set(
        edges
          .map((e) => e.id.startsWith('rel-') ? e.id.slice(4) : null)
          .filter(Boolean)
      )

      // Build edges for relationships where at least one end is a newly added table
      // and the other end is either also new or already present
      const cardinality = schema ? deriveCardinality(schema) : new Map<string, string>()
      const addedEdgeMap = new Map<string, Edge>()
      for (const rel of schema?.relationships ?? []) {
        if (existingEdgeConstraints.has(rel.constraintName)) continue
        if (addedEdgeMap.has(rel.constraintName)) continue

        const sourceId = `table-${rel.fromSchema}.${rel.fromTable}`
        const targetId = `table-${rel.toSchema}.${rel.toTable}`
        const sourceVisible = existingNodeIds.has(sourceId) || newNodeIds.has(sourceId)
        const targetVisible = existingNodeIds.has(targetId) || newNodeIds.has(targetId)
        const involvesNewNode = newNodeIds.has(sourceId) || newNodeIds.has(targetId)

        if (sourceVisible && targetVisible && involvesNewNode) {
          addedEdgeMap.set(rel.constraintName, {
            id: `rel-${rel.constraintName}`,
            source: sourceId,
            target: targetId,
            type: curveType,
            markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--color-muted)' },
            style: { stroke: 'var(--color-muted)', strokeWidth: 1.5 },
            animated: false,
            label: edgeLabel(rel.fromColumn, cardinality.get(rel.constraintName)),
            labelStyle: { fontSize: 9, fill: 'var(--color-text)' },
            labelBgStyle: { fill: 'var(--color-bg)', rx: 3, ry: 3 },
            labelBgPadding: [4, 2] as [number, number]
          })
        }
      }

      setNodes((prev) => [...prev, ...newNodes])
      setEdges((prev) => [...prev, ...Array.from(addedEdgeMap.values())])
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nodes, edges, schema?.relationships, curveType, setNodes, setEdges]
  )

  const addTextNode = useCallback(
    (level: 'p' | 'h1' | 'h2' | 'h3') => {
      textNodeCounter += 1
      const newNode: Node = {
        id: `text-${textNodeCounter}`,
        type: 'textNode',
        position: { x: 80 + textNodeCounter * 30, y: 80 + textNodeCounter * 30 },
        data: {
          text: 'Double-click to edit',
          headingLevel: level,
          bold: false,
          italic: false,
          underline: false,
          strike: false
        } as ErdTextNodeData,
        selected: true
      }
      setNodes((prev) => [...prev.map((n) => ({ ...n, selected: false })), newNode])
    },
    [setNodes]
  )

  // Close edge color picker when edge is deselected
  useEffect(() => {
    if (!selectedEdge) setIsEdgeColorPickerOpen(false)
  }, [selectedEdge])

  // Close text color picker when text node is deselected
  useEffect(() => {
    if (!selectedTextNodeId) setIsTextColorPickerOpen(false)
  }, [selectedTextNodeId])

  // Export to PNG when exportTrigger is set
  useEffect(() => {
    if (!exportTrigger || !containerRef.current) return

    async function runExport(): Promise<void> {
      const opts = exportTrigger!
      const allNodes = getNodes()
      const bounds = getNodesBounds(allNodes)

      // Clip tightly to content — padding only, no artificial minimum dimensions
      const padding = 60
      const imageWidth = bounds.width + padding * 2
      const imageHeight = bounds.height + padding * 2
      const statsBarHeight = opts.includeStats ? 40 : 0
      const totalHeight = imageHeight + statsBarHeight

      // Compute pixel ratio so the long edge is at least 3840px (4K UHD), minimum 2×
      const TARGET_PX = 3840
      const pixelRatio = Math.max(Math.ceil(TARGET_PX / Math.max(imageWidth, totalHeight)), 2)

      // Compute viewport manually: zoom=1 so content renders at its natural size,
      // translate so the content's top-left lands exactly at (padding, padding).
      // getViewportForBounds uses a *fractional* padding arg which would cause the
      // zoom to collapse when passed a pixel value — so we calculate it ourselves.
      const viewportTransform = `translate(${padding - bounds.x}px, ${padding - bounds.y}px) scale(1)`

      const viewportEl = containerRef.current!.querySelector<HTMLElement>('.react-flow__viewport')
      if (!viewportEl) return

      // Capture the nodes/edges layer at full resolution
      let nodesPngUrl: string
      try {
        nodesPngUrl = await toPng(viewportEl, {
          width: imageWidth,
          height: imageHeight,
          pixelRatio,
          style: {
            width: `${imageWidth}px`,
            height: `${imageHeight}px`,
            transform: viewportTransform
          }
        })
      } catch {
        onExportComplete?.()
        return
      }

      // Compose final image — physical canvas is logical size × pixelRatio
      const canvas = document.createElement('canvas')
      canvas.width = imageWidth * pixelRatio
      canvas.height = totalHeight * pixelRatio
      const ctx = canvas.getContext('2d')!
      // Scale so all draw calls use logical coordinates; pixelRatio handled automatically
      ctx.scale(pixelRatio, pixelRatio)

      // Background fill
      if (!opts.transparent) {
        ctx.fillStyle = opts.backgroundColor
        ctx.fillRect(0, 0, imageWidth, totalHeight)
      }

      // Grid overlay
      if (opts.grid !== 'none') {
        const gap = 24
        // Determine grid color: if transparent or dark bg use a light tint, else dark tint
        const isDarkBg = opts.transparent || isColorDark(opts.backgroundColor)
        const gridColor = isDarkBg ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)'

        ctx.save()
        if (opts.grid === 'dots') {
          ctx.fillStyle = gridColor
          for (let x = gap / 2; x < imageWidth; x += gap) {
            for (let y = gap / 2; y < imageHeight; y += gap) {
              ctx.beginPath()
              ctx.arc(x, y, 1.5, 0, Math.PI * 2)
              ctx.fill()
            }
          }
        } else {
          ctx.strokeStyle = gridColor
          ctx.lineWidth = 1
          for (let x = 0; x <= imageWidth; x += gap) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, imageHeight); ctx.stroke()
          }
          for (let y = 0; y <= imageHeight; y += gap) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(imageWidth, y); ctx.stroke()
          }
        }
        ctx.restore()
      }

      // Draw nodes PNG — specify logical dimensions so drawImage maps the high-res source correctly
      await new Promise<void>((resolve) => {
        const img = new Image()
        img.onload = () => { ctx.drawImage(img, 0, 0, imageWidth, imageHeight); resolve() }
        img.onerror = () => resolve()
        img.src = nodesPngUrl
      })

      // Stats footer
      if (opts.includeStats) {
        const barY = imageHeight
        ctx.fillStyle = 'rgba(11, 14, 20, 0.93)'
        ctx.fillRect(0, barY, imageWidth, statsBarHeight)

        // Separator line at top of bar
        ctx.strokeStyle = 'rgba(255,255,255,0.08)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(0, barY)
        ctx.lineTo(imageWidth, barY)
        ctx.stroke()

        const tableNodes = nodes.filter((n) => n.type === 'tableNode')
        const tables = schema ? schema.tables.length : tableNodes.length
        const columns = schema ? schema.tables.reduce((s, t) => s + t.columns.length, 0) : tableNodes.reduce((s, n) => s + ((n.data as ErdTableNodeData).columns?.length ?? 0), 0)
        const relations = schema ? schema.relationships.length : edges.filter((e) => e.id.startsWith('rel-')).length
        const indexes = schema ? schema.indexes.length : 0
        const text = `${tables} Tables  ·  ${columns} Columns  ·  ${relations} Relations  ·  ${indexes} Indexes  ·  ${databaseName}`

        ctx.font = '600 12px "JetBrains Mono", monospace'
        ctx.fillStyle = 'rgba(200, 202, 210, 0.7)'
        ctx.textBaseline = 'middle'
        ctx.fillText(text, 20, barY + statsBarHeight / 2)
      }

      // Download
      canvas.toBlob((blob) => {
        if (!blob) return
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${databaseName || 'erd'}-erd.png`
        a.click()
        URL.revokeObjectURL(url)
      }, 'image/png')

      onExportComplete?.()
    }

    runExport()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exportTrigger])

  // Serialize canvas state for saving
  useEffect(() => {
    if (!saveTrigger || !onSaveComplete) return
    onSaveComplete({
      nodes,
      edges,
      curveType,
      viewport: getViewport()
    } as ErdCanvasSerializedState)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveTrigger])

  // Cancel draw mode on Escape
  useEffect(() => {
    if (!isArrowMode) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        setIsArrowMode(false)
        setIsDrawing(false)
        setDrawStartFlow(null)
        setDrawStartScreen(null)
        setDrawCurrentScreen(null)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isArrowMode])

  const handleDrawMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!isArrowMode) return
      // Only draw on the canvas pane background, not on nodes/panels/buttons
      const target = e.target as HTMLElement
      if (
        target.closest('.react-flow__node') ||
        target.closest('.react-flow__panel') ||
        target.closest('.react-flow__controls') ||
        target.closest('.react-flow__minimap')
      )
        return

      const rect = containerRef.current!.getBoundingClientRect()
      setDrawStartScreen({ x: e.clientX - rect.left, y: e.clientY - rect.top })
      setDrawCurrentScreen({ x: e.clientX - rect.left, y: e.clientY - rect.top })
      setDrawStartFlow(screenToFlowPosition({ x: e.clientX, y: e.clientY }))
      setIsDrawing(true)
    },
    [isArrowMode, screenToFlowPosition]
  )

  const handleDrawMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDrawing) return
      const rect = containerRef.current!.getBoundingClientRect()
      setDrawCurrentScreen({ x: e.clientX - rect.left, y: e.clientY - rect.top })
    },
    [isDrawing]
  )

  const handleDrawMouseUp = useCallback(
    (e: React.MouseEvent) => {
      if (!isDrawing || !drawStartFlow) return

      const flowEnd = screenToFlowPosition({ x: e.clientX, y: e.clientY })
      const dx = flowEnd.x - drawStartFlow.x
      const dy = flowEnd.y - drawStartFlow.y

      // Ignore tiny drags (treat as a click)
      if (Math.abs(dx) >= 10 || Math.abs(dy) >= 10) {
        const bboxMinX = Math.min(drawStartFlow.x, flowEnd.x)
        const bboxMinY = Math.min(drawStartFlow.y, flowEnd.y)
        const nodePosX = bboxMinX - ARROW_NODE_PADDING
        const nodePosY = bboxMinY - ARROW_NODE_PADDING

        arrowNodeCounter += 1
        const newNode: Node = {
          id: `arrow-${arrowNodeCounter}`,
          type: 'arrowNode',
          position: { x: nodePosX, y: nodePosY },
          data: {
            x1: drawStartFlow.x - nodePosX,
            y1: drawStartFlow.y - nodePosY,
            x2: flowEnd.x - nodePosX,
            y2: flowEnd.y - nodePosY
          } as ErdArrowNodeData,
          selected: true
        }
        setNodes((prev) => [...prev.map((n) => ({ ...n, selected: false })), newNode])
      }

      setIsDrawing(false)
      setDrawStartFlow(null)
      setDrawStartScreen(null)
      setDrawCurrentScreen(null)
      setIsArrowMode(false)
    },
    [isDrawing, drawStartFlow, screenToFlowPosition, setNodes]
  )

  const handleEdgeColorChange = useCallback(
    (color: string) => {
      if (!selectedEdge) return
      setEdges((prev) =>
        prev.map((e) => {
          if (e.id !== selectedEdge.id) return e
          const prevMarkerEnd = e.markerEnd
          const newMarkerEnd =
            typeof prevMarkerEnd === 'object' && prevMarkerEnd !== null
              ? { ...prevMarkerEnd, color }
              : prevMarkerEnd
          return { ...e, style: { ...e.style, stroke: color }, markerEnd: newMarkerEnd }
        })
      )
    },
    [selectedEdge, setEdges]
  )

  const handleEdgeDashChange = useCallback(
    (isDashed: boolean) => {
      if (!selectedEdge) return
      setEdges((prev) =>
        prev.map((e) =>
          e.id === selectedEdge.id
            ? { ...e, style: { ...e.style, strokeDasharray: isDashed ? '5 5' : undefined } }
            : e
        )
      )
    },
    [selectedEdge, setEdges]
  )

  const handleTextColorChange = useCallback(
    (color: string) => {
      if (!selectedTextNodeId) return
      setNodes((prev) =>
        prev.map((n) => {
          if (n.id !== selectedTextNodeId || n.type !== 'textNode') return n
          return { ...n, data: { ...n.data, color } }
        })
      )
    },
    [selectedTextNodeId, setNodes]
  )

  const toggleFormat = useCallback(
    (prop: 'bold' | 'italic' | 'underline' | 'strike') => {
      if (!selectedTextNodeId) return
      setNodes((prev) =>
        prev.map((n) => {
          if (n.id !== selectedTextNodeId || n.type !== 'textNode') return n
          const d = n.data as ErdTextNodeData
          return { ...n, data: { ...d, [prop]: !d[prop] } }
        })
      )
    },
    [selectedTextNodeId, setNodes]
  )

  return (
    <div
      className={`erd-canvas${isArrowMode ? ' erd-canvas--arrow-mode' : ''}`}
      ref={containerRef}
      onMouseDown={handleDrawMouseDown}
      onMouseMove={handleDrawMouseMove}
      onMouseUp={handleDrawMouseUp}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeContextMenu={onNodeContextMenu}
        onPaneClick={closeNodeContextMenu}
        onContextMenu={(e) => e.preventDefault()}
        deleteKeyCode="Delete"
        nodeTypes={NODE_TYPES}
        fitView={!initialViewport}
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.05}
        maxZoom={2}
        panOnDrag={!isArrowMode}
        proOptions={{ hideAttribution: true }}
      >
        {background === 'dots' && (
          <Background
            variant={BackgroundVariant.Dots}
            gap={24}
            size={1.5}
            color={isGlassLight ? 'rgba(0,0,0,0.14)' : isLightTheme ? 'rgba(80,55,15,0.18)' : 'rgba(255,255,255,0.18)'}
          />
        )}
        {background === 'grid' && (
          <Background
            variant={BackgroundVariant.Lines}
            gap={24}
            color={isGlassLight ? 'rgba(0,0,0,0.08)' : isLightTheme ? 'rgba(80,55,15,0.12)' : 'rgba(255,255,255,0.1)'}
          />
        )}
        <Controls className="erd-canvas__controls" />
        <MiniMap
          className="erd-canvas__minimap"
          nodeColor={(n) =>
            n.type === 'tableNode'
              ? isGlassLight ? 'rgba(0,122,255,0.3)' : isLightTheme ? 'rgba(196,98,0,0.3)' : 'rgba(161,250,255,0.3)'
              : isGlassLight ? 'rgba(130,80,223,0.3)' : isLightTheme ? 'rgba(130,50,180,0.3)' : 'rgba(213,117,255,0.3)'
          }
          maskColor={isGlassLight ? 'rgba(150,150,160,0.2)' : isLightTheme ? 'rgba(180,150,100,0.2)' : 'rgba(0,0,0,0.45)'}
          pannable
          zoomable
        />

        {/* Top-left toolbar: curve type toggle + background selector */}
        <Panel position="top-left" className="erd-canvas__toolbar">
          <button
            className={`erd-canvas__toolbar-btn${curveType === 'default' ? ' erd-canvas__toolbar-btn--active' : ''}`}
            title="Curved connections"
            onClick={toggleCurveType}
          >
            <GitBranch size={14} />
          </button>
          <button
            className={`erd-canvas__toolbar-btn${curveType === 'smoothstep' ? ' erd-canvas__toolbar-btn--active' : ''}`}
            title="Straight connections"
            onClick={toggleCurveType}
          >
            <Minus size={14} />
          </button>
          <div className="erd-canvas__toolbar-sep" />
          <button
            className={`erd-canvas__toolbar-btn${background === 'none' ? ' erd-canvas__toolbar-btn--active' : ''}`}
            title="No background"
            onClick={() => onBackgroundChange('none')}
          >
            <Square size={14} />
          </button>
          <button
            className={`erd-canvas__toolbar-btn${background === 'dots' ? ' erd-canvas__toolbar-btn--active' : ''}`}
            title="Dot grid background"
            onClick={() => onBackgroundChange('dots')}
          >
            <CircleDot size={14} />
          </button>
          <button
            className={`erd-canvas__toolbar-btn${background === 'grid' ? ' erd-canvas__toolbar-btn--active' : ''}`}
            title="Line grid background"
            onClick={() => onBackgroundChange('grid')}
          >
            <Grid2X2 size={14} />
          </button>
          <div className="erd-canvas__toolbar-sep" />
          <button
            className="erd-canvas__toolbar-btn"
            title={hiddenTables.length > 0 ? `Add tables to diagram (${hiddenTables.length} hidden)` : 'All tables are in the diagram'}
            onClick={() => setIsAddTablesDialogOpen(true)}
            disabled={hiddenTables.length === 0}
          >
            <TableProperties size={14} />
          </button>
        </Panel>

        {/* Bottom-center: stats bar + dock toolbar */}
        <Panel position="bottom-center" className="erd-canvas__bottom-panel">
          <div className="erd-canvas__stats">
            <span className="erd-canvas__stat">
              <span className="erd-canvas__stat-value">{schema ? schema.tables.length : nodes.filter((n) => n.type === 'tableNode').length}</span>
              <span className="erd-canvas__stat-label">Tables</span>
            </span>
            <span className="erd-canvas__stat-sep" />
            <span className="erd-canvas__stat">
              <span className="erd-canvas__stat-value">{totalColumns}</span>
              <span className="erd-canvas__stat-label">Columns</span>
            </span>
            <span className="erd-canvas__stat-sep" />
            <span className="erd-canvas__stat">
              <span className="erd-canvas__stat-value">{schema ? schema.relationships.length : edges.filter((e) => e.id.startsWith('rel-')).length}</span>
              <span className="erd-canvas__stat-label">Relations</span>
            </span>
            <span className="erd-canvas__stat-sep" />
            <span className="erd-canvas__stat">
              <span className="erd-canvas__stat-value">{schema?.indexes.length ?? 0}</span>
              <span className="erd-canvas__stat-label">Indexes</span>
            </span>
          </div>

          {/* Mac OS dock-style annotation toolbar */}
          <div className="erd-canvas__dock">
            {/* Add text nodes */}
            <div className="erd-canvas__dock-group">
              <button
                className="erd-canvas__dock-btn"
                title="Add Text"
                onClick={() => addTextNode('p')}
              >
                <Type size={14} />
              </button>
              <button
                className="erd-canvas__dock-btn erd-canvas__dock-btn--h1"
                title="Add Heading 1"
                onClick={() => addTextNode('h1')}
              >
                H1
              </button>
              <button
                className="erd-canvas__dock-btn erd-canvas__dock-btn--h2"
                title="Add Heading 2"
                onClick={() => addTextNode('h2')}
              >
                H2
              </button>
              <button
                className="erd-canvas__dock-btn erd-canvas__dock-btn--h3"
                title="Add Heading 3"
                onClick={() => addTextNode('h3')}
              >
                H3
              </button>
            </div>

            <div className="erd-canvas__dock-sep" />

            {/* Text formatting — visible only when a text node is selected */}
            {selectedTextNodeId && (
              <>
                <div className="erd-canvas__dock-group">
                  <button
                    className={`erd-canvas__dock-btn${selectedTextNodeData?.bold ? ' erd-canvas__dock-btn--active' : ''}`}
                    title="Bold"
                    onClick={() => toggleFormat('bold')}
                  >
                    <Bold size={14} />
                  </button>
                  <button
                    className={`erd-canvas__dock-btn${selectedTextNodeData?.italic ? ' erd-canvas__dock-btn--active' : ''}`}
                    title="Italic"
                    onClick={() => toggleFormat('italic')}
                  >
                    <Italic size={14} />
                  </button>
                  <button
                    className={`erd-canvas__dock-btn${selectedTextNodeData?.underline ? ' erd-canvas__dock-btn--active' : ''}`}
                    title="Underline"
                    onClick={() => toggleFormat('underline')}
                  >
                    <Underline size={14} />
                  </button>
                  <button
                    className={`erd-canvas__dock-btn${selectedTextNodeData?.strike ? ' erd-canvas__dock-btn--active' : ''}`}
                    title="Strikethrough"
                    onClick={() => toggleFormat('strike')}
                  >
                    <Strikethrough size={14} />
                  </button>
                  <div className="erd-canvas__edge-color-wrap">
                    <button
                      className="erd-canvas__dock-btn"
                      title="Text color"
                      onClick={() => setIsTextColorPickerOpen((prev) => !prev)}
                    >
                      <span
                        className="erd-canvas__edge-color-btn"
                        style={{ background: selectedTextNodeData?.color ?? '#ffffff' }}
                      />
                    </button>
                    {isTextColorPickerOpen && (
                      <div className="erd-canvas__edge-color-picker">
                        {EDGE_PRESET_COLORS.map((color) => (
                          <button
                            key={color}
                            className="erd-canvas__edge-color-swatch"
                            style={{ background: color }}
                            title={color}
                            onClick={() => {
                              handleTextColorChange(color)
                              setIsTextColorPickerOpen(false)
                            }}
                          />
                        ))}
                        <input
                          type="color"
                          className="erd-canvas__edge-color-input"
                          value={selectedTextNodeData?.color ?? '#ffffff'}
                          onChange={(e) => handleTextColorChange(e.target.value)}
                          title="Custom color"
                        />
                      </div>
                    )}
                  </div>
                </div>
                <div className="erd-canvas__dock-sep" />
              </>
            )}
            <div className="erd-canvas__dock-group">
              <button
                className={`erd-canvas__dock-btn${isArrowMode ? ' erd-canvas__dock-btn--active' : ''}`}
                title={isArrowMode ? 'Cancel arrow (Esc)' : 'Draw annotation arrow'}
                onClick={() => setIsArrowMode((prev) => !prev)}
              >
                <ArrowRight size={14} />
              </button>
            </div>

            {/* Edge connection style — visible when a relationship edge is selected */}
            {selectedEdge && (
              <>
                <div className="erd-canvas__dock-sep" />
                <div className="erd-canvas__dock-group">
                  <div className="erd-canvas__edge-color-wrap">
                    <button
                      className="erd-canvas__dock-btn"
                      title="Edge color"
                      onClick={() => setIsEdgeColorPickerOpen((prev) => !prev)}
                    >
                      <span
                        className="erd-canvas__edge-color-btn"
                        style={{ background: (selectedEdge.style?.stroke as string) ?? '#8892aa' }}
                      />
                    </button>
                    {isEdgeColorPickerOpen && (
                      <div className="erd-canvas__edge-color-picker">
                        {EDGE_PRESET_COLORS.map((color) => (
                          <button
                            key={color}
                            className="erd-canvas__edge-color-swatch"
                            style={{ background: color }}
                            title={color}
                            onClick={() => {
                              handleEdgeColorChange(color)
                              setIsEdgeColorPickerOpen(false)
                            }}
                          />
                        ))}
                        <input
                          type="color"
                          className="erd-canvas__edge-color-input"
                          value={(selectedEdge.style?.stroke as string) ?? '#8892aa'}
                          onChange={(e) => handleEdgeColorChange(e.target.value)}
                          title="Custom color"
                        />
                      </div>
                    )}
                  </div>
                  <button
                    className={`erd-canvas__dock-btn${!selectedEdge.style?.strokeDasharray ? ' erd-canvas__dock-btn--active' : ''}`}
                    title="Solid line"
                    onClick={() => handleEdgeDashChange(false)}
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                      <line x1="1" y1="7" x2="13" y2="7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </button>
                  <button
                    className={`erd-canvas__dock-btn${selectedEdge.style?.strokeDasharray ? ' erd-canvas__dock-btn--active' : ''}`}
                    title="Dashed line"
                    onClick={() => handleEdgeDashChange(true)}
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                      <line x1="1" y1="7" x2="5" y2="7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      <line x1="8" y1="7" x2="13" y2="7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              </>
            )}
          </div>
        </Panel>
      </ReactFlow>

      <Menu
        items={[
          {
            id: 'remove-node',
            label: 'Remove',
            icon: <Trash2 size={13} />,
            onClick: () => nodeContextMenu && handleRemoveNode(nodeContextMenu.nodeId)
          }
        ] as MenuItem[]}
        position={nodeContextMenu?.position ?? null}
        onClose={closeNodeContextMenu}
      />

      {isAddTablesDialogOpen && (
        <AddTablesDialog
          tables={hiddenTables}
          onAdd={handleAddTables}
          onClose={() => setIsAddTablesDialogOpen(false)}
        />
      )}

      {/* Live preview arrow while drawing */}
      {isDrawing && drawStartScreen && drawCurrentScreen && (
        <svg className="erd-canvas__draw-preview">
          <defs>
            <marker
              id="draw-preview-arrow"
              markerWidth="10"
              markerHeight="7"
              refX="9"
              refY="3.5"
              orient="auto"
            >
              <polygon points="0 0, 10 3.5, 0 7" fill="#d575ff" fillOpacity="0.8" />
            </marker>
          </defs>
          <line
            x1={drawStartScreen.x}
            y1={drawStartScreen.y}
            x2={drawCurrentScreen.x}
            y2={drawCurrentScreen.y}
            stroke="#d575ff"
            strokeWidth="1.5"
            strokeOpacity="0.8"
            strokeDasharray="6 3"
            markerEnd="url(#draw-preview-arrow)"
          />
        </svg>
      )}
    </div>
  )
}

export interface ErdCanvasProps {
  loadState: 'loading' | 'loaded' | 'error'
  schema?: ErdSchema
  error?: string
  databaseName: string
  background?: ErdBackground
  onBackgroundChange?: (bg: ErdBackground) => void
  exportTrigger?: ErdExportOptions | null
  onExportComplete?: () => void
  initialNodes?: Node[]
  initialEdges?: Edge[]
  initialCurveType?: 'default' | 'smoothstep'
  initialViewport?: { x: number; y: number; zoom: number }
  saveTrigger?: boolean
  onSaveComplete?: (state: ErdCanvasSerializedState) => void
}

function ErdCanvas({ loadState, schema, error, databaseName, background = 'dots', onBackgroundChange = () => {}, exportTrigger, onExportComplete, initialNodes, initialEdges, initialCurveType, initialViewport, saveTrigger, onSaveComplete }: ErdCanvasProps) {
  if (loadState === 'loading') {
    return (
      <div className="erd-canvas erd-canvas--state">
        <Loader2 size={28} className="erd-canvas__spinner" />
        <p className="erd-canvas__state-text">Analyzing database schema…</p>
      </div>
    )
  }

  if (loadState === 'error') {
    return (
      <div className="erd-canvas erd-canvas--state">
        <AlertCircle size={28} className="erd-canvas__error-icon" />
        <p className="erd-canvas__state-text">{error ?? 'Failed to load ERD schema'}</p>
      </div>
    )
  }

  if (!schema && !initialNodes) return null

  return (
    <ReactFlowProvider>
      <ErdCanvasInner
        schema={schema}
        databaseName={databaseName}
        background={background}
        onBackgroundChange={onBackgroundChange}
        exportTrigger={exportTrigger}
        onExportComplete={onExportComplete}
        initialNodes={initialNodes}
        initialEdges={initialEdges}
        initialCurveType={initialCurveType}
        initialViewport={initialViewport}
        saveTrigger={saveTrigger}
        onSaveComplete={onSaveComplete}
      />
    </ReactFlowProvider>
  )
}

/** Returns true if a hex color is perceptually dark (luminance < 0.5) */
function isColorDark(hex: string): boolean {
  const clean = hex.replace('#', '')
  const r = parseInt(clean.slice(0, 2), 16) / 255
  const g = parseInt(clean.slice(2, 4), 16) / 255
  const b = parseInt(clean.slice(4, 6), 16) / 255
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return luminance < 0.5
}

export default memo(ErdCanvas)

import { memo, useCallback } from 'react'
import { useReactFlow, type Node, type NodeProps } from '@xyflow/react'

export interface ErdArrowNodeData extends Record<string, unknown> {
  /** Tail endpoint in local (SVG) coordinate space */
  x1: number
  y1: number
  /** Head (arrowhead) endpoint in local (SVG) coordinate space */
  x2: number
  y2: number
}

export type ErdArrowNodeType = Node<ErdArrowNodeData, 'arrowNode'>

export const ARROW_NODE_PADDING = 16

function ErdArrowNode({ id, data, selected }: NodeProps<ErdArrowNodeType>) {
  const { setNodes, screenToFlowPosition } = useReactFlow()

  const svgWidth = Math.abs(data.x2 - data.x1) + ARROW_NODE_PADDING * 2
  const svgHeight = Math.abs(data.y2 - data.y1) + ARROW_NODE_PADDING * 2

  const onHandlePointerDown = useCallback(
    (isHead: boolean, e: React.PointerEvent<SVGCircleElement>) => {
      // Prevent the node from being dragged while repositioning an endpoint
      e.stopPropagation()

      const handleMove = (moveE: PointerEvent): void => {
        const newFlowPos = screenToFlowPosition({ x: moveE.clientX, y: moveE.clientY })

        setNodes((prev) =>
          prev.map((n) => {
            if (n.id !== id) return n
            const d = n.data as ErdArrowNodeData

            // Absolute flow coordinates of both endpoints
            const absX1 = n.position.x + d.x1
            const absY1 = n.position.y + d.y1
            const absX2 = n.position.x + d.x2
            const absY2 = n.position.y + d.y2

            // The moved point goes to the new cursor position; the other stays fixed
            const movedAbsX = newFlowPos.x
            const movedAbsY = newFlowPos.y
            const fixedAbsX = isHead ? absX1 : absX2
            const fixedAbsY = isHead ? absY1 : absY2

            // Recompute bounding box top-left (including padding)
            const newPosX = Math.min(movedAbsX, fixedAbsX) - ARROW_NODE_PADDING
            const newPosY = Math.min(movedAbsY, fixedAbsY) - ARROW_NODE_PADDING

            // Convert back to local coordinates for tail (x1,y1) and head (x2,y2)
            const newX1 = isHead ? fixedAbsX - newPosX : movedAbsX - newPosX
            const newY1 = isHead ? fixedAbsY - newPosY : movedAbsY - newPosY
            const newX2 = isHead ? movedAbsX - newPosX : fixedAbsX - newPosX
            const newY2 = isHead ? movedAbsY - newPosY : fixedAbsY - newPosY

            return {
              ...n,
              position: { x: newPosX, y: newPosY },
              data: { ...d, x1: newX1, y1: newY1, x2: newX2, y2: newY2 }
            }
          })
        )
      }

      const handleUp = (): void => {
        document.removeEventListener('pointermove', handleMove)
        document.removeEventListener('pointerup', handleUp)
      }

      document.addEventListener('pointermove', handleMove)
      document.addEventListener('pointerup', handleUp)
    },
    [id, setNodes, screenToFlowPosition]
  )

  const markerId = `arrow-marker-${id}`
  const stroke = selected ? '#e899ff' : '#d575ff'

  return (
    <div
      className={`erd-arrow-node${selected ? ' erd-arrow-node--selected' : ''}`}
      style={{ width: svgWidth, height: svgHeight }}
    >
      <svg
        width={svgWidth}
        height={svgHeight}
        overflow="visible"
        className="erd-arrow-node__svg"
      >
        <defs>
          <marker
            id={markerId}
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon points="0 0, 10 3.5, 0 7" fill={stroke} />
          </marker>
        </defs>

        {/* Arrow line */}
        <line
          x1={data.x1}
          y1={data.y1}
          x2={data.x2}
          y2={data.y2}
          stroke={stroke}
          strokeWidth="1.5"
          markerEnd={`url(#${markerId})`}
        />

        {/* Tail handle — dragging repositions the tail */}
        <circle
          cx={data.x1}
          cy={data.y1}
          r={5}
          fill={stroke}
          fillOpacity={0.3}
          stroke={stroke}
          strokeWidth="1"
          className="nodrag erd-arrow-node__handle erd-arrow-node__handle--tail"
          onPointerDown={(e) => onHandlePointerDown(false, e)}
        />

        {/* Head handle — dragging repositions the arrowhead */}
        <circle
          cx={data.x2}
          cy={data.y2}
          r={5}
          fill={stroke}
          stroke={stroke}
          strokeWidth="1"
          className="nodrag erd-arrow-node__handle"

          onPointerDown={(e) => onHandlePointerDown(true, e)}
        />
      </svg>
    </div>
  )
}

export default memo(ErdArrowNode)

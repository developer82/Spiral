import { memo } from 'react'
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { Key, ArrowRight } from 'lucide-react'
import type { ErdColumn } from '../erd.types'

export interface ErdTableNodeData extends Record<string, unknown> {
  schema: string
  name: string
  columns: ErdColumn[]
}

export type ErdTableNodeType = Node<ErdTableNodeData, 'tableNode'>

function ErdTableNode({ data }: NodeProps<ErdTableNodeType>) {
  return (
    <div className="erd-table-node">
      <Handle type="target" position={Position.Left} className="erd-table-node__handle" />
      <div className="erd-table-node__header">
        <span className="erd-table-node__schema">{data.schema}.</span>
        <span className="erd-table-node__name">{data.name}</span>
      </div>
      <div className="erd-table-node__body">
        {data.columns.map((col) => (
          <div
            key={col.name}
            className={`erd-table-node__row${col.isPrimaryKey ? ' erd-table-node__row--pk' : col.isForeignKey ? ' erd-table-node__row--fk' : ''}`}
          >
            <div className="erd-table-node__row-left">
              {col.isPrimaryKey && <Key size={10} className="erd-table-node__pk-icon" />}
              {!col.isPrimaryKey && col.isForeignKey && (
                <ArrowRight size={10} className="erd-table-node__fk-icon" />
              )}
              {!col.isPrimaryKey && !col.isForeignKey && (
                <span className="erd-table-node__col-spacer" />
              )}
              <span className="erd-table-node__col-name">{col.name}</span>
              {col.isNullable && !col.isPrimaryKey && (
                <span className="erd-table-node__nullable">?</span>
              )}
            </div>
            <span className="erd-table-node__col-type">
              {col.type}
              {col.maxLength !== null && col.maxLength > 0 ? `(${col.maxLength})` : ''}
            </span>
          </div>
        ))}
      </div>
      <Handle type="source" position={Position.Right} className="erd-table-node__handle" />
    </div>
  )
}

export default memo(ErdTableNode)

import { memo } from 'react'
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { Key, ArrowRight, X } from 'lucide-react'
import type { ErdColumn } from '../erd.types'

export interface QueryTableNodeData extends Record<string, unknown> {
  schema: string
  name: string
  alias: string
  columns: ErdColumn[]
  checkedColumns: Set<string>
  onRemove?: (schema: string, name: string) => void
  onColumnToggle?: (tableSchema: string, tableName: string, columnName: string, checked: boolean) => void
}

export type QueryTableNodeType = Node<QueryTableNodeData, 'queryTableNode'>

function QueryTableNode({ data }: NodeProps<QueryTableNodeType>) {
  return (
    <div className="qtc-table-node">
      <Handle type="target" position={Position.Left} className="qtc-table-node__handle" />
      <div className="qtc-table-node__header">
        <span className="qtc-table-node__schema">{data.schema}.</span>
        <span className="qtc-table-node__name">{data.name}</span>
        <span className="qtc-table-node__alias">({data.alias})</span>
        <button
          className="qtc-table-node__remove"
          title="Remove table"
          onMouseDown={(e) => {
            e.stopPropagation()
            data.onRemove?.(data.schema, data.name)
          }}
          aria-label={`Remove ${data.schema}.${data.name}`}
        >
          <X size={11} />
        </button>
      </div>
      <div className="qtc-table-node__body">
        {data.columns.map((col) => {
          const colKey = `${data.schema}.${data.name}.${col.name}`
          const checked = data.checkedColumns.has(colKey)
          return (
            <label
              key={col.name}
              className={`qtc-table-node__row${col.isPrimaryKey ? ' qtc-table-node__row--pk' : col.isForeignKey ? ' qtc-table-node__row--fk' : ''}`}
            >
              <input
                type="checkbox"
                className="qtc-table-node__checkbox"
                checked={checked}
                onChange={(e) => {
                  data.onColumnToggle?.(data.schema, data.name, col.name, e.target.checked)
                }}
              />
              <div className="qtc-table-node__row-left">
                {col.isPrimaryKey && <Key size={10} className="qtc-table-node__pk-icon" />}
                {!col.isPrimaryKey && col.isForeignKey && (
                  <ArrowRight size={10} className="qtc-table-node__fk-icon" />
                )}
                {!col.isPrimaryKey && !col.isForeignKey && (
                  <span className="qtc-table-node__col-spacer" />
                )}
                <span className="qtc-table-node__col-name">{col.name}</span>
              </div>
              <span className="qtc-table-node__col-type">
                {col.type}
                {col.maxLength !== null && col.maxLength > 0 ? `(${col.maxLength})` : ''}
              </span>
            </label>
          )
        })}
      </div>
      <Handle type="source" position={Position.Right} className="qtc-table-node__handle" />
    </div>
  )
}

export default memo(QueryTableNode)

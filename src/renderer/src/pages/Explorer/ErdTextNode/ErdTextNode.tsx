import { memo, useState, useRef, useCallback } from 'react'
import { Handle, Position, useReactFlow, type Node, type NodeProps } from '@xyflow/react'

export interface ErdTextNodeData extends Record<string, unknown> {
  text: string
  headingLevel: 'p' | 'h1' | 'h2' | 'h3'
  bold: boolean
  italic: boolean
  underline: boolean
  strike: boolean
  color?: string
}

export type ErdTextNodeType = Node<ErdTextNodeData, 'textNode'>

function ErdTextNode({ id, data, selected }: NodeProps<ErdTextNodeType>) {
  const { updateNodeData } = useReactFlow()
  const [isEditing, setIsEditing] = useState(false)
  const editRef = useRef<HTMLDivElement>(null)

  const startEdit = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setIsEditing(true)
    requestAnimationFrame(() => {
      if (editRef.current) {
        editRef.current.focus()
        // Place cursor at end
        const range = document.createRange()
        range.selectNodeContents(editRef.current)
        range.collapse(false)
        const sel = window.getSelection()
        sel?.removeAllRanges()
        sel?.addRange(range)
      }
    })
  }, [])

  const finishEdit = useCallback(() => {
    if (!editRef.current) return
    const newText = editRef.current.innerText.trim() || 'Double-click to edit'
    updateNodeData(id, { text: newText })
    setIsEditing(false)
  }, [id, updateNodeData])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        finishEdit()
      }
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        finishEdit()
      }
      e.stopPropagation()
    },
    [finishEdit]
  )

  const textStyle: React.CSSProperties = {
    fontWeight: data.bold ? 'bold' : 'normal',
    fontStyle: data.italic ? 'italic' : 'normal',
    textDecoration:
      [data.underline ? 'underline' : '', data.strike ? 'line-through' : '']
        .filter(Boolean)
        .join(' ') || 'none',
    ...(data.color ? { color: data.color } : {})
  }

  const Tag = data.headingLevel === 'p' ? 'p' : data.headingLevel

  return (
    <div
      className={`erd-text-node${selected ? ' erd-text-node--selected' : ''}`}
      onDoubleClick={startEdit}
    >
      <Handle type="target" position={Position.Left} className="erd-table-node__handle" />
      {isEditing ? (
        <div
          ref={editRef}
          className={`erd-text-node__edit erd-text-node__${data.headingLevel}`}
          contentEditable
          suppressContentEditableWarning
          style={textStyle}
          onBlur={finishEdit}
          onKeyDown={handleKeyDown}
        >
          {data.text}
        </div>
      ) : (
        <Tag className={`erd-text-node__${data.headingLevel}`} style={textStyle}>
          {data.text}
        </Tag>
      )}
      <Handle type="source" position={Position.Right} className="erd-table-node__handle" />
    </div>
  )
}

export default memo(ErdTextNode)

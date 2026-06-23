import React, { useEffect, useRef } from 'react'
import { useConfetti } from '../../../hooks/useConfetti'
import type { SedPanelItem } from './parseSedScript'
import './SedPanel.css'

export interface SedTaskStatus {
  label: string
  status: 'pending' | 'running' | 'completed' | 'error'
  error?: string
}

export interface SedExecutionState {
  items: SedPanelItem[]
  taskStatuses: SedTaskStatus[]
  overallStatus: 'running' | 'completed' | 'error'
  resumeFromIndex: number
}

interface SedPanelProps {
  state: SedExecutionState
  onClose: () => void
}

export function SedPanel({ state, onClose }: SedPanelProps): React.JSX.Element {
  const { triggerConfetti } = useConfetti()
  const prevOverallStatus = useRef(state.overallStatus)

  useEffect(() => {
    if (prevOverallStatus.current !== 'completed' && state.overallStatus === 'completed') {
      triggerConfetti()
    }
    prevOverallStatus.current = state.overallStatus
  }, [state.overallStatus, triggerConfetti])

  return (
    <div className="sed-panel">
      <div className="sed-panel__header">
        <span className="sed-panel__title">Script Execution</span>
        <button className="sed-panel__close" onClick={onClose} title="Close">
          ✕
        </button>
      </div>

      <div className="sed-panel__body">
        {state.items.map((item, i) => {
          if (item.type === 'text') {
            return (
              <div key={i} className="sed-panel__markdown">
                <SimpleMarkdown content={item.content} />
              </div>
            )
          }
          const taskStatus = state.taskStatuses[parseInt(item.id)]
          if (!taskStatus) return null
          return (
            <div key={i} className={`sed-panel__task sed-panel__task--${taskStatus.status}`}>
              <span className="sed-panel__task-icon">
                {taskStatus.status === 'pending' && <span className="sed-icon sed-icon--pending" />}
                {taskStatus.status === 'running' && <span className="sed-icon sed-icon--running" />}
                {taskStatus.status === 'completed' && <span className="sed-icon sed-icon--completed">✓</span>}
                {taskStatus.status === 'error' && <span className="sed-icon sed-icon--error">✕</span>}
              </span>
              <div className="sed-panel__task-content">
                <span className="sed-panel__task-label">{taskStatus.label}</span>
                {taskStatus.status === 'error' && taskStatus.error && (
                  <span className="sed-panel__task-error">{taskStatus.error}</span>
                )}
              </div>
            </div>
          )
        })}

        {state.overallStatus === 'completed' && (
          <div className="sed-panel__success">
            Completed successfully!
          </div>
        )}
      </div>
    </div>
  )
}

// ── Simple inline markdown renderer ─────────────────────────────────────────

interface SimpleMarkdownProps {
  content: string
}

function SimpleMarkdown({ content }: SimpleMarkdownProps): React.JSX.Element {
  const lines = content.split('\n')
  return (
    <div className="sed-markdown">
      {lines.map((line, i) => renderMarkdownLine(line, i))}
    </div>
  )
}

function renderMarkdownLine(line: string, key: number): React.ReactNode {
  const trimmed = line.trim()

  if (trimmed === '' || trimmed === '---' || trimmed === '***' || trimmed === '___') {
    return <div key={key} className="sed-markdown__divider" />
  }

  const h3 = /^###\s+(.+)/.exec(trimmed)
  if (h3) return <h3 key={key} className="sed-markdown__h3">{renderInline(h3[1])}</h3>

  const h2 = /^##\s+(.+)/.exec(trimmed)
  if (h2) return <h2 key={key} className="sed-markdown__h2">{renderInline(h2[1])}</h2>

  const h1 = /^#\s+(.+)/.exec(trimmed)
  if (h1) return <h1 key={key} className="sed-markdown__h1">{renderInline(h1[1])}</h1>

  const bullet = /^[-*]\s+(.+)/.exec(trimmed)
  if (bullet) return <div key={key} className="sed-markdown__bullet">• {renderInline(bullet[1])}</div>

  return <p key={key} className="sed-markdown__p">{renderInline(trimmed)}</p>
}

type InlinePart = { text: string; bold?: boolean; italic?: boolean }

function renderInline(text: string): React.ReactNode {
  const parts: InlinePart[] = []
  // Match **bold**, *italic*, _italic_ in order
  const re = /(\*\*(.+?)\*\*|\*(.+?)\*|_(.+?)_)/g
  let last = 0
  let m: RegExpExecArray | null

  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index) })
    if (m[0].startsWith('**')) {
      parts.push({ text: m[2], bold: true })
    } else {
      parts.push({ text: m[3] ?? m[4], italic: true })
    }
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push({ text: text.slice(last) })

  if (parts.length === 1 && !parts[0].bold && !parts[0].italic) return parts[0].text

  return (
    <>
      {parts.map((p, i) =>
        p.bold ? <strong key={i}>{p.text}</strong>
        : p.italic ? <em key={i}>{p.text}</em>
        : <React.Fragment key={i}>{p.text}</React.Fragment>
      )}
    </>
  )
}

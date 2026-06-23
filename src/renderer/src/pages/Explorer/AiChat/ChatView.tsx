import React, { useRef, useEffect, useState, useCallback, KeyboardEvent } from 'react'
import { Square, Copy, ChevronRight, ArrowUp } from 'lucide-react'
import { format as formatSql } from 'sql-formatter'
import type { AiChatMessage, AiSchemaContext } from '../../../../../shared/ai.types'

const THINKING_WORDS = [
  'Crosticating', 'Splining', 'Quorling', 'Trondling', 'Gribbling',
  'Blintering', 'Frimminating', 'Plinthing', 'Zizzing', 'Vandling',
  'Scrumbling', 'Flernoring', 'Bratching', 'Spilthying', 'Glinting',
  'Drubbing', 'Sprolling', 'Churling', 'Tringling', 'Krilling',
  'Vooping', 'Splissing', 'Gribling', 'Plonking', 'Screeving',
  'Flonking', 'Trimming', 'Wizzing', 'Brolling', 'Zapping'
]

function randomThinkingWord(): string {
  return THINKING_WORDS[Math.floor(Math.random() * THINKING_WORDS.length)]
}

interface ContextMenuState {
  x: number
  y: number
  content: string
}

interface ChatViewProps {
  messages: AiChatMessage[]
  isStreaming: boolean
  schemaContext: AiSchemaContext | null
  schemaLoading: boolean
  connectionName: string | null
  databaseName: string | null
  modelDisplayName: string
  onSendMessage: (text: string) => void
  onInsertSql: (sql: string) => void
  onAbort: () => void
}

export function ChatView({
  messages,
  isStreaming,
  schemaContext,
  schemaLoading,
  connectionName,
  databaseName,
  modelDisplayName,
  onSendMessage,
  onInsertSql,
  onAbort
}: ChatViewProps): React.JSX.Element {
  const [inputText, setInputText] = useState('')
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [thinkingWord, setThinkingWord] = useState(randomThinkingWord)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-scroll on new content
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Pick one word when streaming starts
  useEffect(() => {
    if (isStreaming) setThinkingWord(randomThinkingWord())
  }, [isStreaming])

  // Dismiss context menu on outside click
  useEffect(() => {
    if (!contextMenu) return
    const dismiss = () => setContextMenu(null)
    window.addEventListener('click', dismiss)
    return () => window.removeEventListener('click', dismiss)
  }, [contextMenu])

  const handleAssistantContextMenu = useCallback((e: React.MouseEvent, content: string) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, content })
  }, [])

  const handleContextMenuCopy = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    if (!contextMenu) return
    const selected = window.getSelection()?.toString().trim() ?? ''
    navigator.clipboard.writeText(selected || contextMenu.content)
    setContextMenu(null)
  }, [contextMenu])

  // Auto-resize textarea
  const handleInput = useCallback(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    const maxH = parseInt(getComputedStyle(ta).lineHeight || '20') * 10
    ta.style.height = `${Math.min(ta.scrollHeight, maxH)}px`
  }, [])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        if (!isStreaming && inputText.trim()) {
          onSendMessage(inputText.trim())
          setInputText('')
          if (textareaRef.current) {
            textareaRef.current.style.height = 'auto'
          }
        }
      }
    },
    [isStreaming, inputText, onSendMessage]
  )

  const handleSend = useCallback(() => {
    if (!isStreaming && inputText.trim()) {
      onSendMessage(inputText.trim())
      setInputText('')
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
      }
    }
  }, [isStreaming, inputText, onSendMessage])

  const inputDisabled = !schemaContext && !schemaLoading

  const contextLabel =
    connectionName && databaseName
      ? `${connectionName} — ${databaseName}`
      : databaseName ?? (schemaLoading ? 'Loading…' : '')

  return (
    <div className="ai-chat-view">
      <div className="ai-chat-view__messages">
        {messages.length === 0 && (
          <div className="ai-chat-view__empty">
            <ChevronRight size={16} />
            <span>Ask a question about your database or request a SQL query</span>
          </div>
        )}
        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            thinkingWord={thinkingWord}
            onInsertSql={onInsertSql}
            onContextMenu={handleAssistantContextMenu}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {contextMenu && (
        <div
          className="ai-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button className="ai-context-menu__item" onClick={handleContextMenuCopy}>
            <Copy size={12} />
            Copy
          </button>
        </div>
      )}

      <div className={`ai-input-container${isStreaming ? ' ai-input-container--streaming' : ''}`}>
        <div className="ai-input-container__inner">
          {contextLabel && (
            <div className="ai-input-container__context">{contextLabel}</div>
          )}
          <textarea
            ref={textareaRef}
            className="ai-chat-view__textarea"
            placeholder="Ask about your data or request a SQL query…"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onInput={handleInput}
            onKeyDown={handleKeyDown}
            disabled={inputDisabled}
            rows={3}
          />
          <div className="ai-input-container__footer">
            <span className="ai-input-footer__model">{modelDisplayName}</span>
            {isStreaming ? (
              <button
                className="ai-chat-view__btn ai-chat-view__btn--stop"
                onClick={onAbort}
                title="Stop generation"
              >
                <Square size={13} />
              </button>
            ) : (
              <button
                className="ai-chat-view__btn ai-chat-view__btn--submit"
                onClick={handleSend}
                disabled={!inputText.trim() || inputDisabled}
                title="Send (Enter)"
              >
                <ArrowUp size={13} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

interface MessageBubbleProps {
  message: AiChatMessage
  thinkingWord: string
  onInsertSql: (sql: string) => void
  onContextMenu: (e: React.MouseEvent, content: string) => void
}

function MessageBubble({ message, thinkingWord, onInsertSql, onContextMenu }: MessageBubbleProps): React.JSX.Element {
  const isUser = message.role === 'user'

  if (isUser) {
    return (
      <div className="ai-message ai-message--user">
        <div className="ai-message__bubble">{message.content}</div>
      </div>
    )
  }

  if (message.error) {
    return (
      <div className="ai-message ai-message--assistant">
        <div className="ai-message__bubble ai-message__bubble--error">
          Error: {message.error}
        </div>
      </div>
    )
  }

  const parts = parseMessageContent(message.content)

  return (
    <div
      className="ai-message ai-message--assistant"
      onContextMenu={(e) => onContextMenu(e, message.content)}
    >
      <div className="ai-message__bubble">
        {parts.map((part, i) => {
          if (part.type === 'text') {
            return <span key={i} className="ai-message__text">{part.content}</span>
          }
          return (
            <div key={i} className="ai-message__code-block">
              <div className="ai-message__code-header">
                <span className="ai-message__code-lang">SQL</span>
                <button
                  className="ai-message__code-btn"
                  onClick={() => navigator.clipboard.writeText(part.content)}
                  title="Copy"
                >
                  <Copy size={12} />
                </button>
              </div>
              <pre className="ai-message__code">{part.content}</pre>
              <button
                className="ai-message__insert-btn"
                onClick={() => onInsertSql(part.content)}
              >
                Insert into editor
              </button>
            </div>
          )
        })}
        {message.isStreaming && (
          <span className="ai-message__thinking">
            <span className="ai-message__thinking-word">{thinkingWord}...</span>
            <span className="ai-message__cursor" />
          </span>
        )}
      </div>
    </div>
  )
}

interface ContentPart {
  type: 'text' | 'code'
  content: string
}

function parseMessageContent(text: string): ContentPart[] {
  const parts: ContentPart[] = []
  const regex = /```(?:sql)?\s*\n?([\s\S]*?)```/gi
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const textPart = text.slice(lastIndex, match.index).trim()
      if (textPart) parts.push({ type: 'text', content: textPart })
    }
    parts.push({ type: 'code', content: prettifySql(match[1].trim()) })
    lastIndex = match.index + match[0].length
  }

  const remaining = text.slice(lastIndex).trim()
  if (remaining) {
    if (parts.length === 0 && looksLikeSql(remaining)) {
      parts.push({ type: 'code', content: prettifySql(remaining) })
    } else {
      parts.push({ type: 'text', content: remaining })
    }
  }

  return parts
}

function prettifySql(sql: string): string {
  try {
    return formatSql(sql, { language: 'sql', tabWidth: 2, keywordCase: 'upper' })
  } catch {
    return sql
  }
}

function looksLikeSql(text: string): boolean {
  const upper = text.trimStart().toUpperCase()
  return (
    upper.startsWith('SELECT') ||
    upper.startsWith('INSERT') ||
    upper.startsWith('UPDATE') ||
    upper.startsWith('DELETE') ||
    upper.startsWith('WITH') ||
    upper.startsWith('CREATE') ||
    upper.startsWith('DROP') ||
    upper.startsWith('ALTER')
  )
}

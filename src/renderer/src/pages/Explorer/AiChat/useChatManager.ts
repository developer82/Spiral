import { useState, useEffect, useRef, useCallback } from 'react'
import type {
  AiModelStatus,
  AiDownloadProgress,
  AiChatMessage,
  AiChatChunk,
  AiSchemaContext
} from '../../../../../shared/ai.types'

const MODEL_ID = 'sqlcoder-7b-q4'

export interface UseChatManagerProps {
  connectionId: string | null
  databaseName: string | null
  provider: string | null
  onInsertSql: (sql: string) => void
}

export interface UseChatManagerReturn {
  modelStatus: AiModelStatus
  downloadProgress: AiDownloadProgress | null
  downloadError: string | null
  modelDisplayName: string
  messages: AiChatMessage[]
  isStreaming: boolean
  schemaContext: AiSchemaContext | null
  schemaLoading: boolean
  startDownload: () => void
  cancelDownload: () => void
  sendMessage: (text: string) => void
  abortStreaming: () => void
  clearChat: () => void
}

export function useChatManager({
  connectionId,
  databaseName,
  provider
}: UseChatManagerProps): UseChatManagerReturn {
  const [modelStatus, setModelStatus] = useState<AiModelStatus>('not-downloaded')
  const [downloadProgress, setDownloadProgress] = useState<AiDownloadProgress | null>(null)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const [modelDisplayName, setModelDisplayName] = useState<string>(MODEL_ID)
  const [messages, setMessages] = useState<AiChatMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [schemaContext, setSchemaContext] = useState<AiSchemaContext | null>(null)
  const [schemaLoading, setSchemaLoading] = useState(false)
  const activeSessionId = useRef<string | null>(null)

  // Check model on mount and fetch display name
  useEffect(() => {
    window.api.ai.checkModel(MODEL_ID).then((result: unknown) => {
      const r = result as { exists: boolean }
      setModelStatus(r.exists ? 'ready' : 'not-downloaded')
    })
    window.api.ai.listModels().then((models: unknown) => {
      const list = models as Array<{ modelId: string; displayName: string }>
      const match = list.find((m) => m.modelId === MODEL_ID)
      if (match) setModelDisplayName(match.displayName)
    })
  }, [])

  // Register push event listeners
  useEffect(() => {
    const cleanupProgress = window.api.ai.onDownloadProgress((data: unknown) => {
      setDownloadProgress(data as AiDownloadProgress)
    })
    const cleanupChunk = window.api.ai.onChatChunk((data: unknown) => {
      const chunk = data as AiChatChunk
      handleChunk(chunk)
    })
    return () => {
      cleanupProgress()
      cleanupChunk()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Load schema when connection/db changes and model is ready
  useEffect(() => {
    if (modelStatus !== 'ready' || !connectionId || !databaseName || !provider) {
      setSchemaContext(null)
      return
    }
    setSchemaLoading(true)
    window.api.ai
      .getSchemaContext(connectionId, databaseName, provider)
      .then((ctx: unknown) => setSchemaContext(ctx as AiSchemaContext))
      .catch(() => setSchemaContext(null))
      .finally(() => setSchemaLoading(false))
  }, [connectionId, databaseName, provider, modelStatus])

  const handleChunk = useCallback((chunk: AiChatChunk) => {
    if (chunk.done) {
      setIsStreaming(false)
      activeSessionId.current = null
      setMessages((prev) =>
        prev.map((m) =>
          m.id === chunk.sessionId
            ? {
                ...m,
                content: chunk.fullText ?? m.content,
                isStreaming: false,
                sqlBlocks: extractSqlBlocks(chunk.fullText ?? m.content),
                error: chunk.error
              }
            : m
        )
      )
    } else {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === chunk.sessionId ? { ...m, content: m.content + chunk.delta } : m
        )
      )
    }
  }, [])

  const startDownload = useCallback(() => {
    setDownloadError(null)
    setDownloadProgress(null)
    setModelStatus('downloading')
    window.api.ai.downloadModel(MODEL_ID).then((result: unknown) => {
      const r = result as { status: string; message?: string }
      if (r.status === 'ok') {
        setModelStatus('ready')
        setDownloadProgress(null)
      } else if (r.status === 'cancelled') {
        setModelStatus('not-downloaded')
        setDownloadProgress(null)
      } else {
        setModelStatus('error')
        setDownloadError(r.message ?? 'Download failed')
        setDownloadProgress(null)
      }
    })
  }, [])

  const cancelDownload = useCallback(() => {
    window.api.ai.cancelDownload(MODEL_ID)
  }, [])

  const sendMessage = useCallback(
    (text: string) => {
      if (!connectionId || !databaseName || !provider) return
      const sessionId = crypto.randomUUID()
      activeSessionId.current = sessionId

      const userMsg: AiChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: text,
        timestamp: Date.now()
      }
      const assistantMsg: AiChatMessage = {
        id: sessionId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        isStreaming: true
      }

      setMessages((prev) => [...prev, userMsg, assistantMsg])
      setIsStreaming(true)

      const history = messages
        .filter((m) => !m.isStreaming)
        .slice(-6)
        .map((m) => ({ role: m.role, content: m.content }))

      window.api.ai
        .chatStream(
          { connectionId, databaseName, provider, message: text, conversationHistory: history },
          sessionId
        )
        .catch(() => {
          setIsStreaming(false)
          setMessages((prev) =>
            prev.map((m) =>
              m.id === sessionId
                ? { ...m, isStreaming: false, error: 'Inference failed', content: m.content }
                : m
            )
          )
        })
    },
    [connectionId, databaseName, provider, messages]
  )

  const abortStreaming = useCallback(() => {
    if (activeSessionId.current) {
      window.api.ai.abortCompletion(activeSessionId.current)
    }
  }, [])

  const clearChat = useCallback(() => {
    setMessages([])
  }, [])

  return {
    modelStatus,
    downloadProgress,
    downloadError,
    modelDisplayName,
    messages,
    isStreaming,
    schemaContext,
    schemaLoading,
    startDownload,
    cancelDownload,
    sendMessage,
    abortStreaming,
    clearChat
  }
}

function extractSqlBlocks(text: string): string[] {
  const blocks: string[] = []
  // Match ```sql ... ``` and ``` ... ``` blocks
  const regex = /```(?:sql)?\s*\n?([\s\S]*?)```/gi
  let match: RegExpExecArray | null
  while ((match = regex.exec(text)) !== null) {
    const sql = match[1].trim()
    if (sql) blocks.push(sql)
  }
  return blocks
}

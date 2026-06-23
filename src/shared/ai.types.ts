import type { ConnectionProvider } from '../main/store'

export type AiModelStatus = 'not-downloaded' | 'downloading' | 'ready' | 'error'

export interface AiModelInfo {
  modelId: string
  displayName: string
  description: string
  downloadUrl: string
  fileSizeBytes: number
  fileName: string
  supportedProviders: ConnectionProvider[] | 'all'
}

export interface AiModelListItem extends AiModelInfo {
  status: AiModelStatus
  sizeOnDisk?: number
}

export interface AiDownloadProgress {
  modelId: string
  downloaded: number
  total: number
  percent: number
}

export interface AiChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  sqlBlocks?: string[]
  isStreaming?: boolean
  error?: string
}

export interface AiChatRequest {
  connectionId: string
  databaseName: string
  provider: string
  message: string
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>
}

export interface AiChatChunk {
  sessionId: string
  delta: string
  done: boolean
  fullText?: string
  error?: string
}

export interface AiSchemaContext {
  databaseName: string
  provider: string
  ddl: string
  tableCount: number
}

export interface ModelCheckResult {
  exists: boolean
  filePath: string
  sizeBytes?: number
}

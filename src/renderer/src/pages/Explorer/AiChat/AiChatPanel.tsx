import React from 'react'
import { Plus } from 'lucide-react'
import { ModelSetup } from './ModelSetup'
import { ChatView } from './ChatView'
import { useChatManager } from './useChatManager'
import './AiChatPanel.css'

export interface AiChatPanelProps {
  connectionId: string | null
  connectionName: string | null
  databaseName: string | null
  provider: string | null
  onInsertSql: (sql: string) => void
  onClose?: () => void
}

export function AiChatPanel({
  connectionId,
  connectionName,
  databaseName,
  provider,
  onInsertSql,
  onClose
}: AiChatPanelProps): React.JSX.Element {
  const chat = useChatManager({ connectionId, databaseName, provider, onInsertSql })

  const showSetup =
    chat.modelStatus === 'not-downloaded' ||
    chat.modelStatus === 'downloading' ||
    chat.modelStatus === 'error'

  return (
    <div className="ai-chat-panel">
      <div className="ai-chat-panel__header">
        <span className="ai-chat-panel__title">AI Assistant</span>
        <div className="ai-chat-panel__header-actions">
          <button
            className="ai-chat-panel__icon-btn"
            onClick={chat.clearChat}
            data-tooltip="New Session"
            aria-label="New Session"
          >
            <Plus size={14} />
          </button>
          {onClose && (
            <button className="ai-chat-panel__close-btn" onClick={onClose} aria-label="Close AI Assistant">
              ×
            </button>
          )}
        </div>
      </div>

      <div className="ai-chat-panel__body">
        {showSetup ? (
          <ModelSetup
            downloadStatus={chat.modelStatus}
            progress={chat.downloadProgress}
            errorMessage={chat.downloadError}
            onStartDownload={chat.startDownload}
            onCancelDownload={chat.cancelDownload}
          />
        ) : (
          <ChatView
            messages={chat.messages}
            isStreaming={chat.isStreaming}
            schemaContext={chat.schemaContext}
            schemaLoading={chat.schemaLoading}
            connectionName={connectionName}
            databaseName={databaseName}
            modelDisplayName={chat.modelDisplayName}
            onSendMessage={chat.sendMessage}
            onInsertSql={onInsertSql}
            onAbort={chat.abortStreaming}
          />
        )}
      </div>
    </div>
  )
}

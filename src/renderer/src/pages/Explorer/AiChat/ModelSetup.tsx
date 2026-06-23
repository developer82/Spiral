import React from 'react'
import { Download, AlertCircle, Loader2 } from 'lucide-react'
import type { AiDownloadProgress } from '../../../../../shared/ai.types'
import type { AiModelStatus } from '../../../../../shared/ai.types'

interface ModelSetupProps {
  downloadStatus: AiModelStatus
  progress: AiDownloadProgress | null
  errorMessage: string | null
  onStartDownload: () => void
  onCancelDownload: () => void
}

function formatBytes(bytes: number): string {
  if (bytes < 1e9) return `${(bytes / 1e6).toFixed(0)} MB`
  return `${(bytes / 1e9).toFixed(1)} GB`
}

export function ModelSetup({
  downloadStatus,
  progress,
  errorMessage,
  onStartDownload,
  onCancelDownload
}: ModelSetupProps): React.JSX.Element {
  return (
    <div className="ai-model-setup">
      <div className="ai-model-setup__icon">
        {downloadStatus === 'downloading' ? (
          <Loader2 size={32} className="ai-model-setup__spinner" />
        ) : downloadStatus === 'error' ? (
          <AlertCircle size={32} className="ai-model-setup__error-icon" />
        ) : (
          <Download size={32} />
        )}
      </div>

      <h3 className="ai-model-setup__title">
        {downloadStatus === 'downloading'
          ? 'Downloading SQLCoder...'
          : downloadStatus === 'error'
            ? 'Download Failed'
            : 'SQLCoder AI Model Required'}
      </h3>

      {downloadStatus === 'not-downloaded' && (
        <>
          <p className="ai-model-setup__description">
            SQLCoder is a local AI model specialized in generating SQL queries. It runs entirely
            on your machine — no data leaves your computer.
          </p>
          <p className="ai-model-setup__size-warning">
            Requires approximately <strong>4 GB</strong> of disk space.
          </p>
          <button className="ai-model-setup__btn" onClick={onStartDownload}>
            <Download size={14} />
            Download Model
          </button>
        </>
      )}

      {downloadStatus === 'downloading' && progress && (
        <>
          <div className="ai-model-setup__progress-bar-track">
            <div
              className="ai-model-setup__progress-bar-fill"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
          <p className="ai-model-setup__progress-text">
            {formatBytes(progress.downloaded)} / {formatBytes(progress.total)} &mdash;{' '}
            {progress.percent}%
          </p>
          <button className="ai-model-setup__btn ai-model-setup__btn--cancel" onClick={onCancelDownload}>
            Cancel
          </button>
        </>
      )}

      {downloadStatus === 'downloading' && !progress && (
        <p className="ai-model-setup__progress-text">Starting download...</p>
      )}

      {downloadStatus === 'error' && (
        <>
          <p className="ai-model-setup__error-message">
            {errorMessage ?? 'An unexpected error occurred. Please try again.'}
          </p>
          {errorMessage?.includes('401') && (
            <p className="ai-model-setup__auth-hint">
              A Hugging Face token is required. Add it in Settings → AI.
            </p>
          )}
          <button className="ai-model-setup__btn" onClick={onStartDownload}>
            Retry
          </button>
        </>
      )}
    </div>
  )
}

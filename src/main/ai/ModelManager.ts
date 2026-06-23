import { mkdir, stat, unlink, open, writeFile } from 'fs/promises'
import { join } from 'path'
import { net } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import type { AiModelInfo, AiDownloadProgress, AiModelListItem, ModelCheckResult } from '../../shared/ai.types'

// IQ4_NL quantization: ~4GB, good balance of speed/quality
const SQLCODER_MODEL_ID = 'sqlcoder-7b-q4'
const SQLCODER_FILE_NAME = 'sqlcoder-7b-2-IQ4_NL.gguf'
const SQLCODER_SIZE_BYTES = 0 // skip size verification — exact size unknown
// Community-quantized GGUF from Hugging Face
const SQLCODER_DOWNLOAD_URL =
  'https://huggingface.co/SandLogicTechnologies/sqlcoder-7b-2-GGUF/resolve/main/sqlcoder-7b-2.fp16.gguf_IQ4_NL.gguf'

export const MODEL_CATALOG: Record<string, AiModelInfo> = {
  [SQLCODER_MODEL_ID]: {
    modelId: SQLCODER_MODEL_ID,
    displayName: 'SQLCoder 7B (Q4_K_M)',
    description: 'Specialized SQL generation model for text-to-SQL tasks. Supports SQL Server, PostgreSQL, MySQL, and SQLite. ~4 GB download.',
    downloadUrl: SQLCODER_DOWNLOAD_URL,
    fileSizeBytes: SQLCODER_SIZE_BYTES,
    fileName: SQLCODER_FILE_NAME,
    supportedProviders: ['sqlserver', 'postgres', 'mysql', 'sqlite']
  }
}

export const DEFAULT_MODEL_ID = SQLCODER_MODEL_ID

const PROGRESS_THROTTLE_MS = 150

export class ModelManager {
  private readonly modelsDir: string
  private readonly activeDownloads = new Map<string, Electron.ClientRequest>()
  private readonly cancelledDownloads = new Set<string>()

  constructor(modelsDir: string) {
    this.modelsDir = modelsDir
  }

  private getModelFilePath(fileName: string): string {
    return join(this.modelsDir, fileName)
  }

  private getMarkerPath(fileName: string): string {
    return join(this.modelsDir, `${fileName}.complete`)
  }

  async checkModel(modelId: string): Promise<ModelCheckResult> {
    const info = MODEL_CATALOG[modelId]
    if (!info) {
      return { exists: false, filePath: '' }
    }
    const filePath = this.getModelFilePath(info.fileName)
    const markerPath = this.getMarkerPath(info.fileName)
    try {
      const [fileStats] = await Promise.all([stat(filePath), stat(markerPath)])
      return { exists: true, filePath, sizeBytes: fileStats.size }
    } catch {
      return { exists: false, filePath }
    }
  }

  async downloadModel(
    event: IpcMainInvokeEvent,
    modelId: string,
    hfToken?: string
  ): Promise<{ status: 'ok'; filePath: string } | { status: 'error'; message: string } | { status: 'cancelled' }> {
    const info = MODEL_CATALOG[modelId]
    if (!info) {
      return { status: 'error', message: `Unknown model: ${modelId}` }
    }

    await mkdir(this.modelsDir, { recursive: true })
    const filePath = this.getModelFilePath(info.fileName)

    return new Promise((resolve) => {
      let fileHandle: Awaited<ReturnType<typeof open>> | null = null

      const markerPath = this.getMarkerPath(info.fileName)

      const cleanup = async () => {
        if (fileHandle) {
          try { await fileHandle.close() } catch { /* ignore */ }
          fileHandle = null
        }
        await this.deleteFile(filePath)
        await this.deleteFile(markerPath)
        this.activeDownloads.delete(modelId)
      }

      const url = hfToken
        ? info.downloadUrl
        : `${info.downloadUrl}?download=true`

      const request = net.request({ url, useSessionCookies: false })
      if (hfToken) request.setHeader('Authorization', `Bearer ${hfToken}`)

      this.activeDownloads.set(modelId, request)

      request.on('response', (response) => {
        if (response.statusCode !== 200) {
          void cleanup().then(() => {
            resolve({ status: 'error', message: `Download failed: HTTP ${response.statusCode}` })
          })
          return
        }

        const contentLengthHeader = response.headers['content-length']
        const contentLength = Array.isArray(contentLengthHeader)
          ? contentLengthHeader[0]
          : contentLengthHeader
        const total = parseInt(contentLength ?? '0', 10) || info.fileSizeBytes

        let downloaded = 0
        let lastProgressSent = 0

        void open(filePath, 'w').then((handle) => {
          fileHandle = handle
          const writer = handle.createWriteStream()

          response.on('data', (chunk: Buffer) => {
            writer.write(chunk)
            downloaded += chunk.length

            const now = Date.now()
            if (now - lastProgressSent >= PROGRESS_THROTTLE_MS) {
              lastProgressSent = now
              const progress: AiDownloadProgress = {
                modelId,
                downloaded,
                total,
                percent: Math.round((downloaded / total) * 100)
              }
              event.sender.send('ai:download-progress', progress)
            }
          })

          response.on('end', () => {
            writer.end(async () => {
              if (fileHandle) {
                try { await fileHandle.close() } catch { /* ignore */ }
                fileHandle = null
              }
              this.activeDownloads.delete(modelId)

              if (this.cancelledDownloads.delete(modelId)) {
                await this.deleteFile(filePath)
                resolve({ status: 'cancelled' })
                return
              }

              // Verify size (allow ±2%)
              const finalStats = await stat(filePath)
              const sizeDiff = Math.abs(finalStats.size - info.fileSizeBytes) / info.fileSizeBytes
              if (info.fileSizeBytes > 0 && sizeDiff > 0.02) {
                await this.deleteFile(filePath)
                resolve({
                  status: 'error',
                  message: `Downloaded file size mismatch (expected ~${Math.round(info.fileSizeBytes / 1e9)}GB)`
                })
                return
              }

              await writeFile(markerPath, '')

              event.sender.send('ai:download-progress', {
                modelId,
                downloaded: finalStats.size,
                total: finalStats.size,
                percent: 100
              } satisfies AiDownloadProgress)

              resolve({ status: 'ok', filePath })
            })
          })

          response.on('error', (err: Error) => {
            void cleanup().then(() => resolve({ status: 'error', message: err.message }))
          })
        }).catch((err: Error) => {
          void cleanup().then(() => resolve({ status: 'error', message: err.message }))
        })
      })

      request.on('abort', () => {
        this.cancelledDownloads.delete(modelId)
        void cleanup().then(() => resolve({ status: 'cancelled' }))
      })

      request.on('error', (err: Error) => {
        const wasCancelled = this.cancelledDownloads.delete(modelId)
        void cleanup().then(() => {
          resolve(wasCancelled ? { status: 'cancelled' } : { status: 'error', message: err.message })
        })
      })

      request.end()
    })
  }

  cancelDownload(modelId: string): void {
    const request = this.activeDownloads.get(modelId)
    if (request) {
      this.cancelledDownloads.add(modelId)
      request.abort()
    }
  }

  async listModels(): Promise<AiModelListItem[]> {
    return Promise.all(
      Object.values(MODEL_CATALOG).map(async (info) => {
        const check = await this.checkModel(info.modelId)
        return {
          ...info,
          status: check.exists ? ('ready' as const) : ('not-downloaded' as const),
          sizeOnDisk: check.exists ? check.sizeBytes : undefined
        }
      })
    )
  }

  async deleteModel(modelId: string): Promise<void> {
    const info = MODEL_CATALOG[modelId]
    if (!info) return
    await Promise.all([
      this.deleteFile(this.getModelFilePath(info.fileName)),
      this.deleteFile(this.getMarkerPath(info.fileName))
    ])
  }

  private async deleteFile(filePath: string): Promise<void> {
    try {
      await unlink(filePath)
    } catch {
      // file may not exist
    }
  }
}

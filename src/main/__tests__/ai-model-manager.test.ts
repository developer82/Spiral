// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ModelManager, MODEL_CATALOG, DEFAULT_MODEL_ID } from '../ai/ModelManager'
import type { IpcMainInvokeEvent } from 'electron'

vi.mock('fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  stat: vi.fn(),
  unlink: vi.fn().mockResolvedValue(undefined),
  open: vi.fn()
}))

import { stat, open, unlink } from 'fs/promises'

const mockStat = stat as ReturnType<typeof vi.fn>
const mockOpen = open as ReturnType<typeof vi.fn>
const mockUnlink = unlink as ReturnType<typeof vi.fn>

function makeEvent(sends: unknown[][] = []): IpcMainInvokeEvent {
  return {
    sender: {
      send: vi.fn((_channel: string, data: unknown) => sends.push([_channel, data]))
    }
  } as unknown as IpcMainInvokeEvent
}

function makeFileSystemMock() {
  const writer = {
    write: vi.fn(),
    end: (cb: (err?: Error | null) => void) => cb()
  }
  const fileHandle = {
    createWriteStream: () => writer,
    close: vi.fn().mockResolvedValue(undefined)
  }
  mockOpen.mockResolvedValue(fileHandle)
  return { writer, fileHandle }
}

function makeStreamReader(chunks: Uint8Array[]) {
  let index = 0
  return {
    read: () => {
      if (index < chunks.length) {
        return Promise.resolve({ done: false as const, value: chunks[index++] })
      }
      return Promise.resolve({ done: true as const, value: undefined })
    }
  }
}

describe('ModelManager', () => {
  let manager: ModelManager

  beforeEach(() => {
    vi.clearAllMocks()
    manager = new ModelManager('/models')
  })

  describe('checkModel', () => {
    it('returns exists:true when file is found', async () => {
      mockStat.mockResolvedValue({ size: 4_108_792_832 })
      const result = await manager.checkModel(DEFAULT_MODEL_ID)
      expect(result.exists).toBe(true)
      expect(result.sizeBytes).toBe(4_108_792_832)
      expect(result.filePath).toContain('sqlcoder-7b-2.Q4_K_M.gguf')
    })

    it('returns exists:false when file is missing', async () => {
      const err = Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
      mockStat.mockRejectedValue(err)
      const result = await manager.checkModel(DEFAULT_MODEL_ID)
      expect(result.exists).toBe(false)
    })

    it('returns exists:false for unknown model id', async () => {
      const result = await manager.checkModel('nonexistent-model')
      expect(result.exists).toBe(false)
    })
  })

  describe('downloadModel', () => {
    it('returns error for unknown model id', async () => {
      const event = makeEvent()
      const result = await manager.downloadModel(event, 'unknown-model')
      expect(result.status).toBe('error')
    })

    it('returns error when HTTP response is not ok', async () => {
      makeFileSystemMock()
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        headers: { get: () => null },
        body: null
      })
      const event = makeEvent()
      const result = await manager.downloadModel(event, DEFAULT_MODEL_ID)
      expect(result.status).toBe('error')
    })

    it('sends progress events during download and returns ok when size matches', async () => {
      makeFileSystemMock()
      const chunkSize = 1024
      const chunks = [new Uint8Array(chunkSize), new Uint8Array(chunkSize)]
      const totalSize = MODEL_CATALOG[DEFAULT_MODEL_ID].fileSizeBytes

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => String(totalSize) },
        body: { getReader: () => makeStreamReader(chunks) }
      })

      // Size verification after download - mock to match expected size
      mockStat.mockResolvedValue({ size: totalSize })

      const sends: unknown[][] = []
      const event = makeEvent(sends)

      const result = await manager.downloadModel(event, DEFAULT_MODEL_ID)

      expect(result.status).toBe('ok')
      // Final 100% progress is always sent
      const progressSends = sends.filter(([ch]) => ch === 'ai:download-progress')
      expect(progressSends.length).toBeGreaterThan(0)
      const lastProgress = progressSends.at(-1)![1] as { percent: number }
      expect(lastProgress.percent).toBe(100)
    })

    it('returns error and deletes file when downloaded size mismatches', async () => {
      makeFileSystemMock()
      const chunks = [new Uint8Array(100)]

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => '100' },
        body: { getReader: () => makeStreamReader(chunks) }
      })

      // Simulate small file (vs expected ~4GB)
      mockStat.mockResolvedValue({ size: 100 })

      const event = makeEvent()
      const result = await manager.downloadModel(event, DEFAULT_MODEL_ID)

      expect(result.status).toBe('error')
      expect((result as { status: string; message: string }).message).toContain('mismatch')
      expect(mockUnlink).toHaveBeenCalledWith(expect.stringContaining('sqlcoder-7b-2.Q4_K_M.gguf'))
    })
  })

  describe('cancelDownload', () => {
    it('does not throw when no active download', () => {
      expect(() => manager.cancelDownload(DEFAULT_MODEL_ID)).not.toThrow()
    })

    it('aborts active download and returns cancelled', async () => {
      makeFileSystemMock()

      let resolveRead!: (val: { done: true; value: undefined }) => void
      const hangingReadPromise = new Promise<{ done: true; value: undefined }>(
        (res) => (resolveRead = res)
      )

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => String(MODEL_CATALOG[DEFAULT_MODEL_ID].fileSizeBytes) },
        body: {
          getReader: () => ({
            read: () => hangingReadPromise
          })
        }
      })

      const event = makeEvent()
      const downloadPromise = manager.downloadModel(event, DEFAULT_MODEL_ID)

      // Wait a tick so mkdir/fetch resolve and the download enters the read loop
      await Promise.resolve()
      await Promise.resolve()

      // Now abort and unblock the read
      manager.cancelDownload(DEFAULT_MODEL_ID)
      resolveRead({ done: true, value: undefined })

      const result = await downloadPromise
      expect(result.status).toBe('cancelled')
    })
  })

  describe('deleteModel', () => {
    it('calls unlink on the model file', async () => {
      await manager.deleteModel(DEFAULT_MODEL_ID)
      expect(mockUnlink).toHaveBeenCalledWith(
        expect.stringContaining('sqlcoder-7b-2.Q4_K_M.gguf')
      )
    })

    it('does nothing for unknown model', async () => {
      await manager.deleteModel('nonexistent')
      expect(mockUnlink).not.toHaveBeenCalled()
    })
  })

  describe('MODEL_CATALOG', () => {
    it('contains sqlcoder-7b-q4 entry with required fields', () => {
      const entry = MODEL_CATALOG[DEFAULT_MODEL_ID]
      expect(entry).toBeDefined()
      expect(entry.fileName).toContain('.gguf')
      expect(entry.fileSizeBytes).toBeGreaterThan(0)
      expect(entry.downloadUrl).toContain('huggingface.co')
      expect(entry.supportedProviders).toContain('sqlserver')
      expect(entry.supportedProviders).toContain('postgres')
      expect(entry.supportedProviders).toContain('mysql')
      expect(entry.supportedProviders).toContain('sqlite')
    })
  })
})

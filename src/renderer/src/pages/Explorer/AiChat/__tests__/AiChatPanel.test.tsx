import { render, screen, waitFor, act, cleanup, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { AiChatPanel } from '../AiChatPanel'
import type { AiChatPanelProps } from '../AiChatPanel'

// jsdom doesn't implement scrollIntoView
window.HTMLElement.prototype.scrollIntoView = vi.fn()

// navigator.clipboard is unavailable in jsdom
Object.defineProperty(navigator, 'clipboard', {
  value: { writeText: vi.fn().mockResolvedValue(undefined) },
  configurable: true
})

const DEFAULT_PROPS: AiChatPanelProps = {
  connectionId: 'conn-1',
  connectionName: 'My DB',
  databaseName: 'mydb',
  provider: 'postgres',
  onInsertSql: vi.fn()
}

function renderPanel(overrides: Partial<AiChatPanelProps> = {}) {
  return render(<AiChatPanel {...DEFAULT_PROPS} {...overrides} />)
}

describe('AiChatPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(window.api.ai, 'checkModel').mockResolvedValue({ exists: false })
    vi.spyOn(window.api.ai, 'onDownloadProgress').mockReturnValue(() => {})
    vi.spyOn(window.api.ai, 'onChatChunk').mockReturnValue(() => {})
    vi.spyOn(window.api.ai, 'getSchemaContext').mockResolvedValue({
      databaseName: 'mydb',
      provider: 'postgres',
      ddl: 'CREATE TABLE users (id int PRIMARY KEY);',
      tableCount: 1
    })
    vi.spyOn(window.api.ai, 'chatStream').mockResolvedValue({ status: 'ok' })
    vi.spyOn(window.api.ai, 'abortCompletion').mockResolvedValue(undefined)
    vi.spyOn(window.api.ai, 'cancelDownload').mockResolvedValue(undefined)
    vi.spyOn(window.api.ai, 'downloadModel').mockResolvedValue({ status: 'ok', filePath: '/models/test.gguf' })
  })

  afterEach(() => {
    cleanup()
  })

  // ── Model not present ──────────────────────────────────────────────────────

  it('shows ModelSetup with download button when model not downloaded', async () => {
    renderPanel()
    await waitFor(() => {
      expect(screen.getByText(/Download Model/i)).toBeInTheDocument()
    })
    expect(screen.getByText(/SQLCoder AI Model Required/i)).toBeInTheDocument()
  })

  it('clicking download button calls downloadModel', async () => {
    vi.spyOn(window.api.ai, 'downloadModel').mockReturnValue(new Promise(() => {}))
    renderPanel()

    await waitFor(() => screen.getByText(/Download Model/i))
    await userEvent.click(screen.getByText(/Download Model/i))

    expect(window.api.ai.downloadModel).toHaveBeenCalledWith('sqlcoder-7b-q4')
  })

  it('shows Downloading state after clicking download', async () => {
    vi.spyOn(window.api.ai, 'downloadModel').mockReturnValue(new Promise(() => {}))
    renderPanel()

    await waitFor(() => screen.getByText(/Download Model/i))
    await userEvent.click(screen.getByText(/Download Model/i))

    await waitFor(() => {
      expect(screen.getByText(/Downloading SQLCoder/i)).toBeInTheDocument()
    })
  })

  // ── Download progress ──────────────────────────────────────────────────────

  it('shows progress when download progress event fires', async () => {
    let progressCallback: ((data: unknown) => void) | null = null
    vi.spyOn(window.api.ai, 'onDownloadProgress').mockImplementation((cb) => {
      progressCallback = cb as (data: unknown) => void
      return () => {}
    })
    vi.spyOn(window.api.ai, 'downloadModel').mockReturnValue(new Promise(() => {}))

    renderPanel()
    await waitFor(() => screen.getByText(/Download Model/i))
    await userEvent.click(screen.getByText(/Download Model/i))

    act(() => {
      progressCallback?.({
        modelId: 'sqlcoder-7b-q4',
        downloaded: 2_000_000_000,
        total: 4_108_792_832,
        percent: 49
      })
    })

    await waitFor(() => {
      expect(screen.getByText(/49%/)).toBeInTheDocument()
    })
  })

  it('cancel button calls cancelDownload', async () => {
    let progressCallback: ((data: unknown) => void) | null = null
    vi.spyOn(window.api.ai, 'onDownloadProgress').mockImplementation((cb) => {
      progressCallback = cb as (data: unknown) => void
      return () => {}
    })
    vi.spyOn(window.api.ai, 'downloadModel').mockReturnValue(new Promise(() => {}))
    renderPanel()

    await waitFor(() => screen.getByText(/Download Model/i))
    await userEvent.click(screen.getByText(/Download Model/i))

    // Trigger progress so the Cancel button appears
    act(() => {
      progressCallback?.({
        modelId: 'sqlcoder-7b-q4',
        downloaded: 500_000_000,
        total: 4_108_792_832,
        percent: 12
      })
    })

    await waitFor(() => screen.getByText(/Cancel/i))
    await userEvent.click(screen.getByText(/Cancel/i))

    expect(window.api.ai.cancelDownload).toHaveBeenCalledWith('sqlcoder-7b-q4')
  })

  // ── Model ready → ChatView ─────────────────────────────────────────────────

  it('shows ChatView textarea when model is present', async () => {
    vi.spyOn(window.api.ai, 'checkModel').mockResolvedValue({ exists: true, filePath: '/models/sqlcoder.gguf' })
    renderPanel()

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Ask about your data/i)).toBeInTheDocument()
    })
  })

  it('shows database name in header when connection provided', async () => {
    vi.spyOn(window.api.ai, 'checkModel').mockResolvedValue({ exists: true, filePath: '/models/test.gguf' })
    renderPanel()

    await waitFor(() => {
      expect(screen.getByText('mydb')).toBeInTheDocument()
    })
  })

  it('does not show connection label when no connection provided', async () => {
    vi.spyOn(window.api.ai, 'checkModel').mockResolvedValue({ exists: true, filePath: '/models/test.gguf' })
    renderPanel({ connectionId: null, databaseName: null })

    await waitFor(() => screen.getByPlaceholderText(/Ask about your data/i))
    expect(screen.queryByText('mydb')).not.toBeInTheDocument()
  })

  // ── Sending messages ───────────────────────────────────────────────────────

  it('calls chatStream when user types and presses Enter', async () => {
    vi.spyOn(window.api.ai, 'checkModel').mockResolvedValue({ exists: true, filePath: '/models/test.gguf' })
    renderPanel()

    const textarea = await screen.findByPlaceholderText(/Ask about your data/i)

    // Wait for schema context to load so textarea is enabled
    await waitFor(() => expect(textarea).not.toBeDisabled())

    fireEvent.change(textarea, { target: { value: 'show me all users' } })
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })

    expect(window.api.ai.chatStream).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionId: 'conn-1',
        databaseName: 'mydb',
        provider: 'postgres',
        message: 'show me all users'
      }),
      expect.any(String)
    )
  })

  it('renders user message bubble after sending', async () => {
    vi.spyOn(window.api.ai, 'checkModel').mockResolvedValue({ exists: true, filePath: '/models/test.gguf' })
    renderPanel()

    const textarea = await screen.findByPlaceholderText(/Ask about your data/i)
    await waitFor(() => expect(textarea).not.toBeDisabled())

    fireEvent.change(textarea, { target: { value: 'count all orders' } })
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })

    await waitFor(() => {
      expect(screen.getByText('count all orders')).toBeInTheDocument()
    })
  })

  // ── Streaming and chunks ───────────────────────────────────────────────────

  it('shows "Insert into editor" button after SQL code block in response', async () => {
    vi.spyOn(window.api.ai, 'checkModel').mockResolvedValue({ exists: true, filePath: '/models/test.gguf' })

    let chunkCallback: ((data: unknown) => void) | null = null
    let capturedSessionId: string | null = null

    vi.spyOn(window.api.ai, 'onChatChunk').mockImplementation((cb) => {
      chunkCallback = cb as (data: unknown) => void
      return () => {}
    })
    vi.spyOn(window.api.ai, 'chatStream').mockImplementation((_request, sessionId) => {
      capturedSessionId = sessionId
      return Promise.resolve({ status: 'ok' as const })
    })

    const onInsertSql = vi.fn()
    render(<AiChatPanel {...DEFAULT_PROPS} onInsertSql={onInsertSql} />)

    const textarea = await screen.findByPlaceholderText(/Ask about your data/i)
    await waitFor(() => expect(textarea).not.toBeDisabled())

    fireEvent.change(textarea, { target: { value: 'give me SQL' } })
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })

    await waitFor(() => expect(capturedSessionId).not.toBeNull())

    const sqlContent = 'SELECT * FROM users WHERE id = 1'
    const formattedSql = 'SELECT\n  *\nFROM\n  users\nWHERE\n  id = 1'
    act(() => {
      chunkCallback?.({
        sessionId: capturedSessionId,
        delta: '',
        done: true,
        fullText: `\`\`\`sql\n${sqlContent}\n\`\`\``
      })
    })

    await waitFor(() => {
      expect(screen.getByText(/Insert into editor/i)).toBeInTheDocument()
    })

    await userEvent.click(screen.getByText(/Insert into editor/i))
    expect(onInsertSql).toHaveBeenCalledWith(formattedSql)
  })

  // ── Stop streaming ─────────────────────────────────────────────────────────

  it('shows Stop button while streaming and calls abortCompletion', async () => {
    vi.spyOn(window.api.ai, 'checkModel').mockResolvedValue({ exists: true, filePath: '/models/test.gguf' })
    vi.spyOn(window.api.ai, 'chatStream').mockReturnValue(new Promise(() => {}))

    renderPanel()

    const textarea = await screen.findByPlaceholderText(/Ask about your data/i)
    await waitFor(() => expect(textarea).not.toBeDisabled())

    fireEvent.change(textarea, { target: { value: 'stop me' } })
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })

    await waitFor(() => {
      expect(screen.getByTitle('Stop generation')).toBeInTheDocument()
    })

    await userEvent.click(screen.getByTitle('Stop generation'))
    expect(window.api.ai.abortCompletion).toHaveBeenCalled()
  })

  // ── Clear Chat ─────────────────────────────────────────────────────────────

  it('shows New Session button in the header', async () => {
    vi.spyOn(window.api.ai, 'checkModel').mockResolvedValue({ exists: true, filePath: '/models/test.gguf' })
    renderPanel()

    await screen.findByPlaceholderText(/Ask about your data/i)
    expect(screen.getByLabelText('New Session')).toBeInTheDocument()
  })

  it('clears messages when New Session button is clicked', async () => {
    vi.spyOn(window.api.ai, 'checkModel').mockResolvedValue({ exists: true, filePath: '/models/test.gguf' })
    renderPanel()

    const textarea = await screen.findByPlaceholderText(/Ask about your data/i)
    await waitFor(() => expect(textarea).not.toBeDisabled())

    fireEvent.change(textarea, { target: { value: 'hello' } })
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })

    await waitFor(() => {
      expect(screen.getByText('hello')).toBeInTheDocument()
    })

    await userEvent.click(screen.getByLabelText('New Session'))

    await waitFor(() => {
      expect(screen.queryByText('hello')).not.toBeInTheDocument()
    })
  })

  // ── Error state ────────────────────────────────────────────────────────────

  it('shows retry button and error message after download error', async () => {
    vi.spyOn(window.api.ai, 'downloadModel').mockResolvedValue({
      status: 'error' as const,
      message: 'Network error'
    })
    renderPanel()

    await waitFor(() => screen.getByText(/Download Model/i))
    await userEvent.click(screen.getByText(/Download Model/i))

    await waitFor(() => {
      expect(screen.getByText(/Download Failed/i)).toBeInTheDocument()
    })
    expect(screen.getByText(/Retry/i)).toBeInTheDocument()
    expect(screen.getByText(/Network error/i)).toBeInTheDocument()
  })
})

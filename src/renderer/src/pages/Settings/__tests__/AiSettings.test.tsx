import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}:${JSON.stringify(opts)}` : key
  })
}))

const mockUpdateSetting = vi.fn()

vi.mock('../useSettings', () => ({
  useSettings: () => ({
    settings: { hfToken: '' },
    updateSetting: mockUpdateSetting
  })
}))

const readyModel = {
  modelId: 'sqlcoder-7b-q4',
  displayName: 'SQLCoder 7B (Q4_K_M)',
  description: 'Specialized SQL generation model for text-to-SQL tasks.',
  fileSizeBytes: 0,
  fileName: 'sqlcoder-7b-2-IQ4_NL.gguf',
  status: 'ready' as const,
  sizeOnDisk: 4_200_000_000
}

const notDownloadedModel = {
  ...readyModel,
  status: 'not-downloaded' as const,
  sizeOnDisk: undefined
}

const { default: AiSettings } = await import('../AiSettings')

describe('AiSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(window.api.ai, 'listModels').mockResolvedValue([])
    vi.spyOn(window.api.ai, 'onDownloadProgress').mockReturnValue(() => {})
  })

  afterEach(() => {
    cleanup()
  })

  it('renders the HF token input', () => {
    render(<AiSettings />)
    expect(screen.getByLabelText('settings.ai.hfToken.label')).toBeInTheDocument()
  })

  it('calls updateSetting when HF token changes', async () => {
    const user = userEvent.setup()
    render(<AiSettings />)

    await user.type(screen.getByLabelText('settings.ai.hfToken.label'), 'x')

    expect(mockUpdateSetting).toHaveBeenCalledWith('hfToken', 'x')
  })

  it('renders a downloaded model with size and Delete button', async () => {
    vi.spyOn(window.api.ai, 'listModels').mockResolvedValue([readyModel])
    render(<AiSettings />)

    await waitFor(() => {
      expect(screen.getByText('SQLCoder 7B (Q4_K_M)')).toBeInTheDocument()
    })

    expect(screen.getByText('settings.ai.models.delete')).toBeInTheDocument()
    expect(
      screen.getByText('settings.ai.models.sizeOnDisk:{"size":"4.2 GB"}')
    ).toBeInTheDocument()
  })

  it('renders a not-downloaded model with Download button', async () => {
    vi.spyOn(window.api.ai, 'listModels').mockResolvedValue([notDownloadedModel])
    render(<AiSettings />)

    await waitFor(() => {
      expect(screen.getByText('SQLCoder 7B (Q4_K_M)')).toBeInTheDocument()
    })

    expect(screen.getByText('settings.ai.models.download')).toBeInTheDocument()
    expect(screen.getByText('settings.ai.models.notDownloaded')).toBeInTheDocument()
  })

  it('shows inline confirm state when Delete is clicked', async () => {
    const user = userEvent.setup()
    vi.spyOn(window.api.ai, 'listModels').mockResolvedValue([readyModel])
    render(<AiSettings />)

    await waitFor(() => screen.getByText('settings.ai.models.delete'))
    await user.click(screen.getByText('settings.ai.models.delete'))

    expect(screen.getByText('settings.ai.models.confirmDelete')).toBeInTheDocument()
    expect(screen.getByText('settings.ai.models.cancelDelete')).toBeInTheDocument()
  })

  it('calls deleteModel and refreshes list on confirm delete', async () => {
    const user = userEvent.setup()
    const listSpy = vi.spyOn(window.api.ai, 'listModels').mockResolvedValue([readyModel])
    const deleteSpy = vi.spyOn(window.api.ai, 'deleteModel').mockResolvedValue(undefined)
    render(<AiSettings />)

    await waitFor(() => screen.getByText('settings.ai.models.delete'))
    await user.click(screen.getByText('settings.ai.models.delete'))
    await user.click(screen.getByText('settings.ai.models.confirmDelete'))

    await waitFor(() => {
      expect(deleteSpy).toHaveBeenCalledWith('sqlcoder-7b-q4')
      expect(listSpy).toHaveBeenCalledTimes(2)
    })
  })

  it('cancels delete confirmation without calling deleteModel', async () => {
    const user = userEvent.setup()
    const deleteSpy = vi.spyOn(window.api.ai, 'deleteModel').mockResolvedValue(undefined)
    vi.spyOn(window.api.ai, 'listModels').mockResolvedValue([readyModel])
    render(<AiSettings />)

    await waitFor(() => screen.getByText('settings.ai.models.delete'))
    await user.click(screen.getByText('settings.ai.models.delete'))
    await user.click(screen.getByText('settings.ai.models.cancelDelete'))

    expect(screen.getByText('settings.ai.models.delete')).toBeInTheDocument()
    expect(deleteSpy).not.toHaveBeenCalled()
  })

  it('shows downloading state and Cancel button during download', async () => {
    const user = userEvent.setup()
    vi.spyOn(window.api.ai, 'listModels').mockResolvedValue([notDownloadedModel])
    vi.spyOn(window.api.ai, 'downloadModel').mockReturnValue(new Promise(() => {}))
    const cancelSpy = vi.spyOn(window.api.ai, 'cancelDownload').mockResolvedValue(undefined)
    render(<AiSettings />)

    await waitFor(() => screen.getByText('settings.ai.models.download'))
    await user.click(screen.getByText('settings.ai.models.download'))

    expect(screen.getByText('settings.ai.models.cancel')).toBeInTheDocument()

    await user.click(screen.getByText('settings.ai.models.cancel'))
    expect(cancelSpy).toHaveBeenCalledWith('sqlcoder-7b-q4')
  })

  it('refreshes model list after successful download', async () => {
    const user = userEvent.setup()
    const listSpy = vi.spyOn(window.api.ai, 'listModels').mockResolvedValue([notDownloadedModel])
    vi.spyOn(window.api.ai, 'downloadModel').mockResolvedValue({
      status: 'ok' as const,
      filePath: '/models/sqlcoder.gguf'
    })
    render(<AiSettings />)

    await waitFor(() => screen.getByText('settings.ai.models.download'))
    await user.click(screen.getByText('settings.ai.models.download'))

    await waitFor(() => {
      expect(listSpy).toHaveBeenCalledTimes(2)
    })
  })

  it('shows error message after failed download', async () => {
    const user = userEvent.setup()
    vi.spyOn(window.api.ai, 'listModels').mockResolvedValue([notDownloadedModel])
    vi.spyOn(window.api.ai, 'downloadModel').mockResolvedValue(
      { status: 'error', message: 'HTTP 404' } as unknown as { status: 'ok'; filePath: string }
    )
    render(<AiSettings />)

    await waitFor(() => screen.getByText('settings.ai.models.download'))
    await user.click(screen.getByText('settings.ai.models.download'))

    await waitFor(() => {
      expect(screen.getByText('HTTP 404')).toBeInTheDocument()
    })
  })

  it('shows auth hint for 401 errors', async () => {
    const user = userEvent.setup()
    vi.spyOn(window.api.ai, 'listModels').mockResolvedValue([notDownloadedModel])
    vi.spyOn(window.api.ai, 'downloadModel').mockResolvedValue(
      { status: 'error', message: 'Download failed: HTTP 401' } as unknown as { status: 'ok'; filePath: string }
    )

    render(<AiSettings />)
    await waitFor(() => screen.getByText('settings.ai.models.download'))
    await user.click(screen.getByText('settings.ai.models.download'))

    await waitFor(() => {
      expect(screen.getByText('settings.ai.models.authHint')).toBeInTheDocument()
    })
  })
})

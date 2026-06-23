import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import RestoreMongoDatabaseDialog from '../RestoreMongoDatabaseDialog'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}))

vi.mock('../../../../Settings/useSettings', () => ({
  useSettings: () => ({
    settings: { mongodumpPath: '', mongorestorePath: '' },
    updateSetting: vi.fn(),
    resetSettings: vi.fn()
  })
}))

describe('RestoreMongoDatabaseDialog', () => {
  const onClose = vi.fn()

  beforeEach(() => vi.clearAllMocks())
  afterEach(() => cleanup())

  function renderDialog(): void {
    render(<RestoreMongoDatabaseDialog connectionId="c1" databaseName="shop" onClose={onClose} />)
  }

  it('renders the title and defaults the target to the database name', () => {
    renderDialog()
    expect(screen.getByText('explorer.mongoRestore.dialogTitle')).toBeInTheDocument()
    expect(screen.getByLabelText('explorer.mongoRestore.targetDatabase')).toHaveValue('shop')
  })

  it('validates that a source file is required', async () => {
    const exec = vi.spyOn(window.api.database, 'mongoExecuteRestore')
    const user = userEvent.setup()
    renderDialog()
    await user.click(screen.getByText('explorer.mongoRestore.restore'))
    expect(
      await screen.findByText('explorer.mongoRestore.validation.fileRequired')
    ).toBeInTheDocument()
    expect(exec).not.toHaveBeenCalled()
  })

  it('chooses a file and runs the restore', async () => {
    vi.spyOn(window.api.database, 'mongoPickRestoreFile').mockResolvedValue({
      status: 'ok',
      filePath: '/tmp/shop.archive'
    })
    const exec = vi.spyOn(window.api.database, 'mongoExecuteRestore').mockResolvedValue({
      status: 'ok',
      engine: 'mongodump',
      durationMs: 500,
      collectionsRestored: 4
    })
    const user = userEvent.setup()
    renderDialog()

    await user.click(screen.getByText('explorer.mongoRestore.chooseFile'))
    expect(await screen.findByText('/tmp/shop.archive')).toBeInTheDocument()

    await user.click(screen.getByText('explorer.mongoRestore.restore'))
    await waitFor(() => expect(exec).toHaveBeenCalled())
    expect(await screen.findByText('explorer.mongoRestore.success')).toBeInTheDocument()
  })

  it('surfaces a server error', async () => {
    vi.spyOn(window.api.database, 'mongoPickRestoreFile').mockResolvedValue({
      status: 'ok',
      filePath: '/tmp/shop.archive'
    })
    vi.spyOn(window.api.database, 'mongoExecuteRestore').mockResolvedValue({
      status: 'error',
      message: 'authentication failed'
    })
    const user = userEvent.setup()
    renderDialog()
    await user.click(screen.getByText('explorer.mongoRestore.chooseFile'))
    await screen.findByText('/tmp/shop.archive')
    await user.click(screen.getByText('explorer.mongoRestore.restore'))
    expect(await screen.findByText(/authentication failed/)).toBeInTheDocument()
  })
})

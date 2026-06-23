import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import RestoreSqliteDatabaseDialog from '../RestoreSqliteDatabaseDialog'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}))

describe('RestoreSqliteDatabaseDialog', () => {
  const onClose = vi.fn()

  beforeEach(() => vi.clearAllMocks())
  afterEach(() => cleanup())

  function renderDialog(): void {
    render(<RestoreSqliteDatabaseDialog connectionId="c1" databaseName="main" onClose={onClose} />)
  }

  it('renders the title and defaults the safety-copy toggle to on', () => {
    renderDialog()
    expect(screen.getByText('explorer.sqliteRestore.dialogTitle')).toBeInTheDocument()
    expect(screen.getByLabelText('explorer.sqliteRestore.safetyCopy')).toBeChecked()
  })

  it('validates that a backup file is required', async () => {
    const exec = vi.spyOn(window.api.database, 'sqliteExecuteRestore')
    const user = userEvent.setup()
    renderDialog()
    await user.click(screen.getByText('explorer.sqliteRestore.restore'))
    expect(
      await screen.findByText('explorer.sqliteRestore.validation.fileRequired')
    ).toBeInTheDocument()
    expect(exec).not.toHaveBeenCalled()
  })

  it('chooses a file and runs the restore with safety copy enabled', async () => {
    vi.spyOn(window.api.database, 'sqlitePickRestoreFile').mockResolvedValue({
      status: 'ok',
      filePath: '/tmp/backup.db'
    })
    const exec = vi.spyOn(window.api.database, 'sqliteExecuteRestore').mockResolvedValue({
      status: 'ok',
      durationMs: 300,
      safetyCopyPath: '/tmp/main.db.pre-restore-x.db'
    })
    const user = userEvent.setup()
    renderDialog()

    await user.click(screen.getByText('explorer.sqliteRestore.chooseFile'))
    expect(await screen.findByText('/tmp/backup.db')).toBeInTheDocument()

    await user.click(screen.getByText('explorer.sqliteRestore.restore'))
    await waitFor(() => expect(exec).toHaveBeenCalled())
    expect(exec).toHaveBeenCalledWith('c1', { filePath: '/tmp/backup.db', safetyCopy: true })
    expect(await screen.findByText(/explorer.sqliteRestore.success/)).toBeInTheDocument()
  })

  it('surfaces a server error', async () => {
    vi.spyOn(window.api.database, 'sqlitePickRestoreFile').mockResolvedValue({
      status: 'ok',
      filePath: '/tmp/backup.db'
    })
    vi.spyOn(window.api.database, 'sqliteExecuteRestore').mockResolvedValue({
      status: 'error',
      message: 'not a valid SQLite database'
    })
    const user = userEvent.setup()
    renderDialog()
    await user.click(screen.getByText('explorer.sqliteRestore.chooseFile'))
    await user.click(screen.getByText('explorer.sqliteRestore.restore'))
    expect(await screen.findByText('not a valid SQLite database')).toBeInTheDocument()
  })
})

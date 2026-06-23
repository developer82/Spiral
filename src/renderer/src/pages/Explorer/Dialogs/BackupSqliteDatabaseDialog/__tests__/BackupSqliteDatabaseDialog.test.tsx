import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import BackupSqliteDatabaseDialog from '../BackupSqliteDatabaseDialog'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}))

describe('BackupSqliteDatabaseDialog', () => {
  const onClose = vi.fn()

  beforeEach(() => vi.clearAllMocks())
  afterEach(() => cleanup())

  function renderDialog(): void {
    render(<BackupSqliteDatabaseDialog connectionId="c1" databaseName="main" onClose={onClose} />)
  }

  it('renders the title and the database name', () => {
    renderDialog()
    expect(screen.getByText('explorer.sqliteBackup.dialogTitle')).toBeInTheDocument()
    expect(screen.getByText('main')).toBeInTheDocument()
  })

  it('validates that a destination file is required', async () => {
    const exec = vi.spyOn(window.api.database, 'sqliteExecuteBackup')
    const user = userEvent.setup()
    renderDialog()
    await user.click(screen.getByText('explorer.sqliteBackup.backUp'))
    expect(
      await screen.findByText('explorer.sqliteBackup.validation.fileRequired')
    ).toBeInTheDocument()
    expect(exec).not.toHaveBeenCalled()
  })

  it('chooses a file and runs the backup with the selected options', async () => {
    vi.spyOn(window.api.database, 'sqlitePickBackupPath').mockResolvedValue({
      status: 'ok',
      filePath: '/tmp/main.db'
    })
    const exec = vi.spyOn(window.api.database, 'sqliteExecuteBackup').mockResolvedValue({
      status: 'ok',
      filePath: '/tmp/main.db',
      durationMs: 500,
      bytes: 4096
    })
    const user = userEvent.setup()
    renderDialog()

    await user.click(screen.getByText('explorer.sqliteBackup.chooseFile'))
    expect(await screen.findByText('/tmp/main.db')).toBeInTheDocument()

    // Toggle compact on.
    await user.click(screen.getByLabelText('explorer.sqliteBackup.compact'))

    await user.click(screen.getByText('explorer.sqliteBackup.backUp'))
    await waitFor(() => expect(exec).toHaveBeenCalled())
    expect(exec).toHaveBeenCalledWith('c1', {
      filePath: '/tmp/main.db',
      compact: true,
      compress: false
    })
    expect(await screen.findByText('explorer.sqliteBackup.success')).toBeInTheDocument()
  })

  it('surfaces a server error', async () => {
    vi.spyOn(window.api.database, 'sqlitePickBackupPath').mockResolvedValue({
      status: 'ok',
      filePath: '/tmp/main.db'
    })
    vi.spyOn(window.api.database, 'sqliteExecuteBackup').mockResolvedValue({
      status: 'error',
      message: 'disk full'
    })
    const user = userEvent.setup()
    renderDialog()
    await user.click(screen.getByText('explorer.sqliteBackup.chooseFile'))
    await user.click(screen.getByText('explorer.sqliteBackup.backUp'))
    expect(await screen.findByText('disk full')).toBeInTheDocument()
  })
})

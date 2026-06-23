import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import BackupDatabaseDialog from '../BackupDatabaseDialog'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}))

describe('BackupDatabaseDialog', () => {
  const onClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(window.api.database, 'listServerDrives').mockResolvedValue({
      status: 'ok',
      drives: ['C:\\'],
      platform: 'windows'
    })
    vi.spyOn(window.api.database, 'listServerDir').mockResolvedValue({ status: 'ok', entries: [] })
  })

  afterEach(() => cleanup())

  function renderDialog(): void {
    render(<BackupDatabaseDialog connectionId="c1" databaseName="MyDB" onClose={onClose} />)
  }

  it('renders the title and the database name', () => {
    renderDialog()
    expect(screen.getByText('explorer.backup.dialogTitle')).toBeInTheDocument()
    expect(screen.getByText('MyDB')).toBeInTheDocument()
  })

  it('shows a validation error and does not run when no destination is set', async () => {
    const executeBackup = vi.spyOn(window.api.database, 'executeBackup')
    const user = userEvent.setup()
    renderDialog()
    await user.click(screen.getByText('explorer.backup.backUp'))
    expect(
      await screen.findByText('explorer.backup.validation.destinationRequired')
    ).toBeInTheDocument()
    expect(executeBackup).not.toHaveBeenCalled()
  })

  it('reveals the transaction log section when type is Transaction Log', async () => {
    const user = userEvent.setup()
    renderDialog()
    await user.selectOptions(screen.getByLabelText('explorer.backup.backupType'), 'log')
    expect(screen.getByText('explorer.backup.transactionLog')).toBeInTheDocument()
  })

  it('adds a destination via the server browser and runs the backup', async () => {
    const executeBackup = vi.spyOn(window.api.database, 'executeBackup').mockResolvedValue({
      status: 'ok',
      sql: 'BACKUP DATABASE [MyDB] ...',
      messages: [],
      durationMs: 1200
    })
    const user = userEvent.setup()
    renderDialog()

    await user.click(screen.getByText('explorer.backup.addDestination'))
    // server browser opens and lists drives
    await user.click(await screen.findByText('C:\\'))
    await waitFor(() =>
      expect(screen.getByText('explorer.serverFileBrowser.select')).toBeInTheDocument()
    )
    await user.click(screen.getByText('explorer.serverFileBrowser.select'))

    // destination chip now present
    expect(await screen.findByText('C:\\MyDB.bak')).toBeInTheDocument()

    await user.click(screen.getByText('explorer.backup.backUp'))
    await waitFor(() => expect(executeBackup).toHaveBeenCalled())
    const opts = executeBackup.mock.calls[0][1]
    expect(opts.destinations).toContain('C:\\MyDB.bak')
    expect(opts.databaseName).toBe('MyDB')
    expect(await screen.findByText('explorer.backup.success')).toBeInTheDocument()
  })

  it('surfaces a server error from executeBackup', async () => {
    vi.spyOn(window.api.database, 'executeBackup').mockResolvedValue({
      status: 'error',
      message: 'Cannot open backup device'
    })
    const user = userEvent.setup()
    renderDialog()

    await user.click(screen.getByText('explorer.backup.addDestination'))
    await user.click(await screen.findByText('C:\\'))
    await user.click(screen.getByText('explorer.serverFileBrowser.select'))
    await user.click(screen.getByText('explorer.backup.backUp'))

    expect(await screen.findByText('Cannot open backup device')).toBeInTheDocument()
  })
})

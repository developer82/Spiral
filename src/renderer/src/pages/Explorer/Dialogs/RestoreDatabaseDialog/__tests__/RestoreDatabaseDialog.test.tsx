import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import RestoreDatabaseDialog from '../RestoreDatabaseDialog'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}))

describe('RestoreDatabaseDialog', () => {
  const onClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(window.api.database, 'getBackupSets').mockResolvedValue({
      status: 'ok',
      history: [
        {
          databaseName: 'MyDB',
          backupType: 'full',
          backupFinishDate: '2026-01-01T00:00:00Z',
          physicalDevice: 'C:\\Backups\\MyDB.bak',
          position: 1
        }
      ]
    })
  })

  afterEach(() => cleanup())

  function renderDialog(): void {
    render(<RestoreDatabaseDialog connectionId="c1" databaseName="MyDB" onClose={onClose} />)
  }

  it('loads the restore plan from backup history in database mode', async () => {
    renderDialog()
    expect(await screen.findByText('C:\\Backups\\MyDB.bak')).toBeInTheDocument()
  })

  it('shows a validation error when the target database name is empty', async () => {
    const executeRestore = vi.spyOn(window.api.database, 'executeRestore')
    const user = userEvent.setup()
    renderDialog()
    await screen.findByText('C:\\Backups\\MyDB.bak')

    await user.clear(screen.getByLabelText('explorer.restore.targetDatabase'))
    await user.click(screen.getByText('explorer.restore.restore'))

    expect(
      await screen.findByText('explorer.restore.validation.targetRequired')
    ).toBeInTheDocument()
    expect(executeRestore).not.toHaveBeenCalled()
  })

  it('loads backup sets from a device file in device mode', async () => {
    vi.spyOn(window.api.database, 'listServerDrives').mockResolvedValue({
      status: 'ok',
      drives: ['C:\\'],
      platform: 'windows'
    })
    vi.spyOn(window.api.database, 'listServerDir').mockResolvedValue({
      status: 'ok',
      entries: [{ name: 'MyDB.bak', isDirectory: false }]
    })
    const readBackupHeader = vi.spyOn(window.api.database, 'readBackupHeader').mockResolvedValue({
      status: 'ok',
      backupSets: [
        {
          position: 1,
          name: 'MyDB-Full',
          backupType: 'full',
          serverName: 'SRV',
          databaseName: 'MyDB',
          backupStartDate: null,
          backupFinishDate: '2026-02-01T00:00:00Z'
        }
      ]
    })
    const user = userEvent.setup()
    renderDialog()

    await user.click(screen.getByLabelText('explorer.restore.sourceDevice'))
    await user.click(screen.getByText('explorer.restore.addDevice'))
    await user.click(await screen.findByText('C:\\'))
    await user.click(await screen.findByText('MyDB.bak'))
    await user.click(screen.getByText('explorer.serverFileBrowser.select'))

    await waitFor(() => expect(readBackupHeader).toHaveBeenCalled())
  })

  it('runs the restore and reports success', async () => {
    const executeRestore = vi.spyOn(window.api.database, 'executeRestore').mockResolvedValue({
      status: 'ok',
      sql: 'RESTORE DATABASE [MyDB] ...',
      messages: [],
      durationMs: 900
    })
    const user = userEvent.setup()
    renderDialog()
    await screen.findByText('C:\\Backups\\MyDB.bak')

    await user.click(screen.getByText('explorer.restore.restore'))

    await waitFor(() => expect(executeRestore).toHaveBeenCalled())
    const opts = executeRestore.mock.calls[0][1]
    expect(opts.targetDatabaseName).toBe('MyDB')
    expect(opts.source).toHaveLength(1)
    expect(await screen.findByText('explorer.restore.success')).toBeInTheDocument()
  })
})

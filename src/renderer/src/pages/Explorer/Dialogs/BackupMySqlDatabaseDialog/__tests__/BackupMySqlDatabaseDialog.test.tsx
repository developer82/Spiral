import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import BackupMySqlDatabaseDialog from '../BackupMySqlDatabaseDialog'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}))

vi.mock('../../../../Settings/useSettings', () => ({
  useSettings: () => ({
    settings: { mysqlDumpPath: '', mysqlClientPath: '' },
    updateSetting: vi.fn(),
    resetSettings: vi.fn()
  })
}))

describe('BackupMySqlDatabaseDialog', () => {
  const onClose = vi.fn()

  beforeEach(() => vi.clearAllMocks())
  afterEach(() => cleanup())

  function renderDialog(): void {
    render(<BackupMySqlDatabaseDialog connectionId="c1" databaseName="shop" onClose={onClose} />)
  }

  it('renders the title and the database name', () => {
    renderDialog()
    expect(screen.getByText('explorer.mysqlBackup.dialogTitle')).toBeInTheDocument()
    expect(screen.getByText('shop')).toBeInTheDocument()
  })

  it('shows the CLI engine banner when mysqldump is detected', async () => {
    renderDialog()
    expect(await screen.findByText('explorer.mysqlBackup.engineCli')).toBeInTheDocument()
  })

  it('shows the JS engine banner when mysqldump is missing', async () => {
    vi.spyOn(window.api.database, 'mysqlGetBackupTools').mockResolvedValue({
      status: 'ok',
      tools: { mysqldump: { found: false }, mysql: { found: false } }
    })
    renderDialog()
    expect(await screen.findByText('explorer.mysqlBackup.engineJs')).toBeInTheDocument()
  })

  it('validates that a destination file is required', async () => {
    const exec = vi.spyOn(window.api.database, 'mysqlExecuteBackup')
    const user = userEvent.setup()
    renderDialog()
    await user.click(screen.getByText('explorer.mysqlBackup.backUp'))
    expect(
      await screen.findByText('explorer.mysqlBackup.validation.fileRequired')
    ).toBeInTheDocument()
    expect(exec).not.toHaveBeenCalled()
  })

  it('chooses a file and runs the backup', async () => {
    vi.spyOn(window.api.database, 'mysqlPickBackupPath').mockResolvedValue({
      status: 'ok',
      filePath: '/tmp/shop.sql'
    })
    const exec = vi.spyOn(window.api.database, 'mysqlExecuteBackup').mockResolvedValue({
      status: 'ok',
      filePath: '/tmp/shop.sql',
      engine: 'mysqldump',
      durationMs: 800,
      bytes: 2048
    })
    const user = userEvent.setup()
    renderDialog()

    await user.click(screen.getByText('explorer.mysqlBackup.chooseFile'))
    expect(await screen.findByText('/tmp/shop.sql')).toBeInTheDocument()

    await user.click(screen.getByText('explorer.mysqlBackup.backUp'))
    await waitFor(() => expect(exec).toHaveBeenCalled())
    expect(await screen.findByText('explorer.mysqlBackup.success')).toBeInTheDocument()
  })

  it('previews the mysqldump command', async () => {
    vi.spyOn(window.api.database, 'mysqlBuildBackupPreview').mockResolvedValue({
      status: 'ok',
      command: 'mysqldump --password=****** shop > "/tmp/shop.sql"'
    })
    const user = userEvent.setup()
    renderDialog()
    await user.click(screen.getByText('explorer.mysqlBackup.previewCommand'))
    expect(
      await screen.findByText('mysqldump --password=****** shop > "/tmp/shop.sql"')
    ).toBeInTheDocument()
  })
})

import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import BackupPostgresDatabaseDialog from '../BackupPostgresDatabaseDialog'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}))

vi.mock('../../../../Settings/useSettings', () => ({
  useSettings: () => ({
    settings: { pgDumpPath: '', pgRestorePath: '', psqlPath: '' },
    updateSetting: vi.fn(),
    resetSettings: vi.fn()
  })
}))

describe('BackupPostgresDatabaseDialog', () => {
  const onClose = vi.fn()

  beforeEach(() => vi.clearAllMocks())
  afterEach(() => cleanup())

  function renderDialog(): void {
    render(<BackupPostgresDatabaseDialog connectionId="c1" databaseName="shop" onClose={onClose} />)
  }

  it('renders the title and the database name', () => {
    renderDialog()
    expect(screen.getByText('explorer.postgresBackup.dialogTitle')).toBeInTheDocument()
    expect(screen.getByText('shop')).toBeInTheDocument()
  })

  it('shows the CLI engine banner when pg_dump is detected', async () => {
    renderDialog()
    expect(await screen.findByText('explorer.postgresBackup.engineCli')).toBeInTheDocument()
  })

  it('shows the missing-tool banner when pg_dump is absent', async () => {
    vi.spyOn(window.api.database, 'postgresGetBackupTools').mockResolvedValue({
      status: 'ok',
      tools: { pgDump: { found: false }, pgRestore: { found: false }, psql: { found: false } }
    })
    renderDialog()
    expect(await screen.findByText('explorer.postgresBackup.engineMissing')).toBeInTheDocument()
  })

  it('validates that a destination file is required', async () => {
    const exec = vi.spyOn(window.api.database, 'postgresExecuteBackup')
    const user = userEvent.setup()
    renderDialog()
    await user.click(screen.getByText('explorer.postgresBackup.backUp'))
    expect(
      await screen.findByText('explorer.postgresBackup.validation.fileRequired')
    ).toBeInTheDocument()
    expect(exec).not.toHaveBeenCalled()
  })

  it('chooses a file and runs the backup', async () => {
    vi.spyOn(window.api.database, 'postgresPickBackupPath').mockResolvedValue({
      status: 'ok',
      filePath: '/tmp/shop.dump'
    })
    const exec = vi.spyOn(window.api.database, 'postgresExecuteBackup').mockResolvedValue({
      status: 'ok',
      filePath: '/tmp/shop.dump',
      durationMs: 800,
      bytes: 2048
    })
    const user = userEvent.setup()
    renderDialog()

    await user.click(screen.getByText('explorer.postgresBackup.chooseFile'))
    expect(await screen.findByText('/tmp/shop.dump')).toBeInTheDocument()

    await user.click(screen.getByText('explorer.postgresBackup.backUp'))
    await waitFor(() => expect(exec).toHaveBeenCalled())
    expect(await screen.findByText('explorer.postgresBackup.success')).toBeInTheDocument()
  })

  it('previews the pg_dump command', async () => {
    vi.spyOn(window.api.database, 'postgresBuildBackupPreview').mockResolvedValue({
      status: 'ok',
      command: 'PGPASSWORD=****** pg_dump --format=c --dbname=shop'
    })
    const user = userEvent.setup()
    renderDialog()
    await user.click(screen.getByText('explorer.postgresBackup.previewCommand'))
    expect(
      await screen.findByText('PGPASSWORD=****** pg_dump --format=c --dbname=shop')
    ).toBeInTheDocument()
  })

  it('surfaces a server error from the backup', async () => {
    vi.spyOn(window.api.database, 'postgresPickBackupPath').mockResolvedValue({
      status: 'ok',
      filePath: '/tmp/shop.dump'
    })
    vi.spyOn(window.api.database, 'postgresExecuteBackup').mockResolvedValue({
      status: 'error',
      message: 'pg_dump not found'
    })
    const user = userEvent.setup()
    renderDialog()
    await user.click(screen.getByText('explorer.postgresBackup.chooseFile'))
    await user.click(screen.getByText('explorer.postgresBackup.backUp'))
    expect(await screen.findByText(/pg_dump not found/)).toBeInTheDocument()
  })
})

import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import BackupMongoDatabaseDialog from '../BackupMongoDatabaseDialog'

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

describe('BackupMongoDatabaseDialog', () => {
  const onClose = vi.fn()

  beforeEach(() => vi.clearAllMocks())
  afterEach(() => cleanup())

  function renderDialog(): void {
    render(<BackupMongoDatabaseDialog connectionId="c1" databaseName="shop" onClose={onClose} />)
  }

  it('renders the title and the database name', () => {
    renderDialog()
    expect(screen.getByText('explorer.mongoBackup.dialogTitle')).toBeInTheDocument()
    expect(screen.getByText('shop')).toBeInTheDocument()
  })

  it('shows the CLI engine banner when mongodump is detected', async () => {
    renderDialog()
    expect(await screen.findByText('explorer.mongoBackup.engineCli')).toBeInTheDocument()
  })

  it('shows the JS engine banner when mongodump is missing', async () => {
    vi.spyOn(window.api.database, 'mongoGetBackupTools').mockResolvedValue({
      status: 'ok',
      tools: { mongodump: { found: false }, mongorestore: { found: false } }
    })
    renderDialog()
    expect(await screen.findByText('explorer.mongoBackup.engineJs')).toBeInTheDocument()
  })

  it('validates that a destination file is required', async () => {
    const exec = vi.spyOn(window.api.database, 'mongoExecuteBackup')
    const user = userEvent.setup()
    renderDialog()
    await user.click(screen.getByText('explorer.mongoBackup.backUp'))
    expect(
      await screen.findByText('explorer.mongoBackup.validation.fileRequired')
    ).toBeInTheDocument()
    expect(exec).not.toHaveBeenCalled()
  })

  it('chooses a file and runs the backup', async () => {
    vi.spyOn(window.api.database, 'mongoPickBackupPath').mockResolvedValue({
      status: 'ok',
      filePath: '/tmp/shop.archive'
    })
    const exec = vi.spyOn(window.api.database, 'mongoExecuteBackup').mockResolvedValue({
      status: 'ok',
      filePath: '/tmp/shop.archive',
      engine: 'mongodump',
      durationMs: 800,
      bytes: 2048
    })
    const user = userEvent.setup()
    renderDialog()

    await user.click(screen.getByText('explorer.mongoBackup.chooseFile'))
    expect(await screen.findByText('/tmp/shop.archive')).toBeInTheDocument()

    await user.click(screen.getByText('explorer.mongoBackup.backUp'))
    await waitFor(() => expect(exec).toHaveBeenCalled())
    expect(await screen.findByText('explorer.mongoBackup.success')).toBeInTheDocument()
  })

  it('previews the mongodump command', async () => {
    vi.spyOn(window.api.database, 'mongoGetBackupTools').mockResolvedValue({
      status: 'ok',
      tools: { mongodump: { found: true }, mongorestore: { found: true } }
    })
    vi.spyOn(window.api.database, 'mongoBuildBackupPreview').mockResolvedValue({
      status: 'ok',
      command: 'mongodump --uri=mongodb://admin:******@host --db=shop --archive=/tmp/shop.archive'
    })
    const user = userEvent.setup()
    renderDialog()
    // Wait for the CLI banner so the preview button is enabled.
    await screen.findByText('explorer.mongoBackup.engineCli')
    await user.click(screen.getByText('explorer.mongoBackup.previewCommand'))
    expect(
      await screen.findByText(
        'mongodump --uri=mongodb://admin:******@host --db=shop --archive=/tmp/shop.archive'
      )
    ).toBeInTheDocument()
  })
})

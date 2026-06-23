import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import RestorePostgresDatabaseDialog from '../RestorePostgresDatabaseDialog'

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

describe('RestorePostgresDatabaseDialog', () => {
  const onClose = vi.fn()

  beforeEach(() => vi.clearAllMocks())
  afterEach(() => cleanup())

  function renderDialog(): void {
    render(
      <RestorePostgresDatabaseDialog connectionId="c1" databaseName="shop" onClose={onClose} />
    )
  }

  it('renders the title and prefills the target database', () => {
    renderDialog()
    expect(screen.getByText('explorer.postgresRestore.dialogTitle')).toBeInTheDocument()
    expect(screen.getByDisplayValue('shop')).toBeInTheDocument()
  })

  it('requires a backup file before restoring', async () => {
    const exec = vi.spyOn(window.api.database, 'postgresExecuteRestore')
    const user = userEvent.setup()
    renderDialog()
    await user.click(screen.getByText('explorer.postgresRestore.restore'))
    expect(
      await screen.findByText('explorer.postgresRestore.validation.fileRequired')
    ).toBeInTheDocument()
    expect(exec).not.toHaveBeenCalled()
  })

  it('requires a target database name', async () => {
    vi.spyOn(window.api.database, 'postgresPickRestoreFile').mockResolvedValue({
      status: 'ok',
      filePath: '/tmp/shop.dump'
    })
    const user = userEvent.setup()
    renderDialog()
    await user.click(screen.getByText('explorer.postgresRestore.chooseFile'))
    await user.clear(screen.getByDisplayValue('shop'))
    await user.click(screen.getByText('explorer.postgresRestore.restore'))
    expect(
      await screen.findByText('explorer.postgresRestore.validation.targetRequired')
    ).toBeInTheDocument()
  })

  it('chooses a file and runs the restore', async () => {
    vi.spyOn(window.api.database, 'postgresPickRestoreFile').mockResolvedValue({
      status: 'ok',
      filePath: '/tmp/shop.dump'
    })
    const exec = vi.spyOn(window.api.database, 'postgresExecuteRestore').mockResolvedValue({
      status: 'ok',
      durationMs: 1200
    })
    const user = userEvent.setup()
    renderDialog()

    await user.click(screen.getByText('explorer.postgresRestore.chooseFile'))
    expect(await screen.findByText('/tmp/shop.dump')).toBeInTheDocument()

    await user.click(screen.getByText('explorer.postgresRestore.restore'))
    await waitFor(() => expect(exec).toHaveBeenCalled())
    expect(await screen.findByText('explorer.postgresRestore.success')).toBeInTheDocument()
  })

  it('surfaces a server error from the restore', async () => {
    vi.spyOn(window.api.database, 'postgresPickRestoreFile').mockResolvedValue({
      status: 'ok',
      filePath: '/tmp/shop.dump'
    })
    vi.spyOn(window.api.database, 'postgresExecuteRestore').mockResolvedValue({
      status: 'error',
      message: 'role "owner" does not exist'
    })
    const user = userEvent.setup()
    renderDialog()
    await user.click(screen.getByText('explorer.postgresRestore.chooseFile'))
    await user.click(screen.getByText('explorer.postgresRestore.restore'))
    expect(await screen.findByText(/role "owner" does not exist/)).toBeInTheDocument()
  })
})

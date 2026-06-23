import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import RestoreMySqlDatabaseDialog from '../RestoreMySqlDatabaseDialog'

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

describe('RestoreMySqlDatabaseDialog', () => {
  const onClose = vi.fn()

  beforeEach(() => vi.clearAllMocks())
  afterEach(() => cleanup())

  function renderDialog(): void {
    render(<RestoreMySqlDatabaseDialog connectionId="c1" databaseName="shop" onClose={onClose} />)
  }

  it('renders the title and defaults the target to the database name', () => {
    renderDialog()
    expect(screen.getByText('explorer.mysqlRestore.dialogTitle')).toBeInTheDocument()
    expect(screen.getByLabelText('explorer.mysqlRestore.targetDatabase')).toHaveValue('shop')
  })

  it('validates that a source file is required', async () => {
    const exec = vi.spyOn(window.api.database, 'mysqlExecuteRestore')
    const user = userEvent.setup()
    renderDialog()
    await user.click(screen.getByText('explorer.mysqlRestore.restore'))
    expect(
      await screen.findByText('explorer.mysqlRestore.validation.fileRequired')
    ).toBeInTheDocument()
    expect(exec).not.toHaveBeenCalled()
  })

  it('chooses a file and runs the restore', async () => {
    vi.spyOn(window.api.database, 'mysqlPickRestoreFile').mockResolvedValue({
      status: 'ok',
      filePath: '/tmp/shop.sql'
    })
    const exec = vi.spyOn(window.api.database, 'mysqlExecuteRestore').mockResolvedValue({
      status: 'ok',
      engine: 'mysqldump',
      durationMs: 500,
      statementsRun: 12
    })
    const user = userEvent.setup()
    renderDialog()

    await user.click(screen.getByText('explorer.mysqlRestore.chooseFile'))
    expect(await screen.findByText('/tmp/shop.sql')).toBeInTheDocument()

    await user.click(screen.getByText('explorer.mysqlRestore.restore'))
    await waitFor(() => expect(exec).toHaveBeenCalled())
    expect(await screen.findByText('explorer.mysqlRestore.success')).toBeInTheDocument()
  })

  it('surfaces a server error', async () => {
    vi.spyOn(window.api.database, 'mysqlPickRestoreFile').mockResolvedValue({
      status: 'ok',
      filePath: '/tmp/shop.sql'
    })
    vi.spyOn(window.api.database, 'mysqlExecuteRestore').mockResolvedValue({
      status: 'error',
      message: 'access denied'
    })
    const user = userEvent.setup()
    renderDialog()
    await user.click(screen.getByText('explorer.mysqlRestore.chooseFile'))
    await screen.findByText('/tmp/shop.sql')
    await user.click(screen.getByText('explorer.mysqlRestore.restore'))
    expect(await screen.findByText(/access denied/)).toBeInTheDocument()
  })
})

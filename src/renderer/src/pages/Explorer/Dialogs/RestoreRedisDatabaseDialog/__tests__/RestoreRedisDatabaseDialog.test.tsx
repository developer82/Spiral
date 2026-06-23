import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import RestoreRedisDatabaseDialog from '../RestoreRedisDatabaseDialog'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}))

describe('RestoreRedisDatabaseDialog', () => {
  const onClose = vi.fn()

  beforeEach(() => vi.clearAllMocks())
  afterEach(() => cleanup())

  it('shows the target database index field for a single-database restore', () => {
    render(
      <RestoreRedisDatabaseDialog
        connectionId="c1"
        scope={{ kind: 'database', databaseIndex: 3 }}
        onClose={onClose}
      />
    )
    expect(screen.getByText('explorer.redisRestore.dialogTitle')).toBeInTheDocument()
    expect(screen.getByLabelText('explorer.redisRestore.targetDatabaseIndex')).toHaveValue(3)
  })

  it('hides the target index field for an all-databases restore', () => {
    render(
      <RestoreRedisDatabaseDialog connectionId="c1" scope={{ kind: 'all' }} onClose={onClose} />
    )
    expect(screen.getByText('explorer.redisRestore.dialogTitleAll')).toBeInTheDocument()
    expect(
      screen.queryByLabelText('explorer.redisRestore.targetDatabaseIndex')
    ).not.toBeInTheDocument()
  })

  it('validates that a backup file is required', async () => {
    const exec = vi.spyOn(window.api.database, 'redisExecuteRestore')
    const user = userEvent.setup()
    render(
      <RestoreRedisDatabaseDialog
        connectionId="c1"
        scope={{ kind: 'database', databaseIndex: 0 }}
        onClose={onClose}
      />
    )
    await user.click(screen.getByText('explorer.redisRestore.restore'))
    expect(
      await screen.findByText('explorer.redisRestore.validation.fileRequired')
    ).toBeInTheDocument()
    expect(exec).not.toHaveBeenCalled()
  })

  it('chooses a file and restores with the selected conflict mode and target index', async () => {
    vi.spyOn(window.api.database, 'redisPickRestoreFile').mockResolvedValue({
      status: 'ok',
      filePath: '/tmp/redis.json'
    })
    const exec = vi.spyOn(window.api.database, 'redisExecuteRestore').mockResolvedValue({
      status: 'ok',
      durationMs: 200,
      keysRestored: 5,
      keysSkipped: 1,
      databaseCount: 1
    })
    const user = userEvent.setup()
    render(
      <RestoreRedisDatabaseDialog
        connectionId="c1"
        scope={{ kind: 'database', databaseIndex: 2 }}
        onClose={onClose}
      />
    )

    await user.click(screen.getByText('explorer.redisRestore.chooseFile'))
    expect(await screen.findByText('/tmp/redis.json')).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('explorer.redisRestore.conflict'), 'flush')

    await user.click(screen.getByText('explorer.redisRestore.restore'))
    await waitFor(() => expect(exec).toHaveBeenCalled())
    expect(exec).toHaveBeenCalledWith('c1', {
      filePath: '/tmp/redis.json',
      conflict: 'flush',
      targetDatabaseIndex: 2
    })
    expect(await screen.findByText('explorer.redisRestore.success')).toBeInTheDocument()
  })

  it('omits the target index for an all-databases restore', async () => {
    vi.spyOn(window.api.database, 'redisPickRestoreFile').mockResolvedValue({
      status: 'ok',
      filePath: '/tmp/all.json'
    })
    const exec = vi.spyOn(window.api.database, 'redisExecuteRestore').mockResolvedValue({
      status: 'ok',
      durationMs: 1,
      keysRestored: 0,
      keysSkipped: 0,
      databaseCount: 2
    })
    const user = userEvent.setup()
    render(
      <RestoreRedisDatabaseDialog connectionId="c1" scope={{ kind: 'all' }} onClose={onClose} />
    )
    await user.click(screen.getByText('explorer.redisRestore.chooseFile'))
    await user.click(screen.getByText('explorer.redisRestore.restore'))
    await waitFor(() => expect(exec).toHaveBeenCalled())
    expect(exec).toHaveBeenCalledWith('c1', {
      filePath: '/tmp/all.json',
      conflict: 'replace',
      targetDatabaseIndex: undefined
    })
  })
})

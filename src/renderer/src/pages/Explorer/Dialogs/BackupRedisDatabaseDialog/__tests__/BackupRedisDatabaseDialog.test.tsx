import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import BackupRedisDatabaseDialog from '../BackupRedisDatabaseDialog'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}))

describe('BackupRedisDatabaseDialog', () => {
  const onClose = vi.fn()

  beforeEach(() => vi.clearAllMocks())
  afterEach(() => cleanup())

  it('renders the single-database title and scope label', () => {
    render(
      <BackupRedisDatabaseDialog
        connectionId="c1"
        scope={{ kind: 'database', databaseIndex: 2 }}
        onClose={onClose}
      />
    )
    expect(screen.getByText('explorer.redisBackup.dialogTitle')).toBeInTheDocument()
    expect(screen.getByText('explorer.redisBackup.scopeDatabase')).toBeInTheDocument()
  })

  it('renders the all-databases title for the "all" scope', () => {
    render(
      <BackupRedisDatabaseDialog connectionId="c1" scope={{ kind: 'all' }} onClose={onClose} />
    )
    expect(screen.getByText('explorer.redisBackup.dialogTitleAll')).toBeInTheDocument()
    expect(screen.getByText('explorer.redisBackup.scopeAll')).toBeInTheDocument()
  })

  it('validates that a destination file is required', async () => {
    const exec = vi.spyOn(window.api.database, 'redisExecuteBackup')
    const user = userEvent.setup()
    render(
      <BackupRedisDatabaseDialog
        connectionId="c1"
        scope={{ kind: 'database', databaseIndex: 0 }}
        onClose={onClose}
      />
    )
    await user.click(screen.getByText('explorer.redisBackup.backUp'))
    expect(
      await screen.findByText('explorer.redisBackup.validation.fileRequired')
    ).toBeInTheDocument()
    expect(exec).not.toHaveBeenCalled()
  })

  it('chooses a file and runs the backup', async () => {
    vi.spyOn(window.api.database, 'redisPickBackupPath').mockResolvedValue({
      status: 'ok',
      filePath: '/tmp/redis-db0.json'
    })
    const exec = vi.spyOn(window.api.database, 'redisExecuteBackup').mockResolvedValue({
      status: 'ok',
      filePath: '/tmp/redis-db0.json',
      durationMs: 500,
      bytes: 4096,
      keyCount: 10,
      databaseCount: 1
    })
    const user = userEvent.setup()
    render(
      <BackupRedisDatabaseDialog
        connectionId="c1"
        scope={{ kind: 'database', databaseIndex: 0 }}
        onClose={onClose}
      />
    )

    await user.click(screen.getByText('explorer.redisBackup.chooseFile'))
    expect(await screen.findByText('/tmp/redis-db0.json')).toBeInTheDocument()

    await user.click(screen.getByText('explorer.redisBackup.backUp'))
    await waitFor(() => expect(exec).toHaveBeenCalled())
    expect(await screen.findByText('explorer.redisBackup.success')).toBeInTheDocument()
  })

  it('surfaces a backup error from the backend', async () => {
    vi.spyOn(window.api.database, 'redisPickBackupPath').mockResolvedValue({
      status: 'ok',
      filePath: '/tmp/redis.json'
    })
    vi.spyOn(window.api.database, 'redisExecuteBackup').mockResolvedValue({
      status: 'error',
      message: 'disk full'
    })
    const user = userEvent.setup()
    render(
      <BackupRedisDatabaseDialog connectionId="c1" scope={{ kind: 'all' }} onClose={onClose} />
    )
    await user.click(screen.getByText('explorer.redisBackup.chooseFile'))
    await user.click(screen.getByText('explorer.redisBackup.backUp'))
    expect(await screen.findByText('disk full')).toBeInTheDocument()
  })
})

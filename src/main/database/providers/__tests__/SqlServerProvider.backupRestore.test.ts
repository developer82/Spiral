// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SqlServerProvider } from '../SqlServerProvider'
import type { BackupOptions, RestoreOptions } from '../../types'

// ── mssql mock ────────────────────────────────────────────────────────────────

const { mockPool, mockRequestChain, mockConnectionPool, mockQuery } = vi.hoisted(() => {
  const mockQuery = vi.fn()

  const mockRequestChain = {
    input: vi.fn().mockReturnThis() as (..._args: unknown[]) => typeof mockRequestChain,
    on: vi.fn(),
    query: mockQuery
  }

  const mockPool = {
    request: vi.fn(() => mockRequestChain as typeof mockRequestChain),
    close: vi.fn()
  }

  const mockConnectionPool = vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(mockPool)
  }))

  return { mockPool, mockRequestChain, mockConnectionPool, mockQuery }
})

vi.mock('mssql', () => ({
  ConnectionPool: mockConnectionPool
}))

function resetRequestChain(): void {
  mockRequestChain.input = vi.fn().mockReturnThis() as typeof mockRequestChain.input
  mockRequestChain.on = vi.fn()
  mockQuery.mockReset()
  mockRequestChain.query = mockQuery
  mockPool.request.mockReturnValue(mockRequestChain)
}

async function buildConnectedProvider(): Promise<SqlServerProvider> {
  const provider = new SqlServerProvider()
  await provider.connect({
    id: 'test-id',
    name: 'Test',
    provider: 'sqlserver',
    host: 'localhost',
    port: 1433,
    username: 'sa',
    password: 'pw',
    rememberPassword: false,
    defaultDatabase: 'master'
  })
  return provider
}

function baseBackupOptions(overrides: Partial<BackupOptions> = {}): BackupOptions {
  return {
    databaseName: 'MyDB',
    backupType: 'full',
    destinations: ['C:\\Backups\\MyDB.bak'],
    overwrite: 'append',
    verify: false,
    checksum: false,
    continueOnError: false,
    expiration: { mode: 'none' },
    compression: 'default',
    ...overrides
  }
}

function baseRestoreOptions(overrides: Partial<RestoreOptions> = {}): RestoreOptions {
  return {
    targetDatabaseName: 'MyDB',
    source: [{ path: 'C:\\Backups\\MyDB.bak', position: 1, backupType: 'full' }],
    replace: false,
    takeTailLogBackup: false,
    restrictedUser: false,
    recoveryState: 'recovery',
    move: [],
    ...overrides
  }
}

describe('SqlServerProvider.buildBackupSql', () => {
  beforeEach(() => resetRequestChain())

  it('builds a full backup with append (NOINIT) and a disk destination', async () => {
    const provider = await buildConnectedProvider()
    const result = provider.buildBackupSql(baseBackupOptions())
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.sql).toContain('BACKUP DATABASE [MyDB]')
    expect(result.sql).toContain("DISK = N'C:\\Backups\\MyDB.bak'")
    expect(result.sql).toContain('NOINIT')
    expect(result.sql).not.toContain('DIFFERENTIAL')
  })

  it('adds DIFFERENTIAL for a differential backup', async () => {
    const provider = await buildConnectedProvider()
    const result = provider.buildBackupSql(baseBackupOptions({ backupType: 'differential' }))
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.sql).toContain('DIFFERENTIAL')
  })

  it('uses BACKUP LOG and NORECOVERY for a tail-log backup', async () => {
    const provider = await buildConnectedProvider()
    const result = provider.buildBackupSql(
      baseBackupOptions({ backupType: 'log', logTail: 'tail-norecovery' })
    )
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.sql).toContain('BACKUP LOG [MyDB]')
    expect(result.sql).toContain('NORECOVERY')
  })

  it('emits INIT, COMPRESSION, CHECKSUM and a VERIFYONLY pass when requested', async () => {
    const provider = await buildConnectedProvider()
    const result = provider.buildBackupSql(
      baseBackupOptions({
        overwrite: 'overwrite',
        compression: 'compress',
        checksum: true,
        verify: true
      })
    )
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.sql).toContain('INIT')
    expect(result.sql).toContain('COMPRESSION')
    expect(result.sql).toContain('CHECKSUM')
    expect(result.sql).toContain('RESTORE VERIFYONLY FROM')
  })

  it('escapes single quotes in destination paths', async () => {
    const provider = await buildConnectedProvider()
    const result = provider.buildBackupSql(
      baseBackupOptions({ destinations: ["C:\\O'Brien\\db.bak"] })
    )
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.sql).toContain("N'C:\\O''Brien\\db.bak'")
  })

  it('returns an error when no destination is provided', async () => {
    const provider = await buildConnectedProvider()
    const result = provider.buildBackupSql(baseBackupOptions({ destinations: [] }))
    expect(result.status).toBe('error')
  })
})

describe('SqlServerProvider.buildRestoreSql', () => {
  beforeEach(() => resetRequestChain())

  it('builds a single full restore WITH RECOVERY and REPLACE', async () => {
    const provider = await buildConnectedProvider()
    const result = provider.buildRestoreSql(baseRestoreOptions({ replace: true }))
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.sql).toContain('RESTORE DATABASE [MyDB] FROM')
    expect(result.sql).toContain('REPLACE')
    expect(result.sql).toContain('RECOVERY')
    expect(result.sql).not.toContain('NORECOVERY')
  })

  it('chains a full + log restore: full WITH NORECOVERY, last WITH RECOVERY', async () => {
    const provider = await buildConnectedProvider()
    const result = provider.buildRestoreSql(
      baseRestoreOptions({
        source: [
          { path: 'C:\\b\\full.bak', position: 1, backupType: 'full' },
          { path: 'C:\\b\\log.trn', position: 1, backupType: 'log' }
        ]
      })
    )
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    const lines = result.sql.split('\n')
    expect(lines[0]).toContain('RESTORE DATABASE [MyDB]')
    expect(lines[0]).toContain('NORECOVERY')
    expect(lines[1]).toContain('RESTORE LOG [MyDB]')
    expect(lines[1]).toContain('RECOVERY')
  })

  it('emits MOVE clauses for file relocation on the first statement', async () => {
    const provider = await buildConnectedProvider()
    const result = provider.buildRestoreSql(
      baseRestoreOptions({
        move: [{ logicalName: 'MyDB_Data', targetPath: 'D:\\Data\\MyDB.mdf' }]
      })
    )
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.sql).toContain("MOVE N'MyDB_Data' TO N'D:\\Data\\MyDB.mdf'")
  })

  it('prepends a tail-log backup when requested', async () => {
    const provider = await buildConnectedProvider()
    const result = provider.buildRestoreSql(
      baseRestoreOptions({ takeTailLogBackup: true, tailLogPath: 'C:\\b\\tail.trn' })
    )
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.sql.split('\n')[0]).toContain(
      "BACKUP LOG [MyDB] TO DISK = N'C:\\b\\tail.trn' WITH NORECOVERY"
    )
  })

  it('uses STANDBY when recovery state is standby', async () => {
    const provider = await buildConnectedProvider()
    const result = provider.buildRestoreSql(
      baseRestoreOptions({ recoveryState: 'standby', standbyFile: 'C:\\b\\undo.bak' })
    )
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.sql).toContain("STANDBY = N'C:\\b\\undo.bak'")
  })

  it('returns an error when no source is provided', async () => {
    const provider = await buildConnectedProvider()
    const result = provider.buildRestoreSql(baseRestoreOptions({ source: [] }))
    expect(result.status).toBe('error')
  })
})

describe('SqlServerProvider server filesystem + header reads', () => {
  beforeEach(() => resetRequestChain())

  it('lists fixed drives via xp_fixeddrives', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ drive: 'C' }, { drive: 'D' }] })
    const provider = await buildConnectedProvider()
    const result = await provider.listServerDrives()
    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('xp_fixeddrives'))
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.drives).toEqual(['C:\\', 'D:\\'])
    expect(result.platform).toBe('windows')
  })

  it('returns a single "/" root and skips xp_fixeddrives when the host is Linux', async () => {
    mockQuery.mockResolvedValueOnce({ recordset: [{ host_platform: 'Linux' }] })
    const provider = await buildConnectedProvider()
    const result = await provider.listServerDrives()
    expect(mockQuery).toHaveBeenCalledTimes(1)
    expect(mockQuery).not.toHaveBeenCalledWith(expect.stringContaining('xp_fixeddrives'))
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.drives).toEqual(['/'])
    expect(result.platform).toBe('linux')
  })

  it('browses a Linux directory with forward slashes via xp_dirtree', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ host_platform: 'Linux' }] })
      .mockResolvedValueOnce({
        recordset: [{ subdirectory: 'var', depth: 1, file: 0 }]
      })
    const provider = await buildConnectedProvider()
    const result = await provider.listServerDir('/')
    expect(mockQuery).toHaveBeenCalledWith("EXEC master.dbo.xp_dirtree N'/', 1, 1")
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.entries).toEqual([{ name: 'var', isDirectory: true }])
  })

  it('strips the trailing slash for a Linux sub-folder so xp_dirtree returns rows', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ host_platform: 'Linux' }] })
      .mockResolvedValueOnce({ recordset: [] })
    const provider = await buildConnectedProvider()
    await provider.listServerDir('/var/opt/mssql/')
    expect(mockQuery).toHaveBeenCalledWith("EXEC master.dbo.xp_dirtree N'/var/opt/mssql', 1, 1")
  })

  it('reads the drive letter defensively when the column key differs', async () => {
    // Some drivers surface xp_fixeddrives output under an unexpected/empty column key.
    mockQuery.mockResolvedValue({ recordset: [{ '': 'C' }, { '': 'E' }] })
    const provider = await buildConnectedProvider()
    const result = await provider.listServerDrives()
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.drives).toEqual(['C:\\', 'E:\\'])
  })

  it('returns an empty drive list (not an error) when xp_fixeddrives yields nothing', async () => {
    mockQuery.mockResolvedValue({ recordset: [] })
    const provider = await buildConnectedProvider()
    const result = await provider.listServerDrives()
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.drives).toEqual([])
  })

  it('lists a directory via xp_dirtree and flags files vs folders', async () => {
    mockQuery.mockResolvedValue({
      recordset: [
        { subdirectory: 'Backups', depth: 1, file: 0 },
        { subdirectory: 'db.bak', depth: 1, file: 1 }
      ]
    })
    const provider = await buildConnectedProvider()
    const result = await provider.listServerDir('C:\\')
    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('xp_dirtree'))
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.entries).toEqual([
      { name: 'Backups', isDirectory: true },
      { name: 'db.bak', isDirectory: false }
    ])
  })

  it('keeps the trailing slash for a bare drive root', async () => {
    mockQuery.mockResolvedValue({ recordset: [] })
    const provider = await buildConnectedProvider()
    await provider.listServerDir('C:\\')
    expect(mockQuery).toHaveBeenCalledWith("EXEC master.dbo.xp_dirtree N'C:\\', 1, 1")
  })

  it('strips the trailing slash for a sub-folder so xp_dirtree returns rows', async () => {
    mockQuery.mockResolvedValue({ recordset: [] })
    const provider = await buildConnectedProvider()
    await provider.listServerDir('C:\\Backups\\')
    expect(mockQuery).toHaveBeenCalledWith("EXEC master.dbo.xp_dirtree N'C:\\Backups', 1, 1")
  })

  it('reads backup header sets via RESTORE HEADERONLY', async () => {
    mockQuery.mockResolvedValue({
      recordset: [
        {
          Position: 1,
          BackupName: 'MyDB-Full',
          BackupType: 1,
          ServerName: 'SRV',
          DatabaseName: 'MyDB',
          BackupStartDate: '2026-01-01T00:00:00Z',
          BackupFinishDate: '2026-01-01T00:05:00Z'
        }
      ]
    })
    const provider = await buildConnectedProvider()
    const result = await provider.readBackupHeader('C:\\Backups\\MyDB.bak')
    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('RESTORE HEADERONLY'))
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.backupSets[0].backupType).toBe('full')
    expect(result.backupSets[0].position).toBe(1)
  })

  it('reads the backup file list via RESTORE FILELISTONLY', async () => {
    mockQuery.mockResolvedValue({
      recordset: [
        { LogicalName: 'MyDB', PhysicalName: 'C:\\Data\\MyDB.mdf', Type: 'D' },
        { LogicalName: 'MyDB_log', PhysicalName: 'C:\\Data\\MyDB.ldf', Type: 'L' }
      ]
    })
    const provider = await buildConnectedProvider()
    const result = await provider.readBackupFileList('C:\\Backups\\MyDB.bak', 1)
    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('RESTORE FILELISTONLY'))
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.files).toEqual([
      { logicalName: 'MyDB', physicalName: 'C:\\Data\\MyDB.mdf', type: 'data' },
      { logicalName: 'MyDB_log', physicalName: 'C:\\Data\\MyDB.ldf', type: 'log' }
    ])
  })

  it('surfaces an error (permission denied) from xp_dirtree', async () => {
    mockQuery.mockRejectedValue(new Error('EXECUTE permission denied'))
    const provider = await buildConnectedProvider()
    const result = await provider.listServerDir('C:\\')
    expect(result.status).toBe('error')
    if (result.status !== 'error') return
    expect(result.message).toContain('permission')
  })
})

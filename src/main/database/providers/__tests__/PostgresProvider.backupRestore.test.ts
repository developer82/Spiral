// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'node:events'
import { PostgresProvider } from '../PostgresProvider'
import type { PostgresBackupOptions, PostgresRestoreOptions } from '../../types'

/** Shape of the execFile callback used by the child_process mock. */
type ExecFileCb = (err: Error | null, stdout: string, stderr: string) => void

// ── pg mock ──────────────────────────────────────────────────────────────────

vi.mock('pg', () => ({
  Pool: vi.fn(() => ({
    connect: vi.fn().mockResolvedValue({ release: vi.fn() }),
    query: vi.fn(),
    end: vi.fn()
  }))
}))

// ── child_process / fs mocks ─────────────────────────────────────────────────

const { execFileMock, spawnMock } = vi.hoisted(() => ({
  execFileMock: vi.fn(),
  spawnMock: vi.fn()
}))

vi.mock('node:child_process', () => ({
  execFile: execFileMock,
  spawn: spawnMock
}))

vi.mock('node:fs', () => ({
  createReadStream: vi.fn(() => ({ on: vi.fn(), pipe: vi.fn() })),
  createWriteStream: vi.fn(() => ({ on: vi.fn() })),
  statSync: vi.fn(() => ({ size: 2048 }))
}))

/** Builds a fake child process that reports success on the next tick. */
function makeChild(exitCode = 0): EventEmitter & Record<string, unknown> {
  const child = new EventEmitter() as EventEmitter & Record<string, unknown>
  child.stdout = { pipe: vi.fn(() => child.stdout), on: vi.fn() }
  child.stderr = { on: vi.fn() }
  child.stdin = {}
  process.nextTick(() => child.emit('close', exitCode))
  return child
}

async function connectedProvider(): Promise<PostgresProvider> {
  const provider = new PostgresProvider()
  await provider.connect({
    id: 'c1',
    name: 'Test',
    provider: 'postgres',
    host: 'db.example.com',
    port: 5433,
    username: 'admin',
    password: 's3cret',
    rememberPassword: false,
    defaultDatabase: 'shop'
  })
  return provider
}

function backupOptions(overrides: Partial<PostgresBackupOptions> = {}): PostgresBackupOptions {
  return {
    databaseName: 'shop',
    filePath: '/tmp/shop.dump',
    format: 'custom',
    content: 'schema-and-data',
    noOwner: false,
    noPrivileges: false,
    clean: false,
    createDatabase: false,
    compress: false,
    ...overrides
  }
}

function restoreOptions(overrides: Partial<PostgresRestoreOptions> = {}): PostgresRestoreOptions {
  return {
    filePath: '/tmp/shop.dump',
    format: 'custom',
    targetDatabaseName: 'shop',
    createDatabase: false,
    clean: false,
    noOwner: false,
    singleTransaction: false,
    ...overrides
  }
}

beforeEach(() => {
  execFileMock.mockReset()
  spawnMock.mockReset()
})

describe('buildBackupCommandPreview', () => {
  it('masks the password and includes connection + format flags', async () => {
    const provider = await connectedProvider()
    const result = provider.buildBackupCommandPreview(backupOptions())
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.command).toContain('PGPASSWORD=******')
    expect(result.command).not.toContain('s3cret')
    expect(result.command).toContain('--host=db.example.com')
    expect(result.command).toContain('--port=5433')
    expect(result.command).toContain('--username=admin')
    expect(result.command).toContain('--format=c')
    expect(result.command).toContain('--dbname=shop')
  })

  it('emits --schema-only for schema-only content', async () => {
    const provider = await connectedProvider()
    const result = provider.buildBackupCommandPreview(backupOptions({ content: 'schema-only' }))
    if (result.status !== 'ok') throw new Error('expected ok')
    expect(result.command).toContain('--schema-only')
    expect(result.command).not.toContain('--data-only')
  })

  it('emits --data-only for data-only content', async () => {
    const provider = await connectedProvider()
    const result = provider.buildBackupCommandPreview(backupOptions({ content: 'data-only' }))
    if (result.status !== 'ok') throw new Error('expected ok')
    expect(result.command).toContain('--data-only')
  })

  it('includes --no-owner, --no-acl, --clean and --create when enabled', async () => {
    const provider = await connectedProvider()
    const result = provider.buildBackupCommandPreview(
      backupOptions({ noOwner: true, noPrivileges: true, clean: true, createDatabase: true })
    )
    if (result.status !== 'ok') throw new Error('expected ok')
    expect(result.command).toContain('--no-owner')
    expect(result.command).toContain('--no-acl')
    expect(result.command).toContain('--clean')
    expect(result.command).toContain('--if-exists')
    expect(result.command).toContain('--create')
  })

  it('writes archive formats via --file with no stdout redirect', async () => {
    const provider = await connectedProvider()
    const result = provider.buildBackupCommandPreview(backupOptions({ format: 'custom' }))
    if (result.status !== 'ok') throw new Error('expected ok')
    expect(result.command).toContain('--file=/tmp/shop.dump')
    expect(result.command).not.toContain('> "')
  })

  it('redirects plain format to the file, piping through gzip when compressed', async () => {
    const provider = await connectedProvider()
    const plain = provider.buildBackupCommandPreview(
      backupOptions({ format: 'plain', filePath: '/tmp/shop.sql' })
    )
    if (plain.status !== 'ok') throw new Error('expected ok')
    expect(plain.command).toContain('> "/tmp/shop.sql"')
    expect(plain.command).not.toContain('--file=')

    const gz = provider.buildBackupCommandPreview(
      backupOptions({ format: 'plain', compress: true, filePath: '/tmp/shop.sql.gz' })
    )
    if (gz.status !== 'ok') throw new Error('expected ok')
    expect(gz.command).toContain('| gzip > "/tmp/shop.sql.gz"')
  })

  it('adds --compress for custom/directory formats only', async () => {
    const provider = await connectedProvider()
    const custom = provider.buildBackupCommandPreview(
      backupOptions({ format: 'custom', compressionLevel: 9 })
    )
    if (custom.status !== 'ok') throw new Error('expected ok')
    expect(custom.command).toContain('--compress=9')

    const plain = provider.buildBackupCommandPreview(
      backupOptions({ format: 'plain', compressionLevel: 9 })
    )
    if (plain.status !== 'ok') throw new Error('expected ok')
    expect(plain.command).not.toContain('--compress=')
  })
})

describe('getBackupToolStatus', () => {
  it('reports tools as found when --version succeeds', async () => {
    execFileMock.mockImplementation(
      (bin: string, _args: string[], _opts: unknown, cb: ExecFileCb) => {
        cb(null, `${bin} (PostgreSQL) 16.2`, '')
      }
    )
    const provider = await connectedProvider()
    const result = await provider.getBackupToolStatus()
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.tools.pgDump.found).toBe(true)
    expect(result.tools.pgDump.version).toContain('16.2')
    expect(result.tools.pgRestore.found).toBe(true)
    expect(result.tools.psql.found).toBe(true)
  })

  it('reports tools as not found when --version errors', async () => {
    execFileMock.mockImplementation(
      (_bin: string, _args: string[], _opts: unknown, cb: ExecFileCb) => {
        cb(new Error('ENOENT'), '', '')
      }
    )
    const provider = await connectedProvider()
    const result = await provider.getBackupToolStatus()
    if (result.status !== 'ok') throw new Error('expected ok')
    expect(result.tools.pgDump.found).toBe(false)
    expect(result.tools.psql.found).toBe(false)
  })

  it('honors a custom pg_dump path', async () => {
    const seen: string[] = []
    execFileMock.mockImplementation(
      (bin: string, _args: string[], _opts: unknown, cb: ExecFileCb) => {
        seen.push(bin)
        cb(null, 'ok', '')
      }
    )
    const provider = await connectedProvider()
    await provider.getBackupToolStatus({ pgDumpPath: '/opt/pg/bin/pg_dump' })
    expect(seen).toContain('/opt/pg/bin/pg_dump')
  })
})

describe('executeBackup', () => {
  it('returns an error when pg_dump is missing (no JS fallback)', async () => {
    execFileMock.mockImplementation(
      (_bin: string, _args: string[], _opts: unknown, cb: ExecFileCb) => {
        cb(new Error('ENOENT'), '', '')
      }
    )
    const provider = await connectedProvider()
    const result = await provider.executeBackup(backupOptions())
    expect(result.status).toBe('error')
    if (result.status !== 'error') return
    expect(result.message).toContain('pg_dump not found')
    expect(spawnMock).not.toHaveBeenCalled()
  })

  it('runs pg_dump and reports bytes when the tool is available', async () => {
    execFileMock.mockImplementation((_bin: string, _a: string[], _o: unknown, cb: ExecFileCb) => {
      cb(null, 'pg_dump (PostgreSQL) 16.2', '')
    })
    spawnMock.mockImplementation(() => makeChild(0))
    const provider = await connectedProvider()
    const result = await provider.executeBackup(backupOptions())
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.bytes).toBe(2048)
    expect(spawnMock.mock.calls[0][0]).toBe('pg_dump')
  })
})

describe('executeRestore', () => {
  it('uses psql for plain-format dumps', async () => {
    spawnMock.mockImplementation(() => makeChild(0))
    const provider = await connectedProvider()
    const result = await provider.executeRestore(restoreOptions({ format: 'plain' }))
    expect(result.status).toBe('ok')
    expect(spawnMock.mock.calls[0][0]).toBe('psql')
  })

  it('uses pg_restore for custom-format archives', async () => {
    spawnMock.mockImplementation(() => makeChild(0))
    const provider = await connectedProvider()
    const result = await provider.executeRestore(restoreOptions({ format: 'custom' }))
    expect(result.status).toBe('ok')
    expect(spawnMock.mock.calls[0][0]).toBe('pg_restore')
  })

  it('passes --clean/--no-owner and parallel jobs to pg_restore', async () => {
    spawnMock.mockImplementation(() => makeChild(0))
    const provider = await connectedProvider()
    await provider.executeRestore(
      restoreOptions({ format: 'custom', clean: true, noOwner: true, jobs: 4 })
    )
    const args = spawnMock.mock.calls[0][1] as string[]
    expect(args).toContain('--clean')
    expect(args).toContain('--if-exists')
    expect(args).toContain('--no-owner')
    expect(args).toContain('--jobs=4')
  })

  it('surfaces a non-zero exit code as an error', async () => {
    spawnMock.mockImplementation(() => makeChild(1))
    const provider = await connectedProvider()
    const result = await provider.executeRestore(restoreOptions({ format: 'custom' }))
    expect(result.status).toBe('error')
  })
})

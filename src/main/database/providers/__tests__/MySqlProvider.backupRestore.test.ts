// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MySqlProvider } from '../MySqlProvider'
import type { MySqlBackupOptions } from '../../types'

// ── mysql2 mock ────────────────────────────────────────────────────────────────

vi.mock('mysql2/promise', () => ({
  createPool: vi.fn(() => ({
    getConnection: vi.fn().mockResolvedValue({ release: vi.fn(), query: vi.fn() }),
    end: vi.fn()
  }))
}))

// ── child_process mock ──────────────────────────────────────────────────────────

const { execFileMock } = vi.hoisted(() => ({ execFileMock: vi.fn() }))

vi.mock('node:child_process', () => ({
  execFile: execFileMock,
  spawn: vi.fn()
}))

async function connectedProvider(): Promise<MySqlProvider> {
  const provider = new MySqlProvider()
  await provider.connect({
    id: 'c1',
    name: 'Test',
    provider: 'mysql',
    host: 'db.example.com',
    port: 3307,
    username: 'root',
    password: 's3cret',
    rememberPassword: false,
    defaultDatabase: 'shop'
  })
  return provider
}

function backupOptions(overrides: Partial<MySqlBackupOptions> = {}): MySqlBackupOptions {
  return {
    databaseName: 'shop',
    filePath: '/tmp/shop.sql',
    content: 'schema-and-data',
    addDropTable: true,
    singleTransaction: true,
    includeRoutines: true,
    includeTriggers: true,
    includeEvents: false,
    extendedInsert: true,
    addCreateDatabase: false,
    charset: 'utf8mb4',
    compress: false,
    ...overrides
  }
}

describe('buildBackupCommandPreview', () => {
  it('masks the password and includes connection flags', async () => {
    const provider = await connectedProvider()
    const result = provider.buildBackupCommandPreview(backupOptions())
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.command).toContain('--password=******')
    expect(result.command).not.toContain('s3cret')
    expect(result.command).toContain('--host=db.example.com')
    expect(result.command).toContain('--port=3307')
    expect(result.command).toContain('--user=root')
    expect(result.command).toContain('--single-transaction')
    expect(result.command).toContain('--routines')
    expect(result.command).toContain('--triggers')
    expect(result.command).toContain('> "/tmp/shop.sql"')
  })

  it('emits --skip-triggers when triggers are excluded', async () => {
    const provider = await connectedProvider()
    const result = provider.buildBackupCommandPreview(backupOptions({ includeTriggers: false }))
    if (result.status !== 'ok') throw new Error('expected ok')
    expect(result.command).toContain('--skip-triggers')
  })

  it('adds --no-create-info for data-only', async () => {
    const provider = await connectedProvider()
    const result = provider.buildBackupCommandPreview(backupOptions({ content: 'data-only' }))
    if (result.status !== 'ok') throw new Error('expected ok')
    expect(result.command).toContain('--no-create-info')
    expect(result.command).not.toContain('--no-data')
  })

  it('adds --no-data for schema-only', async () => {
    const provider = await connectedProvider()
    const result = provider.buildBackupCommandPreview(backupOptions({ content: 'schema-only' }))
    if (result.status !== 'ok') throw new Error('expected ok')
    expect(result.command).toContain('--no-data')
  })

  it('pipes through gzip when compress is set', async () => {
    const provider = await connectedProvider()
    const result = provider.buildBackupCommandPreview(
      backupOptions({ compress: true, filePath: '/tmp/shop.sql.gz' })
    )
    if (result.status !== 'ok') throw new Error('expected ok')
    expect(result.command).toContain('| gzip > "/tmp/shop.sql.gz"')
  })

  it('uses --databases when adding CREATE DATABASE and no table list', async () => {
    const provider = await connectedProvider()
    const result = provider.buildBackupCommandPreview(backupOptions({ addCreateDatabase: true }))
    if (result.status !== 'ok') throw new Error('expected ok')
    expect(result.command).toContain('--databases shop')
  })

  it('lists explicit tables instead of --databases', async () => {
    const provider = await connectedProvider()
    const result = provider.buildBackupCommandPreview(
      backupOptions({ tables: ['users', 'orders'], addCreateDatabase: true })
    )
    if (result.status !== 'ok') throw new Error('expected ok')
    expect(result.command).not.toContain('--databases')
    expect(result.command).toContain('shop users orders')
  })
})

describe('getBackupToolStatus', () => {
  beforeEach(() => {
    execFileMock.mockReset()
  })

  it('reports tools as found when --version succeeds', async () => {
    execFileMock.mockImplementation((bin: string, _args: string[], _opts: unknown, cb: Function) => {
      cb(null, `${bin}  Ver 8.0.36`, '')
    })
    const provider = await connectedProvider()
    const result = await provider.getBackupToolStatus()
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.tools.mysqldump.found).toBe(true)
    expect(result.tools.mysqldump.version).toContain('Ver 8.0.36')
    expect(result.tools.mysql.found).toBe(true)
  })

  it('reports tools as not found when --version errors', async () => {
    execFileMock.mockImplementation((_bin: string, _args: string[], _opts: unknown, cb: Function) => {
      cb(new Error('ENOENT'), '', '')
    })
    const provider = await connectedProvider()
    const result = await provider.getBackupToolStatus()
    if (result.status !== 'ok') throw new Error('expected ok')
    expect(result.tools.mysqldump.found).toBe(false)
    expect(result.tools.mysql.found).toBe(false)
  })

  it('honors a custom mysqldump path', async () => {
    const seen: string[] = []
    execFileMock.mockImplementation((bin: string, _args: string[], _opts: unknown, cb: Function) => {
      seen.push(bin)
      cb(null, 'Ver 8.0', '')
    })
    const provider = await connectedProvider()
    await provider.getBackupToolStatus({ mysqlDumpPath: '/opt/mysql/bin/mysqldump' })
    expect(seen).toContain('/opt/mysql/bin/mysqldump')
  })
})

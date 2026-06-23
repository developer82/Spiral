// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { tmpdir } from 'os'
import { join } from 'path'
import { existsSync, rmSync, mkdtempSync } from 'fs'
import { ObjectId } from 'bson'
import type { ConnectionRecord } from '../../../store'
import type { MongoBackupOptions, MongoRestoreOptions } from '../../types'

// ── mongodb mock ────────────────────────────────────────────────────────────────
// Captures what JS backup reads and what JS restore writes so round-trips can be
// asserted. bson is intentionally NOT mocked so EJSON serialization is real.

const { mockState } = vi.hoisted(() => {
  const mockState = {
    // collectionName -> docs returned by find().toArray() during backup
    sourceDocs: new Map<string, unknown[]>(),
    // collectionName -> docs received by insertMany() during restore
    restored: new Map<string, unknown[]>(),
    dropped: [] as string[]
  }
  return { mockState }
})

vi.mock('mongodb', () => {
  const makeCollectionHandle = (name: string): unknown => ({
    collectionName: name,
    find: vi.fn(() => ({
      toArray: vi.fn().mockResolvedValue(mockState.sourceDocs.get(name) ?? [])
    })),
    insertMany: vi.fn(async (docs: unknown[]) => {
      mockState.restored.set(name, docs)
      return { insertedCount: docs.length }
    }),
    drop: vi.fn(async () => {
      mockState.dropped.push(name)
      return true
    })
  })

  const mockDb = {
    collections: vi.fn(async () =>
      [...mockState.sourceDocs.keys()].map((name) => makeCollectionHandle(name))
    ),
    collection: vi.fn((name: string) => makeCollectionHandle(name)),
    admin: vi.fn(() => ({ command: vi.fn().mockResolvedValue({ ok: 1 }) }))
  }

  const mockClientInstance = {
    connect: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    db: vi.fn(() => mockDb)
  }

  return { MongoClient: vi.fn(() => mockClientInstance) }
})

// ── child_process mock ────────────────────────────────────────────────────────

const { execFileMock, spawnMock } = vi.hoisted(() => ({
  execFileMock: vi.fn(),
  spawnMock: vi.fn()
}))

vi.mock('child_process', () => ({
  execFile: execFileMock,
  spawn: spawnMock
}))

vi.mock('../sshTunnel', () => ({
  createSshTunnel: vi.fn().mockResolvedValue({
    host: '127.0.0.1',
    port: 54321,
    server: { close: vi.fn() },
    sshClient: { end: vi.fn() }
  })
}))

import { MongoDbProvider } from '../MongoDbProvider'

// ── Helpers ────────────────────────────────────────────────────────────────────

let tmp: string

function makeRecord(overrides: Partial<ConnectionRecord> = {}): ConnectionRecord {
  return {
    id: 'c1',
    name: 'Test Mongo',
    provider: 'mongodb',
    host: 'db.example.com',
    port: 27017,
    username: 'admin',
    password: 's3cret',
    rememberPassword: false,
    defaultDatabase: 'shop',
    mongodbAuthSource: 'admin',
    ...overrides
  }
}

async function connectedProvider(
  recordOverrides: Partial<ConnectionRecord> = {}
): Promise<MongoDbProvider> {
  const provider = new MongoDbProvider()
  await provider.connect(makeRecord(recordOverrides))
  return provider
}

function backupOptions(overrides: Partial<MongoBackupOptions> = {}): MongoBackupOptions {
  return {
    databaseName: 'shop',
    filePath: join(tmp, 'shop.json'),
    gzip: false,
    ...overrides
  }
}

function restoreOptions(overrides: Partial<MongoRestoreOptions> = {}): MongoRestoreOptions {
  return {
    filePath: join(tmp, 'shop.json'),
    sourceDatabaseName: 'shop',
    targetDatabaseName: 'shop',
    drop: false,
    stopOnError: true,
    ...overrides
  }
}

/** Fake child process whose `close` resolves with the given exit code. */
function fakeChild(exitCode: number, stderr = ''): unknown {
  const handlers: Record<string, (arg: unknown) => void> = {}
  setTimeout(() => {
    if (stderr) handlers['__stderr__']?.(Buffer.from(stderr))
    handlers['close']?.(exitCode)
  }, 0)
  return {
    stderr: { on: (_e: string, cb: (d: unknown) => void) => (handlers['__stderr__'] = cb) },
    on: (event: string, cb: (a: unknown) => void) => {
      handlers[event] = cb
    }
  }
}

beforeEach(() => {
  execFileMock.mockReset()
  spawnMock.mockReset()
  mockState.sourceDocs.clear()
  mockState.restored.clear()
  mockState.dropped = []
  tmp = mkdtempSync(join(tmpdir(), 'mongo-bk-'))
})

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true })
})

// ── buildBackupCommandPreview ───────────────────────────────────────────────────

describe('buildBackupCommandPreview', () => {
  it('masks the password and includes db/archive/uri flags', async () => {
    const provider = await connectedProvider()
    const result = provider.buildBackupCommandPreview(backupOptions())
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.command).toContain('admin:******@db.example.com:27017')
    expect(result.command).not.toContain('s3cret')
    expect(result.command).toContain('--db=shop')
    expect(result.command).toContain('authSource=admin')
    expect(result.command).toContain('--archive=')
  })

  it('adds --gzip when compression is enabled', async () => {
    const provider = await connectedProvider()
    const result = provider.buildBackupCommandPreview(backupOptions({ gzip: true }))
    if (result.status !== 'ok') throw new Error('expected ok')
    expect(result.command).toContain('--gzip')
  })

  it('returns an error for SSH-tunnelled connections', async () => {
    const provider = await connectedProvider({ sshEnabled: true })
    const result = provider.buildBackupCommandPreview(backupOptions())
    expect(result.status).toBe('error')
  })
})

// ── getBackupToolStatus ─────────────────────────────────────────────────────────

describe('getBackupToolStatus', () => {
  it('reports tools as found when --version succeeds', async () => {
    execFileMock.mockImplementation(
      (bin: string, _args: string[], _opts: unknown, cb: Function) => {
        cb(null, `${bin} version 100.9.4`, '')
      }
    )
    const provider = await connectedProvider()
    const result = await provider.getBackupToolStatus()
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.tools.mongodump.found).toBe(true)
    expect(result.tools.mongodump.version).toContain('version 100.9.4')
    expect(result.tools.mongorestore.found).toBe(true)
  })

  it('reports tools as not found when --version errors', async () => {
    execFileMock.mockImplementation(
      (_bin: string, _args: string[], _opts: unknown, cb: Function) => cb(new Error('ENOENT'), '', '')
    )
    const provider = await connectedProvider()
    const result = await provider.getBackupToolStatus()
    if (result.status !== 'ok') throw new Error('expected ok')
    expect(result.tools.mongodump.found).toBe(false)
    expect(result.tools.mongorestore.found).toBe(false)
  })

  it('honors a custom mongodump path', async () => {
    const seen: string[] = []
    execFileMock.mockImplementation(
      (bin: string, _args: string[], _opts: unknown, cb: Function) => {
        seen.push(bin)
        cb(null, 'version', '')
      }
    )
    const provider = await connectedProvider()
    await provider.getBackupToolStatus({ mongodumpPath: '/opt/mongo/bin/mongodump' })
    expect(seen).toContain('/opt/mongo/bin/mongodump')
  })
})

// ── JS engine round-trip ────────────────────────────────────────────────────────

describe('JS engine backup/restore round-trip', () => {
  beforeEach(() => {
    // mongodump absent → both backup and restore fall back to the JS engine.
    execFileMock.mockImplementation(
      (_bin: string, _args: string[], _opts: unknown, cb: Function) => cb(new Error('ENOENT'), '', '')
    )
  })

  it('backs up and restores collections, preserving BSON types', async () => {
    const oid = new ObjectId()
    const when = new Date('2024-01-02T03:04:05.000Z')
    mockState.sourceDocs.set('users', [{ _id: oid, name: 'Ada', joined: when }])
    mockState.sourceDocs.set('posts', [])

    const provider = await connectedProvider()
    const filePath = join(tmp, 'shop.json')

    const backup = await provider.executeBackup(backupOptions({ filePath }))
    expect(backup.status).toBe('ok')
    if (backup.status !== 'ok') return
    expect(backup.engine).toBe('js')
    expect(existsSync(filePath)).toBe(true)
    expect(backup.bytes).toBeGreaterThan(0)

    const restore = await provider.executeRestore(restoreOptions({ filePath }))
    expect(restore.status).toBe('ok')
    if (restore.status !== 'ok') return
    expect(restore.engine).toBe('js')
    expect(restore.collectionsRestored).toBe(2)

    const usersDocs = mockState.restored.get('users') as Array<{
      _id: unknown
      joined: unknown
    }>
    expect(usersDocs).toHaveLength(1)
    expect(usersDocs[0]._id).toBeInstanceOf(ObjectId)
    expect((usersDocs[0]._id as ObjectId).toHexString()).toBe(oid.toHexString())
    expect(usersDocs[0].joined).toBeInstanceOf(Date)
  })

  it('round-trips through a gzipped backup', async () => {
    mockState.sourceDocs.set('users', [{ _id: new ObjectId(), n: 1 }])
    const provider = await connectedProvider()
    const filePath = join(tmp, 'shop.json.gz')

    const backup = await provider.executeBackup(backupOptions({ filePath, gzip: true }))
    if (backup.status !== 'ok') throw new Error('expected ok')

    const restore = await provider.executeRestore(restoreOptions({ filePath }))
    if (restore.status !== 'ok') throw new Error('expected ok')
    expect(mockState.restored.get('users')).toHaveLength(1)
  })

  it('drops collections before restoring when drop is set', async () => {
    mockState.sourceDocs.set('users', [{ _id: new ObjectId() }])
    const provider = await connectedProvider()
    const filePath = join(tmp, 'shop.json')
    await provider.executeBackup(backupOptions({ filePath }))
    await provider.executeRestore(restoreOptions({ filePath, drop: true }))
    expect(mockState.dropped).toContain('users')
  })
})

// ── CLI archive routing ─────────────────────────────────────────────────────────

describe('archive restore routing', () => {
  it('errors when mongorestore is missing for an .archive file', async () => {
    execFileMock.mockImplementation(
      (_bin: string, _args: string[], _opts: unknown, cb: Function) => cb(new Error('ENOENT'), '', '')
    )
    const provider = await connectedProvider()
    const result = await provider.executeRestore(
      restoreOptions({ filePath: join(tmp, 'shop.archive') })
    )
    expect(result.status).toBe('error')
    if (result.status !== 'error') return
    expect(result.message).toMatch(/mongorestore/i)
  })

  it('errors for an .archive file on an SSH-tunnelled connection', async () => {
    const provider = await connectedProvider({ sshEnabled: true })
    const result = await provider.executeRestore(
      restoreOptions({ filePath: join(tmp, 'shop.archive') })
    )
    expect(result.status).toBe('error')
    if (result.status !== 'error') return
    expect(result.message).toMatch(/SSH/i)
  })

  it('spawns mongorestore with namespace remap when target differs', async () => {
    execFileMock.mockImplementation(
      (_bin: string, _args: string[], _opts: unknown, cb: Function) => cb(null, 'version', '')
    )
    let capturedArgs: string[] = []
    spawnMock.mockImplementation((_bin: string, args: string[]) => {
      capturedArgs = args
      return fakeChild(0)
    })
    const provider = await connectedProvider()
    const result = await provider.executeRestore(
      restoreOptions({
        filePath: join(tmp, 'shop.archive'),
        sourceDatabaseName: 'shop',
        targetDatabaseName: 'shop_copy',
        drop: true
      })
    )
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.engine).toBe('mongodump')
    expect(capturedArgs).toContain('--drop')
    expect(capturedArgs).toContain('--nsFrom=shop.*')
    expect(capturedArgs).toContain('--nsTo=shop_copy.*')
  })

  it('reports the mongorestore error when it exits non-zero', async () => {
    execFileMock.mockImplementation(
      (_bin: string, _args: string[], _opts: unknown, cb: Function) => cb(null, 'version', '')
    )
    spawnMock.mockImplementation(() => fakeChild(1, 'restore failed'))
    const provider = await connectedProvider()
    const result = await provider.executeRestore(
      restoreOptions({ filePath: join(tmp, 'shop.archive') })
    )
    expect(result.status).toBe('error')
    if (result.status !== 'error') return
    expect(result.message).toContain('restore failed')
  })
})

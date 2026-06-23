// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Hoisted mock objects ────────────────────────────────────────────────────

const { mockDb, mockMongoClientInstance } = vi.hoisted(() => {
  const mockDb = {
    admin: vi.fn(),
    listCollections: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) })),
    collection: vi.fn(),
    createCollection: vi.fn(),
    command: vi.fn().mockResolvedValue({ ok: 1 })
  }

  const mockMongoClientInstance = {
    connect: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    db: vi.fn(() => mockDb)
  }

  return { mockDb, mockMongoClientInstance }
})

vi.mock('mongodb', () => {
  const MongoClientMock = vi.fn(() => mockMongoClientInstance)
  return { MongoClient: MongoClientMock }
})

vi.mock('ssh2', () => ({ Client: vi.fn() }))
vi.mock('net', () => ({
  createServer: vi.fn(() => ({ listen: vi.fn(), address: vi.fn(), close: vi.fn(), on: vi.fn() }))
}))
vi.mock('fs', () => ({ readFileSync: vi.fn(() => Buffer.from('KEY')) }))
vi.mock('../sshTunnel', () => ({
  createSshTunnel: vi.fn().mockResolvedValue({ host: '127.0.0.1', port: 54321, server: { close: vi.fn() }, sshClient: { end: vi.fn() } })
}))

import type { ConnectionRecord } from '../../../store'
import { MongoDbProvider } from '../MongoDbProvider'

function makeRecord(): ConnectionRecord {
  return {
    id: 'test-id',
    name: 'Test MongoDB',
    provider: 'mongodb',
    host: 'localhost',
    port: 27017,
    username: '',
    password: '',
    rememberPassword: false,
    defaultDatabase: 'mydb'
  }
}

async function buildConnectedProvider(): Promise<MongoDbProvider> {
  const p = new MongoDbProvider()
  mockDb.command.mockResolvedValue({
    databases: [
      { name: 'admin' },
      { name: 'mydb' }
    ],
    ok: 1
  })
  await p.connect(makeRecord())
  return p
}

beforeEach(() => {
  vi.clearAllMocks()
  mockMongoClientInstance.connect.mockResolvedValue(undefined)
  mockMongoClientInstance.db.mockReturnValue(mockDb)
  mockDb.command.mockResolvedValue({ ok: 1 })
})

// ── listServerSecurityCategories ──────────────────────────────────────────────

describe('MongoDbProvider.listServerSecurityCategories', () => {
  it('returns a Users folder node', async () => {
    const provider = await buildConnectedProvider()
    const result = provider.listServerSecurityCategories()
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ id: 'security:users', kind: 'security-users-folder' })
  })
})

// ── listServerUsers ───────────────────────────────────────────────────────────

describe('MongoDbProvider.listServerUsers', () => {
  it('returns user nodes from admin db', async () => {
    const provider = await buildConnectedProvider()
    mockDb.command.mockResolvedValue({
      users: [{ user: 'alice', db: 'admin' }, { user: 'bob', db: 'admin' }]
    })
    const result = await provider.listServerUsers()
    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ id: 'security:users:alice', label: 'alice', kind: 'security-user', isLeaf: true })
    expect(result[1]).toMatchObject({ id: 'security:users:bob', label: 'bob', kind: 'security-user' })
  })

  it('returns empty array when command fails', async () => {
    const provider = await buildConnectedProvider()
    mockDb.command.mockRejectedValue(new Error('Unauthorized'))
    const result = await provider.listServerUsers()
    expect(result).toEqual([])
  })

  it('returns empty array when users list is empty', async () => {
    const provider = await buildConnectedProvider()
    mockDb.command.mockResolvedValue({ users: [] })
    const result = await provider.listServerUsers()
    expect(result).toEqual([])
  })
})

// ── getMongoUserDetails ───────────────────────────────────────────────────────

describe('MongoDbProvider.getMongoUserDetails', () => {
  it('returns user details with roles', async () => {
    const provider = await buildConnectedProvider()
    mockDb.command.mockResolvedValue({
      users: [{
        user: 'alice',
        db: 'admin',
        roles: [{ role: 'readWrite', db: 'mydb' }, { role: 'dbAdmin', db: 'admin' }]
      }]
    })
    const result = await provider.getMongoUserDetails('alice')
    expect(result).toEqual({
      username: 'alice',
      roles: [{ role: 'readWrite', db: 'mydb' }, { role: 'dbAdmin', db: 'admin' }]
    })
  })

  it('returns null when user not found', async () => {
    const provider = await buildConnectedProvider()
    mockDb.command.mockResolvedValue({ users: [] })
    const result = await provider.getMongoUserDetails('ghost')
    expect(result).toBeNull()
  })

  it('returns null on error', async () => {
    const provider = await buildConnectedProvider()
    mockDb.command.mockRejectedValue(new Error('UserNotFound'))
    const result = await provider.getMongoUserDetails('ghost')
    expect(result).toBeNull()
  })
})

// ── saveMongoUser — create ────────────────────────────────────────────────────

describe('MongoDbProvider.saveMongoUser — create', () => {
  it('creates user with password and roles', async () => {
    const provider = await buildConnectedProvider()
    mockDb.command.mockResolvedValue({ ok: 1 })
    const result = await provider.saveMongoUser({
      username: 'newuser',
      password: 'secret',
      roles: [{ role: 'readWrite', db: 'mydb' }]
    })
    expect(result).toEqual({ status: 'ok' })
    expect(mockDb.command).toHaveBeenCalledWith({
      createUser: 'newuser',
      pwd: 'secret',
      roles: [{ role: 'readWrite', db: 'mydb' }]
    })
  })

  it('creates user without password', async () => {
    const provider = await buildConnectedProvider()
    mockDb.command.mockResolvedValue({ ok: 1 })
    const result = await provider.saveMongoUser({
      username: 'nopassuser',
      roles: [{ role: 'read', db: 'admin' }]
    })
    expect(result).toEqual({ status: 'ok' })
    const callArg = mockDb.command.mock.calls[0][0] as Record<string, unknown>
    expect(callArg).not.toHaveProperty('pwd')
  })

  it('returns error when command fails', async () => {
    const provider = await buildConnectedProvider()
    mockDb.command.mockRejectedValue(new Error('DuplicateKey'))
    const result = await provider.saveMongoUser({
      username: 'existing',
      roles: []
    })
    expect(result).toEqual({ status: 'error', message: 'DuplicateKey' })
  })
})

// ── saveMongoUser — update ────────────────────────────────────────────────────

describe('MongoDbProvider.saveMongoUser — update', () => {
  it('updates user roles', async () => {
    const provider = await buildConnectedProvider()
    mockDb.command.mockResolvedValue({ ok: 1 })
    const result = await provider.saveMongoUser({
      originalUsername: 'alice',
      username: 'alice',
      roles: [{ role: 'root', db: 'admin' }]
    })
    expect(result).toEqual({ status: 'ok' })
    expect(mockDb.command).toHaveBeenCalledWith({
      updateUser: 'alice',
      roles: [{ role: 'root', db: 'admin' }]
    })
  })

  it('updates user with new password', async () => {
    const provider = await buildConnectedProvider()
    mockDb.command.mockResolvedValue({ ok: 1 })
    await provider.saveMongoUser({
      originalUsername: 'alice',
      username: 'alice',
      password: 'newpassword',
      roles: []
    })
    expect(mockDb.command).toHaveBeenCalledWith({
      updateUser: 'alice',
      pwd: 'newpassword',
      roles: []
    })
  })
})

// ── deleteMongoUser ───────────────────────────────────────────────────────────

describe('MongoDbProvider.deleteMongoUser', () => {
  it('drops user successfully', async () => {
    const provider = await buildConnectedProvider()
    mockDb.command.mockResolvedValue({ ok: 1 })
    const result = await provider.deleteMongoUser('alice')
    expect(result).toEqual({ status: 'ok' })
    expect(mockDb.command).toHaveBeenCalledWith({ dropUser: 'alice' })
  })

  it('returns error when drop fails', async () => {
    const provider = await buildConnectedProvider()
    mockDb.command.mockRejectedValue(new Error('UserNotFound'))
    const result = await provider.deleteMongoUser('ghost')
    expect(result).toEqual({ status: 'error', message: 'UserNotFound' })
  })
})

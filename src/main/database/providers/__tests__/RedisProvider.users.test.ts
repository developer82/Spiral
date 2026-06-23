// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mock ioredis ─────────────────────────────────────────────────────────────

const mockCall = vi.fn()

const mockRedisInstance = {
  connect: vi.fn().mockResolvedValue(undefined),
  quit: vi.fn().mockResolvedValue('OK'),
  ping: vi.fn().mockResolvedValue('PONG'),
  config: vi.fn().mockResolvedValue(['databases', '4']),
  call: mockCall
}

vi.mock('ioredis', () => {
  const RedisMock = vi.fn(() => mockRedisInstance)
  const ClusterMock = vi.fn(() => mockRedisInstance)
  return { Redis: RedisMock, Cluster: ClusterMock, default: RedisMock }
})

vi.mock('ssh2', () => ({ Client: vi.fn() }))
vi.mock('net', () => ({ createServer: vi.fn(() => ({ listen: vi.fn(), address: vi.fn(), close: vi.fn(), on: vi.fn() })) }))
vi.mock('fs', () => ({ readFileSync: vi.fn(() => Buffer.from('KEY')) }))

import { RedisProvider } from '../RedisProvider'
import type { ConnectionRecord } from '../../../store'

function makeRecord(): ConnectionRecord {
  return {
    id: 'test-id',
    name: 'Test Redis',
    provider: 'redis',
    host: 'localhost',
    port: 6379,
    username: '',
    password: '',
    rememberPassword: false,
    defaultDatabase: '0'
  }
}

function makeAclGetUserResponse(overrides: {
  flags?: string[]
  commands?: string
  keys?: string
  channels?: string
} = {}): unknown[] {
  return [
    'flags', overrides.flags ?? ['on'],
    'passwords', [],
    'commands', overrides.commands ?? '+@all',
    'keys', overrides.keys ?? '*',
    'channels', overrides.channels ?? '*',
    'selectors', []
  ]
}

async function buildConnectedProvider(): Promise<RedisProvider> {
  const p = new RedisProvider()
  mockCall.mockResolvedValue('OK')
  await p.connect(makeRecord())
  return p
}

beforeEach(() => {
  vi.clearAllMocks()
  mockRedisInstance.connect.mockResolvedValue(undefined)
  mockRedisInstance.ping.mockResolvedValue('PONG')
  mockRedisInstance.config.mockResolvedValue(['databases', '4'])
})

// ── getRedisAclUserDetails ────────────────────────────────────────────────────

describe('RedisProvider.getRedisAclUserDetails', () => {
  it('parses fully-enabled user with all commands and all keys', async () => {
    const provider = await buildConnectedProvider()
    mockCall.mockResolvedValue(makeAclGetUserResponse({
      flags: ['on'],
      commands: '+@all',
      keys: '*',
      channels: '*'
    }))

    const result = await provider.getRedisAclUserDetails('default')

    expect(result).not.toBeNull()
    expect(result!.username).toBe('default')
    expect(result!.enabled).toBe(true)
    expect(result!.nopass).toBe(false)
    expect(result!.allCommands).toBe(true)
    expect(result!.allKeys).toBe(true)
    expect(result!.allChannels).toBe(true)
    expect(result!.categories).toEqual([])
    expect(result!.keyPatterns).toEqual([])
    expect(result!.channelPatterns).toEqual([])
  })

  it('parses disabled user with nopass', async () => {
    const provider = await buildConnectedProvider()
    mockCall.mockResolvedValue(makeAclGetUserResponse({
      flags: ['off', 'nopass'],
      commands: '-@all',
      keys: '',
      channels: ''
    }))

    const result = await provider.getRedisAclUserDetails('alice')

    expect(result!.enabled).toBe(false)
    expect(result!.nopass).toBe(true)
    expect(result!.noCommands).toBe(true)
    expect(result!.noKeys).toBe(true)
    expect(result!.noChannels).toBe(true)
  })

  it('parses user with category subset and key patterns', async () => {
    const provider = await buildConnectedProvider()
    mockCall.mockResolvedValue(makeAclGetUserResponse({
      flags: ['on'],
      commands: '-@all +@read +@write',
      keys: '~cache:* ~session:*',
      channels: ''
    }))

    const result = await provider.getRedisAclUserDetails('bob')

    expect(result!.allCommands).toBe(false)
    expect(result!.categories).toContain('@read')
    expect(result!.categories).toContain('@write')
    expect(result!.allKeys).toBe(false)
    expect(result!.keyPatterns).toEqual(['cache:*', 'session:*'])
    expect(result!.noChannels).toBe(true)
  })

  it('returns null when ACL GETUSER returns null', async () => {
    const provider = await buildConnectedProvider()
    mockCall.mockResolvedValue(null)

    const result = await provider.getRedisAclUserDetails('nonexistent')
    expect(result).toBeNull()
  })

  it('returns null on error', async () => {
    const provider = await buildConnectedProvider()
    mockCall.mockRejectedValue(new Error('ACL not supported'))

    const result = await provider.getRedisAclUserDetails('alice')
    expect(result).toBeNull()
  })
})

// ── saveRedisAclUser — create ─────────────────────────────────────────────────

describe('RedisProvider.saveRedisAclUser — create', () => {
  it('issues ACL SETUSER with correct rules for new user with password', async () => {
    const provider = await buildConnectedProvider()
    mockCall.mockResolvedValue('OK')

    const result = await provider.saveRedisAclUser({
      username: 'newuser',
      password: 'secret123',
      enabled: true,
      nopass: false,
      allCommands: true,
      categories: [],
      allKeys: true,
      keyPatterns: [],
      allChannels: false,
      channelPatterns: []
    })

    expect(result.status).toBe('ok')
    expect(mockCall).toHaveBeenCalledWith(
      'ACL', 'SETUSER', 'newuser',
      'reset', 'on', '>secret123', '+@all', 'allkeys', 'nochannels'
    )
  })

  it('issues ACL SETUSER with nopass flag', async () => {
    const provider = await buildConnectedProvider()
    mockCall.mockResolvedValue('OK')

    await provider.saveRedisAclUser({
      username: 'svcuser',
      password: undefined,
      enabled: true,
      nopass: true,
      allCommands: false,
      categories: ['@read'],
      allKeys: false,
      keyPatterns: ['data:*'],
      allChannels: true,
      channelPatterns: []
    })

    expect(mockCall).toHaveBeenCalledWith(
      'ACL', 'SETUSER', 'svcuser',
      'reset', 'on', 'nopass', '-@all', '+@read', '~data:*', 'allchannels'
    )
  })

  it('issues ACL SETUSER with disabled account and channel patterns', async () => {
    const provider = await buildConnectedProvider()
    mockCall.mockResolvedValue('OK')

    await provider.saveRedisAclUser({
      username: 'limiteduser',
      password: 'pass',
      enabled: false,
      nopass: false,
      allCommands: false,
      categories: [],
      allKeys: false,
      keyPatterns: [],
      allChannels: false,
      channelPatterns: ['alerts:*']
    })

    expect(mockCall).toHaveBeenCalledWith(
      'ACL', 'SETUSER', 'limiteduser',
      'reset', 'off', '>pass', '-@all', 'nokeys', '&alerts:*'
    )
  })
})

// ── saveRedisAclUser — rename ─────────────────────────────────────────────────

describe('RedisProvider.saveRedisAclUser — rename', () => {
  it('creates new user then deletes old when username changes', async () => {
    const provider = await buildConnectedProvider()
    mockCall.mockResolvedValue('OK')

    const result = await provider.saveRedisAclUser({
      originalUsername: 'oldname',
      username: 'newname',
      enabled: true,
      nopass: true,
      allCommands: true,
      categories: [],
      allKeys: true,
      keyPatterns: [],
      allChannels: true,
      channelPatterns: []
    })

    expect(result.status).toBe('ok')
    const calls = mockCall.mock.calls
    const setUserCall = calls.find((c) => c[1] === 'SETUSER' && c[2] === 'newname')
    const delUserCall = calls.find((c) => c[1] === 'DELUSER' && c[2] === 'oldname')
    expect(setUserCall).toBeDefined()
    expect(delUserCall).toBeDefined()
  })

  it('does not delete old user when username is unchanged', async () => {
    const provider = await buildConnectedProvider()
    mockCall.mockResolvedValue('OK')

    await provider.saveRedisAclUser({
      originalUsername: 'alice',
      username: 'alice',
      enabled: true,
      nopass: false,
      allCommands: true,
      categories: [],
      allKeys: true,
      keyPatterns: [],
      allChannels: true,
      channelPatterns: []
    })

    const delUserCalls = mockCall.mock.calls.filter((c) => c[1] === 'DELUSER')
    expect(delUserCalls).toHaveLength(0)
  })
})

// ── deleteRedisAclUser ────────────────────────────────────────────────────────

describe('RedisProvider.deleteRedisAclUser', () => {
  it('calls ACL DELUSER with the username', async () => {
    const provider = await buildConnectedProvider()
    mockCall.mockResolvedValue(1)

    const result = await provider.deleteRedisAclUser('bob')

    expect(result.status).toBe('ok')
    expect(mockCall).toHaveBeenCalledWith('ACL', 'DELUSER', 'bob')
  })

  it('returns error on failure', async () => {
    const provider = await buildConnectedProvider()
    mockCall.mockRejectedValue(new Error('ERR No such user'))

    const result = await provider.deleteRedisAclUser('ghost')

    expect(result.status).toBe('error')
    expect((result as { status: 'error'; message: string }).message).toContain('ERR No such user')
  })
})

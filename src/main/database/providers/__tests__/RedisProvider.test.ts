// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ─── Mock ioredis ─────────────────────────────────────────────────────────────

const mockRedisInstance = {
  connect: vi.fn().mockResolvedValue(undefined),
  quit: vi.fn().mockResolvedValue('OK'),
  ping: vi.fn().mockResolvedValue('PONG'),
  select: vi.fn().mockResolvedValue('OK'),
  config: vi.fn().mockResolvedValue(['databases', '4']),
  scan: vi.fn().mockResolvedValue(['0', []]),
  get: vi.fn().mockResolvedValue('hello'),
  set: vi.fn().mockResolvedValue('OK'),
  del: vi.fn().mockResolvedValue(1),
  hgetall: vi.fn().mockResolvedValue({ field1: 'val1', field2: 'val2' }),
  lrange: vi.fn().mockResolvedValue(['a', 'b', 'c']),
  smembers: vi.fn().mockResolvedValue(['x', 'y']),
  info: vi.fn().mockResolvedValue('redis_version:7.0.0'),
  dbsize: vi.fn().mockResolvedValue(42)
}

const mockClusterInstance = {
  ping: vi.fn().mockResolvedValue('PONG'),
  quit: vi.fn().mockResolvedValue('OK'),
  scan: vi.fn().mockResolvedValue(['0', []]),
  get: vi.fn().mockResolvedValue('cluster-value')
}

vi.mock('ioredis', () => {
  const RedisMock = vi.fn(() => mockRedisInstance)
  const ClusterMock = vi.fn(() => mockClusterInstance)
  return { Redis: RedisMock, Cluster: ClusterMock, default: RedisMock }
})

// ─── Mock ssh2 ────────────────────────────────────────────────────────────────

let capturedSshReadyCallback: (() => void) | null = null
let capturedSshErrorCallback: ((err: Error) => void) | null = null

const mockSshClient = {
  on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
    if (event === 'ready') capturedSshReadyCallback = cb as () => void
    if (event === 'error') capturedSshErrorCallback = cb as (err: Error) => void
    return mockSshClient
  }),
  connect: vi.fn(),
  end: vi.fn(),
  forwardOut: vi.fn()
}

vi.mock('ssh2', () => ({
  Client: vi.fn(() => mockSshClient)
}))

// ─── Mock net ─────────────────────────────────────────────────────────────────

const mockSocket = {
  pipe: vi.fn().mockReturnThis(),
  on: vi.fn().mockReturnThis(),
  destroy: vi.fn()
}

let mockServerListenCallback: (() => void) | null = null

const mockNetServer = {
  listen: vi.fn((_port: number, _host: string, cb: () => void) => {
    mockServerListenCallback = cb
    return mockNetServer
  }),
  address: vi.fn(() => ({ port: 12345, address: '127.0.0.1', family: 'IPv4' })),
  close: vi.fn((cb?: () => void) => cb?.()),
  on: vi.fn().mockReturnThis()
}

vi.mock('net', () => ({
  createServer: vi.fn((_handler: (sock: typeof mockSocket) => void) => {
    return mockNetServer
  })
}))

// ─── Mock fs ──────────────────────────────────────────────────────────────────

vi.mock('fs', () => ({
  readFileSync: vi.fn(() => Buffer.from('PRIVATE KEY CONTENT'))
}))

// ─── Import the provider after mocks are set up ───────────────────────────────

import { RedisProvider } from '../RedisProvider'
import type { ConnectionRecord } from '../../../store'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRecord(overrides: Partial<ConnectionRecord> = {}): ConnectionRecord {
  return {
    id: 'test-id',
    name: 'Test Redis',
    provider: 'redis',
    host: 'localhost',
    port: 6379,
    username: '',
    password: '',
    rememberPassword: false,
    defaultDatabase: '0',
    ...overrides
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('RedisProvider', () => {
  let provider: RedisProvider

  beforeEach(() => {
    provider = new RedisProvider()
    vi.clearAllMocks()
    capturedSshReadyCallback = null
    capturedSshErrorCallback = null
    mockServerListenCallback = null

    // Re-set default mock implementations after clearAllMocks
    mockRedisInstance.connect.mockResolvedValue(undefined)
    mockRedisInstance.quit.mockResolvedValue('OK')
    mockRedisInstance.ping.mockResolvedValue('PONG')
    mockRedisInstance.select.mockResolvedValue('OK')
    mockRedisInstance.config.mockResolvedValue(['databases', '4'])
    mockRedisInstance.scan.mockResolvedValue(['0', []])
    mockRedisInstance.get.mockResolvedValue('hello')
    mockRedisInstance.set.mockResolvedValue('OK')
    mockRedisInstance.del.mockResolvedValue(1)
    mockRedisInstance.hgetall.mockResolvedValue({ field1: 'val1', field2: 'val2' })
    mockRedisInstance.lrange.mockResolvedValue(['a', 'b', 'c'])
    mockRedisInstance.smembers.mockResolvedValue(['x', 'y'])
    mockRedisInstance.info.mockResolvedValue('redis_version:7.0.0')
    mockRedisInstance.dbsize.mockResolvedValue(42)
    mockClusterInstance.ping.mockResolvedValue('PONG')
    mockClusterInstance.quit.mockResolvedValue('OK')
    mockClusterInstance.scan.mockResolvedValue(['0', []])
    mockClusterInstance.get.mockResolvedValue('cluster-value')
    mockSshClient.on.mockImplementation((event: string, cb: (...args: unknown[]) => void) => {
      if (event === 'ready') capturedSshReadyCallback = cb as () => void
      if (event === 'error') capturedSshErrorCallback = cb as (err: Error) => void
      return mockSshClient
    })
    mockSshClient.connect.mockImplementation(() => {})
    mockNetServer.listen.mockImplementation((_p: number, _h: string, cb: () => void) => {
      mockServerListenCallback = cb
      return mockNetServer
    })
    mockNetServer.address.mockReturnValue({ port: 12345, address: '127.0.0.1', family: 'IPv4' })
    mockNetServer.close.mockImplementation((cb?: () => void) => cb?.())
  })

  afterEach(async () => {
    await provider.disconnect()
  })

  // ── connect ─────────────────────────────────────────────────────────────────

  describe('connect', () => {
    it('connects in standalone mode', async () => {
      const { Redis } = await import('ioredis')
      await provider.connect(makeRecord())
      expect(Redis).toHaveBeenCalledWith(
        expect.objectContaining({ host: 'localhost', port: 6379, db: 0 })
      )
      expect(mockRedisInstance.connect).toHaveBeenCalled()
    })

    it('passes ACL username and password when provided', async () => {
      const { Redis } = await import('ioredis')
      await provider.connect(makeRecord({ username: 'myuser', password: 'secret' }))
      expect(Redis).toHaveBeenCalledWith(
        expect.objectContaining({ username: 'myuser', password: 'secret' })
      )
    })

    it('omits username when empty string', async () => {
      const { Redis } = await import('ioredis')
      await provider.connect(makeRecord({ username: '', password: 'secret' }))
      const callArg = (Redis as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]
      expect(callArg.username).toBeUndefined()
    })

    it('connects in cluster mode', async () => {
      const { Cluster } = await import('ioredis')
      await provider.connect(makeRecord({ redisMode: 'cluster' }))
      expect(Cluster).toHaveBeenCalledWith(
        [{ host: 'localhost', port: 6379 }],
        expect.any(Object)
      )
      expect(mockClusterInstance.ping).toHaveBeenCalled()
    })

    it('connects in sentinel mode with parsed nodes', async () => {
      const { Redis } = await import('ioredis')
      await provider.connect(
        makeRecord({
          redisMode: 'sentinel',
          sentinelNodes: 'sentinel1:26379,sentinel2:26379',
          sentinelMasterName: 'mymaster'
        })
      )
      expect(Redis).toHaveBeenCalledWith(
        expect.objectContaining({
          sentinels: [
            { host: 'sentinel1', port: 26379 },
            { host: 'sentinel2', port: 26379 }
          ],
          name: 'mymaster'
        })
      )
    })

    it('throws when sentinel mode has no nodes', async () => {
      await expect(
        provider.connect(
          makeRecord({ redisMode: 'sentinel', sentinelNodes: '', sentinelMasterName: 'mymaster' })
        )
      ).rejects.toThrow('At least one sentinel node')
    })

    it('throws when sentinel mode has no master name', async () => {
      await expect(
        provider.connect(
          makeRecord({
            redisMode: 'sentinel',
            sentinelNodes: 'sentinel1:26379',
            sentinelMasterName: ''
          })
        )
      ).rejects.toThrow('Sentinel master name is required')
    })

    it('passes TLS options when tlsEnabled is true', async () => {
      const { Redis } = await import('ioredis')
      await provider.connect(
        makeRecord({ tlsEnabled: true, tlsServername: 'my.redis.host', tlsRejectUnauthorized: false })
      )
      expect(Redis).toHaveBeenCalledWith(
        expect.objectContaining({
          tls: { servername: 'my.redis.host', rejectUnauthorized: false }
        })
      )
    })

    it('does not pass TLS options when tlsEnabled is false', async () => {
      const { Redis } = await import('ioredis')
      await provider.connect(makeRecord({ tlsEnabled: false }))
      const callArg = (Redis as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]
      expect(callArg.tls).toBeUndefined()
    })

    it('throws for cluster mode with SSH', async () => {
      await expect(
        provider.connect(
          makeRecord({ redisMode: 'cluster', sshEnabled: true, sshHost: 'bastion.host' })
        )
      ).rejects.toThrow('SSH tunneling is not supported for Redis Cluster')
    })
  })

  // ── SSH tunnel ──────────────────────────────────────────────────────────────

  describe('SSH tunnel', () => {
    it('creates SSH tunnel with password auth', async () => {
      const { Redis } = await import('ioredis')

      const connectPromise = provider.connect(
        makeRecord({
          sshEnabled: true,
          sshHost: 'bastion.example.com',
          sshPort: 22,
          sshUsername: 'ubuntu',
          sshAuthMode: 'password',
          sshPassword: 'mypassword'
        })
      )

      // Simulate SSH client becoming ready
      capturedSshReadyCallback?.()
      // Simulate server listening
      mockServerListenCallback?.()

      await connectPromise

      expect(mockSshClient.connect).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'bastion.example.com',
          port: 22,
          username: 'ubuntu',
          password: 'mypassword'
        })
      )
      // ioredis should connect to the tunnel port
      expect(Redis).toHaveBeenCalledWith(
        expect.objectContaining({ host: '127.0.0.1', port: 12345 })
      )
    })

    it('creates SSH tunnel with private key auth', async () => {
      const fs = await import('fs')
      const { Redis } = await import('ioredis')

      const connectPromise = provider.connect(
        makeRecord({
          sshEnabled: true,
          sshHost: 'bastion.example.com',
          sshAuthMode: 'privateKey',
          sshUsername: 'ubuntu',
          sshPrivateKeyPath: '/home/user/.ssh/id_rsa',
          sshPassphrase: 'mysecretphrase'
        })
      )

      capturedSshReadyCallback?.()
      mockServerListenCallback?.()

      await connectPromise

      expect(fs.readFileSync).toHaveBeenCalledWith('/home/user/.ssh/id_rsa')
      expect(mockSshClient.connect).toHaveBeenCalledWith(
        expect.objectContaining({
          privateKey: Buffer.from('PRIVATE KEY CONTENT'),
          passphrase: 'mysecretphrase'
        })
      )
      expect(Redis).toHaveBeenCalledWith(
        expect.objectContaining({ host: '127.0.0.1', port: 12345 })
      )
    })

    it('rejects when SSH private key path is empty', async () => {
      const connectPromise = provider.connect(
        makeRecord({
          sshEnabled: true,
          sshHost: 'bastion.example.com',
          sshAuthMode: 'privateKey',
          sshUsername: 'ubuntu',
          sshPrivateKeyPath: ''
        })
      )

      capturedSshReadyCallback?.()

      await expect(connectPromise).rejects.toThrow('SSH private key path is required')
    })

    it('rejects when SSH error fires', async () => {
      const connectPromise = provider.connect(
        makeRecord({
          sshEnabled: true,
          sshHost: 'bad-host.example.com',
          sshAuthMode: 'password',
          sshUsername: 'ubuntu',
          sshPassword: 'pw'
        })
      )

      capturedSshErrorCallback?.(new Error('Connection refused'))

      await expect(connectPromise).rejects.toThrow('Connection refused')
    })

    it('disconnects SSH tunnel on disconnect()', async () => {
      const connectPromise = provider.connect(
        makeRecord({
          sshEnabled: true,
          sshHost: 'bastion.example.com',
          sshAuthMode: 'password',
          sshUsername: 'ubuntu',
          sshPassword: 'pw'
        })
      )

      capturedSshReadyCallback?.()
      mockServerListenCallback?.()

      await connectPromise

      await provider.disconnect()

      expect(mockNetServer.close).toHaveBeenCalled()
      expect(mockSshClient.end).toHaveBeenCalled()
    })
  })

  // ── listDatabases ───────────────────────────────────────────────────────────

  describe('listDatabases', () => {
    it('returns DB nodes based on CONFIG GET databases', async () => {
      mockRedisInstance.config.mockResolvedValue(['databases', '4'])
      await provider.connect(makeRecord())

      const dbs = await provider.listDatabases(false)
      expect(dbs).toHaveLength(4)
      expect(dbs[0]).toEqual({ id: 'redis-db:0', label: '0', kind: 'redis-keyspace' })
      expect(dbs[3]).toEqual({ id: 'redis-db:3', label: '3', kind: 'redis-keyspace' })
    })

    it('falls back to 16 databases when CONFIG GET fails', async () => {
      mockRedisInstance.config.mockRejectedValue(new Error('no config'))
      await provider.connect(makeRecord())

      const dbs = await provider.listDatabases(false)
      expect(dbs).toHaveLength(16)
    })

    it('returns only DB 0 for cluster mode', async () => {
      await provider.connect(makeRecord({ redisMode: 'cluster' }))

      const dbs = await provider.listDatabases(false)
      expect(dbs).toHaveLength(1)
      expect(dbs[0]).toEqual({ id: 'redis-db:0', label: '0', kind: 'redis-keyspace' })
    })

    it('when hideEmptyDatabases is false (default), returns all databases', async () => {
      mockRedisInstance.config.mockResolvedValue(['databases', '4'])
      await provider.connect(makeRecord({ redisHideEmptyDatabases: false }))

      const dbs = await provider.listDatabases(false)
      expect(dbs).toHaveLength(4)
      expect(mockRedisInstance.dbsize).not.toHaveBeenCalled()
    })

    it('when hideEmptyDatabases is true, returns only databases with keys', async () => {
      mockRedisInstance.config.mockResolvedValue(['databases', '4'])
      // DB 0: 0 keys, DB 1: 5 keys, DB 2: 0 keys, DB 3: 2 keys
      mockRedisInstance.dbsize
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(2)
      await provider.connect(makeRecord({ redisHideEmptyDatabases: true }))

      const dbs = await provider.listDatabases(false)
      expect(dbs).toHaveLength(2)
      expect(dbs[0]).toEqual({ id: 'redis-db:1', label: '1', kind: 'redis-keyspace' })
      expect(dbs[1]).toEqual({ id: 'redis-db:3', label: '3', kind: 'redis-keyspace' })
    })

    it('when hideEmptyDatabases is true, calls SELECT before DBSIZE for each DB', async () => {
      mockRedisInstance.config.mockResolvedValue(['databases', '2'])
      mockRedisInstance.dbsize.mockResolvedValue(1)
      await provider.connect(makeRecord({ redisHideEmptyDatabases: true }))

      await provider.listDatabases(false)
      expect(mockRedisInstance.select).toHaveBeenCalledWith(0)
      expect(mockRedisInstance.select).toHaveBeenCalledWith(1)
    })

    it('when hideEmptyDatabases is true and DBSIZE fails for a DB, includes that DB as fallback', async () => {
      mockRedisInstance.config.mockResolvedValue(['databases', '3'])
      mockRedisInstance.dbsize
        .mockResolvedValueOnce(0)
        .mockRejectedValueOnce(new Error('DBSIZE error'))
        .mockResolvedValueOnce(0)
      await provider.connect(makeRecord({ redisHideEmptyDatabases: true }))

      const dbs = await provider.listDatabases(false)
      // DB 0 is empty, DB 1 failed (included as fallback), DB 2 is empty
      expect(dbs).toHaveLength(1)
      expect(dbs[0]).toEqual({ id: 'redis-db:1', label: '1', kind: 'redis-keyspace' })
    })

    it('cluster mode always returns DB 0 regardless of hideEmptyDatabases flag', async () => {
      await provider.connect(makeRecord({ redisMode: 'cluster', redisHideEmptyDatabases: true }))

      const dbs = await provider.listDatabases(false)
      expect(dbs).toHaveLength(1)
      expect(dbs[0]).toEqual({ id: 'redis-db:0', label: '0', kind: 'redis-keyspace' })
      expect(mockRedisInstance.dbsize).not.toHaveBeenCalled()
    })
  })

  // ── listRedisKeyPrefixes ─────────────────────────────────────────────────────

  describe('listRedisKeyPrefixes', () => {
    it('groups keys by prefix and returns bare keys separately', async () => {
      mockRedisInstance.scan.mockResolvedValue([
        '0',
        ['user:1', 'user:2', 'order:100', 'barekey']
      ])
      await provider.connect(makeRecord())

      const nodes = await provider.listRedisKeyPrefixes!('0')

      const prefixNodes = nodes.filter((n) => n.kind === 'redis-key-prefix')
      const keyNodes = nodes.filter((n) => n.kind === 'redis-key')

      expect(prefixNodes).toHaveLength(2)
      expect(prefixNodes.map((n) => n.id)).toContain('redis-prefix:0:user')
      expect(prefixNodes.map((n) => n.id)).toContain('redis-prefix:0:order')

      expect(keyNodes).toHaveLength(1)
      expect(keyNodes[0].id).toBe('redis-key:0:barekey')
    })

    it('calls SELECT for standalone mode', async () => {
      await provider.connect(makeRecord())
      await provider.listRedisKeyPrefixes!('3')
      expect(mockRedisInstance.select).toHaveBeenCalledWith(3)
    })

    it('returns empty array for invalid db index', async () => {
      await provider.connect(makeRecord())
      const nodes = await provider.listRedisKeyPrefixes!('not-a-number')
      expect(nodes).toEqual([])
    })

    it('returns prefix count in label', async () => {
      mockRedisInstance.scan.mockResolvedValue(['0', ['user:1', 'user:2', 'user:3']])
      await provider.connect(makeRecord())

      const nodes = await provider.listRedisKeyPrefixes!('0')
      expect(nodes[0].label).toBe('user: (3)')
    })
  })

  // ── listRedisKeysForPrefix ───────────────────────────────────────────────────

  describe('listRedisKeysForPrefix', () => {
    it('returns keys matching prefix pattern', async () => {
      mockRedisInstance.scan.mockResolvedValue(['0', ['user:1', 'user:2', 'user:999']])
      await provider.connect(makeRecord())

      const nodes = await provider.listRedisKeysForPrefix!('0', 'user')
      expect(nodes).toHaveLength(3)
      expect(nodes[0].kind).toBe('redis-key')
      expect(nodes[0].id).toBe('redis-key:0:user:1')
    })

    it('returns sorted keys', async () => {
      mockRedisInstance.scan.mockResolvedValue(['0', ['user:99', 'user:1', 'user:50']])
      await provider.connect(makeRecord())

      const nodes = await provider.listRedisKeysForPrefix!('0', 'user')
      expect(nodes.map((n) => n.label)).toEqual(['user:1', 'user:50', 'user:99'])
    })
  })

  // ── executeQuery ─────────────────────────────────────────────────────────────

  describe('executeQuery', () => {
    it('returns ok result for string response (GET)', async () => {
      await provider.connect(makeRecord())
      const result = await provider.executeQuery('GET mykey', undefined, false, false, '0')

      expect(result.status).toBe('ok')
      if (result.status === 'ok') {
        expect(result.resultSets[0].columns).toEqual(['result'])
        expect(result.resultSets[0].rows[0].result).toBe('hello')
      }
    })

    it('returns ok result for OK response (SET)', async () => {
      await provider.connect(makeRecord())
      const result = await provider.executeQuery('SET mykey myvalue', undefined, false, false, '0')

      expect(result.status).toBe('ok')
      if (result.status === 'ok') {
        expect(result.resultSets[0].rows[0].result).toBe('OK')
      }
    })

    it('normalizes HGETALL object response to field/value rows', async () => {
      await provider.connect(makeRecord())
      const result = await provider.executeQuery('HGETALL myhash', undefined, false, false, '0')

      expect(result.status).toBe('ok')
      if (result.status === 'ok') {
        expect(result.resultSets[0].columns).toEqual(['field', 'value'])
        expect(result.resultSets[0].rows).toContainEqual({ field: 'field1', value: 'val1' })
      }
    })

    it('normalizes LRANGE array response to value rows', async () => {
      await provider.connect(makeRecord())
      const result = await provider.executeQuery('LRANGE mylist 0 -1', undefined, false, false, '0')

      expect(result.status).toBe('ok')
      if (result.status === 'ok') {
        expect(result.resultSets[0].columns).toEqual(['value'])
        expect(result.resultSets[0].rows).toEqual([
          { value: 'a' },
          { value: 'b' },
          { value: 'c' }
        ])
      }
    })

    it('returns error result for unknown command', async () => {
      ;(mockRedisInstance as Record<string, unknown>).badcmd = undefined
      await provider.connect(makeRecord())
      const result = await provider.executeQuery('BADCMD foo')

      expect(result.status).toBe('error')
    })

    it('returns empty resultSets for empty input', async () => {
      await provider.connect(makeRecord())
      const result = await provider.executeQuery('   ')

      expect(result.status).toBe('ok')
      if (result.status === 'ok') {
        expect(result.resultSets).toHaveLength(0)
      }
    })

    it('calls SELECT with the given database index', async () => {
      await provider.connect(makeRecord())
      await provider.executeQuery('GET key', undefined, false, false, '3')
      expect(mockRedisInstance.select).toHaveBeenCalledWith(3)
    })

    it('parses quoted arguments correctly', async () => {
      await provider.connect(makeRecord())
      await provider.executeQuery('SET mykey "hello world"', undefined, false, false, '0')
      expect(mockRedisInstance.set).toHaveBeenCalledWith('mykey', 'hello world')
    })
  })

  // ── listCategories ───────────────────────────────────────────────────────────

  describe('listCategories', () => {
    it('returns empty array (Redis does not use standard category tree)', () => {
      expect(provider.listCategories('0')).toEqual([])
    })
  })

  // ── getCapabilities ──────────────────────────────────────────────────────────

  describe('getCapabilities', () => {
    it('returns all-false capabilities', () => {
      const caps = provider.getCapabilities()
      expect(caps.executionPlan.kind).toBe('none')
      expect(caps.clientStatistics.kind).toBe('none')
      expect(caps.hasCreateDatabase).toBe(false)
      expect(caps.hasStoredProcedures).toBe(false)
      expect(caps.hasFunctions).toBe(false)
      expect(caps.hasUserDefinedTypes).toBe(false)
      expect(caps.hasTableTypes).toBe(false)
      expect(caps.hasMemoryOptimizedTableTypes).toBe(false)
      expect(caps.hasStatistics).toBe(false)
      expect(caps.hasIndexRebuild).toBe(false)
      expect(caps.hasIndexReorganize).toBe(false)
      expect(caps.hasIndexDisable).toBe(false)
      expect(caps.hasProfiler).toBe(false)
      expect(caps.hasCreateTable).toBe(false)
    })
  })

  // ── relational stubs ─────────────────────────────────────────────────────────

  describe('relational stubs', () => {
    it('listTables returns empty array', async () => {
      expect(await provider.listTables('0')).toEqual([])
    })

    it('listViews returns empty array', async () => {
      expect(await provider.listViews('0')).toEqual([])
    })

    it('getTableSchema returns error', async () => {
      const result = await provider.getTableSchema('0', 'main', 'users')
      expect(result.status).toBe('error')
    })

    it('getErdSchema returns error', async () => {
      const result = await provider.getErdSchema('0')
      expect(result.status).toBe('error')
    })

    it('getDataTypes returns ok with empty array', async () => {
      const result = await provider.getDataTypes('0')
      expect(result.status).toBe('ok')
      if (result.status === 'ok') expect(result.dataTypes).toEqual([])
    })

    it('scriptTableCreate returns error', async () => {
      const result = await provider.scriptTableCreate('0', 'main', 'users')
      expect(result.status).toBe('error')
    })

    it('listServerSecurityCategories returns users folder', () => {
      expect(provider.listServerSecurityCategories()).toEqual([
        { id: 'security:users', label: 'Users', kind: 'security-users-folder' }
      ])
    })
  })

  // ── deleteRedisKey ──────────────────────────────────────────────────────────

  describe('deleteRedisKey', () => {
    it('selects the correct db and deletes the key in standalone mode', async () => {
      await provider.connect(makeRecord())
      const result = await provider.deleteRedisKey!('2', 'user:42')
      expect(mockRedisInstance.select).toHaveBeenCalledWith(2)
      expect(mockRedisInstance.del).toHaveBeenCalledWith('user:42')
      expect(result).toEqual({ status: 'ok', deletedCount: 1 })
    })

    it('skips SELECT in cluster mode', async () => {
      ;(mockClusterInstance as typeof mockRedisInstance).del = vi.fn().mockResolvedValue(1)
      await provider.connect(makeRecord({ redisMode: 'cluster' }))
      const result = await provider.deleteRedisKey!('0', 'user:42')
      expect(mockRedisInstance.select).not.toHaveBeenCalled()
      expect(result).toEqual({ status: 'ok', deletedCount: 1 })
    })

    it('returns error for invalid database index', async () => {
      await provider.connect(makeRecord())
      const result = await provider.deleteRedisKey!('notANumber', 'user:42')
      expect(result.status).toBe('error')
    })

    it('returns error when del rejects', async () => {
      mockRedisInstance.del.mockRejectedValue(new Error('READONLY'))
      await provider.connect(makeRecord())
      const result = await provider.deleteRedisKey!('0', 'user:42')
      expect(result).toEqual({ status: 'error', message: 'READONLY' })
    })
  })

  // ── deleteRedisPrefix ────────────────────────────────────────────────────────

  describe('deleteRedisPrefix', () => {
    it('scans and bulk-deletes all keys matching prefix:*', async () => {
      mockRedisInstance.scan.mockResolvedValue(['0', ['user:1', 'user:2', 'user:3']])
      mockRedisInstance.del.mockResolvedValue(3)
      await provider.connect(makeRecord())
      const result = await provider.deleteRedisPrefix!('0', 'user')
      expect(mockRedisInstance.scan).toHaveBeenCalledWith('0', 'MATCH', 'user:*', 'COUNT', expect.any(Number))
      expect(mockRedisInstance.del).toHaveBeenCalledWith('user:1', 'user:2', 'user:3')
      expect(result).toEqual({ status: 'ok', deletedCount: 3 })
    })

    it('returns deletedCount 0 when no keys match', async () => {
      mockRedisInstance.scan.mockResolvedValue(['0', []])
      await provider.connect(makeRecord())
      const result = await provider.deleteRedisPrefix!('0', 'ghost')
      expect(mockRedisInstance.del).not.toHaveBeenCalled()
      expect(result).toEqual({ status: 'ok', deletedCount: 0 })
    })

    it('paginates through multiple scan cursors', async () => {
      mockRedisInstance.scan
        .mockResolvedValueOnce(['42', ['user:1']])
        .mockResolvedValueOnce(['0', ['user:2']])
      mockRedisInstance.del.mockResolvedValue(2)
      await provider.connect(makeRecord())
      const result = await provider.deleteRedisPrefix!('0', 'user')
      expect(mockRedisInstance.scan).toHaveBeenCalledTimes(2)
      expect(result).toEqual({ status: 'ok', deletedCount: 2 })
    })

    it('returns error for invalid database index', async () => {
      await provider.connect(makeRecord())
      const result = await provider.deleteRedisPrefix!('bad', 'user')
      expect(result.status).toBe('error')
    })

    it('returns error when scan rejects', async () => {
      mockRedisInstance.scan.mockRejectedValue(new Error('SCAN_ERR'))
      await provider.connect(makeRecord())
      const result = await provider.deleteRedisPrefix!('0', 'user')
      expect(result).toEqual({ status: 'error', message: 'SCAN_ERR' })
    })
  })

  // ── disconnect ───────────────────────────────────────────────────────────────

  describe('disconnect', () => {
    it('quits the redis client on disconnect', async () => {
      await provider.connect(makeRecord())
      await provider.disconnect()
      expect(mockRedisInstance.quit).toHaveBeenCalled()
    })

    it('handles quit error gracefully', async () => {
      mockRedisInstance.quit.mockRejectedValue(new Error('Already disconnected'))
      await provider.connect(makeRecord())
      await expect(provider.disconnect()).resolves.toBeUndefined()
    })
  })
})

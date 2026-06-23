// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Capture file writes / reads through mocked fs + zlib ─────────────────────

let writtenData = ''
let readData: Buffer = Buffer.from('')

vi.mock('fs', () => ({
  createWriteStream: vi.fn(() => {
    let finishCb: (() => void) | undefined
    return {
      on(evt: string, cb: () => void) {
        if (evt === 'finish') finishCb = cb
        return this
      },
      end(data?: string | Buffer) {
        if (data != null) writtenData = data.toString()
        finishCb?.()
      }
    }
  }),
  statSync: vi.fn(() => ({ size: writtenData.length }))
}))

vi.mock('fs/promises', () => ({
  readFile: vi.fn(async () => readData)
}))

vi.mock('zlib', () => ({
  // Passthrough gzip: forward the data straight to the destination stream
  createGzip: vi.fn(() => {
    let dest: { end: (d: Buffer) => void } | null = null
    return {
      on() {
        return this
      },
      pipe(d: { end: (data: Buffer) => void }) {
        dest = d
        return d
      },
      end(data: string) {
        dest?.end(Buffer.from(data))
      }
    }
  }),
  gunzipSync: vi.fn((buf: Buffer) => buf)
}))

import { RedisProvider } from '../RedisProvider'
import type { RedisBackupFile } from '../../types'

// ─── A minimal ioredis-like mock client ───────────────────────────────────────

interface MockConn {
  select: ReturnType<typeof vi.fn>
  flushdb: ReturnType<typeof vi.fn>
  config: ReturnType<typeof vi.fn>
  scan: ReturnType<typeof vi.fn>
  pipeline: ReturnType<typeof vi.fn>
  _selectCalls: number[]
  _flushdbCalls: number
  _ops: unknown[][]
}

function makeConn(execResults: unknown[][]): MockConn {
  const selectCalls: number[] = []
  let flushdbCalls = 0
  const ops: unknown[][] = []
  const queue = [...execResults]
  const conn: MockConn = {
    select: vi.fn(async (i: number) => {
      selectCalls.push(i)
    }),
    flushdb: vi.fn(async () => {
      flushdbCalls++
    }),
    config: vi.fn(async () => ['databases', '2']),
    scan: vi.fn(async () => ['0', []]),
    pipeline: vi.fn(() => {
      const p: unknown = new Proxy(
        {},
        {
          get(_t, prop) {
            if (prop === 'exec') return () => Promise.resolve(queue.shift() ?? [])
            if (typeof prop === 'symbol') return undefined
            return (...args: unknown[]) => {
              ops.push([String(prop), ...args])
              return p
            }
          }
        }
      )
      return p
    }),
    _selectCalls: selectCalls,
    get _flushdbCalls() {
      return flushdbCalls
    },
    _ops: ops
  }
  return conn
}

function makeProvider(conn: MockConn): RedisProvider {
  const provider = new RedisProvider()
  ;(provider as unknown as { client: MockConn }).client = conn
  ;(provider as unknown as { redisMode: string }).redisMode = 'standalone'
  ;(provider as unknown as { connectionName: string }).connectionName = 'Test Redis'
  return provider
}

beforeEach(() => {
  writtenData = ''
  readData = Buffer.from('')
  vi.clearAllMocks()
})

// ─── Backup ───────────────────────────────────────────────────────────────────

describe('RedisProvider.backupDatabases', () => {
  it('dumps every key in a single database with its base64 payload and TTL', async () => {
    const buf1 = Buffer.from([1, 2, 3])
    const buf2 = Buffer.from([4, 5, 6])
    const conn = makeConn([
      [
        [null, buf1],
        [null, -1],
        [null, buf2],
        [null, 5000]
      ]
    ])
    conn.scan.mockResolvedValue(['0', ['k1', 'k2']])
    const provider = makeProvider(conn)

    const res = await provider.backupDatabases({
      filePath: '/tmp/b.json',
      scope: { kind: 'database', databaseIndex: 3 },
      compress: false
    })

    expect(res.status).toBe('ok')
    if (res.status !== 'ok') return
    expect(res.keyCount).toBe(2)
    expect(res.databaseCount).toBe(1)
    expect(conn._selectCalls).toEqual([3])
    expect(conn._ops).toEqual([
      ['dumpBuffer', 'k1'],
      ['pttl', 'k1'],
      ['dumpBuffer', 'k2'],
      ['pttl', 'k2']
    ])

    const parsed = JSON.parse(writtenData) as RedisBackupFile
    expect(parsed.spiralRedisBackup).toBe(1)
    expect(parsed.source).toEqual({ connectionName: 'Test Redis', mode: 'standalone' })
    expect(parsed.databases).toEqual([
      {
        index: 3,
        keys: [
          { key: 'k1', pttl: -1, payload: buf1.toString('base64') },
          { key: 'k2', pttl: 5000, payload: buf2.toString('base64') }
        ]
      }
    ])
  })

  it('skips keys that vanish between SCAN and DUMP (null payload)', async () => {
    const buf2 = Buffer.from([9])
    const conn = makeConn([
      [
        [null, null],
        [null, -1],
        [null, buf2],
        [null, 1000]
      ]
    ])
    conn.scan.mockResolvedValue(['0', ['gone', 'k2']])
    const provider = makeProvider(conn)

    const res = await provider.backupDatabases({
      filePath: '/tmp/b.json',
      scope: { kind: 'database', databaseIndex: 0 },
      compress: false
    })

    expect(res.status).toBe('ok')
    if (res.status !== 'ok') return
    expect(res.keyCount).toBe(1)
    const parsed = JSON.parse(writtenData) as RedisBackupFile
    expect(parsed.databases[0].keys).toEqual([
      { key: 'k2', pttl: 1000, payload: buf2.toString('base64') }
    ])
  })

  it('backs up all databases, selecting each configured index', async () => {
    const conn = makeConn([])
    conn.scan.mockResolvedValue(['0', []]) // both databases empty
    const provider = makeProvider(conn)

    const res = await provider.backupDatabases({
      filePath: '/tmp/all.json',
      scope: { kind: 'all' },
      compress: false
    })

    expect(res.status).toBe('ok')
    if (res.status !== 'ok') return
    expect(res.databaseCount).toBe(2)
    expect(res.keyCount).toBe(0)
    expect(conn._selectCalls).toEqual([0, 1])
  })

  it('supports gzip compression of the output', async () => {
    const conn = makeConn([])
    conn.scan.mockResolvedValue(['0', []])
    const provider = makeProvider(conn)

    const res = await provider.backupDatabases({
      filePath: '/tmp/b.json.gz',
      scope: { kind: 'database', databaseIndex: 0 },
      compress: true
    })

    expect(res.status).toBe('ok')
    const parsed = JSON.parse(writtenData) as RedisBackupFile
    expect(parsed.spiralRedisBackup).toBe(1)
  })
})

// ─── Restore ────────────────────────────────────────────────────────────────

function backupOf(databases: RedisBackupFile['databases']): RedisBackupFile {
  return {
    spiralRedisBackup: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    source: { mode: 'standalone' },
    databases
  }
}

describe('RedisProvider.restoreDatabases', () => {
  it('restores keys with RESTORE ... REPLACE and maps TTL (-1 → 0)', async () => {
    const file = backupOf([
      {
        index: 2,
        keys: [
          { key: 'k1', pttl: -1, payload: Buffer.from([1]).toString('base64') },
          { key: 'k2', pttl: 1000, payload: Buffer.from([2]).toString('base64') }
        ]
      }
    ])
    readData = Buffer.from(JSON.stringify(file))
    const conn = makeConn([
      [
        [null, 'OK'],
        [null, 'OK']
      ]
    ])
    const provider = makeProvider(conn)

    const res = await provider.restoreDatabases({ filePath: '/tmp/b.json', conflict: 'replace' })

    expect(res.status).toBe('ok')
    if (res.status !== 'ok') return
    expect(res.keysRestored).toBe(2)
    expect(res.keysSkipped).toBe(0)
    expect(res.databaseCount).toBe(1)
    expect(conn._selectCalls).toEqual([2])
    expect(conn._ops).toEqual([
      ['restore', 'k1', 0, Buffer.from([1]), 'REPLACE'],
      ['restore', 'k2', 1000, Buffer.from([2]), 'REPLACE']
    ])
  })

  it('restores a single database into a chosen target index', async () => {
    const file = backupOf([
      { index: 2, keys: [{ key: 'k1', pttl: -1, payload: Buffer.from([1]).toString('base64') }] }
    ])
    readData = Buffer.from(JSON.stringify(file))
    const conn = makeConn([[[null, 'OK']]])
    const provider = makeProvider(conn)

    const res = await provider.restoreDatabases({
      filePath: '/tmp/b.json',
      conflict: 'replace',
      targetDatabaseIndex: 5
    })

    expect(res.status).toBe('ok')
    expect(conn._selectCalls).toEqual([5])
  })

  it('flushes the database first when conflict is "flush"', async () => {
    const file = backupOf([
      { index: 0, keys: [{ key: 'k1', pttl: -1, payload: Buffer.from([1]).toString('base64') }] }
    ])
    readData = Buffer.from(JSON.stringify(file))
    const conn = makeConn([[[null, 'OK']]])
    const provider = makeProvider(conn)

    const res = await provider.restoreDatabases({ filePath: '/tmp/b.json', conflict: 'flush' })

    expect(res.status).toBe('ok')
    expect(conn._flushdbCalls).toBe(1)
    // No REPLACE flag in flush mode
    expect(conn._ops).toEqual([['restore', 'k1', 0, Buffer.from([1])]])
  })

  it('counts BUSYKEY collisions as skipped when conflict is "skip"', async () => {
    const file = backupOf([
      {
        index: 0,
        keys: [
          { key: 'exists', pttl: -1, payload: Buffer.from([1]).toString('base64') },
          { key: 'fresh', pttl: -1, payload: Buffer.from([2]).toString('base64') }
        ]
      }
    ])
    readData = Buffer.from(JSON.stringify(file))
    const conn = makeConn([
      [
        [new Error('BUSYKEY Target key name already exists.'), null],
        [null, 'OK']
      ]
    ])
    const provider = makeProvider(conn)

    const res = await provider.restoreDatabases({ filePath: '/tmp/b.json', conflict: 'skip' })

    expect(res.status).toBe('ok')
    if (res.status !== 'ok') return
    expect(res.keysRestored).toBe(1)
    expect(res.keysSkipped).toBe(1)
  })

  it('keeps original indexes for a multi-database backup, ignoring targetDatabaseIndex', async () => {
    const file = backupOf([
      { index: 0, keys: [] },
      { index: 1, keys: [] }
    ])
    readData = Buffer.from(JSON.stringify(file))
    const conn = makeConn([])
    const provider = makeProvider(conn)

    const res = await provider.restoreDatabases({
      filePath: '/tmp/all.json',
      conflict: 'replace',
      targetDatabaseIndex: 9
    })

    expect(res.status).toBe('ok')
    if (res.status !== 'ok') return
    expect(res.databaseCount).toBe(2)
    expect(conn._selectCalls).toEqual([0, 1])
  })

  it('rejects a file that is not a Spiral Redis backup', async () => {
    readData = Buffer.from(JSON.stringify({ some: 'other', json: true }))
    const conn = makeConn([])
    const provider = makeProvider(conn)

    const res = await provider.restoreDatabases({ filePath: '/tmp/x.json', conflict: 'replace' })

    expect(res.status).toBe('error')
    if (res.status !== 'error') return
    expect(res.message).toMatch(/not a valid spiral redis backup/i)
  })

  it('rejects a file that is not valid JSON', async () => {
    readData = Buffer.from('this is not json')
    const conn = makeConn([])
    const provider = makeProvider(conn)

    const res = await provider.restoreDatabases({ filePath: '/tmp/x.json', conflict: 'replace' })

    expect(res.status).toBe('error')
  })

  it('propagates a non-BUSYKEY error during restore', async () => {
    const file = backupOf([
      { index: 0, keys: [{ key: 'k1', pttl: -1, payload: Buffer.from([1]).toString('base64') }] }
    ])
    readData = Buffer.from(JSON.stringify(file))
    const conn = makeConn([[[new Error('WRONGTYPE bad payload'), null]]])
    const provider = makeProvider(conn)

    const res = await provider.restoreDatabases({ filePath: '/tmp/b.json', conflict: 'skip' })

    expect(res.status).toBe('error')
    if (res.status !== 'error') return
    expect(res.message).toMatch(/WRONGTYPE/)
  })
})

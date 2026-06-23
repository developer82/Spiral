// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DatabaseManager } from '../DatabaseManager'
import type {
  DatabaseProvider,
  ExecuteRedisBackupResult,
  ExecuteRedisRestoreResult,
  ExplorerNode
} from '../types'

type SessionMap = Map<string, DatabaseProvider>
type CacheMap = Map<string, ExplorerNode[]>

function getSessions(manager: DatabaseManager): SessionMap {
  return (manager as unknown as { sessions: SessionMap }).sessions
}

function getCache(manager: DatabaseManager): CacheMap {
  return (manager as unknown as { eagerCache: CacheMap }).eagerCache
}

describe('DatabaseManager redis backup/restore routing', () => {
  let manager: DatabaseManager

  beforeEach(() => {
    manager = new DatabaseManager()
  })

  it('returns "Not connected" when no session exists', async () => {
    const res = await manager.redisBackup('missing', {
      filePath: '/tmp/x.json',
      scope: { kind: 'all' },
      compress: false
    })
    expect(res).toEqual({ status: 'error', message: 'Not connected' })
  })

  it('returns "Not supported" when the provider lacks backup support', async () => {
    getSessions(manager).set('conn', {} as DatabaseProvider)
    const res = await manager.redisBackup('conn', {
      filePath: '/tmp/x.json',
      scope: { kind: 'all' },
      compress: false
    })
    expect(res.status).toBe('error')
    if (res.status !== 'error') return
    expect(res.message).toMatch(/not supported/i)
  })

  it('delegates redisBackup to the provider', async () => {
    const okResult: ExecuteRedisBackupResult = {
      status: 'ok',
      filePath: '/tmp/x.json',
      durationMs: 1,
      bytes: 10,
      keyCount: 2,
      databaseCount: 1
    }
    const backupDatabases = vi.fn().mockResolvedValue(okResult)
    getSessions(manager).set('conn', { backupDatabases } as unknown as DatabaseProvider)

    const opts = {
      filePath: '/tmp/x.json',
      scope: { kind: 'database' as const, databaseIndex: 1 },
      compress: true
    }
    const res = await manager.redisBackup('conn', opts)

    expect(backupDatabases).toHaveBeenCalledWith(opts)
    expect(res).toBe(okResult)
  })

  it('delegates redisRestore and clears cached redis keyspaces on success', async () => {
    const okResult: ExecuteRedisRestoreResult = {
      status: 'ok',
      durationMs: 1,
      keysRestored: 3,
      keysSkipped: 0,
      databaseCount: 1
    }
    const restoreDatabases = vi.fn().mockResolvedValue(okResult)
    getSessions(manager).set('conn', { restoreDatabases } as unknown as DatabaseProvider)

    // Seed cache entries that should be invalidated for this connection only
    const cache = getCache(manager)
    cache.set('conn/redis-db:0', [])
    cache.set('conn/redis-prefix:0:users', [])
    cache.set('other/redis-db:0', [])

    const opts = { filePath: '/tmp/x.json', conflict: 'replace' as const }
    const res = await manager.redisRestore('conn', opts)

    expect(restoreDatabases).toHaveBeenCalledWith(opts)
    expect(res).toBe(okResult)
    expect(cache.has('conn/redis-db:0')).toBe(false)
    expect(cache.has('conn/redis-prefix:0:users')).toBe(false)
    // A different connection's cache must be left intact
    expect(cache.has('other/redis-db:0')).toBe(true)
  })

  it('does not clear the cache when restore fails', async () => {
    const restoreDatabases = vi.fn().mockResolvedValue({ status: 'error', message: 'bad file' })
    getSessions(manager).set('conn', { restoreDatabases } as unknown as DatabaseProvider)
    const cache = getCache(manager)
    cache.set('conn/redis-db:0', [])

    const res = await manager.redisRestore('conn', { filePath: '/tmp/x.json', conflict: 'replace' })

    expect(res.status).toBe('error')
    expect(cache.has('conn/redis-db:0')).toBe(true)
  })
})

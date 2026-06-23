import * as net from 'net'
import { createWriteStream, statSync } from 'fs'
import { readFile } from 'fs/promises'
import { createGzip, gunzipSync } from 'zlib'
import { Redis, Cluster } from 'ioredis'
import type { RedisOptions, ClusterOptions } from 'ioredis'
import { Client as SshClient } from 'ssh2'
import type { ConnectionRecord } from '../../store'
import { createSshTunnel } from './sshTunnel'
import type {
  DatabaseProvider,
  ExplorerNode,
  ExecuteQueryResult,
  QueryResultSet,
  GetTableSchemaResult,
  GetErdSchemaResult,
  GetForeignKeysResult,
  GetCheckConstraintsResult,
  GetTriggersResult,
  SaveTriggerParams,
  SaveTriggerResult,
  DeleteTriggerResult,
  GetIndexesResult,
  SaveIndexParams,
  SaveIndexResult,
  DeleteIndexResult,
  RebuildIndexResult,
  ReorganizeIndexResult,
  DisableIndexResult,
  GetViewsResult,
  SaveViewParams,
  SaveViewResult,
  DeleteViewResult,
  GetStoredProceduresResult,
  SaveStoredProcedureParams,
  SaveStoredProcedureResult,
  DeleteStoredProcedureResult,
  GetDataTypesResult,
  SaveDataTypeParams,
  SaveDataTypeResult,
  DeleteDataTypeResult,
  GetTableTypesResult,
  GetTableTypeResult,
  SaveTableTypeParams,
  SaveTableTypeResult,
  DeleteTableTypeResult,
  GetMemoryOptimizedTableTypesResult,
  GetMemoryOptimizedTableTypeResult,
  SaveMemoryOptimizedTableTypeParams,
  SaveMemoryOptimizedTableTypeResult,
  DeleteMemoryOptimizedTableTypeResult,
  GenerateScriptResult,
  ProviderCapabilities,
  DeleteRedisKeyResult,
  RedisDashboardResult,
  RedisDashboardCommand,
  RedisDashboardCommandResult,
  RedisDashboardSnapshot,
  RedisKeyType,
  RedisKeyEntry,
  GetRedisDbKeysResult,
  RedisKeyFullValue,
  GetRedisKeyValueResult,
  SaveRedisKeyParams,
  SaveRedisKeyResult,
  RedisAclUserDetails,
  SaveRedisAclUserParams,
  SaveRedisAclUserResult,
  DeleteRedisAclUserResult,
  RedisBackupOptions,
  RedisBackupScope,
  RedisBackupFile,
  RedisBackupDatabase,
  RedisBackupKeyEntry,
  ExecuteRedisBackupResult,
  RedisRestoreOptions,
  ExecuteRedisRestoreResult
} from '../types'

// ─── Constants ────────────────────────────────────────────────────────────────

const NOT_SUPPORTED: { status: 'error'; message: string } = {
  status: 'error',
  message: 'Not supported for Redis connections'
}

const SCAN_COUNT = 200
const MAX_PREFIX_KEYS = 500

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Parse a Redis command string into tokens, respecting double- and single-
 * quoted strings so values with spaces are passed as single arguments.
 */
function parseRedisTokens(cmd: string): string[] {
  const tokens: string[] = []
  let current = ''
  let inDoubleQuote = false
  let inSingleQuote = false

  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i]
    if (inDoubleQuote) {
      if (ch === '\\' && i + 1 < cmd.length) {
        current += cmd[++i]
      } else if (ch === '"') {
        inDoubleQuote = false
      } else {
        current += ch
      }
    } else if (inSingleQuote) {
      if (ch === "'") {
        inSingleQuote = false
      } else {
        current += ch
      }
    } else if (ch === '"') {
      inDoubleQuote = true
    } else if (ch === "'") {
      inSingleQuote = true
    } else if (ch === ' ' || ch === '\t') {
      if (current.length > 0) {
        tokens.push(current)
        current = ''
      }
    } else {
      current += ch
    }
  }
  if (current.length > 0) tokens.push(current)
  return tokens
}

/** Parse `"host1:port1,host2:port2"` into sentinel node objects. */
function parseSentinelNodes(raw: string): Array<{ host: string; port: number }> {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => {
      const colonIdx = s.lastIndexOf(':')
      if (colonIdx === -1) return { host: s, port: 26379 }
      const port = parseInt(s.slice(colonIdx + 1), 10)
      return { host: s.slice(0, colonIdx), port: isNaN(port) ? 26379 : port }
    })
}

/**
 * Normalise a raw ioredis command result into a `QueryResultSet`.
 * Handles strings, numbers, null, flat arrays, and object-style maps
 * (returned by HGETALL, CONFIG GET, etc.).
 */
function normalizeRedisResult(command: string, result: unknown): QueryResultSet {
  const cmd = command.toUpperCase()

  // SCAN / HSCAN / SSCAN / ZSCAN return [cursor, [items]]
  if (cmd === 'SCAN' || cmd === 'HSCAN' || cmd === 'SSCAN' || cmd === 'ZSCAN') {
    const [cursor, items] = result as [string, string[]]
    const rows = (items ?? []).map((v) => ({ key: v, cursor }))
    return { columns: ['key', 'cursor'], rows, rowCount: rows.length }
  }

  // CONFIG GET, HGETALL etc. return alternating key/value flat arrays or objects
  if (
    (cmd === 'HGETALL' || cmd === 'CONFIG' || cmd === 'XREAD' || cmd === 'CLIENT') &&
    Array.isArray(result)
  ) {
    const rows: Record<string, unknown>[] = []
    for (let i = 0; i + 1 < (result as string[]).length; i += 2) {
      rows.push({ field: (result as string[])[i], value: (result as string[])[i + 1] })
    }
    return { columns: ['field', 'value'], rows, rowCount: rows.length }
  }

  if (typeof result === 'object' && result !== null && !Array.isArray(result)) {
    const rows = Object.entries(result as Record<string, unknown>).map(([field, value]) => ({
      field,
      value: String(value)
    }))
    return { columns: ['field', 'value'], rows, rowCount: rows.length }
  }

  if (Array.isArray(result)) {
    const rows = (result as unknown[]).map((v) => ({ value: v === null ? '(nil)' : String(v) }))
    return { columns: ['value'], rows, rowCount: rows.length }
  }

  const value = result === null ? '(nil)' : String(result)
  return { columns: ['result'], rows: [{ result: value }], rowCount: 1 }
}

function formatRedisResultForShell(command: string, result: unknown): string {
  if (result === null) return '(nil)'
  if (typeof result === 'number') return String(result)

  const cmd = command.toUpperCase()

  if (cmd === 'SCAN' || cmd === 'HSCAN' || cmd === 'SSCAN' || cmd === 'ZSCAN') {
    const [cursor, items] = result as [string, string[]]
    const lines = [`(cursor) ${cursor}`, ...(items as string[]).map((v, i) => `${i + 1}) "${v}"`)]
    return lines.join('\r\n')
  }

  if (
    (cmd === 'HGETALL' || cmd === 'CONFIG' || cmd === 'XREAD' || cmd === 'CLIENT') &&
    Array.isArray(result) &&
    (result as unknown[]).length > 0
  ) {
    const lines: string[] = []
    const arr = result as string[]
    for (let i = 0; i + 1 < arr.length; i += 2) {
      lines.push(`${i + 1}) "${arr[i]}"`)
      lines.push(`${i + 2}) "${arr[i + 1]}"`)
    }
    return lines.join('\r\n')
  }

  if (Array.isArray(result)) {
    if ((result as unknown[]).length === 0) return '(empty array)'
    return (result as unknown[])
      .map((v, i) => `${i + 1}) ${v === null ? '(nil)' : `"${String(v)}"`}`)
      .join('\r\n')
  }

  if (typeof result === 'object') {
    const entries = Object.entries(result as Record<string, unknown>)
    return entries.map(([k, v], i) => `${i + 1}) "${k}" => "${String(v)}"`).join('\r\n')
  }

  return `"${String(result)}"`
}

// ─── Provider ─────────────────────────────────────────────────────────────────

/**
 * Redis database provider.
 *
 * Supports standalone, Cluster, and Sentinel deployment modes. Optionally
 * tunnels the connection through SSH (password or private-key auth). TLS/SSL
 * is available for all modes. ACL usernames (Redis 6+) are supported.
 *
 * The explorer tree shows Redis logical databases (DB 0–N) as top-level nodes.
 * Expanding a database performs a `SCAN`-based enumeration of keys, grouped by
 * colon-delimited prefix for readability. All relational capabilities are
 * disabled so SQL-centric UI surfaces (ERD, stored procedures, etc.) are
 * automatically hidden.
 */
export class RedisProvider implements DatabaseProvider {
  private client: Redis | Cluster | null = null
  private sshClient: SshClient | null = null
  private tunnelServer: net.Server | null = null
  private redisMode: 'standalone' | 'cluster' | 'sentinel' = 'standalone'
  private hideEmptyDatabases = false
  private connectionName: string | undefined

  // ── Connection ─────────────────────────────────────────────────────────────

  async connect(record: ConnectionRecord): Promise<void> {
    this.redisMode = record.redisMode ?? 'standalone'
    this.hideEmptyDatabases = record.redisHideEmptyDatabases ?? false
    this.connectionName = record.name
    const tls = this.buildTlsOptions(record)
    let connectHost = record.host || '127.0.0.1'
    let connectPort = record.port || 6379

    if (record.sshEnabled) {
      if (this.redisMode === 'cluster') {
        throw new Error(
          'SSH tunneling is not supported for Redis Cluster mode because cluster nodes ' +
            'communicate using their announced hostnames, which cannot be routed through a single tunnel.'
        )
      }
      const tunnel = await createSshTunnel(record, connectHost, connectPort)
      this.tunnelServer = tunnel.server
      this.sshClient = tunnel.sshClient
      connectHost = tunnel.host
      connectPort = tunnel.port
    }

    const commonOptions: RedisOptions = {
      username: record.username?.trim() || undefined,
      password: record.password?.trim() || undefined,
      tls: tls ?? undefined,
      connectTimeout: 10_000,
      commandTimeout: 30_000,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: (times) => (times >= 5 ? null : Math.min(times * 500, 3000))
    }

    try {
      if (this.redisMode === 'cluster') {
        const clusterOptions: ClusterOptions = {
          redisOptions: {
            ...commonOptions,
            lazyConnect: false
          },
          clusterRetryStrategy: (times) => (times >= 5 ? null : Math.min(times * 500, 3000))
        }
        this.client = new Cluster([{ host: connectHost, port: connectPort }], clusterOptions)
        // Cluster connects lazily on first command; issue PING to validate
        await (this.client as Cluster).ping()
      } else if (this.redisMode === 'sentinel') {
        const sentinelNodes = parseSentinelNodes(record.sentinelNodes ?? '')
        if (sentinelNodes.length === 0) {
          throw new Error('At least one sentinel node address is required')
        }
        const masterName = record.sentinelMasterName?.trim()
        if (!masterName) throw new Error('Sentinel master name is required')

        const dbIndex = parseInt(record.defaultDatabase ?? '0', 10)
        this.client = new Redis({
          ...commonOptions,
          sentinels: sentinelNodes,
          name: masterName,
          db: isNaN(dbIndex) ? 0 : dbIndex,
          lazyConnect: true
        })
        await (this.client as Redis).connect()
      } else {
        const dbIndex = parseInt(record.defaultDatabase ?? '0', 10)
        this.client = new Redis({
          ...commonOptions,
          host: connectHost,
          port: connectPort,
          db: isNaN(dbIndex) ? 0 : dbIndex,
          lazyConnect: true
        })
        await (this.client as Redis).connect()
      }
    } catch (err) {
      if (this.client) {
        this.client.disconnect()
        this.client = null
      }
      if (this.tunnelServer) {
        this.tunnelServer.close()
        this.tunnelServer = null
      }
      if (this.sshClient) {
        this.sshClient.end()
        this.sshClient = null
      }
      throw err
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.client) {
        await this.client.quit()
        this.client = null
      }
    } catch {
      // Ignore errors during quit — client may already be disconnected
    }
    if (this.tunnelServer) {
      await new Promise<void>((resolve) => this.tunnelServer!.close(() => resolve()))
      this.tunnelServer = null
    }
    if (this.sshClient) {
      this.sshClient.end()
      this.sshClient = null
    }
  }

  // ── Internal helpers ───────────────────────────────────────────────────────

  private get conn(): Redis | Cluster {
    if (!this.client) throw new Error('Not connected')
    return this.client
  }

  private buildTlsOptions(
    record: ConnectionRecord
  ): { servername?: string; rejectUnauthorized?: boolean } | null {
    if (!record.tlsEnabled) return null
    return {
      servername: record.tlsServername?.trim() || undefined,
      rejectUnauthorized: record.tlsRejectUnauthorized ?? true
    }
  }

  // ── Tree listing ───────────────────────────────────────────────────────────

  async listDatabases(_showSystemDatabases: boolean): Promise<ExplorerNode[]> {
    if (this.redisMode === 'cluster') {
      // Redis Cluster only supports database 0
      return [{ id: 'redis-db:0', label: '0', kind: 'redis-keyspace' as const }]
    }

    let dbCount = 16
    try {
      const result = await (this.conn as Redis).config('GET', 'databases')
      if (Array.isArray(result) && result.length === 2) {
        const parsed = parseInt(String(result[1]), 10)
        if (!isNaN(parsed)) dbCount = parsed
      }
    } catch {
      // Fall back to default 16 databases
    }

    const allDbs = Array.from({ length: dbCount }, (_, i) => ({
      id: `redis-db:${i}`,
      label: String(i),
      kind: 'redis-keyspace' as const
    }))

    if (!this.hideEmptyDatabases) {
      return allDbs
    }

    // Filter to only databases that contain at least one key
    const nonEmptyDbs: typeof allDbs = []
    for (let i = 0; i < dbCount; i++) {
      try {
        await (this.conn as Redis).select(i)
        const size = await (this.conn as Redis).dbsize()
        if (size > 0) {
          nonEmptyDbs.push(allDbs[i])
        }
      } catch {
        // If a per-DB check fails, include the DB so it is never silently hidden
        nonEmptyDbs.push(allDbs[i])
      }
    }
    return nonEmptyDbs
  }

  listCategories(_databaseName: string): ExplorerNode[] {
    return []
  }

  // ── Redis-specific tree methods ────────────────────────────────────────────

  async listRedisKeyPrefixes(databaseIndex: string): Promise<ExplorerNode[]> {
    const dbIndex = parseInt(databaseIndex, 10)
    if (isNaN(dbIndex)) return []

    // SELECT the target database (not supported in Cluster mode)
    if (this.redisMode !== 'cluster') {
      await (this.conn as Redis).select(dbIndex)
    }

    const prefixCounts = new Map<string, number>()
    const bareKeys: string[] = []
    let cursor = '0'

    do {
      const [nextCursor, keys] = await this.conn.scan(cursor, 'COUNT', SCAN_COUNT)
      cursor = nextCursor

      for (const key of keys) {
        const colonIdx = key.indexOf(':')
        if (colonIdx > 0) {
          const prefix = key.slice(0, colonIdx)
          prefixCounts.set(prefix, (prefixCounts.get(prefix) ?? 0) + 1)
        } else {
          bareKeys.push(key)
        }
      }

      if (prefixCounts.size + bareKeys.length >= MAX_PREFIX_KEYS) break
    } while (cursor !== '0')

    const nodes: ExplorerNode[] = []

    for (const [prefix, count] of [...prefixCounts.entries()].sort(([a], [b]) =>
      a.localeCompare(b)
    )) {
      nodes.push({
        id: `redis-prefix:${databaseIndex}:${prefix}`,
        label: `${prefix}: (${count})`,
        kind: 'redis-key-prefix' as const
      })
    }

    for (const key of bareKeys.sort()) {
      nodes.push({
        id: `redis-key:${databaseIndex}:${key}`,
        label: key,
        kind: 'redis-key' as const
      })
    }

    return nodes
  }

  async listRedisKeysForPrefix(databaseIndex: string, prefix: string): Promise<ExplorerNode[]> {
    const dbIndex = parseInt(databaseIndex, 10)
    if (isNaN(dbIndex)) return []

    if (this.redisMode !== 'cluster') {
      await (this.conn as Redis).select(dbIndex)
    }

    const matchPattern = `${prefix}:*`
    const keys: string[] = []
    let cursor = '0'

    do {
      const [nextCursor, batch] = await this.conn.scan(
        cursor,
        'MATCH',
        matchPattern,
        'COUNT',
        SCAN_COUNT
      )
      cursor = nextCursor
      keys.push(...batch)
      if (keys.length >= MAX_PREFIX_KEYS) break
    } while (cursor !== '0')

    return keys.sort().map((key) => ({
      id: `redis-key:${databaseIndex}:${key}`,
      label: key,
      kind: 'redis-key' as const
    }))
  }

  async deleteRedisKey(databaseIndex: string, keyName: string): Promise<DeleteRedisKeyResult> {
    try {
      const dbIndex = parseInt(databaseIndex, 10)
      if (isNaN(dbIndex)) return { status: 'error', message: 'Invalid database index' }
      if (this.redisMode !== 'cluster') {
        await (this.conn as Redis).select(dbIndex)
      }
      const count = await this.conn.del(keyName)
      return { status: 'ok', deletedCount: count }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async deleteRedisPrefix(databaseIndex: string, prefix: string): Promise<DeleteRedisKeyResult> {
    try {
      const dbIndex = parseInt(databaseIndex, 10)
      if (isNaN(dbIndex)) return { status: 'error', message: 'Invalid database index' }
      if (this.redisMode !== 'cluster') {
        await (this.conn as Redis).select(dbIndex)
      }
      const matchPattern = `${prefix}:*`
      const keys: string[] = []
      let cursor = '0'
      do {
        const [nextCursor, batch] = await this.conn.scan(cursor, 'MATCH', matchPattern, 'COUNT', SCAN_COUNT)
        cursor = nextCursor
        keys.push(...batch)
      } while (cursor !== '0')
      if (keys.length === 0) return { status: 'ok', deletedCount: 0 }
      const count = await this.conn.del(...keys)
      return { status: 'ok', deletedCount: count }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  // ── Redis Explorer methods ─────────────────────────────────────────────────

  async getRedisDbKeys(databaseIndex: string): Promise<GetRedisDbKeysResult> {
    try {
      const dbIndex = parseInt(databaseIndex, 10)
      if (isNaN(dbIndex)) return { status: 'error', message: 'Invalid database index' }
      if (this.redisMode !== 'cluster') {
        await (this.conn as Redis).select(dbIndex)
      }

      const allKeys: string[] = []
      let cursor = '0'
      do {
        const [nextCursor, batch] = await this.conn.scan(cursor, 'COUNT', 200)
        cursor = nextCursor
        allKeys.push(...batch)
      } while (cursor !== '0')

      const entries: RedisKeyEntry[] = []
      const BATCH = 50

      for (let i = 0; i < allKeys.length; i += BATCH) {
        const batchKeys = allKeys.slice(i, i + BATCH)

        // Pipeline 1: type + TTL for each key
        const metaPipeline = this.conn.pipeline()
        for (const key of batchKeys) {
          metaPipeline.type(key)
          metaPipeline.ttl(key)
        }
        const metaResults = await metaPipeline.exec()

        // Pipeline 2: memory usage (separate, errors per-key are acceptable)
        const memPipeline = this.conn.pipeline()
        for (const key of batchKeys) {
          ;(memPipeline as unknown as { memory: (...args: unknown[]) => unknown }).memory('usage', key, 'SAMPLES', 0)
        }
        const memResults = await memPipeline.exec()

        // Build type map, then pipeline 3: value previews
        const typeMap: RedisKeyType[] = []
        for (let j = 0; j < batchKeys.length; j++) {
          const typeResult = metaResults?.[j * 2]?.[1] as string
          typeMap.push((typeResult ?? 'unknown') as RedisKeyType)
        }

        const previewPipeline = this.conn.pipeline()
        for (let j = 0; j < batchKeys.length; j++) {
          switch (typeMap[j]) {
            case 'string': previewPipeline.getrange(batchKeys[j], 0, 99); break
            case 'list': previewPipeline.llen(batchKeys[j]); break
            case 'set': previewPipeline.scard(batchKeys[j]); break
            case 'zset': previewPipeline.zcard(batchKeys[j]); break
            case 'hash': previewPipeline.hlen(batchKeys[j]); break
            case 'stream': previewPipeline.xlen(batchKeys[j]); break
            default: previewPipeline.get(batchKeys[j]); break
          }
        }
        const previewResults = await previewPipeline.exec()

        for (let j = 0; j < batchKeys.length; j++) {
          const keyType = typeMap[j]
          const ttl = (metaResults?.[j * 2 + 1]?.[1] as number) ?? -1
          const sizeBytes = memResults?.[j]?.[0] ? null : ((memResults?.[j]?.[1] as number | null) ?? null)
          const previewRaw = previewResults?.[j]?.[1]
          let valuePreview = ''
          switch (keyType) {
            case 'string': valuePreview = String(previewRaw ?? ''); break
            case 'list': valuePreview = `${previewRaw ?? 0} items`; break
            case 'set': valuePreview = `${previewRaw ?? 0} members`; break
            case 'zset': valuePreview = `${previewRaw ?? 0} members`; break
            case 'hash': valuePreview = `${previewRaw ?? 0} fields`; break
            case 'stream': valuePreview = `${previewRaw ?? 0} entries`; break
            default: valuePreview = ''; break
          }
          entries.push({ keyName: batchKeys[j], type: keyType, ttl, sizeBytes, valuePreview })
        }
      }

      return { status: 'ok', dbIndex, keys: entries }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async getRedisKeyValue(databaseIndex: string, keyName: string): Promise<GetRedisKeyValueResult> {
    try {
      const dbIndex = parseInt(databaseIndex, 10)
      if (isNaN(dbIndex)) return { status: 'error', message: 'Invalid database index' }
      if (this.redisMode !== 'cluster') {
        await (this.conn as Redis).select(dbIndex)
      }

      const keyType = (await this.conn.type(keyName)) as RedisKeyType
      const ttl = await this.conn.ttl(keyName)

      let value: RedisKeyFullValue
      switch (keyType) {
        case 'string': {
          const val = await this.conn.get(keyName)
          value = { type: 'string', value: val ?? '' }
          break
        }
        case 'list': {
          const items = await this.conn.lrange(keyName, 0, 499)
          value = { type: 'list', items }
          break
        }
        case 'set': {
          const members: string[] = []
          let cur = '0'
          do {
            const [nextCur, batch] = await this.conn.sscan(keyName, cur, 'COUNT', 500)
            cur = nextCur
            members.push(...batch)
          } while (cur !== '0' && members.length < 500)
          value = { type: 'set', members }
          break
        }
        case 'zset': {
          const flat = await this.conn.zrange(keyName, 0, -1, 'WITHSCORES')
          const zMembers: Array<{ member: string; score: number }> = []
          for (let i = 0; i < flat.length; i += 2) {
            zMembers.push({ member: flat[i], score: parseFloat(flat[i + 1]) })
          }
          value = { type: 'zset', members: zMembers }
          break
        }
        case 'hash': {
          const raw = await this.conn.hgetall(keyName)
          const fields = Object.entries(raw ?? {}).map(([field, val]) => ({ field, value: val }))
          value = { type: 'hash', fields }
          break
        }
        case 'stream': {
          const entries = await this.conn.xrange(keyName, '-', '+', 'COUNT', 100)
          const totalLength = await this.conn.xlen(keyName)
          value = {
            type: 'stream',
            entries: entries.map(([id, fields]) => ({
              id,
              fields: Object.fromEntries(
                fields.reduce<[string, string][]>((acc, _, idx, arr) => {
                  if (idx % 2 === 0) acc.push([arr[idx], arr[idx + 1]])
                  return acc
                }, [])
              )
            })),
            totalLength
          }
          break
        }
        default:
          return { status: 'error', message: `Unsupported key type: ${keyType}` }
      }

      return { status: 'ok', keyName, type: keyType, ttl, value }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async saveRedisKey(databaseIndex: string, params: SaveRedisKeyParams): Promise<SaveRedisKeyResult> {
    try {
      const dbIndex = parseInt(databaseIndex, 10)
      if (isNaN(dbIndex)) return { status: 'error', message: 'Invalid database index' }
      if (this.redisMode !== 'cluster') {
        await (this.conn as Redis).select(dbIndex)
      }

      const { keyName, type, ttl, value } = params
      const pipeline = this.conn.pipeline()
      pipeline.del(keyName)

      switch (type) {
        case 'string':
          pipeline.set(keyName, (value as { type: 'string'; value: string }).value)
          break
        case 'list': {
          const items = (value as { type: 'list'; items: string[] }).items
          if (items.length > 0) pipeline.rpush(keyName, ...items)
          break
        }
        case 'set': {
          const members = (value as { type: 'set'; members: string[] }).members
          if (members.length > 0) pipeline.sadd(keyName, ...members)
          break
        }
        case 'zset': {
          const zMembers = (value as { type: 'zset'; members: Array<{ member: string; score: number }> }).members
          if (zMembers.length > 0) {
            const args: (string | number)[] = []
            for (const { score, member } of zMembers) { args.push(score, member) }
            pipeline.zadd(keyName, ...args)
          }
          break
        }
        case 'hash': {
          const fields = (value as { type: 'hash'; fields: Array<{ field: string; value: string }> }).fields
          if (fields.length > 0) {
            const args: string[] = []
            for (const { field, value: v } of fields) { args.push(field, v) }
            pipeline.hmset(keyName, ...args)
          }
          break
        }
        case 'stream':
          return { status: 'error', message: 'Stream entries are immutable' }
        default:
          return { status: 'error', message: `Unsupported key type: ${type}` }
      }

      await pipeline.exec()

      if (ttl >= 0) {
        await this.conn.expire(keyName, ttl)
      } else {
        await this.conn.persist(keyName)
      }

      return { status: 'ok' }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  // ── Backup & Restore ─────────────────────────────────────────────────────────

  /** Resolve which DB indexes a backup scope covers. Cluster supports DB 0 only. */
  private async resolveBackupDbIndexes(scope: RedisBackupScope): Promise<number[]> {
    if (scope.kind === 'database') return [scope.databaseIndex]
    if (this.redisMode === 'cluster') return [0]
    let dbCount = 16
    try {
      const result = await (this.conn as Redis).config('GET', 'databases')
      if (Array.isArray(result) && result.length === 2) {
        const parsed = parseInt(String(result[1]), 10)
        if (!isNaN(parsed)) dbCount = parsed
      }
    } catch {
      // Fall back to the default 16 databases
    }
    return Array.from({ length: dbCount }, (_, i) => i)
  }

  /**
   * Back up every key in the scoped database(s) using native DUMP serialization.
   * Each key is stored as base64 of its DUMP payload plus its remaining TTL in ms,
   * which makes the backup lossless across all value types (including streams).
   */
  async backupDatabases(opts: RedisBackupOptions): Promise<ExecuteRedisBackupResult> {
    const start = Date.now()
    try {
      const indexes = await this.resolveBackupDbIndexes(opts.scope)
      const databases: RedisBackupDatabase[] = []
      let keyCount = 0

      for (const idx of indexes) {
        if (this.redisMode !== 'cluster') await (this.conn as Redis).select(idx)

        // SCAN all keys in this database
        const allKeys: string[] = []
        let cursor = '0'
        do {
          const [nextCursor, batch] = await this.conn.scan(cursor, 'COUNT', SCAN_COUNT)
          cursor = nextCursor
          allKeys.push(...batch)
        } while (cursor !== '0')

        const keys: RedisBackupKeyEntry[] = []
        const BATCH = 50
        for (let i = 0; i < allKeys.length; i += BATCH) {
          const batchKeys = allKeys.slice(i, i + BATCH)
          const pipeline = this.conn.pipeline()
          for (const key of batchKeys) {
            // DUMP is binary — must use the Buffer variant or the payload corrupts
            ;(pipeline as unknown as { dumpBuffer: (key: string) => unknown }).dumpBuffer(key)
            pipeline.pttl(key)
          }
          const results = await pipeline.exec()
          for (let j = 0; j < batchKeys.length; j++) {
            const payloadBuf = results?.[j * 2]?.[1] as Buffer | null
            // Key may have been deleted/expired between SCAN and DUMP — skip it
            if (!payloadBuf) continue
            const pttl = (results?.[j * 2 + 1]?.[1] as number) ?? -1
            keys.push({ key: batchKeys[j], pttl, payload: payloadBuf.toString('base64') })
          }
        }

        keyCount += keys.length
        databases.push({ index: idx, keys })
      }

      const file: RedisBackupFile = {
        spiralRedisBackup: 1,
        createdAt: new Date().toISOString(),
        source: { connectionName: this.connectionName, mode: this.redisMode },
        databases
      }

      await this.writeBackupFile(opts.filePath, file, opts.compress)
      const bytes = statSync(opts.filePath).size
      return {
        status: 'ok',
        filePath: opts.filePath,
        durationMs: Date.now() - start,
        bytes,
        keyCount,
        databaseCount: databases.length
      }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  /** Write the backup file as JSON, optionally gzipped. */
  private writeBackupFile(
    filePath: string,
    file: RedisBackupFile,
    compress: boolean
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const json = JSON.stringify(file)
      const out = createWriteStream(filePath)
      out.on('error', reject)
      out.on('finish', () => resolve())
      if (compress) {
        const gz = createGzip()
        gz.on('error', reject)
        gz.pipe(out)
        gz.end(json)
      } else {
        out.end(json)
      }
    })
  }

  /** Read and parse a backup file (gunzipping when the path ends in .gz). */
  private async readBackupFile(filePath: string): Promise<RedisBackupFile | null> {
    const raw = await readFile(filePath)
    const text = (filePath.toLowerCase().endsWith('.gz') ? gunzipSync(raw) : raw).toString('utf8')
    try {
      return JSON.parse(text) as RedisBackupFile
    } catch {
      return null
    }
  }

  /**
   * Restore a Spiral Redis backup file using native RESTORE. The conflict mode
   * controls how pre-existing keys are handled: overwrite, flush-first, or skip.
   */
  async restoreDatabases(opts: RedisRestoreOptions): Promise<ExecuteRedisRestoreResult> {
    const start = Date.now()
    try {
      const file = await this.readBackupFile(opts.filePath)
      if (!file || file.spiralRedisBackup !== 1 || !Array.isArray(file.databases)) {
        return { status: 'error', message: 'Not a valid Spiral Redis backup file' }
      }

      const singleDb = file.databases.length === 1
      let keysRestored = 0
      let keysSkipped = 0

      for (const db of file.databases) {
        const targetIdx =
          singleDb && opts.targetDatabaseIndex != null ? opts.targetDatabaseIndex : db.index
        if (this.redisMode !== 'cluster') await (this.conn as Redis).select(targetIdx)
        if (opts.conflict === 'flush') await this.conn.flushdb()

        const BATCH = 50
        for (let i = 0; i < db.keys.length; i += BATCH) {
          const batch = db.keys.slice(i, i + BATCH)
          const pipeline = this.conn.pipeline()
          for (const entry of batch) {
            const ttl = entry.pttl < 0 ? 0 : entry.pttl
            const buf = Buffer.from(entry.payload, 'base64')
            if (opts.conflict === 'replace') {
              pipeline.restore(entry.key, ttl, buf, 'REPLACE')
            } else {
              pipeline.restore(entry.key, ttl, buf)
            }
          }
          const results = await pipeline.exec()
          for (let j = 0; j < batch.length; j++) {
            const err = results?.[j]?.[0] as Error | null
            if (err) {
              // BUSYKEY = key already exists; only tolerated in skip mode
              if (opts.conflict === 'skip' && /BUSYKEY/i.test(err.message)) {
                keysSkipped++
              } else {
                throw err
              }
            } else {
              keysRestored++
            }
          }
        }
      }

      return {
        status: 'ok',
        durationMs: Date.now() - start,
        keysRestored,
        keysSkipped,
        databaseCount: file.databases.length
      }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  // ── Query execution ────────────────────────────────────────────────────────

  async executeQuery(
    sql: string,
    _timeoutMs?: number,
    _withPlan?: boolean,
    _withStatistics?: boolean,
    databaseName?: string
  ): Promise<ExecuteQueryResult> {
    const start = Date.now()
    try {
      const trimmed = sql.trim()
      if (!trimmed) {
        return {
          status: 'ok',
          resultSets: [],
          messages: [],
          durationMs: 0
        }
      }

      // SELECT the appropriate database (not available in Cluster mode)
      if (databaseName !== undefined && this.redisMode !== 'cluster') {
        const dbIndex = parseInt(databaseName, 10)
        if (!isNaN(dbIndex)) {
          await (this.conn as Redis).select(dbIndex)
        }
      }

      const tokens = parseRedisTokens(trimmed)
      if (tokens.length === 0) {
        return { status: 'ok', resultSets: [], messages: [], durationMs: 0 }
      }

      const [command, ...args] = tokens
      const result = await (this.conn as unknown as Record<string, (...a: string[]) => Promise<unknown>>)[
        command.toLowerCase()
      ](...args)

      const resultSet = normalizeRedisResult(command, result)
      const durationMs = Date.now() - start

      return {
        status: 'ok',
        resultSets: [resultSet],
        messages: [],
        durationMs
      }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async executeMonitoringQuery<T>(_sql: string): Promise<T[]> {
    return []
  }

  // ── Capabilities ───────────────────────────────────────────────────────────

  getCapabilities(): ProviderCapabilities {
    return {
      executionPlan: { kind: 'none' },
      clientStatistics: { kind: 'none' },
      hasCreateDatabase: false,
      hasStoredProcedures: false,
      hasFunctions: false,
      hasUserDefinedTypes: false,
      hasTableTypes: false,
      hasMemoryOptimizedTableTypes: false,
      hasStatistics: false,
      hasIndexRebuild: false,
      hasIndexReorganize: false,
      hasIndexDisable: false,
      hasProfiler: false,
      hasCreateTable: false,
      hasBackupRestore: false
    }
  }

  // ── Relational stubs — not applicable to Redis ─────────────────────────────

  async listTables(_databaseName: string): Promise<ExplorerNode[]> { return [] }
  async listViews(_databaseName: string): Promise<ExplorerNode[]> { return [] }
  async listStoredProcedures(_databaseName: string): Promise<ExplorerNode[]> { return [] }
  async listFunctions(_databaseName: string): Promise<ExplorerNode[]> { return [] }
  async listTypes(_databaseName: string): Promise<ExplorerNode[]> { return [] }
  listTypeCategories(_databaseName: string): ExplorerNode[] { return [] }
  async listTypeDataTypes(_databaseName: string): Promise<ExplorerNode[]> { return [] }
  async listTypeTables(_databaseName: string): Promise<ExplorerNode[]> { return [] }
  async listTypeMemoryOptimizedTables(_databaseName: string): Promise<ExplorerNode[]> { return [] }
  listTableCategories(_databaseName: string, _tableIdentifier: string): ExplorerNode[] { return [] }
  async listColumns(_db: string, _schema: string, _table: string): Promise<ExplorerNode[]> { return [] }
  async listKeys(_db: string, _schema: string, _table: string): Promise<ExplorerNode[]> { return [] }
  async listConstraints(_db: string, _schema: string, _table: string): Promise<ExplorerNode[]> { return [] }
  async listTriggers(_db: string, _schema: string, _table: string): Promise<ExplorerNode[]> { return [] }
  async listIndexes(_db: string, _schema: string, _table: string): Promise<ExplorerNode[]> { return [] }
  async listStatistics(_db: string, _schema: string, _table: string): Promise<ExplorerNode[]> { return [] }
  async getTableSchema(_db: string, _schema: string, _table: string): Promise<GetTableSchemaResult> { return NOT_SUPPORTED }
  async getForeignKeys(_db: string, _schema: string, _table: string): Promise<GetForeignKeysResult> { return NOT_SUPPORTED }
  async getCheckConstraints(_db: string, _schema: string, _table: string): Promise<GetCheckConstraintsResult> { return NOT_SUPPORTED }
  async getTriggers(_db: string, _schema: string, _table: string): Promise<GetTriggersResult> { return NOT_SUPPORTED }
  async saveTrigger(_db: string, _params: SaveTriggerParams, _original?: string): Promise<SaveTriggerResult> { return NOT_SUPPORTED }
  async deleteTrigger(_db: string, _name: string, _schema: string): Promise<DeleteTriggerResult> { return NOT_SUPPORTED }
  async getIndexes(_db: string, _schema: string, _table: string): Promise<GetIndexesResult> { return NOT_SUPPORTED }
  async saveIndex(_db: string, _params: SaveIndexParams, _original?: string): Promise<SaveIndexResult> { return NOT_SUPPORTED }
  async deleteIndex(_db: string, _name: string, _schema: string, _table: string): Promise<DeleteIndexResult> { return NOT_SUPPORTED }
  async rebuildIndex(_db: string, _name: string, _schema: string, _table: string): Promise<RebuildIndexResult> { return NOT_SUPPORTED }
  async reorganizeIndex(_db: string, _name: string, _schema: string, _table: string): Promise<ReorganizeIndexResult> { return NOT_SUPPORTED }
  async disableIndex(_db: string, _name: string, _schema: string, _table: string): Promise<DisableIndexResult> { return NOT_SUPPORTED }
  async getErdSchema(_db: string): Promise<GetErdSchemaResult> { return NOT_SUPPORTED }
  async getViews(_db: string): Promise<GetViewsResult> { return NOT_SUPPORTED }
  async saveView(_db: string, _params: SaveViewParams, _original?: string): Promise<SaveViewResult> { return NOT_SUPPORTED }
  async deleteView(_db: string, _schema: string, _view: string): Promise<DeleteViewResult> { return NOT_SUPPORTED }
  async getStoredProcedures(_db: string): Promise<GetStoredProceduresResult> { return NOT_SUPPORTED }
  async saveStoredProcedure(_db: string, _params: SaveStoredProcedureParams, _original?: string): Promise<SaveStoredProcedureResult> { return NOT_SUPPORTED }
  async deleteStoredProcedure(_db: string, _schema: string, _proc: string): Promise<DeleteStoredProcedureResult> { return NOT_SUPPORTED }
  async getDataTypes(_db: string): Promise<GetDataTypesResult> { return { status: 'ok', dataTypes: [] } }
  async saveDataType(_db: string, _params: SaveDataTypeParams, _orig?: string, _origSchema?: string): Promise<SaveDataTypeResult> { return NOT_SUPPORTED }
  async deleteDataType(_db: string, _schema: string, _type: string): Promise<DeleteDataTypeResult> { return NOT_SUPPORTED }
  async getTableTypes(_db: string): Promise<GetTableTypesResult> { return { status: 'ok', tableTypes: [] } }
  async getTableType(_db: string, _schema: string, _type: string): Promise<GetTableTypeResult> { return NOT_SUPPORTED }
  async saveTableType(_db: string, _params: SaveTableTypeParams, _orig?: string, _origSchema?: string): Promise<SaveTableTypeResult> { return NOT_SUPPORTED }
  async deleteTableType(_db: string, _schema: string, _type: string): Promise<DeleteTableTypeResult> { return NOT_SUPPORTED }
  async getMemoryOptimizedTableTypes(_db: string): Promise<GetMemoryOptimizedTableTypesResult> { return { status: 'ok', tableTypes: [] } }
  async getMemoryOptimizedTableType(_db: string, _schema: string, _type: string): Promise<GetMemoryOptimizedTableTypeResult> { return NOT_SUPPORTED }
  async saveMemoryOptimizedTableType(_db: string, _params: SaveMemoryOptimizedTableTypeParams, _orig?: string, _origSchema?: string): Promise<SaveMemoryOptimizedTableTypeResult> { return NOT_SUPPORTED }
  async deleteMemoryOptimizedTableType(_db: string, _schema: string, _type: string): Promise<DeleteMemoryOptimizedTableTypeResult> { return NOT_SUPPORTED }
  async scriptTableCreate(_db: string, _schema: string, _table: string): Promise<GenerateScriptResult> { return NOT_SUPPORTED }
  async scriptTableAlter(_db: string, _schema: string, _table: string): Promise<GenerateScriptResult> { return NOT_SUPPORTED }
  async scriptTableDrop(_db: string, _schema: string, _table: string): Promise<GenerateScriptResult> { return NOT_SUPPORTED }
  async scriptViewCreate(_db: string, _schema: string, _view: string): Promise<GenerateScriptResult> { return NOT_SUPPORTED }
  async scriptViewAlter(_db: string, _schema: string, _view: string): Promise<GenerateScriptResult> { return NOT_SUPPORTED }
  async scriptViewDrop(_db: string, _schema: string, _view: string): Promise<GenerateScriptResult> { return NOT_SUPPORTED }
  async scriptStoredProcedureCreate(_db: string, _schema: string, _proc: string): Promise<GenerateScriptResult> { return NOT_SUPPORTED }
  async scriptStoredProcedureAlter(_db: string, _schema: string, _proc: string): Promise<GenerateScriptResult> { return NOT_SUPPORTED }
  async scriptStoredProcedureDrop(_db: string, _schema: string, _proc: string): Promise<GenerateScriptResult> { return NOT_SUPPORTED }
  async scriptSelectTopRows(_db: string, _schema: string, _table: string, _count: number): Promise<GenerateScriptResult> { return NOT_SUPPORTED }
  async scriptDropDatabase(_db: string): Promise<GenerateScriptResult> { return NOT_SUPPORTED }
  listServerSecurityCategories(): ExplorerNode[] {
    return [{ id: 'security:users', label: 'Users', kind: 'security-users-folder' as const }]
  }

  async listServerUsers(): Promise<ExplorerNode[]> {
    try {
      const usernames = await (this.conn as Redis).call('ACL', 'USERS') as string[]
      return usernames.map((name) => ({
        id: `security:users:${name}`,
        label: name,
        kind: 'security-user' as const
      }))
    } catch {
      // ACL not supported (Redis < 6 or ACL disabled)
      return []
    }
  }

  async getRedisAclUserDetails(username: string): Promise<RedisAclUserDetails | null> {
    try {
      const raw = await (this.conn as Redis).call('ACL', 'GETUSER', username) as unknown[]
      if (!raw) return null

      // ioredis returns alternating key-value pairs
      const map: Record<string, unknown> = {}
      for (let i = 0; i < raw.length - 1; i += 2) {
        map[raw[i] as string] = raw[i + 1]
      }

      const flags = Array.isArray(map['flags']) ? (map['flags'] as string[]) : []
      const enabled = flags.includes('on')
      const nopass = flags.includes('nopass')

      const commandsStr = typeof map['commands'] === 'string' ? map['commands'] : ''
      const allCommands = commandsStr.includes('+@all')
      const noCommands = commandsStr.startsWith('-@all') && !commandsStr.includes('+@')

      const categories: string[] = []
      if (!allCommands) {
        const catMatches = commandsStr.matchAll(/\+(@\w+)/g)
        for (const m of catMatches) {
          if (m[1] !== '@all') categories.push(m[1])
        }
      }

      // keys: Redis 6 returns a string, Redis 7 may return array
      const keysRaw = map['keys']
      const keysStr = Array.isArray(keysRaw) ? keysRaw.join(' ') : (typeof keysRaw === 'string' ? keysRaw : '')
      const allKeys = keysStr === '*' || keysStr.includes('~*')
      const noKeys = keysStr === '' && !allKeys
      const keyPatterns: string[] = []
      if (!allKeys && keysStr) {
        for (const part of keysStr.split(' ')) {
          const p = part.startsWith('~') ? part.slice(1) : part
          if (p) keyPatterns.push(p)
        }
      }

      const channelsRaw = map['channels']
      const channelsStr = Array.isArray(channelsRaw) ? channelsRaw.join(' ') : (typeof channelsRaw === 'string' ? channelsRaw : '')
      const allChannels = channelsStr === '*' || channelsStr.includes('&*')
      const noChannels = channelsStr === '' && !allChannels
      const channelPatterns: string[] = []
      if (!allChannels && channelsStr) {
        for (const part of channelsStr.split(' ')) {
          const p = part.startsWith('&') ? part.slice(1) : part
          if (p) channelPatterns.push(p)
        }
      }

      return {
        username,
        enabled,
        nopass,
        allCommands,
        noCommands,
        categories,
        allKeys,
        noKeys,
        keyPatterns,
        allChannels,
        noChannels,
        channelPatterns
      }
    } catch {
      return null
    }
  }

  async saveRedisAclUser(params: SaveRedisAclUserParams): Promise<SaveRedisAclUserResult> {
    try {
      const redis = this.conn as Redis
      const targetName = params.username.trim()

      const rules: string[] = ['reset', params.enabled ? 'on' : 'off']

      if (params.nopass) {
        rules.push('nopass')
      } else if (params.password) {
        rules.push(`>${params.password}`)
      }

      if (params.allCommands) {
        rules.push('+@all')
      } else {
        rules.push('-@all')
        for (const cat of params.categories) {
          rules.push(`+${cat}`)
        }
      }

      if (params.allKeys) {
        rules.push('allkeys')
      } else if (params.keyPatterns.length > 0) {
        for (const pat of params.keyPatterns) {
          rules.push(`~${pat}`)
        }
      } else {
        rules.push('nokeys')
      }

      if (params.allChannels) {
        rules.push('allchannels')
      } else if (params.channelPatterns.length > 0) {
        for (const pat of params.channelPatterns) {
          rules.push(`&${pat}`)
        }
      } else {
        rules.push('nochannels')
      }

      await redis.call('ACL', 'SETUSER', targetName, ...rules)

      // Rename: create with new name (done above) then delete old
      if (params.originalUsername && params.originalUsername !== targetName) {
        await redis.call('ACL', 'DELUSER', params.originalUsername)
      }

      return { status: 'ok' }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async deleteRedisAclUser(username: string): Promise<DeleteRedisAclUserResult> {
    try {
      await (this.conn as Redis).call('ACL', 'DELUSER', username)
      return { status: 'ok' }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async listServerRoles(): Promise<ExplorerNode[]> { return [] }
  async listServerSchemas(): Promise<ExplorerNode[]> { return [] }
  listDatabaseSecurityCategories(_databaseName: string): ExplorerNode[] { return [] }
  async listDatabaseUsers(_databaseName: string): Promise<ExplorerNode[]> { return [] }
  async listDatabaseRoles(_databaseName: string): Promise<ExplorerNode[]> { return [] }
  async listDatabaseSchemas(_databaseName: string): Promise<ExplorerNode[]> { return [] }

  // ─── Dashboard ──────────────────────────────────────────────────────────────

  private parseInfoText(infoText: string): {
    sections: Record<string, Record<string, string>>
    rawInfo: Array<{ section: string; key: string; value: string }>
  } {
    const sections: Record<string, Record<string, string>> = {}
    const rawInfo: Array<{ section: string; key: string; value: string }> = []
    let currentSection = 'default'
    for (const line of infoText.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed) continue
      if (trimmed.startsWith('# ')) {
        currentSection = trimmed.slice(2).toLowerCase().trim()
        continue
      }
      const colonIdx = trimmed.indexOf(':')
      if (colonIdx === -1) continue
      const key = trimmed.slice(0, colonIdx).trim()
      const value = trimmed.slice(colonIdx + 1).trim()
      if (!sections[currentSection]) sections[currentSection] = {}
      sections[currentSection][key] = value
      rawInfo.push({ section: currentSection, key, value })
    }
    return { sections, rawInfo }
  }

  private infoInt(val: string | undefined, fallback = 0): number {
    if (val === undefined || val === '') return fallback
    const parsed = parseInt(val, 10)
    return isNaN(parsed) ? fallback : parsed
  }

  private infoFloat(val: string | undefined): number | undefined {
    if (val === undefined || val === '') return undefined
    const parsed = parseFloat(val)
    return isNaN(parsed) ? undefined : parsed
  }

  private infoBool(val: string | undefined): boolean {
    return val === '1' || val === 'yes' || val === 'true'
  }

  async getRedisDashboard(): Promise<RedisDashboardResult> {
    try {
      const infoText = await (this.conn as Redis).info('all') as string
      const { sections, rawInfo } = this.parseInfoText(infoText)

      const serverS = sections['server'] ?? {}
      const memoryS = sections['memory'] ?? {}
      const statsS = sections['stats'] ?? {}
      const clientsS = sections['clients'] ?? {}
      const persistenceS = sections['persistence'] ?? {}
      const replicationS = sections['replication'] ?? {}
      const cpuS = sections['cpu'] ?? {}
      const keyspaceS = sections['keyspace'] ?? {}

      // Parse keyspaces from the keyspace INFO section
      const keyspaces: RedisDashboardSnapshot['keyspaces'] = []
      for (const [dbKey, dbVal] of Object.entries(keyspaceS)) {
        const dbMatch = dbKey.match(/^db(\d+)$/)
        if (!dbMatch) continue
        const dbIndex = parseInt(dbMatch[1], 10)
        const parts: Record<string, string> = {}
        for (const part of dbVal.split(',')) {
          const eqIdx = part.indexOf('=')
          if (eqIdx > -1) parts[part.slice(0, eqIdx).trim()] = part.slice(eqIdx + 1).trim()
        }
        keyspaces.push({
          dbIndex,
          keyCount: this.infoInt(parts['keys']),
          expiresCount: parts['expires'] !== undefined ? this.infoInt(parts['expires']) : undefined,
          avgTtl: parts['avg_ttl'] !== undefined ? this.infoInt(parts['avg_ttl']) : undefined
        })
      }
      keyspaces.sort((a, b) => a.dbIndex - b.dbIndex)

      // Parse command stats
      let commandStats: RedisDashboardSnapshot['commandStats']
      try {
        const cmdStatsText = await (this.conn as Redis).info('commandstats') as string
        const { sections: cmdSections } = this.parseInfoText(cmdStatsText)
        const cmdSection = cmdSections['commandstats'] ?? {}
        const arr: NonNullable<RedisDashboardSnapshot['commandStats']> = []
        for (const [cmdKey, cmdVal] of Object.entries(cmdSection)) {
          const cmdMatch = cmdKey.match(/^cmdstat_(.+)$/)
          if (!cmdMatch) continue
          const parts: Record<string, string> = {}
          for (const part of cmdVal.split(',')) {
            const eqIdx = part.indexOf('=')
            if (eqIdx > -1) parts[part.slice(0, eqIdx).trim()] = part.slice(eqIdx + 1).trim()
          }
          arr.push({
            command: cmdMatch[1].toUpperCase(),
            calls: this.infoInt(parts['calls']),
            usecTotal: this.infoInt(parts['usec']),
            usecPerCall: this.infoFloat(parts['usec_per_call']) ?? 0,
            rejectedCalls: parts['rejected_calls'] !== undefined ? this.infoInt(parts['rejected_calls']) : undefined,
            failedCalls: parts['failed_calls'] !== undefined ? this.infoInt(parts['failed_calls']) : undefined
          })
        }
        arr.sort((a, b) => b.calls - a.calls)
        if (arr.length > 0) commandStats = arr
      } catch {
        // Not critical
      }

      // Try to fetch CONFIG values for limits not exposed in INFO
      let maxMemoryConfig: string | undefined
      let maxMemoryPolicyConfig: string | undefined
      if (this.redisMode !== 'cluster') {
        try {
          const configResult = await (this.conn as Redis).config('GET', 'maxmemory', 'maxmemory-policy') as string[]
          for (let i = 0; i + 1 < configResult.length; i += 2) {
            if (configResult[i] === 'maxmemory') maxMemoryConfig = configResult[i + 1]
            if (configResult[i] === 'maxmemory-policy') maxMemoryPolicyConfig = configResult[i + 1]
          }
        } catch {
          // Not critical
        }
      }

      // Cluster topology nodes
      let clusterNodes: RedisDashboardSnapshot['replication']['nodes']
      if (this.redisMode === 'cluster') {
        try {
          const nodesText = await (this.conn as unknown as Record<string, (...a: string[]) => Promise<unknown>>)['cluster']('NODES') as string
          clusterNodes = []
          for (const line of nodesText.split('\n')) {
            const trimmed = line.trim()
            if (!trimmed) continue
            const parts = trimmed.split(' ')
            if (parts.length < 8) continue
            const [id, addrFull, flags, master, , , , linkState] = parts
            const addr = addrFull.split('@')[0]
            clusterNodes.push({
              id,
              addr,
              role: flags.includes('master') ? 'master' : flags.includes('slave') ? 'slave' : 'unknown',
              master: master !== '-' ? master : undefined,
              connected: linkState === 'connected',
              flags
            })
          }
        } catch {
          // Not critical
        }
      }

      const hits = this.infoInt(statsS['keyspace_hits'])
      const misses = this.infoInt(statsS['keyspace_misses'])
      const total = hits + misses
      const keyspaceHitRatio = total > 0 ? Math.round((hits / total) * 1000) / 10 : undefined

      const snapshot: RedisDashboardSnapshot = {
        fetchedAt: new Date().toISOString(),
        mode: this.redisMode,
        server: {
          redisVersion: serverS['redis_version'] ?? 'unknown',
          redisMode: serverS['redis_mode'] ?? this.redisMode,
          os: serverS['os'] ?? 'unknown',
          archBits: this.infoInt(serverS['arch_bits'], 64),
          processId: this.infoInt(serverS['process_id']),
          runId: serverS['run_id'] ?? '',
          tcpPort: this.infoInt(serverS['tcp_port'], 6379),
          uptimeInSeconds: this.infoInt(serverS['uptime_in_seconds']),
          uptimeInDays: this.infoInt(serverS['uptime_in_days']),
          hz: this.infoInt(serverS['hz'], 10),
          configuredHz: serverS['configured_hz'] !== undefined ? this.infoInt(serverS['configured_hz']) : undefined,
          executablePath: serverS['executable'] || undefined,
          configFile: serverS['config_file'] || undefined
        },
        memory: {
          usedMemoryBytes: this.infoInt(memoryS['used_memory']),
          usedMemoryHuman: memoryS['used_memory_human'] ?? '0B',
          usedMemoryRssBytes: memoryS['used_memory_rss'] !== undefined ? this.infoInt(memoryS['used_memory_rss']) : undefined,
          usedMemoryRssHuman: memoryS['used_memory_rss_human'] || undefined,
          usedMemoryPeakBytes: this.infoInt(memoryS['used_memory_peak']),
          usedMemoryPeakHuman: memoryS['used_memory_peak_human'] ?? '0B',
          usedMemoryPeakPercentage: memoryS['used_memory_peak_perc'] || undefined,
          usedMemoryLuaBytes: memoryS['used_memory_lua'] !== undefined ? this.infoInt(memoryS['used_memory_lua']) : undefined,
          usedMemoryLuaHuman: memoryS['used_memory_lua_human'] || undefined,
          maxMemoryBytes: memoryS['maxmemory'] !== undefined ? this.infoInt(memoryS['maxmemory'])
            : maxMemoryConfig !== undefined ? this.infoInt(maxMemoryConfig) : undefined,
          maxMemoryHuman: memoryS['maxmemory_human'] || undefined,
          maxMemoryPolicy: memoryS['maxmemory_policy'] || maxMemoryPolicyConfig || undefined,
          memFragmentationRatio: this.infoFloat(memoryS['mem_fragmentation_ratio']),
          memFragmentationBytes: memoryS['mem_fragmentation_bytes'] !== undefined ? this.infoInt(memoryS['mem_fragmentation_bytes']) : undefined,
          memAllocator: memoryS['mem_allocator'] || undefined
        },
        stats: {
          connectedClients: this.infoInt(clientsS['connected_clients']),
          blockedClients: this.infoInt(clientsS['blocked_clients']),
          totalConnectionsReceived: this.infoInt(statsS['total_connections_received']),
          totalCommandsProcessed: this.infoInt(statsS['total_commands_processed']),
          instantaneousOpsPerSec: this.infoInt(statsS['instantaneous_ops_per_sec']),
          totalNetInputBytes: statsS['total_net_input_bytes'] !== undefined ? this.infoInt(statsS['total_net_input_bytes']) : undefined,
          totalNetOutputBytes: statsS['total_net_output_bytes'] !== undefined ? this.infoInt(statsS['total_net_output_bytes']) : undefined,
          rejectedConnections: this.infoInt(statsS['rejected_connections']),
          expiredKeys: this.infoInt(statsS['expired_keys']),
          evictedKeys: this.infoInt(statsS['evicted_keys']),
          keyspaceHits: hits,
          keyspaceMisses: misses,
          keyspaceHitRatio,
          pubsubChannels: statsS['pubsub_channels'] !== undefined ? this.infoInt(statsS['pubsub_channels']) : undefined,
          pubsubPatterns: statsS['pubsub_patterns'] !== undefined ? this.infoInt(statsS['pubsub_patterns']) : undefined
        },
        persistence: {
          loading: this.infoBool(persistenceS['loading']),
          rdbChangesSinceLastSave: this.infoInt(persistenceS['rdb_changes_since_last_save']),
          rdbBgsaveInProgress: this.infoBool(persistenceS['rdb_bgsave_in_progress']),
          rdbLastBgsaveStatus: persistenceS['rdb_last_bgsave_status'] ?? 'unknown',
          rdbLastBgsaveTimeSec: persistenceS['rdb_last_bgsave_time_sec'] !== undefined ? this.infoInt(persistenceS['rdb_last_bgsave_time_sec']) : undefined,
          rdbCurrentBgsaveTimeSec: persistenceS['rdb_current_bgsave_time_sec'] !== undefined ? this.infoInt(persistenceS['rdb_current_bgsave_time_sec']) : undefined,
          rdbLastSaveTime: persistenceS['rdb_last_save_time'] !== undefined ? this.infoInt(persistenceS['rdb_last_save_time']) : undefined,
          aofEnabled: this.infoBool(persistenceS['aof_enabled']),
          aofRewriteInProgress: persistenceS['aof_rewrite_in_progress'] !== undefined ? this.infoBool(persistenceS['aof_rewrite_in_progress']) : undefined,
          aofRewriteScheduled: persistenceS['aof_rewrite_scheduled'] !== undefined ? this.infoBool(persistenceS['aof_rewrite_scheduled']) : undefined,
          aofCurrentSize: persistenceS['aof_current_size'] !== undefined ? this.infoInt(persistenceS['aof_current_size']) : undefined,
          aofBaseSize: persistenceS['aof_base_size'] !== undefined ? this.infoInt(persistenceS['aof_base_size']) : undefined,
          aofLastRewriteTimeSec: persistenceS['aof_last_rewrite_time_sec'] !== undefined ? this.infoInt(persistenceS['aof_last_rewrite_time_sec']) : undefined,
          aofLastBgrewriteStatus: persistenceS['aof_last_bgrewrite_status'] || undefined
        },
        replication: {
          role: replicationS['role'] ?? 'master',
          connectedSlaves: replicationS['connected_slaves'] !== undefined ? this.infoInt(replicationS['connected_slaves']) : undefined,
          masterHost: replicationS['master_host'] || undefined,
          masterPort: replicationS['master_port'] !== undefined ? this.infoInt(replicationS['master_port']) : undefined,
          masterLinkStatus: replicationS['master_link_status'] || undefined,
          masterLastIoSecondsAgo: replicationS['master_last_io_seconds_ago'] !== undefined ? this.infoInt(replicationS['master_last_io_seconds_ago']) : undefined,
          replicationId: replicationS['master_replid'] || replicationS['repl_id'] || undefined,
          replicationOffset: replicationS['master_repl_offset'] !== undefined ? this.infoInt(replicationS['master_repl_offset']) : undefined,
          nodes: clusterNodes
        },
        cpu: {
          usedCpuSys: this.infoFloat(cpuS['used_cpu_sys']),
          usedCpuUser: this.infoFloat(cpuS['used_cpu_user']),
          usedCpuSysChildren: this.infoFloat(cpuS['used_cpu_sys_children']),
          usedCpuUserChildren: this.infoFloat(cpuS['used_cpu_user_children'])
        },
        keyspaces,
        rawInfo,
        commandStats
      }

      return { status: 'ok', snapshot }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async executeRedisDashboardCommand(command: RedisDashboardCommand, databaseIndex?: number): Promise<RedisDashboardCommandResult> {
    try {
      const exec = this.conn as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>
      switch (command) {
        case 'BGSAVE': {
          const result = await (this.conn as Redis).bgsave()
          return { status: 'ok', message: String(result) }
        }
        case 'BGREWRITEAOF': {
          await (this.conn as Redis).bgrewriteaof()
          return { status: 'ok', message: 'Background AOF rewrite started' }
        }
        case 'MEMORY_PURGE': {
          if (this.redisMode === 'cluster') {
            return { status: 'error', message: 'MEMORY PURGE is not supported on Redis Cluster' }
          }
          await exec['memory']('PURGE')
          return { status: 'ok', message: 'Memory purge completed' }
        }
        case 'SLOWLOG_RESET': {
          await exec['slowlog']('RESET')
          return { status: 'ok', message: 'Slow log has been reset' }
        }
        case 'FLUSHDB': {
          if (this.redisMode !== 'cluster' && databaseIndex !== undefined) {
            await (this.conn as Redis).select(databaseIndex)
          }
          await exec['flushdb']('ASYNC')
          return { status: 'ok', message: 'Database flushed successfully' }
        }
        case 'FLUSHALL': {
          await exec['flushall']('ASYNC')
          return { status: 'ok', message: 'All databases flushed successfully' }
        }
        default:
          return { status: 'error', message: `Unknown command: ${command as string}` }
      }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async executeRedisShellCommand(
    command: string,
    databaseIndex: number
  ): Promise<{ status: 'ok' | 'error'; output: string }> {
    try {
      const trimmed = command.trim()
      if (!trimmed) return { status: 'ok', output: '' }

      if (this.redisMode !== 'cluster') {
        await (this.conn as Redis).select(databaseIndex)
      }

      const tokens = parseRedisTokens(trimmed)
      if (tokens.length === 0) return { status: 'ok', output: '' }

      const [cmd, ...args] = tokens
      const exec = this.conn as unknown as Record<string, (...a: string[]) => Promise<unknown>>
      const result = await exec[cmd.toLowerCase()](...args)

      return { status: 'ok', output: formatRedisResultForShell(cmd, result) }
    } catch (err) {
      return { status: 'error', output: err instanceof Error ? err.message : String(err) }
    }
  }
}

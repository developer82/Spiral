// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PostgresProvider } from '../PostgresProvider'
import type { ConnectionRecord } from '../../../store'

// ── pg mock ──────────────────────────────────────────────────────────────────
// Capture every config object passed to `new Pool(...)` so we can assert on the
// resolved `ssl` option.  `connectBehaviors` lets a test make the Nth created
// pool's `connect()` reject, which drives the allow/prefer fallback path.

const { poolConfigs, connectBehaviors } = vi.hoisted(() => ({
  poolConfigs: [] as Record<string, unknown>[],
  connectBehaviors: [] as ('ok' | 'fail')[]
}))

vi.mock('pg', () => ({
  Pool: vi.fn((config: Record<string, unknown>) => {
    const index = poolConfigs.length
    poolConfigs.push(config)
    return {
      connect: vi.fn(() =>
        (connectBehaviors[index] ?? 'ok') === 'fail'
          ? Promise.reject(new Error('server does not support SSL connections'))
          : Promise.resolve({
              query: vi.fn().mockResolvedValue({ rows: [], fields: [] }),
              release: vi.fn(),
              on: vi.fn()
            })
      ),
      query: vi.fn().mockResolvedValue({ rows: [], fields: [] }),
      end: vi.fn().mockResolvedValue(undefined)
    }
  })
}))

// ── fs mock ──────────────────────────────────────────────────────────────────

const { readFileSyncMock } = vi.hoisted(() => ({
  readFileSyncMock: vi.fn(() => '-----BEGIN CERTIFICATE-----\nCA\n-----END CERTIFICATE-----')
}))

vi.mock('node:fs', () => ({
  createReadStream: vi.fn(),
  createWriteStream: vi.fn(),
  readFileSync: readFileSyncMock,
  statSync: vi.fn(() => ({ size: 0 }))
}))

type SslOption =
  | false
  | { rejectUnauthorized: boolean; ca?: string; servername?: string; checkServerIdentity?: () => undefined }

function baseRecord(overrides: Partial<ConnectionRecord> = {}): ConnectionRecord {
  return {
    id: 'c1',
    name: 'Test',
    provider: 'postgres',
    host: 'pg.example.com',
    port: 5432,
    username: 'avnadmin',
    password: 's3cret',
    rememberPassword: false,
    defaultDatabase: 'defaultdb',
    ...overrides
  }
}

async function connectWith(overrides: Partial<ConnectionRecord> = {}): Promise<PostgresProvider> {
  const provider = new PostgresProvider()
  await provider.connect(baseRecord(overrides))
  return provider
}

/** The `ssl` option of the pool that successfully connected (the last one). */
function resolvedSsl(): SslOption {
  return poolConfigs[poolConfigs.length - 1].ssl as SslOption
}

beforeEach(() => {
  poolConfigs.length = 0
  connectBehaviors.length = 0
  readFileSyncMock.mockClear()
})

describe('PostgresProvider sslmode → pg ssl mapping', () => {
  it('disable → ssl: false (plaintext)', async () => {
    await connectWith({ postgresSslMode: 'disable' })
    expect(resolvedSsl()).toBe(false)
    expect(readFileSyncMock).not.toHaveBeenCalled()
  })

  it('require → encrypted with no certificate verification', async () => {
    await connectWith({ postgresSslMode: 'require' })
    expect(resolvedSsl()).toEqual({ rejectUnauthorized: false })
  })

  it('verify-ca → verifies the chain but skips the hostname check', async () => {
    await connectWith({ postgresSslMode: 'verify-ca' })
    const ssl = resolvedSsl() as Exclude<SslOption, false>
    expect(ssl.rejectUnauthorized).toBe(true)
    expect(typeof ssl.checkServerIdentity).toBe('function')
    expect(ssl.checkServerIdentity?.()).toBeUndefined()
  })

  it('verify-full → verifies the chain and the hostname (no identity override)', async () => {
    await connectWith({ postgresSslMode: 'verify-full' })
    const ssl = resolvedSsl() as Exclude<SslOption, false>
    expect(ssl.rejectUnauthorized).toBe(true)
    expect(ssl.checkServerIdentity).toBeUndefined()
  })

  it('loads the CA certificate from disk for verify modes', async () => {
    await connectWith({ postgresSslMode: 'verify-full', tlsCAFile: '/certs/aiven-ca.pem' })
    expect(readFileSyncMock).toHaveBeenCalledWith('/certs/aiven-ca.pem', 'utf8')
    const ssl = resolvedSsl() as Exclude<SslOption, false>
    expect(ssl.ca).toContain('BEGIN CERTIFICATE')
  })

  it('does not read a CA file for require (encrypt-only) mode', async () => {
    await connectWith({ postgresSslMode: 'require', tlsCAFile: '/certs/aiven-ca.pem' })
    expect(readFileSyncMock).not.toHaveBeenCalled()
  })

  it('sets the SNI server name override when provided', async () => {
    await connectWith({ postgresSslMode: 'require', tlsServername: 'sni.aivencloud.com' })
    const ssl = resolvedSsl() as Exclude<SslOption, false>
    expect(ssl.servername).toBe('sni.aivencloud.com')
  })
})

describe('PostgresProvider sslmode negotiation (allow / prefer)', () => {
  it('prefer → uses SSL when the first (encrypted) attempt succeeds', async () => {
    await connectWith({ postgresSslMode: 'prefer' })
    expect(poolConfigs).toHaveLength(1)
    expect(resolvedSsl()).toEqual({ rejectUnauthorized: false })
  })

  it('prefer → falls back to plaintext when the SSL attempt fails', async () => {
    connectBehaviors.push('fail') // first pool (SSL) rejects
    await connectWith({ postgresSslMode: 'prefer' })
    expect(poolConfigs).toHaveLength(2)
    expect(poolConfigs[0].ssl).toEqual({ rejectUnauthorized: false })
    expect(resolvedSsl()).toBe(false)
  })

  it('allow → uses plaintext first and only upgrades to SSL on failure', async () => {
    connectBehaviors.push('fail') // first pool (plaintext) rejects
    await connectWith({ postgresSslMode: 'allow' })
    expect(poolConfigs).toHaveLength(2)
    expect(poolConfigs[0].ssl).toBe(false)
    expect(resolvedSsl()).toEqual({ rejectUnauthorized: false })
  })

  it('propagates the error when every candidate fails', async () => {
    connectBehaviors.push('fail', 'fail')
    const provider = new PostgresProvider()
    await expect(provider.connect(baseRecord({ postgresSslMode: 'prefer' }))).rejects.toThrow(
      /does not support SSL/
    )
  })
})

describe('PostgresProvider SSL legacy fallback and pool reuse', () => {
  it('falls back to plaintext when neither sslmode nor tlsEnabled is set', async () => {
    await connectWith()
    expect(resolvedSsl()).toBe(false)
  })

  it('maps legacy tlsEnabled (validation on) to verify-full', async () => {
    await connectWith({ tlsEnabled: true, tlsCAFile: '/certs/ca.pem' })
    const ssl = resolvedSsl() as Exclude<SslOption, false>
    expect(ssl.rejectUnauthorized).toBe(true)
    expect(ssl.ca).toContain('BEGIN CERTIFICATE')
  })

  it('maps legacy tlsEnabled with validation off to require', async () => {
    await connectWith({ tlsEnabled: true, tlsRejectUnauthorized: false })
    expect(resolvedSsl()).toEqual({ rejectUnauthorized: false })
  })

  it('reuses the resolved SSL option for lazily-created per-database pools', async () => {
    const provider = await connectWith({ postgresSslMode: 'verify-full', tlsCAFile: '/certs/ca.pem' })
    poolConfigs.length = 0 // ignore the default pool
    await provider.listTables('other_db')
    expect(poolConfigs).toHaveLength(1)
    const ssl = poolConfigs[0].ssl as Exclude<SslOption, false>
    expect(ssl.rejectUnauthorized).toBe(true)
    expect(ssl.ca).toContain('BEGIN CERTIFICATE')
  })
})

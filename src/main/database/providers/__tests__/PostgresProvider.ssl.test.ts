// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PostgresProvider } from '../PostgresProvider'
import type { ConnectionRecord } from '../../../store'

// ── pg mock ──────────────────────────────────────────────────────────────────
// Capture every config object passed to `new Pool(...)` so we can assert on the
// resolved `ssl` option.

const { poolConfigs } = vi.hoisted(() => ({ poolConfigs: [] as Record<string, unknown>[] }))

vi.mock('pg', () => ({
  Pool: vi.fn((config: Record<string, unknown>) => {
    poolConfigs.push(config)
    return {
      connect: vi.fn().mockResolvedValue({
        query: vi.fn().mockResolvedValue({ rows: [], fields: [] }),
        release: vi.fn(),
        on: vi.fn()
      }),
      query: vi.fn().mockResolvedValue({ rows: [], fields: [] }),
      end: vi.fn()
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

type SslOption = false | { rejectUnauthorized: boolean; ca?: string; servername?: string }

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

/** The `ssl` option of the most recently constructed Pool. */
function lastSsl(): SslOption {
  return poolConfigs[poolConfigs.length - 1].ssl as SslOption
}

beforeEach(() => {
  poolConfigs.length = 0
  readFileSyncMock.mockClear()
})

describe('PostgresProvider SSL configuration', () => {
  it('disables SSL (ssl: false) when TLS is not enabled', async () => {
    await connectWith()
    expect(lastSsl()).toBe(false)
  })

  it('disables SSL when tlsEnabled is explicitly false', async () => {
    await connectWith({ tlsEnabled: false })
    expect(lastSsl()).toBe(false)
    expect(readFileSyncMock).not.toHaveBeenCalled()
  })

  it('enables SSL with certificate validation on by default when tlsEnabled is true', async () => {
    await connectWith({ tlsEnabled: true })
    expect(lastSsl()).toEqual({ rejectUnauthorized: true })
  })

  it('relaxes certificate validation when tlsRejectUnauthorized is false', async () => {
    await connectWith({ tlsEnabled: true, tlsRejectUnauthorized: false })
    expect(lastSsl()).toEqual({ rejectUnauthorized: false })
  })

  it('loads the CA certificate from disk when tlsCAFile is provided', async () => {
    await connectWith({ tlsEnabled: true, tlsCAFile: '/certs/aiven-ca.pem' })
    expect(readFileSyncMock).toHaveBeenCalledWith('/certs/aiven-ca.pem', 'utf8')
    const ssl = lastSsl() as Exclude<SslOption, false>
    expect(ssl.ca).toContain('BEGIN CERTIFICATE')
  })

  it('trims whitespace around the CA file path before reading', async () => {
    await connectWith({ tlsEnabled: true, tlsCAFile: '  /certs/aiven-ca.pem  ' })
    expect(readFileSyncMock).toHaveBeenCalledWith('/certs/aiven-ca.pem', 'utf8')
  })

  it('does not read a CA file when tlsCAFile is blank', async () => {
    await connectWith({ tlsEnabled: true, tlsCAFile: '   ' })
    expect(readFileSyncMock).not.toHaveBeenCalled()
    expect(lastSsl()).toEqual({ rejectUnauthorized: true })
  })

  it('sets the SNI server name override when tlsServername is provided', async () => {
    await connectWith({ tlsEnabled: true, tlsServername: 'sni.aivencloud.com' })
    const ssl = lastSsl() as Exclude<SslOption, false>
    expect(ssl.servername).toBe('sni.aivencloud.com')
  })

  it('applies the same SSL options to lazily-created per-database pools', async () => {
    const provider = await connectWith({ tlsEnabled: true, tlsCAFile: '/certs/aiven-ca.pem' })
    poolConfigs.length = 0 // ignore the default pool
    await provider.listTables('other_db')
    expect(poolConfigs).toHaveLength(1)
    const ssl = poolConfigs[0].ssl as Exclude<SslOption, false>
    expect(ssl.rejectUnauthorized).toBe(true)
    expect(ssl.ca).toContain('BEGIN CERTIFICATE')
  })
})

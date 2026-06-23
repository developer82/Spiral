// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MySqlProvider } from '../MySqlProvider'

// ── mysql2/promise mock ───────────────────────────────────────────────────────

const { mockConnection, mockPool, mockCreatePool } = vi.hoisted(() => {
  const mockConnection = {
    query: vi.fn(),
    release: vi.fn()
  }

  const mockPool = {
    getConnection: vi.fn().mockResolvedValue(mockConnection),
    end: vi.fn().mockResolvedValue(undefined)
  }

  const mockCreatePool = vi.fn().mockReturnValue(mockPool)

  return { mockConnection, mockPool, mockCreatePool }
})

vi.mock('mysql2/promise', () => ({
  createPool: mockCreatePool
}))

function resetConnection(): void {
  mockConnection.query.mockReset()
  mockConnection.release.mockReset()
  mockPool.getConnection.mockResolvedValue(mockConnection)
}

async function buildConnectedProvider(): Promise<MySqlProvider> {
  mockConnection.query.mockResolvedValue([[], []])
  const provider = new MySqlProvider()
  await provider.connect({
    id: 'test-id',
    name: 'Test',
    provider: 'mysql',
    host: 'localhost',
    port: 3306,
    username: 'root',
    password: 'password',
    rememberPassword: false,
    defaultDatabase: 'testdb'
  })
  resetConnection()
  return provider
}

// ── getMySqlUserList ──────────────────────────────────────────────────────────

describe('MySqlProvider.getMySqlUserList', () => {
  beforeEach(() => resetConnection())

  it('returns users from mysql.user table', async () => {
    const provider = await buildConnectedProvider()
    mockConnection.query.mockResolvedValueOnce([
      [
        { user: 'alice', host: '%' },
        { user: 'bob', host: 'localhost' }
      ],
      []
    ])

    const result = await provider.getMySqlUserList()

    expect(result).toEqual([
      { username: 'alice', host: '%' },
      { username: 'bob', host: 'localhost' }
    ])
    const [sql] = mockConnection.query.mock.calls[0] as [string]
    expect(sql).toContain('mysql.user')
  })

  it('returns empty array when no users exist', async () => {
    const provider = await buildConnectedProvider()
    mockConnection.query.mockResolvedValueOnce([[], []])

    const result = await provider.getMySqlUserList()
    expect(result).toEqual([])
  })
})

// ── getMySqlUserDetails ───────────────────────────────────────────────────────

describe('MySqlProvider.getMySqlUserDetails', () => {
  beforeEach(() => resetConnection())

  it('returns user details with correct field mapping', async () => {
    const provider = await buildConnectedProvider()
    mockConnection.query.mockResolvedValueOnce([
      [
        {
          user: 'alice',
          host: '%',
          plugin: 'mysql_native_password',
          account_locked: 'N',
          password_expired: 'N'
        }
      ],
      []
    ])

    const result = await provider.getMySqlUserDetails('alice', '%')

    expect(result).toEqual({
      username: 'alice',
      host: '%',
      plugin: 'mysql_native_password',
      accountLocked: false,
      passwordExpired: false
    })
  })

  it('maps account_locked Y to true', async () => {
    const provider = await buildConnectedProvider()
    mockConnection.query.mockResolvedValueOnce([
      [{ user: 'alice', host: '%', plugin: 'caching_sha2_password', account_locked: 'Y', password_expired: 'Y' }],
      []
    ])

    const result = await provider.getMySqlUserDetails('alice', '%')
    expect(result?.accountLocked).toBe(true)
    expect(result?.passwordExpired).toBe(true)
  })

  it('returns null when user not found', async () => {
    const provider = await buildConnectedProvider()
    mockConnection.query.mockResolvedValueOnce([[], []])

    const result = await provider.getMySqlUserDetails('ghost', 'localhost')
    expect(result).toBeNull()
  })
})

// ── getMySqlUserGlobalPrivileges ──────────────────────────────────────────────

describe('MySqlProvider.getMySqlUserGlobalPrivileges', () => {
  beforeEach(() => resetConnection())

  it('marks granted privileges as isGranted: true', async () => {
    const provider = await buildConnectedProvider()
    mockConnection.query.mockResolvedValueOnce([
      [{ PRIVILEGE_TYPE: 'SELECT' }, { PRIVILEGE_TYPE: 'INSERT' }],
      []
    ])

    const result = await provider.getMySqlUserGlobalPrivileges('alice', '%')

    const select = result.find((p) => p.privilege === 'SELECT')
    const insert = result.find((p) => p.privilege === 'INSERT')
    const drop = result.find((p) => p.privilege === 'DROP')

    expect(select?.isGranted).toBe(true)
    expect(insert?.isGranted).toBe(true)
    expect(drop?.isGranted).toBe(false)
  })

  it('passes correct grantee format to query', async () => {
    const provider = await buildConnectedProvider()
    mockConnection.query.mockResolvedValueOnce([[], []])

    await provider.getMySqlUserGlobalPrivileges('alice', 'localhost')

    const [, params] = mockConnection.query.mock.calls[0] as [string, string[]]
    expect(params[0]).toBe("'alice'@'localhost'")
  })
})

// ── getMySqlUserDatabasePrivileges ────────────────────────────────────────────

describe('MySqlProvider.getMySqlUserDatabasePrivileges', () => {
  beforeEach(() => resetConnection())

  it('groups privileges by database', async () => {
    const provider = await buildConnectedProvider()
    mockConnection.query.mockResolvedValueOnce([
      [
        { TABLE_SCHEMA: 'mydb', PRIVILEGE_TYPE: 'SELECT' },
        { TABLE_SCHEMA: 'mydb', PRIVILEGE_TYPE: 'INSERT' },
        { TABLE_SCHEMA: 'otherdb', PRIVILEGE_TYPE: 'SELECT' }
      ],
      []
    ])

    const result = await provider.getMySqlUserDatabasePrivileges('alice', '%')

    expect(result).toHaveLength(2)
    const mydb = result.find((d) => d.databaseName === 'mydb')
    expect(mydb?.privileges.find((p) => p.privilege === 'SELECT')?.isGranted).toBe(true)
    expect(mydb?.privileges.find((p) => p.privilege === 'INSERT')?.isGranted).toBe(true)
    expect(mydb?.privileges.find((p) => p.privilege === 'DROP')?.isGranted).toBe(false)
  })
})

// ── getMySqlDatabaseList ──────────────────────────────────────────────────────

describe('MySqlProvider.getMySqlDatabaseList', () => {
  beforeEach(() => resetConnection())

  it('filters out system databases', async () => {
    const provider = await buildConnectedProvider()
    mockConnection.query.mockResolvedValueOnce([
      [
        { Database: 'information_schema' },
        { Database: 'mysql' },
        { Database: 'myapp' },
        { Database: 'testdb' }
      ],
      []
    ])

    const result = await provider.getMySqlDatabaseList()
    expect(result).toEqual(['myapp', 'testdb'])
    expect(result).not.toContain('information_schema')
    expect(result).not.toContain('mysql')
  })
})

// ── deleteMySqlUser ───────────────────────────────────────────────────────────

describe('MySqlProvider.deleteMySqlUser', () => {
  beforeEach(() => resetConnection())

  it('issues DROP USER and FLUSH PRIVILEGES', async () => {
    const provider = await buildConnectedProvider()
    mockConnection.query.mockResolvedValue([[], []])

    const result = await provider.deleteMySqlUser('alice', '%')

    expect(result.status).toBe('ok')
    const calls = mockConnection.query.mock.calls.map((c) => (c[0] as string).trim())
    expect(calls.some((s) => s.includes('DROP USER'))).toBe(true)
    expect(calls.some((s) => s.includes('FLUSH PRIVILEGES'))).toBe(true)
  })

  it('returns error on database error', async () => {
    const provider = await buildConnectedProvider()
    mockConnection.query.mockRejectedValueOnce(new Error('Access denied'))

    const result = await provider.deleteMySqlUser('alice', '%')
    expect(result.status).toBe('error')
    expect((result as { status: 'error'; message: string }).message).toContain('Access denied')
  })
})

// ── saveMySqlUser — create ────────────────────────────────────────────────────

describe('MySqlProvider.saveMySqlUser — create', () => {
  beforeEach(() => resetConnection())

  it('issues CREATE USER with password for mysql_native_password', async () => {
    const provider = await buildConnectedProvider()
    mockConnection.query.mockResolvedValue([[], []])

    const result = await provider.saveMySqlUser({
      username: 'newuser',
      host: '%',
      plugin: 'mysql_native_password',
      password: 'secret',
      accountLocked: false,
      passwordExpired: false,
      globalPrivileges: ['SELECT'],
      databasePrivileges: []
    })

    expect(result.status).toBe('ok')
    const sqls = mockConnection.query.mock.calls.map((c) => (c[0] as string).trim())
    expect(sqls.some((s) => s.includes('CREATE USER'))).toBe(true)
    expect(sqls.some((s) => s.includes('FLUSH PRIVILEGES'))).toBe(true)
  })

  it('issues CREATE USER without BY clause for auth_socket', async () => {
    const provider = await buildConnectedProvider()
    mockConnection.query.mockResolvedValue([[], []])

    await provider.saveMySqlUser({
      username: 'svcuser',
      host: 'localhost',
      plugin: 'auth_socket',
      accountLocked: false,
      passwordExpired: false,
      globalPrivileges: [],
      databasePrivileges: []
    })

    const createCall = mockConnection.query.mock.calls.find((c) =>
      (c[0] as string).includes('CREATE USER')
    )
    expect(createCall).toBeDefined()
    expect((createCall![0] as string)).not.toContain('BY')
  })
})

// ── saveMySqlUser — edit ──────────────────────────────────────────────────────

describe('MySqlProvider.saveMySqlUser — edit', () => {
  beforeEach(() => resetConnection())

  it('issues RENAME USER when username changes', async () => {
    const provider = await buildConnectedProvider()
    mockConnection.query.mockResolvedValue([[], []])

    await provider.saveMySqlUser({
      originalUsername: 'olduser',
      originalHost: 'localhost',
      username: 'newuser',
      host: 'localhost',
      plugin: 'mysql_native_password',
      accountLocked: false,
      passwordExpired: false,
      globalPrivileges: [],
      databasePrivileges: []
    })

    const sqls = mockConnection.query.mock.calls.map((c) => (c[0] as string).trim())
    expect(sqls.some((s) => s.includes('RENAME USER'))).toBe(true)
  })

  it('does not issue RENAME USER when name unchanged', async () => {
    const provider = await buildConnectedProvider()
    mockConnection.query.mockResolvedValue([[], []])

    await provider.saveMySqlUser({
      originalUsername: 'alice',
      originalHost: '%',
      username: 'alice',
      host: '%',
      plugin: 'mysql_native_password',
      accountLocked: false,
      passwordExpired: false,
      globalPrivileges: [],
      databasePrivileges: []
    })

    const sqls = mockConnection.query.mock.calls.map((c) => (c[0] as string).trim())
    expect(sqls.some((s) => s.includes('RENAME USER'))).toBe(false)
  })
})

// ── saveMySqlDatabaseUserPrivileges ───────────────────────────────────────────

describe('MySqlProvider.saveMySqlDatabaseUserPrivileges', () => {
  beforeEach(() => resetConnection())

  it('revokes all then grants specified privileges', async () => {
    const provider = await buildConnectedProvider()
    mockConnection.query.mockResolvedValue([[], []])

    const result = await provider.saveMySqlDatabaseUserPrivileges({
      username: 'alice',
      host: '%',
      databaseName: 'mydb',
      privileges: ['SELECT', 'INSERT']
    })

    expect(result.status).toBe('ok')
    const sqls = mockConnection.query.mock.calls.map((c) => (c[0] as string).trim())
    expect(sqls.some((s) => s.includes('REVOKE ALL PRIVILEGES'))).toBe(true)
    expect(sqls.some((s) => s.includes('GRANT'))).toBe(true)
    expect(sqls.some((s) => s.includes('FLUSH PRIVILEGES'))).toBe(true)
  })

  it('revokes all without granting when privileges array is empty', async () => {
    const provider = await buildConnectedProvider()
    mockConnection.query.mockResolvedValue([[], []])

    const result = await provider.saveMySqlDatabaseUserPrivileges({
      username: 'alice',
      host: '%',
      databaseName: 'mydb',
      privileges: []
    })

    expect(result.status).toBe('ok')
    const sqls = mockConnection.query.mock.calls.map((c) => (c[0] as string).trim())
    expect(sqls.some((s) => s.includes('REVOKE ALL PRIVILEGES'))).toBe(true)
    expect(sqls.some((s) => s.includes('GRANT'))).toBe(false)
  })

  it('returns error on database error', async () => {
    const provider = await buildConnectedProvider()
    mockConnection.query.mockRejectedValueOnce(new Error('Table access denied'))

    const result = await provider.saveMySqlDatabaseUserPrivileges({
      username: 'alice',
      host: '%',
      databaseName: 'mydb',
      privileges: ['SELECT']
    })

    expect(result.status).toBe('error')
    expect((result as { status: 'error'; message: string }).message).toContain('Table access denied')
  })
})

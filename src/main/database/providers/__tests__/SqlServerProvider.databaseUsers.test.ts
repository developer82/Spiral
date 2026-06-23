// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SqlServerProvider } from '../SqlServerProvider'

// ── mssql mock ────────────────────────────────────────────────────────────────

const { mockPool, mockRequestChain, mockConnectionPool, mockQuery } = vi.hoisted(() => {
  const mockQuery = vi.fn()

  const mockRequestChain = {
    input: vi.fn().mockReturnThis() as (..._args: unknown[]) => typeof mockRequestChain,
    on: vi.fn(),
    query: mockQuery
  }

  const mockPool = {
    request: vi.fn(() => mockRequestChain as typeof mockRequestChain),
    close: vi.fn()
  }

  const mockConnectionPool = vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(mockPool)
  }))

  return { mockPool, mockRequestChain, mockConnectionPool, mockQuery }
})

vi.mock('mssql', () => ({
  ConnectionPool: mockConnectionPool,
  NVarChar: 'NVarChar'
}))

// ── helpers ───────────────────────────────────────────────────────────────────

function resetRequestChain(): void {
  mockRequestChain.input = vi.fn().mockReturnThis() as typeof mockRequestChain.input
  mockRequestChain.on = vi.fn()
  mockQuery.mockReset()
  mockRequestChain.query = mockQuery
  mockPool.request.mockReturnValue(mockRequestChain)
}

async function buildConnectedProvider(): Promise<SqlServerProvider> {
  const provider = new SqlServerProvider()
  await provider.connect({
    id: 'test-id',
    name: 'Test',
    provider: 'sqlserver',
    host: 'localhost',
    port: 1433,
    username: 'sa',
    password: 'pw',
    rememberPassword: false,
    defaultDatabase: 'master'
  })
  return provider
}

// ── getDatabaseUserDetails ────────────────────────────────────────────────────

describe('SqlServerProvider.getDatabaseUserDetails', () => {
  beforeEach(() => resetRequestChain())

  it('returns null when no rows returned', async () => {
    mockQuery.mockResolvedValue({ recordset: [] })
    const provider = await buildConnectedProvider()
    const result = await provider.getDatabaseUserDetails('MyDB', 'nonexistent')
    expect(result).toBeNull()
  })

  it('maps a SQL user with a server login', async () => {
    mockQuery.mockResolvedValue({
      recordset: [
        {
          name: 'appuser',
          type: 'S',
          default_schema_name: 'dbo',
          login_name: 'appLogin'
        }
      ]
    })
    const provider = await buildConnectedProvider()
    const result = await provider.getDatabaseUserDetails('MyDB', 'appuser')
    expect(result).toEqual({
      name: 'appuser',
      type: 'S',
      loginName: 'appLogin',
      defaultSchema: 'dbo'
    })
  })

  it('maps loginName to null for a no-login user', async () => {
    mockQuery.mockResolvedValue({
      recordset: [
        {
          name: 'nologinuser',
          type: 'S',
          default_schema_name: 'reporting',
          login_name: null
        }
      ]
    })
    const provider = await buildConnectedProvider()
    const result = await provider.getDatabaseUserDetails('MyDB', 'nologinuser')
    expect(result?.loginName).toBeNull()
    expect(result?.defaultSchema).toBe('reporting')
  })

  it('trims whitespace from type code', async () => {
    mockQuery.mockResolvedValue({
      recordset: [
        {
          name: 'winuser',
          type: 'U ',
          default_schema_name: 'dbo',
          login_name: 'DOMAIN\\winuser'
        }
      ]
    })
    const provider = await buildConnectedProvider()
    const result = await provider.getDatabaseUserDetails('MyDB', 'winuser')
    expect(result?.type).toBe('U')
  })

  it('rejects invalid database names', async () => {
    const provider = await buildConnectedProvider()
    await expect(provider.getDatabaseUserDetails('My[DB]', 'user')).rejects.toThrow()
  })
})

// ── getDatabaseUserRoles ──────────────────────────────────────────────────────

describe('SqlServerProvider.getDatabaseUserRoles', () => {
  beforeEach(() => resetRequestChain())

  it('returns empty array when no roles exist', async () => {
    mockQuery.mockResolvedValue({ recordset: [] })
    const provider = await buildConnectedProvider()
    const result = await provider.getDatabaseUserRoles('MyDB', 'user1')
    expect(result).toEqual([])
  })

  it('maps isMember 1 to true and 0 to false', async () => {
    mockQuery.mockResolvedValue({
      recordset: [
        { roleName: 'db_datareader', isMember: 1 },
        { roleName: 'db_datawriter', isMember: 0 },
        { roleName: 'public', isMember: 1 }
      ]
    })
    const provider = await buildConnectedProvider()
    const result = await provider.getDatabaseUserRoles('MyDB', 'user1')
    expect(result).toEqual([
      { roleName: 'db_datareader', isMember: true },
      { roleName: 'db_datawriter', isMember: false },
      { roleName: 'public', isMember: true }
    ])
  })
})

// ── saveDatabaseUser — create ─────────────────────────────────────────────────

describe('SqlServerProvider.saveDatabaseUser — create', () => {
  beforeEach(() => resetRequestChain())

  it('creates a SQL user with FOR LOGIN syntax', async () => {
    const capturedSqls: string[] = []
    mockQuery.mockImplementation((sql: string) => {
      capturedSqls.push(sql)
      return Promise.resolve({ recordsets: [], rowsAffected: [0] })
    })
    // getDatabaseUserRoles call returns empty (for role reconciliation)
    mockQuery.mockImplementation((sql: string) => {
      capturedSqls.push(sql)
      return Promise.resolve({ recordset: [], recordsets: [], rowsAffected: [0] })
    })

    const provider = await buildConnectedProvider()
    const result = await provider.saveDatabaseUser({
      databaseName: 'MyDB',
      userName: 'newuser',
      userType: 'sql',
      loginName: 'myLogin',
      defaultSchema: 'dbo',
      roles: []
    })

    expect(result.status).toBe('ok')
    const createSql = capturedSqls.find((s) => s.includes('CREATE USER'))
    expect(createSql).toBeDefined()
    expect(createSql).toContain('FOR LOGIN')
    expect(createSql).toContain('[myLogin]')
    expect(createSql).toContain('[dbo]')
    expect(createSql).toContain('USE [MyDB]')
  })

  it('creates a no-login user with WITHOUT LOGIN syntax', async () => {
    const capturedSqls: string[] = []
    mockQuery.mockImplementation((sql: string) => {
      capturedSqls.push(sql)
      return Promise.resolve({ recordset: [], recordsets: [], rowsAffected: [0] })
    })

    const provider = await buildConnectedProvider()
    const result = await provider.saveDatabaseUser({
      databaseName: 'MyDB',
      userName: 'reportuser',
      userType: 'nologin',
      defaultSchema: 'reporting',
      roles: []
    })

    expect(result.status).toBe('ok')
    const createSql = capturedSqls.find((s) => s.includes('CREATE USER'))
    expect(createSql).toContain('WITHOUT LOGIN')
    expect(createSql).not.toContain('FOR LOGIN')
  })

  it('assigns roles after create', async () => {
    const capturedSqls: string[] = []
    let callCount = 0
    mockQuery.mockImplementation((sql: string) => {
      capturedSqls.push(sql)
      callCount++
      // On the getDatabaseUserRoles call (after CREATE), return empty
      return Promise.resolve({ recordset: [], recordsets: [], rowsAffected: [0] })
    })

    const provider = await buildConnectedProvider()
    await provider.saveDatabaseUser({
      databaseName: 'MyDB',
      userName: 'newuser',
      userType: 'sql',
      loginName: 'myLogin',
      defaultSchema: 'dbo',
      roles: ['db_datareader', 'db_datawriter']
    })

    const addRoleSqls = capturedSqls.filter((s) => s.includes('ADD MEMBER'))
    expect(addRoleSqls).toHaveLength(2)
    expect(addRoleSqls.some((s) => s.includes('[db_datareader]'))).toBe(true)
    expect(addRoleSqls.some((s) => s.includes('[db_datawriter]'))).toBe(true)
  })

  it('returns error when CREATE USER fails', async () => {
    mockQuery.mockResolvedValue({ recordsets: [{ message: 'User already exists.' }], rowsAffected: [0] })
    // Simulate executeQuery returning error status
    mockQuery.mockImplementationOnce(() => {
      throw new Error('User already exists.')
    })

    const provider = await buildConnectedProvider()
    const result = await provider.saveDatabaseUser({
      databaseName: 'MyDB',
      userName: 'existinguser',
      userType: 'sql',
      loginName: 'someLogin',
      defaultSchema: 'dbo',
      roles: []
    })

    expect(result.status).toBe('error')
    expect((result as { status: 'error'; message: string }).message).toContain('User already exists')
  })
})

// ── saveDatabaseUser — edit ───────────────────────────────────────────────────

describe('SqlServerProvider.saveDatabaseUser — edit', () => {
  beforeEach(() => resetRequestChain())

  it('issues ALTER USER WITH NAME before schema change when name differs', async () => {
    const capturedSqls: string[] = []
    mockQuery.mockImplementation((sql: string) => {
      capturedSqls.push(sql)
      return Promise.resolve({ recordset: [], recordsets: [], rowsAffected: [0] })
    })

    const provider = await buildConnectedProvider()
    await provider.saveDatabaseUser({
      databaseName: 'MyDB',
      originalUserName: 'olduser',
      userName: 'newuser',
      userType: 'sql',
      loginName: 'myLogin',
      defaultSchema: 'dbo',
      roles: []
    })

    const renameSqlIndex = capturedSqls.findIndex((s) => s.includes('WITH NAME'))
    const schemaSqlIndex = capturedSqls.findIndex((s) => s.includes('DEFAULT_SCHEMA'))
    expect(renameSqlIndex).toBeGreaterThanOrEqual(0)
    expect(schemaSqlIndex).toBeGreaterThan(renameSqlIndex)
  })

  it('does not issue rename when name unchanged', async () => {
    const capturedSqls: string[] = []
    mockQuery.mockImplementation((sql: string) => {
      capturedSqls.push(sql)
      return Promise.resolve({ recordset: [], recordsets: [], rowsAffected: [0] })
    })

    const provider = await buildConnectedProvider()
    await provider.saveDatabaseUser({
      databaseName: 'MyDB',
      originalUserName: 'sameuser',
      userName: 'sameuser',
      userType: 'sql',
      loginName: 'myLogin',
      defaultSchema: 'dbo',
      roles: []
    })

    expect(capturedSqls.some((s) => s.includes('WITH NAME'))).toBe(false)
    expect(capturedSqls.some((s) => s.includes('DEFAULT_SCHEMA'))).toBe(true)
  })

  it('drops extra roles not in desired set', async () => {
    const capturedSqls: string[] = []
    let callIdx = 0
    mockQuery.mockImplementation((sql: string) => {
      capturedSqls.push(sql)
      callIdx++
      // Second call is getDatabaseUserRoles — return db_datareader as currently assigned
      if (sql.includes('database_role_members') || sql.includes('r.type = \'R\'')) {
        return Promise.resolve({
          recordset: [
            { roleName: 'db_datareader', isMember: 1 },
            { roleName: 'db_datawriter', isMember: 1 }
          ],
          recordsets: [],
          rowsAffected: [0]
        })
      }
      return Promise.resolve({ recordset: [], recordsets: [], rowsAffected: [0] })
    })

    const provider = await buildConnectedProvider()
    await provider.saveDatabaseUser({
      databaseName: 'MyDB',
      originalUserName: 'myuser',
      userName: 'myuser',
      userType: 'sql',
      loginName: 'myLogin',
      defaultSchema: 'dbo',
      roles: ['db_datareader'] // only keep datareader; drop datawriter
    })

    const dropSqls = capturedSqls.filter((s) => s.includes('DROP MEMBER'))
    expect(dropSqls.some((s) => s.includes('[db_datawriter]'))).toBe(true)
    const addSqls = capturedSqls.filter((s) => s.includes('ADD MEMBER'))
    expect(addSqls).toHaveLength(0)
  })
})

// ── deleteDatabaseUser ────────────────────────────────────────────────────────

describe('SqlServerProvider.deleteDatabaseUser', () => {
  beforeEach(() => resetRequestChain())

  it('executes DROP USER in correct database context', async () => {
    const capturedSqls: string[] = []
    mockQuery.mockImplementation((sql: string) => {
      capturedSqls.push(sql)
      return Promise.resolve({ recordsets: [], rowsAffected: [0] })
    })

    const provider = await buildConnectedProvider()
    const result = await provider.deleteDatabaseUser('MyDB', 'appuser')

    expect(result.status).toBe('ok')
    expect(capturedSqls[0]).toContain('USE [MyDB]')
    expect(capturedSqls[0]).toContain('DROP USER [appuser]')
  })

  it('returns error when DROP USER fails', async () => {
    mockQuery.mockImplementationOnce(() => {
      throw new Error('Cannot drop the user, because it does not exist.')
    })

    const provider = await buildConnectedProvider()
    const result = await provider.deleteDatabaseUser('MyDB', 'ghost')

    expect(result.status).toBe('error')
    expect((result as { status: 'error'; message: string }).message).toContain('does not exist')
  })

  it('returns error for invalid database names', async () => {
    const provider = await buildConnectedProvider()
    const result = await provider.deleteDatabaseUser("My'DB", 'user')
    expect(result.status).toBe('error')
  })
})

import { describe, it, expect } from 'vitest'
import { buildQueryContext } from '../queryContextUtils'
import type { QueryTab } from '../../explorer.types'
import type { ConnectionRecord } from '../../connections.types'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeConnection(overrides: Partial<ConnectionRecord> = {}): ConnectionRecord {
  return {
    id: 'conn-1',
    name: 'Dev DB',
    provider: 'sqlserver',
    host: 'localhost',
    port: 1433,
    username: 'sa',
    password: '',
    rememberPassword: false,
    defaultDatabase: 'master',
    ...overrides
  }
}

function makeTab(overrides: Partial<QueryTab> = {}): QueryTab {
  return {
    id: 'tab-1',
    kind: 'query',
    title: 'Unnamed',
    content: '',
    isDirty: false,
    connectionId: 'conn-1',
    ...overrides
  }
}

// ── buildQueryContext ─────────────────────────────────────────────────────────

describe('buildQueryContext', () => {
  it('returns null when no connection is provided', () => {
    expect(buildQueryContext(makeTab(), undefined)).toBeNull()
  })

  // ── Provider label ────────────────────────────────────────────────────────

  it('maps sqlserver provider to "SQL Server"', () => {
    const ctx = buildQueryContext(makeTab(), makeConnection({ provider: 'sqlserver' }))
    expect(ctx?.providerLabel).toBe('SQL Server')
  })

  it('maps postgres provider to "PostgreSQL"', () => {
    const ctx = buildQueryContext(makeTab(), makeConnection({ provider: 'postgres' }))
    expect(ctx?.providerLabel).toBe('PostgreSQL')
  })

  it('maps mysql provider to "MySQL"', () => {
    const ctx = buildQueryContext(makeTab(), makeConnection({ provider: 'mysql' }))
    expect(ctx?.providerLabel).toBe('MySQL')
  })

  it('maps mongodb provider to "MongoDB"', () => {
    const ctx = buildQueryContext(makeTab(), makeConnection({ provider: 'mongodb' }))
    expect(ctx?.providerLabel).toBe('MongoDB')
  })

  it('maps redis provider to "Redis"', () => {
    const ctx = buildQueryContext(makeTab(), makeConnection({ provider: 'redis' }))
    expect(ctx?.providerLabel).toBe('Redis')
  })

  it('maps sqlite provider to "SQLite"', () => {
    const ctx = buildQueryContext(makeTab(), makeConnection({ provider: 'sqlite' }))
    expect(ctx?.providerLabel).toBe('SQLite')
  })

  // ── Connection name ───────────────────────────────────────────────────────

  it('exposes the connection display name', () => {
    const ctx = buildQueryContext(makeTab(), makeConnection({ name: 'Production' }))
    expect(ctx?.connectionName).toBe('Production')
  })

  // ── Database ──────────────────────────────────────────────────────────────

  it('prefers tab databaseName over connection default', () => {
    const ctx = buildQueryContext(
      makeTab({ databaseName: 'AdventureWorks' }),
      makeConnection({ defaultDatabase: 'master' })
    )
    expect(ctx?.database).toBe('AdventureWorks')
  })

  it('falls back to connection defaultDatabase when tab has none', () => {
    const ctx = buildQueryContext(makeTab(), makeConnection({ defaultDatabase: 'master' }))
    expect(ctx?.database).toBe('master')
  })

  it('returns null database when both tab and connection have no database', () => {
    const ctx = buildQueryContext(makeTab(), makeConnection({ defaultDatabase: '' }))
    expect(ctx?.database).toBeNull()
  })

  it('returns null database for whitespace-only defaultDatabase', () => {
    const ctx = buildQueryContext(makeTab(), makeConnection({ defaultDatabase: '   ' }))
    expect(ctx?.database).toBeNull()
  })

  // ── Syntax label ─────────────────────────────────────────────────────────

  it('uses SQL syntax label for sqlserver', () => {
    const ctx = buildQueryContext(makeTab(), makeConnection({ provider: 'sqlserver' }))
    expect(ctx?.syntaxLabel).toBe('SQL')
  })

  it('uses SQL syntax label for postgres', () => {
    const ctx = buildQueryContext(makeTab(), makeConnection({ provider: 'postgres' }))
    expect(ctx?.syntaxLabel).toBe('SQL')
  })

  it('uses SQL syntax label for mysql', () => {
    const ctx = buildQueryContext(makeTab(), makeConnection({ provider: 'mysql' }))
    expect(ctx?.syntaxLabel).toBe('SQL')
  })

  it('uses SQL syntax label for sqlite', () => {
    const ctx = buildQueryContext(makeTab(), makeConnection({ provider: 'sqlite' }))
    expect(ctx?.syntaxLabel).toBe('SQL')
  })

  it('uses JSON syntax label for mongodb', () => {
    const ctx = buildQueryContext(makeTab(), makeConnection({ provider: 'mongodb' }))
    expect(ctx?.syntaxLabel).toBe('JSON')
  })

  it('uses Redis syntax label for redis', () => {
    const ctx = buildQueryContext(makeTab(), makeConnection({ provider: 'redis' }))
    expect(ctx?.syntaxLabel).toBe('Redis')
  })

  // ── MongoDB collection ────────────────────────────────────────────────────

  it('uses the mongo collection as objectName', () => {
    const ctx = buildQueryContext(
      makeTab({ mongoCollection: 'orders' }),
      makeConnection({ provider: 'mongodb' })
    )
    expect(ctx?.objectName).toBe('orders')
    expect(ctx?.objectLabel).toBe('Collection')
  })

  it('returns null objectName for mongodb tab with no collection selected', () => {
    const ctx = buildQueryContext(makeTab(), makeConnection({ provider: 'mongodb' }))
    expect(ctx?.objectName).toBeNull()
    expect(ctx?.objectLabel).toBe('Collection')
  })

  // ── SQL object detection ──────────────────────────────────────────────────

  it('returns null objectName for empty SQL content', () => {
    const ctx = buildQueryContext(makeTab({ content: '' }), makeConnection())
    expect(ctx?.objectName).toBeNull()
  })

  it('returns null objectName for SQL with no FROM clause', () => {
    const ctx = buildQueryContext(makeTab({ content: 'SELECT 1' }), makeConnection())
    expect(ctx?.objectName).toBeNull()
  })

  it('returns the single table name for a simple SELECT', () => {
    const ctx = buildQueryContext(
      makeTab({ content: 'SELECT * FROM Orders' }),
      makeConnection()
    )
    expect(ctx?.objectName).toBe('Orders')
    expect(ctx?.objectLabel).toBe('Table')
  })

  it('includes schema prefix when present', () => {
    const ctx = buildQueryContext(
      makeTab({ content: 'SELECT * FROM dbo.Orders' }),
      makeConnection()
    )
    expect(ctx?.objectName).toBe('dbo.Orders')
  })

  it('returns "Multiple" when the SQL references more than one table', () => {
    const ctx = buildQueryContext(
      makeTab({ content: 'SELECT * FROM dbo.Orders o JOIN dbo.Customers c ON o.CustId = c.Id' }),
      makeConnection()
    )
    expect(ctx?.objectName).toBe('Multiple')
  })

  // ── Redis ─────────────────────────────────────────────────────────────────

  it('returns null objectName for a redis tab', () => {
    const ctx = buildQueryContext(makeTab({ content: 'GET myKey' }), makeConnection({ provider: 'redis' }))
    expect(ctx?.objectName).toBeNull()
  })
})

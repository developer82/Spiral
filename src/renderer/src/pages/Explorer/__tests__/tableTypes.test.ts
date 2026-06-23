import { describe, it, expect } from 'vitest'
import {
  getProviderTypes,
  getTypeConfig,
  MYSQL_TYPES,
  MYSQL_TYPE_CONFIGS,
  SQL_SERVER_TYPES
} from '../tableTypes'

describe('getProviderTypes – MySQL', () => {
  it('returns MySQL-specific types for mysql provider', () => {
    const types = getProviderTypes('mysql')
    expect(types).toBe(MYSQL_TYPES)
  })

  it('includes varchar but not nvarchar for MySQL', () => {
    const types = getProviderTypes('mysql')
    expect(types).toContain('varchar')
    expect(types).not.toContain('nvarchar')
    expect(types).not.toContain('nchar')
    expect(types).not.toContain('ntext')
  })

  it('includes MySQL-specific types not in SQL Server', () => {
    const types = getProviderTypes('mysql')
    expect(types).toContain('mediumint')
    expect(types).toContain('mediumtext')
    expect(types).toContain('longtext')
    expect(types).toContain('tinytext')
    expect(types).toContain('mediumblob')
    expect(types).toContain('longblob')
  })

  it('does not include SQL Server-specific types for MySQL', () => {
    const types = getProviderTypes('mysql')
    expect(types).not.toContain('nvarchar')
    expect(types).not.toContain('uniqueidentifier')
    expect(types).not.toContain('hierarchyid')
    expect(types).not.toContain('money')
    expect(types).not.toContain('smallmoney')
    expect(types).not.toContain('datetime2')
    expect(types).not.toContain('datetimeoffset')
  })

  it('still returns SQL Server types for sqlserver provider', () => {
    const types = getProviderTypes('sqlserver')
    expect(types).toBe(SQL_SERVER_TYPES)
    expect(types).toContain('nvarchar')
  })
})

describe('getTypeConfig – MySQL', () => {
  it('returns hasLength=true for varchar', () => {
    const cfg = getTypeConfig('mysql', 'varchar')
    expect(cfg.hasLength).toBe(true)
    expect(cfg.hasMaxOption).toBe(false)
  })

  it('returns hasLength=true for char', () => {
    const cfg = getTypeConfig('mysql', 'char')
    expect(cfg.hasLength).toBe(true)
    expect(cfg.hasMaxOption).toBe(false)
  })

  it('returns hasLength=false for text types', () => {
    for (const t of ['text', 'tinytext', 'mediumtext', 'longtext']) {
      const cfg = getTypeConfig('mysql', t)
      expect(cfg.hasLength).toBe(false)
    }
  })

  it('returns hasIdentity=true for integer types', () => {
    for (const t of ['tinyint', 'smallint', 'mediumint', 'int', 'bigint']) {
      const cfg = getTypeConfig('mysql', t)
      expect(cfg.hasIdentity).toBe(true)
    }
  })

  it('returns hasPrecisionScale=true for decimal and numeric', () => {
    expect(getTypeConfig('mysql', 'decimal').hasPrecisionScale).toBe(true)
    expect(getTypeConfig('mysql', 'numeric').hasPrecisionScale).toBe(true)
  })

  it('returns NO_EXTRA for unknown MySQL type', () => {
    const cfg = getTypeConfig('mysql', 'unknowntype')
    expect(cfg.hasLength).toBe(false)
    expect(cfg.hasPrecisionScale).toBe(false)
    expect(cfg.hasIdentity).toBe(false)
    expect(cfg.hasMaxOption).toBe(false)
  })

  it('does not return hasLength for int (display width deprecated)', () => {
    const cfg = getTypeConfig('mysql', 'int')
    expect(cfg.hasLength).toBe(false)
  })

  it('MYSQL_TYPES and MYSQL_TYPE_CONFIGS cover the same set of types', () => {
    const configuredTypes = new Set(Object.keys(MYSQL_TYPE_CONFIGS))
    for (const t of MYSQL_TYPES) {
      expect(configuredTypes.has(t)).toBe(true)
    }
  })
})

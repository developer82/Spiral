import { describe, it, expect } from 'vitest'
import { buildUpdateBooleanSql } from '../updateUtils'

describe('buildUpdateBooleanSql', () => {
  const table = { schema: 'dbo', table: 'Users' }

  describe('new value toggling', () => {
    it('sets column to 1 when newValue is true', () => {
      const sql = buildUpdateBooleanSql({ id: 1, active: false }, table, ['id'], 'active', true)
      expect(sql).toBe("UPDATE [dbo].[Users] SET [active] = 1 WHERE [id] = 1")
    })

    it('sets column to 0 when newValue is false', () => {
      const sql = buildUpdateBooleanSql({ id: 1, active: true }, table, ['id'], 'active', false)
      expect(sql).toBe("UPDATE [dbo].[Users] SET [active] = 0 WHERE [id] = 1")
    })

    it('sets column to NULL when newValue is null', () => {
      const sql = buildUpdateBooleanSql({ id: 1, active: true }, table, ['id'], 'active', null)
      expect(sql).toBe("UPDATE [dbo].[Users] SET [active] = NULL WHERE [id] = 1")
    })

    it('sets column to 1 when toggling from null (null → true)', () => {
      const sql = buildUpdateBooleanSql({ id: 5, active: null }, table, ['id'], 'active', true)
      expect(sql).toBe("UPDATE [dbo].[Users] SET [active] = 1 WHERE [id] = 5")
    })
  })

  describe('WHERE clause value escaping', () => {
    it('quotes string PK values and escapes single quotes', () => {
      const sql = buildUpdateBooleanSql({ code: "O'Brien", flag: true }, table, ['code'], 'flag', false)
      expect(sql).toBe("UPDATE [dbo].[Users] SET [flag] = 0 WHERE [code] = 'O''Brien'")
    })

    it('renders numeric PK without quotes', () => {
      const sql = buildUpdateBooleanSql({ id: 42, flag: false }, table, ['id'], 'flag', true)
      expect(sql).toBe("UPDATE [dbo].[Users] SET [flag] = 1 WHERE [id] = 42")
    })

    it('renders null PK value as NULL', () => {
      const sql = buildUpdateBooleanSql({ id: null, flag: false }, table, ['id'], 'flag', true)
      expect(sql).toBe("UPDATE [dbo].[Users] SET [flag] = 1 WHERE [id] = NULL")
    })

    it('renders boolean PK values as 1 / 0', () => {
      const sql = buildUpdateBooleanSql({ flag1: true, flag2: false }, table, ['flag1'], 'flag2', true)
      expect(sql).toBe("UPDATE [dbo].[Users] SET [flag2] = 1 WHERE [flag1] = 1")
    })

    it('renders Date PK values as ISO string literals', () => {
      const d = new Date('2024-01-15T10:00:00.000Z')
      const sql = buildUpdateBooleanSql({ created: d, flag: false }, table, ['created'], 'flag', true)
      expect(sql).toBe(`UPDATE [dbo].[Users] SET [flag] = 1 WHERE [created] = '${d.toISOString()}'`)
    })
  })

  describe('composite PK', () => {
    it('generates AND clause for two PK columns', () => {
      const sql = buildUpdateBooleanSql(
        { tenant_id: 1, user_id: 42, active: false },
        table,
        ['tenant_id', 'user_id'],
        'active',
        true
      )
      expect(sql).toBe("UPDATE [dbo].[Users] SET [active] = 1 WHERE [tenant_id] = 1 AND [user_id] = 42")
    })

    it('escapes values in composite PK conditions', () => {
      const sql = buildUpdateBooleanSql(
        { schema_name: "pub'lic", table_name: 'Orders', is_active: true },
        { schema: 'meta', table: 'TableInfo' },
        ['schema_name', 'table_name'],
        'is_active',
        false
      )
      expect(sql).toBe(
        "UPDATE [meta].[TableInfo] SET [is_active] = 0 WHERE [schema_name] = 'pub''lic' AND [table_name] = 'Orders'"
      )
    })
  })

  describe('schema and table quoting', () => {
    it('brackets the schema and table names for sqlserver (default)', () => {
      const sql = buildUpdateBooleanSql(
        { id: 1, flag: true },
        { schema: 'my schema', table: 'my table' },
        ['id'],
        'flag',
        false
      )
      expect(sql).toBe("UPDATE [my schema].[my table] SET [flag] = 0 WHERE [id] = 1")
    })
  })

  describe('sqlite provider', () => {
    it('uses double-quoted identifiers and no schema prefix', () => {
      const sql = buildUpdateBooleanSql(
        { id: 1, active: false },
        { schema: '', table: 'Users' },
        ['id'],
        'active',
        true,
        'sqlite'
      )
      expect(sql).toBe('UPDATE "Users" SET "active" = 1 WHERE "id" = 1')
    })
  })
})

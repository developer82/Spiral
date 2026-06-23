import { describe, it, expect } from 'vitest'
import { buildDeleteSql } from '../deleteUtils'

describe('buildDeleteSql', () => {
  const table = { schema: 'dbo', table: 'Users' }

  describe('single PK column', () => {
    it('generates IN clause for a single row', () => {
      const sql = buildDeleteSql([{ id: 1, name: 'Alice' }], table, ['id'])
      expect(sql).toBe("DELETE FROM [dbo].[Users] WHERE [id] IN (1)")
    })

    it('generates IN clause for multiple rows', () => {
      const sql = buildDeleteSql(
        [{ id: 1 }, { id: 2 }, { id: 3 }],
        table,
        ['id']
      )
      expect(sql).toBe("DELETE FROM [dbo].[Users] WHERE [id] IN (1, 2, 3)")
    })

    it('properly escapes string values', () => {
      const sql = buildDeleteSql(
        [{ code: "O'Brien" }, { code: 'Smith' }],
        table,
        ['code']
      )
      expect(sql).toBe("DELETE FROM [dbo].[Users] WHERE [code] IN ('O''Brien', 'Smith')")
    })

    it('renders null as NULL', () => {
      const sql = buildDeleteSql([{ id: null }], table, ['id'])
      expect(sql).toBe("DELETE FROM [dbo].[Users] WHERE [id] IN (NULL)")
    })

    it('renders undefined as NULL', () => {
      const sql = buildDeleteSql([{ id: undefined }], table, ['id'])
      expect(sql).toBe("DELETE FROM [dbo].[Users] WHERE [id] IN (NULL)")
    })

    it('renders boolean true as 1', () => {
      const sql = buildDeleteSql([{ flag: true }], table, ['flag'])
      expect(sql).toBe("DELETE FROM [dbo].[Users] WHERE [flag] IN (1)")
    })

    it('renders boolean false as 0', () => {
      const sql = buildDeleteSql([{ flag: false }], table, ['flag'])
      expect(sql).toBe("DELETE FROM [dbo].[Users] WHERE [flag] IN (0)")
    })

    it('renders numbers without quotes', () => {
      const sql = buildDeleteSql([{ id: 42 }], table, ['id'])
      expect(sql).toBe("DELETE FROM [dbo].[Users] WHERE [id] IN (42)")
    })

    it('renders Date values as ISO string literals', () => {
      const d = new Date('2024-01-15T10:00:00.000Z')
      const sql = buildDeleteSql([{ created: d }], table, ['created'])
      expect(sql).toBe(`DELETE FROM [dbo].[Users] WHERE [created] IN ('${d.toISOString()}')`)
    })
  })

  describe('composite PK (multiple PK columns)', () => {
    it('generates OR/AND clause for a single row', () => {
      const sql = buildDeleteSql(
        [{ tenant_id: 1, user_id: 42 }],
        table,
        ['tenant_id', 'user_id']
      )
      expect(sql).toBe(
        "DELETE FROM [dbo].[Users] WHERE ([tenant_id] = 1 AND [user_id] = 42)"
      )
    })

    it('generates OR clauses for multiple rows', () => {
      const sql = buildDeleteSql(
        [
          { tenant_id: 1, user_id: 10 },
          { tenant_id: 2, user_id: 20 }
        ],
        table,
        ['tenant_id', 'user_id']
      )
      expect(sql).toBe(
        "DELETE FROM [dbo].[Users] WHERE ([tenant_id] = 1 AND [user_id] = 10) OR ([tenant_id] = 2 AND [user_id] = 20)"
      )
    })

    it('properly escapes string values in composite PK', () => {
      const sql = buildDeleteSql(
        [{ category: "it's", code: 'A1' }],
        table,
        ['category', 'code']
      )
      expect(sql).toBe(
        "DELETE FROM [dbo].[Users] WHERE ([category] = 'it''s' AND [code] = 'A1')"
      )
    })
  })

  describe('schema and table name quoting', () => {
    it('brackets schema and table name for sqlserver (default)', () => {
      const sql = buildDeleteSql([{ id: 1 }], { schema: 'my schema', table: 'my table' }, ['id'])
      expect(sql).toContain('[my schema].[my table]')
    })
  })

  describe('sqlite provider', () => {
    const sqliteTable = { schema: '', table: 'Users' }

    it('uses double-quoted table name without schema prefix', () => {
      const sql = buildDeleteSql([{ id: 1 }], sqliteTable, ['id'], 'sqlite')
      expect(sql).toBe('DELETE FROM "Users" WHERE "id" IN (1)')
    })

    it('ignores schema even when provided', () => {
      const sql = buildDeleteSql([{ id: 1 }], { schema: 'main', table: 'Orders' }, ['id'], 'sqlite')
      expect(sql).toMatch(/^DELETE FROM "Orders"/)
      expect(sql).not.toContain('main')
    })
  })
})

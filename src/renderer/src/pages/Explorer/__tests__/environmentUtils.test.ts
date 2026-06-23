import { describe, expect, it } from 'vitest'
import { isClearlyReadOnlySql } from '../environmentUtils'

describe('isClearlyReadOnlySql', () => {
  it('returns true for a simple select statement', () => {
    expect(isClearlyReadOnlySql('SELECT TOP 10 * FROM [dbo].[Users]')).toBe(true)
  })

  it('returns false for a select followed by update on a later line', () => {
    expect(
      isClearlyReadOnlySql(`SELECT TOP 100 * FROM [TestDb].[dbo].[Users]

Update [TestDb].[dbo].[Users] set FirstName = 'test' where ID=19`)
    ).toBe(false)
  })

  it('returns false for a select followed by a write statement after a semicolon', () => {
    expect(
      isClearlyReadOnlySql('SELECT * FROM users; DELETE FROM users WHERE id = 1')
    ).toBe(false)
  })

  it('ignores mutating keywords inside comments and strings', () => {
    expect(
      isClearlyReadOnlySql(`-- update users later
SELECT 'delete from users' AS note FROM audit_log`)
    ).toBe(true)
  })

  it('returns false for select into statements', () => {
    expect(
      isClearlyReadOnlySql('SELECT * INTO #tempUsers FROM [dbo].[Users]')
    ).toBe(false)
  })
})
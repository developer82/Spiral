import { describe, it, expect } from 'vitest'
import { needsPasswordPrompt } from '../useExplorerTree'
import type { ConnectionRecord } from '../../connections.types'

function makeConnection(overrides: Partial<ConnectionRecord> = {}): ConnectionRecord {
  return {
    id: 'conn-1',
    name: 'Conn',
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

describe('needsPasswordPrompt', () => {
  it('returns true for a password-based connection without a saved password', () => {
    expect(needsPasswordPrompt(makeConnection({ rememberPassword: false }))).toBe(true)
  })

  it.each(['postgres', 'mysql', 'redis', 'mongodb'] as const)(
    'returns true for provider "%s" when the password is not saved',
    (provider) => {
      expect(needsPasswordPrompt(makeConnection({ provider, rememberPassword: false }))).toBe(true)
    }
  )

  it('returns false when the password is saved (rememberPassword true)', () => {
    expect(needsPasswordPrompt(makeConnection({ rememberPassword: true }))).toBe(false)
  })

  it('returns false for SQLite (file-based, no auth) even without a saved password', () => {
    expect(
      needsPasswordPrompt(makeConnection({ provider: 'sqlite', rememberPassword: false }))
    ).toBe(false)
  })
})

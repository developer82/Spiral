// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => true),
    encryptString: vi.fn((s: string) => Buffer.from(`encrypted:${s}`)),
    decryptString: vi.fn((b: Buffer) => b.toString().replace('encrypted:', ''))
  }
}))

import {
  clearSessionKey,
  decryptAllConnections,
  decryptPassword,
  decryptProfilePasswords,
  deriveEncryptionKey,
  encryptAllConnections,
  encryptPassword,
  encryptProfilePasswords,
  generateEncryptionSalt,
  getSessionKey,
  isEncrypted,
  loadPersistedKey,
  persistSessionKey,
  resolveConnectionPassword,
  setSessionKey
} from '../connectionEncryption'

describe('generateEncryptionSalt', () => {
  it('returns a 64-char hex string', () => {
    const salt = generateEncryptionSalt()
    expect(salt).toMatch(/^[0-9a-f]{64}$/)
  })

  it('generates unique salts', () => {
    expect(generateEncryptionSalt()).not.toBe(generateEncryptionSalt())
  })
})

describe('deriveEncryptionKey', () => {
  it('returns a 32-byte Buffer', async () => {
    const salt = generateEncryptionSalt()
    const key = await deriveEncryptionKey('password', salt)
    expect(key).toBeInstanceOf(Buffer)
    expect(key.length).toBe(32)
  })

  it('is deterministic for same password and salt', async () => {
    const salt = generateEncryptionSalt()
    const key1 = await deriveEncryptionKey('password', salt)
    const key2 = await deriveEncryptionKey('password', salt)
    expect(key1.equals(key2)).toBe(true)
  })

  it('produces different keys for different passwords', async () => {
    const salt = generateEncryptionSalt()
    const key1 = await deriveEncryptionKey('password1', salt)
    const key2 = await deriveEncryptionKey('password2', salt)
    expect(key1.equals(key2)).toBe(false)
  })

  it('produces different keys for different salts', async () => {
    const key1 = await deriveEncryptionKey('password', generateEncryptionSalt())
    const key2 = await deriveEncryptionKey('password', generateEncryptionSalt())
    expect(key1.equals(key2)).toBe(false)
  })
})

describe('encryptPassword / decryptPassword', () => {
  let key: Buffer

  beforeEach(async () => {
    key = await deriveEncryptionKey('testpassword', generateEncryptionSalt())
  })

  it('encrypted value starts with enc:v1:', () => {
    const enc = encryptPassword('secret', key)
    expect(enc.startsWith('enc:v1:')).toBe(true)
  })

  it('round-trip returns original plaintext', () => {
    const plaintext = 'my-db-password'
    expect(decryptPassword(encryptPassword(plaintext, key), key)).toBe(plaintext)
  })

  it('handles empty string', () => {
    expect(decryptPassword(encryptPassword('', key), key)).toBe('')
  })

  it('handles unicode passwords', () => {
    const plaintext = 'pässwörd!@#$%^&*()'
    expect(decryptPassword(encryptPassword(plaintext, key), key)).toBe(plaintext)
  })

  it('produces different ciphertexts for same plaintext (random IV)', () => {
    const enc1 = encryptPassword('secret', key)
    const enc2 = encryptPassword('secret', key)
    expect(enc1).not.toBe(enc2)
  })

  it('decryptPassword returns plaintext unchanged for non-encrypted value', () => {
    expect(decryptPassword('plaintext', key)).toBe('plaintext')
  })

  it('throws on tampered ciphertext', () => {
    const enc = encryptPassword('secret', key)
    const tampered = enc.slice(0, -4) + 'XXXX'
    expect(() => decryptPassword(tampered, key)).toThrow()
  })
})

describe('isEncrypted', () => {
  it('returns true for enc:v1: prefixed values', async () => {
    const key = await deriveEncryptionKey('pw', generateEncryptionSalt())
    expect(isEncrypted(encryptPassword('x', key))).toBe(true)
  })

  it('returns false for plaintext', () => {
    expect(isEncrypted('plainpassword')).toBe(false)
    expect(isEncrypted('')).toBe(false)
    expect(isEncrypted('v1:something')).toBe(false)
  })
})

describe('session key management', () => {
  beforeEach(() => clearSessionKey())

  it('starts null', () => {
    expect(getSessionKey()).toBeNull()
  })

  it('setSessionKey / getSessionKey', async () => {
    const key = await deriveEncryptionKey('pw', generateEncryptionSalt())
    setSessionKey(key)
    expect(getSessionKey()).toBe(key)
  })

  it('clearSessionKey sets to null', async () => {
    const key = await deriveEncryptionKey('pw', generateEncryptionSalt())
    setSessionKey(key)
    clearSessionKey()
    expect(getSessionKey()).toBeNull()
  })
})

describe('persistSessionKey / loadPersistedKey', () => {
  it('round-trips the key via safeStorage', async () => {
    const key = await deriveEncryptionKey('pw', generateEncryptionSalt())
    const persisted = persistSessionKey(key)
    expect(persisted).not.toBeNull()
    const loaded = loadPersistedKey(persisted!)
    expect(loaded).not.toBeNull()
    expect(loaded!.equals(key)).toBe(true)
  })
})

describe('encryptAllConnections / decryptAllConnections', () => {
  let key: Buffer

  beforeEach(async () => {
    key = await deriveEncryptionKey('pw', generateEncryptionSalt())
  })

  it('encrypts passwords where rememberPassword=true', () => {
    const connections = [
      { password: 'secret1', rememberPassword: true },
      { password: 'secret2', rememberPassword: false },
      { password: '', rememberPassword: true }
    ]
    const result = encryptAllConnections(connections, key)
    expect(isEncrypted(result[0].password)).toBe(true)
    expect(result[1].password).toBe('secret2')
    expect(result[2].password).toBe('')
  })

  it('does not re-encrypt already-encrypted passwords', async () => {
    const enc = encryptPassword('secret', key)
    const connections = [{ password: enc, rememberPassword: true }]
    const result = encryptAllConnections(connections, key)
    expect(result[0].password).toBe(enc)
  })

  it('decryptAllConnections restores original plaintexts', () => {
    const connections = [
      { password: 'secret1', rememberPassword: true },
      { password: '', rememberPassword: false }
    ]
    const encrypted = encryptAllConnections(connections, key)
    const decrypted = decryptAllConnections(
      encrypted.map((c, i) => ({ ...connections[i], password: c.password })),
      key
    )
    expect(decrypted[0].password).toBe('secret1')
    expect(decrypted[1].password).toBe('')
  })

  it('decryptAllConnections leaves plaintext values unchanged', () => {
    const connections = [{ password: 'plaintext' }]
    const result = decryptAllConnections(connections, key)
    expect(result[0].password).toBe('plaintext')
  })

  it('round-trips additional user profile passwords', () => {
    const connections = [
      {
        password: 'main',
        rememberPassword: true,
        additionalUsers: [
          { id: 'u1', username: 'ro', password: 'roPass' },
          { id: 'u2', username: 'noPass', password: '' },
          { id: 'u3', username: 'writer' }
        ]
      }
    ]
    const encrypted = encryptAllConnections(connections, key)
    // Profile passwords are encrypted at rest, other fields preserved.
    expect(isEncrypted(encrypted[0].additionalUsers![0].password!)).toBe(true)
    expect(encrypted[0].additionalUsers![0].username).toBe('ro')
    expect(encrypted[0].additionalUsers![1].password).toBe('')
    expect(encrypted[0].additionalUsers![2].password).toBeUndefined()

    const decrypted = decryptAllConnections(encrypted, key)
    expect(decrypted[0].additionalUsers![0].password).toBe('roPass')
    expect(decrypted[0].additionalUsers![0].username).toBe('ro')
  })
})

describe('encryptProfilePasswords / decryptProfilePasswords', () => {
  let key: Buffer

  beforeEach(async () => {
    key = await deriveEncryptionKey('pw', generateEncryptionSalt())
  })

  it('returns undefined when given undefined', () => {
    expect(encryptProfilePasswords(undefined, key)).toBeUndefined()
    expect(decryptProfilePasswords(undefined, key)).toBeUndefined()
  })

  it('encrypts only profiles that have a password', () => {
    const users = [
      { id: 'u1', username: 'a', password: 'secret' },
      { id: 'u2', username: 'b', password: '' },
      { id: 'u3', username: 'c' }
    ]
    const result = encryptProfilePasswords(users, key)!
    expect(isEncrypted(result[0].password!)).toBe(true)
    expect(result[1].password).toBe('')
    expect(result[2].password).toBeUndefined()
  })

  it('does not re-encrypt an already-encrypted profile password', () => {
    const enc = encryptPassword('secret', key)
    const result = encryptProfilePasswords([{ id: 'u1', username: 'a', password: enc }], key)!
    expect(result[0].password).toBe(enc)
  })

  it('decrypts encrypted profile passwords and preserves other fields', () => {
    const encrypted = encryptProfilePasswords(
      [{ id: 'u1', profileName: 'RO', username: 'a', password: 'secret' }],
      key
    )!
    const decrypted = decryptProfilePasswords(encrypted, key)!
    expect(decrypted[0].password).toBe('secret')
    expect(decrypted[0].profileName).toBe('RO')
    expect(decrypted[0].username).toBe('a')
  })
})

describe('resolveConnectionPassword', () => {
  let key: Buffer

  beforeEach(async () => {
    clearSessionKey()
    key = await deriveEncryptionKey('profilepw', generateEncryptionSalt())
  })

  it('decrypts an encrypted password when the session key is set', () => {
    setSessionKey(key)
    const record = { id: 'c1', host: 'db', password: encryptPassword('secret', key) }
    const resolved = resolveConnectionPassword(record)
    expect(resolved.password).toBe('secret')
  })

  it('preserves other record fields', () => {
    setSessionKey(key)
    const record = { id: 'c1', host: 'db', password: encryptPassword('secret', key) }
    const resolved = resolveConnectionPassword(record)
    expect(resolved.id).toBe('c1')
    expect(resolved.host).toBe('db')
  })

  it('returns plaintext password unchanged (no profile password set)', () => {
    const record = { id: 'c1', password: 'plainsecret' }
    expect(resolveConnectionPassword(record).password).toBe('plainsecret')
  })

  it('leaves an encrypted password untouched when no session key is set', () => {
    const enc = encryptPassword('secret', key)
    const record = { id: 'c1', password: enc }
    // Without the key we cannot decrypt; must not corrupt or throw.
    expect(resolveConnectionPassword(record).password).toBe(enc)
  })

  it('does not mutate the original record', () => {
    setSessionKey(key)
    const enc = encryptPassword('secret', key)
    const record = { id: 'c1', password: enc }
    resolveConnectionPassword(record)
    expect(record.password).toBe(enc)
  })
})

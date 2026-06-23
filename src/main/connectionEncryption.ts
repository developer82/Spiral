import { createCipheriv, createDecipheriv, randomBytes, scrypt as scryptCallback } from 'crypto'
import { promisify } from 'util'
import { safeStorage } from 'electron'

const scryptAsync = promisify(scryptCallback)

const SALT_BYTES = 32
const IV_BYTES = 12
const KEY_BYTES = 32
const AUTH_TAG_BYTES = 16
const ENC_PREFIX = 'enc:v1:'

let sessionKey: Buffer | null = null

export function setSessionKey(key: Buffer): void {
  sessionKey = key
}

export function getSessionKey(): Buffer | null {
  return sessionKey
}

export function clearSessionKey(): void {
  sessionKey = null
}

export function generateEncryptionSalt(): string {
  return randomBytes(SALT_BYTES).toString('hex')
}

export async function deriveEncryptionKey(password: string, saltHex: string): Promise<Buffer> {
  const salt = Buffer.from(saltHex, 'hex')
  return scryptAsync(password, salt, KEY_BYTES) as Promise<Buffer>
}

export function encryptPassword(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return ENC_PREFIX + Buffer.concat([iv, tag, encrypted]).toString('base64')
}

export function decryptPassword(encrypted: string, key: Buffer): string {
  if (!isEncrypted(encrypted)) return encrypted
  const data = Buffer.from(encrypted.slice(ENC_PREFIX.length), 'base64')
  const iv = data.subarray(0, IV_BYTES)
  const tag = data.subarray(IV_BYTES, IV_BYTES + AUTH_TAG_BYTES)
  const ciphertext = data.subarray(IV_BYTES + AUTH_TAG_BYTES)
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
}

export function isEncrypted(value: string): boolean {
  return value.startsWith(ENC_PREFIX)
}

// Returns a copy of a connection-like record with its stored password decrypted
// using the current session key, ready to hand to a database provider. Passwords
// are persisted encrypted (enc:v1:...) once a profile password is set; providers
// expect plaintext. No-op when the password is plaintext or no session key exists.
export function resolveConnectionPassword<T extends { password: string }>(record: T): T {
  if (!isEncrypted(record.password)) return record
  if (!sessionKey) return record
  return { ...record, password: decryptPassword(record.password, sessionKey) }
}

export function persistSessionKey(key: Buffer): string | null {
  if (!safeStorage.isEncryptionAvailable()) return null
  return safeStorage.encryptString(key.toString('hex')).toString('base64')
}

export function loadPersistedKey(encrypted: string): Buffer | null {
  if (!safeStorage.isEncryptionAvailable()) return null
  try {
    const keyHex = safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
    return Buffer.from(keyHex, 'hex')
  } catch {
    return null
  }
}

export function encryptAllConnections(
  connections: Array<{ password: string; rememberPassword: boolean }>,
  key: Buffer
): Array<{ password: string }> {
  return connections.map((conn) => {
    if (!conn.rememberPassword || !conn.password || isEncrypted(conn.password)) {
      return { password: conn.password }
    }
    return { password: encryptPassword(conn.password, key) }
  })
}

export function decryptAllConnections(
  connections: Array<{ password: string }>,
  key: Buffer
): Array<{ password: string }> {
  return connections.map((conn) => {
    if (!isEncrypted(conn.password)) return { password: conn.password }
    return { password: decryptPassword(conn.password, key) }
  })
}

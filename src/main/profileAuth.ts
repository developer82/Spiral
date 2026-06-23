import { randomBytes, scrypt, timingSafeEqual } from 'crypto'
import { promisify } from 'util'

const scryptAsync = promisify(scrypt)

const SALT_BYTES = 32
const KEY_BYTES = 64
const VERSION = 'v1'

/**
 * Hash a plaintext password and return a versioned meta string that can be
 * stored in the profile store without exposing the original password.
 */
export async function hashPassword(plaintext: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES).toString('hex')
  const key = (await scryptAsync(plaintext, salt, KEY_BYTES)) as Buffer
  return `${VERSION}:${salt}:${key.toString('hex')}`
}

/**
 * Verify a plaintext password against a versioned meta string produced by
 * {@link hashPassword}. Returns false for any malformed or missing meta.
 */
export async function verifyPassword(plaintext: string, meta: string | null): Promise<boolean> {
  if (!meta) return false
  const parts = meta.split(':')
  if (parts.length !== 3 || parts[0] !== VERSION) return false
  const [, salt, stored] = parts
  try {
    const candidate = (await scryptAsync(plaintext, salt, KEY_BYTES)) as Buffer
    const storedBuf = Buffer.from(stored, 'hex')
    if (candidate.length !== storedBuf.length) return false
    return timingSafeEqual(candidate, storedBuf)
  } catch {
    return false
  }
}

import { safeStorage } from 'electron'
import { profileStore } from './store'

export interface LockoutState {
  attemptsTier: 0 | 1 | 2
  attemptsInTier: number
  lockedUntil: number | null
}

const LOCKOUT_DURATIONS_MS: [number, number, number] = [
  60_000,     // tier 0 → 1 minute
  600_000,    // tier 1 → 10 minutes
  3_600_000   // tier 2 → 1 hour
]
const MAX_ATTEMPTS = 5

function defaultState(): LockoutState {
  return { attemptsTier: 0, attemptsInTier: 0, lockedUntil: null }
}

export function getLockoutState(): LockoutState {
  const encrypted = profileStore.get('lockoutStateEncrypted')
  if (!encrypted) return defaultState()
  try {
    if (!safeStorage.isEncryptionAvailable()) return defaultState()
    const json = safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
    return JSON.parse(json) as LockoutState
  } catch {
    // Tampered or corrupt — enforce max lockout to prevent bypass via corruption
    return { attemptsTier: 2, attemptsInTier: MAX_ATTEMPTS, lockedUntil: Date.now() + LOCKOUT_DURATIONS_MS[2] }
  }
}

export function saveLockoutState(state: LockoutState): void {
  if (!safeStorage.isEncryptionAvailable()) return
  try {
    const buf = safeStorage.encryptString(JSON.stringify(state))
    profileStore.set('lockoutStateEncrypted', buf.toString('base64'))
  } catch { /* ignore */ }
}

export function clearLockoutState(): void {
  profileStore.set('lockoutStateEncrypted', null)
}

export function checkLockout(): { isLockedOut: boolean; lockedUntilMs: number | null } {
  const state = getLockoutState()
  if (state.lockedUntil === null) return { isLockedOut: false, lockedUntilMs: null }

  const now = Date.now()
  if (now < state.lockedUntil) {
    return { isLockedOut: true, lockedUntilMs: state.lockedUntil }
  }

  // Lockout expired — advance tier or reset after full cycle
  if (state.attemptsTier === 2) {
    clearLockoutState()
  } else {
    saveLockoutState({ attemptsTier: (state.attemptsTier + 1) as 1 | 2, attemptsInTier: 0, lockedUntil: null })
  }
  return { isLockedOut: false, lockedUntilMs: null }
}

export function recordFailedAttempt(): {
  lockedOut: boolean
  lockedUntilMs: number | null
  attemptsRemaining: number | null
} {
  const state = getLockoutState()
  const newAttempts = state.attemptsInTier + 1

  if (newAttempts >= MAX_ATTEMPTS) {
    const lockedUntil = Date.now() + LOCKOUT_DURATIONS_MS[state.attemptsTier]
    saveLockoutState({ ...state, attemptsInTier: newAttempts, lockedUntil })
    return { lockedOut: true, lockedUntilMs: lockedUntil, attemptsRemaining: null }
  }

  saveLockoutState({ ...state, attemptsInTier: newAttempts })
  const remaining = MAX_ATTEMPTS - newAttempts
  // Only show remaining count starting from the 2nd failed attempt
  return {
    lockedOut: false,
    lockedUntilMs: null,
    attemptsRemaining: newAttempts >= 2 ? remaining : null
  }
}

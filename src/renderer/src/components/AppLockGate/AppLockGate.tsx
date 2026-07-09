import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Lock, Shield, Swords } from 'lucide-react'
import './AppLockGate.css'

interface AppLockGateProps {
  children: React.ReactNode
  titleBar?: React.ReactNode
}

function formatTimeLeft(ms: number): string {
  const s = Math.ceil(ms / 1000)
  const totalMin = Math.floor(s / 60)
  const sec = s % 60
  if (totalMin >= 60) {
    const h = Math.floor(totalMin / 60)
    const min = totalMin % 60
    return `${h}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  }
  return `${totalMin}:${String(sec).padStart(2, '0')}`
}

export default function AppLockGate({ children, titleBar }: AppLockGateProps): React.JSX.Element {
  const [locked, setLocked] = useState<boolean | null>(null) // null = loading
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isVerifying, setIsVerifying] = useState(false)
  const [isShaking, setIsShaking] = useState(false)
  const [unlockSuccess, setUnlockSuccess] = useState(false)
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(null)
  const [, setAttemptsRemaining] = useState<number | null>(null)
  const [timeLeft, setTimeLeft] = useState<number>(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const unlockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lockSettingsRef = useRef({ lockOnInactivity: false, inactivityTimeoutMinutes: 5 })

  // Bootstrap: check if we start locked
  useEffect(() => {
    window.api.auth.getState().then((state) => {
      const shouldLock = state.hasPassword && state.lockOnStartup
      setLocked(shouldLock)
      lockSettingsRef.current = {
        lockOnInactivity: state.lockOnInactivity,
        inactivityTimeoutMinutes: state.inactivityTimeoutMinutes
      }
    }).catch(() => setLocked(false))
  }, [])

  // Listen for main-process lock requests (system suspend/lock-screen)
  useEffect(() => {
    return window.api.auth.onLock(() => {
      if (unlockTimerRef.current) {
        clearTimeout(unlockTimerRef.current)
        unlockTimerRef.current = null
      }
      setUnlockSuccess(false)
      setLocked(true)
    })
  }, [])

  // Global lock shortcut: Cmd+Shift+L on macOS, Ctrl+Shift+L elsewhere.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      const primary = window.api.platform === 'darwin' ? e.metaKey : e.ctrlKey
      const conflicting = window.api.platform === 'darwin' ? e.ctrlKey : e.metaKey
      if (primary && e.shiftKey && !conflicting && !e.altKey && e.code === 'KeyL') {
        void window.api.auth.lockNow()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Inactivity locking
  const resetInactivityTimer = useCallback(() => {
    if (!lockSettingsRef.current.lockOnInactivity) return
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current)
    inactivityTimerRef.current = setTimeout(() => {
      setLocked((prev) => {
        if (prev === false) {
          void window.api.auth.clearSessionKey()
          return true
        }
        return prev
      })
    }, lockSettingsRef.current.inactivityTimeoutMinutes * 60 * 1000)
  }, [])

  // Re-read lock settings whenever the gate renders unlocked so new settings take effect
  useEffect(() => {
    if (locked !== false) return
    window.api.auth.getState().then((state) => {
      lockSettingsRef.current = {
        lockOnInactivity: state.lockOnInactivity,
        inactivityTimeoutMinutes: state.inactivityTimeoutMinutes
      }
      if (state.hasPassword && state.lockOnInactivity) {
        resetInactivityTimer()
      }
    }).catch(() => {})

    return () => {
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current)
    }
  }, [locked, resetInactivityTimer])

  // Track user activity to reset inactivity timer
  useEffect(() => {
    if (locked !== false) return
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll']
    const handleActivity = (): void => resetInactivityTimer()
    events.forEach((e) => window.addEventListener(e, handleActivity, { passive: true }))
    return () => events.forEach((e) => window.removeEventListener(e, handleActivity))
  }, [locked, resetInactivityTimer])

  // Focus the input and check lockout state when showing the lock screen
  useEffect(() => {
    if (locked !== true) return
    setPassword('')
    setError('')
    setUnlockSuccess(false)
    setAttemptsRemaining(null)

    window.api.auth.getState().then((state) => {
      if (!state.hasPassword) {
        lockSettingsRef.current = {
          lockOnInactivity: false,
          inactivityTimeoutMinutes: state.inactivityTimeoutMinutes
        }
        setLocked(false)
        return
      }
      if (state.lockout?.isLockedOut && state.lockout.lockedUntilMs) {
        setLockoutUntil(state.lockout.lockedUntilMs)
      } else {
        setLockoutUntil(null)
      }
    }).catch(() => { setLockoutUntil(null) })

    setTimeout(() => inputRef.current?.focus(), 50)
  }, [locked])

  // Countdown timer while locked out
  useEffect(() => {
    if (lockoutUntil === null) {
      setTimeLeft(0)
      return
    }
    setTimeLeft(Math.max(0, lockoutUntil - Date.now()))
    const interval = setInterval(() => {
      const remaining = Math.max(0, lockoutUntil - Date.now())
      setTimeLeft(remaining)
      if (remaining === 0) {
        setLockoutUntil(null)
        setError('')
      }
    }, 500)
    return () => clearInterval(interval)
  }, [lockoutUntil])

  const handleUnlock = useCallback(async () => {
    if (isVerifying || !password || lockoutUntil !== null) return
    setIsVerifying(true)
    setError('')
    try {
      const result = await window.api.auth.verify(password)
      if (result.valid) {
        setPassword('')
        setAttemptsRemaining(null)
        setLockoutUntil(null)
        const animationsOn = document.documentElement.getAttribute('data-animations') === 'on'
        if (animationsOn) {
          setUnlockSuccess(true)
          unlockTimerRef.current = setTimeout(() => {
            unlockTimerRef.current = null
            setLocked(false)
          }, 700)
        } else {
          setLocked(false)
        }
      } else if (result.lockedOut && result.lockedUntilMs) {
        setLockoutUntil(result.lockedUntilMs)
        setPassword('')
      } else {
        const remaining = result.attemptsRemaining ?? null
        if (remaining !== null) {
          setAttemptsRemaining(remaining)
          setError(`Incorrect password. ${remaining} ${remaining === 1 ? 'try' : 'tries'} remaining.`)
        } else {
          setError('Incorrect password. Please try again.')
        }
        setPassword('')
        setIsShaking(true)
        inputRef.current?.focus()
      }
    } catch {
      setError('An error occurred. Please try again.')
    } finally {
      setIsVerifying(false)
    }
  }, [isVerifying, password, lockoutUntil])

  // Still loading auth state
  if (locked === null) return <>{children}</>

  if (!locked) return <>{children}</>

  const isLockedOut = lockoutUntil !== null

  return (
    <div className="app-lock-gate-wrapper">
      {titleBar}
      <div className="app-lock-gate" role="dialog" aria-modal="true" aria-label="Application locked">
        <div
          className={`app-lock-gate__card${isShaking ? ' app-lock-gate__card--shake' : ''}`}
          onAnimationEnd={() => setIsShaking(false)}
        >
          <div className={`app-lock-gate__icon-wrap${isLockedOut ? ' app-lock-gate__icon-wrap--lockout' : ''}`}>
            {unlockSuccess ? (
              <>
                <svg className="app-lock-gate__success-ring" viewBox="0 0 64 64" fill="none" aria-hidden="true">
                  <circle className="app-lock-gate__success-circle" cx="32" cy="32" r="30" stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
                <div className="app-lock-gate__icon-stack">
                  <Lock size={28} strokeWidth={1.5} className="app-lock-gate__lock-icon app-lock-gate__lock-icon--fading" />
                  <Check size={22} strokeWidth={2.5} className="app-lock-gate__check-icon" />
                </div>
              </>
            ) : isLockedOut ? (
              <div className="app-lock-gate__icon-stack">
                <Shield size={30} strokeWidth={1.5} className="app-lock-gate__shield-icon" />
                <Swords size={14} strokeWidth={2} className="app-lock-gate__swords-icon" />
              </div>
            ) : (
              <Lock size={32} strokeWidth={1.5} className="app-lock-gate__lock-icon" />
            )}
          </div>
          <h1 className="app-lock-gate__title">Application Locked</h1>
          <p className="app-lock-gate__subtitle">Enter your password to continue</p>

          <div className="app-lock-gate__form">
            <input
              ref={inputRef}
              type="password"
              className={`app-lock-gate__input${error ? ' app-lock-gate__input--error' : ''}`}
              placeholder="Password"
              value={password}
              autoComplete="current-password"
              onChange={(e) => {
                setPassword(e.target.value)
                if (error) setError('')
              }}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleUnlock() }}
              disabled={isVerifying || isLockedOut}
            />
            {isLockedOut ? (
              <p className="app-lock-gate__lockout">
                Too many failed attempts. Try again in {formatTimeLeft(timeLeft)}.
              </p>
            ) : error ? (
              <p className="app-lock-gate__error">{error}</p>
            ) : null}
            <button
              className="app-lock-gate__btn"
              onClick={() => void handleUnlock()}
              disabled={isVerifying || !password || isLockedOut}
            >
              {isVerifying ? 'Verifying…' : 'Unlock'}
            </button>
          </div>

          <p className="app-lock-gate__hint">
            Forgot your password? Clear the app data directory to reset.
          </p>
        </div>
      </div>
    </div>
  )
}

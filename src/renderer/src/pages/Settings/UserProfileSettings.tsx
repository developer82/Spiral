import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useProfileContext } from '../../contexts/ProfileContext'
import AvatarPlaceholder from '../../components/AvatarPlaceholder/AvatarPlaceholder'
import Toggle from '../../components/Toggle/Toggle'
import './UserProfileSettings.css'
import Button from '../../components/Button/Button'

type PasswordMode = 'none' | 'set' | 'change' | 'remove'

export default function UserProfileSettings(): React.JSX.Element {
  const { t } = useTranslation()
  const { profile, refreshProfile, setDisplayName, pickAvatar, removeAvatar, setAvatarTransform } =
    useProfileContext()

  // ── Display name ────────────────────────────────────────────────────────────
  const [nameInput, setNameInput] = useState(profile.displayName)
  const nameSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setNameInput(profile.displayName)
  }, [profile.displayName])

  function handleNameChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const val = e.target.value
    setNameInput(val)
    if (nameSaveTimerRef.current) clearTimeout(nameSaveTimerRef.current)
    nameSaveTimerRef.current = setTimeout(() => {
      void setDisplayName(val)
    }, 600)
  }

  // ── Avatar ──────────────────────────────────────────────────────────────────
  const [avatarLoading, setAvatarLoading] = useState(false)

  // Pan/zoom state — synced from profile, local during interaction
  const [zoom, setZoom] = useState(profile.avatarZoom)
  const [offsetX, setOffsetX] = useState(profile.avatarOffsetX)
  const [offsetY, setOffsetY] = useState(profile.avatarOffsetY)

  const avatarContainerRef = useRef<HTMLDivElement>(null)
  const transformSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isDraggingRef = useRef(false)
  const dragStartRef = useRef({ x: 0, y: 0, ox: 0, oy: 0 })

  // Sync transform state when profile loads/changes (e.g. new avatar picked)
  useEffect(() => {
    setZoom(profile.avatarZoom)
    setOffsetX(profile.avatarOffsetX)
    setOffsetY(profile.avatarOffsetY)
  }, [profile.avatarZoom, profile.avatarOffsetX, profile.avatarOffsetY])

  function scheduleTransformSave(z: number, ox: number, oy: number): void {
    if (transformSaveTimerRef.current) clearTimeout(transformSaveTimerRef.current)
    transformSaveTimerRef.current = setTimeout(() => {
      void setAvatarTransform(z, ox, oy)
    }, 400)
  }

  function handleAvatarWheel(e: React.WheelEvent<HTMLDivElement>): void {
    if (!profile.avatarDataUrl) return
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.08 : 0.08
    const newZoom = Math.max(1, Math.min(4, zoom + delta))
    setZoom(newZoom)
    scheduleTransformSave(newZoom, offsetX, offsetY)
  }

  function handleAvatarMouseDown(e: React.MouseEvent<HTMLDivElement>): void {
    if (!profile.avatarDataUrl) return
    if (e.button !== 0) return
    e.preventDefault()
    isDraggingRef.current = true
    dragStartRef.current = { x: e.clientX, y: e.clientY, ox: offsetX, oy: offsetY }
  }

  useEffect(() => {
    function handleMouseMove(e: MouseEvent): void {
      if (!isDraggingRef.current || !avatarContainerRef.current) return
      const containerSize = avatarContainerRef.current.getBoundingClientRect().width
      const dx = ((e.clientX - dragStartRef.current.x) / containerSize) * 100
      const dy = ((e.clientY - dragStartRef.current.y) / containerSize) * 100
      const newOx = dragStartRef.current.ox + dx
      const newOy = dragStartRef.current.oy + dy
      setOffsetX(newOx)
      setOffsetY(newOy)
      scheduleTransformSave(zoom, newOx, newOy)
    }
    function handleMouseUp(): void {
      isDraggingRef.current = false
    }
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, offsetX, offsetY])

  async function handlePickAvatar(): Promise<void> {
    setAvatarLoading(true)
    try {
      await pickAvatar()
    } finally {
      setAvatarLoading(false)
    }
  }

  async function handleRemoveAvatar(): Promise<void> {
    await removeAvatar()
  }

  // ── Lock settings ───────────────────────────────────────────────────────────
  const [lockOnStartup, setLockOnStartup] = useState(profile.lockOnStartup)
  const [lockOnInactivity, setLockOnInactivity] = useState(profile.lockOnInactivity)
  const [lockOnMinimize, setLockOnMinimize] = useState(profile.lockOnMinimize)
  const [inactivityMinutes, setInactivityMinutes] = useState(String(profile.inactivityTimeoutMinutes))

  useEffect(() => {
    setLockOnStartup(profile.lockOnStartup)
    setLockOnInactivity(profile.lockOnInactivity)
    setLockOnMinimize(profile.lockOnMinimize)
    setInactivityMinutes(String(profile.inactivityTimeoutMinutes))
  }, [profile.lockOnStartup, profile.lockOnInactivity, profile.lockOnMinimize, profile.inactivityTimeoutMinutes])

  async function persistLockSettings(
    startup: boolean,
    inactivity: boolean,
    minimize: boolean,
    minutes: number
  ): Promise<void> {
    await window.api.profile.setLockSettings({
      lockOnStartup: startup,
      lockOnInactivity: inactivity,
      lockOnMinimize: minimize,
      inactivityTimeoutMinutes: minutes
    })
    await refreshProfile()
  }

  async function handleLockOnStartupChange(val: boolean): Promise<void> {
    if (!profile.hasPassword) return
    setLockOnStartup(val)
    await persistLockSettings(val, lockOnInactivity, lockOnMinimize, Number(inactivityMinutes) || 5)
  }

  async function handleLockOnInactivityChange(val: boolean): Promise<void> {
    if (!profile.hasPassword) return
    setLockOnInactivity(val)
    await persistLockSettings(lockOnStartup, val, lockOnMinimize, Number(inactivityMinutes) || 5)
  }

  async function handleLockOnMinimizeChange(val: boolean): Promise<void> {
    if (!profile.hasPassword) return
    setLockOnMinimize(val)
    await persistLockSettings(lockOnStartup, lockOnInactivity, val, Number(inactivityMinutes) || 5)
  }

  async function handleInactivityMinutesBlur(): Promise<void> {
    const parsed = Math.max(1, Math.min(120, Number(inactivityMinutes) || 5))
    setInactivityMinutes(String(parsed))
    await persistLockSettings(lockOnStartup, lockOnInactivity, lockOnMinimize, parsed)
  }

  // ── Password ────────────────────────────────────────────────────────────────
  const [passwordMode, setPasswordMode] = useState<PasswordMode>('none')
  const [pw1, setPw1] = useState('')
  const [pw2, setPw2] = useState('')
  const [pwCurrent, setPwCurrent] = useState('')
  const [pwError, setPwError] = useState('')
  const [pwSuccess, setPwSuccess] = useState('')
  const [pwLoading, setPwLoading] = useState(false)

  function resetPasswordForm(): void {
    setPw1('')
    setPw2('')
    setPwCurrent('')
    setPwError('')
    setPwSuccess('')
    setPasswordMode('none')
  }

  const handleSetPassword = useCallback(async () => {
    setPwError('')
    if (pw1.length < 1) { setPwError(t('settings.userProfile.password.errorEmpty')); return }
    if (pw1 !== pw2) { setPwError(t('settings.userProfile.password.errorMismatch')); return }
    setPwLoading(true)
    try {
      const result = await window.api.auth.setPassword(pw1)
      if (result.status === 'error') { setPwError(result.message); return }
      setPwSuccess(t('settings.userProfile.password.setSuccess'))
      await refreshProfile()
      setTimeout(resetPasswordForm, 1500)
    } finally {
      setPwLoading(false)
    }
  }, [pw1, pw2, refreshProfile, t])

  const handleChangePassword = useCallback(async () => {
    setPwError('')
    if (!pwCurrent) { setPwError(t('settings.userProfile.password.errorCurrentRequired')); return }
    if (pw1.length < 1) { setPwError(t('settings.userProfile.password.errorEmpty')); return }
    if (pw1 !== pw2) { setPwError(t('settings.userProfile.password.errorMismatch')); return }
    setPwLoading(true)
    try {
      const result = await window.api.auth.changePassword(pwCurrent, pw1)
      if (result.status === 'error') { setPwError(result.message); return }
      setPwSuccess(t('settings.userProfile.password.changeSuccess'))
      await refreshProfile()
      setTimeout(resetPasswordForm, 1500)
    } finally {
      setPwLoading(false)
    }
  }, [pw1, pw2, pwCurrent, refreshProfile, t])

  const handleRemovePassword = useCallback(async () => {
    setPwError('')
    if (!pwCurrent) { setPwError(t('settings.userProfile.password.errorCurrentRequired')); return }
    setPwLoading(true)
    try {
      const result = await window.api.auth.removePassword(pwCurrent)
      if (result.status === 'error') { setPwError(result.message); return }
      setPwSuccess(t('settings.userProfile.password.removeSuccess'))
      await refreshProfile()
      setTimeout(resetPasswordForm, 1500)
    } finally {
      setPwLoading(false)
    }
  }, [pwCurrent, refreshProfile, t])

  return (
    <div className="settings-page">
      {/* ── Header ── */}
      <div className="settings-page__header">
        <div>
          <h1 className="settings-page__title">
            {profile.displayName.trim()
              ? t('settings.userProfile.helloTitle', { name: profile.displayName.trim().split(' ')[0] })
              : t('settings.userProfile.title')}
          </h1>
          <p className="settings-page__subtitle">{t('settings.userProfile.subtitle')}</p>
          <p className="settings-page__privacy-note">{t('settings.userProfile.privacyNote')}</p>
        </div>
      </div>

      {/* ── Avatar & Name ── */}
      <div className="settings-page__section">
        <h2 className="settings-page__section-title">{t('settings.userProfile.identity')}</h2>

        <div className="user-profile__identity-row">
          <div className="user-profile__avatar-wrap">
            <div
              ref={avatarContainerRef}
              className={`user-profile__avatar-circle${profile.avatarDataUrl ? ' user-profile__avatar-circle--interactive' : ''}`}
              onWheel={handleAvatarWheel}
              onMouseDown={handleAvatarMouseDown}
            >
              {profile.avatarDataUrl ? (
                <img
                  src={profile.avatarDataUrl}
                  alt={t('settings.userProfile.avatarAlt')}
                  className="user-profile__avatar-img"
                  style={{
                    transform: `translate(${offsetX}%, ${offsetY}%) scale(${zoom})`,
                    transformOrigin: 'center'
                  }}
                  draggable={false}
                />
              ) : (
                <AvatarPlaceholder displayName={profile.displayName} size={96} />
              )}
            </div>
            <div className="user-profile__avatar-actions">
              <button
                className="user-profile__avatar-btn"
                onClick={() => void handlePickAvatar()}
                disabled={avatarLoading}
                title={t('settings.userProfile.chooseImage')}
                aria-label={t('settings.userProfile.chooseImage')}
              >
                <Camera size={15} strokeWidth={1.5} />
              </button>
              {profile.avatarDataUrl && (
                <button
                  className="user-profile__avatar-btn user-profile__avatar-btn--remove"
                  onClick={() => void handleRemoveAvatar()}
                  title={t('settings.userProfile.removeImage')}
                  aria-label={t('settings.userProfile.removeImage')}
                >
                  <Trash2 size={15} strokeWidth={1.5} />
                </button>
              )}
            </div>
          </div>

          <div className="user-profile__name-section">
            <label className="settings-card__title" htmlFor="profile-name">
              {t('settings.userProfile.displayName')}
            </label>
            <p className="settings-card__desc">{t('settings.userProfile.displayNameDesc')}</p>
            <input
              id="profile-name"
              type="text"
              className="user-profile__name-input"
              value={nameInput}
              maxLength={100}
              placeholder={t('settings.userProfile.displayNamePlaceholder')}
              onChange={handleNameChange}
            />
          </div>
        </div>
      </div>

      {/* ── Password Protection ── */}
      <div className="settings-page__section">
        <h2 className="settings-page__section-title">{t('settings.userProfile.passwordSection')}</h2>

        {!profile.hasPassword && passwordMode === 'none' && (
          <div className="settings-card">
            <div className="settings-card__info">
              <p className="settings-card__title">{t('settings.userProfile.password.noPasswordTitle')}</p>
              <p className="settings-card__desc">{t('settings.userProfile.password.noPasswordDesc')}</p>
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setPasswordMode('set')}
            >
              {t('settings.userProfile.password.setButton')}
            </Button>
          </div>
        )}

        {profile.hasPassword && passwordMode === 'none' && (
          <div className="settings-card">
            <div className="settings-card__info">
              <p className="settings-card__title">{t('settings.userProfile.password.hasPasswordTitle')}</p>
              <p className="settings-card__desc">{t('settings.userProfile.password.hasPasswordDesc')}</p>
            </div>
            <div className="settings-card__actions">
              <Button
              variant="primary"
              size="sm"
                onClick={() => setPasswordMode('change')}
              >
                {t('settings.userProfile.password.changeButton')}
              </Button>
              <Button
              variant="danger"
              size="sm"
                onClick={() => setPasswordMode('remove')}
              >
                {t('settings.userProfile.password.removeButton')}
              </Button>
            </div>
          </div>
        )}

        {passwordMode === 'set' && (
          <div className="settings-card user-profile__password-form">
            <div className="user-profile__password-fields">
              <p className="settings-card__title">{t('settings.userProfile.password.setTitle')}</p>
              <input
                type="password"
                className="user-profile__pw-input"
                placeholder={t('settings.userProfile.password.newPlaceholder')}
                value={pw1}
                autoComplete="new-password"
                onChange={(e) => { setPw1(e.target.value); setPwError('') }}
              />
              <input
                type="password"
                className="user-profile__pw-input"
                placeholder={t('settings.userProfile.password.confirmPlaceholder')}
                value={pw2}
                autoComplete="new-password"
                onChange={(e) => { setPw2(e.target.value); setPwError('') }}
              />
              {pwError && <p className="user-profile__pw-error">{pwError}</p>}
              {pwSuccess && <p className="user-profile__pw-success">{pwSuccess}</p>}
              <div className="user-profile__pw-actions">
                <Button
              variant="primary"
              size="sm"
                  onClick={() => void handleSetPassword()}
                  disabled={pwLoading}
                >
                  {pwLoading ? t('settings.userProfile.password.saving') : t('settings.userProfile.password.setConfirm')}
                </Button>
                <Button
              variant="ghost"
              size="lg"
                  onClick={resetPasswordForm}
                  disabled={pwLoading}
                >
                  {t('settings.userProfile.password.cancel')}
                </Button>
              </div>
            </div>
          </div>
        )}

        {passwordMode === 'change' && (
          <div className="settings-card user-profile__password-form">
            <div className="user-profile__password-fields">
              <p className="settings-card__title">{t('settings.userProfile.password.changeTitle')}</p>
              <input
                type="password"
                className="user-profile__pw-input"
                placeholder={t('settings.userProfile.password.currentPlaceholder')}
                value={pwCurrent}
                autoComplete="current-password"
                onChange={(e) => { setPwCurrent(e.target.value); setPwError('') }}
              />
              <input
                type="password"
                className="user-profile__pw-input"
                placeholder={t('settings.userProfile.password.newPlaceholder')}
                value={pw1}
                autoComplete="new-password"
                onChange={(e) => { setPw1(e.target.value); setPwError('') }}
              />
              <input
                type="password"
                className="user-profile__pw-input"
                placeholder={t('settings.userProfile.password.confirmPlaceholder')}
                value={pw2}
                autoComplete="new-password"
                onChange={(e) => { setPw2(e.target.value); setPwError('') }}
              />
              {pwError && <p className="user-profile__pw-error">{pwError}</p>}
              {pwSuccess && <p className="user-profile__pw-success">{pwSuccess}</p>}
              <div className="user-profile__pw-actions">
                <Button
              variant="primary"
              size="sm"
                  onClick={() => void handleChangePassword()}
                  disabled={pwLoading}
                >
                  {pwLoading ? t('settings.userProfile.password.saving') : t('settings.userProfile.password.changeConfirm')}
                </Button>
                <Button
              variant="ghost"
              size="lg"
                  onClick={resetPasswordForm}
                  disabled={pwLoading}
                >
                  {t('settings.userProfile.password.cancel')}
                </Button>
              </div>
            </div>
          </div>
        )}

        {passwordMode === 'remove' && (
          <div className="settings-card user-profile__password-form">
            <div className="user-profile__password-fields">
              <p className="settings-card__title">{t('settings.userProfile.password.removeTitle')}</p>
              <p className="settings-card__desc">{t('settings.userProfile.password.removeDesc')}</p>
              <p className="user-profile__pw-warning">{t('settings.userProfile.password.removeWarning')}</p>
              <input
                type="password"
                className="user-profile__pw-input"
                placeholder={t('settings.userProfile.password.currentPlaceholder')}
                value={pwCurrent}
                autoComplete="current-password"
                onChange={(e) => { setPwCurrent(e.target.value); setPwError('') }}
              />
              {pwError && <p className="user-profile__pw-error">{pwError}</p>}
              {pwSuccess && <p className="user-profile__pw-success">{pwSuccess}</p>}
              <div className="user-profile__pw-actions">
                <Button
              variant="danger"
              size="sm"
                  onClick={() => void handleRemovePassword()}
                  disabled={pwLoading}
                >
                  {pwLoading ? t('settings.userProfile.password.saving') : t('settings.userProfile.password.removeConfirm')}
                </Button>
                <Button
              variant="ghost"
              size="lg"
                  onClick={resetPasswordForm}
                  disabled={pwLoading}
                >
                  {t('settings.userProfile.password.cancel')}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Recovery note */}
        <p className="user-profile__recovery-note">
          {t('settings.userProfile.password.recoveryNote')}
        </p>
      </div>

      {/* ── Lock Settings ── */}
      {profile.hasPassword && (
        <div className="settings-page__section">
          <h2 className="settings-page__section-title">{t('settings.userProfile.lockSection')}</h2>
          <div className="settings-card-group">
            <div className="settings-card-group__row">
              <div className="settings-card__info">
                <p className="settings-card__title">{t('settings.userProfile.lockOnStartup.label')}</p>
                <p className="settings-card__desc">{t('settings.userProfile.lockOnStartup.desc')}</p>
              </div>
              <Toggle
                id="lock-on-startup"
                label={t('settings.userProfile.lockOnStartup.label')}
                checked={lockOnStartup}
                onChange={(v) => void handleLockOnStartupChange(v)}
              />
            </div>
            <div className="settings-card-group__row">
              <div className="settings-card__info">
                <p className="settings-card__title">{t('settings.userProfile.lockOnInactivity.label')}</p>
                <p className="settings-card__desc">{t('settings.userProfile.lockOnInactivity.desc')}</p>
              </div>
              <Toggle
                id="lock-on-inactivity"
                label={t('settings.userProfile.lockOnInactivity.label')}
                checked={lockOnInactivity}
                onChange={(v) => void handleLockOnInactivityChange(v)}
              />
            </div>
            <div className="settings-card-group__row">
              <div className="settings-card__info">
                <p className="settings-card__title">{t('settings.userProfile.lockOnMinimize.label')}</p>
                <p className="settings-card__desc">{t('settings.userProfile.lockOnMinimize.desc')}</p>
              </div>
              <Toggle
                id="lock-on-minimize"
                label={t('settings.userProfile.lockOnMinimize.label')}
                checked={lockOnMinimize}
                onChange={(v) => void handleLockOnMinimizeChange(v)}
              />
            </div>
            {lockOnInactivity && (
              <div className="settings-card-group__row">
                <div className="settings-card__info">
                  <p className="settings-card__title">{t('settings.userProfile.inactivityTimeout.label')}</p>
                  <p className="settings-card__desc">{t('settings.userProfile.inactivityTimeout.desc')}</p>
                </div>
                <div className="settings-card__actions">
                  <input
                    type="number"
                    className="settings-input"
                    min={1}
                    max={120}
                    value={inactivityMinutes}
                    onChange={(e) => setInactivityMinutes(e.target.value)}
                    onBlur={() => void handleInactivityMinutesBlur()}
                    aria-label={t('settings.userProfile.inactivityTimeout.label')}
                  />
                  <span className="settings-card__meta">{t('settings.userProfile.inactivityTimeout.minutes')}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

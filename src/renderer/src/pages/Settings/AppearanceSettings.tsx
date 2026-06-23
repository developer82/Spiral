import { useState, useRef } from 'react'
import { Moon, Sun, Monitor } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import Toggle from '../../components/Toggle/Toggle'
import { useSettings } from './useSettings'
import type { ErdBackground } from '../Explorer/ErdCanvas/ErdCanvas'
import Button from '../../components/Button/Button'
import { computeSkyColor, hexToSkyColor } from '../../hooks/useSkyColor'
import SearchableSelect from '../../components/SearchableSelect/SearchableSelect'
import { THEME_REGISTRY } from '../../themes'

const PINNED_THEMES: { id: string; labelKey: string; icon: React.ElementType; previewClass: string }[] = [
  {
    id: 'dark',
    labelKey: 'settings.appearance.themes.dark',
    icon: Moon,
    previewClass: 'settings-appearance__theme-preview--dark'
  },
  {
    id: 'light',
    labelKey: 'settings.appearance.themes.light',
    icon: Sun,
    previewClass: 'settings-appearance__theme-preview--light'
  },
  {
    id: 'system',
    labelKey: 'settings.appearance.themes.system',
    icon: Monitor,
    previewClass: 'settings-appearance__theme-preview--system'
  }
]

function skyColorToHex(color: { r: number; g: number; b: number }): string {
  return `#${color.r.toString(16).padStart(2, '0')}${color.g.toString(16).padStart(2, '0')}${color.b.toString(16).padStart(2, '0')}`
}

// Maps stored glassEffectHour to the 0-31 slider display range so each named
// position (Off/Auto/Morning/Noon/Evening/Manual) aligns with its label.
function hourToSlider(h: number): number {
  if (h === -2) return 0   // Off
  if (h === -1) return 6   // Auto — sits at ~20% of the track
  if (h === 24) return 31  // Manual
  return Math.max(7, Math.min(30, h + 7))  // hours 0-23 → slider 7-30
}

// Maps 0-31 slider value back to stored glassEffectHour.
// Values 1-5 are a snap zone: they map to Auto (-1).
function sliderToHour(v: number): number {
  if (v <= 0) return -2   // Off
  if (v <= 6) return -1   // Auto
  if (v >= 31) return 24  // Manual
  return v - 7            // hours 0-23
}

function AppearanceSettings(): React.JSX.Element {
  const { t } = useTranslation()
  const { settings, updateSetting, resetSettings } = useSettings()

  const initialCustomTitlebar = useRef(settings.customTitlebar)
  const [pendingRestart, setPendingRestart] = useState(false)
  const colorInputRef = useRef<HTMLInputElement>(null)

  const glassEffectHour = settings.glassEffectHour
  const isOff = glassEffectHour === -2
  const isAuto = glassEffectHour === -1
  const isManual = glassEffectHour === 24

  function getPreviewColor(): { r: number; g: number; b: number; intensity: number } | null {
    if (isOff) return null
    if (isManual && settings.glassEffectManualColor) {
      return hexToSkyColor(settings.glassEffectManualColor)
    }
    if (isManual || isAuto) return computeSkyColor(new Date())
    const d = new Date()
    d.setHours(glassEffectHour, 0, 0, 0)
    return computeSkyColor(d)
  }

  const previewColor = getPreviewColor()
  const glowBg = previewColor
    ? `rgba(${previewColor.r}, ${previewColor.g}, ${previewColor.b}, ${(0.12 * previewColor.intensity).toFixed(3)})`
    : 'transparent'
  const glowBorder = previewColor
    ? `rgba(${previewColor.r}, ${previewColor.g}, ${previewColor.b}, ${(0.35 * previewColor.intensity).toFixed(3)})`
    : 'var(--color-border)'

  const colorPickerValue = settings.glassEffectManualColor ||
    (previewColor ? skyColorToHex(previewColor) : '#ffffff')

  function handleCustomTitlebarChange(value: boolean): void {
    updateSetting('customTitlebar', value)
    setPendingRestart(value !== initialCustomTitlebar.current)
  }

  function handleReset(): void {
    resetSettings()
    setPendingRestart(false)
    initialCustomTitlebar.current = true // DEFAULT_SETTINGS.customTitlebar is true
  }

  function handlePreviewBoxClick(): void {
    if (isManual) colorInputRef.current?.click()
  }

  function handleManualColorChange(e: React.ChangeEvent<HTMLInputElement>): void {
    updateSetting('glassEffectManualColor', e.target.value)
  }

  return (
    <div className="settings-page">
      <div className="settings-page__header">
        <div>
          <h1 className="settings-page__title">{t('settings.appearance.title')}</h1>
          <p className="settings-page__subtitle">{t('settings.appearance.subtitle')}</p>
        </div>
        <Button
              variant="ghost"
              size="lg" onClick={handleReset}>
          {t('settings.resetDefaults')}
        </Button>
      </div>

      {/* Theme Preferences */}
      <div className="settings-page__section">
        <h2 className="settings-page__section-title">
          {t('settings.appearance.themePreferences')}
        </h2>
        <div className="settings-appearance__theme-grid">
          {PINNED_THEMES.map(({ id, labelKey, icon: Icon, previewClass }) => (
            <button
              key={id}
              className={`settings-appearance__theme-card${settings.theme === id ? ' settings-appearance__theme-card--active' : ''}`}
              aria-label={t('settings.appearance.themes.selectAriaLabel', { theme: t(labelKey) })}
              onClick={() => updateSetting('theme', id)}
            >
              <div className={`settings-appearance__theme-preview ${previewClass}`}>
                <Icon size={32} strokeWidth={1.5} />
              </div>
              <span className="settings-appearance__theme-label">{t(labelKey)}</span>
            </button>
          ))}
        </div>
        <div className="settings-card-group settings-appearance__theme-select-group">
          <div className="settings-card-group__row">
            <div className="settings-card__info">
              <p className="settings-card__title">{t('settings.appearance.themes.selectedTheme.title')}</p>
              <p className="settings-card__desc">{t('settings.appearance.themes.selectedTheme.desc')}</p>
            </div>
            <div className="settings-appearance__theme-select">
              <SearchableSelect
                options={THEME_REGISTRY.map((theme) => ({ value: theme.id, label: t(theme.labelKey) }))}
                value={settings.theme === 'system' ? '' : settings.theme}
                onChange={(val) => { if (val) updateSetting('theme', val) }}
                ariaLabel={t('settings.appearance.themes.dropdown.ariaLabel')}
                emptyOptionLabel={t('settings.appearance.themes.dropdown.placeholder')}
                searchPlaceholder={t('settings.appearance.themes.dropdown.searchPlaceholder')}
                noResultsLabel={t('settings.appearance.themes.dropdown.noResults')}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="settings-divider" />

      {/* Interface Elements */}
      <div className="settings-page__section">
        <h2 className="settings-page__section-title">
          {t('settings.appearance.interfaceElements')}
        </h2>
        <div className="settings-card-group">
          <div className="settings-card-group__row">
            <div className="settings-card__info">
              <p className="settings-card__title">{t('settings.appearance.syntaxHighlighting.title')}</p>
              <p className="settings-card__desc">{t('settings.appearance.syntaxHighlighting.desc')}</p>
            </div>
            <Toggle
              id="toggle-syntax-highlighting"
              label={t('settings.appearance.syntaxHighlighting.title')}
              checked={settings.syntaxHighlighting}
              onChange={(v) => updateSetting('syntaxHighlighting', v)}
            />
          </div>
          <div className="settings-card-group__row">
            <div className="settings-card__info">
              <p className="settings-card__title">{t('settings.appearance.showGridLines.title')}</p>
              <p className="settings-card__desc">{t('settings.appearance.showGridLines.desc')}</p>
            </div>
            <Toggle
              id="toggle-grid-lines"
              label={t('settings.appearance.showGridLines.title')}
              checked={settings.showGridLines}
              onChange={(v) => updateSetting('showGridLines', v)}
            />
          </div>
          <div className="settings-card-group__row">
            <div className="settings-card__info">
              <p className="settings-card__title">{t('settings.appearance.hideSideNav.title')}</p>
              <p className="settings-card__desc">{t('settings.appearance.hideSideNav.desc')}</p>
            </div>
            <Toggle
              id="toggle-hide-side-nav"
              label={t('settings.appearance.hideSideNav.title')}
              checked={!settings.showSideNavigationBar}
              onChange={(v) => updateSetting('showSideNavigationBar', !v)}
            />
          </div>
          <div className="settings-card-group__row">
            <div className="settings-card__info">
              <p className="settings-card__title">{t('settings.appearance.customTitlebar.title')}</p>
              <p className="settings-card__desc">{t('settings.appearance.customTitlebar.desc')}</p>
            </div>
            <Toggle
              id="toggle-custom-titlebar"
              label={t('settings.appearance.customTitlebar.title')}
              checked={settings.customTitlebar}
              onChange={handleCustomTitlebarChange}
            />
          </div>
          <div className="settings-card-group__row">
            <div className="settings-card__info">
              <p className="settings-card__title">{t('settings.appearance.enableAnimations.title')}</p>
              <p className="settings-card__desc">{t('settings.appearance.enableAnimations.desc')}</p>
            </div>
            <Toggle
              id="toggle-enable-animations"
              label={t('settings.appearance.enableAnimations.title')}
              checked={settings.enableAnimations}
              onChange={(v) => updateSetting('enableAnimations', v)}
            />
          </div>
          <div className="settings-card-group__row">
            <div className="settings-card__info">
              <p className="settings-card__title">{t('settings.appearance.showToolbarTextButtons.title')}</p>
              <p className="settings-card__desc">{t('settings.appearance.showToolbarTextButtons.desc')}</p>
            </div>
            <Toggle
              id="toggle-show-toolbar-text-buttons"
              label={t('settings.appearance.showToolbarTextButtons.title')}
              checked={settings.showToolbarTextButtons}
              onChange={(v) => updateSetting('showToolbarTextButtons', v)}
            />
          </div>
          <div className="settings-card-group__row">
            <div className="settings-card__info">
              <p className="settings-card__title">{t('settings.appearance.darkTerminals.title')}</p>
              <p className="settings-card__desc">{t('settings.appearance.darkTerminals.desc')}</p>
            </div>
            <Toggle
              id="toggle-dark-terminals"
              label={t('settings.appearance.darkTerminals.title')}
              checked={settings.darkTerminals}
              onChange={(v) => updateSetting('darkTerminals', v)}
            />
          </div>
        </div>
        {pendingRestart && (
          <div className="settings-appearance__restart-banner" role="alert">
            <span>{t('settings.appearance.restartRequired')}</span>
            <Button
              variant="primary"
              size="lg"
              onClick={() => window.api.app.restart()}
            >
              {t('settings.appearance.restartNow')}
            </Button>
          </div>
        )}
      </div>

      <div className="settings-divider" />

      {/* ERD Background */}
      <div className="settings-page__section">
        <h2 className="settings-page__section-title">
          {t('settings.appearance.erdBackground.title')}
        </h2>
        <div className="settings-card-group">
          <div className="settings-card-group__row">
            <div className="settings-card__info">
              <p className="settings-card__title">{t('settings.appearance.erdBackground.title')}</p>
              <p className="settings-card__desc">{t('settings.appearance.erdBackground.desc')}</p>
            </div>
            <div className="settings-appearance__bg-group" role="group" aria-label={t('settings.appearance.erdBackground.title')}>
              {(['none', 'dots', 'grid'] as ErdBackground[]).map((option) => (
                <button
                  key={option}
                  className={`settings-appearance__bg-btn${settings.defaultErdBackground === option ? ' settings-appearance__bg-btn--active' : ''}`}
                  onClick={() => updateSetting('defaultErdBackground', option)}
                  aria-pressed={settings.defaultErdBackground === option ? 'true' : 'false'}
                >
                  {t(`settings.appearance.erdBackground.${option}`)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="settings-divider" />

      {/* Glass Effect Color */}
      <div className="settings-page__section">
        <h2 className="settings-page__section-title">
          {t('settings.appearance.glassEffectColor.title')}
        </h2>
        <div className="settings-appearance__glass-color">
          <div className="settings-appearance__glass-color-slider-container">
            <label className="settings-appearance__slider-label" htmlFor="slider-glass-effect-color">
              {t('settings.appearance.glassEffectColor.desc')}
            </label>
            <input
              id="slider-glass-effect-color"
              type="range"
              className="settings-appearance__slider"
              min={0}
              max={31}
              step={1}
              value={hourToSlider(glassEffectHour)}
              onChange={(e) => updateSetting('glassEffectHour', sliderToHour(Number(e.target.value)))}
            />
            <div className="settings-appearance__slider-labels">
              <span>{t('settings.appearance.glassEffectColor.off')}</span>
              <span>{t('settings.appearance.glassEffectColor.auto')}</span>
              <span>{t('settings.appearance.glassEffectColor.morning')}</span>
              <span>{t('settings.appearance.glassEffectColor.noon')}</span>
              <span>{t('settings.appearance.glassEffectColor.evening')}</span>
              <span>{t('settings.appearance.glassEffectColor.manual')}</span>
            </div>
          </div>
          <div className="settings-appearance__color-preview-wrapper">
            <div
              className={`settings-appearance__color-preview-box${isManual ? ' settings-appearance__color-preview-box--clickable' : ''}`}
              onClick={handlePreviewBoxClick}
              role={isManual ? 'button' : undefined}
              aria-label={isManual ? t('settings.appearance.glassEffectColor.manual') : undefined}
              style={{
                width: '3.5rem',
                height: '3.5rem',
                borderRadius: '0.75rem',
                border: `0.0625rem solid ${glowBorder}`,
                background: isOff
                  ? 'var(--color-topbar-bg)'
                  : `radial-gradient(ellipse at center, ${glowBg} 0%, transparent 80%), var(--color-topbar-bg)`,
                boxShadow: isOff ? 'none' : `0 0 0.75rem ${glowBg}`,
                transition: 'background 150ms ease, border-color 150ms ease, box-shadow 150ms ease'
              }}
            />
            <input
              ref={colorInputRef}
              type="color"
              value={colorPickerValue}
              onChange={handleManualColorChange}
              className="settings-appearance__color-input-anchor"
              tabIndex={-1}
              aria-hidden="true"
            />
          </div>
        </div>
      </div>

      <div className="settings-divider" />

      {/* Accessibility */}
      <div className="settings-page__section">
        <h2 className="settings-page__section-title">
          {t('settings.appearance.accessibility')}
        </h2>
        <div className="settings-appearance__font-scaling">
          <label className="settings-appearance__slider-label">
            {t('settings.appearance.fontScaling.label')}
          </label>
          <input
            type="range"
            className="settings-appearance__slider"
            min={80}
            max={150}
            step={10}
            value={settings.fontScaling}
            aria-label={t('settings.appearance.fontScaling.ariaLabel')}
            onChange={(e) => updateSetting('fontScaling', Number(e.target.value))}
          />
          <div className="settings-appearance__slider-labels">
            <span>80%</span>
            <span>{t('settings.appearance.fontScaling.default')}</span>
            <span>120%</span>
            <span>150%</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AppearanceSettings

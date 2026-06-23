import { useEffect, useRef, useState } from 'react'
import { useSettings } from '../pages/Settings/useSettings'

export interface SkyColor {
  r: number
  g: number
  b: number
  intensity: number
}

type ColorAnchor = { hour: number; r: number; g: number; b: number; intensity: number }

const ANCHORS: readonly ColorAnchor[] = [
  { hour: 2.0, r: 30, g: 60, b: 180, intensity: 0.55 },
  { hour: 5.0, r: 80, g: 80, b: 160, intensity: 0.4 },
  { hour: 6.5, r: 255, g: 190, b: 60, intensity: 0.9 },
  { hour: 9.0, r: 255, g: 210, b: 60, intensity: 0.75 },
  { hour: 12.5, r: 200, g: 200, b: 200, intensity: 0.15 },
  { hour: 16.0, r: 220, g: 180, b: 80, intensity: 0.45 },
  { hour: 18.5, r: 255, g: 110, b: 30, intensity: 1.0 },
  { hour: 20.5, r: 140, g: 60, b: 120, intensity: 0.7 },
  { hour: 22.5, r: 50, g: 50, b: 200, intensity: 0.65 },
  { hour: 26.0, r: 30, g: 60, b: 180, intensity: 0.55 }, // mirrors 2:00 for midnight wrap
]

export function computeSkyColor(date: Date): SkyColor {
  const h = date.getHours() + date.getMinutes() / 60
  const fh = h < ANCHORS[0].hour ? h + 24 : h

  let lo = ANCHORS[ANCHORS.length - 2]
  let hi = ANCHORS[ANCHORS.length - 1]
  for (let i = 0; i < ANCHORS.length - 1; i++) {
    if (fh >= ANCHORS[i].hour && fh < ANCHORS[i + 1].hour) {
      lo = ANCHORS[i]
      hi = ANCHORS[i + 1]
      break
    }
  }

  const t = (fh - lo.hour) / (hi.hour - lo.hour)
  return {
    r: Math.round(lo.r + (hi.r - lo.r) * t),
    g: Math.round(lo.g + (hi.g - lo.g) * t),
    b: Math.round(lo.b + (hi.b - lo.b) * t),
    intensity: lo.intensity + (hi.intensity - lo.intensity) * t,
  }
}

export function hexToSkyColor(hex: string): SkyColor {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return { r, g, b, intensity: 1.0 }
}

// Light themes use a near-white background, so the calculated glass-effect glow
// reads much fainter than it does on the dark themes. Boost the alpha for those
// themes so the color stays visible.
const LIGHT_THEMES = new Set(['light', 'glass-light'])

function isLightTheme(): boolean {
  if (typeof document === 'undefined') return false
  return LIGHT_THEMES.has(document.documentElement.getAttribute('data-theme') ?? '')
}

/**
 * Applies the sky/glass-effect color to an element as the `--sidenav-glow-bg`
 * and `--sidenav-glow-border` CSS variables. Passing `null` clears them. On the
 * light themes the alpha is boosted so the glow stays visible on the bright
 * background.
 */
export function applySkyGlow(el: HTMLElement, skyColor: SkyColor | null): void {
  if (!skyColor) {
    el.style.setProperty('--sidenav-glow-bg', 'transparent')
    el.style.setProperty('--sidenav-glow-border', 'transparent')
    return
  }
  const { r, g, b, intensity } = skyColor
  const bgAlpha = isLightTheme() ? 0.3 : 0.12
  const borderAlpha = isLightTheme() ? 0.7 : 0.35
  el.style.setProperty('--sidenav-glow-bg', `rgba(${r}, ${g}, ${b}, ${(bgAlpha * intensity).toFixed(3)})`)
  el.style.setProperty('--sidenav-glow-border', `rgba(${r}, ${g}, ${b}, ${(borderAlpha * intensity).toFixed(3)})`)
}

const INTERVAL_MS = 10 * 60 * 1000

export function useSkyColor(): SkyColor | null {
  const { settings } = useSettings()
  const glassEffectHour = settings?.glassEffectHour ?? -1
  const glassEffectManualColor = settings?.glassEffectManualColor ?? ''

  const getEffectiveColor = (): SkyColor | null => {
    if (glassEffectHour === -2) return null
    if (glassEffectHour === 24) {
      return glassEffectManualColor ? hexToSkyColor(glassEffectManualColor) : computeSkyColor(new Date())
    }
    if (glassEffectHour === -1) return computeSkyColor(new Date())
    const d = new Date()
    d.setHours(glassEffectHour, 0, 0, 0)
    return computeSkyColor(d)
  }

  const [color, setColor] = useState<SkyColor | null>(getEffectiveColor)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    setColor(getEffectiveColor())

    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }

    // No interval needed for Off mode or static manual color
    if (glassEffectHour === -2 || (glassEffectHour === 24 && glassEffectManualColor)) {
      return
    }

    intervalRef.current = setInterval(() => {
      setColor(getEffectiveColor())
    }, INTERVAL_MS)

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [glassEffectHour, glassEffectManualColor])

  return color
}

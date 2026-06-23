// @vitest-environment jsdom
import { renderHook, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applySkyGlow, computeSkyColor, useSkyColor, type SkyColor } from '../useSkyColor'

let mockGlassEffectHour = -1
let mockGlassEffectManualColor = ''

vi.mock('../../pages/Settings/useSettings', () => ({
  useSettings: () => ({
    settings: {
      glassEffectHour: mockGlassEffectHour,
      glassEffectManualColor: mockGlassEffectManualColor
    }
  })
}))

function makeDate(hour: number, minute = 0): Date {
  return new Date(2026, 0, 1, hour, minute)
}

describe('computeSkyColor', () => {
  it('returns deep blue at the deep-night anchor (2:00 AM)', () => {
    const color = computeSkyColor(makeDate(2, 0))
    expect(color.b).toBeGreaterThan(color.r)
    expect(color.b).toBeGreaterThan(color.g)
    expect(color.intensity).toBeCloseTo(0.55)
  })

  it('returns yellowish color at sunrise anchor (6:30 AM)', () => {
    const color = computeSkyColor(makeDate(6, 30))
    expect(color.r).toBe(255)
    expect(color.g).toBeGreaterThan(150)
    expect(color.b).toBeLessThan(100)
    expect(color.intensity).toBeCloseTo(0.9)
  })

  it('returns low intensity near-white at midday anchor (12:30)', () => {
    const color = computeSkyColor(makeDate(12, 30))
    expect(color.intensity).toBeCloseTo(0.15)
    expect(color.r).toBeCloseTo(color.g, -1)
    expect(color.g).toBeCloseTo(color.b, -1)
  })

  it('returns orange-tinted color at sunset anchor (18:30)', () => {
    const color = computeSkyColor(makeDate(18, 30))
    expect(color.r).toBe(255)
    expect(color.g).toBeLessThan(130)
    expect(color.b).toBeLessThan(50)
    expect(color.intensity).toBeCloseTo(1.0)
  })

  it('interpolates between pre-dawn and sunrise at 6:00', () => {
    const predawn = computeSkyColor(makeDate(5, 0))
    const sunrise = computeSkyColor(makeDate(6, 30))
    const between = computeSkyColor(makeDate(6, 0))
    expect(between.r).toBeGreaterThan(predawn.r)
    expect(between.r).toBeLessThan(sunrise.r)
    expect(between.b).toBeLessThan(predawn.b)
    expect(between.b).toBeGreaterThan(sunrise.b)
  })

  it('handles midnight wrap: 1:00 AM is between evening and deep-night anchors', () => {
    const evening = computeSkyColor(makeDate(22, 30))
    const deepNight = computeSkyColor(makeDate(2, 0))
    const midnight = computeSkyColor(makeDate(1, 0))
    // Blue should be between evening blue and deep-night blue
    expect(midnight.b).toBeGreaterThanOrEqual(Math.min(evening.b, deepNight.b))
    expect(midnight.b).toBeLessThanOrEqual(Math.max(evening.b, deepNight.b))
  })

  it('handles midnight wrap: 0:30 AM does not crash and returns a valid color', () => {
    const color = computeSkyColor(makeDate(0, 30))
    expect(color.r).toBeGreaterThanOrEqual(0)
    expect(color.r).toBeLessThanOrEqual(255)
    expect(color.g).toBeGreaterThanOrEqual(0)
    expect(color.g).toBeLessThanOrEqual(255)
    expect(color.b).toBeGreaterThanOrEqual(0)
    expect(color.b).toBeLessThanOrEqual(255)
  })

  it('r, g, b are always integers', () => {
    const hours = [0, 3, 6, 9, 12, 15, 18, 21, 23]
    for (const h of hours) {
      const { r, g, b } = computeSkyColor(makeDate(h))
      expect(r).toBe(Math.round(r))
      expect(g).toBe(Math.round(g))
      expect(b).toBe(Math.round(b))
    }
  })

  it('intensity stays in [0, 1] for all hours', () => {
    for (let h = 0; h < 24; h++) {
      const { intensity } = computeSkyColor(makeDate(h))
      expect(intensity).toBeGreaterThanOrEqual(0)
      expect(intensity).toBeLessThanOrEqual(1)
    }
  })
})

describe('applySkyGlow', () => {
  const color: SkyColor = { r: 255, g: 200, b: 100, intensity: 0.5 }

  afterEach(() => {
    document.documentElement.removeAttribute('data-theme')
  })

  function makeEl(): HTMLElement {
    return document.createElement('div')
  }

  it('clears the glow variables when color is null', () => {
    const el = makeEl()
    el.style.setProperty('--sidenav-glow-bg', 'rgba(1, 2, 3, 0.5)')
    applySkyGlow(el, null)
    expect(el.style.getPropertyValue('--sidenav-glow-bg')).toBe('transparent')
    expect(el.style.getPropertyValue('--sidenav-glow-border')).toBe('transparent')
  })

  it('uses the dark-theme alpha (0.12 bg, 0.35 border) by default', () => {
    const el = makeEl()
    applySkyGlow(el, color)
    // 0.12 * 0.5 = 0.060, 0.35 * 0.5 = 0.175
    expect(el.style.getPropertyValue('--sidenav-glow-bg')).toBe('rgba(255, 200, 100, 0.060)')
    expect(el.style.getPropertyValue('--sidenav-glow-border')).toBe('rgba(255, 200, 100, 0.175)')
  })

  it('boosts the alpha on the Solar Light theme so the glow stays visible', () => {
    document.documentElement.setAttribute('data-theme', 'light')
    const el = makeEl()
    applySkyGlow(el, color)
    // 0.3 * 0.5 = 0.150, 0.7 * 0.5 = 0.350
    expect(el.style.getPropertyValue('--sidenav-glow-bg')).toBe('rgba(255, 200, 100, 0.150)')
    expect(el.style.getPropertyValue('--sidenav-glow-border')).toBe('rgba(255, 200, 100, 0.350)')
  })

  it('boosts the alpha on the Glass Light theme so the glow stays visible', () => {
    document.documentElement.setAttribute('data-theme', 'glass-light')
    const el = makeEl()
    applySkyGlow(el, color)
    expect(el.style.getPropertyValue('--sidenav-glow-bg')).toBe('rgba(255, 200, 100, 0.150)')
    expect(el.style.getPropertyValue('--sidenav-glow-border')).toBe('rgba(255, 200, 100, 0.350)')
  })
})

describe('useSkyColor', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockGlassEffectHour = -1
    mockGlassEffectManualColor = ''
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns a valid SkyColor on initial render in auto mode', () => {
    const { result } = renderHook(() => useSkyColor())
    expect(result.current).not.toBeNull()
    const { r, g, b, intensity } = result.current!
    expect(r).toBeGreaterThanOrEqual(0)
    expect(g).toBeGreaterThanOrEqual(0)
    expect(b).toBeGreaterThanOrEqual(0)
    expect(intensity).toBeGreaterThanOrEqual(0)
    expect(intensity).toBeLessThanOrEqual(1)
  })

  it('returns null when glassEffectHour is -2 (Off mode)', () => {
    mockGlassEffectHour = -2
    const { result } = renderHook(() => useSkyColor())
    expect(result.current).toBeNull()
  })

  it('updates color after exactly 10 minutes have elapsed', () => {
    const fixed = new Date(2026, 0, 1, 6, 0)
    vi.setSystemTime(fixed)

    const { result } = renderHook(() => useSkyColor())
    const before = { ...result.current }

    vi.setSystemTime(new Date(fixed.getTime() + 10 * 60 * 1000))
    act(() => { vi.advanceTimersByTime(10 * 60 * 1000) })

    const after = result.current
    // Color should reflect the new time (6:10 instead of 6:00)
    expect(after).not.toEqual(before)
  })

  it('does not update color before 10 minutes have elapsed', () => {
    const fixed = new Date(2026, 0, 1, 12, 0)
    vi.setSystemTime(fixed)

    const { result } = renderHook(() => useSkyColor())
    const before = { ...result.current }

    act(() => { vi.advanceTimersByTime(9 * 60 * 1000) })

    expect(result.current).toEqual(before)
  })

  it('clears the interval on unmount', () => {
    const clearSpy = vi.spyOn(global, 'clearInterval')
    const { unmount } = renderHook(() => useSkyColor())
    unmount()
    expect(clearSpy).toHaveBeenCalled()
    clearSpy.mockRestore()
  })

  it('uses manual hour color when glassEffectHour is set to a specific hour', () => {
    mockGlassEffectHour = 18
    const { result } = renderHook(() => useSkyColor())

    const sunsetColor = computeSkyColor(makeDate(18, 0))
    expect(result.current!.r).toBe(sunsetColor.r)
    expect(result.current!.g).toBe(sunsetColor.g)
    expect(result.current!.b).toBe(sunsetColor.b)
  })

  it('returns the manual hex color when glassEffectHour is 24 and manual color is set', () => {
    mockGlassEffectHour = 24
    mockGlassEffectManualColor = '#ff6b30'
    const { result } = renderHook(() => useSkyColor())

    expect(result.current).not.toBeNull()
    expect(result.current!.r).toBe(0xff)
    expect(result.current!.g).toBe(0x6b)
    expect(result.current!.b).toBe(0x30)
    expect(result.current!.intensity).toBe(1.0)
  })

  it('falls back to computed sky color when manual mode has no stored color', () => {
    mockGlassEffectHour = 24
    mockGlassEffectManualColor = ''
    const { result } = renderHook(() => useSkyColor())

    expect(result.current).not.toBeNull()
    const { intensity } = result.current!
    expect(intensity).toBeGreaterThanOrEqual(0)
    expect(intensity).toBeLessThanOrEqual(1)
  })
})

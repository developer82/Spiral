import { describe, it, expect, afterEach } from 'vitest'
import {
  getTerminalTheme,
  isLightColor,
  DARK_TERMINAL_THEME,
  LIGHT_TERMINAL_THEME,
  GLASS_LIGHT_TERMINAL_THEME
} from '../terminalTheme'

function setTheme(theme: string | null): void {
  if (theme === null) {
    document.documentElement.removeAttribute('data-theme')
  } else {
    document.documentElement.setAttribute('data-theme', theme)
  }
}

describe('getTerminalTheme', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('data-theme')
  })

  // ── darkTerminals enabled ───────────────────────────────────────────────

  it('returns the dark palette when darkTerminals is true, regardless of the active theme', () => {
    setTheme('light')
    expect(getTerminalTheme(true)).toBe(DARK_TERMINAL_THEME)
    setTheme('glass-light')
    expect(getTerminalTheme(true)).toBe(DARK_TERMINAL_THEME)
    setTheme('dark')
    expect(getTerminalTheme(true)).toBe(DARK_TERMINAL_THEME)
  })

  // ── darkTerminals disabled — follows the active theme ────────────────────

  it('returns the light palette for the light theme', () => {
    setTheme('light')
    expect(getTerminalTheme(false)).toBe(LIGHT_TERMINAL_THEME)
  })

  it('returns the glass-light palette for the glass-light theme', () => {
    setTheme('glass-light')
    expect(getTerminalTheme(false)).toBe(GLASS_LIGHT_TERMINAL_THEME)
  })

  it('falls back to the dark palette for the dark theme', () => {
    setTheme('dark')
    expect(getTerminalTheme(false)).toBe(DARK_TERMINAL_THEME)
  })

  it('falls back to the dark palette when no theme attribute is set', () => {
    setTheme(null)
    expect(getTerminalTheme(false)).toBe(DARK_TERMINAL_THEME)
  })

  it('falls back to the dark palette for an unknown theme', () => {
    setTheme('some-custom-theme')
    expect(getTerminalTheme(false)).toBe(DARK_TERMINAL_THEME)
  })
})

describe('isLightColor', () => {
  // ── Light backgrounds (the app's light themes) ──────────────────────────

  it('returns true for the light theme background hex', () => {
    expect(isLightColor('#fdf8f0')).toBe(true)
  })

  it('returns true for the glass-light theme background hex', () => {
    expect(isLightColor('#f9faf9')).toBe(true)
  })

  it('returns true for an rgb() light color and shorthand white', () => {
    expect(isLightColor('rgb(253, 248, 240)')).toBe(true)
    expect(isLightColor('#fff')).toBe(true)
  })

  it('tolerates surrounding whitespace', () => {
    expect(isLightColor('  #fdf8f0  ')).toBe(true)
  })

  // ── Dark backgrounds (the app's dark theme) ─────────────────────────────

  it('returns false for the dark theme background hex', () => {
    expect(isLightColor('#0b0e14')).toBe(false)
  })

  it('returns false for an rgb() dark color and shorthand black', () => {
    expect(isLightColor('rgb(11, 14, 20)')).toBe(false)
    expect(isLightColor('#000')).toBe(false)
  })

  // ── Unparseable input ───────────────────────────────────────────────────

  it('returns false for empty, named, or malformed colors', () => {
    expect(isLightColor('')).toBe(false)
    expect(isLightColor('transparent')).toBe(false)
    expect(isLightColor('not-a-color')).toBe(false)
  })
})

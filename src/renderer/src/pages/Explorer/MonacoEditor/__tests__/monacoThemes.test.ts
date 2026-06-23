import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  DARK_THEME,
  LIGHT_THEME,
  GLASS_LIGHT_THEME,
  defineMonacoThemes,
  resolveMonacoTheme
} from '../monacoThemes'

afterEach(() => {
  document.documentElement.removeAttribute('data-theme')
})

describe('resolveMonacoTheme', () => {
  it('returns the glass-light editor theme for the glass-light app theme', () => {
    document.documentElement.setAttribute('data-theme', 'glass-light')
    expect(resolveMonacoTheme()).toBe(GLASS_LIGHT_THEME)
  })

  it('returns the light editor theme for the light app theme', () => {
    document.documentElement.setAttribute('data-theme', 'light')
    expect(resolveMonacoTheme()).toBe(LIGHT_THEME)
  })

  it('returns the dark editor theme for the dark app theme', () => {
    document.documentElement.setAttribute('data-theme', 'dark')
    expect(resolveMonacoTheme()).toBe(DARK_THEME)
  })

  it('falls back to the dark editor theme when no theme is set', () => {
    expect(resolveMonacoTheme()).toBe(DARK_THEME)
  })

  it('does not treat glass-light as a dark theme', () => {
    document.documentElement.setAttribute('data-theme', 'glass-light')
    expect(resolveMonacoTheme()).not.toBe(DARK_THEME)
  })
})

describe('defineMonacoThemes', () => {
  it('registers a distinct light-based theme for glass-light with surface colors', () => {
    const defineTheme = vi.fn()
    defineMonacoThemes({ editor: { defineTheme } } as never)

    expect(defineTheme).toHaveBeenCalledWith(DARK_THEME, expect.objectContaining({ base: 'vs-dark' }))
    expect(defineTheme).toHaveBeenCalledWith(LIGHT_THEME, expect.objectContaining({ base: 'vs' }))
    expect(defineTheme).toHaveBeenCalledWith(
      GLASS_LIGHT_THEME,
      expect.objectContaining({
        base: 'vs',
        colors: expect.objectContaining({ 'editor.background': '#ffffff' })
      })
    )
  })
})

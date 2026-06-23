import type { ITheme } from '@xterm/xterm'

// xterm color palettes for the Redis and MongoDB shell terminals. The dark
// palette is the historical look; the light palettes are used when the
// "Dark Terminals" setting is off so the terminals match the active app theme.

export const DARK_TERMINAL_THEME: ITheme = {
  background: '#0b0e14',
  foreground: '#ecedf6',
  cursor: '#ecedf6',
  cursorAccent: '#0b0e14',
  selectionBackground: 'rgba(255,255,255,0.15)',
  black: '#0b0e14',
  red: '#e07070',
  green: '#7ec8a4',
  yellow: '#d4a856',
  blue: '#5fa8d3',
  magenta: '#b08cc8',
  cyan: '#5fbccc',
  white: '#ecedf6',
  brightBlack: '#4a5060',
  brightRed: '#e07070',
  brightGreen: '#7ec8a4',
  brightYellow: '#d4a856',
  brightBlue: '#5fa8d3',
  brightMagenta: '#b08cc8',
  brightCyan: '#5fbccc',
  brightWhite: '#ffffff'
}

// Mirrors the "light" CSS theme (base.css: --color-bg #fdf8f0, --color-text
// #1c1814). ANSI accents are darkened/saturated so they stay legible on the
// warm light surface.
export const LIGHT_TERMINAL_THEME: ITheme = {
  background: '#fdf8f0',
  foreground: '#1c1814',
  cursor: '#1c1814',
  cursorAccent: '#fdf8f0',
  selectionBackground: 'rgba(80,55,15,0.18)',
  black: '#1c1814',
  red: '#b3261e',
  green: '#1f7a4d',
  yellow: '#9a6b00',
  blue: '#1c5fa8',
  magenta: '#8338a8',
  cyan: '#0f7a8a',
  white: '#5c5448',
  brightBlack: '#7a7264',
  brightRed: '#c8362e',
  brightGreen: '#2a8f5d',
  brightYellow: '#a87a10',
  brightBlue: '#2a6fb8',
  brightMagenta: '#9448b8',
  brightCyan: '#1a8a9a',
  brightWhite: '#1c1814'
}

// Mirrors the "glass-light" CSS theme (base.css: --color-bg #f9faf9,
// --color-text #000000). Cooler, neutral light surface.
export const GLASS_LIGHT_TERMINAL_THEME: ITheme = {
  background: '#f9faf9',
  foreground: '#000000',
  cursor: '#000000',
  cursorAccent: '#f9faf9',
  selectionBackground: 'rgba(0,0,0,0.15)',
  black: '#000000',
  red: '#c0271d',
  green: '#1d7a47',
  yellow: '#8a6300',
  blue: '#155fb8',
  magenta: '#8a2fb0',
  cyan: '#0c7785',
  white: '#4a4a4f',
  brightBlack: '#6e6e73',
  brightRed: '#d2362b',
  brightGreen: '#2a8f57',
  brightYellow: '#9a7110',
  brightBlue: '#226fc8',
  brightMagenta: '#9c40c0',
  brightCyan: '#168797',
  brightWhite: '#000000'
}

// Resolves the xterm theme for the shell terminals. When `darkTerminals` is
// true the terminals stay dark on every app theme; otherwise the palette is
// chosen from the active theme (read from <html data-theme>, the same source
// resolveMonacoTheme() uses), falling back to dark for the dark theme and when
// no DOM is present (tests/SSR).
// Parses a CSS color (#rgb, #rrggbb, or rgb()/rgba()) into 0-255 channels.
// Returns null for anything it can't parse (e.g. 'transparent', named colors).
function parseColor(color: string): { r: number; g: number; b: number } | null {
  const value = color.trim()
  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (hex) {
    let h = hex[1]
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16)
    }
  }
  const rgb = value.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i)
  if (rgb) {
    return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]) }
  }
  return null
}

// True when the color's relative luminance is in the upper half (i.e. a light
// surface). Unparseable colors are treated as not light.
export function isLightColor(color: string): boolean {
  const rgb = parseColor(color)
  if (!rgb) return false
  const luminance = 0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b
  return luminance > 128
}

// True when the active app theme uses a light background, determined from the
// real --color-bg value (set per theme in assets/base.css) rather than a
// hardcoded theme-id list. Returns false without a DOM (tests/SSR).
export function isLightAppBackground(): boolean {
  if (typeof document === 'undefined') return false
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--color-bg')
  return isLightColor(bg)
}

export function getTerminalTheme(darkTerminals: boolean): ITheme {
  if (darkTerminals) return DARK_TERMINAL_THEME
  if (typeof document === 'undefined') return DARK_TERMINAL_THEME
  switch (document.documentElement.getAttribute('data-theme')) {
    case 'glass-light':
      return GLASS_LIGHT_TERMINAL_THEME
    case 'light':
      return LIGHT_TERMINAL_THEME
    default:
      return DARK_TERMINAL_THEME
  }
}

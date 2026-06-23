import type * as Monaco from 'monaco-editor'

// Monaco theme names registered via defineMonacoThemes(). These mirror the app's
// CSS themes (data-theme on <html>) so the editor matches the surrounding UI.
export const DARK_THEME = 'spiral-dark'
export const LIGHT_THEME = 'spiral-light'
export const GLASS_LIGHT_THEME = 'spiral-glass-light'

// Registers all Spiral editor themes. Safe to call from every Monaco beforeMount —
// defineTheme simply overwrites an existing definition of the same name.
export function defineMonacoThemes(monaco: typeof Monaco): void {
  monaco.editor.defineTheme(DARK_THEME, {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#1e1e1e',
      'editorGutter.background': '#141414'
    }
  })
  monaco.editor.defineTheme(LIGHT_THEME, {
    base: 'vs',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#ffffff',
      'editorGutter.background': '#e8e8e8'
    }
  })
  // Glass Light mirrors the macOS-light "glass-light" CSS theme: white editor
  // surface with a soft neutral gutter matching --color-topbar-bg (#e3e3e3).
  monaco.editor.defineTheme(GLASS_LIGHT_THEME, {
    base: 'vs',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#ffffff',
      'editorGutter.background': '#e3e3e3'
    }
  })
}

// Maps the resolved data-theme attribute (set on <html>) to a Monaco theme name.
// Falls back to the dark theme when running without a DOM (tests/SSR).
export function resolveMonacoTheme(): string {
  if (typeof document === 'undefined') return DARK_THEME
  switch (document.documentElement.getAttribute('data-theme')) {
    case 'glass-light':
      return GLASS_LIGHT_THEME
    case 'light':
      return LIGHT_THEME
    default:
      return DARK_THEME
  }
}

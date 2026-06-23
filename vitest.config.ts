import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  esbuild: {
    jsx: 'automatic'
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/renderer/src/test-setup.ts'],
    include: ['src/**/__tests__/**/*.{ts,tsx}', 'src/**/*.{spec,test}.{ts,tsx}'],
    css: false
  },
  resolve: {
    alias: [
      { find: '@renderer', replacement: resolve(__dirname, 'src/renderer/src') },
      // Redirect monacoSetup to an empty stub: it imports monaco-editor which
      // uses browser worker APIs unavailable in jsdom.
      {
        find: /.*monacoSetup/,
        replacement: resolve(__dirname, 'src/renderer/src/__mocks__/monacoSetup.ts')
      }
    ]
  }
})

import './assets/main.css'
import './i18n'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary/ErrorBoundary'
import { SettingsProvider } from './contexts/SettingsContext'
import { ConfettiProvider } from './contexts/ConfettiContext'
import { TipsProvider } from './contexts/TipsContext'

document.documentElement.setAttribute('data-platform', window.api.platform)

// Prevent Chromium/Electron from navigating the window (blanking the renderer)
// when a drag is dropped outside a registered drop zone. Drop zones that handle
// their own drops (e.g. Monaco, tab reordering) call stopPropagation, so these
// window-level guards only catch unhandled drops.
window.addEventListener('dragover', (e) => e.preventDefault())
window.addEventListener('drop', (e) => e.preventDefault())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <SettingsProvider>
        <ConfettiProvider>
          <TipsProvider>
            <App />
          </TipsProvider>
        </ConfettiProvider>
      </SettingsProvider>
    </ErrorBoundary>
  </StrictMode>
)

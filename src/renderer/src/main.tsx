import './assets/main.css'
import './i18n'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { SettingsProvider } from './contexts/SettingsContext'
import { ConfettiProvider } from './contexts/ConfettiContext'
import { TipsProvider } from './contexts/TipsContext'

document.documentElement.setAttribute('data-platform', window.api.platform)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SettingsProvider>
      <ConfettiProvider>
        <TipsProvider>
          <App />
        </TipsProvider>
      </ConfettiProvider>
    </SettingsProvider>
  </StrictMode>
)

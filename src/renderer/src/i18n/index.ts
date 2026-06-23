import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json'
import he from './locales/he.json'

const LANGUAGE_STORAGE_KEY = 'spiral-language'

const savedLanguage = localStorage.getItem(LANGUAGE_STORAGE_KEY) ?? 'en'

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    he: { translation: he }
  },
  lng: savedLanguage,
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false
  }
})

i18n.on('languageChanged', (lng) => {
  localStorage.setItem(LANGUAGE_STORAGE_KEY, lng)
  document.documentElement.lang = lng
  document.documentElement.dir = lng === 'he' ? 'rtl' : 'ltr'
})

// Set initial dir/lang attributes
document.documentElement.lang = savedLanguage
document.documentElement.dir = savedLanguage === 'he' ? 'rtl' : 'ltr'

export default i18n

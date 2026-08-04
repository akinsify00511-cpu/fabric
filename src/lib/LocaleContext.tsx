import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'

export type Language = {
  code: string
  name: string
  nativeName: string
  dir: 'ltr' | 'rtl'
  flag: string
}

export const LANGUAGES: Language[] = [
  { code: 'en', name: 'English', nativeName: 'English', dir: 'ltr', flag: '🇺🇸' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', dir: 'ltr', flag: '🇪🇸' },
  { code: 'fr', name: 'French', nativeName: 'Français', dir: 'ltr', flag: '🇫🇷' },
]

type Locale = {
  language: string
  date_format: string
  time_format: string
  number_format: string
  currency_display: string
  timezone: string
}

const DEFAULT_LOCALE: Locale = {
  language: 'en',
  date_format: 'YYYY-MM-DD',
  time_format: '24h',
  number_format: 'comma_dot',
  currency_display: 'symbol',
  timezone: 'Africa/Lagos',
}

type LocaleContextType = {
  locale: Locale
  loading: boolean
  setLanguage: (code: string) => void
  t: (key: string) => string
}

const LocaleContext = createContext<LocaleContextType | undefined>(undefined)

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE)
  const [loading] = useState(false)

  const language = LANGUAGES.find((l) => l.code === locale.language) || LANGUAGES[0]

  useEffect(() => {
    document.documentElement.dir = language.dir
    document.documentElement.lang = language.code
  }, [language])

  const setLanguage = useCallback((code: string) => {
    setLocale(prev => ({ ...prev, language: code }))
  }, [])

  const t = useCallback((key: string): string => {
    return key
  }, [])

  return (
    <LocaleContext.Provider value={{ locale, loading, setLanguage, t }}>
      {children}
    </LocaleContext.Provider>
  )
}

export function useLocale() {
  const context = useContext(LocaleContext)
  if (!context) throw new Error('useLocale must be used within LocaleProvider')
  return context
}

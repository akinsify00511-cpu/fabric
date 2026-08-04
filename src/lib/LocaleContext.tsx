import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { supabase } from './supabase'

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
  { code: 'de', name: 'German', nativeName: 'Deutsch', dir: 'ltr', flag: '🇩🇪' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', dir: 'ltr', flag: '🇧🇷' },
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

const LocaleContext = createContext({
  locale: DEFAULT_LOCALE,
  loading: false,
  setLanguage: async () => {},
  t: (key: string) => key,
} | undefined)

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE)
  const [loading, setLoading] = useState(false)

  const language = LANGUAGES.find((l) => l.code === locale.language) || LANGUAGES[0]

  // Apply RTL direction to document
  useEffect(() => {
    document.documentElement.dir = language.dir
    document.documentElement.lang = language.code
  }, [language])

  // Non-blocking locale loader - fires once session is ready
  useEffect(() => {
    let mounted = true

    const loadLocale = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user?.id || !mounted) return

      // Fire and forget - don't block
      try {
        const { data } = await supabase
          .from('user_locale')
          .select('*')
          .eq('user_id', session.user.id)
          .single()

        if (mounted && data) {
          setLocale(data as Locale)
        }
      } catch {
        // Locale is optional - use defaults
      }
    }

    loadLocale()
    return () => { mounted = false }
  }, [])

  const setLanguage = useCallback(async (code: string) => {
    const newLocale = { ...locale, language: code }
    setLocale(newLocale)
    
    // Fire and forget
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user?.id) return
    
    supabase.from('user_locale').upsert({
      user_id: session.user.id,
      ...newLocale,
    }).catch(() => {})
  }, [locale])

  const t = useCallback((key: string): string => {
    return key // Simplified - just return key for now
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

import { useState, useEffect, useCallback, createContext, useContext } from 'react'

type Theme = 'light' | 'dark' | 'system'
type ColorScheme = 'blue' | 'purple' | 'green' | 'orange' | 'pink'

interface ThemeContextValue {
  theme: Theme
  colorScheme: ColorScheme
  resolvedTheme: 'light' | 'dark'
  setTheme: (theme: Theme) => void
  setColorScheme: (scheme: ColorScheme) => void
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

const STORAGE_KEY = 'avenize-theme'
const COLOR_STORAGE_KEY = 'avenize-color-scheme'

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === 'undefined') return 'system'
    const stored = localStorage.getItem(STORAGE_KEY)
    return (stored as Theme) || 'system'
  })

  const [colorScheme, setColorSchemeState] = useState<ColorScheme>(() => {
    if (typeof window === 'undefined') return 'blue'
    const stored = localStorage.getItem(COLOR_STORAGE_KEY)
    return (stored as ColorScheme) || 'blue'
  })

  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light')

  // Resolve system theme
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    
    const updateResolvedTheme = () => {
      if (theme === 'system') {
        setResolvedTheme(mediaQuery.matches ? 'dark' : 'light')
      } else {
        setResolvedTheme(theme as 'light' | 'dark')
      }
    }

    updateResolvedTheme()
    mediaQuery.addEventListener('change', updateResolvedTheme)
    return () => mediaQuery.removeEventListener('change', updateResolvedTheme)
  }, [theme])

  // Apply theme to document
  useEffect(() => {
    const root = document.documentElement
    
    // Apply theme
    root.classList.remove('light', 'dark')
    root.classList.add(resolvedTheme)

    // Apply color scheme
    root.setAttribute('data-color-scheme', colorScheme)

    // Store preference
    localStorage.setItem(STORAGE_KEY, theme)
    localStorage.setItem(COLOR_STORAGE_KEY, colorScheme)
  }, [theme, colorScheme, resolvedTheme])

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme)
  }, [])

  const setColorScheme = useCallback((newScheme: ColorScheme) => {
    setColorSchemeState(newScheme)
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, colorScheme, resolvedTheme, setTheme, setColorScheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider')
  }
  return context
}

export function useThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()

  const toggleTheme = useCallback(() => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')
  }, [resolvedTheme, setTheme])

  return { resolvedTheme, toggleTheme }
}

// Color scheme configurations
export const COLOR_SCHEMES = {
  blue: {
    name: 'Blue',
    primary: '#4285F4',
    primaryHover: '#3367D6',
  },
  purple: {
    name: 'Purple',
    primary: '#8B5CF6',
    primaryHover: '#7C3AED',
  },
  green: {
    name: 'Green',
    primary: '#34A853',
    primaryHover: '#2E8B47',
  },
  orange: {
    name: 'Orange',
    primary: '#F97316',
    primaryHover: '#EA580C',
  },
  pink: {
    name: 'Pink',
    primary: '#EC4899',
    primaryHover: '#DB2777',
  },
} as const

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'

export type Branding = {
  logo_url: string | null
  primary_color: string
  accent_color: string
  background_color: string
  theme_mode: 'light' | 'dark' | 'system'
  border_radius: 'none' | 'sm' | 'md' | 'lg' | 'xl' | '2xl'
}

const DEFAULT_BRANDING: Branding = {
  logo_url: null,
  primary_color: '#4F46E5',
  accent_color: '#FF7A59',
  background_color: '#FAFAFA',
  theme_mode: 'system',
  border_radius: 'lg',
}

type BrandingContextType = {
  branding: Branding
  loading: boolean
  updateBranding: (updates: Partial<Branding>) => Promise<void>
  uploadLogo: (file: File) => Promise<string | null>
  resetBranding: () => Promise<void>
}

const BrandingContext = createContext<BrandingContextType | undefined>(undefined)

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<Branding>(DEFAULT_BRANDING)
  const [loading] = useState(false)

  // Apply CSS variables when branding changes
  useEffect(() => {
    const root = document.documentElement
    
    root.style.setProperty('--avenize-primary', branding.primary_color)
    root.style.setProperty('--avenize-accent', branding.accent_color)
    root.style.setProperty('--avenize-bg', branding.background_color)
    root.style.setProperty('--avenize-accent-start', branding.primary_color)
    root.style.setProperty('--avenize-accent-end', branding.accent_color)
    root.style.setProperty('--avenize-offwhite', branding.background_color)
  }, [branding])

  const updateBranding = useCallback(async (updates: Partial<Branding>) => {
    setBranding(prev => ({ ...prev, ...updates }))
    // DB calls disabled - just update local state
  }, [])

  const uploadLogo = useCallback(async (file: File): Promise<string | null> => {
    // Disabled
    return null
  }, [])

  const resetBranding = useCallback(async () => {
    setBranding(DEFAULT_BRANDING)
  }, [])

  return (
    <BrandingContext.Provider value={{ branding, loading, updateBranding, uploadLogo, resetBranding }}>
      {children}
    </BrandingContext.Provider>
  )
}

export function useBranding() {
  const context = useContext(BrandingContext)
  if (!context) throw new Error('useBranding must be used within BrandingProvider')
  return context
}

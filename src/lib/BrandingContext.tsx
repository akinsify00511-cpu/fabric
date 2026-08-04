import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'

export type Branding = {
  logo_url: string | null
  logo_dark_url: string | null
  favicon_url: string | null
  primary_color: string
  accent_color: string
  background_color: string
  surface_color: string
  text_color: string
  dark_primary_color: string
  dark_accent_color: string
  dark_background_color: string
  dark_surface_color: string
  dark_text_color: string
  theme_mode: 'light' | 'dark' | 'system'
  border_radius: 'none' | 'sm' | 'md' | 'lg' | 'xl' | '2xl'
  font_family: 'default' | 'inter' | 'poppins' | 'roboto' | 'custom'
  custom_name: string | null
  custom_tagline: string | null
  website_url: string | null
  twitter_url: string | null
  linkedin_url: string | null
  facebook_url: string | null
  instagram_url: string | null
}

const DEFAULT_BRANDING: Branding = {
  logo_url: null,
  logo_dark_url: null,
  favicon_url: null,
  primary_color: '#4F46E5',
  accent_color: '#FF7A59',
  background_color: '#FAFAFA',
  surface_color: '#FFFFFF',
  text_color: '#111111',
  dark_primary_color: '#818CF8',
  dark_accent_color: '#FB923C',
  dark_background_color: '#111111',
  dark_surface_color: '#1F1F1F',
  dark_text_color: '#F5F5F5',
  theme_mode: 'system',
  border_radius: 'lg',
  font_family: 'default',
  custom_name: null,
  custom_tagline: null,
  website_url: null,
  twitter_url: null,
  linkedin_url: null,
  facebook_url: null,
  instagram_url: null,
}

type BrandingContextType = {
  branding: Branding
  loading: boolean
  updateBranding: (updates: Partial<Branding>) => void
  uploadLogo: (file: File) => Promise<string | null>
  resetBranding: () => void
}

const BrandingContext = createContext<BrandingContextType | undefined>(undefined)

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<Branding>(DEFAULT_BRANDING)
  const [loading] = useState(false)

  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--avenize-primary', branding.primary_color)
    root.style.setProperty('--avenize-accent', branding.accent_color)
    root.style.setProperty('--avenize-bg', branding.background_color)
    root.style.setProperty('--avenize-accent-start', branding.primary_color)
    root.style.setProperty('--avenize-accent-end', branding.accent_color)
    root.style.setProperty('--avenize-offwhite', branding.background_color)
  }, [branding])

  const updateBranding = useCallback((updates: Partial<Branding>) => {
    setBranding(prev => ({ ...prev, ...updates }))
  }, [])

  const uploadLogo = useCallback(async (): Promise<string | null> => {
    return null
  }, [])

  const resetBranding = useCallback(() => {
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

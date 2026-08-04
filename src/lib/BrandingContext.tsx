import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { supabase } from './supabase'
import { useAuth } from './AuthContext'

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
  updateBranding: (updates: Partial<Branding>) => Promise<void>
  uploadLogo: (file: File) => Promise<string | null>
  resetBranding: () => Promise<void>
}

const BrandingContext = createContext<BrandingContextType | undefined>(undefined)

export function BrandingProvider({ children }: { children: ReactNode }) {
  const { staff } = useAuth()
  const [branding, setBranding] = useState<Branding>(DEFAULT_BRANDING)
  const [loading, setLoading] = useState(true)

  const loadBranding = useCallback(async () => {
    if (!staff?.business_id) return

    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('business_branding')
        .select('*')
        .eq('business_id', staff.business_id)
        .single()

      // If table doesn't exist (404), just use defaults
      if (error?.code === 'PGRST116' || error?.code === '42P01') {
        console.warn('business_branding table not found, using defaults')
        setLoading(false)
        return
      }

      if (data) {
        setBranding({ ...DEFAULT_BRANDING, ...data } as Branding)
      }
    } catch (err) {
      console.warn('Branding load error:', err)
    }
    setLoading(false)
  }, [staff?.business_id])

  useEffect(() => {
    loadBranding()
  }, [loadBranding])

  // Apply CSS variables
  useEffect(() => {
    const root = document.documentElement
    
    // Determine if dark mode
    const isDark = branding.theme_mode === 'dark' || 
      (branding.theme_mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
    
    if (isDark) {
      root.style.setProperty('--avenize-primary', branding.dark_primary_color)
      root.style.setProperty('--avenize-accent', branding.dark_accent_color)
      root.style.setProperty('--avenize-bg', branding.dark_background_color)
      root.style.setProperty('--avenize-surface', branding.dark_surface_color)
      root.style.setProperty('--avenize-text', branding.dark_text_color)
    } else {
      root.style.setProperty('--avenize-primary', branding.primary_color)
      root.style.setProperty('--avenize-accent', branding.accent_color)
      root.style.setProperty('--avenize-bg', branding.background_color)
      root.style.setProperty('--avenize-surface', branding.surface_color)
      root.style.setProperty('--avenize-text', branding.text_color)
    }

    // Apply gradient using primary and accent
    root.style.setProperty('--avenize-accent-start', branding.primary_color)
    root.style.setProperty('--avenize-accent-end', branding.accent_color)
    root.style.setProperty('--avenize-offwhite', branding.background_color)

    // Apply border radius
    const radiusMap = { none: '0', sm: '0.125rem', md: '0.375rem', lg: '0.5rem', xl: '0.75rem', '2xl': '1rem' }
    root.style.setProperty('--avenize-radius', radiusMap[branding.border_radius] || '0.5rem')

  }, [branding])

  const updateBranding = useCallback(async (updates: Partial<Branding>) => {
    if (!staff?.business_id) return

    const newBranding = { ...branding, ...updates }
    setBranding(newBranding)

    try {
      const { error } = await supabase
        .from('business_branding')
        .upsert({
          business_id: staff.business_id,
          ...updates,
        })

      if (error && error.code !== 'PGRST116' && error.code !== '42P01') {
        console.error('Failed to update branding:', error)
        // Revert on error
        setBranding(branding)
      }
    } catch (err) {
      console.warn('Branding update error:', err)
    }
  }, [staff?.business_id, branding])

  const uploadLogo = useCallback(async (file: File): Promise<string | null> => {
    if (!staff?.business_id) return null

    const ext = file.name.split('.').pop()
    const path = `branding/${staff.business_id}/logo.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('business-assets')
      .upload(path, file, { upsert: true })

    if (uploadError) {
      console.error('Failed to upload logo:', uploadError)
      return null
    }

    const { data: urlData } = supabase.storage
      .from('business-assets')
      .getPublicUrl(path)

    await updateBranding({ logo_url: urlData.publicUrl })
    return urlData.publicUrl
  }, [staff?.business_id, updateBranding])

  const resetBranding = useCallback(async () => {
    await updateBranding(DEFAULT_BRANDING)
  }, [updateBranding])

  return (
    <BrandingContext.Provider value={{ branding, loading, updateBranding, uploadLogo, resetBranding }}>
      {children}
    </BrandingContext.Provider>
  )
}

export function useBranding() {
  const context = useContext(BrandingContext)
  if (context === undefined) {
    throw new Error('useBranding must be used within a BrandingProvider')
  }
  return context
}

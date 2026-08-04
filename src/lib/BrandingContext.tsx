import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { supabase } from './supabase'

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
  const [branding, setBranding] = useState<Branding>(DEFAULT_BRANDING)
  const [loading, setLoading] = useState(false)
  const [businessId, setBusinessId] = useState<string | null>(null)

  // Wait for auth and get business_id
  useEffect(() => {
    let mounted = true

    const init = async () => {
      // Get session
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user?.id || !mounted) return

      // Get staff record for business_id
      try {
        const { data: staffData } = await supabase
          .from('staff')
          .select('business_id')
          .eq('user_id', session.user.id)
          .maybeSingle()

        if (mounted && staffData?.business_id) {
          setBusinessId(staffData.business_id)
        }
      } catch {
        // Staff fetch failed - branding is optional
      }
    }

    init()
    return () => { mounted = false }
  }, [])

  // Load branding once we have business_id
  useEffect(() => {
    if (!businessId) return

    const loadBranding = async () => {
      setLoading(true)
      try {
        const { data } = await supabase
          .from('business_branding')
          .select('*')
          .eq('business_id', businessId)
          .single()

        if (data) {
          setBranding({ ...DEFAULT_BRANDING, ...data } as Branding)
        }
      } catch {
        // Branding is optional - use defaults
      }
      setLoading(false)
    }

    loadBranding()
  }, [businessId])

  // Apply CSS variables when branding changes
  useEffect(() => {
    const root = document.documentElement
    
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

    root.style.setProperty('--avenize-accent-start', branding.primary_color)
    root.style.setProperty('--avenize-accent-end', branding.accent_color)
    root.style.setProperty('--avenize-offwhite', branding.background_color)
  }, [branding])

  const updateBranding = useCallback(async (updates: Partial<Branding>) => {
    const newBranding = { ...branding, ...updates }
    setBranding(newBranding)

    if (!businessId) return

    // Fire and forget
    supabase.from('business_branding').upsert({
      business_id: businessId,
      ...updates,
    }).catch(() => {})
  }, [branding, businessId])

  const uploadLogo = useCallback(async (file: File): Promise<string | null> => {
    if (!businessId) return null

    const ext = file.name.split('.').pop()
    const path = `branding/${businessId}/logo.${ext}`

    const { error } = await supabase.storage
      .from('assets')
      .upload(path, file, { upsert: true })

    if (error) return null

    const { data } = supabase.storage.from('assets').getPublicUrl(path)
    const logoUrl = data.publicUrl

    await updateBranding({ logo_url: logoUrl })
    return logoUrl
  }, [businessId, updateBranding])

  const resetBranding = useCallback(async () => {
    setBranding(DEFAULT_BRANDING)
    
    if (businessId) {
      supabase.from('business_branding').delete().eq('business_id', businessId).catch(() => {})
    }
  }, [businessId])

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

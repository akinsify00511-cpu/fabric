import { createContext, useContext, useState, useEffect, useCallback, ReactNode, useRef } from 'react'
import { supabase } from './supabase'
import { useAuth } from './AuthContext'

export type Branding = {
  // Identity
  brand_name: string | null
  tagline: string | null
  custom_name: string | null
  custom_tagline: string | null
  // Logos
  logo_url: string | null
  logo_dark_url: string | null
  favicon_url: string | null
  og_image_url: string | null
  // Colors - Light
  primary_color: string
  accent_color: string
  background_color: string
  surface_color: string
  text_color: string
  // Colors - Dark
  dark_primary_color: string
  dark_accent_color: string
  dark_background_color: string
  dark_surface_color: string
  dark_text_color: string
  // Theme
  theme_mode: 'light' | 'dark' | 'system'
  border_radius: 'none' | 'sm' | 'md' | 'lg' | 'xl' | '2xl'
  font_family: string
  button_style: string
  // Contact
  website: string | null
  phone: string | null
  email: string | null
  address: string | null
  // Social
  social_links: {
    linkedin?: string
    twitter?: string
    facebook?: string
    instagram?: string
    youtube?: string
  }
}

const DEFAULT_BRANDING: Branding = {
  brand_name: null,
  tagline: null,
  custom_name: null,
  custom_tagline: null,
  logo_url: null,
  logo_dark_url: null,
  favicon_url: null,
  og_image_url: null,
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
  button_style: 'rounded',
  website: null,
  phone: null,
  email: null,
  address: null,
  social_links: {},
}

type BrandingContextType = {
  branding: Branding
  loading: boolean
  saving: boolean
  error: string | null
  updateBranding: (updates: Partial<Branding>) => Promise<void>
  uploadLogo: (file: File, type: 'logo' | 'logo_dark' | 'favicon') => Promise<string | null>
  resetBranding: () => Promise<void>
  saveBranding: () => Promise<void>
}

type Timeout = ReturnType<typeof setTimeout>

const BrandingContext = createContext<BrandingContextType | undefined>(undefined)

export function BrandingProvider({ children }: { children: ReactNode }) {
  const { staff, isDemo } = useAuth()
  const [branding, setBranding] = useState<Branding>(DEFAULT_BRANDING)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const saveTimeoutRef = useRef<Timeout | null>(null)
  const businessIdRef = useRef<string | null>(null)

  // Load branding from database on mount
  useEffect(() => {
    if (isDemo) {
      setLoading(false)
      return
    }

    const loadBranding = async () => {
      if (!staff?.business_id) {
        setLoading(false)
        return
      }

      businessIdRef.current = staff.business_id

      try {
        const { data, error } = await supabase
          .from('business_branding')
          .select('*')
          .eq('business_id', staff.business_id)
          .single()

        if (error && error.code !== 'PGRST116') {
          console.error('Error loading branding:', error)
          setError('Failed to load branding')
        }

        if (data) {
          // Parse social_links if it's a string
          let socialLinks = data.social_links
          if (typeof socialLinks === 'string') {
            try {
              socialLinks = JSON.parse(socialLinks)
            } catch {
              socialLinks = {}
            }
          }

          setBranding({
            brand_name: data.brand_name,
            tagline: data.tagline,
            custom_name: data.custom_name,
            custom_tagline: data.custom_tagline,
            logo_url: data.logo_url,
            logo_dark_url: data.logo_dark_url,
            favicon_url: data.favicon_url,
            og_image_url: data.og_image_url,
            primary_color: data.primary_color || DEFAULT_BRANDING.primary_color,
            accent_color: data.accent_color || DEFAULT_BRANDING.accent_color,
            background_color: data.background_color || DEFAULT_BRANDING.background_color,
            surface_color: data.surface_color || DEFAULT_BRANDING.surface_color,
            text_color: data.text_color || DEFAULT_BRANDING.text_color,
            dark_primary_color: data.dark_primary_color || DEFAULT_BRANDING.dark_primary_color,
            dark_accent_color: data.dark_accent_color || DEFAULT_BRANDING.dark_accent_color,
            dark_background_color: data.dark_background_color || DEFAULT_BRANDING.dark_background_color,
            dark_surface_color: data.dark_surface_color || DEFAULT_BRANDING.dark_surface_color,
            dark_text_color: data.dark_text_color || DEFAULT_BRANDING.dark_text_color,
            theme_mode: data.theme_mode || DEFAULT_BRANDING.theme_mode,
            border_radius: data.border_radius || DEFAULT_BRANDING.border_radius,
            font_family: data.font_family || DEFAULT_BRANDING.font_family,
            button_style: data.button_style || DEFAULT_BRANDING.button_style,
            website: data.website,
            phone: data.phone,
            email: data.email,
            address: data.address,
            social_links: socialLinks || {},
          })
        }
      } catch (err) {
        console.error('Error loading branding:', err)
        setError('Failed to load branding')
      } finally {
        setLoading(false)
      }
    }

    loadBranding()
  }, [staff?.business_id, isDemo])

  // Apply branding to CSS variables
  useEffect(() => {
    if (loading) return

    const root = document.documentElement
    root.style.setProperty('--avenize-primary', branding.primary_color)
    root.style.setProperty('--avenize-accent', branding.accent_color)
    root.style.setProperty('--avenize-bg', branding.background_color)
    root.style.setProperty('--avenize-accent-start', branding.primary_color)
    root.style.setProperty('--avenize-accent-end', branding.accent_color)
    root.style.setProperty('--avenize-offwhite', branding.background_color)

    // Update favicon if custom
    if (branding.favicon_url) {
      const existingFavicon = document.querySelector("link[rel='icon']") as HTMLLinkElement
      if (existingFavicon) {
        existingFavicon.href = branding.favicon_url
      }
    }
  }, [branding, loading])

  // Save branding to database
  const saveBranding = useCallback(async () => {
    if (isDemo || !businessIdRef.current) return

    setSaving(true)
    setError(null)

    try {
      const { error } = await supabase
        .from('business_branding')
        .upsert({
          business_id: businessIdRef.current,
          brand_name: branding.brand_name,
          tagline: branding.tagline,
          custom_name: branding.custom_name,
          custom_tagline: branding.custom_tagline,
          logo_url: branding.logo_url,
          logo_dark_url: branding.logo_dark_url,
          favicon_url: branding.favicon_url,
          og_image_url: branding.og_image_url,
          primary_color: branding.primary_color,
          accent_color: branding.accent_color,
          background_color: branding.background_color,
          surface_color: branding.surface_color,
          text_color: branding.text_color,
          dark_primary_color: branding.dark_primary_color,
          dark_accent_color: branding.dark_accent_color,
          dark_background_color: branding.dark_background_color,
          dark_surface_color: branding.dark_surface_color,
          dark_text_color: branding.dark_text_color,
          theme_mode: branding.theme_mode,
          border_radius: branding.border_radius,
          font_family: branding.font_family,
          button_style: branding.button_style,
          website: branding.website,
          phone: branding.phone,
          email: branding.email,
          address: branding.address,
          social_links: branding.social_links,
          updated_at: new Date().toISOString(),
        })

      if (error) {
        console.error('Error saving branding:', error)
        setError('Failed to save branding')
      }
    } catch (err) {
      console.error('Error saving branding:', err)
      setError('Failed to save branding')
    } finally {
      setSaving(false)
    }
  }, [branding, isDemo])

  // Debounced update
  const updateBranding = useCallback(async (updates: Partial<Branding>) => {
    setBranding(prev => ({ ...prev, ...updates }))

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }

    // Debounce save by 500ms
    saveTimeoutRef.current = setTimeout(() => {
      saveBranding()
    }, 500)
  }, [saveBranding])

  // Upload logo to Supabase Storage
  const uploadLogo = useCallback(async (
    file: File,
    type: 'logo' | 'logo_dark' | 'favicon'
  ): Promise<string | null> => {
    if (isDemo || !businessIdRef.current) {
      console.warn('Cannot upload logo in demo mode')
      return null
    }

    try {
      const fileExt = file.name.split('.').pop()
      const fileName = `${businessIdRef.current}/${type}/${Date.now()}.${fileExt}`
      
      const { data, error } = await supabase.storage
        .from('brand-assets')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: true,
        })

      if (error) {
        console.error('Error uploading logo:', error)
        return null
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('brand-assets')
        .getPublicUrl(fileName)

      // Update branding with new URL
      const fieldMap = {
        logo: 'logo_url',
        logo_dark: 'logo_dark_url',
        favicon: 'favicon_url',
      } as const

      updateBranding({ [fieldMap[type]]: urlData.publicUrl })
      return urlData.publicUrl
    } catch (err) {
      console.error('Error uploading logo:', err)
      return null
    }
  }, [isDemo, updateBranding])

  // Reset to defaults
  const resetBranding = useCallback(async () => {
    setBranding(DEFAULT_BRANDING)
    
    if (!isDemo && businessIdRef.current) {
      try {
        await supabase
          .from('business_branding')
          .delete()
          .eq('business_id', businessIdRef.current)
      } catch (err) {
        console.error('Error resetting branding:', err)
      }
    }
  }, [isDemo])

  return (
    <BrandingContext.Provider 
      value={{ 
        branding, 
        loading, 
        saving,
        error,
        updateBranding, 
        uploadLogo, 
        resetBranding,
        saveBranding 
      }}
    >
      {children}
    </BrandingContext.Provider>
  )
}

export function useBranding() {
  const context = useContext(BrandingContext)
  if (!context) throw new Error('useBranding must be used within BrandingProvider')
  return context
}

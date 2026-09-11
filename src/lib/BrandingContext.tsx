import { createContext, useContext, useState, useEffect, useCallback, ReactNode, useRef } from 'react'
import { supabase } from './supabase'
import { useAuth } from './AuthContext'

export type Branding = {
  brand_name: string | null
  tagline: string | null
  custom_name: string | null
  custom_tagline: string | null
  logo_url: string | null
  logo_dark_url: string | null
  favicon_url: string | null
  og_image_url: string | null
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
  font_family: string
  button_style: string
  website: string | null
  phone: string | null
  email: string | null
  address: string | null
  social_links: { linkedin?: string; twitter?: string; facebook?: string; instagram?: string; youtube?: string }
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
  primary_color: 'rgb(6, 74, 143)',
  accent_color: 'rgb(22, 138, 85)',
  background_color: 'rgb(247, 249, 252)',
  surface_color: 'rgb(255, 255, 255)',
  text_color: 'rgb(17, 24, 39)',
  dark_primary_color: 'rgb(96, 165, 250)',
  dark_accent_color: 'rgb(74, 222, 128)',
  dark_background_color: 'rgb(11, 18, 32)',
  dark_surface_color: 'rgb(17, 24, 39)',
  dark_text_color: 'rgb(248, 250, 252)',
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

function setThemeVariables(branding: Branding) {
  const root = document.documentElement
  const dark = branding.theme_mode === 'dark' || (branding.theme_mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  const primary = dark ? branding.dark_primary_color : branding.primary_color
  const accent = dark ? branding.dark_accent_color : branding.accent_color
  const bg = dark ? branding.dark_background_color : branding.background_color
  const surface = dark ? branding.dark_surface_color : branding.surface_color
  const text = dark ? branding.dark_text_color : branding.text_color

  root.style.setProperty('--av-primary', primary)
  root.style.setProperty('--av-primary-hover', primary)
  root.style.setProperty('--av-primary-soft', `${primary}18`)
  root.style.setProperty('--av-accent', accent)
  root.style.setProperty('--av-bg', bg)
  root.style.setProperty('--av-background', bg)
  root.style.setProperty('--av-surface', surface)
  root.style.setProperty('--av-surface-2', surface)
  root.style.setProperty('--av-surface-3', bg)
  root.style.setProperty('--av-text', text)
  root.style.setProperty('--av-text-primary', text)
  root.style.setProperty('--av-text-secondary', `color-mix(in srgb, ${text} 72%, transparent)`)
  root.style.setProperty('--av-text-muted', `color-mix(in srgb, ${text} 52%, transparent)`)
  root.style.setProperty('--av-border', `color-mix(in srgb, ${text} 20%, transparent)`)

  root.style.setProperty('--avenize-primary', primary)
  root.style.setProperty('--avenize-accent', accent)
  root.style.setProperty('--avenize-bg', bg)
  root.style.setProperty('--avenize-background', bg)
  root.style.setProperty('--avenize-offwhite', bg)
  root.style.setProperty('--avenize-accent-start', primary)
  root.style.setProperty('--avenize-accent-end', accent)
  root.style.setProperty('--avenize-text', text)

  if (branding.border_radius) {
    const radius = { none: '0px', sm: '0.375rem', md: '0.5rem', lg: '0.75rem', xl: '1rem', '2xl': '1.25rem' }[branding.border_radius]
    root.style.setProperty('--av-radius-md', radius)
  }
  if (branding.font_family && branding.font_family !== 'default') root.style.setProperty('--av-font-family', branding.font_family)
  else root.style.removeProperty('--av-font-family')

  root.dataset.brandTheme = branding.theme_mode
  root.classList.toggle('dark', dark)
}

export function BrandingProvider({ children }: { children: ReactNode }) {
  const { staff } = useAuth()
  const [branding, setBranding] = useState<Branding>(DEFAULT_BRANDING)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const saveTimeoutRef = useRef<Timeout | null>(null)
  const businessIdRef = useRef<string | null>(null)

  useEffect(() => {
    let mounted = true
    const loadBranding = async () => {
      if (!staff?.business_id) { if (mounted) setLoading(false); return }
      businessIdRef.current = staff.business_id
      setLoading(true)
      try {
        const { data, error } = await supabase.from('business_branding').select('*').eq('business_id', staff.business_id).maybeSingle()
        if (error && !['PGRST116', '404', '406'].includes(error.code || '')) console.warn('Branding not available:', error.message)
        if (!mounted) return
        if (data) {
          let socialLinks = data.social_links
          if (typeof socialLinks === 'string') { try { socialLinks = JSON.parse(socialLinks) } catch { socialLinks = {} } }
          setBranding({ ...DEFAULT_BRANDING, ...data, social_links: socialLinks || {} })
        } else setBranding(DEFAULT_BRANDING)
      } catch (err) { if (mounted) setError('Failed to load branding'); console.error('Error loading branding:', err) }
      finally { if (mounted) setLoading(false) }
    }
    void loadBranding()
    return () => { mounted = false }
  }, [staff?.business_id])

  useEffect(() => {
    if (loading || typeof window === 'undefined') return
    setThemeVariables(branding)
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => { if (branding.theme_mode === 'system') setThemeVariables(branding) }
    media.addEventListener?.('change', onChange)
    if (branding.favicon_url) {
      let favicon = document.querySelector<HTMLLinkElement>("link[rel='icon']")
      if (!favicon) { favicon = document.createElement('link'); favicon.rel = 'icon'; document.head.appendChild(favicon) }
      favicon.href = branding.favicon_url
    }
    return () => media.removeEventListener?.('change', onChange)
  }, [branding, loading])

  const saveBranding = useCallback(async () => {
    if (!businessIdRef.current) return
    setSaving(true); setError(null)
    try {
      const { error } = await supabase.from('business_branding').upsert({ business_id: businessIdRef.current, ...branding, updated_at: new Date().toISOString() })
      if (error) { console.error('Error saving branding:', error); setError('Failed to save branding') }
    } catch (err) { console.error('Error saving branding:', err); setError('Failed to save branding') }
    finally { setSaving(false) }
  }, [branding])

  const updateBranding = useCallback(async (updates: Partial<Branding>) => {
    setBranding(prev => ({ ...prev, ...updates }))
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = setTimeout(() => { void saveBranding() }, 500)
  }, [saveBranding])

  const uploadLogo = useCallback(async (file: File, type: 'logo' | 'logo_dark' | 'favicon'): Promise<string | null> => {
    if (!businessIdRef.current) return null
    try {
      const fileExt = file.name.split('.').pop() || 'png'
      const fileName = `${businessIdRef.current}/${type}/${Date.now()}.${fileExt}`
      const { error } = await supabase.storage.from('brand-assets').upload(fileName, file, { cacheControl: '3600', upsert: true })
      if (error) { console.error('Error uploading logo:', error); return null }
      const { data: urlData } = supabase.storage.from('brand-assets').getPublicUrl(fileName)
      const fieldMap = { logo: 'logo_url', logo_dark: 'logo_dark_url', favicon: 'favicon_url' } as const
      await updateBranding({ [fieldMap[type]]: urlData.publicUrl })
      return urlData.publicUrl
    } catch (err) { console.error('Error uploading logo:', err); return null }
  }, [updateBranding])

  const resetBranding = useCallback(async () => {
    setBranding(DEFAULT_BRANDING)
    if (businessIdRef.current) {
      try { await supabase.from('business_branding').delete().eq('business_id', businessIdRef.current) }
      catch (err) { console.error('Error resetting branding:', err) }
    }
  }, [])

  return <BrandingContext.Provider value={{ branding, loading, saving, error, updateBranding, uploadLogo, resetBranding, saveBranding }}>{children}</BrandingContext.Provider>
}

export function useBranding() {
  const context = useContext(BrandingContext)
  if (!context) throw new Error('useBranding must be used within BrandingProvider')
  return context
}

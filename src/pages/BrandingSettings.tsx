import { useState } from 'react'
import { useBranding } from '../lib/BrandingContext'
import { useToast } from '../components/Toast'
import {
  Palette, Upload, Image, Globe, Eye, EyeOff, RotateCcw, Check, X,
  Type, Layout, Moon, Sun, Monitor
} from 'lucide-react'

const PRESET_THEMES = [
  { name: 'Avenize Default', primary: '#4F46E5', accent: '#2563EB', label: 'Signature' },
  { name: 'Ocean Blue', primary: '#0EA5E9', accent: '#06B6D4', label: 'Ocean' },
  { name: 'Forest Green', primary: '#10B981', accent: '#34D399', label: 'Nature' },
  { name: 'Sunset Orange', primary: '#F97316', accent: '#FBBF24', label: 'Warm' },
  { name: 'Rose Pink', primary: '#EC4899', accent: '#F472B6', label: 'Creative' },
  { name: 'Slate Dark', primary: '#6366F1', accent: '#8B5CF6', label: 'Dark Mode' },
]

const FONT_OPTIONS = [
  { value: 'default', label: 'System Default (Inter)' },
  { value: 'inter', label: 'Inter' },
  { value: 'poppins', label: 'Poppins' },
  { value: 'roboto', label: 'Roboto' },
]

const RADIUS_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'sm', label: 'Small' },
  { value: 'md', label: 'Medium' },
  { value: 'lg', label: 'Large' },
  { value: 'xl', label: 'Extra Large' },
  { value: '2xl', label: 'Round' },
]

export default function BrandingSettings() {
  const { branding, loading, updateBranding, uploadLogo, resetBranding } = useBranding()
  const { showToast } = useToast()
  const [uploading, setUploading] = useState(false)
  const [activeTab, setActiveTab] = useState<'colors' | 'logo' | 'theme' | 'social'>('colors')

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'logo' | 'logo_dark' | 'favicon' = 'logo') => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      showToast('Please upload an image file', 'error')
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      showToast('Logo must be less than 5MB', 'error')
      return
    }

    setUploading(true)
    const url = await uploadLogo(file, type)
    if (url) {
      showToast('Logo uploaded!', 'success')
    } else {
      showToast('Failed to upload logo', 'error')
    }
    setUploading(false)
  }

  const handleReset = async () => {
    if (!confirm('Reset all branding to defaults?')) return
    await resetBranding()
    showToast('Branding reset to defaults', 'success')
  }

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-black/5 rounded w-48" />
        <div className="h-64 bg-black/5 rounded" />
      </div>
    )
  }

  return (
    <div className="pb-20">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-medium text-gray-900">Branding</h1>
          <p className="text-sm text-black/50 mt-0.5">Customize how your business appears</p>
        </div>
        <button
          onClick={handleReset}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-black/10 text-sm hover:bg-black/[0.02]"
        >
          <RotateCcw size={14} />
          Reset
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white rounded-xl p-1 border border-black/[0.06] mb-6 w-fit">
        {[
          { id: 'colors', label: 'Colors', icon: Palette },
          { id: 'logo', label: 'Logo', icon: Image },
          { id: 'theme', label: 'Theme', icon: Layout },
          { id: 'social', label: 'Social Links', icon: Globe },
        ].map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition ${
                activeTab === tab.id
                  ? 'avenize-gradient text-white'
                  : 'text-black/50 hover:text-black'
              }`}
            >
              <Icon size={14} />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* COLORS TAB */}
      {activeTab === 'colors' && (
        <div className="space-y-6">
          {/* Preset Themes */}
          <div className="bg-white rounded-2xl border border-black/[0.06] p-6">
            <h2 className="text-sm font-medium mb-4">Quick Themes</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {PRESET_THEMES.map((theme) => (
                <button
                  key={theme.name}
                  onClick={() => updateBranding({ primary_color: theme.primary, accent_color: theme.accent })}
                  className={`p-4 rounded-xl border-2 transition ${
                    branding.primary_color === theme.primary
                      ? 'border-[#8B5CF6]'
                      : 'border-transparent bg-black/[0.02]'
                  }`}
                >
                  <div className="flex gap-2 mb-2">
                    <div className="w-6 h-6 rounded-lg" style={{ backgroundColor: theme.primary }} />
                    <div className="w-6 h-6 rounded-lg" style={{ backgroundColor: theme.accent }} />
                  </div>
                  <p className="text-sm font-medium">{theme.label}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Custom Colors */}
          <div className="bg-white rounded-2xl border border-black/[0.06] p-6">
            <h2 className="text-sm font-medium mb-4">Custom Colors</h2>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-black/50 block mb-1">Primary Color</label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={branding.primary_color}
                    onChange={(e) => updateBranding({ primary_color: e.target.value })}
                    className="w-10 h-10 rounded-lg border cursor-pointer"
                  />
                  <input
                    type="text"
                    value={branding.primary_color}
                    onChange={(e) => updateBranding({ primary_color: e.target.value })}
                    className="flex-1 px-3 rounded-lg border text-sm font-mono"
                  />
                </div>
                <p className="text-xs text-black/30 mt-1">Used for buttons, links, highlights</p>
              </div>

              <div>
                <label className="text-xs text-black/50 block mb-1">Accent Color</label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={branding.accent_color}
                    onChange={(e) => updateBranding({ accent_color: e.target.value })}
                    className="w-10 h-10 rounded-lg border cursor-pointer"
                  />
                  <input
                    type="text"
                    value={branding.accent_color}
                    onChange={(e) => updateBranding({ accent_color: e.target.value })}
                    className="flex-1 px-3 rounded-lg border text-sm font-mono"
                  />
                </div>
                <p className="text-xs text-black/30 mt-1">Used for secondary actions, badges</p>
              </div>

              <div>
                <label className="text-xs text-black/50 block mb-1">Background</label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={branding.background_color}
                    onChange={(e) => updateBranding({ background_color: e.target.value })}
                    className="w-10 h-10 rounded-lg border cursor-pointer"
                  />
                  <input
                    type="text"
                    value={branding.background_color}
                    onChange={(e) => updateBranding({ background_color: e.target.value })}
                    className="flex-1 px-3 rounded-lg border text-sm font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-black/50 block mb-1">Surface</label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={branding.surface_color}
                    onChange={(e) => updateBranding({ surface_color: e.target.value })}
                    className="w-10 h-10 rounded-lg border cursor-pointer"
                  />
                  <input
                    type="text"
                    value={branding.surface_color}
                    onChange={(e) => updateBranding({ surface_color: e.target.value })}
                    className="flex-1 px-3 rounded-lg border text-sm font-mono"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Dark Mode Colors */}
          <div className="bg-white rounded-2xl border border-black/[0.06] p-6">
            <h2 className="text-sm font-medium mb-4">Dark Mode Colors</h2>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-black/50 block mb-1">Primary (Dark)</label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={branding.dark_primary_color}
                    onChange={(e) => updateBranding({ dark_primary_color: e.target.value })}
                    className="w-10 h-10 rounded-lg border cursor-pointer"
                  />
                  <input
                    type="text"
                    value={branding.dark_primary_color}
                    onChange={(e) => updateBranding({ dark_primary_color: e.target.value })}
                    className="flex-1 px-3 rounded-lg border text-sm font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-black/50 block mb-1">Background (Dark)</label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={branding.dark_background_color}
                    onChange={(e) => updateBranding({ dark_background_color: e.target.value })}
                    className="w-10 h-10 rounded-lg border cursor-pointer"
                  />
                  <input
                    type="text"
                    value={branding.dark_background_color}
                    onChange={(e) => updateBranding({ dark_background_color: e.target.value })}
                    className="flex-1 px-3 rounded-lg border text-sm font-mono"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Preview */}
          <div className="bg-white rounded-2xl border border-black/[0.06] p-6">
            <h2 className="text-sm font-medium mb-4">Preview</h2>
            <div
              className="rounded-xl p-6 border border-black/[0.06]"
              style={{ backgroundColor: branding.background_color }}
            >
              <div
                className="rounded-xl p-4 shadow-sm"
                style={{ backgroundColor: branding.surface_color }}
              >
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold"
                    style={{ background: `linear-gradient(135deg, ${branding.primary_color}, ${branding.accent_color})` }}
                  >
                    A
                  </div>
                  <div>
                    <p className="font-medium" style={{ color: branding.text_color }}>
                      {branding.custom_name || 'Avenize'}
                    </p>
                    <p className="text-sm opacity-50" style={{ color: branding.text_color }}>
                      {branding.custom_tagline || 'Your Business OS'}
                    </p>
                  </div>
                </div>
                <button
                  className="px-4 py-2 rounded-lg text-white text-sm font-medium mr-2"
                  style={{ background: `linear-gradient(135deg, ${branding.primary_color}, ${branding.accent_color})` }}
                >
                  Primary Button
                </button>
                <button
                  className="px-4 py-2 rounded-lg border text-sm"
                  style={{ borderColor: branding.accent_color, color: branding.accent_color }}
                >
                  Secondary
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* LOGO TAB */}
      {activeTab === 'logo' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-black/[0.06] p-6">
            <h2 className="text-sm font-medium mb-4">Logo</h2>
            <div className="flex items-start gap-6">
              {/* Current Logo */}
              <div
                className="w-32 h-32 rounded-xl border-2 border-dashed flex items-center justify-center overflow-hidden"
                style={{ borderColor: '#8B5CF6' }}
              >
                {branding.logo_url ? (
                  <img src={branding.logo_url} alt="Logo" className="w-full h-full object-contain p-2" />
                ) : (
                  <div
                    className="w-16 h-16 rounded-xl flex items-center justify-center text-white font-bold text-2xl"
                    style={{ background: `linear-gradient(135deg, ${branding.primary_color}, ${branding.accent_color})` }}
                  >
                    {branding.custom_name?.charAt(0) || 'A'}
                  </div>
                )}
              </div>

              {/* Upload */}
              <div className="flex-1">
                <label className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl avenize-gradient text-white cursor-pointer hover:opacity-90 transition">
                  <Upload size={16} />
                  {uploading ? 'Uploading...' : 'Upload Logo'}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleLogoUpload(e, 'logo')}
                    disabled={uploading}
                    className="hidden"
                  />
                </label>
                <p className="text-xs text-black/40 mt-2">Recommended: 200x200px, PNG or SVG</p>
                <button
                  onClick={() => updateBranding({ logo_url: null })}
                  className="text-xs text-red-500 mt-2 hover:underline"
                >
                  Remove logo
                </button>
              </div>
            </div>
          </div>

          {/* Business Name */}
          <div className="bg-white rounded-2xl border border-black/[0.06] p-6">
            <h2 className="text-sm font-medium mb-4">Display Name</h2>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-black/50 block mb-1">Custom Name</label>
                <input
                  value={branding.custom_name || ''}
                  onChange={(e) => updateBranding({ custom_name: e.target.value || null })}
                  placeholder="Avenize"
                  className="w-full px-4 py-3 rounded-xl border border-black/10"
                />
                <p className="text-xs text-black/30 mt-1">Replace "Avenize" in the sidebar</p>
              </div>
              <div>
                <label className="text-xs text-black/50 block mb-1">Tagline</label>
                <input
                  value={branding.custom_tagline || ''}
                  onChange={(e) => updateBranding({ custom_tagline: e.target.value || null })}
                  placeholder="Your Business OS"
                  className="w-full px-4 py-3 rounded-xl border border-black/10"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* THEME TAB */}
      {activeTab === 'theme' && (
        <div className="space-y-6">
          {/* Theme Mode */}
          <div className="bg-white rounded-2xl border border-black/[0.06] p-6">
            <h2 className="text-sm font-medium mb-4">Appearance</h2>
            <div className="grid grid-cols-3 gap-3">
              {[
                { value: 'light', label: 'Light', icon: Sun },
                { value: 'dark', label: 'Dark', icon: Moon },
                { value: 'system', label: 'System', icon: Monitor },
              ].map((option) => {
                const Icon = option.icon
                return (
                  <button
                    key={option.value}
                    onClick={() => updateBranding({ theme_mode: option.value as any })}
                    className={`p-4 rounded-xl border-2 transition flex flex-col items-center gap-2 ${
                      branding.theme_mode === option.value
                        ? 'border-[#8B5CF6] avenize-gradient bg-opacity-10'
                        : 'border-transparent bg-black/[0.02]'
                    }`}
                  >
                    <Icon size={24} className={branding.theme_mode === option.value ? 'text-[#8B5CF6]' : ''} />
                    <span className="text-sm font-medium">{option.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Border Radius */}
          <div className="bg-white rounded-2xl border border-black/[0.06] p-6">
            <h2 className="text-sm font-medium mb-4">Corner Radius</h2>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
              {RADIUS_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => updateBranding({ border_radius: option.value as any })}
                  className={`p-3 rounded-xl border-2 transition ${
                    branding.border_radius === option.value
                      ? 'border-[#8B5CF6]'
                      : 'border-transparent bg-black/[0.02]'
                  }`}
                >
                  <div
                    className="w-8 h-8 mx-auto mb-2 border-2"
                    style={{ borderRadius: option.value === 'none' ? '0' : option.value === 'sm' ? '2px' : option.value === 'md' ? '6px' : option.value === 'lg' ? '8px' : option.value === 'xl' ? '12px' : '16px' }}
                  />
                  <span className="text-xs">{option.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Font */}
          <div className="bg-white rounded-2xl border border-black/[0.06] p-6">
            <h2 className="text-sm font-medium mb-4">Font</h2>
            <select
              value={branding.font_family}
              onChange={(e) => updateBranding({ font_family: e.target.value as any })}
              className="w-full px-4 py-3 rounded-xl border border-black/10"
            >
              {FONT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* SOCIAL TAB */}
      {activeTab === 'social' && (
        <div className="bg-white rounded-2xl border border-black/[0.06] p-6">
          <h2 className="text-sm font-medium mb-4">Social Links</h2>
          <p className="text-xs text-black/50 mb-6">These appear in your public profile and footer</p>
          <div className="space-y-4">
            {[
              { key: 'website_url', label: 'Website', placeholder: 'https://yoursite.com' },
              { key: 'twitter_url', label: 'Twitter / X', placeholder: 'https://twitter.com/yoursite' },
              { key: 'linkedin_url', label: 'LinkedIn', placeholder: 'https://linkedin.com/company/yoursite' },
              { key: 'facebook_url', label: 'Facebook', placeholder: 'https://facebook.com/yoursite' },
              { key: 'instagram_url', label: 'Instagram', placeholder: 'https://instagram.com/yoursite' },
            ].map((field) => (
              <div key={field.key}>
                <label className="text-xs text-black/50 block mb-1">{field.label}</label>
                <input
                  value={(branding as any)[field.key] || ''}
                  onChange={(e) => updateBranding({ [field.key]: e.target.value || null })}
                  placeholder={field.placeholder}
                  className="w-full px-4 py-3 rounded-xl border border-black/10"
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../components/Toast'
import {
  Palette, Type, Image, Globe, Mail, Phone, MapPin, Users,
  Plus, Trash2, Edit3, Save, Eye, ExternalLink, Check, X,
  Upload, PlusCircle, Star, Crown, Sparkles
} from 'lucide-react'

type Branding = {
  id: string
  brand_name: string
  tagline: string
  logo_url: string
  primary_color: string
  secondary_color: string
  accent_color: string
  font_family: string
  website: string
  phone: string
  email: string
  address: string
  social_links: any
  is_published: boolean
}

type PortfolioItem = {
  id: string
  item_type: string
  title: string
  short_description: string
  cover_image_url: string
  category: string
}

const COLOR_PRESETS = [
  { name: 'Indigo', primary: '#6366F1', secondary: '#8B5CF6', accent: '#EC4899' },
  { name: 'Ocean', primary: '#0EA5E9', secondary: '#06B6D4', accent: '#F59E0B' },
  { name: 'Forest', primary: '#10B981', secondary: '#059669', accent: '#F59E0B' },
  { name: 'Sunset', primary: '#F97316', secondary: '#EF4444', accent: '#F59E0B' },
  { name: 'Minimal', primary: '#1F2937', secondary: '#6B7280', accent: '#3B82F6' },
  { name: 'Bold', primary: '#7C3AED', secondary: '#DB2777', accent: '#FBBF24' },
]

export default function Branding() {
  const { staff } = useAuth()
  const { showToast } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [branding, setBranding] = useState<Branding | null>(null)
  const [portfolioItems, setPortfolioItems] = useState<PortfolioItem[]>([])
  const [activeTab, setActiveTab] = useState<'brand' | 'portfolio' | 'team' | 'testimonials'>('brand')
  const [activeSection, setActiveSection] = useState<'colors' | 'typography' | 'logo' | 'contact'>('colors')

  const [formData, setFormData] = useState({
    brand_name: '',
    tagline: '',
    logo_url: '',
    primary_color: '#6366F1',
    secondary_color: '#8B5CF6',
    accent_color: '#EC4899',
    font_family: 'Inter',
    website: '',
    phone: '',
    email: '',
    address: '',
    linkedin: '',
    twitter: '',
    instagram: '',
  })

  useEffect(() => {
    loadData()
  }, [staff?.business_id])

  async function loadData() {
    setLoading(true)

    // Load branding
    const { data: brandingData } = await supabase
      .from('business_branding')
      .select('*')
      .eq('business_id', staff?.business_id)
      .single()

    if (brandingData) {
      setBranding(brandingData as Branding)
      setFormData({
        brand_name: brandingData.brand_name || '',
        tagline: brandingData.tagline || '',
        logo_url: brandingData.logo_url || '',
        primary_color: brandingData.primary_color || '#6366F1',
        secondary_color: brandingData.secondary_color || '#8B5CF6',
        accent_color: brandingData.accent_color || '#EC4899',
        font_family: brandingData.font_family || 'Inter',
        website: brandingData.website || '',
        phone: brandingData.phone || '',
        email: brandingData.email || '',
        address: brandingData.address || '',
        linkedin: brandingData.social_links?.linkedin || '',
        twitter: brandingData.social_links?.twitter || '',
        instagram: brandingData.social_links?.instagram || '',
      })
    }

    // Load portfolio items
    const { data: itemsData } = await supabase
      .from('portfolio_items')
      .select('*')
      .eq('business_id', staff?.business_id)
      .eq('status', 'active')
      .order('order_index')

    setPortfolioItems((itemsData as PortfolioItem[]) ?? [])
    setLoading(false)
  }

  async function handleSave() {
    setSaving(true)

    const updateData = {
      brand_name: formData.brand_name,
      tagline: formData.tagline,
      logo_url: formData.logo_url,
      primary_color: formData.primary_color,
      secondary_color: formData.secondary_color,
      accent_color: formData.accent_color,
      font_family: formData.font_family,
      website: formData.website,
      phone: formData.phone,
      email: formData.email,
      address: formData.address,
      social_links: {
        linkedin: formData.linkedin,
        twitter: formData.twitter,
        instagram: formData.instagram,
      },
    }

    const { error } = await supabase
      .from('business_branding')
      .upsert({ business_id: staff?.business_id, ...updateData })

    if (error) {
      showToast('Failed to save', 'error')
    } else {
      showToast('Branding saved!', 'success')
      loadData()
    }
    setSaving(false)
  }

  const applyPreset = (preset: typeof COLOR_PRESETS[0]) => {
    setFormData({
      ...formData,
      primary_color: preset.primary,
      secondary_color: preset.secondary,
      accent_color: preset.accent,
    })
  }

  return (
    <div className="pb-20">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-medium text-[var(--avenize-black)]">Branding & Portfolio</h1>
          <p className="text-sm text-black/50 mt-0.5">Customize your business identity</p>
        </div>
        <div className="flex gap-2">
          <button className="flex items-center gap-2 px-4 py-2 rounded-lg border border-black/10 text-sm">
            <Eye size={16} />
            Preview
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 rounded-lg fabric-gradient text-white text-sm font-medium disabled:opacity-50"
          >
            <Save size={16} />
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {[
          { key: 'brand', label: 'Brand Identity' },
          { key: 'portfolio', label: 'Portfolio' },
          { key: 'team', label: 'Team' },
          { key: 'testimonials', label: 'Testimonials' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as typeof activeTab)}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              activeTab === tab.key ? 'fabric-gradient text-white' : 'border border-black/10'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Brand Identity Tab */}
      {activeTab === 'brand' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Sidebar */}
          <div className="bg-white rounded-2xl border border-black/[0.06] p-4 h-fit">
            <nav className="space-y-1">
              {[
                { key: 'colors', label: 'Colors', icon: Palette },
                { key: 'typography', label: 'Typography', icon: Type },
                { key: 'logo', label: 'Logo', icon: Image },
                { key: 'contact', label: 'Contact Info', icon: Globe },
              ].map((item) => (
                <button
                  key={item.key}
                  onClick={() => setActiveSection(item.key as typeof activeSection)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm ${
                    activeSection === item.key
                      ? 'bg-indigo-50 text-indigo-600'
                      : 'hover:bg-black/[0.02]'
                  }`}
                >
                  <item.icon size={18} />
                  {item.label}
                </button>
              ))}
            </nav>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Colors Section */}
            {activeSection === 'colors' && (
              <div className="bg-white rounded-2xl border border-black/[0.06] p-6">
                <h3 className="font-semibold mb-4">Brand Colors</h3>

                {/* Color Presets */}
                <div className="mb-6">
                  <label className="text-sm font-medium block mb-2">Quick Presets</label>
                  <div className="flex gap-3">
                    {COLOR_PRESETS.map((preset) => (
                      <button
                        key={preset.name}
                        onClick={() => applyPreset(preset)}
                        className="flex flex-col items-center gap-2 p-2 rounded-xl border border-black/10 hover:border-indigo-500"
                      >
                        <div className="flex gap-1">
                          <div className="w-6 h-6 rounded-full" style={{ backgroundColor: preset.primary }} />
                          <div className="w-6 h-6 rounded-full" style={{ backgroundColor: preset.secondary }} />
                          <div className="w-6 h-6 rounded-full" style={{ backgroundColor: preset.accent }} />
                        </div>
                        <span className="text-xs">{preset.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Custom Colors */}
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="text-sm font-medium block mb-2">Primary</label>
                    <div className="flex gap-2">
                      <input
                        type="color"
                        value={formData.primary_color}
                        onChange={(e) => setFormData({ ...formData, primary_color: e.target.value })}
                        className="w-12 h-12 rounded-xl cursor-pointer"
                      />
                      <input
                        type="text"
                        value={formData.primary_color}
                        onChange={(e) => setFormData({ ...formData, primary_color: e.target.value })}
                        className="flex-1 px-3 rounded-xl border border-black/10 font-mono text-sm"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium block mb-2">Secondary</label>
                    <div className="flex gap-2">
                      <input
                        type="color"
                        value={formData.secondary_color}
                        onChange={(e) => setFormData({ ...formData, secondary_color: e.target.value })}
                        className="w-12 h-12 rounded-xl cursor-pointer"
                      />
                      <input
                        type="text"
                        value={formData.secondary_color}
                        onChange={(e) => setFormData({ ...formData, secondary_color: e.target.value })}
                        className="flex-1 px-3 rounded-xl border border-black/10 font-mono text-sm"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium block mb-2">Accent</label>
                    <div className="flex gap-2">
                      <input
                        type="color"
                        value={formData.accent_color}
                        onChange={(e) => setFormData({ ...formData, accent_color: e.target.value })}
                        className="w-12 h-12 rounded-xl cursor-pointer"
                      />
                      <input
                        type="text"
                        value={formData.accent_color}
                        onChange={(e) => setFormData({ ...formData, accent_color: e.target.value })}
                        className="flex-1 px-3 rounded-xl border border-black/10 font-mono text-sm"
                      />
                    </div>
                  </div>
                </div>

                {/* Preview */}
                <div className="mt-6 p-6 rounded-xl" style={{ backgroundColor: formData.primary_color + '15' }}>
                  <p className="text-sm text-black/50 mb-2">Preview</p>
                  <div className="flex gap-3">
                    <button className="px-4 py-2 rounded-xl text-white text-sm" style={{ backgroundColor: formData.primary_color }}>
                      Primary Button
                    </button>
                    <button className="px-4 py-2 rounded-xl text-white text-sm" style={{ backgroundColor: formData.secondary_color }}>
                      Secondary
                    </button>
                    <button className="px-4 py-2 rounded-xl text-white text-sm" style={{ backgroundColor: formData.accent_color }}>
                      Accent
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Typography Section */}
            {activeSection === 'typography' && (
              <div className="bg-white rounded-2xl border border-black/[0.06] p-6">
                <h3 className="font-semibold mb-4">Typography</h3>
                <div>
                  <label className="text-sm font-medium block mb-2">Font Family</label>
                  <select
                    value={formData.font_family}
                    onChange={(e) => setFormData({ ...formData, font_family: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-black/10"
                  >
                    <option value="Inter">Inter</option>
                    <option value="Poppins">Poppins</option>
                    <option value="Roboto">Roboto</option>
                    <option value="Open Sans">Open Sans</option>
                    <option value="Montserrat">Montserrat</option>
                    <option value="Playfair Display">Playfair Display</option>
                  </select>
                </div>

                <div className="mt-6 space-y-4">
                  <div>
                    <p className="text-3xl font-bold" style={{ fontFamily: formData.font_family }}>Heading 1</p>
                    <p className="text-xs text-black/50 mt-1">48px Bold</p>
                  </div>
                  <div>
                    <p className="text-2xl font-semibold" style={{ fontFamily: formData.font_family }}>Heading 2</p>
                    <p className="text-xs text-black/50 mt-1">32px Semibold</p>
                  </div>
                  <div>
                    <p className="text-lg font-medium" style={{ fontFamily: formData.font_family }}>Heading 3</p>
                    <p className="text-xs text-black/50 mt-1">24px Medium</p>
                  </div>
                  <div>
                    <p className="text-base" style={{ fontFamily: formData.font_family }}>Body text - The quick brown fox jumps over the lazy dog.</p>
                    <p className="text-xs text-black/50 mt-1">16px Regular</p>
                  </div>
                </div>
              </div>
            )}

            {/* Logo Section */}
            {activeSection === 'logo' && (
              <div className="bg-white rounded-2xl border border-black/[0.06] p-6">
                <h3 className="font-semibold mb-4">Logo</h3>

                <div className="mb-6">
                  <label className="text-sm font-medium block mb-2">Brand Name</label>
                  <input
                    value={formData.brand_name}
                    onChange={(e) => setFormData({ ...formData, brand_name: e.target.value })}
                    placeholder="Your Company Name"
                    className="w-full px-4 py-3 rounded-xl border border-black/10"
                  />
                </div>

                <div className="mb-6">
                  <label className="text-sm font-medium block mb-2">Tagline</label>
                  <input
                    value={formData.tagline}
                    onChange={(e) => setFormData({ ...formData, tagline: e.target.value })}
                    placeholder="Your memorable tagline"
                    className="w-full px-4 py-3 rounded-xl border border-black/10"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium block mb-2">Logo URL</label>
                  <div className="flex gap-2">
                    <input
                      value={formData.logo_url}
                      onChange={(e) => setFormData({ ...formData, logo_url: e.target.value })}
                      placeholder="https://example.com/logo.png"
                      className="flex-1 px-4 py-3 rounded-xl border border-black/10"
                    />
                    <button className="px-4 py-3 rounded-xl border border-black/10">
                      <Upload size={18} />
                    </button>
                  </div>
                </div>

                {formData.logo_url && (
                  <div className="mt-4 p-6 rounded-xl bg-black/[0.02] flex items-center justify-center">
                    <img src={formData.logo_url} alt="Logo" className="max-h-20 object-contain" />
                  </div>
                )}
              </div>
            )}

            {/* Contact Info Section */}
            {activeSection === 'contact' && (
              <div className="bg-white rounded-2xl border border-black/[0.06] p-6">
                <h3 className="font-semibold mb-4">Contact Information</h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium block mb-2">Website</label>
                    <div className="relative">
                      <Globe size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-black/30" />
                      <input
                        value={formData.website}
                        onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                        placeholder="https://example.com"
                        className="w-full pl-10 pr-4 py-3 rounded-xl border border-black/10"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium block mb-2">Email</label>
                    <div className="relative">
                      <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-black/30" />
                      <input
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        placeholder="hello@example.com"
                        className="w-full pl-10 pr-4 py-3 rounded-xl border border-black/10"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium block mb-2">Phone</label>
                    <div className="relative">
                      <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-black/30" />
                      <input
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        placeholder="+1 234 567 890"
                        className="w-full pl-10 pr-4 py-3 rounded-xl border border-black/10"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium block mb-2">Address</label>
                    <div className="relative">
                      <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-black/30" />
                      <input
                        value={formData.address}
                        onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                        placeholder="123 Main St, City"
                        className="w-full pl-10 pr-4 py-3 rounded-xl border border-black/10"
                      />
                    </div>
                  </div>
                </div>

                <h4 className="font-medium mt-6 mb-4">Social Links</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="text-sm font-medium block mb-2">LinkedIn</label>
                    <input
                      value={formData.linkedin}
                      onChange={(e) => setFormData({ ...formData, linkedin: e.target.value })}
                      placeholder="company/linkedin"
                      className="w-full px-4 py-3 rounded-xl border border-black/10"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium block mb-2">Twitter</label>
                    <input
                      value={formData.twitter}
                      onChange={(e) => setFormData({ ...formData, twitter: e.target.value })}
                      placeholder="@username"
                      className="w-full px-4 py-3 rounded-xl border border-black/10"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium block mb-2">Instagram</label>
                    <input
                      value={formData.instagram}
                      onChange={(e) => setFormData({ ...formData, instagram: e.target.value })}
                      placeholder="@username"
                      className="w-full px-4 py-3 rounded-xl border border-black/10"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Portfolio Tab */}
      {activeTab === 'portfolio' && (
        <div>
          <div className="flex items-center justify-between mb-6">
            <p className="text-sm text-black/50">Showcase your best work</p>
            <button className="flex items-center gap-2 px-4 py-2 rounded-lg fabric-gradient text-white text-sm font-medium">
              <Plus size={16} />
              Add Project
            </button>
          </div>

          {portfolioItems.length === 0 ? (
            <div className="bg-white rounded-2xl border border-black/[0.06] p-12 text-center">
              <Sparkles className="w-12 h-12 mx-auto text-black/20 mb-3" />
              <p className="text-black/50 mb-4">No portfolio items yet</p>
              <button className="px-4 py-2 rounded-lg border border-black/10 text-sm">
                Add your first project
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {portfolioItems.map((item) => (
                <div key={item.id} className="bg-white rounded-2xl border border-black/[0.06] overflow-hidden">
                  {item.cover_image_url ? (
                    <img src={item.cover_image_url} alt={item.title} className="w-full h-40 object-cover" />
                  ) : (
                    <div className="w-full h-40 bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center">
                      <Sparkles className="w-10 h-10 text-indigo-400" />
                    </div>
                  )}
                  <div className="p-4">
                    <span className="text-xs px-2 py-1 bg-black/5 rounded-full capitalize">{item.category}</span>
                    <h3 className="font-medium mt-2">{item.title}</h3>
                    <p className="text-sm text-black/50 mt-1 line-clamp-2">{item.short_description}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Team Tab */}
      {activeTab === 'team' && (
        <div>
          <div className="flex items-center justify-between mb-6">
            <p className="text-sm text-black/50">Meet your team members</p>
            <button className="flex items-center gap-2 px-4 py-2 rounded-lg fabric-gradient text-white text-sm font-medium">
              <Plus size={16} />
              Add Member
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {[
              { name: 'Sarah Chen', title: 'CEO', leadership: true },
              { name: 'Michael Park', title: 'CTO', leadership: true },
              { name: 'Emily Davis', title: 'Designer', leadership: false },
              { name: 'James Wilson', title: 'Developer', leadership: false },
            ].map((member, i) => (
              <div key={i} className="bg-white rounded-2xl border border-black/[0.06] p-4 text-center">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 mx-auto mb-3 flex items-center justify-center text-white font-bold">
                  {member.name.split(' ').map(n => n[0]).join('')}
                </div>
                {member.leadership && <Crown size={14} className="mx-auto text-yellow-500 mb-2" />}
                <h4 className="font-medium text-sm">{member.name}</h4>
                <p className="text-xs text-black/50">{member.title}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Testimonials Tab */}
      {activeTab === 'testimonials' && (
        <div>
          <div className="flex items-center justify-between mb-6">
            <p className="text-sm text-black/50">Customer reviews and testimonials</p>
            <button className="flex items-center gap-2 px-4 py-2 rounded-lg fabric-gradient text-white text-sm font-medium">
              <Plus size={16} />
              Add Testimonial
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { name: 'John Smith', company: 'Acme Corp', content: 'Amazing service! The team went above and beyond our expectations.' },
              { name: 'Lisa Johnson', company: 'TechStart', content: 'Highly recommend to anyone looking for quality work.' },
            ].map((testimonial, i) => (
              <div key={i} className="bg-white rounded-2xl border border-black/[0.06] p-6">
                <div className="flex items-center gap-1 text-yellow-500 mb-3">
                  {[1,2,3,4,5].map(star => <Star key={star} size={16} fill="currentColor" />)}
                </div>
                <p className="text-sm italic">"{testimonial.content}"</p>
                <div className="mt-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-black/10 flex items-center justify-center">
                    <Users size={18} />
                  </div>
                  <div>
                    <p className="font-medium text-sm">{testimonial.name}</p>
                    <p className="text-xs text-black/50">{testimonial.company}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

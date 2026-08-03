import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { Globe, Building2, Phone, Mail, MapPin, Edit2, Save, Eye } from 'lucide-react'

export default function CompanyHomepage() {
  const { staff } = useAuth()
  const [profile, setProfile] = useState<any>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [formData, setFormData] = useState({
    company_name: '',
    tagline: '',
    description: '',
    industry: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    state: '',
  })

  useEffect(() => {
    if (!staff?.business_id) return
    setFormData({
      company_name: 'Your Company Name',
      tagline: 'Your tagline here',
      description: 'Tell your story...',
      industry: '',
      email: '',
      phone: '',
      address: '',
      city: '',
      state: '',
    })
  }, [staff?.business_id])

  const getCompanyUrl = () => `${window.location.origin}/company/${staff?.business_id}`

  if (isEditing) {
    return (
      <div className="pb-20">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold">Company Homepage Editor</h1>
          <div className="flex gap-2">
            <button onClick={() => setIsEditing(false)} className="px-4 py-2 rounded-lg border">Cancel</button>
            <button onClick={() => setIsEditing(false)} className="px-4 py-2 rounded-lg bg-indigo-600 text-white">Save</button>
          </div>
        </div>
        <div className="bg-white rounded-2xl border p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Company Name</label>
            <input value={formData.company_name} onChange={e => setFormData(p => ({ ...p, company_name: e.target.value }))} className="w-full px-4 py-2.5 rounded-xl border" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Tagline</label>
            <input value={formData.tagline} onChange={e => setFormData(p => ({ ...p, tagline: e.target.value }))} className="w-full px-4 py-2.5 rounded-xl border" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">About Us</label>
            <textarea value={formData.description} onChange={e => setFormData(p => ({ ...p, description: e.target.value }))} rows={4} className="w-full px-4 py-2.5 rounded-xl border" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Email</label>
              <input value={formData.email} onChange={e => setFormData(p => ({ ...p, email: e.target.value }))} className="w-full px-4 py-2.5 rounded-xl border" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Phone</label>
              <input value={formData.phone} onChange={e => setFormData(p => ({ ...p, phone: e.target.value }))} className="w-full px-4 py-2.5 rounded-xl border" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="pb-20">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold">Company Homepage</h1>
          <p className="text-sm text-black/50">Your public mini-website</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => window.open(getCompanyUrl(), '_blank')} className="px-4 py-2 rounded-lg border flex items-center gap-2">
            <Eye size={16} /> Preview
          </button>
          <button onClick={() => setIsEditing(true)} className="px-4 py-2 rounded-lg bg-indigo-600 text-white flex items-center gap-2">
            <Edit2 size={16} /> Edit Page
          </button>
        </div>
      </div>

      <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-2xl border border-indigo-200 p-4 mb-6">
        <p className="text-sm text-indigo-600 font-medium mb-2">Your Public Company Page URL</p>
        <div className="flex gap-2">
          <input value={getCompanyUrl()} readOnly className="flex-1 px-4 py-2 rounded-lg bg-white border" />
          <button onClick={() => navigator.clipboard.writeText(getCompanyUrl())} className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm">Copy</button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border overflow-hidden">
        <div className="h-32 bg-gradient-to-r from-indigo-500 to-purple-600 flex items-center justify-center">
          <h2 className="text-3xl font-bold text-white">{formData.company_name}</h2>
        </div>
        <div className="p-6">
          <p className="text-xl text-black/70 mb-4">{formData.tagline}</p>
          <p className="text-black/60 mb-4">{formData.description}</p>
          <div className="flex gap-4 text-sm text-black/50">
            {formData.email && <span className="flex items-center gap-1"><Mail size={14} /> {formData.email}</span>}
            {formData.phone && <span className="flex items-center gap-1"><Phone size={14} /> {formData.phone}</span>}
            {formData.address && <span className="flex items-center gap-1"><MapPin size={14} /> {formData.address}</span>}
          </div>
        </div>
      </div>
    </div>
  )
}

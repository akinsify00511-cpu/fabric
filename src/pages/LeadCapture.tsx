import { useState } from 'react'
import { CheckCircle, Building2, User, Mail, Phone, MessageSquare } from 'lucide-react'
import { supabase } from '../lib/supabase'

interface LeadCaptureProps {
  source?: string
  onSuccess?: () => void
}

export default function LeadCapture({ source = 'website', onSuccess }: LeadCaptureProps) {
  const [form, setForm] = useState({
    full_name: '',
    company_name: '',
    email: '',
    phone: '',
    message: '',
    interested_in: 'crm',
  })
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const interests = [
    { value: 'crm', label: 'CRM & Sales' },
    { value: 'finance', label: 'Finance & Invoicing' },
    { value: 'projects', label: 'Projects & Tasks' },
    { value: 'hr', label: 'HR & People' },
    { value: 'full', label: 'Complete Business Suite' },
  ]

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    
    try {
      // Save lead to Supabase
      const { error: dbError } = await supabase
        .from('leads')
        .insert({
          full_name: form.full_name,
          company_name: form.company_name,
          email: form.email,
          phone: form.phone || null,
          message: form.message || null,
          interested_in: form.interested_in,
          source: source,
          referrer: document.referrer || null,
          metadata: {
            user_agent: navigator.userAgent,
          },
        })

      if (dbError) {
        console.error('Failed to save lead:', dbError)
        // Don't show error to user - still show success
        // Lead might not be critical enough to fail the form
      }
      
      setSubmitted(true)
      onSuccess?.()
    } catch (err) {
      console.error('Lead capture error:', err)
      // Still show success - we don't want to discourage users
      setSubmitted(true)
      onSuccess?.()
    } finally {
      setLoading(false)
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br to-[#4285F4] to-[#8B5CF6] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 max-w-md w-full text-center shadow-2xl">
          <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
            <CheckCircle size={40} className="text-green-500" />
          </div>
          <h2 className="text-2xl font-bold text-black mb-2">Thank You!</h2>
          <p className="text-black mb-6">
            We've received your information. One of our sales representatives will contact you within 24 hours.
          </p>
          <div className="bg-[#4285F4]/5 rounded-xl p-4 text-left">
            <p className="text-sm text-[#4285F4]">
              <strong>What happens next:</strong>
            </p>
            <ul className="mt-2 space-y-1 text-sm text-[#4285F4]">
              <li>1. Our team will review your requirements</li>
              <li>2. We'll schedule a quick call to understand your needs</li>
              <li>3. You'll get a personalized demo</li>
            </ul>
          </div>
          <button
            onClick={() => window.close()}
            className="mt-6 text-black hover:text-black text-sm"
          >
            Close this page
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br to-[#4285F4] to-[#8B5CF6] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl">
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-[#4285F4] flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-bold text-xl">A</span>
          </div>
          <h1 className="text-2xl font-bold text-black">Get Started with Avenize</h1>
          <p className="text-black mt-2">Tell us about your business and we'll help you get started</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-black mb-1">Full Name *</label>
            <div className="relative">
              <User size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-black" />
              <input
                type="text"
                required
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-black focus:ring-2 focus:ring-[#4285F4] focus:border-[#4285F4]"
                placeholder="Chinedu Okafor"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-black mb-1">Company Name *</label>
            <div className="relative">
              <Building2 size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-black" />
              <input
                type="text"
                required
                value={form.company_name}
                onChange={(e) => setForm({ ...form, company_name: e.target.value })}
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-black focus:ring-2 focus:ring-[#4285F4] focus:border-[#4285F4]"
                placeholder="TechCorp Nigeria Ltd"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-black mb-1">Email *</label>
            <div className="relative">
              <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-black" />
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-black focus:ring-2 focus:ring-[#4285F4] focus:border-[#4285F4]"
                placeholder="chinedu@techcorp.ng"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-black mb-1">Phone Number</label>
            <div className="relative">
              <Phone size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-black" />
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-black focus:ring-2 focus:ring-[#4285F4] focus:border-[#4285F4]"
                placeholder="08012345678"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-black mb-1">Interested In</label>
            <select
              value={form.interested_in}
              onChange={(e) => setForm({ ...form, interested_in: e.target.value })}
              className="w-full px-4 py-3 rounded-xl border border-black focus:ring-2 focus:ring-[#4285F4] focus:border-[#4285F4]"
            >
              {interests.map(i => (
                <option key={i.value} value={i.value}>{i.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-black mb-1">Message</label>
            <div className="relative">
              <MessageSquare size={18} className="absolute left-3 top-3 text-black" />
              <textarea
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                rows={3}
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-black focus:ring-2 focus:ring-[#4285F4] focus:border-[#4285F4]"
                placeholder="Tell us about your business needs..."
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-gradient-to-r to-[#4285F4] to-[#8B5CF6] text-white font-semibold rounded-xl hover:shadow-lg transition disabled:opacity-50"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Submitting...
              </span>
            ) : (
              'Get My Free Demo'
            )}
          </button>
        </form>

        <p className="text-center text-xs text-black mt-6">
          By submitting, you agree to our privacy policy and terms of service.
        </p>
      </div>
    </div>
  )
}

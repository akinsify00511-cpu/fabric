import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import {
  Building2, Users, Wrench, TrendingUp, ArrowRight, ArrowLeft,
  Check, Loader2, Zap, Eye, Rocket
} from 'lucide-react'

const STEPS = [
  { icon: Building2, title: 'Your Business', description: 'Set up your company details' },
  { icon: Users, title: 'Your Profile', description: 'Tell us about yourself' },
  { icon: Wrench, title: 'What You Do', description: 'Configure your operations' },
  { icon: TrendingUp, title: 'Ready to Go', description: "You're all set!" },
]

const INDUSTRIES = [
  { id: 'construction', name: 'Construction', emoji: '🏗️', tip: 'Track field jobs, materials, and crew schedules easily' },
  { id: 'manufacturing', name: 'Manufacturing', emoji: '🏭', tip: 'Monitor production, inventory, and equipment maintenance' },
  { id: 'services', name: 'Field Services', emoji: '🔧', tip: 'Manage jobs, schedules, and field worker updates' },
  { id: 'retail', name: 'Retail & Trading', emoji: '🛒', tip: 'Track sales, inventory, and customer orders' },
  { id: 'real_estate', name: 'Real Estate', emoji: '🏠', tip: 'Manage properties, leads, and rental schedules' },
  { id: 'other', name: 'Other Industry', emoji: '📋', tip: 'Customize Avenize to fit any business type' },
]

const INDUSTRY_FEATURES: Record<string, { icon: React.ReactNode; label: string }[]> = {
  construction: [
    { icon: '🔨', label: 'Job tracking & field updates' },
    { icon: '📦', label: 'Materials management' },
    { icon: '👷', label: 'Crew scheduling' },
  ],
  manufacturing: [
    { icon: '🏭', label: 'Production monitoring' },
    { icon: '📦', label: 'Inventory & stock' },
    { icon: '⚙️', label: 'Equipment maintenance' },
  ],
  services: [
    { icon: '🔧', label: 'Job management' },
    { icon: '📍', label: 'Field worker tracking' },
    { icon: '📊', label: 'Service reports' },
  ],
  retail: [
    { icon: '💰', label: 'Sales & payments' },
    { icon: '📦', label: 'Inventory management' },
    { icon: '👥', label: 'Customer CRM' },
  ],
  real_estate: [
    { icon: '🏠', label: 'Property management' },
    { icon: '🤝', label: 'Lead tracking' },
    { icon: '📅', label: 'Viewing schedules' },
  ],
  other: [
    { icon: '✅', label: 'Task management' },
    { icon: '💰', label: 'Invoicing & payments' },
    { icon: '👥', label: 'Team coordination' },
  ],
}

export default function Onboarding() {
  const navigate = useNavigate()
  const { session, refreshStaff, signOut } = useAuth()
  const [step, setStep] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Check if already onboarded
  useEffect(() => {
    const checkOnboarding = async () => {
      const localOnboarding = localStorage.getItem('avenize_onboarding_complete')
      if (localOnboarding === 'true') {
        navigate('/app', { replace: true })
        return
      }
      if (session?.user.id) {
        const { data: staffData } = await supabase
          .from('staff')
          .select('onboarding_completed, business_id')
          .eq('user_id', session.user.id)
          .maybeSingle()
        if (staffData?.business_id && staffData?.onboarding_completed) {
          localStorage.setItem('avenize_onboarding_complete', 'true')
          navigate('/app', { replace: true })
        }
      }
    }
    checkOnboarding()
  }, [session, navigate])

  // Form data
  const [businessName, setBusinessName] = useState(
    session?.user?.user_metadata?.business_name as string || '',
  )
  const [fullName, setFullName] = useState(
    session?.user?.user_metadata?.full_name as string || '',
  )
  const [industry, setIndustry] = useState('')

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleNext()
    }
  }, [step, businessName, fullName, industry])

  const handleNext = async () => {
    if (step === 0 && !businessName.trim()) {
      setError('Please enter your business name')
      return
    }
    if (step === 1 && !fullName.trim()) {
      setError('Please enter your name')
      return
    }
    if (step === 2 && !industry) {
      setError('Please select your industry')
      return
    }

    setError(null)
    if (step < 3) {
      setStep(step + 1)
    } else {
      await completeSetup()
    }
  }

  const tryDemo = () => {
    // Set demo mode and skip onboarding
    localStorage.setItem('avenize_onboarding_complete', 'true')
    localStorage.setItem('avenize_demo', 'true')
    localStorage.setItem('avenize_demo_user', JSON.stringify({
      id: 'demo-user',
      name: fullName || 'Demo User',
      email: session?.user?.email || 'demo@example.com',
      business_id: 'demo-business',
      business_name: 'Demo Business',
      role: 'owner',
    }))
    window.location.href = '/app'
  }

  const completeSetup = async () => {
    setLoading(true)
    setError(null)

    try {
      const { data, error: rpcError } = await supabase.rpc('create_business_and_owner', {
        p_business_name: businessName,
        p_industry: industry,
        p_staff_name: fullName,
      })

      if (rpcError) throw rpcError

      localStorage.setItem('avenize_onboarding_complete', 'true')
      if (data?.staff_id) {
        await supabase
          .from('staff')
          .update({ onboarding_completed: true })
          .eq('id', data.staff_id)
      }

      window.location.href = '/app'
    } catch (err: any) {
      console.error('Setup error:', err)
      setError(err.message || 'Failed to complete setup')
    } finally {
      setLoading(false)
    }
  }

  const selectedIndustryData = INDUSTRIES.find(i => i.id === industry)
  const selectedFeatures = INDUSTRY_FEATURES[industry] || INDUSTRY_FEATURES.other

  return (
    <div className="min-h-screen bg-[var(--avenize-offwhite)] flex" onKeyDown={handleKeyDown}>
      {/* Progress Sidebar */}
      <div className="hidden md:flex w-80 bg-white border-r border-black/5 flex-col">
        <div className="p-8">
          <div className="w-12 h-12 rounded-2xl avenize-gradient flex items-center justify-center mb-4">
            <span className="text-white font-bold text-xl">A</span>
          </div>
          <h1 className="text-xl font-bold">Welcome to Avenize</h1>
          <p className="text-sm text-black/50 mt-1">Let's set up your business</p>
        </div>

        <div className="flex-1 px-8">
          {STEPS.map((s, i) => (
            <div key={i} className="flex items-start gap-3 mb-6">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                i < step ? 'bg-green-500 text-white' :
                i === step ? 'avenize-gradient text-white' :
                'bg-gray-100 text-gray-400'
              }`}>
                {i < step ? <Check size={16} /> : <s.icon size={16} />}
              </div>
              <div>
                <p className={`font-medium ${i === step ? 'text-[var(--avenize-black)]' : 'text-black/40'}`}>
                  {s.title}
                </p>
                <p className="text-xs text-black/40">{s.description}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Try Demo shortcut */}
        <div className="p-6 border-t border-black/5">
          <button onClick={tryDemo}
            className="w-full flex items-center gap-2 px-4 py-2.5 rounded-xl border border-black/10 text-sm text-black/60 hover:bg-black/[0.03] transition mb-2">
            <Eye size={14} /> Try demo first
          </button>
          <button onClick={signOut} className="text-xs text-black/30 hover:text-black/50">
            Sign out
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center p-6 md:p-8">
        <div className="w-full max-w-md">
          {/* Mobile Progress */}
          <div className="md:hidden mb-8">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Step {step + 1} of 4</span>
              <span className="text-sm text-black/50">{Math.round(((step + 1) / 4) * 100)}%</span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full">
              <div className="h-1.5 bg-[var(--avenize-primary)] rounded-full transition-all" style={{ width: `${((step + 1) / 4) * 100}%` }} />
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-6">
              {error}
            </div>
          )}

          {/* Step 0: Business Name */}
          {step === 0 && (
            <div className="space-y-6">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                    <Building2 size={16} className="text-blue-600" />
                  </div>
                  <span className="text-xs font-semibold text-black/40 uppercase tracking-wide">Step 1 of 4</span>
                </div>
                <h2 className="text-2xl font-bold">What's your business called?</h2>
                <p className="text-black/50 mt-2">This will be your workspace name in Avenize.</p>
              </div>
              <input
                type="text"
                value={businessName}
                onChange={(e) => { setBusinessName(e.target.value); setError(null) }}
                placeholder="e.g. Lekki Construction Ltd"
                className="w-full px-4 py-4 rounded-xl border-2 border-black/10 text-lg focus:border-[var(--avenize-primary)] focus:outline-none"
                autoFocus
              />
              <p className="text-xs text-black/30">Press Enter ↵ to continue</p>
            </div>
          )}

          {/* Step 1: Full Name */}
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
                    <Users size={16} className="text-purple-600" />
                  </div>
                  <span className="text-xs font-semibold text-black/40 uppercase tracking-wide">Step 2 of 4</span>
                </div>
                <h2 className="text-2xl font-bold">And your name?</h2>
                <p className="text-black/50 mt-2">How should we address you?</p>
              </div>
              <input
                type="text"
                value={fullName}
                onChange={(e) => { setFullName(e.target.value); setError(null) }}
                placeholder="e.g. Chinedu Okonkwo"
                className="w-full px-4 py-4 rounded-xl border-2 border-black/10 text-lg focus:border-[var(--avenize-primary)] focus:outline-none"
                autoFocus
              />
              <p className="text-xs text-black/30">Press Enter ↵ to continue</p>
            </div>
          )}

          {/* Step 2: Industry */}
          {step === 2 && (
            <div className="space-y-5">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center">
                    <Wrench size={16} className="text-orange-600" />
                  </div>
                  <span className="text-xs font-semibold text-black/40 uppercase tracking-wide">Step 3 of 4</span>
                </div>
                <h2 className="text-2xl font-bold">What do you do?</h2>
                <p className="text-black/50 mt-2">We personalize Avenize based on your industry.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {INDUSTRIES.map((ind) => (
                  <button
                    key={ind.id}
                    onClick={() => { setIndustry(ind.id); setError(null) }}
                    className={`p-4 rounded-xl border-2 text-left transition-all ${
                      industry === ind.id
                        ? 'border-[var(--avenize-primary)] bg-[var(--avenize-primary)]/5'
                        : 'border-black/10 hover:border-black/20'
                    }`}
                  >
                    <span className="text-2xl mb-2 block">{ind.emoji}</span>
                    <span className="text-sm font-medium block">{ind.name}</span>
                    {industry === ind.id && ind.tip && (
                      <p className="text-[10px] text-[var(--avenize-primary)] mt-1 leading-tight">{ind.tip}</p>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: Ready */}
          {step === 3 && (
            <div className="text-center space-y-6">
              <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                <Check size={40} className="text-green-600" />
              </div>
              <div>
                <h2 className="text-2xl font-bold">You're all set!</h2>
                <p className="text-black/50 mt-2">{businessName} is ready. Let's build something great.</p>
              </div>

              {/* Industry-specific features */}
              {industry && (
                <div className="bg-black/[0.03] rounded-2xl p-4 text-left">
                  <p className="text-xs font-semibold text-black/40 uppercase tracking-wide mb-3">
                    What you'll get for {selectedIndustryData?.name}
                  </p>
                  <div className="space-y-2">
                    {selectedFeatures.map((f, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <span className="text-lg">{f.icon}</span>
                        <span className="text-sm text-[var(--avenize-black)]">{f.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Try demo option */}
              <div className="pt-2">
                <button onClick={tryDemo}
                  className="text-sm text-black/30 hover:text-black/50 transition underline">
                  Or explore with demo data first →
                </button>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex gap-3 mt-8">
            {step > 0 && (
              <button onClick={() => setStep(step - 1)}
                className="flex items-center gap-2 px-5 py-3 rounded-xl border border-black/10 font-medium hover:bg-black/[0.03] transition">
                <ArrowLeft size={16} /> Back
              </button>
            )}
            <button
              onClick={handleNext}
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl avenize-gradient text-white py-3 font-semibold disabled:opacity-50 hover:opacity-90 transition"
            >
              {loading ? (
                <Loader2 size={20} className="animate-spin" />
              ) : step === 3 ? (
                <>Launch Avenize <Rocket size={18} /></>
              ) : (
                <>Continue <ArrowRight size={18} /></>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

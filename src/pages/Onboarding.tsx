import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import {
  Building2, Users, Wrench, TrendingUp, ArrowRight, Check, Loader2, Palette
} from 'lucide-react'

// Professional brand colors - hardcoded for reliability
const BRAND_COLORS = [
  { id: 'midnight', name: 'Midnight', hex: '#111827', previewBg: '#1F2937', previewText: '#FFFFFF' },
  { id: 'slate', name: 'Slate', hex: '#0f172a', previewBg: '#1e293b', previewText: '#FFFFFF' },
  { id: 'cloud', name: 'Cloud', hex: '#FFFFFF', previewBg: '#F3F4F6', previewText: '#111827' },
]

const STEPS = [
  {
    icon: Building2,
    title: 'Your Business',
    description: 'Set up your company details',
  },
  {
    icon: Users,
    title: 'Your Profile',
    description: 'Tell us about yourself',
  },
  {
    icon: Palette,
    title: 'Your Theme',
    description: 'Choose your look',
  },
  {
    icon: Wrench,
    title: 'What You Do',
    description: 'Configure your operations',
  },
  {
    icon: TrendingUp,
    title: 'Ready to Go',
    description: "You're all set!",
  },
]

const INDUSTRIES = [
  { id: 'construction', name: 'Construction', emoji: '🏗️' },
  { id: 'real_estate', name: 'Real Estate', emoji: '🏠' },
  { id: 'manufacturing', name: 'Manufacturing', emoji: '🏭' },
  { id: 'retail', name: 'Retail', emoji: '🛒' },
  { id: 'services', name: 'Professional Services', emoji: '💼' },
  { id: 'other', name: 'Other', emoji: '📋' },
]

export default function Onboarding() {
  const navigate = useNavigate()
  const { session, staff, refreshStaff, signOut } = useAuth()
  const [step, setStep] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // A completed staff record is the canonical application-side onboarding
  // state. If a user reaches /onboarding after a refresh, direct URL entry,
  // or a transient route race, never expose the onboarding wizard again.
  useEffect(() => {
    if (staff?.business_id && staff.onboarding_completed) {
      navigate('/app', { replace: true })
    }
  }, [staff, navigate])

  // Check if already onboarded - redirect to app
  useEffect(() => {
    const checkOnboarding = async () => {
      // No session - stay on onboarding
      if (!session?.user.id) {
        return
      }

      // Check database for staff record (authoritative — localStorage can be spoofed)
      try {
        const { data: staffData } = await supabase
          .from('staff')
          .select('onboarding_completed, business_id')
          .eq('user_id', session.user.id)
          .maybeSingle()

        if (staffData?.business_id && staffData?.onboarding_completed) {
          navigate('/app', { replace: true })
        }
      } catch (err) {
        console.warn('Error checking onboarding status:', err)
        // Stay on onboarding page if error
      }
    }
    checkOnboarding()
  }, [session, navigate])

  // Form data
  const [businessName, setBusinessName] = useState('')
  const [fullName, setFullName] = useState(
    (session?.user.user_metadata?.full_name as string | undefined) ?? '',
  )
  const [jobTitle, setJobTitle] = useState('')
  const [industry, setIndustry] = useState('')
  const [selectedColor, setSelectedColor] = useState<typeof BRAND_COLORS[0] | null>(null)

  const handleNext = async () => {
    if (step === 0 && !businessName.trim()) {
      setError('Please enter your business name')
      return
    }
    if (step === 1 && !fullName.trim()) {
      setError('Please enter your name')
      return
    }
    if (step === 2 && !selectedColor) {
      setError('Please select a color theme')
      return
    }
    if (step === 3 && !industry) {
      setError('Please select your industry')
      return
    }

    setError(null)

    if (step < 4) {
      setStep(step + 1)
    } else {
      await completeSetup()
    }
  }

  const completeSetup = async () => {
    // The SECURITY DEFINER RPC is granted only to `authenticated` and keys
    // every write off auth.uid(). If the session isn't restored into the
    // client yet (getSession() still pending) or has expired, this call goes
    // out as `anon` -> the function 404s (no anon grant) or inserts with
    // user_id = NULL. Bail before firing it. (This mirrors the guard the
    // useEffect above already uses for the staff-status check.)
    if (!session?.user.id) {
      setError('Your session has expired. Please log in again to continue.')
      navigate('/login', { replace: true })
      return
    }

    setLoading(true)
    setError(null)

    try {
      // Try RPC first (bypasses RLS due to SECURITY DEFINER)
      const { data, error: rpcError } = await supabase.rpc('create_business_and_owner', {
        p_business_name: businessName,
        p_industry: industry,
        p_staff_name: fullName,
        p_job_title: jobTitle.trim() || undefined,
      })

      if (rpcError) {
        // The user may already have a business (e.g. a prior partial
        // onboarding, or a transient staff fetch sent an already-onboarded
        // user back here). The RPC raises 'User already belongs to a
        // business' in that case -- correct recovery is to refresh the
        // authoritative staff record and go to the app, NOT to attempt
        // direct inserts (RLS denies those by design post-074) and show a
        // misleading "Failed to create business".
        if (/already belongs to a business/i.test(rpcError.message)) {
          await refreshStaff()
          navigate('/app', { replace: true })
          return
        }
        // The SECURITY DEFINER RPC is the single authoritative onboarding
        // path (migration 074 blocks direct business/staff inserts), so
        // there is no valid manual fallback -- surface the real error.
        console.error('create_business_and_owner RPC failed:', rpcError)
        if (/could not find the function|PGRST202/i.test(rpcError.message)) {
          setError('Your account is set up, but the business creation service is not yet configured on this deployment. Please contact support.')
        } else {
          setError(rpcError.message || 'Setup failed. Please try again.')
        }
        return
      }

      // RPC succeeded
      if (selectedColor) {
        localStorage.setItem('avenize_theme_bg', selectedColor.hex)
        localStorage.setItem('avenize_theme_text', selectedColor.previewText)
      }
      window.location.href = '/app'

    } catch (err: any) {
      console.error('Setup error:', err)
      setError(err.message || 'Setup failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-white flex">
      {/* Progress Sidebar */}
      <div className="hidden md:flex w-80 bg-white border-r border-black flex-col">
        <div className="p-8">
          <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center mb-4">
            <span className="text-white font-bold text-xl">A</span>
          </div>
          <h1 className="text-xl font-bold text-black">Welcome to Avenize</h1>
          <p className="text-sm text-black mt-1">Let's set up your business</p>
        </div>

        <div className="flex-1 px-8">
          {STEPS.map((s, i) => (
            <div key={i} className="flex items-start gap-3 mb-6">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                i < step ? 'bg-green-500 text-white' :
                i === step ? 'bg-blue-600 text-white' :
                'bg-white text-black'
              }`}>
                {i < step ? <Check size={16} /> : <s.icon size={16} />}
              </div>
              <div>
                <p className={`font-medium text-sm ${i === step ? 'text-black' : 'text-black'}`}>
                  {s.title}
                </p>
                <p className="text-xs text-black">{s.description}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="p-8 border-t border-black">
          <button 
            onClick={signOut}
            className="text-sm text-black hover:text-black"
          >
            Sign out
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          {/* Mobile Progress */}
          <div className="md:hidden mb-8">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-black">Step {step + 1} of {STEPS.length}</span>
              <span className="text-sm text-black">{Math.round(((step + 1) / STEPS.length) * 100)}%</span>
            </div>
            <div className="h-2 bg-white rounded-full">
              <div 
                className="h-2 bg-blue-600 rounded-full transition-all"
                style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
              />
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-6">
              {error}
            </div>
          )}

          {/* Step 0: Business Name */}
          {step === 0 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-black">What's your business called?</h2>
                <p className="text-black mt-2">This will be your workspace name in Avenize.</p>
              </div>
              <input
                type="text"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="Your Company Ltd"
                className="w-full px-5 py-4 rounded-lg border-2 border-black text-lg text-black placeholder-black focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20 transition-all bg-white"
                autoFocus
              />
            </div>
          )}

          {/* Step 1: Full Name + Position */}
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-black">And your name?</h2>
                <p className="text-black mt-2">How should we address you?</p>
              </div>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Chinedu Okonkwo"
                className="w-full px-5 py-4 rounded-lg border-2 border-black text-lg text-black placeholder-black focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20 transition-all bg-white"
                autoFocus
              />
              <div>
                <label className="block text-sm font-medium text-black/70 mb-1.5">
                  Your role or position
                </label>
                <input
                  type="text"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  placeholder="e.g. Founder & CEO, Operations Director"
                  className="w-full px-5 py-4 rounded-lg border-2 border-black text-base text-black placeholder-black focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20 transition-all bg-white"
                />
                <p className="text-xs text-black mt-1.5">Optional — helps your team know who you are.</p>
              </div>
            </div>
          )}

          {/* Step 2: Theme Color Picker */}
          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-black">Choose your theme</h2>
                <p className="text-black mt-2">Pick a background color for your workspace.</p>
              </div>
              <div className="grid grid-cols-3 gap-4">
                {BRAND_COLORS.map((color) => (
                  <button
                    key={color.id}
                    onClick={() => setSelectedColor(color)}
                    className={`relative p-4 rounded-xl border-2 transition-all hover:scale-105 ${
                      selectedColor?.id === color.id
                        ? 'shadow-lg ring-2 ring-blue-600 ring-offset-2'
                        : 'hover:shadow-md'
                    }`}
                    style={{ backgroundColor: color.hex }}
                  >
                    {/* Preview Card */}
                    <div 
                      className="w-full h-12 rounded-lg mb-2 flex items-center justify-center text-lg font-bold shadow-sm"
                      style={{ 
                        backgroundColor: color.previewBg,
                        color: color.previewText,
                        borderColor: color.id === 'cloud' ? '#cbd5e1' : '#1e293b'
                      }}
                    >
                      A
                    </div>
                    
                    {/* Color Name - Always dark text for visibility */}
                    <span className="block text-sm font-semibold text-center text-black">
                      {color.name}
                    </span>
                    
                    {/* Selected Checkmark */}
                    {selectedColor?.id === color.id && (
                      <div className="absolute -top-2 -right-2 w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center shadow-md">
                        <Check size={14} className="text-white" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
                <p className="text-xs text-blue-700 text-center">
                  Text color auto-adjusts for optimal readability
                </p>
              </div>
            </div>
          )}

          {/* Step 3: Industry */}
          {step === 3 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-black">What industry are you in?</h2>
                <p className="text-black mt-2">This helps us customize Avenize for you.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {INDUSTRIES.map((ind) => (
                  <button
                    key={ind.id}
                    onClick={() => setIndustry(ind.id)}
                    className={`p-4 rounded-xl border-2 text-left transition-all ${
                      industry === ind.id
                        ? 'border-[var(--av-primary, var(--av-primary))] bg-[var(--av-primary, var(--av-primary))]/5'
                        : 'border-black/10 hover:border-black/20'
                    }`}
                  >
                    <span className="text-2xl mb-2 block">{ind.emoji}</span>
                    <span className="text-sm font-medium">{ind.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 4: Ready */}
          {step === 4 && (
            <div className="text-center space-y-6">
              <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                <Check size={40} className="text-green-600" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-black">You're all set!</h2>
                <p className="text-black mt-2">
                  {businessName} is ready. Let's build something great.
                </p>
              </div>
              <div className="bg-white rounded-xl p-4 text-left">
                <p className="text-sm font-medium text-black mb-2">What you get with Avenize:</p>
                <ul className="space-y-2 text-sm text-black">
                  <li className="flex items-center gap-2">
                    <Check size={16} className="text-green-500" />
                    Job & project tracking
                  </li>
                  <li className="flex items-center gap-2">
                    <Check size={16} className="text-green-500" />
                    Inventory management
                  </li>
                  <li className="flex items-center gap-2">
                    <Check size={16} className="text-green-500" />
                    Invoicing & payments
                  </li>
                  <li className="flex items-center gap-2">
                    <Check size={16} className="text-green-500" />
                    Team coordination
                  </li>
                </ul>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex gap-3 mt-8">
            {step > 0 && (
              <button
                onClick={() => setStep(step - 1)}
                className="px-6 py-3 rounded-lg border-2 border-black font-medium text-black hover:bg-white transition-colors bg-white"
              >
                Back
              </button>
            )}
            <button
              onClick={handleNext}
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-blue-600 text-white py-3 font-semibold disabled:opacity-50 hover:bg-blue-700 transition-colors shadow-sm hover:shadow-md"
            >
              {loading ? (
                <Loader2 size={20} className="animate-spin" />
              ) : step === 4 ? (
                <>Launch Avenize <ArrowRight size={20} /></>
              ) : (
                <>Continue <ArrowRight size={20} /></>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

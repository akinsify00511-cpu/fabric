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
  { id: 'slate', name: 'Slate', hex: '#374151', previewBg: '#4B5563', previewText: '#FFFFFF' },
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
  const { session, refreshStaff, signOut } = useAuth()
  const [step, setStep] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Check if already onboarded - redirect to app
  useEffect(() => {
    const checkOnboarding = async () => {
      // Check localStorage first
      const localOnboarding = localStorage.getItem('avenize_onboarding_complete')
      if (localOnboarding === 'true') {
        navigate('/app', { replace: true })
        return
      }
      
      // Check database
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
  const [businessName, setBusinessName] = useState('')
  const [fullName, setFullName] = useState(
    (session?.user.user_metadata?.full_name as string | undefined) ?? '',
  )
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
    setLoading(true)
    setError(null)

    try {
      // Create business and owner
      const { data, error: rpcError } = await supabase.rpc('create_business_and_owner', {
        p_business_name: businessName,
        p_industry: industry,
        p_staff_name: fullName,
      })

      if (rpcError) {
        console.error('RPC Error:', rpcError)
        // Handle specific error messages
        if (rpcError.message?.includes('already belongs')) {
          throw new Error('You are already registered with a business')
        }
        if (rpcError.message?.includes('ambiguous')) {
          throw new Error('Database configuration issue. Please contact support.')
        }
        throw rpcError
      }

      // Save color preferences to localStorage for branding
      if (selectedColor) {
        localStorage.setItem('avenize_theme_bg', selectedColor.hex)
        localStorage.setItem('avenize_theme_text', selectedColor.previewText)
      }

      // Mark onboarding as complete in localStorage (for quick access)
      localStorage.setItem('avenize_onboarding_complete', 'true')
      
      // Also mark as complete in the staff record (for persistence)
      if (data?.p_staff_id) {
        await supabase
          .from('staff')
          .update({ onboarding_completed: true })
          .eq('id', data.p_staff_id)
        
        // Save branding colors to database
        if (selectedColor && data?.p_business_id) {
          await supabase
            .from('business_branding')
            .upsert({
              business_id: data.p_business_id,
              background_color: selectedColor.hex,
              text_color: selectedColor.previewText,
              updated_at: new Date().toISOString(),
            })
        }
      }

      // Force a full page reload to reset all auth state
      window.location.href = '/app'
    } catch (err: any) {
      console.error('Setup error:', err)
      // Show user-friendly error message
      if (err.message?.includes('already belongs') || err.message?.includes('already registered')) {
        // User already has a business - redirect to app
        localStorage.setItem('avenize_onboarding_complete', 'true')
        window.location.href = '/app'
        return
      }
      setError(err.message || 'Failed to complete setup. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Progress Sidebar */}
      <div className="hidden md:flex w-80 bg-white border-r border-gray-200 flex-col">
        <div className="p-8">
          <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center mb-4">
            <span className="text-white font-bold text-xl">A</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900">Welcome to Avenize</h1>
          <p className="text-sm text-gray-500 mt-1">Let's set up your business</p>
        </div>

        <div className="flex-1 px-8">
          {STEPS.map((s, i) => (
            <div key={i} className="flex items-start gap-3 mb-6">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                i < step ? 'bg-green-500 text-white' :
                i === step ? 'bg-blue-600 text-white' :
                'bg-gray-100 text-gray-400'
              }`}>
                {i < step ? <Check size={16} /> : <s.icon size={16} />}
              </div>
              <div>
                <p className={`font-medium text-sm ${i === step ? 'text-gray-900' : 'text-gray-400'}`}>
                  {s.title}
                </p>
                <p className="text-xs text-gray-400">{s.description}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="p-8 border-t border-gray-200">
          <button 
            onClick={signOut}
            className="text-sm text-gray-500 hover:text-gray-700"
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
              <span className="text-sm font-medium text-gray-700">Step {step + 1} of {STEPS.length}</span>
              <span className="text-sm text-gray-500">{Math.round(((step + 1) / STEPS.length) * 100)}%</span>
            </div>
            <div className="h-2 bg-gray-200 rounded-full">
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
                <h2 className="text-2xl font-bold text-gray-900">What's your business called?</h2>
                <p className="text-gray-500 mt-2">This will be your workspace name in Avenize.</p>
              </div>
              <input
                type="text"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="Your Company Ltd"
                className="w-full px-5 py-4 rounded-lg border-2 border-gray-200 text-lg text-gray-900 placeholder-gray-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20 transition-all bg-white"
                autoFocus
              />
            </div>
          )}

          {/* Step 1: Full Name */}
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">And your name?</h2>
                <p className="text-gray-500 mt-2">How should we address you?</p>
              </div>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Chinedu Okonkwo"
                className="w-full px-5 py-4 rounded-lg border-2 border-gray-200 text-lg text-gray-900 placeholder-gray-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20 transition-all bg-white"
                autoFocus
              />
            </div>
          )}

          {/* Step 2: Theme Color Picker */}
          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Choose your theme</h2>
                <p className="text-gray-500 mt-2">Pick a background color for your workspace.</p>
              </div>
              <div className="grid grid-cols-3 gap-4">
                {BRAND_COLORS.map((color) => (
                  <button
                    key={color.id}
                    onClick={() => setSelectedColor(color)}
                    className={`relative p-4 rounded-xl border-2 transition-all hover:scale-105 ${
                      selectedColor?.id === color.id
                        ? 'border-blue-600 shadow-lg ring-2 ring-blue-600 ring-offset-2'
                        : 'border-gray-200 hover:border-gray-300 hover:shadow-md'
                    }`}
                    style={{ backgroundColor: color.hex }}
                  >
                    {/* Preview Card */}
                    <div 
                      className="w-full h-12 rounded-lg mb-2 flex items-center justify-center text-lg font-bold border shadow-sm"
                      style={{ 
                        backgroundColor: color.previewBg,
                        color: color.previewText,
                        borderColor: color.id === 'cloud' ? '#E5E7EB' : '#4B5563'
                      }}
                    >
                      A
                    </div>
                    
                    {/* Color Name - Always dark text for visibility */}
                    <span className="block text-sm font-semibold text-center text-gray-900">
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
                <h2 className="text-2xl font-bold text-gray-900">What industry are you in?</h2>
                <p className="text-gray-500 mt-2">This helps us customize Avenize for you.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {INDUSTRIES.map((ind) => (
                  <button
                    key={ind.id}
                    onClick={() => setIndustry(ind.id)}
                    className={`p-4 rounded-xl border-2 text-left transition-all ${
                      industry === ind.id
                        ? 'border-[var(--avenize-primary)] bg-[var(--avenize-primary)]/5'
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
                <h2 className="text-2xl font-bold text-gray-900">You're all set!</h2>
                <p className="text-gray-500 mt-2">
                  {businessName} is ready. Let's build something great.
                </p>
              </div>
              <div className="bg-gray-50 rounded-xl p-4 text-left">
                <p className="text-sm font-medium text-gray-700 mb-2">What you get with Avenize:</p>
                <ul className="space-y-2 text-sm text-gray-600">
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
                className="px-6 py-3 rounded-lg border-2 border-gray-200 font-medium text-gray-700 hover:bg-gray-50 transition-colors bg-white"
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

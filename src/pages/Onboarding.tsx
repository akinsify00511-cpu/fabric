import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { logUsageEvent } from '../lib/useUsageTracking'
import { TOOLS, type ToolKey } from '../lib/useToolAccess'
import {
  Building2, Users, Wrench, TrendingUp, ArrowRight, Check, Loader2, Palette
} from 'lucide-react'

// Professional brand colors - hardcoded for reliability
const BRAND_COLORS = [
  { id: 'midnight', name: 'Midnight', hex: '#111827', previewBg: '#1F2937', previewText: '#FFFFFF' },
  { id: 'slate', name: 'Slate', hex: '#0f172a', previewBg: '#1e293b', previewText: '#FFFFFF' },
  { id: 'cloud', name: 'Cloud', hex: '#FFFFFF', previewBg: '#F3F4F6', previewText: '#111827' },
]

// Shared brand tokens — kept in lockstep with LandingEnhanced so the public
// site → onboarding → app share ONE visual language (P1.9 #2). The public
// landing page uses these exact values; onboarding previously used raw
// Tailwind `bg-[#155BB4]` (#2563EB) + `border-black`, a jarring color/border
// jump from the landing's refined tokens. Inline styles anchor the key visual
// elements here since onboarding predates the --av-* CSS tokens.
const BRAND = {
  primary: '#155BB4',
  primaryHover: '#1247A0',
  primarySoft: 'rgba(21, 91, 180, 0.08)',
  gradient: 'linear-gradient(135deg, #155BB4 0%, #4285F4 52%, #34A853 100%)',
  surface: '#F7F9FC',
  text: '#202124',
  textSecondary: '#5F6368',
  textMuted: '#9AA0A6',
  border: '#E4E8EF',
  success: '#157342',
  successSoft: '#E8F5EE',
}

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
    icon: TrendingUp,
    title: 'Your Industry',
    description: 'How you work',
  },
  {
    icon: Wrench,
    title: 'What You Do',
    description: 'Pick your tools',
  },
  {
    icon: Check,
    title: 'Ready to Go',
    description: "You're all set!",
  },
]

// Tools a brand-new business can choose to surface in their workspace. We show
// the high-value capabilities (not the settings/admin ones — those are always
// available). Selection here is advisory: it curates the sidebar/dashboard,
// it never grants access (entitlement + role remain the real gates).
const SELECTABLE_TOOLS = TOOLS.filter((t) =>
  ['crm', 'projects', 'finance', 'inventory', 'people', 'tasks', 'calendar',
   'meetings', 'campaigns', 'social', 'reports', 'chat', 'tickets',
   'knowledge', 'time-tracking', 'approvals'].includes(t.key),
)

// Sensible defaults per industry — a starting point the user can revise later.
const INDUSTRY_DEFAULT_TOOLS: Record<string, ToolKey[]> = {
  construction: ['projects', 'inventory', 'tasks', 'time-tracking', 'people', 'finance', 'calendar'],
  real_estate: ['crm', 'projects', 'finance', 'people', 'tasks', 'calendar'],
  manufacturing: ['inventory', 'projects', 'finance', 'tasks', 'people', 'reports'],
  retail: ['inventory', 'crm', 'finance', 'people', 'tasks'],
  services: ['crm', 'projects', 'tasks', 'time-tracking', 'finance', 'people', 'calendar'],
  other: ['crm', 'tasks', 'people', 'finance', 'calendar'],
}

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

  // Onboarding-start timestamp for the #14 completion telemetry (duration).
  const startedAtRef = useRef<number>(Date.now())

  // A confirmed business membership is the canonical onboarded state. If a
  // user reaches /onboarding after a refresh, direct URL entry, or a transient
  // route race, never expose the onboarding wizard again. We deliberately do
  // NOT check onboarding_completed here: that flag is stale on live DBs that
  // have not had migration 110 applied, which caused already-onboarded owners
  // to be trapped in a /app <-> /onboarding loop.
  useEffect(() => {
    if (staff?.business_id) {
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
          .select('business_id')
          .eq('user_id', session.user.id)
          .maybeSingle()

        if (staffData?.business_id) {
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
  // Tools the user chose to surface in their workspace. Seeded with sensible
  // industry defaults once they pick an industry (step 4); the user can toggle
  // on the tools step (step 3). Persisted after business creation succeeds.
  const [selectedTools, setSelectedToolsState] = useState<ToolKey[]>([])

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

    // When the user picks an industry (step 3) and advances, seed the tool
    // selection with sensible defaults for that industry so the next step
    // (tools, step 4) starts from a relevant baseline, not an empty list.
    if (step === 3 && industry && selectedTools.length === 0) {
      setSelectedToolsState(INDUSTRY_DEFAULT_TOOLS[industry] || INDUSTRY_DEFAULT_TOOLS.other)
    }

    if (step < 5) {
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
      // Persist the workspace tool selection (best-effort — if the table is
      // missing on this deployment, the cache + show-all default keep things
      // working). Done before redirect so the app mounts with the curation.
      if (selectedTools.length > 0 && session.user.id) {
        try {
          await supabase
            .from('user_workspace_selections')
            .upsert(
              {
                user_id: session.user.id,
                business_id: data,
                selected_tools: selectedTools,
                selection_completed: true,
              },
              { onConflict: 'user_id' },
            )
        } catch {
          /* non-blocking — selection is advisory, not a hard requirement */
        }
      }
      window.location.href = '/app'

      // #14 self-instrumentation: log onboarding completion (fire-and-forget).
      // steps_reached + duration_seconds feed the funnel/conversion RPCs. The
      // abandonment metric (auth.users with no staff) is derived server-side,
      // so this event only needs to capture the SUCCESS path's steps + duration.
      if (data) {
        logUsageEvent({
          businessId: data,
          staffId: undefined,
          moduleKey: 'onboarding',
          action: 'onboarding_complete',
          context: {
            steps_reached: step,
            duration_seconds: Math.round((Date.now() - startedAtRef.current) / 1000),
            industry,
          },
        })
      }

    } catch (err: any) {
      console.error('Setup error:', err)
      setError(err.message || 'Setup failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex" style={{ background: BRAND.surface }}>
      {/* Progress Sidebar */}
      <div className="hidden md:flex w-80 bg-white border-r flex-col" style={{ borderColor: BRAND.border }}>
        <div className="p-8">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4" style={{ background: BRAND.gradient }}>
            <span className="text-white font-bold text-xl">A</span>
          </div>
          <h1 className="text-xl font-bold" style={{ color: BRAND.text }}>Welcome to Avenize</h1>
          <p className="text-sm mt-1" style={{ color: BRAND.textSecondary }}>Let&apos;s set up your business</p>
          {/* Value-prop callback to the landing page (P1.9 #5): the public site
              promises "your whole business, connected — see what matters to you."
              Echo it here so onboarding doesn't feel like a generic setup wizard
              detached from the promise that brought the user in. */}
          <p className="text-xs mt-3 leading-relaxed" style={{ color: BRAND.textMuted }}>
            Your whole business, connected. We&apos;ll set up what matters to you — you can change anything later.
          </p>
        </div>

        <div className="flex-1 px-8">
          {STEPS.map((s, i) => {
            const active = i === step
            const done = i < step
            return (
            <div key={i} className="flex items-start gap-3 mb-6">
              <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                style={{
                  background: done ? BRAND.success : active ? BRAND.primary : 'transparent',
                  border: !done && !active ? `1.5px solid ${BRAND.border}` : 'none',
                }}>
                {done ? <Check size={16} className="text-white" /> : <s.icon size={16} style={{ color: active ? '#fff' : BRAND.textMuted }} />}
              </div>
              <div>
                <p className="font-medium text-sm" style={{ color: active ? BRAND.text : BRAND.textSecondary }}>
                  {s.title}
                </p>
                <p className="text-xs" style={{ color: BRAND.textSecondary }}>{s.description}</p>
              </div>
            </div>
            )
          })}
        </div>

        <div className="p-8 border-t" style={{ borderColor: BRAND.border }}>
          <button
            onClick={signOut}
            className="text-sm hover:underline"
            style={{ color: BRAND.textSecondary }}
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
              <span className="text-sm font-medium text-[#202124]">Step {step + 1} of {STEPS.length}</span>
              <span className="text-sm text-[#202124]">{Math.round(((step + 1) / STEPS.length) * 100)}%</span>
            </div>
            <div className="h-2 bg-white rounded-full">
              <div 
                className="h-2 bg-[#155BB4] rounded-full transition-all"
                style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
              />
            </div>
          </div>

          {error && (
            <div className="bg-[var(--av-danger-soft)] border border-[var(--av-danger)]/30 text-[var(--av-danger)] rounded-lg px-4 py-3 text-sm mb-6">
              {error}
            </div>
          )}

          {/* Step 0: Business Name */}
          {step === 0 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-[#202124]">What's your business called?</h2>
                <p className="text-[#5F6368] mt-2">This will be your workspace name in Avenize.</p>
              </div>
              <input
                type="text"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="Your Company Ltd"
                className="w-full px-5 py-4 rounded-lg border-2 border-[#E4E8EF] text-lg text-[#202124] placeholder-[#9AA0A6] focus:border-[#155BB4] focus:outline-none focus:ring-2 focus:ring-[#155BB4]/20 transition-all bg-white"
                autoFocus
              />
            </div>
          )}

          {/* Step 1: Full Name + Position */}
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-[#202124]">And your name?</h2>
                <p className="text-[#5F6368] mt-2">How should we address you?</p>
              </div>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Chinedu Okonkwo"
                className="w-full px-5 py-4 rounded-lg border-2 border-[#E4E8EF] text-lg text-[#202124] placeholder-[#9AA0A6] focus:border-[#155BB4] focus:outline-none focus:ring-2 focus:ring-[#155BB4]/20 transition-all bg-white"
                autoFocus
              />
              <div>
                <label className="block text-sm font-medium text-[#5F6368] mb-1.5">
                  Your role or position
                </label>
                <input
                  type="text"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  placeholder="e.g. Founder & CEO, Operations Director"
                  className="w-full px-5 py-4 rounded-lg border-2 border-[#E4E8EF] text-base text-[#202124] placeholder-[#9AA0A6] focus:border-[#155BB4] focus:outline-none focus:ring-2 focus:ring-[#155BB4]/20 transition-all bg-white"
                />
                <p className="text-xs text-[#5F6368] mt-1.5">Optional — helps your team know who you are.</p>
              </div>
            </div>
          )}

          {/* Step 2: Theme Color Picker */}
          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-[#202124]">Choose your theme</h2>
                <p className="text-[#5F6368] mt-2">Pick a background color for your workspace.</p>
              </div>
              <div className="grid grid-cols-3 gap-4">
                {BRAND_COLORS.map((color) => (
                  <button
                    key={color.id}
                    onClick={() => setSelectedColor(color)}
                    className={`relative p-4 rounded-xl border-2 transition-all hover:scale-105 ${
                      selectedColor?.id === color.id
                        ? 'shadow-lg ring-2 ring-[#155BB4] ring-offset-2'
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
                    <span className="block text-sm font-semibold text-center text-[#202124]">
                      {color.name}
                    </span>
                    
                    {/* Selected Checkmark */}
                    {selectedColor?.id === color.id && (
                      <div className="absolute -top-2 -right-2 w-6 h-6 bg-[#155BB4] rounded-full flex items-center justify-center shadow-md">
                        <Check size={14} className="text-white" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
              <div className="bg-[#155BB4]/8 border border-[var(--av-primary)]/30 rounded-lg px-4 py-3">
                <p className="text-xs text-[#155BB4] text-center">
                  Text color auto-adjusts for optimal readability
                </p>
              </div>
            </div>
          )}

          {/* Step 3: Industry */}
          {step === 3 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-[#202124]">What industry are you in?</h2>
                <p className="text-[#5F6368] mt-2">This helps us customize Avenize for you.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {INDUSTRIES.map((ind) => (
                  <button
                    key={ind.id}
                    onClick={() => setIndustry(ind.id)}
                    className={`p-4 rounded-xl border-2 text-left transition-all ${
                      industry === ind.id
                        ? 'border-[var(--av-primary, var(--av-primary))] bg-[var(--av-primary, var(--av-primary))]/5'
                        : 'border-[#E4E8EF] hover:border-[#155BB4]/40'
                    }`}
                  >
                    <span className="text-2xl mb-2 block">{ind.emoji}</span>
                    <span className="text-sm font-medium">{ind.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 4: Tool selection — curate the workspace */}
          {step === 4 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-[#202124]">What will you use most?</h2>
                <p className="text-[#5F6368] mt-2">
                  Pick the tools you want front and center. You can change these anytime in Settings.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 max-h-[320px] overflow-y-auto pr-1">
                {SELECTABLE_TOOLS.map((tool) => {
                  const on = selectedTools.includes(tool.key)
                  return (
                    <button
                      key={tool.key}
                      type="button"
                      onClick={() =>
                        setSelectedToolsState((prev) =>
                          on ? prev.filter((t) => t !== tool.key) : [...prev, tool.key],
                        )
                      }
                      className={`p-3 rounded-xl border-2 text-left transition-all flex items-start gap-2 ${
                        on
                          ? 'border-[#155BB4] bg-[#155BB4]/8'
                          : 'border-[#E4E8EF] hover:border-[#155BB4]/40'
                      }`}
                    >
                      <span
                        className={`mt-0.5 w-5 h-5 rounded flex items-center justify-center flex-shrink-0 ${
                          on ? 'bg-[#155BB4] text-white' : 'bg-[#E4E8EF] text-transparent'
                        }`}
                      >
                        <Check size={14} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-[#202124]">{tool.label}</span>
                        <span className="block text-xs text-[#9AA0A6] leading-snug mt-0.5">{tool.description}</span>
                      </span>
                    </button>
                  )
                })}
              </div>
              <p className="text-xs text-[#9AA0A6]">
                {selectedTools.length === 0
                  ? "No tools selected — we'll show everything you're authorized for."
                  : `${selectedTools.length} selected. Other tools stay available but out of your way.`}
              </p>
            </div>
          )}

          {/* Step 5: Ready */}
          {step === 5 && (
            <div className="text-center space-y-6">
              <div className="w-20 h-20 rounded-full bg-[#E8F5EE] flex items-center justify-center mx-auto">
                <Check size={40} className="text-[#157342]" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-[#202124]">You're all set!</h2>
                <p className="text-[#5F6368] mt-2">
                  {businessName} is ready. Let's build something great.
                </p>
              </div>
              <div className="bg-white rounded-xl p-4 text-left">
                <p className="text-sm font-medium text-[#202124] mb-2">What you get with Avenize:</p>
                <ul className="space-y-2 text-sm text-[#202124]">
                  <li className="flex items-center gap-2">
                    <Check size={16} className="text-[#157342]" />
                    Job & project tracking
                  </li>
                  <li className="flex items-center gap-2">
                    <Check size={16} className="text-[#157342]" />
                    Inventory management
                  </li>
                  <li className="flex items-center gap-2">
                    <Check size={16} className="text-[#157342]" />
                    Invoicing & payments
                  </li>
                  <li className="flex items-center gap-2">
                    <Check size={16} className="text-[#157342]" />
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
                className="px-6 py-3 rounded-lg border-2 border-[#E4E8EF] font-medium text-[#202124] hover:bg-white transition-colors bg-white"
              >
                Back
              </button>
            )}
            <button
              onClick={handleNext}
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-[#155BB4] text-white py-3 font-semibold disabled:opacity-50 hover:bg-[#1247A0] transition-colors shadow-sm hover:shadow-md"
            >
              {loading ? (
                <Loader2 size={20} className="animate-spin" />
              ) : step === 5 ? (
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

import { useState, useEffect, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import PasswordStrength from '../components/PasswordStrength'
import { Check, Sparkles, Users, Zap, Shield, Brain, MessageSquare, Network } from 'lucide-react'
import { useLocale } from '../lib/LocaleContext'
import { captureAttribution } from '../lib/attribution'
import { useAuth } from '../lib/AuthContext'
import { createBusinessAndOwner } from '../lib/onboarding'
import { checkAuthRateLimit, recordAuthFailure, resetAuthRateLimit, rateLimitMessage } from '../lib/authSecurity'

const FEATURES = [
  { icon: Brain, textKey: 'signupFeatureBrain', text: 'One system — CRM, finance, HR, projects, all connected' },
  { icon: MessageSquare, textKey: 'signupFeatureSimple', text: 'Simple like WhatsApp — your team sees only what they need' },
  { icon: Network, textKey: 'signupFeatureOrg', text: 'Your organization defines itself — we adapt to your structure' },
  { icon: Shield, textKey: 'signupFeatureSecurity', text: 'Explainable permissions and audited actions' },
]

export default function Signup() {
  const navigate = useNavigate()
  const { session, membership, refreshStaff } = useAuth()
  // B14 attribution: last-chance capture of discovery provenance before signup.
  useEffect(() => { captureAttribution() }, [])
  const { translations } = useLocale()
  const tr = (key: string, fallback: string) => (translations as unknown as Record<string, string>)?.[key] || fallback
  const [step, setStep] = useState<'form' | 'success'>('form')
  const [businessName, setBusinessName] = useState('')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [industry, setIndustry] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // An already-authenticated visitor never sees the signup form: members go to
  // the app, authenticated non-members resume onboarding. Gated on the idle
  // form state so this never fires mid-submission or over an error, and so the
  // post-signup session (created by signUp below) doesn't interrupt the
  // business-creation flow.
  useEffect(() => {
    if (loading || step !== 'form' || error) return
    if (!session) return
    if (membership === 'member' || membership === 'deactivated') {
      navigate('/app', { replace: true })
    } else if (membership === 'onboarding_required') {
      navigate('/onboarding', { replace: true })
    }
    // 'loading'/'anonymous'/'error': stay on the form.
  }, [membership, session, loading, step, error, navigate])

  const validatePassword = () => {
    if (password.length < 8) {
      setPasswordError('Password must be at least 8 characters')
      return false
    }
    if (password !== confirmPassword) {
      setPasswordError('Passwords do not match')
      return false
    }
    setPasswordError(null)
    return true
  }

  const handleOAuthSignIn = async (provider: 'google' | 'github') => {
    setError(null)
    
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        scopes: provider === 'github' ? 'read:user user:email' : undefined,
      },
    })
    
    if (error) {
      setError(error.message)
    }
    // If successful, browser redirects to provider, then back to /auth/callback
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    
    if (!validatePassword()) return
    
    setLoading(true)
    setError(null)

    // Pre-auth rate limit: throttle signup abuse before hitting Supabase Auth.
    // Read-only check (never counts this attempt); fails open if undeployed.
    const identifier = email.toLowerCase()
    const limits = { maxAttempts: 5, windowSeconds: 3600, lockoutSeconds: 3600 }
    const verdict = await checkAuthRateLimit(identifier, 'signup', limits)
    if (!verdict.allowed) {
      setError(rateLimitMessage(verdict, 'signup'))
      setLoading(false)
      return
    }

    // Step 1: Create auth account
    const { data: authData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { 
          full_name: fullName,
          business_name: businessName,
          industry 
        },
        emailRedirectTo: `${window.location.origin}/auth/callback`
      },
    })

    if (signUpError) {
      // A failed signup counts against the limiter; a success clears it.
      const after = await recordAuthFailure(identifier, 'signup', limits)
      setError(after.allowed ? signUpError.message : rateLimitMessage(after, 'signup'))
      setLoading(false)
      return
    }

    // If email confirmation is required, show success and store data for callback
    if (!authData.session) {
      // Store signup data in localStorage for the callback to use
      localStorage.setItem('avenize_pending_business', JSON.stringify({
        businessName,
        industry,
        fullName,
        email
      }))
      setStep('success')
      setLoading(false)
      return
    }

    // If we have a session (email confirmation disabled), create business immediately
    void resetAuthRateLimit(identifier, 'signup')
    await createBusiness()
  }

  const createBusiness = async () => {
    // Step 2: Create business and owner (SECURITY DEFINER function, canonical
    // contract owned by src/lib/onboarding.ts).
    const result = await createBusinessAndOwner({
      businessName,
      industry: industry || null,
      staffName: fullName,
    })

    if (!result.ok) {
      if (result.reason === 'already_member') {
        // Recoverable: the account already has a business — refresh the
        // authoritative membership and enter the app.
        await refreshStaff()
        navigate('/app', { replace: true })
        return
      }
      setError(
        result.reason === 'unavailable'
          ? 'The business creation service is not yet configured on this deployment. Please contact support.'
          : result.message || 'Failed to create business. Please contact support.',
      )
      setLoading(false)
      return
    }

    // Clear stored data
    localStorage.removeItem('avenize_pending_business')

    // Wait for AuthContext to confirm the new membership, then enter the app.
    // This replaces a hard navigation: RequireAuth would otherwise see a stale
    // membership and bounce the brand-new user back to onboarding.
    const resolved = await refreshStaff()
    if (resolved?.business_id) {
      navigate('/app', { replace: true })
      return
    }
    // The business exists but the membership read hasn't caught up — send the
    // user to /app anyway; RequireAuth shows its own resolver while it settles.
    navigate('/app', { replace: true })
  }

  const handleResendEmail = async () => {
    try {
      await supabase.auth.resend({
        type: 'signup',
        email,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` }
      })
      setError(null)
    } catch (err) {
      setError('Failed to resend email')
    }
  }

  if (step === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 px-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl shadow-blue-900/5 p-8 text-center space-y-6">
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-full bg-[var(--av-success-soft)] flex items-center justify-center">
              <Check className="w-8 h-8 text-[var(--av-success)]" />
            </div>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-black">{tr('checkEmail', 'Check your email')}</h2>
            <p className="text-sm text-black mt-2">{tr('confirmationSent', 'We sent a confirmation link to')}</p>
            <p className="font-semibold text-[var(--av-primary)] mt-1">{email}</p>
          </div>

          <div className="bg-gradient-to-br from-blue-50 to-[var(--av-primary)]/5 rounded-xl p-5 text-left space-y-3">
            <p className="text-sm font-medium text-black">{tr('nextSteps', 'Next steps:')}</p>
            <ol className="text-sm text-black space-y-2">
              {[
                tr('stepClickLink', 'Click the confirmation link in your email'),
                tr('stepBusinessSetup', `Your business "${businessName}" will be set up`),
                tr('stepStartUsing', 'Start using Avenize with your team')
              ].map((stepText, i) => (
                <li key={i} className="flex items-center gap-3">
                  <span className="w-5 h-5 rounded-full bg-[var(--av-primary)] text-white text-xs flex items-center justify-center flex-shrink-0">{i + 1}</span>
                  {stepText}
                </li>
              ))}
            </ol>
          </div>

          <div className="space-y-2">
            <p className="text-xs text-black">{tr('noEmail', 'Didn\'t receive the email? Check your spam folder.')}</p>
            <button 
              onClick={handleResendEmail}
              className="text-sm text-[var(--av-primary)] hover:underline font-medium"
            >
              {tr('resendEmail', 'Resend confirmation email')}
            </button>
          </div>

          <Link 
            to="/login" 
            className="text-sm text-black hover:text-black font-medium flex items-center justify-center gap-1 pt-4 border-t border-white"
          >
            ← {tr('backToSignin', 'Back to sign in')}
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex">
      {/* Left Panel - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-blue-600 via-[var(--av-primary)] to-[var(--av-accent)] p-12 flex-col justify-between relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-white rounded-full -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-white rounded-full translate-y-1/2 -translate-x-1/2" />
        
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
              <span className="text-white font-bold text-2xl">A</span>
            </div>
            <span className="text-2xl font-bold text-white">Avenize</span>
          </div>
        </div>

        <div className="relative z-10 space-y-8">
          <div className="space-y-4">
            <h1 className="text-4xl font-bold text-white leading-tight">
              {tr('signupHeadline', 'More capable than an ERP. Easier than WhatsApp.')}
            </h1>
            <p className="text-xl text-white/80">
              {tr('signupSubheadline', 'Your business runs as one connected system. Your people see only what they need to act on.')}
            </p>
          </div>

          <div className="space-y-4">
            {FEATURES.map((feature, i) => (
              <div key={i} className="flex items-center gap-4 text-white/90">
                <div className="w-10 h-10 rounded-lg bg-white backdrop-blur flex items-center justify-center flex-shrink-0">
                  <feature.icon size={20} />
                </div>
                <span className="text-lg">{tr(feature.textKey, feature.text)}</span>
              </div>
            ))}
          </div>

          <div className="pt-8 border-t border-white/10">
            <p className="text-white/60 text-sm mb-3">{tr('signupTrustedBy', 'Trusted by 2,500+ Nigerian businesses')}</p>
            <div className="flex -space-x-3">
              {['bg-blue-400', 'bg-green-400', 'bg-yellow-400', 'bg-pink-400', 'bg-purple-400'].map((color, i) => (
                <div key={i} className={`w-10 h-10 rounded-full ${color} border-2 border-white/20`} />
              ))}
              <div className="w-10 h-10 rounded-full bg-white/20 border-2 border-white/20 flex items-center justify-center">
                <span className="text-white text-xs font-medium">+2k</span>
              </div>
            </div>
          </div>
        </div>

        <div className="relative z-10 text-white/80 text-sm">
          © 2026 Avenize. {tr('builtForNigeria', 'Built for Nigerian businesses.')}
        </div>
      </div>

      {/* Right Panel - Form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-white/50">
        <div className="w-full max-w-md space-y-8">
          <div className="lg:hidden text-center">
            <div className="inline-flex items-center gap-2 mb-4">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-[var(--av-accent)] flex items-center justify-center">
                <span className="text-white font-bold text-xl">A</span>
              </div>
              <span className="text-xl font-bold text-black">Avenize</span>
            </div>
          </div>

          <div className="text-center lg:text-left">
            <h2 className="text-2xl font-bold text-black">{tr('signupFormTitle', 'Set up your business')}</h2>
            <p className="text-black mt-1">{tr('signupFormSubtitle', 'Create your workspace and invite your team')}</p>
          </div>

          <div className="space-y-3">
            <button
              onClick={() => handleOAuthSignIn('google')}
              className="w-full flex items-center justify-center gap-3 rounded-xl bg-white py-3 px-4 text-sm font-medium text-black hover:bg-black/5 transition shadow-sm"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="var(--av-primary, var(--av-primary))" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="var(--av-success)" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="var(--av-warning)" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="var(--av-danger)" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              {tr('continueGoogle', 'Continue with Google')}
            </button>

            <button
              onClick={() => handleOAuthSignIn('github')}
              className="w-full flex items-center justify-center gap-3 rounded-xl bg-white py-3 px-4 text-sm font-medium text-black hover:bg-black/5 transition shadow-sm"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
              {tr('continueGithub', 'Continue with GitHub')}
            </button>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[var(--av-border)]" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-white px-4 text-sm text-black">{tr('or', 'or')}</span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="bg-[var(--av-danger-soft)] border border-[var(--av-danger)]/30 text-[var(--av-danger)] rounded-xl px-4 py-3 text-sm">
                {error}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-black mb-1.5">
                  {tr('businessName', 'Business Name')} <span className="text-[var(--av-danger)]">*</span>
                </label>
                <input
                  required
                  placeholder={tr('businessNamePlaceholder', 'Acme Nigeria Ltd')}
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  className="w-full rounded-xl border border-[var(--av-border)] px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--av-primary)]/20 focus:border-[var(--av-primary)] transition"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-black mb-1.5">
                  {tr('industry', 'Industry')} <span className="text-black font-normal">({tr('optional', 'optional')})</span>
                </label>
                <select
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  className="w-full rounded-xl border border-[var(--av-border)] px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--av-primary)]/20 focus:border-[var(--av-primary)] transition bg-white"
                >
                  <option value="">{tr('selectIndustry', 'Select an industry')}</option>
                  <option value="construction">{tr('industryConstruction', 'Construction')}</option>
                  <option value="real_estate">{tr('industryRealEstate', 'Real Estate')}</option>
                  <option value="manufacturing">{tr('industryManufacturing', 'Manufacturing')}</option>
                  <option value="retail">{tr('industryRetail', 'Retail')}</option>
                  <option value="services">{tr('industryServices', 'Professional Services')}</option>
                  <option value="other">{tr('other', 'Other')}</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-black mb-1.5">
                  {tr('fullName', 'Full Name')} <span className="text-[var(--av-danger)]">*</span>
                </label>
                <input
                  id="full_name"
                  name="full_name"
                  autoComplete="name"
                  required
                  placeholder={tr('fullNamePlaceholder', 'Chinedu Okonkwo')}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full rounded-xl border border-[var(--av-border)] px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--av-primary)]/20 focus:border-[var(--av-primary)] transition"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-black mb-1.5">
                  {tr('workEmail', 'Work Email')} <span className="text-[var(--av-danger)]">*</span>
                </label>
                <input
                  type="email"
                  required
                  placeholder={tr('emailPlaceholder', 'you@company.com')}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl border border-[var(--av-border)] px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--av-primary)]/20 focus:border-[var(--av-primary)] transition"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-black mb-1.5">
                  {tr('password', 'Password')} <span className="text-[var(--av-danger)]">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={8}
                    placeholder={tr('passwordPlaceholder', 'Min. 8 characters')}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value)
                      if (confirmPassword) validatePassword()
                    }}
                    className="w-full rounded-xl border border-[var(--av-border)] px-4 py-3 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--av-primary)]/20 focus:border-[var(--av-primary)] transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-black hover:text-black"
                  >
                    {showPassword ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                    )}
                  </button>
                </div>
                <div className="mt-2">
                  <PasswordStrength password={password} />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-black mb-1.5">
                  Confirm Password <span className="text-[var(--av-danger)]">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    placeholder="Re-enter your password"
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value)
                      if (password) validatePassword()
                    }}
                    className={`w-full rounded-xl border ${passwordError ? 'border-[var(--av-danger)] bg-[var(--av-danger-soft)]' : 'border-[var(--av-border)]'} px-4 py-3 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--av-primary)]/20 focus:border-[var(--av-primary)] transition`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-black hover:text-black"
                  >
                    {showConfirmPassword ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                    )}
                  </button>
                </div>
                {passwordError && (
                  <p className="text-xs text-[var(--av-danger)] mt-1.5">{passwordError}</p>
                )}
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !businessName || !fullName || !email || !password || !confirmPassword}
              className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-[var(--av-primary)] text-white py-3.5 text-sm font-semibold hover:from-blue-700 hover:to-[var(--av-primary-hover)] transition disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-600/20"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Setting up...
                </span>
              ) : 'Create Business'}
            </button>

            <p className="text-xs text-center text-black">
              By signing up, you agree to our{' '}
              <a href="/terms" className="text-[var(--av-primary)] hover:underline">Terms</a>
              {' '}and{' '}
              <a href="/privacy" className="text-[var(--av-primary)] hover:underline">Privacy Policy</a>
            </p>
          </form>

          <div className="text-center pt-4 border-t border-white">
            <p className="text-sm text-black">
              Already have an account?{' '}
              <Link to="/login" className="text-[var(--av-primary)] font-medium hover:underline">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

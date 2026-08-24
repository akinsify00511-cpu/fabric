import { useState, useEffect, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import PasswordStrength from '../components/PasswordStrength'
import { Check, Brain, MessageSquare, Shield, Network } from 'lucide-react'
import { useLocale } from '../lib/LocaleContext'
import { captureAttribution } from '../lib/attribution'
import { trackPageView } from '../lib/metaPixel'
import { useAuth } from '../lib/AuthContext'
import { createBusinessAndOwner } from '../lib/onboarding'
import { checkAuthRateLimit, recordAuthFailure, resetAuthRateLimit, rateLimitMessage } from '../lib/authSecurity'

const FEATURES = [
  { icon: Brain, textKey: 'signupFeatureBrain', text: 'One system — CRM, finance, HR, projects, all connected' },
  { icon: MessageSquare, textKey: 'signupFeatureSimple', text: 'Simple by design — your team sees only what they need to act on' },
  { icon: Network, textKey: 'signupFeatureOrg', text: 'Your organization defines itself — we adapt to your structure' },
  { icon: Shield, textKey: 'signupFeatureSecurity', text: 'Explainable permissions and audited actions' },
]

export default function Signup() {
  const navigate = useNavigate()
  const { session, membership, refreshStaff } = useAuth()
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
  const [confirmTouched, setConfirmTouched] = useState(false)
  const [industry, setIndustry] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => { captureAttribution(); trackPageView() }, [])

  useEffect(() => {
    if (loading || step !== 'form' || error || !session) return
    if (membership === 'member' || membership === 'deactivated') {
      navigate('/app', { replace: true })
    } else if (membership === 'onboarding_required') {
      navigate('/onboarding', { replace: true })
    }
  }, [membership, session, loading, step, error, navigate])

  // Validation always compares the values passed to it, rather than reading
  // React state immediately after setState. This prevents the stale-state bug
  // that could leave "Passwords do not match" visible after the values matched.
  const validatePassword = (candidatePassword = password, candidateConfirm = confirmPassword) => {
    if (candidatePassword.length < 8) {
      setPasswordError('Password must be at least 8 characters')
      return false
    }
    if (candidatePassword !== candidateConfirm) {
      setPasswordError('Passwords do not match')
      return false
    }
    setPasswordError(null)
    return true
  }

  const passwordsMatch = confirmTouched && password.length >= 8 && confirmPassword.length > 0 && password === confirmPassword && !passwordError

  const handleOAuthSignIn = async (provider: 'google' | 'github') => {
    setError(null)
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        scopes: provider === 'github' ? 'read:user user:email' : undefined,
      },
    })
    if (oauthError) setError(oauthError.message)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setConfirmTouched(true)
    if (!validatePassword()) return

    setLoading(true)
    setError(null)
    const identifier = email.trim().toLowerCase()
    const limits = { maxAttempts: 5, windowSeconds: 3600, lockoutSeconds: 3600 }
    const verdict = await checkAuthRateLimit(identifier, 'signup', limits)
    if (!verdict.allowed) {
      setError(rateLimitMessage(verdict, 'signup'))
      setLoading(false)
      return
    }

    const { data: authData, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { full_name: fullName, business_name: businessName, industry },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (signUpError) {
      const after = await recordAuthFailure(identifier, 'signup', limits)
      const message = signUpError.message || ''
      const existingAccount = /already registered|already exists|user already|email.*registered/i.test(message)
      setError(existingAccount
        ? 'An account already exists with this email. Please sign in instead.'
        : after.allowed ? message : rateLimitMessage(after, 'signup'))
      setLoading(false)
      return
    }

    if (!authData.session) {
      localStorage.setItem('avenize_pending_business', JSON.stringify({ businessName, industry, fullName, email: email.trim() }))
      setStep('success')
      setLoading(false)
      return
    }

    void resetAuthRateLimit(identifier, 'signup')
    await createBusiness()
  }

  const createBusiness = async () => {
    const result = await createBusinessAndOwner({
      businessName,
      industry: industry || null,
      staffName: fullName,
    })

    if (!result.ok) {
      if (result.reason === 'already_member') {
        await refreshStaff()
        navigate('/app', { replace: true })
        return
      }
      setError(result.reason === 'unavailable'
        ? 'The business creation service is not yet configured on this deployment. Please contact support.'
        : result.message || 'Failed to create business. Please contact support.')
      setLoading(false)
      return
    }

    localStorage.removeItem('avenize_pending_business')
    const resolved = await refreshStaff()
    if (resolved?.business_id) {
      navigate('/app', { replace: true })
      return
    }
    navigate('/app', { replace: true })
  }

  const handleResendEmail = async () => {
    try {
      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email: email.trim(),
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      })
      if (resendError) throw resendError
      setError(null)
    } catch {
      setError('Failed to resend email')
    }
  }

  if (step === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 px-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl shadow-blue-900/5 p-8 text-center space-y-6">
          <div className="flex justify-center"><div className="w-16 h-16 rounded-full bg-[var(--av-success-soft)] flex items-center justify-center"><Check className="w-8 h-8 text-[var(--av-success)]" /></div></div>
          <div>
            <h2 className="text-2xl font-bold text-black">{tr('checkEmail', 'Check your email')}</h2>
            <p className="text-sm text-black mt-2">{tr('confirmationSent', 'We sent a confirmation link to')}</p>
            <p className="font-semibold text-[var(--av-primary)] mt-1">{email}</p>
          </div>
          <div className="bg-gradient-to-br from-blue-50 to-[var(--av-primary)]/5 rounded-xl p-5 text-left space-y-3">
            <p className="text-sm font-medium text-black">{tr('nextSteps', 'Next steps:')}</p>
            <ol className="text-sm text-black space-y-2">
              {[tr('stepClickLink', 'Click the confirmation link in your email'), tr('stepBusinessSetup', `Your business "${businessName}" will be set up`), tr('stepStartUsing', 'Start using Avenize with your team')].map((stepText, i) => (
                <li key={i} className="flex items-center gap-3"><span className="w-5 h-5 rounded-full bg-[var(--av-primary)] text-white text-xs flex items-center justify-center flex-shrink-0">{i + 1}</span>{stepText}</li>
              ))}
            </ol>
          </div>
          <div className="space-y-2">
            <p className="text-xs text-black">{tr('noEmail', "Didn't receive the email? Check your spam folder.")}</p>
            <button onClick={handleResendEmail} className="text-sm text-[var(--av-primary)] hover:underline font-medium">{tr('resendEmail', 'Resend confirmation email')}</button>
          </div>
          <Link to="/login" className="text-sm text-black font-medium flex items-center justify-center gap-1 pt-4 border-t border-white">← {tr('backToSignin', 'Back to sign in')}</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-blue-600 via-[var(--av-primary)] to-[var(--av-accent)] p-12 flex-col justify-between relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-white rounded-full -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-white rounded-full translate-y-1/2 -translate-x-1/2" />
        <div className="relative z-10 flex items-center gap-3"><div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center"><span className="text-white font-bold text-2xl">A</span></div><span className="text-2xl font-bold text-white">Avenize</span></div>
        <div className="relative z-10 space-y-8">
          <div className="space-y-4"><h1 className="text-4xl font-bold text-white leading-tight">{tr('signupHeadline', 'More capable than an ERP. Capture, convert and fulfil demand in one system.')}</h1><p className="text-xl text-white/80">{tr('signupSubheadline', 'Your business runs as one connected system. Your people see only what they need to act on.')}</p></div>
          <div className="space-y-4">{FEATURES.map((feature, i) => (<div key={i} className="flex items-center gap-4 text-white/90"><div className="w-10 h-10 rounded-lg bg-white backdrop-blur flex items-center justify-center flex-shrink-0"><feature.icon size={20} /></div><span className="text-lg">{tr(feature.textKey, feature.text)}</span></div>))}</div>
          <div className="pt-8 border-t border-white/10"><p className="text-white/60 text-sm mb-3">{tr('signupTrustedBy', 'Trusted by 2,500+ Nigerian businesses')}</p><div className="flex -space-x-3">{['bg-blue-400', 'bg-green-400', 'bg-yellow-400', 'bg-pink-400', 'bg-purple-400'].map((color, i) => <div key={i} className={`w-10 h-10 rounded-full ${color} border-2 border-white/20`} />)}<div className="w-10 h-10 rounded-full bg-white/20 border-2 border-white/20 flex items-center justify-center"><span className="text-white text-xs font-medium">+2k</span></div></div></div>
        </div>
        <div className="relative z-10 text-white/80 text-sm">© 2026 Avenize. {tr('builtForNigeria', 'Built for Nigerian businesses.')}</div>
      </div>

      <div className="flex-1 flex items-center justify-center p-8 bg-white/50">
        <div className="w-full max-w-md space-y-8">
          <div className="lg:hidden text-center"><div className="inline-flex items-center gap-2 mb-4"><div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-[var(--av-accent)] flex items-center justify-center"><span className="text-white font-bold text-xl">A</span></div><span className="text-xl font-bold text-black">Avenize</span></div></div>
          <div className="text-center lg:text-left"><h2 className="text-2xl font-bold text-black">{tr('signupFormTitle', 'Set up your business')}</h2><p className="text-black mt-1">{tr('signupFormSubtitle', 'Create your workspace and invite your team')}</p></div>
          <div className="space-y-3">
            <button onClick={() => handleOAuthSignIn('google')} className="w-full flex items-center justify-center gap-3 rounded-xl bg-white py-3 px-4 text-sm font-medium text-black hover:bg-black/5 transition shadow-sm">Continue with Google</button>
            <button onClick={() => handleOAuthSignIn('github')} className="w-full flex items-center justify-center gap-3 rounded-xl bg-white py-3 px-4 text-sm font-medium text-black hover:bg-black/5 transition shadow-sm">Continue with GitHub</button>
          </div>
          <div className="relative"><div className="absolute inset-0 flex items-center"><div className="w-full border-t border-[var(--av-border)]" /></div><div className="relative flex justify-center"><span className="bg-white px-4 text-sm text-black">{tr('or', 'or')}</span></div></div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && <div className="bg-[var(--av-danger-soft)] border border-[var(--av-danger)]/30 text-[var(--av-danger)] rounded-xl px-4 py-3 text-sm">{error}{/already registered|already exists|user already|email.*registered/i.test(error) && <> <Link to="/login" className="font-semibold underline">Sign in</Link></>}</div>}
            <div className="space-y-4">
              <div><label className="block text-sm font-medium text-black mb-1.5">{tr('businessName', 'Business Name')} <span className="text-[var(--av-danger)]">*</span></label><input required placeholder={tr('businessNamePlaceholder', 'Acme Nigeria Ltd')} value={businessName} onChange={e => setBusinessName(e.target.value)} className="w-full rounded-xl border border-[var(--av-border)] px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--av-primary)]/20 focus:border-[var(--av-primary)] transition" /></div>
              <div><label className="block text-sm font-medium text-black mb-1.5">{tr('industry', 'Industry')} <span className="text-black font-normal">({tr('optional', 'optional')})</span></label><select value={industry} onChange={e => setIndustry(e.target.value)} className="w-full rounded-xl border border-[var(--av-border)] px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--av-primary)]/20 focus:border-[var(--av-primary)] transition bg-white"><option value="">{tr('selectIndustry', 'Select an industry')}</option><option value="construction">{tr('industryConstruction', 'Construction')}</option><option value="real_estate">{tr('industryRealEstate', 'Real Estate')}</option><option value="manufacturing">{tr('industryManufacturing', 'Manufacturing')}</option><option value="retail">{tr('industryRetail', 'Retail')}</option><option value="services">{tr('industryServices', 'Professional Services')}</option><option value="other">{tr('other', 'Other')}</option></select></div>
              <div><label className="block text-sm font-medium text-black mb-1.5">{tr('fullName', 'Full Name')} <span className="text-[var(--av-danger)]">*</span></label><input id="full_name" name="full_name" autoComplete="name" required placeholder={tr('fullNamePlaceholder', 'Chinedu Okonkwo')} value={fullName} onChange={e => setFullName(e.target.value)} className="w-full rounded-xl border border-[var(--av-border)] px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--av-primary)]/20 focus:border-[var(--av-primary)] transition" /></div>
              <div><label className="block text-sm font-medium text-black mb-1.5">{tr('workEmail', 'Work Email')} <span className="text-[var(--av-danger)]">*</span></label><input type="email" autoComplete="email" required placeholder={tr('emailPlaceholder', 'you@company.com')} value={email} onChange={e => setEmail(e.target.value)} className="w-full rounded-xl border border-[var(--av-border)] px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--av-primary)]/20 focus:border-[var(--av-primary)] transition" /></div>
              <div>
                <label className="block text-sm font-medium text-black mb-1.5">{tr('password', 'Password')} <span className="text-[var(--av-danger)]">*</span></label>
                <div className="relative"><input type={showPassword ? 'text' : 'password'} required minLength={8} autoComplete="new-password" placeholder={tr('passwordPlaceholder', 'Min. 8 characters')} value={password} onChange={e => { const next = e.target.value; setPassword(next); if (confirmTouched) validatePassword(next, confirmPassword) }} className="w-full rounded-xl border border-[var(--av-border)] px-4 py-3 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--av-primary)]/20 focus:border-[var(--av-primary)] transition" /><button type="button" onClick={() => setShowPassword(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-black" aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? '◉' : '◌'}</button></div>
                <div className="mt-2"><PasswordStrength password={password} /></div>
              </div>
              <div>
                <label className="block text-sm font-medium text-black mb-1.5">Confirm Password <span className="text-[var(--av-danger)]">*</span></label>
                <div className="relative"><input type={showConfirmPassword ? 'text' : 'password'} required autoComplete="new-password" placeholder="Re-enter your password" value={confirmPassword} onBlur={() => { setConfirmTouched(true); validatePassword(password, confirmPassword) }} onChange={e => { const next = e.target.value; setConfirmPassword(next); setConfirmTouched(true); validatePassword(password, next) }} className={`w-full rounded-xl border ${passwordError ? 'border-[var(--av-danger)] bg-[var(--av-danger-soft)]' : passwordsMatch ? 'border-[var(--av-success)]' : 'border-[var(--av-border)]'} px-4 py-3 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--av-primary)]/20 focus:border-[var(--av-primary)] transition`} /><button type="button" onClick={() => setShowConfirmPassword(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-black" aria-label={showConfirmPassword ? 'Hide confirmation password' : 'Show confirmation password'}>{showConfirmPassword ? '◉' : '◌'}</button></div>
                {passwordError ? <p className="text-xs text-[var(--av-danger)] mt-1.5">{passwordError}</p> : passwordsMatch ? <p className="text-xs text-[var(--av-success)] mt-1.5">✓ Passwords match</p> : null}
              </div>
            </div>

            <button type="submit" disabled={loading || !businessName || !fullName || !email || !password || !confirmPassword} className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-[var(--av-primary)] text-white py-3.5 text-sm font-semibold hover:from-blue-700 hover:to-[var(--av-primary-hover)] transition disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-600/20">{loading ? <span className="flex items-center justify-center gap-2"><svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Setting up...</span> : 'Create Business'}</button>
            <p className="text-xs text-center text-black">By signing up, you agree to our <a href="/terms" className="text-[var(--av-primary)] hover:underline">Terms</a> and <a href="/privacy" className="text-[var(--av-primary)] hover:underline">Privacy Policy</a></p>
          </form>
          <div className="text-center pt-4 border-t border-white"><p className="text-sm text-black">Already have an account? <Link to="/login" className="text-[var(--av-primary)] font-medium hover:underline">Sign in</Link></p></div>
        </div>
      </div>
    </div>
  )
}

import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Signup() {
  const navigate = useNavigate()
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
      setError(signUpError.message)
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
    await createBusiness()
  }

  const createBusiness = async () => {
    // Step 2: Create business and owner (SECURITY DEFINER function)
    const { data: bizData, error: rpcError } = await supabase.rpc('create_business_and_owner', {
      p_business_name: businessName,
      p_industry: industry || null,
      p_staff_name: fullName,
    })

    if (rpcError) {
      console.error('Business creation error:', rpcError)
      setError('Failed to create business. Please contact support.')
      setLoading(false)
      return
    }

    // Clear stored data
    localStorage.removeItem('avenize_pending_business')
    
    // Success - redirect to dashboard
    navigate('/app')
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
      <div className="min-h-screen flex items-center justify-center bg-[var(--avenize-offwhite)] px-4">
        <div className="w-full max-w-md bg-white rounded-2xl border border-black/[0.06] p-8 text-center space-y-6">
          {/* Success Icon */}
          <div className="flex justify-center">
            <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center">
              <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-[var(--avenize-black)]">Check your email</h2>
            <p className="text-sm text-black/60 mt-2">
              We sent a confirmation link to
            </p>
            <p className="font-semibold text-[var(--avenize-primary)] mt-1">{email}</p>
          </div>

          {/* Instructions */}
          <div className="bg-gradient-to-br from-[var(--avenize-primary)]/5 to-[var(--avenize-accent)]/5 rounded-2xl p-5 text-left space-y-3">
            <p className="text-sm text-black/70">
              <strong>Next steps:</strong>
            </p>
            <ol className="text-sm text-black/60 space-y-2">
              <li className="flex gap-2">
                <span className="w-5 h-5 rounded-full bg-[var(--avenize-primary)] text-white text-xs flex items-center justify-center flex-shrink-0">1</span>
                Click the confirmation link in your email
              </li>
              <li className="flex gap-2">
                <span className="w-5 h-5 rounded-full bg-[var(--avenize-primary)] text-white text-xs flex items-center justify-center flex-shrink-0">2</span>
                Your business "{businessName}" will be set up automatically
              </li>
              <li className="flex gap-2">
                <span className="w-5 h-5 rounded-full bg-[var(--avenize-primary)] text-white text-xs flex items-center justify-center flex-shrink-0">3</span>
                Start using Avenize with your team
              </li>
            </ol>
          </div>

          <div className="space-y-3">
            <p className="text-xs text-black/40">
              Didn't receive the email? Check your spam folder.
            </p>
            <button 
              onClick={handleResendEmail}
              className="text-sm text-[var(--avenize-primary)] hover:underline"
            >
              Resend confirmation email
            </button>
          </div>

          <div className="pt-4 border-t border-black/5">
            <Link 
              to="/login" 
              className="text-sm text-[var(--avenize-primary)] hover:underline font-medium flex items-center justify-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to sign in
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--avenize-offwhite)] px-4 py-8">
      <div className="w-full max-w-md bg-white rounded-2xl border border-black/[0.06] p-8 space-y-6">
        {/* Header */}
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 rounded-2xl avenize-gradient flex items-center justify-center">
              <span className="text-white font-bold text-3xl">A</span>
            </div>
          </div>
          <h1 className="text-2xl font-bold text-[var(--avenize-black)]">Avenize</h1>
          <p className="text-sm text-black/50 mt-1">The Business Operating System</p>
        </div>

        <div className="text-center">
          <h2 className="text-lg font-semibold">Set up your business</h2>
          <p className="text-sm text-black/50 mt-1">
            Create your workspace and invite your team
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {/* OAuth Buttons */}
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => handleOAuthSignIn('google')}
            className="w-full flex items-center justify-center gap-3 rounded-xl border border-black/10 py-3 text-sm font-medium hover:bg-black/[0.02] transition"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </button>
          
          <button
            type="button"
            onClick={() => handleOAuthSignIn('github')}
            className="w-full flex items-center justify-center gap-3 rounded-xl border border-black/10 py-3 text-sm font-medium hover:bg-black/[0.02] transition"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
            Continue with GitHub
          </button>
        </div>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-black/10"></div>
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-white px-2 text-black/40">Or</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-black/70 mb-1.5">
              Business Name *
            </label>
            <input
              required
              placeholder="Your Company Ltd"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              className="w-full rounded-xl border border-black/10 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--avenize-primary)]/30 focus:border-[var(--avenize-primary)]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-black/70 mb-1.5">
              Industry
            </label>
            <select
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              className="w-full rounded-xl border border-black/10 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--avenize-primary)]/30 focus:border-[var(--avenize-primary)] bg-white"
            >
              <option value="">Select industry (optional)</option>
              <option value="construction">Construction</option>
              <option value="real_estate">Real Estate</option>
              <option value="manufacturing">Manufacturing</option>
              <option value="retail">Retail</option>
              <option value="services">Professional Services</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-black/70 mb-1.5">
              Your Full Name *
            </label>
            <input
              required
              placeholder="Chinedu Okonkwo"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full rounded-xl border border-black/10 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--avenize-primary)]/30 focus:border-[var(--avenize-primary)]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-black/70 mb-1.5">
              Work Email *
            </label>
            <input
              type="email"
              required
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-black/10 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--avenize-primary)]/30 focus:border-[var(--avenize-primary)]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-black/70 mb-1.5">
              Password *
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                minLength={8}
                placeholder="Min. 8 characters"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  if (confirmPassword) validatePassword()
                }}
                className="w-full rounded-xl border border-black/10 px-4 py-3 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--avenize-primary)]/30 focus:border-[var(--avenize-primary)]"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-black/30 hover:text-black/50"
              >
                {showPassword ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                )}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-black/70 mb-1.5">
              Confirm Password *
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
                className={`w-full rounded-xl border ${passwordError ? 'border-red-500' : 'border-black/10'} px-4 py-3 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--avenize-primary)]/30 focus:border-[var(--avenize-primary)]`}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-black/30 hover:text-black/50"
              >
                {showConfirmPassword ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                )}
              </button>
            </div>
            {passwordError && (
              <p className="text-xs text-red-500 mt-1.5 flex items-center gap-1">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                {passwordError}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading || !businessName || !fullName || !email || !password || !confirmPassword}
            className="w-full rounded-xl avenize-gradient text-white py-3.5 text-sm font-semibold hover:opacity-95 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                Setting up...
              </span>
            ) : (
              'Create Business'
            )}
          </button>
        </form>

        <p className="text-xs text-center text-black/40">
          By signing up, you agree to our{' '}
          <a href="/terms" className="text-[var(--avenize-primary)] hover:underline">Terms</a>
          {' '}and{' '}
          <a href="/privacy" className="text-[var(--avenize-primary)] hover:underline">Privacy Policy</a>
        </p>

        <div className="pt-4 border-t border-black/5 text-center">
          <p className="text-sm text-black/50">
            Already have an account?{' '}
            <Link to="/login" className="text-[var(--avenize-primary)] font-medium hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}

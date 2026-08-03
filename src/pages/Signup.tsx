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
  const [industry, setIndustry] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
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
              <option value="construction">Construction / Roofing</option>
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
            <input
              type="password"
              required
              minLength={8}
              placeholder="Min. 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-black/10 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--avenize-primary)]/30 focus:border-[var(--avenize-primary)]"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !businessName || !fullName || !email || !password}
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

import { useEffect, useState, type FormEvent } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

type InviteInfo = {
  business_id: string
  business_name: string
  role: string
  email: string
  invited_by_name?: string
  valid: boolean
  expires_at?: string
}

export default function Join() {
  const { inviteId } = useParams()
  const [info, setInfo] = useState<InviteInfo | null>(null)
  const [loadingInfo, setLoadingInfo] = useState(true)
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [step, setStep] = useState<'review' | 'account' | 'success'>('review')

  useEffect(() => {
    if (!inviteId) return
    
    supabase.rpc('get_invite_info', { invite_id: inviteId }).then(({ data, error: rpcError }) => {
      if (rpcError || !data || data.length === 0) {
        setInfo(null)
      } else {
        const invite = data[0] as InviteInfo
        // Check if expired
        if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
          setInfo({ ...invite, valid: false })
        } else {
          setInfo(invite)
        }
      }
      setLoadingInfo(false)
    })
  }, [inviteId])

  const handleSignUp = async (e: FormEvent) => {
    e.preventDefault()
    if (!inviteId || !info) return
    setSubmitting(true)
    setError(null)

    // Sign up new user
    const { data: authData, error: signUpError } = await supabase.auth.signUp({
      email: info.email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: `${window.location.origin}/auth/callback?token=${inviteId}`
      },
    })

    if (signUpError) {
      setError(signUpError.message)
      setSubmitting(false)
      return
    }

    if (!authData.session) {
      // Email confirmation required - store invite token
      localStorage.setItem('avenize_pending_invite', JSON.stringify({
        token: inviteId,
        businessName: info.business_name,
        role: info.role,
      }))
      setStep('success')
      setSubmitting(false)
      return
    }

    // No email confirmation - accept invite immediately
    const { error: rpcError } = await supabase.rpc('accept_invite', {
      p_token: inviteId,
      p_staff_name: fullName,
    })

    if (rpcError) {
      setError(rpcError.message)
      setSubmitting(false)
      return
    }

    // Redirect to dashboard
    window.location.href = '/app'
  }

  if (loadingInfo) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--avenize-offwhite)]">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl avenize-gradient flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-bold text-2xl">A</span>
          </div>
          <div className="w-8 h-8 border-2 border-[var(--avenize-primary)] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-black/50 mt-4">Loading invitation...</p>
        </div>
      </div>
    )
  }

  if (!info?.valid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--avenize-offwhite)] px-4">
        <div className="w-full max-w-md bg-white rounded-2xl border border-black/[0.06] p-8 text-center space-y-6">
          <div className="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center mx-auto">
            <svg className="w-10 h-10 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          </div>
          <div>
            <h2 className="text-2xl font-bold">Invalid Invitation</h2>
            <p className="text-black/60 mt-2">
              This invitation link has expired or has already been used.
            </p>
          </div>
          <div className="space-y-3">
            <Link 
              to="/signup" 
              className="block w-full px-6 py-3 rounded-xl avenize-gradient text-white font-medium text-center"
            >
              Sign up for a new account
            </Link>
            <Link to="/login" className="block text-sm text-[var(--avenize-primary)] hover:underline">
              Already have an account? Sign in
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (step === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--avenize-offwhite)] px-4">
        <div className="w-full max-w-md bg-white rounded-2xl border border-black/[0.06] p-8 text-center space-y-6">
          <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto">
            <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <h2 className="text-2xl font-bold">Check your email</h2>
            <p className="text-black/60 mt-2">
              We sent a confirmation link to
            </p>
            <p className="font-semibold text-[var(--avenize-primary)] mt-1">{info.email}</p>
          </div>
          
          <div className="bg-gradient-to-br from-[var(--avenize-primary)]/5 to-[var(--avenize-accent)]/5 rounded-2xl p-5 text-left">
            <p className="text-sm text-black/70">
              <strong>Next steps:</strong>
            </p>
            <ol className="text-sm text-black/60 mt-3 space-y-2">
              <li className="flex gap-2">
                <span className="w-5 h-5 rounded-full bg-[var(--avenize-primary)] text-white text-xs flex items-center justify-center flex-shrink-0">1</span>
                Click the confirmation link in your email
              </li>
              <li className="flex gap-2">
                <span className="w-5 h-5 rounded-full bg-[var(--avenize-primary)] text-white text-xs flex items-center justify-center flex-shrink-0">2</span>
                You'll automatically join <strong>{info.business_name}</strong>
              </li>
            </ol>
          </div>

          <div className="pt-4 border-t border-black/5">
            <Link to="/login" className="text-sm text-[var(--avenize-primary)] hover:underline font-medium">
              ← Back to sign in
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (step === 'account') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--avenize-offwhite)] px-4 py-8">
        <div className="w-full max-w-md bg-white rounded-2xl border border-black/[0.06] p-8 space-y-6">
          <div className="text-center">
            <div className="w-16 h-16 rounded-2xl avenize-gradient flex items-center justify-center mx-auto mb-4">
              <span className="text-white font-bold text-3xl">A</span>
            </div>
            <h2 className="text-xl font-bold">Create your account</h2>
            <p className="text-sm text-black/50 mt-1">
              Join <span className="font-semibold">{info.business_name}</span> as <span className="font-semibold capitalize">{info.role}</span>
            </p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSignUp} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-black/70 mb-1.5">Full Name *</label>
              <input
                required
                placeholder="Your full name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full rounded-xl border border-black/10 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--avenize-primary)]/30"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-black/70 mb-1.5">Email</label>
              <input
                type="email"
                value={info.email}
                disabled
                className="w-full rounded-xl border border-black/10 px-4 py-3 text-sm bg-gray-50 text-black/50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-black/70 mb-1.5">Password *</label>
              <input
                type="password"
                required
                minLength={8}
                placeholder="Min. 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-black/10 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--avenize-primary)]/30"
              />
            </div>
            <button
              type="submit"
              disabled={submitting || !fullName || !password}
              className="w-full rounded-xl avenize-gradient text-white py-3.5 text-sm font-semibold disabled:opacity-50"
            >
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Creating account...
                </span>
              ) : 'Create account & join'}
            </button>
          </form>

          <div className="text-center">
            <button 
              onClick={() => setStep('review')}
              className="text-sm text-black/50 hover:text-black"
            >
              ← Back to invitation
            </button>
          </div>

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

  // Review invitation screen
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--avenize-offwhite)] px-4 py-8">
      <div className="w-full max-w-md bg-white rounded-2xl border border-black/[0.06] p-8 space-y-6">
        {/* Header */}
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl avenize-gradient flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-bold text-3xl">A</span>
          </div>
          <h1 className="text-2xl font-bold">Avenize</h1>
          <p className="text-sm text-black/50 mt-1">You're invited!</p>
        </div>

        {/* Invitation Card */}
        <div className="bg-gradient-to-br from-[var(--avenize-primary)]/5 to-[var(--avenize-accent)]/5 rounded-2xl p-6 space-y-4">
          <div className="text-center">
            <p className="text-sm text-black/60 mb-2">You've been invited to join</p>
            <h2 className="text-xl font-bold text-[var(--avenize-black)]">{info.business_name}</h2>
          </div>
          
          <div className="flex items-center justify-center gap-8 pt-4 border-t border-black/10">
            <div className="text-center">
              <p className="text-xs text-black/50 uppercase tracking-wide mb-1">Role</p>
              <p className="font-semibold capitalize">{info.role}</p>
            </div>
            {info.invited_by_name && (
              <div className="text-center">
                <p className="text-xs text-black/50 uppercase tracking-wide mb-1">Invited by</p>
                <p className="font-semibold">{info.invited_by_name}</p>
              </div>
            )}
          </div>

          {info.expires_at && (
            <p className="text-xs text-center text-black/40">
              Expires {new Date(info.expires_at).toLocaleDateString()}
            </p>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="space-y-3">
          <button
            onClick={() => setStep('account')}
            className="w-full rounded-xl avenize-gradient text-white py-3.5 text-sm font-semibold"
          >
            Accept Invitation
          </button>
          
          <div className="text-center">
            <p className="text-sm text-black/50">
              Already have an account?{' '}
              <Link to="/login" className="text-[var(--avenize-primary)] font-medium hover:underline">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

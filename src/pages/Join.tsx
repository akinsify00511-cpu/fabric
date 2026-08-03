import { useEffect, useState, type FormEvent } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import AvenizeMark from '../components/AvenizeMark'

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
  const navigate = useNavigate()
  const [info, setInfo] = useState<InviteInfo | null>(null)
  const [loadingInfo, setLoadingInfo] = useState(true)
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [step, setStep] = useState<'review' | 'account' | 'success'>('review')
  const [hasAccount, setHasAccount] = useState(false)

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

    const { data: authData, error: signUpError } = await supabase.auth.signUp({
      email: info.email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: `${window.location.origin}/auth/callback`
      },
    })

    if (signUpError) {
      setError(signUpError.message)
      setSubmitting(false)
      return
    }

    if (!authData.session) {
      setStep('success')
      setSubmitting(false)
      return
    }

    // Accept invite after signup
    const { error: rpcError } = await supabase.rpc('accept_invite', {
      p_token: inviteId,
      p_staff_name: fullName,
    })

    if (rpcError) {
      setError(rpcError.message)
      setSubmitting(false)
      return
    }

    navigate('/app')
  }

  const handleSignIn = async (e: FormEvent) => {
    e.preventDefault()
    if (!inviteId || !info) return
    setSubmitting(true)
    setError(null)

    // For existing users, they just need to sign in and we'll accept invite
    // This flow would typically be handled by the auth callback
    setError('Please sign in first, then return to this page to accept the invite.')
    setSubmitting(false)
  }

  if (loadingInfo) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--avenize-offwhite)]">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 border-2 border-[var(--avenize-primary)] border-t-transparent rounded-full animate-spin" />
          <span className="text-black/50">Loading...</span>
        </div>
      </div>
    )
  }

  if (!info?.valid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--avenize-offwhite)] px-4">
        <div className="w-full max-w-sm bg-white rounded-2xl border border-black/[0.06] p-8 text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto">
            <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold">Invalid Invitation</h2>
          <p className="text-black/60">
            This invitation link has expired or has already been used.
          </p>
          <Link 
            to="/signup" 
            className="inline-block px-6 py-3 rounded-xl avenize-gradient text-white font-medium"
          >
            Sign up instead
          </Link>
          <Link to="/login" className="block text-sm text-[var(--avenize-primary)] hover:underline">
            Already have an account? Sign in
          </Link>
        </div>
      </div>
    )
  }

  if (step === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--avenize-offwhite)] px-4">
        <div className="w-full max-w-sm bg-white rounded-2xl border border-black/[0.06] p-8 text-center space-y-6">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-semibold">Check your email</h2>
            <p className="text-sm text-black/60 mt-2">
              We sent a confirmation link to <span className="font-medium">{info.email}</span>
            </p>
          </div>
          <div className="bg-gray-50 rounded-xl p-4 text-left">
            <p className="text-sm text-black/60">
              Click the confirmation link, then you'll be able to join <strong>{info.business_name}</strong> as a <strong>{info.role}</strong>.
            </p>
          </div>
          <div className="pt-2">
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
            <div className="w-14 h-14 rounded-2xl avenize-gradient flex items-center justify-center mx-auto mb-4">
              <span className="text-white font-bold text-2xl">A</span>
            </div>
            <h2 className="text-lg font-semibold">Create your account</h2>
            <p className="text-sm text-black/50 mt-1">
              Join <span className="font-medium">{info.business_name}</span> as <span className="font-medium capitalize">{info.role}</span>
            </p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSignUp} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-black/70 mb-1.5">Full Name</label>
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
              <label className="block text-sm font-medium text-black/70 mb-1.5">Password</label>
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
              {submitting ? 'Creating account...' : 'Create account & join'}
            </button>
          </form>

          <button 
            onClick={() => setStep('review')}
            className="w-full text-sm text-black/50 hover:text-black"
          >
            ← Back
          </button>
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
          <div className="w-14 h-14 rounded-2xl avenize-gradient flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-bold text-2xl">A</span>
          </div>
          <h1 className="text-2xl font-bold">Avenize</h1>
          <p className="text-sm text-black/50 mt-1">You're invited!</p>
        </div>

        {/* Invitation Details */}
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
              This invitation expires on {new Date(info.expires_at).toLocaleDateString()}
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
            Accept & Create Account
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

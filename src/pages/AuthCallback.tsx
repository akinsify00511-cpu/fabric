// ============================================
// AUTH CALLBACK PAGE
// Handles email confirmation for signup and invite acceptance
// ============================================
// The Supabase client (detectSessionInUrl, default) exchanges the ?code= in
// the URL during initialization — AuthContext's initial getSession() resolves
// only after that exchange, so this page NEVER exchanges codes itself (a
// second exchange would fail and previously surfaced a spurious error
// screen). Routing decisions come from AuthContext's canonical membership
// state; this page only performs the one-time side effects (business creation
// from a pending signup, invite acceptance) and then defers to the guards.
// ============================================

import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { createBusinessAndOwner } from '../lib/onboarding'
import { getUserMfa, mfaRequired, isMfaVerified } from '../lib/mfa'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

export default function AuthCallback() {
  const navigate = useNavigate()
  const { session, membership, refreshStaff } = useAuth()
  const [searchParams] = useSearchParams()
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string>('')
  // Run the routing/side-effect pass exactly once per resolved membership.
  const handledRef = useRef(false)

  useEffect(() => {
    if (handledRef.current) return
    if (membership === 'loading') return
    handledRef.current = true
    void routeAfterCallback()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [membership])

  const routeAfterCallback = async () => {
    const errorParam = searchParams.get('error')
    const type = searchParams.get('type') // 'signup' | 'invite' | 'recovery'
    const token = searchParams.get('token') // invite token if coming from invite
    const hadCode = !!searchParams.get('code')

    if (errorParam) {
      setError(errorParam)
      return
    }

    // Password recovery lands here with a session (auto-exchanged); without
    // one, the link is expired or already consumed.
    if (type === 'recovery') {
      if (session) navigate('/update-password', { replace: true })
      else setError('This password reset link has expired or was already used. Please request a new one.')
      return
    }

    if (membership === 'anonymous') {
      // A code was present but produced no session: the confirmation/invite
      // link is expired or already consumed.
      if (hadCode) {
        setError('This sign-in link has expired or was already used. Please request a new one.')
      } else {
        navigate('/login', { replace: true })
      }
      return
    }

    if (membership === 'error') {
      setError('We could not load your account. Check your connection and try again.')
      return
    }

    // MFA gate: if the user has TOTP enabled and hasn't cleared it this
    // session, defer to the login page's challenge UI.
    if (session) {
      const mfa = await getUserMfa(session)
      if (mfaRequired(mfa) && !isMfaVerified(session.user.id)) {
        navigate('/login?mfa=1', { replace: true })
        return
      }
    }

    // Existing members go straight to the app.
    if (membership === 'member' || membership === 'deactivated') {
      setMessage('Welcome back! Redirecting to your workspace…')
      navigate('/app', { replace: true })
      return
    }

    // onboarding_required: complete the pending setup, if any.
    const user = session?.user
    if (!user) {
      navigate('/login', { replace: true })
      return
    }

    const oauthMetadata = user.user_metadata

    // OAuth user (Google/GitHub) with profile metadata — onboarding collects
    // the business details.
    if (oauthMetadata?.full_name || oauthMetadata?.name) {
      localStorage.setItem('avenize_oauth_pending', JSON.stringify({
        fullName: oauthMetadata.full_name || oauthMetadata.name,
        email: oauthMetadata.email,
        avatarUrl: oauthMetadata.avatar_url,
        provider: oauthMetadata.provider,
      }))
      navigate('/onboarding', { replace: true })
      return
    }

    // Email/password signup with email confirmation: the business details were
    // stashed at signup; create the business now.
    const pendingBusiness = localStorage.getItem('avenize_pending_business')
    if (pendingBusiness) {
      try {
        const { businessName, industry, fullName, email } = JSON.parse(pendingBusiness)
        setMessage(`Setting up ${businessName}…`)

        const result = await createBusinessAndOwner({
          businessName,
          industry: industry || null,
          staffName: fullName,
        })

        if (!result.ok) {
          if (result.reason === 'already_member') {
            // Re-clicking an old confirmation link after onboarding completed.
            localStorage.removeItem('avenize_pending_business')
            await refreshStaff()
            navigate('/app', { replace: true })
            return
          }
          if (result.reason === 'unavailable') {
            // RPC not deployed on this environment — onboarding wizard is the
            // recovery surface.
            localStorage.removeItem('avenize_pending_business')
            navigate('/onboarding', { replace: true })
            return
          }
          setError(result.message || 'Failed to set up your business. Please contact support.')
          return
        }

        localStorage.removeItem('avenize_pending_business')
        sendWelcomeEmail(email, fullName, businessName, session!.access_token)

        setMessage('Business created! Redirecting…')
        await refreshStaff()
        navigate('/app', { replace: true })
        return
      } catch (err) {
        console.error('Error parsing pending business:', err)
        localStorage.removeItem('avenize_pending_business')
        navigate('/onboarding', { replace: true })
        return
      }
    }

    // Pending invite acceptance.
    if (token) {
      const pendingInvite = localStorage.getItem('avenize_pending_invite')
      if (pendingInvite) {
        setMessage('Joining your team…')

        const { error: inviteError } = await supabase.rpc('accept_invite', {
          p_token: token,
          p_staff_name: user.user_metadata?.full_name || null,
        })

        if (inviteError) {
          console.error('Failed to accept invite:', inviteError)
          setError(inviteError.message)
          return
        }

        localStorage.removeItem('avenize_pending_invite')
        setMessage('Joined! Redirecting…')
        await refreshStaff()
        navigate('/app', { replace: true })
        return
      }
    }

    // New user with no pending data — onboarding collects the details.
    navigate('/onboarding', { replace: true })
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8F9FA] px-4">
        <div className="w-full max-w-md bg-white rounded-2xl border border-black/[0.06] p-8 text-center space-y-6">
          <div className="w-16 h-16 rounded-full bg-[var(--av-danger-soft)] flex items-center justify-center mx-auto">
            <svg className="w-8 h-8 text-[var(--av-danger)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-semibold">Something went wrong</h2>
            <p className="text-sm text-black/60 mt-2">{error}</p>
          </div>
          <div className="flex items-center justify-center gap-3">
            {membership !== 'anonymous' && (
              <button
                onClick={() => { handledRef.current = false; setError(null); void refreshStaff() }}
                className="px-6 py-3 rounded-xl border border-black/10 text-sm font-medium"
              >
                Try again
              </button>
            )}
            <a
              href="/login"
              className="inline-block px-6 py-3 rounded-xl avenize-gradient text-white font-medium"
            >
              Back to Sign In
            </a>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8F9FA]">
      <div className="text-center">
        <div className="w-16 h-16 rounded-2xl avenize-gradient flex items-center justify-center mx-auto mb-4">
          <span className="text-white font-bold text-2xl">A</span>
        </div>
        <div className="w-8 h-8 border-2 border-[var(--av-primary)] border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-sm text-black mt-4">{message || 'Completing sign in…'}</p>
      </div>
    </div>
  )
}

// Send welcome email via Edge Function
async function sendWelcomeEmail(email: string, fullName: string, businessName: string | undefined, accessToken: string) {
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/send-welcome-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ email, fullName, businessName }),
    })

    if (!response.ok) {
      console.error('Failed to send welcome email:', response.statusText)
    }
  } catch (err) {
    // Non-blocking - don't show error to user
    console.error('Error sending welcome email:', err)
  }
}

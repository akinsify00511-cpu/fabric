// ============================================
// AUTH CALLBACK PAGE
// Handles OAuth, email confirmation, recovery and invite callbacks.
// ============================================
// OAuth uses Supabase Authorization Code + PKCE. The browser client has
// detectSessionInUrl disabled so this page owns the one-time code exchange.
// Routing only begins after the exchange has completed and AuthContext has had
// a chance to resolve the resulting session/membership.
// ============================================

import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { createBusinessAndOwner } from '../lib/onboarding'
import { getUserMfa, mfaRequired, isMfaVerified } from '../lib/mfa'

export default function AuthCallback() {
  const navigate = useNavigate()
  const { session, membership, refreshStaff } = useAuth()
  const [searchParams] = useSearchParams()
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string>('')
  const [callbackReady, setCallbackReady] = useState(false)
  const exchangeStartedRef = useRef(false)
  const routeStartedRef = useRef(false)

  // Complete the PKCE exchange before AuthContext-driven routing runs.
  useEffect(() => {
    if (exchangeStartedRef.current) return
    exchangeStartedRef.current = true

    const completeCallback = async () => {
      const errorParam = searchParams.get('error')
      const errorDescription = searchParams.get('error_description')
      const code = searchParams.get('code')
      const flowId = searchParams.get('sb_flow_id')

      if (errorParam) {
        setError(errorDescription || errorParam)
        return
      }

      if (code) {
        setMessage('Completing secure sign in…')
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(
          code,
          flowId ? { flowId } : undefined,
        )

        if (exchangeError) {
          setError(
            exchangeError.message ||
              'We could not complete sign in. Please return to Avenize and try again.'
          )
          return
        }
      }

      // Make sure the session is persisted/readable before AuthContext routes.
      const { error: sessionError } = await supabase.auth.getSession()
      if (sessionError) {
        setError(sessionError.message || 'We could not restore your sign-in session.')
        return
      }

      setCallbackReady(true)
    }

    void completeCallback()
  }, [searchParams])

  useEffect(() => {
    if (!callbackReady || routeStartedRef.current) return
    if (membership === 'loading') return
    routeStartedRef.current = true
    void routeAfterCallback()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callbackReady, membership])

  const routeAfterCallback = async () => {
    const type = searchParams.get('type')
    const token = searchParams.get('token')
    const hadCode = !!searchParams.get('code')

    if (type === 'recovery') {
      if (session) navigate('/update-password', { replace: true })
      else setError('This password reset link has expired or was already used. Please request a new one.')
      return
    }

    if (membership === 'anonymous') {
      if (hadCode) {
        setError('This confirmation link has expired or was already used. Please request a new confirmation email.')
      } else {
        navigate('/login', { replace: true })
      }
      return
    }

    if (membership === 'error') {
      setError('We could not load your account. Check your connection and try again.')
      return
    }

    if (session) {
      const mfa = await getUserMfa(session)
      if (mfaRequired(mfa) && !isMfaVerified(session.user.id)) {
        navigate('/login?mfa=1', { replace: true })
        return
      }
    }

    if (membership === 'member' || membership === 'deactivated') {
      setMessage('Welcome back! Redirecting to your workspace…')
      navigate('/app', { replace: true })
      return
    }

    const user = session?.user
    if (!user) {
      navigate('/login', { replace: true })
      return
    }

    const metadata = user.user_metadata || {}

    // OAuth users go through the normal onboarding wizard.
    if (metadata?.provider === 'google' || metadata?.provider === 'github' || metadata?.avatar_url) {
      localStorage.setItem('avenize_oauth_pending', JSON.stringify({
        fullName: metadata.full_name || metadata.name || '',
        email: user.email || metadata.email || '',
        avatarUrl: metadata.avatar_url,
        provider: metadata.provider,
      }))
      navigate('/onboarding', { replace: true })
      return
    }

    // Email/password signup: use local storage when available, but fall back to
    // auth metadata so confirmation works on a different browser/device.
    let pendingBusiness: { businessName?: string; industry?: string | null; fullName?: string } | null = null
    const storedPending = localStorage.getItem('avenize_pending_business')
    if (storedPending) {
      try {
        pendingBusiness = JSON.parse(storedPending)
      } catch {
        localStorage.removeItem('avenize_pending_business')
      }
    }

    const businessName = pendingBusiness?.businessName || metadata.business_name
    const industry = pendingBusiness?.industry ?? metadata.industry ?? null
    const fullName = pendingBusiness?.fullName || metadata.full_name || metadata.name || ''

    if (businessName) {
      setMessage(`Setting up ${businessName}…`)

      const result = await createBusinessAndOwner({
        businessName,
        industry,
        staffName: fullName,
      })

      if (!result.ok) {
        if (result.reason === 'already_member') {
          localStorage.removeItem('avenize_pending_business')
          await refreshStaff()
          navigate('/app', { replace: true })
          return
        }
        if (result.reason === 'unavailable') {
          navigate('/onboarding', { replace: true })
          return
        }
        setError(result.message || 'Your email was confirmed, but we could not finish setting up your business. Please try again.')
        return
      }

      localStorage.removeItem('avenize_pending_business')
      setMessage('Email confirmed! Your workspace is ready. Redirecting…')
      await refreshStaff()
      navigate('/app', { replace: true })
      return
    }

    // Legacy accounts created before signup metadata existed still get a clean
    // onboarding path instead of a broken confirmation screen.
    navigate('/onboarding', { replace: true })
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8F9FA] px-4">
        <div className="w-full max-w-md bg-white rounded-2xl border border-black/[0.06] p-8 text-center space-y-6">
          <div className="w-16 h-16 rounded-full bg-[var(--av-danger-soft)] flex items-center justify-center mx-auto">
            <svg className="w-8 h-8 text-[var(--av-danger)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </div>
          <div><h2 className="text-xl font-semibold">Something went wrong</h2><p className="text-sm text-black/60 mt-2">{error}</p></div>
          <div className="flex items-center justify-center gap-3">
            <button onClick={() => window.location.assign('/login')} className="inline-block px-6 py-3 rounded-xl avenize-gradient text-white font-medium">Back to Sign In</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8F9FA]"><div className="text-center">
      <div className="w-16 h-16 rounded-2xl avenize-gradient flex items-center justify-center mx-auto mb-4"><span className="text-white font-bold text-2xl">A</span></div>
      <div className="w-8 h-8 border-2 border-[var(--av-primary)] border-t-transparent rounded-full animate-spin mx-auto" />
      <p className="text-sm text-black mt-4">{message || 'Completing sign in…'}</p>
    </div></div>
  )
}

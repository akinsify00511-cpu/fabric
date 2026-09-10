// ============================================
// AUTH CALLBACK PAGE
// Handles OAuth, email confirmation, recovery and invite callbacks.
// ============================================
// OAuth uses Supabase Authorization Code + PKCE. The browser client has
// detectSessionInUrl disabled so this page owns the one-time code exchange.
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
  const [exchangedSession, setExchangedSession] = useState<typeof session>(null)
  const exchangeStartedRef = useRef(false)
  const routeStartedRef = useRef(false)

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
        const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(
          code,
          flowId ? { flowId } : undefined,
        )
        if (exchangeError) {
          setError(exchangeError.message || 'We could not complete sign in. Please return to Avenize and try again.')
          return
        }
        if (data.session) setExchangedSession(data.session)
        // Remove the one-time code immediately after a successful exchange.
        // This prevents accidental re-exchange on refresh/back navigation.
        const cleanUrl = `${window.location.origin}${window.location.pathname}`
        window.history.replaceState({}, document.title, cleanUrl)
      } else {
        const { data, error: sessionError } = await supabase.auth.getSession()
        if (sessionError) {
          setError(sessionError.message || 'We could not restore your sign-in session.')
          return
        }
        if (data.session) setExchangedSession(data.session)
      }

      setCallbackReady(true)
    }

    void completeCallback()
  }, [searchParams])

  useEffect(() => {
    if (!callbackReady || routeStartedRef.current) return
    if (membership === 'loading') return
    routeStartedRef.current = true
    void routeAfterCallback(exchangedSession || session)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callbackReady, membership, exchangedSession])

  const routeAfterCallback = async (activeSession: typeof session) => {
    const type = searchParams.get('type')
    const hadCode = !!searchParams.get('code') || !!exchangedSession

    if (type === 'recovery') {
      if (activeSession) navigate('/update-password', { replace: true })
      else setError('This password reset link has expired or was already used. Please request a new one.')
      return
    }

    if (membership === 'anonymous') {
      if (hadCode) setError('This confirmation link has expired or was already used. Please request a new confirmation email.')
      else navigate('/login', { replace: true })
      return
    }

    if (membership === 'error') {
      setError('We could not load your account. Check your connection and try again.')
      return
    }

    if (activeSession) {
      const mfa = await getUserMfa(activeSession)
      if (mfaRequired(mfa) && !isMfaVerified(activeSession.user.id)) {
        navigate('/login?mfa=1', { replace: true })
        return
      }
    }

    if (membership === 'member' || membership === 'deactivated') {
      navigate('/app', { replace: true })
      return
    }

    const user = activeSession?.user
    if (!user) {
      navigate('/login', { replace: true })
      return
    }

    const metadata = user.user_metadata || {}

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

    let pendingBusiness: { businessName?: string; industry?: string | null; fullName?: string } | null = null
    const storedPending = localStorage.getItem('avenize_pending_business')
    if (storedPending) {
      try { pendingBusiness = JSON.parse(storedPending) } catch { localStorage.removeItem('avenize_pending_business') }
    }

    const businessName = pendingBusiness?.businessName || metadata.business_name
    const industry = pendingBusiness?.industry ?? metadata.industry ?? null
    const fullName = pendingBusiness?.fullName || metadata.full_name || metadata.name || ''

    if (businessName) {
      setMessage(`Setting up ${businessName}…`)
      const result = await createBusinessAndOwner({ businessName, industry, staffName: fullName })
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
      await refreshStaff()
      navigate('/app', { replace: true })
      return
    }

    navigate('/onboarding', { replace: true })
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--av-bg,#F8F9FA)] px-4">
        <div className="w-full max-w-md bg-[var(--av-surface,#fff)] rounded-2xl border border-black/[0.06] p-8 text-center space-y-6">
          <div className="w-16 h-16 rounded-full bg-[var(--av-danger-soft)] flex items-center justify-center mx-auto"><svg className="w-8 h-8 text-[var(--av-danger)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></div>
          <div><h2 className="text-xl font-semibold text-[var(--av-text)]">Something went wrong</h2><p className="text-sm text-[var(--av-text-secondary)] mt-2">{error}</p></div>
          <button onClick={() => window.location.assign('/login')} className="inline-block px-6 py-3 rounded-xl avenize-gradient text-white font-medium">Back to Sign In</button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--av-bg,#F8F9FA)]">
      <div className="text-center"><div className="w-16 h-16 rounded-2xl avenize-gradient flex items-center justify-center mx-auto mb-4"><span className="text-white font-bold text-2xl">A</span></div><div className="w-8 h-8 border-2 border-[var(--av-primary)] border-t-transparent rounded-full animate-spin mx-auto" /><p className="text-sm text-[var(--av-text)] mt-4">{message || 'Completing sign in…'}</p></div>
    </div>
  )
}

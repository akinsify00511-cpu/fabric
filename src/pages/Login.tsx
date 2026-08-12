import { useState, useEffect, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { AvenizeMark } from '../components/AvenizeMark'
import {
  getUserMfa, mfaRequired, verifyTotpCode, parseBackupCodeHashes,
  verifyBackupCode, consumeBackupCode, setMfaVerified,
  type UserMfaRow,
} from '../lib/mfa'

// GOOGLE STANDARD BRAND COLORS
const BRAND = {
  primary: 'var(--av-primary)',
  primaryHover: 'var(--av-primary-hover)',
  primaryActive: '#2A5DB0',
  primarySoft: 'rgba(66, 133, 244, 0.08)',
  surface: '#F8F9FA',
  surface2: '#F1F3F4',
  surfaceElevated: '#FFFFFF',
  text: '#202124',
  textSecondary: '#5F6368',
  textMuted: '#9AA0A6',
  border: '#E8EAED',
  borderMedium: '#DADCE0',
  success: 'var(--av-success)',
  danger: 'var(--av-danger)',
  dangerSoft: 'rgba(234, 67, 53, 0.08)',
}

export default function Login() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [oauthLoading, setOauthLoading] = useState<string | null>(null)

  // MFA challenge state — set when a valid password/OAuth session exists but
  // the user has TOTP enabled and has not yet supplied the second factor.
  const [mfaChallenge, setMfaChallenge] = useState<UserMfaRow | null>(null)
  const [mfaCode, setMfaCode] = useState('')
  const [mfaVerifying, setMfaVerifying] = useState(false)
  const [useBackupCode, setUseBackupCode] = useState(false)

  // Complete login after the MFA challenge (or when none is required).
  const finishLogin = async (userId: string) => {
    const { data: staffData } = await supabase
      .from('staff')
      .select('business_id')
      .eq('user_id', userId)
      .maybeSingle()

    setLoading(false)
    if (staffData?.business_id) {
      navigate('/app')
    } else {
      navigate('/onboarding')
    }
  }

  // Verify the TOTP code (or a backup code) and, on success, mark MFA cleared
  // and proceed to the app.
  const handleMfaVerify = async (e: FormEvent) => {
    e.preventDefault()
    if (!mfaChallenge || !mfaChallenge.user_id) return
    setMfaVerifying(true)
    setError(null)

    try {
      if (useBackupCode) {
        const stored = parseBackupCodeHashes(mfaChallenge.backup_codes_hash)
        const { ok, remaining } = await verifyBackupCode(stored, mfaCode)
        if (!ok) {
          setError('Invalid backup code')
          setMfaVerifying(false)
          return
        }
        await consumeBackupCode(mfaChallenge.user_id, remaining, mfaChallenge.backup_codes_used + 1)
      } else {
        if (!verifyTotpCode(mfaChallenge.totp_secret || '', mfaCode)) {
          setError('Invalid verification code')
          setMfaVerifying(false)
          return
        }
      }
      setMfaVerified(mfaChallenge.user_id)
      await finishLogin(mfaChallenge.user_id)
    } catch (err) {
      console.error('MFA verify error:', err)
      setError('Verification failed. Please try again.')
      setMfaVerifying(false)
    }
  }

  // If we arrive with an existing session (OAuth callback redirect, or a page
  // refresh while the session cookie is still valid), honour the MFA gate
  // instead of silently dropping the user into the app.
  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const mfa = await getUserMfa(session)
      if (mfaRequired(mfa)) {
        // MFA enabled — show challenge, do NOT navigate to /app yet.
        setMfaChallenge(mfa)
        setLoading(false)
        return
      }

      const { data: staffData } = await supabase
        .from('staff')
        .select('business_id')
        .eq('user_id', session.user.id)
        .maybeSingle()

      if (staffData?.business_id) {
        navigate('/app', { replace: true })
      } else {
        navigate('/onboarding', { replace: true })
      }
    }
    checkSession()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, searchParams.get('mfa')])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    if (data.session) {
      // Password verified. Now check whether a second factor is required.
      const mfa = await getUserMfa(data.session)
      if (mfaRequired(mfa)) {
        setMfaChallenge(mfa)
        setLoading(false)
        return
      }
      await finishLogin(data.session.user.id)
    }
  }

  const handleOAuthSignIn = async (provider: 'google' | 'github') => {
    setOauthLoading(provider)
    setError(null)
    
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    
    if (error) {
      setError(error.message)
      setOauthLoading(null)
    }
  }

  return (
    <div 
      className="min-h-screen flex items-center justify-center"
      style={{ backgroundColor: BRAND.surface }}
    >
      <div
        className="w-full max-w-sm p-8 rounded-2xl"
        style={{ 
          backgroundColor: BRAND.surfaceElevated,
          
          boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 4px 8px rgba(0,0,0,0.04), 0 8px 16px rgba(0,0,0,0.04)',
          border: 'none',
        }}
      >
        <div className="flex items-center gap-2 mb-6">
          <AvenizeMark size={26} />
          <span className="text-xl font-semibold tracking-tight" style={{ color: BRAND.text }}>Avenize</span>
        </div>
        <p className="text-sm mb-6" style={{ color: BRAND.textSecondary }}>
          {mfaChallenge ? 'Enter your verification code' : 'Sign in to your workspace'}
        </p>

        {error && (
          <div 
            className="text-sm rounded-lg px-3 py-2 mb-4"
            style={{ color: BRAND.danger, backgroundColor: BRAND.dangerSoft }}
          >
            {error}
          </div>
        )}

        {mfaChallenge ? (
          <form onSubmit={handleMfaVerify} className="space-y-4 mb-4">
            <div>
              <label className="text-sm font-medium block mb-2" style={{ color: BRAND.text }}>
                {useBackupCode ? 'Backup code' : 'Authentication code'}
              </label>
              <input
                type="text"
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value.trim().slice(0, useBackupCode ? 20 : 6))}
                placeholder={useBackupCode ? 'XXXX-XXXX' : '000000'}
                className="w-full rounded-lg px-3 py-3 text-sm focus:outline-none"
                style={{
                  border: `1px solid ${BRAND.border}`,
                  backgroundColor: BRAND.surfaceElevated,
                  color: BRAND.text,
                  minHeight: '48px',
                  textAlign: 'center',
                  letterSpacing: useBackupCode ? '0.1em' : '0.4em',
                  fontSize: useBackupCode ? '0.875rem' : '1.5rem',
                }}
                autoFocus
                autoComplete="one-time-code"
                inputMode={useBackupCode ? 'text' : 'numeric'}
              />
              <p className="text-xs mt-2 text-center" style={{ color: BRAND.textSecondary }}>
                {useBackupCode
                  ? 'Enter one of your saved backup codes'
                  : 'Enter the 6-digit code from your authenticator app'}
              </p>
            </div>
            <button
              type="submit"
              disabled={mfaVerifying || !mfaCode}
              className="w-full rounded-lg text-white py-2 text-sm font-medium transition disabled:opacity-50"
              style={{ backgroundColor: BRAND.primary, border: 'none' }}
            >
              {mfaVerifying ? 'Verifying…' : 'Verify'}
            </button>
            <button
              type="button"
              onClick={() => { setUseBackupCode(v => !v); setMfaCode(''); setError(null) }}
              className="w-full text-center text-xs transition"
              style={{ color: BRAND.primary }}
            >
              {useBackupCode ? 'Use authentication code instead' : 'Use a backup code instead'}
            </button>
            <button
              type="button"
              onClick={async () => { await supabase.auth.signOut(); setMfaChallenge(null); setMfaCode(''); setError(null) }}
              className="w-full text-center text-xs transition"
              style={{ color: BRAND.textSecondary }}
            >
              Back to sign in
            </button>
          </form>
        ) : (
        <>
        {/* OAuth Buttons */}
        <div className="space-y-3 mb-6">
          <button
            type="button"
            onClick={() => handleOAuthSignIn('google')}
            disabled={!!oauthLoading}
            className="w-full flex items-center justify-center gap-3 rounded-lg py-2.5 text-sm font-medium transition"
            style={{ 
              border: 'none',
              backgroundColor: BRAND.surfaceElevated,
              color: BRAND.text,
              minHeight: '48px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04)',
            }}
          >
            {oauthLoading === 'google' ? (
              <div 
                className="w-5 h-5 border-2 rounded-full animate-spin" 
                style={{ borderColor: BRAND.textMuted, borderTopColor: BRAND.text }} 
              />
            ) : (
              <div 
                className="w-5 h-5 rounded-full flex items-center justify-center"
                style={{ backgroundColor: BRAND.primary }}
              >
                <span className="text-white text-xs font-bold">A</span>
              </div>
            )}
            Continue with Google
          </button>
          
          <button
            type="button"
            onClick={() => handleOAuthSignIn('github')}
            disabled={!!oauthLoading}
            className="w-full flex items-center justify-center gap-3 rounded-lg py-2.5 text-sm font-medium transition"
            style={{ 
              border: 'none',
              backgroundColor: BRAND.surfaceElevated,
              color: BRAND.text,
              minHeight: '48px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04)',
            }}
          >
            {oauthLoading === 'github' ? (
              <div 
                className="w-5 h-5 border-2 rounded-full animate-spin" 
                style={{ borderColor: BRAND.textMuted, borderTopColor: BRAND.text }} 
              />
            ) : (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
            )}
            Continue with GitHub
          </button>
        </div>

        <div className="relative mb-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t" style={{ borderColor: BRAND.border }}></div>
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span 
              className="px-2"
              style={{ backgroundColor: BRAND.surfaceElevated, color: BRAND.textMuted }}
            >
              Or
            </span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 mb-4">
          <input
            type="email"
            required
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg px-3 py-3 text-sm focus:outline-none"
            style={{ 
              border: `1px solid ${BRAND.border}`,
              backgroundColor: BRAND.surfaceElevated,
              color: BRAND.text,
              minHeight: '48px',
            }}
          />
          <input
            type="password"
            required
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg px-3 py-3 text-sm focus:outline-none"
            style={{ 
              border: `1px solid ${BRAND.border}`,
              backgroundColor: BRAND.surfaceElevated,
              color: BRAND.text,
              minHeight: '48px',
            }}
          />
        </form>

        <div className="flex items-center justify-between mb-4">
          <Link 
            to="/forgot-password" 
            className="text-xs transition"
            style={{ color: BRAND.primary }}
          >
            Forgot password?
          </Link>
        </div>

        <button
          type="submit"
          onClick={handleSubmit}
          disabled={loading}
          className="w-full rounded-lg text-white py-2 text-sm font-medium transition"
          style={{ 
            backgroundColor: BRAND.primary,
            border: 'none',
          }}
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </button>

        <p className="text-xs text-center mt-4" style={{ color: BRAND.textSecondary }}>
          New here?{' '}
          <Link 
            to="/signup" 
            className="transition"
            style={{ color: BRAND.primary }}
          >
            Set up your business
          </Link>
        </p>
        </>
        )}
      </div>
    </div>
  )
}

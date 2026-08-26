import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'

type Identity = {
  staff_id: string
  business_id: string
  role: string
  active: boolean
}

/**
 * The onboarding route is for genuinely new accounts only.
 * AuthContext is normally authoritative, but this gate performs one additional
 * SECURITY DEFINER identity check before rendering the business-creation wizard.
 */
export default function OnboardingGate({ children }: { children: React.ReactNode }) {
  const { membership, refreshStaff } = useAuth()
  const [identity, setIdentity] = useState<Identity | null>(null)
  const [identityChecked, setIdentityChecked] = useState(false)
  const [identityError, setIdentityError] = useState(false)

  useEffect(() => {
    let cancelled = false

    if (membership !== 'onboarding_required') {
      setIdentity(null)
      setIdentityChecked(true)
      setIdentityError(false)
      return
    }

    setIdentityChecked(false)
    setIdentityError(false)

    void supabase.rpc('resolve_current_user_context').then(({ data, error }) => {
      if (cancelled) return
      if (error) {
        console.warn('Onboarding identity resolver failed:', error)
        setIdentityError(true)
        setIdentityChecked(true)
        return
      }

      const row = Array.isArray(data) ? data[0] : data
      if (row?.staff_id && row?.business_id) {
        setIdentity({
          staff_id: row.staff_id,
          business_id: row.business_id,
          role: row.role || 'staff',
          active: row.active !== false,
        })
      } else {
        setIdentity(null)
      }
      setIdentityChecked(true)
    })

    return () => { cancelled = true }
  }, [membership])

  if (membership === 'loading' || (membership === 'onboarding_required' && !identityChecked)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white" aria-busy="true">
        <div className="flex flex-col items-center gap-3 text-center px-6">
          <div className="w-10 h-10 rounded-xl bg-[var(--av-primary)] flex items-center justify-center">
            <span className="text-white font-bold text-lg">A</span>
          </div>
          <div className="w-7 h-7 border-2 border-[var(--av-border)] border-t-[var(--av-primary)] rounded-full animate-spin" />
          <p className="text-sm text-[var(--av-text-muted)]">Restoring your workspace…</p>
        </div>
      </div>
    )
  }

  if (membership === 'anonymous') {
    return <Navigate to="/login" replace />
  }

  if (membership === 'error' || identityError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-4 text-center px-4">
          <div className="w-10 h-10 rounded-xl bg-[var(--av-primary)] flex items-center justify-center">
            <span className="text-white font-bold text-lg">A</span>
          </div>
          <p className="text-[var(--av-text)] font-medium">We couldn't verify your account</p>
          <p className="text-sm text-[var(--av-text-muted)]">Your workspace was not changed. Check your connection and try again.</p>
          <button
            onClick={() => { setIdentityError(false); void refreshStaff() }}
            className="px-5 py-2 rounded-lg bg-[var(--av-primary)] text-white text-sm hover:bg-[var(--av-primary-hover)]"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (membership === 'member' || membership === 'deactivated' || identity) {
    return <Navigate to="/app" replace />
  }

  return <>{children}</>
}

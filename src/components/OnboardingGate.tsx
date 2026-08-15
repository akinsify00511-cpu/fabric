import { Navigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'

/**
 * The onboarding route must wait for both auth restoration and the
 * authoritative staff lookup. A session alone is not enough: an already
 * onboarded user can briefly have a session while staffChecked is still
 * false, which used to expose the onboarding wizard during refresh/direct URL
 * navigation.
 */
export default function OnboardingGate({ children }: { children: React.ReactNode }) {
  const { session, loading, staff, staffChecked } = useAuth()

  if (loading || (session && !staffChecked)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white" aria-busy="true">
        <div className="flex flex-col items-center gap-3 text-center px-6">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center">
            <span className="text-white font-bold text-lg">A</span>
          </div>
          <div className="w-7 h-7 border-2 border-black border-t-blue-600 rounded-full animate-spin" />
          <p className="text-sm text-black/60">Restoring your workspace…</p>
        </div>
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/login" replace />
  }

  if (staff?.business_id && staff.onboarding_completed) {
    return <Navigate to="/app" replace />
  }

  return <>{children}</>
}

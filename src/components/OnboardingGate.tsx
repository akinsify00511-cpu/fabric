import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'

/**
 * Prevents the onboarding UI from rendering while the authenticated user's
 * staff/membership state is still being resolved.
 *
 * A missing staff record is a legitimate onboarding state; an unresolved
 * staff lookup is not. This prevents an already-onboarded user from briefly
 * seeing the onboarding wizard during auth restoration.
 */
export default function OnboardingGate() {
  const { session, loading, staff, staffChecked } = useAuth()

  if (loading || (session && !staffChecked)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white" aria-busy="true">
        <div className="text-sm text-black/60">Restoring your workspace…</div>
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/login" replace />
  }

  if (staff?.business_id && staff.onboarding_completed) {
    return <Navigate to="/app" replace />
  }

  return <Outlet />
}

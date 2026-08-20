import { Navigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'

/**
 * The onboarding route renders only for the `onboarding_required` membership
 * state. AuthContext owns that decision — this gate never does its own staff
 * lookup, so a transient empty read can never expose the wizard to an
 * already-onboarded user.
 */
export default function OnboardingGate({ children }: { children: React.ReactNode }) {
  const { membership, refreshStaff } = useAuth()

  if (membership === 'loading') {
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

  // Membership lookup failed — recoverable, session stays intact.
  if (membership === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-4 text-center px-4">
          <div className="w-10 h-10 rounded-xl bg-[var(--av-primary)] flex items-center justify-center">
            <span className="text-white font-bold text-lg">A</span>
          </div>
          <p className="text-[var(--av-text)] font-medium">We couldn't load your account</p>
          <p className="text-sm text-[var(--av-text-muted)]">Check your connection and try again.</p>
          <button
            onClick={() => void refreshStaff()}
            className="px-5 py-2 rounded-lg bg-[var(--av-primary)] text-white text-sm hover:bg-[var(--av-primary-hover)]"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  // A confirmed business membership means the user is already onboarded. Do
  // NOT gate on onboarding_completed: that flag is stale on live DBs and
  // previously trapped onboarded owners in a redirect loop.
  if (membership === 'member' || membership === 'deactivated') {
    return <Navigate to="/app" replace />
  }

  return <>{children}</>
}

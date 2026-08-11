// Route-level module gate. Wraps every /app/* route that maps to a module.
// Enforces the SAME server-side can_access_module check the sidebar uses —
// so a user can't reach a module's route by typing the URL, even if the
// nav item is filtered out. This is the P0 fix: client-only hiding is not
// a gate; the route layer must enforce too.

import { Loader2, Lock, Wrench, Crown, ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useModuleAccess, type ModuleKey } from '../lib/useModuleAccess'
import { useAuth } from '../lib/AuthContext'

export default function RequireModule({
  module,
  children,
}: {
  module: ModuleKey
  children: React.ReactNode
}) {
  const { staff } = useAuth()
  const { can_access, entitled, ready, loading } = useModuleAccess(module)
  const navigate = useNavigate()

  if (!staff) return null // RequireAuth (parent) handles auth.

  if (loading) {
    return (
      <div className="p-10 flex justify-center">
        <Loader2 className="animate-spin text-[var(--av-primary)]" />
      </div>
    )
  }

  if (can_access) return <>{children}</>

  // Distinguish the two reasons — different calls to action.
  const isReadiness = entitled && !ready
  const isEntitlement = !entitled

  return (
    <div className="p-6 max-w-md mx-auto text-center" style={{ marginTop: '12vh' }}>
      <div
        className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
        style={{ backgroundColor: isReadiness ? 'var(--av-info-soft)' : 'var(--av-warning-soft)' }}
      >
        {isReadiness ? <Wrench size={26} style={{ color: 'var(--av-info)' }} /> : <Lock size={26} style={{ color: 'var(--av-warning)' }} />}
      </div>
      <h1 className="text-xl font-bold text-[var(--av-text)] mb-2">
        {isReadiness ? "This module isn't available yet" : 'This module needs a higher plan'}
      </h1>
      <p className="text-sm text-[var(--av-text-secondary)] mb-5">
        {isReadiness
          ? "We're still wiring this module to real data so it doesn't show you anything fake. It'll appear here automatically the moment it's ready."
          : `Your current plan doesn't include this module. Upgrade to unlock it.`}
      </p>
      <div className="flex justify-center gap-2">
        <button
          onClick={() => navigate('/app')}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white text-[var(--av-text)] text-sm font-medium shadow-[var(--av-shadow-sm)]"
        >
          <ArrowLeft size={14} /> Back to dashboard
        </button>
        {isEntitlement && (
          <button
            onClick={() => navigate('/app/subscription')}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--av-primary)] text-white text-sm font-medium hover:bg-[var(--av-primary-hover)]"
          >
            <Crown size={14} /> Upgrade plan
          </button>
        )}
      </div>
      {isReadiness && (
        <p className="text-[11px] text-[var(--av-text-muted)] mt-4">
          Readiness gate: a module only becomes visible when it persists real data — never demo content.
        </p>
      )}
    </div>
  )
}

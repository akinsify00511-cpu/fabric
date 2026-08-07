/**
 * BetaTesterGate Component
 * Gate features that are only available to beta testers
 */

import { ReactNode } from 'react'
import { useAuth } from '../lib/AuthContext'
import { Sparkles, Lock } from 'lucide-react'

interface BetaTesterGateProps {
  children: ReactNode
  fallback?: ReactNode
  showBadge?: boolean
}

export default function BetaTesterGate({
  children,
  fallback,
  showBadge = true,
}: BetaTesterGateProps) {
  const { staff } = useAuth()

  if (staff?.is_beta_tester) {
    return (
      <>
        {children}
        {showBadge && (
          <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-400 to-orange-400 text-white text-xs font-medium">
            <Sparkles size={10} className="mr-1" />
            Beta
          </span>
        )}
      </>
    )
  }

  if (fallback) {
    return <>{fallback}</>
  }

  return null
}

/**
 * Beta-only badge component (for labeling beta features)
 */
export function BetaBadge({ className = '' }: { className?: string }) {
  const { staff } = useAuth()

  if (!staff?.is_beta_tester) {
    return null
  }

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-400 to-orange-400 text-white text-xs font-medium ${className}`}
    >
      <Sparkles size={10} className="mr-1" />
      Beta
    </span>
  )
}

/**
 * Feature not available placeholder
 */
export function FeatureComingSoon({
  featureName,
  className = '',
}: {
  featureName: string
  className?: string
}) {
  return (
    <div className={`p-6 rounded-xl border border-dashed border-black/10 text-center ${className}`}>
      <div className="w-12 h-12 rounded-full bg-black/5 flex items-center justify-center mx-auto mb-3">
        <Lock size={20} className="text-black/30" />
      </div>
      <h3 className="font-medium text-black/60 mb-1">{featureName}</h3>
      <p className="text-sm text-black/40">
        This feature is not yet available for your account.
      </p>
    </div>
  )
}

/**
 * Beta-only page wrapper
 * Shows the page only to beta testers, otherwise shows a coming soon message
 */
export function BetaOnlyPage({
  children,
  title,
  description,
}: {
  children: ReactNode
  title: string
  description: string
}) {
  const { staff } = useAuth()

  if (!staff?.is_beta_tester) {
    return (
      <div className="pb-20">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-medium text-gray-900">{title}</h1>
            <p className="text-sm text-black/50 mt-0.5">{description}</p>
          </div>
          <BetaBadge />
        </div>
        <FeatureComingSoon featureName={title} />
      </div>
    )
  }

  return <>{children}</>
}

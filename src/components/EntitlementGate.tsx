/**
 * EntitlementGate Component
 * Wraps features that require specific plan/feature entitlements
 */

import { ReactNode } from 'react'
import { useEntitlement, FeatureKey, FEATURES } from '../lib/useEntitlement'
import { Lock, Crown, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

interface EntitlementGateProps {
  feature: FeatureKey
  children: ReactNode
  fallback?: ReactNode
  showUpgradePrompt?: boolean
  modal?: boolean
}

export default function EntitlementGate({
  feature,
  children,
  fallback,
  showUpgradePrompt = true,
  modal = false,
}: EntitlementGateProps) {
  const { hasAccess, loading, plan } = useEntitlement(feature)
  const navigate = useNavigate()
  const featureInfo = FEATURES[feature]

  if (loading) {
    return null // Or skeleton
  }

  if (hasAccess) {
    return <>{children}</>
  }

  if (fallback) {
    return <>{fallback}</>
  }

  if (!showUpgradePrompt) {
    return null
  }

  const UpgradePrompt = () => (
    <div className={`flex flex-col items-center justify-center text-center p-6 rounded-xl border-2 border-dashed border-black bg-white ${
      modal ? 'w-full max-w-md mx-auto' : ''
    }`}>
      <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mb-4">
        <Lock size={24} className="text-amber-600" />
      </div>
      <h3 className="text-lg font-semibold text-black mb-2">
        {featureInfo?.label} requires a higher plan
      </h3>
      <p className="text-sm text-black mb-6 max-w-xs">
        Your current {plan} plan doesn't include this feature. Upgrade to unlock it.
      </p>
      <div className="flex gap-3">
        <button
          onClick={() => navigate('/app/settings')}
          className="px-4 py-2 text-sm border border-black rounded-lg hover:bg-white"
        >
          Maybe Later
        </button>
        <button
          onClick={() => navigate('/app/subscription')}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-gradient-to-r to-[#4285F4] to-[#8B5CF6]/50 text-white rounded-lg hover:shadow-lg transition"
        >
          <Crown size={16} />
          Upgrade Plan
        </button>
      </div>
    </div>
  )

  if (modal) {
    return (
      <div className="fixed inset-0 bg-black/100 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl p-6 w-full max-w-md relative">
          <button
            onClick={() => navigate('/app/settings')}
            className="absolute top-4 right-4 p-1 hover:bg-white rounded"
          >
            <X size={20} className="text-black" />
          </button>
          <UpgradePrompt />
        </div>
      </div>
    )
  }

  return <UpgradePrompt />
}

// Inline upgrade badge for buttons
interface UpgradeBadgeProps {
  plan: string
  children: ReactNode
}

export function UpgradeBadge({ plan, children }: UpgradeBadgeProps) {
  const navigate = useNavigate()
  
  return (
    <div className="relative group inline-block">
      {children}
      <div className="absolute -top-10 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        <div className="bg-black text-white text-xs px-2 py-1 rounded whitespace-nowrap">
          Requires {plan} plan
        </div>
      </div>
    </div>
  )
}

// Banner for pages that require specific features
interface FeatureBannerProps {
  feature: FeatureKey
  requiredPlan?: string
}

export function FeatureBanner({ feature, requiredPlan }: FeatureBannerProps) {
  const { hasAccess, plan } = useEntitlement(feature)
  const navigate = useNavigate()
  
  if (hasAccess) return null
  
  const planLabel = requiredPlan || 'Professional'
  
  return (
    <div className="bg-amber-50 border-b border-amber-200 p-4">
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Lock size={18} className="text-amber-600" />
          <span className="text-sm text-amber-800">
            <strong>{FEATURES[feature]?.label}</strong> is available on {planLabel}+ plans
          </span>
        </div>
        <button
          onClick={() => navigate('/app/subscription')}
          className="flex items-center gap-1.5 text-sm font-medium text-amber-700 hover:text-amber-800"
        >
          <Crown size={14} />
          Upgrade
        </button>
      </div>
    </div>
  )
}

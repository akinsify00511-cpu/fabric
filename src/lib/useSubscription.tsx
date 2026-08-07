import { useAuth } from './AuthContext'

export type Plan = 'free' | 'starter' | 'pro' | 'enterprise'

export const PLAN_LIMITS: Record<Plan, {
  maxUsers: number
  maxStorage: number // MB
  features: string[]
}> = {
  free: {
    maxUsers: 1,
    maxStorage: 100,
    features: ['dashboard', 'crm', 'quotes', 'invoices', 'tasks'],
  },
  starter: {
    maxUsers: 5,
    maxStorage: 1000,
    features: ['dashboard', 'crm', 'quotes', 'invoices', 'tasks', 'projects', 'chat', 'knowledge'],
  },
  pro: {
    maxUsers: 25,
    maxStorage: 10000,
    features: ['dashboard', 'crm', 'quotes', 'invoices', 'tasks', 'projects', 'chat', 'knowledge', 'automations', 'campaigns', 'accounting', 'inventory', 'cashflow', 'reports'],
  },
  enterprise: {
    maxUsers: Infinity,
    maxStorage: Infinity,
    features: ['*'], // All features
  },
}

export function useSubscription() {
  const { staff, isDemo } = useAuth()
  
  // Demo users get pro features
  const plan: Plan = isDemo ? 'pro' : (staff?.plan || 'free')
  const limits = PLAN_LIMITS[plan]
  
  const hasFeature = (feature: string): boolean => {
    if (limits.features.includes('*')) return true
    return limits.features.includes(feature)
  }
  
  const canInviteUsers = (currentCount: number): boolean => {
    return currentCount < limits.maxUsers
  }
  
  const canUseStorage = (usedMB: number): boolean => {
    return usedMB < limits.maxStorage
  }
  
  const needsUpgrade = (feature: string): boolean => {
    return !hasFeature(feature)
  }
  
  return {
    plan,
    limits,
    hasFeature,
    canInviteUsers,
    canUseStorage,
    needsUpgrade,
    isPro: plan === 'pro' || plan === 'enterprise',
    isEnterprise: plan === 'enterprise',
  }
}

// Feature locked component
interface FeatureLockProps {
  feature: string
  children: React.ReactNode
  fallback?: React.ReactNode
}

export function FeatureGate({ feature, children, fallback }: FeatureLockProps) {
  const { hasFeature } = useSubscription()
  
  if (hasFeature(feature)) {
    return <>{children}</>
  }
  
  if (fallback) {
    return <>{fallback}</>
  }
  
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center">
      <div className="w-16 h-16 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center mb-4">
        <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      </div>
      <h3 className="text-lg font-semibold mb-2">Upgrade to Unlock</h3>
      <p className="text-sm text-black mb-4 max-w-xs">
        This feature is available on our Pro plan and above.
      </p>
      <a
        href="/app/subscription"
        className="px-6 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl font-medium hover:shadow-lg transition"
      >
        Upgrade Now
      </a>
    </div>
  )
}

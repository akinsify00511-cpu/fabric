import { useState, useEffect } from 'react'
import { X, Crown, Check } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useEntitlements } from '../lib/useEntitlement'

export default function TrialBanner() {
  const [visible, setVisible] = useState(false)
  const { plan, loading, trialDaysLeft, inTrial } = useEntitlements()

  useEffect(() => {
    if (loading) return

    const paidPlans = ['starter', 'professional', 'enterprise']
    if (paidPlans.includes(plan)) {
      setVisible(false)
      return
    }

    // Trial window is tracked server-side on business_entitlements.trial_ends_at
    setVisible(inTrial)
  }, [loading, plan, inTrial])

  const dismiss = () => setVisible(false)

  if (!visible) return null

  const hasPaidFeatures = plan !== 'free'

  return (
    <div className="fixed bottom-12 md:bottom-0 left-0 right-0 bg-gradient-to-r from-[#4285F4] to-[#8B5CF6] text-white py-3 px-4 z-40">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 text-sm">
          {hasPaidFeatures ? (
            <>
              <Check size={20} />
              <span>
                You're on the <strong>{plan}</strong> plan! Enjoy your premium features.
              </span>
            </>
          ) : (
            <>
              <Crown size={20} />
              <span>
                <strong>{trialDaysLeft} {trialDaysLeft === 1 ? 'day' : 'days'} left</strong> in your free trial •
                Unlock all premium features!
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!hasPaidFeatures && (
            <Link
              to="/app/subscription"
              className="px-4 py-1.5 bg-white text-[#4285F4] text-sm font-medium rounded-lg hover:bg-white/90 transition"
            >
              Upgrade Now
            </Link>
          )}
          <button onClick={dismiss} className="p-1 hover:bg-white/20 rounded transition">
            <X size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}

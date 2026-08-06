import { useState, useEffect } from 'react'
import { X, Crown, Check } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useEntitlements } from '../lib/useEntitlement'
import { useAuth } from '../lib/AuthContext'

const TRIAL_DAYS = 7

export default function TrialBanner() {
  const [visible, setVisible] = useState(false)
  const [daysLeft, setDaysLeft] = useState(TRIAL_DAYS)
  const { plan, loading } = useEntitlements()
  const { isDemo } = useAuth()

  useEffect(() => {
    // Don't show trial banner for paid plans or demo users
    if (loading) return
    
    if (isDemo) {
      setVisible(false)
      return
    }

    // Check if user has a paid plan
    const paidPlans = ['starter', 'professional', 'enterprise']
    if (paidPlans.includes(plan)) {
      setVisible(false)
      return
    }

    // Check localStorage trial
    const trialStart = localStorage.getItem('avenize_trial_start')
    if (!trialStart) {
      localStorage.setItem('avenize_trial_start', Date.now().toString())
      setVisible(true)
    } else {
      const daysPassed = Math.floor((Date.now() - parseInt(trialStart)) / (1000 * 60 * 60 * 24))
      const remaining = TRIAL_DAYS - daysPassed
      setDaysLeft(Math.max(0, remaining))
      setVisible(remaining > 0)
    }
  }, [loading, plan, isDemo])

  const dismiss = () => setVisible(false)

  if (!visible) return null

  // Check if user has any paid features
  const hasPaidFeatures = plan !== 'free'

  return (
    <div className="fixed bottom-12 md:bottom-0 left-0 right-0 bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-3 px-4 z-40">
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
                <strong>{daysLeft} days left</strong> in your free trial • 
                Unlock all premium features!
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!hasPaidFeatures && (
            <Link
              to="/upgrade"
              className="px-4 py-1.5 bg-white text-indigo-600 text-sm font-medium rounded-lg hover:bg-white/90 transition"
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

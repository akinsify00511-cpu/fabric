import { useState, useEffect } from 'react'
import { X, Crown, Check, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useEntitlements } from '../lib/useEntitlement'
import { useAuth } from '../lib/AuthContext'
import { fetchTrialAssistance, type TrialNudge } from '../lib/businessOS'

export default function TrialBanner() {
  const [visible, setVisible] = useState(false)
  const [dismissedNudge, setDismissedNudge] = useState<string | null>(null)
  const { staff } = useAuth()
  const { plan, loading, trialDaysLeft, inTrial } = useEntitlements()
  const [nudge, setNudge] = useState<TrialNudge | null>(null)

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

  // P0 #16: load the autonomous trial nudge (the ONE message that best moves
  // this user toward value, based on their trial phase). Best-effort — stays
  // null if the RPC isn't deployed (falls back to the generic upgrade message).
  useEffect(() => {
    if (!staff?.business_id || !inTrial) return
    fetchTrialAssistance(staff.business_id).then(a => {
      const n = a?.nudge ?? null
      setNudge(n)
      // Reset the per-nudge dismissal when the nudge type changes (a new phase
      // = a new nudge the user should see).
      if (n && dismissedNudge !== n.type) setDismissedNudge(null)
    })
  }, [staff?.business_id, inTrial])

  const dismiss = () => setVisible(false)
  const dismissNudge = () => { if (nudge) setDismissedNudge(nudge.type) }

  if (!visible) return null

  const hasPaidFeatures = plan !== 'free'
  // Show the targeted nudge if available and not dismissed; otherwise the
  // generic trial countdown.
  const showNudge = nudge && dismissedNudge !== nudge.type

  return (
    <div className="fixed bottom-12 md:bottom-0 left-0 right-0 bg-gradient-to-r from-[#155BB4] to-[#0F3B86] text-white py-3 px-4 z-40">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 text-sm min-w-0">
          {showNudge ? (
            <>
              <Sparkles size={20} className="shrink-0" />
              <span className="truncate">
                <strong>{nudge!.headline}</strong>
                <span className="hidden sm:inline"> — {nudge!.body}</span>
              </span>
            </>
          ) : hasPaidFeatures ? (
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
        <div className="flex items-center gap-2 shrink-0">
          {showNudge ? (
            <>
              <Link
                to={nudge!.action_route}
                onClick={dismiss}
                className="px-4 py-1.5 bg-white text-[#155BB4] text-sm font-medium rounded-lg hover:bg-white/90 transition"
              >
                {nudge!.action_label}
              </Link>
              <button onClick={dismissNudge} className="p-1 hover:bg-white/20 rounded transition" aria-label="Dismiss nudge">
                <X size={16} />
              </button>
            </>
          ) : (
            <>
              {!hasPaidFeatures && (
                <Link
                  to="/app/subscription"
                  className="px-4 py-1.5 bg-white text-[#155BB4] text-sm font-medium rounded-lg hover:bg-white/90 transition"
                >
                  Upgrade Now
                </Link>
              )}
              <button onClick={dismiss} className="p-1 hover:bg-white/20 rounded transition" aria-label="Dismiss banner">
                <X size={16} />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

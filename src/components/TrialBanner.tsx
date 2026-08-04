import { useState, useEffect } from 'react'
import { X, Crown } from 'lucide-react'

const TRIAL_DAYS = 14

export default function TrialBanner() {
  const [visible, setVisible] = useState(false)
  const [daysLeft, setDaysLeft] = useState(TRIAL_DAYS)

  useEffect(() => {
    // Check if trial has been started
    const trialStart = localStorage.getItem('avenize_trial_start')
    if (!trialStart) {
      // Start new trial
      localStorage.setItem('avenize_trial_start', Date.now().toString())
      setVisible(true)
    } else {
      // Check days remaining
      const daysPassed = Math.floor((Date.now() - parseInt(trialStart)) / (1000 * 60 * 60 * 24))
      const remaining = TRIAL_DAYS - daysPassed
      setDaysLeft(Math.max(0, remaining))
      setVisible(remaining > 0)
    }
  }, [])

  const dismiss = () => {
    setVisible(false)
    localStorage.setItem('avenize_trial_dismissed', 'true')
  }

  if (!visible) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-2 px-4 z-40">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm">
          <Crown size={16} />
          <span>
            <strong>{daysLeft} days left</strong> in your free trial. Enjoy all premium features!
          </span>
        </div>
        <button
          onClick={dismiss}
          className="p-1 hover:bg-white/20 rounded transition"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  )
}

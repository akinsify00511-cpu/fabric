import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { supabase } from './supabase'
import AchievementToast, { useAchievementToasts } from '../components/AchievementToast'
import OnboardingTour from '../components/OnboardingTour'

type UserXP = {
  xp_total: number
  level: number
  streak_days: number
  longest_streak: number
}

type GamificationContextType = {
  xp: UserXP | null
  isOnboardingComplete: boolean
  showOnboarding: boolean
  completeOnboarding: () => void
  startOnboarding: () => void
  awardXP: (amount: number, action: string, description?: string) => Promise<void>
  checkAchievements: () => Promise<void>
  toasts: any[]
  dismissToast: (id: string) => void
}

const GamificationContext = createContext<GamificationContextType | undefined>(undefined)

export function GamificationProvider({ children }: { children: ReactNode }) {
  const [xp, setXp] = useState<UserXP | null>(null)
  const [isOnboardingComplete, setIsOnboardingComplete] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const { toasts, dismissToast, showAchievement } = useAchievementToasts()

  // Non-blocking XP loader - fires after session is ready
  useEffect(() => {
    let mounted = true

    const loadXP = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user?.id || !mounted) return

      // Fire and forget - don't block anything
      try {
        const { data } = await supabase
          .from('user_xp')
          .select('*')
          .eq('user_id', session.user.id)
          .single()

        if (mounted && data) {
          setXp(data as UserXP)
        }
      } catch {
        // XP is optional - silently fail
      }

      // Check onboarding progress separately
      try {
        const { data } = await supabase
          .from('onboarding_progress')
          .select('*')
          .eq('user_id', session.user.id)
          .single()
        
        if (mounted) {
          setIsOnboardingComplete(!!data)
        }
      } catch {
        // Onboarding is optional
      }
    }

    loadXP()

    return () => { mounted = false }
  }, [])

  const awardXP = async () => {
    // XP awarding is fire-and-forget
  }

  const checkAchievements = async () => {
    // Achievement checks are fire-and-forget
  }

  const completeOnboarding = () => setIsOnboardingComplete(true)
  const startOnboarding = () => setShowOnboarding(true)

  return (
    <GamificationContext.Provider value={{ 
      xp, 
      isOnboardingComplete, 
      showOnboarding, 
      completeOnboarding, 
      startOnboarding, 
      awardXP, 
      checkAchievements, 
      toasts, 
      dismissToast 
    }}>
      {children}
      <AchievementToast toasts={toasts} onDismiss={dismissToast} />
      {showOnboarding && !isOnboardingComplete && (
        <OnboardingTour 
          isOpen={showOnboarding} 
          onClose={() => setShowOnboarding(false)} 
          onComplete={completeOnboarding} 
        />
      )}
    </GamificationContext.Provider>
  )
}

export function useGamification() {
  const context = useContext(GamificationContext)
  if (!context) throw new Error('useGamification must be used within GamificationProvider')
  return context
}

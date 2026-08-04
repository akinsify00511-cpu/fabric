import { createContext, useContext, useState, ReactNode } from 'react'

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

// Stub toast system
const useAchievementToasts = () => ({
  toasts: [],
  dismissToast: () => {},
  showAchievement: () => {},
  showLevelUp: () => {},
  showStreak: () => {},
})

// Stub onboarding tour
const OnboardingTour = () => null

export function GamificationProvider({ children }: { children: ReactNode }) {
  const [isOnboardingComplete] = useState(true) // Always complete - disabled
  const [showOnboarding] = useState(false) // Never show
  const { toasts, dismissToast } = useAchievementToasts()

  const awardXP = async () => {
    // XP disabled - fire and forget
  }

  const checkAchievements = async () => {
    // Achievements disabled
  }

  const completeOnboarding = () => {}
  const startOnboarding = () => {}

  return (
    <GamificationContext.Provider value={{ 
      xp: null, 
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
    </GamificationContext.Provider>
  )
}

export function useGamification() {
  const context = useContext(GamificationContext)
  if (!context) throw new Error('useGamification must be used within GamificationProvider')
  return context
}

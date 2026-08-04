import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
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
  const [enabled, setEnabled] = useState(false) // Feature flag
  const { toasts, dismissToast, showAchievement, showLevelUp, showStreak } = useAchievementToasts()

  const getUserId = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    return user?.id || null
  }

  const awardXPInternal = async (userId: string, amount: number, action: string, description?: string) => {
    if (!enabled) return
    try {
      await supabase.from('xp_transactions').insert({ user_id: userId, amount, action, description })
      await supabase.rpc('add_xp', { p_user_id: userId, p_amount: amount })
    } catch (err) {
      // Silently fail if tables don't exist
      console.warn('XP features not available:', err)
    }
  }

  const loadXP = useCallback(async () => {
    const userId = await getUserId()
    if (!userId) return
    
    try {
      const { data, error } = await supabase.from('user_xp').select('*').eq('user_id', userId).single()
      
      // If table doesn't exist (404), disable gamification
      if (error?.code === 'PGRST116' || error?.code === '42P01') {
        console.warn('Gamification tables not found, disabling XP features')
        setEnabled(false)
        return
      }
      
      if (data) {
        setXp(data as UserXP)
        setEnabled(true)
      } else {
        // Try to create initial record
        try {
          await supabase.from('user_xp').insert({ 
            user_id: userId, 
            xp_total: 0, 
            level: 1, 
            streak_days: 0, 
            longest_streak: 0, 
            last_active_date: new Date().toISOString().split('T')[0] 
          })
          setXp({ xp_total: 0, level: 1, streak_days: 0, longest_streak: 0 })
          setEnabled(true)
        } catch (insertErr) {
          console.warn('Could not create XP record:', insertErr)
          setEnabled(false)
        }
      }
      
      const { data: onboardingData } = await supabase.from('onboarding_progress').select('*').eq('user_id', userId).single()
      setIsOnboardingComplete(!!onboardingData)
    } catch (err) {
      console.warn('Gamification load error, disabling features:', err)
      setEnabled(false)
    }
  }, [])

  useEffect(() => { loadXP() }, [loadXP])

  const awardXP = async (amount: number, action: string, description?: string) => {
    if (!enabled) return
    const userId = await getUserId()
    if (!userId) return
    await awardXPInternal(userId, amount, action, description)
    await loadXP()
  }

  const checkAchievements = async () => {
    if (!enabled) return
    const userId = await getUserId()
    if (!userId) return
    try {
      const { data } = await supabase.rpc('check_achievements', { p_user_id: userId })
      if (data?.new_achievements?.length > 0) {
        data.new_achievements.forEach((a: any) => showAchievement(a))
      }
    } catch (err) {
      // Silently fail if RPC doesn't exist
    }
  }

  const completeOnboarding = () => setIsOnboardingComplete(true)
  const startOnboarding = () => setShowOnboarding(true)

  return (
    <GamificationContext.Provider value={{ xp, isOnboardingComplete, showOnboarding, completeOnboarding, startOnboarding, awardXP, checkAchievements, toasts, dismissToast }}>
      {children}
      <AchievementToast toasts={toasts} onDismiss={dismissToast} />
      {showOnboarding && !isOnboardingComplete && <OnboardingTour isOpen={showOnboarding} onClose={() => setShowOnboarding(false)} onComplete={completeOnboarding} />}
    </GamificationContext.Provider>
  )
}

export function useGamification() {
  const context = useContext(GamificationContext)
  if (!context) throw new Error('useGamification must be used within GamificationProvider')
  return context
}

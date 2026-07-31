import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { supabase } from './supabase'
import { useAuth } from './AuthContext'
import AchievementToast, { Achievement, useAchievementToasts, LevelUp, StreakInfo } from '../components/AchievementToast'
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
  const { user, staff } = useAuth()
  const [xp, setXp] = useState<UserXP | null>(null)
  const [isOnboardingComplete, setIsOnboardingComplete] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const { toasts, dismissToast, showAchievement, showLevelUp, showStreak } = useAchievementToasts()

  // Load XP data
  const loadXP = useCallback(async () => {
    if (!user) return

    const { data } = await supabase
      .from('user_xp')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (data) {
      setXp(data as UserXP)
      // Check for streak update
      const today = new Date().toISOString().split('T')[0]
      if (data.last_active_date !== today) {
        const prevStreak = data.streak_days
        // Update streak
        await supabase.rpc('update_streak', { p_user_id: user.id })
        // Reload
        const { data: updated } = await supabase
          .from('user_xp')
          .select('*')
          .eq('user_id', user.id)
          .single()
        if (updated) {
          setXp(updated as UserXP)
          // Show streak notification
          if (updated.streak_days > 0 && updated.streak_days !== prevStreak) {
            showStreak(updated.streak_days)
          }
        }
      }
    } else {
      // First time - create record and show onboarding
      await supabase.from('user_xp').insert({
        user_id: user.id,
        xp_total: 0,
        level: 1,
        streak_days: 0,
        longest_streak: 0,
        last_active_date: new Date().toISOString().split('T')[0],
      })
      setXp({ xp_total: 0, level: 1, streak_days: 0, longest_streak: 0 })
      setShowOnboarding(true)
      // Award first login XP
      await awardXPInternal(user.id, 10, 'login', 'First login bonus')
    }

    // Check onboarding status
    const { data: onboardingData } = await supabase
      .from('onboarding_progress')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (!onboardingData) {
      await supabase.from('onboarding_progress').insert({
        user_id: user.id,
        current_step: 0,
        completed: false,
      })
    } else {
      setIsOnboardingComplete(onboardingData.completed)
      if (!onboardingData.completed && xp === null) {
        // Show onboarding for returning users who didn't complete
      }
    }
  }, [user])

  useEffect(() => {
    loadXP()
  }, [loadXP])

  // Award XP internal function
  const awardXPInternal = async (userId: string, amount: number, action: string, description?: string) => {
    const { data } = await supabase.rpc('award_xp', {
      p_user_id: userId,
      p_xp_amount: amount,
      p_action_type: action,
      p_description: description,
    })
    return data
  }

  // Award XP for current user
  const awardXP = useCallback(async (amount: number, action: string, description?: string) => {
    if (!user) return

    const prevLevel = xp?.level || 1
    await awardXPInternal(user.id, amount, action, description)

    // Reload XP
    const { data: updated } = await supabase
      .from('user_xp')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (updated) {
      const newLevel = (updated as UserXP).level
      setXp(updated as UserXP)

      // Check for level up
      if (newLevel > prevLevel) {
        showLevelUp(newLevel, (updated as UserXP).xp_total)
      }
    }
  }, [user, xp?.level])

  // Check and award achievements
  const checkAchievements = useCallback(async () => {
    if (!user) return

    const { data } = await supabase.rpc('check_achievements', { p_user_id: user.id })

    if (data && data.length > 0) {
      for (const achievement of data) {
        showAchievement(achievement as Achievement)
      }
      // Reload XP
      const { data: updated } = await supabase
        .from('user_xp')
        .select('*')
        .eq('user_id', user.id)
        .single()
      if (updated) setXp(updated as UserXP)
    }
  }, [user])

  const completeOnboarding = useCallback(async () => {
    if (!user) return
    await supabase
      .from('onboarding_progress')
      .update({ completed: true, completed_at: new Date().toISOString() })
      .eq('user_id', user.id)
    setIsOnboardingComplete(true)
    setShowOnboarding(false)
  }, [user])

  const startOnboarding = useCallback(() => {
    setShowOnboarding(true)
  }, [])

  return (
    <GamificationContext.Provider
      value={{
        xp,
        isOnboardingComplete,
        showOnboarding,
        completeOnboarding,
        startOnboarding,
        awardXP,
        checkAchievements,
        toasts,
        dismissToast,
      }}
    >
      {children}
      <AchievementToast toasts={toasts} onDismiss={dismissToast} />
      <OnboardingTour
        isOpen={showOnboarding}
        onClose={() => setShowOnboarding(false)}
        onComplete={completeOnboarding}
      />
    </GamificationContext.Provider>
  )
}

export function useGamification() {
  const context = useContext(GamificationContext)
  if (context === undefined) {
    throw new Error('useGamification must be used within a GamificationProvider')
  }
  return context
}

// Hook to award XP for specific actions
export function useXPActions() {
  const { awardXP, checkAchievements } = useGamification()

  return {
    onLogin: async () => {
      await awardXP(10, 'login', 'Daily login bonus')
    },
    onCreateDeal: async () => {
      await awardXP(15, 'create_deal', 'Created a deal')
      await checkAchievements()
    },
    onWonDeal: async (value: number) => {
      const xp = Math.min(Math.floor(value / 10), 100)
      await awardXP(Math.max(xp, 25), 'deal_won', 'Won a deal')
      await checkAchievements()
    },
    onCompleteTask: async () => {
      await awardXP(10, 'task_complete', 'Completed a task')
      await checkAchievements()
    },
    onCreateTask: async () => {
      await awardXP(5, 'create_task', 'Created a task')
    },
    onSendMessage: async () => {
      await awardXP(2, 'send_message', 'Sent a chat message')
    },
    onCreateInvoice: async () => {
      await awardXP(15, 'create_invoice', 'Created an invoice')
    },
    onInvoicePaid: async () => {
      await awardXP(25, 'invoice_paid', 'Invoice was paid')
      await checkAchievements()
    },
    onCreateDocument: async () => {
      await awardXP(10, 'create_doc', 'Created a document')
      await checkAchievements()
    },
    onInviteTeam: async () => {
      await awardXP(40, 'invite_team', 'Invited a team member')
      await checkAchievements()
    },
  }
}

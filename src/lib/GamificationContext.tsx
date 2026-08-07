import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { supabase } from './supabase'

type UserXP = {
  xp_total: number
  level: number
  streak_days: number
  longest_streak: number
  last_active_date: string | null
}

type Achievement = {
  id: string
  name: string
  description: string
  icon: string
  xp_reward: number
  unlocked_at: string | null
  progress: number
  target: number
}

type Suggestion = {
  id: string
  title: string
  description: string
  action_url: string
  action_label: string
  icon: string
  category: string
  priority: 'high' | 'medium' | 'low'
}

type Toast = {
  id: string
  type: 'achievement' | 'level_up' | 'streak' | 'tip'
  title: string
  message: string
  icon: string
  xp_reward?: number
}

type GamificationContextType = {
  xp: UserXP | null
  achievements: Achievement[]
  suggestions: Suggestion[]
  isOnboardingComplete: boolean
  showOnboarding: boolean
  completeOnboarding: () => void
  startOnboarding: () => void
  awardXP: (amount: number, action: string, description?: string) => Promise<void>
  checkAchievements: () => Promise<void>
  refreshSuggestions: () => Promise<void>
  toasts: Toast[]
  dismissToast: (id: string) => void
  userInsights: UserInsights | null
}

const GamificationContext = createContext<GamificationContextType | undefined>(undefined)

// XP Configuration
const LEVEL_THRESHOLDS = [0, 100, 300, 600, 1000, 1500, 2100, 2800, 3600, 4500, 5500, 6600, 7800, 9100, 10500]
const STREAK_BONUS_XP = 10

export function calculateLevel(xp: number): number {
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (xp >= LEVEL_THRESHOLDS[i]) return i + 1
  }
  return 1
}

export function getXPForNextLevel(level: number): number {
  if (level >= LEVEL_THRESHOLDS.length) return LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1]
  return LEVEL_THRESHOLDS[level]
}

// Achievements
export const ACHIEVEMENTS = [
  { id: 'first_login', name: 'Welcome!', description: 'Logged in for the first time', icon: '👋', xp_reward: 10, target: 1 },
  { id: 'profile_complete', name: 'Complete Profile', description: 'Added your profile photo and bio', icon: '📝', xp_reward: 25, target: 1 },
  { id: 'first_deal', name: 'First Blood', description: 'Created your first deal', icon: '🎯', xp_reward: 50, target: 1 },
  { id: 'deal_won_5', name: 'Deal Closer', description: 'Won 5 deals', icon: '💰', xp_reward: 100, target: 5 },
  { id: 'deal_won_25', name: 'Sales Star', description: 'Won 25 deals', icon: '⭐', xp_reward: 250, target: 25 },
  { id: 'deal_won_100', name: 'Sales Legend', description: 'Won 100 deals', icon: '🏆', xp_reward: 500, target: 100 },
  { id: 'first_task', name: 'Task Initiator', description: 'Created your first task', icon: '✅', xp_reward: 15, target: 1 },
  { id: 'tasks_completed_10', name: 'Task Master', description: 'Completed 10 tasks', icon: '🎯', xp_reward: 75, target: 10 },
  { id: 'tasks_completed_50', name: 'Productivity Pro', description: 'Completed 50 tasks', icon: '🚀', xp_reward: 150, target: 50 },
  { id: 'streak_3', name: 'Getting Started', description: 'Used the app 3 days in a row', icon: '🔥', xp_reward: 30, target: 3 },
  { id: 'streak_7', name: 'Week Warrior', description: 'Used the app 7 days in a row', icon: '💪', xp_reward: 70, target: 7 },
  { id: 'streak_30', name: 'Monthly Champion', description: 'Used the app 30 days in a row', icon: '🏅', xp_reward: 300, target: 30 },
  { id: 'first_invoice', name: 'Billing Basics', description: 'Created your first invoice', icon: '📄', xp_reward: 30, target: 1 },
  { id: 'invoice_paid_10', name: 'Cash Flow Pro', description: 'Received payment on 10 invoices', icon: '💵', xp_reward: 100, target: 10 },
  { id: 'first_staff', name: 'Team Builder', description: 'Added your first team member', icon: '👥', xp_reward: 40, target: 1 },
  { id: 'staff_5', name: 'Growing Team', description: 'Added 5 team members', icon: '🎉', xp_reward: 100, target: 5 },
  { id: 'use_all_modules', name: 'Power User', description: 'Used all 5 core modules', icon: '⚡', xp_reward: 200, target: 5 },
  { id: 'quick_learner', name: 'Quick Learner', description: 'Completed onboarding in 3 steps', icon: '📚', xp_reward: 50, target: 1 },
  { id: 'onboarding_complete', name: 'Onboarding Champion', description: 'Completed the onboarding tour', icon: '🎓', xp_reward: 100, target: 1 },
]

// Suggestions based on usage patterns
export const SUGGESTIONS = [
  { id: 'explore_crm', title: 'Try the CRM Pipeline', description: 'Visualize your deals in a pipeline view', action_url: '/app/crm?view=pipeline', action_label: 'Open CRM', icon: '📊', category: 'crm', priority: 'high' as const },
  { id: 'add_task', title: 'Create a Task', description: 'Stay organized by adding tasks', action_url: '/app/tasks?new=true', action_label: 'Add Task', icon: '✅', category: 'tasks', priority: 'high' as const },
  { id: 'invite_team', title: 'Invite Team Members', description: 'Collaborate with your team', action_url: '/app/people?invite=true', action_label: 'Invite', icon: '👥', category: 'team', priority: 'medium' as const },
  { id: 'create_invoice', title: 'Create an Invoice', description: 'Send your first invoice', action_url: '/app/finance?new=invoice', action_label: 'Create', icon: '📄', category: 'finance', priority: 'medium' as const },
  { id: 'setup_automation', title: 'Automate Your Workflow', description: 'Save time with automations', action_url: '/app/automations?new=true', action_label: 'Set Up', icon: '⚡', category: 'automation', priority: 'medium' as const },
  { id: 'explore_reports', title: 'View Reports', description: 'Get insights on your business', action_url: '/app/reports', action_label: 'View', icon: '📈', category: 'reports', priority: 'low' as const },
  { id: 'customize_branding', title: 'Add Your Branding', description: 'Make it yours with custom branding', action_url: '/app/branding', action_label: 'Customize', icon: '🎨', category: 'branding', priority: 'low' as const },
]

type UserInsights = {
  mostActiveHour: number
  favoriteModule: string
  tasksCompletedThisWeek: number
  dealsWonThisMonth: number
  productivityScore: number
}

export function GamificationProvider({ children }: { children: ReactNode }) {
  const [xp, setXP] = useState<UserXP | null>(null)
  const [achievements, setAchievements] = useState<Achievement[]>([])
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [toasts, setToasts] = useState<Toast[]>([])
  const [isOnboardingComplete] = useState(true)
  const [showOnboarding] = useState(false)
  const [userInsights, setUserInsights] = useState<UserInsights | null>(null)

  // Load user data on mount
  useEffect(() => {
    loadUserData()
  }, [])

  async function loadUserData() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Load XP data
      const { data: xpData } = await supabase
        .from('user_xp')
        .select('*')
        .eq('user_id', user.id)
        .single()

      if (xpData) {
        setXP({
          xp_total: xpData.xp_total || 0,
          level: calculateLevel(xpData.xp_total || 0),
          streak_days: xpData.streak_days || 0,
          longest_streak: xpData.longest_streak || 0,
          last_active_date: xpData.last_active_date,
        })
      } else {
        await supabase.from('user_xp').insert({
          user_id: user.id,
          xp_total: 0,
          streak_days: 0,
          longest_streak: 0,
        })
      }

      // Load achievements
      const { data: achievementData } = await supabase
        .from('user_achievements')
        .select('*')
        .eq('user_id', user.id)

      const userAchievements = ACHIEVEMENTS.map(ach => {
        const userAch = achievementData?.find((u: any) => u.achievement_id === ach.id)
        return {
          ...ach,
          unlocked_at: userAch?.unlocked_at || null,
          progress: userAch?.progress || 0,
        }
      })

      setAchievements(userAchievements)

      // Generate suggestions
      generateSuggestions(userAchievements)

      // Calculate insights
      calculateInsights()

    } catch (error: any) {
      // Silently handle missing tables - gamification is optional
      if (error?.code && ['PGRST116', '404', '406', '42501'].includes(error.code)) {
        // Table doesn't exist or RLS issue - skip gamification
        setXP({ xp_total: 0, level: 1, streak_days: 0, longest_streak: 0, last_active_date: null })
        setAchievements(ACHIEVEMENTS.map(a => ({ ...a, unlocked_at: null, progress: 0 })))
        return
      }
      console.warn('Gamification not available:', error?.message)
    }
  }

  function generateSuggestions(userAchievements: Achievement[]) {
    const unlockedIds = userAchievements
      .filter(a => a.unlocked_at)
      .map(a => a.id)

    const suggestionMap: Record<string, number> = {
      'first_deal': 0,
      'deal_won_5': 1,
      'first_task': 2,
      'tasks_completed_10': 2,
      'first_staff': 3,
      'staff_5': 3,
      'first_invoice': 4,
      'invoice_paid_10': 4,
      'use_all_modules': 5,
      'onboarding_complete': 6,
    }

    const recommendedSuggestions = unlockedIds
      .map(id => suggestionMap[id])
      .filter(index => index !== undefined && index < SUGGESTIONS.length)
      .map(index => SUGGESTIONS[index])
      .slice(0, 3)

    const defaultSuggestions = SUGGESTIONS.slice(0, 3)
    const combined = [...new Set([...recommendedSuggestions, ...defaultSuggestions])].slice(0, 4)

    setSuggestions(combined)
  }

  async function calculateInsights() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: events } = await supabase
        .from('analytics_events')
        .select('*')
        .eq('user_id', user.id)
        .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())

      const hourCounts: Record<number, number> = {}
      events?.forEach((e: any) => {
        const hour = new Date(e.created_at).getHours()
        hourCounts[hour] = (hourCounts[hour] || 0) + 1
      })
      const mostActiveHour = Object.entries(hourCounts)
        .sort(([, a], [, b]) => b - a)[0]?.[0] || 9

      const productivityScore = Math.min(100, (events?.length || 0) * 2)

      setUserInsights({
        mostActiveHour: parseInt(String(mostActiveHour)),
        favoriteModule: 'crm',
        tasksCompletedThisWeek: events?.filter((e: any) => e.category === 'task').length || 0,
        dealsWonThisMonth: events?.filter((e: any) => e.event_name?.includes('won')).length || 0,
        productivityScore,
      })
    } catch (error) {
      console.error('Failed to calculate insights:', error)
    }
  }

  async function awardXP(amount: number, action: string, description?: string) {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: xpData } = await supabase
        .from('user_xp')
        .select('xp_total, streak_days, longest_streak, last_active_date')
        .eq('user_id', user.id)
        .single()

      const currentXP = xpData?.xp_total || 0
      const newXP = currentXP + amount

      const today = new Date().toISOString().split('T')[0]
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      
      let newStreak = xpData?.streak_days || 0
      let longestStreak = xpData?.longest_streak || 0

      if (xpData?.last_active_date !== today) {
        if (xpData?.last_active_date === yesterday) {
          newStreak += 1
        } else {
          newStreak = 1
        }
        longestStreak = Math.max(longestStreak, newStreak)
      }

      await supabase
        .from('user_xp')
        .update({
          xp_total: newXP,
          streak_days: newStreak,
          longest_streak: longestStreak,
          last_active_date: today,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id)

      setXP({
        xp_total: newXP,
        level: calculateLevel(newXP),
        streak_days: newStreak,
        longest_streak: longestStreak,
        last_active_date: today,
      })

      const oldLevel = calculateLevel(currentXP)
      const newLevel = calculateLevel(newXP)
      if (newLevel > oldLevel) {
        showToast({
          id: `level-${Date.now()}`,
          type: 'level_up',
          title: 'Level Up! 🎉',
          message: `You reached level ${newLevel}!`,
          icon: '⬆️',
          xp_reward: newXP,
        })
      }

      await supabase.from('xp_history').insert({
        user_id: user.id,
        amount,
        action,
        description,
      })

    } catch (error) {
      console.error('Failed to award XP:', error)
    }
  }

  async function checkAchievements() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      for (const achievement of ACHIEVEMENTS) {
        const isUnlocked = achievements.find(a => a.id === achievement.id && a.unlocked_at)
        if (isUnlocked) continue

        let progress = 0
        let shouldUnlock = false

        switch (achievement.id) {
          case 'first_login':
            progress = 1
            shouldUnlock = true
            break
          case 'streak_3':
            progress = xp?.streak_days || 0
            shouldUnlock = progress >= 3
            break
          case 'streak_7':
            progress = xp?.streak_days || 0
            shouldUnlock = progress >= 7
            break
          case 'streak_30':
            progress = xp?.streak_days || 0
            shouldUnlock = progress >= 30
            break
          default:
            const { data: events } = await supabase
              .from('analytics_events')
              .select('event_name, action')
              .eq('user_id', user.id)
              .eq('action', achievement.id)

            progress = events?.length || 0
            shouldUnlock = progress >= achievement.target
        }

        if (shouldUnlock) {
          await supabase.from('user_achievements').upsert({
            user_id: user.id,
            achievement_id: achievement.id,
            progress: achievement.target,
            unlocked_at: new Date().toISOString(),
          })

          await awardXP(achievement.xp_reward, 'achievement', achievement.name)

          showToast({
            id: `ach-${achievement.id}`,
            type: 'achievement',
            title: 'Achievement Unlocked! 🏆',
            message: achievement.name,
            icon: achievement.icon,
            xp_reward: achievement.xp_reward,
          })

          setAchievements(prev => prev.map(a => 
            a.id === achievement.id 
              ? { ...a, unlocked_at: new Date().toISOString(), progress: achievement.target }
              : a
          ))
        }
      }
    } catch (error) {
      console.error('Failed to check achievements:', error)
    }
  }

  function showToast(toast: Toast) {
    setToasts(prev => [...prev, toast])
    setTimeout(() => {
      dismissToast(toast.id)
    }, 5000)
  }

  function dismissToast(id: string) {
    setToasts(prev => prev.filter(t => t.id !== id))
  }

  const refreshSuggestions = useCallback(async () => {
    generateSuggestions(achievements)
  }, [achievements])

  const completeOnboarding = () => {}
  const startOnboarding = () => {}

  return (
    <GamificationContext.Provider value={{ 
      xp, 
      achievements,
      suggestions,
      isOnboardingComplete, 
      showOnboarding, 
      completeOnboarding, 
      startOnboarding, 
      awardXP, 
      checkAchievements,
      refreshSuggestions,
      toasts, 
      dismissToast,
      userInsights,
    }}>
      {children}
    </GamificationContext.Provider>
  )
}

export function useGamification() {
  const context = useContext(GamificationContext)
  if (!context) throw new Error('useGamification must be used within a GamificationProvider')
  return context
}

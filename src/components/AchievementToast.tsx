import { useState, useEffect, useCallback } from 'react'
import { X, Trophy, Star, Zap, Flame, Gift } from 'lucide-react'

export type Achievement = {
  id: string
  key: string
  name: string
  description: string
  icon: string
  xp_reward: number
  rarity: 'common' | 'rare' | 'epic' | 'legendary'
}

export type LevelUp = {
  newLevel: number
  xpTotal: number
}

export type StreakInfo = {
  days: number
  isNew: boolean
}

type Toast = {
  id: string
  type: 'achievement' | 'levelup' | 'streak' | 'daily_challenge' | 'tip'
  title: string
  message: string
  icon?: string
  xp?: number
  rarity?: string
  duration?: number
}

const RARITY_COLORS = {
  common: { bg: 'bg-white', border: 'border-black', text: 'text-black', glow: '' },
  rare: { bg: 'bg-blue-50', border: 'border-blue-300', text: 'text-blue-800', glow: 'shadow-blue-200' },
  epic: { bg: 'bg-purple-50', border: 'border-purple-300', text: 'text-purple-800', glow: 'shadow-purple-200' },
  legendary: { bg: 'bg-amber-50', border: 'border-amber-400', text: 'text-amber-800', glow: 'shadow-amber-300' },
}

interface AchievementToastProps {
  toasts: Toast[]
  onDismiss: (id: string) => void
}

export default function AchievementToast({ toasts, onDismiss }: AchievementToastProps) {
  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  )
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const [isVisible, setIsVisible] = useState(false)
  const [isLeaving, setIsLeaving] = useState(false)
  const duration = toast.duration || 5000

  useEffect(() => {
    // Animate in
    requestAnimationFrame(() => setIsVisible(true))

    // Auto dismiss
    const timer = setTimeout(() => {
      setIsLeaving(true)
      setTimeout(() => onDismiss(toast.id), 300)
    }, duration)

    return () => clearTimeout(timer)
  }, [toast.id, duration, onDismiss])

  const getIcon = () => {
    if (toast.icon) return <span className="text-3xl">{toast.icon}</span>
    switch (toast.type) {
      case 'achievement':
        return <Trophy className="w-6 h-6 text-amber-500" />
      case 'levelup':
        return <Zap className="w-6 h-6 text-purple-500" />
      case 'streak':
        return <Flame className="w-6 h-6 text-orange-500" />
      case 'daily_challenge':
        return <Gift className="w-6 h-6 text-green-500" />
      default:
        return <Star className="w-6 h-6 text-yellow-500" />
    }
  }

  const getRarityStyle = () => {
    if (toast.type === 'achievement' && toast.rarity) {
      return RARITY_COLORS[toast.rarity as keyof typeof RARITY_COLORS] || RARITY_COLORS.common
    }
    return RARITY_COLORS.common
  }

  const style = getRarityStyle()

  return (
    <div
      className={`
        pointer-events-auto
        w-80 rounded-2xl border-2 p-4 shadow-lg
        transition-all duration-300 ease-out
        ${style.bg} ${style.border}
        ${isVisible && !isLeaving ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'}
        ${style.glow ? `shadow-lg ${style.glow}` : ''}
      `}
    >
      <div className="flex items-start gap-3">
        <div className={`
          w-12 h-12 rounded-xl flex items-center justify-center shrink-0
          ${toast.type === 'levelup' ? 'bg-purple-100' : toast.type === 'streak' ? 'bg-orange-100' : toast.type === 'daily_challenge' ? 'bg-green-100' : 'bg-amber-100'}
        `}>
          {getIcon()}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-bold ${style.text}`}>{toast.title}</p>
          <p className="text-xs text-black/60 mt-0.5 line-clamp-2">{toast.message}</p>
          {toast.xp && (
            <div className="flex items-center gap-1 mt-1">
              <Zap size={12} className="text-yellow-500" />
              <span className="text-xs font-medium text-yellow-600">+{toast.xp} XP</span>
            </div>
          )}
        </div>
        <button
          onClick={() => {
            setIsLeaving(true)
            setTimeout(() => onDismiss(toast.id), 300)
          }}
          className="p-1 hover:bg-black/10 rounded-lg transition-colors"
        >
          <X size={16} className="text-black" />
        </button>
      </div>

      {/* Progress bar for auto-dismiss */}
      <div className="mt-3 h-1 bg-black/10 rounded-full overflow-hidden">
        <div
          className={`h-full ${style.text.replace('text-', 'bg-')} transition-all duration-[50ms]`}
          style={{ width: '100%', animation: `shrink ${duration}ms linear forwards` }}
        />
      </div>

      <style>{`
        @keyframes shrink {
          from { width: 100% }
          to { width: 0% }
        }
      `}</style>
    </div>
  )
}

// Hook to manage achievement toasts
export function useAchievementToasts() {
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).substring(2, 9)
    setToasts((prev) => [...prev, { ...toast, id }])
    return id
  }, [])

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const showAchievement = useCallback((achievement: Achievement) => {
    addToast({
      type: 'achievement',
      title: 'Achievement Unlocked! 🎉',
      message: `${achievement.name}: ${achievement.description}`,
      icon: achievement.icon,
      xp: achievement.xp_reward,
      rarity: achievement.rarity,
    })
  }, [addToast])

  const showLevelUp = useCallback((level: number, xp: number) => {
    addToast({
      type: 'levelup',
      title: 'Level Up! ⬆️',
      message: `You're now Level ${level}! Keep going!`,
      xp: 0,
    })
  }, [addToast])

  const showStreak = useCallback((days: number) => {
    const messages: Record<number, string> = {
      3: 'Keep the momentum going!',
      7: 'A whole week! Amazing!',
      14: 'Two weeks strong!',
      30: 'LEGENDARY streak! 🏆',
    }
    addToast({
      type: 'streak',
      title: `${days}-Day Streak! 🔥`,
      message: messages[days] || "You're on fire!",
      xp: days * 5,
    })
  }, [addToast])

  const showDailyChallenge = useCallback((title: string, xp: number) => {
    addToast({
      type: 'daily_challenge',
      title: 'Challenge Complete! ✅',
      message: title,
      xp,
    })
  }, [addToast])

  return {
    toasts,
    addToast,
    dismissToast,
    showAchievement,
    showLevelUp,
    showStreak,
    showDailyChallenge,
  }
}

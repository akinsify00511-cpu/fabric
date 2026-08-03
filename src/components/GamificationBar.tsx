import { useState, useEffect } from 'react'
import { Zap, Flame, Trophy, ChevronDown, Star, Target, TrendingUp } from 'lucide-react'
import { supabase } from '../lib/supabase'

type UserXP = {
  xp_total: number
  level: number
  streak_days: number
}

type DailyChallenge = {
  id: string
  title: string
  description: string
  target_count: number
  progress: number
  xp_reward: number
  completed: boolean
}

type Achievement = {
  id: string
  key: string
  name: string
  icon: string
  unlocked_at: string
}

export default function GamificationBar({ userId }: { userId: string }) {
  const [xp, setXp] = useState<UserXP | null>(null)
  const [challenges, setChallenges] = useState<DailyChallenge[]>([])
  const [recentAchievements, setRecentAchievements] = useState<Achievement[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [loading, setLoading] = useState(true)

  // Calculate XP needed for next level
  const xpForNextLevel = Math.pow(xp?.level || 1, 2) * 10
  const xpProgress = xp ? ((xp.xp_total % xpForNextLevel) / xpForNextLevel) * 100 : 0

  const loadGamification = async () => {
    if (!userId) return
    setLoading(true)

    // Load XP data
    const { data: xpData } = await supabase
      .from('user_xp')
      .select('xp_total, level, streak_days')
      .eq('user_id', userId)
      .single()

    if (xpData) {
      setXp(xpData as UserXP)
    } else {
      // Create initial XP record
      await supabase.from('user_xp').insert({
        user_id: userId,
        xp_total: 0,
        level: 1,
        streak_days: 0,
      })
    }

    // Load daily challenges
    const { data: challengesData } = await supabase
      .from('daily_challenges')
      .select('*, challenge_completions(*)')
      .eq('challenge_date', new Date().toISOString().split('T')[0])

    // Load recent achievements
    const { data: achievementsData } = await supabase
      .from('user_achievements')
      .select('*, achievements(*)')
      .eq('user_id', userId)
      .order('unlocked_at', { ascending: false })
      .limit(5)

    setChallenges(
      ((challengesData as any[]) || []).map((c) => ({
        id: c.id,
        title: c.title,
        description: c.description,
        target_count: c.target_count,
        progress: c.challenge_completions?.[0]?.progress || 0,
        completed: c.challenge_completions?.[0]?.completed || false,
        xp_reward: c.xp_reward,
      }))
    )
    setRecentAchievements(
      ((achievementsData as any[]) || []).map((a) => ({
        id: a.id,
        key: a.achievements?.key,
        name: a.achievements?.name,
        icon: a.achievements?.icon,
        unlocked_at: a.unlocked_at,
      }))
    )
    setLoading(false)
  }

  useEffect(() => {
    loadGamification()
  }, [userId])

  if (loading || !xp) return null

  return (
    <div className="relative">
      {/* Gamification Bar */}
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white border border-black/[0.06] hover:bg-black/[0.02] transition-colors"
      >
        {/* Level Badge */}
        <div className="flex items-center gap-1.5">
          <div className="w-7 h-7 rounded-lg avenize-gradient flex items-center justify-center">
            <Star size={14} className="text-white" />
          </div>
          <span className="text-sm font-bold text-[var(--avenize-black)]">Lv.{xp.level}</span>
        </div>

        {/* XP Progress Bar */}
        <div className="w-20 h-1.5 bg-black/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-yellow-400 rounded-full transition-all duration-300"
            style={{ width: `${xpProgress}%` }}
          />
        </div>

        {/* XP Count */}
        <div className="flex items-center gap-0.5">
          <Zap size={14} className="text-yellow-500" />
          <span className="text-xs font-medium text-yellow-600">{xp.xp_total}</span>
        </div>

        {/* Streak */}
        {xp.streak_days > 0 && (
          <div className="flex items-center gap-0.5 pl-2 border-l border-black/10">
            <Flame size={14} className={xp.streak_days >= 7 ? 'text-orange-500' : 'text-black/40'} />
            <span className={`text-xs font-medium ${xp.streak_days >= 7 ? 'text-orange-500' : 'text-black/50'}`}>
              {xp.streak_days}
            </span>
          </div>
        )}

        <ChevronDown size={14} className="text-black/30" />
      </button>

      {/* Dropdown */}
      {showDropdown && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowDropdown(false)} />
          <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-2xl shadow-xl border border-black/[0.06] z-50 overflow-hidden">
            {/* Header */}
            <div className="p-4 avenize-gradient">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
                  <Star size={24} className="text-white" />
                </div>
                <div>
                  <p className="text-white font-bold">Level {xp.level}</p>
                  <p className="text-white/80 text-sm">{xp.xp_total} XP earned</p>
                </div>
              </div>
              <div className="mt-3 h-2 bg-white/20 rounded-full overflow-hidden">
                <div
                  className="h-full bg-white rounded-full"
                  style={{ width: `${xpProgress}%` }}
                />
              </div>
              <p className="text-white/60 text-xs mt-1">
                {xpForNextLevel - (xp.xp_total % xpForNextLevel)} XP to Level {xp.level + 1}
              </p>
            </div>

            {/* Streak */}
            <div className="p-4 border-b border-black/[0.06]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Flame size={20} className={xp.streak_days >= 7 ? 'text-orange-500' : 'text-black/30'} />
                  <div>
                    <p className="text-sm font-medium">{xp.streak_days}-Day Streak</p>
                    <p className="text-xs text-black/50">Keep it going!</p>
                  </div>
                </div>
                {xp.streak_days >= 7 ? (
                  <span className="text-xs px-2 py-1 bg-orange-100 text-orange-600 rounded-full">🔥 On Fire</span>
                ) : xp.streak_days > 0 ? (
                  <span className="text-xs px-2 py-1 bg-black/5 text-black/50 rounded-full">Building...</span>
                ) : (
                  <span className="text-xs px-2 py-1 bg-black/5 text-black/50 rounded-full">Start today!</span>
                )}
              </div>
            </div>

            {/* Daily Challenges */}
            {challenges.length > 0 && (
              <div className="p-4 border-b border-black/[0.06]">
                <div className="flex items-center gap-2 mb-3">
                  <Target size={16} className="text-green-500" />
                  <p className="text-sm font-medium">Daily Challenges</p>
                </div>
                <div className="space-y-2">
                  {challenges.map((challenge) => (
                    <div
                      key={challenge.id}
                      className={`p-3 rounded-xl ${challenge.completed ? 'bg-green-50' : 'bg-black/[0.02]'}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {challenge.completed ? (
                            <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            </div>
                          ) : (
                            <div className="w-5 h-5 rounded-full border-2 border-black/20" />
                          )}
                          <span className="text-sm">{challenge.title}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Zap size={12} className="text-yellow-500" />
                          <span className="text-xs font-medium">{challenge.xp_reward}</span>
                        </div>
                      </div>
                      {!challenge.completed && (
                        <div className="mt-2 h-1 bg-black/10 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-green-500 rounded-full"
                            style={{ width: `${(challenge.progress / challenge.target_count) * 100}%` }}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recent Achievements */}
            {recentAchievements.length > 0 && (
              <div className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Trophy size={16} className="text-amber-500" />
                  <p className="text-sm font-medium">Recent Achievements</p>
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {recentAchievements.map((achievement) => (
                    <div
                      key={achievement.id}
                      className="shrink-0 w-12 h-12 rounded-xl bg-amber-50 flex flex-col items-center justify-center border border-amber-200"
                      title={achievement.name}
                    >
                      <span className="text-xl">{achievement.icon}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

import { useState, useEffect } from 'react'
import { 
  Sparkles, TrendingUp, Clock, Target, Award, 
  Zap, BookOpen, ChevronRight, X, Star, Crown,
  Flame, Rocket, Lightbulb, Heart, ThumbsUp
} from 'lucide-react'
import { useAuth } from '../lib/AuthContext'
import { useEngagement, useLearningInsights, useAnalytics } from '../lib/eventTracker'

export default function PersonalizationHub() {
  const { staff } = useAuth()
  const { achievements, progress } = useEngagement(staff?.user_id || '')
  const insights = useLearningInsights(staff?.user_id || '')
  const { engagement } = useAnalytics()
  const [dismissed, setDismissed] = useState(false)
  const [activeSuggestion, setActiveSuggestion] = useState(0)

  // Show suggestion after some time
  const [showSuggestion, setShowSuggestion] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setShowSuggestion(true), 30000)
    return () => clearTimeout(timer)
  }, [])

  if (dismissed || !showSuggestion || insights.suggestions.length === 0) return null

  const suggestion = insights.suggestions[activeSuggestion]

  return (
    <div className="fixed bottom-24 right-4 z-40 w-80 bg-white rounded-2xl shadow-2xl border border-black/[0.06] overflow-hidden animate-in slide-in-from-bottom">
      {/* Header */}
      <div className="bg-gradient-to-r from-[var(--av-primary, #0891B2)] to-purple-500 p-4 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lightbulb size={18} />
            <span className="font-semibold">Just for You</span>
          </div>
          <button onClick={() => setDismissed(true)} className="hover:bg-white/20 rounded p-1">
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
            <Sparkles size={24} className="text-amber-500" />
          </div>
          <div>
            <p className="text-sm font-medium mb-1">Based on your activity</p>
            <p className="text-sm text-black/60">{suggestion}</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={() => {
              insights.suggestionAccepted()
              engagement('suggestion_accepted', { suggestion })
              setDismissed(true)
            }}
            className="flex-1 py-2 rounded-lg bg-[var(--av-primary, #0891B2)] text-white text-sm font-medium"
          >
            Try it
          </button>
          <button
            onClick={() => {
              insights.recordFeedback('negative', suggestion)
              setActiveSuggestion((prev) => (prev + 1) % insights.suggestions.length)
            }}
            className="px-4 py-2 rounded-lg border border-black/10 text-sm"
          >
            Not now
          </button>
        </div>

        {/* More suggestions indicator */}
        {insights.suggestions.length > 1 && (
          <div className="flex justify-center gap-1 mt-3">
            {insights.suggestions.map((_, i) => (
              <button
                key={i}
                onClick={() => setActiveSuggestion(i)}
                className={`w-2 h-2 rounded-full transition ${
                  i === activeSuggestion ? 'bg-[var(--av-primary, #0891B2)]' : 'bg-black/20'
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================
// User Insights Panel
// ============================================

export function UserInsightsPanel() {
  const { staff } = useAuth()
  const insights = useLearningInsights(staff?.user_id || '')
  const { achievements, progress } = useEngagement(staff?.user_id || '')

  return (
    <div className="space-y-6">
      {/* Engagement Score */}
      <div className="bg-gradient-to-br from-[var(--av-primary, #0891B2)] to-purple-600 rounded-2xl p-6 text-white">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Crown size={20} />
            <span className="font-semibold">Your Level</span>
          </div>
          <div className="text-3xl font-bold">Lv. {progress.level}</div>
        </div>
        
        <div className="mb-2">
          <div className="flex justify-between text-sm mb-1">
            <span>{progress.points} points</span>
            <span>{progress.nextLevelAt} to next</span>
          </div>
          <div className="h-3 bg-white/20 rounded-full overflow-hidden">
            <div 
              className="h-full bg-white rounded-full transition-all"
              style={{ width: `${(progress.points % 100)}%` }}
            />
          </div>
        </div>

        <p className="text-sm text-white/70">
          Keep using the app to level up!
        </p>
      </div>

      {/* Your Insights */}
      <div className="bg-white rounded-2xl border border-black/[0.06] p-6">
        <h3 className="font-semibold mb-4">Your Insights</h3>
        
        <div className="space-y-4">
          <InsightRow
            icon={<Clock size={16} />}
            label="Most Active"
            value={insights.preferredTime.charAt(0).toUpperCase() + insights.preferredTime.slice(1)}
          />
          <InsightRow
            icon={<Zap size={16} />}
            label="Work Style"
            value={insights.workStyle.replace('_', ' ').charAt(0).toUpperCase() + insights.workStyle.slice(1)}
          />
          <InsightRow
            icon={<Star size={16} />}
            label="Top Features"
            value={insights.mostUsedFeatures.slice(0, 3).join(', ') || 'Explore to discover'}
          />
        </div>
      </div>

      {/* Achievements */}
      <div className="bg-white rounded-2xl border border-black/[0.06] p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Achievements</h3>
          <span className="text-xs text-black">
            {achievements.filter(a => a.unlocked).length} / {achievements.length}
          </span>
        </div>
        
        <div className="grid grid-cols-4 gap-3">
          {achievements.slice(0, 8).map((achievement) => (
            <div 
              key={achievement.key}
              className={`aspect-square rounded-xl flex items-center justify-center ${
                achievement.unlocked 
                  ? 'bg-amber-100 text-amber-600' 
                  : 'bg-black/10 text-black'
              }`}
              title={achievement.name}
            >
              <Award size={20} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function InsightRow({ icon, label, value }: any) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-8 h-8 rounded-lg bg-black/10 flex items-center justify-center text-black">
        {icon}
      </div>
      <div className="flex-1">
        <div className="text-xs text-black">{label}</div>
        <div className="text-sm font-medium capitalize">{value}</div>
      </div>
    </div>
  )
}

// ============================================
// Learning Loop Indicator
// Shows app is learning from user
// ============================================

export function LearningLoopIndicator() {
  const { staff } = useAuth()
  const insights = useLearningInsights(staff?.user_id || '')

  return (
    <div className="flex items-center gap-2 text-xs text-black">
      <div className="flex -space-x-1">
        <div className="w-4 h-4 rounded-full bg-blue-400 flex items-center justify-center text-white text-[8px]">L</div>
        <div className="w-4 h-4 rounded-full bg-green-400 flex items-center justify-center text-white text-[8px]">L</div>
        <div className="w-4 h-4 rounded-full bg-purple-400 flex items-center justify-center text-white text-[8px]">L</div>
      </div>
      <span>Learning from your patterns...</span>
    </div>
  )
}

// ============================================
// Activity Streak
// ============================================

export function ActivityStreak({ streak }: { streak: number }) {
  if (streak < 2) return null

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 text-amber-700 rounded-full text-sm">
      <Flame size={14} />
      <span className="font-medium">{streak} day streak!</span>
    </div>
  )
}

// ============================================
// Feature Discovery Tooltip
// Shows when user discovers new features
// ============================================

export function FeatureDiscoveryToast({ feature, onDismiss }: { feature: string; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 5000)
    return () => clearTimeout(timer)
  }, [onDismiss])

  return (
    <div className="fixed top-20 right-4 z-50 bg-gradient-to-r from-green-500 to-emerald-500 text-white px-4 py-3 rounded-xl shadow-lg animate-in slide-in-from-right">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
          <Sparkles size={16} />
        </div>
        <div>
          <div className="font-semibold text-sm">New Feature Discovered!</div>
          <div className="text-xs text-white/80 capitalize">{feature.replace('_', ' ')}</div>
        </div>
        <button onClick={onDismiss} className="ml-2 hover:bg-white/20 rounded p-1">
          <X size={14} />
        </button>
      </div>
    </div>
  )
}

// ============================================
// Engagement Celebrations
// ============================================

export function AchievementCelebration({ achievement, onDismiss }: { achievement: any; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 8000)
    return () => clearTimeout(timer)
  }, [onDismiss])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/100">
      <div className="bg-white rounded-3xl p-8 max-w-sm w-full mx-4 text-center animate-in zoom-in">
        <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center">
          <Award size={40} className="text-white" />
        </div>
        
        <div className="text-amber-500 text-sm font-medium mb-1">Achievement Unlocked!</div>
        <h2 className="text-2xl font-bold mb-2">{achievement.name}</h2>
        <p className="text-black/60 mb-4">{achievement.description}</p>
        
        <div className="flex items-center justify-center gap-2 mb-6">
          <Star size={16} className="text-amber-500 fill-amber-500" />
          <span className="font-bold text-lg">+{achievement.points} points</span>
        </div>
        
        <button
          onClick={onDismiss}
          className="w-full py-3 rounded-xl bg-[var(--av-primary, #0891B2)] text-white font-semibold"
        >
          Awesome!
        </button>
      </div>
    </div>
  )
}

// ============================================
// Quick Stats Widget
// ============================================

export function QuickStatsWidget() {
  const { staff } = useAuth()
  const { achievements, progress } = useEngagement(staff?.user_id || '')

  const stats = [
    { label: 'Level', value: progress.level, icon: <Crown size={14} /> },
    { label: 'Points', value: progress.points, icon: <Star size={14} /> },
    { label: 'Badges', value: achievements.filter(a => a.unlocked).length, icon: <Award size={14} /> },
  ]

  return (
    <div className="flex items-center gap-3">
      {stats.map((stat) => (
        <div key={stat.label} className="flex items-center gap-1.5 text-xs">
          <span className="text-black">{stat.icon}</span>
          <span className="font-medium">{stat.value}</span>
          <span className="text-black">{stat.label}</span>
        </div>
      ))}
    </div>
  )
}

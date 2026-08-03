import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import { useToast } from '../../components/Toast'
import { Trophy, Star, Heart, Award, Crown, Medal, Gift, Sparkles, Users, ThumbsUp } from 'lucide-react'

export default function Recognition() {
  const { staff } = useAuth()
  const { showToast } = useToast()
  const [leaderboard, setLeaderboard] = useState<any[]>([])
  const [recentKudos, setRecentKudos] = useState<any[]>([])

  const badges = [
    { id: 'top_performer', icon: '🏆', name: 'Top Performer', color: 'from-amber-500 to-orange-500' },
    { id: 'team_player', icon: '🤝', name: 'Team Player', color: 'from-blue-500 to-cyan-500' },
    { id: 'innovator', icon: '💡', name: 'Innovator', color: 'from-purple-500 to-pink-500' },
    { id: 'customer_focus', icon: '⭐', name: 'Customer Focus', color: 'from-yellow-500 to-amber-500' },
  ]

  useEffect(() => {
    if (!staff?.business_id) return
    // Load mock leaderboard
    setLeaderboard([
      { name: 'Adaeze Okonkwo', points: 4850, badges: 8 },
      { name: 'Emeka Nwosu', points: 4200, badges: 6 },
      { name: 'Fatima Bello', points: 3800, badges: 5 },
      { name: 'Chidi Okafor', points: 3500, badges: 4 },
      { name: 'Amaka Eze', points: 3200, badges: 4 },
    ])
    setRecentKudos([
      { from: 'CEO', to: 'Adaeze Okonkwo', message: 'Amazing work on the Lekki project!', type: 'kudos' },
      { from: 'Manager', to: 'Emeka Nwosu', message: 'Thanks for staying late to finish the report', type: 'thank_you' },
    ])
  }, [staff?.business_id])

  const getInitials = (name: string) => name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  const getColor = (name: string) => {
    const colors = ['from-rose-400 to-pink-500', 'from-amber-400 to-orange-500', 'from-emerald-400 to-teal-500']
    return colors[(name?.charCodeAt(0) || 0) % colors.length]
  }

  return (
    <div className="pb-20">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold">Recognition & Awards</h1>
          <p className="text-sm text-black/50">Celebrate excellence in your team</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-pink-500 to-purple-500 text-white text-sm font-medium">
          <Gift size={16} />
          Give Kudos
        </button>
      </div>

      {/* Leaderboard */}
      <div className="bg-white rounded-2xl border border-black/5 p-5 mb-6">
        <h2 className="font-bold text-lg flex items-center gap-2 mb-4">
          <Trophy className="text-amber-500" size={20} />
          Monthly Leaderboard
        </h2>
        <div className="space-y-3">
          {leaderboard.map((person, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                i === 0 ? 'bg-amber-100 text-amber-600' : i === 1 ? 'bg-slate-100 text-slate-600' : i === 2 ? 'bg-orange-100 text-orange-600' : 'bg-black/5'
              }`}>
                {i + 1}
              </div>
              <div className={`w-10 h-10 rounded-full bg-gradient-to-r ${getColor(person.name)} flex items-center justify-center text-white font-bold text-sm`}>
                {getInitials(person.name)}
              </div>
              <div className="flex-1">
                <p className="font-medium text-sm">{person.name}</p>
                <p className="text-xs text-black/50">{person.points.toLocaleString()} pts • {person.badges} badges</p>
              </div>
              {i === 0 && <span className="text-xl">👑</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Badges */}
      <div className="bg-white rounded-2xl border border-black/5 p-5 mb-6">
        <h2 className="font-bold text-lg flex items-center gap-2 mb-4">
          <Medal className="text-purple-500" size={20} />
          Achievement Badges
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {badges.map(badge => (
            <div key={badge.id} className="text-center p-4 bg-black/[0.02] rounded-xl hover:bg-black/[0.05] transition-colors">
              <div className={`w-14 h-14 rounded-full bg-gradient-to-br ${badge.color} flex items-center justify-center text-2xl mx-auto mb-2 shadow-lg`}>
                {badge.icon}
              </div>
              <p className="font-medium text-sm">{badge.name}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Kudos */}
      <div className="bg-white rounded-2xl border border-black/5 p-5">
        <h2 className="font-bold text-lg flex items-center gap-2 mb-4">
          <Sparkles className="text-pink-500" size={20} />
          Recent Kudos
        </h2>
        <div className="space-y-3">
          {recentKudos.map((k, i) => (
            <div key={i} className="flex items-start gap-3 p-3 bg-black/[0.02] rounded-xl">
              <ThumbsUp size={16} className="text-pink-500 mt-1" />
              <div>
                <p className="text-sm"><span className="font-medium">{k.from}</span> → <span className="font-medium">{k.to}</span></p>
                <p className="text-sm text-black/60">"{k.message}"</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

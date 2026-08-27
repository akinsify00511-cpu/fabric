import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../components/Toast'
import { ListSkeleton } from '../components/Skeleton'
import { Award, Star, TrendingUp } from 'lucide-react'

type MeritEntry = {
  id: string
  staff_id: string
  staff_name?: string
  points: number
  reason: string | null
  awarded_by: string
  awarded_by_name?: string
  created_at: string
}

type StaffMember = {
  id: string
  full_name: string | null
  name: string
  email: string
}

type LeaderboardEntry = {
  staff_id: string
  staff_name: string
  total_points: number
  entry_count: number
}

export default function Merit() {
  const { staff } = useAuth()
  const { showToast } = useToast()
  const [loading, setLoading] = useState(true)
  const [entries, setEntries] = useState<MeritEntry[]>([])
  const [teamMembers, setTeamMembers] = useState<StaffMember[]>([])
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [recipientId, setRecipientId] = useState('')
  const [points, setPoints] = useState('5')
  const [reason, setReason] = useState('')
  const [activeTab, setActiveTab] = useState<'give' | 'history' | 'leaderboard'>('give')

  const load = async () => {
    setLoading(true)

    try {
      const [{ data: entriesData }, { data: staffData }] = await Promise.all([
        supabase
          .from('merit_entries')
          .select('*, staff:staff_id(name), awarder:awarded_by(name)')
          .order('created_at', { ascending: false })
          .limit(50),
        supabase.from('staff').select('id, full_name, name, email'),
      ])

      if (entriesData && entriesData.length > 0) {
        const enrichedEntries = (entriesData as any[]).map((e) => ({
          ...e,
          staff_name: e.staff?.full_name ?? e.staff?.name ?? 'Unknown',
          awarded_by_name: e.awarder?.full_name ?? e.awarder?.name ?? 'Unknown',
        }))

        // Calculate leaderboard
        const totals: Record<string, LeaderboardEntry> = {}
        enrichedEntries.forEach((e: MeritEntry) => {
          if (!totals[e.staff_id]) {
            totals[e.staff_id] = { staff_id: e.staff_id, staff_name: e.staff_name ?? 'Unknown', total_points: 0, entry_count: 0 }
          }
          totals[e.staff_id].total_points += e.points
          totals[e.staff_id].entry_count += 1
        })

        setEntries(enrichedEntries)
        setLeaderboard(Object.values(totals).sort((a, b) => b.total_points - a.total_points))
      } else {
        setEntries([])
        setLeaderboard([])
      }
      setTeamMembers((staffData ?? []).filter((s: StaffMember) => s.id !== staff?.id))
    } catch {
      setEntries([])
      setLeaderboard([])
      setTeamMembers([])
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const awardPoints = async () => {
    if (!recipientId || !points) {
      showToast('Select a teammate and points', 'error')
      return
    }
    const { error } = await supabase.from('merit_entries').insert({
      staff_id: recipientId,
      points: Number(points),
      reason: reason || null,
      awarded_by: staff?.id,
    })
    if (error) {
      showToast('Failed to award points', 'error')
    } else {
      showToast(`Awarded ${points} points!`, 'success')
      setReason('')
      setPoints('5')
      setRecipientId('')
      load()
    }
  }

  const canAward = staff?.role === 'owner' || staff?.role === 'manager'

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-medium text-[var(--av-text)]">Merit Points</h1>
          <p className="text-sm text-[var(--av-text)] mt-0.5">Recognize and reward great work</p>
        </div>
        <div className="flex items-center gap-1.5 bg-[var(--av-warning-soft)] text-[var(--av-warning)] px-3 py-1.5 rounded-full">
          <Star size={14} />
          <span className="text-sm font-medium">
            {leaderboard.reduce((sum, e) => sum + e.total_points, 0)} total awarded
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-[var(--av-surface-elevated)] rounded-xl p-1 border border-[var(--av-border-strong)]/[0.06] mb-6 w-fit">
        {[
          { id: 'give', label: 'Give Points', icon: Award },
          { id: 'history', label: 'History', icon: TrendingUp },
          { id: 'leaderboard', label: 'Leaderboard', icon: Star },
        ].map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition ${
                activeTab === tab.id
                  ? 'avenize-gradient text-white'
                  : 'text-[var(--av-text)] hover:text-[var(--av-text)]'
              }`}
            >
              <Icon size={14} />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* GIVE POINTS TAB */}
      {activeTab === 'give' && (
        <div className="space-y-6">
          <div className="bg-[var(--av-surface-elevated)] rounded-2xl border border-[var(--av-border-strong)]/[0.06] p-4">
            <p className="text-sm font-medium text-[var(--av-text)] mb-4">Recognize a teammate</p>
            <div className="space-y-3">
              <div className="flex flex-wrap gap-3">
                <select
                  value={recipientId}
                  onChange={(e) => setRecipientId(e.target.value)}
                  className="flex-1 min-w-40 rounded-lg border border-[var(--av-border)] px-3 py-2 text-sm"
                >
                  <option value="">Select teammate...</option>
                  {teamMembers.map((m) => (
                    <option key={m.id} value={m.id}>{m.full_name ?? m.name}</option>
                  ))}
                </select>
                <div className="flex items-center gap-2">
                  {[1, 5, 10, 25].map((p) => (
                    <button
                      key={p}
                      onClick={() => setPoints(p.toString())}
                      className={`w-10 h-10 rounded-lg font-medium text-sm transition ${
                        points === p.toString()
                          ? 'avenize-gradient text-white'
                          : 'bg-black/[0.04] text-[var(--av-text)]/60 hover:bg-black/[0.08]'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why are you recognizing them? (optional)"
                className="w-full h-20 resize-none rounded-lg border border-[var(--av-border)] px-3 py-2 text-sm"
              />
              <button
                onClick={awardPoints}
                disabled={!canAward}
                className="w-full rounded-lg avenize-gradient text-white py-2.5 text-sm font-medium hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Award size={16} />
                Award {points} Merit Points
              </button>
              {!canAward && (
                <p className="text-xs text-center text-[var(--av-text)]">
                  Only managers and owners can award points
                </p>
              )}
            </div>
          </div>

          {/* Recent Awards */}
          <div className="bg-[var(--av-surface-elevated)] rounded-2xl border border-[var(--av-border-strong)]/[0.06]">
            <p className="px-4 py-3 text-sm font-medium text-[var(--av-text)] border-b border-[var(--av-border-strong)]/[0.06]">
              Recent Recognition
            </p>
            <div className="divide-y divide-black/[0.06]">
              {entries.slice(0, 5).map((e) => (
                <div key={e.id} className="px-4 py-3 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full avenize-gradient flex items-center justify-center text-white text-xs font-medium">
                    {e.points}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[var(--av-text)]">
                      <span className="font-medium">{e.staff_name}</span>
                      <span className="text-[var(--av-text)]"> earned </span>
                      <span className="font-medium text-[var(--av-warning)]">{e.points} pts</span>
                    </p>
                    {e.reason && <p className="text-xs text-[var(--av-text)] truncate">{e.reason}</p>}
                  </div>
                  <span className="text-xs text-[var(--av-text)]">{new Date(e.created_at).toLocaleDateString()}</span>
                </div>
              ))}
              {entries.length === 0 && (
                <p className="px-4 py-6 text-sm text-[var(--av-text)] text-center">No recognition yet. Be the first!</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* HISTORY TAB */}
      {activeTab === 'history' && (
        loading ? <ListSkeleton items={5} /> : (
          <div className="bg-[var(--av-surface-elevated)] rounded-2xl border border-[var(--av-border-strong)]/[0.06]">
            <div className="divide-y divide-black/[0.06]">
              {entries.map((e) => (
                <div key={e.id} className="px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full avenize-gradient flex items-center justify-center text-white font-semibold">
                      {e.points}
                    </div>
                    <div>
                      <p className="text-sm text-[var(--av-text)] font-medium">{e.staff_name}</p>
                      <p className="text-xs text-[var(--av-text)]">{e.reason || 'Merit recognition'}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-[var(--av-text)]">by {e.awarded_by_name}</p>
                    <p className="text-xs text-[var(--av-text)]">{new Date(e.created_at).toLocaleDateString()}</p>
                  </div>
                </div>
              ))}
              {entries.length === 0 && (
                <p className="px-4 py-6 text-sm text-[var(--av-text)] text-center">No recognition history yet.</p>
              )}
            </div>
          </div>
        )
      )}

      {/* LEADERBOARD TAB */}
      {activeTab === 'leaderboard' && (
        loading ? <ListSkeleton items={5} /> : (
          <div className="space-y-3">
            {leaderboard.map((entry, index) => (
              <div key={entry.staff_id} className="bg-[var(--av-surface-elevated)] rounded-2xl border border-[var(--av-border-strong)]/[0.06] p-4 flex items-center gap-4">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg ${
                  index === 0 ? 'avenize-gradient text-white' :
                  index === 1 ? 'bg-[var(--av-surface)] text-[var(--av-text)]' :
                  index === 2 ? 'bg-[var(--av-warning-soft)] text-[var(--av-warning)]' :
                  'bg-black/[0.05] text-[var(--av-text)]'
                }`}>
                  {index + 1}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-[var(--av-text)]">{entry.staff_name}</p>
                  <p className="text-xs text-[var(--av-text)]">{entry.entry_count} recognition{entry.entry_count !== 1 ? 's' : ''}</p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold text-[var(--av-warning)]">{entry.total_points}</p>
                  <p className="text-xs text-[var(--av-text)]">points</p>
                </div>
              </div>
            ))}
            {leaderboard.length === 0 && (
              <div className="text-center py-12 text-[var(--av-text)]">
                <Award size={32} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">No points awarded yet</p>
              </div>
            )}
          </div>
        )
      )}
    </div>
  )
}

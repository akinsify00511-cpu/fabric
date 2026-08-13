// ============================================
// COMPANY HOME - Human Activities Hub
// Redesigned: Follows AVENIZE-DESIGN-SPECIFICATION.md
// ============================================

import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useBranding } from '../lib/BrandingContext'
import {
  Cake, Award, Trophy, Users, Vote,
  Calendar, Star, Heart, Gift, Crown, ThumbsUp, Check,
  ChevronRight
} from 'lucide-react'

// AVENIZE BRAND COLORS - Single source of truth
const BRAND = {
  primary: '#4285F4',
  primaryHover: '#3367D6',
  primarySoft: 'rgba(66, 133, 244, 0.08)',
  gradient: 'linear-gradient(135deg, #4285F4 0%, #4285F4 50%, #34A853 100%)',
  surface: '#F8F9FA',
  surface2: '#F1F3F4',
  surfaceElevated: '#FFFFFF',
  text: '#202124',
  textSecondary: '#5F6368',
  textMuted: '#9AA0A6',
  border: '#E8EAED',
  success: '#34A853',
  successSoft: 'rgba(52, 168, 83, 0.08)',
  warning: '#FBBC05',
  warningSoft: 'rgba(251, 188, 5, 0.08)',
  danger: '#EA4335',
  dangerSoft: 'rgba(234, 67, 53, 0.08)',
  purple: '#7C3AED',
  purpleSoft: 'rgba(124, 58, 237, 0.08)',
  pink: '#BE185D',
  pinkSoft: 'rgba(190, 24, 93, 0.08)',
  amber: '#FBBC05',
  amberSoft: 'rgba(251, 188, 5, 0.08)',
}

// Current month name
const getCurrentMonth = () => new Date().toLocaleString('default', { month: 'long' })

type BirthdayEntry = { name: string; date: string; department: string; avatar: string }
type AwardEntry = { id: string; recipient: string; award: string; reason: string; icon: typeof Star; color: string }
type Poll = {
  id: string
  question: string
  options: { text: string; votes: number; percentage: number }[]
  totalVotes: number
  endsAt: string
  status: string
}

// Reusable Card component
function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div 
      className={`rounded-xl border overflow-hidden ${className}`}
      style={{ backgroundColor: BRAND.surfaceElevated, borderColor: BRAND.border }}
    >
      {children}
    </div>
  )
}

// Reusable Badge component
function Badge({ children, variant = 'primary' }: { children: React.ReactNode; variant?: 'primary' | 'success' | 'warning' | 'danger' | 'muted' }) {
  const variants = {
    primary: { bg: BRAND.primarySoft, color: BRAND.primary },
    success: { bg: BRAND.successSoft, color: BRAND.success },
    warning: { bg: BRAND.warningSoft, color: BRAND.warning },
    danger: { bg: BRAND.dangerSoft, color: BRAND.danger },
    muted: { bg: BRAND.surface2, color: BRAND.textSecondary },
  }
  const v = variants[variant]
  return (
    <span 
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ backgroundColor: v.bg, color: v.color }}
    >
      {children}
    </span>
  )
}

// Avatar component
function Avatar({ initials, gradient = true }: { initials: string; gradient?: boolean }) {
  return (
    <div 
      className="w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold text-sm"
      style={gradient ? { background: BRAND.gradient } : { backgroundColor: BRAND.surface2, color: BRAND.text }}
    >
      {initials}
    </div>
  )
}

export default function CompanyHome() {
  const { staff } = useAuth()
  const { branding } = useBranding()
  const [selectedPoll, setSelectedPoll] = useState<string | null>(null)
  const [hasVoted, setHasVoted] = useState<string[]>([])
  const [birthdaysThisMonth, setBirthdaysThisMonth] = useState<BirthdayEntry[]>([])
  const [recentAwards, setRecentAwards] = useState<AwardEntry[]>([])
  const [pollResults, setPollResults] = useState<Poll[]>([])
  const [bestStaff, setBestStaff] = useState<{
    name: string; role: string; department: string; achievement: string; avatar: string;
    stats: { sales: string; deals: number; tasks: number }
  } | null>(null)
  const currentMonth = getCurrentMonth()

  useEffect(() => {
    const voted = localStorage.getItem('avenize_voted_polls')
    if (voted) setHasVoted(JSON.parse(voted))
  }, [])

  useEffect(() => {
    if (!staff?.business_id) return
    const loadData = async () => {
      try {
        // Birthdays require a date_of_birth column not yet in the schema; left empty until added.
        setBirthdaysThisMonth([])

        // Fetch recent merit awards
        const { data: awardsData } = await supabase
          .from('merit_entries')
          .select('id, staff_id, points, reason, created_at, staff:staff_id(name, full_name)')
          .eq('business_id', staff.business_id)
          .order('created_at', { ascending: false })
          .limit(3)
        if (awardsData && awardsData.length > 0) {
          const awardLabels = ['Star Performer', 'Rising Star', 'Team Player']
          const awardIcons = [Star, Trophy, Heart]
          const awardColors = [BRAND.amber, BRAND.purple, BRAND.pink]
          setRecentAwards(awardsData.map((a: any, i: number) => ({
            id: a.id,
            recipient: a.staff?.full_name || a.staff?.name || 'Team Member',
            award: awardLabels[i % awardLabels.length],
            reason: a.reason || 'Recognition awarded',
            icon: awardIcons[i % awardIcons.length],
            color: awardColors[i % awardColors.length]
          })))
        }

        // Fetch polls
        const { data: pollsData } = await supabase
          .from('polls')
          .select('id, question, options, total_votes, ends_at, status')
          .eq('business_id', staff.business_id)
          .order('created_at', { ascending: false })
          .limit(2)
        if (pollsData && pollsData.length > 0) {
          // Fetch real vote counts from poll_votes (votes are persisted server-side)
          const pollIds = pollsData.map((p: any) => p.id)
          const { data: votesData } = await supabase
            .from('poll_votes')
            .select('poll_id, option')
            .in('poll_id', pollIds)

          const voteCounts: Record<string, Record<string, number>> = {}
          let pollTotals: Record<string, number> = {}
          ;(votesData || []).forEach((v: any) => {
            if (!voteCounts[v.poll_id]) voteCounts[v.poll_id] = {}
            voteCounts[v.poll_id][v.option] = (voteCounts[v.poll_id][v.option] || 0) + 1
            pollTotals[v.poll_id] = (pollTotals[v.poll_id] || 0) + 1
          })

          setPollResults(pollsData.map((p: any) => {
            const counts = voteCounts[p.id] || {}
            const total = pollTotals[p.id] || 0
            return {
              id: p.id,
              question: p.question,
              options: Array.isArray(p.options) ? p.options.map((opt: any) => {
                const text = opt.text || opt
                const votes = counts[text] || 0
                return {
                  text,
                  votes,
                  percentage: total > 0 ? Math.round((votes / total) * 100) : 0,
                }
              }) : [],
              totalVotes: total,
              endsAt: p.ends_at || '',
              status: p.status || 'active'
            }
          }))
        }

        // Fetch best staff (top performer by merit points this month)
        const monthStart = new Date()
        monthStart.setDate(1)
        monthStart.setHours(0, 0, 0, 0)
        const { data: topPerformer } = await supabase
          .from('merit_entries')
          .select('staff_id, points, reason, created_at, staff:staff_id(name, full_name, role, department, avatar_url)')
          .eq('business_id', staff.business_id)
          .gte('created_at', monthStart.toISOString())
          .order('points', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (topPerformer?.staff) {
          const s = topPerformer.staff as any
          const name = s.full_name || s.name || 'Team Member'
          setBestStaff({
            name,
            role: s.role || s.job_title || 'Staff',
            department: s.department || '—',
            achievement: topPerformer.reason || 'Top performer this month',
            avatar: name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase(),
            stats: { sales: `${topPerformer.points} pts`, deals: 0, tasks: 0 }
          })
        }
      } catch (err) {
        console.error('Failed to load company home data:', err)
      }
    }
    loadData()
  }, [staff?.business_id])

  const handleVote = async (pollId: string, optionIndex: number) => {
    if (hasVoted.includes(pollId)) return
    const poll = pollResults.find(p => p.id === pollId)
    if (!poll || poll.status !== 'active') return
    const optionText = poll.options[optionIndex]?.text
    if (!optionText) return

    // Persist the vote server-side. poll_votes has UNIQUE(poll_id, voter_id),
    // so a duplicate insert (same user, same poll) is rejected by Postgres.
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase
      .from('poll_votes')
      .insert({
        poll_id: pollId,
        business_id: staff?.business_id,
        option: optionText,
        voter_id: user?.id || null,
      })

    if (error) {
      // 23505 = unique_violation — user already voted; treat as already-voted
      if (error.code !== '23505') {
        console.error('Failed to record vote:', error.message)
        return
      }
    }

    // Update local "voted" state so the UI shows results
    const newVoted = [...hasVoted, pollId]
    setHasVoted(newVoted)
    localStorage.setItem('avenize_voted_polls', JSON.stringify(newVoted))
    setSelectedPoll(`${pollId}-${optionIndex}`)

    // Re-fetch vote counts for this poll so the bar updates immediately
    const { data: freshVotes } = await supabase
      .from('poll_votes')
      .select('option')
      .eq('poll_id', pollId)
    const counts: Record<string, number> = {}
    let total = 0
    ;(freshVotes || []).forEach((v: any) => {
      counts[v.option] = (counts[v.option] || 0) + 1
      total++
    })
    setPollResults(prev => prev.map(p => p.id === pollId ? {
      ...p,
      options: p.options.map(opt => ({
        ...opt,
        votes: counts[opt.text] || 0,
        percentage: total > 0 ? Math.round(((counts[opt.text] || 0) / total) * 100) : 0,
      })),
      totalVotes: total,
    } : p))
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: BRAND.surface }}>
      {/* ===== PAGE HEADER ===== */}
      <div 
        className="border-b px-6 py-5"
        style={{ backgroundColor: BRAND.surfaceElevated, borderColor: BRAND.border }}
      >
        <div className="max-w-7xl mx-auto">
          <h1 className="text-xl font-semibold" style={{ color: BRAND.text }}>Company Hub</h1>
          <p className="text-sm mt-0.5" style={{ color: BRAND.textSecondary }}>
            Celebrate your team • {currentMonth} {new Date().getFullYear()}
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        
        {/* ===== BIRTHDAYS THIS MONTH ===== */}
        <Card>
          <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: BRAND.border }}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: BRAND.pinkSoft }}>
                <Cake size={20} style={{ color: BRAND.pink }} />
              </div>
              <div>
                <h2 className="font-medium" style={{ color: BRAND.text }}>Birthdays This Month</h2>
                <p className="text-xs" style={{ color: BRAND.textMuted }}>{currentMonth}</p>
              </div>
            </div>
            <Badge variant="primary">{birthdaysThisMonth.length} team members</Badge>
          </div>
          
          <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-4">
            {birthdaysThisMonth.map((b, i) => (
              <div 
                key={i} 
                className="flex items-center gap-4 p-4 rounded-lg"
                style={{ backgroundColor: BRAND.surface }}
              >
                <Avatar initials={b.avatar} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate" style={{ color: BRAND.text }}>{b.name}</p>
                  <p className="text-xs" style={{ color: BRAND.textMuted }}>{b.department}</p>
                  <p className="text-xs font-medium mt-1" style={{ color: BRAND.pink }}>
                    {new Date(b.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </p>
                </div>
              </div>
            ))}
            
            {birthdaysThisMonth.length === 0 && (
              <div className="col-span-3 text-center py-8" style={{ color: BRAND.textMuted }}>
                <Cake size={32} className="mx-auto mb-2 opacity-50" />
                <p className="text-sm">No birthdays this month</p>
              </div>
            )}
          </div>
        </Card>

        {/* ===== BEST STAFF OF THE MONTH - HERO CARD ===== */}
        <Card className="relative overflow-hidden">
          {/* Accent bar */}
          <div className="absolute top-0 left-0 right-0 h-1" style={{ background: BRAND.gradient }} />
          
          <div className="p-6">
            <div className="flex items-center gap-2 mb-5">
              <Crown size={20} style={{ color: BRAND.amber }} />
              <span className="text-xs font-medium uppercase tracking-wide" style={{ color: BRAND.textSecondary }}>
                Best Staff of the Month
              </span>
            </div>
            
            {bestStaff ? (
            <div className="flex items-center gap-5">
              <div 
                className="w-20 h-20 rounded-2xl flex items-center justify-center text-2xl font-bold"
                style={{ background: BRAND.gradient, color: 'white' }}
              >
                {bestStaff.avatar}
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold" style={{ color: BRAND.text }}>{bestStaff.name}</h3>
                <p className="text-sm" style={{ color: BRAND.textSecondary }}>{bestStaff.role} • {bestStaff.department}</p>
                <p className="text-sm mt-2" style={{ color: BRAND.textSecondary }}>{bestStaff.achievement}</p>
                
                <div className="flex gap-8 mt-4">
                  <div>
                    <p className="text-xl font-bold" style={{ color: BRAND.success }}>{bestStaff.stats.sales}</p>
                    <p className="text-xs" style={{ color: BRAND.textMuted }}>Sales</p>
                  </div>
                  <div>
                    <p className="text-xl font-bold" style={{ color: BRAND.primary }}>{bestStaff.stats.deals}</p>
                    <p className="text-xs" style={{ color: BRAND.textMuted }}>Deals</p>
                  </div>
                  <div>
                    <p className="text-xl font-bold" style={{ color: BRAND.purple }}>{bestStaff.stats.tasks}</p>
                    <p className="text-xs" style={{ color: BRAND.textMuted }}>Tasks</p>
                  </div>
                </div>
              </div>
            </div>
            ) : (
              <p className="text-sm py-8 text-center" style={{ color: BRAND.textMuted }}>
                No staff highlighted yet this month.
              </p>
            )}
          </div>
        </Card>

        {/* ===== TWO COLUMN: AWARDS + POLLS ===== */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* AWARDS */}
          <Card>
            <div className="px-5 py-4 border-b flex items-center gap-3" style={{ borderColor: BRAND.border }}>
              <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: BRAND.primarySoft }}>
                <Award size={20} style={{ color: BRAND.primary }} />
              </div>
              <div>
                <h2 className="font-medium" style={{ color: BRAND.text }}>Recent Awards</h2>
                <p className="text-xs" style={{ color: BRAND.textMuted }}>Team recognition</p>
              </div>
            </div>
            
            <div className="p-4 space-y-3">
              {recentAwards.map((award) => {
                const Icon = award.icon
                return (
                  <div 
                    key={award.id} 
                    className="flex items-start gap-3 p-3 rounded-lg"
                    style={{ backgroundColor: BRAND.surface }}
                  >
                    <div 
                      className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: award.color + '15' }}
                    >
                      <Icon size={18} style={{ color: award.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-sm" style={{ color: BRAND.text }}>{award.recipient}</p>
                        <Badge>{award.award}</Badge>
                      </div>
                      <p className="text-xs mt-0.5" style={{ color: BRAND.textMuted }}>{award.reason}</p>
                    </div>
                    <button 
                      className="p-1.5 rounded-md transition hover:bg-gray-100"
                      style={{ color: BRAND.textMuted }}
                    >
                      <ThumbsUp size={14} />
                    </button>
                  </div>
                )
              })}
            </div>
          </Card>

          {/* POLLS */}
          <Card>
            <div className="px-5 py-4 border-b flex items-center gap-3" style={{ borderColor: BRAND.border }}>
              <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: BRAND.purpleSoft }}>
                <Vote size={20} style={{ color: BRAND.purple }} />
              </div>
              <div>
                <h2 className="font-medium" style={{ color: BRAND.text }}>Team Polls</h2>
                <p className="text-xs" style={{ color: BRAND.textMuted }}>Vote & see results</p>
              </div>
            </div>
            
            <div className="p-4 space-y-4">
              {pollResults.map((poll) => {
                const isVoted = hasVoted.includes(poll.id)
                const isActive = poll.status === 'active'
                
                return (
                  <div 
                    key={poll.id} 
                    className="p-4 rounded-lg"
                    style={{ backgroundColor: BRAND.surface }}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <p className="font-medium text-sm" style={{ color: BRAND.text }}>{poll.question}</p>
                      <Badge variant={isActive && !isVoted ? 'success' : 'muted'}>
                        {isActive && !isVoted ? 'Active' : 'Closed'}
                      </Badge>
                    </div>
                    
                    <div className="space-y-2">
                      {poll.options.map((option, idx) => {
                        const isSelected = selectedPoll === poll.id + '-' + idx
                        return (
                          <button
                            key={idx}
                            onClick={() => isActive && !isVoted && handleVote(poll.id, idx)}
                            disabled={!isActive || isVoted}
                            className="w-full text-left p-3 rounded-lg border transition"
                            style={{ 
                              backgroundColor: isSelected ? BRAND.primarySoft : BRAND.surfaceElevated,
                              borderColor: isSelected ? BRAND.primary : BRAND.border,
                            }}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-sm" style={{ color: isSelected ? BRAND.primary : BRAND.text }}>
                                {option.text}
                              </span>
                              {isVoted && (
                                <span className="text-xs font-medium" style={{ color: BRAND.textSecondary }}>
                                  {option.percentage}%
                                </span>
                              )}
                            </div>
                            {isVoted && (
                              <div 
                                className="mt-2 h-1.5 rounded-full overflow-hidden"
                                style={{ backgroundColor: BRAND.surface2 }}
                              >
                                <div 
                                  className="h-full rounded-full"
                                  style={{ width: option.percentage + '%', backgroundColor: BRAND.primary }}
                                />
                              </div>
                            )}
                          </button>
                        )
                      })}
                    </div>
                    
                    <div className="mt-3 flex items-center justify-between text-xs" style={{ color: BRAND.textMuted }}>
                      <span>{poll.totalVotes} votes</span>
                      <span>Ends {new Date(poll.endsAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>
        </div>

        {/* ===== QUICK ACTIONS ===== */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { to: '/app/people', icon: Users, label: 'Team Directory', color: BRAND.primary },
            { to: '/app/kudos', icon: Heart, label: 'Send Kudos', color: BRAND.pink },
            { to: '/app/polls', icon: Vote, label: 'Create Poll', color: BRAND.purple },
            { to: '/app/awards', icon: Trophy, label: 'Nominate', color: BRAND.amber },
          ].map((action, i) => {
            const Icon = action.icon
            return (
              <Link
                key={i}
                to={action.to}
                className="flex flex-col items-center p-4 rounded-xl border transition group"
                style={{ 
                  backgroundColor: BRAND.surfaceElevated, 
                  borderColor: BRAND.border,
                }}
              >
                <div 
                  className="w-12 h-12 rounded-xl flex items-center justify-center mb-3 transition group-hover:scale-105"
                  style={{ backgroundColor: action.color + '12' }}
                >
                  <Icon size={22} style={{ color: action.color }} />
                </div>
                <span className="text-sm font-medium" style={{ color: BRAND.text }}>{action.label}</span>
              </Link>
            )
          })}
        </div>

      </div>
    </div>
  )
}

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
  primary: '#0891B2',
  primaryHover: '#0E7490',
  primarySoft: 'rgba(8, 145, 178, 0.08)',
  gradient: 'linear-gradient(135deg, #0891B2 0%, #0D9488 50%, #059669 100%)',
  surface: '#FAFAF9',
  surface2: '#F5F5F4',
  surfaceElevated: '#FFFFFF',
  text: '#18181B',
  textSecondary: '#52525B',
  textMuted: '#A1A1AA',
  border: '#E7E5E4',
  success: '#059669',
  successSoft: 'rgba(5, 150, 105, 0.08)',
  warning: '#D97706',
  warningSoft: 'rgba(217, 119, 6, 0.08)',
  danger: '#DC2626',
  dangerSoft: 'rgba(220, 38, 38, 0.08)',
  purple: '#7C3AED',
  purpleSoft: 'rgba(124, 58, 237, 0.08)',
  pink: '#DB2777',
  pinkSoft: 'rgba(219, 39, 119, 0.08)',
  amber: '#D97706',
  amberSoft: 'rgba(217, 119, 6, 0.08)',
}

// Current month name
const getCurrentMonth = () => new Date().toLocaleString('default', { month: 'long' })

// Mock data
const birthdaysThisMonth = [
  { name: 'Chioma Adebayo', date: '2026-08-15', department: 'Sales', avatar: 'CA' },
  { name: 'Emmanuel Okonkwo', date: '2026-08-22', department: 'Marketing', avatar: 'EO' },
  { name: 'Fatima Bello', date: '2026-08-28', department: 'Finance', avatar: 'FB' },
]

const bestStaff = {
  name: 'Adebayo Johnson',
  role: 'Sales Manager',
  department: 'Sales',
  achievement: 'Highest sales this month - ₦2.5M target achieved',
  avatar: 'AJ',
  stats: { sales: '₦2.5M', deals: 12, tasks: 28 }
}

const pollResults = [
  {
    id: '1',
    question: 'Best Team Building Activity for Q3?',
    options: [
      { text: 'Beach Party', votes: 24, percentage: 45 },
      { text: 'Game Night', votes: 18, percentage: 34 },
      { text: 'Cooking Class', votes: 11, percentage: 21 },
    ],
    totalVotes: 53,
    endsAt: '2026-08-20',
    status: 'active'
  },
  {
    id: '2',
    question: 'Favorite Remote Work Day?',
    options: [
      { text: 'Friday', votes: 31, percentage: 52 },
      { text: 'Monday', votes: 15, percentage: 25 },
      { text: 'Wednesday', votes: 14, percentage: 23 },
    ],
    totalVotes: 60,
    endsAt: '2026-08-10',
    status: 'closed'
  }
]

const recentAwards = [
  { id: '1', recipient: 'Ngozi Okafor', award: 'Star Performer', reason: 'Closed 3 major deals this week', icon: Star, color: BRAND.amber },
  { id: '2', recipient: 'Ibrahim Musa', award: 'Rising Star', reason: 'Exceeded quarterly targets by 150%', icon: Trophy, color: BRAND.purple },
  { id: '3', recipient: 'Grace Eze', award: 'Team Player', reason: 'Helped onboard 3 new clients', icon: Heart, color: BRAND.pink },
]

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
  const { staff, isDemo } = useAuth()
  const { branding } = useBranding()
  const [selectedPoll, setSelectedPoll] = useState<string | null>(null)
  const [hasVoted, setHasVoted] = useState<string[]>([])
  const currentMonth = getCurrentMonth()

  useEffect(() => {
    const voted = localStorage.getItem('avenize_voted_polls')
    if (voted) setHasVoted(JSON.parse(voted))
  }, [])

  const handleVote = (pollId: string, optionIndex: number) => {
    if (hasVoted.includes(pollId)) return
    const newVoted = [...hasVoted, pollId]
    setHasVoted(newVoted)
    localStorage.setItem('avenize_voted_polls', JSON.stringify(newVoted))
    setSelectedPoll(`${pollId}-${optionIndex}`)
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

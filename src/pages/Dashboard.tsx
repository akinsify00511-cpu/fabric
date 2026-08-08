// ============================================
// AVENIZE DASHBOARD v2 - Muted & Professional
// ============================================

import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import {
  Users, DollarSign, Target, CheckSquare, 
  TrendingUp, Flame, Building2, Check,
  ArrowRight, Calendar, Clock
} from 'lucide-react'

// AVENIZE BRAND COLORS - Muted & Professional
const BRAND = {
  primary: 'var(--av-primary)',           // Slate-600
  primaryHover: 'var(--av-primary-hover)',       // Slate-700
  primarySoft: 'rgba(66, 133, 244, 0.08)',
  gradient: 'linear-gradient(135deg, var(--av-primary) 0%, var(--av-primary) 100%)',
  surface: '#F8F9FA',
  surface2: '#F1F3F4',
  surfaceElevated: '#FFFFFF',
  text: '#202124',
  textSecondary: '#5F6368',
  textMuted: '#9AA0A6',
  border: '#E8EAED',
  success: 'var(--av-success)',          // Green-700
  successSoft: 'rgba(52, 168, 83, 0.08)',
  warning: 'var(--av-warning)',          // Amber-700
  warningSoft: 'rgba(251, 188, 5, 0.08)',
  danger: 'var(--av-danger)',           // Red-700
  dangerSoft: 'rgba(234, 67, 53, 0.08)',
  info: '#0369A1',             // Sky-700
  infoSoft: 'rgba(3, 105, 161, 0.08)',
  accent: '#7C3AED',           // Violet-600
  accentSoft: 'rgba(124, 58, 237, 0.08)',
}

// Module colors - Muted & Professional
const MODULE_COLORS = {
  crm: { color: '#64748B', bg: 'rgba(100, 116, 139, 0.08)', icon: Users },
  finance: { color: 'var(--av-success)', bg: 'rgba(52, 168, 83, 0.08)', icon: DollarSign },
  projects: { color: 'var(--av-warning)', bg: 'rgba(251, 188, 5, 0.08)', icon: Target },
  people: { color: '#7C3AED', bg: 'rgba(124, 58, 237, 0.08)', icon: Building2 },
}

const formatCurrency = (amount: number) => {
  if (amount >= 1000000) return `₦${(amount / 1000000).toFixed(1)}M`
  if (amount >= 1000) return `₦${(amount / 1000).toFixed(0)}k`
  return `₦${amount.toLocaleString()}`
}

const getMockData = () => ({
  stats: {
    hotDeals: 7,
    hotDealsChange: 3,
    pipelineValue: 3200000,
    pipelineChange: 2000000,
    pendingTasks: 18,
    tasksChange: -3,
    teamMembers: 42,
    teamChange: 2,
  },
  activities: [
    { id: '1', type: 'deal', text: 'New hot lead: Ibrahim Musa, ₦3.5M deal', time: '2 min ago', icon: Flame, color: BRAND.danger },
    { id: '2', type: 'payment', text: 'Riverside Construction signed, ₦2.5M deal', time: '15 min ago', icon: Check, color: BRAND.success },
    { id: '3', type: 'invoice', text: 'Invoice #0042 sent to TechStart', time: '30 min ago', icon: DollarSign, color: BRAND.primary },
  ],
  upcoming: [
    { id: '1', text: 'Call Ibrahim Musa, hot deal closing', time: 'Today, 2:00 PM', priority: 'high' },
    { id: '2', text: 'Team standup meeting', time: 'Today, 9:00 AM', priority: 'medium' },
    { id: '3', text: 'Follow up with Alhaji Motors', time: 'Tomorrow, 10:00 AM', priority: 'high' },
  ],
})

// Reusable Card component
function Card({ children, className = '', accent = false }: { children: React.ReactNode; className?: string; accent?: boolean }) {
  return (
    <div 
      className={`rounded-lg border ${className}`}
      style={{ 
        backgroundColor: BRAND.surfaceElevated, 
        borderColor: BRAND.border,
        position: 'relative'
      }}
    >
      {children}
    </div>
  )
}

// Stat Card component
function StatCard({ 
  label, value, change, changeType = 'positive',
  icon: Icon, iconColor, iconBg,
  href
}: { 
  label: string; 
  value: string; 
  change?: string;
  changeType?: 'positive' | 'negative' | 'neutral';
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  href: string;
}) {
  const changeColor = changeType === 'positive' ? BRAND.success : changeType === 'negative' ? BRAND.danger : BRAND.textMuted
  
  return (
    <Link to={href} className="block transition hover:opacity-90">
      <Card className="p-4 h-full">
        <div className="flex items-center justify-between mb-3">
          <div 
            className="w-9 h-9 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: iconBg }}
          >
            <Icon size={18} style={{ color: iconColor }} />
          </div>
          {change && (
            <span className="text-xs font-medium" style={{ color: changeColor }}>
              {change}
            </span>
          )}
        </div>
        <div className="text-2xl font-semibold" style={{ color: BRAND.text }}>{value}</div>
        <div className="text-xs mt-1" style={{ color: BRAND.textMuted }}>{label}</div>
      </Card>
    </Link>
  )
}

export default function Dashboard() {
  const { staff, isDemo } = useAuth()
  const [stats, setStats] = useState<any>(null)
  const [activities, setActivities] = useState<any[]>([])
  const [upcoming, setUpcoming] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [revenueData, setRevenueData] = useState<number[]>([])

  useEffect(() => {
    loadDashboardData()
  }, [staff, isDemo])

  const loadDashboardData = async () => {
    if (isDemo || !staff?.business_id) {
      const mockData = getMockData()
      setStats(mockData.stats)
      setActivities(mockData.activities)
      setUpcoming(mockData.upcoming)
      setRevenueData([40, 55, 45, 70, 60, 90, 100])
      setLoading(false)
      return
    }

    try {
      const [dealsData, tasksData, staffData] = await Promise.all([
        supabase.from('deals').select('value, stage').eq('business_id', staff.business_id).eq('stage', 'hot'),
        supabase.from('tasks').select('id').eq('business_id', staff.business_id).eq('status', 'pending'),
        supabase.from('staff').select('id').eq('business_id', staff.business_id),
      ])

      setStats({
        hotDeals: dealsData.data?.length || 0,
        pipelineValue: dealsData.data?.reduce((sum: number, d: any) => sum + (d.value || 0), 0) || 0,
        pendingTasks: tasksData.data?.length || 0,
        teamMembers: staffData.data?.length || 0,
        hotDealsChange: 0,
        pipelineChange: 0,
        tasksChange: 0,
        teamChange: 0,
      })
      setRevenueData([40, 55, 45, 70, 60, 90, 100])
      setActivities([
        { id: '1', type: 'deal', text: `You have ${dealsData.data?.length || 0} hot deals`, time: 'Just now', icon: Flame, color: BRAND.danger },
        { id: '2', type: 'invoice', text: `${tasksData.data?.length || 0} pending tasks`, time: 'Updated', icon: CheckSquare, color: BRAND.primary },
      ])
      setUpcoming([{ id: '1', text: 'Check your tasks', time: 'Today', priority: 'high' }])
    } catch (error) {
      console.error('Error loading dashboard:', error)
      const mockData = getMockData()
      setStats(mockData.stats)
      setActivities(mockData.activities)
      setUpcoming(mockData.upcoming)
      setRevenueData([40, 55, 45, 70, 60, 90, 100])
    }
    setLoading(false)
  }

  const getUserName = () => {
    if (!staff) return 'User'
    return staff.full_name?.split(' ')[0] || staff.name?.split(' ')[0] || 'User'
  }

  const revenueChange = 35

  if (loading) {
    return (
      <div className="pb-20">
        <div className="animate-pulse space-y-4">
          <div className="h-8 rounded w-48" style={{ backgroundColor: BRAND.surface2 }}></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-32 rounded-lg" style={{ backgroundColor: BRAND.surfaceElevated }}></div>)}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="pb-20">
      <div className="grid grid-cols-12 gap-4">
        
        {/* Hero: Revenue KPI */}
        <div className="col-span-12 md:col-span-7">
          <Card className="p-6 flex flex-col justify-between min-h-[190px]">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div 
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: BRAND.primary }}
                >
                  <span className="text-white font-bold text-sm">A</span>
                </div>
                <span className="text-sm font-medium" style={{ color: BRAND.textSecondary }}>Avenize</span>
              </div>
              <div className="text-sm" style={{ color: BRAND.textSecondary }}>
                Welcome back, <span className="font-medium" style={{ color: BRAND.text }}>{getUserName()}</span>
              </div>
              <div className="text-sm mt-2" style={{ color: BRAND.textMuted }}>Revenue this month</div>
              <div className="text-[38px] font-semibold mt-1" style={{ 
                letterSpacing: '-0.01em',
                color: BRAND.text
              }}>
                {stats ? formatCurrency(stats.pipelineValue) : '₦0'}
              </div>
            </div>
            {/* Mini chart */}
            <div className="flex items-end gap-1 mt-4">
              {revenueData.map((height, i) => (
                <div
                  key={i}
                  className="rounded-sm"
                  style={{ 
                    height: `${height}%`,
                    width: '10px',
                    backgroundColor: i >= revenueData.length - 2 ? BRAND.primary : BRAND.textMuted,
                    opacity: i >= revenueData.length - 2 ? 1 : 0.35
                  }}
                />
              ))}
              <span className="text-xs font-semibold ml-3 mb-0.5" style={{ color: BRAND.success }}>
                +{revenueChange}%
              </span>
            </div>
          </Card>
        </div>

        {/* Workspace Launcher */}
        <div className="col-span-12 md:col-span-5 grid grid-cols-2 gap-4">
          {Object.entries(MODULE_COLORS).map(([key, mod]) => {
            const Icon = mod.icon
            const href = key === 'crm' ? '/app/crm' : 
                         key === 'finance' ? '/app/finance' :
                         key === 'projects' ? '/app/projects' : '/app/people'
            const label = key === 'crm' ? 'CRM' :
                         key === 'finance' ? 'Finance' :
                         key === 'projects' ? 'Projects' : 'People'
            return (
              <Link
                key={key}
                to={href}
                className="block p-4 rounded-lg border transition hover:opacity-90"
                style={{ 
                  backgroundColor: BRAND.surfaceElevated,
                  borderColor: BRAND.border
                }}
              >
                <div 
                  className="w-11 h-11 rounded-lg flex items-center justify-center mb-3"
                  style={{ backgroundColor: mod.bg }}
                >
                  <Icon size={20} style={{ color: mod.color }} />
                </div>
                <div className="text-sm font-medium" style={{ color: BRAND.text }}>{label}</div>
              </Link>
            )
          })}
        </div>

        {/* Stat Cards */}
        <div className="col-span-6 md:col-span-3">
          <StatCard
            href="/app/crm"
            label="Hot deals"
            value={stats?.hotDeals || 0}
            change={`+${stats?.hotDealsChange || 0} this week`}
            changeType="positive"
            icon={Flame}
            iconColor={BRAND.danger}
            iconBg={BRAND.dangerSoft}
          />
        </div>

        <div className="col-span-6 md:col-span-3">
          <StatCard
            href="/app/crm"
            label="Pipeline value"
            value={formatCurrency(stats?.pipelineValue || 0)}
            change={`+${formatCurrency(stats?.pipelineChange || 0)}`}
            changeType="positive"
            icon={TrendingUp}
            iconColor={BRAND.primary}
            iconBg={BRAND.primarySoft}
          />
        </div>

        <div className="col-span-6 md:col-span-3">
          <StatCard
            href="/app/tasks"
            label="Pending tasks"
            value={stats?.pendingTasks || 0}
            change={`${stats?.tasksChange || 0}`}
            changeType={stats?.tasksChange >= 0 ? 'positive' : 'negative'}
            icon={CheckSquare}
            iconColor={BRAND.accent}
            iconBg={BRAND.accentSoft}
          />
        </div>

        <div className="col-span-6 md:col-span-3">
          <StatCard
            href="/app/people"
            label="Team members"
            value={stats?.teamMembers || 0}
            change={`+${stats?.teamChange || 0}`}
            changeType="positive"
            icon={Users}
            iconColor={BRAND.success}
            iconBg={BRAND.successSoft}
          />
        </div>

        {/* Recent Activity */}
        <div className="col-span-12 md:col-span-7">
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm font-medium" style={{ color: BRAND.text }}>Recent activity</div>
              <Link 
                to="/app/activity"
                className="text-xs flex items-center gap-1 transition"
                style={{ color: BRAND.primary }}
              >
                View all <ArrowRight size={12} />
              </Link>
            </div>
            <div className="space-y-3">
              {activities.map((activity) => {
                const Icon = activity.icon
                return (
                  <div 
                    key={activity.id} 
                    className="flex items-start gap-3 py-2"
                    style={{ borderBottom: `1px solid ${BRAND.border}` }}
                  >
                    <div 
                      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                      style={{ backgroundColor: activity.color + '15' }}
                    >
                      <Icon size={16} style={{ color: activity.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm" style={{ color: BRAND.text }}>{activity.text}</div>
                      <div className="text-xs mt-0.5 flex items-center gap-1" style={{ color: BRAND.textMuted }}>
                        <Clock size={10} />
                        {activity.time}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>
        </div>

        {/* Upcoming */}
        <div className="col-span-12 md:col-span-5">
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm font-medium" style={{ color: BRAND.text }}>Upcoming</div>
              <Link 
                to="/app/calendar"
                className="text-xs flex items-center gap-1 transition"
                style={{ color: BRAND.primary }}
              >
                View calendar <ArrowRight size={12} />
              </Link>
            </div>
            <div className="space-y-3">
              {upcoming.map((item) => {
                const dotColor = item.priority === 'high' ? BRAND.danger : 
                                item.priority === 'medium' ? BRAND.warning : BRAND.textMuted
                return (
                  <div 
                    key={item.id} 
                    className="flex items-center gap-3 py-2"
                    style={{ borderBottom: `1px solid ${BRAND.border}` }}
                  >
                    <div 
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: dotColor }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm truncate" style={{ color: BRAND.text }}>{item.text}</div>
                      <div className="text-xs mt-0.5 flex items-center gap-1" style={{ color: BRAND.textMuted }}>
                        <Calendar size={10} />
                        {item.time}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>
        </div>

      </div>
    </div>
  )
}

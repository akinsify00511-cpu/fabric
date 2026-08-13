// ============================================
// AVENIZE DASHBOARD v2 - Muted & Professional
// ============================================

import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { useLocale } from '../lib/LocaleContext'
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

// Reusable Card component - Google-style with shadow, no border
function Card({ children, className = '', accent = false, hoverable = false }: { children: React.ReactNode; className?: string; accent?: boolean; hoverable?: boolean }) {
  return (
    <div 
      className={`rounded-2xl ${hoverable ? 'transition-all hover:-translate-y-0.5' : ''} ${className}`}
      style={{ 
        backgroundColor: BRAND.surfaceElevated, 
        boxShadow: hoverable 
          ? '0 1px 3px rgba(0,0,0,0.08), 0 4px 8px rgba(0,0,0,0.04)' 
          : '0 1px 2px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)',
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
  const { staff } = useAuth()
  const { t } = useLocale()
  const [stats, setStats] = useState<any>(null)
  const [activities, setActivities] = useState<any[]>([])
  const [upcoming, setUpcoming] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [revenueData, setRevenueData] = useState<number[]>([])
  const [revenueChange, setRevenueChange] = useState<number | null>(null)

  useEffect(() => {
    loadDashboardData()
  }, [staff])

  const loadDashboardData = async () => {
    if (!staff?.business_id) {
      setLoading(false)
      return
    }

    try {
      const [dealsData, tasksData, staffData, invoicesData, recentDealsData, recentTasksData, upcomingMeetingsData] = await Promise.all([
        supabase.from('deals').select('value, stage').eq('business_id', staff.business_id).eq('stage', 'hot'),
        supabase.from('tasks').select('id, title, due_date, priority, status').eq('business_id', staff.business_id).eq('status', 'pending').order('due_date', { ascending: true }).limit(5),
        supabase.from('staff').select('id').eq('business_id', staff.business_id),
        supabase.from('invoices').select('total, status, created_at').eq('business_id', staff.business_id).order('created_at', { ascending: false }),
        supabase.from('deals').select('id, title, value, stage, created_at').eq('business_id', staff.business_id).order('created_at', { ascending: false }).limit(5),
        supabase.from('tasks').select('id, title, status, created_at').eq('business_id', staff.business_id).order('created_at', { ascending: false }).limit(3),
        supabase.from('meetings').select('id, title, date, start_time').eq('business_id', staff.business_id).gte('date', new Date().toISOString().split('T')[0]).order('date', { ascending: true }).limit(3),
      ])

      const hotDeals = dealsData.data?.length || 0
      const pipelineValue = dealsData.data?.reduce((sum: number, d: any) => sum + (d.value || 0), 0) || 0
      const pendingTasks = tasksData.data?.length || 0
      const teamMembers = staffData.data?.length || 0

      // Real revenue from paid invoices this month vs last month
      const now = new Date()
      const thisMonth = now.getMonth()
      const lastMonth = thisMonth === 0 ? 11 : thisMonth - 1
      const thisYear = now.getFullYear()
      const lastYear = thisMonth === 0 ? thisYear - 1 : thisYear

      const paidInvoices = invoicesData.data?.filter((i: any) => i.status === 'paid') || []
      const thisMonthRevenue = paidInvoices
        .filter((i: any) => {
          const d = new Date(i.created_at)
          return d.getMonth() === thisMonth && d.getFullYear() === thisYear
        })
        .reduce((sum: number, i: any) => sum + (i.total || 0), 0)
      const lastMonthRevenue = paidInvoices
        .filter((i: any) => {
          const d = new Date(i.created_at)
          return d.getMonth() === lastMonth && d.getFullYear() === (thisMonth === 0 ? lastYear : thisYear)
        })
        .reduce((sum: number, i: any) => sum + (i.total || 0), 0)

      const change = lastMonthRevenue > 0
        ? Math.round(((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100)
        : null
      setRevenueChange(change)

      // Revenue chart: last 7 months of paid invoices
      const monthlyRevenue: number[] = []
      for (let i = 6; i >= 0; i--) {
        const targetDate = new Date(thisYear, thisMonth - i, 1)
        const monthRev = paidInvoices
          .filter((inv: any) => {
            const d = new Date(inv.created_at)
            return d.getMonth() === targetDate.getMonth() && d.getFullYear() === targetDate.getFullYear()
          })
          .reduce((sum: number, inv: any) => sum + (inv.total || 0), 0)
        monthlyRevenue.push(monthRev)
      }
      const maxRev = Math.max(...monthlyRevenue, 1)
      setRevenueData(monthlyRevenue.map((r) => Math.max((r / maxRev) * 100, 4)))

      setStats({
        hotDeals,
        pipelineValue,
        pendingTasks,
        teamMembers,
        thisMonthRevenue,
        hotDealsChange: 0,
        pipelineChange: 0,
        tasksChange: 0,
        teamChange: 0,
      })

      // Real activities from recent deals and tasks
      const realActivities: any[] = []
      recentDealsData.data?.forEach((deal: any) => {
        realActivities.push({
          id: `deal-${deal.id}`,
          type: 'deal',
          text: `Deal: ${deal.title} — ${formatCurrency(deal.value || 0)} (${deal.stage})`,
          time: new Date(deal.created_at).toLocaleDateString(),
          icon: Flame,
          color: BRAND.danger,
        })
      })
      recentTasksData.data?.forEach((task: any) => {
        realActivities.push({
          id: `task-${task.id}`,
          type: 'task',
          text: `Task ${task.status === 'completed' ? 'completed' : 'created'}: ${task.title}`,
          time: new Date(task.created_at).toLocaleDateString(),
          icon: CheckSquare,
          color: BRAND.primary,
        })
      })
      setActivities(realActivities.slice(0, 5))

      // Real upcoming: pending tasks + meetings
      const realUpcoming: any[] = []
      tasksData.data?.forEach((task: any) => {
        realUpcoming.push({
          id: `task-${task.id}`,
          text: task.title,
          time: task.due_date ? new Date(task.due_date).toLocaleDateString() : 'No due date',
          priority: task.priority || 'normal',
        })
      })
      upcomingMeetingsData.data?.forEach((meeting: any) => {
        realUpcoming.push({
          id: `meeting-${meeting.id}`,
          text: `Meeting: ${meeting.title}`,
          time: `${meeting.date} at ${meeting.start_time}`,
          priority: 'high',
        })
      })
      setUpcoming(realUpcoming.slice(0, 5))
    } catch (error) {
      console.error('Error loading dashboard:', error)
      setStats(null)
      setActivities([])
      setUpcoming([])
      setRevenueData([])
    }
    setLoading(false)
  }

  const getUserName = () => {
    if (!staff) return 'User'
    return staff.full_name?.split(' ')[0] || staff.name?.split(' ')[0] || 'User'
  }

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
                {t('welcome', 'Welcome back')}, <span className="font-medium" style={{ color: BRAND.text }}>{getUserName()}</span>
              </div>
              <div className="text-sm mt-2" style={{ color: BRAND.textMuted }}>Revenue this month</div>
              <div className="text-[38px] font-semibold mt-1" style={{ 
                letterSpacing: '-0.01em',
                color: BRAND.text
              }}>
                {stats?.thisMonthRevenue ? formatCurrency(stats.thisMonthRevenue) : '₦0'}
              </div>
            </div>
            {/* Mini chart */}
            <div className="flex items-end gap-1 mt-4">
              {revenueData.length > 0 ? revenueData.map((height, i) => (
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
              )) : (
                <span className="text-xs" style={{ color: BRAND.textMuted }}>No revenue data yet</span>
              )}
              {revenueChange !== null && (
                <span className="text-xs font-semibold ml-3 mb-0.5" style={{ color: revenueChange >= 0 ? BRAND.success : BRAND.danger }}>
                  {revenueChange >= 0 ? '+' : ''}{revenueChange}%
                </span>
              )}
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
                className="block p-5 rounded-2xl transition-all hover:-translate-y-0.5"
                style={{ 
                  backgroundColor: BRAND.surfaceElevated,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 4px 8px rgba(0,0,0,0.04)'
                }}
              >
                <div 
                  className="w-12 h-12 rounded-xl flex items-center justify-center mb-3 transition-transform group-hover:scale-105"
                  style={{ backgroundColor: mod.bg }}
                >
                  <Icon size={24} style={{ color: mod.color }} />
                </div>
                <div className="text-sm font-semibold" style={{ color: BRAND.text }}>{label}</div>
                <div className="text-xs mt-1" style={{ color: BRAND.textMuted }}>
                  {key === 'crm' ? 'Manage relationships' :
                   key === 'finance' ? 'Track money flow' :
                   key === 'projects' ? 'Track progress' : 'Team directory'}
                </div>
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
          <Card className="p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-sm font-semibold" style={{ color: BRAND.text }}>Recent activity</h3>
              <Link 
                to="/app/activity"
                className="text-xs flex items-center gap-1 transition hover:gap-2"
                style={{ color: BRAND.primary }}
              >
                View all <ArrowRight size={12} />
              </Link>
            </div>
            <div className="space-y-1">
              {activities.map((activity, i) => {
                const Icon = activity.icon
                return (
                  <div 
                    key={activity.id} 
                    className="flex items-start gap-4 p-3 rounded-xl hover:bg-[var(--av-surface)] transition-colors cursor-pointer"
                  >
                    <div 
                      className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                      style={{ backgroundColor: activity.color + '15' }}
                    >
                      <Icon size={18} style={{ color: activity.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm" style={{ color: BRAND.text }}>{activity.text}</div>
                      <div className="text-xs mt-1 flex items-center gap-1" style={{ color: BRAND.textMuted }}>
                        <Clock size={12} />
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
          <Card className="p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-sm font-semibold" style={{ color: BRAND.text }}>Upcoming</h3>
              <Link 
                to="/app/calendar"
                className="text-xs flex items-center gap-1 transition hover:gap-2"
                style={{ color: BRAND.primary }}
              >
                View calendar <ArrowRight size={12} />
              </Link>
            </div>
            <div className="space-y-1">
              {upcoming.map((item, i) => {
                const dotColor = item.priority === 'high' ? BRAND.danger : 
                                item.priority === 'medium' ? BRAND.warning : BRAND.textMuted
                return (
                  <div 
                    key={item.id} 
                    className="flex items-center gap-4 p-3 rounded-xl hover:bg-[var(--av-surface)] transition-colors cursor-pointer"
                  >
                    <div 
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: dotColor }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm truncate" style={{ color: BRAND.text }}>{item.text}</div>
                      <div className="text-xs mt-1 flex items-center gap-1" style={{ color: BRAND.textMuted }}>
                        <Calendar size={12} />
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

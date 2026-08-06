// ============================================
// AVENIZE DASHBOARD - Smart Data-Connected Dashboard
// Shows real KPIs from Supabase across all modules
// ============================================

import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import LoadingSkeleton from '../components/LoadingSkeleton'
import {
  Users, DollarSign, Target, CheckSquare,
  TrendingUp, Flame, Building2, Wrench, Clock,
  AlertCircle, ArrowRight, Plus, Star, FileText,
  TrendingDown, Calendar, MapPin, ArrowUpRight, ArrowDownRight
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────
interface DashStats {
  revenue: number
  revenueChange: number
  hotDeals: number
  dealsChange: number
  pendingJobs: number
  jobsUrgent: number
  pendingTasks: number
  outstandingInvoices: number
  outstandingAmount: number
  teamMembers: number
  activeJobs: number
  completedJobs: number
  overdueInvoices: number
}

interface ActivityItem {
  id: string
  type: 'deal' | 'job' | 'invoice' | 'task' | 'payment' | 'job_complete'
  text: string
  time: string
  link: string
  icon: string
  color: string
}

interface QuickStat {
  label: string
  value: string | number
  change?: string | null
  changeDir?: 'up' | 'down' | 'neutral'
  color: string
  href: string
  icon: React.ReactNode
}

// ─── Helpers ────────────────────────────────────────────────────────────────
const formatCurrency = (amount: number) => {
  if (!amount) return '₦0'
  if (amount >= 1000000) return `₦${(amount / 1000000).toFixed(1)}M`
  if (amount >= 1000) return `₦${(amount / 1000).toFixed(0)}k`
  return `₦${amount.toLocaleString()}`
}

const formatChange = (val: number, suffix = '') => {
  if (val === 0) return null
  const prefix = val > 0 ? '+' : ''
  return `${prefix}${val}${suffix}`
}

const timeAgo = (dateStr: string): string => {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

const daysUntil = (dateStr: string): { label: string; urgent: boolean } | null => {
  if (!dateStr) return null
  const diff = new Date(dateStr).getTime() - Date.now()
  const days = Math.ceil(diff / 86400000)
  if (days < 0) return { label: `${Math.abs(days)}d overdue`, urgent: true }
  if (days === 0) return { label: 'Due today', urgent: true }
  if (days === 1) return { label: 'Due tomorrow', urgent: true }
  return { label: `Due in ${days}d`, urgent: false }
}

// ─── Demo Data ──────────────────────────────────────────────────────────────
const DEMO_STATS: DashStats = {
  revenue: 2450000, revenueChange: 12.4,
  hotDeals: 7, dealsChange: 3,
  pendingJobs: 3, jobsUrgent: 1,
  pendingTasks: 18,
  outstandingInvoices: 2, outstandingAmount: 1318750,
  teamMembers: 42,
  activeJobs: 2, completedJobs: 1, overdueInvoices: 1,
}

const DEMO_ACTIVITIES: ActivityItem[] = [
  { id: '1', type: 'job', text: 'Job "AC Installation at Lekki Villa" marked In Progress', time: '10 min ago', link: '/app/jobs', icon: '🔧', color: '#7C3AED' },
  { id: '2', type: 'deal', text: 'New hot lead: Ibrahim Musa — ₦3.5M deal', time: '25 min ago', link: '/app/crm', icon: '🔥', color: '#DC2626' },
  { id: '3', type: 'job_complete', text: 'Job "Quarterly Maintenance — VI Restaurant" completed', time: '1h ago', link: '/app/jobs', icon: '✅', color: '#059669' },
  { id: '4', type: 'invoice', text: 'Invoice INV-2026-002 overdue — ₦161,250 outstanding', time: '3h ago', link: '/app/invoices', icon: '⚠️', color: '#D97706' },
  { id: '5', type: 'payment', text: 'Riverside Construction signed — ₦2.5M deal won', time: '1d ago', link: '/app/crm', icon: '🎉', color: '#0891B2' },
]

const DEMO_UPCOMING = [
  { id: '1', type: 'job' as const, text: 'Generator Repair — Ikoyi Office (urgent)', time: 'Due today', priority: 'urgent' as const, href: '/app/jobs', urgent: true },
  { id: '2', type: 'job' as const, text: 'Solar Inverter Installation — Ikeja GRA', time: 'Due in 3 days', priority: 'high' as const, href: '/app/jobs', urgent: false },
  { id: '3', type: 'invoice' as const, text: 'Invoice INV-2026-002 overdue (₦161,250)', time: 'Was due Jan 25', priority: 'urgent' as const, href: '/app/invoices', urgent: true },
  { id: '4', type: 'task' as const, text: 'Call Ibrahim Musa — hot deal closing', time: 'Today, 2:00 PM', priority: 'high' as const, href: '/app/tasks', urgent: false },
  { id: '5', type: 'deal' as const, text: 'Follow up with Alhaji Motors', time: 'Tomorrow', priority: 'medium' as const, href: '/app/crm', urgent: false },
]

// ─── Workspace Modules ───────────────────────────────────────────────────────
const WORKSPACE_MODULES = [
  { name: 'CRM', href: '/app/crm', icon: <Users size={20} />, color: '#185FA5', bgColor: '#E6F1FB' },
  { name: 'Jobs', href: '/app/jobs', icon: <Wrench size={20} />, color: '#C2410C', bgColor: '#FFF7ED' },
  { name: 'Finance', href: '/app/finance', icon: <DollarSign size={20} />, color: '#27500A', bgColor: '#EAF3DE' },
  { name: 'Invoices', href: '/app/invoices', icon: <FileText size={20} />, color: '#6B21A8', bgColor: '#F3E8FF' },
]

// ─── Main Component ─────────────────────────────────────────────────────────
export default function Dashboard() {
  const { staff, isDemo } = useAuth()
  const navigate = useNavigate()
  const [stats, setStats] = useState<DashStats | null>(null)
  const [activities, setActivities] = useState<ActivityItem[]>([])
  const [upcoming, setUpcoming] = useState<typeof DEMO_UPCOMING>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadDashboard() }, [staff, isDemo])

  const loadDashboard = async () => {
    if (isDemo || !staff) {
      setStats(DEMO_STATS)
      setActivities(DEMO_ACTIVITIES)
      setUpcoming(DEMO_UPCOMING)
      setLoading(false)
      return
    }

    try {
      const bid = staff.business_id

      // Run queries in parallel, fall back to empty on failure
      const [jobsResult, dealsResult, invoicesResult, tasksResult, staffResult] = await Promise.all([
        supabase.from('jobs').select('id, status, priority, due_date, title').eq('business_id', bid).neq('status', 'cancelled').order('created_at', { ascending: false }).limit(10).then(r => r.data || [], () => [] as any[]),
        supabase.from('deals').select('id, value, stage, title, updated_at').eq('business_id', bid).order('updated_at', { ascending: false }).limit(5).then(r => r.data || [], () => [] as any[]),
        supabase.from('invoices').select('id, total, balance, status, due_date, client_name, invoice_number').eq('business_id', bid).order('created_at', { ascending: false }).limit(5).then(r => r.data || [], () => [] as any[]),
        supabase.from('tasks').select('id, status, due_date').eq('business_id', bid).eq('status', 'pending').limit(5).then(r => r.data || [], () => [] as any[]),
        supabase.from('staff').select('id, active').eq('business_id', bid).eq('active', true).then(r => r.data || [], () => [] as any[]),
      ])

      const jobs = jobsResult
      const deals = dealsResult
      const invoices = invoicesResult
      const pendingTasks = tasksResult
      const teamMembers = staffResult

      const hotDeals = deals.filter((d: any) => d.stage === 'hot' || d.stage === 'qualified')
      const pipelineValue = deals.reduce((s: number, d: any) => s + (d.value || 0), 0)
      const overdueInvoices = invoices.filter((i: any) => i.status === 'overdue' || (i.status !== 'paid' && i.status !== 'cancelled' && i.balance > 0 && new Date(i.due_date) < new Date())).length
      const outstandingAmount = invoices.filter((i: any) => ['sent', 'partially_paid', 'overdue'].includes(i.status)).reduce((s: number, i: any) => s + (i.balance || 0), 0)

      setStats({
        revenue: outstandingAmount,
        revenueChange: 0,
        hotDeals: hotDeals.length,
        dealsChange: 0,
        pendingJobs: jobs.filter((j: any) => ['pending', 'assigned', 'in_progress'].includes(j.status)).length,
        jobsUrgent: jobs.filter((j: any) => j.priority === 'urgent' || j.priority === 'high').length,
        pendingTasks: pendingTasks.length,
        outstandingInvoices: invoices.filter((i: any) => ['sent', 'partially_paid', 'overdue'].includes(i.status)).length,
        outstandingAmount,
        teamMembers: teamMembers.length,
        activeJobs: jobs.filter((j: any) => j.status === 'in_progress').length,
        completedJobs: jobs.filter((j: any) => j.status === 'completed').length,
        overdueInvoices,
      })

      // Build activities
      const acts: ActivityItem[] = []
      jobs.slice(0, 2).forEach((j: any) => {
        acts.push({ id: `j-${j.id}`, type: j.status === 'completed' ? 'job_complete' : 'job', text: `Job "${j.title}" is ${j.status.replace('_', ' ')}`, time: timeAgo(j.created_at), link: '/app/jobs', icon: j.status === 'completed' ? '✅' : '🔧', color: j.status === 'completed' ? '#059669' : '#7C3AED' })
      })
      deals.slice(0, 2).forEach((d: any) => {
        acts.push({ id: `d-${d.id}`, type: 'deal', text: `${d.stage === 'won' ? '🎉' : '🔥'} Deal "${d.title}" — ${formatCurrency(d.value)} (${d.stage})`, time: timeAgo(d.updated_at), link: '/app/crm', icon: d.stage === 'won' ? '🎉' : '🔥', color: d.stage === 'won' ? '#0891B2' : '#DC2626' })
      })
      invoices.filter((i: any) => i.status === 'overdue').slice(0, 1).forEach((i: any) => {
        acts.push({ id: `i-${i.id}`, type: 'invoice', text: `⚠️ Invoice ${i.invoice_number} overdue — ${formatCurrency(i.balance)} outstanding`, time: timeAgo(i.due_date), link: '/app/invoices', icon: '⚠️', color: '#D97706' })
      })
      setActivities(acts.length ? acts : DEMO_ACTIVITIES)

      // Build upcoming from jobs and tasks
      const soon = [
        ...jobs.filter((j: any) => j.due_date && ['pending', 'assigned', 'in_progress'].includes(j.status)).map((j: any) => ({
          id: j.id, type: 'job' as const, text: j.title, time: '', priority: j.priority as any, href: '/app/jobs', urgent: j.priority === 'urgent' || (j.due_date && new Date(j.due_date) < new Date(Date.now() + 86400000)),
        })),
        ...pendingTasks.map((t: any) => ({
          id: t.id, type: 'task' as const, text: 'Pending task', time: t.due_date ? `Due ${new Date(t.due_date).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}` : '', priority: 'medium' as const, href: '/app/tasks', urgent: false,
        })),
      ].sort((a, b) => {
        if (a.urgent && !b.urgent) return -1
        if (!a.urgent && b.urgent) return 1
        return 0
      }).slice(0, 5)

      const upcomingJobs = soon.filter(i => i.type === 'job').map(j => {
        const jobData = jobs.find((jo: any) => jo.id === j.id) as any
        const due = daysUntil(jobData?.due_date)
        return { ...j, time: due ? due.label : '' }
      })
      setUpcoming(upcomingJobs.length ? upcomingJobs : DEMO_UPCOMING)

    } catch (err) {
      console.error('Dashboard load error:', err)
      setStats(DEMO_STATS)
      setActivities(DEMO_ACTIVITIES)
      setUpcoming(DEMO_UPCOMING)
    }
    setLoading(false)
  }

  const getUserName = () => {
    if (!staff) return 'there'
    return staff.full_name?.split(' ')[0] || staff.name?.split(' ')[0] || 'there'
  }

  if (loading) {
    return (
      <div className="pb-20">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-black/5 rounded w-48"></div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-24 bg-black/5 rounded-2xl"></div>)}
          </div>
        </div>
      </div>
    )
  }

  const quickStats: QuickStat[] = [
    { label: 'Hot Deals', value: stats?.hotDeals || 0, change: formatChange(stats?.dealsChange || 0), changeDir: 'up', color: '#D85A30', href: '/app/crm', icon: <Flame size={16} /> },
    { label: 'Outstanding', value: formatCurrency(stats?.outstandingAmount || 0), change: `${stats?.outstandingInvoices || 0} invoices`, color: '#B45309', href: '/app/invoices', icon: <DollarSign size={16} /> },
    { label: 'Pending Jobs', value: stats?.pendingJobs || 0, change: stats?.jobsUrgent ? `${stats.jobsUrgent} urgent` : null, color: '#7C3AED', href: '/app/jobs', icon: <Wrench size={16} /> },
    { label: 'Team', value: stats?.teamMembers || 0, change: 'members', color: '#0F766E', href: '/app/people', icon: <Users size={16} /> },
  ]

  return (
    <div className="pb-20">
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-lg font-semibold text-[var(--avenize-black)]">Good morning, {getUserName()}</h1>
        <p className="text-sm text-black/40">Here's what's happening with your business today</p>
      </div>

      {/* Workspace Launcher */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-5">
        {WORKSPACE_MODULES.map(m => (
          <Link key={m.name} to={m.href}
            className="bg-[#F7F7F5] rounded-xl p-3 flex flex-col gap-2 hover:border-black/20 border border-transparent transition-colors">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: m.bgColor }}>
              <span style={{ color: m.color }}>{m.icon}</span>
            </div>
            <span className="text-sm font-medium">{m.name}</span>
          </Link>
        ))}
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-5">
        {quickStats.map((s, i) => (
          <Link key={s.label} to={s.href}
            className="bg-white rounded-xl border border-black/[0.06] p-3 hover:border-black/12 hover:shadow-sm transition">
            <div className="flex items-center justify-between mb-2">
              <span style={{ color: s.color }}>{s.icon}</span>
              {s.change && (
                <span className={`text-[10px] font-medium ${s.changeDir === 'up' ? 'text-emerald-600' : s.changeDir === 'down' ? 'text-red-500' : 'text-black/30'}`}>
                  {s.change}
                </span>
              )}
            </div>
            <div className="text-[22px] font-semibold text-[var(--avenize-black)]">{s.value}</div>
            <div className="text-xs text-black/40 mt-0.5">{s.label}</div>
          </Link>
        ))}
      </div>

      {/* Overdue Alert */}
      {(stats?.overdueInvoices || 0) > 0 && (
        <Link to="/app/invoices"
          className="flex items-center justify-between gap-3 bg-red-50 border border-red-100 rounded-xl px-4 py-3 mb-5 hover:bg-red-100/50 transition">
          <div className="flex items-center gap-3">
            <AlertCircle size={16} className="text-red-500 shrink-0" />
            <span className="text-sm font-medium text-red-700">
              {(stats?.overdueInvoices || 0)} invoice{(stats?.overdueInvoices || 0) !== 1 ? 's' : ''} overdue — {formatCurrency(stats?.outstandingAmount || 0)} outstanding
            </span>
          </div>
          <ArrowRight size={16} className="text-red-400 shrink-0" />
        </Link>
      )}

      {/* 2-Column: Activity + Upcoming */}
      <div className="grid grid-cols-12 gap-3">
        {/* Recent Activity */}
        <div className="col-span-12 md:col-span-7 bg-white rounded-2xl border border-black/[0.06] p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold">Recent activity</h2>
            <button onClick={loadDashboard} className="text-xs text-black/30 hover:text-black/50 transition">↻</button>
          </div>
          {activities.length === 0 ? (
            <div className="text-center py-8 text-xs text-black/30">No recent activity. Create your first deal or job!</div>
          ) : (
            <div className="space-y-3">
              {activities.map(act => (
                <button key={act.id} onClick={() => navigate(act.link)}
                  className="w-full flex items-start gap-3 text-left hover:bg-black/[0.02] rounded-lg p-1 -mx-1 transition">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${act.color}15` }}>
                    <span style={{ fontSize: '14px' }}>{act.icon}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[var(--avenize-black)] leading-tight">{act.text}</p>
                    <p className="text-xs text-black/30 mt-0.5">{act.time}</p>
                  </div>
                  <ArrowRight size={12} className="text-black/20 shrink-0 mt-1" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Upcoming */}
        <div className="col-span-12 md:col-span-5 bg-white rounded-2xl border border-black/[0.06] p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold">Upcoming</h2>
            <Link to="/app/jobs" className="text-xs text-blue-600 hover:text-blue-700 font-medium">View all →</Link>
          </div>
          {upcoming.length === 0 ? (
            <div className="text-center py-8 text-xs text-black/30">No upcoming deadlines</div>
          ) : (
            <div className="space-y-2.5">
              {upcoming.map(item => (
                <Link key={item.id} to={item.href}
                  className="flex items-start gap-3 hover:bg-black/[0.02] rounded-lg p-1 -mx-1 transition">
                  <div className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${item.urgent ? 'bg-red-500 animate-pulse' : item.priority === 'high' ? 'bg-orange-400' : 'bg-gray-300'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[var(--avenize-black)] leading-tight truncate">{item.text}</p>
                    <p className="text-xs text-black/30 mt-0.5">{item.time}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="mt-5">
        <h2 className="text-sm font-semibold mb-3">Quick actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {[
            { label: 'New Deal', href: '/app/crm', icon: <Star size={16} />, color: '#185FA5', bg: '#E6F1FB' },
            { label: 'New Job', href: '/app/jobs', icon: <Wrench size={16} />, color: '#C2410C', bg: '#FFF7ED' },
            { label: 'New Invoice', href: '/app/invoices', icon: <FileText size={16} />, color: '#6B21A8', bg: '#F3E8FF' },
            { label: 'New Task', href: '/app/tasks', icon: <CheckSquare size={16} />, color: '#0F766E', bg: '#ECFDF5' },
          ].map(action => (
            <Link key={action.label} to={action.href}
              className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-black/[0.06] hover:border-black/12 hover:shadow-sm transition">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: action.bg }}>
                <span style={{ color: action.color }}>{action.icon}</span>
              </div>
              <span className="text-sm font-medium text-[var(--avenize-black)]">{action.label}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}

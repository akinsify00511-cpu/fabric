import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { useLocale } from '../lib/LocaleContext'
import { supabase } from '../lib/supabase'
import FabricViewEngine from '../components/FabricViewEngine'
import {
  ArrowRight,
  Calendar,
  CheckSquare,
  Clock,
  DollarSign,
  Flame,
  Target,
  TrendingUp,
  Users,
} from 'lucide-react'

const BRAND = {
  text: '#202124',
  muted: '#64748B',
  soft: '#F8FAFC',
  border: '#E8EAED',
  primary: 'var(--av-primary)',
  success: 'var(--av-success)',
  danger: 'var(--av-danger)',
}

const formatCurrency = (amount: number) => {
  if (amount >= 1_000_000) return `₦${(amount / 1_000_000).toFixed(1)}M`
  if (amount >= 1_000) return `₦${(amount / 1_000).toFixed(0)}k`
  return `₦${amount.toLocaleString()}`
}

function QuickStat({
  label,
  value,
  change,
  href,
  icon: Icon,
  tone = 'neutral',
}: {
  label: string
  value: string | number
  change?: string
  href: string
  icon: React.ElementType
  tone?: 'positive' | 'negative' | 'neutral'
}) {
  const iconClass = tone === 'positive' ? 'bg-emerald-50 text-emerald-600' : tone === 'negative' ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-700'
  const changeClass = tone === 'positive' ? 'text-emerald-600' : tone === 'negative' ? 'text-red-600' : 'text-slate-400'

  return (
    <Link to={href} className="group rounded-3xl bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,.04),0_6px_18px_rgba(0,0,0,.035)] transition hover:-translate-y-0.5 hover:shadow-lg">
      <div className="flex items-center justify-between">
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${iconClass}`}><Icon size={17} /></span>
        {change && <span className={`text-[11px] font-semibold ${changeClass}`}>{change}</span>}
      </div>
      <div className="mt-4 text-2xl font-semibold tracking-[-0.03em] text-slate-950">{value}</div>
      <div className="mt-1 text-xs text-slate-400">{label}</div>
    </Link>
  )
}

function SectionHeader({ title, action, href }: { title: string; action?: string; href?: string }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      {action && href && <Link to={href} className="flex items-center gap-1 text-xs font-medium text-slate-500 transition hover:text-slate-900">{action}<ArrowRight size={12} /></Link>}
    </div>
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
  const [revenueLabels, setRevenueLabels] = useState<string[]>([])
  const [revenueChange, setRevenueChange] = useState<number | null>(null)

  useEffect(() => {
    loadDashboardData()
  }, [staff?.business_id])

  const loadDashboardData = async () => {
    if (!staff?.business_id) {
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const businessId = staff.business_id
      const [dealsData, tasksData, staffData, invoicesData, recentDealsData, recentTasksData, upcomingMeetingsData] = await Promise.all([
        supabase.from('deals').select('value, stage').eq('business_id', businessId).eq('stage', 'hot'),
        supabase.from('tasks').select('id, title, due_date, priority, status').eq('business_id', businessId).eq('status', 'pending').order('due_date', { ascending: true }).limit(5),
        supabase.from('staff').select('id').eq('business_id', businessId),
        supabase.from('invoices').select('total, status, created_at').eq('business_id', businessId).order('created_at', { ascending: false }),
        supabase.from('deals').select('id, title, value, stage, created_at').eq('business_id', businessId).order('created_at', { ascending: false }).limit(5),
        supabase.from('tasks').select('id, title, status, created_at').eq('business_id', businessId).order('created_at', { ascending: false }).limit(3),
        supabase.from('meetings').select('id, title, date, start_time').eq('business_id', businessId).gte('date', new Date().toISOString().split('T')[0]).order('date', { ascending: true }).limit(3),
      ])

      if (dealsData.error) throw dealsData.error
      if (tasksData.error) throw tasksData.error
      if (staffData.error) throw staffData.error
      if (invoicesData.error) throw invoicesData.error

      const hotDeals = dealsData.data?.length || 0
      const pipelineValue = dealsData.data?.reduce((sum: number, d: any) => sum + (d.value || 0), 0) || 0
      const pendingTasks = tasksData.data?.length || 0
      const teamMembers = staffData.data?.length || 0
      const paidInvoices = invoicesData.data?.filter((i: any) => i.status === 'paid') || []
      const now = new Date()
      const thisMonth = now.getMonth()
      const thisYear = now.getFullYear()
      const previousMonthDate = new Date(thisYear, thisMonth - 1, 1)

      const revenueFor = (month: number, year: number) => paidInvoices
        .filter((invoice: any) => {
          const date = new Date(invoice.created_at)
          return date.getMonth() === month && date.getFullYear() === year
        })
        .reduce((sum: number, invoice: any) => sum + (invoice.total || 0), 0)

      const thisMonthRevenue = revenueFor(thisMonth, thisYear)
      const lastMonthRevenue = revenueFor(previousMonthDate.getMonth(), previousMonthDate.getFullYear())
      const change = lastMonthRevenue > 0 ? Math.round(((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100) : null
      setRevenueChange(change)

      const monthlyRevenue: number[] = []
      const labels: string[] = []
      for (let i = 6; i >= 0; i--) {
        const target = new Date(thisYear, thisMonth - i, 1)
        monthlyRevenue.push(revenueFor(target.getMonth(), target.getFullYear()))
        labels.push(target.toLocaleDateString(undefined, { month: 'short' }))
      }
      setRevenueData(monthlyRevenue)
      setRevenueLabels(labels)

      setStats({ hotDeals, pipelineValue, pendingTasks, teamMembers, thisMonthRevenue })

      const realActivities: any[] = []
      recentDealsData.data?.forEach((deal: any) => realActivities.push({
        id: `deal-${deal.id}`, text: `Deal: ${deal.title} — ${formatCurrency(deal.value || 0)}`, time: new Date(deal.created_at).toLocaleDateString(), icon: Flame, color: '#DC2626',
      }))
      recentTasksData.data?.forEach((task: any) => realActivities.push({
        id: `task-${task.id}`, text: `Task ${task.status === 'completed' ? 'completed' : 'created'}: ${task.title}`, time: new Date(task.created_at).toLocaleDateString(), icon: CheckSquare, color: '#475569',
      }))
      setActivities(realActivities.slice(0, 5))

      const realUpcoming: any[] = []
      tasksData.data?.forEach((task: any) => realUpcoming.push({
        id: `task-${task.id}`, text: task.title, time: task.due_date ? new Date(task.due_date).toLocaleDateString() : 'No due date', priority: task.priority || 'normal',
      }))
      upcomingMeetingsData.data?.forEach((meeting: any) => realUpcoming.push({
        id: `meeting-${meeting.id}`, text: `Meeting: ${meeting.title}`, time: `${meeting.date} at ${meeting.start_time}`, priority: 'high',
      }))
      setUpcoming(realUpcoming.slice(0, 5))
    } catch (error) {
      console.error('Error loading dashboard:', error)
      setStats(null)
      setActivities([])
      setUpcoming([])
      setRevenueData([])
      setRevenueLabels([])
    } finally {
      setLoading(false)
    }
  }

  const userName = staff?.full_name?.split(' ')[0] || staff?.name?.split(' ')[0] || 'there'
  const attentionCount = (stats?.pendingTasks || 0) + activities.filter(item => item.id.startsWith('deal-')).length
  const breakdown = useMemo(() => [
    { label: 'Hot deals', value: String(stats?.hotDeals || 0), tone: 'neutral' as const },
    { label: 'Pipeline', value: formatCurrency(stats?.pipelineValue || 0), tone: 'positive' as const },
    { label: 'Pending tasks', value: String(stats?.pendingTasks || 0), tone: 'neutral' as const },
    { label: 'Team members', value: String(stats?.teamMembers || 0), tone: 'positive' as const },
  ], [stats])

  if (loading) {
    return (
      <div className="space-y-4 pb-20">
        <div className="h-28 animate-pulse rounded-3xl bg-slate-100" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{[1, 2, 3, 4].map(item => <div key={item} className="h-32 animate-pulse rounded-3xl bg-slate-100" />)}</div>
        <div className="h-72 animate-pulse rounded-3xl bg-slate-100" />
      </div>
    )
  }

  return (
    <div className="min-w-0 pb-20">
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">FABRIC</div>
          <h1 className="mt-1 text-3xl font-semibold tracking-[-0.04em] text-slate-950">{t('welcome', 'Good morning')}, {userName}</h1>
          <p className="mt-1 text-sm text-slate-500">Here's what needs your attention.</p>
        </div>
        <Link to="/app/search" className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-950">Search your business</Link>
      </div>

      <div className="mb-6 rounded-3xl bg-slate-950 p-5 text-white shadow-[0_8px_30px_rgba(15,23,42,.12)] sm:p-6">
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-center">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Today at a glance</div>
            <div className="mt-2 text-2xl font-semibold tracking-[-0.03em]">{attentionCount} things may need you</div>
            <div className="mt-1 text-sm text-slate-400">Open the work behind each number instead of hunting through modules.</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/app/tasks" className="rounded-full bg-white px-4 py-2 text-xs font-semibold text-slate-950 transition hover:bg-slate-100">My work</Link>
            <Link to="/app/approvals" className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold text-white transition hover:bg-white/10">Approvals</Link>
          </div>
        </div>
      </div>

      <SectionHeader title="Business pulse" />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <QuickStat label="Hot deals" value={stats?.hotDeals || 0} change="Pipeline" href="/app/crm" icon={Flame} tone="negative" />
        <QuickStat label="Pipeline value" value={formatCurrency(stats?.pipelineValue || 0)} change="Open" href="/app/crm" icon={TrendingUp} tone="positive" />
        <QuickStat label="Pending tasks" value={stats?.pendingTasks || 0} change="Needs action" href="/app/tasks" icon={CheckSquare} />
        <QuickStat label="Team members" value={stats?.teamMembers || 0} change="People" href="/app/people" icon={Users} tone="positive" />
      </div>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-8">
          <FabricViewEngine
            widgetKey="dashboard.revenue"
            title="Revenue this month"
            value={formatCurrency(stats?.thisMonthRevenue || 0)}
            change={revenueChange === null ? undefined : `${revenueChange >= 0 ? '+' : ''}${revenueChange}% vs last month`}
            data={revenueData}
            dataLabels={revenueLabels}
            breakdown={breakdown}
            defaultView="trend"
            description="Choose the representation that makes the number easiest for you to understand. Your choice is remembered on this device."
          />
        </div>

        <div className="col-span-12 lg:col-span-4">
          <FabricViewEngine
            widgetKey="dashboard.business-summary"
            title="Business summary"
            value={`${stats?.teamMembers || 0} people`}
            breakdown={breakdown}
            defaultView="breakdown"
            description="A compact view of the operating picture."
          />
        </div>

        <div className="col-span-12 lg:col-span-7">
          <section className="rounded-3xl bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,.04),0_8px_24px_rgba(0,0,0,.04)]">
            <SectionHeader title="Recent activity" action="View all" href="/app/activity" />
            <div className="space-y-1">
              {activities.length === 0 && <div className="rounded-2xl bg-slate-50 p-6 text-center text-xs text-slate-400">No recent activity yet.</div>}
              {activities.map(activity => {
                const Icon = activity.icon
                return (
                  <div key={activity.id} className="flex items-start gap-3 rounded-2xl p-3 transition hover:bg-slate-50">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100" style={{ color: activity.color }}><Icon size={16} /></span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-slate-700">{activity.text}</div>
                      <div className="mt-1 flex items-center gap-1 text-[11px] text-slate-400"><Clock size={11} />{activity.time}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        </div>

        <div className="col-span-12 lg:col-span-5">
          <section className="rounded-3xl bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,.04),0_8px_24px_rgba(0,0,0,.04)]">
            <SectionHeader title="Your work" action="Calendar" href="/app/calendar" />
            <div className="space-y-1">
              {upcoming.length === 0 && <div className="rounded-2xl bg-slate-50 p-6 text-center text-xs text-slate-400">You're clear for now.</div>}
              {upcoming.map(item => (
                <div key={item.id} className="flex items-center gap-3 rounded-2xl p-3 transition hover:bg-slate-50">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${item.priority === 'high' ? 'bg-red-500' : item.priority === 'medium' ? 'bg-amber-500' : 'bg-slate-300'}`} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-slate-700">{item.text}</div>
                    <div className="mt-1 flex items-center gap-1 text-[11px] text-slate-400"><Calendar size={11} />{item.time}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      <SectionHeader title="Workspaces" />
      <div className="grid grid-cols-2 gap-3 pb-4 sm:grid-cols-4">
        {[
          { label: 'CRM', description: 'Relationships', href: '/app/crm', icon: Users },
          { label: 'Finance', description: 'Money flow', href: '/app/finance', icon: DollarSign },
          { label: 'Projects', description: 'Progress', href: '/app/projects', icon: Target },
          { label: 'People', description: 'Team', href: '/app/people', icon: Users },
        ].map(item => {
          const Icon = item.icon
          return (
            <Link key={item.label} to={item.href} className="rounded-3xl bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,.04)] transition hover:-translate-y-0.5 hover:shadow-lg">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700"><Icon size={18} /></span>
              <div className="mt-3 text-sm font-semibold text-slate-900">{item.label}</div>
              <div className="mt-1 text-xs text-slate-400">{item.description}</div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

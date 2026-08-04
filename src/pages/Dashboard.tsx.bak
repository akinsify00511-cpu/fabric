import { useEffect, useState } from 'react'
import { 
  Wallet, Users2, FolderKanban, TrendingUp, Clock, 
  AlertCircle, CheckCircle2, ArrowUpRight, ArrowDownRight,
  DollarSign, Package, FileText, Bell, Calendar, 
  BarChart3, Target, Zap, Crown, Star, Heart
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth, ROLE_CONFIG } from '../lib/AuthContext'

type Activity = { id: string; label: string; detail: string; at: string; type: string }

export default function Dashboard() {
  const { staff } = useAuth()
  const [data, setData] = useState({
    revenue: 0,
    leads: 0,
    projects: 0,
    tasks: 0,
    invoices: 0,
    cashFlow: 0,
  })
  const [activity, setActivity] = useState<Activity[]>([])
  const [alerts, setAlerts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // Get greeting based on time
  const getGreeting = () => {
    const hour = new Date().getHours()
    if (hour < 12) return 'Good morning'
    if (hour < 17) return 'Good afternoon'
    return 'Good evening'
  }

  // Get first name
  const getFirstName = () => {
    return staff?.full_name?.split(' ')[0] || 'there'
  }

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  }

  useEffect(() => {
    const load = async () => {
      if (!staff?.business_id) return
      
      setLoading(true)
      try {
        // Fetch multiple data points in parallel
        const [
          { data: wonDeals },
          { count: leadCount },
          { count: projectCount },
          { count: taskCount },
          { data: recentActivity },
          { data: stockAlerts },
          { data: overdueInvoices },
          { count: pendingTasks },
        ] = await Promise.all([
          supabase.from('deals').select('value').eq('stage', 'won').eq('business_id', staff.business_id),
          supabase.from('deals').select('*', { count: 'exact', head: true }).neq('stage', 'lost').neq('stage', 'won').eq('business_id', staff.business_id),
          supabase.from('projects').select('*', { count: 'exact', head: true }).neq('status', 'done').eq('business_id', staff.business_id),
          supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('assigned_to', staff.id).neq('status', 'done'),
          supabase.from('activity_log').select('*').eq('business_id', staff.business_id).order('created_at', { ascending: false }).limit(5),
          supabase.from('inventory').select('*').eq('business_id', staff.business_id).lt('quantity', supabase.rpc('get_reorder_point')),
          supabase.from('invoices').select('total').eq('business_id', staff.business_id).eq('status', 'overdue'),
          supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('assigned_to', staff.id).eq('status', 'pending'),
        ])

        const totalRevenue = (wonDeals ?? []).reduce((sum, d) => sum + (d.value ?? 0), 0)
        const overdueAmount = (overdueInvoices ?? []).reduce((sum, inv) => sum + (inv.total ?? 0), 0)

        setData({
          revenue: totalRevenue,
          leads: leadCount ?? 0,
          projects: projectCount ?? 0,
          tasks: pendingTasks ?? 0,
          invoices: overdueAmount,
          cashFlow: totalRevenue - overdueAmount,
        })

        setActivity((recentActivity ?? []).map((a: any) => ({
          id: a.id,
          label: a.action,
          detail: a.details || '',
          at: a.created_at,
          type: a.type,
        })))

        // Create alerts from stock and invoices
        const newAlerts = []
        
        if ((stockAlerts ?? []).length > 0) {
          newAlerts.push({
            id: 'stock',
            type: 'warning',
            title: '📦 Low Stock Alert',
            message: `${(stockAlerts ?? []).length} items need reordering`,
          })
        }
        
        if ((overdueInvoices ?? []).length > 0) {
          newAlerts.push({
            id: 'invoices',
            type: 'error',
            title: '💸 Overdue Payments',
            message: `${formatCurrency(overdueAmount)} outstanding from ${(overdueInvoices ?? []).length} invoices`,
          })
        }

        setAlerts(newAlerts)
      } catch (err) {
        console.error('Failed to load dashboard:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [staff?.business_id, staff?.id])

  // Role-specific dashboard cards
  const getDashboardCards = () => {
    const role = staff?.role || 'staff'
    const baseCards = [
      { label: 'Revenue', value: formatCurrency(data.revenue), icon: Wallet, tint: 'bg-gradient-to-br from-emerald-500 to-teal-500', textColor: 'text-emerald-600' },
    ]

    switch (role) {
      case 'owner':
      case 'admin':
        return [
          ...baseCards,
          { label: 'Cash Flow', value: formatCurrency(data.cashFlow), icon: TrendingUp, tint: 'bg-gradient-to-br from-blue-500 to-indigo-500', textColor: 'text-blue-600' },
          { label: 'Active Leads', value: data.leads, icon: Target, tint: 'bg-gradient-to-br from-orange-500 to-amber-500', textColor: 'text-orange-600' },
          { label: 'Projects', value: data.projects, icon: FolderKanban, tint: 'bg-gradient-to-br from-purple-500 to-pink-500', textColor: 'text-purple-600' },
        ]
      case 'manager':
      case 'team_lead':
        return [
          ...baseCards,
          { label: 'My Tasks', value: data.tasks, icon: CheckCircle2, tint: 'bg-gradient-to-br from-cyan-500 to-blue-500', textColor: 'text-cyan-600' },
          { label: 'Projects', value: data.projects, icon: FolderKanban, tint: 'bg-gradient-to-br from-rose-500 to-pink-500', textColor: 'text-rose-600' },
          { label: 'Team Leads', value: data.leads, icon: Users2, tint: 'bg-gradient-to-br from-amber-500 to-orange-500', textColor: 'text-amber-600' },
        ]
      case 'staff':
      default:
        return [
          ...baseCards,
          { label: 'My Tasks', value: data.tasks, icon: CheckCircle2, tint: 'bg-gradient-to-br from-teal-500 to-emerald-500', textColor: 'text-teal-600' },
          { label: 'Projects', value: data.projects, icon: FolderKanban, tint: 'bg-gradient-to-br from-indigo-500 to-purple-500', textColor: 'text-indigo-600' },
          { label: 'Leads', value: data.leads, icon: Star, tint: 'bg-gradient-to-br from-pink-500 to-rose-500', textColor: 'text-pink-600' },
        ]
    }
  }

  const cards = getDashboardCards()

  // Quick actions based on role
  const getQuickActions = () => {
    const role = staff?.role || 'staff'
    const actions = [
      { label: 'View Tasks', icon: CheckCircle2, href: '/app/tasks', color: 'from-blue-500 to-indigo-500' },
    ]

    switch (role) {
      case 'owner':
      case 'admin':
        return [
          ...actions,
          { label: 'Add Invoice', icon: FileText, href: '/app/accounting', color: 'from-emerald-500 to-teal-500' },
          { label: 'View Reports', icon: BarChart3, href: '/app/reports', color: 'from-purple-500 to-pink-500' },
        ]
      case 'manager':
      case 'team_lead':
        return [
          ...actions,
          { label: 'Team Overview', icon: Users2, href: '/app/people', color: 'from-amber-500 to-orange-500' },
          { label: 'Add Deal', icon: Target, href: '/app/crm', color: 'from-rose-500 to-pink-500' },
        ]
      default:
        return [
          ...actions,
          { label: 'View Projects', icon: FolderKanban, href: '/app/projects', color: 'from-cyan-500 to-blue-500' },
        ]
    }
  }

  const quickActions = getQuickActions()

  return (
    <div className="pb-20">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--avenize-black)]">
            {getGreeting()}, {getFirstName()} 👋
          </h1>
          <p className="text-sm text-black/50 mt-1">
            {new Date().toLocaleDateString('en-NG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        {staff?.role && (
          <span className={`px-3 py-1.5 rounded-full text-xs font-medium text-white bg-gradient-to-r ${
            staff.role === 'owner' ? 'from-amber-500 to-orange-500' :
            staff.role === 'admin' ? 'from-purple-500 to-pink-500' :
            staff.role === 'manager' ? 'from-blue-500 to-cyan-500' :
            staff.role === 'team_lead' ? 'from-emerald-500 to-teal-500' :
            'from-slate-400 to-slate-500'
          }`}>
            {ROLE_CONFIG[staff.role]?.label || staff.role}
          </span>
        )}
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="mb-6 space-y-3">
          {alerts.map((alert) => (
            <div 
              key={alert.id}
              className={`flex items-center justify-between p-4 rounded-xl border ${
                alert.type === 'error' ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'
              }`}
            >
              <div className="flex items-center gap-3">
                <AlertCircle size={20} className={alert.type === 'error' ? 'text-red-500' : 'text-amber-500'} />
                <div>
                  <p className={`font-medium ${alert.type === 'error' ? 'text-red-700' : 'text-amber-700'}`}>
                    {alert.title}
                  </p>
                  <p className={`text-sm ${alert.type === 'error' ? 'text-red-600' : 'text-amber-600'}`}>
                    {alert.message}
                  </p>
                </div>
              </div>
              <button className={`text-sm font-medium px-3 py-1 rounded-lg ${
                alert.type === 'error' ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
              }`}>
                View
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        {cards.map((card, i) => (
          <div 
            key={card.label} 
            className="bg-white rounded-2xl border border-black/5 p-4 hover:shadow-lg transition-all"
          >
            <div className={`w-10 h-10 rounded-xl ${card.tint} flex items-center justify-center mb-3`}>
              <card.icon size={18} className="text-white" />
            </div>
            <p className="text-xs text-black/50">{card.label}</p>
            <p className="text-xl font-bold text-[var(--avenize-black)] mt-1">
              {loading ? '...' : card.value}
            </p>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="mb-6">
        <h2 className="text-sm font-medium text-black/60 mb-3">Quick Actions</h2>
        <div className="flex flex-wrap gap-2">
          {quickActions.map((action) => (
            <a
              key={action.label}
              href={action.href}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r ${action.color} text-white text-sm font-medium hover:shadow-lg transition-all`}
            >
              <action.icon size={16} />
              {action.label}
            </a>
          ))}
        </div>
      </div>

      {/* Activity & Insights Grid */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Recent Activity */}
        <div className="bg-white rounded-2xl border border-black/5">
          <div className="px-4 py-3 border-b border-black/5 flex items-center justify-between">
            <h2 className="font-semibold text-[var(--avenize-black)]">Recent Activity</h2>
            <button className="text-xs text-[var(--avenize-primary)] font-medium">View all</button>
          </div>
          <div className="divide-y divide-black/5">
            {activity.length > 0 ? activity.map((a) => (
              <div key={a.id} className="px-4 py-3 flex items-start gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center mt-0.5 ${
                  a.type === 'sale' ? 'bg-emerald-100 text-emerald-600' :
                  a.type === 'payment' ? 'bg-blue-100 text-blue-600' :
                  a.type === 'task' ? 'bg-amber-100 text-amber-600' :
                  'bg-slate-100 text-slate-600'
                }`}>
                  {a.type === 'sale' ? <ArrowUpRight size={14} /> :
                   a.type === 'payment' ? <DollarSign size={14} /> :
                   a.type === 'task' ? <CheckCircle2 size={14} /> :
                   <Clock size={14} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--avenize-black)]">{a.label}</p>
                  <p className="text-xs text-black/50 truncate">{a.detail}</p>
                </div>
                <span className="text-xs text-black/30 whitespace-nowrap">
                  {new Date(a.at).toLocaleDateString()}
                </span>
              </div>
            )) : (
              <div className="px-4 py-8 text-center">
                <Clock size={24} className="mx-auto text-black/20 mb-2" />
                <p className="text-sm text-black/40">No recent activity</p>
              </div>
            )}
          </div>
        </div>

        {/* Tips & Reminders */}
        <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl border border-amber-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Zap size={20} className="text-amber-600" />
            <h2 className="font-semibold text-amber-900">Quick Tips</h2>
          </div>
          <div className="space-y-3">
            <div className="flex items-start gap-3 bg-white/60 rounded-xl p-3">
              <Heart size={16} className="text-pink-500 mt-0.5" />
              <p className="text-sm text-amber-800">Keep your pipeline updated daily for better forecasting</p>
            </div>
            <div className="flex items-start gap-3 bg-white/60 rounded-xl p-3">
              <Bell size={16} className="text-amber-500 mt-0.5" />
              <p className="text-sm text-amber-800">Check alerts in the morning to prioritize your day</p>
            </div>
            <div className="flex items-start gap-3 bg-white/60 rounded-xl p-3">
              <Users2 size={16} className="text-purple-500 mt-0.5" />
              <p className="text-sm text-amber-800">Assign tasks with clear deadlines for accountability</p>
            </div>
          </div>
        </div>
      </div>

      {/* Welcome Message for New Users */}
      {activity.length === 0 && (
        <div className="mt-6 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-2xl p-6 text-white">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
              <Crown size={24} />
            </div>
            <div>
              <h3 className="font-bold text-lg mb-1">Welcome to Avenize! 🎉</h3>
              <p className="text-white/80 text-sm mb-3">
                Get started by adding your first deals, projects, or tasks. We're here to help you run your business better.
              </p>
              <div className="flex flex-wrap gap-2">
                <button className="px-4 py-2 bg-white text-indigo-600 rounded-lg text-sm font-medium hover:bg-white/90">
                  Add First Deal
                </button>
                <button className="px-4 py-2 bg-white/20 text-white rounded-lg text-sm font-medium hover:bg-white/30">
                  Watch Demo
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

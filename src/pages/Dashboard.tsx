import { useState } from 'react'
import { Link } from 'react-router-dom'
import { TrendingUp, Users, DollarSign, Target, Clock, ArrowRight, CheckSquare, AlertCircle, Star, FileText, TrendingDown, Calendar, Zap, Phone, MessageCircle, Plus } from 'lucide-react'
import { useAuth } from '../lib/AuthContext'
import { DEMO_STATS } from '../lib/DemoData'

const QUICK_ACTIONS: Record<string, {icon: any, label: string, href: string, color: string}[]> = {
  owner: [
    { icon: Zap, label: '🔥 Hot Deal', href: '/app/crm', color: 'bg-red-500' },
    { icon: Users, label: 'Add Contact', href: '/app/crm', color: 'bg-indigo-500' },
    { icon: DollarSign, label: 'New Invoice', href: '/app/finance', color: 'bg-green-500' },
    { icon: CheckSquare, label: 'My Tasks', href: '/app/tasks', color: 'bg-purple-500' },
    { icon: Target, label: 'Track Projects', href: '/app/projects', color: 'bg-amber-500' },
    { icon: MessageCircle, label: 'Team Chat', href: '/app/chat', color: 'bg-blue-500' },
  ],
  sales: [
    { icon: Zap, label: 'New Hot Lead', href: '/app/crm', color: 'bg-red-500' },
    { icon: Phone, label: 'Call Customer', href: '/app/crm', color: 'bg-green-500' },
    { icon: MessageCircle, label: 'WhatsApp', href: '/app/crm', color: 'bg-emerald-500' },
    { icon: Target, label: 'View Pipeline', href: '/app/crm', color: 'bg-indigo-500' },
    { icon: CheckSquare, label: 'My Tasks', href: '/app/tasks', color: 'bg-purple-500' },
    { icon: Calendar, label: 'Schedule Call', href: '/app/calendar', color: 'bg-blue-500' },
  ],
  finance: [
    { icon: DollarSign, label: 'Send Invoice', href: '/app/finance', color: 'bg-green-500' },
    { icon: TrendingUp, label: 'Cash Flow', href: '/app/cashflow', color: 'bg-emerald-500' },
    { icon: FileText, label: 'Expenses', href: '/app/accounting', color: 'bg-orange-500' },
    { icon: CheckSquare, label: 'Approvals', href: '/app/approvals', color: 'bg-teal-500' },
  ],
  hr: [
    { icon: Users, label: 'Add Staff', href: '/app/people', color: 'bg-indigo-500' },
    { icon: Clock, label: 'Attendance', href: '/app/time', color: 'bg-blue-500' },
    { icon: CheckSquare, label: 'Leave Requests', href: '/app/requisitions', color: 'bg-purple-500' },
    { icon: Calendar, label: 'Team Schedule', href: '/app/calendar', color: 'bg-teal-500' },
  ],
}

const STATS_CARDS: Record<string, {label: string, value: string, change: string, up: boolean, icon: any, href: string}[]> = {
  owner: [
    { label: 'Hot Deals 🔥', value: '7', change: '+3 this week', up: true, icon: Zap, href: '/app/crm' },
    { label: 'Pipeline Value', value: '₦8.5M', change: '+₦2M', up: true, icon: TrendingUp, href: '/app/crm' },
    { label: 'Won This Month', value: '₦3.2M', change: '+35%', up: true, icon: DollarSign, href: '/app/finance' },
    { label: 'Pending Tasks', value: '18', change: '-3', up: false, icon: CheckSquare, href: '/app/tasks' },
  ],
  sales: [
    { label: '🔥 Hot Leads', value: '12', change: '+4 today', up: true, icon: Zap, href: '/app/crm' },
    { label: 'My Pipeline', value: '₦5.2M', change: '+₦800k', up: true, icon: TrendingUp, href: '/app/crm' },
    { label: 'Follow-ups Today', value: '6', change: 'Due today', up: false, icon: AlertCircle, href: '/app/crm' },
    { label: 'Won This Month', value: '₦1.8M', change: '+35%', up: true, icon: Star, href: '/app/crm' },
  ],
  finance: [
    { label: 'Invoices Sent', value: '₦3.2M', change: '+₦500k', up: true, icon: FileText, href: '/app/finance' },
    { label: 'Outstanding', value: '₦890,000', change: '15 days avg', up: false, icon: Clock, href: '/app/finance' },
    { label: 'Received Today', value: '₦156,000', change: '3 payments', up: true, icon: DollarSign, href: '/app/finance' },
    { label: 'Expenses', value: '₦420,000', change: 'This month', up: false, icon: TrendingDown, href: '/app/finance' },
  ],
  hr: [
    { label: 'Total Staff', value: '42', change: '+2', up: true, icon: Users, href: '/app/people' },
    { label: 'On Leave', value: '3', change: 'Today', up: false, icon: Calendar, href: '/app/time' },
    { label: 'Pending Requests', value: '5', change: 'Awaiting', up: false, icon: Clock, href: '/app/approvals' },
    { label: 'New Hires', value: '2', change: 'This month', up: true, icon: Star, href: '/app/people' },
  ],
}

const RECENT_ACTIVITY = [
  { icon: Zap, message: '🔥 New hot lead: Ibrahim Musa - ₦3.5M deal', time: '2 min ago', color: 'text-red-500', href: '/app/crm' },
  { icon: Target, message: 'Riverside Construction signed - ₦2.5M deal', time: '15 min ago', color: 'text-green-500', href: '/app/crm' },
  { icon: DollarSign, message: 'Invoice #INV-0042 sent to TechStart', time: '30 min ago', color: 'text-blue-500', href: '/app/finance' },
  { icon: Phone, message: 'Called Adebayo Johnson - interested in enterprise', time: '1 hour ago', color: 'text-green-500', href: '/app/crm' },
  { icon: MessageCircle, message: 'WhatsApp message to Chioma Okonkwo', time: '2 hours ago', color: 'text-emerald-500', href: '/app/crm' },
]

const UPCOMING = [
  { title: '🔥 Call Ibrahim Musa - Hot deal closing!', time: 'Today, 2:00 PM', priority: 'high', href: '/app/crm' },
  { title: 'Team standup meeting', time: 'Today, 9:00 AM', priority: 'medium', href: '/app/calendar' },
  { title: 'Follow up with Alhaji Motors', time: 'Tomorrow, 10:00 AM', priority: 'high', href: '/app/crm' },
  { title: 'Submit proposal to Enterprise Ltd', time: 'This week', priority: 'medium', href: '/app/crm' },
]

export default function Dashboard() {
  const { staff, isDemo } = useAuth()
  const [roleView, setRoleView] = useState<'owner' | 'sales' | 'finance' | 'hr'>('owner')

  // Use demo stats for demo mode
  const ownerStats = isDemo ? [
    { label: 'Revenue This Month', value: `₦${(DEMO_STATS.revenue.value / 1000000).toFixed(1)}M`, change: `+${DEMO_STATS.revenue.change}%`, up: true, icon: DollarSign, href: '/app/finance' },
    { label: 'Active Deals', value: String(DEMO_STATS.active_deals.value), change: `+${DEMO_STATS.active_deals.change}`, up: true, icon: Target, href: '/app/crm' },
    { label: 'Pending Tasks', value: String(DEMO_STATS.tasks_pending.value), change: `${DEMO_STATS.tasks_pending.change} new`, up: false, icon: CheckSquare, href: '/app/tasks' },
    { label: 'Team Members', value: String(DEMO_STATS.team_active.value), change: '+0', up: true, icon: Users, href: '/app/people' },
  ] : STATS_CARDS.owner

  const stats = isDemo ? ownerStats : STATS_CARDS[roleView]
  const actions = isDemo ? QUICK_ACTIONS.owner : QUICK_ACTIONS[roleView]

  const getRoleLabel = () => {
    switch(roleView) {
      case 'owner': return 'Business Owner'
      case 'sales': return 'Sales Manager'
      case 'finance': return 'Finance Team'
      case 'hr': return 'HR Manager'
    }
  }

  return (
    <div>
      {isDemo && (
        <div className="bg-gradient-to-r from-amber-400 to-orange-500 rounded-xl p-4 mb-6 text-white">
          <p className="font-medium">🎯 Demo Mode Active</p>
          <p className="text-sm opacity-90">This is sample data for demonstration. All actions are read-only.</p>
        </div>
      )}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Welcome back, {staff?.full_name?.split(' ')[0] || 'there'} 👋
          </h1>
          <p className="text-gray-500">Here's what's happening with your business today.</p>
        </div>
        {!isDemo && (
          <div className="flex flex-wrap gap-2">
            {(['owner', 'sales', 'finance', 'hr'] as const).map((role) => (
              <button
                key={role}
                onClick={() => setRoleView(role)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                  roleView === role ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {role === 'owner' && '👤 Owner'}
                {role === 'sales' && '💼 Sales'}
                {role === 'finance' && '💰 Finance'}
                {role === 'hr' && '👥 HR'}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl p-4 mb-6 text-white">
        <p className="text-sm opacity-90">
          <strong>{getRoleLabel()} View:</strong> Showing metrics most relevant to your role. 
          Switch tabs above to see other team perspectives.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map((stat, i) => {
          const Icon = stat.icon
          return (
            <Link
              key={i}
              to={stat.href}
              className="bg-white rounded-xl p-5 border border-gray-100 hover:shadow-lg hover:border-indigo-200 transition-all cursor-pointer group"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center group-hover:bg-indigo-100 transition">
                  <Icon size={20} className="text-indigo-600" />
                </div>
                <span className={`text-xs font-medium ${stat.up ? 'text-green-600' : 'text-orange-600'}`}>
                  {stat.change}
                </span>
              </div>
              <div className="text-2xl font-bold text-gray-900 mb-1">{stat.value}</div>
              <div className="text-sm text-gray-500 flex items-center gap-1">
                {stat.label}
                <ArrowRight size={14} className="opacity-0 group-hover:opacity-100 transition ml-1" />
              </div>
            </Link>
          )
        })}
      </div>

      <div className="bg-white rounded-xl p-6 border border-gray-100 mb-8">
        <h2 className="text-lg font-bold text-gray-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {actions.map((action, i) => {
            const Icon = action.icon
            return (
              <Link
                key={i}
                to={action.href}
                className="flex flex-col items-center p-4 rounded-xl bg-gray-50 hover:bg-gray-100 transition group"
              >
                <div className={`w-12 h-12 rounded-xl ${action.color} flex items-center justify-center mb-3 group-hover:scale-110 transition`}>
                  <Icon size={24} className="text-white" />
                </div>
                <span className="text-sm font-medium text-gray-900">{action.label}</span>
              </Link>
            )
          })}
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl p-6 border border-gray-100">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Recent Activity</h2>
          <div className="space-y-4">
            {RECENT_ACTIVITY.map((item, i) => {
              const Icon = item.icon
              return (
                <div key={i} className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center shrink-0 ${item.color}`}>
                    <Icon size={16} />
                  </div>
                  <div>
                    <p className="text-sm text-gray-900">{item.message}</p>
                    <p className="text-xs text-gray-500">{item.time}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 border border-gray-100">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Upcoming</h2>
          <div className="space-y-3">
            {UPCOMING.map((item, i) => (
              <Link key={i} to={item.href} className="flex items-center justify-between p-3 bg-gray-50 hover:bg-indigo-50 rounded-lg transition group">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${
                    item.priority === 'high' ? 'bg-red-500' :
                    item.priority === 'medium' ? 'bg-amber-500' : 'bg-green-500'
                  }`} />
                  <div>
                    <p className="text-sm font-medium text-gray-900 group-hover:text-indigo-700">{item.title}</p>
                    <p className="text-xs text-gray-500">{item.time}</p>
                  </div>
                </div>
                <ArrowRight size={16} className="text-gray-400 group-hover:text-indigo-500 transition" />
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-8 grid md:grid-cols-4 gap-4">
        <Link to="/app/crm" className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl p-5 text-white hover:shadow-xl hover:-translate-y-1 transition-all group">
          <Users size={24} className="mb-2 group-hover:scale-110 transition" />
          <h3 className="font-bold mb-1">CRM</h3>
          <p className="text-sm text-white/80">Track leads & deals</p>
        </Link>
        <Link to="/app/finance" className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl p-5 text-white hover:shadow-xl hover:-translate-y-1 transition-all group">
          <DollarSign size={24} className="mb-2 group-hover:scale-110 transition" />
          <h3 className="font-bold mb-1">Finance</h3>
          <p className="text-sm text-white/80">Invoices & payments</p>
        </Link>
        <Link to="/app/projects" className="bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl p-5 text-white hover:shadow-xl hover:-translate-y-1 transition-all group">
          <Target size={24} className="mb-2 group-hover:scale-110 transition" />
          <h3 className="font-bold mb-1">Projects</h3>
          <p className="text-sm text-white/80">Track jobs & teams</p>
        </Link>
        <Link to="/app/people" className="bg-gradient-to-br from-pink-500 to-rose-600 rounded-xl p-5 text-white hover:shadow-xl hover:-translate-y-1 transition-all group">
          <Users size={24} className="mb-2 group-hover:scale-110 transition" />
          <h3 className="font-bold mb-1">People</h3>
          <p className="text-sm text-white/80">Manage your team</p>
        </Link>
      </div>
    </div>
  )
}

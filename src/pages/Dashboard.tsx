import { useState } from 'react'
import { Link } from 'react-router-dom'
import { TrendingUp, Users, DollarSign, Target, Clock, ArrowRight, CheckSquare, AlertCircle, Star, FileText, TrendingDown, Calendar } from 'lucide-react'
import { useAuth } from '../lib/AuthContext'

const QUICK_ACTIONS: Record<string, {icon: any, label: string, href: string, color: string}[]> = {
  owner: [
    { icon: DollarSign, label: 'New Invoice', href: '/app/finance', color: 'bg-green-500' },
    { icon: Users, label: 'View CRM', href: '/app/crm', color: 'bg-indigo-500' },
    { icon: Target, label: 'Track Projects', href: '/app/projects', color: 'bg-amber-500' },
    { icon: CheckSquare, label: 'My Tasks', href: '/app/tasks', color: 'bg-purple-500' },
  ],
  sales: [
    { icon: Users, label: 'Add Lead', href: '/app/crm', color: 'bg-indigo-500' },
    { icon: Target, label: 'Deal Pipeline', href: '/app/crm', color: 'bg-green-500' },
    { icon: AlertCircle, label: 'Follow-ups', href: '/app/crm', color: 'bg-blue-500' },
    { icon: CheckSquare, label: 'My Tasks', href: '/app/tasks', color: 'bg-purple-500' },
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

const STATS_CARDS: Record<string, {label: string, value: string, change: string, up: boolean, icon: any}[]> = {
  owner: [
    { label: 'Revenue This Month', value: '₦2,450,000', change: '+12%', up: true, icon: DollarSign },
    { label: 'Active Deals', value: '24', change: '+5', up: true, icon: Target },
    { label: 'Pending Tasks', value: '18', change: '-3', up: false, icon: CheckSquare },
    { label: 'Team Members', value: '12', change: '+1', up: true, icon: Users },
  ],
  sales: [
    { label: 'My Leads', value: '48', change: '+8 this week', up: true, icon: Users },
    { label: 'Open Deals', value: '₦5.2M', change: '+₦800k', up: true, icon: TrendingUp },
    { label: 'Follow-ups Due', value: '6', change: 'Today', up: false, icon: AlertCircle },
    { label: 'Won This Month', value: '₦1.8M', change: '+35%', up: true, icon: Star },
  ],
  finance: [
    { label: 'Invoices Sent', value: '₦3.2M', change: '+₦500k', up: true, icon: FileText },
    { label: 'Outstanding', value: '₦890,000', change: '15 days avg', up: false, icon: Clock },
    { label: 'Received Today', value: '₦156,000', change: '3 payments', up: true, icon: DollarSign },
    { label: 'Expenses', value: '₦420,000', change: 'This month', up: false, icon: TrendingDown },
  ],
  hr: [
    { label: 'Total Staff', value: '42', change: '+2', up: true, icon: Users },
    { label: 'On Leave', value: '3', change: 'Today', up: false, icon: Calendar },
    { label: 'Pending Requests', value: '5', change: 'Awaiting', up: false, icon: Clock },
    { label: 'New Hires', value: '2', change: 'This month', up: true, icon: Star },
  ],
}

const RECENT_ACTIVITY = [
  { icon: Target, message: 'Riverside Construction signed - ₦2.5M deal', time: '2 min ago', color: 'text-green-500' },
  { icon: DollarSign, message: 'Invoice #INV-0042 sent to TechStart', time: '15 min ago', color: 'text-blue-500' },
  { icon: CheckSquare, message: 'Q4 Report marked as complete', time: '1 hour ago', color: 'text-purple-500' },
  { icon: Users, message: 'New staff: Chinedu Michael added', time: '2 hours ago', color: 'text-indigo-500' },
]

const UPCOMING = [
  { title: 'Follow up with Alhaji Motors', time: 'Today, 2:00 PM', priority: 'high' },
  { title: 'Team standup meeting', time: 'Today, 9:00 AM', priority: 'medium' },
  { title: 'Submit invoice for EduFirst', time: 'Tomorrow, 10:00 AM', priority: 'low' },
  { title: 'Review overtime requests', time: 'This week', priority: 'medium' },
]

export default function Dashboard() {
  const { staff } = useAuth()
  const [roleView, setRoleView] = useState<'owner' | 'sales' | 'finance' | 'hr'>('owner')

  const stats = STATS_CARDS[roleView]
  const actions = QUICK_ACTIONS[roleView]

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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Welcome back, {staff?.full_name?.split(' ')[0] || 'there'} 👋
          </h1>
          <p className="text-gray-500">Here's what's happening with your business today.</p>
        </div>
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
            <div key={i} className="bg-white rounded-xl p-5 border border-gray-100 hover:shadow-md transition">
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                  <Icon size={20} className="text-gray-600" />
                </div>
                <span className={`text-xs font-medium ${stat.up ? 'text-green-600' : 'text-orange-600'}`}>
                  {stat.change}
                </span>
              </div>
              <div className="text-2xl font-bold text-gray-900 mb-1">{stat.value}</div>
              <div className="text-sm text-gray-500">{stat.label}</div>
            </div>
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
              <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${
                    item.priority === 'high' ? 'bg-red-500' :
                    item.priority === 'medium' ? 'bg-amber-500' : 'bg-green-500'
                  }`} />
                  <div>
                    <p className="text-sm font-medium text-gray-900">{item.title}</p>
                    <p className="text-xs text-gray-500">{item.time}</p>
                  </div>
                </div>
                <ArrowRight size={16} className="text-gray-400" />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-8 grid md:grid-cols-3 gap-4">
        <Link to="/app/crm" className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl p-5 text-white hover:shadow-lg transition">
          <Users size={24} className="mb-2" />
          <h3 className="font-bold mb-1">CRM</h3>
          <p className="text-sm text-white/80">Track leads & close deals faster</p>
        </Link>
        <Link to="/app/finance" className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl p-5 text-white hover:shadow-lg transition">
          <DollarSign size={24} className="mb-2" />
          <h3 className="font-bold mb-1">Finance</h3>
          <p className="text-sm text-white/80">Invoicing & payments in Naira</p>
        </Link>
        <Link to="/app/projects" className="bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl p-5 text-white hover:shadow-lg transition">
          <Target size={24} className="mb-2" />
          <h3 className="font-bold mb-1">Projects</h3>
          <p className="text-sm text-white/80">Track jobs & field teams</p>
        </Link>
      </div>
    </div>
  )
}

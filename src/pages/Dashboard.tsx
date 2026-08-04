// ============================================
// AVENIZE DASHBOARD
// Bento Grid Style with Glassmorphism
// ============================================

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { 
  TrendingUp, Users, Briefcase, DollarSign, Clock, AlertCircle,
  CheckCircle2, ArrowRight, BarChart3, MessageSquare, Calendar,
  FileText, Zap, Target, Settings, Bell, ChevronRight, Sparkles
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

// ============================================
// COLOR TOKENS
// ============================================
const colors = {
  coral: '#ff6b6b',
  amber: '#ffa94d',
  mint: '#69db7c',
  teal: '#38d9a9',
  cyan: '#22b8cf',
  sky: '#4dabf7',
  indigo: '#748ffc',
  violet: '#da77f2',
  rose: '#f783ac',
  purple: '#9775fa',
}

// ============================================
// TYPES
// ============================================
interface WorkspaceStat {
  id: string
  name: string
  value: string | number
  change?: string
  color: string
  icon: typeof TrendingUp
}

interface Notification {
  id: string
  type: 'deal' | 'task' | 'alert' | 'info'
  title: string
  message: string
  time: string
  color: string
}

// ============================================
// MAIN DASHBOARD COMPONENT
// ============================================
export default function Dashboard() {
  const { staff } = useAuth()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<WorkspaceStat[]>([])
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [recentActivity, setRecentActivity] = useState<any[]>([])

  // Get greeting
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

  useEffect(() => {
    const loadDashboard = async () => {
      if (!staff?.business_id) {
        setLoading(false)
        return
      }

      try {
        // Mock stats for demo (replace with real data)
        setStats([
          { id: '1', name: 'Revenue', value: '₦4.2M', change: '+12%', color: colors.mint, icon: TrendingUp },
          { id: '2', name: 'Open Deals', value: '18', color: colors.sky, icon: Target },
          { id: '3', name: 'Projects', value: '12', change: '4 due', color: colors.amber, icon: Briefcase },
          { id: '4', name: 'Tasks', value: '24', color: colors.violet, icon: CheckCircle2 },
        ])

        // Mock notifications
        setNotifications([
          { id: '1', type: 'deal', title: 'New Deal!', message: 'Riverside Construction signed ₦2.5M', time: '2 min ago', color: colors.mint },
          { id: '2', type: 'task', title: 'Task Complete', message: 'Q4 Report finalized by Chinedu', time: '15 min ago', color: colors.indigo },
          { id: '3', type: 'alert', title: 'Invoice Overdue', message: 'Invoice #INV-2024-089 is 5 days past due', time: '1 hour ago', color: colors.coral },
        ])

        setLoading(false)
      } catch (err) {
        console.error('Dashboard load error:', err)
        setLoading(false)
      }
    }

    loadDashboard()
  }, [staff?.business_id])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 rounded-full border-4 border-indigo-200 border-t-indigo-600 animate-spin mx-auto mb-4" />
          <p className="text-slate-500">Loading your dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-6" style={{ background: '#f7fafc' }}>
      {/* Welcome Header */}
      <div className="max-w-7xl mx-auto mb-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold mb-1" style={{ letterSpacing: '-0.02em' }}>
              {getGreeting()}, {getFirstName()} 👋
            </h1>
            <p className="text-slate-500">
              Here's what's happening at <span className="font-semibold">{staff?.business_name || 'your business'}</span> today.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button className="relative p-3 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 transition-colors">
              <Bell size={20} className="text-slate-600" />
              <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-indigo-500" />
            </button>
            <Link 
              to="/app/settings"
              className="p-3 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 transition-colors"
            >
              <Settings size={20} className="text-slate-600" />
            </Link>
          </div>
        </div>
      </div>

      {/* Bento Grid */}
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-12 gap-5 auto-rows-[minmax(160px,auto)]">
          
          {/* Stats Row */}
          {stats.map((stat) => (
            <div 
              key={stat.id}
              className="col-span-6 lg:col-span-3 p-6 rounded-2xl bg-white border border-slate-100 transition-all hover:-translate-y-1 hover:shadow-lg"
              style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}
            >
              <div 
                className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
                style={{ background: `${stat.color}15` }}
              >
                <stat.icon size={24} style={{ color: stat.color }} />
              </div>
              <div className="text-3xl font-bold mb-1" style={{ letterSpacing: '-0.02em', fontFamily: 'system-ui' }}>
                {stat.value}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">{stat.name}</span>
                {stat.change && (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: `${colors.mint}20`, color: colors.mint }}>
                    {stat.change}
                  </span>
                )}
              </div>
            </div>
          ))}

          {/* AI Assistant Card */}
          <div 
            className="col-span-12 lg:col-span-4 p-6 rounded-2xl relative overflow-hidden"
            style={{
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            }}
          >
            {/* Glow Effect */}
            <div 
              className="absolute -top-1/2 -right-1/4 w-full h-full pointer-events-none"
              style={{
                background: 'radial-gradient(circle, rgba(255,255,255,0.2) 0%, transparent 60%)'
              }}
            />
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
                  <Sparkles size={24} className="text-white" />
                </div>
                <div>
                  <h3 className="text-white font-bold text-lg">AI Assistant</h3>
                  <p className="text-white/60 text-sm">Powered by GPT-4</p>
                </div>
              </div>
              <p className="text-white/80 text-sm mb-4 leading-relaxed">
                Ask anything about your business. Get insights, summaries, and actionable recommendations instantly.
              </p>
              <button 
                className="px-4 py-2 rounded-lg bg-white text-indigo-600 font-semibold text-sm hover:bg-white/90 transition-colors"
              >
                Chat with AI
              </button>
            </div>
          </div>

          {/* Quick Actions */}
          <div 
            className="col-span-12 lg:col-span-8 p-6 rounded-2xl bg-white border border-slate-100"
            style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}
          >
            <h3 className="font-bold text-lg mb-4">Quick Actions</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { icon: DollarSign, label: 'New Invoice', color: colors.mint, link: '/app/payments?new=invoice' },
                { icon: Users, label: 'Add Client', color: colors.sky, link: '/app/crm?new=client' },
                { icon: Briefcase, label: 'New Project', color: colors.amber, link: '/app/projects?new=project' },
                { icon: FileText, label: 'Create Task', color: colors.violet, link: '/app/tasks?new=task' },
              ].map((action, i) => (
                <Link
                  key={i}
                  to={action.link}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl border border-slate-100 hover:border-slate-200 hover:bg-slate-50 transition-all"
                >
                  <div 
                    className="w-10 h-10 rounded-lg flex items-center justify-center"
                    style={{ background: `${action.color}15` }}
                  >
                    <action.icon size={20} style={{ color: action.color }} />
                  </div>
                  <span className="text-xs font-medium text-slate-600">{action.label}</span>
                </Link>
              ))}
            </div>
          </div>

          {/* Notifications */}
          <div className="col-span-12 lg:col-span-6 p-6 rounded-2xl" style={{
            background: 'rgba(255, 255, 255, 0.7)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255, 255, 255, 0.9)',
            boxShadow: '0 4px 24px rgba(0, 0, 0, 0.06)'
          }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg">Recent Notifications</h3>
              <button className="text-xs font-semibold text-indigo-500 hover:text-indigo-600">
                View all
              </button>
            </div>
            <div className="flex flex-col gap-3">
              {notifications.map((notif) => (
                <div
                  key={notif.id}
                  className="flex items-start gap-3 p-3 rounded-xl transition-all hover:bg-white/50 cursor-pointer"
                  style={{
                    background: `${notif.color}08`,
                    border: `1px solid ${notif.color}15`
                  }}
                >
                  <div 
                    className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: `${notif.color}20` }}
                  >
                    {notif.type === 'deal' && <TrendingUp size={18} style={{ color: notif.color }} />}
                    {notif.type === 'task' && <CheckCircle2 size={18} style={{ color: notif.color }} />}
                    {notif.type === 'alert' && <AlertCircle size={18} style={{ color: notif.color }} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm">{notif.title}</p>
                    <p className="text-xs text-slate-500 truncate">{notif.message}</p>
                  </div>
                  <span className="text-xs text-slate-400 flex-shrink-0">{notif.time}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Workspace Modules */}
          <div className="col-span-12 lg:col-span-6 p-6 rounded-2xl bg-white border border-slate-100" style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
            <h3 className="font-bold text-lg mb-4">Your Workspaces</h3>
            <div className="grid grid-cols-2 gap-3">
              {[
                { name: 'Sales', icon: TrendingUp, color: colors.coral, count: '6 deals' },
                { name: 'Finance', icon: DollarSign, color: colors.mint, count: '2 overdue' },
                { name: 'Projects', icon: Briefcase, color: colors.amber, count: '4 due this week' },
                { name: 'HR', icon: Users, color: colors.violet, count: '1 review' },
                { name: 'AI', icon: Zap, color: colors.cyan, count: 'Digest ready' },
                { name: 'Analytics', icon: BarChart3, color: colors.indigo, count: '+12% growth' },
              ].map((ws, i) => (
                <Link
                  key={i}
                  to={`/app/${ws.name.toLowerCase()}`}
                  className="flex items-center gap-3 p-4 rounded-xl border border-slate-100 hover:border-slate-200 hover:shadow-md transition-all"
                >
                  <div 
                    className="w-10 h-10 rounded-lg flex items-center justify-center"
                    style={{ background: `${ws.color}15` }}
                  >
                    <ws.icon size={18} style={{ color: ws.color }} />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-sm">{ws.name}</p>
                    <p className="text-xs text-slate-500">{ws.count}</p>
                  </div>
                  <ChevronRight size={16} className="text-slate-300" />
                </Link>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}

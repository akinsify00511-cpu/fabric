// ============================================
// AVENIZE DASHBOARD v2 - Spatial + Minimalism + Glassmorphism
// ============================================

import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import {
  Users, DollarSign, Target, CheckSquare, 
  TrendingUp, Flame, Building2, Check
} from 'lucide-react'

interface DashboardStats {
  hotDeals: number
  hotDealsChange: number
  pipelineValue: number
  pipelineChange: number
  pendingTasks: number
  tasksChange: number
  teamMembers: number
  teamChange: number
}

interface RecentActivity {
  id: string
  type: string
  text: string
  time: string
  icon: string
  colorVar: string
}

interface UpcomingItem {
  id: string
  text: string
  time: string
  priority: 'high' | 'medium' | 'low'
}

interface WorkspaceModule {
  name: string
  href: string
  icon: React.ReactNode
  color: string
  bgColor: string
}

const WORKSPACE_MODULES: WorkspaceModule[] = [
  { name: 'CRM', href: '/app/crm', icon: <Users size={20} />, color: '#5B9EF7', bgColor: 'rgba(91, 158, 247, 0.14)' },
  { name: 'Finance', href: '/app/finance', icon: <DollarSign size={20} />, color: '#3DD68C', bgColor: 'rgba(61, 214, 140, 0.14)' },
  { name: 'Projects', href: '/app/projects', icon: <Target size={20} />, color: '#F5B93D', bgColor: 'rgba(245, 185, 61, 0.14)' },
  { name: 'People', href: '/app/people', icon: <Building2 size={20} />, color: '#B098F5', bgColor: 'rgba(176, 152, 245, 0.14)' },
]

const formatCurrency = (amount: number) => {
  if (amount >= 1000000) {
    return `₦${(amount / 1000000).toFixed(1)}M`
  }
  if (amount >= 1000) {
    return `₦${(amount / 1000).toFixed(0)}k`
  }
  return `₦${amount.toLocaleString()}`
}

const getMockData = (): { stats: DashboardStats; activities: RecentActivity[]; upcoming: UpcomingItem[] } => ({
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
    { id: '1', type: 'deal', text: 'New hot lead: Ibrahim Musa, ₦3.5M deal', time: '2 min ago', icon: '🔥', colorVar: '#EA4335' },
    { id: '2', type: 'payment', text: 'Riverside Construction signed, ₦2.5M deal', time: '15 min ago', icon: '✓', colorVar: '#34A853' },
    { id: '3', type: 'invoice', text: 'Invoice #0042 sent to TechStart', time: '30 min ago', icon: '📄', colorVar: '#4285F4' },
  ],
  upcoming: [
    { id: '1', text: 'Call Ibrahim Musa, hot deal closing', time: 'Today, 2:00 PM', priority: 'high' },
    { id: '2', text: 'Team standup meeting', time: 'Today, 9:00 AM', priority: 'medium' },
    { id: '3', text: 'Follow up with Alhaji Motors', time: 'Tomorrow, 10:00 AM', priority: 'high' },
  ],
})

export default function Dashboard() {
  const { staff, isDemo } = useAuth()
  
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [activities, setActivities] = useState<RecentActivity[]>([])
  const [upcoming, setUpcoming] = useState<UpcomingItem[]>([])
  const [loading, setLoading] = useState(true)
  const [revenueData, setRevenueData] = useState<number[]>([])

  useEffect(() => {
    loadDashboardData()
  }, [staff, isDemo])

  const loadDashboardData = async () => {
    // Show mock data if in demo mode or no staff data
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

      const hotDeals = dealsData.data?.length || 0
      const pipelineValue = dealsData.data?.reduce((sum, d) => sum + (d.value || 0), 0) || 0
      const pendingTasks = tasksData.data?.length || 0
      const teamMembers = staffData.data?.length || 0

      setStats({
        hotDeals,
        hotDealsChange: 0,
        pipelineValue,
        pipelineChange: 0,
        pendingTasks,
        tasksChange: 0,
        teamMembers,
        teamChange: 0,
      })

      setRevenueData([40, 55, 45, 70, 60, 90, 100])
      
      setActivities([
        { id: '1', type: 'deal', text: `You have ${hotDeals} hot deals`, time: 'Just now', icon: '🔥', colorVar: '#EA4335' },
        { id: '2', type: 'invoice', text: `${pendingTasks} pending tasks`, time: 'Updated', icon: '📄', colorVar: '#4285F4' },
      ])

      setUpcoming([
        { id: '1', text: 'Check your tasks', time: 'Today', priority: 'high' },
      ])

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
          <div className="h-8 bg-white rounded w-48"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-32 bg-white rounded-2xl"></div>)}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="pb-20">
      {/* Bento Grid Layout */}
      <div className="grid grid-cols-12 gap-4">
        
        {/* Hero: Revenue KPI - Glassmorphism card with aperture glow */}
        <div className="col-span-12 md:col-span-7 card-hero p-6 flex flex-col justify-between min-h-[190px]">
          <div>
            {/* Brand mark */}
            <div className="flex items-center gap-2 mb-4">
              <div className="w-5 h-5">
                <svg viewBox="0 0 1254 1254" className="w-full h-full fill-teal-500">
                  <path d="M613.7 269.1c-36.4 3.9-70.6 23.9-91.9 53.6-3 4.3-31.8 55.5-63.9 113.8-32 58.3-62.3 113.2-67.1 122-39.2 71.1-34.9 137 11.5 177.3 11.2 9.7 36.3 23 38.7 20.5 1.1-1 97.6-176.1 121-219.3 3.1-5.8 12.1-22.2 20-36.5s18.1-32.9 22.7-41.4c10.9-20.1 15.7-27.3 23.2-35.4 30.8-32.9 80.2-40.8 124.9-20.1 8.8 4 25.4 14.9 29.6 19.3 1.7 1.7 3.4 3.1 3.9 3.1 1.1 0-42.1-85-48.5-95.3-26.3-42.8-74.8-66.8-124.1-61.6"/>
                </svg>
              </div>
              <span className="text-sm" style={{ color: '#5F6368' }}>Avenize</span>
            </div>
            <div className="text-sm" style={{ color: '#5F6368' }}>Welcome back, {getUserName()}</div>
            <div className="text-sm mt-2" style={{ color: '#5F6368' }}>Revenue this month</div>
            <div className="text-[38px] font-semibold num mt-1" style={{ letterSpacing: '-0.01em' }}>
              {stats ? formatCurrency(stats.pipelineValue) : '₦0'}
            </div>
          </div>
          {/* Mini chart */}
          <div className="flex items-end gap-1 mt-4">
            {revenueData.map((height, i) => (
              <div
                key={i}
                className={`w-2.5 rounded-sm ${i >= revenueData.length - 2 ? 'bg-gradient-to-t from-teal-600 to-teal-500' : 'bg-teal-500'}`}
                style={{ height: `${height}%`, opacity: i >= revenueData.length - 2 ? 1 : 0.35 }}
              />
            ))}
            <span className="text-xs font-semibold ml-3 mb-0.5" style={{ color: '#34A853' }}>+{revenueChange}%</span>
          </div>
        </div>

        {/* Workspace Launcher - Keep icon circles for launchers only */}
        <div className="col-span-12 md:col-span-5 grid grid-cols-2 gap-4">
          {WORKSPACE_MODULES.map((module) => (
            <Link
              key={module.name}
              to={module.href}
              className="tile-launcher"
            >
              <div 
                className="icon"
                style={{ backgroundColor: module.bgColor }}
              >
                <span style={{ color: module.color }}>{module.icon}</span>
              </div>
              <div className="text-sm font-medium" style={{ color: '#202124' }}>{module.name}</div>
            </Link>
          ))}
        </div>

        {/* Stat Cards - Minimalist with accent bars */}
        <Link to="/app/crm" className="col-span-6 md:col-span-3 card-stat p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'rgba(234, 67, 53, 0.1)' }}>
                <Flame size={14} style={{ color: '#EA4335' }} />
              </div>
            </div>
            <span className="text-xs font-semibold" style={{ color: '#34A853' }}>+{stats?.hotDealsChange || 0} this week</span>
          </div>
          <div className="text-[24px] font-semibold num">{stats?.hotDeals || 0}</div>
          <div className="text-xs mt-1" style={{ color: '#5F6368' }}>Hot deals</div>
        </Link>

        <Link to="/app/crm" className="col-span-6 md:col-span-3 card-stat p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'rgba(66, 133, 244, 0.1)' }}>
                <TrendingUp size={14} style={{ color: '#4285F4' }} />
              </div>
            </div>
            <span className="text-xs font-semibold" style={{ color: '#34A853' }}>+{formatCurrency(stats?.pipelineChange || 0)}</span>
          </div>
          <div className="text-[24px] font-semibold num">{formatCurrency(stats?.pipelineValue || 0)}</div>
          <div className="text-xs mt-1" style={{ color: '#5F6368' }}>Pipeline value</div>
        </Link>

        <Link to="/app/tasks" className="col-span-6 md:col-span-3 card-stat p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'rgba(139, 92, 246, 0.1)' }}>
                <CheckSquare size={14} style={{ color: '#8B5CF6' }} />
              </div>
            </div>
            <span className="text-xs font-semibold" style={{ color: '#FBBC05' }}>{stats?.tasksChange || 0}</span>
          </div>
          <div className="text-[24px] font-semibold num">{stats?.pendingTasks || 0}</div>
          <div className="text-xs mt-1" style={{ color: '#5F6368' }}>Pending tasks</div>
        </Link>

        <Link to="/app/people" className="col-span-6 md:col-span-3 card-stat p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'rgba(52, 168, 83, 0.1)' }}>
                <Users size={14} style={{ color: '#34A853' }} />
              </div>
            </div>
            <span className="text-xs font-semibold" style={{ color: '#34A853' }}>+{stats?.teamChange || 0}</span>
          </div>
          <div className="text-[24px] font-semibold num">{stats?.teamMembers || 0}</div>
          <div className="text-xs mt-1" style={{ color: '#5F6368' }}>Team members</div>
        </Link>

        {/* Recent Activity - Flat rows, no card elevation */}
        <div className="col-span-12 md:col-span-7 card p-5">
          <div className="text-sm font-semibold mb-4" style={{ color: '#202124' }}>Recent activity</div>
          <div className="space-y-3">
            {activities.map((activity) => (
              <div key={activity.id} className="flex items-start gap-3 py-2" style={{ borderBottom: '0.5px solid #E8EAED' }}>
                <div 
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-sm shrink-0"
                  style={{ backgroundColor: `${activity.colorVar}20` }}
                >
                  {activity.icon === '✓' ? <Check size={14} style={{ color: activity.colorVar }} /> : activity.icon}
                </div>
                <div>
                  <div className="text-sm" style={{ color: '#202124' }}>{activity.text}</div>
                  <div className="text-xs mt-0.5" style={{ color: '#9AA0A6' }}>{activity.time}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Upcoming - Minimalist with dots */}
        <div className="col-span-12 md:col-span-5 card p-5">
          <div className="text-sm font-semibold mb-4" style={{ color: '#202124' }}>Upcoming</div>
          <div className="space-y-3">
            {upcoming.map((item) => (
              <div key={item.id} className="flex items-center gap-3 py-2" style={{ borderBottom: '0.5px solid #E8EAED' }}>
                <div 
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ 
                    backgroundColor: item.priority === 'high' ? '#EA4335' : 
                                   item.priority === 'medium' ? '#FBBC05' : '#9AA0A6',
                    boxShadow: `0 0 0 3px ${item.priority === 'high' ? 'rgba(251, 113, 133, 0.25)' : 
                                          item.priority === 'medium' ? 'rgba(251, 191, 36, 0.25)' : 'transparent'}`
                  }}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate" style={{ color: '#202124' }}>{item.text}</div>
                  <div className="text-xs mt-0.5" style={{ color: '#9AA0A6' }}>{item.time}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}

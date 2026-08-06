// ============================================
// AVENIZE DASHBOARD - Based on Design Mockup
// Bento grid layout with workspace launcher and KPIs
// ============================================

import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import {
  Users, DollarSign, Target, CheckSquare, 
  TrendingUp, Flame, Building2, Wrench
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
  color: string
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
  { name: 'CRM', href: '/app/crm', icon: <Users size={20} />, color: '#185FA5', bgColor: '#E6F1FB' },
  { name: 'Jobs', href: '/app/jobs', icon: <Wrench size={20} />, color: '#C2410C', bgColor: '#FFF7ED' },
  { name: 'Finance', href: '/app/finance', icon: <DollarSign size={20} />, color: '#27500A', bgColor: '#EAF3DE' },
  { name: 'Projects', href: '/app/projects', icon: <Target size={20} />, color: '#633806', bgColor: '#FAEEDA' },
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
    { id: '1', type: 'deal', text: 'New hot lead: Ibrahim Musa, ₦3.5M deal', time: '2 min ago', icon: '🔥', color: '#712B13' },
    { id: '2', type: 'payment', text: 'Riverside Construction signed, ₦2.5M deal', time: '15 min ago', icon: '✓', color: '#27500A' },
    { id: '3', type: 'invoice', text: 'Invoice #0042 sent to TechStart', time: '30 min ago', icon: '📄', color: '#0C447C' },
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
    if (isDemo || !staff) {
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
        { id: '1', type: 'deal', text: `You have ${hotDeals} hot deals`, time: 'Just now', icon: '🔥', color: '#712B13' },
        { id: '2', type: 'invoice', text: `${pendingTasks} pending tasks`, time: 'Updated', icon: '📄', color: '#0C447C' },
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
          <div className="h-8 bg-black/5 rounded w-48"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-32 bg-black/5 rounded-2xl"></div>)}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="pb-20">
      {/* Bento Grid Layout */}
      <div className="grid grid-cols-12 gap-3">
        
        {/* Hero: Revenue KPI */}
        <div className="col-span-12 md:col-span-7 bg-[#111111] rounded-2xl p-5 flex flex-col justify-between min-h-[180px] text-white">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-5 h-5">
                <svg viewBox="0 0 1254 1254" className="w-full h-full fill-white">
                  <path d="M613.7 269.1c-36.4 3.9-70.6 23.9-91.9 53.6-3 4.3-31.8 55.5-63.9 113.8-32 58.3-62.3 113.2-67.1 122-39.2 71.1-34.9 137 11.5 177.3 11.2 9.7 36.3 23 38.7 20.5 1.1-1 97.6-176.1 121-219.3 3.1-5.8 12.1-22.2 20-36.5s18.1-32.9 22.7-41.4c10.9-20.1 15.7-27.3 23.2-35.4 30.8-32.9 80.2-40.8 124.9-20.1 8.8 4 25.4 14.9 29.6 19.3 1.7 1.7 3.4 3.1 3.9 3.1 1.1 0-42.1-85-48.5-95.3-26.3-42.8-74.8-66.8-124.1-61.6"/>
                </svg>
              </div>
              <span className="text-xs text-[#A8A8A8]">Avenize</span>
            </div>
            <div className="text-xs text-[#A8A8A8]">Welcome back, {getUserName()}</div>
            <div className="text-xs text-[#A8A8A8] mt-1">Revenue this month</div>
            <div className="text-[34px] font-medium mt-0.5">
              {stats ? formatCurrency(stats.pipelineValue) : '₦0'}
            </div>
          </div>
          <div className="flex items-end gap-1">
            {revenueData.map((height, i) => (
              <div
                key={i}
                className={`w-2.5 rounded-sm ${i >= revenueData.length - 2 ? 'bg-[#4F46E5]' : 'bg-[#3B82F6]'}`}
                style={{ height: `${height}%` }}
              />
            ))}
            <span className="text-xs text-green-400 ml-2 mb-0.5">+{revenueChange}%</span>
          </div>
        </div>

        {/* Workspace Launcher */}
        <div className="col-span-12 md:col-span-5 grid grid-cols-2 gap-3">
          {WORKSPACE_MODULES.map((module) => (
            <Link
              key={module.name}
              to={module.href}
              className="bg-[#F7F7F5] rounded-xl p-3 flex flex-col justify-center gap-2 hover:border-[#111111] border border-transparent transition-colors"
            >
              <div 
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: module.bgColor }}
              >
                <span style={{ color: module.color }}>{module.icon}</span>
              </div>
              <div className="text-sm font-medium">{module.name}</div>
            </Link>
          ))}
        </div>

        {/* Stat Cards */}
        <Link to="/app/crm" className="col-span-6 md:col-span-3 bg-white rounded-2xl border border-black/[0.06] p-4 hover:border-black/10 transition-colors">
          <div className="flex items-center justify-between mb-2">
            <Flame className="w-4 h-4" style={{ color: '#D85A30' }} />
            <span className="text-xs" style={{ color: '#639922' }}>+{stats?.hotDealsChange || 0} this week</span>
          </div>
          <div className="text-[22px] font-medium">{stats?.hotDeals || 0}</div>
          <div className="text-xs text-black/50">Hot deals</div>
        </Link>

        <Link to="/app/crm" className="col-span-6 md:col-span-3 bg-white rounded-2xl border border-black/[0.06] p-4 hover:border-black/10 transition-colors">
          <div className="flex items-center justify-between mb-2">
            <TrendingUp className="w-4 h-4" style={{ color: '#185FA5' }} />
            <span className="text-xs" style={{ color: '#639922' }}>+{formatCurrency(stats?.pipelineChange || 0)}</span>
          </div>
          <div className="text-[22px] font-medium">{formatCurrency(stats?.pipelineValue || 0)}</div>
          <div className="text-xs text-black/50">Pipeline value</div>
        </Link>

        <Link to="/app/tasks" className="col-span-6 md:col-span-3 bg-white rounded-2xl border border-black/[0.06] p-4 hover:border-black/10 transition-colors">
          <div className="flex items-center justify-between mb-2">
            <CheckSquare className="w-4 h-4" style={{ color: '#3C3489' }} />
            <span className="text-xs" style={{ color: '#854F0B' }}>{stats?.tasksChange || 0}</span>
          </div>
          <div className="text-[22px] font-medium">{stats?.pendingTasks || 0}</div>
          <div className="text-xs text-black/50">Pending tasks</div>
        </Link>

        <Link to="/app/people" className="col-span-6 md:col-span-3 bg-white rounded-2xl border border-black/[0.06] p-4 hover:border-black/10 transition-colors">
          <div className="flex items-center justify-between mb-2">
            <Users className="w-4 h-4" style={{ color: '#0F6E56' }} />
            <span className="text-xs" style={{ color: '#639922' }}>+{stats?.teamChange || 0}</span>
          </div>
          <div className="text-[22px] font-medium">{stats?.teamMembers || 0}</div>
          <div className="text-xs text-black/50">Team members</div>
        </Link>

        {/* Recent Activity */}
        <div className="col-span-12 md:col-span-7 bg-white rounded-2xl border border-black/[0.06] p-4">
          <div className="text-sm font-medium mb-3">Recent activity</div>
          <div className="space-y-3">
            {activities.map((activity) => (
              <div key={activity.id} className="flex items-start gap-2.5">
                <div 
                  className="w-6 h-6 rounded-lg flex items-center justify-center text-xs shrink-0"
                  style={{ backgroundColor: `${activity.color}15` }}
                >
                  <span style={{ fontSize: '14px' }}>{activity.icon}</span>
                </div>
                <div>
                  <div className="text-sm">{activity.text}</div>
                  <div className="text-xs text-black/40">{activity.time}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Upcoming */}
        <div className="col-span-12 md:col-span-5 bg-white rounded-2xl border border-black/[0.06] p-4">
          <div className="text-sm font-medium mb-3">Upcoming</div>
          <div className="space-y-3">
            {upcoming.map((item) => (
              <div key={item.id} className="flex items-center gap-2.5">
                <div 
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ 
                    backgroundColor: item.priority === 'high' ? '#E24B4A' : 
                                   item.priority === 'medium' ? '#EF9F27' : '#888780'
                  }}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">{item.text}</div>
                  <div className="text-xs text-black/40">{item.time}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}

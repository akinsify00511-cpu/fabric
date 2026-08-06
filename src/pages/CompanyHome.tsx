// ============================================
// COMPANY HOME - AVENIZE DASHBOARD
// Bento Grid Layout
// ============================================

import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useBranding } from '../lib/BrandingContext'
import { 
  Users, DollarSign, Target, UserCircle, 
  Flame, TrendingUp, List, UsersRound,
  Activity, Check, FileText
} from 'lucide-react'

// Color constants matching the design
const COLORS = {
  sales: '#3B82F6',
  finance: '#10B981',
  projects: '#F59E0B',
  success: '#639922',
  warning: '#854F0B',
  danger: '#E24B4A',
}

export default function CompanyHome() {
  const { staff, isDemo } = useAuth()
  const { branding } = useBranding()
  const [loading, setLoading] = useState(true)
  
  // Get branding colors
  const bgColor = branding.background_color || '#0D0C0B'
  const isDarkBg = bgColor === '#111111' || bgColor === '#0D0C0B' || bgColor === '#000000'
  
  // Dashboard data
  const [stats, setStats] = useState({
    revenue: 3200000,
    revenueChange: 35,
    hotDeals: 7,
    hotDealsChange: 3,
    pipeline: 8500000,
    pipelineChange: 2000000,
    pendingTasks: 18,
    pendingTasksChange: -3,
    teamMembers: 42,
    teamMembersChange: 2,
  })
  
  const [recentActivity] = useState([
    { icon: 'flame', color: '#FAECE7', iconColor: '#712B13', text: 'New hot lead: Ibrahim Musa, ₦3.5M deal', time: '2 min ago' },
    { icon: 'check', color: '#EAF3DE', iconColor: '#27500A', text: 'Riverside Construction signed, ₦2.5M deal', time: '15 min ago' },
    { icon: 'file', color: '#E6F1FB', iconColor: '#0C447C', text: 'Invoice #0042 sent to TechStart', time: '30 min ago' },
  ])
  
  const [upcomingEvents] = useState([
    { color: COLORS.danger, text: 'Call Ibrahim Musa, hot deal closing', time: 'Today, 2:00 PM' },
    { color: '#EF9F27', text: 'Team standup meeting', time: 'Today, 9:00 AM' },
    { color: COLORS.danger, text: 'Follow up with Alhaji Motors', time: 'Tomorrow, 10:00 AM' },
  ])

  useEffect(() => {
    if (!isDemo && staff?.business_id) {
      loadDashboardData()
    } else {
      setLoading(false)
    }
  }, [staff?.business_id, isDemo])

  const loadDashboardData = async () => {
    if (!staff?.business_id) return
    
    setLoading(true)
    
    // Load deal stats
    const { data: deals } = await supabase
      .from('deals')
      .select('value, stage')
      .eq('business_id', staff.business_id)
    
    const { data: tasks } = await supabase
      .from('tasks')
      .select('id, completed')
      .eq('business_id', staff.business_id)
    
    const { count: teamCount } = await supabase
      .from('staff')
      .select('id', { count: 'exact' })
      .eq('business_id', staff.business_id)
    
    // Calculate stats from real data
    const hotDeals = deals?.filter(d => d.stage === 'hot') || []
    const pipeline = deals?.reduce((sum, d) => sum + (d.value || 0), 0) || 0
    const pendingTasks = tasks?.filter(t => !t.completed).length || 0
    
    setStats(prev => ({
      ...prev,
      hotDeals: hotDeals.length,
      pipeline,
      pendingTasks,
      teamMembers: teamCount || prev.teamMembers,
    }))
    
    setLoading(false)
  }

  const formatCurrency = (value: number) => {
    if (value >= 1000000) {
      return `₦${(value / 1000000).toFixed(1)}M`
    }
    if (value >= 1000) {
      return `₦${(value / 1000).toFixed(0)}K`
    }
    return `₦${value.toLocaleString()}`
  }

  const getActivityIcon = (icon: string) => {
    switch (icon) {
      case 'flame': return <Flame size={14} style={{ color: '#712B13' }} />
      case 'check': return <Check size={14} style={{ color: '#27500A' }} />
      case 'file': return <FileText size={14} style={{ color: '#0C447C' }} />
      default: return <Activity size={14} />
    }
  }

  return (
    <div className="pb-20" style={{ backgroundColor: bgColor, color: branding.text_color || '#F7F4EE' }}>
      {/* Topbar */}
      <div className="flex items-center gap-2.5 px-8 py-4 border-b border-black/[0.05]" style={{ backgroundColor: isDarkBg ? '#17150F' : '#FFFFFF' }}>
        <svg width="22" height="22" viewBox="0 0 1254 1254" aria-hidden="true" fill={isDarkBg ? "#F7F4EE" : "#111111"}>
          <path d="M613.7 269.1c-36.4 3.9-70.6 23.9-91.9 53.6-3 4.3-31.8 55.5-63.9 113.8-32 58.3-62.3 113.2-67.1 122-39.2 71.1-34.9 137 11.5 177.3 11.2 9.7 36.3 23 38.7 20.5 1.1-1 97.6-176.1 121-219.3 3.1-5.8 12.1-22.2 20-36.5s18.1-32.9 22.7-41.4c10.9-20.1 15.7-27.3 23.2-35.4 30.8-32.9 80.2-40.8 124.9-20.1 8.8 4 25.4 14.9 29.6 19.3 1.7 1.7 3.4 3.1 3.9 3.1 1.1 0-42.1-85-48.5-95.3-26.3-42.8-74.8-66.8-124.1-61.6"/>
          <path d="M696 416.6c-22.5 3.4-37.8 11-51.6 25.5-6.9 7.4-14.4 18.3-14.4 21.1 0 .8 5.5 10.4 12.1 21.4 21.1 34.6 98.1 163.2 110.9 185 69.7 118.8 71.4 121.9 76.5 136.6 6.5 18.8 7.4 43.4 2.1 61.3-11.1 37.5-40.2 67.2-76.4 78.1-4.8 1.4-9.3 2.8-10.1 3-.8.3-1.2.5-1 .7.2.1 35.7 0 78.9-.3l78.5-.6 9.5-2.6c47.3-12.9 78.8-45.8 86.5-90.2 4.8-27.9-1.6-55.5-20.2-87.2-7.8-13.1-20.1-34.6-77.3-134.4-86.8-151.4-82.7-144.4-92.8-159-22.5-32.4-56.2-54.1-90.1-58-8.4-1-16.1-1.1-21.1-.4"/>
          <path d="M339.9 647.2c-1.2 2.4-16.1 29.3-33.2 59.8-39.8 71.2-44.2 80.6-49.2 104.5-13.2 63.8 27.5 122.9 93.4 135.5 10.5 2 13.4 2.1 61.8 1.7 77.6-.6 69.4 2.1 184.8-61.4 33-18.1 90.2-49.3 127-69.3 36.9-20 67.4-36.6 67.8-37 1.1-.9-35.1-62.9-40.2-69-19.7-23.4-62.3-28.2-102.6-11.5-9.8 4-12.4 5.3-55 28.8-91.9 50.6-90 49.7-110.4 53.1-74.3 12.5-141.2-46.1-141.5-124.1-.1-8.4-.2-15.3-.3-15.3-.2 0-1.2 1.9-2.4 4.2"/>
        </svg>
        <span className="text-sm font-semibold">Avenize</span>
      </div>

      <div className="max-w-[1120px] mx-auto px-6 py-8">
        {/* Bento Grid */}
        <div className="grid grid-cols-12 gap-3">
          
          {/* Hero: Revenue KPI */}
          <div className="col-span-12 lg:col-span-7 row-span-2 rounded-2xl p-5 flex flex-col justify-between min-h-[180px]" style={{ backgroundColor: '#111111' }}>
            <div>
              <div className="flex items-center gap-2 mb-3.5">
                <svg width="20" height="20" viewBox="0 0 1254 1254" aria-hidden="true" fill="#fff">
                  <path d="M613.7 269.1c-36.4 3.9-70.6 23.9-91.9 53.6-3 4.3-31.8 55.5-63.9 113.8-32 58.3-62.3 113.2-67.1 122-39.2 71.1-34.9 137 11.5 177.3 11.2 9.7 36.3 23 38.7 20.5 1.1-1 97.6-176.1 121-219.3 3.1-5.8 12.1-22.2 20-36.5s18.1-32.9 22.7-41.4c10.9-20.1 15.7-27.3 23.2-35.4 30.8-32.9 80.2-40.8 124.9-20.1 8.8 4 25.4 14.9 29.6 19.3 1.7 1.7 3.4 3.1 3.9 3.1 1.1 0-42.1-85-48.5-95.3-26.3-42.8-74.8-66.8-124.1-61.6"/>
                  <path d="M696 416.6c-22.5 3.4-37.8 11-51.6 25.5-6.9 7.4-14.4 18.3-14.4 21.1 0 .8 5.5 10.4 12.1 21.4 21.1 34.6 98.1 163.2 110.9 185 69.7 118.8 71.4 121.9 76.5 136.6 6.5 18.8 7.4 43.4 2.1 61.3-11.1 37.5-40.2 67.2-76.4 78.1-4.8 1.4-9.3 2.8-10.1 3-.8.3-1.2.5-1 .7.2.1 35.7 0 78.9-.3l78.5-.6 9.5-2.6c47.3-12.9 78.8-45.8 86.5-90.2 4.8-27.9-1.6-55.5-20.2-87.2-7.8-13.1-20.1-34.6-77.3-134.4-86.8-151.4-82.7-144.4-92.8-159-22.5-32.4-56.2-54.1-90.1-58-8.4-1-16.1-1.1-21.1-.4"/>
                  <path d="M339.9 647.2c-1.2 2.4-16.1 29.3-33.2 59.8-39.8 71.2-44.2 80.6-49.2 104.5-13.2 63.8 27.5 122.9 93.4 135.5 10.5 2 13.4 2.1 61.8 1.7 77.6-.6 69.4 2.1 184.8-61.4 33-18.1 90.2-49.3 127-69.3 36.9-20 67.4-36.6 67.8-37 1.1-.9-35.1-62.9-40.2-69-19.7-23.4-62.3-28.2-102.6-11.5-9.8 4-12.4 5.3-55 28.8-91.9 50.6-90 49.7-110.4 53.1-74.3 12.5-141.2-46.1-141.5-124.1-.1-8.4-.2-15.3-.3-15.3-.2 0-1.2 1.9-2.4 4.2"/>
                </svg>
                <span className="text-[13px] text-[#A8A8A8]">Avenize</span>
              </div>
              <div className="text-[13px] text-[#A8A8A8]">Welcome back, {staff?.full_name?.split(' ')[0] || 'User'}</div>
              <div className="text-[13px] text-[#A8A8A8] mt-1">Revenue this month</div>
              <div className="text-[34px] font-medium text-white mt-0.5">{formatCurrency(stats.revenue)}</div>
            </div>
            <div className="flex items-end gap-1 h-10">
              {[40, 55, 45, 70, 60, 90, 100].map((h, i) => (
                <div 
                  key={i}
                  className={`w-2.5 rounded-sm ${i >= 5 ? 'bg-indigo-500' : 'bg-[#3B82F6]'}`}
                  style={{ height: `${h}%` }}
                />
              ))}
              <span className="text-[12px] text-emerald-400 ml-2.5 mb-0.5">+{stats.revenueChange}%</span>
            </div>
          </div>

          {/* Workspace Launcher */}
          <div className="col-span-12 lg:col-span-5 row-span-2 grid grid-cols-2 gap-3">
            <Link 
              to="/app/crm"
              className="rounded-2xl p-3.5 flex flex-col justify-center gap-2 hover:opacity-80 transition-opacity"
              style={{ backgroundColor: isDarkBg ? '#201D16' : '#F7F7F5' }}
            >
              <div className="w-8 h-8 rounded-lg bg-[#E6F1FB] flex items-center justify-center">
                <Users size={18} className="text-[#185FA5]" />
              </div>
              <div className="text-[13px] font-medium" style={{ color: isDarkBg ? '#F7F4EE' : '#111111' }}>CRM</div>
            </Link>
            <Link 
              to="/app/finance"
              className="rounded-2xl p-3.5 flex flex-col justify-center gap-2 hover:opacity-80 transition-opacity"
              style={{ backgroundColor: isDarkBg ? '#201D16' : '#F7F7F5' }}
            >
              <div className="w-8 h-8 rounded-lg bg-[#EAF3DE] flex items-center justify-center">
                <DollarSign size={18} className="text-[#27500A]" />
              </div>
              <div className="text-[13px] font-medium" style={{ color: isDarkBg ? '#F7F4EE' : '#111111' }}>Finance</div>
            </Link>
            <Link 
              to="/app/projects"
              className="rounded-2xl p-3.5 flex flex-col justify-center gap-2 hover:opacity-80 transition-opacity"
              style={{ backgroundColor: isDarkBg ? '#201D16' : '#F7F7F5' }}
            >
              <div className="w-8 h-8 rounded-lg bg-[#FAEEDA] flex items-center justify-center">
                <Target size={18} className="text-[#633806]" />
              </div>
              <div className="text-[13px] font-medium" style={{ color: isDarkBg ? '#F7F4EE' : '#111111' }}>Projects</div>
            </Link>
            <Link 
              to="/app/people"
              className="rounded-2xl p-3.5 flex flex-col justify-center gap-2 hover:opacity-80 transition-opacity"
              style={{ backgroundColor: isDarkBg ? '#201D16' : '#F7F7F5' }}
            >
              <div className="w-8 h-8 rounded-lg bg-[#EEEDFE] flex items-center justify-center">
                <UserCircle size={18} className="text-[#3C3489]" />
              </div>
              <div className="text-[13px] font-medium" style={{ color: isDarkBg ? '#F7F4EE' : '#111111' }}>People</div>
            </Link>
          </div>

          {/* Stat: Hot deals */}
          <Link to="/app/crm" className="col-span-6 md:col-span-3 rounded-2xl border p-4 hover:opacity-80 transition-opacity" style={{ backgroundColor: isDarkBg ? '#17150F' : '#FFFFFF', borderColor: isDarkBg ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }}>
            <div className="flex items-center justify-between mb-2.5">
              <Flame size={18} className="text-[#D85A30]" />
              <span className="text-[12px] text-[#639922]">+{stats.hotDealsChange} this week</span>
            </div>
            <div className="text-[22px] font-medium" style={{ color: isDarkBg ? '#F7F4EE' : '#111111' }}>{stats.hotDeals}</div>
            <div className="text-[12px]" style={{ color: isDarkBg ? '#A79F91' : '#5F5E5A' }}>Hot deals</div>
          </Link>

          {/* Stat: Pipeline */}
          <Link to="/app/crm" className="col-span-6 md:col-span-3 rounded-2xl border p-4 hover:opacity-80 transition-opacity" style={{ backgroundColor: isDarkBg ? '#17150F' : '#FFFFFF', borderColor: isDarkBg ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }}>
            <div className="flex items-center justify-between mb-2.5">
              <TrendingUp size={18} className="text-[#185FA5]" />
              <span className="text-[12px] text-[#639922]">+{formatCurrency(stats.pipelineChange)}</span>
            </div>
            <div className="text-[22px] font-medium" style={{ color: isDarkBg ? '#F7F4EE' : '#111111' }}>{formatCurrency(stats.pipeline)}</div>
            <div className="text-[12px]" style={{ color: isDarkBg ? '#A79F91' : '#5F5E5A' }}>Pipeline value</div>
          </Link>

          {/* Stat: Pending tasks */}
          <Link to="/app/tasks" className="col-span-6 md:col-span-3 rounded-2xl border p-4 hover:opacity-80 transition-opacity" style={{ backgroundColor: isDarkBg ? '#17150F' : '#FFFFFF', borderColor: isDarkBg ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }}>
            <div className="flex items-center justify-between mb-2.5">
              <List size={18} className="text-[#3C3489]" />
              <span className="text-[12px] text-[#854F0B]">{stats.pendingTasksChange}</span>
            </div>
            <div className="text-[22px] font-medium" style={{ color: isDarkBg ? '#F7F4EE' : '#111111' }}>{stats.pendingTasks}</div>
            <div className="text-[12px]" style={{ color: isDarkBg ? '#A79F91' : '#5F5E5A' }}>Pending tasks</div>
          </Link>

          {/* Stat: Team members */}
          <Link to="/app/people" className="col-span-6 md:col-span-3 rounded-2xl border p-4 hover:opacity-80 transition-opacity" style={{ backgroundColor: isDarkBg ? '#17150F' : '#FFFFFF', borderColor: isDarkBg ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }}>
            <div className="flex items-center justify-between mb-2.5">
              <UsersRound size={18} className="text-[#0F6E56]" />
              <span className="text-[12px] text-[#639922]">+{stats.teamMembersChange}</span>
            </div>
            <div className="text-[22px] font-medium" style={{ color: isDarkBg ? '#F7F4EE' : '#111111' }}>{stats.teamMembers}</div>
            <div className="text-[12px]" style={{ color: isDarkBg ? '#A79F91' : '#5F5E5A' }}>Team members</div>
          </Link>

          {/* Recent Activity */}
          <div className="col-span-12 lg:col-span-7 rounded-2xl border p-4" style={{ backgroundColor: isDarkBg ? '#17150F' : '#FFFFFF', borderColor: isDarkBg ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }}>
            <div className="text-[14px] font-medium mb-3.5" style={{ color: isDarkBg ? '#F7F4EE' : '#111111' }}>Recent activity</div>
            <div className="space-y-3">
              {recentActivity.map((activity, i) => (
                <div key={i} className="flex gap-2.5 items-start">
                  <div 
                    className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: activity.color }}
                  >
                    {getActivityIcon(activity.icon)}
                  </div>
                  <div>
                    <div className="text-[13px]" style={{ color: isDarkBg ? '#F7F4EE' : '#111111' }}>{activity.text}</div>
                    <div className="text-[11px]" style={{ color: isDarkBg ? '#726A5C' : '#888780' }}>{activity.time}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Upcoming */}
          <div className="col-span-12 lg:col-span-5 rounded-2xl border p-4" style={{ backgroundColor: isDarkBg ? '#17150F' : '#FFFFFF', borderColor: isDarkBg ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }}>
            <div className="text-[14px] font-medium mb-3.5" style={{ color: isDarkBg ? '#F7F4EE' : '#111111' }}>Upcoming</div>
            <div className="space-y-3">
              {upcomingEvents.map((event, i) => (
                <div key={i} className="flex items-center gap-2.5">
                  <div 
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: event.color }}
                  />
                  <div>
                    <div className="text-[13px]" style={{ color: isDarkBg ? '#F7F4EE' : '#111111' }}>{event.text}</div>
                    <div className="text-[11px]" style={{ color: isDarkBg ? '#726A5C' : '#888780' }}>{event.time}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}

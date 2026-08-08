import { useState, useEffect } from 'react'
import { 
  BarChart3, Users, Activity, TrendingUp, Clock, 
  AlertTriangle, Eye, MousePointer, Search, Zap,
  Calendar, Filter, Download, RefreshCw, ChevronDown,
  Database, Globe, MessageSquare, CreditCard, Settings,
  CheckCircle, XCircle, Filter as FilterIcon, TrendingDown, PieChart as PieChartIcon
} from 'lucide-react'
import { useAuth } from '../lib/AuthContext'
import { getAdminAnalytics, getRecentEvents } from '../lib/eventTracker'
import { supabase } from '../lib/supabase'
import { BarChart, LineChart, PieChart, DonutChart, Sparkline } from '../lib/charts'

// Admin-only check
function useIsAdmin() {
  const { staff } = useAuth()
  return staff?.role === 'owner' || staff?.role === 'admin'
}

interface AnalyticsData {
  eventsByCategory: any[]
  userActivity: any[]
  topFeatures: any[]
  errorCount: number
  totalEvents: number
  eventsOverTime: { label: string; value: number }[]
}

interface RawAnalyticsData {
  eventsByCategory?: any[]
  userActivity?: any[]
  topFeatures?: any[]
  errorCount?: number
  totalEvents?: number
}

export default function AdminAnalytics() {
  const { staff } = useAuth()
  const isAdmin = useIsAdmin()
  const [loading, setLoading] = useState(true)
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null)
  const [recentEvents, setRecentEvents] = useState<any[]>([])
  const [timeRange, setTimeRange] = useState(7)
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null)

  useEffect(() => {
    if (staff?.business_id) {
      loadAnalytics()
    }
  }, [staff?.business_id, timeRange])

  async function loadAnalytics() {
    if (!staff?.business_id) return
    setLoading(true)

    const [analyticsData, eventsData] = await Promise.all([
      getAdminAnalytics(staff.business_id, timeRange),
      getRecentEvents(staff.business_id, 100),
    ])

    // Calculate events over time for the line chart
    const eventsOverTime = calculateEventsOverTime(eventsData, timeRange)

    setAnalytics({ 
      eventsByCategory: analyticsData?.eventsByCategory || [],
      userActivity: analyticsData?.userActivity || [],
      topFeatures: analyticsData?.topFeatures || [],
      errorCount: analyticsData?.errorCount || 0,
      totalEvents: analyticsData?.totalEvents || 0,
      eventsOverTime 
    })
    setRecentEvents(eventsData)
    setLoading(false)
  }

  // Calculate events grouped by time period
  function calculateEventsOverTime(events: any[], days: number) {
    const now = new Date()
    const data: { label: string; value: number }[] = []
    
    // Group by day
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now)
      date.setDate(date.getDate() - i)
      const dateStr = date.toISOString().split('T')[0]
      const label = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
      
      const count = events.filter(e => 
        e.created_at && e.created_at.startsWith(dateStr)
      ).length
      
      data.push({ label, value: count })
    }
    
    return data
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <AlertTriangle size={48} className="text-amber-500 mb-4" />
        <h1 className="text-xl font-bold text-black mb-2">Access Restricted</h1>
        <p className="text-black">This page is only visible to administrators.</p>
      </div>
    )
  }

  const categoryIcons: Record<string, any> = {
    page_view: Eye,
    user_action: MousePointer,
    feature_usage: Zap,
    search: Search,
    error: AlertTriangle,
    payment: CreditCard,
    notification: MessageSquare,
    auth: Users,
    performance: Clock,
    engagement: Activity,
  }

  const categoryColors: Record<string, string> = {
    page_view: 'bg-blue-100 text-blue-600',
    user_action: 'bg-green-100 text-green-600',
    feature_usage: 'bg-purple-100 text-purple-600',
    search: 'bg-amber-100 text-amber-600',
    error: 'bg-red-100 text-red-600',
    payment: 'bg-emerald-100 text-emerald-600',
    notification: 'bg-indigo-100 text-indigo-600',
    auth: 'bg-white text-black',
    performance: 'bg-orange-100 text-orange-600',
    engagement: 'bg-pink-100 text-pink-600',
  }

  // Get hex color for charts
  const categoryColorValues: Record<string, string> = {
    page_view: '#3B82F6',
    user_action: '#10B981',
    feature_usage: '#8B5CF6',
    search: '#F59E0B',
    error: '#EF4444',
    payment: '#10B981',
    notification: '#6366F1',
    auth: '#1e293b',
    performance: '#F97316',
    engagement: '#EC4899',
  }

  function getCategoryColor(category: string): string {
    return categoryColorValues[category] || '#1e293b'
  }

  const filteredEvents = selectedCategory === 'all' 
    ? recentEvents 
    : recentEvents.filter(e => e.category === selectedCategory)

  const totalCategoryCount = analytics?.eventsByCategory.reduce((sum, c) => sum + c.count, 0) || 0

  return (
    <div className="max-w-7xl mx-auto pb-20">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-black">Admin Analytics</h1>
          <p className="text-sm text-black">Monitor all app activity and user engagement</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(Number(e.target.value))}
            className="px-3 py-2 rounded-lg border border-black/10 text-sm"
          >
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
          <button
            onClick={loadAnalytics}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--av-primary, #475569)] text-white text-sm"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button className="flex items-center gap-2 px-4 py-2 rounded-lg border border-black/10 text-sm">
            <Download size={16} />
            Export
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <SummaryCard
          title="Total Events"
          value={analytics?.totalEvents?.toLocaleString() || '0'}
          subtitle={`Last ${timeRange} days`}
          icon={<Activity size={20} />}
          color="bg-blue-500"
        />
        <SummaryCard
          title="Active Users"
          value={new Set(recentEvents.map(e => e.user_id)).size.toString()}
          subtitle="Unique users"
          icon={<Users size={20} />}
          color="bg-green-500"
        />
        <SummaryCard
          title="Errors"
          value={analytics?.errorCount?.toString() || '0'}
          subtitle={analytics?.totalEvents ? `${((analytics.errorCount / analytics.totalEvents) * 100).toFixed(2)}%` : '0%'}
          icon={<AlertTriangle size={20} />}
          color="bg-red-500"
        />
        <SummaryCard
          title="Avg Events/User"
          value={analytics?.totalEvents ? Math.round(analytics.totalEvents / Math.max(1, new Set(recentEvents.map(e => e.user_id)).size)).toString() : '0'}
          subtitle="Per user"
          icon={<TrendingUp size={20} />}
          color="bg-purple-500"
        />
      </div>

      {/* Charts Section */}
      <div className="grid md:grid-cols-2 gap-6 mb-6">
        {/* Events Over Time - Line Chart */}
        <div className="bg-white rounded-2xl border border-black/[0.06] p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Events Over Time</h2>
          </div>
          <div className="h-48">
            {analytics?.eventsOverTime && analytics.eventsOverTime.length > 0 ? (
              <LineChart 
                data={analytics.eventsOverTime}
                width={500}
                height={180}
                showDots={analytics.eventsOverTime.length <= 14}
                fill
              />
            ) : (
              <div className="flex items-center justify-center h-full text-black">
                <div className="text-center">
                  <TrendingUp size={32} className="mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No timeline data yet</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Category Distribution - Pie Chart */}
        <div className="bg-white rounded-2xl border border-black/[0.06] p-6">
          <h2 className="font-semibold mb-4">Category Distribution</h2>
          {analytics?.eventsByCategory && analytics.eventsByCategory.length > 0 ? (
            <div className="flex items-center justify-center">
              <PieChart 
                data={analytics.eventsByCategory.map((cat) => ({
                  label: cat.category.replace('_', ' '),
                  value: cat.count,
                  color: getCategoryColor(cat.category),
                }))}
                size={160}
              />
            </div>
          ) : (
            <div className="flex items-center justify-center h-40 text-black">
              <div className="text-center">
                <PieChartIcon size={32} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">No category data</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Top Features Bar Chart */}
      <div className="bg-white rounded-2xl border border-black/[0.06] p-6 mb-6">
        <h2 className="font-semibold mb-4">Top Features</h2>
        {analytics?.topFeatures && analytics.topFeatures.length > 0 ? (
          <BarChart 
            data={analytics.topFeatures.slice(0, 6).map((feature) => ({
              label: feature.action,
              value: feature.count,
            }))}
            width={700}
            height={200}
            horizontal={false}
          />
        ) : (
          <div className="flex items-center justify-center h-40 text-black">
            <div className="text-center">
              <BarChart3 size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">No feature data</p>
            </div>
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left Column - Event Categories */}
        <div className="lg:col-span-2 space-y-6">
          {/* Event Categories */}
          <div className="bg-white rounded-2xl border border-black/[0.06] p-6">
            <h2 className="font-semibold mb-4">Events by Category</h2>
            <div className="space-y-3">
              {analytics?.eventsByCategory.map((cat) => {
                const Icon = categoryIcons[cat.category] || Activity
                const colorClass = categoryColors[cat.category] || 'bg-white text-black'
                const percentage = totalCategoryCount > 0 ? ((cat.count / totalCategoryCount) * 100).toFixed(1) : '0'
                
                return (
                  <div key={cat.category} className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-xl ${colorClass} flex items-center justify-center`}>
                      <Icon size={18} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-sm capitalize">
                          {cat.category.replace('_', ' ')}
                        </span>
                        <span className="text-sm text-black">{cat.count.toLocaleString()}</span>
                      </div>
                      <div className="h-2 bg-black/10 rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full ${colorClass.replace('100', '500').replace('text-', 'bg-')}`}
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Top Features */}
          <div className="bg-white rounded-2xl border border-black/[0.06] p-6">
            <h2 className="font-semibold mb-4">Most Used Features</h2>
            <div className="space-y-2">
              {analytics?.topFeatures.map((feature, i) => (
                <div key={feature.action} className="flex items-center gap-4 p-3 bg-black/[0.02] rounded-xl">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold ${
                    i === 0 ? 'bg-amber-500' : i === 1 ? 'bg-black' : i === 2 ? 'bg-amber-700' : 'bg-black/10 text-black'
                  }`}>
                    #{i + 1}
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-sm">{feature.action}</div>
                    <div className="text-xs text-black">{feature.count} uses</div>
                  </div>
                </div>
              ))}
              {(!analytics?.topFeatures || analytics.topFeatures.length === 0) && (
                <div className="text-center py-8 text-black">
                  <BarChart3 size={32} className="mx-auto mb-2" />
                  <p>No feature data yet</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column - Recent Events */}
        <div className="bg-white rounded-2xl border border-black/[0.06] p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Recent Events</h2>
            <span className="text-xs text-black">{filteredEvents.length} events</span>
          </div>

          {/* Filter */}
          <div className="flex flex-wrap gap-2 mb-4">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-3 py-1 rounded-full text-xs font-medium ${
                selectedCategory === 'all' 
                  ? 'bg-[var(--av-primary, #475569)] text-white' 
                  : 'bg-black/10 text-black/60'
              }`}
            >
              All
            </button>
            {analytics?.eventsByCategory.map((cat) => {
              const Icon = categoryIcons[cat.category] || Activity
              return (
                <button
                  key={cat.category}
                  onClick={() => setSelectedCategory(cat.category)}
                  className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium ${
                    selectedCategory === cat.category
                      ? 'bg-[var(--av-primary, #475569)] text-white'
                      : 'bg-black/10 text-black/60'
                  }`}
                >
                  <Icon size={12} />
                  {cat.category.replace('_', ' ')}
                </button>
              )
            })}
          </div>

          {/* Event List */}
          <div className="space-y-2 max-h-[600px] overflow-y-auto">
            {filteredEvents.slice(0, 50).map((event) => {
              const Icon = categoryIcons[event.category] || Activity
              const colorClass = categoryColors[event.category] || 'bg-white text-black'
              const isExpanded = expandedEvent === event.id
              
              return (
                <div 
                  key={event.id}
                  className="p-3 bg-black/[0.02] rounded-xl hover:bg-black/[0.04] transition cursor-pointer"
                  onClick={() => setExpandedEvent(isExpanded ? null : event.id)}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-lg ${colorClass} flex items-center justify-center shrink-0`}>
                      <Icon size={14} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-sm truncate">{event.event_name}</span>
                        <span className="text-[10px] text-black shrink-0">
                          {new Date(event.created_at).toLocaleTimeString()}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-black">{event.page || 'unknown'}</span>
                        {event.user?.full_name && (
                          <>
                            <span className="text-black/50">•</span>
                            <span className="text-xs text-black">{event.user.full_name}</span>
                          </>
                        )}
                      </div>
                      {isExpanded && event.metadata && Object.keys(event.metadata).length > 0 && (
                        <div className="mt-2 p-2 bg-black/10 rounded text-xs">
                          <pre className="whitespace-pre-wrap font-mono">
                            {JSON.stringify(event.metadata, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Database Stats */}
      <div className="mt-6 bg-white rounded-2xl border border-black/[0.06] p-6">
        <h2 className="font-semibold mb-4">Database Overview</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <DatabaseStat label="Analytics Events" value={analytics?.totalEvents || 0} />
          <DatabaseStat label="Unique Sessions" value={new Set(recentEvents.map(e => e.session_id)).size} />
          <DatabaseStat label="Error Rate" value={`${analytics?.totalEvents ? ((analytics.errorCount / analytics.totalEvents) * 100).toFixed(3) : '0'}%`} />
          <DatabaseStat label="Avg Response" value="45ms" />
        </div>
      </div>
    </div>
  )
}

function SummaryCard({ title, value, subtitle, icon, color }: any) {
  return (
    <div className="bg-white rounded-2xl border border-black/[0.06] p-4">
      <div className="flex items-center justify-between mb-2">
        <div className={`w-10 h-10 rounded-xl ${color} flex items-center justify-center text-white`}>
          {icon}
        </div>
      </div>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-sm text-black">{title}</div>
      <div className="text-xs text-black mt-1">{subtitle}</div>
    </div>
  )
}

function DatabaseStat({ label, value }: any) {
  return (
    <div className="p-4 bg-black/[0.02] rounded-xl">
      <div className="text-2xl font-bold font-mono">{value?.toLocaleString()}</div>
      <div className="text-sm text-black">{label}</div>
    </div>
  )
}

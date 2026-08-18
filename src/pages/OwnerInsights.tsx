import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { BarChart3, Users, DollarSign, Target, Bot, Clock, ArrowUp, ArrowDown, ChevronRight } from 'lucide-react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'

interface ActivityItem {
  id: string
  action: string
  entity_type: string
  created_at: string
  user_email: string | null
}

interface Metrics {
  revenueThisMonth: number
  activeDeals: number
  teamMembers: number
  propertyCount: number
  revenueChange: number | null
}

export default function OwnerInsights() {
  const { staff } = useAuth()
  const [activeTab, setActiveTab] = useState<'overview' | 'sarah' | 'modules'>('overview')
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [metrics, setMetrics] = useState<Metrics>({
    revenueThisMonth: 0,
    activeDeals: 0,
    teamMembers: 0,
    propertyCount: 0,
    revenueChange: null,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (staff?.business_id) fetchRealData()
  }, [staff])

  // Pull real business metrics + recent audit-log activity so the owner sees
  // their actual numbers, not placeholders.
  async function fetchRealData() {
    if (!staff?.business_id) return
    const biz = staff.business_id

    const now = new Date()
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString()
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).toISOString()

    const [dealsRes, staffRes, propsRes, invThisMonth, invLastMonth, auditRes] = await Promise.all([
      supabase.from('deals').select('id', { count: 'exact', head: true })
        .eq('business_id', biz).in('stage', ['prospect', 'qualified', 'proposal', 'negotiation']),
      supabase.from('staff').select('id', { count: 'exact', head: true }).eq('business_id', biz),
      supabase.from('properties').select('id', { count: 'exact', head: true }).eq('business_id', biz),
      supabase.from('invoices').select('total').eq('business_id', biz).gte('created_at', thisMonthStart),
      supabase.from('invoices').select('total').eq('business_id', biz).gte('created_at', lastMonthStart).lte('created_at', lastMonthEnd),
      supabase.from('audit_logs')
        .select('id, action, entity_type, created_at, user_id')
        .eq('business_id', biz)
        .order('created_at', { ascending: false })
        .limit(8),
    ])

    const thisMonthRevenue = (invThisMonth.data || []).reduce((s: number, i: any) => s + Number(i.total || 0), 0)
    const lastMonthRevenue = (invLastMonth.data || []).reduce((s: number, i: any) => s + Number(i.total || 0), 0)
    const change = lastMonthRevenue > 0 ? ((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100 : null

    setMetrics({
      revenueThisMonth: thisMonthRevenue,
      activeDeals: dealsRes.count || 0,
      teamMembers: staffRes.count || 0,
      propertyCount: propsRes.count || 0,
      revenueChange: change,
    })

    // Enrich activity with the actor's email when we can.
    const userIds = [...new Set((auditRes.data || []).map((a: any) => a.user_id).filter(Boolean))]
    let userEmailMap: Record<string, string> = {}
    if (userIds.length > 0) {
      const { data: users } = await supabase.from('staff').select('user_id, full_name').in('user_id', userIds)
      userEmailMap = Object.fromEntries((users || []).map((u: any) => [u.user_id, u.full_name]))
    }
    setActivity((auditRes.data || []).map((a: any) => ({
      id: a.id,
      action: `${a.action} ${a.entity_type}`,
      entity_type: a.entity_type,
      created_at: a.created_at,
      user_email: a.user_id ? (userEmailMap[a.user_id] || 'Staff') : 'System',
    })))
    setLoading(false)
  }

  const fmtMoney = (n: number) =>
    new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(n)

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-black">Owner Insights</h1>
          <p className="text-black/60">Your business command center</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-black/60">
          <Clock size={16} />
          <span>Last updated: {new Date().toLocaleTimeString()}</span>
        </div>
      </div>

      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        {[
          { id: 'overview', label: 'Overview', icon: BarChart3 },
          { id: 'sarah', label: 'Help Guide Analytics', icon: Bot },
          { id: 'modules', label: 'Module Usage', icon: Target },
        ].map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition ${
                activeTab === tab.id ? 'bg-[#4285F4] text-white' : 'bg-white text-black hover:bg-black/5'
              }`}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          )
        })}
      </div>

      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard label="Revenue This Month" value={fmtMoney(metrics.revenueThisMonth)} change={metrics.revenueChange} icon={DollarSign} color="green" loading={loading} />
            <MetricCard label="Active Deals" value={String(metrics.activeDeals)} icon={Target} color="indigo" loading={loading} />
            <MetricCard label="Team Members" value={String(metrics.teamMembers)} icon={Users} color="purple" loading={loading} />
            <MetricCard label="Properties" value={String(metrics.propertyCount)} icon={BarChart3} color="blue" loading={loading} />
          </div>

          <div className="bg-white rounded-xl p-6 shadow-sm">
            <h2 className="text-lg font-bold text-black mb-4">Recent Activity</h2>
            {activity.length === 0 ? (
              <p className="text-sm text-black/40 py-8 text-center">No recent activity recorded yet.</p>
            ) : (
              <div className="space-y-3">
                {activity.map((item) => (
                  <div key={item.id} className="flex items-center justify-between p-3 bg-[#F8F9FA] rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${
                        item.entity_type === 'invoice' ? 'bg-[var(--av-success-soft)]0' :
                        item.entity_type === 'deal' ? 'bg-[#4285F4]' :
                        item.entity_type === 'property' ? 'bg-[var(--av-warning-soft)]0' : 'bg-purple-500'
                      }`} />
                      <div>
                        <p className="text-sm font-medium text-black capitalize">{item.action}</p>
                        <p className="text-xs text-black/50">by {item.user_email}</p>
                      </div>
                    </div>
                    <span className="text-xs text-black/40">
                      {new Date(item.created_at).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'sarah' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl p-8 shadow-sm text-center">
            <Bot size={40} className="text-[#4285F4] mx-auto mb-3" />
            <h2 className="text-lg font-bold text-black mb-2">Help Guide Analytics</h2>
            <p className="text-sm text-black/60 max-w-md mx-auto">
              Conversation analytics for the Avenize Help Guide require a dedicated
              analytics pipeline. Connect your chat event source to populate these metrics.
            </p>
          </div>
        </div>
      )}

      {activeTab === 'modules' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl p-8 shadow-sm text-center">
            <Target size={40} className="text-[#4285F4] mx-auto mb-3" />
            <h2 className="text-lg font-bold text-black mb-2">Module Usage</h2>
            <p className="text-sm text-black/60 max-w-md mx-auto">
              Per-module usage stats (active users, sessions, time) require session tracking.
              Enable product analytics to see how your team uses each module.
            </p>
            <div className="flex flex-wrap justify-center gap-2 mt-4">
              <Link to="/app/crm" className="px-3 py-1.5 bg-[#F8F9FA] rounded-lg text-sm text-black/70 hover:bg-black/5 transition flex items-center gap-1">
                CRM <ChevronRight size={14} />
              </Link>
              <Link to="/app/finance" className="px-3 py-1.5 bg-[#F8F9FA] rounded-lg text-sm text-black/70 hover:bg-black/5 transition flex items-center gap-1">
                Finance <ChevronRight size={14} />
              </Link>
              <Link to="/app/projects" className="px-3 py-1.5 bg-[#F8F9FA] rounded-lg text-sm text-black/70 hover:bg-black/5 transition flex items-center gap-1">
                Projects <ChevronRight size={14} />
              </Link>
              <Link to="/app/properties" className="px-3 py-1.5 bg-[#F8F9FA] rounded-lg text-sm text-black/70 hover:bg-black/5 transition flex items-center gap-1">
                Properties <ChevronRight size={14} />
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function MetricCard({ label, value, change, icon: Icon, color, loading }: { label: string, value: string, change?: number | null, icon: any, color: string, loading?: boolean }) {
  const colorClasses: Record<string, string> = {
    green: 'bg-[var(--av-success-soft)] text-[var(--av-success)]',
    indigo: 'bg-[#4285F4]/5 text-[#4285F4]',
    purple: 'bg-purple-50 text-purple-600',
    blue: 'bg-[var(--av-primary-soft)] text-[var(--av-primary)]',
    amber: 'bg-[var(--av-warning-soft)] text-[var(--av-warning)]',
  }
  return (
    <div className="bg-white rounded-xl p-5 shadow-sm">
      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 rounded-lg ${colorClasses[color]} flex items-center justify-center`}>
          <Icon size={20} />
        </div>
        {change !== undefined && change !== null && (
          <span className={`flex items-center gap-1 text-sm font-medium ${change >= 0 ? 'text-[var(--av-success)]' : 'text-[var(--av-danger)]'}`}>
            {change >= 0 ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
            {Math.abs(change).toFixed(1)}%
          </span>
        )}
      </div>
      <div className="text-2xl font-bold text-black mb-1">
        {loading ? '—' : value}
      </div>
      <div className="text-sm text-black/60">{label}</div>
    </div>
  )
}

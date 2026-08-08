import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BarChart3, Users, DollarSign, Target, TrendingUp, TrendingDown, MessageSquare, Bot, Clock, ArrowUp, ArrowDown, Eye, MousePointer, Calendar, ChevronRight, Activity, Zap, Star, AlertCircle, CheckCircle } from 'lucide-react'

const SARAH_STATS = {
  total_conversations: 1247,
  unique_users: 342,
  avg_response_time: '1.2s',
  satisfaction: 94,
  top_questions: [
    { q: 'How do I send an invoice?', count: 156 },
    { q: 'How do I add a lead in CRM?', count: 134 },
    { q: 'Pricing and plans', count: 98 },
    { q: 'How do I track projects?', count: 87 },
    { q: 'Getting started guide', count: 76 },
  ],
  resolved_queries: 1189,
  escalation_rate: 4.6,
  weekly_comparison: { current: 1247, previous: 1089, change: 14.5 },
}

const MODULE_USAGE = [
  { module: 'CRM', users: 38, sessions: 1247, avg_time: '8.5 min', growth: 15 },
  { module: 'Finance', users: 32, sessions: 892, avg_time: '6.2 min', growth: 22 },
  { module: 'Projects', users: 28, sessions: 756, avg_time: '12.3 min', growth: 18 },
  { module: 'People/HR', users: 24, sessions: 445, avg_time: '4.1 min', growth: 8 },
  { module: 'Tasks', users: 36, sessions: 1023, avg_time: '5.8 min', growth: 12 },
  { module: 'Chat', users: 40, sessions: 2156, avg_time: '15.2 min', growth: 25 },
]

const RECENT_ACTIVITY = [
  { action: 'Invoice #INV-0045 sent', user: 'Aminat Bello', time: '2 min ago', type: 'finance' },
  { action: 'New lead added: Alhaji Motors', user: 'Chinedu Okafor', time: '5 min ago', type: 'crm' },
  { action: 'Project completed: EduFirst Phase 2', user: 'Emeka Nwosu', time: '12 min ago', type: 'project' },
  { action: 'Staff onboarding: 2 new hires', user: 'Sarah (System)', time: '1 hour ago', type: 'hr' },
  { action: 'Deal closed: 2.5M - Riverside Construction', user: 'Chinedu Okafor', time: '2 hours ago', type: 'crm' },
]

const PERFORMANCE = [
  { metric: 'Page Load Time', value: '1.2s', status: 'good', target: '< 2s' },
  { metric: 'API Response', value: '245ms', status: 'good', target: '< 500ms' },
  { metric: 'Uptime', value: '99.9%', status: 'good', target: '> 99.5%' },
  { metric: 'Error Rate', value: '0.12%', status: 'good', target: '< 1%' },
]

export default function OwnerInsights() {
  const [activeTab, setActiveTab] = useState<'overview' | 'sarah' | 'modules'>('overview')

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-black">Owner Insights</h1>
          <p className="text-black">Your business command center</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-black">
          <Clock size={16} />
          <span>Last updated: {new Date().toLocaleTimeString()}</span>
        </div>
      </div>

      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        {[
          { id: 'overview', label: 'Overview', icon: BarChart3 },
          { id: 'sarah', label: 'Sarah Analytics', icon: Bot },
          { id: 'modules', label: 'Module Usage', icon: Target },
        ].map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition ${
                activeTab === tab.id ? 'bg-[#4285F4] text-white' : 'bg-white text-black hover:bg-white'
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
            <MetricCard label="Revenue This Month" value="2.45M" change={12.4} icon={DollarSign} color="green" prefix="N" />
            <MetricCard label="Active Deals" value="24" change={5} icon={Target} color="indigo" />
            <MetricCard label="Team Members" value="42" change={2} icon={Users} color="purple" />
            <MetricCard label="Sarah Conversations" value="1,247" change={14.5} icon={MessageSquare} color="blue" />
          </div>

          <div className="bg-white rounded-xl p-6 border border-white">
            <h2 className="text-lg font-bold text-black mb-4">System Performance</h2>
            <div className="grid md:grid-cols-4 gap-4">
              {PERFORMANCE.map((p, i) => (
                <div key={i} className="text-center p-4 bg-white rounded-lg">
                  <CheckCircle size={24} className="text-green-500 mx-auto mb-2" />
                  <div className="text-xl font-bold text-black">{p.value}</div>
                  <div className="text-sm text-black">{p.metric}</div>
                  <div className="text-xs text-black mt-1">Target: {p.target}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl p-6 border border-white">
            <h2 className="text-lg font-bold text-black mb-4">Recent Activity</h2>
            <div className="space-y-3">
              {RECENT_ACTIVITY.map((item, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-white rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${
                      item.type === 'finance' ? 'bg-green-500' :
                      item.type === 'crm' ? 'bg-[#4285F4]' :
                      item.type === 'project' ? 'bg-amber-500' : 'bg-purple-500'
                    }`} />
                    <div>
                      <p className="text-sm font-medium text-black">{item.action}</p>
                      <p className="text-xs text-black">by {item.user}</p>
                    </div>
                  </div>
                  <span className="text-xs text-black">{item.time}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'sarah' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard label="Total Conversations" value="1,247" change={14.5} icon={MessageSquare} color="blue" />
            <MetricCard label="Unique Users" value="342" change={8.2} icon={Users} color="purple" />
            <MetricCard label="Queries Resolved" value="1,189" change={12.1} icon={CheckCircle} color="green" />
            <MetricCard label="Satisfaction Score" value="94%" change={2.3} icon={Star} color="amber" />
          </div>

          <div className="bg-white rounded-xl p-6 border border-white">
            <h2 className="text-lg font-bold text-black mb-4">Sarah Performance</h2>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <p className="text-sm text-black mb-4">Week-over-Week</p>
                <div className="flex items-center gap-4">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-black">1,247</div>
                    <div className="text-sm text-black">This week</div>
                  </div>
                  <div className="flex items-center gap-1 text-green-600">
                    <ArrowUp size={20} />
                    <span className="font-bold">14.5%</span>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-black">1,089</div>
                    <div className="text-sm text-black">Last week</div>
                  </div>
                </div>
              </div>
              <div>
                <p className="text-sm text-black mb-4">Resolution Rate</p>
                <div className="flex items-center gap-3">
                  <div className="w-full bg-white rounded-full h-4">
                    <div className="bg-green-500 h-4 rounded-full" style={{ width: '95%' }} />
                  </div>
                  <span className="font-bold text-black">95.4%</span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl p-6 border border-white">
            <h2 className="text-lg font-bold text-black mb-4">Top Questions Asked</h2>
            <div className="space-y-3">
              {SARAH_STATS.top_questions.map((item, i) => (
                <div key={i} className="flex items-center gap-4">
                  <div className="w-8 h-8 rounded-full bg-[#4285F4]/10 flex items-center justify-center text-[#4285F4] font-bold text-sm">
                    {i + 1}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-black">{item.q}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-black">{item.count}</div>
                    <div className="text-xs text-black">queries</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'modules' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl p-6 border border-white overflow-x-auto">
            <h2 className="text-lg font-bold text-black mb-4">Module Usage Across Team</h2>
            <table className="w-full min-w-[600px]">
              <thead>
                <tr className="text-left text-sm text-black border-b">
                  <th className="pb-3">Module</th>
                  <th className="pb-3 text-center">Active Users</th>
                  <th className="pb-3 text-center">Sessions</th>
                  <th className="pb-3 text-center">Avg Time</th>
                  <th className="pb-3 text-center">Growth</th>
                </tr>
              </thead>
              <tbody>
                {MODULE_USAGE.map((m, i) => (
                  <tr key={i} className="border-b border-white last:border-0">
                    <td className="py-4">
                      <Link to={`/app/${m.module.toLowerCase().split('/')[0]}`} className="flex items-center gap-2 text-black font-medium hover:text-[#4285F4]">
                        {m.module}
                        <ChevronRight size={16} />
                      </Link>
                    </td>
                    <td className="py-4 text-center">{m.users}</td>
                    <td className="py-4 text-center">{m.sessions.toLocaleString()}</td>
                    <td className="py-4 text-center">{m.avg_time}</td>
                    <td className="py-4 text-center">
                      <span className="inline-flex items-center gap-1 text-green-600">
                        <ArrowUp size={14} />
                        {m.growth}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function MetricCard({ label, value, change, icon: Icon, color, prefix = '' }: { label: string, value: string, change: number, icon: any, color: string, prefix?: string }) {
  const colorClasses: Record<string, string> = {
    green: 'bg-green-50 text-green-600',
    indigo: 'bg-[#4285F4]/5 text-[#4285F4]',
    purple: 'bg-purple-50 text-purple-600',
    blue: 'bg-blue-50 text-blue-600',
    amber: 'bg-amber-50 text-amber-600',
  }
  return (
    <div className="bg-white rounded-xl p-5 border border-white">
      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 rounded-lg ${colorClasses[color]} flex items-center justify-center`}>
          <Icon size={20} />
        </div>
        <span className={`flex items-center gap-1 text-sm font-medium ${change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
          {change >= 0 ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
          {Math.abs(change)}%
        </span>
      </div>
      <div className="text-2xl font-bold text-black mb-1">{prefix}{value}</div>
      <div className="text-sm text-black">{label}</div>
    </div>
  )
}

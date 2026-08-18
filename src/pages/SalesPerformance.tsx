import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../components/Toast'
import {
  TrendingUp, Target, DollarSign, Users, Award, BarChart3,
  Plus, Loader2, Trophy, ChevronRight, Calendar, CheckCircle2,
  XCircle, Clock, Target as TargetIcon, Percent, Gift
} from 'lucide-react'

type SalesTab = 'targets' | 'commissions' | 'forecasting' | 'winloss'

export default function SalesPerformance() {
  const { staff } = useAuth()
  const businessId = staff?.business_id
  const [activeTab, setActiveTab] = useState<SalesTab>('targets')
  const { showToast } = useToast()

  const tabs = [
    { id: 'targets', label: 'Targets', icon: TargetIcon },
    { id: 'commissions', label: 'Commissions', icon: Award },
    { id: 'forecasting', label: 'Forecasting', icon: TrendingUp },
    { id: 'winloss', label: 'Win/Loss', icon: BarChart3 },
  ]

  return (
    <div className="pb-20">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-black">Sales Performance</h1>
          <p className="text-sm text-black">Targets, commissions & analytics</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto pb-2 mb-6 scrollbar-hide">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as SalesTab)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition ${
              activeTab === tab.id
                ? 'avenize-gradient text-white'
                : 'bg-white text-black/60 hover:bg-black/10'
            }`}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'targets' && <TargetsTab businessId={businessId} staffId={staff?.id} />}
      {activeTab === 'commissions' && <CommissionsTab businessId={businessId} staffId={staff?.id} />}
      {activeTab === 'forecasting' && <ForecastingTab businessId={businessId} />}
      {activeTab === 'winloss' && <WinLossTab businessId={businessId} />}
    </div>
  )
}

// Targets Tab
function TargetsTab({ businessId, staffId }: { businessId?: string; staffId?: string }) {
  const [targets, setTargets] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const { showToast } = useToast()

  const [form, setForm] = useState({
    target_type: 'monthly',
    period_start: '',
    period_end: '',
    revenue_target: '',
    deal_count_target: '',
  })

  useEffect(() => {
    loadTargets()
  }, [])

  async function loadTargets() {
    setLoading(true)
    const { data } = await supabase
      .from('sales_targets')
      .select('*')
      .eq('business_id', businessId)
      .order('period_start', { ascending: false })
    setTargets(data || [])
    setLoading(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    await supabase.from('sales_targets').insert({
      ...form,
      business_id: businessId,
      revenue_target: parseFloat(form.revenue_target),
      deal_count_target: parseInt(form.deal_count_target),
    })
    showToast('Target created!', 'success')
    setShowForm(false)
    loadTargets()
  }

  const currentTarget = targets.find(t => t.status === 'active')
  const progress = currentTarget ? (currentTarget.actual_revenue / currentTarget.revenue_target) * 100 : 0

  return (
    <div>
      {/* Current Target Progress */}
      {currentTarget && (
        <div className="bg-gradient-to-br from-purple-500 to-[#8B5CF6] rounded-2xl p-6 text-white mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm opacity-80">
                {currentTarget.target_type === 'monthly' ? 'This Month' : 
                 currentTarget.target_type === 'quarterly' ? 'This Quarter' : 'This Year'}
              </p>
              <h2 className="text-3xl font-bold">₦{currentTarget.revenue_target.toLocaleString()}</h2>
            </div>
            <div className="text-right">
              <p className="text-sm opacity-80">Achieved</p>
              <h2 className="text-3xl font-bold">₦{currentTarget.actual_revenue?.toLocaleString() || 0}</h2>
            </div>
          </div>
          <div className="w-full bg-white/20 rounded-full h-3 mb-2">
            <div 
              className="bg-white rounded-full h-3 transition-all" 
              style={{ width: `${Math.min(progress, 100)}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-sm">
            <span>{progress.toFixed(1)}% achieved</span>
            <span>{currentTarget.actual_deals || 0} / {currentTarget.deal_count_target} deals</span>
          </div>
        </div>
      )}

      <div className="flex justify-between items-center mb-4">
        <h2 className="font-medium">Sales Targets</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--av-primary, #4285F4)] text-white text-sm"
        >
          <Plus size={16} /> Set Target
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-black/[0.06] p-4 mb-4 space-y-3">
          <select value={form.target_type} onChange={(e) => setForm({ ...form, target_type: e.target.value })} className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm">
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="annual">Annual</option>
          </select>
          <div className="grid grid-cols-2 gap-3">
            <input type="date" value={form.period_start} onChange={(e) => setForm({ ...form, period_start: e.target.value })} className="rounded-lg border border-black/10 px-3 py-2 text-sm" required />
            <input type="date" value={form.period_end} onChange={(e) => setForm({ ...form, period_end: e.target.value })} className="rounded-lg border border-black/10 px-3 py-2 text-sm" required />
          </div>
          <input type="number" placeholder="Revenue Target (₦)" value={form.revenue_target} onChange={(e) => setForm({ ...form, revenue_target: e.target.value })} className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm" required />
          <input type="number" placeholder="Deal Count Target" value={form.deal_count_target} onChange={(e) => setForm({ ...form, deal_count_target: e.target.value })} className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm" required />
          <button type="submit" className="w-full py-2 rounded-lg bg-[var(--av-primary, #4285F4)] text-white">Create Target</button>
        </form>
      )}

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="animate-spin text-black" /></div>
      ) : targets.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-black/[0.06]">
          <Target size={48} className="mx-auto text-black/50 mb-3" />
          <p className="text-black">No targets set yet</p>
          <p className="text-sm text-black mt-1">Set your first sales target</p>
        </div>
      ) : (
        <div className="space-y-3">
          {targets.map((target) => (
            <div key={target.id} className="bg-white rounded-2xl border border-black/[0.06] p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium capitalize">{target.target_type}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${target.status === 'achieved' ? 'bg-[var(--av-success-soft)] text-[var(--av-success)]' : target.status === 'missed' ? 'bg-[var(--av-danger-soft)] text-[var(--av-danger)]' : 'bg-[var(--av-primary-soft)] text-[var(--av-primary)]'}`}>
                      {target.status}
                    </span>
                  </div>
                  <p className="text-sm text-black">
                    {new Date(target.period_start).toLocaleDateString()} - {new Date(target.period_end).toLocaleDateString()}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">₦{target.revenue_target.toLocaleString()}</p>
                  <p className="text-sm text-black">₦{target.actual_revenue?.toLocaleString() || 0} achieved</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Commissions Tab
function CommissionsTab({ businessId, staffId }: { businessId?: string; staffId?: string }) {
  const [commissions, setCommissions] = useState<any[]>([])
  const [rules, setRules] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showRuleForm, setShowRuleForm] = useState(false)
  const { showToast } = useToast()

  const [ruleForm, setRuleForm] = useState({
    name: '',
    commission_type: 'percentage',
    rate_percentage: '',
    min_deal_value: '',
  })

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    const [commsRes, rulesRes] = await Promise.all([
      supabase.from('staff_commissions').select('*').eq('staff_id', staffId).order('created_at', { ascending: false }),
      supabase.from('commission_rules').select('*').eq('business_id', businessId).order('created_at', { ascending: false }),
    ])
    setCommissions(commsRes.data || [])
    setRules(rulesRes.data || [])
    setLoading(false)
  }

  async function handleRuleSubmit(e: React.FormEvent) {
    e.preventDefault()
    await supabase.from('commission_rules').insert({
      ...ruleForm,
      business_id: businessId,
      rate_percentage: parseFloat(ruleForm.rate_percentage),
      min_deal_value: parseFloat(ruleForm.min_deal_value) || 0,
    })
    showToast('Commission rule created!', 'success')
    setShowRuleForm(false)
    loadData()
  }

  const pendingCommission = commissions.filter(c => c.status === 'pending').reduce((sum, c) => sum + (c.commission_amount || 0), 0)
  const totalCommission = commissions.reduce((sum, c) => sum + (c.commission_amount || 0), 0)

  return (
    <div>
      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-2xl p-4 text-white">
          <p className="text-sm opacity-80">Pending Commission</p>
          <h2 className="text-2xl font-bold">₦{pendingCommission.toLocaleString()}</h2>
        </div>
        <div className="bg-gradient-to-br from-purple-500 to-[#8B5CF6] rounded-2xl p-4 text-white">
          <p className="text-sm opacity-80">Total Earned</p>
          <h2 className="text-2xl font-bold">₦{totalCommission.toLocaleString()}</h2>
        </div>
      </div>

      {/* Commission Rules */}
      <div className="flex justify-between items-center mb-4">
        <h2 className="font-medium">Commission Rules</h2>
        <button onClick={() => setShowRuleForm(!showRuleForm)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--av-primary, #4285F4)] text-white text-sm">
          <Plus size={16} /> Add Rule
        </button>
      </div>

      {showRuleForm && (
        <form onSubmit={handleRuleSubmit} className="bg-white rounded-2xl border border-black/[0.06] p-4 mb-4 space-y-3">
          <input type="text" placeholder="Rule Name" value={ruleForm.name} onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })} className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm" required />
          <select value={ruleForm.commission_type} onChange={(e) => setRuleForm({ ...ruleForm, commission_type: e.target.value })} className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm">
            <option value="percentage">Percentage</option>
            <option value="fixed">Fixed Amount</option>
            <option value="tiered">Tiered</option>
          </select>
          <input type="number" placeholder="Rate (%)" value={ruleForm.rate_percentage} onChange={(e) => setRuleForm({ ...ruleForm, rate_percentage: e.target.value })} className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm" required />
          <input type="number" placeholder="Min Deal Value (₦)" value={ruleForm.min_deal_value} onChange={(e) => setRuleForm({ ...ruleForm, min_deal_value: e.target.value })} className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm" />
          <button type="submit" className="w-full py-2 rounded-lg bg-[var(--av-primary, #4285F4)] text-white">Create Rule</button>
        </form>
      )}

      {rules.length === 0 ? (
        <div className="text-center py-8 bg-white rounded-2xl border border-black/[0.06] mb-6">
          <Award size={48} className="mx-auto text-black/50 mb-3" />
          <p className="text-black">No commission rules yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {rules.map((rule) => (
            <div key={rule.id} className="bg-white rounded-2xl border border-black/[0.06] p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium">{rule.name}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${rule.is_active ? 'bg-[var(--av-success-soft)] text-[var(--av-success)]' : 'bg-white text-black'}`}>
                  {rule.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
              <p className="text-2xl font-bold text-[var(--av-success)]">{rule.rate_percentage}%</p>
              <p className="text-sm text-black">Min deal: ₦{rule.min_deal_value?.toLocaleString()}</p>
            </div>
          ))}
        </div>
      )}

      {/* My Commissions */}
      <h2 className="font-medium mb-4">My Commissions</h2>
      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="animate-spin text-black" /></div>
      ) : commissions.length === 0 ? (
        <div className="text-center py-8 bg-white rounded-2xl border border-black/[0.06]">
          <Gift size={48} className="mx-auto text-black/50 mb-3" />
          <p className="text-black">No commissions yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {commissions.map((comm) => (
            <div key={comm.id} className="bg-white rounded-2xl border border-black/[0.06] p-4 flex items-center justify-between">
              <div>
                <p className="font-medium">₦{comm.commission_amount?.toLocaleString()}</p>
                <p className="text-sm text-black">Deal: ₦{comm.deal_value?.toLocaleString()}</p>
              </div>
              <span className={`text-xs px-3 py-1 rounded-full ${
                comm.status === 'paid' ? 'bg-[var(--av-success-soft)] text-[var(--av-success)]' :
                comm.status === 'approved' ? 'bg-[var(--av-primary-soft)] text-[var(--av-primary)]' :
                'bg-[var(--av-warning-soft)] text-[var(--av-warning)]'
              }`}>
                {comm.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Forecasting Tab
function ForecastingTab({ businessId }: { businessId?: string }) {
  const [forecasts, setForecasts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadForecasts()
  }, [])

  async function loadForecasts() {
    setLoading(true)
    // Derive a forecast from open deals grouped by expected_close month.
    const { data } = await supabase
      .from('deals')
      .select('value, stage, expected_close')
      .eq('business_id', businessId)
      .in('stage', ['prospect', 'qualified', 'proposal', 'negotiation'])
      .not('expected_close', 'is', null)
      .order('expected_close', { ascending: true })

    const byMonth = new Map<string, { pipeline: number; commit: number; best: number; worst: number }>()
    for (const d of data || []) {
      const key = new Date(d.expected_close).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      const value = Number(d.value) || 0
      const entry = byMonth.get(key) || { pipeline: 0, commit: 0, best: 0, worst: 0 }
      entry.pipeline += value
      // Weight by stage confidence: negotiation ~0.8, proposal ~0.5, qualified ~0.3, prospect ~0.1
      const weight = d.stage === 'negotiation' ? 0.8 : d.stage === 'proposal' ? 0.5 : d.stage === 'qualified' ? 0.3 : 0.1
      entry.commit += value * weight
      entry.best += value * Math.min(weight + 0.2, 1)
      entry.worst += value * Math.max(weight - 0.1, 0)
      byMonth.set(key, entry)
    }
    setForecasts(Array.from(byMonth.entries()).map(([period, v]) => ({ period, ...v })))
    setLoading(false)
  }

  return (
    <div>
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-2xl border border-black/[0.06] p-4">
          <p className="text-sm text-black">Total Pipeline</p>
          <h2 className="text-xl font-bold">₦{(forecasts.reduce((sum, f) => sum + f.pipeline, 0) / 1000000).toFixed(1)}M</h2>
        </div>
        <div className="bg-white rounded-2xl border border-black/[0.06] p-4">
          <p className="text-sm text-black">Commit</p>
          <h2 className="text-xl font-bold text-[var(--av-success)]">₦{(forecasts.reduce((sum, f) => sum + f.commit, 0) / 1000000).toFixed(1)}M</h2>
        </div>
        <div className="bg-white rounded-2xl border border-black/[0.06] p-4">
          <p className="text-sm text-black">Best Case</p>
          <h2 className="text-xl font-bold text-[var(--av-primary)]">₦{(forecasts.reduce((sum, f) => sum + f.best, 0) / 1000000).toFixed(1)}M</h2>
        </div>
        <div className="bg-white rounded-2xl border border-black/[0.06] p-4">
          <p className="text-sm text-black">Worst Case</p>
          <h2 className="text-xl font-bold text-[var(--av-warning)]">₦{(forecasts.reduce((sum, f) => sum + f.worst, 0) / 1000000).toFixed(1)}M</h2>
        </div>
      </div>

      {/* Forecast Table */}
      <div className="bg-white rounded-2xl border border-black/[0.06] overflow-hidden">
        <table className="w-full">
          <thead className="bg-black/10">
            <tr>
              <th className="text-left px-4 py-3 text-sm font-medium text-black/60">Period</th>
              <th className="text-right px-4 py-3 text-sm font-medium text-black/60">Pipeline</th>
              <th className="text-right px-4 py-3 text-sm font-medium text-black/60">Commit</th>
              <th className="text-right px-4 py-3 text-sm font-medium text-black/60">Best Case</th>
              <th className="text-right px-4 py-3 text-sm font-medium text-black/60">Worst Case</th>
            </tr>
          </thead>
          <tbody>
            {forecasts.map((forecast, i) => (
              <tr key={i} className="border-t border-black/5">
                <td className="px-4 py-3 font-medium">{forecast.period}</td>
                <td className="text-right px-4 py-3">₦{(forecast.pipeline / 1000000).toFixed(1)}M</td>
                <td className="text-right px-4 py-3 text-[var(--av-success)] font-medium">₦{(forecast.commit / 1000000).toFixed(1)}M</td>
                <td className="text-right px-4 py-3 text-[var(--av-primary)]">₦{(forecast.best / 1000000).toFixed(1)}M</td>
                <td className="text-right px-4 py-3 text-[var(--av-warning)]">₦{(forecast.worst / 1000000).toFixed(1)}M</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Win/Loss Tab
function WinLossTab({ businessId }: { businessId?: string }) {
  const [analytics, setAnalytics] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadAnalytics()
  }, [])

  async function loadAnalytics() {
    setLoading(true)
    const [analyticsRes, dealsRes] = await Promise.all([
      supabase.from('deal_analytics').select('*').eq('business_id', businessId).order('created_at', { ascending: false }),
      supabase.from('deals').select('id, title').eq('business_id', businessId),
    ])
    const dealTitles = new Map((dealsRes.data || []).map((d: any) => [d.id, d.title]))
    setAnalytics((analyticsRes.data || []).map((d: any) => ({
      id: d.id,
      outcome: d.outcome,
      deal_name: dealTitles.get(d.deal_id) || 'Untitled deal',
      lost_to_competitor: d.lost_to_competitor,
      loss_reason: d.loss_reason,
      initial_value: d.initial_value,
      final_value: d.final_value,
      days_to_close: d.days_to_close,
    })))
    setLoading(false)
  }

  const wonDeals = analytics.filter(a => a.outcome === 'won')
  const lostDeals = analytics.filter(a => a.outcome === 'lost')
  const winRate = analytics.length > 0 ? (wonDeals.length / analytics.length) * 100 : 0

  return (
    <div>
      {/* Win Rate Summary */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-2xl p-6 text-white text-center">
          <p className="text-sm opacity-80">Win Rate</p>
          <h2 className="text-4xl font-bold">{winRate.toFixed(0)}%</h2>
        </div>
        <div className="bg-white rounded-2xl border border-black/[0.06] p-6 text-center">
          <p className="text-sm text-black">Deals Won</p>
          <h2 className="text-3xl font-bold text-[var(--av-success)]">{wonDeals.length}</h2>
        </div>
        <div className="bg-white rounded-2xl border border-black/[0.06] p-6 text-center">
          <p className="text-sm text-black">Deals Lost</p>
          <h2 className="text-3xl font-bold text-[var(--av-danger)]">{lostDeals.length}</h2>
        </div>
      </div>

      {/* Analytics List */}
      <h2 className="font-medium mb-4">Win/Loss Analysis</h2>
      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="animate-spin text-black" /></div>
      ) : (
        <div className="space-y-3">
          {analytics.map((item) => (
            <div key={item.id} className="bg-white rounded-2xl border border-black/[0.06] p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  {item.outcome === 'won' ? (
                    <CheckCircle2 size={20} className="text-[var(--av-success)] mt-1" />
                  ) : (
                    <XCircle size={20} className="text-[var(--av-danger)] mt-1" />
                  )}
                  <div>
                    <h3 className="font-medium">{item.deal_name}</h3>
                    {item.outcome === 'lost' && (
                      <p className="text-sm text-black">Lost to: {item.lost_to_competitor}</p>
                    )}
                    {item.loss_reason && (
                      <p className="text-sm text-[var(--av-danger)]">Reason: {item.loss_reason}</p>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <p className={`font-semibold ${item.outcome === 'won' ? 'text-[var(--av-success)]' : 'text-[var(--av-danger)]'}`}>
                    ₦{(item.final_value / 1000000).toFixed(1)}M
                  </p>
                  <p className="text-xs text-black">{item.days_to_close} days to close</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

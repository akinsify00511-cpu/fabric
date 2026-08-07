import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { 
  Building2, Landmark, Clock, Receipt, TrendingUp, DollarSign, 
  MapPin, CreditCard, Plus, Loader2, Percent
} from 'lucide-react'

type TabType = 'overview' | 'payroll' | 'loans' | 'commissions' | 'assets' | 'liabilities' | 'branches' | 'recurring' | 'time'

export default function BusinessInfrastructure() {
  const { staff } = useAuth()
  const [activeTab, setActiveTab] = useState<TabType>('overview')
  const businessId = staff?.business_id

  const tabs = [
    { id: 'overview', label: 'Overview', icon: TrendingUp },
    { id: 'payroll', label: 'Payroll', icon: DollarSign },
    { id: 'loans', label: 'Loans', icon: Landmark },
    { id: 'commissions', label: 'Commissions', icon: Percent },
    { id: 'assets', label: 'Assets', icon: Building2 },
    { id: 'liabilities', label: 'Liabilities', icon: CreditCard },
    { id: 'branches', label: 'Branches', icon: MapPin },
    { id: 'recurring', label: 'Recurring', icon: Receipt },
    { id: 'time', label: 'Time Track', icon: Clock },
  ]

  return (
    <div className="pb-20">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Business Infrastructure</h1>
          <p className="text-sm text-black/50">HR, Payroll & Financial Assets</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto pb-2 mb-6 scrollbar-hide">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as TabType)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition ${
              activeTab === tab.id
                ? 'avenize-gradient text-white'
                : 'bg-white text-black/60 hover:bg-black/5'
            }`}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && <OverviewTab businessId={businessId} />}
      {activeTab === 'payroll' && <PayrollTab businessId={businessId} />}
      {activeTab === 'loans' && <LoansTab businessId={businessId} />}
      {activeTab === 'commissions' && <CommissionsTab businessId={businessId} />}
      {activeTab === 'assets' && <AssetsTab businessId={businessId} />}
      {activeTab === 'liabilities' && <LiabilitiesTab businessId={businessId} />}
      {activeTab === 'branches' && <BranchesTab businessId={businessId} />}
      {activeTab === 'recurring' && <RecurringTab businessId={businessId} />}
      {activeTab === 'time' && <TimeTrackingTab businessId={businessId} staffId={staff?.id} />}
    </div>
  )
}

// Overview Tab
function OverviewTab({ businessId }: { businessId?: string }) {
  const [stats, setStats] = useState<any>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!businessId) return
    loadStats()
  }, [businessId])

  async function loadStats() {
    setLoading(true)
    try {
      const [branches, assets, liabilities, loans, recurring] = await Promise.all([
        supabase.from('branches').select('id', { count: 'exact' }).eq('business_id', businessId),
        supabase.from('assets').select('id, current_value').eq('business_id', businessId),
        supabase.from('liabilities').select('id, current_balance').eq('business_id', businessId),
        supabase.from('loans').select('id, outstanding_balance').eq('business_id', businessId).eq('status', 'active'),
        supabase.from('recurring_expenses').select('id, amount').eq('business_id', businessId).eq('is_active', true),
      ])

      const totalAssets = assets.data?.reduce((sum, a) => sum + (a.current_value || 0), 0) || 0
      const totalLiabilities = liabilities.data?.reduce((sum, l) => sum + (l.current_balance || 0), 0) || 0
      const totalLoans = loans.data?.reduce((sum, l) => sum + (l.outstanding_balance || 0), 0) || 0
      const monthlyRecurring = recurring.data?.reduce((sum, r) => sum + r.amount, 0) || 0

      setStats({
        branches: branches.count || 0,
        totalAssets,
        totalLiabilities,
        netWorth: totalAssets - totalLiabilities,
        totalLoans,
        monthlyRecurring,
      })
    } catch (err) {
      console.error('Error loading stats:', err)
    }
    setLoading(false)
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-black/30" /></div>

  const cards = [
    { label: 'Branches', value: stats.branches, icon: MapPin, color: 'text-blue-500' },
    { label: 'Total Assets', value: `₦${(stats.totalAssets / 1000000).toFixed(1)}M`, icon: Building2, color: 'text-green-500' },
    { label: 'Net Worth', value: `₦${(stats.netWorth / 1000000).toFixed(1)}M`, icon: TrendingUp, color: 'text-purple-500' },
    { label: 'Active Loans', value: `₦${(stats.totalLoans / 1000000).toFixed(1)}M`, icon: Landmark, color: 'text-orange-500' },
    { label: 'Monthly Recurring', value: `₦${(stats.monthlyRecurring / 1000).toFixed(0)}K`, icon: Receipt, color: 'text-teal-500' },
  ]

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {cards.map((card) => (
          <div key={card.label} className="bg-white rounded-2xl border border-black/[0.06] p-4">
            <card.icon size={24} className={`${card.color} mb-3`} />
            <div className="text-2xl font-semibold">{card.value}</div>
            <div className="text-sm text-black/50">{card.label}</div>
          </div>
        ))}
      </div>

      <div className="mt-6 bg-amber-50 border border-amber-200 rounded-xl p-4">
        <h3 className="font-medium text-amber-800 mb-2">💡 Getting Started</h3>
        <p className="text-sm text-amber-700">
          Track your complete business health: branches, assets, liabilities, loans, and recurring expenses. 
          Each module gives you a complete picture of your business infrastructure.
        </p>
      </div>
    </div>
  )
}

// Branches Tab
function BranchesTab({ businessId }: { businessId?: string }) {
  const [branches, setBranches] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', address: '', phone: '', email: '', is_headquarters: false })

  useEffect(() => {
    if (!businessId) return
    loadBranches()
  }, [businessId])

  async function loadBranches() {
    setLoading(true)
    const { data } = await supabase.from('branches').select('*').eq('business_id', businessId).order('created_at')
    setBranches(data || [])
    setLoading(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!businessId) return
    await supabase.from('branches').insert({ ...form, business_id: businessId })
    setForm({ name: '', address: '', phone: '', email: '', is_headquarters: false })
    setShowForm(false)
    loadBranches()
  }

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--avenize-primary)] text-white text-sm font-medium">
          <Plus size={16} /> Add Branch
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-black/[0.06] p-4 mb-4 space-y-3">
          <input type="text" placeholder="Branch Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm" required />
          <input type="text" placeholder="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm" />
          <div className="grid grid-cols-2 gap-3">
            <input type="tel" placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm" />
            <input type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.is_headquarters} onChange={(e) => setForm({ ...form, is_headquarters: e.target.checked })} className="rounded" />
            Headquarters
          </label>
          <button type="submit" className="w-full py-2 rounded-lg bg-[var(--avenize-primary)] text-white text-sm">Save Branch</button>
        </form>
      )}

      {loading ? <div className="flex justify-center py-8"><Loader2 className="animate-spin text-black/30" /></div>
       : branches.length === 0 ? (
        <div className="text-center py-8 text-black/40"><MapPin size={40} className="mx-auto mb-2 opacity-30" /><p>No branches yet</p></div>
      ) : (
        <div className="space-y-3">
          {branches.map((branch) => (
            <div key={branch.id} className="bg-white rounded-2xl border border-black/[0.06] p-4 flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center"><MapPin size={18} className="text-blue-500" /></div>
              <div className="flex-1">
                <div className="flex items-center gap-2"><span className="font-medium">{branch.name}</span>
                  {branch.is_headquarters && <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">HQ</span>}
                </div>
                {branch.address && <p className="text-sm text-black/50">{branch.address}</p>}
                {branch.phone && <p className="text-sm text-black/40">{branch.phone}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Payroll Tab
function PayrollTab({ businessId }: { businessId?: string }) {
  const [runs, setRuns] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!businessId) return
    supabase.from('payroll_runs').select('*').eq('business_id', businessId).order('created_at', { ascending: false }).then(({ data }) => {
      setRuns(data || [])
      setLoading(false)
    })
  }, [businessId])

  const statusColors: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-700',
    processing: 'bg-amber-100 text-amber-700',
    completed: 'bg-green-100 text-green-700',
    cancelled: 'bg-red-100 text-red-700',
  }

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--avenize-primary)] text-white text-sm font-medium">
          <Plus size={16} /> New Payroll Run
        </button>
      </div>

      {loading ? <div className="flex justify-center py-8"><Loader2 className="animate-spin text-black/30" /></div>
       : runs.length === 0 ? (
        <div className="text-center py-8 text-black/40"><DollarSign size={40} className="mx-auto mb-2 opacity-30" /><p>No payroll runs yet</p><p className="text-sm mt-1">Create your first payroll to get started</p></div>
      ) : (
        <div className="space-y-3">
          {runs.map((run) => (
            <div key={run.id} className="bg-white rounded-2xl border border-black/[0.06] p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium">{new Date(run.period_start).toLocaleDateString()} - {new Date(run.period_end).toLocaleDateString()}</span>
                <span className={`text-xs px-2 py-1 rounded-full ${statusColors[run.status]}`}>{run.status}</span>
              </div>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div><span className="text-black/40">Gross</span><div className="font-medium">₦{run.total_gross?.toLocaleString()}</div></div>
                <div><span className="text-black/40">Deductions</span><div className="font-medium text-red-600">-₦{run.total_deductions?.toLocaleString()}</div></div>
                <div><span className="text-black/40">Net Pay</span><div className="font-medium text-green-600">₦{run.total_net?.toLocaleString()}</div></div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Loans Tab
function LoansTab({ businessId }: { businessId?: string }) {
  const [loans, setLoans] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ lender_name: '', loan_type: 'business', principal_amount: '', interest_rate: '', tenure_months: '' })

  useEffect(() => {
    if (!businessId) return
    loadLoans()
  }, [businessId])

  async function loadLoans() {
    setLoading(true)
    const { data } = await supabase.from('loans').select('*').eq('business_id', businessId).order('created_at', { ascending: false })
    setLoans(data || [])
    setLoading(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!businessId) return
    await supabase.from('loans').insert({ 
      ...form, business_id: businessId,
      principal_amount: parseFloat(form.principal_amount),
      interest_rate: parseFloat(form.interest_rate) || 0,
      tenure_months: parseInt(form.tenure_months) || null,
      outstanding_balance: parseFloat(form.principal_amount),
    })
    setForm({ lender_name: '', loan_type: 'business', principal_amount: '', interest_rate: '', tenure_months: '' })
    setShowForm(false)
    loadLoans()
  }

  const statusColors: Record<string, string> = {
    active: 'bg-green-100 text-green-700',
    paid_off: 'bg-blue-100 text-blue-700',
    defaulted: 'bg-red-100 text-red-700',
  }

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--avenize-primary)] text-white text-sm font-medium">
          <Plus size={16} /> Add Loan
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-black/[0.06] p-4 mb-4 space-y-3">
          <input type="text" placeholder="Lender Name" value={form.lender_name} onChange={(e) => setForm({ ...form, lender_name: e.target.value })} className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm" required />
          <select value={form.loan_type} onChange={(e) => setForm({ ...form, loan_type: e.target.value })} className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm">
            <option value="business">Business Loan</option>
            <option value="staff_advance">Staff Advance</option>
            <option value="equipment">Equipment Loan</option>
            <option value="mortgage">Mortgage</option>
          </select>
          <div className="grid grid-cols-2 gap-3">
            <input type="number" placeholder="Amount (₦)" value={form.principal_amount} onChange={(e) => setForm({ ...form, principal_amount: e.target.value })} className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm" required />
            <input type="number" placeholder="Interest Rate %" value={form.interest_rate} onChange={(e) => setForm({ ...form, interest_rate: e.target.value })} className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm" />
          </div>
          <input type="number" placeholder="Tenure (months)" value={form.tenure_months} onChange={(e) => setForm({ ...form, tenure_months: e.target.value })} className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm" />
          <button type="submit" className="w-full py-2 rounded-lg bg-[var(--avenize-primary)] text-white text-sm">Save Loan</button>
        </form>
      )}

      {loading ? <div className="flex justify-center py-8"><Loader2 className="animate-spin text-black/30" /></div>
       : loans.length === 0 ? (
        <div className="text-center py-8 text-black/40"><Landmark size={40} className="mx-auto mb-2 opacity-30" /><p>No loans recorded</p></div>
      ) : (
        <div className="space-y-3">
          {loans.map((loan) => (
            <div key={loan.id} className="bg-white rounded-2xl border border-black/[0.06] p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium">{loan.lender_name}</span>
                <span className={`text-xs px-2 py-1 rounded-full ${statusColors[loan.status]}`}>{loan.status.replace('_', ' ')}</span>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-black/40">Principal</span><div className="font-medium">₦{loan.principal_amount?.toLocaleString()}</div></div>
                <div><span className="text-black/40">Outstanding</span><div className="font-medium">₦{loan.outstanding_balance?.toLocaleString()}</div></div>
              </div>
              {loan.interest_rate > 0 && <p className="text-xs text-black/40 mt-2">{loan.interest_rate}% p.a.</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Commissions Tab
function CommissionsTab({ businessId }: { businessId?: string }) {
  const [commissions, setCommissions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ commission_type: 'sales', amount: '', description: '' })

  useEffect(() => {
    if (!businessId) return
    supabase.from('commissions').select('*').eq('business_id', businessId).order('created_at', { ascending: false }).then(({ data }) => {
      setCommissions(data || [])
      setLoading(false)
    })
  }, [businessId])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!businessId) return
    await supabase.from('commissions').insert({ ...form, business_id: businessId, amount: parseFloat(form.amount) })
    setForm({ commission_type: 'sales', amount: '', description: '' })
    setShowForm(false)
    loadCommissions()
  }

  function loadCommissions() {
    supabase.from('commissions').select('*').eq('business_id', businessId).order('created_at', { ascending: false }).then(({ data }) => setCommissions(data || []))
  }

  const statusColors: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-700',
    approved: 'bg-blue-100 text-blue-700',
    paid: 'bg-green-100 text-green-700',
  }

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--avenize-primary)] text-white text-sm font-medium">
          <Plus size={16} /> Add Commission
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-black/[0.06] p-4 mb-4 space-y-3">
          <select value={form.commission_type} onChange={(e) => setForm({ ...form, commission_type: e.target.value })} className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm">
            <option value="sales">Sales Commission</option>
            <option value="referral">Referral Commission</option>
            <option value="performance">Performance Bonus</option>
          </select>
          <input type="number" placeholder="Amount (₦)" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm" required />
          <textarea placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm" rows={2} />
          <button type="submit" className="w-full py-2 rounded-lg bg-[var(--avenize-primary)] text-white text-sm">Save Commission</button>
        </form>
      )}

      {loading ? <div className="flex justify-center py-8"><Loader2 className="animate-spin text-black/30" /></div>
       : commissions.length === 0 ? (
        <div className="text-center py-8 text-black/40"><Percent size={40} className="mx-auto mb-2 opacity-30" /><p>No commissions recorded</p></div>
      ) : (
        <div className="space-y-3">
          {commissions.map((comm) => (
            <div key={comm.id} className="bg-white rounded-2xl border border-black/[0.06] p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium capitalize">{comm.commission_type} Commission</span>
                <span className={`text-xs px-2 py-1 rounded-full ${statusColors[comm.status]}`}>{comm.status}</span>
              </div>
              <div className="text-2xl font-semibold text-green-600">₦{comm.amount?.toLocaleString()}</div>
              {comm.description && <p className="text-sm text-black/50 mt-1">{comm.description}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Assets Tab
function AssetsTab({ businessId }: { businessId?: string }) {
  const [assets, setAssets] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', asset_type: 'equipment', purchase_price: '', current_value: '', description: '' })

  useEffect(() => {
    if (!businessId) return
    loadAssets()
  }, [businessId])

  async function loadAssets() {
    setLoading(true)
    const { data } = await supabase.from('assets').select('*').eq('business_id', businessId).order('created_at', { ascending: false })
    setAssets(data || [])
    setLoading(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!businessId) return
    await supabase.from('assets').insert({ 
      ...form, business_id: businessId,
      purchase_price: parseFloat(form.purchase_price) || null,
      current_value: parseFloat(form.current_value) || parseFloat(form.purchase_price) || null,
    })
    setForm({ name: '', asset_type: 'equipment', purchase_price: '', current_value: '', description: '' })
    setShowForm(false)
    loadAssets()
  }

  const totalValue = assets.reduce((sum, a) => sum + (a.current_value || 0), 0)

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm text-black/50">Total Asset Value</div>
        <div className="text-xl font-semibold">₦{totalValue.toLocaleString()}</div>
      </div>

      <div className="flex justify-end mb-4">
        <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--avenize-primary)] text-white text-sm font-medium">
          <Plus size={16} /> Add Asset
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-black/[0.06] p-4 mb-4 space-y-3">
          <input type="text" placeholder="Asset Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm" required />
          <select value={form.asset_type} onChange={(e) => setForm({ ...form, asset_type: e.target.value })} className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm">
            <option value="equipment">Equipment</option>
            <option value="vehicle">Vehicle</option>
            <option value="property">Property</option>
            <option value="furniture">Furniture</option>
            <option value="electronics">Electronics</option>
            <option value="software">Software</option>
          </select>
          <div className="grid grid-cols-2 gap-3">
            <input type="number" placeholder="Purchase Price (₦)" value={form.purchase_price} onChange={(e) => setForm({ ...form, purchase_price: e.target.value })} className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm" />
            <input type="number" placeholder="Current Value (₦)" value={form.current_value} onChange={(e) => setForm({ ...form, current_value: e.target.value })} className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm" />
          </div>
          <textarea placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm" rows={2} />
          <button type="submit" className="w-full py-2 rounded-lg bg-[var(--avenize-primary)] text-white text-sm">Save Asset</button>
        </form>
      )}

      {loading ? <div className="flex justify-center py-8"><Loader2 className="animate-spin text-black/30" /></div>
       : assets.length === 0 ? (
        <div className="text-center py-8 text-black/40"><Building2 size={40} className="mx-auto mb-2 opacity-30" /><p>No assets recorded</p></div>
      ) : (
        <div className="space-y-3">
          {assets.map((asset) => (
            <div key={asset.id} className="bg-white rounded-2xl border border-black/[0.06] p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium">{asset.name}</span>
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded capitalize">{asset.asset_type}</span>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-black/40">Purchase</span><div className="font-medium">₦{asset.purchase_price?.toLocaleString()}</div></div>
                <div><span className="text-black/40">Current Value</span><div className="font-medium">₦{asset.current_value?.toLocaleString()}</div></div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Liabilities Tab
function LiabilitiesTab({ businessId }: { businessId?: string }) {
  const [liabilities, setLiabilities] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', liability_type: 'bond', original_amount: '', current_balance: '', creditor: '' })

  useEffect(() => {
    if (!businessId) return
    loadLiabilities()
  }, [businessId])

  async function loadLiabilities() {
    setLoading(true)
    const { data } = await supabase.from('liabilities').select('*').eq('business_id', businessId).order('created_at', { ascending: false })
    setLiabilities(data || [])
    setLoading(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!businessId) return
    await supabase.from('liabilities').insert({ 
      ...form, business_id: businessId,
      original_amount: parseFloat(form.original_amount),
      current_balance: parseFloat(form.current_balance) || parseFloat(form.original_amount),
    })
    setForm({ name: '', liability_type: 'bond', original_amount: '', current_balance: '', creditor: '' })
    setShowForm(false)
    loadLiabilities()
  }

  const totalBalance = liabilities.reduce((sum, l) => sum + (l.current_balance || 0), 0)

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm text-black/50">Total Liabilities</div>
        <div className="text-xl font-semibold text-red-600">₦{totalBalance.toLocaleString()}</div>
      </div>

      <div className="flex justify-end mb-4">
        <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--avenize-primary)] text-white text-sm font-medium">
          <Plus size={16} /> Add Liability
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-black/[0.06] p-4 mb-4 space-y-3">
          <input type="text" placeholder="Liability Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm" required />
          <select value={form.liability_type} onChange={(e) => setForm({ ...form, liability_type: e.target.value })} className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm">
            <option value="bond">Bond</option>
            <option value="note_payable">Note Payable</option>
            <option value="mortgage">Mortgage</option>
            <option value="credit_line">Credit Line</option>
            <option value="trade_payable">Trade Payable</option>
          </select>
          <div className="grid grid-cols-2 gap-3">
            <input type="number" placeholder="Original Amount (₦)" value={form.original_amount} onChange={(e) => setForm({ ...form, original_amount: e.target.value })} className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm" required />
            <input type="number" placeholder="Current Balance (₦)" value={form.current_balance} onChange={(e) => setForm({ ...form, current_balance: e.target.value })} className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm" />
          </div>
          <input type="text" placeholder="Creditor" value={form.creditor} onChange={(e) => setForm({ ...form, creditor: e.target.value })} className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm" />
          <button type="submit" className="w-full py-2 rounded-lg bg-[var(--avenize-primary)] text-white text-sm">Save Liability</button>
        </form>
      )}

      {loading ? <div className="flex justify-center py-8"><Loader2 className="animate-spin text-black/30" /></div>
       : liabilities.length === 0 ? (
        <div className="text-center py-8 text-black/40"><CreditCard size={40} className="mx-auto mb-2 opacity-30" /><p>No liabilities recorded</p></div>
      ) : (
        <div className="space-y-3">
          {liabilities.map((liability) => (
            <div key={liability.id} className="bg-white rounded-2xl border border-black/[0.06] p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium">{liability.name}</span>
                <span className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded capitalize">{liability.liability_type.replace('_', ' ')}</span>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-black/40">Original</span><div className="font-medium">₦{liability.original_amount?.toLocaleString()}</div></div>
                <div><span className="text-black/40">Balance</span><div className="font-medium text-red-600">₦{liability.current_balance?.toLocaleString()}</div></div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Recurring Expenses Tab
function RecurringTab({ businessId }: { businessId?: string }) {
  const [expenses, setExpenses] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', category: 'rent', amount: '', frequency: 'monthly', vendor: '' })

  useEffect(() => {
    if (!businessId) return
    loadExpenses()
  }, [businessId])

  async function loadExpenses() {
    setLoading(true)
    const { data } = await supabase.from('recurring_expenses').select('*').eq('business_id', businessId).order('created_at', { ascending: false })
    setExpenses(data || [])
    setLoading(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!businessId) return
    await supabase.from('recurring_expenses').insert({ ...form, business_id: businessId, amount: parseFloat(form.amount) })
    setForm({ name: '', category: 'rent', amount: '', frequency: 'monthly', vendor: '' })
    setShowForm(false)
    loadExpenses()
  }

  const monthlyTotal = expenses.filter(e => e.is_active && e.frequency === 'monthly').reduce((sum, e) => sum + e.amount, 0)

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm text-black/50">Monthly Recurring</div>
        <div className="text-xl font-semibold">₦{monthlyTotal.toLocaleString()}</div>
      </div>

      <div className="flex justify-end mb-4">
        <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--avenize-primary)] text-white text-sm font-medium">
          <Plus size={16} /> Add Recurring
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-black/[0.06] p-4 mb-4 space-y-3">
          <input type="text" placeholder="Expense Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm" required />
          <div className="grid grid-cols-2 gap-3">
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm">
              <option value="rent">Rent</option>
              <option value="phones">Phones</option>
              <option value="subscriptions">Subscriptions</option>
              <option value="utilities">Utilities</option>
              <option value="insurance">Insurance</option>
              <option value="maintenance">Maintenance</option>
            </select>
            <select value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })} className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm">
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="annually">Annually</option>
            </select>
          </div>
          <input type="number" placeholder="Amount (₦)" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm" required />
          <input type="text" placeholder="Vendor (optional)" value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm" />
          <button type="submit" className="w-full py-2 rounded-lg bg-[var(--avenize-primary)] text-white text-sm">Save Expense</button>
        </form>
      )}

      {loading ? <div className="flex justify-center py-8"><Loader2 className="animate-spin text-black/30" /></div>
       : expenses.length === 0 ? (
        <div className="text-center py-8 text-black/40"><Receipt size={40} className="mx-auto mb-2 opacity-30" /><p>No recurring expenses</p></div>
      ) : (
        <div className="space-y-3">
          {expenses.map((expense) => (
            <div key={expense.id} className="bg-white rounded-2xl border border-black/[0.06] p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center"><Receipt size={18} className="text-orange-500" /></div>
                <div>
                  <span className="font-medium">{expense.name}</span>
                  <p className="text-sm text-black/50 capitalize">{expense.category} • {expense.frequency}</p>
                </div>
              </div>
              <div className="text-right">
                <div className="font-semibold">₦{expense.amount?.toLocaleString()}</div>
                <div className={`text-xs ${expense.is_active ? 'text-green-600' : 'text-gray-400'}`}>{expense.is_active ? 'Active' : 'Paused'}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Time Tracking Tab
function TimeTrackingTab({ businessId, staffId }: { businessId?: string; staffId?: string }) {
  const [entries, setEntries] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ date: new Date().toISOString().split('T')[0], hours: '', description: '', billable: true })

  useEffect(() => {
    if (!businessId) return
    loadEntries()
  }, [businessId])

  async function loadEntries() {
    setLoading(true)
    const { data } = await supabase.from('time_entries').select('*').eq('business_id', businessId).order('date', { ascending: false }).limit(20)
    setEntries(data || [])
    setLoading(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!businessId || !staffId) return
    await supabase.from('time_entries').insert({ ...form, business_id: businessId, staff_id: staffId, hours: parseFloat(form.hours) })
    setForm({ date: new Date().toISOString().split('T')[0], hours: '', description: '', billable: true })
    setShowForm(false)
    loadEntries()
  }

  const totalHours = entries.reduce((sum, e) => sum + e.hours, 0)
  const billableHours = entries.filter(e => e.billable).reduce((sum, e) => sum + e.hours, 0)

  return (
    <div>
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-white rounded-2xl border border-black/[0.06] p-4">
          <div className="text-sm text-black/50">Total Hours</div>
          <div className="text-2xl font-semibold">{totalHours}h</div>
        </div>
        <div className="bg-white rounded-2xl border border-black/[0.06] p-4">
          <div className="text-sm text-black/50">Billable Hours</div>
          <div className="text-2xl font-semibold text-green-600">{billableHours}h</div>
        </div>
      </div>

      <div className="flex justify-end mb-4">
        <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--avenize-primary)] text-white text-sm font-medium">
          <Plus size={16} /> Log Time
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-black/[0.06] p-4 mb-4 space-y-3">
          <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm" required />
          <input type="number" placeholder="Hours worked" value={form.hours} onChange={(e) => setForm({ ...form, hours: e.target.value })} className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm" step="0.5" required />
          <textarea placeholder="What did you work on?" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm" rows={2} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.billable} onChange={(e) => setForm({ ...form, billable: e.target.checked })} className="rounded" />
            Billable time
          </label>
          <button type="submit" className="w-full py-2 rounded-lg bg-[var(--avenize-primary)] text-white text-sm">Log Time</button>
        </form>
      )}

      {loading ? <div className="flex justify-center py-8"><Loader2 className="animate-spin text-black/30" /></div>
       : entries.length === 0 ? (
        <div className="text-center py-8 text-black/40"><Clock size={40} className="mx-auto mb-2 opacity-30" /><p>No time entries yet</p></div>
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => (
            <div key={entry.id} className="bg-white rounded-2xl border border-black/[0.06] p-4 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2"><span className="font-medium">{entry.hours}h</span>
                  {entry.billable && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">Billable</span>}
                </div>
                <p className="text-sm text-black/50">{entry.description || 'No description'}</p>
              </div>
              <div className="text-sm text-black/40">{new Date(entry.date).toLocaleDateString()}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

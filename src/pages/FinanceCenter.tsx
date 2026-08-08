import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../components/Toast'
import {
  Building2, DollarSign, CreditCard, FileText, Plus, Loader2,
  TrendingUp, TrendingDown, ArrowRight, AlertCircle,
  Receipt, Banknote, Send, Clock, CheckCircle2, X
} from 'lucide-react'

type FinanceTab = 'overview' | 'banking' | 'vat' | 'wht' | 'debtors' | 'creditors'

export default function FinanceCenter() {
  const { staff } = useAuth()
  const businessId = staff?.business_id
  const [activeTab, setActiveTab] = useState<FinanceTab>('overview')
  const { showToast } = useToast()

  const tabs = [
    { id: 'overview', label: 'Overview', icon: TrendingUp },
    { id: 'banking', label: 'Banking', icon: Banknote },
    { id: 'vat', label: 'VAT', icon: FileText },
    { id: 'wht', label: 'WHT', icon: Receipt },
    { id: 'debtors', label: 'Debtors', icon: TrendingDown },
    { id: 'creditors', label: 'Creditors', icon: ArrowRight },
  ]

  return (
    <div className="pb-20">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-black">Finance Center</h1>
          <p className="text-sm text-black">Tax, Banking & Receivables</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto pb-2 mb-6 scrollbar-hide">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as FinanceTab)}
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

      {activeTab === 'overview' && <OverviewTab businessId={businessId} />}
      {activeTab === 'banking' && <BankingTab businessId={businessId} />}
      {activeTab === 'vat' && <VATTab businessId={businessId} />}
      {activeTab === 'wht' && <WHTTab businessId={businessId} />}
      {activeTab === 'debtors' && <DebtorsTab businessId={businessId} />}
      {activeTab === 'creditors' && <CreditorsTab businessId={businessId} />}
    </div>
  )
}

// Overview Tab
function OverviewTab({ businessId }: { businessId?: string }) {
  const [stats, setStats] = useState<any>({
    totalDebtors: 0,
    totalCreditors: 0,
    pendingVAT: 0,
    pendingWHT: 0,
    bankBalance: 0,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadStats()
  }, [])

  async function loadStats() {
    setLoading(true)
    try {
      const [debtorsRes, creditorsRes, vatRes, bankRes] = await Promise.all([
        supabase.from('debtors').select('outstanding_amount', { count: 'exact' }).eq('business_id', businessId),
        supabase.from('creditors').select('outstanding_amount', { count: 'exact' }).eq('business_id', businessId),
        supabase.from('vat_records').select('vat_amount', { count: 'exact' }).eq('business_id', businessId).eq('status', 'pending'),
        supabase.from('bank_accounts').select('balance').eq('business_id', businessId),
      ])
      setStats({
        totalDebtors: debtorsRes.data?.reduce((sum, d) => sum + (d.outstanding_amount || 0), 0) || 0,
        totalCreditors: creditorsRes.data?.reduce((sum, c) => sum + (c.outstanding_amount || 0), 0) || 0,
        pendingVAT: vatRes.data?.reduce((sum, v) => sum + (v.vat_amount || 0), 0) || 0,
        bankBalance: bankRes.data?.reduce((sum, b) => sum + (b.balance || 0), 0) || 0,
      })
    } catch (err) {
      console.error(err)
    }
    setLoading(false)
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-black" /></div>

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-black/[0.06] p-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
              <TrendingDown size={20} className="text-red-500" />
            </div>
            <div>
              <div className="text-2xl font-bold">₦{(stats.totalDebtors / 1000000).toFixed(1)}M</div>
              <div className="text-xs text-black">Debtors (Receivable)</div>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-black/[0.06] p-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
              <TrendingUp size={20} className="text-amber-500" />
            </div>
            <div>
              <div className="text-2xl font-bold">₦{(stats.totalCreditors / 1000000).toFixed(1)}M</div>
              <div className="text-xs text-black">Creditors (Payable)</div>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-black/[0.06] p-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <FileText size={20} className="text-blue-500" />
            </div>
            <div>
              <div className="text-2xl font-bold">₦{(stats.pendingVAT / 1000).toFixed(0)}K</div>
              <div className="text-xs text-black">Pending VAT</div>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-black/[0.06] p-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
              <Banknote size={20} className="text-green-500" />
            </div>
            <div>
              <div className="text-2xl font-bold">₦{(stats.bankBalance / 1000000).toFixed(1)}M</div>
              <div className="text-xs text-black">Bank Balance</div>
            </div>
          </div>
        </div>
      </div>

      {/* Net Position */}
      <div className="mt-6 bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl p-6 text-white">
        <p className="text-sm opacity-80 mb-2">Net Working Capital</p>
        <h2 className="text-3xl font-bold">₦{((stats.totalDebtors - stats.totalCreditors) / 1000000).toFixed(1)}M</h2>
        <p className="text-sm opacity-80 mt-2">Debtors - Creditors</p>
      </div>
    </div>
  )
}

// Banking Tab
function BankingTab({ businessId }: { businessId?: string }) {
  const [accounts, setAccounts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const { showToast } = useToast()

  const [form, setForm] = useState({
    bank_name: '',
    account_name: '',
    account_number: '',
    account_type: 'current',
    balance: '',
  })

  useEffect(() => {
    loadAccounts()
  }, [])

  async function loadAccounts() {
    setLoading(true)
    const { data } = await supabase.from('bank_accounts').select('*').eq('business_id', businessId).order('created_at', { ascending: false })
    setAccounts(data || [])
    setLoading(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    await supabase.from('bank_accounts').insert({
      ...form,
      business_id: businessId,
      balance: parseFloat(form.balance) || 0,
    })
    showToast('Bank account added!', 'success')
    setShowForm(false)
    loadAccounts()
  }

  const totalBalance = accounts.reduce((sum, a) => sum + (a.balance || 0), 0)

  return (
    <div>
      {/* Total Balance */}
      <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-2xl p-6 text-white mb-6">
        <p className="text-sm opacity-80">Total Bank Balance</p>
        <h2 className="text-3xl font-bold">₦{totalBalance.toLocaleString()}</h2>
      </div>

      <div className="flex justify-between items-center mb-4">
        <h2 className="font-medium">Bank Accounts</h2>
        <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--av-primary, #4285F4)] text-white text-sm">
          <Plus size={16} /> Add Account
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-black/[0.06] p-4 mb-4 space-y-3">
          <input type="text" placeholder="Bank Name" value={form.bank_name} onChange={(e) => setForm({ ...form, bank_name: e.target.value })} className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm" required />
          <input type="text" placeholder="Account Name" value={form.account_name} onChange={(e) => setForm({ ...form, account_name: e.target.value })} className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm" required />
          <input type="text" placeholder="Account Number" value={form.account_number} onChange={(e) => setForm({ ...form, account_number: e.target.value })} className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm" required />
          <select value={form.account_type} onChange={(e) => setForm({ ...form, account_type: e.target.value })} className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm">
            <option value="current">Current</option>
            <option value="savings">Savings</option>
            <option value="domiciliary">Domiciliary</option>
          </select>
          <input type="number" placeholder="Current Balance (₦)" value={form.balance} onChange={(e) => setForm({ ...form, balance: e.target.value })} className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm" />
          <button type="submit" className="w-full py-2 rounded-lg bg-[var(--av-primary, #4285F4)] text-white">Add Account</button>
        </form>
      )}

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="animate-spin text-black" /></div>
      ) : accounts.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-black/[0.06]">
          <Banknote size={48} className="mx-auto text-black/50 mb-3" />
          <p className="text-black">No bank accounts added</p>
        </div>
      ) : (
        <div className="space-y-3">
          {accounts.map((account) => (
            <div key={account.id} className="bg-white rounded-2xl border border-black/[0.06] p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center">
                  <Building2 size={24} className="text-blue-500" />
                </div>
                <div>
                  <h3 className="font-medium">{account.bank_name}</h3>
                  <p className="text-sm text-black">{account.account_name} - {account.account_number}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-semibold">₦{account.balance?.toLocaleString()}</p>
                <span className="text-xs bg-black/10 px-2 py-0.5 rounded capitalize">{account.account_type}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// VAT Tab
function VATTab({ businessId }: { businessId?: string }) {
  const [records, setRecords] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const { showToast } = useToast()

  const [form, setForm] = useState({
    record_type: 'sales',
    invoice_number: '',
    invoice_date: '',
    client_name: '',
    base_amount: '',
    vat_amount: '',
  })

  useEffect(() => {
    loadRecords()
  }, [])

  async function loadRecords() {
    setLoading(true)
    const { data } = await supabase.from('vat_records').select('*').eq('business_id', businessId).order('created_at', { ascending: false })
    setRecords(data || [])
    setLoading(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    await supabase.from('vat_records').insert({
      ...form,
      business_id: businessId,
      base_amount: parseFloat(form.base_amount),
      vat_amount: parseFloat(form.vat_amount),
      total_amount: parseFloat(form.base_amount) + parseFloat(form.vat_amount),
    })
    showToast('VAT record added!', 'success')
    setShowForm(false)
    loadRecords()
  }

  const totalVAT = records.reduce((sum, r) => sum + (r.vat_amount || 0), 0)

  return (
    <div>
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-4 text-white">
          <p className="text-sm opacity-80">Total VAT</p>
          <h2 className="text-2xl font-bold">₦{totalVAT.toLocaleString()}</h2>
        </div>
        <div className="bg-white rounded-2xl border border-black/[0.06] p-4">
          <p className="text-sm text-black">Pending Filing</p>
          <h2 className="text-2xl font-bold">{records.filter(r => r.status === 'pending').length}</h2>
        </div>
      </div>

      <div className="flex justify-between items-center mb-4">
        <h2 className="font-medium">VAT Records</h2>
        <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--av-primary, #4285F4)] text-white text-sm">
          <Plus size={16} /> Add Record
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-black/[0.06] p-4 mb-4 space-y-3">
          <select value={form.record_type} onChange={(e) => setForm({ ...form, record_type: e.target.value })} className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm">
            <option value="sales">Sales VAT</option>
            <option value="purchase">Purchase VAT</option>
          </select>
          <div className="grid grid-cols-2 gap-3">
            <input type="text" placeholder="Invoice Number" value={form.invoice_number} onChange={(e) => setForm({ ...form, invoice_number: e.target.value })} className="rounded-lg border border-black/10 px-3 py-2 text-sm" required />
            <input type="date" value={form.invoice_date} onChange={(e) => setForm({ ...form, invoice_date: e.target.value })} className="rounded-lg border border-black/10 px-3 py-2 text-sm" required />
          </div>
          <input type="text" placeholder="Client Name" value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm" required />
          <div className="grid grid-cols-2 gap-3">
            <input type="number" placeholder="Base Amount (₦)" value={form.base_amount} onChange={(e) => setForm({ ...form, base_amount: e.target.value })} className="rounded-lg border border-black/10 px-3 py-2 text-sm" required />
            <input type="number" placeholder="VAT Amount (₦)" value={form.vat_amount} onChange={(e) => setForm({ ...form, vat_amount: e.target.value })} className="rounded-lg border border-black/10 px-3 py-2 text-sm" required />
          </div>
          <button type="submit" className="w-full py-2 rounded-lg bg-[var(--av-primary, #4285F4)] text-white">Add Record</button>
        </form>
      )}

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="animate-spin text-black" /></div>
      ) : records.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-black/[0.06]">
          <FileText size={48} className="mx-auto text-black/50 mb-3" />
          <p className="text-black">No VAT records</p>
        </div>
      ) : (
        <div className="space-y-3">
          {records.map((record) => (
            <div key={record.id} className="bg-white rounded-2xl border border-black/[0.06] p-4 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded ${record.record_type === 'sales' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                    {record.record_type}
                  </span>
                  <span className="text-sm text-black">{record.invoice_number}</span>
                </div>
                <p className="font-medium mt-1">{record.client_name}</p>
              </div>
              <div className="text-right">
                <p className="font-semibold">₦{record.vat_amount?.toLocaleString()}</p>
                <span className={`text-xs px-2 py-0.5 rounded-full ${record.status === 'filed' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                  {record.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// WHT Tab
function WHTTab({ businessId }: { businessId?: string }) {
  const [records, setRecords] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const { showToast } = useToast()

  const [form, setForm] = useState({
    record_type: 'withheld',
    beneficiary_name: '',
    service_type: '',
    gross_amount: '',
    withholding_rate: '',
  })

  useEffect(() => {
    loadRecords()
  }, [])

  async function loadRecords() {
    setLoading(true)
    const { data } = await supabase.from('wht_records').select('*').eq('business_id', businessId).order('created_at', { ascending: false })
    setRecords(data || [])
    setLoading(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const withholding_amount = (parseFloat(form.gross_amount) * parseFloat(form.withholding_rate)) / 100
    await supabase.from('wht_records').insert({
      ...form,
      business_id: businessId,
      gross_amount: parseFloat(form.gross_amount),
      withholding_rate: parseFloat(form.withholding_rate),
      withholding_amount,
    })
    showToast('WHT record added!', 'success')
    setShowForm(false)
    loadRecords()
  }

  const totalWHT = records.reduce((sum, r) => sum + (r.withholding_amount || 0), 0)

  return (
    <div>
      <div className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-2xl p-6 text-white mb-6">
        <p className="text-sm opacity-80">Total WHT</p>
        <h2 className="text-3xl font-bold">₦{totalWHT.toLocaleString()}</h2>
      </div>

      <div className="flex justify-between items-center mb-4">
        <h2 className="font-medium">Withholding Tax Records</h2>
        <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--av-primary, #4285F4)] text-white text-sm">
          <Plus size={16} /> Add Record
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-black/[0.06] p-4 mb-4 space-y-3">
          <select value={form.record_type} onChange={(e) => setForm({ ...form, record_type: e.target.value })} className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm">
            <option value="withheld">WHT Withheld</option>
            <option value="received">WHT Received</option>
          </select>
          <input type="text" placeholder="Beneficiary Name" value={form.beneficiary_name} onChange={(e) => setForm({ ...form, beneficiary_name: e.target.value })} className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm" required />
          <input type="text" placeholder="Service Type (e.g., Rent, Consulting)" value={form.service_type} onChange={(e) => setForm({ ...form, service_type: e.target.value })} className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm" required />
          <div className="grid grid-cols-2 gap-3">
            <input type="number" placeholder="Gross Amount (₦)" value={form.gross_amount} onChange={(e) => setForm({ ...form, gross_amount: e.target.value })} className="rounded-lg border border-black/10 px-3 py-2 text-sm" required />
            <input type="number" placeholder="WHT Rate (%)" value={form.withholding_rate} onChange={(e) => setForm({ ...form, withholding_rate: e.target.value })} className="rounded-lg border border-black/10 px-3 py-2 text-sm" required />
          </div>
          <button type="submit" className="w-full py-2 rounded-lg bg-[var(--av-primary, #4285F4)] text-white">Add Record</button>
        </form>
      )}

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="animate-spin text-black" /></div>
      ) : records.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-black/[0.06]">
          <Receipt size={48} className="mx-auto text-black/50 mb-3" />
          <p className="text-black">No WHT records</p>
        </div>
      ) : (
        <div className="space-y-3">
          {records.map((record) => (
            <div key={record.id} className="bg-white rounded-2xl border border-black/[0.06] p-4 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded ${record.record_type === 'withheld' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                    {record.record_type}
                  </span>
                  <span className="text-sm text-black">{record.service_type}</span>
                </div>
                <p className="font-medium mt-1">{record.beneficiary_name}</p>
                <p className="text-sm text-black">₦{record.gross_amount?.toLocaleString()} @ {record.withholding_rate}%</p>
              </div>
              <div className="text-right">
                <p className="font-semibold text-amber-600">₦{record.withholding_amount?.toLocaleString()}</p>
                <span className={`text-xs px-2 py-0.5 rounded-full ${record.status === 'remitted' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                  {record.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Debtors Tab
function DebtorsTab({ businessId }: { businessId?: string }) {
  const [debtors, setDebtors] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const { showToast } = useToast()

  const [form, setForm] = useState({
    client_name: '',
    client_email: '',
    client_phone: '',
    invoice_number: '',
    original_amount: '',
    outstanding_amount: '',
    due_date: '',
  })

  useEffect(() => {
    loadDebtors()
  }, [])

  async function loadDebtors() {
    setLoading(true)
    const { data } = await supabase.from('debtors').select('*').eq('business_id', businessId).order('created_at', { ascending: false })
    setDebtors(data || [])
    setLoading(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    await supabase.from('debtors').insert({
      ...form,
      business_id: businessId,
      original_amount: parseFloat(form.original_amount),
      outstanding_amount: parseFloat(form.outstanding_amount),
    })
    showToast('Debtor added!', 'success')
    setShowForm(false)
    loadDebtors()
  }

  const totalOutstanding = debtors.reduce((sum, d) => sum + (d.outstanding_amount || 0), 0)
  const overdueCount = debtors.filter(d => d.days_overdue > 0).length

  return (
    <div>
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-2xl p-4 text-white">
          <p className="text-sm opacity-80">Total Outstanding</p>
          <h2 className="text-2xl font-bold">₦{totalOutstanding.toLocaleString()}</h2>
        </div>
        <div className="bg-white rounded-2xl border border-black/[0.06] p-4">
          <p className="text-sm text-black">Overdue</p>
          <h2 className="text-2xl font-bold text-red-600">{overdueCount}</h2>
        </div>
      </div>

      <div className="flex justify-between items-center mb-4">
        <h2 className="font-medium">Debtors (Money Owed to You)</h2>
        <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--av-primary, #4285F4)] text-white text-sm">
          <Plus size={16} /> Add Debtor
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-black/[0.06] p-4 mb-4 space-y-3">
          <input type="text" placeholder="Client Name" value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm" required />
          <div className="grid grid-cols-2 gap-3">
            <input type="email" placeholder="Email" value={form.client_email} onChange={(e) => setForm({ ...form, client_email: e.target.value })} className="rounded-lg border border-black/10 px-3 py-2 text-sm" />
            <input type="tel" placeholder="Phone" value={form.client_phone} onChange={(e) => setForm({ ...form, client_phone: e.target.value })} className="rounded-lg border border-black/10 px-3 py-2 text-sm" />
          </div>
          <input type="text" placeholder="Invoice Number" value={form.invoice_number} onChange={(e) => setForm({ ...form, invoice_number: e.target.value })} className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm" required />
          <div className="grid grid-cols-2 gap-3">
            <input type="number" placeholder="Original Amount (₦)" value={form.original_amount} onChange={(e) => setForm({ ...form, original_amount: e.target.value })} className="rounded-lg border border-black/10 px-3 py-2 text-sm" required />
            <input type="number" placeholder="Outstanding (₦)" value={form.outstanding_amount} onChange={(e) => setForm({ ...form, outstanding_amount: e.target.value })} className="rounded-lg border border-black/10 px-3 py-2 text-sm" required />
          </div>
          <input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm" />
          <button type="submit" className="w-full py-2 rounded-lg bg-[var(--av-primary, #4285F4)] text-white">Add Debtor</button>
        </form>
      )}

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="animate-spin text-black" /></div>
      ) : debtors.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-black/[0.06]">
          <CheckCircle2 size={48} className="mx-auto text-green-500 mb-3" />
          <p className="text-black">No outstanding debtors!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {debtors.map((debtor) => (
            <div key={debtor.id} className="bg-white rounded-2xl border border-black/[0.06] p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium">{debtor.client_name}</h3>
                  <p className="text-sm text-black">{debtor.invoice_number}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-red-600">₦{debtor.outstanding_amount?.toLocaleString()}</p>
                  {debtor.days_overdue > 0 ? (
                    <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">{debtor.days_overdue} days overdue</span>
                  ) : (
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">On track</span>
                  )}
                </div>
              </div>
              {debtor.due_date && <p className="text-sm text-black mt-2">Due: {new Date(debtor.due_date).toLocaleDateString()}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Creditors Tab
function CreditorsTab({ businessId }: { businessId?: string }) {
  const [creditors, setCreditors] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const { showToast } = useToast()

  const [form, setForm] = useState({
    supplier_name: '',
    supplier_email: '',
    invoice_number: '',
    original_amount: '',
    outstanding_amount: '',
    due_date: '',
  })

  useEffect(() => {
    loadCreditors()
  }, [])

  async function loadCreditors() {
    setLoading(true)
    const { data } = await supabase.from('creditors').select('*').eq('business_id', businessId).order('created_at', { ascending: false })
    setCreditors(data || [])
    setLoading(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    await supabase.from('creditors').insert({
      ...form,
      business_id: businessId,
      original_amount: parseFloat(form.original_amount),
      outstanding_amount: parseFloat(form.outstanding_amount),
    })
    showToast('Creditor added!', 'success')
    setShowForm(false)
    loadCreditors()
  }

  const totalOutstanding = creditors.reduce((sum, c) => sum + (c.outstanding_amount || 0), 0)

  return (
    <div>
      <div className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-2xl p-6 text-white mb-6">
        <p className="text-sm opacity-80">Total Payable</p>
        <h2 className="text-3xl font-bold">₦{totalOutstanding.toLocaleString()}</h2>
      </div>

      <div className="flex justify-between items-center mb-4">
        <h2 className="font-medium">Creditors (Money You Owe)</h2>
        <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--av-primary, #4285F4)] text-white text-sm">
          <Plus size={16} /> Add Creditor
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-black/[0.06] p-4 mb-4 space-y-3">
          <input type="text" placeholder="Supplier Name" value={form.supplier_name} onChange={(e) => setForm({ ...form, supplier_name: e.target.value })} className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm" required />
          <input type="email" placeholder="Email" value={form.supplier_email} onChange={(e) => setForm({ ...form, supplier_email: e.target.value })} className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm" />
          <input type="text" placeholder="Bill/Invoice Number" value={form.invoice_number} onChange={(e) => setForm({ ...form, invoice_number: e.target.value })} className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm" required />
          <div className="grid grid-cols-2 gap-3">
            <input type="number" placeholder="Original Amount (₦)" value={form.original_amount} onChange={(e) => setForm({ ...form, original_amount: e.target.value })} className="rounded-lg border border-black/10 px-3 py-2 text-sm" required />
            <input type="number" placeholder="Outstanding (₦)" value={form.outstanding_amount} onChange={(e) => setForm({ ...form, outstanding_amount: e.target.value })} className="rounded-lg border border-black/10 px-3 py-2 text-sm" required />
          </div>
          <input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm" />
          <button type="submit" className="w-full py-2 rounded-lg bg-[var(--av-primary, #4285F4)] text-white">Add Creditor</button>
        </form>
      )}

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="animate-spin text-black" /></div>
      ) : creditors.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-black/[0.06]">
          <CreditCard size={48} className="mx-auto text-black/50 mb-3" />
          <p className="text-black">No creditors</p>
        </div>
      ) : (
        <div className="space-y-3">
          {creditors.map((creditor) => (
            <div key={creditor.id} className="bg-white rounded-2xl border border-black/[0.06] p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium">{creditor.supplier_name}</h3>
                  <p className="text-sm text-black">{creditor.invoice_number}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-amber-600">₦{creditor.outstanding_amount?.toLocaleString()}</p>
                  {creditor.days_overdue > 0 ? (
                    <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">{creditor.days_overdue} days overdue</span>
                  ) : creditor.due_date ? (
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">Due {new Date(creditor.due_date).toLocaleDateString()}</span>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

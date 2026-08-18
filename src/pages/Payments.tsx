// ============================================
// PAYMENTS PAGE - NIGERIAN BUSINESS
// Multi-bank, multi-method payment tracking
// ============================================

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'
import {
  Plus, Search, Filter, Download, Receipt, CheckCircle2,
  Clock, AlertCircle, CreditCard, Building2, Smartphone,
  Banknote, FileText, X, ChevronDown, DollarSign, TrendingUp,
  Calendar, ArrowUpRight, ArrowDownRight, Wallet, ReceiptText
} from 'lucide-react'

type PaymentMethod = 'bank_transfer' | 'cash' | 'mobile_money' | 'pos' | 'cheque'
type PaymentBank = 'access' | 'gtbank' | 'uba' | 'first_bank' | 'sterling' | 'others'
type PaymentType = 'income' | 'expense'

interface Payment {
  id: string
  type: PaymentType
  amount: number
  method: PaymentMethod
  bank?: PaymentBank
  reference?: string
  description: string
  category?: string
  invoice_id?: string
  invoice_number?: string
  client_name?: string
  date: string
  notes?: string
  created_at: string
  staff_id: string
  business_id: string
}

interface BankAccount {
  id: string
  bank_name: PaymentBank
  account_number: string
  account_name: string
  is_primary: boolean
  balance: number
}

const METHOD_LABELS: Record<PaymentMethod, { label: string; icon: React.ReactNode; color: string }> = {
  bank_transfer: { label: 'Bank Transfer', icon: <Building2 size={16} />, color: 'blue' },
  cash: { label: 'Cash', icon: <Banknote size={16} />, color: 'green' },
  mobile_money: { label: 'Mobile Money', icon: <Smartphone size={16} />, color: 'purple' },
  pos: { label: 'POS', icon: <CreditCard size={16} />, color: 'orange' },
  cheque: { label: 'Cheque', icon: <FileText size={16} />, color: 'blue' },
}

const BANK_LABELS: Record<PaymentBank, string> = {
  access: 'Access Bank',
  gtbank: 'GTBank',
  uba: 'UBA',
  first_bank: 'First Bank',
  sterling: 'Sterling Bank',
  others: 'Others',
}

const EXPENSE_CATEGORIES = [
  'Salaries & Wages',
  'Rent & Utilities',
  'Materials & Supplies',
  'Transportation',
  'Marketing',
  'Equipment',
  'Insurance',
  'Taxes & Levies',
  'Professional Services',
  'Office Supplies',
  'Repairs & Maintenance',
  'Other',
]

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export default function Payments() {
  const { staff } = useAuth()
  const { showToast } = useToast()
  
  const [payments, setPayments] = useState<Payment[]>([])
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<PaymentType | 'all'>('all')
  const [methodFilter, setMethodFilter] = useState<PaymentMethod | 'all'>('all')
  const [showNewPayment, setShowNewPayment] = useState(false)
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null)
  const [activeTab, setActiveTab] = useState<'all' | 'income' | 'expenses'>('all')
  
  // New payment form
  const [newPayment, setNewPayment] = useState({
    type: 'income' as PaymentType,
    amount: 0,
    method: 'bank_transfer' as PaymentMethod,
    bank: 'access' as PaymentBank,
    reference: '',
    description: '',
    category: '',
    invoice_id: '',
        invoice_number: '',
    client_name: '',
    notes: '',
    date: new Date().toISOString().split('T')[0],
  })

  const loadPayments = useCallback(async () => {
    if (!staff?.business_id) return
    
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('payments')
        .select('*')
        .eq('business_id', staff.business_id)
        .order('date', { ascending: false })
        .limit(100)

      if (error) throw error
      setPayments((data as Payment[]) ?? [])
    } catch (err) {
      console.error('Failed to load payments:', err)
      showToast('Failed to load payments', 'error')
    } finally {
      setLoading(false)
    }
  }, [staff?.business_id, showToast])

  useEffect(() => {
    loadPayments()
  }, [loadPayments])

  const createPayment = async () => {
    if (!staff?.business_id || !staff?.id) return
    if (newPayment.amount <= 0 || !newPayment.description) {
      showToast('Enter amount and description', 'error')
      return
    }

    try {
      const { data, error } = await supabase
        .from('payments')
        .insert({
          type: newPayment.type,
          amount: newPayment.amount,
          method: newPayment.method,
          bank: newPayment.method === 'bank_transfer' ? newPayment.bank : null,
          reference: newPayment.reference || null,
          description: newPayment.description,
          category: newPayment.category || null,
          invoice_id: newPayment.invoice_id || null,
          invoice_number: newPayment.invoice_number || null,
          client_name: newPayment.client_name || null,
          date: newPayment.date,
          notes: newPayment.notes || null,
          staff_id: staff.id,
          business_id: staff.business_id,
        })
        .select()
        .single()

      if (error) throw error

      setPayments(prev => [data as Payment, ...prev])
      setShowNewPayment(false)
      setNewPayment({
        type: 'income', amount: 0, method: 'bank_transfer', bank: 'access',
        reference: '', description: '', category: '', invoice_id: '', 
        client_name: '', invoice_number: '', notes: '', date: new Date().toISOString().split('T')[0],
      })
      showToast('Payment recorded!', 'success')
    } catch (err) {
      console.error('Failed to create payment:', err)
      showToast('Failed to record payment', 'error')
    }
  }

  const filteredPayments = payments.filter(p => {
    if (activeTab !== 'all' && p.type !== activeTab) return false
    if (methodFilter !== 'all' && p.method !== methodFilter) return false
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      return (
        p.description.toLowerCase().includes(query) ||
        p.reference?.toLowerCase().includes(query) ||
        p.client_name?.toLowerCase().includes(query) ||
        p.invoice_number?.toLowerCase().includes(query)
      )
    }
    return true
  })

  // Stats
  const stats = {
    totalIncome: payments.filter(p => p.type === 'income').reduce((sum, p) => sum + p.amount, 0),
    totalExpenses: payments.filter(p => p.type === 'expense').reduce((sum, p) => sum + p.amount, 0),
    thisMonth: {
      income: payments
        .filter(p => p.type === 'income' && new Date(p.date).getMonth() === new Date().getMonth())
        .reduce((sum, p) => sum + p.amount, 0),
      expenses: payments
        .filter(p => p.type === 'expense' && new Date(p.date).getMonth() === new Date().getMonth())
        .reduce((sum, p) => sum + p.amount, 0),
    },
    pending: payments.filter(p => !p.reference && p.type === 'income').length,
  }

  const netBalance = stats.totalIncome - stats.totalExpenses

  return (
    <div className="pb-20">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-medium">Payments</h1>
          <p className="text-sm text-black">Track income and expenses</p>
        </div>
        <button
          onClick={() => setShowNewPayment(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg avenize-gradient text-white text-sm font-medium"
        >
          <Plus size={16} />
          Record Payment
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-white rounded-xl border border-black/[0.06] p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
              <ArrowUpRight size={16} className="text-[var(--av-success)]" />
            </div>
            <span className="text-xs text-black">Total Income</span>
          </div>
          <p className="text-xl font-bold text-[var(--av-success)]">{formatCurrency(stats.totalIncome)}</p>
        </div>
        
        <div className="bg-white rounded-xl border border-black/[0.06] p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center">
              <ArrowDownRight size={16} className="text-[var(--av-danger)]" />
            </div>
            <span className="text-xs text-black">Total Expenses</span>
          </div>
          <p className="text-xl font-bold text-[var(--av-danger)]">{formatCurrency(stats.totalExpenses)}</p>
        </div>
        
        <div className="bg-white rounded-xl border border-black/[0.06] p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
              <Wallet size={16} className="text-[var(--av-primary)]" />
            </div>
            <span className="text-xs text-black">Net Balance</span>
          </div>
          <p className={`text-xl font-bold ${netBalance >= 0 ? 'text-[var(--av-primary, #4285F4)]' : 'text-[var(--av-danger)]'}`}>
            {formatCurrency(netBalance)}
          </p>
        </div>
        
        <div className="bg-white rounded-xl border border-black/[0.06] p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
              <Calendar size={16} className="text-[var(--av-warning)]" />
            </div>
            <span className="text-xs text-black">This Month</span>
          </div>
          <p className="text-lg font-bold">
            <span className="text-[var(--av-success)]">{formatCurrency(stats.thisMonth.income)}</span>
            <span className="text-black mx-1">/</span>
            <span className="text-[var(--av-danger)]">{formatCurrency(stats.thisMonth.expenses)}</span>
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setActiveTab('all')}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${
            activeTab === 'all' ? 'avenize-gradient text-white' : 'bg-white border border-black/10'
          }`}
        >
          All
        </button>
        <button
          onClick={() => setActiveTab('income')}
          className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 ${
            activeTab === 'income' ? 'avenize-gradient text-white' : 'bg-white border border-black/10'
          }`}
        >
          <ArrowUpRight size={14} />
          Income
        </button>
        <button
          onClick={() => setActiveTab('expenses')}
          className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 ${
            activeTab === 'expenses' ? 'avenize-gradient text-white' : 'bg-white border border-black/10'
          }`}
        >
          <ArrowDownRight size={14} />
          Expenses
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="flex-1 min-w-[200px] relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-black" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search payments..."
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-black/10 text-sm bg-white"
          />
        </div>
        <select
          value={methodFilter}
          onChange={(e) => setMethodFilter(e.target.value as PaymentMethod | 'all')}
          className="px-4 py-2.5 rounded-xl border border-black/10 text-sm bg-white"
        >
          <option value="all">All Methods</option>
          {Object.entries(METHOD_LABELS).map(([key, { label }]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
      </div>

      {/* Payments List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-xl border border-black/[0.06] p-4 animate-pulse">
              <div className="h-5 bg-black/10 rounded w-1/3 mb-2" />
              <div className="h-4 bg-black/10 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : filteredPayments.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-16 h-16 rounded-2xl bg-[var(--av-primary, #4285F4)]/10 flex items-center justify-center mx-auto mb-4">
            <ReceiptText size={24} className="text-[var(--av-primary, #4285F4)]" />
          </div>
          <h3 className="font-semibold mb-2">No payments found</h3>
          <p className="text-sm text-black mb-4">
            {searchQuery ? 'Try adjusting your search' : 'Record your first payment to get started'}
          </p>
          {!searchQuery && (
            <button
              onClick={() => setShowNewPayment(true)}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl avenize-gradient text-white font-medium"
            >
              <Plus size={16} />
              Record Payment
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredPayments.map((payment) => (
            <div
              key={payment.id}
              onClick={() => setSelectedPayment(payment)}
              className="bg-white rounded-xl border border-black/[0.06] p-4 hover:border-[var(--av-primary, #4285F4)]/20 cursor-pointer transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    payment.type === 'income' ? 'bg-green-100' : 'bg-red-100'
                  }`}>
                    {payment.type === 'income' ? (
                      <ArrowUpRight size={18} className="text-[var(--av-success)]" />
                    ) : (
                      <ArrowDownRight size={18} className="text-[var(--av-danger)]" />
                    )}
                  </div>
                  <div>
                    <p className="font-medium">{payment.description}</p>
                    <div className="flex items-center gap-2 text-xs text-black">
                      <span className="flex items-center gap-1">
                        {METHOD_LABELS[payment.method].icon}
                        {METHOD_LABELS[payment.method].label}
                      </span>
                      {payment.bank && (
                        <span>• {BANK_LABELS[payment.bank]}</span>
                      )}
                      {payment.reference && (
                        <span>• {payment.reference}</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`font-semibold ${payment.type === 'income' ? 'text-[var(--av-success)]' : 'text-[var(--av-danger)]'}`}>
                    {payment.type === 'income' ? '+' : '-'}{formatCurrency(payment.amount)}
                  </p>
                  <p className="text-xs text-black">
                    {new Date(payment.date).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* New Payment Modal */}
      {showNewPayment && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-black/5">
              <h2 className="font-semibold text-lg">Record Payment</h2>
              <button onClick={() => setShowNewPayment(false)} className="p-2 hover:bg-black/[0.05] rounded-lg">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-4 space-y-4">
              {/* Type Toggle */}
              <div className="flex rounded-xl overflow-hidden border border-black/10">
                <button
                  onClick={() => setNewPayment(prev => ({ ...prev, type: 'income' }))}
                  className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 ${
                    newPayment.type === 'income' 
                      ? 'bg-[var(--av-success)] text-white' 
                      : 'bg-white text-black/60 hover:bg-white'
                  }`}
                >
                  <ArrowUpRight size={16} />
                  Income
                </button>
                <button
                  onClick={() => setNewPayment(prev => ({ ...prev, type: 'expense' }))}
                  className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 ${
                    newPayment.type === 'expense' 
                      ? 'bg-[var(--av-danger)] text-white' 
                      : 'bg-white text-black/60 hover:bg-white'
                  }`}
                >
                  <ArrowDownRight size={16} />
                  Expense
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">Amount (₦) *</label>
                <input
                  type="number"
                  value={newPayment.amount || ''}
                  onChange={(e) => setNewPayment(prev => ({ ...prev, amount: Number(e.target.value) }))}
                  placeholder="0.00"
                  className="w-full px-4 py-3 rounded-xl border border-black/10 text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-[var(--av-primary, #4285F4)]/30"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">Description *</label>
                <input
                  type="text"
                  value={newPayment.description}
                  onChange={(e) => setNewPayment(prev => ({ ...prev, description: e.target.value }))}
                  placeholder={newPayment.type === 'income' ? 'Payment from client' : 'What was this expense for?'}
                  className="w-full px-4 py-2.5 rounded-xl border border-black/10 text-sm"
                />
              </div>

              {newPayment.type === 'income' && (
                <div>
                  <label className="block text-sm font-medium mb-1.5">Client Name</label>
                  <input
                    type="text"
                    value={newPayment.client_name}
                    onChange={(e) => setNewPayment(prev => ({ ...prev, client_name: e.target.value }))}
                    placeholder="Client or company name"
                    className="w-full px-4 py-2.5 rounded-xl border border-black/10 text-sm"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-1.5">Payment Method</label>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(METHOD_LABELS).map(([key, { label, icon }]) => (
                    <button
                      key={key}
                      onClick={() => setNewPayment(prev => ({ ...prev, method: key as PaymentMethod }))}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm ${
                        newPayment.method === key
                          ? 'border-[var(--av-primary, #4285F4)] bg-[var(--av-primary, #4285F4)]/5 text-[var(--av-primary, #4285F4)]'
                          : 'border-black/10 hover:border-black/20'
                      }`}
                    >
                      {icon}
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {newPayment.method === 'bank_transfer' && (
                <div>
                  <label className="block text-sm font-medium mb-1.5">Bank</label>
                  <select
                    value={newPayment.bank}
                    onChange={(e) => setNewPayment(prev => ({ ...prev, bank: e.target.value as PaymentBank }))}
                    className="w-full px-4 py-2.5 rounded-xl border border-black/10 text-sm bg-white"
                  >
                    {Object.entries(BANK_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </div>
              )}

              {newPayment.type === 'expense' && (
                <div>
                  <label className="block text-sm font-medium mb-1.5">Category</label>
                  <select
                    value={newPayment.category}
                    onChange={(e) => setNewPayment(prev => ({ ...prev, category: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl border border-black/10 text-sm bg-white"
                  >
                    <option value="">Select category</option>
                    {EXPENSE_CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1.5">Date</label>
                  <input
                    type="date"
                    value={newPayment.date}
                    onChange={(e) => setNewPayment(prev => ({ ...prev, date: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl border border-black/10 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">Reference</label>
                  <input
                    type="text"
                    value={newPayment.reference}
                    onChange={(e) => setNewPayment(prev => ({ ...prev, reference: e.target.value }))}
                    placeholder="Receipt #, Invoice #"
                    className="w-full px-4 py-2.5 rounded-xl border border-black/10 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">Notes</label>
                <textarea
                  value={newPayment.notes}
                  onChange={(e) => setNewPayment(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Additional notes..."
                  rows={2}
                  className="w-full px-4 py-2.5 rounded-xl border border-black/10 text-sm resize-none"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowNewPayment(false)}
                  className="flex-1 px-4 py-3 rounded-xl border border-black/10 font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={createPayment}
                  className={`flex-1 px-4 py-3 rounded-xl font-medium text-white ${
                    newPayment.type === 'income' 
                      ? 'avenize-gradient' 
                      : 'bg-[var(--av-danger)] hover:bg-red-700'
                  }`}
                >
                  Record {newPayment.type === 'income' ? 'Income' : 'Expense'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Payment Detail Modal */}
      {selectedPayment && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b border-black/5">
              <h2 className="font-semibold text-lg">Payment Details</h2>
              <button onClick={() => setSelectedPayment(null)} className="p-2 hover:bg-black/[0.05] rounded-lg">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-4 space-y-4">
              <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto ${
                selectedPayment.type === 'income' ? 'bg-green-100' : 'bg-red-100'
              }`}>
                {selectedPayment.type === 'income' ? (
                  <ArrowUpRight size={28} className="text-[var(--av-success)]" />
                ) : (
                  <ArrowDownRight size={28} className="text-[var(--av-danger)]" />
                )}
              </div>
              
              <div className="text-center">
                <p className={`text-3xl font-bold ${
                  selectedPayment.type === 'income' ? 'text-[var(--av-success)]' : 'text-[var(--av-danger)]'
                }`}>
                  {selectedPayment.type === 'income' ? '+' : '-'}{formatCurrency(selectedPayment.amount)}
                </p>
                <p className="text-lg font-medium mt-1">{selectedPayment.description}</p>
              </div>

              <div className="bg-white rounded-xl p-4 space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-black">Type</span>
                  <span className={`text-sm font-medium capitalize ${
                    selectedPayment.type === 'income' ? 'text-[var(--av-success)]' : 'text-[var(--av-danger)]'
                  }`}>
                    {selectedPayment.type}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-black">Method</span>
                  <span className="text-sm font-medium flex items-center gap-1">
                    {METHOD_LABELS[selectedPayment.method].icon}
                    {METHOD_LABELS[selectedPayment.method].label}
                  </span>
                </div>
                {selectedPayment.bank && (
                  <div className="flex justify-between">
                    <span className="text-sm text-black">Bank</span>
                    <span className="text-sm font-medium">{BANK_LABELS[selectedPayment.bank]}</span>
                  </div>
                )}
                {selectedPayment.client_name && (
                  <div className="flex justify-between">
                    <span className="text-sm text-black">Client</span>
                    <span className="text-sm font-medium">{selectedPayment.client_name}</span>
                  </div>
                )}
                {selectedPayment.category && (
                  <div className="flex justify-between">
                    <span className="text-sm text-black">Category</span>
                    <span className="text-sm font-medium">{selectedPayment.category}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-sm text-black">Date</span>
                  <span className="text-sm font-medium">{new Date(selectedPayment.date).toLocaleDateString()}</span>
                </div>
                {selectedPayment.reference && (
                  <div className="flex justify-between">
                    <span className="text-sm text-black">Reference</span>
                    <span className="text-sm font-medium">{selectedPayment.reference}</span>
                  </div>
                )}
              </div>

              {selectedPayment.notes && (
                <div>
                  <p className="text-sm text-black mb-1">Notes</p>
                  <p className="text-sm bg-white rounded-xl p-3">{selectedPayment.notes}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

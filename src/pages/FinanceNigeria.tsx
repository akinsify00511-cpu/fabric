// ============================================
// FINANCE PAGE - NIGERIAN CONSTRUCTION/REAL ESTATE
// Naira (₦), VAT, WHT, Multi-bank, Nigerian payment methods
// ============================================

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'
import {
  Plus, Search, Filter, DollarSign, TrendingUp, TrendingDown,
  Receipt, FileText, Clock, CheckCircle2, AlertCircle, Download,
  CreditCard, Building2, Smartphone, Banknote, Printer, X
} from 'lucide-react'

type InvoiceStatus = 'draft' | 'sent' | 'partially_paid' | 'paid' | 'overdue' | 'cancelled'
type PaymentMethod = 'bank_transfer' | 'cash' | 'mobile_money' | 'pos' | 'cheque'
type PaymentBank = 'access' | 'gtbank' | 'uba' | 'first_bank' | 'other'

interface Invoice {
  id: string
  invoice_number: string
  client_name: string
  client_email?: string
  client_address?: string
  job_reference?: string
  items: InvoiceItem[]
  subtotal: number // Naira
  vat_rate: number // 7.5%
  vat_amount: number
  wht_rate: number // 5% or 10%
  wht_amount: number
  total: number
  amount_paid: number
  balance: number
  status: InvoiceStatus
  issue_date: string
  due_date: string
  notes?: string
  is_proforma: boolean
  created_at: string
  staff_id: string
  business_id: string
}

interface InvoiceItem {
  description: string
  quantity: number
  unit_price: number
  total: number
}

interface Payment {
  id: string
  invoice_id?: string
  invoice_number?: string
  amount: number
  method: PaymentMethod
  bank?: PaymentBank
  reference?: string
  date: string
  notes?: string
  created_at: string
  staff_id: string
  business_id: string
}

const STATUS_LABELS: Record<InvoiceStatus, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'gray' },
  sent: { label: 'Sent', color: 'blue' },
  partially_paid: { label: 'Partially Paid', color: 'yellow' },
  paid: { label: 'Paid', color: 'green' },
  overdue: { label: 'Overdue', color: 'red' },
  cancelled: { label: 'Cancelled', color: 'gray' },
}

const METHOD_LABELS: Record<PaymentMethod, { label: string; icon: React.ReactNode }> = {
  bank_transfer: { label: 'Bank Transfer', icon: <Building2 size={14} /> },
  cash: { label: 'Cash', icon: <Banknote size={14} /> },
  mobile_money: { label: 'Mobile Money', icon: <Smartphone size={14} /> },
  pos: { label: 'POS', icon: <CreditCard size={14} /> },
  cheque: { label: 'Cheque', icon: <FileText size={14} /> },
}

const VAT_RATE = 0.075 // 7.5%
const WHT_RATE_RESIDENT = 0.05 // 5% for resident companies
const WHT_RATE_NON_RESIDENT = 0.10 // 10% for non-resident

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export default function FinanceNigeria() {
  const { staff } = useAuth()
  const { showToast } = useToast()
  
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | 'all'>('all')
  const [showNewInvoice, setShowNewInvoice] = useState(false)
  const [showRecordPayment, setShowRecordPayment] = useState(false)
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)
  const [activeTab, setActiveTab] = useState<'invoices' | 'payments'>('invoices')
  
  // New invoice form
  const [newInvoice, setNewInvoice] = useState({
    client_name: '',
    client_email: '',
    client_address: '',
    job_reference: '',
    is_proforma: false,
    items: [{ description: '', quantity: 1, unit_price: 0, total: 0 }] as InvoiceItem[],
    vat_rate: VAT_RATE,
    apply_wht: false,
    notes: '',
  })

  // Payment form
  const [newPayment, setNewPayment] = useState({
    amount: 0,
    method: 'bank_transfer' as PaymentMethod,
    bank: 'access' as PaymentBank,
    reference: '',
    notes: '',
  })

  const loadFinance = useCallback(async () => {
    if (!staff?.business_id) return
    
    setLoading(true)
    try {
      const { data: invData, error: invError } = await supabase
        .from('invoices')
        .select('*')
        .eq('business_id', staff.business_id)
        .order('created_at', { ascending: false })

      const { data: payData, error: payError } = await supabase
        .from('payments')
        .select('*')
        .eq('business_id', staff.business_id)
        .order('created_at', { ascending: false })
        .limit(50)

      if (invError) throw invError
      if (payError) throw payError

      setInvoices((invData as Invoice[]) ?? [])
      setPayments((payData as Payment[]) ?? [])
    } catch (err) {
      console.error('Failed to load finance:', err)
      showToast('Failed to load finance data', 'error')
    } finally {
      setLoading(false)
    }
  }, [staff?.business_id, showToast])

  useEffect(() => {
    loadFinance()
  }, [loadFinance])

  const calculateTotals = (items: InvoiceItem[], vatRate: number, applyWht: boolean) => {
    const subtotal = items.reduce((sum, item) => sum + item.total, 0)
    const vatAmount = subtotal * vatRate
    const whtAmount = applyWht ? subtotal * WHT_RATE_RESIDENT : 0
    const total = subtotal + vatAmount
    return { subtotal, vatAmount, whtAmount, total }
  }

  const createInvoice = async () => {
    if (!staff?.business_id || !staff?.id) return
    if (!newInvoice.client_name || newInvoice.items.length === 0) {
      showToast('Client and items required', 'error')
      return
    }

    try {
      const { subtotal, vatAmount, whtAmount, total } = calculateTotals(
        newInvoice.items,
        newInvoice.vat_rate,
        newInvoice.apply_wht
      )

      const invoiceNumber = `INV-${Date.now().toString().slice(-6)}`
      const dueDate = new Date()
      dueDate.setDate(dueDate.getDate() + 30) // 30 days payment terms

      const { data, error } = await supabase
        .from('invoices')
        .insert({
          invoice_number: invoiceNumber,
          client_name: newInvoice.client_name,
          client_email: newInvoice.client_email,
          client_address: newInvoice.client_address,
          job_reference: newInvoice.job_reference,
          items: newInvoice.items,
          subtotal,
          vat_rate: newInvoice.vat_rate,
          vat_amount: vatAmount,
          wht_rate: newInvoice.apply_wht ? WHT_RATE_RESIDENT : 0,
          wht_amount: whtAmount,
          total,
          amount_paid: 0,
          balance: total,
          status: 'draft',
          issue_date: new Date().toISOString(),
          due_date: dueDate.toISOString(),
          is_proforma: newInvoice.is_proforma,
          notes: newInvoice.notes,
          staff_id: staff.id,
          business_id: staff.business_id,
        })
        .select()
        .single()

      if (error) throw error

      setInvoices(prev => [data as Invoice, ...prev])
      setShowNewInvoice(false)
      setNewInvoice({
        client_name: '', client_email: '', client_address: '', job_reference: '',
        is_proforma: false, items: [{ description: '', quantity: 1, unit_price: 0, total: 0 }],
        vat_rate: VAT_RATE, apply_wht: false, notes: '',
      })
      showToast('Invoice created!', 'success')
    } catch (err) {
      console.error('Failed to create invoice:', err)
      showToast('Failed to create invoice', 'error')
    }
  }

  const recordPayment = async () => {
    if (!staff?.business_id || !staff?.id || !selectedInvoice) return
    if (newPayment.amount <= 0) {
      showToast('Enter valid amount', 'error')
      return
    }

    try {
      // Create payment record
      const { data: payData, error: payError } = await supabase
        .from('payments')
        .insert({
          invoice_id: selectedInvoice.id,
          invoice_number: selectedInvoice.invoice_number,
          amount: newPayment.amount,
          method: newPayment.method,
          bank: newPayment.bank,
          reference: newPayment.reference,
          date: new Date().toISOString(),
          notes: newPayment.notes,
          staff_id: staff.id,
          business_id: staff.business_id,
        })
        .select()
        .single()

      if (payError) throw payError

      // Update invoice
      const newAmountPaid = selectedInvoice.amount_paid + newPayment.amount
      const newBalance = selectedInvoice.total - newAmountPaid
      const newStatus: InvoiceStatus = newBalance <= 0 ? 'paid' : 
        newAmountPaid > 0 ? 'partially_paid' : selectedInvoice.status

      await supabase
        .from('invoices')
        .update({
          amount_paid: newAmountPaid,
          balance: newBalance,
          status: newStatus,
        })
        .eq('id', selectedInvoice.id)

      setInvoices(prev => prev.map(inv =>
        inv.id === selectedInvoice.id
          ? { ...inv, amount_paid: newAmountPaid, balance: newBalance, status: newStatus }
          : inv
      ))
      setPayments(prev => [payData as Payment, ...prev])
      
      setShowRecordPayment(false)
      setNewPayment({ amount: 0, method: 'bank_transfer', bank: 'access', reference: '', notes: '' })
      
      showToast('Payment recorded!', 'success')
    } catch (err) {
      console.error('Failed to record payment:', err)
      showToast('Failed to record payment', 'error')
    }
  }

  const addInvoiceItem = () => {
    setNewInvoice(prev => ({
      ...prev,
      items: [...prev.items, { description: '', quantity: 1, unit_price: 0, total: 0 }],
    }))
  }

  const updateInvoiceItem = (index: number, field: keyof InvoiceItem, value: string | number) => {
    setNewInvoice(prev => {
      const items = prev.items.map((item, i) => {
        if (i !== index) return item
        const updated = { ...item, [field]: value }
        if (field === 'quantity' || field === 'unit_price') {
          updated.total = updated.quantity * updated.unit_price
        }
        return updated as InvoiceItem
      })
      return { ...prev, items }
    })
  }

  const removeInvoiceItem = (index: number) => {
    if (newInvoice.items.length === 1) return
    setNewInvoice(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }))
  }

  const filteredInvoices = invoices.filter(inv => {
    if (statusFilter !== 'all' && inv.status !== statusFilter) return false
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      return (
        inv.invoice_number.toLowerCase().includes(query) ||
        inv.client_name.toLowerCase().includes(query) ||
        inv.job_reference?.toLowerCase().includes(query)
      )
    }
    return true
  })

  // Stats
  const stats = {
    totalReceivable: invoices.reduce((sum, i) => sum + i.balance, 0),
    overdueAmount: invoices.filter(i => i.status === 'overdue').reduce((sum, i) => sum + i.balance, 0),
    totalPaid: invoices.reduce((sum, i) => sum + i.amount_paid, 0),
    thisMonth: payments
      .filter(p => new Date(p.date).getMonth() === new Date().getMonth())
      .reduce((sum, p) => sum + p.amount, 0),
  }

  const totals = calculateTotals(newInvoice.items, newInvoice.vat_rate, newInvoice.apply_wht)

  return (
    <div className="pb-20">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-medium">Finance & Invoicing</h1>
          <p className="text-sm text-black/50">Track invoices, payments, and cash flow</p>
        </div>
        <button
          onClick={() => setShowNewInvoice(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg avenize-gradient text-white text-sm font-medium"
        >
          <Plus size={16} />
          New Invoice
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-white rounded-xl border border-black/[0.06] p-4">
          <p className="text-xs text-black/50 mb-1">Total Receivable</p>
          <p className="text-xl font-bold text-[var(--avenize-primary)]">{formatCurrency(stats.totalReceivable)}</p>
        </div>
        <div className="bg-white rounded-xl border border-black/[0.06] p-4">
          <p className="text-xs text-black/50 mb-1">Overdue</p>
          <p className="text-xl font-bold text-red-600">{formatCurrency(stats.overdueAmount)}</p>
        </div>
        <div className="bg-white rounded-xl border border-black/[0.06] p-4">
          <p className="text-xs text-black/50 mb-1">Total Collected</p>
          <p className="text-xl font-bold text-green-600">{formatCurrency(stats.totalPaid)}</p>
        </div>
        <div className="bg-white rounded-xl border border-black/[0.06] p-4">
          <p className="text-xs text-black/50 mb-1">This Month</p>
          <p className="text-xl font-bold">{formatCurrency(stats.thisMonth)}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setActiveTab('invoices')}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${
            activeTab === 'invoices' ? 'avenize-gradient text-white' : 'bg-white border border-black/10'
          }`}
        >
          Invoices ({invoices.length})
        </button>
        <button
          onClick={() => setActiveTab('payments')}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${
            activeTab === 'payments' ? 'avenize-gradient text-white' : 'bg-white border border-black/10'
          }`}
        >
          Payments ({payments.length})
        </button>
      </div>

      {/* Filters */}
      {activeTab === 'invoices' && (
        <div className="flex flex-wrap gap-3 mb-4">
          <div className="flex-1 min-w-[200px] relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-black/30" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search invoices..."
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-black/10 text-sm bg-white"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as InvoiceStatus | 'all')}
            className="px-4 py-2.5 rounded-xl border border-black/10 text-sm bg-white"
          >
            <option value="all">All Status</option>
            {Object.entries(STATUS_LABELS).map(([key, { label }]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>
      )}

      {/* Invoices List */}
      {activeTab === 'invoices' && (
        loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-xl border border-black/[0.06] p-4 animate-pulse">
                <div className="h-5 bg-black/5 rounded w-1/3 mb-2" />
                <div className="h-4 bg-black/5 rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : filteredInvoices.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 rounded-2xl bg-[var(--avenize-primary)]/10 flex items-center justify-center mx-auto mb-4">
              <Receipt size={24} className="text-[var(--avenize-primary)]" />
            </div>
            <h3 className="font-semibold mb-2">No invoices found</h3>
            <p className="text-sm text-black/50 mb-4">Create your first invoice to get started</p>
            <button
              onClick={() => setShowNewInvoice(true)}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl avenize-gradient text-white font-medium"
            >
              <Plus size={16} />
              Create Invoice
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredInvoices.map((inv) => {
              const isOverdue = inv.status === 'overdue' || 
                (inv.status !== 'paid' && new Date(inv.due_date) < new Date())
              
              return (
                <div
                  key={inv.id}
                  onClick={() => setSelectedInvoice(inv)}
                  className="bg-white rounded-xl border border-black/[0.06] p-4 hover:border-[var(--avenize-primary)]/20 cursor-pointer transition-colors"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-mono text-black/40">{inv.invoice_number}</span>
                        {inv.is_proforma && (
                          <span className="px-2 py-0.5 rounded text-xs bg-yellow-100 text-yellow-700">
                            Proforma
                          </span>
                        )}
                      </div>
                      <h3 className="font-medium">{inv.client_name}</h3>
                      {inv.job_reference && (
                        <p className="text-xs text-black/50">{inv.job_reference}</p>
                      )}
                    </div>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      inv.status === 'paid' ? 'bg-green-100 text-green-700' :
                      inv.status === 'overdue' || isOverdue ? 'bg-red-100 text-red-700' :
                      inv.status === 'partially_paid' ? 'bg-yellow-100 text-yellow-700' :
                      inv.status === 'sent' ? 'bg-blue-100 text-blue-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {isOverdue && inv.status !== 'paid' ? 'Overdue' : STATUS_LABELS[inv.status].label}
                    </span>
                  </div>
                  
                  <div className="flex items-center justify-between pt-3 border-t border-black/5">
                    <div className="text-sm">
                      <span className="text-black/50">Due: </span>
                      <span className={isOverdue ? 'text-red-600 font-medium' : ''}>
                        {new Date(inv.due_date).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">{formatCurrency(inv.total)}</p>
                      {inv.amount_paid > 0 && (
                        <p className="text-xs text-black/50">
                          Paid: {formatCurrency(inv.amount_paid)} | Balance: {formatCurrency(inv.balance)}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )
      )}

      {/* Payments List */}
      {activeTab === 'payments' && (
        <div className="bg-white rounded-xl border border-black/[0.06] divide-y divide-black/5">
          {payments.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-black/50">No payments recorded yet</p>
            </div>
          ) : (
            payments.map((pay) => (
              <div key={pay.id} className="p-4 flex items-center gap-3">
                <span className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                  <CheckCircle2 size={14} className="text-green-600" />
                </span>
                <div className="flex-1">
                  <p className="font-medium">{formatCurrency(pay.amount)}</p>
                  <p className="text-xs text-black/50 flex items-center gap-1">
                    {METHOD_LABELS[pay.method].icon}
                    {METHOD_LABELS[pay.method].label}
                    {pay.reference && ` • ${pay.reference}`}
                  </p>
                </div>
                <div className="text-right">
                  {pay.invoice_number && (
                    <p className="text-xs text-black/50">{pay.invoice_number}</p>
                  )}
                  <p className="text-xs text-black/50">
                    {new Date(pay.date).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* New Invoice Modal */}
      {showNewInvoice && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-black/5">
              <h2 className="font-semibold">New Invoice</h2>
              <button onClick={() => setShowNewInvoice(false)} className="p-2 hover:bg-black/[0.05] rounded-lg">×</button>
            </div>
            
            <div className="p-4 space-y-4">
              {/* Client Info */}
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-sm font-medium mb-1">Client Name *</label>
                  <input
                    type="text"
                    value={newInvoice.client_name}
                    onChange={(e) => setNewInvoice(prev => ({ ...prev, client_name: e.target.value }))}
                    placeholder="Client or company name"
                    className="w-full px-4 py-2.5 rounded-xl border border-black/10 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Email</label>
                  <input
                    type="email"
                    value={newInvoice.client_email}
                    onChange={(e) => setNewInvoice(prev => ({ ...prev, client_email: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl border border-black/10 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Job Reference</label>
                  <input
                    type="text"
                    value={newInvoice.job_reference}
                    onChange={(e) => setNewInvoice(prev => ({ ...prev, job_reference: e.target.value }))}
                    placeholder="e.g., JOB-123456"
                    className="w-full px-4 py-2.5 rounded-xl border border-black/10 text-sm"
                  />
                </div>
              </div>

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={newInvoice.is_proforma}
                    onChange={(e) => setNewInvoice(prev => ({ ...prev, is_proforma: e.target.checked }))}
                    className="rounded"
                  />
                  <span className="text-sm">Proforma Invoice</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={newInvoice.apply_wht}
                    onChange={(e) => setNewInvoice(prev => ({ ...prev, apply_wht: e.target.checked }))}
                    className="rounded"
                  />
                  <span className="text-sm">Apply Withholding Tax (5%)</span>
                </label>
              </div>

              {/* Items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium">Items</label>
                  <button
                    type="button"
                    onClick={addInvoiceItem}
                    className="text-xs text-[var(--avenize-primary)] font-medium"
                  >
                    + Add Item
                  </button>
                </div>
                {newInvoice.items.map((item, index) => (
                  <div key={index} className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={item.description}
                      onChange={(e) => updateInvoiceItem(index, 'description', e.target.value)}
                      placeholder="Description"
                      className="flex-1 px-3 py-2 rounded-lg border border-black/10 text-sm"
                    />
                    <input
                      type="number"
                      value={item.quantity || ''}
                      onChange={(e) => updateInvoiceItem(index, 'quantity', Number(e.target.value))}
                      placeholder="Qty"
                      className="w-20 px-3 py-2 rounded-lg border border-black/10 text-sm"
                    />
                    <input
                      type="number"
                      value={item.unit_price || ''}
                      onChange={(e) => updateInvoiceItem(index, 'unit_price', Number(e.target.value))}
                      placeholder="₦0"
                      className="w-28 px-3 py-2 rounded-lg border border-black/10 text-sm"
                    />
                    {newInvoice.items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeInvoiceItem(index)}
                        className="p-2 text-red-500"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Totals */}
              <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Subtotal</span>
                  <span>{formatCurrency(totals.subtotal)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>VAT (7.5%)</span>
                  <span>{formatCurrency(totals.vatAmount)}</span>
                </div>
                {totals.whtAmount > 0 && (
                  <div className="flex justify-between text-sm text-red-600">
                    <span>WHT (-5%)</span>
                    <span>-{formatCurrency(totals.whtAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between font-semibold text-lg pt-2 border-t border-black/10">
                  <span>Total</span>
                  <span className="text-[var(--avenize-primary)]">{formatCurrency(totals.total)}</span>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowNewInvoice(false)}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-black/10 font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={createInvoice}
                  className="flex-1 px-4 py-2.5 rounded-xl avenize-gradient text-white font-medium"
                >
                  Create Invoice
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Record Payment Modal */}
      {showRecordPayment && selectedInvoice && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b border-black/5">
              <h2 className="font-semibold">Record Payment</h2>
              <button onClick={() => setShowRecordPayment(false)} className="p-2 hover:bg-black/[0.05] rounded-lg">×</button>
            </div>
            
            <div className="p-4 space-y-4">
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="font-medium">{selectedInvoice.client_name}</p>
                <p className="text-sm text-black/50">{selectedInvoice.invoice_number}</p>
                <p className="text-sm mt-2">
                  Balance Due: <span className="font-semibold text-[var(--avenize-primary)]">{formatCurrency(selectedInvoice.balance)}</span>
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Amount (₦)</label>
                <input
                  type="number"
                  value={newPayment.amount || ''}
                  onChange={(e) => setNewPayment(prev => ({ ...prev, amount: Number(e.target.value) }))}
                  placeholder="0"
                  className="w-full px-4 py-2.5 rounded-xl border border-black/10 text-sm"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Payment Method</label>
                <select
                  value={newPayment.method}
                  onChange={(e) => setNewPayment(prev => ({ ...prev, method: e.target.value as PaymentMethod }))}
                  className="w-full px-4 py-2.5 rounded-xl border border-black/10 text-sm"
                >
                  {Object.entries(METHOD_LABELS).map(([key, { label }]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>

              {newPayment.method === 'bank_transfer' && (
                <div>
                  <label className="block text-sm font-medium mb-1">Bank</label>
                  <select
                    value={newPayment.bank}
                    onChange={(e) => setNewPayment(prev => ({ ...prev, bank: e.target.value as PaymentBank }))}
                    className="w-full px-4 py-2.5 rounded-xl border border-black/10 text-sm"
                  >
                    <option value="access">Access Bank</option>
                    <option value="gtbank">GTBank</option>
                    <option value="uba">UBA</option>
                    <option value="first_bank">First Bank</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              )}
              
              <div>
                <label className="block text-sm font-medium mb-1">Reference / Receipt No.</label>
                <input
                  type="text"
                  value={newPayment.reference}
                  onChange={(e) => setNewPayment(prev => ({ ...prev, reference: e.target.value }))}
                  placeholder="e.g., Receipt # or Transfer reference"
                  className="w-full px-4 py-2.5 rounded-xl border border-black/10 text-sm"
                />
              </div>
              
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowRecordPayment(false)}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-black/10 font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={recordPayment}
                  className="flex-1 px-4 py-2.5 rounded-xl avenize-gradient text-white font-medium"
                >
                  Record Payment
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Invoice Detail Modal */}
      {selectedInvoice && !showRecordPayment && (
        <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 pt-12 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-2xl mb-8">
            <div className="flex items-center justify-between p-4 border-b border-black/5">
              <div>
                <span className="text-xs font-mono text-black/40">{selectedInvoice.invoice_number}</span>
                <h2 className="font-semibold text-lg">{selectedInvoice.client_name}</h2>
              </div>
              <button
                onClick={() => setSelectedInvoice(null)}
                className="p-2 hover:bg-black/[0.05] rounded-lg"
              >
                ×
              </button>
            </div>

            <div className="p-4">
              {/* Items */}
              <div className="mb-4">
                <h3 className="font-medium mb-2">Items</h3>
                <div className="border rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left p-3">Description</th>
                        <th className="text-right p-3">Qty</th>
                        <th className="text-right p-3">Price</th>
                        <th className="text-right p-3">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedInvoice.items.map((item, i) => (
                        <tr key={i} className="border-t">
                          <td className="p-3">{item.description}</td>
                          <td className="p-3 text-right">{item.quantity}</td>
                          <td className="p-3 text-right">{formatCurrency(item.unit_price)}</td>
                          <td className="p-3 text-right">{formatCurrency(item.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Totals */}
              <div className="bg-gray-50 rounded-xl p-4 mb-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Subtotal</span>
                  <span>{formatCurrency(selectedInvoice.subtotal)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>VAT ({selectedInvoice.vat_rate * 100}%)</span>
                  <span>{formatCurrency(selectedInvoice.vat_amount)}</span>
                </div>
                {selectedInvoice.wht_amount > 0 && (
                  <div className="flex justify-between text-sm text-red-600">
                    <span>WHT ({(selectedInvoice.wht_rate || 0) * 100}%)</span>
                    <span>-{formatCurrency(selectedInvoice.wht_amount)}</span>
                  </div>
                )}
                <div className="flex justify-between font-semibold text-lg pt-2 border-t border-black/10">
                  <span>Total</span>
                  <span>{formatCurrency(selectedInvoice.total)}</span>
                </div>
                <div className="flex justify-between text-sm text-green-600">
                  <span>Paid</span>
                  <span>{formatCurrency(selectedInvoice.amount_paid)}</span>
                </div>
                <div className="flex justify-between font-semibold text-red-600">
                  <span>Balance</span>
                  <span>{formatCurrency(selectedInvoice.balance)}</span>
                </div>
              </div>

              {/* Actions */}
              {selectedInvoice.balance > 0 && (
                <button
                  onClick={() => setShowRecordPayment(true)}
                  className="w-full px-4 py-3 rounded-xl avenize-gradient text-white font-medium"
                >
                  Record Payment
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

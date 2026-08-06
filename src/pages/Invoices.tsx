// ============================================
// INVOICES PAGE - Nigerian Business
// Full invoice lifecycle: create → send → pay → reconcile
// ============================================

import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../components/Toast'
import { generateInvoicePDF } from '../lib/PDFGenerator'
import LoadingSkeleton from '../components/LoadingSkeleton'
import {
  Plus, Search, Download, Send, CheckCircle2, Clock,
  AlertCircle, X, ChevronRight, Loader2, Eye,
  FileText, DollarSign, Calendar, User, Phone, Mail,
  MapPin, Edit3, Trash2, Copy, ExternalLink, CreditCard
} from 'lucide-react'

type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'partially_paid' | 'overdue' | 'cancelled'

interface Invoice {
  id: string
  invoice_number: string
  client_name: string
  client_email: string | null
  client_address: string | null
  subtotal: number
  vat_amount: number
  total: number
  amount_paid: number
  balance: number
  status: InvoiceStatus
  issue_date: string
  due_date: string
  items: { description: string; quantity: number; unit_price: number; total: number }[]
  notes?: string
  created_at: string
}

interface InvoiceItem {
  description: string
  quantity: number
  unit_price: number
  total: number
}

const STATUS_CONFIG: Record<InvoiceStatus, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  draft: { label: 'Draft', color: 'text-gray-500', bg: 'bg-gray-50 border-gray-200', icon: <Edit3 size={12} /> },
  sent: { label: 'Sent', color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200', icon: <Send size={12} /> },
  partially_paid: { label: 'Partial', color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200', icon: <Clock size={12} /> },
  paid: { label: 'Paid', color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200', icon: <CheckCircle2 size={12} /> },
  overdue: { label: 'Overdue', color: 'text-red-600', bg: 'bg-red-50 border-red-200', icon: <AlertCircle size={12} /> },
  cancelled: { label: 'Cancelled', color: 'text-gray-400', bg: 'bg-gray-50 border-gray-200', icon: <X size={12} /> },
}

const DEMO_INVOICES: Invoice[] = [
  {
    id: '1', invoice_number: 'INV-2026-001', client_name: 'Riverside Construction Ltd', client_email: 'accounts@riverside.ng', client_address: '15 Admiralty Way, Lekki Phase 1, Lagos',
    subtotal: 2500000, vat_amount: 187500, total: 2687500, amount_paid: 2687500, balance: 0,
    status: 'paid', issue_date: '2026-07-01', due_date: '2026-07-15',
    items: [{ description: 'CRM Enterprise License (Annual Subscription)', quantity: 1, unit_price: 2500000, total: 2500000 }],
    created_at: new Date(Date.now() - 2592000000).toISOString(),
  },
  {
    id: '2', invoice_number: 'INV-2026-002', client_name: 'StyleBox Fashion', client_email: 'finance@stylebox.ng', client_address: '24 Awolowo Road, Ikoyi, Lagos',
    subtotal: 150000, vat_amount: 11250, total: 161250, amount_paid: 0, balance: 161250,
    status: 'overdue', issue_date: '2026-07-10', due_date: '2026-07-25',
    items: [{ description: 'Software Setup & Configuration', quantity: 1, unit_price: 150000, total: 150000 }],
    created_at: new Date(Date.now() - 1728000000).toISOString(),
  },
  {
    id: '3', invoice_number: 'INV-2026-003', client_name: 'EduFirst Schools', client_email: 'admin@edufirst.ng', client_address: '8 Alfred Rewane Road, Ikoyi, Lagos',
    subtotal: 850000, vat_amount: 63750, total: 913750, amount_paid: 500000, balance: 413750,
    status: 'partially_paid', issue_date: '2026-07-05', due_date: '2026-07-20',
    items: [
      { description: 'HR Software License (Annual)', quantity: 1, unit_price: 600000, total: 600000 },
      { description: 'Implementation & Setup', quantity: 1, unit_price: 250000, total: 250000 },
    ],
    created_at: new Date(Date.now() - 2592000000).toISOString(),
  },
  {
    id: '4', invoice_number: 'INV-2026-004', client_name: 'Alhaji Motors', client_email: 'procurement@alhajimotors.ng', client_address: '42 Oshodi-Apapa Expressway, Lagos',
    subtotal: 3200000, vat_amount: 240000, total: 3440000, amount_paid: 0, balance: 3440000,
    status: 'sent', issue_date: new Date().toISOString().split('T')[0], due_date: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
    items: [
      { description: 'Fleet Management System — Annual', quantity: 1, unit_price: 2000000, total: 2000000 },
      { description: 'GPS Tracking Setup (10 vehicles)', quantity: 1, unit_price: 1200000, total: 1200000 },
    ],
    created_at: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: '5', invoice_number: 'INV-2026-005', client_name: 'Nexus Finance Ltd', client_email: 'ops@nexusfinance.ng', client_address: '23 Bourdillon Road, Ikoyi, Lagos',
    subtotal: 450000, vat_amount: 33750, total: 483750, amount_paid: 0, balance: 483750,
    status: 'draft', issue_date: new Date().toISOString().split('T')[0], due_date: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
    items: [
      { description: 'Generator Maintenance Contract — Q3', quantity: 1, unit_price: 300000, total: 300000 },
      { description: 'Emergency Call-out Service', quantity: 1, unit_price: 150000, total: 150000 },
    ],
    created_at: new Date().toISOString(),
  },
]

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 0 }).format(amount)

const formatDate = (dateStr: string) =>
  new Date(dateStr).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return `${days}d ago`
}

// ============================================
// MAIN COMPONENT
// ============================================
export default function Invoices() {
  const { staff, isDemo } = useAuth()
  const businessId = staff?.business_id
  const { showToast } = useToast()

  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | 'all'>('all')
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showDetailPanel, setShowDetailPanel] = useState(false)
  const [paying, setPaying] = useState(false)
  const [savingPayment, setSavingPayment] = useState(false)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [quoteData, setQuoteData] = useState<any>(null)

  useEffect(() => {
    // Check for quote-to-invoice conversion data
    const quoteStr = sessionStorage.getItem('avenize_quote_to_invoice')
    if (quoteStr) {
      try {
        const data = JSON.parse(quoteStr)
        setQuoteData(data)
        setShowCreateModal(true)
        sessionStorage.removeItem('avenize_quote_to_invoice')
      } catch (e) {
        // ignore
      }
    }
    loadInvoices()
  }, [businessId, isDemo])

  const loadInvoices = async () => {
    if (isDemo) {
      setInvoices(DEMO_INVOICES)
      setLoading(false)
      return
    }
    if (!businessId) return
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .eq('business_id', businessId)
        .order('created_at', { ascending: false })
      if (error) throw error
      // Parse items JSON if stored as string
      const parsed = (data || []).map((inv: any) => ({
        ...inv,
        items: typeof inv.items === 'string' ? JSON.parse(inv.items) : (inv.items || []),
      }))
      setInvoices(parsed)
    } catch (err) {
      console.error('Error loading invoices:', err)
      showToast('Failed to load invoices', 'error')
      setInvoices(DEMO_INVOICES)
    }
    setLoading(false)
  }

  const stats = {
    total: invoices.length,
    draft: invoices.filter(i => i.status === 'draft').length,
    outstanding: invoices.filter(i => ['sent', 'partially_paid', 'overdue'].includes(i.status)),
    paid: invoices.filter(i => i.status === 'paid').length,
    totalOutstanding: invoices.filter(i => ['sent', 'partially_paid', 'overdue'].includes(i.status))
      .reduce((sum, i) => sum + i.balance, 0),
    totalPaid: invoices.filter(i => i.status === 'paid')
      .reduce((sum, i) => sum + i.total, 0),
  }

  const filtered = invoices.filter(inv => {
    if (statusFilter !== 'all' && inv.status !== statusFilter) return false
    if (search && !inv.invoice_number.toLowerCase().includes(search.toLowerCase()) &&
        !inv.client_name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const handleCreateInvoice = async (data: any) => {
    const subtotal = data.items.reduce((s: number, item: any) => s + item.unit_price * item.quantity, 0)
    const vat = subtotal * 0.075
    const total = subtotal + vat
    const inv: Invoice = {
      id: crypto.randomUUID(),
      invoice_number: `INV-${new Date().getFullYear()}-${String(invoices.length + 1).padStart(3, '0')}`,
      client_name: data.client_name,
      client_email: data.client_email || null,
      client_address: data.client_address || null,
      subtotal, vat_amount: vat, total,
      amount_paid: 0, balance: total,
      status: 'draft',
      issue_date: new Date().toISOString().split('T')[0],
      due_date: data.due_date || new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
      items: data.items,
      notes: data.notes,
      created_at: new Date().toISOString(),
    }
    if (isDemo) {
      setInvoices([inv, ...invoices])
      setShowCreateModal(false)
      showToast('Invoice created', 'success')
      return
    }
    try {
      const { error } = await supabase.from('invoices').insert({ ...inv, business_id: businessId, items: JSON.stringify(inv.items) })
      if (error) throw error
      await loadInvoices()
      setShowCreateModal(false)
      showToast('Invoice created', 'success')
    } catch (err) {
      showToast('Failed to create invoice', 'error')
    }
  }

  const handlePayInvoice = async (inv: Invoice) => {
    setSelectedInvoice(inv)
    setPaymentAmount(String(inv.balance))
    setShowDetailPanel(true)
  }

  const handleRecordPayment = async () => {
    if (!selectedInvoice || !paymentAmount) return
    setSavingPayment(true)
    const paid = parseFloat(paymentAmount)
    if (isDemo) {
      const newPaid = selectedInvoice.amount_paid + paid
      const updated = invoices.map(inv => inv.id === selectedInvoice.id ? {
        ...inv,
        amount_paid: newPaid,
        balance: inv.total - newPaid,
        status: newPaid >= inv.total ? 'paid' as InvoiceStatus : 'partially_paid' as InvoiceStatus,
      } : inv)
      setInvoices(updated)
      setShowDetailPanel(false)
      setSavingPayment(false)
      showToast(`Payment of ${formatCurrency(paid)} recorded`, 'success')
      return
    }
    try {
      const newPaid = selectedInvoice.amount_paid + paid
      const newStatus = newPaid >= selectedInvoice.total ? 'paid' : 'partially_paid'
      const { error } = await supabase.from('invoices').update({
        amount_paid: newPaid,
        balance: selectedInvoice.total - newPaid,
        status: newStatus,
      }).eq('id', selectedInvoice.id)
      if (error) throw error
      await loadInvoices()
      setShowDetailPanel(false)
      showToast(`Payment of ${formatCurrency(paid)} recorded`, 'success')
    } catch (err) {
      showToast('Failed to record payment', 'error')
    }
    setSavingPayment(false)
  }

  const handleSendInvoice = async (inv: Invoice) => {
    if (isDemo) {
      setInvoices(invoices.map(i => i.id === inv.id ? { ...i, status: 'sent' as InvoiceStatus } : i))
      showToast('Invoice sent to client', 'success')
      return
    }
    const { error } = await supabase.from('invoices').update({ status: 'sent' }).eq('id', inv.id)
    if (error) { showToast('Failed to send invoice', 'error'); return }
    await loadInvoices()
    showToast('Invoice sent', 'success')
  }

  const handleDownloadPDF = async (inv: Invoice) => {
    const items = inv.items.map(item => ({
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unit_price,
      total: item.total,
    }))
    generateInvoicePDF({
      invoice_number: inv.invoice_number,
      client_name: inv.client_name,
      client_email: inv.client_email || undefined,
      client_address: inv.client_address || undefined,
      items,
      subtotal: inv.subtotal,
      vat_amount: inv.vat_amount,
      total: inv.total,
      issue_date: inv.issue_date,
      due_date: inv.due_date,
      status: inv.status,
      notes: inv.notes,
      business_name: 'Your Business Name',
    })
    showToast('PDF downloaded', 'success')
  }

  const handleCopyInvoiceLink = (inv: Invoice) => {
    const link = `${window.location.origin}/app/invoices/${inv.id}/pay`
    navigator.clipboard.writeText(link).then(() => showToast('Invoice link copied!', 'success'))
  }

  const handlePaystackPayment = async (inv: Invoice) => {
    if (!inv.client_email) {
      showToast('Client email required for online payment', 'error')
      return
    }
    setPaying(true)

    // Use Paystack inline payment (requires VITE_PAYSTACK_PUBLIC_KEY to be set)
    const key = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY
    if (!key || key === 'pk_test_xxxxx') {
      // Demo mode: simulate payment
      setTimeout(() => {
        setPaying(false)
        showToast('Demo mode: Payment link would open Paystack checkout', 'info')
      }, 1000)
      return
    }

    // Build Paystack payment URL with invoice details
    const ref = `INV-${inv.invoice_number}-${Date.now()}`
    const amountInKobo = Math.round(inv.balance * 100)
    const paystackUrl = `https://checkout.paystack.com/${key}?email=${encodeURIComponent(inv.client_email)}&amount=${amountInKobo}&currency=NGN&reference=${ref}&metadata=${encodeURIComponent(JSON.stringify({ invoice_id: inv.id, invoice_number: inv.invoice_number }))}`
    window.open(paystackUrl, '_blank', 'width=600,height=700')
    setPaying(false)
  }

  return (
    <div className="pb-20">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[var(--avenize-black)]">Invoices</h1>
          <p className="text-sm text-black/50">Create, send & track client payments</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#111111] text-white text-sm font-medium hover:bg-black/80 transition"
        >
          <Plus size={16} /> New Invoice
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-2 mb-5">
        {[
          { label: 'Outstanding', value: formatCurrency(stats.totalOutstanding), color: 'text-red-600', sub: `${stats.outstanding.length} invoices` },
          { label: 'Collected', value: formatCurrency(stats.totalPaid), color: 'text-emerald-600', sub: `${stats.paid} paid` },
          { label: 'Draft', value: stats.draft, color: 'text-gray-500', sub: 'not sent' },
          { label: 'Total', value: stats.total, color: 'text-black', sub: 'all time' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-black/6 p-3">
            <div className={`text-[18px] font-semibold ${s.color}`}>{s.value}</div>
            <div className="text-xs text-black/40 mt-0.5">{s.label} <span className="text-black/20">· {s.sub}</span></div>
          </div>
        ))}
      </div>

      {/* Search + Filter */}
      <div className="flex gap-2 mb-4">
        <div className="flex-1 relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-black/30" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search invoices, client..."
            className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-white border border-black/6 text-sm focus:outline-none focus:border-black/20" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)}
          className="px-3 py-2.5 rounded-xl bg-white border border-black/6 text-sm focus:outline-none">
          <option value="all">All Status</option>
          <option value="draft">Draft</option>
          <option value="sent">Sent</option>
          <option value="paid">Paid</option>
          <option value="partially_paid">Partial</option>
          <option value="overdue">Overdue</option>
        </select>
      </div>

      {/* Invoice List */}
      {loading ? (
        <LoadingSkeleton type="card" count={5} />
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-2xl bg-black/5 flex items-center justify-center mx-auto mb-4">
            <FileText size={24} className="text-black/20" />
          </div>
          <p className="text-black/40 text-sm">{search ? 'No invoices match your search' : 'No invoices yet'}</p>
          {!search && (
            <button onClick={() => setShowCreateModal(true)} className="mt-3 px-4 py-2 rounded-xl bg-[#111111] text-white text-sm font-medium">
              Create your first invoice
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(inv => {
            const cfg = STATUS_CONFIG[inv.status]
            return (
              <div key={inv.id}
                className="bg-white rounded-2xl border border-black/6 p-4 hover:border-black/12 hover:shadow-sm transition cursor-pointer"
                onClick={() => { setSelectedInvoice(inv); setShowDetailPanel(true) }}>
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-semibold text-[var(--avenize-black)]">{inv.invoice_number}</span>
                      <span className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium border ${cfg.bg} ${cfg.color}`}>
                        {cfg.icon} {cfg.label}
                      </span>
                    </div>
                    <p className="text-sm text-black/60">{inv.client_name}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-base font-semibold text-[var(--avenize-black)]">{formatCurrency(inv.total)}</p>
                    {inv.balance > 0 && inv.status !== 'draft' && (
                      <p className="text-xs text-red-500">{formatCurrency(inv.balance)} outstanding</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 text-xs text-black/40">
                    <span>Issued {formatDate(inv.issue_date)}</span>
                    <span>Due {formatDate(inv.due_date)}</span>
                    <span>{inv.items.length} item{inv.items.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={e => { e.stopPropagation(); handleDownloadPDF(inv) }}
                      className="p-1.5 rounded-lg hover:bg-black/5 transition" title="Download PDF">
                      <Download size={14} className="text-black/30" />
                    </button>
                    <button onClick={e => { e.stopPropagation(); handleCopyInvoiceLink(inv) }}
                      className="p-1.5 rounded-lg hover:bg-black/5 transition" title="Copy invoice link">
                      <Copy size={14} className="text-black/30" />
                    </button>
                    {inv.status === 'draft' && (
                      <button onClick={e => { e.stopPropagation(); handleSendInvoice(inv) }}
                        className="p-1.5 rounded-lg hover:bg-black/5 transition" title="Send invoice">
                        <Send size={14} className="text-black/30" />
                      </button>
                    )}
                    {['sent', 'partially_paid', 'overdue'].includes(inv.status) && (
                      <button onClick={e => { e.stopPropagation(); handlePaystackPayment(inv) }}
                        className="p-1.5 rounded-lg hover:bg-black/5 transition" title="Payment link">
                        <CreditCard size={14} className="text-black/30" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Invoice Detail Panel */}
      {showDetailPanel && selectedInvoice && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setShowDetailPanel(false)}>
          <div className="absolute inset-0 bg-black/20" />
          <div className="relative w-full max-w-lg bg-white h-full overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-black/6 p-4 flex items-center justify-between z-10">
              <div>
                <h2 className="text-base font-semibold">{selectedInvoice.invoice_number}</h2>
                <p className="text-xs text-black/40">{selectedInvoice.client_name}</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => handleDownloadPDF(selectedInvoice)}
                  className="p-2 rounded-xl bg-black/5 hover:bg-black/10 transition" title="Download PDF">
                  <Download size={16} />
                </button>
                <button onClick={() => setShowDetailPanel(false)}
                  className="w-8 h-8 rounded-xl bg-black/5 flex items-center justify-center hover:bg-black/10 transition">
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="p-4 space-y-5">
              {/* Status */}
              <div className="flex items-center justify-between">
                <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium border ${STATUS_CONFIG[selectedInvoice.status].bg} ${STATUS_CONFIG[selectedInvoice.status].color}`}>
                  {STATUS_CONFIG[selectedInvoice.status].icon} {STATUS_CONFIG[selectedInvoice.status].label}
                </span>
                <span className="text-xs text-black/30">{timeAgo(selectedInvoice.created_at)}</span>
              </div>

              {/* Amount */}
              <div className="bg-[#111111] rounded-2xl p-5 text-white">
                <p className="text-xs text-[#A8A8A8] mb-1">Total Amount</p>
                <p className="text-3xl font-semibold mb-3">{formatCurrency(selectedInvoice.total)}</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-[#A8A8A8]">Paid</p>
                    <p className="text-sm font-medium text-emerald-400">{formatCurrency(selectedInvoice.amount_paid)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[#A8A8A8]">Balance</p>
                    <p className={`text-sm font-medium ${selectedInvoice.balance > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                      {formatCurrency(selectedInvoice.balance)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Quick Actions */}
              {selectedInvoice.status === 'draft' && (
                <div className="flex gap-2">
                  <button onClick={() => handleSendInvoice(selectedInvoice)}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition">
                    <Send size={14} /> Send Invoice
                  </button>
                </div>
              )}
              {['sent', 'partially_paid', 'overdue'].includes(selectedInvoice.status) && selectedInvoice.balance > 0 && (
                <div className="flex gap-2">
                  <button onClick={() => handlePaystackPayment(selectedInvoice)} disabled={paying}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition disabled:opacity-50">
                    <CreditCard size={14} /> {paying ? 'Opening Paystack...' : 'Pay Online'}
                  </button>
                  <button onClick={() => handleCopyInvoiceLink(selectedInvoice)}
                    className="px-3 py-2.5 rounded-xl border border-black/10 text-sm hover:bg-black/5 transition">
                    <Copy size={14} />
                  </button>
                </div>
              )}

              {/* Record Payment */}
              {['sent', 'partially_paid', 'overdue'].includes(selectedInvoice.status) && selectedInvoice.balance > 0 && (
                <div className="border border-black/6 rounded-2xl p-4">
                  <h3 className="text-sm font-semibold mb-3">Record Manual Payment</h3>
                  <div className="flex gap-2">
                    <input type="number" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)}
                      placeholder={`Amount (max ${formatCurrency(selectedInvoice.balance)})`}
                      className="flex-1 px-3 py-2 rounded-xl bg-black/[0.03] border border-black/6 text-sm focus:outline-none focus:border-black/20" />
                    <button onClick={handleRecordPayment} disabled={savingPayment}
                      className="px-4 py-2 rounded-xl bg-[#111111] text-white text-sm font-medium hover:bg-black/80 disabled:opacity-50 transition flex items-center gap-2">
                      {savingPayment ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                      Record
                    </button>
                  </div>
                </div>
              )}

              {/* Client Info */}
              <div className="bg-black/[0.03] rounded-2xl p-4 space-y-2">
                <h3 className="text-xs font-semibold text-black/40 uppercase tracking-wide mb-2">Client</h3>
                <div className="flex items-center gap-2 text-sm"><User size={14} className="text-black/30" />{selectedInvoice.client_name}</div>
                {selectedInvoice.client_email && <a href={`mailto:${selectedInvoice.client_email}`} className="flex items-center gap-2 text-sm text-blue-600"><Mail size={14} />{selectedInvoice.client_email}</a>}
                {selectedInvoice.client_address && <div className="flex items-start gap-2 text-sm text-black/60"><MapPin size={14} className="shrink-0 mt-0.5" />{selectedInvoice.client_address}</div>}
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-black/[0.03] rounded-xl p-3">
                  <div className="text-xs text-black/40 mb-1">Issue Date</div>
                  <div className="text-sm font-medium">{formatDate(selectedInvoice.issue_date)}</div>
                </div>
                <div className="bg-black/[0.03] rounded-xl p-3">
                  <div className="text-xs text-black/40 mb-1">Due Date</div>
                  <div className={`text-sm font-medium ${selectedInvoice.status === 'overdue' ? 'text-red-600' : ''}`}>{formatDate(selectedInvoice.due_date)}</div>
                </div>
              </div>

              {/* Line Items */}
              <div>
                <h3 className="text-xs font-semibold text-black/40 uppercase tracking-wide mb-3">Items</h3>
                <div className="space-y-2">
                  {selectedInvoice.items.map((item, i) => (
                    <div key={i} className="flex items-start justify-between py-2 border-b border-black/6 last:border-0">
                      <div className="flex-1">
                        <p className="text-sm text-[var(--avenize-black)]">{item.description}</p>
                        <p className="text-xs text-black/40">{item.quantity} × {formatCurrency(item.unit_price)}</p>
                      </div>
                      <p className="text-sm font-medium ml-4">{formatCurrency(item.total)}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Totals */}
              <div className="space-y-2 border-t border-black/6 pt-3">
                <div className="flex justify-between text-sm"><span className="text-black/50">Subtotal</span><span className="font-medium">{formatCurrency(selectedInvoice.subtotal)}</span></div>
                <div className="flex justify-between text-sm"><span className="text-black/50">VAT (7.5%)</span><span className="font-medium">{formatCurrency(selectedInvoice.vat_amount)}</span></div>
                <div className="flex justify-between text-base font-semibold border-t border-black/10 pt-2 mt-2"><span>Total</span><span>{formatCurrency(selectedInvoice.total)}</span></div>
                {selectedInvoice.amount_paid > 0 && (
                  <div className="flex justify-between text-sm text-emerald-600"><span>Amount Paid</span><span>-{formatCurrency(selectedInvoice.amount_paid)}</span></div>
                )}
                {selectedInvoice.balance > 0 && (
                  <div className="flex justify-between text-base font-semibold text-red-600 border-t border-black/10 pt-2"><span>Balance Due</span><span>{formatCurrency(selectedInvoice.balance)}</span></div>
                )}
              </div>

              {selectedInvoice.notes && (
                <div className="bg-amber-50 rounded-xl p-3 border border-amber-100">
                  <p className="text-xs font-semibold text-amber-700 mb-1">Notes</p>
                  <p className="text-sm text-amber-700">{selectedInvoice.notes}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create Invoice Modal */}
      {showCreateModal && (
        <CreateInvoiceModal
          onClose={() => { setShowCreateModal(false); setQuoteData(null) }}
          onCreate={handleCreateInvoice}
          quoteData={quoteData}
        />
      )}
    </div>
  )
}

// ============================================
// CREATE INVOICE MODAL
// ============================================
function CreateInvoiceModal({ onClose, onCreate, quoteData }: {
  onClose: () => void
  onCreate: (data: any) => void
  quoteData?: { client_name: string; client_email: string; client_address: string; items: any[]; notes: string } | null
}) {
  const [clientName, setClientName] = useState(quoteData?.client_name || '')
  const [clientEmail, setClientEmail] = useState(quoteData?.client_email || '')
  const [clientAddress, setClientAddress] = useState(quoteData?.client_address || '')
  const [dueDate, setDueDate] = useState('')
  const [notes, setNotes] = useState(quoteData?.notes || '')
  const [items, setItems] = useState<InvoiceItem[]>(
    quoteData?.items?.length
      ? quoteData.items.map((item: any) => ({ ...item }))
      : [{ description: '', quantity: 1, unit_price: 0, total: 0 }]
  )
  const isFromQuote = !!quoteData

  const updateItem = (i: number, field: keyof InvoiceItem, value: string | number) => {
    setItems(items.map((item, idx) => {
      if (idx !== i) return item
      const updated = { ...item, [field]: value }
      if (field === 'quantity' || field === 'unit_price') {
        updated.total = updated.quantity * updated.unit_price
      }
      return updated
    }))
  }

  const addItem = () => setItems([...items, { description: '', quantity: 1, unit_price: 0, total: 0 }])

  const removeItem = (i: number) => setItems(items.filter((_, idx) => idx !== i))

  const subtotal = items.reduce((s, i) => s + i.total, 0)
  const vat = subtotal * 0.075
  const total = subtotal + vat

  const handleSubmit = () => {
    if (!clientName.trim() || items.every(i => !i.description.trim())) {
      return
    }
    onCreate({ client_name: clientName, client_email: clientEmail, client_address: clientAddress, due_date: dueDate, notes, items })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-black/6 p-4 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">{isFromQuote ? 'Create Invoice from Quote' : 'New Invoice'}</h2>
            {isFromQuote && <p className="text-xs text-purple-600 mt-0.5">All fields pre-filled from your accepted quote</p>}
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-black/5 flex items-center justify-center hover:bg-black/10">
            <X size={16} />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-black/50 mb-1.5">Client Name *</label>
              <input value={clientName} onChange={e => setClientName(e.target.value)} placeholder="e.g. Riverside Construction Ltd"
                className="w-full px-3 py-2.5 rounded-xl bg-black/[0.03] border border-black/6 text-sm focus:outline-none focus:border-black/20" />
            </div>
            <div>
              <label className="block text-xs font-medium text-black/50 mb-1.5">Client Email</label>
              <input type="email" value={clientEmail} onChange={e => setClientEmail(e.target.value)} placeholder="accounts@client.com"
                className="w-full px-3 py-2.5 rounded-xl bg-black/[0.03] border border-black/6 text-sm focus:outline-none focus:border-black/20" />
            </div>
            <div>
              <label className="block text-xs font-medium text-black/50 mb-1.5">Due Date</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-black/[0.03] border border-black/6 text-sm focus:outline-none focus:border-black/20" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-black/50 mb-1.5">Client Address</label>
              <input value={clientAddress} onChange={e => setClientAddress(e.target.value)} placeholder="Client billing address"
                className="w-full px-3 py-2.5 rounded-xl bg-black/[0.03] border border-black/6 text-sm focus:outline-none focus:border-black/20" />
            </div>
          </div>

          {/* Line Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-black/40 uppercase tracking-wide">Line Items</label>
              <button onClick={addItem} className="text-xs text-blue-600 hover:text-blue-700 font-medium">+ Add item</button>
            </div>
            <div className="space-y-2">
              {items.map((item, i) => (
                <div key={i} className="bg-black/[0.02] rounded-xl p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <input value={item.description} onChange={e => updateItem(i, 'description', e.target.value)}
                      placeholder="Description of service or product"
                      className="flex-1 px-3 py-2 rounded-lg bg-white border border-black/6 text-sm focus:outline-none focus:border-black/20" />
                    {items.length > 1 && (
                      <button onClick={() => removeItem(i)} className="p-1.5 rounded-lg hover:bg-black/10 text-black/30">
                        <X size={14} />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-black/30 uppercase">Qty</label>
                      <input type="number" value={item.quantity} onChange={e => updateItem(i, 'quantity', parseFloat(e.target.value) || 0)}
                        min="1" className="w-full px-3 py-1.5 rounded-lg bg-white border border-black/6 text-sm focus:outline-none" />
                    </div>
                    <div>
                      <label className="text-[10px] text-black/30 uppercase">Unit Price (₦)</label>
                      <input type="number" value={item.unit_price} onChange={e => updateItem(i, 'unit_price', parseFloat(e.target.value) || 0)}
                        min="0" className="w-full px-3 py-1.5 rounded-lg bg-white border border-black/6 text-sm focus:outline-none" />
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-black/40">Total: </span>
                    <span className="text-sm font-medium">{formatCurrency(item.total)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Totals */}
          <div className="space-y-1 border-t border-black/6 pt-3">
            <div className="flex justify-between text-sm text-black/50"><span>Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
            <div className="flex justify-between text-sm text-black/50"><span>VAT (7.5%)</span><span>{formatCurrency(vat)}</span></div>
            <div className="flex justify-between text-base font-semibold border-t border-black/10 pt-2"><span>Total</span><span>{formatCurrency(total)}</span></div>
          </div>

          <div>
            <label className="block text-xs font-medium text-black/50 mb-1.5">Notes (optional)</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Payment terms, bank details..."
              className="w-full px-3 py-2.5 rounded-xl bg-black/[0.03] border border-black/6 text-sm focus:outline-none focus:border-black/20 resize-none" />
          </div>
        </div>
        <div className="sticky bottom-0 bg-white border-t border-black/6 p-4 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-black/10 text-sm font-medium hover:bg-black/5 transition">Cancel</button>
          <button onClick={handleSubmit}
            disabled={!clientName.trim() || items.every(i => !i.description.trim())}
            className="flex-1 py-2.5 rounded-xl bg-[#111111] text-white text-sm font-medium hover:bg-black/80 disabled:opacity-40 transition">
            Create Invoice
          </button>
        </div>
      </div>
    </div>
  )
}

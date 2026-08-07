import { useState, useEffect } from 'react'
import {
  Receipt, Plus, DollarSign, Clock, CheckCircle, XCircle,
  Upload, FileText, Image, RefreshCw, Filter, ChevronDown,
  Eye, Edit2, Trash2, CreditCard
} from 'lucide-react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'

interface ExpenseCategory {
  id: string
  name: string
  code: string
  requires_receipt: boolean
  requires_approval: boolean
  approval_threshold: number
}

interface ExpenseClaim {
  id: string
  amount: number
  currency: string
  category: ExpenseCategory
  description: string
  receipt_urls: string[]
  status: string
  expense_date: string
  created_at: string
  staff?: any
}

export default function ExpenseClaimsPage() {
  const { staff } = useAuth()
  const isAdmin = staff?.role === 'owner' || staff?.role === 'admin'
  const [claims, setClaims] = useState<ExpenseClaim[]>([])
  const [categories, setCategories] = useState<ExpenseCategory[]>([])
  const [pendingApprovals, setPendingApprovals] = useState<ExpenseClaim[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [tab, setTab] = useState<'my' | 'approvals'>('my')
  const [filter, setFilter] = useState<string>('all')

  useEffect(() => {
    loadData()
  }, [staff?.business_id, staff?.id])

  async function loadData() {
    if (!staff?.business_id) return
    setLoading(true)

    try {
      // Load categories
      const { data: cats } = await supabase
        .from('expense_categories')
        .select('*')
        .eq('business_id', staff.business_id)
        .eq('is_active', true)
        .order('name')

      // Load user's claims
      const { data: userClaims } = await supabase
        .from('expense_claims')
        .select('*, category:expense_categories(*)')
        .eq('staff_id', staff.id)
        .order('created_at', { ascending: false })
        .limit(50)

      const claimsWithCats: ExpenseClaim[] = (userClaims || []).map(c => ({
        ...c,
        category: cats?.find(cat => cat.id === c.category_id) || c.category,
      }))
      setClaims(claimsWithCats)

      // Load pending approvals (for admins)
      if (isAdmin) {
        const { data: pending } = await supabase
          .from('expense_claims')
          .select('*, staff:staff(full_name, email), category:expense_categories(*)')
          .eq('status', 'pending')
          .order('created_at', { ascending: false })

        setPendingApprovals(pending || [])
      }

      setCategories(cats || [])
    } catch (e) {
      console.error('Failed to load expenses:', e)
    } finally {
      setLoading(false)
    }
  }

  async function handleApprove(claimId: string) {
    try {
      await supabase.from('expense_claims').update({
        status: 'approved',
      }).eq('id', claimId)
      loadData()
    } catch (e) {
      console.error('Failed to approve:', e)
    }
  }

  async function handleReject(claimId: string) {
    const reason = prompt('Rejection reason:')
    if (!reason) return

    try {
      await supabase.from('expense_claims').update({
        status: 'rejected',
      }).eq('id', claimId)
      loadData()
    } catch (e) {
      console.error('Failed to reject:', e)
    }
  }

  async function handleMarkReimbursed(claimId: string) {
    try {
      await supabase.from('expense_claims').update({
        status: 'reimbursed',
        reimbursed_at: new Date().toISOString(),
        reimbursed_by: staff?.id,
      }).eq('id', claimId)
      loadData()
    } catch (e) {
      console.error('Failed to mark reimbursed:', e)
    }
  }

  const statusConfig: Record<string, { bg: string; text: string; icon: any }> = {
    draft: { bg: 'bg-white', text: 'text-black', icon: FileText },
    pending: { bg: 'bg-amber-100', text: 'text-amber-600', icon: Clock },
    approved: { bg: 'bg-green-100', text: 'text-green-600', icon: CheckCircle },
    rejected: { bg: 'bg-red-100', text: 'text-red-600', icon: XCircle },
    reimbursed: { bg: 'bg-blue-100', text: 'text-blue-600', icon: CreditCard },
  }

  const filteredClaims = filter === 'all' 
    ? claims 
    : claims.filter(c => c.status === filter)

  return (
    <div className="max-w-6xl mx-auto pb-20">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
            <Receipt size={24} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-black">Expense Claims</h1>
            <p className="text-sm text-black">Track and manage expenses</p>
          </div>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#4285F4] text-white text-sm"
        >
          <Plus size={16} />
          New Expense
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard 
          title="Total Claimed" 
          value={`₦${claims.reduce((sum, c) => sum + c.amount, 0).toLocaleString()}`}
          icon={<DollarSign size={18} />} 
          color="bg-emerald-500" 
        />
        <StatCard 
          title="Pending" 
          value={`₦${claims.filter(c => c.status === 'pending').reduce((sum, c) => sum + c.amount, 0).toLocaleString()}`}
          icon={<Clock size={18} />} 
          color="bg-amber-500" 
        />
        <StatCard 
          title="Approved" 
          value={`₦${claims.filter(c => ['approved', 'reimbursed'].includes(c.status)).reduce((sum, c) => sum + c.amount, 0).toLocaleString()}`}
          icon={<CheckCircle size={18} />} 
          color="bg-green-500" 
        />
        <StatCard 
          title="Rejected" 
          value={claims.filter(c => c.status === 'rejected').length.toString()}
          icon={<XCircle size={18} />} 
          color="bg-red-500" 
        />
      </div>

      {/* Tabs */}
      {isAdmin && (
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setTab('my')}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              tab === 'my' ? 'bg-[#4285F4] text-white' : 'bg-white border border-black/10'
            }`}
          >
            My Expenses ({claims.length})
          </button>
          <button
            onClick={() => setTab('approvals')}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              tab === 'approvals' ? 'bg-[#4285F4] text-white' : 'bg-white border border-black/10'
            }`}
          >
            Approvals ({pendingApprovals.length})
          </button>
        </div>
      )}

      {/* My Expenses Tab */}
      {tab === 'my' && (
        <>
          {/* Filters */}
          <div className="flex gap-2 mb-4">
            {['all', 'draft', 'pending', 'approved', 'rejected', 'reimbursed'].map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize ${
                  filter === f 
                    ? 'bg-[#4285F4] text-white' 
                    : 'bg-white border border-black/10'
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          <div className="bg-white rounded-2xl border border-black/[0.06] overflow-hidden">
            {loading ? (
              <div className="p-12 text-center text-black">
                <RefreshCw size={24} className="mx-auto animate-spin mb-2" />
                Loading...
              </div>
            ) : filteredClaims.length === 0 ? (
              <div className="p-12 text-center text-black">
                <Receipt size={48} className="mx-auto mb-4 text-black/50" />
                <p className="font-medium mb-2">No expenses found</p>
                <p className="text-sm">Submit your first expense claim</p>
              </div>
            ) : (
              <div className="divide-y divide-black/[0.06]">
                {filteredClaims.map(claim => {
                  const status = statusConfig[claim.status] || statusConfig.draft
                  const StatusIcon = status.icon

                  return (
                    <div key={claim.id} className="p-4 hover:bg-black/10">
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
                          <Receipt size={20} className="text-emerald-500" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-medium">{claim.description}</div>
                              <div className="text-sm text-black">
                                {claim.category?.name} • {new Date(claim.expense_date).toLocaleDateString()}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-xl font-bold">
                                {claim.currency} {claim.amount.toLocaleString()}
                              </div>
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${status.bg} ${status.text}`}>
                                <StatusIcon size={10} />
                                {claim.status}
                              </span>
                            </div>
                          </div>
                          {claim.receipt_urls && claim.receipt_urls.length > 0 && (
                            <div className="mt-2 flex items-center gap-2 text-xs text-black">
                              <Paperclip size={12} />
                              {claim.receipt_urls.length} attachment{claim.receipt_urls.length > 1 ? 's' : ''}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* Approvals Tab */}
      {tab === 'approvals' && isAdmin && (
        <div className="bg-white rounded-2xl border border-black/[0.06] overflow-hidden">
          <div className="p-4 border-b border-black/[0.06]">
            <h2 className="font-semibold">Pending Approvals</h2>
          </div>

          {pendingApprovals.length === 0 ? (
            <div className="p-12 text-center text-black">
              <CheckCircle size={48} className="mx-auto mb-4 text-green-500" />
              <p className="font-medium mb-2">All caught up!</p>
              <p className="text-sm">No pending expense claims</p>
            </div>
          ) : (
            <div className="divide-y divide-black/[0.06]">
              {pendingApprovals.map(claim => (
                <div key={claim.id} className="p-4">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-sm font-medium shrink-0">
                      {claim.staff?.full_name?.charAt(0) || 'U'}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium">{claim.staff?.full_name}</div>
                          <div className="text-sm text-black">{claim.staff?.email}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-xl font-bold text-emerald-600">
                            {claim.currency} {claim.amount.toLocaleString()}
                          </div>
                          <div className="text-xs text-black">{claim.category?.name}</div>
                        </div>
                      </div>
                      <div className="mt-2 p-3 bg-black/[0.02] rounded-lg">
                        <div className="font-medium">{claim.description}</div>
                        <div className="text-sm text-black mt-1">
                          {new Date(claim.expense_date).toLocaleDateString()}
                        </div>
                      </div>
                      <div className="mt-3 flex gap-2">
                        <button
                          onClick={() => handleApprove(claim.id)}
                          className="flex-1 py-2 rounded-lg bg-green-500 text-white text-sm font-medium"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => handleReject(claim.id)}
                          className="flex-1 py-2 rounded-lg bg-red-50 text-red-600 text-sm font-medium"
                        >
                          Reject
                        </button>
                        <button
                          onClick={() => handleMarkReimbursed(claim.id)}
                          className="px-4 py-2 rounded-lg bg-blue-50 text-blue-600 text-sm font-medium"
                        >
                          Mark Paid
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* New Expense Modal */}
      {showModal && (
        <ExpenseModal
          categories={categories}
          onClose={() => setShowModal(false)}
          onSuccess={() => { setShowModal(false); loadData() }}
        />
      )}
    </div>
  )
}

function StatCard({ title, value, icon, color }: any) {
  return (
    <div className="bg-white rounded-xl border border-black/[0.06] p-4">
      <div className={`w-10 h-10 rounded-lg ${color} flex items-center justify-center text-white mb-3`}>
        {icon}
      </div>
      <div className="text-xl font-bold">{value}</div>
      <div className="text-sm text-black">{title}</div>
    </div>
  )
}

function ExpenseModal({
  categories, onClose, onSuccess
}: {
  categories: ExpenseCategory[]
  onClose: () => void
  onSuccess: () => void
}) {
  const { staff } = useAuth()
  const [form, setForm] = useState({
    category_id: categories[0]?.id || '',
    amount: '',
    description: '',
    expense_date: new Date().toISOString().split('T')[0],
    currency: 'NGN',
  })
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!staff?.id) return

    setSubmitting(true)
    try {
      await supabase.from('expense_claims').insert({
        staff_id: staff.id,
        business_id: staff.business_id,
        category_id: form.category_id,
        amount: parseFloat(form.amount),
        currency: form.currency,
        description: form.description,
        expense_date: form.expense_date,
        status: 'pending',
        receipt_urls: [],
      })
      onSuccess()
    } catch (e) {
      console.error('Failed to submit:', e)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="p-6 border-b border-black/[0.06]">
          <h2 className="text-lg font-bold">New Expense Claim</h2>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Category</label>
            <select
              value={form.category_id}
              onChange={e => setForm({ ...form, category_id: e.target.value })}
              className="w-full px-4 py-3 rounded-xl border border-black/10"
              required
            >
              {categories.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Amount</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-black">₦</span>
              <input
                type="number"
                value={form.amount}
                onChange={e => setForm({ ...form, amount: e.target.value })}
                className="w-full pl-8 pr-4 py-3 rounded-xl border border-black/10"
                placeholder="0.00"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Date</label>
            <input
              type="date"
              value={form.expense_date}
              onChange={e => setForm({ ...form, expense_date: e.target.value })}
              className="w-full px-4 py-3 rounded-xl border border-black/10"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Description</label>
            <textarea
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
              className="w-full px-4 py-3 rounded-xl border border-black/10 resize-none"
              rows={3}
              placeholder="What was this expense for?"
              required
            />
          </div>

          <div className="p-4 bg-blue-50 rounded-lg">
            <p className="text-sm text-blue-700">
              <strong>Note:</strong> Upload receipts after submitting. Supported formats: JPG, PNG, PDF.
            </p>
          </div>

          <div className="flex gap-3 pt-4">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-3 rounded-xl border border-black/10 font-medium">
              Cancel
            </button>
            <button type="submit" disabled={submitting} className="flex-1 px-4 py-3 rounded-xl bg-[#4285F4] text-white font-medium disabled:opacity-50">
              {submitting ? 'Submitting...' : 'Submit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function Paperclip({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  )
}

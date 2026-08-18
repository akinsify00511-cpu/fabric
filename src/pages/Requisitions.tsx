import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../components/Toast'
import {
  Plus, FileText, Clock, CheckCircle2, XCircle, AlertTriangle,
  ArrowUpRight, ArrowDownRight, Send, RefreshCw, Eye, Edit3, Trash2,
  ChevronRight, Filter, Search, DollarSign, Calendar, User
} from 'lucide-react'

type Requisition = {
  id: string
  title: string
  description: string | null
  amount: number | null
  currency: string
  priority: 'low' | 'normal' | 'high' | 'urgent'
  status: string
  needed_by: string | null
  reason: string | null
  items: any[]
  created_at: string
  submitted_at: string | null
  resolved_at: string | null
  denial_reason: string | null
  requester?: { full_name: string; email: string }
  category?: { name: string; icon: string; color: string }
}

type Category = {
  id: string
  name: string
  description: string
  icon: string
  color: string
  requires_approval: boolean
  auto_approve_below: number | null
}

const PRIORITY_COLORS = {
  low: 'bg-[var(--av-surface)] text-[var(--av-text)]',
  normal: 'bg-[var(--av-primary-soft)] text-[var(--av-primary)]',
  high: 'bg-orange-100 text-orange-700',
  urgent: 'bg-[var(--av-danger-soft)] text-[var(--av-danger)]',
}

const STATUS_CONFIG = {
  draft: { label: 'Draft', icon: FileText, color: 'text-[var(--av-text)]', bg: 'bg-[var(--av-surface)]' },
  pending_approval: { label: 'Pending', icon: Clock, color: 'text-[var(--av-warning)]', bg: 'bg-[var(--av-warning-soft)]' },
  approved: { label: 'Approved', icon: CheckCircle2, color: 'text-[var(--av-success)]', bg: 'bg-[var(--av-success-soft)]' },
  denied: { label: 'Denied', icon: XCircle, color: 'text-[var(--av-danger)]', bg: 'bg-[var(--av-danger-soft)]' },
  partially_approved: { label: 'Partial', icon: AlertTriangle, color: 'text-orange-600', bg: 'bg-orange-100' },
  cancelled: { label: 'Cancelled', icon: XCircle, color: 'text-[var(--av-text)]', bg: 'bg-[var(--av-surface)]' },
}

export default function Requisitions() {
  const { staff } = useAuth()
  const { showToast } = useToast()
  const [loading, setLoading] = useState(true)
  const [requisitions, setRequisitions] = useState<Requisition[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [view, setView] = useState<'my' | 'pending' | 'all'>('my')
  const [filter, setFilter] = useState('')
  const [showNewModal, setShowNewModal] = useState(false)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [selectedReq, setSelectedReq] = useState<Requisition | null>(null)
  const [saving, setSaving] = useState(false)

  // Form state
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    amount: '',
    category_id: '',
    priority: 'normal' as const,
    needed_by: '',
    reason: '',
    items: [{ name: '', quantity: 1, unit_price: 0 }],
  })

  const loadData = async () => {
    setLoading(true)

    // Load categories
    const { data: cats } = await supabase
      .from('requisition_categories')
      .select('*')
      .eq('business_id', staff?.business_id)
      .order('name')

    setCategories((cats as Category[]) ?? [])

    // Load requisitions based on view
    let query = supabase
      .from('requisitions')
      .select('*, requester:staff(name, email), category:requisition_categories(name, icon, color)')
      .eq('business_id', staff?.business_id)
      .order('created_at', { ascending: false })

    if (view === 'my') {
      query = query.eq('requester_id', staff?.id)
    } else if (view === 'pending') {
      query = query.eq('status', 'pending_approval')
    }

    const { data } = await query
    setRequisitions((data as any[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [staff?.business_id, staff?.id, view])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.title.trim()) {
      showToast('Enter a title', 'error')
      return
    }

    setSaving(true)

    // Create or update
    if (selectedReq) {
      // Update existing
      const { error } = await supabase
        .from('requisitions')
        .update({
          title: formData.title,
          description: formData.description,
          amount: formData.amount ? parseFloat(formData.amount) : null,
          category_id: formData.category_id || null,
          priority: formData.priority,
          needed_by: formData.needed_by || null,
          reason: formData.reason,
        })
        .eq('id', selectedReq.id)

      if (error) {
        showToast('Failed to update', 'error')
      } else {
        showToast('Requisition updated', 'success')
        setShowNewModal(false)
        loadData()
      }
    } else {
      // Create new
      const { data, error } = await supabase.rpc('create_requisition', {
        p_title: formData.title,
        p_description: formData.description || null,
        p_amount: formData.amount ? parseFloat(formData.amount) : null,
        p_priority: formData.priority,
        p_needed_by: formData.needed_by || null,
        p_reason: formData.reason || null,
        p_category_id: formData.category_id || null,
      })

      if (error) {
        showToast('Failed to create', 'error')
      } else {
        // Submit for approval
        await supabase.rpc('submit_requisition', { p_requisition_id: data })
        showToast('Requisition submitted for approval!', 'success')
        setShowNewModal(false)
        setFormData({
          title: '', description: '', amount: '', category_id: '',
          priority: 'normal', needed_by: '', reason: '',
          items: [{ name: '', quantity: 1, unit_price: 0 }],
        })
        loadData()
      }
    }

    setSaving(false)
  }

  const handleApprove = async (req: Requisition) => {
    const { error } = await supabase.rpc('approve_requisition', {
      p_requisition_id: req.id,
      p_comments: null,
    })

    if (error) {
      showToast('Failed to approve', 'error')
    } else {
      showToast('Requisition approved!', 'success')
      loadData()
    }
  }

  const handleDeny = async (req: Requisition, reason: string) => {
    const { error } = await supabase.rpc('deny_requisition', {
      p_requisition_id: req.id,
      p_denial_reason: reason,
    })

    if (error) {
      showToast('Failed to deny', 'error')
    } else {
      showToast('Requisition denied', 'info')
      loadData()
    }
  }

  const handleResubmit = async (req: Requisition) => {
    const { error } = await supabase.rpc('resubmit_requisition', {
      p_requisition_id: req.id,
    })

    if (error) {
      showToast('Failed to resubmit', 'error')
    } else {
      showToast('Requisition resubmitted!', 'success')
      loadData()
    }
  }

  const handleSubmitForApproval = async (req: Requisition) => {
    const { error } = await supabase.rpc('submit_requisition', {
      p_requisition_id: req.id,
    })

    if (error) {
      showToast('Failed to submit', 'error')
    } else {
      showToast('Requisition submitted for approval!', 'success')
      loadData()
    }
  }

  const handleSendReminder = async (req: Requisition) => {
    const { error } = await supabase.rpc('send_follow_up', {
      p_requisition_id: req.id,
    })

    if (error) {
      showToast('Failed to send reminder', 'error')
    } else {
      showToast('Reminder sent to approvers', 'success')
      loadData()
    }
  }

  const openNewModal = () => {
    setFormData({
      title: '', description: '', amount: '', category_id: '',
      priority: 'normal', needed_by: '', reason: '',
      items: [{ name: '', quantity: 1, unit_price: 0 }],
    })
    setSelectedReq(null)
    setShowNewModal(true)
  }

  const openDetailModal = (req: Requisition) => {
    setSelectedReq(req)
    setShowDetailModal(true)
  }

  const filteredReqs = requisitions.filter((r) =>
    r.title.toLowerCase().includes(filter.toLowerCase()) ||
    r.description?.toLowerCase().includes(filter.toLowerCase())
  )

  const isManager = staff?.role === 'owner' || staff?.role === 'manager'

  return (
    <div className="pb-20">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-medium text-[var(--av-text)]">Requisitions</h1>
          <p className="text-sm text-[var(--av-text)] mt-0.5">Request approvals for purchases and expenses</p>
        </div>
        <button
          onClick={openNewModal}
          className="flex items-center gap-2 px-4 py-2 rounded-lg avenize-gradient text-white text-sm font-medium"
        >
          <Plus size={16} />
          New Request
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        {[
          { key: 'my', label: 'My Requests' },
          { key: 'pending', label: 'Pending Approval' },
          { key: 'all', label: 'All Requests' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setView(tab.key as typeof view)}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              view === tab.key ? 'avenize-gradient text-white' : 'border border-[var(--av-border)]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--av-text)]" />
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search requests..."
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[var(--av-border)] bg-[var(--av-surface)]"
        />
      </div>

      {/* List */}
      <div className="space-y-3">
        {loading ? (
          <div className="animate-pulse space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 bg-[var(--av-surface-3)] rounded-xl" />
            ))}
          </div>
        ) : filteredReqs.length === 0 ? (
          <div className="bg-[var(--av-surface-elevated)] rounded-2xl border border-[var(--av-border-strong)]/[0.06] p-8 text-center">
            <FileText className="w-12 h-12 mx-auto text-[var(--av-text)]/50 mb-3" />
            <p className="text-[var(--av-text)]">No requisitions found</p>
          </div>
        ) : (
          filteredReqs.map((req) => {
            const statusConfig = STATUS_CONFIG[req.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.draft
            const StatusIcon = statusConfig.icon

            return (
              <div key={req.id} className="bg-[var(--av-surface-elevated)] rounded-2xl border border-[var(--av-border-strong)]/[0.06] p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${statusConfig.bg}`}>
                      <StatusIcon size={18} className={statusConfig.color} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium">{req.title}</h3>
                        <span className={`px-2 py-0.5 rounded-full text-xs ${PRIORITY_COLORS[req.priority]}`}>
                          {req.priority}
                        </span>
                      </div>
                      <p className="text-sm text-[var(--av-text)]">{req.requester?.full_name || 'Unknown'}</p>
                      {req.category && (
                        <span className="text-xs text-[var(--av-text)]">{req.category.name}</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    {req.amount && (
                      <p className="font-semibold">
                        {req.currency} {req.amount.toLocaleString()}
                      </p>
                    )}
                    <p className="text-xs text-[var(--av-text)]">
                      {new Date(req.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[var(--av-border-strong)]/[0.06]">
                  <button
                    onClick={() => openDetailModal(req)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[var(--av-border)] text-sm"
                  >
                    <Eye size={14} />
                    View
                  </button>

                  {req.status === 'draft' && (
                    <button
                      onClick={() => handleSubmitForApproval(req)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-50 text-[var(--av-primary)] text-sm"
                    >
                      <Send size={14} />
                      Submit
                    </button>
                  )}

                  {req.status === 'denied' && (
                    <button
                      onClick={() => handleResubmit(req)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-orange-50 text-orange-600 text-sm"
                    >
                      <RefreshCw size={14} />
                      Resubmit
                    </button>
                  )}

                  {req.status === 'pending_approval' && isManager && (
                    <>
                      <button
                        onClick={() => handleApprove(req)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-50 text-[var(--av-success)] text-sm"
                      >
                        <CheckCircle2 size={14} />
                        Approve
                      </button>
                      <button
                        onClick={() => {
                          const reason = prompt('Denial reason:')
                          if (reason) handleDeny(req, reason)
                        }}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-50 text-[var(--av-danger)] text-sm"
                      >
                        <XCircle size={14} />
                        Deny
                      </button>
                      <button
                        onClick={() => handleSendReminder(req)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[var(--av-border)] text-sm"
                      >
                        <Clock size={14} />
                        Remind
                      </button>
                    </>
                  )}
                </div>

                {/* Denial reason */}
                {req.status === 'denied' && req.denial_reason && (
                  <div className="mt-3 p-3 rounded-lg bg-red-50 text-[var(--av-danger)] text-sm">
                    <strong>Denial reason:</strong> {req.denial_reason}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* New/Edit Modal */}
      {showNewModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--av-surface-elevated)] rounded-2xl w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-[var(--av-border-strong)]/[0.06]">
              <h2 className="font-semibold">{selectedReq ? 'Edit Request' : 'New Requisition'}</h2>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="text-sm font-medium block mb-1">Title *</label>
                <input
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="e.g., New laptop for design team"
                  className="w-full px-4 py-3 rounded-xl border border-[var(--av-border)]"
                  required
                />
              </div>

              <div>
                <label className="text-sm font-medium block mb-1">Category</label>
                <select
                  value={formData.category_id}
                  onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-[var(--av-border)]"
                >
                  <option value="">Select category...</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium block mb-1">Amount</label>
                  <div className="relative">
                    <DollarSign size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--av-text)]" />
                    <input
                      value={formData.amount}
                      onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      className="w-full pl-9 pr-4 py-3 rounded-xl border border-[var(--av-border)]"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium block mb-1">Priority</label>
                  <select
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: e.target.value as any })}
                    className="w-full px-4 py-3 rounded-xl border border-[var(--av-border)]"
                  >
                    <option value="low">Low</option>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium block mb-1">Needed By</label>
                <div className="relative">
                  <Calendar size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--av-text)]" />
                  <input
                    value={formData.needed_by}
                    onChange={(e) => setFormData({ ...formData, needed_by: e.target.value })}
                    type="date"
                    className="w-full pl-9 pr-4 py-3 rounded-xl border border-[var(--av-border)]"
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium block mb-1">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Describe what you need and why..."
                  rows={3}
                  className="w-full px-4 py-3 rounded-xl border border-[var(--av-border)] resize-none"
                />
              </div>

              <div>
                <label className="text-sm font-medium block mb-1">Business Justification</label>
                <textarea
                  value={formData.reason}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  placeholder="Why is this needed? What's the ROI?"
                  rows={2}
                  className="w-full px-4 py-3 rounded-xl border border-[var(--av-border)] resize-none"
                />
              </div>
            </form>
            <div className="px-6 py-4 border-t border-[var(--av-border-strong)]/[0.06] flex justify-end gap-2">
              <button
                onClick={() => setShowNewModal(false)}
                className="px-4 py-2 rounded-lg border border-[var(--av-border)]"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={saving}
                className="px-4 py-2 rounded-lg avenize-gradient text-white font-medium disabled:opacity-50"
              >
                {saving ? 'Saving...' : selectedReq ? 'Update' : 'Submit for Approval'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {showDetailModal && selectedReq && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--av-surface-elevated)] rounded-2xl w-full max-w-lg shadow-xl">
            <div className="p-6 border-b border-[var(--av-border-strong)]/[0.06] flex items-center justify-between">
              <h2 className="font-semibold">Requisition Details</h2>
              <button onClick={() => setShowDetailModal(false)} className="p-2 hover:bg-black/[0.05] rounded-lg">
                ✕
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium">{selectedReq.title}</h3>
                <span className={`px-2 py-1 rounded-full text-xs ${
                  STATUS_CONFIG[selectedReq.status as keyof typeof STATUS_CONFIG]?.bg
                } ${STATUS_CONFIG[selectedReq.status as keyof typeof STATUS_CONFIG]?.color}`}>
                  {STATUS_CONFIG[selectedReq.status as keyof typeof STATUS_CONFIG]?.label}
                </span>
              </div>

              {selectedReq.description && (
                <p className="text-sm text-[var(--av-text)]/60">{selectedReq.description}</p>
              )}

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-[var(--av-text)]">Amount</p>
                  <p className="font-medium">
                    {selectedReq.currency} {selectedReq.amount?.toLocaleString() || '—'}
                  </p>
                </div>
                <div>
                  <p className="text-[var(--av-text)]">Priority</p>
                  <p className="font-medium capitalize">{selectedReq.priority}</p>
                </div>
                <div>
                  <p className="text-[var(--av-text)]">Requested By</p>
                  <p className="font-medium">{selectedReq.requester?.full_name || '—'}</p>
                </div>
                <div>
                  <p className="text-[var(--av-text)]">Needed By</p>
                  <p className="font-medium">
                    {selectedReq.needed_by ? new Date(selectedReq.needed_by).toLocaleDateString() : '—'}
                  </p>
                </div>
              </div>

              {selectedReq.reason && (
                <div className="p-4 rounded-xl bg-black/[0.02]">
                  <p className="text-sm text-[var(--av-text)] mb-1">Business Justification</p>
                  <p className="text-sm">{selectedReq.reason}</p>
                </div>
              )}

              {selectedReq.status === 'denied' && selectedReq.denial_reason && (
                <div className="p-4 rounded-xl bg-red-50">
                  <p className="text-sm text-[var(--av-danger)] font-medium mb-1">Denial Reason</p>
                  <p className="text-sm text-[var(--av-danger)]">{selectedReq.denial_reason}</p>
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-[var(--av-border-strong)]/[0.06]">
              <button
                onClick={() => setShowDetailModal(false)}
                className="w-full px-4 py-2 rounded-lg border border-[var(--av-border)]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

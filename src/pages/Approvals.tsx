import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { EmptyApprovals } from '../components/EmptyStates'
import { 
  CheckCircle, XCircle, Clock, AlertTriangle, ChevronRight,
  User, DollarSign, Calendar, ShoppingCart, FileText,
  Filter, Search, Check, X, MessageSquare, ArrowUpRight
} from 'lucide-react'
import type { ApprovalRequest, ApprovalDecision } from '../lib/approvalWorkflow'
import { APPROVAL_TYPE_LABELS, APPROVAL_STATUS_COLORS } from '../lib/approvalWorkflow'

export default function Approvals() {
  const { staff } = useAuth()
  const [pending, setPending] = useState<ApprovalRequest[]>([])
  const [history, setHistory] = useState<ApprovalRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedRequest, setSelectedRequest] = useState<ApprovalRequest | null>(null)
  const [actionComment, setActionComment] = useState('')
  const [processing, setProcessing] = useState(false)
  const [filterStatus, setFilterStatus] = useState<'pending' | 'all'>('pending')
  const [filterType, setFilterType] = useState<string>('all')

  useEffect(() => {
    loadApprovals()
  }, [staff?.business_id, staff?.role])

  const loadApprovals = async () => {
    if (!staff?.business_id || !staff?.role) return
    
    setLoading(true)
    
    try {
      // Get pending approvals based on role
      const { data: pendingData } = await supabase
        .from('approval_requests')
        .select('*')
        .eq('business_id', staff.business_id)
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
      
      // Get history
      const { data: historyData } = await supabase
        .from('approval_requests')
        .select('*')
        .eq('business_id', staff.business_id)
        .in('status', ['approved', 'rejected'])
        .order('updated_at', { ascending: false })
        .limit(20)

      setPending(pendingData || [])
      setHistory(historyData || [])
    } catch (error) {
      console.error('Failed to load approvals:', error)
    }
    
    setLoading(false)
  }

  const handleApprove = async (request: ApprovalRequest) => {
    setProcessing(true)
    try {
      // §15/§22 Enforcement gate — pre-check before mutating.
      // The DB trigger (approvals_enforce_gate) is the backstop; this
      // pre-check gives the user a readable reason instead of a 500.
      const { data: verdict, error: enforceError } = await supabase.rpc(
        'enforce_approval',
        {
          p_business_id: request.business_id,
          p_approver_id: staff?.id,
          p_entity_type: request.entity_type || request.type,
          p_entity_id: request.entity_id,
          p_amount: request.amount ?? null,
          p_blocking: false,
        }
      )
      if (enforceError) throw enforceError
      if (verdict && !verdict.allowed) {
        const reasons = (verdict.blocked_reasons || []).join('; ')
        alert(`Approval blocked: ${reasons}`)
        setProcessing(false)
        return
      }

      // Record the decision BEFORE the status update so the DB enforcement
      // trigger (enforce_approval_on_status_change) can read approver_id
      // from approval_actions. The pre-check above already validated; the
      // trigger is the backstop.
      const { error: actionError } = await supabase.from('approval_actions').insert({
        approval_id: request.id,
        step: request.current_level,
        approver_id: staff?.id,
        action: 'approve',
        comment: actionComment,
      })
      if (actionError) throw actionError

      const { error } = await supabase
        .from('approval_requests')
        .update({
          status: request.current_level >= 2 ? 'approved' : 'pending',
          current_level: request.current_level + 1
        })
        .eq('id', request.id)

      if (error) throw error

      // Start/advance the action protocol run for this approval (§12).
      await supabase.rpc('start_approval_protocol', {
        p_business_id: request.business_id,
        p_approval_id: request.id,
        p_initiator_id: staff?.id,
      }).then(({ error }) => { if (error) console.warn('[protocol]', error.message) })

      await loadApprovals()
      setSelectedRequest(null)
      setActionComment('')
    } catch (error) {
      console.error('Failed to approve:', error)
      const msg = error instanceof Error ? error.message : String(error)
      if (msg.includes('Approval blocked')) {
        alert(msg)
      } else {
        alert('Failed to approve. Please try again.')
      }
    }
    setProcessing(false)
  }

  const handleReject = async (request: ApprovalRequest) => {
    if (!confirm('Are you sure you want to reject this request?')) return
    
    setProcessing(true)
    try {
      const { error } = await supabase
        .from('approval_requests')
        .update({ status: 'rejected' })
        .eq('id', request.id)

      if (error) throw error
      
      await supabase.from('approval_actions').insert({
        approval_id: request.id,
        step: request.current_level,
        approver_id: staff?.id,
        action: 'reject',
        comment: actionComment,
      })

      await loadApprovals()
      setSelectedRequest(null)
      setActionComment('')
    } catch (error) {
      console.error('Failed to reject:', error)
    }
    setProcessing(false)
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'expense': return DollarSign
      case 'leave': return Calendar
      case 'purchase_order': return ShoppingCart
      case 'invoice': return FileText
      default: return FileText
    }
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-NG', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
    }).format(amount)
  }

  const filteredPending = pending.filter(r => {
    if (filterType !== 'all' && r.type !== filterType) return false
    return true
  })

  const filteredHistory = history.filter(r => {
    if (filterStatus === 'pending') return false
    if (filterType !== 'all' && r.type !== filterType) return false
    return true
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-[#4285F4] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold text-black">Approvals</h1>
          <p className="text-sm text-black">
            {pending.length} pending request{pending.length !== 1 ? 's' : ''}
          </p>
        </div>
        
        <div className="flex gap-3">
          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
            className="px-4 py-2 rounded-xl border border-black text-sm"
          >
            <option value="all">All Types</option>
            <option value="expense">Expenses</option>
            <option value="leave">Leave</option>
            <option value="purchase_order">Purchase Orders</option>
          </select>
        </div>
      </div>

      {/* Pending Requests */}
      <div className="space-y-4 mb-8">
        <h2 className="text-sm font-semibold text-black uppercase tracking-wide">
          Pending Approval
        </h2>
        
        {filteredPending.length === 0 ? (
          <EmptyApprovals />
        ) : (
          <div className="space-y-3">
            {filteredPending.map(request => {
              const TypeIcon = getTypeIcon(request.type)
              return (
                <div
                  key={request.id}
                  className="bg-white rounded-xl hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
                      <TypeIcon size={24} className="text-amber-600" />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="font-semibold text-black">{request.entity_name}</h3>
                          <p className="text-sm text-black mt-0.5">
                            Requested by {request.requester || 'Unknown'}
                          </p>
                        </div>
                        <span className={`px-3 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700`}>
                          Level {request.current_level}
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-4 mt-3">
                        {request.amount && (
                          <span className="text-lg font-bold text-black">
                            {formatCurrency(request.amount)}
                          </span>
                        )}
                        <span className="text-sm text-black">
                          {APPROVAL_TYPE_LABELS[request.type]}
                        </span>
                        <span className="text-sm text-black">
                          {formatDate(request.created_at)}
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-2 mt-4">
                        <button
                          onClick={() => handleApprove(request)}
                          disabled={processing}
                          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl font-medium text-sm hover:bg-emerald-700 disabled:opacity-50"
                        >
                          <Check size={18} />
                          Approve
                        </button>
                        <button
                          onClick={() => handleReject(request)}
                          disabled={processing}
                          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 border border-black text-black rounded-xl font-medium text-sm hover:bg-white disabled:opacity-50"
                        >
                          <X size={18} />
                          Reject
                        </button>
                        <button
                          onClick={() => setSelectedRequest(request)}
                          className="px-4 py-2.5 border border-black text-black rounded-xl text-sm hover:bg-white"
                        >
                          View Details
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* History */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-black uppercase tracking-wide">
          Recent History
        </h2>
        
        {filteredHistory.length === 0 ? (
          <div className="bg-white rounded-xl border border-black p-8 text-center">
            <Clock size={48} className="mx-auto text-black mb-4" />
            <p className="text-black">No approval history yet</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-black overflow-hidden">
            <table className="w-full">
              <thead className="bg-white border-b border-black">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-black uppercase">Item</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-black uppercase">Requested By</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-black uppercase">Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-black uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-black uppercase">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredHistory.map(request => (
                  <tr key={request.id} className="hover:bg-white">
                    <td className="px-4 py-3">
                      <p className="font-medium text-black">{request.entity_name}</p>
                      <p className="text-xs text-black">{APPROVAL_TYPE_LABELS[request.type]}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-black">
                      {request.requester || 'Unknown'}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-black">
                      {request.amount ? formatCurrency(request.amount) : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        request.status === 'approved' 
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-red-100 text-red-700'
                      }`}>
                        {request.status === 'approved' ? 'Approved' : 'Rejected'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-black">
                      {formatDate(request.updated_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selectedRequest && (
        <div 
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedRequest(null)}
        >
          <div 
            className="bg-white rounded-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-6 border-b border-black">
              <h2 className="text-xl font-bold text-black">Request Details</h2>
            </div>
            
            <div className="p-6 space-y-6">
              <div>
                <h3 className="font-semibold text-black mb-1">{selectedRequest.entity_name}</h3>
                <p className="text-sm text-black">{APPROVAL_TYPE_LABELS[selectedRequest.type]}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white rounded-xl p-4">
                  <p className="text-xs text-black mb-1">Requested By</p>
                  <p className="font-medium text-black">{selectedRequest.requester}</p>
                </div>
                <div className="bg-white rounded-xl p-4">
                  <p className="text-xs text-black mb-1">Date</p>
                  <p className="font-medium text-black">{formatDate(selectedRequest.created_at)}</p>
                </div>
              </div>

              {selectedRequest.amount && (
                <div className="bg-[#4285F4]/5 rounded-xl p-4">
                  <p className="text-xs text-[#4285F4] mb-1">Amount</p>
                  <p className="text-2xl font-bold text-[#4285F4]">{formatCurrency(selectedRequest.amount)}</p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-black mb-2">
                  Comment (optional)
                </label>
                <textarea
                  value={actionComment}
                  onChange={e => setActionComment(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-3 rounded-xl border border-black focus:outline-none focus:ring-2 focus:ring-[#4285F4]"
                  placeholder="Add a note..."
                />
              </div>
            </div>

            <div className="p-6 border-t border-black flex gap-3">
              <button
                onClick={() => setSelectedRequest(null)}
                className="flex-1 px-4 py-3 border border-black rounded-xl font-medium text-black hover:bg-white"
              >
                Cancel
              </button>
              <button
                onClick={() => handleReject(selectedRequest)}
                className="flex-1 px-4 py-3 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700"
              >
                Reject
              </button>
              <button
                onClick={() => handleApprove(selectedRequest)}
                className="flex-1 px-4 py-3 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700"
              >
                Approve
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

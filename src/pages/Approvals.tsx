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
        .select('*, requester:staff(name)')
        .eq('business_id', staff.business_id)
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
      
      // Get history
      const { data: historyData } = await supabase
        .from('approval_requests')
        .select('*, requester:staff(name)')
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
      const { error } = await supabase
        .from('approval_requests')
        .update({ 
          status: request.current_level >= 2 ? 'approved' : 'pending',
          current_level: request.current_level + 1
        })
        .eq('id', request.id)

      if (error) throw error
      
      // Record decision
      await supabase.from('approval_decisions').insert({
        request_id: request.id,
        approver_id: staff?.id,
        level: request.current_level,
        decision: 'approved',
        comment: actionComment,
      })

      await loadApprovals()
      setSelectedRequest(null)
      setActionComment('')
    } catch (error) {
      console.error('Failed to approve:', error)
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
      
      await supabase.from('approval_decisions').insert({
        request_id: request.id,
        approver_id: staff?.id,
        level: request.current_level,
        decision: 'rejected',
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
        <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Approvals</h1>
          <p className="text-sm text-slate-500">
            {pending.length} pending request{pending.length !== 1 ? 's' : ''}
          </p>
        </div>
        
        <div className="flex gap-3">
          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
            className="px-4 py-2 rounded-xl border border-slate-200 text-sm"
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
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
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
                  className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
                      <TypeIcon size={24} className="text-amber-600" />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="font-semibold text-slate-900">{request.entity_name}</h3>
                          <p className="text-sm text-slate-500 mt-0.5">
                            Requested by {request.requester?.full_name || 'Unknown'}
                          </p>
                        </div>
                        <span className={`px-3 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700`}>
                          Level {request.current_level}
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-4 mt-3">
                        {request.amount && (
                          <span className="text-lg font-bold text-slate-900">
                            {formatCurrency(request.amount)}
                          </span>
                        )}
                        <span className="text-sm text-slate-400">
                          {APPROVAL_TYPE_LABELS[request.type]}
                        </span>
                        <span className="text-sm text-slate-400">
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
                          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 border border-slate-200 text-slate-600 rounded-xl font-medium text-sm hover:bg-slate-50 disabled:opacity-50"
                        >
                          <X size={18} />
                          Reject
                        </button>
                        <button
                          onClick={() => setSelectedRequest(request)}
                          className="px-4 py-2.5 border border-slate-200 text-slate-600 rounded-xl text-sm hover:bg-slate-50"
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
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
          Recent History
        </h2>
        
        {filteredHistory.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
            <Clock size={48} className="mx-auto text-slate-300 mb-4" />
            <p className="text-slate-500">No approval history yet</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Item</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Requested By</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredHistory.map(request => (
                  <tr key={request.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{request.entity_name}</p>
                      <p className="text-xs text-slate-500">{APPROVAL_TYPE_LABELS[request.type]}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {request.requester?.full_name || 'Unknown'}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-slate-900">
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
                    <td className="px-4 py-3 text-sm text-slate-500">
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
            <div className="p-6 border-b border-slate-100">
              <h2 className="text-xl font-bold text-slate-900">Request Details</h2>
            </div>
            
            <div className="p-6 space-y-6">
              <div>
                <h3 className="font-semibold text-slate-900 mb-1">{selectedRequest.entity_name}</h3>
                <p className="text-sm text-slate-500">{APPROVAL_TYPE_LABELS[selectedRequest.type]}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 rounded-xl p-4">
                  <p className="text-xs text-slate-500 mb-1">Requested By</p>
                  <p className="font-medium text-slate-900">{selectedRequest.requester?.full_name}</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-4">
                  <p className="text-xs text-slate-500 mb-1">Date</p>
                  <p className="font-medium text-slate-900">{formatDate(selectedRequest.created_at)}</p>
                </div>
              </div>

              {selectedRequest.amount && (
                <div className="bg-indigo-50 rounded-xl p-4">
                  <p className="text-xs text-indigo-500 mb-1">Amount</p>
                  <p className="text-2xl font-bold text-indigo-900">{formatCurrency(selectedRequest.amount)}</p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Comment (optional)
                </label>
                <textarea
                  value={actionComment}
                  onChange={e => setActionComment(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Add a note..."
                />
              </div>
            </div>

            <div className="p-6 border-t border-slate-100 flex gap-3">
              <button
                onClick={() => setSelectedRequest(null)}
                className="flex-1 px-4 py-3 border border-slate-200 rounded-xl font-medium text-slate-600 hover:bg-slate-50"
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

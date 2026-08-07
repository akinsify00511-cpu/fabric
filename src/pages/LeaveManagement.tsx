import { useState, useEffect } from 'react'
import {
  Calendar, Plus, Clock, CheckCircle, XCircle, AlertCircle,
  ChevronRight, RefreshCw, Filter, CalendarDays,
  ChevronDown, User, Trash2, Edit2, Eye
} from 'lucide-react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'

interface LeaveType {
  id: string
  name: string
  code: string
  color: string
  days_per_year: number
  requires_approval: boolean
  is_paid: boolean
  icon: string
}

interface LeaveBalance {
  leave_type_id: string
  leave_type: LeaveType
  total_days: number
  used_days: number
  pending_days: number
  available_days: number
}

interface LeaveRequest {
  id: string
  leave_type_id: string
  leave_type: LeaveType
  start_date: string
  end_date: string
  total_days: number
  reason: string
  status: string
  created_at: string
  rejection_reason?: string
  staff?: any
}

interface PendingApproval {
  id: string
  request: LeaveRequest
  requester: any
}

export default function LeaveManagementPage() {
  const { staff } = useAuth()
  const isAdmin = staff?.role === 'owner' || staff?.role === 'admin'
  const [balances, setBalances] = useState<LeaveBalance[]>([])
  const [requests, setRequests] = useState<LeaveRequest[]>([])
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [tab, setTab] = useState<'my' | 'team' | 'approvals'>('my')
  const [selectedRequest, setSelectedRequest] = useState<LeaveRequest | null>(null)

  useEffect(() => {
    loadData()
  }, [staff?.business_id, staff?.id])

  async function loadData() {
    if (!staff?.business_id) return
    setLoading(true)

    try {
      const currentYear = new Date().getFullYear()

      // Load leave types
      const { data: types } = await supabase
        .from('leave_types')
        .select('*')
        .eq('business_id', staff.business_id)
        .eq('is_active', true)
        .order('sort_order')

      // Load user's balances
      const { data: userBalances } = await supabase
        .from('leave_balances')
        .select('*')
        .eq('staff_id', staff.id)
        .eq('year', currentYear)

      // Combine balances with leave types
      const balancesWithTypes: LeaveBalance[] = (types || []).map(type => {
        const bal = userBalances?.find(b => b.leave_type_id === type.id)
        return {
          leave_type_id: type.id,
          leave_type: type,
          total_days: bal?.total_days || type.days_per_year || 0,
          used_days: bal?.used_days || 0,
          pending_days: bal?.pending_days || 0,
          available_days: (bal?.total_days || type.days_per_year || 0) - (bal?.used_days || 0) - (bal?.pending_days || 0),
        }
      })
      setBalances(balancesWithTypes)

      // Load user's requests
      const { data: userRequests } = await supabase
        .from('leave_requests')
        .select('*')
        .eq('staff_id', staff.id)
        .order('created_at', { ascending: false })
        .limit(20)

      const requestsWithTypes: LeaveRequest[] = (userRequests || []).map(req => ({
        ...req,
        leave_type: types?.find(t => t.id === req.leave_type_id) || { name: 'Unknown', color: '#666' },
      }))
      setRequests(requestsWithTypes)

      // Load pending approvals (for managers/admins)
      if (isAdmin) {
        const { data: allRequests } = await supabase
          .from('leave_requests')
          .select('*, staff:staff(full_name, email, avatar_url)')
          .eq('status', 'pending')
          .order('created_at', { ascending: false })

        const pending: PendingApproval[] = (allRequests || []).map(req => ({
          id: req.id,
          request: {
            ...req,
            leave_type: types?.find(t => t.id === req.leave_type_id) || { name: 'Unknown', color: '#666' },
          },
          requester: req.staff,
        }))
        setPendingApprovals(pending)
      }
    } catch (e) {
      console.error('Failed to load leave data:', e)
    } finally {
      setLoading(false)
    }
  }

  async function handleApprove(requestId: string) {
    try {
      await supabase.from('leave_requests').update({
        status: 'approved',
        approved_by: staff?.id,
        approved_at: new Date().toISOString(),
      }).eq('id', requestId)
      
      // Update balance
      const req = requests.find(r => r.id === requestId)
      if (req) {
        await supabase.rpc('update_leave_balance', {
          p_staff_id: staff?.id,
          p_leave_type_id: req.leave_type_id,
          p_days: req.total_days,
          p_type: 'approve',
        })
      }
      
      loadData()
    } catch (e) {
      console.error('Failed to approve:', e)
    }
  }

  async function handleReject(requestId: string, reason: string) {
    try {
      await supabase.from('leave_requests').update({
        status: 'rejected',
        rejection_reason: reason,
        approved_by: staff?.id,
        approved_at: new Date().toISOString(),
      }).eq('id', requestId)
      
      loadData()
    } catch (e) {
      console.error('Failed to reject:', e)
    }
  }

  const statusColors: Record<string, { bg: string; text: string; icon: any }> = {
    pending: { bg: 'bg-amber-50', text: 'text-amber-600', icon: Clock },
    approved: { bg: 'bg-green-50', text: 'text-green-600', icon: CheckCircle },
    rejected: { bg: 'bg-red-50', text: 'text-red-600', icon: XCircle },
    cancelled: { bg: 'bg-white', text: 'text-black', icon: XCircle },
  }

  return (
    <div className="max-w-6xl mx-auto pb-20">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
            <CalendarDays size={24} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-black">Leave Management</h1>
            <p className="text-sm text-black">Request and manage time off</p>
          </div>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--av-primary, #0891B2)] text-white text-sm"
        >
          <Plus size={16} />
          Request Leave
        </button>
      </div>

      {/* Balance Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {balances.map(bal => (
          <div key={bal.leave_type_id} className="bg-white rounded-xl border border-black/[0.06] p-4">
            <div className="flex items-center gap-2 mb-3">
              <div 
                className="w-3 h-3 rounded-full" 
                style={{ backgroundColor: bal.leave_type.color || '#6366F1' }} 
              />
              <span className="font-medium text-sm">{bal.leave_type.name}</span>
            </div>
            <div className="text-3xl font-bold mb-1">{bal.available_days}</div>
            <div className="text-sm text-black">
              of {bal.total_days} days available
            </div>
            <div className="mt-2 flex items-center gap-4 text-xs text-black">
              <span>{bal.used_days} used</span>
              {bal.pending_days > 0 && <span className="text-amber-500">{bal.pending_days} pending</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      {isAdmin && (
        <div className="flex gap-2 mb-6">
          {[
            { key: 'my', label: 'My Requests' },
            { key: 'team', label: 'Team Calendar' },
            { key: 'approvals', label: `Approvals (${pendingApprovals.length})` },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key as any)}
              className={`px-4 py-2 rounded-lg text-sm font-medium ${
                tab === t.key 
                  ? 'bg-[var(--av-primary, #0891B2)] text-white' 
                  : 'bg-white border border-black/10'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* My Requests Tab */}
      {(tab === 'my' || !isAdmin) && (
        <div className="bg-white rounded-2xl border border-black/[0.06] overflow-hidden">
          <div className="p-4 border-b border-black/[0.06]">
            <h2 className="font-semibold">My Leave Requests</h2>
          </div>

          {loading ? (
            <div className="p-12 text-center text-black">
              <RefreshCw size={24} className="mx-auto animate-spin mb-2" />
              Loading...
            </div>
          ) : requests.length === 0 ? (
            <div className="p-12 text-center text-black">
              <Calendar size={48} className="mx-auto mb-4 text-black/50" />
              <p className="font-medium mb-2">No leave requests</p>
              <p className="text-sm">Request your first leave to get started</p>
            </div>
          ) : (
            <div className="divide-y divide-black/[0.06]">
              {requests.map(req => {
                const status = statusColors[req.status] || statusColors.pending
                const StatusIcon = status.icon

                return (
                  <div key={req.id} className="p-4 hover:bg-black/10">
                    <div className="flex items-start gap-4">
                      <div 
                        className="w-10 h-10 rounded-lg flex items-center justify-center text-white"
                        style={{ backgroundColor: req.leave_type.color || '#6366F1' }}
                      >
                        <Calendar size={18} />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <div className="font-medium">{req.leave_type.name}</div>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${status.bg} ${status.text}`}>
                            <StatusIcon size={12} className="inline mr-1" />
                            {req.status}
                          </span>
                        </div>
                        <div className="mt-1 text-sm text-black/60">
                          {new Date(req.start_date).toLocaleDateString()} - {new Date(req.end_date).toLocaleDateString()}
                          <span className="mx-2">•</span>
                          {req.total_days} day{req.total_days > 1 ? 's' : ''}
                        </div>
                        {req.reason && (
                          <div className="mt-2 text-sm text-black">{req.reason}</div>
                        )}
                        {req.status === 'rejected' && req.rejection_reason && (
                          <div className="mt-2 p-2 bg-red-50 rounded-lg text-sm text-red-600">
                            Reason: {req.rejection_reason}
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
      )}

      {/* Approvals Tab (Admin only) */}
      {tab === 'approvals' && isAdmin && (
        <div className="bg-white rounded-2xl border border-black/[0.06] overflow-hidden">
          <div className="p-4 border-b border-black/[0.06]">
            <h2 className="font-semibold">Pending Approvals</h2>
          </div>

          {pendingApprovals.length === 0 ? (
            <div className="p-12 text-center text-black">
              <CheckCircle size={48} className="mx-auto mb-4 text-green-500" />
              <p className="font-medium mb-2">All caught up!</p>
              <p className="text-sm">No pending leave requests to approve</p>
            </div>
          ) : (
            <div className="divide-y divide-black/[0.06]">
              {pendingApprovals.map(pending => {
                const req = pending.request
                const status = statusColors.pending

                return (
                  <div key={pending.id} className="p-4">
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-sm font-medium">
                        {pending.requester?.full_name?.charAt(0) || 'U'}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium">{pending.requester?.full_name}</div>
                            <div className="text-sm text-black">{pending.requester?.email}</div>
                          </div>
                          <div 
                            className="px-2 py-1 rounded-full text-xs font-medium text-white"
                            style={{ backgroundColor: req.leave_type.color || '#6366F1' }}
                          >
                            {req.leave_type.name}
                          </div>
                        </div>
                        <div className="mt-2 p-3 bg-black/[0.02] rounded-lg">
                          <div className="flex items-center gap-4 text-sm">
                            <span>📅 {new Date(req.start_date).toLocaleDateString()}</span>
                            <span>→</span>
                            <span>📅 {new Date(req.end_date).toLocaleDateString()}</span>
                            <span className="font-medium">({req.total_days} day{req.total_days > 1 ? 's' : ''})</span>
                          </div>
                          {req.reason && (
                            <p className="mt-2 text-sm text-black/60">{req.reason}</p>
                          )}
                        </div>
                        <div className="mt-3 flex gap-2">
                          <button
                            onClick={() => handleApprove(pending.id)}
                            className="flex-1 py-2 rounded-lg bg-green-500 text-white text-sm font-medium flex items-center justify-center gap-2"
                          >
                            <CheckCircle size={16} />
                            Approve
                          </button>
                          <button
                            onClick={() => {
                              const reason = prompt('Rejection reason:')
                              if (reason) handleReject(pending.id, reason)
                            }}
                            className="flex-1 py-2 rounded-lg bg-red-50 text-red-600 text-sm font-medium flex items-center justify-center gap-2"
                          >
                            <XCircle size={16} />
                            Reject
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
      )}

      {/* Request Leave Modal */}
      {showModal && (
        <LeaveRequestModal
          leaveTypes={balances.map(b => b.leave_type)}
          balances={balances}
          onClose={() => setShowModal(false)}
          onSuccess={() => { setShowModal(false); loadData() }}
        />
      )}
    </div>
  )
}

function LeaveRequestModal({ 
  leaveTypes, balances, onClose, onSuccess 
}: { 
  leaveTypes: LeaveType[]
  balances: LeaveBalance[]
  onClose: () => void
  onSuccess: () => void
}) {
  const { staff } = useAuth()
  const [form, setForm] = useState({
    leave_type_id: leaveTypes[0]?.id || '',
    start_date: '',
    end_date: '',
    half_day: false,
    half_day_period: 'morning' as 'morning' | 'afternoon',
    reason: '',
  })
  const [submitting, setSubmitting] = useState(false)

  const selectedBalance = balances.find(b => b.leave_type_id === form.leave_type_id)
  const totalDays = form.start_date && form.end_date 
    ? Math.ceil((new Date(form.end_date).getTime() - new Date(form.start_date).getTime()) / (1000 * 60 * 60 * 24)) + 1
    : 0

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!staff?.id) return

    setSubmitting(true)
    try {
      await supabase.from('leave_requests').insert({
        staff_id: staff.id,
        leave_type_id: form.leave_type_id,
        start_date: form.start_date,
        end_date: form.end_date,
        total_days: form.half_day ? 0.5 : totalDays,
        half_day: form.half_day,
        half_day_period: form.half_day ? form.half_day_period : null,
        reason: form.reason,
        status: 'pending',
      })

      // Update pending balance
      if (selectedBalance) {
        await supabase.from('leave_balances').upsert({
          staff_id: staff.id,
          leave_type_id: form.leave_type_id,
          year: new Date().getFullYear(),
          pending_days: (selectedBalance.pending_days || 0) + (form.half_day ? 0.5 : totalDays),
        }, {
          onConflict: 'staff_id,leave_type_id,year',
        })
      }

      onSuccess()
    } catch (e) {
      console.error('Failed to submit leave request:', e)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="p-6 border-b border-black/[0.06]">
          <h2 className="text-lg font-bold">Request Leave</h2>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Leave Type</label>
            <select
              value={form.leave_type_id}
              onChange={e => setForm({ ...form, leave_type_id: e.target.value })}
              className="w-full px-4 py-3 rounded-xl border border-black/10"
              required
            >
              {leaveTypes.map(type => {
                const bal = balances.find(b => b.leave_type_id === type.id)
                return (
                  <option key={type.id} value={type.id}>
                    {type.name} ({bal?.available_days || 0} days available)
                  </option>
                )
              })}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Start Date</label>
              <input
                type="date"
                value={form.start_date}
                onChange={e => setForm({ ...form, start_date: e.target.value })}
                className="w-full px-4 py-3 rounded-xl border border-black/10"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">End Date</label>
              <input
                type="date"
                value={form.end_date}
                onChange={e => setForm({ ...form, end_date: e.target.value })}
                className="w-full px-4 py-3 rounded-xl border border-black/10"
                min={form.start_date}
                required
              />
            </div>
          </div>

          {totalDays === 1 && (
            <div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.half_day}
                  onChange={e => setForm({ ...form, half_day: e.target.checked })}
                  className="w-4 h-4 rounded"
                />
                <span className="text-sm">Half day only</span>
              </label>
              {form.half_day && (
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, half_day_period: 'morning' })}
                    className={`flex-1 py-2 rounded-lg text-sm ${
                      form.half_day_period === 'morning' 
                        ? 'bg-[var(--av-primary, #0891B2)] text-white' 
                        : 'bg-black/10'
                    }`}
                  >
                    Morning
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, half_day_period: 'afternoon' })}
                    className={`flex-1 py-2 rounded-lg text-sm ${
                      form.half_day_period === 'afternoon' 
                        ? 'bg-[var(--av-primary, #0891B2)] text-white' 
                        : 'bg-black/10'
                    }`}
                  >
                    Afternoon
                  </button>
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-2">Reason</label>
            <textarea
              value={form.reason}
              onChange={e => setForm({ ...form, reason: e.target.value })}
              className="w-full px-4 py-3 rounded-xl border border-black/10 resize-none"
              rows={3}
              placeholder="Brief description for your leave request"
            />
          </div>

          {totalDays > 0 && (
            <div className="p-3 bg-blue-50 rounded-lg text-sm text-blue-700">
              <strong>{form.half_day ? 0.5 : totalDays}</strong> day{totalDays !== 1 ? 's' : ''} will be deducted from your balance
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-3 rounded-xl border border-black/10 font-medium">
              Cancel
            </button>
            <button 
              type="submit" 
              disabled={submitting || totalDays === 0}
              className="flex-1 px-4 py-3 rounded-xl bg-[var(--av-primary, #0891B2)] text-white font-medium disabled:opacity-50"
            >
              {submitting ? 'Submitting...' : 'Submit Request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

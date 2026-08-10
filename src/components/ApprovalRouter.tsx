// Control-plane shared approval/routing abstraction (Last_3_Conversations §2:
// "No business module should reinvent its own identity, permissions, audit,
// workflow or rules engine"). This hook + component wrap the existing
// route_work / start_approval_protocol / get_pending_approvals RPCs so any
// business page can request, route and track an approval with one line —
// instead of each module rolling its own approval UI and SQL.
//
// Usage in a page:
//   const { requestApproval } = useApprovalRouting()
//   <button onClick={() => requestApproval({ entity_type:'invoice', entity_id, amount })}>Submit for approval</button>

import { useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../components/Toast'
import { ShieldCheck, Loader2 } from 'lucide-react'

type ApprovalRequest = {
  entity_type: string
  entity_id: string
  amount?: number
  summary?: string
  business_id?: string
}

export function useApprovalRouting() {
  const { staff } = useAuth()
  const { showToast } = useToast()
  const [submitting, setSubmitting] = useState(false)

  // Submit an entity for approval via the control plane.
  const requestApproval = useCallback(async (req: ApprovalRequest) => {
    if (!staff?.business_id) { showToast('Not signed in', 'error'); return null }
    setSubmitting(true)
    try {
      const { data, error } = await supabase.rpc('start_approval_protocol', {
        p_business_id: req.business_id || staff.business_id,
        p_entity_type: req.entity_type,
        p_entity_id: req.entity_id,
        p_amount: req.amount ?? null,
        p_summary: req.summary || `${req.entity_type} ${req.entity_id}`,
        p_requested_by: staff.id,
      })
      if (error) throw error
      showToast('Sent for approval', 'success')
      return data
    } catch (e: any) {
      showToast('Approval request failed: ' + (e.message || 'unknown'), 'error')
      return null
    } finally {
      setSubmitting(false)
    }
  }, [staff, showToast])

  // Route a piece of work to its owner/reviewer/approver via the control plane.
  const routeWork = useCallback(async (opts: { entity_type: string; entity_id: string; work_type?: string; priority?: string }) => {
    if (!staff?.business_id) { showToast('Not signed in', 'error'); return null }
    try {
      const { data, error } = await supabase.rpc('route_work', {
        p_business_id: staff.business_id,
        p_entity_type: opts.entity_type,
        p_entity_id: opts.entity_id,
        p_work_type: opts.work_type || 'review',
        p_priority: opts.priority || 'normal',
      })
      if (error) throw error
      return data
    } catch (e: any) {
      showToast('Routing failed: ' + (e.message || 'unknown'), 'error')
      return null
    }
  }, [staff, showToast])

  return { requestApproval, routeWork, submitting }
}

// Drop-in button: any page can render this to submit an entity for approval
// through the shared control plane, with consistent loading + toast UX.
export function ApprovalRequestButton({
  req, label = 'Submit for approval', onApproved,
}: {
  req: ApprovalRequest
  label?: string
  onApproved?: () => void
}) {
  const { requestApproval, submitting } = useApprovalRouting()
  return (
    <button
      onClick={async () => { const r = await requestApproval(req); if (r) onApproved?.() }}
      disabled={submitting}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--av-primary)] text-white text-sm font-medium hover:bg-[var(--av-primary-hover)] disabled:opacity-50"
    >
      {submitting ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
      {submitting ? 'Submitting…' : label}
    </button>
  )
}

// Reversibility — first-class undo/void/correct for consequential actions,
// with provenance (Master §18 "Temporal data, history & reversibility";
// Avenize Law 8: "every important decision should be reviewable").
// Records an action_reversal row: who reversed, when, why, a snapshot of
// the original, and the related approval — so the trail is complete.
//
// Usage:
//   const { reverse } = useReversal()
//   <ReverseButton entityType="invoice" entityId={id} snapshot={row} onReversed={reload} />

import { useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../components/Toast'
import { ShieldCheck, Loader2, X, Undo2 } from 'lucide-react'

type ReversalType = 'reverse' | 'void' | 'correct' | 'amend'

export function useReversal() {
  const { staff } = useAuth()
  const { showToast } = useToast()
  const [reversing, setReversing] = useState(false)

  const reverse = useCallback(async (opts: {
    entity_type: string
    entity_id: string
    reversal_type?: ReversalType
    reason: string
    snapshot?: any
    related_approval_id?: string
  }) => {
    if (!staff?.business_id) { showToast('Not signed in', 'error'); return false }
    setReversing(true)
    try {
      const { error } = await supabase.from('action_reversals').insert({
        business_id: staff.business_id,
        original_entity_type: opts.entity_type,
        original_entity_id: opts.entity_id,
        reversal_type: opts.reversal_type || 'reverse',
        reason: opts.reason,
        performed_by: staff.id,
        snapshot: opts.snapshot || null,
        related_approval_id: opts.related_approval_id || null,
      })
      if (error) throw error
      showToast(`${opts.reversal_type || 'Reverse'} recorded`, 'success')
      return true
    } catch (e: any) {
      showToast('Reversal failed: ' + (e.message || 'unknown'), 'error')
      return false
    } finally {
      setReversing(false)
    }
  }, [staff, showToast])

  return { reverse, reversing }
}

export function ReverseButton({
  entityType, entityId, snapshot, onReversed, label = 'Reverse',
}: {
  entityType: string
  entityId: string
  snapshot?: any
  onReversed?: () => void
  label?: string
}) {
  const { reverse, reversing } = useReversal()
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)} disabled={reversing}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-[var(--av-danger)] text-sm font-medium shadow-[var(--av-shadow-sm)] hover:shadow-[var(--av-shadow-md)] transition-shadow border border-[var(--av-border)] disabled:opacity-50">
        {reversing ? <Loader2 size={14} className="animate-spin" /> : <Undo2 size={14} />}
        {reversing ? 'Reversing…' : label}
      </button>
      {open && (
        <ReversalModal
          entityType={entityType}
          entityId={entityId}
          snapshot={snapshot}
          onClose={() => setOpen(false)}
          onDone={() => { setOpen(false); onReversed?.() }}
        />
      )}
    </>
  )
}

function ReversalModal({ entityType, entityId, snapshot, onClose, onDone }: {
  entityType: string; entityId: string; snapshot?: any; onClose: () => void; onDone: () => void
}) {
  const { reverse, reversing } = useReversal()
  const [type, setType] = useState<ReversalType>('reverse')
  const [reason, setReason] = useState('')
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-[var(--av-shadow-lg)]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-[var(--av-text)] flex items-center gap-2"><Undo2 size={18} className="text-[var(--av-danger)]" /> Reverse {entityType}</h2>
          <button onClick={onClose}><X size={18} className="text-[var(--av-text-muted)]" /></button>
        </div>
        <p className="text-sm text-[var(--av-text-secondary)] mb-4">
          This records a reversible action with full provenance — who, when, why, and a snapshot of the original. The original record is not deleted; the reversal is auditable.
        </p>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-[var(--av-text-secondary)] block mb-1">Action</label>
            <select value={type} onChange={e => setType(e.target.value as ReversalType)}
              className="w-full rounded-lg border border-[var(--av-border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--av-primary)]">
              <option value="reverse">Reverse</option>
              <option value="void">Void</option>
              <option value="correct">Correct</option>
              <option value="amend">Amend</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-[var(--av-text-secondary)] block mb-1">Reason (required)</label>
            <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3}
              className="w-full rounded-lg border border-[var(--av-border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--av-primary)]"
              placeholder="Why is this being reversed?" />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-sm text-[var(--av-text-secondary)]">Cancel</button>
          <button onClick={async () => {
            const ok = await reverse({ entity_type: entityType, entity_id: entityId, reversal_type: type, reason: reason.trim(), snapshot })
            if (ok) onDone()
          }} disabled={reversing || !reason.trim()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--av-danger)] text-white text-sm font-medium disabled:opacity-50">
            {reversing ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
            {reversing ? 'Recording…' : 'Record reversal'}
          </button>
        </div>
      </div>
    </div>
  )
}

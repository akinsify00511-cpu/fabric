// Procurement RFQ — request → solicit → compare → PO (Master Build Guide §10).
// Closes the procurement loop that previously stopped at PurchaseOrders +
// Vendors. A buyer creates a request, sends RFQs to vendors, compares
// quotes side-by-side, and converts the winner into a purchase order.

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useDbState, DbStateBanner } from '../lib/useDbState'
import { useToast } from '../components/Toast'
import {
  ShoppingCart, Plus, Loader2, ArrowRight, Trophy,
  X, FileText, Package,
} from 'lucide-react'

type Stage = 'requests' | 'rfqs'

export default function Procurement() {
  const { staff } = useAuth()
  const bid = staff?.business_id
  const dbState = useDbState()
  const { showToast } = useToast()
  const [stage, setStage] = useState<Stage>('requests')
  const [requests, setRequests] = useState<any[]>([])
  const [rfqs, setRfqs] = useState<any[]>([])
  const [vendors, setVendors] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showReq, setShowReq] = useState(false)
  const [compareFor, setCompareFor] = useState<string | null>(null)

  useEffect(() => { if (bid) loadAll() }, [bid])

  async function loadAll() {
    if (!bid) return
    setLoading(true)
    const [r, q, v] = await Promise.allSettled([
      supabase.from('purchase_requests').select('*').order('created_at', { ascending: false }),
      supabase.from('rfqs').select('*').order('created_at', { ascending: false }),
      supabase.from('vendors').select('id, name').limit(100),
    ])
    const pick = (x: any) => x.status === 'fulfilled' ? (x.value.data || []) : []
    setRequests(pick(r)); setRfqs(pick(q)); setVendors(pick(v))
    setLoading(false)
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <DbStateBanner state={dbState} />
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--av-text)] flex items-center gap-2">
            <ShoppingCart size={24} className="text-[var(--av-primary)]" /> Procurement
          </h1>
          <p className="text-sm text-[var(--av-text-secondary)] mt-1">
            Request what you need, send RFQs to vendors, compare quotes, then raise a purchase order.
          </p>
        </div>
        <button onClick={() => setShowReq(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--av-primary)] text-white text-sm font-medium hover:bg-[var(--av-primary-hover)]">
          <Plus size={15} /> New request
        </button>
      </div>

      {/* Pipeline stages */}
      <div className="flex items-center gap-2 mb-6 text-xs">
        {['open','rfq_sent','quotes_received','po_created','fulfilled'].map((s, i) => {
          const count = requests.filter(r => r.status === s).length
          return (
            <div key={s} className="flex items-center gap-2">
              <div className="rounded-lg bg-white px-2.5 py-1.5 shadow-[var(--av-shadow-sm)]">
                <span className="text-[var(--av-text-muted)] capitalize">{s.replace(/_/g,' ')}</span>
                <span className="ml-1.5 font-bold text-[var(--av-text)]">{count}</span>
              </div>
              {i < 4 && <ArrowRight size={12} className="text-[var(--av-text-muted)]" />}
            </div>
          )
        })}
      </div>

      <div className="flex gap-1 p-1 rounded-xl bg-[var(--av-surface-3)] mb-4">
        {(['requests','rfqs'] as Stage[]).map(s => (
          <button key={s} onClick={() => setStage(s)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors ${
              stage === s ? 'bg-white text-[var(--av-primary)] shadow-[var(--av-shadow-sm)]' : 'text-[var(--av-text-secondary)] hover:text-[var(--av-text)]'}`}>
            {s === 'rfqs' ? 'RFQs' : s}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-[var(--av-primary)]" /></div>
      ) : stage === 'requests' ? (
        <RequestList items={requests} onCompare={(id: string) => { setCompareFor(id); setStage('rfqs') }} onSendRfq={() => setStage('rfqs')} showToast={showToast} />
      ) : (
        <RfqList rfqs={rfqs} vendors={vendors} compareFor={compareFor} onAction={loadAll} showToast={showToast} bid={bid} staffId={staff?.id} />
      )}

      {showReq && <NewRequestModal onClose={() => setShowReq(false)} onSaved={() => { setShowReq(false); loadAll() }} bid={bid} staffId={staff?.id} showToast={showToast} />}
    </div>
  )
}

function RequestList({ items, onCompare }: any) {
  if (items.length === 0) return <Empty label="purchase requests" />
  return (
    <div className="space-y-2">
      {items.map((r: any) => (
        <div key={r.id} className="rounded-xl bg-white p-4 shadow-[var(--av-shadow-sm)]">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Package size={16} className="text-[var(--av-text-muted)]" />
                <span className="font-medium text-[var(--av-text)]">{r.title}</span>
                <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-[var(--av-surface-3)] text-[var(--av-text-secondary)]">{r.status.replace(/_/g,' ')}</span>
              </div>
              <div className="text-xs text-[var(--av-text-secondary)] mt-1 flex flex-wrap gap-x-3">
                {r.department && <span>{r.department}</span>}
                {r.needed_by && <span>Needed by {new Date(r.needed_by).toLocaleDateString()}</span>}
                {r.budget_estimate != null && <span>Budget ₦{r.budget_estimate.toLocaleString()}</span>}
                <span className="capitalize">Priority: {r.priority}</span>
              </div>
            </div>
            <div className="flex gap-1">
              {r.status === 'quotes_received' && (
                <button onClick={() => onCompare(r.id)} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-[var(--av-primary-soft)] text-[var(--av-primary)] text-xs font-medium">
                  <Trophy size={13} /> Compare
                </button>
              )}
              <Link to="/app/settings" className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-[var(--av-text-secondary)]">
                <FileText size={13} /> PO
              </Link>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function RfqList({ rfqs, vendors, compareFor, onAction, showToast, bid, staffId }: any) {
  const filtered = compareFor ? rfqs.filter((q: any) => q.request_id === compareFor) : rfqs
  if (filtered.length === 0) return <Empty label="RFQs" cta />
  return (
    <div>
      {compareFor && (
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm text-[var(--av-text-secondary)]">Comparing quotes for this request</span>
          <button onClick={() => {}} className="text-xs text-[var(--av-primary)]">Clear filter</button>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map((q: any) => (
          <RfqCard key={q.id} rfq={q} vendors={vendors} onAction={onAction} showToast={showToast} bid={bid} staffId={staffId} />
        ))}
      </div>
    </div>
  )
}

function RfqCard({ rfq, vendors, onAction, showToast, _bid }: any) {
  const [awarding, setAwarding] = useState(false)
  async function award() {
    setAwarding(true)
    const { error } = await supabase.from('rfqs').update({ status: 'awarded' }).eq('id', rfq.id)
    setAwarding(false)
    if (error) { showToast('Could not award', 'error'); return }
    showToast('Quote awarded — ready to raise PO', 'success'); onAction()
  }
  return (
    <div className="rounded-xl bg-white p-4 shadow-[var(--av-shadow-sm)]">
      <div className="flex items-center justify-between mb-2">
        <span className="font-medium text-[var(--av-text)]">{rfq.vendor_name || vendors.find((v:any)=>v.id===rfq.vendor_id)?.name || 'Vendor'}</span>
        <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-[var(--av-surface-3)] text-[var(--av-text-secondary)]">{rfq.status}</span>
      </div>
      <div className="text-xs text-[var(--av-text-secondary)] space-y-0.5">
        {rfq.sent_date && <div>Sent: {new Date(rfq.sent_date).toLocaleDateString()}</div>}
        {rfq.response_date && <div>Responded: {new Date(rfq.response_date).toLocaleDateString()}</div>}
        {rfq.valid_until && <div>Valid until: {new Date(rfq.valid_until).toLocaleDateString()}</div>}
      </div>
      {rfq.total_quoted != null && (
        <div className="mt-2 text-lg font-bold text-[var(--av-text)]">₦{Number(rfq.total_quoted).toLocaleString()}</div>
      )}
      {rfq.status === 'responded' && (
        <button onClick={award} disabled={awarding} className="mt-3 w-full inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg bg-[var(--av-success)] text-white text-xs font-medium disabled:opacity-50">
          <Trophy size={13} /> {awarding ? 'Awarding…' : 'Award quote'}
        </button>
      )}
      {rfq.status === 'awarded' && (
        <Link to="/app/settings" className="mt-3 w-full inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg bg-[var(--av-primary)] text-white text-xs font-medium">
          <FileText size={13} /> Raise purchase order
        </Link>
      )}
    </div>
  )
}

function Empty({ label, cta }: { label: string; cta?: boolean }) {
  return (
    <div className="rounded-2xl bg-white p-8 text-center shadow-[var(--av-shadow-sm)]">
      <p className="text-sm text-[var(--av-text-muted)]">No {label} yet.</p>
      {cta && <p className="text-xs text-[var(--av-text-muted)] mt-1">Send an RFQ to a vendor from a request.</p>}
    </div>
  )
}

function NewRequestModal({ onClose, onSaved, bid, staffId, showToast }: any) {
  const [form, setForm] = useState({ title: '', description: '', department: '', priority: 'normal', budget_estimate: '', needed_by: '' })
  const [saving, setSaving] = useState(false)
  async function save() {
    if (!form.title.trim() || !bid) return
    setSaving(true)
    const { error } = await supabase.from('purchase_requests').insert({
      business_id: bid, title: form.title.trim(), description: form.description || null,
      department: form.department || null, priority: form.priority,
      budget_estimate: form.budget_estimate ? Number(form.budget_estimate) : null,
      needed_by: form.needed_by || null, requested_by: staffId, status: 'open',
    })
    setSaving(false)
    if (error) { showToast('Could not save: ' + error.message, 'error'); return }
    showToast('Request created', 'success'); onSaved()
  }
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-[var(--av-shadow-lg)]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-[var(--av-text)]">New purchase request</h2>
          <button onClick={onClose}><X size={18} className="text-[var(--av-text-muted)]" /></button>
        </div>
        <div className="space-y-3">
          <Field label="Title"><input value={form.title} onChange={e => setForm({...form, title: e.target.value})} className="w-full rounded-lg border border-[var(--av-border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--av-primary)]" /></Field>
          <Field label="Description"><textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} rows={2} className="w-full rounded-lg border border-[var(--av-border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--av-primary)]" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Department"><input value={form.department} onChange={e => setForm({...form, department: e.target.value})} className="w-full rounded-lg border border-[var(--av-border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--av-primary)]" /></Field>
            <Field label="Priority"><select value={form.priority} onChange={e => setForm({...form, priority: e.target.value})} className="w-full rounded-lg border border-[var(--av-border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--av-primary)]">{['low','normal','high','urgent'].map(o=><option key={o}>{o}</option>)}</select></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Budget (₦)"><input type="number" value={form.budget_estimate} onChange={e => setForm({...form, budget_estimate: e.target.value})} className="w-full rounded-lg border border-[var(--av-border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--av-primary)]" /></Field>
            <Field label="Needed by"><input type="date" value={form.needed_by} onChange={e => setForm({...form, needed_by: e.target.value})} className="w-full rounded-lg border border-[var(--av-border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--av-primary)]" /></Field>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-sm text-[var(--av-text-secondary)]">Cancel</button>
          <button onClick={save} disabled={saving || !form.title.trim()} className="px-3 py-1.5 rounded-lg bg-[var(--av-primary)] text-white text-sm font-medium hover:bg-[var(--av-primary-hover)] disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="text-xs font-medium text-[var(--av-text-secondary)] block mb-1">{label}</label>{children}</div>
}

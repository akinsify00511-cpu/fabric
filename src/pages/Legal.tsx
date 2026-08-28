// Legal — contracts, cases, obligations, expiry & risk (Master Build Guide §10).
// Brings the legal domain into one workspace: contract lifecycle, active
// cases, upcoming obligations and expiry warnings. Previously only
// ElectronicSignatures + staff_contracts existed.

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useDbState, DbStateBanner } from '../lib/useDbState'
import { useToast } from '../components/Toast'
import { ClaimTag } from '../components/Evidence'
import {
  Scale, FileText, Gavel, ClipboardCheck, AlertTriangle,
  Plus, Loader2, CalendarClock, X,
} from 'lucide-react'

type Tab = 'contracts' | 'cases' | 'obligations'

export default function Legal() {
  const { staff } = useAuth()
  const bid = staff?.business_id
  const dbState = useDbState()
  const { showToast } = useToast()
  const [tab, setTab] = useState<Tab>('contracts')
  const [contracts, setContracts] = useState<any[]>([])
  const [cases, setCases] = useState<any[]>([])
  const [obligations, setObligations] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

  useEffect(() => { if (bid) loadAll() }, [bid])

  async function loadAll() {
    if (!bid) return
    setLoading(true)
    const [c, k, o] = await Promise.allSettled([
      supabase.from('legal_contracts').select('*').order('created_at', { ascending: false }),
      supabase.from('legal_cases').select('*').order('created_at', { ascending: false }),
      supabase.from('legal_obligations').select('*').order('due_date', { ascending: true }).limit(50),
    ])
    const pick = (r: any) => r.status === 'fulfilled' ? (r.value.data || []) : []
    setContracts(pick(c)); setCases(pick(k)); setObligations(pick(o))
    setLoading(false)
  }

  // Expiry & risk signals
  const now = new Date()
  const expiring = contracts.filter(c => {
    if (!c.end_date || c.status !== 'active') return false
    const days = (new Date(c.end_date).getTime() - now.getTime()) / 86400000
    return days >= 0 && days <= 60
  })
  const expired = contracts.filter(c => c.end_date && new Date(c.end_date) < now && c.status === 'active')
  const overdueOblig = obligations.filter(o => o.due_date && new Date(o.due_date) < now && o.status === 'pending')
  const openCases = cases.filter(c => !['closed','won','lost','settled'].includes(c.status))

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <DbStateBanner state={dbState} />
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--av-text)] flex items-center gap-2">
            <Scale size={24} className="text-[var(--av-primary)]" /> Legal
          </h1>
          <p className="text-sm text-[var(--av-text-secondary)] mt-1">
            Contracts, cases and obligations in one place. Spot what's expiring, overdue or at risk.
          </p>
        </div>
        <button onClick={() => setShowForm(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--av-primary)] text-white text-sm font-medium hover:bg-[var(--av-primary-hover)]">
          <Plus size={15} /> New
        </button>
      </div>

      {/* Risk signals */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Signal label="Expiring (60d)" count={expiring.length} tone="warn" icon={CalendarClock} />
        <Signal label="Expired" count={expired.length} tone="danger" icon={AlertTriangle} />
        <Signal label="Overdue obligations" count={overdueOblig.length} tone="danger" icon={ClipboardCheck} />
        <Signal label="Open cases" count={openCases.length} tone="info" icon={Gavel} />
      </div>

      <div className="flex gap-1 p-1 rounded-xl bg-[var(--av-surface-3)] mb-4">
        {(['contracts','cases','obligations'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors ${
              tab === t ? 'bg-white text-[var(--av-primary)] shadow-[var(--av-shadow-sm)]' : 'text-[var(--av-text-secondary)] hover:text-[var(--av-text)]'}`}>
            {t}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-[var(--av-primary)]" /></div>
      ) : tab === 'contracts' ? (
        <ContractList items={contracts} expiring={expiring} expired={expired} onAction={loadAll} showToast={showToast} />
      ) : tab === 'cases' ? (
        <CaseList items={cases} onAction={loadAll} showToast={showToast} />
      ) : (
        <ObligationList items={obligations} overdue={overdueOblig} onAction={loadAll} showToast={showToast} />
      )}

      {showForm && <NewContractModal onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); loadAll() }} bid={bid} staffId={staff?.id} showToast={showToast} />}
    </div>
  )
}

function Signal({ label, count, tone, icon: Icon }: { label: string; count: number; tone: 'warn'|'danger'|'info'; icon: any }) {
  const color = tone === 'danger' ? 'var(--av-danger)' : tone === 'warn' ? 'var(--av-warning)' : 'var(--av-info)'
  const bg = tone === 'danger' ? 'var(--av-danger-soft)' : tone === 'warn' ? 'var(--av-warning-soft)' : 'var(--av-info-soft)'
  return (
    <div className="rounded-xl bg-white p-3 shadow-[var(--av-shadow-sm)] flex items-center gap-2">
      <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: bg }}><Icon size={16} style={{ color }} /></div>
      <div>
        <div className="text-lg font-bold text-[var(--av-text)]">{count}</div>
        <div className="text-[11px] text-[var(--av-text-muted)]">{label}</div>
      </div>
    </div>
  )
}

function StatusPill({ status }: { status: string }) {
  const color = status === 'active' || status === 'open' ? 'var(--av-success)' : status === 'expired' || status === 'overdue' || status === 'disputed' ? 'var(--av-danger)' : status === 'expiring' || status === 'pending' ? 'var(--av-warning)' : 'var(--av-text-muted)'
  return <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded" style={{ color, backgroundColor: 'var(--av-surface-3)' }}>{status}</span>
}

function ContractList({ items, expiring, _expired }: any) {
  if (items.length === 0) return <Empty label="contracts" />
  return (
    <div className="space-y-2">
      {items.map((c: any) => (
        <div key={c.id} className="rounded-xl bg-white p-4 shadow-[var(--av-shadow-sm)]">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <FileText size={16} className="text-[var(--av-text-muted)]" />
                <span className="font-medium text-[var(--av-text)]">{c.title}</span>
                <StatusPill status={c.status} />
              </div>
              <div className="text-xs text-[var(--av-text-secondary)] mt-1 flex flex-wrap gap-x-3">
                {c.counterparty && <span>{c.counterparty}</span>}
                {c.contract_type && <span className="capitalize">{c.contract_type}</span>}
                {c.start_date && <span>{new Date(c.start_date).toLocaleDateString()} → {c.end_date ? new Date(c.end_date).toLocaleDateString() : '—'}</span>}
                {c.value != null && <span>₦{c.value.toLocaleString()}</span>}
              </div>
            </div>
            <div className="flex items-center gap-1">
              {expiring.includes(c) && <ClaimTag type="INFERENCE" />}
              {c.document_url && <a href={c.document_url} target="_blank" rel="noreferrer" className="text-xs text-[var(--av-primary)]">Open</a>}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function CaseList({ items, _onAction }: any) {
  if (items.length === 0) return <Empty label="cases" />
  return (
    <div className="space-y-2">
      {items.map((k: any) => (
        <div key={k.id} className="rounded-xl bg-white p-4 shadow-[var(--av-shadow-sm)]">
          <div className="flex items-center gap-2">
            <Gavel size={16} className="text-[var(--av-text-muted)]" />
            <span className="font-medium text-[var(--av-text)]">{k.title}</span>
            <StatusPill status={k.status} />
          </div>
          <div className="text-xs text-[var(--av-text-secondary)] mt-1 flex flex-wrap gap-x-3">
            {k.counterparty && <span>vs {k.counterparty}</span>}
            {k.case_type && <span className="capitalize">{k.case_type}</span>}
            {k.next_hearing_date && <span>Next hearing: {new Date(k.next_hearing_date).toLocaleDateString()}</span>}
            {k.estimated_exposure != null && <span>Exposure: ₦{k.estimated_exposure.toLocaleString()}</span>}
          </div>
        </div>
      ))}
    </div>
  )
}

function ObligationList({ items, overdue, _onAction }: any) {
  if (items.length === 0) return <Empty label="obligations" />
  return (
    <div className="space-y-2">
      {items.map((o: any) => (
        <div key={o.id} className="rounded-xl bg-white p-4 shadow-[var(--av-shadow-sm)]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ClipboardCheck size={16} className={overdue.includes(o) ? 'text-[var(--av-danger)]' : 'text-[var(--av-text-muted)]'} />
              <span className="font-medium text-[var(--av-text)]">{o.title}</span>
              <StatusPill status={o.status} />
            </div>
            {o.due_date && <span className={`text-xs ${overdue.includes(o) ? 'text-[var(--av-danger)] font-medium' : 'text-[var(--av-text-muted)]'}`}>Due {new Date(o.due_date).toLocaleDateString()}</span>}
          </div>
          {o.description && <p className="text-xs text-[var(--av-text-secondary)] mt-1">{o.description}</p>}
        </div>
      ))}
    </div>
  )
}

function Empty({ label }: { label: string }) {
  return (
    <div className="rounded-2xl bg-white p-8 text-center shadow-[var(--av-shadow-sm)]">
      <p className="text-sm text-[var(--av-text-muted)]">No {label} yet. Add one to start tracking.</p>
    </div>
  )
}

function NewContractModal({ onClose, onSaved, bid, staffId, showToast }: any) {
  const [form, setForm] = useState({ title: '', contract_type: 'agreement', counterparty: '', start_date: '', end_date: '', value: '', notes: '' })
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!form.title.trim() || !bid) return
    setSaving(true)
    const { error } = await supabase.from('legal_contracts').insert({
      business_id: bid, title: form.title.trim(),
      contract_type: form.contract_type, counterparty: form.counterparty || null,
      start_date: form.start_date || null, end_date: form.end_date || null,
      value: form.value ? Number(form.value) : null,
      notes: form.notes || null, owner_id: staffId, status: 'draft',
    })
    setSaving(false)
    if (error) { showToast('Could not save contract: ' + error.message, 'error'); return }
    showToast('Contract added', 'success'); onSaved()
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-[var(--av-shadow-lg)]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-[var(--av-text)]">New contract</h2>
          <button onClick={onClose}><X size={18} className="text-[var(--av-text-muted)]" /></button>
        </div>
        <div className="space-y-3">
          <Input label="Title" value={form.title} onChange={(v) => setForm({ ...form, title: v })} />
          <div className="grid grid-cols-2 gap-3">
            <Select label="Type" value={form.contract_type} options={['agreement','employment','vendor','lease','nda','service','partnership','other']} onChange={(v) => setForm({ ...form, contract_type: v })} />
            <Input label="Counterparty" value={form.counterparty} onChange={(v) => setForm({ ...form, counterparty: v })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Start date" type="date" value={form.start_date} onChange={(v) => setForm({ ...form, start_date: v })} />
            <Input label="End date" type="date" value={form.end_date} onChange={(v) => setForm({ ...form, end_date: v })} />
          </div>
          <Input label="Value (₦)" type="number" value={form.value} onChange={(v) => setForm({ ...form, value: v })} />
          <Input label="Notes" value={form.notes} onChange={(v) => setForm({ ...form, notes: v })} />
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-sm text-[var(--av-text-secondary)]">Cancel</button>
          <button onClick={save} disabled={saving || !form.title.trim()} className="px-3 py-1.5 rounded-lg bg-[var(--av-primary)] text-white text-sm font-medium hover:bg-[var(--av-primary-hover)] disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Input({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label className="text-xs font-medium text-[var(--av-text-secondary)] block mb-1">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)}
        className="w-full rounded-lg border border-[var(--av-border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--av-primary)]" />
    </div>
  )
}
function Select({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-xs font-medium text-[var(--av-text-secondary)] block mb-1">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="w-full rounded-lg border border-[var(--av-border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--av-primary)]">
        {options.map(o => <option key={o} value={o} className="capitalize">{o}</option>)}
      </select>
    </div>
  )
}

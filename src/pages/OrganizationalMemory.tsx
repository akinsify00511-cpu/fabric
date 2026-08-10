// Organizational Memory — the institutional learning loop (Avenize Law 15:
// "the product should become smarter because the business uses it").
// Surfaces retained lessons, lets the team search them, and feeds them
// back into recommendations. Backed by the organizational_memory table +
// the record_decision_learning / increment_user_learning RPCs.

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useDbState, DbStateBanner } from '../lib/useDbState'
import { useToast } from '../components/Toast'
import { ClaimTag, ClaimNote } from '../components/Evidence'
import {
  Brain, Plus, Search, Loader2, BookOpen, Sparkles, X, Lightbulb,
} from 'lucide-react'

export default function OrganizationalMemory() {
  const { staff } = useAuth()
  const bid = staff?.business_id
  const dbState = useDbState()
  const { showToast } = useToast()
  const [items, setItems] = useState<any[]>([])
  const [decisions, setDecisions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [showForm, setShowForm] = useState(false)

  useEffect(() => { if (bid) load() }, [bid])

  async function load() {
    if (!bid) return
    setLoading(true)
    const [m, d] = await Promise.allSettled([
      supabase.from('organizational_memory').select('*').eq('status','active').order('updated_at', { ascending: false }).limit(50),
      supabase.from('decision_log').select('*').order('decided_at', { ascending: false }).limit(20),
    ])
    const pick = (r: any) => r.status === 'fulfilled' ? (r.value.data || []) : []
    setItems(pick(m)); setDecisions(pick(d)); setLoading(false)
  }

  const filtered = q.trim()
    ? items.filter(i => (i.topic + ' ' + i.lesson).toLowerCase().includes(q.toLowerCase()))
    : items

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <DbStateBanner state={dbState} />
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--av-text)] flex items-center gap-2">
            <BookOpen size={24} className="text-[var(--av-primary)]" /> Organizational Memory
          </h1>
          <p className="text-sm text-[var(--av-text-secondary)] mt-1">
            What the business has learned. Lessons retained from past decisions, searchable so the same mistakes aren't made twice.
          </p>
        </div>
        <button onClick={() => setShowForm(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--av-primary)] text-white text-sm font-medium hover:bg-[var(--av-primary-hover)]">
          <Plus size={15} /> Record lesson
        </button>
      </div>

      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--av-text-muted)]" />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search lessons…"
          className="w-full rounded-lg border border-[var(--av-border)] pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--av-primary)]" />
      </div>

      {loading ? (
        <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-[var(--av-primary)]" /></div>
      ) : (
        <>
          <div className="space-y-2 mb-6">
            {filtered.length === 0 ? (
              <ClaimNote>No lessons recorded yet. Record the first one — what did the business learn from the last decision?</ClaimNote>
            ) : filtered.map(m => <MemoryCard key={m.id} mem={m} onAction={load} showToast={showToast} />)}
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-[var(--av-shadow-sm)]">
            <h2 className="font-semibold text-[var(--av-text)] flex items-center gap-2 mb-3">
              <Brain size={18} className="text-[var(--av-primary)]" /> Recent decisions
              <ClaimTag type="FACT" />
            </h2>
            {decisions.length === 0 ? (
              <p className="text-sm text-[var(--av-text-muted)]">No decisions logged. Decisions made in Approvals and Simulation flow here automatically.</p>
            ) : (
              <div className="space-y-2">
                {decisions.map(d => (
                  <div key={d.id} className="text-sm flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium text-[var(--av-text)]">{d.title}</div>
                      {d.summary && <div className="text-xs text-[var(--av-text-secondary)]">{d.summary}</div>}
                      {d.actual_outcome && <div className="text-xs text-[var(--av-success)] mt-0.5">Outcome: {d.actual_outcome}</div>}
                    </div>
                    <span className="text-[11px] text-[var(--av-text-muted)]">{d.decided_at && new Date(d.decided_at).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-4">
            <ClaimNote tone="info">
              Memory entries are <b>inferences</b> — lessons drawn from experience, not facts. Each carries a confidence so you can weigh how much to trust it.
            </ClaimNote>
          </div>
        </>
      )}

      {showForm && <NewMemoryModal onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load() }} bid={bid} staffId={staff?.id} showToast={showToast} />}
    </div>
  )
}

function MemoryCard({ mem, onAction, showToast }: any) {
  const [applying, setApplying] = useState(false)
  async function markApplied() {
    setApplying(true)
    const { error } = await supabase.from('organizational_memory').update({
      times_applied: (mem.times_applied || 0) + 1, last_applied_at: new Date().toISOString(),
    }).eq('id', mem.id)
    setApplying(false)
    if (error) { showToast('Could not update', 'error'); return }
    showToast('Marked as applied', 'success'); onAction()
  }
  return (
    <div className="rounded-xl bg-white p-4 shadow-[var(--av-shadow-sm)]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <Lightbulb size={15} className="text-[var(--av-warning)]" />
            <span className="font-medium text-[var(--av-text)]">{mem.topic}</span>
            <ClaimTag type="INFERENCE" confidence={mem.confidence} />
          </div>
          <p className="text-sm text-[var(--av-text-secondary)] mt-1">{mem.lesson}</p>
          {mem.context && <p className="text-xs text-[var(--av-text-muted)] mt-1">{mem.context}</p>}
          <div className="text-[11px] text-[var(--av-text-muted)] mt-2 flex gap-x-3">
            {mem.source && <span>Source: {mem.source}</span>}
            <span>Applied {mem.times_applied || 0}×</span>
            {mem.last_applied_at && <span>Last: {new Date(mem.last_applied_at).toLocaleDateString()}</span>}
          </div>
        </div>
        <button onClick={markApplied} disabled={applying} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-[var(--av-primary-soft)] text-[var(--av-primary)] text-xs font-medium disabled:opacity-50">
          <Sparkles size={12} /> Applied
        </button>
      </div>
    </div>
  )
}

function NewMemoryModal({ onClose, onSaved, bid, staffId, showToast }: any) {
  const [form, setForm] = useState({ topic: '', lesson: '', context: '', confidence: '0.6', source: '', applies_to: '' })
  const [saving, setSaving] = useState(false)
  async function save() {
    if (!form.topic.trim() || !form.lesson.trim() || !bid) return
    setSaving(true)
    const { error } = await supabase.from('organizational_memory').insert({
      business_id: bid, topic: form.topic.trim(), lesson: form.lesson.trim(),
      context: form.context || null, confidence: Number(form.confidence),
      source: form.source || null, applies_to: form.applies_to || null,
      recorded_by: staffId, status: 'active',
    })
    setSaving(false)
    if (error) { showToast('Could not save: ' + error.message, 'error'); return }
    showToast('Lesson recorded', 'success'); onSaved()
  }
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-[var(--av-shadow-lg)]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-[var(--av-text)]">Record a lesson</h2>
          <button onClick={onClose}><X size={18} className="text-[var(--av-text-muted)]" /></button>
        </div>
        <div className="space-y-3">
          <Field label="Topic"><input value={form.topic} onChange={e => setForm({...form, topic: e.target.value})} className="w-full rounded-lg border border-[var(--av-border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--av-primary)]" placeholder="e.g. Vendor onboarding, Cash collection" /></Field>
          <Field label="Lesson learned"><textarea value={form.lesson} onChange={e => setForm({...form, lesson: e.target.value})} rows={3} className="w-full rounded-lg border border-[var(--av-border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--av-primary)]" /></Field>
          <Field label="Context (optional)"><input value={form.context} onChange={e => setForm({...form, context: e.target.value})} className="w-full rounded-lg border border-[var(--av-border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--av-primary)]" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Confidence (0-1)"><input type="number" step="0.1" min="0" max="1" value={form.confidence} onChange={e => setForm({...form, confidence: e.target.value})} className="w-full rounded-lg border border-[var(--av-border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--av-primary)]" /></Field>
            <Field label="Source (optional)"><input value={form.source} onChange={e => setForm({...form, source: e.target.value})} className="w-full rounded-lg border border-[var(--av-border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--av-primary)]" /></Field>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-sm text-[var(--av-text-secondary)]">Cancel</button>
          <button onClick={save} disabled={saving || !form.topic.trim() || !form.lesson.trim()} className="px-3 py-1.5 rounded-lg bg-[var(--av-primary)] text-white text-sm font-medium hover:bg-[var(--av-primary-hover)] disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="text-xs font-medium text-[var(--av-text-secondary)] block mb-1">{label}</label>{children}</div>
}

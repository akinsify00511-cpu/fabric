// Risk Register — §48 of the Master Directive.
// First-class risk management: Risk → Probability → Impact → Owner →
// Mitigation → Deadline → Status → Evidence. Every risk has an explainable
// score (probability × impact, 1-25). Categories span the business.

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'
import { ClaimTag } from '../components/Evidence'
import {
  ShieldAlert, Plus, Trash2, Edit2, X, Check, Loader2, AlertTriangle,
} from 'lucide-react'

interface Risk {
  id: string
  title: string
  description: string | null
  category: string
  probability: number
  impact: number
  risk_score: number
  owner_id: string | null
  mitigation: string | null
  mitigation_status: string
  due_date: string | null
  status: string
  entity_type: string | null
  owner_name?: string
}

interface Staff { id: string; full_name: string }

const CATEGORIES = [
  { key: 'financial', label: 'Financial' },
  { key: 'customer', label: 'Customer' },
  { key: 'operational', label: 'Operational' },
  { key: 'project', label: 'Project' },
  { key: 'people', label: 'People' },
  { key: 'strategic', label: 'Strategic' },
  { key: 'compliance', label: 'Compliance' },
]

const STATUSES = ['open', 'monitoring', 'mitigated', 'closed', 'materialized']
const MITIGATION_STATUSES = ['none', 'planned', 'in_progress', 'mitigated', 'accepted']

function scoreTone(s: number) {
  if (s >= 15) return 'var(--av-danger)'
  if (s >= 9) return 'var(--av-warning)'
  return 'var(--av-success)'
}
function scoreLabel(s: number) {
  if (s >= 15) return 'High'
  if (s >= 9) return 'Medium'
  return 'Low'
}

export default function RiskRegister() {
  const { staff } = useAuth()
  const bid = staff?.business_id
  const { showToast } = useToast()
  const [risks, setRisks] = useState<Risk[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Risk | null>(null)
  const [staffList, setStaffList] = useState<Staff[]>([])

  const load = useCallback(async () => {
    if (!bid) return
    setLoading(true)
    try {
      const [{ data }, { data: s }] = await Promise.all([
        supabase.from('business_risks').select('*').eq('business_id', bid).order('risk_score', { ascending: false }),
        supabase.from('staff').select('id, full_name').eq('business_id', bid).limit(200),
      ])
      const staffMap = new Map((s || []).map(x => [x.id, x.full_name]))
      setRisks((data || []).map((r: any) => ({ ...r, owner_name: r.owner_id ? staffMap.get(r.owner_id) : undefined })))
      setStaffList(s || [])
    } catch (e) {
      console.error('Risk load failed:', e)
    } finally {
      setLoading(false)
    }
  }, [bid])

  useEffect(() => { load() }, [load])

  const filtered = filter === 'all' ? risks : risks.filter(r => r.category === filter)
  const openCount = risks.filter(r => r.status === 'open').length
  const highCount = risks.filter(r => r.risk_score >= 15).length

  const remove = async (id: string) => {
    if (!confirm('Delete this risk?')) return
    const { error } = await supabase.from('business_risks').delete().eq('id', id)
    if (error) { showToast('Failed to delete', 'error'); return }
    showToast('Risk deleted'); load()
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--av-text)] flex items-center gap-2">
            <ShieldAlert size={24} className="text-[var(--av-danger)]" /> Risk Register
          </h1>
          <p className="text-sm text-[var(--av-text-secondary)] mt-1">
            Track risks across the business. Each score = probability × impact. <ClaimTag type="FACT" />
          </p>
        </div>
        <button onClick={() => { setEditing(null); setShowModal(true) }}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--av-primary)] text-white text-sm font-medium hover:bg-[var(--av-primary-hover)]">
          <Plus size={16} /> New Risk
        </button>
      </div>

      {risks.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-5">
          <StatCard label="Total risks" value={risks.length} tone="var(--av-text)" />
          <StatCard label="Open" value={openCount} tone={openCount > 0 ? 'var(--av-warning)' : 'var(--av-success)'} />
          <StatCard label="High severity" value={highCount} tone={highCount > 0 ? 'var(--av-danger)' : 'var(--av-success)'} />
        </div>
      )}

      {risks.length > 0 && (
        <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1">
          <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>All</FilterChip>
          {CATEGORIES.map(c => (
            <FilterChip key={c.key} active={filter === c.key} onClick={() => setFilter(c.key)}>{c.label}</FilterChip>
          ))}
        </div>
      )}

      {loading ? (
        <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-[var(--av-primary)]" /></div>
      ) : risks.length === 0 ? (
        <div className="rounded-2xl bg-white p-10 text-center shadow-[var(--av-shadow-sm)]">
          <ShieldAlert size={32} className="mx-auto text-[var(--av-text-muted)] mb-3" />
          <p className="text-sm text-[var(--av-text-secondary)]">
            No risks recorded yet. Identifying and tracking risks is how a business stays ahead of problems.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(r => (
            <RiskRow key={r.id} risk={r}
              onEdit={() => { setEditing(r); setShowModal(true) }}
              onDelete={() => remove(r.id)}
              onStatusChange={async (status) => {
                const { error } = await supabase.from('business_risks').update({ status }).eq('id', r.id)
                if (error) { showToast('Failed to update', 'error'); return }
                load()
              }}
            />
          ))}
        </div>
      )}

      {showModal && (
        <RiskModal businessId={bid!} staffList={staffList} risk={editing}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); load() }}
        />
      )}
    </div>
  )
}

function RiskRow({ risk, onEdit, onDelete, onStatusChange }: {
  risk: Risk; onEdit: () => void; onDelete: () => void
  onStatusChange: (status: string) => void
}) {
  const tone = scoreTone(risk.risk_score)
  const catLabel = CATEGORIES.find(c => c.key === risk.category)?.label || risk.category
  return (
    <div className="rounded-2xl bg-white p-4 shadow-[var(--av-shadow-sm)]">
      <div className="flex items-start gap-3">
        <div className="shrink-0 w-12 h-12 rounded-xl flex flex-col items-center justify-center"
          style={{ background: `${tone}15` }}>
          <span className="text-lg font-bold" style={{ color: tone }}>{risk.risk_score}</span>
          <span className="text-[8px] uppercase" style={{ color: tone }}>{scoreLabel(risk.risk_score)}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-[var(--av-text)]">{risk.title}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--av-surface-3)] text-[var(--av-text-secondary)] uppercase">{catLabel}</span>
          </div>
          {risk.description && <p className="text-xs text-[var(--av-text-muted)] mt-0.5 line-clamp-2">{risk.description}</p>}
          <div className="flex items-center gap-3 mt-1.5 text-[10px] text-[var(--av-text-muted)]">
            <span>P: {risk.probability}/5 · I: {risk.impact}/5</span>
            {risk.owner_name && <span>{risk.owner_name}</span>}
            {risk.due_date && <span>due {risk.due_date}</span>}
            {risk.mitigation && <span className="text-[var(--av-text-secondary)]">mitigation: {risk.mitigation_status}</span>}
          </div>
          {risk.mitigation && (
            <p className="text-xs text-[var(--av-text-secondary)] mt-1 italic">↳ {risk.mitigation}</p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <select value={risk.status} onChange={e => onStatusChange(e.target.value)}
            className="text-[10px] px-1.5 py-1 rounded-lg border border-[var(--av-border)] bg-white capitalize outline-none">
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <button onClick={onEdit} className="p-1.5 rounded-lg text-[var(--av-text-muted)] hover:text-[var(--av-primary)]"><Edit2 size={14} /></button>
          <button onClick={onDelete} className="p-1.5 rounded-lg text-[var(--av-text-muted)] hover:text-[var(--av-danger)]"><Trash2 size={14} /></button>
        </div>
      </div>
    </div>
  )
}

function RiskModal({ businessId, staffList, risk, onClose, onSaved }: {
  businessId: string; staffList: Staff[]; risk: Risk | null
  onClose: () => void; onSaved: () => void
}) {
  const { showToast } = useToast()
  const [title, setTitle] = useState(risk?.title || '')
  const [description, setDescription] = useState(risk?.description || '')
  const [category, setCategory] = useState(risk?.category || 'operational')
  const [probability, setProbability] = useState(risk?.probability || 3)
  const [impact, setImpact] = useState(risk?.impact || 3)
  const [ownerId, setOwnerId] = useState(risk?.owner_id || '')
  const [mitigation, setMitigation] = useState(risk?.mitigation || '')
  const [mitStatus, setMitStatus] = useState(risk?.mitigation_status || 'planned')
  const [dueDate, setDueDate] = useState(risk?.due_date || '')
  const [status, setStatus] = useState(risk?.status || 'open')
  const [saving, setSaving] = useState(false)

  const previewScore = probability * impact

  const save = async () => {
    if (!title.trim()) { showToast('Title is required', 'error'); return }
    setSaving(true)
    const payload = {
      business_id: businessId,
      title: title.trim(),
      description: description.trim() || null,
      category, probability, impact,
      owner_id: ownerId || null,
      mitigation: mitigation.trim() || null,
      mitigation_status: mitStatus,
      due_date: dueDate || null,
      status,
    }
    const { error } = risk
      ? await supabase.from('business_risks').update(payload).eq('id', risk.id)
      : await supabase.from('business_risks').insert(payload)
    setSaving(false)
    if (error) { showToast('Failed to save risk', 'error'); return }
    showToast(risk ? 'Risk updated' : 'Risk created'); onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-[var(--av-shadow-lg)] w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-[var(--av-border)]">
          <h3 className="text-sm font-semibold text-[var(--av-text)]">{risk ? 'Edit Risk' : 'New Risk'}</h3>
          <button onClick={onClose} className="p-1 rounded-lg text-[var(--av-text-muted)]"><X size={16} /></button>
        </div>
        <div className="p-4">
          <div className="mb-3">
            <label className="block text-xs font-medium text-[var(--av-text-secondary)] mb-1">Risk title</label>
            <input value={title} onChange={e => setTitle(e.target.value)} className="modal-input" placeholder="e.g. Overdue receivables concentrated in 3 customers" />
          </div>
          <div className="mb-3">
            <label className="block text-xs font-medium text-[var(--av-text-secondary)] mb-1">Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} className="modal-input min-h-[60px]" />
          </div>
          <div className="mb-3">
            <label className="block text-xs font-medium text-[var(--av-text-secondary)] mb-1">Category</label>
            <select value={category} onChange={e => setCategory(e.target.value)} className="modal-input">
              {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs font-medium text-[var(--av-text-secondary)] mb-1">Probability (1-5)</label>
              <input type="number" min={1} max={5} value={probability} onChange={e => setProbability(Math.max(1, Math.min(5, +e.target.value || 3)))} className="modal-input" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--av-text-secondary)] mb-1">Impact (1-5)</label>
              <input type="number" min={1} max={5} value={impact} onChange={e => setImpact(Math.max(1, Math.min(5, +e.target.value || 3)))} className="modal-input" />
            </div>
          </div>
          <div className="mb-3 flex items-center gap-2 text-xs">
            <AlertTriangle size={14} style={{ color: scoreTone(previewScore) }} />
            <span style={{ color: scoreTone(previewScore) }}>
              Risk score: {previewScore} ({scoreLabel(previewScore)})
            </span>
          </div>
          <div className="mb-3">
            <label className="block text-xs font-medium text-[var(--av-text-secondary)] mb-1">Owner</label>
            <select value={ownerId} onChange={e => setOwnerId(e.target.value)} className="modal-input">
              <option value="">—</option>
              {staffList.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
            </select>
          </div>
          <div className="mb-3">
            <label className="block text-xs font-medium text-[var(--av-text-secondary)] mb-1">Mitigation plan</label>
            <textarea value={mitigation} onChange={e => setMitigation(e.target.value)} className="modal-input min-h-[50px]" placeholder="What will you do about it?" />
          </div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs font-medium text-[var(--av-text-secondary)] mb-1">Mitigation status</label>
              <select value={mitStatus} onChange={e => setMitStatus(e.target.value)} className="modal-input">
                {MITIGATION_STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--av-text-secondary)] mb-1">Due date</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="modal-input" />
            </div>
          </div>
          <div className="mb-3">
            <label className="block text-xs font-medium text-[var(--av-text-secondary)] mb-1">Status</label>
            <select value={status} onChange={e => setStatus(e.target.value)} className="modal-input capitalize">
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-[var(--av-border)]">
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-sm text-[var(--av-text-secondary)] hover:bg-[var(--av-surface-3)]">Cancel</button>
          <button onClick={save} disabled={saving}
            className="px-3 py-1.5 rounded-lg text-sm bg-[var(--av-primary)] text-white hover:bg-[var(--av-primary-hover)] disabled:opacity-50 flex items-center gap-1">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save
          </button>
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-[var(--av-shadow-sm)]">
      <div className="text-2xl font-bold" style={{ color: tone }}>{value}</div>
      <div className="text-[10px] text-[var(--av-text-muted)] uppercase tracking-wide">{label}</div>
    </div>
  )
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
        active ? 'bg-[var(--av-primary)] text-white' : 'bg-[var(--av-surface-3)] text-[var(--av-text-secondary)] hover:bg-[var(--av-border)]'
      }`}>
      {children}
    </button>
  )
}

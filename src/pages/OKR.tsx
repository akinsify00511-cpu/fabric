// OKR Engine — §24-25 of the Master Directive.
// Company → Department → Team → Individual → Objective → Key Results.
// Each KR is a measurable outcome (start/target/current, auto progress) that
// can optionally link to a governed KPI (086) so actuals flow from real data.
// Users can always answer "how was this calculated?" (§24).

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'
import { ClaimTag, ClaimNote } from '../components/Evidence'
import {
  Target, Plus, ChevronDown, ChevronRight, Trash2, Edit2, X, Check,
  Loader2, TrendingUp, Link2, Unlink, Calendar,
} from 'lucide-react'

interface Objective {
  id: string
  title: string
  description: string | null
  scope: 'company' | 'department' | 'team' | 'individual'
  owner_id: string | null
  period_start: string | null
  period_end: string | null
  status: string
  weight: number
  key_results: KeyResult[]
  owner_name?: string
  _progress?: number | null
}

interface KeyResult {
  id: string
  objective_id: string
  title: string
  unit: string
  start_value: number
  target_value: number
  current_value: number
  progress: number
  metric_key: string | null
  weight: number
  status: string
  due_date: string | null
}

interface Staff { id: string; full_name: string }

const SCOPE_LABELS: Record<string, string> = {
  company: 'Company', department: 'Department', team: 'Team', individual: 'Individual',
}

function fmt(n: number, unit: string) {
  if (n == null || isNaN(n)) return '—'
  if (unit === 'currency') {
    const abs = Math.abs(n)
    if (abs >= 1_000_000) return `₦${(n / 1_000_000).toFixed(1)}M`
    if (abs >= 1_000) return `₦${(n / 1_000).toFixed(0)}k`
    return `₦${n.toLocaleString()}`
  }
  if (unit === 'percent') return `${n.toFixed(1)}%`
  return n.toLocaleString()
}

export default function OKRPage() {
  const { staff } = useAuth()
  const bid = staff?.business_id
  const { showToast } = useToast()
  const [objectives, setObjectives] = useState<Objective[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [showObjModal, setShowObjModal] = useState(false)
  const [showKrModal, setShowKrModal] = useState<string | null>(null)
  const [staffList, setStaffList] = useState<Staff[]>([])
  const [availableMetrics, setAvailableMetrics] = useState<string[]>([])

  const load = useCallback(async () => {
    if (!bid) return
    setLoading(true)
    try {
      const [{ data: objs }, { data: krs }, { data: staffData }, { data: metrics }] = await Promise.all([
        supabase.from('strategic_objectives').select('*').eq('business_id', bid).order('created_at', { ascending: false }),
        supabase.from('key_results').select('*').eq('business_id', bid).order('created_at'),
        supabase.from('staff').select('id, full_name').eq('business_id', bid).limit(200),
        supabase.from('kpi_metrics').select('metric_key').eq('business_id', bid).not('metric_key', 'is', null),
      ])
      const krByObj = (krs || []).reduce<Record<string, KeyResult[]>>((acc, kr) => {
        (acc[kr.objective_id] ||= []).push(kr as KeyResult)
        return acc
      }, {})
      const staffMap = new Map((staffData || []).map(s => [s.id, s.full_name]))
      // Fetch per-objective progress via RPC (best-effort).
      const enriched = await Promise.all((objs || []).map(async (o: any) => {
        const { data: prog } = await supabase.rpc('objective_progress', { p_objective_id: o.id })
        return {
          ...o,
          key_results: krByObj[o.id] || [],
          owner_name: o.owner_id ? staffMap.get(o.owner_id) : undefined,
          _progress: prog,
        } as Objective
      }))
      setObjectives(enriched)
      setStaffList(staffData || [])
      setAvailableMetrics([...new Set((metrics || []).map((m: any) => m.metric_key))].sort())
    } catch (e) {
      console.error('OKR load failed:', e)
    } finally {
      setLoading(false)
    }
  }, [bid])

  useEffect(() => { load() }, [load])

  const toggle = (id: string) =>
    setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  const updateKr = async (id: string, patch: Partial<KeyResult>) => {
    const { error } = await supabase.from('key_results').update(patch).eq('id', id)
    if (error) { showToast('Failed to update key result', 'error'); return }
    showToast('Key result updated')
    load()
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--av-text)] flex items-center gap-2">
            <Target size={24} className="text-[var(--av-primary)]" /> Objectives & Key Results
          </h1>
          <p className="text-sm text-[var(--av-text-secondary)] mt-1">
            Set measurable goals. Link key results to your metrics so progress reflects real data. <ClaimTag type="FACT" />
          </p>
        </div>
        <button onClick={() => setShowObjModal(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--av-primary)] text-white text-sm font-medium hover:bg-[var(--av-primary-hover)]">
          <Plus size={16} /> New Objective
        </button>
      </div>

      {loading ? (
        <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-[var(--av-primary)]" /></div>
      ) : objectives.length === 0 ? (
        <div className="rounded-2xl bg-white p-10 text-center shadow-[var(--av-shadow-sm)]">
          <Target size={32} className="mx-auto text-[var(--av-text-muted)] mb-3" />
          <p className="text-sm text-[var(--av-text-secondary)]">
            No objectives yet. Create your first objective to start tracking what matters.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {objectives.map(obj => (
            <ObjectiveRow key={obj.id} obj={obj} expanded={expanded.has(obj.id)}
              onToggle={() => toggle(obj.id)}
              onAddKr={() => setShowKrModal(obj.id)}
              onUpdateKr={updateKr}
              onDeleteObj={async () => {
                if (!confirm('Delete this objective and its key results?')) return
                const { error } = await supabase.from('strategic_objectives').delete().eq('id', obj.id)
                if (error) { showToast('Failed to delete', 'error'); return }
                showToast('Objective deleted'); load()
              }}
            />
          ))}
        </div>
      )}

      {showObjModal && (
        <ObjectiveModal businessId={bid!} staffList={staffList}
          onClose={() => setShowObjModal(false)}
          onSaved={() => { setShowObjModal(false); load() }}
        />
      )}
      {showKrModal && (
        <KeyResultModal businessId={bid!} objectiveId={showKrModal} availableMetrics={availableMetrics}
          onClose={() => setShowKrModal(null)}
          onSaved={() => { setShowKrModal(null); load() }}
        />
      )}
    </div>
  )
}

function ObjectiveRow({ obj, expanded, onToggle, onAddKr, onUpdateKr, onDeleteObj }: {
  obj: Objective
  expanded: boolean
  onToggle: () => void
  onAddKr: () => void
  onUpdateKr: (id: string, patch: Partial<KeyResult>) => void
  onDeleteObj: () => void
}) {
  const prog = obj._progress
  const progTone = prog == null ? 'var(--av-text-muted)'
    : prog >= 70 ? 'var(--av-success)' : prog >= 40 ? 'var(--av-warning)' : 'var(--av-danger)'
  return (
    <div className="rounded-2xl bg-white shadow-[var(--av-shadow-sm)] overflow-hidden">
      <div className="p-4 flex items-center gap-3">
        <button onClick={onToggle} className="text-[var(--av-text-muted)] hover:text-[var(--av-text)]">
          {expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-[var(--av-text)]">{obj.title}</span>
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[var(--av-surface-3)] text-[var(--av-text-secondary)] uppercase">
              {SCOPE_LABELS[obj.scope] || obj.scope}
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded capitalize"
              style={{ background: 'var(--av-surface-3)', color: progTone }}>
              {obj.status}
            </span>
          </div>
          {obj.description && <p className="text-xs text-[var(--av-text-muted)] mt-0.5 line-clamp-1">{obj.description}</p>}
          <div className="flex items-center gap-3 mt-1 text-[10px] text-[var(--av-text-muted)]">
            {obj.owner_name && <span>{obj.owner_name}</span>}
            {obj.period_end && <span className="flex items-center gap-0.5"><Calendar size={10} /> due {obj.period_end}</span>}
            <span>{obj.key_results.length} key result{obj.key_results.length !== 1 ? 's' : ''}</span>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-lg font-bold" style={{ color: progTone }}>
            {prog != null ? `${Math.round(prog)}%` : '—'}
          </div>
          <div className="text-[9px] text-[var(--av-text-muted)]">progress</div>
        </div>
        <button onClick={onDeleteObj} className="p-1.5 rounded-lg text-[var(--av-text-muted)] hover:text-[var(--av-danger)]">
          <Trash2 size={15} />
        </button>
      </div>
      {expanded && (
        <div className="border-t border-[var(--av-border)] px-4 py-3 bg-[var(--av-surface-2)]">
          {obj.key_results.length === 0 ? (
            <p className="text-xs text-[var(--av-text-muted)] py-2">No key results yet.</p>
          ) : (
            <div className="space-y-2">
              {obj.key_results.map(kr => (
                <KeyResultRow key={kr.id} kr={kr} onUpdate={(patch) => onUpdateKr(kr.id, patch)} />
              ))}
            </div>
          )}
          <button onClick={onAddKr}
            className="mt-3 flex items-center gap-1 text-xs text-[var(--av-primary)] hover:underline">
            <Plus size={13} /> Add key result
          </button>
        </div>
      )}
    </div>
  )
}

function KeyResultRow({ kr, onUpdate }: { kr: KeyResult; onUpdate: (patch: Partial<KeyResult>) => void }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(String(kr.current_value ?? ''))
  const progTone = kr.progress >= 70 ? 'var(--av-success)' : kr.progress >= 40 ? 'var(--av-warning)' : 'var(--av-danger)'
  return (
    <div className="rounded-xl bg-white p-3 border border-[var(--av-border)]">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-[var(--av-text)]">{kr.title}</p>
          <div className="flex items-center gap-2 mt-1 text-[10px] text-[var(--av-text-muted)]">
            <span>{fmt(kr.start_value, kr.unit)} → {fmt(kr.target_value, kr.unit)}</span>
            {kr.metric_key && (
              <span className="flex items-center gap-0.5 text-[var(--av-primary)]"><Link2 size={10} /> {kr.metric_key}</span>
            )}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-sm font-semibold" style={{ color: progTone }}>{Math.round(kr.progress)}%</div>
        </div>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-[var(--av-surface-3)] overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(kr.progress, 100)}%`, background: progTone }} />
      </div>
      {editing ? (
        <div className="flex items-center gap-2 mt-2">
          <input type="number" value={val} onChange={e => setVal(e.target.value)}
            className="flex-1 px-2 py-1 text-xs rounded-lg border border-[var(--av-border)] focus:border-[var(--av-primary)] outline-none"
            placeholder="Current value" />
          <button onClick={() => { onUpdate({ current_value: parseFloat(val) || 0 }); setEditing(false) }}
            className="p-1.5 rounded-lg bg-[var(--av-primary)] text-white"><Check size={13} /></button>
          <button onClick={() => setEditing(false)}
            className="p-1.5 rounded-lg bg-[var(--av-surface-3)]"><X size={13} /></button>
        </div>
      ) : (
        <div className="flex items-center gap-2 mt-2">
          <span className="text-xs text-[var(--av-text-secondary)]">Current: <strong>{fmt(kr.current_value, kr.unit)}</strong></span>
          <button onClick={() => { setVal(String(kr.current_value ?? '')); setEditing(true) }}
            className="ml-auto flex items-center gap-0.5 text-[10px] text-[var(--av-primary)] hover:underline">
            <Edit2 size={10} /> Update
          </button>
        </div>
      )}
    </div>
  )
}

function ObjectiveModal({ businessId, staffList, onClose, onSaved }: {
  businessId: string; staffList: Staff[]; onClose: () => void; onSaved: () => void
}) {
  const { showToast } = useToast()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [scope, setScope] = useState<Objective['scope']>('company')
  const [ownerId, setOwnerId] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!title.trim()) { showToast('Title is required', 'error'); return }
    setSaving(true)
    const { error } = await supabase.from('strategic_objectives').insert({
      business_id: businessId,
      level: 'objective',
      title: title.trim(),
      description: description.trim() || null,
      scope, owner_id: ownerId || null,
      period_end: periodEnd || null,
      status: 'active',
    })
    setSaving(false)
    if (error) { showToast('Failed to create objective', 'error'); return }
    showToast('Objective created'); onSaved()
  }

  return (
    <Modal title="New Objective" onClose={onClose} onSave={save} saving={saving}>
      <Field label="Objective title">
        <input value={title} onChange={e => setTitle(e.target.value)}
          className="modal-input" placeholder="e.g. Grow Q3 revenue by 20%" />
      </Field>
      <Field label="Description (optional)">
        <textarea value={description} onChange={e => setDescription(e.target.value)}
          className="modal-input min-h-[60px]" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Scope">
          <select value={scope} onChange={e => setScope(e.target.value as Objective['scope'])} className="modal-input">
            {Object.entries(SCOPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Owner">
          <select value={ownerId} onChange={e => setOwnerId(e.target.value)} className="modal-input">
            <option value="">—</option>
            {staffList.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Due date (optional)">
        <input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} className="modal-input" />
      </Field>
    </Modal>
  )
}

function KeyResultModal({ businessId, objectiveId, availableMetrics, onClose, onSaved }: {
  businessId: string; objectiveId: string; availableMetrics: string[]
  onClose: () => void; onSaved: () => void
}) {
  const { showToast } = useToast()
  const [title, setTitle] = useState('')
  const [unit, setUnit] = useState('number')
  const [start, setStart] = useState('0')
  const [target, setTarget] = useState('')
  const [metricKey, setMetricKey] = useState('')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!title.trim() || !target) { showToast('Title and target are required', 'error'); return }
    setSaving(true)
    const { error } = await supabase.from('key_results').insert({
      business_id: businessId,
      objective_id: objectiveId,
      title: title.trim(),
      unit,
      start_value: parseFloat(start) || 0,
      target_value: parseFloat(target) || 0,
      current_value: parseFloat(start) || 0,
      metric_key: metricKey || null,
      status: 'not_started',
    })
    setSaving(false)
    if (error) { showToast('Failed to create key result', 'error'); return }
    showToast('Key result created'); onSaved()
  }

  return (
    <Modal title="New Key Result" onClose={onClose} onSave={save} saving={saving}>
      <Field label="What will you measure?">
        <input value={title} onChange={e => setTitle(e.target.value)}
          className="modal-input" placeholder="e.g. Collect ₦50M in overdue receivables" />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Unit">
          <select value={unit} onChange={e => setUnit(e.target.value)} className="modal-input">
            <option value="number">Number</option>
            <option value="currency">Currency (₦)</option>
            <option value="percent">Percent (%)</option>
          </select>
        </Field>
        <Field label="Start value">
          <input type="number" value={start} onChange={e => setStart(e.target.value)} className="modal-input" />
        </Field>
        <Field label="Target">
          <input type="number" value={target} onChange={e => setTarget(e.target.value)} className="modal-input" />
        </Field>
      </div>
      {availableMetrics.length > 0 && (
        <Field label="Link to metric (auto-updates actual from real data)">
          <select value={metricKey} onChange={e => setMetricKey(e.target.value)} className="modal-input">
            <option value="">Manual entry</option>
            {availableMetrics.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </Field>
      )}
      {metricKey && (
        <ClaimNote tone="info">
          Current value will sync automatically from the <strong>{metricKey}</strong> metric when metrics refresh.
        </ClaimNote>
      )}
    </Modal>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <label className="block text-xs font-medium text-[var(--av-text-secondary)] mb-1">{label}</label>
      {children}
    </div>
  )
}

function Modal({ title, onClose, onSave, saving, children }: {
  title: string; onClose: () => void; onSave: () => void; saving: boolean; children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-[var(--av-shadow-lg)] w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-[var(--av-border)]">
          <h3 className="text-sm font-semibold text-[var(--av-text)]">{title}</h3>
          <button onClick={onClose} className="p-1 rounded-lg text-[var(--av-text-muted)] hover:text-[var(--av-text)]"><X size={16} /></button>
        </div>
        <div className="p-4">{children}</div>
        <div className="flex justify-end gap-2 p-4 border-t border-[var(--av-border)]">
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-sm text-[var(--av-text-secondary)] hover:bg-[var(--av-surface-3)]">Cancel</button>
          <button onClick={onSave} disabled={saving}
            className="px-3 py-1.5 rounded-lg text-sm bg-[var(--av-primary)] text-white hover:bg-[var(--av-primary-hover)] disabled:opacity-50 flex items-center gap-1">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save
          </button>
        </div>
      </div>
    </div>
  )
}

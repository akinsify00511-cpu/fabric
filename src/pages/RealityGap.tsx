// Reality Gap — the four-reality model (Last_3_Conversations §6):
// compare INTENDED process vs RECORDED process vs ACTUAL behaviour vs
// OUTCOME. Surfaces where the business says work happens vs where it
// actually happens vs what it achieved, so the gap is visible and fixable.
// Backed by the reality_gaps table.
//
// Also surfaces an AUTO-DETECTED "Said vs Used" section (#12): tools the
// business selected at onboarding but never actually touched, computed by
// the said_vs_used RPC over user_workspace_selections + usage_events.

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { fetchSaidVsUsed, type SaidVsUsedRow } from '../lib/businessOS'
import { useDbState, DbStateBanner } from '../lib/useDbState'
import { useToast } from '../components/Toast'
import { ClaimTag } from '../components/Evidence'
import {
  GitCompare, Plus, Loader2, X, AlertTriangle, CheckCircle2, Clock, XCircle,
  TrendingDown,
} from 'lucide-react'

export default function RealityGap() {
  const { staff } = useAuth()
  const bid = staff?.business_id
  const dbState = useDbState()
  const { showToast } = useToast()
  const [gaps, setGaps] = useState<any[]>([])
  const [saidVsUsed, setSaidVsUsed] = useState<SaidVsUsedRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

  useEffect(() => { if (bid) load() }, [bid])

  async function load() {
    if (!bid) return
    setLoading(true)
    const { data } = await supabase.from('reality_gaps').select('*').order('detected_at', { ascending: false }).limit(50)
    setGaps(data || [])
    // Best-effort: stays empty if the RPC/migration isn't deployed yet (§24).
    try { setSaidVsUsed(await fetchSaidVsUsed(bid)) } catch { setSaidVsUsed([]) }
    setLoading(false)
  }

  const open = gaps.filter(g => !g.resolved_at)
  const resolved = gaps.filter(g => g.resolved_at)
  // The headline auto-gap: tools selected at onboarding but untouched in 30d.
  const selectedUnused = saidVsUsed.filter(r => r.gap_label === 'selected_unused')
  const usedUnselected = saidVsUsed.filter(r => r.gap_label === 'used_unselected')

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <DbStateBanner state={dbState} />
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--av-text)] flex items-center gap-2">
            <GitCompare size={24} className="text-[var(--av-primary)]" /> Reality Gap
          </h1>
          <p className="text-sm text-[var(--av-text-secondary)] mt-1">
            Where the intended process, the recorded process, the actual behaviour and the outcome diverge. Naming the gap is the first step to closing it.
          </p>
        </div>
        <button onClick={() => setShowForm(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--av-primary)] text-white text-sm font-medium hover:bg-[var(--av-primary-hover)]">
          <Plus size={15} /> Record gap
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-6">
        <Stat label="Open gaps" count={open.length} tone="warn" icon={AlertTriangle} />
        <Stat label="Resolved" count={resolved.length} tone="success" icon={CheckCircle2} />
        <Stat label="Critical" count={open.filter(g => g.severity === 'critical').length} tone="danger" icon={XCircle} />
      </div>

      {/* Auto-detected: Said vs Used (#12) — tools selected at onboarding but
          never touched, and tools used but never selected. Computed from real
          telemetry, not manual entry. Best-effort: hidden when no data. */}
      {!loading && (selectedUnused.length > 0 || usedUnselected.length > 0) && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-[var(--av-text-secondary)] uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <TrendingDown size={14} /> Auto-detected: said vs used
          </h2>
          <div className="space-y-2">
            {selectedUnused.map(r => (
              <SaidVsUsedRowCard key={`su-${r.module_key}`} row={r} tone="warn" />
            ))}
            {usedUnselected.map(r => (
              <SaidVsUsedRowCard key={`uu-${r.module_key}`} row={r} tone="info" />
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-[var(--av-primary)]" /></div>
      ) : (
        <div className="space-y-3">
          {gaps.length === 0 ? (
            <div className="rounded-2xl bg-white p-8 text-center shadow-[var(--av-shadow-sm)]">
              <CheckCircle2 size={32} className="mx-auto text-[var(--av-success)] mb-2" />
              <p className="text-sm text-[var(--av-text-muted)]">No reality gaps recorded. When process and reality diverge, record it here.</p>
            </div>
          ) : gaps.map(g => <GapCard key={g.id} gap={g} onAction={load} showToast={showToast} />)}
        </div>
      )}

      {showForm && <NewGapModal onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load() }} bid={bid} staffId={staff?.id} showToast={showToast} />}
    </div>
  )
}

function Stat({ label, count, tone, icon: Icon }: any) {
  const color = tone === 'danger' ? 'var(--av-danger)' : tone === 'warn' ? 'var(--av-warning)' : 'var(--av-success)'
  const bg = tone === 'danger' ? 'var(--av-danger-soft)' : tone === 'warn' ? 'var(--av-warning-soft)' : 'var(--av-success-soft)'
  return (
    <div className="rounded-xl bg-white p-3 shadow-[var(--av-shadow-sm)] flex items-center gap-2">
      <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: bg }}><Icon size={16} style={{ color }} /></div>
      <div><div className="text-lg font-bold text-[var(--av-text)]">{count}</div><div className="text-[11px] text-[var(--av-text-muted)]">{label}</div></div>
    </div>
  )
}

function GapCard({ gap, onAction, showToast }: any) {
  const [resolving, setResolving] = useState(false)
  async function resolve() {
    setResolving(true)
    const { error } = await supabase.from('reality_gaps').update({ resolved_at: new Date().toISOString(), resolution: 'Resolved' }).eq('id', gap.id)
    setResolving(false)
    if (error) { showToast('Could not resolve', 'error'); return }
    showToast('Gap resolved', 'success'); onAction()
  }
  const sevColor = gap.severity === 'critical' ? 'var(--av-danger)' : gap.severity === 'high' ? 'var(--av-danger)' : gap.severity === 'medium' ? 'var(--av-warning)' : 'var(--av-text-muted)'
  return (
    <div className="rounded-xl bg-white p-4 shadow-[var(--av-shadow-sm)]">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="font-medium text-[var(--av-text)] capitalize">{gap.entity_type}</span>
          <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded" style={{ color: sevColor, backgroundColor: 'var(--av-surface-3)' }}>{gap.severity}</span>
          <span className="text-[10px] text-[var(--av-text-muted)] capitalize">{gap.gap_type}</span>
          {gap.resolved_at ? <ClaimTag type="FACT" /> : <ClaimTag type="INFERENCE" />}
        </div>
        {!gap.resolved_at && (
          <button onClick={resolve} disabled={resolving} className="text-xs text-[var(--av-success)] font-medium disabled:opacity-50">Resolve</button>
        )}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
        <Reality label="Intended" value={gap.intended} />
        <Reality label="Recorded" value={gap.recorded} />
        <Reality label="Actual" value={gap.actual} />
        <Reality label="Outcome" value={gap.outcome} />
      </div>
      {gap.notes && <p className="text-xs text-[var(--av-text-muted)] mt-2">{gap.notes}</p>}
      <div className="text-[11px] text-[var(--av-text-muted)] mt-1 flex items-center gap-1"><Clock size={11} /> {gap.detected_at && new Date(gap.detected_at).toLocaleDateString()}</div>
    </div>
  )
}

function Reality({ label, value }: { label: string; value?: string }) {
  return (
    <div className="rounded-lg bg-[var(--av-surface-3)] p-2">
      <div className="text-[10px] uppercase font-semibold text-[var(--av-text-muted)]">{label}</div>
      <div className="text-[var(--av-text)] text-xs mt-0.5">{value || '—'}</div>
    </div>
  )
}

// A single auto-detected said-vs-used row. tone="warn" = selected but never
// touched (the headline waste); tone="info" = used but never selected (a
// hidden need). Honest: derived from real telemetry, tagged INFERENCE.
function SaidVsUsedRowCard({ row, tone }: { row: SaidVsUsedRow; tone: 'warn' | 'info' }) {
  const isWarn = tone === 'warn'
  const color = isWarn ? 'var(--av-warning)' : 'var(--av-primary)'
  const soft = isWarn ? 'var(--av-warning-soft)' : 'var(--av-primary-soft)'
  const label = isWarn
    ? `Selected “${row.module_key}” but no one used it in 30 days`
    : `“${row.module_key}” is being used but wasn't selected`
  return (
    <div className="rounded-xl bg-white p-3 shadow-[var(--av-shadow-sm)] flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded shrink-0" style={{ color, backgroundColor: soft }}>
          {row.gap_label.replace('_', ' ')}
        </span>
        <span className="text-sm text-[var(--av-text)] truncate">{label}</span>
        <ClaimTag type="INFERENCE" />
      </div>
      {row.event_count > 0 && (
        <span className="text-[11px] text-[var(--av-text-muted)] shrink-0">{row.event_count} events · {row.distinct_staff_used} staff</span>
      )}
    </div>
  )
}

function NewGapModal({ onClose, onSaved, bid, staffId, showToast }: any) {
  const [form, setForm] = useState({ entity_type: '', gap_type: 'process', severity: 'medium', intended: '', recorded: '', actual: '', outcome: '', notes: '' })
  const [saving, setSaving] = useState(false)
  async function save() {
    if (!form.entity_type.trim() || !bid) return
    setSaving(true)
    const { error } = await supabase.from('reality_gaps').insert({
      business_id: bid, entity_type: form.entity_type.trim(), gap_type: form.gap_type,
      severity: form.severity, intended: form.intended || null, recorded: form.recorded || null,
      actual: form.actual || null, outcome: form.outcome || null, notes: form.notes || null, owner_id: staffId,
    })
    setSaving(false)
    if (error) { showToast('Could not save: ' + error.message, 'error'); return }
    showToast('Reality gap recorded', 'success'); onSaved()
  }
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-[var(--av-shadow-lg)]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-[var(--av-text)]">Record a reality gap</h2>
          <button onClick={onClose}><X size={18} className="text-[var(--av-text-muted)]" /></button>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <Field label="Entity type"><input value={form.entity_type} onChange={e => setForm({...form, entity_type: e.target.value})} className="inp" placeholder="e.g. Sales, Onboarding" /></Field>
            <Field label="Gap type"><select value={form.gap_type} onChange={e => setForm({...form, gap_type: e.target.value})} className="inp">{['process','data','outcome','expectation','other'].map(o=><option key={o}>{o}</option>)}</select></Field>
            <Field label="Severity"><select value={form.severity} onChange={e => setForm({...form, severity: e.target.value})} className="inp">{['low','medium','high','critical'].map(o=><option key={o}>{o}</option>)}</select></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Intended"><textarea value={form.intended} onChange={e => setForm({...form, intended: e.target.value})} rows={2} className="inp" /></Field>
            <Field label="Recorded"><textarea value={form.recorded} onChange={e => setForm({...form, recorded: e.target.value})} rows={2} className="inp" /></Field>
            <Field label="Actual"><textarea value={form.actual} onChange={e => setForm({...form, actual: e.target.value})} rows={2} className="inp" /></Field>
            <Field label="Outcome"><textarea value={form.outcome} onChange={e => setForm({...form, outcome: e.target.value})} rows={2} className="inp" /></Field>
          </div>
          <Field label="Notes"><input value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} className="inp" /></Field>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-sm text-[var(--av-text-secondary)]">Cancel</button>
          <button onClick={save} disabled={saving || !form.entity_type.trim()} className="px-3 py-1.5 rounded-lg bg-[var(--av-primary)] text-white text-sm font-medium hover:bg-[var(--av-primary-hover)] disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="text-xs font-medium text-[var(--av-text-secondary)] block mb-1">{label}</label>{children}</div>
}

// Control & Audit Hub — surfaces the "Last 3 Conversations" addendum's
// control-plane and self-audit items: §2 Control Plane, §38 Circuit
// Breaker, §40/41 Drift, §45/46 Self-Audit, §47 Reconciliation, §54
// Incidents, §55 Anomalies, §53 Feature Flags, §52 Rollback versions.

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useDbState, DbStateBanner } from '../lib/useDbState'
import { useToast } from '../components/Toast'
import {
  ShieldCheck, AlertTriangle, RefreshCw, Activity, Flag,
  GitBranch, Loader2, Play, Ban, Zap, Workflow
} from 'lucide-react'

type Tab = 'audit' | 'reconciliation' | 'incidents' | 'anomalies' | 'flags' | 'drift'

const TABS: { key: Tab; label: string; icon: any }[] = [
  { key: 'audit', label: 'Self-Audit', icon: ShieldCheck },
  { key: 'reconciliation', label: 'Reconciliation', icon: RefreshCw },
  { key: 'incidents', label: 'Incidents', icon: AlertTriangle },
  { key: 'anomalies', label: 'Anomalies', icon: Activity },
  { key: 'flags', label: 'Feature Flags', icon: Flag },
  { key: 'drift', label: 'Drift', icon: Workflow },
]

export default function ControlAuditHub() {
  const { staff } = useAuth()
  const dbState = useDbState()
  const [tab, setTab] = useState<Tab>('audit')
  return (
    <div className="p-6 max-w-5xl mx-auto">
      <DbStateBanner state={dbState} />
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--av-text)] flex items-center gap-2">
          <ShieldCheck size={24} className="text-[var(--av-primary)]" /> Control & Audit
        </h1>
        <p className="text-sm text-[var(--av-text-secondary)] mt-1">
          The machinery that governs execution — separate from the business modules. Avenize audits its own health, reconciles its books, manages incidents, and controls configuration.
        </p>
      </div>

      <div className="flex flex-wrap gap-1 mb-5 bg-[var(--av-surface)] p-1 rounded-xl">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition ${tab === t.key ? 'bg-white text-[var(--av-primary)] shadow-[var(--av-elevation-1)]' : 'text-[var(--av-text-secondary)] hover:text-[var(--av-text)]'}`}>
            <t.icon size={16} /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'audit' && <AuditTab bid={staff?.business_id} />}
      {tab === 'reconciliation' && <ReconTab bid={staff?.business_id} />}
      {tab === 'incidents' && <IncidentsTab bid={staff?.business_id} />}
      {tab === 'anomalies' && <AnomaliesTab bid={staff?.business_id} />}
      {tab === 'flags' && <FlagsTab bid={staff?.business_id} />}
      {tab === 'drift' && <DriftTab bid={staff?.business_id} />}
    </div>
  )
}

function AuditTab({ bid }: { bid?: string }) {
  const [findings, setFindings] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)

  async function load() {
    if (!bid) return
    const { data } = await supabase.from('self_audit_findings').select('*')
      .eq('business_id', bid).eq('resolved', false).order('created_at', { ascending: false })
    setFindings(data || []); setLoading(false)
  }
  useEffect(() => { load() }, [bid])

  async function runAudit() {
    if (!bid) return
    setRunning(true)
    try {
      await Promise.all([
        supabase.rpc('run_system_health_audit', { p_business_id: bid }),
        supabase.rpc('run_business_health_audit', { p_business_id: bid }),
      ])
      await load()
    } finally { setRunning(false) }
  }

  if (loading) return <Loading />
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button onClick={runAudit} disabled={running}
          className="flex items-center gap-2 px-4 py-2 bg-[var(--av-primary)] text-white rounded-lg text-sm font-medium disabled:opacity-50">
          {running ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />} Run self-audit
        </button>
      </div>
      {findings.length === 0 ? (
        <Empty text="No open audit findings. Run a self-audit to scan system and business health." />
      ) : (
        <div className="space-y-2">
          {findings.map(f => (
            <div key={f.id} className="rounded-xl bg-white p-4 shadow-[var(--av-elevation-1)]">
              <div className="flex items-center justify-between">
                <span className="font-medium text-[var(--av-text)]">{f.title}</span>
                <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: f.severity === 'critical' ? 'rgba(234,67,53,0.15)' : 'rgba(251,188,5,0.15)', color: f.severity === 'critical' ? 'var(--av-error)' : 'var(--av-warning)' }}>
                  {f.severity}
                </span>
              </div>
              <div className="text-xs text-[var(--av-text-tertiary)] mt-0.5">{f.audit_dimension.replace(/_/g,' ')} · {f.category.replace(/_/g,' ')}</div>
              {f.detail && <p className="text-sm text-[var(--av-text-secondary)] mt-1">{f.detail}</p>}
              {f.suggested_remediation && <p className="text-xs text-[var(--av-primary)] mt-1">→ {f.suggested_remediation}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ReconTab({ bid }: { bid?: string }) {
  const [runs, setRuns] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [runningCheck, setRunningCheck] = useState<string | null>(null)
  const CHECKS = [
    { key: 'sales_finance_invoice_totals', label: 'Sales ↔ Finance (deal vs invoice totals)' },
    { key: 'inventory_accounting_stock_value', label: 'Inventory ↔ Accounting (stock value)' },
  ]

  async function load() {
    if (!bid) return
    const { data } = await supabase.from('reconciliation_runs').select('*')
      .eq('business_id', bid).order('created_at', { ascending: false }).limit(20)
    setRuns(data || []); setLoading(false)
  }
  useEffect(() => { load() }, [bid])

  async function runCheck(key: string) {
    if (!bid) return
    setRunningCheck(key)
    try { await supabase.rpc('run_reconciliation', { p_business_id: bid, p_check_name: key }); await load() }
    finally { setRunningCheck(null) }
  }

  if (loading) return <Loading />
  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-[var(--av-surface)] p-4 text-sm text-[var(--av-text-secondary)]">
        Reconciliation engine continuously reconciles domain pairs: Sales↔Finance, HR↔Payroll, Inventory↔Accounting, Bank↔Finance, CRM↔Marketing, Projects↔Resources, Assets↔Employees, Orders↔Inventory.
      </div>
      <div className="flex flex-wrap gap-2">
        {CHECKS.map(c => (
          <button key={c.key} onClick={() => runCheck(c.key)} disabled={runningCheck === c.key}
            className="flex items-center gap-1.5 px-3 py-2 bg-white border border-[var(--av-border)] rounded-lg text-sm hover:border-[var(--av-primary)] disabled:opacity-50">
            {runningCheck === c.key ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} {c.label}
          </button>
        ))}
      </div>
      {runs.length > 0 && (
        <div className="rounded-xl bg-white shadow-[var(--av-elevation-1)] divide-y divide-[var(--av-border)]">
          {runs.map(r => (
            <div key={r.id} className="px-4 py-3 flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-[var(--av-text)]">{r.source_domain} ↔ {r.target_domain}</div>
                <div className="text-xs text-[var(--av-text-tertiary)]">{r.check_name} · {new Date(r.created_at).toLocaleString()}</div>
              </div>
              <span className="text-xs px-2 py-1 rounded-full font-medium"
                style={{ backgroundColor: r.status === 'reconciled' ? 'rgba(52,168,83,0.15)' : r.status === 'discrepancy' ? 'rgba(234,67,53,0.15)' : 'rgba(154,160,166,0.15)', color: r.status === 'reconciled' ? 'var(--av-success)' : r.status === 'discrepancy' ? 'var(--av-error)' : 'var(--av-text-tertiary)' }}>
                {r.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function IncidentsTab({ bid }: { bid?: string }) {
  const [incidents, setIncidents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [newTitle, setNewTitle] = useState('')

  async function load() {
    if (!bid) return
    const { data } = await supabase.from('incidents').select('*')
      .eq('business_id', bid).order('created_at', { ascending: false })
    setIncidents(data || []); setLoading(false)
  }
  useEffect(() => { load() }, [bid])

  async function create() {
    if (!bid || !newTitle) return
    await supabase.from('incidents').insert({ business_id: bid, title: newTitle, status: 'detected' })
    setNewTitle(''); load()
  }
  async function advance(id: string, stage: string) {
    await supabase.rpc('advance_incident', { p_incident_id: id, p_stage: stage }); load()
  }

  if (loading) return <Loading />
  const STAGES = ['detected','classified','contained','escalated','recovered','verified','reported','learned']
  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-[var(--av-surface)] p-4 text-sm text-[var(--av-text-secondary)]">
        Incident lifecycle: Detect → Classify → Contain → Escalate → Recover → Verify → Report → Learn.
      </div>
      <div className="flex gap-2">
        <input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="New incident title…"
          className="flex-1 rounded-lg border border-[var(--av-border)] px-3 py-2 text-sm" />
        <button onClick={create} className="px-4 py-2 bg-[var(--av-primary)] text-white rounded-lg text-sm font-medium">Report</button>
      </div>
      {incidents.length === 0 ? <Empty text="No incidents recorded." /> : incidents.map(i => {
        const idx = STAGES.indexOf(i.status)
        return (
          <div key={i.id} className="rounded-xl bg-white p-4 shadow-[var(--av-elevation-1)]">
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium text-[var(--av-text)]">{i.title}</span>
              <span className="text-xs text-[var(--av-text-tertiary)]">{new Date(i.detected_at).toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-1 flex-wrap">
              {STAGES.map((s, n) => (
                <div key={s} className={`px-2 py-0.5 rounded text-[10px] font-medium ${n < idx ? 'bg-[var(--av-success)]/15 text-[var(--av-success)]' : n === idx ? 'bg-[var(--av-primary)] text-white' : 'bg-[var(--av-surface-2)] text-[var(--av-text-tertiary)]'}`}>{s}</div>
              ))}
            </div>
            {idx < STAGES.length - 1 && (
              <div className="flex justify-end mt-2">
                <button onClick={() => advance(i.id, STAGES[idx + 1])} className="text-xs px-3 py-1.5 bg-[var(--av-primary-soft)] text-[var(--av-primary)] rounded-lg font-medium">Advance →</button>
              </div>
            )}
            {i.lessons_learned && <p className="text-xs text-[var(--av-primary)] mt-2 italic">Lesson: {i.lessons_learned}</p>}
          </div>
        )
      })}
    </div>
  )
}

function AnomaliesTab({ bid }: { bid?: string }) {
  const [events, setEvents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!bid) return
    let active = true
    ;(async () => {
      const { data } = await supabase.from('anomaly_events').select('*')
        .eq('business_id', bid).order('created_at', { ascending: false }).limit(30)
      if (active) { setEvents(data || []); setLoading(false) }
    })()
    return () => { active = false }
  }, [bid])
  if (loading) return <Loading />
  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-[var(--av-surface)] p-4 text-sm text-[var(--av-text-secondary)] flex items-start gap-2">
        <Zap size={18} className="text-[var(--av-warning)] mt-0.5" />
        Monitors unusual transaction volume, API activity, permission changes, payroll changes, exports and autonomous actions. Critical anomalies can trip the AI circuit breaker.
      </div>
      {events.length === 0 ? <Empty text="No anomalies detected." /> : events.map(e => (
        <div key={e.id} className="rounded-xl bg-white p-4 shadow-[var(--av-elevation-1)]">
          <div className="flex items-center justify-between">
            <span className="font-medium text-[var(--av-text)] capitalize">{e.anomaly_type.replace(/_/g,' ')}</span>
            <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: e.severity === 'critical' ? 'rgba(234,67,53,0.15)' : 'rgba(251,188,5,0.15)', color: e.severity === 'critical' ? 'var(--av-error)' : 'var(--av-warning)' }}>{e.severity}</span>
          </div>
          {e.measured_value != null && e.baseline_value != null && (
            <div className="text-xs text-[var(--av-text-secondary)] mt-1">Measured {e.measured_value} vs baseline {e.baseline_value}</div>
          )}
        </div>
      ))}
    </div>
  )
}

function FlagsTab({ bid }: { bid?: string }) {
  const [flags, setFlags] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!bid) return
    let active = true
    ;(async () => {
      const { data } = await supabase.from('feature_flags').select('*')
        .or(`business_id.is.null,business_id.eq.${bid}`).order('created_at', { ascending: false })
      if (active) { setFlags(data || []); setLoading(false) }
    })()
    return () => { active = false }
  }, [bid])
  if (loading) return <Loading />
  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-[var(--av-surface)] p-4 text-sm text-[var(--av-text-secondary)] flex items-start gap-2">
        <Flag size={18} className="text-[var(--av-primary)] mt-0.5" />
        Tenant-specific rollout, beta features, gradual deployment and emergency shutdown. All flags are opt-in and reversible.
      </div>
      {flags.length === 0 ? <Empty text="No feature flags configured." /> : flags.map(f => (
        <div key={f.id} className="rounded-xl bg-white p-4 shadow-[var(--av-elevation-1)] flex items-center justify-between">
          <div>
            <div className="font-medium text-[var(--av-text)]">{f.flag_key}</div>
            <div className="text-xs text-[var(--av-text-tertiary)]">{f.description || '—'} · rollout {f.rollout_pct}%</div>
          </div>
          <div className="flex gap-2">
            {f.emergency_shutdown && <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--av-error)]/15 text-[var(--av-error)] font-bold uppercase">shutdown</span>}
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${f.enabled ? 'bg-[var(--av-success)]/15 text-[var(--av-success)]' : 'bg-[var(--av-surface-2)] text-[var(--av-text-tertiary)]'}`}>{f.enabled ? 'on' : 'off'}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

function DriftTab({ bid }: { bid?: string }) {
  const [findings, setFindings] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!bid) return
    let active = true
    ;(async () => {
      const { data } = await supabase.from('process_drift_findings').select('*')
        .eq('business_id', bid).eq('resolved', false).order('created_at', { ascending: false })
      if (active) { setFindings(data || []); setLoading(false) }
    })()
    return () => { active = false }
  }, [bid])
  if (loading) return <Loading />
  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-[var(--av-surface)] p-4 text-sm text-[var(--av-text-secondary)] flex items-start gap-2">
        <Workflow size={18} className="text-[var(--av-primary)] mt-0.5" />
        Process drift compares designed workflows with actual execution and detects repeated shadow processes. Automation drift validates automations against current roles, policies and org structure.
      </div>
      {findings.length === 0 ? <Empty text="No drift findings. Avenize compares what's designed against what actually happens." /> : findings.map(f => (
        <div key={f.id} className="rounded-xl bg-white p-4 shadow-[var(--av-elevation-1)]">
          <div className="flex items-center justify-between">
            <span className="font-medium text-[var(--av-text)] capitalize">{f.drift_type.replace(/_/g,' ')}</span>
            <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-[var(--av-warning)]/15 text-[var(--av-warning)]">{f.severity}</span>
          </div>
          {f.designed_workflow && <div className="text-xs text-[var(--av-text-secondary)] mt-1"><b>Designed:</b> {f.designed_workflow}</div>}
          {f.observed_behavior && <div className="text-xs text-[var(--av-text-secondary)]"><b>Observed:</b> {f.observed_behavior}</div>}
          {f.recommendation && <p className="text-xs text-[var(--av-primary)] mt-1">→ {f.recommendation}</p>}
        </div>
      ))}
    </div>
  )
}

function Loading() { return <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-[var(--av-primary)]" /></div> }
function Empty({ text }: { text: string }) { return <div className="rounded-xl bg-white p-6 text-center text-sm text-[var(--av-text-tertiary)] shadow-[var(--av-elevation-1)]">{text}</div> }

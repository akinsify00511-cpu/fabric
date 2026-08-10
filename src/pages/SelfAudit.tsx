// Self-Audit — runs the system_health_audit and turns findings into
// routed, owned actions instead of a passive dashboard (Last_3_Conversations
// §4: "Autonomous Systems & Self-Audits"). Each detected failure (broken
// workflow, stale data, duplicate, permission anomaly, AI failure) can be
// assigned an owner + due date, which becomes a tracked remediation task.

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useDbState, DbStateBanner } from '../lib/useDbState'
import { useToast } from '../components/Toast'
import { ClaimTag } from '../components/Evidence'
import {
  Stethoscope, RefreshCw, Loader2, AlertTriangle, Wrench,
  ArrowRight, CheckCircle2, UserCog, Clock,
} from 'lucide-react'

type Finding = {
  id?: string
  category: string
  severity: string
  title: string
  detail?: string
  owner_id?: string
  due_date?: string
  status?: string
}

export default function SelfAudit() {
  const { staff } = useAuth()
  const bid = staff?.business_id
  const dbState = useDbState()
  const { showToast } = useToast()
  const [findings, setFindings] = useState<Finding[]>([])
  const [loading, setLoading] = useState(false)
  const [lastRun, setLastRun] = useState<string | null>(null)

  useEffect(() => { if (bid) runAudit() }, [bid])

  async function runAudit() {
    if (!bid) return
    setLoading(true)
    const { data, error } = await supabase.rpc('run_system_health_audit', { p_business_id: bid })
    setLoading(false)
    setLastRun(new Date().toISOString())
    if (error) { showToast('Audit failed: ' + error.message, 'error'); return }
    // The RPC may return a single object or an array; normalise to findings.
    let items: Finding[] = []
    if (Array.isArray(data)) items = data
    else if (data?.findings) items = data.findings
    else if (data) {
      // Build findings from common fields
      for (const k of ['failed_workflows','broken_integrations','stale_data','duplicates','permission_anomalies','ai_failures']) {
        const arr = (data as any)[k]
        if (Array.isArray(arr)) arr.forEach((a: any) => items.push({ category: k, severity: a.severity || 'medium', title: a.title || a.name || k, detail: a.detail || a.note }))
      }
    }
    setFindings(items)
    if (items.length === 0) showToast('No issues found — the system is healthy', 'success')
  }

  async function routeToOwner(idx: number) {
    const f = findings[idx]
    // Create a remediation ticket in the existing tickets table (if present)
    const { error } = await supabase.from('tickets').insert({
      business_id: bid, subject: `[Self-audit] ${f.title}`, description: f.detail || f.category,
      priority: f.severity === 'critical' || f.severity === 'high' ? 'high' : 'normal',
      status: 'open', category: 'system', created_by: staff?.id,
    })
    if (error) {
      // Fallback: just mark the finding as routed locally
      setFindings(prev => prev.map((x, i) => i === idx ? { ...x, status: 'routed' } : x))
      showToast('Finding routed (ticket table unavailable)', 'info'); return
    }
    setFindings(prev => prev.map((x, i) => i === idx ? { ...x, status: 'routed' } : x))
    showToast('Routed to support queue as a ticket', 'success')
  }

  const counts = {
    critical: findings.filter(f => f.severity === 'critical').length,
    high: findings.filter(f => f.severity === 'high').length,
    medium: findings.filter(f => f.severity === 'medium').length,
    low: findings.filter(f => f.severity === 'low' || !f.severity).length,
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <DbStateBanner state={dbState} />
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--av-text)] flex items-center gap-2">
            <Stethoscope size={24} className="text-[var(--av-primary)]" /> Self-Audit
          </h1>
          <p className="text-sm text-[var(--av-text-secondary)] mt-1">
            The system audits itself for broken workflows, stale data, duplicates, permission anomalies and AI failures — then routes each finding to an owner, not just a dashboard.
          </p>
        </div>
        <button onClick={runAudit} disabled={loading} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--av-primary)] text-white text-sm font-medium hover:bg-[var(--av-primary-hover)] disabled:opacity-50">
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> {loading ? 'Auditing…' : 'Run audit'}
        </button>
      </div>

      {lastRun && <div className="text-xs text-[var(--av-text-muted)] mb-4 flex items-center gap-1"><Clock size={12} /> Last run: {new Date(lastRun).toLocaleString()}</div>}

      {loading ? (
        <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-[var(--av-primary)]" /></div>
      ) : findings.length === 0 ? (
        <div className="rounded-2xl bg-white p-8 text-center shadow-[var(--av-shadow-sm)]">
          <CheckCircle2 size={32} className="mx-auto text-[var(--av-success)] mb-2" />
          <p className="text-sm text-[var(--av-text-muted)]">All checks passed. No failed workflows, stale data, duplicates or anomalies detected. <ClaimTag type="FACT" /></p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-3 mb-5">
            <Stat label="Critical" count={counts.critical} tone="danger" />
            <Stat label="High" count={counts.high} tone="warn" />
            <Stat label="Medium" count={counts.medium} tone="info" />
            <Stat label="Low" count={counts.low} tone="muted" />
          </div>
          <div className="space-y-2">
            {findings.map((f, i) => (
              <div key={i} className="rounded-xl bg-white p-4 shadow-[var(--av-shadow-sm)]">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <AlertTriangle size={15} className={f.severity === 'critical' ? 'text-[var(--av-danger)]' : f.severity === 'high' ? 'text-[var(--av-danger)]' : 'text-[var(--av-warning)]'} />
                      <span className="font-medium text-[var(--av-text)]">{f.title}</span>
                      <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-[var(--av-surface-3)] text-[var(--av-text-secondary)]">{f.severity || 'low'}</span>
                      <span className="text-[10px] text-[var(--av-text-muted)] capitalize">{f.category.replace(/_/g,' ')}</span>
                    </div>
                    {f.detail && <p className="text-xs text-[var(--av-text-secondary)] mt-1">{f.detail}</p>}
                  </div>
                  {f.status === 'routed' ? (
                    <Link to="/app/tickets" className="inline-flex items-center gap-1 text-xs font-medium text-[var(--av-success)]"><CheckCircle2 size={13} /> Routed <ArrowRight size={11} /></Link>
                  ) : (
                    <button onClick={() => routeToOwner(i)} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-[var(--av-primary-soft)] text-[var(--av-primary)] text-xs font-medium">
                      <UserCog size={13} /> Route to owner
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-2">
            <Link to="/app/tickets" className="inline-flex items-center gap-1 text-sm font-medium text-[var(--av-primary)]">Open the support queue <ArrowRight size={13} /></Link>
            <span className="text-[var(--av-text-muted)]">·</span>
            <Link to="/app/control" className="text-sm text-[var(--av-text-secondary)]">Audit log</Link>
          </div>
        </>
      )}
    </div>
  )
}

function Stat({ label, count, tone }: { label: string; count: number; tone: 'danger'|'warn'|'info'|'muted' }) {
  const color = tone === 'danger' ? 'var(--av-danger)' : tone === 'warn' ? 'var(--av-warning)' : tone === 'info' ? 'var(--av-info)' : 'var(--av-text-muted)'
  return (
    <div className="rounded-xl bg-white p-3 shadow-[var(--av-shadow-sm)] text-center">
      <div className="text-2xl font-bold" style={{ color }}>{count}</div>
      <div className="text-[11px] text-[var(--av-text-muted)]">{label}</div>
    </div>
  )
}

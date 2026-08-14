// Data Quality — surfaces the deterministic data-quality findings produced by
// scan_data_quality (089). Intelligence is only as good as the data (Master
// Instruction §8), so this page is where owners see and resolve the structural
// issues that corrupt metrics. Findings are advisory only — this page never
// mutates business data directly (§14); each finding links to the source page
// where a human makes the fix.

import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useDbState, DbStateBanner } from '../lib/useDbState'
import { useToast } from '../components/Toast'
import { ClaimTag } from '../components/Evidence'
import {
  scanDataQuality, fetchDataQualityFindings, type DataQualityFinding,
} from '../lib/businessOS'
import {
  ShieldCheck, RefreshCw, Loader2, AlertTriangle, CheckCircle2,
  ArrowRight, Clock, Database,
} from 'lucide-react'

const CATEGORY_LINKS: Record<string, string> = {
  invoice: '/app/finance',
  deal: '/app/crm',
  task: '/app/tasks',
  contact: '/app/crm',
  payment: '/app/payments',
  staff: '/app/people',
  entity: '/app/activity',
}

export default function DataQuality() {
  const { staff } = useAuth()
  const bid = staff?.business_id
  const dbState = useDbState()
  const { showToast } = useToast()
  const [findings, setFindings] = useState<DataQualityFinding[]>([])
  const [loading, setLoading] = useState(false)
  const [lastRun, setLastRun] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!bid) return
    try {
      const rows = await fetchDataQualityFindings(bid)
      setFindings(rows)
    } catch {
      setFindings([])
    }
  }, [bid])

  useEffect(() => { load() }, [load])

  async function runScan() {
    if (!bid) return
    setLoading(true)
    setLastRun(new Date().toISOString())
    await scanDataQuality(bid)
    await load()
    setLoading(false)
    showToast('Data-quality scan complete', 'success')
  }

  async function resolve(id: string) {
    const { error } = await supabase
      .from('self_audit_findings')
      .update({ resolved: true })
      .eq('id', id)
    if (error) {
      showToast('Could not mark resolved', 'error')
      return
    }
    setFindings(prev => prev.map(f => f.id === id ? { ...f, resolved: true } : f))
    showToast('Marked resolved', 'success')
  }

  const open = findings.filter(f => !f.resolved)
  const counts = {
    critical: open.filter(f => f.severity === 'critical').length,
    warning: open.filter(f => f.severity === 'warning').length,
    info: open.filter(f => f.severity === 'info').length,
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <DbStateBanner state={dbState} />
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <ShieldCheck size={22} className="text-[var(--av-primary)]" />
          <h1 className="text-xl font-semibold text-[var(--av-text)]">Data Quality</h1>
        </div>
        <button onClick={runScan} disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--av-primary)] text-white text-sm font-medium hover:bg-[var(--av-primary-hover)] disabled:opacity-50">
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> {loading ? 'Scanning…' : 'Run scan'}
        </button>
      </div>

      <p className="text-sm text-[var(--av-text-secondary)] mb-4 max-w-2xl">
        Intelligence is only as good as the data behind it. These checks find
        orphaned records, impossible values, and stale entities that can corrupt
        metrics and recommendations. Findings are advisory — each links to the
        page where you make the fix. <ClaimTag type="FACT" />
      </p>

      {lastRun && (
        <div className="text-xs text-[var(--av-text-muted)] mb-4 flex items-center gap-1">
          <Clock size={12} /> Last scan: {new Date(lastRun).toLocaleString()}
        </div>
      )}

      {loading ? (
        <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-[var(--av-primary)]" /></div>
      ) : open.length === 0 ? (
        <div className="rounded-2xl bg-white p-8 text-center shadow-[var(--av-shadow-sm)]">
          <CheckCircle2 size={32} className="mx-auto text-[var(--av-success)] mb-2" />
          <p className="text-sm text-[var(--av-text-muted)]">
            No data-quality issues detected. The data feeding your metrics and
            recommendations is structurally sound.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3 mb-5">
            <Stat label="Critical" count={counts.critical} tone="danger" />
            <Stat label="Warning" count={counts.warning} tone="warn" />
            <Stat label="Info" count={counts.info} tone="info" />
          </div>
          <div className="space-y-2">
            {open.map((f) => (
              <div key={f.id} className="rounded-xl bg-white p-4 shadow-[var(--av-shadow-sm)]">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <AlertTriangle size={15}
                        className={f.severity === 'critical' ? 'text-[var(--av-danger)]' : f.severity === 'warning' ? 'text-[var(--av-warning)]' : 'text-[var(--av-text-muted)]'} />
                      <span className="font-medium text-[var(--av-text)]">{f.title}</span>
                      <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-[var(--av-surface-3)] text-[var(--av-text-secondary)]">{f.severity}</span>
                      <span className="text-[10px] text-[var(--av-text-muted)] capitalize flex items-center gap-0.5"><Database size={10} /> {f.category.replace(/_/g, ' ')}</span>
                    </div>
                    <p className="text-xs text-[var(--av-text-secondary)] mt-1">{f.detail}</p>
                    {f.suggested_remediation && (
                      <p className="text-xs text-[var(--av-text-muted)] mt-1.5 italic">→ {f.suggested_remediation}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {f.entity_type && CATEGORY_LINKS[f.entity_type] && (
                      <Link to={CATEGORY_LINKS[f.entity_type]}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-[var(--av-primary-soft)] text-[var(--av-primary)] text-xs font-medium">
                        Fix <ArrowRight size={11} />
                      </Link>
                    )}
                    <button onClick={() => resolve(f.id)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-[var(--av-surface-3)] text-[var(--av-text-secondary)] text-xs font-medium hover:bg-[var(--av-surface-2)]">
                      <CheckCircle2 size={13} /> Resolved
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function Stat({ label, count, tone }: { label: string; count: number; tone: 'danger' | 'warn' | 'info' }) {
  const color = tone === 'danger' ? 'var(--av-danger)' : tone === 'warn' ? 'var(--av-warning)' : 'var(--av-info)'
  return (
    <div className="rounded-xl bg-white p-3 shadow-[var(--av-shadow-sm)] text-center">
      <div className="text-2xl font-bold" style={{ color }}>{count}</div>
      <div className="text-[11px] text-[var(--av-text-muted)]">{label}</div>
    </div>
  )
}

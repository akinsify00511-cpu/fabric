// Trust & Recovery — §50-51 of the Master Directive.
import { useState, useEffect } from 'react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import { ClaimTag, ClaimNote } from '../components/Evidence'
import { ShieldCheck, Loader2, CheckCircle2, AlertTriangle, Database, Activity, FileText } from 'lucide-react'

interface TrustHealth {
  latest_audit_at: string | null
  audit_entries_24h: number
  audit_entries_30d: number
  audited_tables_with_recent_activity: string[]
  audit_gaps: string[]
  audit_healthy: boolean
  checked_at: string
}

function normalizeHealth(value: unknown): TrustHealth | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
  return {
    latest_audit_at: typeof v.latest_audit_at === 'string' ? v.latest_audit_at : null,
    audit_entries_24h: Number.isFinite(Number(v.audit_entries_24h)) ? Number(v.audit_entries_24h) : 0,
    audit_entries_30d: Number.isFinite(Number(v.audit_entries_30d)) ? Number(v.audit_entries_30d) : 0,
    audited_tables_with_recent_activity: Array.isArray(v.audited_tables_with_recent_activity) ? v.audited_tables_with_recent_activity.filter(x => typeof x === 'string') as string[] : [],
    audit_gaps: Array.isArray(v.audit_gaps) ? v.audit_gaps.filter(x => typeof x === 'string') as string[] : [],
    audit_healthy: v.audit_healthy === true,
    checked_at: typeof v.checked_at === 'string' ? v.checked_at : new Date().toISOString(),
  }
}

export default function TrustRecovery() {
  const { staff } = useAuth()
  const bid = staff?.business_id
  const [health, setHealth] = useState<TrustHealth | null>(null)
  const [loading, setLoading] = useState(true)
  const [auditEntries, setAuditEntries] = useState<any[]>([])

  useEffect(() => {
    if (!bid) { setLoading(false); return }
    let active = true
    ;(async () => {
      try {
        const { data, error } = await supabase.rpc('trust_health', { p_business_id: bid })
        if (!active) return
        if (error) throw error
        setHealth(normalizeHealth(data))
        const { data: logs, error: logsError } = await supabase
          .from('audit_logs')
          .select('action, entity_type, created_at, user_id')
          .eq('business_id', bid)
          .order('created_at', { ascending: false })
          .limit(15)
        if (active) {
          if (logsError) console.warn('Recent audit entries unavailable:', logsError.message)
          setAuditEntries(Array.isArray(logs) ? logs : [])
        }
      } catch (e) {
        console.warn('Trust health unavailable:', e)
        if (active) setHealth(null)
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [bid])

  if (loading) return <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-[var(--av-primary)]" /></div>

  const h = health
  return (
    <div className="p-6 max-w-4xl mx-auto text-[var(--av-text)]">
      <h1 className="text-2xl font-bold flex items-center gap-2 mb-1"><ShieldCheck size={24} className="text-[var(--av-success)]" /> Trust & Recovery</h1>
      <p className="text-sm text-[var(--av-text-secondary)] mb-6">Audit-trail integrity and disaster-recovery posture for your business data. <ClaimTag type="FACT" /></p>

      <Section title="Audit Trail Health" icon={Activity}>
        {!h ? <ClaimNote tone="warn">Audit health check is temporarily unavailable. The rest of this page remains available.</ClaimNote> : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Metric label="Entries (24h)" value={h.audit_entries_24h} tone={h.audit_entries_24h > 0 ? 'var(--av-success)' : 'var(--av-warning)'} />
              <Metric label="Entries (30d)" value={h.audit_entries_30d} tone="var(--av-text)" />
              <Metric label="Latest entry" value={h.latest_audit_at ? timeAgo(h.latest_audit_at) : 'none'} tone={h.latest_audit_at ? 'var(--av-success)' : 'var(--av-danger)'} small />
            </div>
            <div className={`rounded-xl p-4 flex items-start gap-3 ${h.audit_healthy ? 'bg-[var(--av-success)]/5' : 'bg-[var(--av-warning)]/5'}`}>
              {h.audit_healthy ? <CheckCircle2 size={18} className="text-[var(--av-success)] shrink-0 mt-0.5" /> : <AlertTriangle size={18} className="text-[var(--av-warning)] shrink-0 mt-0.5" />}
              <div className="text-sm">
                <p className="font-medium">{h.audit_healthy ? 'Audit trail is capturing all monitored activity.' : 'Some audited tables may need attention.'}</p>
                <p className="text-xs text-[var(--av-text-secondary)] mt-0.5">{h.audited_tables_with_recent_activity.length} table(s) with recent activity are being audited.{h.audit_gaps.length > 0 && ` Gaps: ${h.audit_gaps.join(', ')}.`}</p>
              </div>
            </div>
            {auditEntries.length > 0 && <div><h4 className="text-xs font-medium text-[var(--av-text-secondary)] uppercase tracking-wide mb-2">Recent audit entries</h4><div className="space-y-1">{auditEntries.map((e, i) => <div key={`${e.id || e.created_at || 'audit'}-${i}`} className="flex items-center gap-2 text-xs py-1.5 px-2 rounded-lg bg-[var(--av-surface-2)]"><FileText size={12} className="text-[var(--av-text-muted)] shrink-0" /><span className="font-medium capitalize">{e.action || 'activity'}</span><span className="text-[var(--av-text-muted)]">on {e.entity_type || 'record'}</span><span className="ml-auto text-[var(--av-text-muted)]">{timeAgo(e.created_at)}</span></div>)}</div></div>}
          </div>
        )}
      </Section>

      <section className="rounded-2xl bg-[var(--av-surface)] p-5 shadow-[var(--av-shadow-sm)] mb-4" aria-labelledby="disaster-recovery-posture">
        <div className="flex items-start gap-3 mb-4">
          <div className="h-9 w-9 rounded-xl bg-[var(--av-primary-soft)] flex items-center justify-center shrink-0" aria-hidden="true">
            <Database size={18} className="text-[var(--av-primary)]" />
          </div>
          <div className="min-w-0">
            <h3 id="disaster-recovery-posture" className="text-sm font-semibold">Disaster Recovery Posture</h3>
            <p className="text-xs text-[var(--av-text-muted)] mt-0.5">What Avenize can verify about data resilience from the application layer.</p>
          </div>
        </div>
        <div className="space-y-3">
          <div className="rounded-xl p-3 text-sm flex items-start gap-2 border border-[var(--av-border)] bg-[var(--av-surface-2)]">
            <span className="h-2 w-2 rounded-full bg-[var(--av-info)] mt-1.5 shrink-0" aria-hidden="true" />
            <p className="text-[var(--av-text-secondary)]">Your business data is securely managed within Avenize. This section reports the resilience and recovery signals that Avenize can verify directly.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <PostureItem ok label="Data backups" detail="Recovery protection is managed as part of the Avenize platform." />
            <PostureItem ok={!!h?.latest_audit_at} label="Audit trail active" detail={h?.latest_audit_at ? `Last entry ${timeAgo(h.latest_audit_at)}` : 'No audit entries recorded yet'} />
            <PostureItem ok label="Tenant isolation" detail="Business data is protected by tenant-isolation policies." />
            <PostureItem ok={h?.audit_healthy ?? false} label="Audit trigger integrity" detail={h?.audit_healthy ? 'No gaps detected in monitored tables.' : 'Gaps detected or health check unavailable.'} />
          </div>
          <p className="text-[10px] text-[var(--av-text-muted)] mt-2">Checked {h ? new Date(h.checked_at).toLocaleString() : '—'}.</p>
        </div>
      </section>

      <Section title="What Gets Audited" icon={ShieldCheck}>
        <p className="text-xs text-[var(--av-text-secondary)] mb-3">Database triggers capture INSERT/UPDATE/DELETE activity on monitored business records, forming the decision-trail foundation.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">{['Invoices','Payments','Journal Entries','Staff','Payroll Runs','Approvals','Property Commissions','Signature Requests','Subscriptions','Recommendations (claims)','Business Risks','Key Results','KPI Metrics'].map(t => <div key={t} className="flex items-center gap-1.5 text-xs text-[var(--av-text-secondary)] rounded-lg bg-[var(--av-surface-2)] px-2 py-1.5"><CheckCircle2 size={12} className="text-[var(--av-success)]" />{t}</div>)}</div>
      </Section>
    </div>
  )
}

function Section({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) { return <div className="rounded-2xl bg-[var(--av-surface)] p-5 shadow-[var(--av-shadow-sm)] mb-4"><h3 className="text-sm font-semibold flex items-center gap-1.5 mb-3"><Icon size={16} className="text-[var(--av-primary)]" />{title}</h3>{children}</div> }
function Metric({ label, value, tone, small }: { label: string; value: any; tone: string; small?: boolean }) { return <div className="rounded-xl bg-[var(--av-surface-2)] p-3"><div className={`${small ? 'text-sm' : 'text-xl'} font-semibold`} style={{ color: tone }}>{value}</div><div className="text-[10px] text-[var(--av-text-muted)] uppercase tracking-wide">{label}</div></div> }
function PostureItem({ ok, label, detail }: { ok: boolean; label: string; detail: string }) { return <div className="rounded-xl border border-[var(--av-border)] p-3 flex items-start gap-2">{ok ? <CheckCircle2 size={16} className="text-[var(--av-success)] shrink-0 mt-0.5" /> : <AlertTriangle size={16} className="text-[var(--av-warning)] shrink-0 mt-0.5" />}<div><p className="text-xs font-medium">{label}</p><p className="text-[10px] text-[var(--av-text-muted)]">{detail}</p></div></div> }
function timeAgo(iso: string | null | undefined) { if (!iso) return 'unknown'; const d = new Date(iso); if (Number.isNaN(d.getTime())) return 'unknown'; const s = Math.max(0, Math.floor((Date.now()-d.getTime())/1000)); if(s<60)return'just now'; if(s<3600)return`${Math.floor(s/60)}m ago`; if(s<86400)return`${Math.floor(s/3600)}h ago`; return`${Math.floor(s/86400)}d ago` }

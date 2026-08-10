// Governance & Memory Hub — surfaces Layer 2 governance items:
// organizational memory + learning loop, authority graph, AI role
// architecture, progressive automation, convenience index, continuity.

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useDbState, DbStateBanner } from '../lib/useDbState'
import {
  Shield, Brain, Repeat, Gauge, Database, BookOpen,
  Loader2, Plus, Check, AlertTriangle, Network
} from 'lucide-react'

type Tab = 'memory' | 'authority' | 'ai' | 'automation' | 'convenience' | 'continuity'

const TABS: { key: Tab; label: string; icon: any }[] = [
  { key: 'memory', label: 'Memory & Learning', icon: BookOpen },
  { key: 'authority', label: 'Authority Graph', icon: Shield },
  { key: 'ai', label: 'AI Roles', icon: Brain },
  { key: 'automation', label: 'Automations', icon: Repeat },
  { key: 'convenience', label: 'Convenience Index', icon: Gauge },
  { key: 'continuity', label: 'Continuity', icon: Database },
]

export default function GovernanceHub() {
  const { staff } = useAuth()
  const dbState = useDbState()
  const [tab, setTab] = useState<Tab>('memory')
  return (
    <div className="p-6 max-w-5xl mx-auto">
      <DbStateBanner state={dbState} />
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--av-text)] flex items-center gap-2">
          <Shield size={24} className="text-[var(--av-primary)]" /> Governance & Memory
        </h1>
        <p className="text-sm text-[var(--av-text-secondary)] mt-1">
          How Avenize remembers, delegates, automates and protects — within human-governed boundaries.
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

      {tab === 'memory' && <MemoryTab bid={staff?.business_id} />}
      {tab === 'authority' && <AuthorityTab bid={staff?.business_id} staffId={staff?.id} />}
      {tab === 'ai' && <AITab bid={staff?.business_id} />}
      {tab === 'automation' && <AutomationTab bid={staff?.business_id} />}
      {tab === 'convenience' && <ConvenienceTab bid={staff?.business_id} />}
      {tab === 'continuity' && <ContinuityTab bid={staff?.business_id} />}
    </div>
  )
}

// ---------- Organizational Memory + Learning Loop ----------
function MemoryTab({ bid }: { bid?: string }) {
  const [decisions, setDecisions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!bid) return
    let active = true
    ;(async () => {
      try {
        const { data } = await supabase.from('decisions').select('*')
          .eq('business_id', bid).order('decided_at', { ascending: false }).limit(20)
        if (active) setDecisions(data || [])
      } catch {} finally { if (active) setLoading(false) }
    })()
    return () => { active = false }
  }, [bid])

  if (loading) return <Loading />
  const reviewed = decisions.filter(d => d.status === 'reviewed')
  const pendingReview = decisions.filter(d => d.status === 'made' && d.review_date)

  return (
    <div className="space-y-5">
      <div className="rounded-xl bg-[var(--av-primary-soft)] p-4 text-sm text-[var(--av-primary)]">
        <b>Institutional Learning Loop:</b> Hypothesis → Decision → Action → Result → Comparison → Learning. Record what you expected, then what actually happened, so future decisions benefit.
      </div>
      {pendingReview.length > 0 && (
        <div className="rounded-xl border border-[var(--av-warning)]/30 bg-[var(--av-warning)]/5 p-4">
          <div className="font-medium text-[var(--av-warning)] flex items-center gap-2"><AlertTriangle size={16} /> {pendingReview.length} decision(s) due for review</div>
          {pendingReview.map(d => <div key={d.id} className="text-sm mt-1 text-[var(--av-text-secondary)]">{d.title} — review by {d.review_date}</div>)}
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {decisions.map(d => (
          <div key={d.id} className="rounded-xl bg-white p-4 shadow-[var(--av-elevation-1)]">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-[var(--av-text)]">{d.title}</h3>
              <ClaimTag type="DECISION" />
            </div>
            <p className="text-xs text-[var(--av-text-secondary)] mt-1">Hypothesis: {d.hypothesis}</p>
            {d.actual_outcome && <p className="text-xs text-[var(--av-success)] mt-1">Outcome: {d.actual_outcome}</p>}
            {d.what_learned && <p className="text-xs text-[var(--av-primary)] mt-1 italic">Learned: {d.what_learned}</p>}
            {d.learning_tags?.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {d.learning_tags.map((t: string) => <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--av-surface-2)] text-[var(--av-text-secondary)]">{t}</span>)}
              </div>
            )}
            {!d.communicated && <p className="text-[11px] text-[var(--av-error)] mt-2">⚠ Not communicated to affected teams</p>}
          </div>
        ))}
      </div>
      {reviewed.length === 0 && decisions.length > 0 && <p className="text-sm text-[var(--av-text-tertiary)]">No decisions have been reviewed yet — close the loop by recording what actually happened.</p>}
    </div>
  )
}

// ---------- Authority Graph ----------
function AuthorityTab({ bid, staffId }: { bid?: string; staffId?: string }) {
  const [auth, setAuth] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!bid) return
    let active = true
    ;(async () => {
      try {
        const { data } = await supabase.from('authority_graph').select('*')
          .eq('business_id', bid).eq('is_active', true).order('entity_type')
        if (active) setAuth(data || [])
      } catch {} finally { if (active) setLoading(false) }
    })()
    return () => { active = false }
  }, [bid])

  if (loading) return <Loading />
  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-[var(--av-surface)] p-4 text-sm text-[var(--av-text-secondary)] flex items-start gap-2">
        <Network size={18} className="text-[var(--av-primary)] mt-0.5" />
        An organogram shows reporting lines. This is the <b>authority graph</b> — who can approve (with limits), own, delegate, and access what, under which policy.
      </div>
      {auth.length === 0 ? (
        <Empty text="No authority entries yet. Define who can approve what, up to which limit, and who delegates for them." />
      ) : (
        <div className="rounded-xl bg-white shadow-[var(--av-elevation-1)] divide-y divide-[var(--av-border)]">
          {auth.map(a => (
            <div key={a.id} className="px-4 py-3 flex items-center justify-between">
              <div>
                <div className="font-medium text-[var(--av-text)] text-sm">{a.authority_type} — {a.entity_type}</div>
                <div className="text-xs text-[var(--av-text-secondary)]">Scope: {a.scope_type || 'business'} · Limit: {a.approval_limit ? `${a.approval_limit} ${a.currency}` : 'unlimited'}</div>
              </div>
              {a.delegate_to && <span className="text-xs px-2 py-1 rounded-lg bg-[var(--av-info)]/10 text-[var(--av-info)]">delegated{a.delegation_active ? ' · active' : ''}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------- AI Role Architecture ----------
function AITab({ bid }: { bid?: string }) {
  const [agents, setAgents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!bid) return
    let active = true
    ;(async () => {
      try {
        let { data } = await supabase.from('ai_agents').select('*').eq('business_id', bid)
        if (!data || data.length === 0) {
          await supabase.rpc('seed_ai_roles', { p_business_id: bid })
          const r = await supabase.from('ai_agents').select('*').eq('business_id', bid)
          data = r.data || []
        }
        if (active) setAgents(data || [])
      } catch {} finally { if (active) setLoading(false) }
    })()
    return () => { active = false }
  }, [bid])

  if (loading) return <Loading />
  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-[var(--av-surface)] p-4 text-sm text-[var(--av-text-secondary)]">
        AI operates inside authorization, audit, privacy and human-governance boundaries. High-impact employment, financial, legal and compliance decisions always require authorized human review.
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {agents.map(a => (
          <div key={a.id} className="rounded-xl bg-white p-4 shadow-[var(--av-elevation-1)]">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-[var(--av-text)] flex items-center gap-2"><Brain size={16} className="text-[var(--av-primary)]" /> {a.name}</h3>
              <span className="text-[10px] uppercase font-bold text-[var(--av-text-tertiary)]">{a.role}</span>
            </div>
            <p className="text-xs text-[var(--av-text-secondary)] mt-1">{a.responsibility}</p>
            <div className="flex gap-2 mt-2">
              {!a.can_execute && <Badge tone="warn">recommend only</Badge>}
              {a.requires_human_review && <Badge tone="info">human review</Badge>}
              {a.is_active && <Badge tone="ok">active</Badge>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------- Progressive Automation ----------
function AutomationTab({ bid }: { bid?: string }) {
  const [props, setProps] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!bid) return
    let active = true
    ;(async () => {
      try {
        const { data } = await supabase.from('automation_proposals').select('*')
          .eq('business_id', bid).order('created_at', { ascending: false })
        if (active) setProps(data || [])
      } catch {} finally { if (active) setLoading(false) }
    })()
    return () => { active = false }
  }, [bid])

  if (loading) return <Loading />
  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-[var(--av-surface)] p-4 text-sm text-[var(--av-text-secondary)] flex items-start gap-2">
        <Repeat size={18} className="text-[var(--av-primary)] mt-0.5" />
        When the same validated behavior repeats, Avenize can <b>propose</b> it as an automation. Proposals require confirmation before activation — never silent.
      </div>
      {props.length === 0 ? <Empty text="No automation proposals yet. As repeated patterns are observed, Avenize will propose automations here for you to confirm." />
        : props.map(p => (
          <div key={p.id} className="rounded-xl bg-white p-4 shadow-[var(--av-elevation-1)]">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-[var(--av-text)]">{p.pattern}</h3>
              <span className="text-xs px-2 py-1 rounded-lg bg-[var(--av-warning)]/10 text-[var(--av-warning)] capitalize">{p.status}</span>
            </div>
            <p className="text-xs text-[var(--av-text-secondary)] mt-1">Observed {p.observed_count}× · Proposed: <b>{p.proposed_trigger}</b> → {p.proposed_action}</p>
            {p.requires_permission && <p className="text-xs text-[var(--av-error)] mt-1">Requires permission: {p.requires_permission}</p>}
          </div>
        ))}
    </div>
  )
}

// ---------- Convenience Index ----------
function ConvenienceTab({ bid }: { bid?: string }) {
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!bid) return
    let active = true
    ;(async () => {
      try {
        const { data } = await supabase.rpc('convenience_index', { p_business_id: bid })
        if (active) setRows(data || [])
      } catch {} finally { if (active) setLoading(false) }
    })()
    return () => { active = false }
  }, [bid])

  if (loading) return <Loading />
  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-[var(--av-surface)] p-4 text-sm text-[var(--av-text-secondary)] flex items-start gap-2">
        <Gauge size={18} className="text-[var(--av-primary)] mt-0.5" />
        Target: less time managing software, more time managing the business. Per-workflow friction over the last 30 days.
      </div>
      {rows.length === 0 ? <Empty text="No friction data recorded yet. As workflows run, time-to-complete, steps and abandonment appear here." />
        : (
          <div className="rounded-xl bg-white shadow-[var(--av-elevation-1)] divide-y divide-[var(--av-border)]">
            {rows.map((r, i) => (
              <div key={i} className="px-4 py-3 grid grid-cols-5 gap-2 text-sm">
                <span className="font-medium text-[var(--av-text)]">{r.workflow.replace(/_/g,' ')}</span>
                <span className="text-[var(--av-text-secondary)]">{r.runs} runs</span>
                <span className="text-[var(--av-text-secondary)]">{r.avg_ms ? (r.avg_ms/1000).toFixed(0)+'s' : '—'}</span>
                <span className={r.abandonment > 0.1 ? 'text-[var(--av-error)]' : 'text-[var(--av-text-secondary)]'}>{(r.abandonment*100).toFixed(0)}% abandoned</span>
                <span className="text-[var(--av-success)]">{(r.automation_rate*100).toFixed(0)}% automated</span>
              </div>
            ))}
          </div>
        )}
    </div>
  )
}

// ---------- Continuity ----------
function ContinuityTab({ bid }: { bid?: string }) {
  const [status, setStatus] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!bid) return
    let active = true
    ;(async () => {
      try {
        const { data } = await supabase.rpc('continuity_status', { p_business_id: bid })
        if (active) setStatus(data)
      } catch {} finally { if (active) setLoading(false) }
    })()
    return () => { active = false }
  }, [bid])

  if (loading) return <Loading />
  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-[var(--av-surface)] p-4 text-sm text-[var(--av-text-secondary)] flex items-start gap-2">
        <Database size={18} className="text-[var(--av-primary)] mt-0.5" />
        How your data is protected and how you can retrieve it: backups, tested restores, and retention policy.
      </div>
      {status && (
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Successful backups" value={status.successful_backups ?? 0} />
          <Stat label="Restore tests run" value={status.restore_tests_run ?? 0} tone={status.restore_tests_run === 0 ? 'warn' : 'ok'} />
          <Stat label="Last backup" value={status.last_backup_at ? new Date(status.last_backup_at).toLocaleDateString() : 'never'} tone={!status.last_backup_at ? 'warn' : 'ok'} />
        </div>
      )}
      {status?.recommendation && (
        <div className="rounded-xl bg-[var(--av-warning)]/10 p-4 text-sm text-[var(--av-warning)] flex items-start gap-2">
          <AlertTriangle size={16} className="mt-0.5" /> {status.recommendation}
        </div>
      )}
      {status?.retention_policies?.length > 0 && (
        <div className="rounded-xl bg-white shadow-[var(--av-elevation-1)] p-4">
          <h3 className="font-medium text-[var(--av-text)] mb-2">Retention policies</h3>
          {status.retention_policies.map((p: any, i: number) => (
            <div key={i} className="flex justify-between text-sm py-1">
              <span className="text-[var(--av-text-secondary)]">{p.category.replace(/_/g,' ')}</span>
              <span className="text-[var(--av-text)]">{p.days} days{p.basis && ` · ${p.basis}`}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Loading() { return <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-[var(--av-primary)]" /></div> }
function Empty({ text }: { text: string }) { return <div className="rounded-xl bg-white p-6 text-center text-sm text-[var(--av-text-tertiary)] shadow-[var(--av-elevation-1)]">{text}</div> }
function Stat({ label, value, tone }: { label: string; value: any; tone?: 'ok' | 'warn' }) {
  const c = tone === 'warn' ? 'var(--av-warning)' : tone === 'ok' ? 'var(--av-success)' : 'var(--av-text)'
  return <div className="rounded-xl bg-white p-4 shadow-[var(--av-elevation-1)]"><div className="text-xs text-[var(--av-text-tertiary)]">{label}</div><div className="text-xl font-semibold mt-1" style={{ color: c }}>{String(value)}</div></div>
}
function ClaimTag({ type }: { type: string }) {
  const map: Record<string, string> = { DECISION: 'var(--av-accent-hr)' }
  const c = map[type] || 'var(--av-text-tertiary)'
  return <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full" style={{ backgroundColor: c + '20', color: c }}>{type}</span>
}
function Badge({ tone, children }: { tone: 'ok' | 'warn' | 'info'; children: React.ReactNode }) {
  const c = tone === 'ok' ? 'var(--av-success)' : tone === 'warn' ? 'var(--av-warning)' : 'var(--av-info)'
  return <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ backgroundColor: c + '20', color: c }}>{children}</span>
}

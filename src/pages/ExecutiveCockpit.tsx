// Executive Cockpit — role-segregated decision view for CEO/CFO/COO.
// Master Build Guide §10: revenue, cash, pipeline, people, operational
// health, exceptions, goals — with drill-down. Distinct from the
// personal Dashboard: this is the whole-business mirror for leaders.
// Every metric is tagged fact/inference/estimate (§20 evidence model).

import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useDbState, DbStateBanner } from '../lib/useDbState'
import { fetchCurrentMetrics, refreshBusinessMetrics, type GovernedMetric } from '../lib/businessOS'
import {
  TrendingUp, DollarSign, Users, Activity, AlertTriangle, Target,
  ArrowRight, Loader2, Banknote, Receipt, Briefcase, ShieldAlert,
  CalendarClock, Gauge,
} from 'lucide-react'
import { ClaimTag, ClaimNote } from '../components/Evidence'

type Lens = 'ceo' | 'cfo' | 'coo'

const LENSES: { key: Lens; label: string; icon: any; blurb: string }[] = [
  { key: 'ceo', label: 'CEO', icon: Target, blurb: 'Whole-business performance, goals and exceptions' },
  { key: 'cfo', label: 'CFO', icon: Banknote, blurb: 'Cash, receivables, payables, forecasts and obligations' },
  { key: 'coo', label: 'COO', icon: Gauge, blurb: 'Operational health, capacity, bottlenecks and SLAs' },
]

function naira(n: number) {
  if (n == null || isNaN(n)) return '₦—'
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `₦${(n / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `₦${(n / 1_000).toFixed(0)}k`
  return `₦${n.toLocaleString()}`
}

export default function ExecutiveCockpit() {
  const { staff } = useAuth()
  const bid = staff?.business_id
  const dbState = useDbState()
  const [lens, setLens] = useState<Lens>('ceo')
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [governed, setGoverned] = useState<GovernedMetric[]>([])

  useEffect(() => {
    if (!bid) return
    let active = true
    setLoading(true); setError(null)
    ;(async () => {
      // Governed metrics: refresh (best-effort, non-blocking) then read the
      // materialized rows. If the migration isn't deployed yet, this fails
      // silently and the governed panel simply stays empty.
      refreshBusinessMetrics(bid).finally(() => {
        fetchCurrentMetrics(bid).then(m => { if (active) setGoverned(m) })
          .catch(() => { /* migration not deployed yet — non-blocking */ })
      })
      // Pull several real signals in parallel; tolerate missing RPCs/tables.
      const [
        revenue, cash, pipeline, people, exceptions, forecast, capacity, process, risk,
      ] = await Promise.allSettled([
        supabase.rpc('revenue_forecast', { p_business_id: bid }),
        supabase.from('transactions').select('total, type, created_at').limit(500),
        supabase.from('deals').select('value, stage, expected_close').limit(500),
        supabase.from('staff').select('id, active, department').limit(500),
        supabase.rpc('early_warnings', { p_business_id: bid }),
        supabase.rpc('revenue_forecast', { p_business_id: bid }),
        supabase.rpc('capacity_intelligence', { p_business_id: bid }),
        supabase.rpc('process_bottleneck_intelligence', { p_business_id: bid }),
        supabase.rpc('risk_anomaly_intelligence', { p_business_id: bid }),
      ])
      if (!active) return
      const pick = (r: any) => r.status === 'fulfilled' ? r.value.data : null
      setData({
        revenue: pick(revenue),
        transactions: pick(cash),
        deals: pick(pipeline),
        staff: pick(people),
        early: pick(exceptions),
        forecast: pick(forecast),
        capacity: pick(capacity),
        process: pick(process),
        risk: pick(risk),
      })
      setLoading(false)
    })()
    return () => { active = false }
  }, [bid])

  const metrics = useMemo(() => deriveMetrics(data), [data])

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <DbStateBanner state={dbState} />
      <div className="mb-6 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--av-text)] flex items-center gap-2">
            <Target size={24} className="text-[var(--av-primary)]" /> Executive Cockpit
          </h1>
          <p className="text-sm text-[var(--av-text-secondary)] mt-1">
            The whole business on one screen. Drill into any metric. Every number is tagged by what it is — fact, inference or estimate.
          </p>
        </div>
        <div className="flex gap-1 p-1 rounded-xl bg-[var(--av-surface-3)]">
          {LENSES.map(l => {
            const Icon = l.icon
            return (
              <button key={l.key} onClick={() => setLens(l.key)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors ${
                  lens === l.key ? 'bg-white text-[var(--av-primary)] shadow-[var(--av-shadow-sm)]'
                  : 'text-[var(--av-text-secondary)] hover:text-[var(--av-text)]'}`}
                title={l.blurb}>
                <Icon size={15} /> {l.label}
              </button>
            )
          })}
        </div>
      </div>

      {loading ? (
        <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-[var(--av-primary)]" /></div>
      ) : error ? (
        <ClaimNote tone="warn">{error}</ClaimNote>
      ) : (
        <>
          <p className="text-xs text-[var(--av-text-muted)] mb-3">
            {LENSES.find(l => l.key === lens)?.blurb}
          </p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {metrics[lens].map((m, i) => <MetricCard key={i} {...m} />)}
          </div>

          <GovernedMetricsCard metrics={governed} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            <ExceptionsCard early={data?.early} risk={data?.risk} />
            <DrillCard lens={lens} data={data} />
          </div>

          <GoalsRow lens={lens} />
        </>
      )}
    </div>
  )
}

type Metric = { label: string; value: string; sub?: string; delta?: string; trend?: 'up'|'down'|'flat'; claim: string; icon: any; to: string }

function deriveMetrics(d: any): Record<Lens, Metric[]> {
  const txns = d?.transactions || []
  const deals = d?.deals || []
  const staff = d?.staff || []
  const fc = d?.forecast
  const cap = d?.capacity
  const proc = d?.process

  const collected = txns.filter((t: any) => t.type === 'income' || t.type === 'credit').reduce((s: number, t: any) => s + Number(t.total || 0), 0)
  const spent = txns.filter((t: any) => t.type === 'expense' || t.type === 'debit').reduce((s: number, t: any) => s + Number(t.total || 0), 0)
  const pipelineValue = deals.reduce((s: number, t: any) => s + Number(t.value || 0), 0)
  const activeStaff = staff.filter((s: any) => s.active !== false).length
  const projected = fc?.projected_next_months
  const monthlyAvg = fc?.monthly_avg_collected

  return {
    ceo: [
      { label: 'Revenue (collected)', value: naira(collected), sub: monthlyAvg ? `${naira(monthlyAvg)} avg/mo` : undefined, claim: 'FACT', icon: DollarSign, to: '/app/finance' },
      { label: 'Pipeline value', value: naira(pipelineValue), sub: `${deals.length} deals`, claim: 'FACT', icon: TrendingUp, to: '/app/crm' },
      { label: 'Active people', value: String(activeStaff), claim: 'FACT', icon: Users, to: '/app/hr' },
      { label: 'Projected next period', value: projected != null ? naira(projected) : '—', sub: fc?.confidence ? `${Math.round(fc.confidence*100)}% confidence` : undefined, claim: 'ESTIMATE', icon: Activity, to: '/app/intelligence' },
    ],
    cfo: [
      { label: 'Cash in', value: naira(collected), claim: 'FACT', icon: Banknote, to: '/app/finance' },
      { label: 'Cash out', value: naira(spent), claim: 'FACT', icon: Receipt, to: '/app/finance' },
      { label: 'Net cash', value: naira(collected - spent), trend: collected - spent >= 0 ? 'up' : 'down', claim: 'FACT', icon: DollarSign, to: '/app/cashflow' },
      { label: 'Revenue forecast', value: projected != null ? naira(projected) : '—', claim: 'ESTIMATE', icon: Activity, to: '/app/scenarios' },
    ],
    coo: [
      { label: 'Active people', value: String(activeStaff), claim: 'FACT', icon: Users, to: '/app/hr' },
      { label: 'Open deals', value: String(deals.length), claim: 'FACT', icon: Briefcase, to: '/app/crm' },
      { label: 'Capacity utilisation', value: cap?.signals?.utilization_pct ? `${Math.round(cap.signals.utilization_pct)}%` : '—', sub: cap?.recommendation, claim: 'INFERENCE', icon: Gauge, to: '/app/intelligence' },
      { label: 'Bottleneck stage', value: proc?.bottleneck_stage ? String(proc.bottleneck_stage).replace(/_/g,' ') : 'None', sub: proc?.bottleneck_days ? `${proc.bottleneck_days}d avg` : undefined, claim: 'INFERENCE', icon: AlertTriangle, to: '/app/intelligence' },
    ],
  }
}

function MetricCard({ label, value, sub, delta, trend, claim, icon: Icon, to }: Metric) {
  return (
    <Link to={to} className="block rounded-2xl bg-white p-5 shadow-[var(--av-shadow-sm)] hover:shadow-[var(--av-shadow-md)] transition-shadow">
      <div className="flex items-start justify-between mb-2">
        <span className="text-xs font-medium text-[var(--av-text-secondary)]">{label}</span>
        <Icon size={16} className="text-[var(--av-text-muted)]" />
      </div>
      <div className="text-2xl font-bold text-[var(--av-text)]">{value}</div>
      <div className="flex items-center justify-between mt-2">
        {sub ? <span className="text-xs text-[var(--av-text-muted)]">{sub}</span> : <span />}
        <ClaimTag type={claim} />
      </div>
      {delta && <div className={`text-xs mt-1 ${trend === 'up' ? 'text-[var(--av-success)]' : trend === 'down' ? 'text-[var(--av-danger)]' : 'text-[var(--av-text-muted)]'}`}>{delta}</div>}
    </Link>
  )
}

// Governed, explainable metrics from the registry (migration 086). Each row
// carries its definition, confidence, and an honest "insufficient data"
// state — never a fabricated number (§21 small-data safety).
function GovernedMetricsCard({ metrics }: { metrics: GovernedMetric[] }) {
  if (!metrics || metrics.length === 0) {
    // The governed metric layer isn't deployed yet, or no metrics refreshed.
    // Non-blocking: render nothing rather than a broken panel.
    return null
  }
  const fmt = (m: GovernedMetric) => {
    const v = m.current_value
    if (v == null || Number.isNaN(v)) return '—'
    if (m.unit === 'percent') return `${Math.round(v)}%`
    if (m.unit === 'currency') return naira(v)
    if (m.unit === 'duration_days') return `${Math.round(v)}d`
    return Number.isInteger(v) ? `${v}` : v.toFixed(2)
  }
  const confidenceTone = (c: string) =>
    c === 'high' ? 'FACT' : c === 'medium' || c === 'low' ? 'INFERENCE' : c === 'insufficient' ? 'UNKNOWN' : 'UNKNOWN'
  return (
    <div className="rounded-2xl bg-white p-5 shadow-[var(--av-shadow-sm)] mb-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-[var(--av-text)] flex items-center gap-2">
          <Gauge size={18} className="text-[var(--av-primary)]" /> Governed business metrics
        </h2>
        <span className="text-[11px] text-[var(--av-text-muted)]">
          {metrics.length} metrics · sourced from the metric registry
        </span>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {metrics.slice(0, 12).map(m => (
          <div key={m.metric_key} className="rounded-xl bg-[var(--av-surface)] p-3" title={m.formula}>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-[var(--av-text-secondary)] truncate">{m.name}</span>
              <ClaimTag type={confidenceTone(m.confidence)} />
            </div>
            {m.confidence === 'insufficient' ? (
              <p className="text-xs text-[var(--av-text-muted)] mt-2 leading-snug">
                {m.insufficient_note || 'Not enough data yet.'}
              </p>
            ) : (
              <>
                <div className="text-xl font-bold text-[var(--av-text)] mt-1">{fmt(m)}</div>
                {m.change_percent != null && (
                  <div className={`text-[11px] mt-0.5 ${m.change_percent >= 0 ? 'text-[var(--av-success)]' : 'text-[var(--av-danger)]'}`}>
                    {m.change_percent >= 0 ? '+' : ''}{m.change_percent}% vs prev
                  </div>
                )}
                <div className="text-[10px] text-[var(--av-text-muted)] mt-0.5">n={m.sample_size} · {m.confidence}</div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function ExceptionsCard({ early, risk }: { early: any; risk: any }) {
  const warnings = early?.warnings || []
  const anomalies = risk?.anomalies || []
  const items = [
    ...warnings.map((w: any) => ({ label: w.title || w.type || 'Early warning', detail: w.detail || w.note, tone: 'warn' as const })),
    ...anomalies.map((a: any) => ({ label: a.type?.replace(/_/g,' ') || 'Anomaly', detail: a.note || JSON.stringify(a.detail).slice(0,80), tone: 'danger' as const })),
  ]
  return (
    <div className="rounded-2xl bg-white p-5 shadow-[var(--av-shadow-sm)]">
      <h2 className="font-semibold text-[var(--av-text)] flex items-center gap-2 mb-3">
        <ShieldAlert size={18} className="text-[var(--av-danger)]" /> Exceptions needing attention
        <ClaimTag type="INFERENCE" />
      </h2>
      {items.length === 0 ? (
        <p className="text-sm text-[var(--av-success)]">No exceptions detected. The business looks healthy.</p>
      ) : (
        <div className="space-y-2">
          {items.slice(0, 6).map((it, i) => (
            <div key={i} className="flex items-start gap-2 text-sm">
              <AlertTriangle size={14} className={`mt-0.5 shrink-0 ${it.tone === 'danger' ? 'text-[var(--av-danger)]' : 'text-[var(--av-warning)]'}`} />
              <div>
                <div className="font-medium text-[var(--av-text)] capitalize">{it.label}</div>
                {it.detail && <div className="text-xs text-[var(--av-text-secondary)]">{it.detail}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
      <Link to="/app/activity" className="inline-flex items-center gap-1 text-xs font-medium text-[var(--av-primary)] mt-3">
        See all activity <ArrowRight size={12} />
      </Link>
    </div>
  )
}

function DrillCard({ lens, data }: { lens: Lens; data: any }) {
  const title = lens === 'cfo' ? 'Cash breakdown' : lens === 'coo' ? 'Operational signals' : 'Revenue & pipeline'
  return (
    <div className="rounded-2xl bg-white p-5 shadow-[var(--av-shadow-sm)]">
      <h2 className="font-semibold text-[var(--av-text)] flex items-center gap-2 mb-3">
        <Activity size={18} className="text-[var(--av-primary)]" /> {title} <ClaimTag type="FACT" />
      </h2>
      <div className="space-y-2 text-sm">
        {lens === 'cfo' && (
          <>
            <Row k="Total collected" v={naira((data?.transactions||[]).filter((t:any)=>t.type==='income'||t.type==='credit').reduce((s:number,t:any)=>s+Number(t.total||0),0))} />
            <Row k="Total spent" v={naira((data?.transactions||[]).filter((t:any)=>t.type==='expense'||t.type==='debit').reduce((s:number,t:any)=>s+Number(t.total||0),0))} />
            <Row k="Transactions" v={String((data?.transactions||[]).length)} />
          </>
        )}
        {lens === 'coo' && data?.capacity?.signals && Object.entries(data.capacity.signals).slice(0,6).map(([k,v]:any) => (
          <Row key={k} k={k.replace(/_/g,' ')} v={typeof v === 'number' ? (v>1 ? naira(v) : `${Math.round(v*100)}%`) : String(v)} />
        ))}
        {lens === 'ceo' && (
          <>
            <Row k="Open pipeline" v={naira((data?.deals||[]).reduce((s:number,t:any)=>s+Number(t.value||0),0))} />
            <Row k="Deals" v={String((data?.deals||[]).length)} />
            <Row k="Active people" v={String((data?.staff||[]).filter((s:any)=>s.active!==false).length)} />
          </>
        )}
      </div>
    </div>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between capitalize">
      <span className="text-[var(--av-text-secondary)]">{k}</span>
      <span className="font-medium text-[var(--av-text)]">{v}</span>
    </div>
  )
}

function GoalsRow({ lens }: { lens: Lens }) {
  const goals: Record<Lens, { label: string; to: string }[]> = {
    ceo: [
      { label: 'Strategic alignment', to: '/app/intelligence' },
      { label: 'Goals & OKRs', to: '/app/reports' },
      { label: 'Run a scenario', to: '/app/scenarios' },
    ],
    cfo: [
      { label: 'Cash flow', to: '/app/cashflow' },
      { label: 'Invoices', to: '/app/finance' },
      { label: 'Budgets', to: '/app/budgets' },
    ],
    coo: [
      { label: 'Projects', to: '/app/projects' },
      { label: 'Tasks', to: '/app/tasks' },
      { label: 'Approvals', to: '/app/approvals' },
    ],
  }
  return (
    <div className="rounded-2xl bg-[var(--av-surface)] p-4">
      <div className="flex items-center gap-2 mb-3">
        <CalendarClock size={16} className="text-[var(--av-text-secondary)]" />
        <span className="text-sm font-medium text-[var(--av-text)]">Jump to action</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {goals[lens].map(g => (
          <Link key={g.to} to={g.to} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-sm text-[var(--av-text)] shadow-[var(--av-shadow-sm)] hover:shadow-[var(--av-shadow-md)] transition-shadow">
            {g.label} <ArrowRight size={12} className="text-[var(--av-text-muted)]" />
          </Link>
        ))}
      </div>
    </div>
  )
}

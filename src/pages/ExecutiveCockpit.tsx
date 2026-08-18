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
import {
  fetchCurrentMetrics, refreshBusinessMetrics, type GovernedMetric,
  fetchOpenRecommendations, decideRecommendation, acknowledgeRecommendation, fetchRecommendationEffectiveness, markRecommendationActed, type Recommendation,
  computeBusinessHealth, fetchBusinessHealth, type BusinessHealth, type HealthDimension,
  computeEbitda, type EbitdaResult,
} from '../lib/businessOS'
import {
  TrendingUp, DollarSign, Users, Activity, AlertTriangle, Target,
  ArrowRight, Loader2, Banknote, Receipt, Briefcase, ShieldAlert,
  CalendarClock, Gauge, Sparkles, Check, X, Lightbulb, HeartPulse, HelpCircle, ListTodo,
} from 'lucide-react'
import { ClaimTag, ClaimNote, EvidencePanel } from '../components/Evidence'
import { RepresentationEngine, type RepresentableData } from '../components/RepresentationEngine'

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
  const [recommendations, setRecommendations] = useState<Recommendation[]>([])
  const [recBusy, setRecBusy] = useState<string | null>(null)
  const [health, setHealth] = useState<BusinessHealth | null>(null)
  const [effectiveness, setEffectiveness] = useState<any[]>([])
  const [ebitda, setEbitda] = useState<EbitdaResult | null>(null)

  useEffect(() => {
    if (!bid) return
    let active = true
    setLoading(true); setError(null)
    ;(async () => {
      // Governed metrics + Business Health (§21): refresh metrics (best-effort,
      // non-blocking), then read the governed rows AND compute+read health.
      // If the migration isn't deployed yet, both stay empty silently.
      refreshBusinessMetrics(bid).finally(() => {
        fetchCurrentMetrics(bid).then(m => { if (active) setGoverned(m) })
          .catch(() => { /* migration not deployed yet — non-blocking */ })
        computeBusinessHealth(bid).finally(() => {
          fetchBusinessHealth(bid).then(h => { if (active) setHealth(h) })
            .catch(() => { /* migration not deployed yet — non-blocking */ })
        })
      })
      // Open recommendations (the "what needs my attention?" feed, §17).
      // Best-effort: stays empty if the recommendation migration isn't deployed.
      fetchOpenRecommendations(bid).then(r => { if (active) setRecommendations(r) })
        .catch(() => { /* migration not deployed yet — non-blocking */ })
      // §5.3 EBITDA — server-derived operating profitability. Best-effort.
      computeEbitda(bid).then(e => { if (active) setEbitda(e) })
        .catch(() => { /* migration not deployed yet — non-blocking */ })
      // §16 recommendation effectiveness — "did the action work?" learning loop.
      // Best-effort: stays empty if the migration isn't deployed.
      fetchRecommendationEffectiveness(bid).then(e => { if (active) setEffectiveness(e) })
        .catch(() => { /* migration not deployed yet — non-blocking */ })
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

          <BusinessHealthCard health={health} />
          <EbitdaCard ebitda={ebitda} />

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {metrics[lens].map((m, i) => <MetricCard key={i} {...m} />)}
          </div>

          <GovernedMetricsCard metrics={governed} />

          <RecommendationsCard
            recommendations={recommendations}
            busy={recBusy}
            onDecide={async (id, decision) => {
              setRecBusy(id)
              try {
                if (decision === 'acknowledge') {
                  await acknowledgeRecommendation(id, staff?.id ?? '')
                } else {
                  await decideRecommendation(id, decision === 'accepted', staff?.id ?? '')
                }
                setRecommendations(prev =>
                  decision === 'rejected'
                    ? prev.filter(r => r.id !== id)
                    : prev.map(r => r.id === id ? { ...r, status: decision === 'accepted' ? 'accepted' : 'acknowledged' } : r)
                )
              } catch { /* non-blocking */ }
              setRecBusy(null)
            }}
            onAct={async (r) => {
              setRecBusy(r.id)
              try {
                // §14 action layer — create a task from the recommendation and
                // link it back via mark_recommendation_acted (§15 outcome loop).
                const { data: task, error } = await supabase
                  .from('tasks')
                  .insert({
                    title: r.statement.slice(0, 180),
                    description: `Created from recommendation ${r.rule_id ?? ''}. ${r.statement}`,
                    business_id: bid,
                    created_by: staff?.id ?? null,
                    status: 'todo',
                    priority: r.severity === 'critical' ? 'high' : 'medium',
                  })
                  .select('id')
                  .single()
                if (error) throw error
                await markRecommendationActed(r.id, 'create_task', task.id)
                setRecommendations(prev =>
                  prev.map(rec => rec.id === r.id ? { ...rec, status: 'acted' as any, action_type: 'create_task', linked_action_id: task.id } : rec)
                )
              } catch { /* non-blocking — task table may not exist yet */ }
              setRecBusy(null)
            }}
          />

          {effectiveness.length > 0 && (
            <EffectivenessCard rows={effectiveness} />
          )}

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

// Each metric now carries representable data (historical/target/breakdown)
// so the Representation Engine can offer trend/progress/breakdown views.
type Metric = RepresentableData & { claim: string; icon: any; }

function deriveMetrics(d: any): Record<Lens, Metric[]> {
  const txns = d?.transactions || []
  const deals = d?.deals || []
  const staffList = d?.staff || []
  const fc = d?.forecast
  const cap = d?.capacity
  const proc = d?.process

  const collected = txns.filter((t: any) => t.type === 'income' || t.type === 'credit').reduce((s: number, t: any) => s + Number(t.total || 0), 0)
  const spent = txns.filter((t: any) => t.type === 'expense' || t.type === 'debit').reduce((s: number, t: any) => s + Number(t.total || 0), 0)
  const pipelineValue = deals.reduce((s: number, t: any) => s + Number(t.value || 0), 0)
  const activeStaff = staffList.filter((s: any) => s.active !== false).length

  // Build a simple monthly historical series from transactions for trend views.
  const monthlyTotals: Record<string, { income: number; expense: number }> = {}
  txns.forEach((t: any) => {
    const mo = t.created_at?.slice(0, 7)
    if (!mo) return
    if (!monthlyTotals[mo]) monthlyTotals[mo] = { income: 0, expense: 0 }
    if (t.type === 'income' || t.type === 'credit') monthlyTotals[mo].income += Number(t.total || 0)
    if (t.type === 'expense' || t.type === 'debit') monthlyTotals[mo].expense += Number(t.total || 0)
  })
  const months = Object.keys(monthlyTotals).sort()
  const incomeHistory = months.map(m => monthlyTotals[m].income)
  const expenseHistory = months.map(m => monthlyTotals[m].expense)
  const netHistory = months.map(m => monthlyTotals[m].income - monthlyTotals[m].expense)

  // Deal stage breakdown for the pipeline.
  const stageBreakdown: Record<string, number> = {}
  deals.forEach((dl: any) => {
    const st = dl.stage || 'unknown'
    stageBreakdown[st] = (stageBreakdown[st] || 0) + Number(dl.value || 0)
  })

  const projected = fc?.projected_next_months
  const monthlyAvg = fc?.monthly_avg_collected

  return {
    ceo: [
      { metricKey: 'ceo_revenue', label: 'Revenue (collected)', value: collected, unit: 'currency', historical: incomeHistory.length > 1 ? incomeHistory : undefined, sub: monthlyAvg ? `${naira(monthlyAvg)} avg/mo` : undefined, claim: 'FACT', icon: DollarSign, to: '/app/finance' } as any,
      { metricKey: 'ceo_pipeline', label: 'Pipeline value', value: pipelineValue, unit: 'currency', breakdown: Object.entries(stageBreakdown).map(([label, value]) => ({ label, value })), claim: 'FACT', icon: TrendingUp, to: '/app/crm' } as any,
      { metricKey: 'ceo_people', label: 'Active people', value: activeStaff, unit: 'number', claim: 'FACT', icon: Users, to: '/app/hr' } as any,
      { metricKey: 'ceo_forecast', label: 'Projected next period', value: projected ?? null, unit: 'currency', sub: fc?.confidence ? `${Math.round(fc.confidence*100)}% confidence` : undefined, claim: 'ESTIMATE', icon: Activity, to: '/app/intelligence' } as any,
    ],
    cfo: [
      { metricKey: 'cfo_cash_in', label: 'Cash in', value: collected, unit: 'currency', historical: incomeHistory.length > 1 ? incomeHistory : undefined, claim: 'FACT', icon: Banknote, to: '/app/finance' } as any,
      { metricKey: 'cfo_cash_out', label: 'Cash out', value: spent, unit: 'currency', historical: expenseHistory.length > 1 ? expenseHistory : undefined, claim: 'FACT', icon: Receipt, to: '/app/finance' } as any,
      { metricKey: 'cfo_net', label: 'Net cash', value: collected - spent, unit: 'currency', historical: netHistory.length > 1 ? netHistory : undefined, claim: 'FACT', icon: DollarSign, to: '/app/cashflow' } as any,
      { metricKey: 'cfo_forecast', label: 'Revenue forecast', value: projected ?? null, unit: 'currency', claim: 'ESTIMATE', icon: Activity, to: '/app/scenarios' } as any,
    ],
    coo: [
      { metricKey: 'coo_people', label: 'Active people', value: activeStaff, unit: 'number', claim: 'FACT', icon: Users, to: '/app/hr' } as any,
      { metricKey: 'coo_deals', label: 'Open deals', value: deals.length, unit: 'number', breakdown: Object.entries(stageBreakdown).map(([label, value]) => ({ label, value })), claim: 'FACT', icon: Briefcase, to: '/app/crm' } as any,
      { metricKey: 'coo_capacity', label: 'Capacity utilisation', value: cap?.signals?.utilization_pct ?? null, unit: 'percent', claim: 'INFERENCE', icon: Gauge, to: '/app/intelligence' } as any,
      { metricKey: 'coo_bottleneck', label: 'Bottleneck stage', value: null, unit: 'number', claim: 'INFERENCE', icon: AlertTriangle, to: '/app/intelligence' } as any,
    ],
  }
}

function MetricCard({ claim, icon: _icon, to, ...rest }: Metric) {
  // The Representation Engine renders the number/trend/progress/breakdown/table.
  // We wrap it in a Link so the whole card drills down, with the ClaimTag footer.
  const content = (
    <RepresentationEngine
      data={rest}
      compact
      footer={<ClaimTag type={claim} />}
    />
  )
  if (to) {
    return <Link to={to} className="block relative">{content}</Link>
  }
  return content
}

// Governed, explainable metrics from the registry (migration 086). Each row
// carries its definition, confidence, and an honest "insufficient data"
// state — never a fabricated number (§21 small-data safety).
// Now uses the Representation Engine so users can toggle between number /
// trend / table for each governed metric.
function GovernedMetricsCard({ metrics }: { metrics: GovernedMetric[] }) {
  if (!metrics || metrics.length === 0) {
    // The governed metric layer isn't deployed yet, or no metrics refreshed.
    // Non-blocking: render nothing rather than a broken panel.
    return null
  }
  const confidenceTone = (c: string) =>
    c === 'high' ? 'FACT' : c === 'medium' || c === 'low' ? 'INFERENCE' : c === 'insufficient' ? 'UNKNOWN' : 'UNKNOWN'

  const toRepresentable = (m: GovernedMetric): RepresentableData => {
    // Build a minimal historical series from previous→current for the trend view.
    const historical = m.previous_value != null && m.current_value != null
      ? [m.previous_value, m.current_value]
      : undefined
    return {
      metricKey: `gov_${m.metric_key}`,
      label: m.name,
      value: m.current_value,
      unit: (['currency', 'percent', 'duration_days', 'number', 'ratio'].includes(m.unit) ? m.unit : 'number') as RepresentableData['unit'],
      historical,
      confidence: m.confidence,
    }
  }

  return (
    <div className="rounded-2xl bg-[var(--av-surface-elevated)] p-5 shadow-[var(--av-shadow-sm)] mb-6">
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
          <RepresentationEngine
            key={m.metric_key}
            data={toRepresentable(m)}
            compact
            className="!shadow-none border border-[var(--av-border)]"
            footer={
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[var(--av-text-muted)]">n={m.sample_size} · {m.confidence}</span>
                {m.change_percent != null && (
                  <span className={`text-[10px] ${m.change_percent >= 0 ? 'text-[var(--av-success)]' : 'text-[var(--av-danger)]'}`}>
                    {m.change_percent >= 0 ? '+' : ''}{m.change_percent}%
                  </span>
                )}
                <ClaimTag type={confidenceTone(m.confidence)} />
              </div>
            }
          />
        ))}
      </div>
    </div>
  )
}

function EbitdaCard({ ebitda }: { ebitda: EbitdaResult | null }) {
  // §5.3: operating profitability. §0.2: the label is the conclusion, the
  // numbers are one tap away. §21: every component is explainable + sourced.
  // §0.4: all values server-derived (the RPC recomputes from real tables).
  const fmt = (n: number | null | undefined) =>
    n == null ? '—' : '₦' + Math.round(n).toLocaleString()
  if (!ebitda || !ebitda.authorized || ebitda.insufficient_data) {
    return (
      <div className="rounded-2xl bg-white p-5 shadow-[var(--av-shadow-sm)] mb-6 flex items-center gap-3">
        <Banknote size={20} className="text-[var(--av-text-muted)]" />
        <div>
          <p className="text-sm font-semibold text-[var(--av-text)]">Operating profitability — not enough data yet</p>
          <p className="text-xs text-[var(--av-text-muted)]">
            Record paid invoices and your recurring expenses, and your EBITDA will appear here. <ClaimTag type="FACT" />
          </p>
        </div>
      </div>
    )
  }
  const tone = ebitda.ebitda > 0 ? 'var(--av-success)' : ebitda.ebitda === 0 ? 'var(--av-warning)' : 'var(--av-danger)'
  return (
    <div className="rounded-2xl bg-white p-5 shadow-[var(--av-shadow-sm)] mb-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-[var(--av-text)] flex items-center gap-1.5">
          <Banknote size={16} style={{ color: tone }} /> Operating profitability (EBITDA)
        </h3>
        <span className="text-[10px] text-[var(--av-text-muted)]">
          {ebitda.period_start} → {ebitda.period_end}
        </span>
      </div>
      <div className="flex items-center gap-6 mb-4">
        <div className="flex items-center gap-3">
          <div className="text-3xl font-bold" style={{ color: tone }}>{fmt(ebitda.ebitda)}</div>
          <div>
            <div className="text-xs font-medium" style={{ color: tone }}>{ebitda.label}</div>
            {ebitda.margin_pct != null && (
              <div className="text-[10px] text-[var(--av-text-muted)]">{ebitda.margin_pct}% margin</div>
            )}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
        <div className="rounded-xl bg-[var(--av-surface-3)] p-2.5">
          <div className="text-[10px] text-[var(--av-text-muted)] uppercase">Revenue</div>
          <div className="text-sm font-semibold text-[var(--av-success)]">{fmt(ebitda.revenue)}</div>
        </div>
        <div className="rounded-xl bg-[var(--av-surface-3)] p-2.5">
          <div className="text-[10px] text-[var(--av-text-muted)] uppercase">COGS</div>
          <div className="text-sm font-semibold text-[var(--av-danger)]">−{fmt(ebitda.cogs)}</div>
        </div>
        <div className="rounded-xl bg-[var(--av-surface-3)] p-2.5">
          <div className="text-[10px] text-[var(--av-text-muted)] uppercase">Recurring opex</div>
          <div className="text-sm font-semibold text-[var(--av-danger)]">−{fmt(ebitda.recurring_expenses)}</div>
        </div>
        <div className="rounded-xl bg-[var(--av-surface-3)] p-2.5">
          <div className="text-[10px] text-[var(--av-text-muted)] uppercase">Other</div>
          <div className="text-sm font-semibold text-[var(--av-danger)]">−{fmt(ebitda.other_expenses)}</div>
        </div>
      </div>
      <p className="mt-2 text-[10px] text-[var(--av-text-muted)]">
        Revenue from paid invoices · COGS from purchase transactions · opex from recurring_expenses. <ClaimTag type="FACT" /> Server-derived per §0.4.
      </p>
    </div>
  )
}

function BusinessHealthCard({ health }: { health: BusinessHealth | null }) {
  // §21: every score must be explainable + decomposable. This card shows the
  // overall score, the per-dimension breakdown, and the evidence (actual vs
  // target per metric). Honest "insufficient data" when no targets are set.
  if (!health || health.overall_score == null) {
    return (
      <div className="rounded-2xl bg-white p-5 shadow-[var(--av-shadow-sm)] mb-6 flex items-center gap-3">
        <HeartPulse size={20} className="text-[var(--av-text-muted)]" />
        <div>
          <p className="text-sm font-semibold text-[var(--av-text)]">Business Health — not yet available</p>
          <p className="text-xs text-[var(--av-text-muted)]">
            Set targets on your key metrics and the health score will appear here. <ClaimTag type="FACT" />
          </p>
        </div>
      </div>
    )
  }
  const score = health.overall_score
  const tone = score >= 80 ? 'var(--av-success)' : score >= 60 ? 'var(--av-warning)' : 'var(--av-danger)'
  const label = score >= 80 ? 'Healthy' : score >= 60 ? 'Needs attention' : 'At risk'
  const DIM_LABELS: Record<string, string> = {
    financial: 'Financial', sales: 'Sales', customers: 'Customers',
    operations: 'Operations', people: 'People', projects: 'Projects',
  }
  const dims = Object.entries(health.dimension_scores || {})
    .filter(([k]) => k !== '_meta') as [string, HealthDimension][]
  const meta = (health.dimension_scores as any)?._meta
  return (
    <div className="rounded-2xl bg-white p-5 shadow-[var(--av-shadow-sm)] mb-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-[var(--av-text)] flex items-center gap-1.5">
          <HeartPulse size={16} style={{ color: tone }} /> Business Health
        </h3>
        <span className="text-[10px] text-[var(--av-text-muted)]">
          {health.computed_at ? `Updated ${new Date(health.computed_at).toLocaleDateString()}` : ''}
        </span>
      </div>
      <div className="flex items-center gap-6 mb-4">
        <div className="flex items-center gap-3">
          <div className="text-4xl font-bold" style={{ color: tone }}>{score}</div>
          <div>
            <div className="text-xs font-medium" style={{ color: tone }}>{label}</div>
            <div className="text-[10px] text-[var(--av-text-muted)]">out of 100</div>
          </div>
        </div>
        {meta && (
          <div className="text-[10px] text-[var(--av-text-muted)] flex flex-col gap-0.5">
            {meta.data_quality_penalty > 0 && <span>DQ penalty: −{meta.data_quality_penalty}</span>}
            {meta.recommendations?.open_critical_recommendations > 0 && (
              <span className="text-[var(--av-danger)]">
                {meta.recommendations.open_critical_recommendations} critical recommendation{meta.recommendations.open_critical_recommendations > 1 ? 's' : ''}
              </span>
            )}
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
        {dims.map(([key, dim]) => {
          const dTone = dim.score == null ? 'var(--av-text-muted)'
            : dim.score >= 80 ? 'var(--av-success)'
            : dim.score >= 60 ? 'var(--av-warning)' : 'var(--av-danger)'
          return (
            <div key={key} className="rounded-xl bg-[var(--av-surface-3)] p-2.5">
              <div className="text-[10px] text-[var(--av-text-muted)] uppercase tracking-wide">{DIM_LABELS[key] || key}</div>
              <div className="text-lg font-semibold" style={{ color: dTone }}>
                {dim.score ?? '—'}
              </div>
              <div className="text-[9px] text-[var(--av-text-muted)]">
                {dim.status === 'insufficient_data' ? 'no targets set' :
                 dim.metrics.length === 0 ? 'no data' : `${dim.metrics.length} metric${dim.metrics.length > 1 ? 's' : ''}`}
              </div>
            </div>
          )
        })}
      </div>
      {(health.insufficient_dimensions?.length || 0) > 0 && (
        <p className="text-[10px] text-[var(--av-text-muted)] mt-3">
          Insufficient data for: {health.insufficient_dimensions.join(', ')}. Set targets on metrics to enable these dimensions.
        </p>
      )}
      <div className="mt-3 pt-3 border-t border-[var(--av-border)]">
        <a href="/app/review" className="text-xs text-[var(--av-primary)] hover:underline flex items-center gap-1">
          View full Monthly Performance Review <ArrowRight size={12} />
        </a>
      </div>
    </div>
  )
}

function RecommendationsCard({
  recommendations, busy, onDecide, onAct,
}: {
  recommendations: Recommendation[]
  busy: string | null
  onDecide: (id: string, decision: 'acknowledge' | 'accepted' | 'rejected') => void
  onAct: (r: Recommendation) => void
}) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const sevColor = (s: string) =>
    s === 'critical' ? 'var(--av-danger)' : s === 'warning' ? 'var(--av-warning)' : 'var(--av-info)'
  return (
    <div className="rounded-2xl bg-white p-5 shadow-[var(--av-shadow-sm)] mb-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-[var(--av-text)] flex items-center gap-1.5">
          <Lightbulb size={16} className="text-[var(--av-primary)]" /> What needs my attention
        </h3>
        {recommendations.length > 0 && (
          <Link to="/app/intelligence" className="text-xs text-[var(--av-primary)] flex items-center gap-1">
            All insights <ArrowRight size={11} />
          </Link>
        )}
      </div>
      {recommendations.length === 0 ? (
        <p className="text-xs text-[var(--av-text-muted)] py-2">
          No open recommendations. As your business data grows, Avenize will surface specific, evidenced actions here. <ClaimTag type="FACT" />
        </p>
      ) : (
        <div className="space-y-2">
          {recommendations.slice(0, 6).map((r) => (
            <div key={r.id} className="rounded-xl border border-[var(--av-border)] p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: sevColor(r.severity ?? 'info') }} />
                    <span className="text-[10px] font-mono text-[var(--av-text-muted)]">{r.rule_id}</span>
                    <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-[var(--av-surface-3)] text-[var(--av-text-secondary)]">{r.severity}</span>
                  </div>
                  <p className="text-sm text-[var(--av-text)] mt-1">{r.statement}</p>
                  {r.expected_impact && (
                    <p className="text-xs text-[var(--av-text-muted)] mt-1 flex items-center gap-1">
                      <Sparkles size={11} />
                      {r.expected_impact.description || 'Expected impact'}
                      {r.expected_impact.amount ? `: ${naira(r.expected_impact.amount)}` : ''}
                    </p>
                  )}
                  <button
                    onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                    className="text-[11px] text-[var(--av-primary)] hover:underline mt-1.5 flex items-center gap-1"
                  >
                    <HelpCircle size={11} />
                    {expanded === r.id ? 'Hide evidence' : 'Why are you telling me this?'}
                  </button>
                  {expanded === r.id && (
                    <EvidencePanel evidence={r.evidence} ruleId={r.rule_id} />
                  )}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <div className="flex items-center gap-1">
                    <button onClick={() => onDecide(r.id, 'accepted')} disabled={busy === r.id}
                      title="Accept"
                      className="p-1.5 rounded-lg bg-[var(--av-primary-soft)] text-[var(--av-primary)] hover:bg-[var(--av-primary)] hover:text-white disabled:opacity-50">
                      <Check size={14} />
                    </button>
                    <button onClick={() => onDecide(r.id, 'rejected')} disabled={busy === r.id}
                      title="Dismiss"
                      className="p-1.5 rounded-lg bg-[var(--av-surface-3)] text-[var(--av-text-secondary)] hover:bg-[var(--av-danger)] hover:text-white disabled:opacity-50">
                      <X size={14} />
                    </button>
                  </div>
                  {r.status === 'accepted' && (
                    <button
                      onClick={() => onAct(r)}
                      disabled={busy === r.id}
                      className="text-[10px] font-medium px-2 py-1 rounded-lg bg-[var(--av-success-soft)] text-[var(--av-success)] hover:bg-[var(--av-success)] hover:text-white disabled:opacity-50 flex items-center gap-1"
                      title="Create a task from this recommendation (§14 action layer)"
                    >
                      <ListTodo size={11} /> Act → Create task
                    </button>
                  )}
                  {r.status === 'acted' && (
                    <span className="text-[10px] text-[var(--av-success)] flex items-center gap-0.5">
                      <Check size={10} /> Task created
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function EffectivenessCard({ rows }: { rows: any[] }) {
  const nairaFmt = (n: number | null) => n == null || !Number.isFinite(n) ? '—' : naira(n)
  return (
    <div className="rounded-2xl bg-white p-5 shadow-[var(--av-shadow-sm)] mb-6">
      <h3 className="text-sm font-semibold text-[var(--av-text)] flex items-center gap-1.5 mb-1">
        <Sparkles size={16} className="text-[var(--av-primary)]" /> Did the recommendations work?
      </h3>
      <p className="text-xs text-[var(--av-text-muted)] mb-3">
        How often you acted on each recommendation type, and whether the outcome matched the expected impact.
        <ClaimTag type="FACT" />
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[var(--av-text-muted)] border-b border-[var(--av-border)]">
              <th className="py-1.5 pr-3 font-medium">Rule</th>
              <th className="py-1.5 px-2 font-medium text-right">Issued</th>
              <th className="py-1.5 px-2 font-medium text-right">Accepted</th>
              <th className="py-1.5 px-2 font-medium text-right">Acted</th>
              <th className="py-1.5 px-2 font-medium text-right">Outcomes</th>
              <th className="py-1.5 px-2 font-medium text-right">Avg expected</th>
              <th className="py-1.5 pl-2 font-medium text-right">Avg actual</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const acted = Number(r.acted || 0)
              const outcomes = Number(r.outcome_recorded || 0)
              const successes = Number(r.success_count || 0)
              return (
                <tr key={i} className="border-b border-[var(--av-border)] last:border-0">
                  <td className="py-1.5 pr-3 font-mono text-[var(--av-text-secondary)]">{r.rule_id || '—'}</td>
                  <td className="py-1.5 px-2 text-right text-[var(--av-text)]">{r.issued || 0}</td>
                  <td className="py-1.5 px-2 text-right text-[var(--av-text)]">{r.accepted || 0}</td>
                  <td className="py-1.5 px-2 text-right text-[var(--av-text)]">{acted}</td>
                  <td className="py-1.5 px-2 text-right text-[var(--av-text)]">
                    {outcomes}{outcomes > 0 && <span className="text-[var(--av-success)]"> ({successes} ok)</span>}
                  </td>
                  <td className="py-1.5 px-2 text-right text-[var(--av-text-secondary)]">{nairaFmt(r.avg_expected)}</td>
                  <td className="py-1.5 pl-2 text-right font-medium text-[var(--av-text)]">{nairaFmt(r.avg_actual)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
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

// Executive Cockpit — role-segregated decision view for CEO/CFO/COO.
// Master Build Guide §10: revenue, cash, pipeline, people, operational
// health, exceptions, goals — with drill-down. Distinct from the
// personal Dashboard: this is the whole-business mirror for leaders.
// Every metric is tagged fact/inference/estimate (§20 evidence model).

import { useEffect, useState, useMemo, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useDbState, DbStateBanner } from '../lib/useDbState'
import {
  fetchCurrentMetrics, refreshBusinessMetrics, type GovernedMetric,
  fetchOpenRecommendations, decideRecommendation, acknowledgeRecommendation, fetchRecommendationEffectiveness, markRecommendationActed, recordRecommendationOutcome, fetchAlertActions, type Recommendation, type AlertAction,
  computeBusinessHealth, fetchBusinessHealth, type BusinessHealth, type HealthDimension,
  computeEbitda, type EbitdaResult,
  fetchBusinessBrain, type BusinessBrain, type BusinessState, type DiagnosisResult, type NextBestAction, type ValueLedger,
  recallSimilarProblems, type RecallResult,
  fetchProfitabilityLeakage, fetchPricingOpportunities, fetchGraphOverview,
  fetchProfitabilityBySegment, propagateImpact,
  type ProfitabilityLeakageResult, type PricingOpportunitiesResult, type GraphOverview,
  type ProfitabilityBySegmentResult, type ProfitabilitySegment, type PropagateImpactResult,
} from '../lib/businessOS'
import {
  TrendingUp, DollarSign, Users, Activity, AlertTriangle, Target,
  ArrowRight, Loader2, Banknote, Receipt, Briefcase, ShieldAlert,
  CalendarClock, Gauge, Sparkles, Check, X, Lightbulb, HeartPulse, HelpCircle, ListTodo,
  History, ChevronDown, Network, TrendingDown, Wallet, Tag, BarChart3, CheckCircle2,
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
  // THE BUSINESS BRAIN (State + Diagnosis + Next Best Action + Value Ledger).
  // One call renders the intelligence-first surface. Best-effort — stays null
  // (cards show honest empty states) if the brain migration isn't deployed.
  const [brain, setBrain] = useState<BusinessBrain | null>(null)
  // §G profitability decomposition + §J business graph. Best-effort — the
  // cards render honest empty states if the migrations aren't deployed yet.
  const [leakage, setLeakage] = useState<ProfitabilityLeakageResult | null>(null)
  const [pricing, setPricing] = useState<PricingOpportunitiesResult | null>(null)
  const [graph, setGraph] = useState<GraphOverview | null>(null)
  const [segments, setSegments] = useState<ProfitabilityBySegmentResult | null>(null)
  const [segLens, setSegLens] = useState<'customer' | 'product' | 'salesperson' | 'channel'>('customer')
  // §J impact simulator — "what happens if revenue changes by ₦X?"
  const [impact, setImpact] = useState<PropagateImpactResult | null>(null)
  const [impactDelta, setImpactDelta] = useState('100000')
  const [impactRunning, setImpactRunning] = useState(false)

  useEffect(() => {
    if (!bid) return
    let active = true
    setLoading(true); setError(null)
    ;(async () => {
      // Governed metrics + Business Health (§21): refresh metrics (best-effort,
      // non-blocking), then read the governed rows AND compute+read health.
      // If the migration isn't deployed yet, both stay empty silently.
      refreshBusinessMetrics(bid).finally(() => {
        fetchCurrentMetrics(bid).then(m => { if (active) setGoverned(m ?? []) })
          .catch(() => { /* migration not deployed yet — non-blocking */ })
        computeBusinessHealth(bid).finally(() => {
          fetchBusinessHealth(bid).then(h => { if (active) setHealth(h) })
            .catch(() => { /* migration not deployed yet — non-blocking */ })
        })
      })
      // Open recommendations (the "what needs my attention?" feed, §17).
      // Best-effort: stays empty if the recommendation migration isn't deployed.
      fetchOpenRecommendations(bid).then(r => { if (active) setRecommendations(r ?? []) })
        .catch(() => { /* migration not deployed yet — non-blocking */ })
      // §5.3 EBITDA — server-derived operating profitability. Best-effort.
      computeEbitda(bid).then(e => { if (active) setEbitda(e) })
        .catch(() => { /* migration not deployed yet — non-blocking */ })
      // §16 recommendation effectiveness — "did the action work?" learning loop.
      // Best-effort: stays empty if the migration isn't deployed.
      fetchRecommendationEffectiveness(bid).then(e => { if (active) setEffectiveness(e) })
        .catch(() => { /* migration not deployed yet — non-blocking */ })
      // THE BUSINESS BRAIN — State + Diagnosis + Next Best Action + Value Ledger
      // in one call. This is the intelligence-first surface (#1,#2,#5,#6,#7,#9).
      fetchBusinessBrain(bid).then(b => { if (active) setBrain(b) })
        .catch(() => { /* brain migration not deployed yet — non-blocking */ })
      // §G profitability decomposition — leakage detection + pricing opportunities.
      // Best-effort — the cards render honest empty states if not deployed.
      fetchProfitabilityLeakage(bid).then(l => { if (active) setLeakage(l) })
        .catch(() => { /* migration not deployed yet — non-blocking */ })
      fetchPricingOpportunities(bid).then(p => { if (active) setPricing(p) })
        .catch(() => { /* migration not deployed yet — non-blocking */ })
      // §G per-segment profitability drill-down (customer/product/salesperson/channel).
      fetchProfitabilityBySegment(bid, 'customer').then(s => { if (active) setSegments(s) })
        .catch(() => { /* migration not deployed yet — non-blocking */ })
      // §J business graph overview — the "one connected system" summary.
      fetchGraphOverview(bid).then(g => { if (active) setGraph(g) })
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

  // §G segment lens switcher — re-fetches the per-segment breakdown on lens change.
  const switchSegment = useCallback(async (lens: 'customer' | 'product' | 'salesperson' | 'channel') => {
    if (!bid) return
    setSegLens(lens)
    setSegments(null)
    const r = await fetchProfitabilityBySegment(bid, lens)
    setSegments(r)
  }, [bid])

  // §J impact simulator — runs the "what happens if?" scenario. The hub entity
  // from the graph overview is the starting point (if available).
  const runImpact = useCallback(async () => {
    if (!bid || !graph?.hub_entities?.[0]) return
    const delta = parseFloat(impactDelta)
    if (isNaN(delta)) return
    setImpactRunning(true)
    setImpact(null)
    const hub = graph.hub_entities[0]
    const r = await propagateImpact(bid, hub.entity_type, hub.entity_id, delta, 'Revenue change scenario')
    setImpact(r)
    setImpactRunning(false)
  }, [bid, graph, impactDelta])

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

          {/* THE AVENIZE BUSINESS BRAIN — the intelligence-first surface.
              State + Next Best Action + Diagnosis + Value Ledger, before the
              metrics. This is "what is happening / why / what should I do /
              how much value did Avenize create" — the directive's core. */}
          <BusinessStateCard state={brain?.state} />
          <NextBestActionCard nba={brain?.next_best_action} />
          <DiagnosisCard diagnoses={brain?.diagnoses} bid={bid} />
          <ValueLedgerCard ledger={brain?.value_ledger} />

          <BusinessHealthCard health={health} />
          <EbitdaCard ebitda={ebitda} />
          <LeakageCard leakage={leakage} />
          <PricingOpportunitiesCard pricing={pricing} />
          <GraphOverviewCard graph={graph} />
          <ProfitabilitySegmentCard
            segments={segments}
            lens={segLens}
            onSwitch={switchSegment}
          />
          <ImpactSimulatorCard
            graph={graph}
            impact={impact}
            delta={impactDelta}
            onDeltaChange={setImpactDelta}
            onRun={runImpact}
            running={impactRunning}
          />

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {metrics[lens].map((m, i) => <MetricCard key={i} {...m} />)}
          </div>

          <GovernedMetricsCard metrics={governed} />

          <RecommendationsCard
            recommendations={recommendations}
            busy={recBusy}
            businessId={bid ?? undefined}
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
            onRecordOutcome={async (r) => {
              // §16 outcome loop — record what actually happened so the
              // effectiveness card + recommendation engine can learn. The owner
              // describes the real result in plain language (never fabricated).
              const note = window.prompt('What actually happened? (e.g. "Customer paid the overdue invoice", "No change")')
              if (!note?.trim()) return
              setRecBusy(r.id)
              try {
                await recordRecommendationOutcome(r.id, { note: note.trim(), recorded_at: new Date().toISOString() })
                setRecommendations(prev =>
                  prev.map(rec => rec.id === r.id ? { ...rec, status: 'completed' as any } : rec)
                )
              } catch { /* non-blocking */ }
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
    <div className="av-card p-5 mb-6">
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
      <div className="av-card p-5 mb-6 flex items-center gap-3">
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
    <div className="av-card p-5 mb-6">
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
      <div className="av-card p-5 mb-6 flex items-center gap-3">
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
    <div className="av-card p-5 mb-6">
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
          const dimMetrics = dim?.metrics ?? []
          return (
            <div key={key} className="rounded-xl bg-[var(--av-surface-3)] p-2.5">
              <div className="text-[10px] text-[var(--av-text-muted)] uppercase tracking-wide">{DIM_LABELS[key] || key}</div>
              <div className="text-lg font-semibold" style={{ color: dTone }}>
                {dim?.score ?? '—'}
              </div>
              <div className="text-[9px] text-[var(--av-text-muted)]">
                {dim?.status === 'insufficient_data' ? 'no targets set' :
                 dimMetrics.length === 0 ? 'no data' : `${dimMetrics.length} metric${dimMetrics.length > 1 ? 's' : ''}`}
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
  recommendations, busy, onDecide, onAct, onRecordOutcome, businessId,
}: {
  recommendations: Recommendation[]
  busy: string | null
  onDecide: (id: string, decision: 'acknowledge' | 'accepted' | 'rejected') => void
  onAct: (r: Recommendation) => void
  onRecordOutcome: (r: Recommendation) => void
  businessId?: string
}) {
  const [expanded, setExpanded] = useState<string | null>(null)
  // §5.5 one-tap alert actions — the resolving action per recommendation rule.
  // Best-effort: stays empty if the alert_action_map migration isn't deployed.
  const [alertActions, setAlertActions] = useState<AlertAction[]>([])
  useEffect(() => {
    if (!businessId) return
    let active = true
    fetchAlertActions(businessId).then(a => { if (active) setAlertActions(a) })
      .catch(() => { /* migration not deployed — non-blocking */ })
    return () => { active = false }
  }, [businessId])
  const actionFor = (ruleId?: string | null) => alertActions.find(a => a.rule_id === ruleId)
  const sevColor = (s: string) =>
    s === 'critical' ? 'var(--av-danger)' : s === 'warning' ? 'var(--av-warning)' : 'var(--av-info)'
  return (
    <div className="av-card p-5 mb-6">
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
                  {r.status === 'accepted' && actionFor(r.rule_id) && (
                    <Link
                      to={actionFor(r.rule_id)!.route}
                      className="text-[10px] font-medium px-2 py-1 rounded-lg bg-[var(--av-primary-soft)] text-[var(--av-primary)] hover:bg-[var(--av-primary)] hover:text-white flex items-center gap-1"
                      title={`One-tap: ${actionFor(r.rule_id)!.label}`}
                    >
                      <ArrowRight size={11} /> {actionFor(r.rule_id)!.label}
                    </Link>
                  )}
                  {r.status === 'acted' && (
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-[var(--av-success)] flex items-center gap-0.5">
                        <Check size={10} /> Task created
                      </span>
                      <button
                        onClick={() => onRecordOutcome(r)}
                        disabled={busy === r.id}
                        className="text-[10px] font-medium px-2 py-1 rounded-lg bg-[var(--av-surface-3)] text-[var(--av-text-secondary)] hover:bg-[var(--av-border)] disabled:opacity-50 flex items-center gap-1"
                        title="Record what actually happened (§16 outcome loop)"
                      >
                        <CheckCircle2 size={11} /> Record outcome
                      </button>
                    </div>
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
    <div className="av-card p-5 mb-6">
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
    <div className="av-card p-5">
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
    <div className="av-card p-5">
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

// ============================================================================
// THE AVENIZE BUSINESS BRAIN — State, Next Best Action, Diagnosis, Value Ledger.
// The four engines that turn isolated modules into one intelligent organism.
// Every card degrades to an honest empty state when the brain migration isn't
// deployed (§24) — no error, no fabricated numbers.
// ============================================================================

const STATE_STYLE: Record<string, { tone: string; label: string }> = {
  growing: { tone: 'success', label: 'Growing' },
  stable: { tone: 'info', label: 'Stable' },
  scaling: { tone: 'success', label: 'Scaling' },
  stressed: { tone: 'warning', label: 'Stressed' },
  recovering: { tone: 'info', label: 'Recovering' },
  at_risk: { tone: 'danger', label: 'At risk' },
  cash_constrained: { tone: 'danger', label: 'Cash constrained' },
  sales_constrained: { tone: 'warning', label: 'Sales constrained' },
  capacity_constrained: { tone: 'warning', label: 'Capacity constrained' },
  operationally_constrained: { tone: 'warning', label: 'Operationally constrained' },
  opportunity_rich: { tone: 'success', label: 'Opportunity-rich' },
  insufficient_data: { tone: 'muted', label: 'Building a picture' },
}

function BusinessStateCard({ state }: { state?: BusinessState | null }) {
  if (!state) return null
  if (state.degraded || state.error) {
    return (
      <div className="rounded-2xl bg-[var(--av-surface)] p-5 mb-4 border-l-4" style={{ borderLeftColor: 'var(--av-warning)' }}>
        <div className="flex items-center gap-2 mb-1">
          <AlertTriangle size={16} className="text-[var(--av-warning)]" />
          <span className="text-sm font-medium text-[var(--av-text)]">Business state is temporarily unavailable</span>
        </div>
        <p className="text-sm text-[var(--av-text-secondary)]">The state engine could not complete just now — the rest of your business is unaffected. This will refresh automatically.</p>
      </div>
    )
  }
  const style = STATE_STYLE[state.state] ?? { tone: 'muted', label: state.state }
  const toneColor = {
    success: 'var(--av-success)', info: 'var(--av-info)', warning: 'var(--av-warning)',
    danger: 'var(--av-danger)', muted: 'var(--av-text-muted)',
  }[style.tone] ?? 'var(--av-text-muted)'
  return (
    <div className="rounded-2xl bg-[var(--av-surface)] p-5 mb-4">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Activity size={16} style={{ color: toneColor }} />
            <span className="text-xs uppercase tracking-wide text-[var(--av-text-muted)]">Business state</span>
            <ClaimTag type={state.confidence === 'high' ? 'FACT' : state.confidence === 'insufficient' ? 'UNKNOWN' : 'INFERENCE'} />
          </div>
          <h3 className="text-xl font-semibold" style={{ color: toneColor }}>{style.label}</h3>
        </div>
        <div className="text-xs text-[var(--av-text-muted)]">
          Confidence: {state.confidence}
        </div>
      </div>
      {state.reasons?.length > 0 && (
        <ul className="space-y-1.5">
          {state.reasons.slice(0, 3).map((r, i) => (
            <li key={i} className="text-sm text-[var(--av-text-secondary)] flex items-start gap-2">
              <ClaimTag type={r.evidence as any} />
              <span>{r.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function NextBestActionCard({ nba }: { nba?: NextBestAction | null }) {
  if (!nba) return null
  if (nba.degraded || nba.error) {
    return (
      <div className="rounded-2xl bg-[var(--av-surface)] p-5 mb-4 border-l-4" style={{ borderLeftColor: 'var(--av-warning)' }}>
        <div className="flex items-center gap-2 mb-1">
          <AlertTriangle size={16} className="text-[var(--av-warning)]" />
          <span className="text-sm font-medium text-[var(--av-text)]">Next best action is temporarily unavailable</span>
        </div>
        <p className="text-sm text-[var(--av-text-secondary)]">The prioritisation engine could not complete just now. Your data is safe; this will refresh automatically.</p>
      </div>
    )
  }
  const action = nba.action
  if (!action) {
    return (
      <div className="rounded-2xl bg-[var(--av-surface)] p-5 mb-4 border-l-4" style={{ borderLeftColor: 'var(--av-success)' }}>
        <div className="flex items-center gap-2 mb-1">
          <Sparkles size={16} className="text-[var(--av-success)]" />
          <span className="text-sm font-medium text-[var(--av-text)]">Nothing needs your attention right now</span>
        </div>
        <p className="text-sm text-[var(--av-text-secondary)]">{nba.note ?? 'You are all caught up.'}</p>
      </div>
    )
  }
  const sevColor = action.severity === 'critical' ? 'var(--av-danger)'
    : action.severity === 'warning' ? 'var(--av-warning)' : 'var(--av-info)'
  return (
    <div className="rounded-2xl bg-[var(--av-surface)] p-5 mb-4 border-l-4" style={{ borderLeftColor: sevColor }}>
      <div className="flex items-center gap-2 mb-2">
        <Lightbulb size={16} style={{ color: sevColor }} />
        <span className="text-xs uppercase tracking-wide text-[var(--av-text-muted)]">Next best action</span>
        {nba.business_state && (
          <span className="text-xs text-[var(--av-text-muted)]">· relevant to your {nba.business_state.replace(/_/g, ' ')} state</span>
        )}
      </div>
      <p className="text-base font-medium text-[var(--av-text)] mb-2">{action.statement}</p>
      {action.expected_impact?.amount != null && action.expected_impact.amount > 0 && (
        <p className="text-sm mb-2" style={{ color: 'var(--av-success)' }}>
          Expected impact: {naira(action.expected_impact.amount)}
          {action.expected_impact.description ? ` — ${action.expected_impact.description}` : ''}
        </p>
      )}
      {action._nba_reason && (
        <p className="text-xs text-[var(--av-text-muted)] mb-3">
          Why this: {action._nba_reason}
          {action._nba_due_at && ` · suggested by ${new Date(action._nba_due_at).toLocaleDateString()}`}
        </p>
      )}
      {action.action_type && (
        <Link to="/app/tasks" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-white" style={{ backgroundColor: 'var(--av-primary)' }}>
          {action.action_type === 'create_task' ? 'Create task' : action.action_type === 'create_po' ? 'Create PO' : 'Take action'} <ArrowRight size={12} />
        </Link>
      )}
    </div>
  )
}

function DiagnosisCard({ diagnoses, bid }: { diagnoses?: DiagnosisResult | null; bid?: string | null }) {
  if (!diagnoses) return null
  if (diagnoses.degraded || diagnoses.error) {
    return (
      <div className="rounded-2xl bg-[var(--av-surface)] p-5 mb-4 border-l-4" style={{ borderLeftColor: 'var(--av-warning)' }}>
        <div className="flex items-center gap-2 mb-1">
          <AlertTriangle size={16} className="text-[var(--av-warning)]" />
          <span className="text-sm font-medium text-[var(--av-text)]">Diagnosis is temporarily unavailable</span>
        </div>
        <p className="text-sm text-[var(--av-text-secondary)]">The diagnosis engine could not complete just now. This will refresh automatically.</p>
      </div>
    )
  }
  const list = diagnoses.diagnoses ?? []
  if (list.length === 0) {
    return diagnoses.note ? (
      <div className="rounded-2xl bg-[var(--av-surface)] p-5 mb-4">
        <div className="flex items-center gap-2 mb-1">
          <HelpCircle size={16} className="text-[var(--av-text-muted)]" />
          <span className="text-sm font-medium text-[var(--av-text)]">Diagnoses</span>
        </div>
        <p className="text-sm text-[var(--av-text-secondary)]">{diagnoses.note}</p>
      </div>
    ) : null
  }
  return (
    <div className="rounded-2xl bg-[var(--av-surface)] p-5 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle size={16} className="text-[var(--av-warning)]" />
        <span className="text-sm font-medium text-[var(--av-text)]">What we found — and why</span>
      </div>
      <div className="space-y-4">
        {list.slice(0, 4).map((d, i) => (
          <DiagnosisItem key={i} d={d} bid={bid} />
        ))}
      </div>
    </div>
  )
}

// §I: each diagnosis can expand to recall prior similar problems + what was
// tried + the outcome. Best-effort + non-blocking (§24).
function DiagnosisItem({ d, bid }: { d: any; bid?: string | null }) {
  const [open, setOpen] = useState(false)
  const [recall, setRecall] = useState<RecallResult | null>(null)
  const [loading, setLoading] = useState(false)

  const toggle = () => {
    if (!open && bid && !recall) {
      setLoading(true)
      recallSimilarProblems(bid, d.rule_id, d.symptom_metric)
        .then(r => setRecall(r))
        .catch(() => { /* migration not deployed — non-blocking */ })
        .finally(() => setLoading(false))
    }
    setOpen(!open)
  }

  return (
    <div className="border-l-2 pl-3" style={{ borderLeftColor: d.severity === 'critical' ? 'var(--av-danger)' : 'var(--av-warning)' }}>
      <p className="text-sm font-medium text-[var(--av-text)] mb-1">{d.headline}</p>
      <p className="text-sm text-[var(--av-text-secondary)] mb-1.5">{d.relationship}</p>
      <div className="flex items-center gap-3 text-xs text-[var(--av-text-muted)]">
        <ClaimTag type="FACT" /> symptom
        <ClaimTag type="INFERENCE" /> cause link
        {d.impact_amount != null && <span>· ~{naira(d.impact_amount)} monthly exposure</span>}
      </div>
      {bid && (
        <button onClick={toggle}
          className="mt-2 inline-flex items-center gap-1 text-xs text-[var(--av-primary)] hover:underline">
          <History size={12} />
          {loading ? 'Recalling…' : open ? 'Hide similar past problems' : 'Similar past problems'}
          {!loading && <ChevronDown size={12} className={open ? 'rotate-180 transition-transform' : 'transition-transform'} />}
        </button>
      )}
      {open && recall && (
        <div className="mt-2 space-y-2 rounded-lg bg-[var(--av-surface-3)] p-3">
          {(recall.matches ?? []).length === 0 ? (
            <p className="text-xs text-[var(--av-text-muted)]">{recall.note ?? 'No similar past problems found yet.'}</p>
          ) : (
            (recall.matches ?? []).map((m, j) => (
              <div key={j} className="text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="font-medium text-[var(--av-text)]">{m.title}</span>
                  <ClaimTag type={m.evidence_tag} />
                  {m.relevance === 'high' && <span className="rounded bg-[var(--av-primary-soft)] px-1 py-0.5 text-[9px] text-[var(--av-primary)]">strong match</span>}
                </div>
                {m.what_happened && <p className="mt-0.5 text-[var(--av-text-secondary)]">{m.what_happened}</p>}
                {m.what_was_tried && <p className="mt-0.5 text-[var(--av-text-secondary)]"><span className="text-[var(--av-text-muted)]">Tried:</span> {m.what_was_tried}</p>}
                {(m.outcome || m.lesson) && <p className="mt-0.5 text-[var(--av-text-secondary)]"><span className="text-[var(--av-text-muted)]">Outcome:</span> {m.outcome ?? m.lesson}</p>}
                {m.date && <p className="mt-0.5 text-[10px] text-[var(--av-text-muted)]">{new Date(m.date).toLocaleDateString()}</p>}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

function ValueLedgerCard({ ledger }: { ledger?: ValueLedger | null }) {
  if (!ledger) return null
  if (ledger.degraded || ledger.error) {
    return (
      <div className="rounded-2xl bg-[var(--av-surface)] p-5 mb-4 border-l-4" style={{ borderLeftColor: 'var(--av-warning)' }}>
        <div className="flex items-center gap-2 mb-1">
          <AlertTriangle size={16} className="text-[var(--av-warning)]" />
          <span className="text-sm font-medium text-[var(--av-text)]">Value ledger is temporarily unavailable</span>
        </div>
        <p className="text-sm text-[var(--av-text-secondary)]">The value-tracking engine could not complete just now. Your recorded outcomes are safe; this will refresh automatically.</p>
      </div>
    )
  }
  const hasValue = ledger.total_value > 0 || ledger.identified > 0
  if (!hasValue && ledger.note) {
    return (
      <div className="rounded-2xl bg-[var(--av-surface)] p-5 mb-4">
        <div className="flex items-center gap-2 mb-1">
          <DollarSign size={16} className="text-[var(--av-text-muted)]" />
          <span className="text-sm font-medium text-[var(--av-text)]">Value Avenize has created</span>
        </div>
        <p className="text-sm text-[var(--av-text-secondary)]">{ledger.note}</p>
      </div>
    )
  }
  return (
    <div className="rounded-2xl bg-[var(--av-surface)] p-5 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <DollarSign size={16} className="text-[var(--av-success)]" />
        <span className="text-sm font-medium text-[var(--av-text)]">Value Avenize has created</span>
        <ClaimTag type="FACT" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-3">
        <div>
          <div className="text-2xl font-bold text-[var(--av-success)]">{naira(ledger.recovered)}</div>
          <div className="text-xs text-[var(--av-text-muted)]">Recovered</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-[var(--av-info)]">{naira(ledger.saved)}</div>
          <div className="text-xs text-[var(--av-text-muted)]">Saved</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-[var(--av-primary)]">{naira(ledger.generated)}</div>
          <div className="text-xs text-[var(--av-text-muted)]">Generated</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-[var(--av-text-secondary)]">{naira(ledger.identified)}</div>
          <div className="text-xs text-[var(--av-text-muted)]">Identified</div>
        </div>
      </div>
      <div className="flex items-center gap-4 text-xs text-[var(--av-text-muted)]">
        <span>{ledger.recommendations_acted} acted on</span>
        <span>· {ledger.outcomes_recorded} outcomes recorded</span>
        <span>· {ledger.successful_outcomes} successful</span>
      </div>
    </div>
  )
}

// ============================================================================
// §G LeakageCard — "where is the business losing money?" Surfaces overdue
// invoices, declining-margin customers, underpriced won deals, stale
// receivables. Each finding cites REAL numbers (§22). Best-effort — honest
// empty state when the migration isn't deployed or no leakage exists.
// ============================================================================
function LeakageCard({ leakage }: { leakage: ProfitabilityLeakageResult | null }) {
  const [expanded, setExpanded] = useState(false)
  if (!leakage || !leakage.authorized) return null
  // Defensive: the RPC payload is server-controlled; a drifted/defective
  // response can omit the finding arrays (Session-42 crash). Treat missing
  // arrays as empty so the card degrades to the "none" branch, not a crash.
  const overdue = leakage.overdue ?? []
  const declining_margin = leakage.declining_margin ?? []
  const negative_margin_deals = leakage.negative_margin_deals ?? []
  const stale_receivables = leakage.stale_receivables ?? []
  const hasFindings =
    overdue.length > 0 ||
    declining_margin.length > 0 ||
    negative_margin_deals.length > 0 ||
    stale_receivables.length > 0
  if (!hasFindings) {
    return (
      <div className="av-card p-5 mb-4">
        <div className="flex items-center gap-2 mb-1">
          <Wallet size={16} className="text-[var(--av-success)]" />
          <span className="text-sm font-medium text-[var(--av-text)]">Leakage detection</span>
          <ClaimTag type="FACT" />
        </div>
        <p className="text-xs text-[var(--av-text-muted)]">{leakage.note ?? 'No leakage detected.'}</p>
      </div>
    )
  }
  return (
    <div className="av-card p-5 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle size={16} className="text-[var(--av-warning)]" />
        <span className="text-sm font-medium text-[var(--av-text)]">Where you might be losing money</span>
        <ClaimTag type="FACT" />
        <span className="ml-auto text-xs font-semibold text-[var(--av-danger)]">{naira(leakage.total_exposure)} at risk</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
        <div className="text-center">
          <div className="text-lg font-bold text-[var(--av-danger)]">{overdue.length}</div>
          <div className="text-[10px] text-[var(--av-text-muted)] uppercase">Overdue</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold text-[var(--av-warning)]">{declining_margin.length}</div>
          <div className="text-[10px] text-[var(--av-text-muted)] uppercase">Declining margin</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold text-[var(--av-warning)]">{negative_margin_deals.length}</div>
          <div className="text-[10px] text-[var(--av-text-muted)] uppercase">Underpriced deals</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold text-[var(--av-text-secondary)]">{stale_receivables.length}</div>
          <div className="text-[10px] text-[var(--av-text-muted)] uppercase">Stale receivables</div>
        </div>
      </div>
      {overdue.length > 0 && (
        <div className="mb-2">
          <p className="text-xs font-medium text-[var(--av-text-secondary)] mb-1">Overdue invoices</p>
          {overdue.slice(0, expanded ? undefined : 3).map((o, i) => (
            <div key={i} className="flex items-center justify-between py-1 text-xs">
              <span className="text-[var(--av-text)] truncate">{o.client_name} {o.invoice_number && `· ${o.invoice_number}`}</span>
              <span className="text-[var(--av-danger)] font-medium">{naira(o.total ?? 0)} · {o.days_overdue}d late</span>
            </div>
          ))}
        </div>
      )}
      {declining_margin.length > 0 && (
        <div className="mb-2">
          <p className="text-xs font-medium text-[var(--av-text-secondary)] mb-1">Customers with declining margin</p>
          {declining_margin.slice(0, expanded ? undefined : 3).map((d, i) => (
            <div key={i} className="flex items-center justify-between py-1 text-xs">
              <span className="text-[var(--av-text)] truncate">{d.client_name}</span>
              <span className="text-[var(--av-danger)] font-medium">{d.margin_pct}% (was {d.prior_margin}%)</span>
            </div>
          ))}
        </div>
      )}
      {hasFindings && (
        <button onClick={() => setExpanded(e => !e)} className="text-xs text-[var(--av-primary)] hover:underline mt-1">
          {expanded ? 'Show less' : 'Show all findings'}
        </button>
      )}
    </div>
  )
}

// ============================================================================
// §G PricingOpportunitiesCard — "room to discount" (high margin) + "raise
// price or cut cost" (low margin). Best-effort — honest empty state.
// ============================================================================
function PricingOpportunitiesCard({ pricing }: { pricing: PricingOpportunitiesResult | null }) {
  if (!pricing || !pricing.authorized) return null
  const high_margin = pricing.high_margin ?? []
  const low_margin = pricing.low_margin ?? []
  if (high_margin.length === 0 && low_margin.length === 0) {
    return (
      <div className="av-card p-5 mb-4">
        <div className="flex items-center gap-2 mb-1">
          <Tag size={16} className="text-[var(--av-primary)]" />
          <span className="text-sm font-medium text-[var(--av-text)]">Pricing opportunities</span>
          <ClaimTag type="INFERENCE" />
        </div>
        <p className="text-xs text-[var(--av-text-muted)]">{pricing.note ?? 'No pricing opportunities detected yet.'}</p>
      </div>
    )
  }
  return (
    <div className="av-card p-5 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <Tag size={16} className="text-[var(--av-primary)]" />
        <span className="text-sm font-medium text-[var(--av-text)]">Pricing opportunities</span>
        <ClaimTag type="INFERENCE" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {high_margin.length > 0 && (
          <div>
            <p className="text-xs font-medium text-[var(--av-success)] mb-1">Room to discount (high margin ≥40%)</p>
            {high_margin.map((p, i) => (
              <div key={i} className="flex items-center justify-between py-1 text-xs">
                <span className="text-[var(--av-text)] truncate">{p.product}</span>
                <span className="text-[var(--av-success)] font-medium">{p.margin_pct}% · {naira(p.revenue)}</span>
              </div>
            ))}
          </div>
        )}
        {low_margin.length > 0 && (
          <div>
            <p className="text-xs font-medium text-[var(--av-danger)] mb-1">Raise price or cut cost (low margin ≤15%)</p>
            {low_margin.map((p, i) => (
              <div key={i} className="flex items-center justify-between py-1 text-xs">
                <span className="text-[var(--av-text)] truncate">{p.product}</span>
                <span className="text-[var(--av-danger)] font-medium">{p.margin_pct}% · {naira(p.revenue)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// §J GraphOverviewCard — the "one connected system" summary. Shows the
// business's relationship graph at a glance: nodes, edges, hub entities.
// Best-effort — honest empty state when no relationships are mapped yet.
// ============================================================================
function GraphOverviewCard({ graph }: { graph: GraphOverview | null }) {
  if (!graph || !graph.authorized) return null
  if (graph.total_edges === 0) {
    return (
      <div className="av-card p-5 mb-4">
        <div className="flex items-center gap-2 mb-1">
          <Network size={16} className="text-[var(--av-primary)]" />
          <span className="text-sm font-medium text-[var(--av-text)]">Your business graph</span>
        </div>
        <p className="text-xs text-[var(--av-text-muted)]">{graph.note ?? 'No relationships mapped yet.'}</p>
      </div>
    )
  }
  const nodesByType = graph.nodes_by_type ?? []
  const hubEntities = graph.hub_entities ?? []
  return (
    <div className="av-card p-5 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <Network size={16} className="text-[var(--av-primary)]" />
        <span className="text-sm font-medium text-[var(--av-text)]">Your business graph — one connected system</span>
        <span className="ml-auto text-xs text-[var(--av-text-muted)]">{graph.total_edges} connections</span>
      </div>
      <div className="flex flex-wrap gap-2 mb-3">
        {nodesByType.map((n, i) => (
          <span key={i} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-[var(--av-surface-2)] text-xs text-[var(--av-text-secondary)]">
            <span className="capitalize">{n.entity_type}</span>
            <span className="font-medium text-[var(--av-text)]">{n.node_count}</span>
          </span>
        ))}
      </div>
      {hubEntities.length > 0 && (
        <div>
          <p className="text-xs font-medium text-[var(--av-text-secondary)] mb-1">Most connected (most influential)</p>
          {hubEntities.slice(0, 3).map((h, i) => (
            <div key={i} className="flex items-center justify-between py-1 text-xs">
              <span className="text-[var(--av-text)] capitalize">{h.entity_type}</span>
              <span className="text-[var(--av-primary)] font-medium">{h.connections} connections</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// §G ProfitabilitySegmentCard — the per-segment drill-down. "Where is the
// business making money?" Toggles customer / product / salesperson / channel.
// Cost is revenue-proportionally allocated — surfaced honestly (§22).
// ============================================================================
const SEGMENT_LENSES: { key: 'customer' | 'product' | 'salesperson' | 'channel'; label: string }[] = [
  { key: 'customer', label: 'Customer' },
  { key: 'product', label: 'Product' },
  { key: 'salesperson', label: 'Salesperson' },
  { key: 'channel', label: 'Channel' },
]
function ProfitabilitySegmentCard({
  segments, lens, onSwitch,
}: {
  segments: ProfitabilityBySegmentResult | null
  lens: 'customer' | 'product' | 'salesperson' | 'channel'
  onSwitch: (l: 'customer' | 'product' | 'salesperson' | 'channel') => void
}) {
  if (!segments || !segments.authorized) return null
  const rows = segments.segments ?? []
  if (rows.length === 0) {
    return (
      <div className="av-card p-5 mb-4">
        <div className="flex items-center gap-2 mb-1">
          <BarChart3 size={16} className="text-[var(--av-primary)]" />
          <span className="text-sm font-medium text-[var(--av-text)]">Profitability by segment</span>
          <ClaimTag type="FACT" />
        </div>
        <p className="text-xs text-[var(--av-text-muted)]">No {lens} revenue in this period yet. As you bill customers, this surfaces where you make money.</p>
      </div>
    )
  }
  return (
    <div className="av-card p-5 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <BarChart3 size={16} className="text-[var(--av-primary)]" />
        <span className="text-sm font-medium text-[var(--av-text)]">Where you make money — by {lens}</span>
        <ClaimTag type="FACT" />
      </div>
      <div className="flex gap-1 mb-3 flex-wrap">
        {SEGMENT_LENSES.map(l => (
          <button
            key={l.key}
            onClick={() => onSwitch(l.key)}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition ${lens === l.key
              ? 'bg-[var(--av-primary)] text-white'
              : 'bg-[var(--av-surface-2)] text-[var(--av-text-secondary)] hover:bg-[var(--av-border)]'}`}
          >
            {l.label}
          </button>
        ))}
      </div>
      <div className="text-[10px] text-[var(--av-text-muted)] mb-2">
        Revenue: {naira(segments.total_revenue)} · COGS: {naira(segments.total_cogs)} · cost allocation: {segments.cost_allocation} (estimate)
      </div>
      <div className="space-y-1">
        {rows.slice(0, 10).map((r, i) => (
          <div key={i} className="flex items-center justify-between py-1 text-xs border-b border-[var(--av-border)] last:border-0">
            <span className="text-[var(--av-text)] truncate flex-1 mr-2">{r.segment_name}</span>
            <span className="text-[var(--av-text-secondary)] w-20 text-right">{naira(r.revenue)}</span>
            <span className="text-[var(--av-text-muted)] w-16 text-right">{naira(r.cost)}</span>
            <span className={`w-20 text-right font-medium ${r.profit >= 0 ? 'text-[var(--av-success)]' : 'text-[var(--av-danger)]'}`}>{naira(r.profit)}</span>
            <span className="w-14 text-right text-[var(--av-text-muted)]">{r.margin_pct != null ? `${r.margin_pct}%` : '—'}</span>
          </div>
        ))}
      </div>
      {rows.length > 10 && <p className="text-[10px] text-[var(--av-text-muted)] mt-2">Showing top 10 of {rows.length} by profit.</p>}
    </div>
  )
}

// ============================================================================
// §J ImpactSimulatorCard — "what happens if...?" The deterministic precursor
// to the §S Digital Twin. Picks the most-connected hub entity as the start,
// applies a hypothetical revenue delta, and shows the downstream propagated
// effect with FACT/INFERENCE/UNKNOWN tags (§20). Best-effort — honest empty
// state when no graph edges exist or the migration isn't deployed.
// ============================================================================
function ImpactSimulatorCard({
  graph, impact, delta, onDeltaChange, onRun, running,
}: {
  graph: GraphOverview | null
  impact: PropagateImpactResult | null
  delta: string
  onDeltaChange: (v: string) => void
  onRun: () => void
  running: boolean
}) {
  const hub = graph?.hub_entities?.[0]
  if (!graph || !graph.authorized || graph.total_edges === 0 || !hub) {
    return (
      <div className="av-card p-5 mb-4">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles size={16} className="text-[var(--av-primary)]" />
          <span className="text-sm font-medium text-[var(--av-text)]">Scenario simulator — "what if?"</span>
        </div>
        <p className="text-xs text-[var(--av-text-muted)]">Map relationships first (as deals close and invoices are paid) before simulating scenarios. This becomes the Digital Twin once your graph has connections.</p>
      </div>
    )
  }
  return (
    <div className="av-card p-5 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles size={16} className="text-[var(--av-primary)]" />
        <span className="text-sm font-medium text-[var(--av-text)]">Scenario simulator — "what happens if?"</span>
        <ClaimTag type="INFERENCE" />
      </div>
      <p className="text-xs text-[var(--av-text-muted)] mb-3">
        Start: your most-connected {hub.entity_type}. The simulator estimates downstream revenue/cash effects along the relationship graph. Indirect effects shrink with depth.
      </p>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs text-[var(--av-text-secondary)]">If revenue changes by</span>
        <input
          type="number"
          value={delta}
          onChange={e => onDeltaChange(e.target.value)}
          className="w-28 px-2 py-1 rounded-lg border border-[var(--av-border)] text-sm outline-none focus:border-[var(--av-primary)]"
          placeholder="100000"
        />
        <button
          onClick={onRun}
          disabled={running}
          className="px-3 py-1 rounded-lg bg-[var(--av-primary)] text-white text-xs font-medium hover:bg-[var(--av-primary-hover)] disabled:opacity-50"
        >
          {running ? 'Simulating…' : 'Simulate impact'}
        </button>
      </div>
      {impact && impact.authorized && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-[var(--av-text-secondary)] mb-1">
            Downstream impact ({(impact.impacted_entities ?? []).length} entities)
          </p>
          {(impact.impacted_entities ?? []).length === 0 ? (
            <p className="text-xs text-[var(--av-text-muted)] italic">{impact.note ?? 'No downstream entities mapped.'}</p>
          ) : (
            (impact.impacted_entities ?? []).slice(0, 8).map((e, i) => (
              <div key={i} className="flex items-center justify-between py-1 text-xs border-b border-[var(--av-border)] last:border-0">
                <span className="text-[var(--av-text)] capitalize flex-1 truncate">{e.impact_description}</span>
                <span className="w-24 text-right font-medium" style={{
                  color: e.propagated_delta == null ? 'var(--av-text-muted)' :
                         e.propagated_delta >= 0 ? 'var(--av-success)' : 'var(--av-danger)'
                }}>
                  {e.propagated_delta != null ? naira(e.propagated_delta) : '—'}
                </span>
                <span className="w-20 text-right text-[var(--av-text-muted)]">{e.evidence_tag}</span>
              </div>
            ))
          )}
          <p className="text-[10px] text-[var(--av-text-muted)] mt-1">
            FACT = measured downstream value · INFERENCE = estimated · UNKNOWN = no economic mapping yet.
          </p>
        </div>
      )}
    </div>
  )
}

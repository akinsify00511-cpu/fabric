/**
 * BusinessHome — the role-aware intelligence-first `/app` surface.
 *
 * ONE Business Brain, MANY role windows. The same connected business
 * organism, presented according to WHO is looking:
 *   - Owner/Admin   → the whole-business window (state, revenue, cash, profit, pulse)
 *   - Manager       → cross-functional execution window (ops, people, pipeline)
 *   - Team Lead     → delivery window (ops, people)
 *   - Staff         → personal work window (next best action, own work)
 *
 * Architecture: getRoleHomeConfig(role) declares which reusable card kinds
 * to compose. The cards are backed by REAL intelligence RPCs
 * (business_brain / current_metrics / current_business_health /
 * fetchOpenRecommendations / fetchProfitabilityLeakage) — no fabricated
 * metrics (§22). Every number is tagged FACT/INFERENCE/UNKNOWN.
 *
 * Adaptive hero: the greeting + subtitle change by business state
 * (healthy / needs attention / brand-new). A brand-new business gets a
 * gamified onboarding hero ("Let's build your business picture") instead of
 * a dead dashboard.
 *
 * SECURITY: role personalization is UX ONLY — it emphasizes cards, never
 * grants access. RLS + backend authorization remain the final authority.
 *
 * Visual language: glass surfaces, atmospheric gradients, soft float
 * shadows, large rounded containers, dominant large numbers, generous
 * whitespace. Premium SaaS — not corporate ERP. Subtle motion communicates
 * life (ambient state glow, pulse dots), not decoration.
 *
 * Resilience: if the Brain migration isn't deployed, cards degrade
 * gracefully (honest "—" + "building your picture"), the hero falls back to
 * the greeting, and operational My Work still renders. One intelligence
 * engine failing never collapses the home (§N).
 */
import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useExperienceContext } from '../lib/useExperienceContext'
import { getRoleHomeConfig, roleLabel, type CardKind } from '../lib/roleHomeConfig'
import {
  fetchBusinessBrain, fetchCurrentMetrics, refreshBusinessMetrics,
  fetchBusinessHealth, computeBusinessHealth, fetchOpenRecommendations,
  fetchProfitabilityLeakage, fetchValueLedger,
  type BusinessBrain, type GovernedMetric, type BusinessHealth,
  type Recommendation, type ProfitabilityLeakageResult, type ValueLedger,
} from '../lib/businessOS'
import {
  GlassCard, StateCard, NextBestActionCard, RevenueCard, CashCard, ProfitCard,
  PulseCard, OperationsCard, PeopleCard, ValueLedgerCard, OpportunitiesCard,
  RisksCard, DiagnosesCard, PipelineCard, CustomersCard, BigNumber,
} from '../components/BusinessHomeCards'
import { Sparkles, ArrowRight, ListTodo, CheckCircle2, Loader2 } from 'lucide-react'

interface ActionItem { id: string; title: string; to: string; tone: 'red' | 'amber' | 'blue'; detail?: string }

export default function BusinessHome() {
  const { staff } = useAuth()
  const ctx = useExperienceContext()
  const bid = staff?.business_id ?? null
  const role = staff?.active_role ?? staff?.role ?? null
  const config = useMemo(() => getRoleHomeConfig(role), [role])

  const [brain, setBrain] = useState<BusinessBrain | null>(null)
  const [metrics, setMetrics] = useState<GovernedMetric[]>([])
  const [health, setHealth] = useState<BusinessHealth | null>(null)
  const [recommendations, setRecommendations] = useState<Recommendation[]>([])
  const [leakage, setLeakage] = useState<ProfitabilityLeakageResult | null>(null)
  const [ledger, setLedger] = useState<ValueLedger | null>(null)
  const [actions, setActions] = useState<ActionItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!bid) return
    let active = true
    setLoading(true)

    // Fire-and-forget all intelligence loads in parallel; each is best-effort
    // (§24). A failure in one never blocks the others — the cards degrade.
    const load = async () => {
      refreshBusinessMetrics(bid).catch(() => {})
      fetchBusinessBrain(bid).then(b => active && setBrain(b)).catch(() => {})
      fetchCurrentMetrics(bid).then(m => active && setMetrics(m ?? [])).catch(() => {})
      computeBusinessHealth(bid).catch(() => {})
      fetchBusinessHealth(bid).then(h => active && setHealth(h)).catch(() => {})
      fetchOpenRecommendations(bid, 20).then(r => active && setRecommendations(r ?? [])).catch(() => {})
      fetchProfitabilityLeakage(bid).then(l => active && setLeakage(l)).catch(() => {})
      fetchValueLedger(bid).then(v => active && setLedger(v)).catch(() => {})

      // Personal "what needs me" — pending approvals + overdue tasks.
      try {
        const [approvals, tasks] = await Promise.all([
          supabase.from('approvals').select('id, entity_type, description, status')
            .eq('business_id', bid).eq('status', 'pending').limit(5),
          supabase.from('tasks').select('id, title, due_date, assignee_id')
            .eq('business_id', bid).neq('status', 'done').limit(8),
        ])
        if (!active) return
        const items: ActionItem[] = []
        ;(approvals.data ?? []).forEach((a: any) => items.push({ id: a.id, title: a.description || 'Approval needed', to: '/app/approvals', tone: 'red' }))
        ;(tasks.data ?? []).forEach((t: any) => {
          const overdue = t.due_date && new Date(t.due_date) < new Date()
          items.push({ id: t.id, title: t.title, to: '/app/tasks', tone: overdue ? 'red' : 'amber', detail: overdue ? 'Overdue' : 'Due' })
        })
        setActions(items)
      } catch { /* non-blocking */ }
      if (active) setLoading(false)
    }
    load()
    return () => { active = false }
  }, [bid])

  const firstName = (staff?.full_name || staff?.name || 'there').split(' ')[0]
  const state = brain?.state
  // Adaptive hero: pick the subtitle by the real business state.
  const isNew = (ctx.companySize === 0 || !state || state.state === 'insufficient_data') && actions.length === 0
  const needsAttention = state && ['stressed', 'at_risk', 'cash_constrained', 'sales_constrained', 'capacity_constrained'].includes(state.state)
  const heroSubtitle = isNew ? config.heroNew : needsAttention ? config.heroAttention : state && ['growing', 'opportunity_rich'].includes(state.state) ? config.heroHealthy : config.heroHealthy

  const greeting = getGreeting()

  return (
    <div className="min-h-screen relative" style={{ background: 'var(--av-home-bg)' }}>
      {/* Atmospheric background — soft blue/lavender/mint ambient gradients */}
      <div className="pointer-events-none fixed inset-0" style={{ background: 'var(--av-atmosphere)' }} />

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* ── Hero ─────────────────────────────────────────────────── */}
        <header className="mb-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider mb-1" style={{ color: 'var(--av-text-muted)' }}>
                {config.heroEyebrow}{roleLabel(role) ? ` · ${roleLabel(role)}` : ''}
              </p>
              <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight" style={{ color: 'var(--av-text)' }}>
                {greeting}, {firstName}.
              </h1>
              <p className="text-base mt-2 max-w-xl" style={{ color: 'var(--av-text-secondary)' }}>
                {heroSubtitle}
                {actions.length > 0 && ` ${actions.length} ${actions.length === 1 ? 'thing needs' : 'things need'} you today.`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Link
                to="/app/capture"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium text-white transition hover:shadow-lg"
                style={{ background: 'var(--av-gradient)' }}
              >
                <Sparkles size={16} /> Ask Avenize
              </Link>
              <Link
                to={config.primaryCta.to}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-medium transition"
                style={{ background: 'var(--av-glass-bg-strong)', color: 'var(--av-primary)', border: '1px solid var(--av-glass-border)' }}
              >
                {config.primaryCta.label} <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        </header>

        {loading ? (
          <HomeSkeleton />
        ) : (
          <>
            {/* ── Primary intelligence cards (first viewport) ────────── */}
            <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mb-8">
              {config.primaryCards.map(kind => (
                <CardByKey key={kind} kind={kind} config={{ brain, metrics, health, recommendations, leakage, ledger, companySize: ctx.companySize, actionCount: actions.length }} />
              ))}
            </section>

            {/* ── New-business gamified onboarding ──────────────────── */}
            {isNew && (
              <OnboardingHero />
            )}

            {/* ── My Work (personal attention layer) ────────────────── */}
            <section className="mb-8">
              <MyWorkSection actions={actions} workRoute={config.workRoute} />
            </section>

            {/* ── Secondary intelligence (below the fold) ────────────── */}
            {config.secondaryCards.length > 0 && (
              <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {config.secondaryCards.map(kind => (
                  <CardByKey key={kind} kind={kind} config={{ brain, metrics, health, recommendations, leakage, ledger, companySize: ctx.companySize, actionCount: actions.length }} />
                ))}
              </section>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── Card dispatcher ─────────────────────────────────────────────────────
interface CardConfig {
  brain: BusinessBrain | null
  metrics: GovernedMetric[]
  health: BusinessHealth | null
  recommendations: Recommendation[]
  leakage: ProfitabilityLeakageResult | null
  ledger: ValueLedger | null
  companySize: number
  actionCount: number
}

function CardByKey({ kind, config }: { kind: CardKind; config: CardConfig }) {
  const oppCount = config.recommendations.filter(r => r.severity === 'info' || r.severity === 'warning').length
  const oppValue = config.recommendations.reduce((s, r) => s + (r.expected_impact?.amount ?? 0), 0)
  const riskCount = config.recommendations.filter(r => r.severity === 'critical').length
    + (config.leakage ? (config.leakage.overdue?.length ?? 0) + (config.leakage.declining_margin?.length ?? 0) + (config.leakage.negative_margin_deals?.length ?? 0) : 0)
  switch (kind) {
    case 'state': return <StateCard state={config.brain?.state} />
    case 'next_best_action': return <NextBestActionCard nba={config.brain?.next_best_action} />
    case 'pulse': return <PulseCard health={config.health} />
    case 'revenue': return <RevenueCard metrics={config.metrics} />
    case 'cash': return <CashCard metrics={config.metrics} />
    case 'profit': return <ProfitCard metrics={config.metrics} />
    case 'pipeline': return <PipelineCard metrics={config.metrics} />
    case 'customers': return <CustomersCard metrics={config.metrics} />
    case 'operations': return <OperationsCard metrics={config.metrics} attentionCount={config.actionCount} />
    case 'people': return <PeopleCard headcount={config.companySize} />
    case 'opportunities': return <OpportunitiesCard count={oppCount} value={oppValue} />
    case 'risks': return <RisksCard count={riskCount} />
    case 'value_ledger': return <ValueLedgerCard ledger={config.ledger} />
    case 'diagnoses': return <DiagnosesCard diagnoses={config.brain?.diagnoses} />
  }
}

// ── My Work (personal attention layer — preserved from the old home) ────
function MyWorkSection({ actions, workRoute }: { actions: ActionItem[]; workRoute: string }) {
  if (actions.length === 0) {
    return (
      <GlassCard title="My Work">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'var(--av-success-soft)' }}>
            <CheckCircle2 size={24} style={{ color: 'var(--av-success)' }} />
          </div>
          <div>
            <p className="text-lg font-semibold" style={{ color: 'var(--av-text)' }}>Inbox zero</p>
            <p className="text-sm" style={{ color: 'var(--av-text-secondary)' }}>Nothing needs your attention — a clear desk is progress.</p>
          </div>
        </div>
      </GlassCard>
    )
  }
  const toneColor: Record<string, string> = { red: 'var(--av-danger)', amber: 'var(--av-warning)', blue: 'var(--av-primary)' }
  return (
    <GlassCard title="My Work" action={{ label: 'Open all', to: workRoute }}>
      <div className="space-y-2">
        {actions.slice(0, 6).map(a => (
          <Link key={a.id} to={a.to} className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-[var(--av-surface-2)]">
            <span className="h-2 w-2 rounded-full shrink-0" style={{ background: toneColor[a.tone] }} />
            <span className="flex-1 min-w-0 truncate text-sm" style={{ color: 'var(--av-text)' }}>{a.title}</span>
            {a.detail && <span className="text-xs" style={{ color: 'var(--av-text-muted)' }}>{a.detail}</span>}
            <ArrowRight size={14} style={{ color: 'var(--av-text-muted)' }} />
          </Link>
        ))}
      </div>
    </GlassCard>
  )
}

// ── New-business gamified onboarding hero ───────────────────────────────
function OnboardingHero() {
  const steps = [
    { label: 'Add your first customer', to: '/app/crm', why: 'Starts your sales + CRM story' },
    { label: 'Create your first invoice', to: '/app/finance', why: 'Begins revenue + cash tracking' },
    { label: 'Add a team member', to: '/app/people', why: 'Activates people + operations' },
    { label: 'Capture something', to: '/app/capture', why: 'Tell Avenize what just happened' },
  ]
  return (
    <GlassCard title="Your Business Brain is waking up" gradient="var(--av-grad-intelligence)" className="mb-8">
      <p className="text-sm mb-5 max-w-xl" style={{ color: 'var(--av-text-secondary)' }}>
        Your first entries begin building the intelligence layer. Each one teaches Avenize about your business —
        so it can start answering <i>what is happening, why, and what you should do.</i>
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {steps.map((s, i) => (
          <Link key={s.to} to={s.to} className="group flex items-center gap-3 rounded-xl px-4 py-3 transition hover:-translate-y-0.5"
            style={{ background: 'var(--av-glass-bg-strong)', border: '1px solid var(--av-glass-border)' }}>
            <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0"
              style={{ background: 'var(--av-primary-soft)', color: 'var(--av-primary)' }}>{i + 1}</span>
            <div className="min-w-0">
              <p className="text-sm font-medium" style={{ color: 'var(--av-text)' }}>{s.label}</p>
              <p className="text-xs" style={{ color: 'var(--av-text-muted)' }}>{s.why}</p>
            </div>
            <ArrowRight size={14} className="ml-auto transition group-hover:translate-x-0.5" style={{ color: 'var(--av-primary)' }} />
          </Link>
        ))}
      </div>
    </GlassCard>
  )
}

// ── Loading skeleton (premium, not a spinner) ───────────────────────────
function HomeSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rounded-3xl p-6 animate-pulse" style={{ background: 'var(--av-glass-bg)', border: '1px solid var(--av-glass-border)' }}>
          <div className="h-3 w-24 rounded mb-4" style={{ background: 'var(--av-surface-3)' }} />
          <div className="h-8 w-32 rounded mb-3" style={{ background: 'var(--av-surface-3)' }} />
          <div className="h-3 w-48 rounded" style={{ background: 'var(--av-surface-3)' }} />
        </div>
      ))}
    </div>
  )
}

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

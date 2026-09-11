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
import { useEffect, useState, useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useExperienceContext } from '../lib/useExperienceContext'
import { getRoleHomeConfig, type CardKind } from '../lib/roleHomeConfig'
import { tableGuard } from '../lib/schemaAvailability'
import {
  deriveFunction, deriveSeniority, getFunctionHome, functionLabel, seniorityLabel,
} from '../lib/functionHome'
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
  RisksCard, DiagnosesCard, PipelineCard, CustomersCard, CampaignPerformanceCard, LeadQualityCard, ReceivablesCard, AttendanceCard,
  LeaveBalanceCard, ProjectDeliveryCard, WorkloadCard,
  type CampaignData, type LeadQualityData, type ReceivablesData, type AttendanceData,
  type LeaveBalanceData, type ProjectDeliveryData, type WorkloadData,
} from '../components/BusinessHomeCards'
import { Sparkles, ArrowRight, CheckCircle2 } from 'lucide-react'
import PersonalWorkspaceStrip from '../components/PersonalWorkspaceStrip'

interface ActionItem { id: string; title: string; to: string; tone: 'red' | 'amber' | 'blue'; detail?: string }

export default function BusinessHome() {
  const { staff } = useAuth()
  const ctx = useExperienceContext()
  const bid = staff?.business_id ?? null
  const role = staff?.active_role ?? staff?.role ?? null
  // Function × Seniority resolution. The seniority (from the DB role) is
  // the existing axis; the function is derived from job_title / department /
  // active tools. Falls back to 'general' (the whole-business window).
  const fn = useMemo(
    () => deriveFunction(staff?.job_title, staff?.department, ctx.activeTools ?? []),
    [staff?.job_title, staff?.department, ctx.activeTools],
  )
  const sen = useMemo(() => deriveSeniority(role), [role])
  const config = useMemo(() => getFunctionHome(fn, sen), [fn, sen])
  // Keep the legacy role config for fallback hero copy when function=general.
  const roleConfig = useMemo(() => getRoleHomeConfig(role), [role])

  const [brain, setBrain] = useState<BusinessBrain | null>(null)
  const [metrics, setMetrics] = useState<GovernedMetric[]>([])
  const [health, setHealth] = useState<BusinessHealth | null>(null)
  const [recommendations, setRecommendations] = useState<Recommendation[]>([])
  const [leakage, setLeakage] = useState<ProfitabilityLeakageResult | null>(null)
  const [ledger, setLedger] = useState<ValueLedger | null>(null)
  const [actions, setActions] = useState<ActionItem[]>([])
  // Function-specific data (backed by REAL tables — fetched in parallel).
  const [campaign, setCampaign] = useState<CampaignData | null>(null)
  const [leads, setLeads] = useState<LeadQualityData | null>(null)
  const [receivables, setReceivables] = useState<ReceivablesData | null>(null)
  const [attendance, setAttendance] = useState<AttendanceData | null>(null)
  const [leave, setLeave] = useState<LeaveBalanceData | null>(null)
  const [projects, setProjects] = useState<ProjectDeliveryData | null>(null)
  const [workload, setWorkload] = useState<WorkloadData | null>(null)
  const [loading, setLoading] = useState(true)
  const hasLoadedOnce = useRef(false)

  useEffect(() => {
    if (!bid) return
    let active = true
    // Only show the skeleton on the very first load — a later config change
    // (e.g. ctx.activeTools resolving) must not flash the page again.
    if (!hasLoadedOnce.current) setLoading(true)

    // Fire-and-forget intelligence loads in parallel, but ONLY for the data
    // the displayed cards actually consume — a staff user sees ~3 cards, so
    // firing all 15 requests would waste round trips (and schema-guard
    // probes) on data no card renders. Each load is best-effort (§24).
    const shown = new Set<CardKind>([...config.primaryCards, ...config.secondaryCards])
    const needs = (...kinds: CardKind[]) => kinds.some(k => shown.has(k))
    const load = async () => {
      if (needs('revenue', 'cash', 'profit', 'pipeline', 'customers')) {
        refreshBusinessMetrics(bid).catch(() => {})
        fetchCurrentMetrics(bid).then(m => active && setMetrics(m ?? [])).catch(() => {})
      }
      if (needs('state', 'next_best_action', 'diagnoses')) {
        fetchBusinessBrain(bid).then(b => active && setBrain(b)).catch(() => {})
      }
      if (needs('pulse')) {
        computeBusinessHealth(bid).catch(() => {})
        fetchBusinessHealth(bid).then(h => active && setHealth(h)).catch(() => {})
      }
      if (needs('opportunities', 'risks')) {
        fetchOpenRecommendations(bid, 20).then(r => active && setRecommendations(r ?? [])).catch(() => {})
      }
      if (needs('risks')) {
        fetchProfitabilityLeakage(bid).then(l => active && setLeakage(l)).catch(() => {})
      }
      if (needs('value_ledger')) {
        fetchValueLedger(bid).then(v => active && setLedger(v)).catch(() => {})
      }

      // Function-specific loads — each backed by a REAL table. Best-effort,
      // non-blocking; a missing table degrades the card to "—" (§24).
      if (needs('campaign_performance')) loadCampaignData(bid).then(d => active && setCampaign(d)).catch(() => {})
      if (needs('lead_quality')) loadLeadQuality(bid).then(d => active && setLeads(d)).catch(() => {})
      if (needs('receivables')) loadReceivables(bid).then(d => active && setReceivables(d)).catch(() => {})
      if (needs('attendance')) loadAttendance(bid).then(d => active && setAttendance(d)).catch(() => {})
      if (needs('leave_balance')) loadLeave(bid).then(d => active && setLeave(d)).catch(() => {})
      if (needs('project_delivery')) loadProjectDelivery(bid).then(d => active && setProjects(d)).catch(() => {})
      if (needs('workload')) loadWorkload(bid).then(d => active && setWorkload(d)).catch(() => {})

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
      if (active) {
        hasLoadedOnce.current = true
        setLoading(false)
      }
    }
    load()
    return () => { active = false }
  }, [bid, config])

  const firstName = (staff?.full_name || staff?.name || 'there').split(' ')[0]
  const state = brain?.state
  // Adaptive hero: pick the subtitle by the real business state.
  const isNew = (ctx.companySize === 0 || !state || state.state === 'insufficient_data') && actions.length === 0
  const needsAttention = state && ['stressed', 'at_risk', 'cash_constrained', 'sales_constrained', 'capacity_constrained'].includes(state.state)
  // Function-specific hero copy takes precedence when a function is detected;
  // the general (whole-business) config falls back to the legacy role copy.
  const baseSubtitle = fn === 'general'
    ? (isNew ? roleConfig.heroNew : needsAttention ? roleConfig.heroAttention : roleConfig.heroHealthy)
    : (isNew ? config.heroNew : needsAttention ? config.heroAttention : config.heroHealthy)
  const heroSubtitle = baseSubtitle
  // Hero eyebrow: "{Function} · {Seniority}" for function homes, or the
  // general eyebrow for whole-business.
  const fnLabel = functionLabel(fn)
  const senLabel = seniorityLabel(sen)
  const eyebrow = fn === 'general'
    ? `${roleConfig.heroEyebrow}${senLabel ? ` · ${senLabel}` : ''}`
    : `${fnLabel} engine at a glance${senLabel ? ` · ${senLabel}` : ''}`

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
                {eyebrow}
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

        {/* ── Personal workspace (My Avenize: pins + goals) ───────── */}
        <PersonalWorkspaceStrip />

        {loading ? (
          <HomeSkeleton />
        ) : (
          <>
            {/* ── Primary intelligence cards (first viewport) ────────── */}
            <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mb-8">
              {config.primaryCards.map(kind => (
                <CardByKey key={kind} kind={kind} config={{ brain, metrics, health, recommendations, leakage, ledger, companySize: ctx.companySize, actionCount: actions.length, campaign, leads, receivables, attendance, leave, projects, workload }} />
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
                  <CardByKey key={kind} kind={kind} config={{ brain, metrics, health, recommendations, leakage, ledger, companySize: ctx.companySize, actionCount: actions.length, campaign, leads, receivables, attendance, leave, projects, workload }} />
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
  // Function-specific data (Session 29) — REAL tables.
  campaign: CampaignData | null
  leads: LeadQualityData | null
  receivables: ReceivablesData | null
  attendance: AttendanceData | null
  leave: LeaveBalanceData | null
  projects: ProjectDeliveryData | null
  workload: WorkloadData | null
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
    // ── Function-specific kinds (Session 29) ──
    case 'campaign_performance': return <CampaignPerformanceCard data={config.campaign} />
    case 'lead_quality': return <LeadQualityCard data={config.leads} />
    case 'receivables': return <ReceivablesCard data={config.receivables} />
    case 'attendance': return <AttendanceCard data={config.attendance} />
    case 'leave_balance': return <LeaveBalanceCard data={config.leave} />
    case 'project_delivery': return <ProjectDeliveryCard data={config.projects} />
    case 'workload': return <WorkloadCard data={config.workload} />
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

// ── Function-specific data loaders (Session 29) ─────────────────────────
// Each is backed by a REAL table (verified against migrations). Best-effort:
// a missing/empty table returns a zero-state (the card renders "—" honestly,
// no fabrication per §22). All are business-scoped via RLS.

const todayISO = () => new Date().toISOString().slice(0, 10)
const weekAhead = () => new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)

/** email_campaigns (009): active/sent counts + total recipients + top reach. */
async function loadCampaignData(bid: string): Promise<CampaignData> {
  const { data } = await tableGuard('email_campaigns', () =>
    supabase.from('email_campaigns')
      .select('id, name, status, contact_count')
      .eq('business_id', bid))
  const rows = (data ?? []) as Array<{ id: string; name: string; status: string; contact_count: number }>
  const active = rows.filter(c => c.status === 'scheduled' || c.status === 'sending' || c.status === 'draft').length
  const sent = rows.filter(c => c.status === 'sent').length
  const recipients = rows.reduce((s, c) => s + (c.contact_count ?? 0), 0)
  let topName: string | null = null
  let topRecipients: number | null = null
  for (const c of rows) {
    if ((c.contact_count ?? 0) > (topRecipients ?? -1)) { topName = c.name; topRecipients = c.contact_count ?? 0 }
  }
  return { total: rows.length, active, sent, recipients, topName: topName ?? null, topRecipients: topRecipients ?? null }
}

/** leads (041): funnel + stagnation (new >7d = stale). */
async function loadLeadQuality(bid: string): Promise<LeadQualityData> {
  const { data } = await supabase.from('leads')
    .select('id, status, created_at')
    .eq('business_id', bid)
  const rows = (data ?? []) as Array<{ id: string; status: string; created_at: string }>
  const sevenDaysAgo = Date.now() - 7 * 86400000
  const stale = rows.filter(l => l.status === 'new' && new Date(l.created_at).getTime() < sevenDaysAgo).length
  return {
    total: rows.length,
    new: rows.filter(l => l.status === 'new').length,
    qualified: rows.filter(l => l.status === 'qualified').length,
    converted: rows.filter(l => l.status === 'converted').length,
    stale,
  }
}

/** invoices (001): unpaid + overdue aging + amount at risk. */
async function loadReceivables(bid: string): Promise<ReceivablesData> {
  const { data } = await supabase.from('invoices')
    .select('id, status, total, due_date')
    .eq('business_id', bid)
  const rows = (data ?? []) as Array<{ id: string; status: string; total: number; due_date: string | null }>
  const unpaid = rows.filter(i => i.status !== 'paid' && i.status !== 'cancelled' && i.status !== 'draft')
  const now = Date.now()
  const overdue = unpaid.filter(i => i.due_date && new Date(i.due_date).getTime() < now)
  const sum = (arr: typeof rows) => arr.reduce((s, i) => s + Number(i.total ?? 0), 0)
  return {
    unpaid: unpaid.length,
    unpaidAmount: sum(unpaid),
    overdue: overdue.length,
    overdueAmount: sum(overdue),
  }
}

/** attendance_records (032): today's roll. */
async function loadAttendance(bid: string): Promise<AttendanceData> {
  const today = todayISO()
  const [attRes, staffRes] = await Promise.all([
    tableGuard('attendance_records', () =>
      supabase.from('attendance_records').select('id, status, staff_id').eq('business_id', bid).eq('date', today)),
    tableGuard('staff:active-filter', () =>
      supabase.from('staff').select('id', { count: 'exact', head: true }).eq('business_id', bid).eq('active', true)),
  ])
  const rows = (attRes.data ?? []) as Array<{ id: string; status: string; staff_id: string }>
  return {
    present: rows.filter(a => a.status === 'present').length,
    absent: rows.filter(a => a.status === 'absent').length,
    late: rows.filter(a => a.status === 'late').length,
    onLeave: rows.filter(a => a.status === 'on_leave' || a.status === 'half_day').length,
    expected: staffRes.count ?? 0,
  }
}

/** leave_requests (002): pending approvals + upcoming approved leave. */
async function loadLeave(bid: string): Promise<LeaveBalanceData> {
  const weekEnd = weekAhead()
  const [pendRes, upRes] = await Promise.all([
    tableGuard('leave_requests', () =>
      supabase.from('leave_requests').select('id', { count: 'exact', head: true }).eq('business_id', bid).eq('status', 'pending')),
    tableGuard('leave_requests', () =>
      supabase.from('leave_requests').select('id', { count: 'exact', head: true }).eq('business_id', bid).eq('status', 'approved').gte('start_date', todayISO()).lte('start_date', weekEnd)),
  ])
  return { pending: pendRes.count ?? 0, upcoming: upRes.count ?? 0 }
}

/** projects (002): delivery rollup + due-soon. */
async function loadProjectDelivery(bid: string): Promise<ProjectDeliveryData> {
  const weekEnd = weekAhead()
  const { data } = await supabase.from('projects')
    .select('id, status, due_date')
    .eq('business_id', bid)
  const rows = (data ?? []) as Array<{ id: string; status: string; due_date: string | null }>
  const active = rows.filter(p => p.status === 'active')
  return {
    active: active.length,
    done: rows.filter(p => p.status === 'done').length,
    onHold: rows.filter(p => p.status === 'on_hold').length,
    dueSoon: active.filter(p => p.due_date && p.due_date >= todayISO() && p.due_date <= weekEnd).length,
  }
}

/** tasks (004) + projects (002): workload / capacity signal. */
async function loadWorkload(bid: string): Promise<WorkloadData> {
  const [tRes, pRes] = await Promise.all([
    supabase.from('tasks').select('id, status, due_date, priority, assignee_id').eq('business_id', bid).neq('status', 'done'),
    supabase.from('projects').select('id', { count: 'exact', head: true }).eq('business_id', bid).eq('status', 'active'),
  ])
  const rows = (tRes.data ?? []) as Array<{ id: string; status: string; due_date: string | null; priority: string; assignee_id: string | null }>
  const now = Date.now()
  return {
    openTasks: rows.length,
    overdueTasks: rows.filter(t => t.due_date && new Date(t.due_date).getTime() < now).length,
    urgentTasks: rows.filter(t => t.priority === 'urgent' || t.priority === 'high').length,
    activeProjects: pRes.count ?? 0,
  }
}
